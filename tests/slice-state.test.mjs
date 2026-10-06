import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SLICE_LEVELS, SLICE_COLORS, createSliceState, startSlice, stepSlice,
  beginSlice, moveSlice, endSlice, pauseSlice, resumeSlice, resizeSlice, drainSliceEvents,
} from '../src/slice-state.js';

function playing(options) {
  const state = createSliceState(options);
  assert.equal(startSlice(state), true);
  drainSliceEvents(state);
  return state;
}

function advance(state, seconds, hz = 60) {
  const steps = Math.round(seconds * hz);
  for (let i = 0; i < steps; i++) stepSlice(state, 1 / hz);
}

function fixtures(state, specifications) {
  state.objects = specifications.map(({id, x, y = 220, r = 24, color = 'peach', kind = 'fruit'}) => ({
    id, kind, color, x, y, z: 0, r, vx: 0, vy: 0, rotation: 0, spin: 0,
  }));
}

function sweep(state, from, to) {
  assert.equal(beginSlice(state, from), true);
  moveSlice(state, to);
  endSlice(state);
}

test('pointer-down, zero movement, ready, paused and ended states cannot award hits', () => {
  const state = createSliceState();
  fixtures(state, [{id: 'one', x: 150}]);
  assert.equal(beginSlice(state, {x: 150, y: 220}), false);
  assert.equal(moveSlice(state, {x: 160, y: 220}), false);
  assert.equal(state.score, 0);
  startSlice(state);
  fixtures(state, [{id: 'one', x: 150}]);
  beginSlice(state, {x: 150, y: 220});
  assert.equal(state.score, 0);
  moveSlice(state, {x: 150, y: 220});
  assert.equal(state.score, 0);
  pauseSlice(state);
  moveSlice(state, {x: 250, y: 220});
  assert.equal(state.score, 0);
  resumeSlice(state);
  state.phase = 'won';
  assert.equal(beginSlice(state, {x: 120, y: 220}), false);
  assert.equal(state.score, 0);
});

test('a fast swept blade hits in geometric entry order, not object-array or center order', () => {
  const state = playing();
  fixtures(state, [
    {id: 'last', x: 410, color: 'gold'},
    {id: 'small', x: 150, r: 24, color: 'peach'},
    {id: 'large', x: 160, r: 42, color: 'mint'},
  ]);
  sweep(state, {x: 30, y: 220}, {x: 900, y: 220});
  assert.deepEqual(drainSliceEvents(state).filter(event => event.type === 'slice').map(event => event.color),
    ['mint', 'peach', 'gold']);
  assert.equal(state.score, 30);
  assert.equal(state.objects.length, 0);
  sweep(state, {x: 900, y: 220}, {x: 0, y: 220});
  assert.equal(state.score, 30, 'a removed object cannot score again');
});

test('three contiguous same-color hits earn a chain; a fourth extends it without farming chain count', () => {
  const state = playing();
  fixtures(state, [400, 200, 100, 300].map(x => ({id: String(x), x})));
  sweep(state, {x: 40, y: 220}, {x: 460, y: 220});
  assert.equal(state.score, 70); // 4 × 10 + 20 at three + 10 at four.
  assert.equal(state.chains, 1);
  assert.equal(state.bestChain, 4);
  assert.deepEqual(drainSliceEvents(state).filter(event => event.type === 'chain')
    .map(({count, points}) => ({count, points})), [{count: 3, points: 20}, {count: 4, points: 10}]);
});

test('mixed colors interrupt a run in the actual order of a single long cut', () => {
  const state = playing();
  fixtures(state, ['peach', 'peach', 'mint', 'peach', 'peach'].map((color, i) =>
    ({id: String(i), x: 100 + i * 100, color})));
  sweep(state, {x: 40, y: 220}, {x: 560, y: 220});
  assert.equal(state.score, 50);
  assert.equal(state.chains, 0);
  assert.equal(state.bestChain, 2);
});

test('a held stroke cannot connect two waves after 0.55 seconds without a hit', () => {
  const state = playing();
  fixtures(state, [{id: 'a', x: 100}, {id: 'b', x: 200}]);
  beginSlice(state, {x: 30, y: 220});
  moveSlice(state, {x: 250, y: 220});
  advance(state, .6);
  fixtures(state, [{id: 'c', x: 400}]);
  moveSlice(state, {x: 460, y: 220});
  assert.equal(state.chains, 0);
  assert.equal(state.score, 30);
  endSlice(state);
  fixtures(state, [{id: 'd', x: 500}, {id: 'e', x: 600}]);
  sweep(state, {x: 460, y: 220}, {x: 650, y: 220});
  assert.equal(state.chains, 0, 'lifting the pointer also breaks a same-color run');
});

test('an obstacle breaks the run, spends one shield and cannot be hit twice', () => {
  const state = playing();
  fixtures(state, [
    {id: 'a', x: 100}, {id: 'b', x: 200},
    {id: 'metal', x: 300, kind: 'hazard', color: 'gold'}, {id: 'c', x: 400},
  ]);
  beginSlice(state, {x: 30, y: 220});
  moveSlice(state, {x: 460, y: 220});
  assert.equal(state.score, 30);
  assert.equal(state.chains, 0);
  assert.equal(state.shields, 2);
  moveSlice(state, {x: 30, y: 220});
  assert.equal(state.shields, 2);
  assert.equal(drainSliceEvents(state).filter(event => event.type === 'hazard').length, 1);
});

test('the third obstacle loses immediately and stops scoring farther along that same segment', () => {
  const state = playing();
  fixtures(state, [
    ...[100, 200, 300].map(x => ({id: String(x), x, kind: 'hazard', color: 'gold'})),
    {id: 'beyond', x: 500},
  ]);
  sweep(state, {x: 20, y: 220}, {x: 600, y: 220});
  assert.equal(state.shields, 0);
  assert.equal(state.phase, 'lost');
  assert.equal(state.score, 0);
  assert.equal(state.stroke.active, false);
  assert.ok(state.objects.some(object => object.id === 'beyond'));
  const events = drainSliceEvents(state);
  assert.equal(events.filter(event => event.type === 'lost').length, 1);
  advance(state, 1);
  assert.equal(drainSliceEvents(state).filter(event => event.type === 'lost').length, 0);
});

test('a hit creates two separate physical half bodies and small finite-lived particles', () => {
  const state = playing();
  fixtures(state, [{id: 'whole', x: 240, color: 'mint'}]);
  sweep(state, {x: 170, y: 220}, {x: 310, y: 220});
  assert.equal(state.fragments.length, 2);
  assert.deepEqual(state.fragments.map(fragment => fragment.side).sort(), [-1, 1]);
  assert.equal(new Set(state.fragments.map(fragment => fragment.id)).size, 2);
  for (const fragment of state.fragments) {
    assert.equal(fragment.kind, 'fruit');
    assert.equal(fragment.color, 'mint');
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'r', 'rotation', 'spin', 'life', 'maxLife']) {
      assert.ok(Number.isFinite(fragment[key]), `fragment.${key} must be numeric`);
    }
    assert.ok(fragment.life > 0 && fragment.life <= fragment.maxLife);
  }
  assert.ok(state.particles.length >= 4 && state.particles.length <= 10);
  for (const particle of state.particles) {
    for (const key of ['id', 'x', 'y', 'z', 'vx', 'vy', 'r', 'color', 'life', 'maxLife']) assert.ok(key in particle);
  }
  const before = structuredClone(state.fragments);
  advance(state, .2);
  assert.notDeepEqual(state.fragments, before);
  assert.ok(state.fragments.every(fragment => fragment.vy > before.find(item => item.id === fragment.id).vy));
  advance(state, 2);
  assert.equal(state.fragments.length, 0);
  assert.equal(state.particles.length, 0);
});

test('pause freezes the whole simulation and invalidates the stroke before manual resume', () => {
  const state = playing();
  beginSlice(state, {x: 20, y: 100});
  pauseSlice(state);
  assert.equal(state.stroke.active, false);
  const paused = structuredClone(state);
  advance(state, 5);
  assert.equal(beginSlice(state, {x: 20, y: 100}), false);
  assert.equal(moveSlice(state, {x: 200, y: 100}), false);
  assert.deepEqual(state, paused);
  resumeSlice(state);
  assert.equal(state.stroke.active, false);
  advance(state, .2);
  assert.ok(state.time > paused.time);
});

test('resize preserves normalized body positions and velocities, scales effects, and cancels the blade', () => {
  const state = playing({width: 960, height: 600});
  fixtures(state, [{id: 'whole', x: 240, y: 240}, {id: 'other', x: 700, y: 300}]);
  sweep(state, {x: 170, y: 240}, {x: 310, y: 240});
  state.objects[0].vx = 90;
  state.objects[0].vy = -120;
  beginSlice(state, {x: 30, y: 100});
  const before = structuredClone(state);
  assert.equal(resizeSlice(state, 320, 400), true);
  assert.equal(state.width, 320);
  assert.equal(state.height, 400);
  assert.equal(state.stroke.active, false);
  assert.ok(Math.abs(state.objects[0].x / 320 - before.objects[0].x / 960) < 1e-12);
  assert.ok(Math.abs(state.objects[0].y / 400 - before.objects[0].y / 600) < 1e-12);
  assert.equal(state.objects[0].vx, 30);
  assert.equal(state.objects[0].vy, -80);
  assert.ok(Math.abs(state.fragments[0].x / 320 - before.fragments[0].x / 960) < 1e-12);
  const resized = structuredClone(state);
  assert.equal(resizeSlice(state, 0, NaN), false);
  assert.deepEqual(state, resized);
});

test('starting launches immediately; seeded flight is reproducible and visible for roughly 2–3 seconds', () => {
  const a = playing({seed: 17, width: 360, height: 420});
  const b = playing({seed: 17, width: 360, height: 420});
  const other = playing({seed: 23, width: 360, height: 420});
  assert.equal(a.wave, 1);
  assert.ok(a.objects.length >= 3);
  assert.deepEqual(a.objects, b.objects);
  assert.notDeepEqual(a.objects, other.objects);
  assert.ok(a.objects.every(object => object.r >= 24 && object.r <= 42));
  const tracked = a.objects[0].id;
  let visible = 0;
  for (let i = 0; i < 210; i++) {
    stepSlice(a, 1 / 60);
    stepSlice(b, 1 / 60);
    const object = a.objects.find(item => item.id === tracked);
    if (object && object.y + object.r > 0 && object.y - object.r < a.height &&
        object.x + object.r > 0 && object.x - object.r < a.width) visible += 1 / 60;
  }
  assert.ok(visible >= 2 && visible <= 3.2, `visible flight was ${visible}s`);
  assert.deepEqual(a, b);
});

test('missed finite waves end in a single loss; fresh state is a complete retry', () => {
  const state = playing();
  advance(state, 45);
  assert.equal(state.wave, 8);
  assert.equal(state.phase, 'lost');
  assert.equal(state.score, 0);
  assert.equal(state.shields, 3);
  assert.equal(drainSliceEvents(state).filter(event => event.type === 'lost').length, 1);
  const retry = createSliceState();
  assert.equal(retry.phase, 'ready');
  assert.equal(retry.wave, 0);
  assert.equal(retry.score, 0);
  assert.equal(retry.chains, 0);
  assert.equal(retry.shields, 3);
  assert.equal(startSlice(retry), true);
  assert.equal(retry.wave, 1);
});

test('practice survives depleted shields and keeps generating waves beyond a chapter', () => {
  const state = playing({mode: 'practice', level: 'flow'});
  fixtures(state, [100, 200, 300, 400].map(x => ({id: String(x), x, kind: 'hazard', color: 'gold'})));
  sweep(state, {x: 30, y: 220}, {x: 500, y: 220});
  assert.equal(state.shields, 0);
  assert.equal(state.phase, 'playing');
  advance(state, 65);
  assert.ok(state.wave > 12);
  assert.equal(state.phase, 'playing');
  assert.ok(!drainSliceEvents(state).some(event => event.type === 'lost' || event.type === 'won'));
});

test('invalid pointer input and time cannot poison state or spend shields', () => {
  const state = playing();
  const before = structuredClone(state);
  assert.equal(beginSlice(state, {x: NaN, y: 1}), false);
  for (const dt of [-1, 0, NaN, Infinity]) stepSlice(state, dt);
  assert.deepEqual(state, before);
  assert.deepEqual(SLICE_COLORS.map(({id, shape}) => [id, shape]),
    [['peach', 'sphere'], ['mint', 'cube'], ['gold', 'diamond']]);
  assert.deepEqual(SLICE_LEVELS.map(({id, waves, goal, chains}) => [id, waves, goal, chains]),
    [['orchard', 8, 200, 2], ['crossing', 10, 300, 3], ['flow', 12, 420, 4]]);
});

test('screen clipping prevents cutting invisible bodies below or beside the arena', () => {
  const state = playing({width: 320, height: 420});
  fixtures(state, [
    {id: 'below', x: 160, y: 470}, {id: 'side', x: -50, y: 200},
    {id: 'partially-visible', x: 260, y: 430},
  ]);
  sweep(state, {x: 0, y: 460}, {x: 320, y: 460});
  sweep(state, {x: -50, y: 100}, {x: -50, y: 300});
  assert.equal(state.score, 0);
  sweep(state, {x: 220, y: 418}, {x: 310, y: 418});
  assert.equal(state.score, 10, 'the actually visible cap of a partially visible object remains hittable');
  assert.ok(state.objects.some(object => object.id === 'below'));
  assert.ok(state.objects.some(object => object.id === 'side'));
});

test('clearing a wave brings the next one within 0.45 seconds and never finishes a chapter early', () => {
  const state = playing();
  fixtures(state, [100, 200, 300].map(x => ({id: String(x), x})));
  sweep(state, {x: 40, y: 220}, {x: 350, y: 220});
  assert.equal(state.objects.length, 0);
  assert.equal(state.wave, 1);
  assert.equal(state.phase, 'playing');
  advance(state, .3);
  assert.equal(state.wave, 1, 'leave a short breathing beat between formations');
  advance(state, .15);
  assert.equal(state.wave, 2);
  assert.ok(state.objects.length >= 3);
});

test('starting a new stroke marks a visual break instead of drawing a teleporting blade', () => {
  const state = playing();
  sweep(state, {x: 20, y: 150}, {x: 100, y: 150});
  beginSlice(state, {x: 800, y: 450});
  assert.equal(state.trail.at(-1).break, true);
  assert.equal(state.score, 0);
});

// This player uses only real pointer paths. It waits until a same-color cluster
// is near its apex, then moves a blade over 12 live physics frames (0.2 seconds).
// No object pose, score, chain counter, wave or outcome is injected.
function playChapter(options, {singles = false, stopAfter = Infinity} = {}) {
  const state = playing(options);
  let lastPlayed = 0;
  for (let frame = 0; frame < 60 * 60 && state.phase === 'playing'; frame++) {
    stepSlice(state, 1 / 60);
    if (state.wave === lastPlayed || state.wave > stopAfter) continue;
    const groups = SLICE_COLORS.map(color =>
      state.objects.filter(object => object.kind === 'fruit' && object.color === color.id));
    const group = groups.find(objects => objects.length >= 3);
    if (!group || Math.abs(group[0].vy) > state.height * .10) continue;
    lastPlayed = state.wave;
    group.sort((a, b) => a.x - b.x);
    if (singles) {
      for (const object of group) sweep(state,
        {x: object.x - object.r * .3, y: object.y}, {x: object.x + object.r * .3, y: object.y});
      continue;
    }
    const from = {x: group[0].x - group[0].r * 1.5, y: group[0].y - group[0].r * .2};
    const to = {x: group.at(-1).x + group.at(-1).r * 1.5, y: from.y};
    beginSlice(state, from);
    for (let sample = 1; sample <= 12; sample++) {
      stepSlice(state, 1 / 60);
      moveSlice(state, {x: from.x + (to.x - from.x) * sample / 12, y: to.y});
    }
    endSlice(state);
  }
  return state;
}

for (const level of ['orchard', 'crossing', 'flow']) {
  for (const [width, height, seed] of [[960, 600, 1], [320, 420, 7]]) {
    test(`${level} is winnable with live 0.2-second blade paths at ${width}×${height}`, () => {
      const state = playChapter({level, width, height, seed});
      const goal = SLICE_LEVELS.find(item => item.id === level);
      assert.equal(state.phase, 'won');
      assert.equal(state.wave, goal.waves);
      assert.ok(state.score >= goal.goal);
      assert.ok(state.chains >= goal.chains);
      assert.equal(state.shields, 3, 'there must be a playable path around obstacles');
      assert.equal(drainSliceEvents(state).filter(event => event.type === 'won').length, 1);
    });
  }
}

test('points alone cannot win; chain count alone cannot win either', () => {
  const scoreOnly = playChapter({level: 'orchard'}, {singles: true});
  assert.ok(scoreOnly.score >= 200);
  assert.equal(scoreOnly.chains, 0);
  assert.equal(scoreOnly.phase, 'lost');
  const chainsOnly = playChapter({level: 'orchard'}, {stopAfter: 2});
  assert.equal(chainsOnly.chains, 2);
  assert.equal(chainsOnly.score, 100);
  assert.equal(chainsOnly.phase, 'lost');
});

test('effects, trail and undrained events remain bounded in continuous practice', () => {
  const state = playing({mode: 'practice'});
  for (let i = 0; i < 300; i++) {
    fixtures(state, [{id: `fruit-${i}`, x: 200}]);
    sweep(state, {x: 150, y: 220}, {x: 250, y: 220});
  }
  assert.equal(state.score, 3000);
  assert.ok(state.fragments.length > 0 && state.fragments.length <= 128);
  assert.ok(state.particles.length > 0 && state.particles.length <= 256);
  assert.ok(state.trail.length > 0 && state.trail.length <= 64);
  assert.ok(state.events.length > 0 && state.events.length <= 64);
  const drained = drainSliceEvents(state);
  assert.ok(drained.length > 0);
  assert.equal(state.events.length, 0);
  assert.deepEqual(drainSliceEvents(state), []);
  advance(state, 2);
  assert.equal(state.fragments.length, 0);
  assert.equal(state.particles.length, 0);
  assert.equal(state.trail.length, 0);
  advance(state, 120);
  assert.equal(state.phase, 'playing');
  assert.ok(state.objects.length <= 64);
});

test('fixed physics preserves seeded formations across different render frame rates', () => {
  const sixty = playing({level: 'flow', seed: 31});
  const ninety = playing({level: 'flow', seed: 31});
  advance(sixty, 2, 60);
  advance(ninety, 2, 90);
  assert.deepEqual(ninety.objects, sixty.objects);
  assert.equal(ninety.time, sixty.time);
  assert.equal(ninety.wave, sixty.wave);
});
