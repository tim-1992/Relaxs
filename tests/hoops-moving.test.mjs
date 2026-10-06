import test from 'node:test';
import assert from 'node:assert/strict';
import * as physics from '../src/hoops-physics.js';
import * as challenges from '../src/hoops-challenges.js';

const {HOOP, BALL_START, BALL_RADIUS, createShot, velocityFromAim, stepShot,
  predictTrajectory, createThrowMotion, stepThrowMotion} = physics;

function simulate(aim, target = HOOP, {wind, dt = 1 / 60} = {}) {
  const shot = createShot(velocityFromAim(aim), {wind}), events = [];
  for (let frame = 0; frame < Math.ceil(6 / dt) && !shot.done; frame++) {
    events.push(...stepShot(shot, dt, target));
  }
  return {shot, events};
}

test('only standard/hard questions 8–10 move, with gradually wider and faster sweeps', () => {
  for (const difficulty of ['easy', 'standard', 'hard']) {
    let amplitude = 0, period = Infinity;
    for (let index = 0; index < 10; index++) {
      const challenge = challenges.getHoopsChallenge(difficulty, index);
      if (difficulty === 'easy' || index < 7) assert.equal(challenge.motion, null);
      else {
        assert.ok(challenge.motion.amplitude > amplitude);
        assert.ok(challenge.motion.period < period && challenge.motion.period >= 4);
        assert.ok(Number.isFinite(challenge.motion.phase));
        amplitude = challenge.motion.amplitude; period = challenge.motion.period;
      }
      assert.equal(challenges.getHoopsChallenge(difficulty, index, {practice: true}).motion, null);
    }
  }
});

test('target sampling preserves base layouts, sanitizes time and returns independent positions', () => {
  assert.equal(typeof challenges.getHoopsTarget, 'function');
  const moving = {hoop: {x: 2, y: 3.35, z: -4}, motion: {amplitude: .5, period: 6, phase: 0}};
  for (const time of [undefined, 0, -1, NaN, Infinity]) {
    assert.deepEqual(challenges.getHoopsTarget(moving, time), {x: 2, y: 3.35, z: -4});
  }
  assert.ok(Math.abs(challenges.getHoopsTarget(moving, 1.5).x - 2.5) < 1e-10);
  assert.ok(Math.abs(challenges.getHoopsTarget(moving, 4.5).x - 1.5) < 1e-10);
  const shifted = {...moving, motion: {...moving.motion, phase: Math.PI / 2}};
  assert.equal(challenges.getHoopsTarget(shifted, 0).x, 2.5);
  const fixed = challenges.getHoopsChallenge('easy');
  const position = challenges.getHoopsTarget(fixed, 80);
  position.x = 999;
  assert.deepEqual(fixed.hoop, HOOP);
  assert.deepEqual(challenges.getHoopsTarget(fixed, 80), HOOP);
  assert.deepEqual(moving.hoop, {x: 2, y: 3.35, z: -4});
});

test('the exported release delay agrees with the windup release instant', () => {
  assert.equal(physics.HOOPS_RELEASE_DELAY, .32);
  const motion = createThrowMotion(.6);
  let elapsed = 0, released = false;
  while (!released) {
    const result = stepThrowMotion(motion, 1 / 60);
    elapsed += 1 / 60;
    if (result.release) {
      assert.equal(result.flightTime < 1 / 60, true);
      assert.ok(Math.abs(elapsed - result.flightTime - physics.HOOPS_RELEASE_DELAY) < 1e-10);
      released = true;
    }
  }
});

test('a centered shot makes a fixed hoop but misses when the hoop keeps moving after release', () => {
  const fixed = simulate({x: 0, power: .6});
  const ages = [];
  const moving = simulate({x: 0, power: .6}, age => {
    ages.push(age);
    return {...HOOP, x: age * 1.2};
  });
  assert.equal(fixed.shot.scored, true);
  assert.equal(moving.shot.scored, false);
  assert.ok(ages.length > 240, 'target must be sampled throughout flight');
  assert.ok(ages.some(age => age > 1), 'target cannot freeze at launch');
  assert.ok(moving.shot.crossingHoop.x > 1.4);
});

test('descending crossing stores the actual target at the fractional crossing instant', () => {
  const aim = {x: .8, power: .6};
  const {shot} = simulate(aim, age => ({...HOOP, x: age * .4}));
  const vy = velocityFromAim(aim).y;
  const crossingTime = (vy + Math.sqrt(vy * vy - 2 * 9.8 * (HOOP.y - BALL_START.y))) / 9.8;
  assert.ok(shot.crossingHoop, 'a miss must retain the moving target snapshot');
  assert.ok(Math.abs(shot.crossingHoop.x - crossingTime * .4) < 1e-5);
  assert.equal(shot.crossingHoop.y, HOOP.y);
  assert.equal(shot.crossingHoop.z, HOOP.z);
  assert.equal(shot.scored, false);
});

test('miss hints compare with the crossing snapshot rather than where the hoop is now', () => {
  const shot = {crossing: {x: .8, y: 3.35, z: -3},
    crossingHoop: {x: 1.5, y: 3.35, z: -3}};
  const challenge = {hoop: {x: -1, y: 3.35, z: -3}};
  assert.match(challenges.hoopsMissHint(shot, challenge), /偏左/);
  assert.doesNotMatch(challenges.hoopsMissHint(shot, challenge), /偏右/);
  assert.match(challenges.hoopsMissHint({...shot, crossingHoop: null}, challenge), /偏右/);
});

test('a laterally moving rim transfers contact velocity to a stationary ball', () => {
  const fixed = createShot({x: 0, y: 0, z: 0});
  fixed.position = {x: HOOP.x + .72, y: HOOP.y, z: HOOP.z};
  const moving = structuredClone(fixed);
  stepShot(fixed, 1 / 240, HOOP);
  const events = stepShot(moving, 1 / 240, age => ({...HOOP, x: age * 2}));
  assert.equal(fixed.touchedRim, false);
  assert.equal(moving.touchedRim, true);
  assert.ok(moving.velocity.x > 2, 'rim response must use velocity relative to the moving hoop');
  assert.ok(events.some(event => event.type === 'rim'));
  assert.equal(moving.scored, false);
});

test('backboard contacts use its moving position and tangential velocity', () => {
  const fixed = createShot({x: 0, y: 0, z: -5});
  fixed.position = {x: 1.6, y: 4, z: HOOP.z - .62 + BALL_RADIUS + .01};
  const moving = structuredClone(fixed);
  stepShot(fixed, 1 / 60, HOOP);
  stepShot(moving, 1 / 60, age => ({...HOOP, x: 1.6 + age * .2}));
  assert.equal(fixed.touchedBoard, false);
  assert.equal(moving.touchedBoard, true);
  assert.ok(moving.velocity.z > 0);
  assert.ok(moving.velocity.x > 0, 'board friction acts relative to its lateral motion');
});

test('constant target callbacks preserve easy, practice and the first seven fixed puzzles', () => {
  for (const difficulty of ['easy', 'standard', 'hard']) {
    for (let index = 0; index < 10; index++) {
      for (const practice of [false, true]) {
        const challenge = challenges.getHoopsChallenge(difficulty, index, {practice});
        if (challenge.motion) continue;
        const aim = {x: -.24, power: .6};
        const fixed = simulate(aim, challenge.hoop, {wind: challenge.wind});
        const sampled = simulate(aim, age => challenges.getHoopsTarget(challenge, 9 + age),
          {wind: challenge.wind});
        assert.deepEqual(sampled, fixed);
      }
    }
  }
});

test('paused time neither samples the target nor advances the ball, then resumes identically', () => {
  const challenge = challenges.getHoopsChallenge('hard', 9);
  let samples = 0;
  const target = age => {samples++; return challenges.getHoopsTarget(challenge, 2 + age);};
  const shot = createShot(velocityFromAim({x: -.3, power: .8}), {wind: challenge.wind});
  stepShot(shot, .1, target);
  const frozen = structuredClone(shot), count = samples;
  for (const dt of [0, -1, Infinity, NaN]) {
    assert.deepEqual(stepShot(shot, dt, target), []);
    assert.deepEqual(shot, frozen);
  }
  assert.equal(samples, count);
  const uninterrupted = structuredClone(frozen);
  stepShot(shot, .1, target);
  stepShot(uninterrupted, .1, target);
  assert.deepEqual(shot, uninterrupted);
});

test('a moving-target preview is deterministic and uses the same flight samples as a real shot', () => {
  const velocity = velocityFromAim({x: .12, power: .775});
  const challenge = challenges.getHoopsChallenge('hard', 9);
  const launchTime = 1.25 + physics.HOOPS_RELEASE_DELAY;
  const target = age => challenges.getHoopsTarget(challenge, launchTime + age);
  const options = {wind: challenge.wind, maxTime: 1.8};
  const points = predictTrajectory(velocity, target, options);
  assert.deepEqual(points, predictTrajectory(velocity, target, options));
  const shot = createShot(velocity, options);
  for (let index = 1; index < points.length; index++) {
    stepShot(shot, .05, target);
    assert.deepEqual(shot.position, points[index]);
  }
  assert.ok(points.length > 20);
});

test('score events use the target at crossing, rather than the end of the render frame', () => {
  const events = [];
  const shot = createShot({x: 0, y: -2, z: 0});
  shot.position = {x: .002, y: HOOP.y + .005, z: HOOP.z};
  const target = age => ({...HOOP, x: age});
  events.push(...stepShot(shot, 1 / 30, target));
  const score = events.find(event => event.type === 'score');
  assert.ok(score);
  assert.deepEqual(score.position, shot.crossingHoop);
  assert.ok(score.position.x > 0 && score.position.x < 1 / 240);
  assert.notEqual(score.position.x, target(shot.age).x);
  const snapshot = structuredClone(shot.crossingHoop);
  stepShot(shot, .1, target);
  assert.deepEqual(shot.crossingHoop, snapshot);
});

test('scoring samples the fractional crossing even when a target moves out within one substep', () => {
  const shot = createShot({x: 0, y: -2, z: 0});
  shot.position = {x: 0, y: HOOP.y + .00005, z: HOOP.z};
  const sharedTarget = {...HOOP};
  const target = age => {
    sharedTarget.x = age * 240;
    return sharedTarget;
  };
  stepShot(shot, 1 / 240, target);
  assert.equal(shot.scored, true, 'the rim was centered when the ball crossed its height');
  assert.ok(shot.crossingHoop.x > 0 && shot.crossingHoop.x < .01);
  const snapshot = structuredClone(shot.crossingHoop);
  target(4);
  assert.deepEqual(shot.crossingHoop, snapshot, 'later samples cannot mutate the recorded target');
});

// The controls move direction by .06 and power by .025. Each attempt includes
// the real windup; flight gets only the remainder of its release frame.
const directions = [0, ...Array.from({length: 16}, (_, i) =>
  [Number(((i + 1) * .06).toFixed(2)), Number((-(i + 1) * .06).toFixed(2))]).flat(), 1, -1];
const powers = Array.from({length: 39}, (_, i) => Number((.05 + i * .025).toFixed(3)));

function timedAttempt(challenge, aim, pressTime, dt = 1 / 60) {
  const motion = createThrowMotion(aim.power);
  let roundTime = pressTime, shot, launchTime;
  const events = [];
  for (let frame = 0; frame < Math.ceil(6 / dt) && !shot?.done; frame++) {
    roundTime += dt;
    const motionStep = stepThrowMotion(motion, dt);
    if (motionStep.release) {
      launchTime = roundTime - motionStep.flightTime;
      shot = createShot(velocityFromAim(aim), {wind: challenge.wind});
    }
    if (shot) events.push(...stepShot(shot, motionStep.flightTime,
      age => challenges.getHoopsTarget(challenge, launchTime + age)));
  }
  return {shot, launchTime, events};
}

test('waiting half a moving cycle changes the outcome of the same legal shot', () => {
  const challenge = challenges.getHoopsChallenge('standard', 9);
  const aim = {x: 0, power: .725};
  assert.equal(timedAttempt(challenge, aim, 0).shot.scored, true);
  assert.equal(timedAttempt(challenge, aim, challenge.motion.period / 2).shot.scored, false);
});

for (const difficulty of ['standard', 'hard']) {
  for (let index = 7; index < 10; index++) {
    test(`${difficulty} question ${index + 1} has a legal timed keyboard solution at 30/60/120/144 Hz`, t => {
      const challenge = challenges.getHoopsChallenge(difficulty, index);
      let answer;
      search: for (const pressTime of [0, .5, 1, 1.5, 2]) {
        for (const power of powers) {
          for (const x of directions) {
            const aim = {x, power};
            const trial = timedAttempt(challenge, aim, pressTime);
            if (!trial.shot.scored) continue;
            const runs = [1 / 30, 1 / 120, 1 / 144].map(dt => timedAttempt(challenge, aim, pressTime, dt));
            if (!runs.every(run => run.shot.scored)) continue;
            answer = {aim, pressTime, runs: [trial, ...runs]};
            break search;
          }
        }
      }
      assert.ok(answer, `${difficulty} question ${index + 1} has no keyboard-reachable moving solution`);
      for (const run of answer.runs) {
        assert.equal(run.events.filter(event => event.type === 'score').length, 1);
        assert.ok(Math.abs(run.launchTime - answer.pressTime - physics.HOOPS_RELEASE_DELAY) < 1e-9);
        assert.ok(Math.abs(run.shot.crossingHoop.x - answer.runs[0].shot.crossingHoop.x) < .025);
      }
      t.diagnostic(`press at ${answer.pressTime}s, direction ${answer.aim.x}, power ${answer.aim.power}`);
    });
  }
}
