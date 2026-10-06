import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayState, firePlayBall, advancePlay, rotatePlayMirror, recallPlayBall, predictPlayTrajectory} from '../src/play-physics.js';

function flight(state, angle) {
  firePlayBall(state, angle);
  for (let i = 0; i < 900 && state.ball.active; i++) advancePlay(state, 1 / 120);
}

test('puzzle targets require the stated rebound count, not just any collision', () => {
  const state = createPlayState(0, 'standard');
  assert.equal(state.groups[0].bounces, 1);
  flight(state, 0);
  assert.equal(state.targets.some(t => t.lit), false);
  assert.equal(state.complete, false);
  assert.equal(state.shots, 1);
  assert.ok(state.events.some(e => e.type === 'rule-miss'));
});

test('recalling a puzzle ball spends the attempt and cannot bypass exhaustion', () => {
  const state = createPlayState(0, 'hard');
  for (let i = 0; i < state.maxShots; i++) {
    assert.equal(firePlayBall(state, 0), true);
    recallPlayBall(state);
  }
  assert.equal(state.failed, true);
  assert.equal(firePlayBall(state, 0), false);
  const shots = state.shots;
  predictPlayTrajectory(state);
  assert.equal(state.shots, shots);
});

test('paused puzzles reject reflector changes as well as shots', () => {
  const state = createPlayState(2, 'standard');
  state.paused = true;
  assert.equal(rotatePlayMirror(state, 0), false);
  assert.equal(firePlayBall(state, 0), false);
});

test('hitting a later numbered cluster cannot skip the current objective', () => {
  // -60 degrees legally reaches the right-hand cluster after one rebound.
  const later = createPlayState(2, 'standard');
  later.nextGroup = 1;
  flight(later, -60);
  assert.ok(later.targets.some(t => t.group === 1 && t.lit));
  const current = createPlayState(2, 'standard');
  flight(current, -60);
  assert.equal(current.targets.some(t => t.lit), false);
  assert.equal(current.nextGroup, 0);
  assert.ok(current.events.some(e => e.type === 'rule-miss' && e.reason === 'order'));
});

test('solving the final target on the last available shot is a win', () => {
  const state = createPlayState(0, 'standard');
  state.shots = state.maxShots - 1;
  flight(state, -58);
  assert.equal(state.complete, true);
  assert.equal(state.failed, false);
});

test('every puzzle tier and level has legal solutions within its shot budget', () => {
  for (const difficulty of ['standard', 'hard']) {
    for (let level = 0; level < 5; level++) {
      let state = createPlayState(level, difficulty);
      assert.ok(Number.isFinite(state.maxShots));
      while (!state.complete && !state.failed) {
        let solution = null;
        const rotatable = state.mirrors.flatMap((m, i) => m.rotatable ? [i] : []);
        for (let mask = 0; mask < 2 ** rotatable.length && !solution; mask++) {
          for (let angle = -75; angle <= 75; angle++) {
            const candidate = structuredClone(state);
            rotatable.forEach((id, i) => { if (mask & (1 << i)) rotatePlayMirror(candidate, id); });
            flight(candidate, angle);
            if (candidate.nextGroup > state.nextGroup) { solution = candidate; break; }
          }
        }
        assert.ok(solution, `${difficulty} level ${level + 1}, group ${state.nextGroup + 1} needs a legal shot`);
        state = solution;
      }
      assert.equal(state.complete, true);
      assert.equal(state.failed, false);
    }
  }
});
