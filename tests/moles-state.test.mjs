import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOLES_KEYS, MOLES_DIFFICULTIES, createMolesState, startMoles, spawnMole,
  hitMole, stepMoles, pauseMoles, resumeMoles, finishMoles, resetMoles,
  drainMolesEvents, molesAccuracy, molesHoleForKey,
} from '../src/moles-state.js';

function playing(options) {
  const state = createMolesState(options);
  assert.equal(startMoles(state), true);
  return state;
}

test('a round waits for Start and defaults to a 45 second standard challenge', () => {
  const state = createMolesState();
  assert.equal(state.difficulty, 'standard');
  assert.equal(state.mode, 'challenge');
  assert.equal(state.duration, 45);
  assert.equal(state.holes.length, 9);
  stepMoles(state, 3);
  assert.equal(state.elapsed, 0);
  assert.equal(hitMole(state, 0), null);
  assert.equal(startMoles(state), true);
  assert.equal(startMoles(state), false);
  stepMoles(state, .5);
  assert.ok(state.holes.some(Boolean));
});

test('spawn validates its hole, type, availability and active phase', () => {
  const state = playing();
  for (const hole of [-1, 9, .5, NaN]) assert.equal(spawnMole(state, hole, 'normal'), false);
  assert.equal(spawnMole(state, 0, 'unknown'), false);
  assert.equal(spawnMole(state, 0, 'normal', 2), true);
  assert.equal(spawnMole(state, 0, 'shiny'), false);
  pauseMoles(state);
  assert.equal(spawnMole(state, 1, 'normal'), false);
});

test('normal and shiny targets score once; an empty hit breaks the combo', () => {
  const state = playing();
  spawnMole(state, 0, 'normal');
  assert.equal(hitMole(state, 0).points, 10);
  assert.equal(state.holes[0], null);
  spawnMole(state, 1, 'shiny');
  assert.equal(hitMole(state, 1).points, 30);
  assert.equal(state.combo, 2);
  assert.equal(hitMole(state, 1).type, 'empty');
  assert.equal(state.combo, 0);
  assert.equal(state.score, 40);
  assert.equal(state.caught, 2);
  assert.equal(state.taps, 3);
  assert.equal(molesAccuracy(state), 67);
});

test('a helmet requires two distinct hits and only its capture awards points', () => {
  const state = playing();
  spawnMole(state, 4, 'helmet');
  const id = state.holes[4].id;
  assert.equal(hitMole(state, 4).type, 'armour');
  assert.equal(state.holes[4].id, id);
  assert.equal(state.holes[4].hp, 1);
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(hitMole(state, 4).type, 'hit');
  assert.equal(state.score, 20);
  assert.equal(state.caught, 1);
  assert.equal(state.taps, 2);
  assert.equal(molesAccuracy(state), 100);
});

test('leafy friends cost 15 points, cannot make score negative, and reset combos', () => {
  const state = playing();
  spawnMole(state, 0, 'normal'); hitMole(state, 0);
  spawnMole(state, 1, 'friend');
  assert.equal(hitMole(state, 1).type, 'friend');
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.friendHits, 1);
  assert.equal(state.goodHits, 1);
  assert.equal(state.caught, 1);
  assert.equal(state.holes[1], null);
});

test('expired targets break a combo but safely leaving a friend does not', () => {
  const state = playing();
  state.nextSpawn = 100;
  spawnMole(state, 0, 'normal'); hitMole(state, 0);
  spawnMole(state, 1, 'friend', .5);
  stepMoles(state, .5);
  assert.equal(state.combo, 1);
  assert.equal(state.missed, 0);
  spawnMole(state, 2, 'helmet', .5); hitMole(state, 2);
  stepMoles(state, .5);
  assert.equal(state.combo, 0);
  assert.equal(state.missed, 1);
  assert.equal(state.goodHits, 2, 'breaking armour remains a valid hit');
});

test('combo bonuses rise every five captures and are capped', () => {
  const state = playing();
  for (let i = 0; i < 20; i++) {
    spawnMole(state, 0, 'normal');
    const event = hitMole(state, 0);
    assert.equal(event.points, 10 + Math.min(3, Math.floor((i + 1) / 5)) * 5);
  }
  assert.equal(state.bestCombo, 20);
  assert.equal(state.combo, 20);
  assert.equal(molesAccuracy(state), 100);
});

test('paused time freezes targets, spawns and scoring; resuming keeps their remaining life', () => {
  const state = playing({seed: 123});
  stepMoles(state, .7);
  pauseMoles(state);
  const frozen = structuredClone(state);
  stepMoles(state, 100);
  assert.equal(hitMole(state, 0), null);
  assert.deepEqual(state, frozen);
  assert.equal(resumeMoles(state), true);
  stepMoles(state, .2);
  assert.ok(Math.abs(state.elapsed - .9) < 1e-10);
});

test('time ends exactly at 45 seconds, without charging misses for still-visible targets', () => {
  const state = playing();
  state.nextSpawn = 100;
  stepMoles(state, 44.5);
  spawnMole(state, 0, 'normal', 2);
  stepMoles(state, 10);
  assert.equal(state.elapsed, 45);
  assert.equal(state.phase, 'ended');
  assert.equal(state.missed, 0);
  assert.ok(state.holes.every(hole => hole === null));
  const frozen = structuredClone(state);
  stepMoles(state, 5);
  assert.equal(hitMole(state, 0), null);
  assert.deepEqual(state, frozen);
  assert.equal(drainMolesEvents(state).filter(event => event.type === 'end').length, 1);
});

test('free practice continues after 45 seconds and can be explicitly finished', () => {
  const state = playing({mode: 'practice'});
  stepMoles(state, 75);
  assert.equal(state.elapsed, 75);
  assert.equal(state.phase, 'playing');
  assert.equal(state.duration, Infinity);
  assert.equal(state.wave, 3);
  assert.equal(finishMoles(state), true);
  assert.equal(state.phase, 'ended');
  assert.equal(finishMoles(state), false);
});

test('the same seed gives identical events and targets across different frame steps', () => {
  const large = playing({difficulty: 'hard', seed: 42});
  const small = playing({difficulty: 'hard', seed: 42});
  stepMoles(large, 42);
  for (let i = 0; i < 2520; i++) stepMoles(small, 1 / 60);
  assert.equal(small.wave, large.wave);
  assert.equal(small.missed, large.missed);
  assert.equal(small.spawned, large.spawned);
  assert.deepEqual(small.holes, large.holes);
  assert.deepEqual(drainMolesEvents(small), drainMolesEvents(large));
  for (const dt of [0, -1, NaN, Infinity]) {
    const before = structuredClone(large);
    stepMoles(large, dt);
    assert.deepEqual(large, before);
  }
});

test('difficulty and later waves increase pressure while keeping helmets hittable', () => {
  assert.ok(MOLES_DIFFICULTIES.easy.interval > MOLES_DIFFICULTIES.standard.interval);
  assert.ok(MOLES_DIFFICULTIES.standard.interval > MOLES_DIFFICULTIES.hard.interval);
  for (const difficulty of ['easy', 'standard', 'hard']) {
    const state = playing({difficulty, seed: 45});
    stepMoles(state, 16);
    assert.equal(state.wave, 2);
    stepMoles(state, 15);
    assert.equal(state.wave, 3);
    spawnMole(state, state.holes.findIndex(hole => !hole), 'helmet');
    for (const hole of state.holes.filter(Boolean)) assert.ok(hole.expiresAt > hole.bornAt);
  }
});

test('reset clears a paused run and does not share targets or events with another round', () => {
  const state = playing({difficulty: 'hard', seed: 42});
  spawnMole(state, 0, 'normal'); hitMole(state, 0);
  pauseMoles(state);
  resetMoles(state, {mode: 'practice'});
  assert.equal(state.phase, 'ready');
  assert.equal(state.paused, false);
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.elapsed, 0);
  assert.equal(state.difficulty, 'hard');
  assert.equal(state.mode, 'practice');
  assert.deepEqual(state.events, []);
  assert.ok(state.holes.every(hole => hole === null));
  assert.equal(createMolesState({difficulty: 'unknown'}).difficulty, 'standard');
});

test('QWE / ASD / ZXC maps nine holes while editing, modifiers and repeat are ignored', () => {
  assert.deepEqual(MOLES_KEYS, ['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C']);
  for (const [hole, key] of MOLES_KEYS.entries()) assert.equal(molesHoleForKey({key: key.toLowerCase()}), hole);
  assert.equal(molesHoleForKey({key: '?'}), null);
  for (const flag of ['repeat', 'isComposing', 'ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'defaultPrevented']) {
    assert.equal(molesHoleForKey({key: 'q', [flag]: true}), null);
  }
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(molesHoleForKey({key:'q', target:{tagName}}), null);
  assert.equal(molesHoleForKey({key:'q', target:{isContentEditable:true}}), null);
});
