import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalmClock } from '../src/calm-clock.js';
import { createCalmAudio } from '../src/calm-audio.js';

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be close to ${expected}`);
}

test('a session stays ready until started and starts with an inhale', () => {
  const clock = createCalmClock();
  assert.equal(clock.read(100_000).status, 'ready');
  assert.equal(clock.read(100_000).elapsedMs, 0);
  const started = clock.start(100_000);
  assert.equal(started.status, 'running');
  assert.equal(started.phase, 'inhale');
  assert.equal(started.phaseRemainingMs, 4_000);
  assert.equal(started.remainingMs, 60_000);
  assert.equal(started.expansion, 0);
  assert.equal(clock.start(101_000).elapsedMs, 1_000);
});

test('pause and resume preserve the phase and expansion within a breath', () => {
  const clock = createCalmClock();
  clock.start(500);
  const paused = clock.pause(2_500);
  assert.equal(paused.status, 'paused');
  assert.equal(paused.elapsedMs, 2_000);
  assert.equal(paused.phase, 'inhale');
  closeTo(paused.expansion, .5);
  assert.deepEqual(clock.read(90_000), paused);
  assert.deepEqual(clock.pause(100_000), paused);
  const resumed = clock.resume(100_500);
  assert.equal(resumed.status, 'running');
  assert.equal(resumed.elapsedMs, 2_000);
  closeTo(resumed.expansion, .5);
  assert.equal(clock.read(102_500).phase, 'exhale');
  assert.equal(clock.read(102_500).expansion, 1);
});

test('paused wall time never consumes a timed session', () => {
  const clock = createCalmClock();
  clock.start(0);
  clock.pause(25_000);
  assert.equal(clock.read(900_000).remainingMs, 35_000);
  clock.resume(900_000);
  clock.pause(910_000);
  assert.equal(clock.read(3_000_000).elapsedMs, 35_000);
  clock.resume(3_000_000);
  assert.equal(clock.read(3_024_999).status, 'running');
  assert.equal(clock.read(3_025_000).status, 'finished');
  assert.equal(clock.read(3_025_000).completedBy, 'duration');
});

test('completion occurs at the exact active duration and is clamped after skipped frames', () => {
  const clock = createCalmClock();
  clock.start(1_000);
  assert.equal(clock.read(60_999).status, 'running');
  const complete = clock.read(61_000);
  assert.equal(complete.status, 'finished');
  assert.equal(complete.elapsedMs, 60_000);
  assert.equal(complete.remainingMs, 0);
  assert.equal(complete.progress, 1);
  assert.equal(complete.completedBy, 'duration');
  assert.deepEqual(clock.read(999_999), complete);
  assert.deepEqual(clock.resume(999_999), complete);
  assert.deepEqual(clock.finish(999_999), complete);

  const skipped = createCalmClock({ durationMs: 180_000 });
  skipped.start(0);
  assert.equal(skipped.read(190_000).elapsedMs, 180_000);
  assert.equal(skipped.read(190_000).status, 'finished');
});

test('pausing at the deadline completes instead of leaving a zero-time paused session', () => {
  const clock = createCalmClock();
  clock.start(0);
  assert.equal(clock.pause(60_000).status, 'finished');
  assert.equal(clock.read(100_000).completedBy, 'duration');
});

test('phase and expansion derive from active time even across many skipped cycles', () => {
  const clock = createCalmClock({ patternId: 'long-exhale', durationMs: 0 });
  clock.start(1_000);
  const examples = [
    { now: 3_000, phase: 'inhale', remaining: 2_000, expansion: .5 },
    { now: 5_000, phase: 'exhale', remaining: 6_000, expansion: 1 },
    { now: 8_000, phase: 'exhale', remaining: 3_000, expansion: .5 },
    { now: 11_000, phase: 'inhale', remaining: 4_000, expansion: 0 },
    { now: 78_000, phase: 'exhale', remaining: 3_000, expansion: .5 },
  ];
  for (const example of examples) {
    const state = clock.read(example.now);
    assert.equal(state.phase, example.phase);
    assert.equal(state.phaseRemainingMs, example.remaining);
    closeTo(state.expansion, example.expansion);
  }
});

test('the three-second pattern changes phase without a breath hold', () => {
  const clock = createCalmClock({ patternId: 'light' });
  clock.start(0);
  assert.equal(clock.read(2_999).phase, 'inhale');
  assert.equal(clock.read(3_000).phase, 'exhale');
  assert.equal(clock.read(3_000).phaseRemainingMs, 3_000);
  assert.equal(clock.read(6_000).phase, 'inhale');
  assert.equal(clock.read(6_000).phaseRemainingMs, 3_000);
});

test('free time continues indefinitely and finishes only when requested', () => {
  const clock = createCalmClock({ durationMs: 0 });
  clock.start(0);
  const ongoing = clock.read(3_600_000);
  assert.equal(ongoing.status, 'running');
  assert.equal(ongoing.elapsedMs, 3_600_000);
  assert.equal(ongoing.remainingMs, null);
  assert.equal(ongoing.progress, null);
  const finished = clock.finish(3_602_000);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.completedBy, 'early');
  assert.equal(finished.elapsedMs, 3_602_000);
  assert.deepEqual(clock.read(4_000_000), finished);
});

test('finishing while paused records active time and cannot later resume', () => {
  const clock = createCalmClock();
  clock.start(0);
  clock.pause(8_500);
  const finished = clock.finish(30_000);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.elapsedMs, 8_500);
  assert.equal(finished.completedBy, 'early');
  assert.deepEqual(clock.resume(100_000), finished);
  assert.deepEqual(clock.start(100_000), finished);
});

test('restart clears a previous completion and retains selected settings', () => {
  const clock = createCalmClock({ patternId: 'light', durationMs: 300_000 });
  clock.start(0);
  clock.finish(8_000);
  const reset = clock.reset();
  assert.equal(reset.status, 'ready');
  assert.equal(reset.elapsedMs, 0);
  assert.equal(reset.completedBy, null);
  assert.equal(reset.remainingMs, 300_000);
  assert.equal(reset.patternId, 'light');
  clock.start(50_000);
  assert.equal(clock.read(53_000).phase, 'exhale');
});

test('changing settings resets a paused session to the new pattern and duration', () => {
  const clock = createCalmClock();
  clock.start(0);
  clock.pause(5_000);
  const changed = clock.reset({ patternId: 'long-exhale', durationMs: 180_000 });
  assert.equal(changed.status, 'ready');
  assert.equal(changed.elapsedMs, 0);
  assert.equal(changed.remainingMs, 180_000);
  clock.start(50_000);
  assert.equal(clock.read(57_000).phaseRemainingMs, 3_000);
  clock.reset({ durationMs: 0 });
  assert.equal(clock.read(100_000).patternId, 'long-exhale');
  assert.equal(clock.read(100_000).remainingMs, null);
});

test('duplicate resume and an older frame cannot rewind active progress', () => {
  const clock = createCalmClock();
  clock.start(10_000);
  clock.read(15_000);
  assert.equal(clock.resume(15_500).elapsedMs, 5_500);
  assert.equal(clock.read(16_000).elapsedMs, 6_000);
  assert.equal(clock.read(14_000).elapsedMs, 6_000);
});

test('invalid settings and timestamps are rejected without corrupting the clock', () => {
  assert.throws(() => createCalmClock({ patternId: 'missing' }), RangeError);
  for (const durationMs of [-1, NaN, Infinity, '60']) {
    assert.throws(() => createCalmClock({ durationMs }), RangeError);
  }
  const clock = createCalmClock();
  clock.start(0);
  clock.pause(4_000);
  const before = clock.read(4_000);
  assert.throws(() => clock.reset({ durationMs: -1 }), RangeError);
  assert.deepEqual(clock.read(4_000), before);
  assert.throws(() => clock.resume(NaN), TypeError);
  assert.deepEqual(clock.read(4_000), before);
});

test('audio degrades to silence when Web Audio is unavailable and cleanup is repeatable', async () => {
  // Node has no AudioContext: exercise the real unsupported-device path.
  const audio = createCalmAudio();
  assert.equal(audio.available, false);
  assert.equal(await audio.play('sea', 30), false);
  audio.setVolume(0);
  audio.pause();
  audio.dispose();
  audio.dispose();
  assert.equal(await audio.play('rain', 30), false);
});
