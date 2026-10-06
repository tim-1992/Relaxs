import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLAST_LAYOUTS, createBlastState, selectBlastTarget, setBlastType, plantBlast,
  removeBlast, detonateBlast, stepBlast, pauseBlast, resumeBlast, retryBlast,
  nextBlast, getBlastProgress, drainBlastEvents,
} from '../src/blast-state.js';

function settle(state) {
  for (let i = 0; i < 900 && state.phase === 'collapsing'; i++) stepBlast(state, 1 / 60);
  assert.notEqual(state.phase, 'collapsing', 'an attempt must always finish');
}

function plant(state, id, type = 'wide', point) {
  assert.equal(selectBlastTarget(state, id, point), true);
  assert.equal(setBlastType(state, type), true);
  assert.equal(plantBlast(state), true);
}

test('all layouts have bounded, deterministic, fully grounded support graphs and visible initial buildings', () => {
  for (const {id} of BLAST_LAYOUTS) {
    const state = createBlastState({layout: id});
    assert.deepEqual(state, createBlastState({layout: id}));
    assert.equal(state.phase, 'planning');
    assert.ok(state.pieces.length >= 25 && state.pieces.length <= 160);
    const ids = new Set(state.pieces.map(piece => piece.id));
    assert.equal(ids.size, state.pieces.length);
    for (const piece of state.pieces) {
      assert.equal(piece.status, 'stable');
      assert.ok(piece.anchor || piece.supports.length >= piece.required);
      assert.ok(piece.supports.every(support => ids.has(support) && support !== piece.id));
      assert.ok(Object.values(piece.position).every(Number.isFinite));
    }
    const before = structuredClone(state);
    stepBlast(state, 10);
    assert.deepEqual(state, before, 'the unstarted model is inert');
  }
});

test('plant mode respects difficulty, rejects invalid hits, supports undo, and never detonates on selection', () => {
  for (const [difficulty, budget] of [['easy', 3], ['standard', 2], ['hard', 1]]) {
    const state = createBlastState({difficulty});
    assert.equal(detonateBlast(state), false);
    assert.equal(selectBlastTarget(state, 'absent'), false);
    assert.equal(selectBlastTarget(state, state.pieces[0].id, {x: NaN, y: 0, z: 0}), false);
    assert.equal(selectBlastTarget(state, state.pieces[0].id, {x: 999, y: 0, z: 0}), false);
    for (let i = 0; i < budget; i++) plant(state, state.pieces[i].id);
    assert.equal(state.markers.length, budget);
    assert.equal(plantBlast(state), false, 'duplicate placements cannot burn a slot');
    selectBlastTarget(state, state.pieces[budget].id);
    assert.equal(plantBlast(state), false);
    assert.equal(state.pieces.some(piece => piece.status !== 'stable'), false);
    assert.equal(removeBlast(state), true);
    assert.equal(plantBlast(state), true);
    assert.equal(getBlastProgress(state).remaining, 0);
    assert.equal(setBlastType(state, 'invalid'), false);
  }
});

test('actual hit positions survive placement; SMALL and WIDE have measurably different direct reach', () => {
  const runs = ['small', 'wide'].map(type => {
    const state = createBlastState();
    const target = state.pieces.find(piece => piece.id === state.suggestedTarget);
    const point = {...target.position, z: target.position.z + target.size.z / 2};
    plant(state, target.id, type, point);
    assert.deepEqual(state.markers[0].point, point);
    assert.equal(detonateBlast(state), true);
    assert.equal(plantBlast(state), false);
    return state;
  });
  assert.ok(runs[1].stats.direct > runs[0].stats.direct);
  assert.ok(runs[0].stats.direct > 0);
});

test('a low support triggers delayed cascades; detached parts really fall, rotate and bounce without disappearing', () => {
  const state = createBlastState();
  const count = state.pieces.length;
  plant(state, state.suggestedTarget);
  detonateBlast(state);
  const initial = structuredClone(state.pieces);
  assert.ok(initial.some(piece => piece.status === 'stable' && piece.position.y > 4));
  for (let i = 0; i < 60; i++) stepBlast(state, 1 / 60);
  assert.ok(state.stats.chain > 10, 'support loss must propagate beyond the blast radius');
  assert.ok(state.pieces.some((piece, i) => piece.position.y < initial[i].position.y - .5));
  assert.ok(state.pieces.some(piece => Math.abs(piece.rotation.x) > .1 || Math.abs(piece.rotation.z) > .1));
  settle(state);
  assert.ok(state.stats.bounces > 0);
  assert.equal(state.pieces.length, count, 'rubble persists through the result');
  assert.ok(state.pieces.every(piece => piece.status !== 'falling'));
  assert.ok(state.pieces.every(piece => Object.values(piece.position).every(Number.isFinite)));
});

test('challenge victory is reachable on every layout at every difficulty, including a single hard placement', () => {
  for (const {id} of BLAST_LAYOUTS) {
    for (const difficulty of ['easy', 'standard', 'hard']) {
      const state = createBlastState({layout: id, difficulty});
      plant(state, state.suggestedTarget);
      detonateBlast(state);
      settle(state);
      assert.equal(state.phase, 'won', `${id}/${difficulty}: ${getBlastProgress(state).percent}%`);
      assert.ok(getBlastProgress(state).percent >= getBlastProgress(state).target);
      const events = drainBlastEvents(state);
      assert.equal(events.filter(event => event.type === 'complete').length, 1);
      assert.deepEqual(drainBlastEvents(state), []);
    }
  }
});

test('an isolated top hit can fail; retry clears rubble and markers, and next advances layout', () => {
  const state = createBlastState({difficulty: 'hard'});
  const top = [...state.pieces].sort((a, b) => b.position.y - a.position.y)[0];
  plant(state, top.id, 'small');
  detonateBlast(state);
  settle(state);
  assert.equal(state.phase, 'lost');
  const retry = retryBlast(state);
  assert.equal(retry.difficulty, 'hard');
  assert.equal(retry.phase, 'planning');
  assert.equal(retry.markers.length, 0);
  assert.equal(retry.stats.fallen, 0);
  assert.ok(retry.pieces.every(piece => piece.status === 'stable'));
  assert.notEqual(nextBlast(state).layout, state.layout);
});

test('pause freezes the entire simulation and rejects every gameplay mutation until explicit resume', () => {
  const state = createBlastState();
  plant(state, state.suggestedTarget);
  detonateBlast(state);
  stepBlast(state, .1);
  pauseBlast(state);
  const frozen = structuredClone(state);
  stepBlast(state, 2);
  assert.equal(plantBlast(state), false);
  assert.equal(detonateBlast(state), false);
  assert.equal(selectBlastTarget(state, state.pieces.at(-1).id), false);
  assert.equal(setBlastType(state, 'small'), false);
  assert.equal(removeBlast(state), false);
  assert.deepEqual(state, frozen);
  resumeBlast(state);
  stepBlast(state, .1);
  assert.ok(state.elapsed > frozen.elapsed);
});

test('practice permits repeated batches without exhausting a challenge budget and ends only when cleared', () => {
  const state = createBlastState({difficulty: 'hard', mode: 'practice'});
  for (let attempt = 0; attempt < 160 && state.phase !== 'won'; attempt++) {
    const target = [...state.pieces].filter(piece => piece.status === 'stable')
      .sort((a, b) => b.position.y - a.position.y)[0];
    plant(state, target.id, 'small');
    detonateBlast(state);
    settle(state);
    assert.notEqual(state.phase, 'lost');
    assert.ok(state.markers.length <= 6 && state.effects.length <= 48 && state.events.length <= 96);
  }
  assert.equal(getBlastProgress(state).percent, 100);
});

test('fixed steps are reproducible across frame grouping and ignore invalid or negative elapsed time', () => {
  const a = createBlastState(), b = createBlastState();
  for (const state of [a, b]) {plant(state, state.suggestedTarget); detonateBlast(state);}
  for (let i = 0; i < 120; i++) stepBlast(a, 1 / 60);
  for (let i = 0; i < 60; i++) stepBlast(b, 1 / 30);
  assert.deepEqual(a, b);
  const before = structuredClone(a);
  for (const dt of [-1, NaN, Infinity, 0]) stepBlast(a, dt);
  assert.deepEqual(a, before);
  const fallback = createBlastState({layout: 'missing', difficulty: 'missing', mode: 'missing'});
  assert.equal(fallback.layout, 'house');
  assert.equal(fallback.difficulty, 'standard');
  assert.equal(fallback.mode, 'challenge');
});
