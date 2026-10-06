import test from 'node:test';
import assert from 'node:assert/strict';
import * as physics from '../src/hoops-physics.js';

const {HOOP, BALL_START, BALL_RADIUS, createShot, stepShot, predictTrajectory, velocityFromAim} = physics;
const close = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('custom shot origins are copied and validated without changing legacy origins', () => {
  const origin = {x: 2, y: 1.8, z: -1};
  const velocity = {x: -2, y: 8, z: -1};
  const shot = createShot(velocity, {origin});
  assert.deepEqual(shot.position, origin);
  assert.notEqual(shot.position, origin);
  origin.x = 100; velocity.x = 100;
  assert.equal(shot.position.x, 2);
  assert.equal(shot.velocity.x, -2);
  const invalid = createShot({x: 0, y: 8, z: -5}, {origin: {x: NaN, y: Infinity, z: undefined}});
  assert.deepEqual(invalid.position, BALL_START);
  assert.deepEqual(createShot({x: 0, y: 8, z: -5}).position, BALL_START);
});

test('predictions begin at the custom origin and match the actual flight without mutating it', () => {
  const origin = {x: 3, y: 1.45, z: 3};
  const velocity = {x: -2.5, y: 8.7, z: -5}, options = {origin, wind: {x: .2}, maxTime: 1.4};
  const points = predictTrajectory(velocity, HOOP, options);
  assert.deepEqual(points[0], origin);
  const shot = createShot(velocity, options);
  for (let index = 1; index < points.length; index++) {
    stepShot(shot, .05);
    assert.deepEqual(points[index], shot.position);
  }
  assert.deepEqual(origin, {x: 3, y: 1.45, z: 3});
  assert.deepEqual(points, predictTrajectory(velocity, HOOP, options));
});

test('court player starts independently and frames local -Z toward the target from either side', () => {
  assert.equal(typeof physics.createCourtPlayer, 'function');
  const player = physics.createCourtPlayer();
  assert.deepEqual(player, {x: 0, z: 5.6});
  player.x = 1;
  assert.deepEqual(physics.createCourtPlayer(), {x: 0, z: 5.6});
  for (const [position, yaw] of [[{x: 0, z: 5.6}, 0], [{x: -4, z: -3}, -Math.PI / 2],
    [{x: 4, z: -3}, Math.PI / 2], [{x: 0, z: -5}, Math.PI]]) {
    const frame = physics.courtFrame(position);
    assert.deepEqual(frame.origin, {...position, y: BALL_START.y});
    close(Math.sin(frame.yaw), Math.sin(yaw));
    close(Math.cos(frame.yaw), Math.cos(yaw));
  }
  assert.ok(Number.isFinite(physics.courtFrame({x: HOOP.x, z: HOOP.z}).yaw));
});

test('walking uses hoop-relative axes at 2.5m/s and diagonal movement is normalized', () => {
  assert.equal(typeof physics.stepCourtPlayer, 'function');
  const forward = physics.createCourtPlayer(), diagonal = physics.createCourtPlayer();
  physics.stepCourtPlayer(forward, {forward: 1}, .1);
  physics.stepCourtPlayer(diagonal, {forward: 1, right: 1}, .1);
  close(forward.z, 5.35);
  close(forward.x, 0);
  assert.ok(diagonal.x > 0 && diagonal.z < 5.6);
  assert.ok(Math.hypot(diagonal.x, diagonal.z - 5.6) <= .25 + 1e-8);
  assert.ok(Math.hypot(diagonal.x, diagonal.z - 5.6) > .245);
  const side = {x: 4, z: -3};
  physics.stepCourtPlayer(side, {forward: 1}, .1);
  close(side.x, 3.75); close(side.z, -3);
  const behind = {x: 0, z: -5.2};
  physics.stepCourtPlayer(behind, {right: 1}, .1);
  assert.ok(behind.x < 0, 'right reverses in world space when facing from behind the basket');
});

test('pause/invalid dt rejects movement and nonfinite controls never poison a valid position', () => {
  assert.equal(typeof physics.stepCourtPlayer, 'function');
  const player = physics.createCourtPlayer(), before = {...player};
  for (const dt of [0, -1, NaN, Infinity]) {
    physics.stepCourtPlayer(player, {forward: 1, right: 1}, dt);
    assert.deepEqual(player, before);
  }
  physics.stepCourtPlayer(player, {forward: NaN, right: Infinity}, .1);
  assert.deepEqual(player, before);
  const invalid = physics.courtFrame({x: NaN, z: Infinity});
  assert.deepEqual(invalid.origin, BALL_START);
});

test('court aim rotates right/left locally, remains finite, and does not secretly set power by distance', () => {
  assert.equal(typeof physics.velocityFromCourtAim, 'function');
  const near = {x: 0, z: 0}, far = {x: 0, z: 8.2};
  const center = physics.velocityFromCourtAim({x: 0, power: .6}, near);
  const right = physics.velocityFromCourtAim({x: 1, power: .6}, near);
  const left = physics.velocityFromCourtAim({x: -1, power: .6}, near);
  assert.ok(right.x > 0 && left.x < 0 && center.z < 0);
  close(Math.atan2(right.x, -right.z), .7);
  close(Math.atan2(left.x, -left.z), -.7);
  assert.deepEqual(center, physics.velocityFromCourtAim({x: 0, power: .6}, far));
  for (const aim of [{x: NaN, power: Infinity}, {x: 99, power: -5}, {}]) {
    assert.ok(Object.values(physics.velocityFromCourtAim(aim, near)).every(Number.isFinite));
  }
});

test('the backboard also reflects balls arriving from behind the hoop', () => {
  const shot = createShot({x: 0, y: 0, z: 5});
  shot.position = {x: HOOP.x, y: 4, z: HOOP.z - .62 - BALL_RADIUS - .01};
  const events = stepShot(shot, 1 / 60);
  assert.equal(shot.touchedBoard, true);
  assert.ok(shot.velocity.z < 0);
  assert.equal(shot.scored, false);
  assert.ok(events.some(event => event.type === 'board'));
});

test('close court shots cannot enter the backboard through its lower or side edge', () => {
  const under = createShot({x: 0, y: 3, z: 0});
  under.position = {x: 0, y: HOOP.y - .1 - BALL_RADIUS - .01, z: HOOP.z - .62};
  stepShot(under, 1 / 60);
  assert.equal(under.touchedBoard, true);
  assert.ok(under.velocity.y < 0, 'a ball launched under the board must bounce off its underside');
  const side = createShot({x: -3, y: 0, z: 0});
  side.position = {x: HOOP.x + .95 + BALL_RADIUS + .01, y: 4, z: HOOP.z - .62};
  stepShot(side, 1 / 60);
  assert.equal(side.touchedBoard, true);
  assert.ok(side.velocity.x > 0);
  assert.equal(under.scored || side.scored, false);
});

test('walking clamps all court boundaries, repairs invalid positions and stays outside the pole', () => {
  const {minX, maxX, minZ, maxZ} = physics.COURT_BOUNDS;
  assert.deepEqual([minX, maxX, minZ, maxZ], [-5.3, 5.3, -5.3, 8.2]);
  for (const start of [{x: -5.3, z: -5.3}, {x: 5.3, z: 8.2}, {x: NaN, z: Infinity},
    {x: 20, z: -20}, {x: 0, z: -4.13}]) {
    const player = {...start};
    for (const input of [{forward: 1}, {forward: -1}, {right: 1}, {right: -1},
      {forward: 1, right: 1}, {forward: -1, right: -1}]) {
      for (let i = 0; i < 120; i++) {
        physics.stepCourtPlayer(player, input, 1 / 30);
        assert.ok(player.x >= minX && player.x <= maxX);
        assert.ok(player.z >= minZ && player.z <= maxZ);
        assert.ok(Math.hypot(player.x, player.z + 4.13) >= .7 - 1e-9);
      }
    }
  }
  const behind = {x: 0, z: -5.3};
  physics.stepCourtPlayer(behind, {forward: 1}, 1);
  assert.ok(behind.z < -4.13, 'a long update cannot teleport through the pole');
  assert.ok(Math.hypot(behind.x, behind.z + 4.13) >= .7 - 1e-9);
});

test('control magnitudes clamp, movement ignores height and diagonal travel is not frame-rate driven', () => {
  const large = physics.createCourtPlayer(), normal = physics.createCourtPlayer();
  physics.stepCourtPlayer(large, {forward: 99, right: 99}, .1);
  physics.stepCourtPlayer(normal, {forward: 1, right: 1}, .1);
  assert.deepEqual(large, normal);
  const a = physics.createCourtPlayer(), b = physics.createCourtPlayer();
  for (let i = 0; i < 90; i++) physics.stepCourtPlayer(a, {forward: 1, right: 1}, 1 / 30);
  for (let i = 0; i < 432; i++) physics.stepCourtPlayer(b, {forward: 1, right: 1}, 1 / 144);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < .02);
  const frame = physics.courtFrame({x: 2, z: 1, y: 50}, {...HOOP, y: 100});
  assert.equal(frame.origin.y, BALL_START.y);
  const frozen = {...normal};
  assert.equal(physics.stepCourtPlayer(normal, {}, 1 / 60), false);
  assert.deepEqual(normal, frozen);
});

test('walking up to the hoop does not oscillate across its undefined facing direction', () => {
  const player = {x: 0, z: -2.95};
  for (let i = 0; i < 120; i++) physics.stepCourtPlayer(player, {forward: 1}, 1 / 60);
  assert.equal(player.x, HOOP.x);
  assert.equal(player.z, HOOP.z);
  const next = {...player};
  physics.stepCourtPlayer(player, {forward: 1}, 1 / 30);
  assert.deepEqual(player, next);
  physics.stepCourtPlayer(player, {forward: -1}, .1);
  assert.ok(player.z > HOOP.z, 'the player can walk away again');
});

test('a released ball and its preview retain their world origin when the player moves away', () => {
  const player = {x: 3, z: 2};
  const {origin} = physics.courtFrame(player);
  const velocity = physics.velocityFromCourtAim({x: 0, power: .5}, player);
  const predicted = predictTrajectory(velocity, HOOP, {origin});
  const shot = createShot(velocity, {origin});
  physics.stepCourtPlayer(player, {right: 1}, .1);
  origin.x = -500; origin.z = 500;
  stepShot(shot, .05);
  assert.deepEqual(shot.position, predicted[1]);
  close(shot.position.x, 3 + velocity.x * .05);
  close(shot.position.z, 2 + velocity.z * .05);
});

function shootFrom(player, aim, dt = 1 / 60) {
  const {origin} = physics.courtFrame(player);
  const shot = createShot(physics.velocityFromCourtAim(aim, player), {origin});
  const events = [];
  for (let frame = 0; frame < Math.ceil(6 / dt) && !shot.done; frame++) {
    events.push(...stepShot(shot, dt));
  }
  return {shot, events};
}

// Real button increments, actual gravity and all rim/board contacts. Only test
// search chooses power; production court velocity never uses target distance.
const powers = Array.from({length: 39}, (_, i) => Number((.05 + i * .025).toFixed(3)));
const directions = [0, .06, -.06, .12, -.12, .18, -.18, .24, -.24];
for (const [name, player] of [
  ['under the rim', {x: 0, z: -3}],
  ['one metre in front', {x: 0, z: -2}],
  ['near the left side', {x: -1, z: -3}],
  ['the right side', {x: 4, z: -3}],
  ['the default spot', {x: 0, z: 5.6}],
  ['the rear court line', {x: 0, z: 8.2}],
  ['the far left corner', {x: -5.3, z: 8.2}],
  ['the far right corner', {x: 5.3, z: 8.2}],
  ['behind the basket', {x: 0, z: -5.3}],
  ['behind and beside the board', {x: 1.3, z: -4.6}],
  ['the left baseline corner', {x: -5.3, z: -5.3}],
  ['fourteen metres away', {x: 0, z: 11}],
]) {
  test(`a real keyboard-reachable court shot scores from ${name}`, t => {
    let answer;
    search: for (const power of powers) for (const x of directions) {
      const aim = {x, power}, first = shootFrom(player, aim);
      if (!first.shot.scored) continue;
      const runs = [1 / 30, 1 / 120, 1 / 144].map(dt => shootFrom(player, aim, dt));
      if (runs.every(run => run.shot.scored)) {answer = {aim, runs: [first, ...runs]}; break search;}
    }
    assert.ok(answer, `${name} needs a real reachable make, not an automatic hit`);
    for (const {shot, events} of answer.runs) {
      assert.equal(events.filter(event => event.type === 'score').length, 1);
      assert.ok(shot.crossing);
      assert.equal(shot.done, true);
    }
    t.diagnostic(`direction ${answer.aim.x}, power ${answer.aim.power}`);
  });
}

test('underpowered and strongly off-axis court shots miss instead of being snapped to the basket', () => {
  const player = {x: 0, z: 8.2};
  assert.equal(shootFrom(player, {x: 0, power: .05}).shot.scored, false);
  assert.equal(shootFrom(player, {x: 1, power: .8}).shot.scored, false);
});

test('legacy trajectories and fixed launch calibration still use their original physics', () => {
  const velocity = velocityFromAim({x: 0, power: .6});
  const implicit = createShot(velocity), explicit = createShot(velocity, {origin: BALL_START});
  for (let i = 0; i < 300 && !implicit.done; i++) {
    assert.deepEqual(stepShot(implicit, 1 / 60), stepShot(explicit, 1 / 60));
  }
  assert.deepEqual(implicit, explicit);
  assert.equal(implicit.scored, true);
  assert.equal(implicit.touchedRim, false);
});
