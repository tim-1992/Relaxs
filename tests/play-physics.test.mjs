import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAY_LEVELS, createPlayState, firePlayBall, advancePlay, rotatePlayMirror, recallPlayBall} from '../src/play-physics.js';

function flight(state, angle) {
  firePlayBall(state, angle);
  for (let i = 0; i < 1200 && state.ball.active; i++) advancePlay(state, 1 / 120);
}

test('one real hit propagates through the first connected constellation', () => {
  const state = createPlayState(0);
  flight(state, 0);
  assert.equal(state.targets.filter(target => target.lit).length, 4);
  assert.equal(state.complete, true);
  assert.equal(state.shots, 1);
});

test('a blocking reflector changes the flight instead of letting the ball pass through', () => {
  const state = createPlayState(1);
  firePlayBall(state, 0);
  let bounced = false;
  for (let i = 0; i < 100; i++) {
    advancePlay(state, 1 / 120);
    if (state.ball.vy < 0) { bounced = true; break; }
  }
  assert.equal(bounced, true);
  assert.equal(state.complete, false);
  assert.equal(state.targets.some(target => target.lit), false);
});

test('firing while paused or while a ball is in flight cannot spend extra shots', () => {
  const state = createPlayState(0);
  state.paused = true;
  assert.equal(firePlayBall(state, 0), false);
  state.paused = false;
  assert.equal(firePlayBall(state, 0), true);
  assert.equal(firePlayBall(state, 20), false);
  assert.equal(state.shots, 1);
  const y = state.ball.y;
  state.paused = true;
  advancePlay(state, .1);
  assert.equal(state.ball.y, y);
});

test('recalling and rebuilding a level restore a usable launcher without changing the level definition', () => {
  const state = createPlayState(2);
  const original = JSON.stringify(PLAY_LEVELS[2]);
  rotatePlayMirror(state, 0);
  firePlayBall(state, -20);
  advancePlay(state, .1);
  recallPlayBall(state);
  assert.equal(state.ball.active, false);
  assert.equal(state.ball.x, 0);
  assert.equal(state.ball.y, -4);
  assert.equal(JSON.stringify(PLAY_LEVELS[2]), original);
  const reset = createPlayState(2);
  assert.equal(reset.shots, 0);
  assert.equal(reset.targets.every(target => !target.lit), true);
  assert.equal(reset.mirrors[0].angle, PLAY_LEVELS[2].mirrors[0].angle);
});

test('large frame intervals are subdivided and still register nearby targets', () => {
  const state = createPlayState(0);
  firePlayBall(state, 0);
  for (let i = 0; i < 20 && !state.complete; i++) advancePlay(state, .1);
  assert.equal(state.complete, true);
});

test('the same shot follows the same path across uneven rendering frame rates', () => {
  const regular = createPlayState(3), uneven = createPlayState(3);
  firePlayBall(regular, -72); firePlayBall(uneven, -72);
  for (let i = 0; i < 240; i++) advancePlay(regular, 1 / 120);
  for (let i = 0; i < 100; i++) {
    advancePlay(uneven, .007);
    advancePlay(uneven, .013);
  }
  assert.ok(Math.abs(regular.ball.x - uneven.ball.x) < 1e-8);
  assert.ok(Math.abs(regular.ball.y - uneven.ball.y) < 1e-8);
  assert.deepEqual(regular.targets, uneven.targets);
});

test('all five constellations can be completed through legal shots and reflector settings', () => {
  assert.equal(PLAY_LEVELS.length, 5);
  for (let level = 0; level < PLAY_LEVELS.length; level++) {
    let state = createPlayState(level);
    for (let attempt = 0; attempt < 12 && !state.complete; attempt++) {
      let best = null;
      for (let orientation = 0; orientation < 2; orientation++) {
        for (let angle = -72; angle <= 72; angle += 2) {
          const candidate = structuredClone(state);
          if (orientation) candidate.mirrors.forEach((mirror, index) => {
            if (mirror.rotatable) rotatePlayMirror(candidate, index);
          });
          flight(candidate, angle);
          const lit = candidate.targets.filter(target => target.lit).length;
          if (!best || lit > best.lit) best = {state: candidate, lit};
        }
      }
      assert.ok(best.lit > state.targets.filter(target => target.lit).length, `level ${level + 1} must allow progress`);
      state = best.state;
    }
    assert.equal(state.complete, true, `level ${level + 1} must be completable`);
  }
});
