import test from 'node:test';
import assert from 'node:assert/strict';

let ride;
try { ride = await import('../src/ride-state.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
function api() { assert.ok(ride, 'the shared ride simulation must be importable'); return ride; }
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
function emptyRide(options = {}) {
  const state = api().createRideState({mode: 'practice', ...options});
  state.opponents = []; state.obstacles = [];
  api().startRide(state);
  return state;
}
function steerTo(state, lane = 0) {
  const curve = api().rideRoadAt(state.distance).curve;
  const steering = (2 + state.speed * .1) * Math.min(1, state.speed / 8) * (state.grip ?? 1);
  return clamp((lane - state.lateral) * .8 - curve * state.speed ** 2 *
    (state.config.curveForce ?? .75) / Math.max(.1, steering), -1, 1);
}
function advance(state, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    api().stepRide(state, {throttle: 1, steer: steerTo(state), ...input}, 1 / 60);
  }
}

test('seeded race state has five independent riders, bounded obstacles and the shared API', () => {
  const engine = api();
  for (const name of ['createRideState', 'startRide', 'setRidePaused', 'stepRide', 'pushRide', 'rideRoadAt']) {
    assert.equal(typeof engine[name], 'function');
  }
  const a = engine.createRideState(), b = engine.createRideState();
  assert.deepEqual(a, b);
  assert.equal(a.phase, 'ready');
  assert.equal(a.config.raceLength, 1800);
  assert.ok(a.config.roadHalfWidth > 3 && a.config.maxSpeed > 30);
  assert.equal(a.opponents.length, 5);
  assert.ok(a.obstacles.length > 0 && a.obstacles.length <= 16);
  assert.equal(new Set(a.opponents.map(opponent => opponent.id)).size, 5);
  assert.equal(a.rank, 6);
  assert.equal(a.stamina, 1); assert.equal(a.integrity, 1);
  a.opponents[0].distance = 999;
  assert.notEqual(b.opponents[0].distance, 999);
  assert.notDeepEqual(b.obstacles, engine.createRideState({seed: 24}).obstacles);
  const invalid = engine.createRideState({difficulty: '?', mode: '?', seed: NaN});
  assert.equal(invalid.difficulty, 'standard'); assert.equal(invalid.mode, 'race');
  assert.deepEqual(invalid, engine.createRideState());
});

test('road centerline, heading and curvature agree and remain finite for invalid distances', () => {
  const {rideRoadAt} = api();
  for (const distance of [0, 75, 220, 500, 1300, 10000]) {
    const road = rideRoadAt(distance), epsilon = .01;
    const before = rideRoadAt(distance - epsilon), after = rideRoadAt(distance + epsilon);
    const slope = (after.x - before.x) / (2 * epsilon);
    assert.ok(Math.abs(Math.tan(-road.heading) - slope) < .001);
    assert.ok(Math.abs((after.heading - before.heading) / (2 * epsilon) - road.curve) < 1e-5);
    assert.ok(Object.values(road).every(Number.isFinite));
    assert.deepEqual(road, rideRoadAt(distance));
  }
  assert.notEqual(rideRoadAt(80).curve, rideRoadAt(450).curve);
  for (const distance of [NaN, Infinity, undefined]) assert.deepEqual(rideRoadAt(distance), rideRoadAt(0));
});

test('ready, paused and finished races freeze completely until a valid start/resume', () => {
  const {createRideState, startRide, setRidePaused, stepRide, pushRide} = api();
  const state = createRideState(), ready = structuredClone(state);
  stepRide(state, {throttle: 1, boost: true}, .1);
  assert.deepEqual(state, ready);
  assert.equal(pushRide(state, 1), false);
  assert.equal(startRide(state), true);
  assert.equal(startRide(state), false);
  advance(state, 1);
  setRidePaused(state, true);
  const paused = structuredClone(state);
  stepRide(state, {throttle: 1, steer: 1, boost: true}, 10);
  assert.equal(pushRide(state, -1), false);
  assert.deepEqual(state, paused);
  setRidePaused(state, false);
  stepRide(state, {throttle: 1}, .1);
  assert.ok(state.elapsed > paused.elapsed && state.distance > paused.distance);
});

test('throttle, coasting and braking affect real forward motion without steering speed bonuses', () => {
  const state = emptyRide();
  advance(state, 3);
  assert.ok(state.speed > 15 && state.distance > 20);
  const speed = state.speed;
  advance(state, 1, {throttle: 0});
  assert.ok(state.speed < speed);
  advance(state, 2, {throttle: 0, brake: 1});
  assert.ok(state.speed < 1);
  const forward = emptyRide(), diagonal = emptyRide();
  for (let i = 0; i < 60; i++) {
    api().stepRide(forward, {throttle: 1}, 1 / 60);
    api().stepRide(diagonal, {throttle: 1, steer: 1}, 1 / 60);
  }
  assert.ok(diagonal.speed <= forward.speed);
  assert.ok(diagonal.distance <= forward.distance + 1e-9);
  assert.ok(diagonal.lateral > forward.lateral);
});

test('boost is limited by stamina, cannot pulse forever at empty, and recharges when released', () => {
  const boosted = emptyRide(), normal = emptyRide();
  advance(boosted, 4);
  advance(normal, 4);
  advance(boosted, 3, {boost: true});
  advance(normal, 3);
  assert.ok(boosted.speed > normal.speed && boosted.distance > normal.distance);
  assert.ok(boosted.stamina < .5);
  advance(boosted, 4, {boost: true});
  assert.equal(boosted.stamina, 0);
  assert.ok(boosted.speed <= boosted.config.maxSpeed);
  advance(boosted, 9);
  assert.ok(boosted.stamina > .95);
  assert.ok(boosted.speed > 20);
});

test('steering respects road bounds and the guardrail cannot trap the rider', () => {
  const state = emptyRide();
  advance(state, 3);
  advance(state, 8, {steer: 1});
  assert.ok(Math.abs(state.lateral) <= state.config.roadHalfWidth);
  assert.ok(state.impacts > 0);
  const distance = state.distance;
  advance(state, 3, {steer: -1});
  assert.ok(state.distance > distance + 10);
  assert.ok(state.lateral < state.config.roadHalfWidth - .5);
  assert.ok(state.integrity >= 0 && state.integrity <= 1);
});

function nearbyRide() {
  const state = api().createRideState();
  api().startRide(state);
  state.distance = 100; state.speed = 25;
  state.obstacles = [];
  state.opponents.forEach((opponent, i) => {
    opponent.distance = 160 + i * 20; opponent.lateral = -2 + i; opponent.speed = 25;
  });
  return state;
}

test('side push requires the correct side, proximity, energy and cooldown; it really slows a rival', () => {
  const {pushRide, stepRide} = api();
  const state = nearbyRide(), rival = state.opponents[0];
  rival.distance = 102; rival.lateral = 1.2;
  const original = structuredClone(state);
  for (const side of [-1, 0, NaN, '1']) assert.equal(pushRide(state, side), false);
  assert.deepEqual(state, original);
  assert.equal(pushRide(state, 1), true);
  assert.ok(rival.lateral > 1.2 && rival.speed < 25 && rival.stunned > 0);
  assert.ok(state.stamina < 1 && state.attackTime > 0 && state.attackSide === 1);
  assert.equal(state.events.at(-1).type, 'push');
  assert.equal(pushRide(state, 1), false);
  stepRide(state, {throttle: 1}, .1);
  assert.ok(!state.events.some(event => event.type === 'push'), 'events only survive their own step');
  const far = nearbyRide();
  far.opponents[0].distance = 107; far.opponents[0].lateral = 1;
  assert.equal(pushRide(far, 1), false);
  far.opponents[0].distance = 100; far.opponents[0].lateral = 3;
  assert.equal(pushRide(far, 1), false);
  far.opponents[0].lateral = 1; far.stamina = 0;
  assert.equal(pushRide(far, 1), false);
});

test('push animation and rival stun recover, allowing a later hit on the left', () => {
  const state = nearbyRide(), rival = state.opponents[0];
  rival.distance = 101; rival.lateral = 1.2;
  assert.equal(api().pushRide(state, 1), true);
  advance(state, 3.3);
  assert.equal(state.attackTime, 0);
  assert.equal(state.attackSide, 0);
  assert.equal(rival.stunned, 0);
  rival.distance = state.distance + 1; rival.lateral = state.lateral - 1.2;
  const lateral = rival.lateral;
  assert.equal(api().pushRide(state, -1), true);
  assert.equal(state.attackSide, -1);
  assert.ok(rival.lateral < lateral);
});

test('swept obstacle impacts slow and destabilize once during the collision cooldown', () => {
  const state = emptyRide();
  state.distance = 48; state.speed = 35; state.lateral = 0;
  state.obstacles = [{id: 'near', distance: 50, lateral: 0, type: 'barrier'}];
  api().stepRide(state, {throttle: 1}, .1);
  assert.equal(state.impacts, 1);
  assert.ok(state.speed < 30 && state.recovery > 0 && state.integrity < 1);
  assert.ok(state.events.some(event => event.type === 'impact'));
  state.obstacles.push({id: 'second', distance: state.distance + .2, lateral: state.lateral, type: 'cone'});
  api().stepRide(state, {throttle: 1}, .1);
  assert.equal(state.impacts, 1);
  assert.ok(!state.events.some(event => event.type === 'impact'));
  state.obstacles = [];
  advance(state, 4);
  assert.equal(state.recovery, 0);
  assert.ok(state.speed > 20);
});

test('nearby riders collide only when their actual lateral paths overlap', () => {
  const hit = nearbyRide(), miss = nearbyRide();
  for (const state of [hit, miss]) state.opponents[0].distance = 101;
  hit.opponents[0].lateral = 0;
  miss.opponents[0].lateral = 2.5;
  api().stepRide(hit, {throttle: 1}, .05);
  api().stepRide(miss, {throttle: 1}, .05);
  assert.equal(hit.impacts, 1);
  assert.equal(miss.impacts, 0);
});

test('even a fully damaged rider recovers without death or a permanent zero-speed state', () => {
  const state = emptyRide();
  state.integrity = .01; state.speed = 30; state.distance = 10;
  state.obstacles = [{id: 'crash', distance: 11, lateral: 0, type: 'barrier'}];
  api().stepRide(state, {throttle: 1}, .1);
  assert.ok(state.recovery > 1);
  state.obstacles = [];
  const distance = state.distance;
  advance(state, 8);
  assert.equal(state.phase, 'running');
  assert.ok(state.distance > distance + 80 && state.speed > 20);
  assert.ok(state.integrity > .1);
});

test('passing a rival updates rank and counts an overtake once, independent of rendered frames', () => {
  const state = nearbyRide();
  state.opponents[0].distance = 101; state.opponents[0].lateral = 2;
  state.opponents[0].speed = 0; state.opponents[0].stunned = 2;
  api().stepRide(state, {throttle: 1}, .2);
  assert.equal(state.overtakes, 1);
  assert.equal(state.rank, 5);
  assert.ok(state.events.some(event => event.type === 'overtake'));
  api().stepRide(state, {throttle: 1}, .1);
  assert.equal(state.overtakes, 1);
  assert.ok(!state.events.some(event => event.type === 'overtake'));
});

test('finish rank respects earlier finishers and fractional crossing order, then freezes forever', () => {
  const state = nearbyRide();
  state.distance = 1799; state.speed = 40;
  const distances = [1800, 1799.6, 1798, 1700, 1650];
  state.opponents.forEach((opponent, i) => {
    opponent.distance = distances[i]; opponent.speed = 38;
    opponent.lateral = [-2.8, -1.4, 1.4, 2.8, 3.7][i];
  });
  api().stepRide(state, {throttle: 1, boost: true}, .1);
  assert.equal(state.phase, 'finished');
  assert.equal(state.distance, 1800);
  assert.equal(state.rank, 3);
  assert.equal(state.events.filter(event => event.type === 'finish').length, 1);
  const frozen = structuredClone(state);
  api().stepRide(state, {throttle: 1}, 1);
  api().setRidePaused(state, true);
  assert.equal(api().pushRide(state, 1), false);
  assert.deepEqual(state, frozen);
});

function drive(state) {
  let lane = -1.8;
  const obstacle = state.obstacles.find(item => item.distance > state.distance &&
    item.distance < state.distance + 28 && Math.abs(item.lateral - lane) < 1.3);
  if (obstacle) lane = 1.8;
  return {throttle: 1, steer: steerTo(state, lane), boost: state.elapsed % 11 < 4};
}

for (const difficulty of ['easy', 'standard', 'hard']) {
  test(`${difficulty}: a full 1.8km race finishes through real driving against five active opponents`, () => {
    const state = api().createRideState({difficulty});
    api().startRide(state);
    for (let i = 0; i < 9000 && state.phase === 'running'; i++) api().stepRide(state, drive(state), 1 / 60);
    assert.equal(state.phase, 'finished');
    assert.equal(state.distance, 1800);
    assert.ok(state.rank >= 1 && state.rank <= 6);
    // Easy riders intentionally cruise more slowly than a boosted player.
    assert.ok(state.opponents.every(opponent => opponent.distance > 1000));
    assert.ok(state.elapsed < 150);
    assert.ok(state.overtakes > 0);
    if (difficulty === 'easy') assert.equal(state.rank, 1, 'a clean paced ride must be able to win');
  });
}

test('practice continues beyond the finish with bounded road objects and five recycled opponents', () => {
  const state = api().createRideState({mode: 'practice'});
  api().startRide(state);
  for (let i = 0; i < 10800; i++) api().stepRide(state, drive(state), 1 / 60);
  assert.equal(state.phase, 'running');
  assert.ok(state.distance > 3500);
  assert.ok(state.obstacles.length <= 16 && state.events.length <= 32);
  assert.equal(state.opponents.length, 5);
  assert.ok(state.opponents.every(opponent => Math.abs(opponent.distance - state.distance) <= 250));
});

test('fixed simulation and accumulated events agree across 30/60 Hz render grouping', () => {
  const a = api().createRideState(), b = api().createRideState(), eventsA = [], eventsB = [];
  api().startRide(a); api().startRide(b);
  const input = {throttle: 1, steer: .1, boost: true};
  for (let i = 0; i < 300; i++) {api().stepRide(a, input, 1 / 60); eventsA.push(...a.events);}
  for (let i = 0; i < 150; i++) {api().stepRide(b, input, 1 / 30); eventsB.push(...b.events);}
  const publicState = state => {const {_sim, events, ...rest} = state; return rest;};
  assert.deepEqual(publicState(a), publicState(b));
  assert.deepEqual(eventsA, eventsB);
});

test('invalid dt is inert and malformed controls remain finite and within physical limits', () => {
  const state = emptyRide(), frozen = structuredClone(state);
  for (const dt of [0, -1, NaN, Infinity]) api().stepRide(state, {throttle: 1}, dt);
  assert.deepEqual(state, frozen);
  for (const input of [null, {}, {steer: NaN, throttle: Infinity, brake: 'bad', boost: 'yes'},
    {steer: 100, throttle: 100, brake: -10}]) api().stepRide(state, input, .1);
  for (const key of ['speed', 'distance', 'elapsed', 'lateral', 'lean', 'stamina', 'integrity']) {
    assert.ok(Number.isFinite(state[key]));
  }
  assert.ok(state.speed >= 0 && state.speed <= state.config.maxSpeed);
  assert.ok(state.stamina >= 0 && state.stamina <= 1 && state.integrity >= 0 && state.integrity <= 1);
});

test('a deliberate nearby push knocks a computer rider down for three seconds, then it remounts', () => {
  const state = nearbyRide(), rival = state.opponents[0];
  rival.distance = 101; rival.lateral = 1.2;
  const start = rival.distance;
  assert.equal(api().pushRide(state, 1), true);
  assert.equal(rival.fallTime, 3);
  assert.equal(rival.fallSide, 1);
  assert.equal(rival.fallProgress, 0);
  assert.equal(state.knockdowns, 1);
  assert.ok(state.events.some(event => event.type === 'knockdown' && event.targetId === rival.id));
  advance(state, 1);
  assert.ok(rival.fallTime > 1.9 && rival.fallTime < 2.1);
  assert.ok(rival.fallProgress > .3 && rival.fallProgress < .35);
  assert.ok(rival.distance < start + 4 && rival.speed < 1, 'the fallen bicycle cannot keep racing forward');
  api().setRidePaused(state, true);
  const frozen = structuredClone(state);
  api().stepRide(state, {throttle: 1}, 1);
  assert.deepEqual(state, frozen);
  api().setRidePaused(state, false);
  advance(state, 2.2);
  assert.equal(rival.fallTime, 0);
  assert.equal(rival.fallProgress, 1);
  assert.ok(rival.speed > 0);
});

test('a fast closing side collision can unseat a rival; gentle shoulder contact cannot', () => {
  const fast = nearbyRide(), gentle = nearbyRide();
  for (const state of [fast, gentle]) {
    state.opponents[0].distance = 101;
    state.opponents[0].lateral = .6;
    state.opponents[0].speed = state === fast ? 14 : 25;
    api().stepRide(state, {throttle: 1}, .05);
  }
  assert.ok(fast.opponents[0].fallTime > 2.8);
  assert.equal(fast.knockdowns, 1);
  assert.equal(gentle.opponents[0].fallTime, 0);
});

function counterPushFixture(lateral = 1.2, gap = 1) {
  const state = nearbyRide(), rival = state.opponents[0];
  state.elapsed = 10; state.distance = 250; state.speed = 32;
  state.opponents.forEach((opponent, i) => {opponent.distance = 350 + i * 15;});
  rival.distance = state.distance + gap; rival.lateral = lateral; rival.speed = 32;
  return {state, rival};
}

test('AI counterpush gives a spatially valid warning, knocks down once and respects recovery/cooldown', () => {
  const {state, rival} = counterPushFixture();
  api().stepRide(state, {throttle: 1, steer: steerTo(state)}, .05);
  assert.ok(rival.attackWindup >= .7, 'a visible windup precedes any knockdown');
  assert.equal(state.fallTime, 0);
  assert.ok(state.events.some(event => event.type === 'rival-windup'));
  advance(state, 1);
  assert.ok(state.fallTime > 2.5);
  assert.equal(state.falls, 1);
  assert.ok(rival.pushCooldown > 4);
  const distance = state.distance;
  advance(state, 2);
  assert.ok(state.distance < distance + 4);
  advance(state, 1.3);
  assert.equal(state.fallTime, 0);
  assert.equal(state.falls, 1);
  assert.equal(state.phase, 'running', 'standard-mode falls always allow automatic remount');
  assert.ok(state.speed > 0);
});

test('moving clear during an AI windup avoids the push, and distant rivals never warn or hit', () => {
  const escape = counterPushFixture();
  api().stepRide(escape.state, {throttle: 1, steer: steerTo(escape.state)}, .05);
  assert.ok(escape.rival.attackWindup > 0);
  advance(escape.state, 1, {steer: -1, brake: .4});
  assert.equal(escape.state.falls, 0);
  for (const [lateral, gap] of [[3, 1], [1.2, 12]]) {
    const {state, rival} = counterPushFixture(lateral, gap);
    api().stepRide(state, {throttle: 1, steer: steerTo(state)}, .1);
    assert.equal(rival.attackWindup, 0);
    assert.equal(state.falls, 0);
  }
  const cooldown = counterPushFixture();
  cooldown.rival.pushCooldown = 5;
  api().stepRide(cooldown.state, {throttle: 1, steer: steerTo(cooldown.state)}, .1);
  assert.equal(cooldown.rival.attackWindup, 0);
  assert.equal(cooldown.state.falls, 0);
});

test('standard and hard obstacle rows leave usable corridors and a gentle first four seconds', () => {
  for (const difficulty of ['standard', 'hard']) for (const seed of [1, 13, 24]) {
    const state = api().createRideState({difficulty, seed});
    assert.ok(state.obstacles.every(item => item.distance >= 120));
    const rows = new Map();
    for (const item of state.obstacles) {
      if (!rows.has(item.distance)) rows.set(item.distance, []);
      rows.get(item.distance).push(item);
    }
    let previous;
    for (const [distance, row] of rows) {
      if (previous !== undefined) assert.ok(distance - previous >= 30 && distance - previous <= 55);
      previous = distance;
      const safe = [-2.6, 0, 2.6].filter(lane => row.every(item =>
        Math.abs(lane - item.lateral) > (item.type === 'barrier' ? 1.15 : .62) + .25));
      assert.ok(safe.length, 'every row has at least one bike-width corridor with clearance');
    }
    assert.ok(state.obstacles.some(item => Math.abs(item.lateral) < .2), 'center cannot be an always-safe motorway');
    api().startRide(state);
    for (let i = 0; i < 240; i++) api().stepRide(state, {throttle: 1}, 1 / 60);
    assert.equal(state.impacts, 0);
    assert.equal(state.falls, 0);
  }
});

test('slowing for a bend restores grip and reduces outward drift instead of reversing steering', () => {
  const fast = emptyRide({mode: 'race'}), braked = emptyRide({mode: 'race'});
  for (const state of [fast, braked]) {
    state.distance = 1460; state.speed = 42; state.obstacles = [];
  }
  let minimumFastGrip = 1, minimumSlowGrip = 1, fastDrift = 0, slowDrift = 0;
  for (let i = 0; i < 90; i++) {
    api().stepRide(fast, {throttle: 1, boost: true}, 1 / 60);
    api().stepRide(braked, {throttle: 1, brake: .8}, 1 / 60);
    minimumFastGrip = Math.min(minimumFastGrip, fast.grip);
    minimumSlowGrip = Math.min(minimumSlowGrip, braked.grip);
    fastDrift = Math.max(fastDrift, Math.abs(fast.lateral));
    slowDrift = Math.max(slowDrift, Math.abs(braked.lateral));
  }
  assert.ok(minimumFastGrip < .98);
  assert.ok(braked.grip > fast.grip);
  assert.ok(slowDrift < fastDrift);
  assert.ok(minimumSlowGrip >= minimumFastGrip);
});

test('automatic throttle without steering or boost cannot earn the standard podium', () => {
  const state = api().createRideState();
  api().startRide(state);
  for (let frame = 0; frame < 18000 && state.phase === 'running'; frame++) {
    api().stepRide(state, {throttle: 1}, 1 / 60);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.goalRank, 3);
  assert.notEqual(state.resultReason, 'podium');
  assert.ok(state.rank > 3 || state.resultReason === 'crash');
});

test('knockdown timing and events are identical across render frame sizes', () => {
  const a = nearbyRide(), b = nearbyRide();
  for (const state of [a, b]) {
    state.opponents[0].distance = 101; state.opponents[0].lateral = 1.2;
    api().pushRide(state, 1);
  }
  const eventsA = [...a.events], eventsB = [...b.events];
  for (let i = 0; i < 240; i++) {api().stepRide(a, {throttle: 1}, 1 / 60); eventsA.push(...a.events);}
  for (let i = 0; i < 120; i++) {api().stepRide(b, {throttle: 1}, 1 / 30); eventsB.push(...b.events);}
  const snapshot = state => {const {_sim, events, ...rest} = state; return rest;};
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.deepEqual(eventsA, eventsB);
  assert.equal(a.opponents[0].fallTime, 0);
});

// A driver reads the visible road/riders, chooses a gap, uses three-second
// sprint windows, and taps a side push only in range. It never edits state.
function podiumDrive(state) {
  const nearby = state.obstacles.filter(item => item.distance > state.distance - 2 && item.distance < state.distance + 45);
  const row = nearby.filter(item => item.distance === nearby[0]?.distance);
  const cost = lane => Math.abs(lane - state.lateral) * .4 +
    row.reduce((sum, item) => sum + (Math.abs(lane - item.lateral) < (item.type === 'barrier' ? 1.5 : 1) ? 20 : 0), 0) +
    state.opponents.reduce((sum, rider) => sum + (rider.fallTime === 0 &&
      Math.abs(rider.distance - state.distance) < 6 && Math.abs(lane - rider.lateral) < .9 ? 4 : 0), 0);
  const lane = [-2.8, -1.4, 0, 1.4, 2.8].sort((a, b) => cost(a) - cost(b))[0];
  const curve = api().rideRoadAt(state.distance).curve;
  const rate = (2 + state.speed * .1) * Math.min(1, state.speed / 8) * state.grip;
  const steer = clamp((lane - state.lateral) * 1.1 -
    curve * state.speed ** 2 * state.config.curveForce / Math.max(.1, rate), -1, 1);
  let aheadCurve = 0;
  for (let offset = 0; offset <= 40; offset += 10) {
    aheadCurve = Math.max(aheadCurve, Math.abs(api().rideRoadAt(state.distance + offset).curve));
  }
  const safeSpeed = Math.sqrt(state.config.gripLimit / Math.max(.00001, aheadCurve));
  for (const rider of state.opponents) if (Math.abs(rider.distance - state.distance) < 3.2 &&
    Math.abs(rider.lateral - state.lateral) > .35) api().pushRide(state, Math.sign(rider.lateral - state.lateral));
  return {throttle: 1, steer: Math.round(steer * 4) / 4,
    brake: clamp((state.speed - safeSpeed + .3) / 16, 0, .55),
    boost: state.elapsed % 10 < 3 && aheadCurve < .0027};
}

for (const difficulty of ['standard', 'hard']) for (const seed of [13, 24, 99]) {
  test(`${difficulty} seed ${seed}: real gap selection, paced boost and nearby pushes can earn the podium`, () => {
    const state = api().createRideState({difficulty, seed});
    api().startRide(state);
    for (let frame = 0; frame < 12000 && state.phase === 'running'; frame++) {
      api().stepRide(state, podiumDrive(state), 1 / 60);
    }
    assert.equal(state.distance, 1800);
    assert.equal(state.resultReason, 'podium');
    assert.ok(state.rank <= 3);
    assert.ok(state.knockdowns >= 1);
    assert.ok(state.falls <= 2, 'clean planned driving should not require suffering repeated crashes');
    assert.ok(state.elapsed < 80);
  });
}
