import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCrusherState, selectCrusherTarget, feedCrusher, beginCrusherPressure,
  releaseCrusherPressure, cancelCrusherPressure, stepCrusher, getCrusherBand,
  getCrusherVisual, pauseCrusher, resumeCrusher, nextCrusher, replayCrusher,
} from '../src/crusher-state.js';

const armed = options => stepCrusher(feedCrusher(createCrusherState(options)), 1.5);
function shot(state, pressure) {
  return releaseCrusherPressure(stepCrusher(beginCrusherPressure(state), pressure / .38));
}
function goodShot(state) {
  const band = getCrusherBand(state);
  return shot(state, (band.min + band.max) / 2);
}
const settle = state => stepCrusher(state, 4);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} versus ${b}`);

test('feed must finish before pressure; updates are pure and invalid input cannot skip the conveyor', () => {
  const ready = createCrusherState();
  const snapshot = structuredClone(ready);
  assert.equal(beginCrusherPressure(ready), ready);
  const feeding = feedCrusher(ready);
  assert.equal(feeding.phase, 'feeding');
  assert.equal(feedCrusher(feeding), feeding);
  assert.equal(releaseCrusherPressure(feeding), feeding);
  const moving = stepCrusher(feeding, .5);
  assert.ok(getCrusherVisual(moving).feed > 0 && getCrusherVisual(moving).feed < 1);
  assert.equal(stepCrusher(moving, 1).phase, 'armed');
  assert.deepEqual(ready, snapshot);
});

test('wrong pressure leaves a persistent dent and a retry; it never scores a finished object', () => {
  for (const pressure of [.1, 1]) {
    const pressing = shot(armed(), pressure);
    assert.equal(pressing.phase, 'pressing');
    assert.equal(pressing.lastShot.matched, false);
    assert.equal(pressing.attempts, 1);
    const retry = settle(pressing);
    assert.equal(retry.phase, 'armed');
    assert.ok(retry.damage > 0 && retry.damage < 1);
    assert.equal(retry.completed.length, 0);
    assert.equal(retry.pressure, 0);
    assert.equal(settle(goodShot(retry)).phase, 'result');
  }
});

test('all targets visibly press, break and eject before their result becomes available', () => {
  for (const target of ['car', 'sofa', 'tv']) {
    let state = goodShot(armed({target}));
    assert.equal(state.phase, 'pressing');
    assert.equal(nextCrusher(state), state);
    const mid = stepCrusher(state, .55);
    assert.ok(getCrusherVisual(mid).press > .5);
    assert.ok(getCrusherVisual(mid).damage > 0);
    state = stepCrusher(state, 1.05);
    assert.equal(state.phase, 'breaking');
    assert.equal(state.completed.length, 0);
    state = stepCrusher(state, .8);
    assert.equal(state.phase, 'ejecting');
    assert.equal(state.completed.length, 0);
    state = stepCrusher(state, 1.3);
    assert.equal(state.phase, 'result');
    assert.deepEqual(state.completed, [target]);
    assert.ok(state.score > 0);
    assert.equal(getCrusherVisual(state).eject, 1);
  }
});

test('three different orders finish a run; next and replay are usable without carrying damage', () => {
  let state = createCrusherState();
  for (let index = 0; index < 3; index++) {
    state = settle(goodShot(stepCrusher(feedCrusher(state), 1.5)));
    assert.equal(state.phase, index === 2 ? 'complete' : 'result');
    if (index < 2) {
      const completedTarget = state.target;
      state = nextCrusher(state);
      assert.equal(state.phase, 'ready');
      assert.equal(state.damage, 0);
      assert.notEqual(state.target, completedTarget);
      assert.equal(selectCrusherTarget(state, completedTarget), state);
    }
  }
  assert.equal(new Set(state.completed).size, 3);
  assert.equal(nextCrusher(state), state);
  const replay = replayCrusher(state);
  assert.equal(replay.phase, 'ready');
  assert.equal(replay.completed.length, 0);
  assert.equal(replay.score, 0);
});

test('easy has a wider force zone; hard requires consecutive material stages and misses restart the sequence', () => {
  const easy = getCrusherBand(createCrusherState({difficulty: 'easy'}));
  const standard = getCrusherBand(createCrusherState());
  assert.ok(easy.max - easy.min > standard.max - standard.min);
  let hard = armed({difficulty: 'hard', target: 'sofa'});
  const firstBand = getCrusherBand(hard);
  hard = settle(goodShot(hard));
  assert.equal(hard.phase, 'armed');
  assert.equal(hard.stage, 1);
  assert.equal(hard.completed.length, 0);
  assert.notEqual(getCrusherBand(hard).label, firstBand.label);
  assert.ok(getCrusherBand(hard).min > firstBand.max);
  hard = settle(shot(hard, .02));
  assert.equal(hard.stage, 0);
  hard = settle(goodShot(hard));
  assert.equal(hard.stage, 1);
  hard = settle(goodShot(hard));
  assert.equal(hard.phase, 'result');
});

test('every object on every difficulty is achievable at 15, 30, 60 and 144 fps', () => {
  for (const difficulty of ['easy', 'standard', 'hard']) {
    for (const target of ['car', 'sofa', 'tv']) {
      for (const fps of [15, 30, 60, 144]) {
        let state = armed({difficulty, target});
        for (let cycle = 0; cycle < (difficulty === 'hard' ? 2 : 1); cycle++) {
          const band = getCrusherBand(state), middle = (band.min + band.max) / 2;
          state = beginCrusherPressure(state);
          while (state.pressure < middle) state = stepCrusher(state, 1 / fps);
          state = settle(releaseCrusherPressure(state));
        }
        assert.equal(state.phase, 'result', `${difficulty}/${target}/${fps}`);
        assert.equal(state.attempts, difficulty === 'hard' ? 2 : 1);
      }
    }
  }
});

test('practice can repeatedly crush the same object without a terminal state or growing history', () => {
  let state = createCrusherState({mode: 'practice', target: 'tv'});
  for (let cycle = 0; cycle < 20; cycle++) {
    state = settle(goodShot(stepCrusher(feedCrusher(state), 1.5)));
    assert.equal(state.phase, 'result');
    assert.equal(state.crushed, cycle + 1);
    assert.ok(state.completed.length <= 3);
    state = nextCrusher(state);
    assert.equal(state.phase, 'ready');
    assert.equal(state.target, 'tv');
  }
});

test('pause freezes all phases; cancelling an input vents it without committing an accidental crush', () => {
  const charging = stepCrusher(beginCrusherPressure(armed()), 1);
  const paused = pauseCrusher(charging);
  assert.equal(paused.paused, true);
  assert.equal(stepCrusher(paused, 100), paused);
  assert.equal(releaseCrusherPressure(paused), paused);
  assert.equal(feedCrusher(paused), paused);
  assert.equal(selectCrusherTarget(paused, 'tv'), paused);
  assert.deepEqual(getCrusherVisual(stepCrusher(paused, 100)), getCrusherVisual(paused));
  const resumed = resumeCrusher(paused);
  assert.equal(resumed.phase, 'armed');
  assert.equal(resumed.pressure, 0);
  assert.equal(resumed.attempts, 0);
  assert.equal(cancelCrusherPressure(charging).phase, 'armed');
  const pressing = goodShot(armed());
  assert.equal(resumeCrusher(pauseCrusher(pressing)).phase, 'pressing');
});

test('pressure and animation are deterministic under different time partitions, including delayed frames', () => {
  const source = beginCrusherPressure(armed());
  const a = stepCrusher(source, 1.25);
  let b = source;
  for (let i = 0; i < 125; i++) b = stepCrusher(b, .01);
  near(a.pressure, b.pressure);
  near(a.time, b.time);
  assert.equal(stepCrusher(source, 1e6).pressure, 1);
  for (const dt of [NaN, Infinity, -1, 0]) assert.equal(stepCrusher(source, dt), source);
  const pressed = goodShot(armed());
  const long = stepCrusher(pressed, 3.05);
  let sliced = pressed;
  for (let i = 0; i < 305; i++) sliced = stepCrusher(sliced, .01);
  assert.equal(long.phase, sliced.phase);
  assert.equal(long.crushed, sliced.crushed);
  assert.deepEqual(long.completed, sliced.completed);
  near(getCrusherVisual(long).eject, getCrusherVisual(sliced).eject);
});

test('invalid settings normalize safely, selection only changes ready objects, and reset retains difficulty', () => {
  const state = createCrusherState({difficulty: 'nope', target: '<script>', mode: 'nope'});
  assert.equal(state.difficulty, 'standard');
  assert.equal(state.target, 'car');
  assert.equal(state.mode, 'orders');
  assert.equal(selectCrusherTarget(state, 'missing'), state);
  const sofa = selectCrusherTarget(state, 'sofa');
  assert.equal(sofa.target, 'sofa');
  assert.equal(selectCrusherTarget(feedCrusher(sofa), 'car').target, 'sofa');
  assert.equal(replayCrusher(createCrusherState({difficulty: 'hard'})).difficulty, 'hard');
});
