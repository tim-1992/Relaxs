import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDiveState, startDive, setDivePaused, stepDive, lookDive, surfaceDive, restartDive,
  diveFloorAt, diveTargetAt, diveWildlifeAt, DIVE_REEF_SITES, DIVE_TARGETS, divePhotoCandidate, takeDivePhoto,
} from '../src/dive-state.js';

const run = (state, input, seconds, rate = 60) => {
  for (let i = 0; i < seconds * rate; i++) stepDive(state, input, 1 / rate);
};
function aimAt(state, id, distance = {turtle:6,ray:8,arch:10,wreck:10}[id]) {
  const target = diveTargetAt(id, state.elapsed);
  state.position = {x:target.x, y:target.y, z:target.z + distance};
  state.position.y = Math.max(state.position.y, diveFloorAt(state.position.x, state.position.z) + 1.15);
  state.yaw = 0; state.pitch = Math.atan2(target.y - state.position.y, distance);
}

test('the opening swim is composed at four metres with a nearby turtle ready to frame', () => {
  const state = createDiveState(), target = diveTargetAt('turtle', 0);
  assert.equal(state.position.y, -4);
  const distance = Math.hypot(target.x - state.position.x, target.y - state.position.y, target.z - state.position.z);
  assert.ok(distance >= 6 && distance <= 8);
  assert.equal(state.discoveries.length, 0, 'a composed opening never awards an automatic discovery');
  startDive(state);
  assert.equal(divePhotoCandidate(state, {aspect:.64})?.id, 'turtle', 'the opening fits a portrait camera too');
  assert.equal(takeDivePhoto(state, {aspect:.64}).ok, true);
});

test('close-up fragments and off-screen subjects do not count as a complete photograph', () => {
  const state = createDiveState(); startDive(state);
  aimAt(state, 'turtle', 1.2);
  assert.equal(divePhotoCandidate(state, {aspect:.64}), null);
  aimAt(state, 'arch', 8);
  assert.equal(divePhotoCandidate(state, {aspect:.5}), null, 'portrait framing needs room for the arch');
  aimAt(state, 'arch', 15);
  assert.equal(divePhotoCandidate(state, {aspect:.5})?.id, 'arch');
  state.yaw += .7;
  assert.equal(divePhotoCandidate(state, {aspect:1.6}), null);
});

test('ready and paused dives do not advance movement, wildlife or the photo cooldown', () => {
  const state = createDiveState(), ready = structuredClone(state);
  stepDive(state, {forward:1}, 1);
  assert.deepEqual(state, ready);
  startDive(state); run(state, {forward:1}, 1);
  setDivePaused(state, true);
  const paused = structuredClone(state);
  run(state, {forward:1, rise:1}, 10);
  lookDive(state, 1, 1);
  assert.deepEqual(state, paused);
  assert.equal(takeDivePhoto(state).ok, false);
  setDivePaused(state, false);
  run(state, {}, 1);
  assert.ok(state.elapsed < 2.01, 'paused wall time is not consumed on resume');
});

test('swimming is bounded above the seabed, below the surface and inside the reef', () => {
  const state = createDiveState(); startDive(state);
  run(state, {rise:1}, 10);
  assert.ok(state.position.y <= -.8);
  run(state, {forward:1, strafe:1, rise:-1}, 100);
  assert.ok(Math.abs(state.position.x) <= 44);
  assert.ok(state.position.z >= -60 && state.position.z <= 28);
  assert.ok(state.position.y >= diveFloorAt(state.position.x, state.position.z) + 1);
  assert.ok(state.position.y <= -.8);
  const before = structuredClone(state.position);
  stepDive(state, {forward:NaN, strafe:Infinity, rise:'wrong'}, NaN);
  assert.deepEqual(state.position, before);
  stepDive(state, {forward:1}, 100);
  assert.ok(Math.hypot(state.position.x - before.x, state.position.z - before.z) < 1,
    'a stalled frame cannot teleport across the reef');
});

test('diagonal swimming has no speed advantage and fine/coarse frame steps agree', () => {
  const straight = createDiveState(), diagonal = createDiveState();
  // Compare free swimming above the raised reef, without a seabed collision changing the path.
  for (const state of [straight,diagonal]) {state.position.y = -2; state.pitch = 0;}
  startDive(straight); startDive(diagonal);
  run(straight, {forward:1}, 2);
  run(diagonal, {forward:1, strafe:1}, 2);
  assert.ok(Math.abs(Math.hypot(diagonal.position.x, diagonal.position.y + 2, diagonal.position.z - 3) -
    Math.hypot(straight.position.x, straight.position.y + 2, straight.position.z - 3)) < .001);
  const a = createDiveState(), b = createDiveState();
  startDive(a); startDive(b);
  run(a, {forward:.8, strafe:.3, rise:-.2, lookX:.3}, 5, 30);
  run(b, {forward:.8, strafe:.3, rise:-.2, lookX:.3}, 5, 120);
  for (const axis of ['x','y','z']) assert.ok(Math.abs(a.position[axis] - b.position[axis]) < .0001);
  assert.ok(Math.abs(a.yaw - b.yaw) < .0001);
});

test('look changes swimming direction, clamps pitch and ignores invalid deltas', () => {
  const state = createDiveState(); startDive(state);
  lookDive(state, Math.PI / 2, 0);
  run(state, {forward:1}, 1);
  assert.ok(state.position.x < -1, 'positive yaw turns left like the Three camera');
  const yaw = state.yaw;
  lookDive(state, NaN, Infinity);
  assert.equal(state.yaw, yaw);
  lookDive(state, 0, 50);
  assert.ok(state.pitch < Math.PI / 2);
});

test('a photograph requires target distance and horizontal and vertical facing', () => {
  const state = createDiveState(); startDive(state);
  aimAt(state, 'arch', 30);
  assert.equal(takeDivePhoto(state).ok, false);
  aimAt(state, 'arch');
  state.yaw = Math.PI;
  assert.equal(divePhotoCandidate(state), null);
  state.yaw = 0; state.pitch = 1;
  assert.equal(divePhotoCandidate(state), null);
  state.pitch = 0;
  assert.equal(divePhotoCandidate(state).id, 'arch');
  assert.deepEqual(takeDivePhoto(state).id, 'arch');
  assert.equal(state.discoveries.length, 1);
});

test('cooldown and duplicate capture cannot inflate discoveries; all four remain explorable', () => {
  const state = createDiveState(); startDive(state);
  for (const target of DIVE_TARGETS) {
    aimAt(state, target.id);
    const photo = takeDivePhoto(state);
    assert.equal(photo.ok, true, target.id);
    assert.equal(takeDivePhoto(state).ok, false);
    run(state, {}, 1.5);
    aimAt(state, target.id);
    assert.equal(takeDivePhoto(state).reason, 'collected');
    run(state, {}, 1.5);
  }
  assert.equal(state.discoveries.length, 4);
  assert.equal(state.complete, true);
  assert.equal(state.phase, 'running');
  const before = state.elapsed;
  run(state, {forward:1}, 1);
  assert.ok(state.elapsed > before);
});

test('every discovery can be fully framed from legal swimming positions on a narrow phone', () => {
  for (const aspect of [.5, .64, 1.8]) {
    const state = createDiveState(); startDive(state);
    for (const target of DIVE_TARGETS) {
      aimAt(state, target.id, {turtle:8,ray:12,arch:15,wreck:15}[target.id]);
      assert.ok(state.position.y >= diveFloorAt(state.position.x, state.position.z) + 1.15);
      const photo = takeDivePhoto(state, {aspect});
      assert.equal(photo.ok, true, `${target.name} remains completable at aspect ${aspect}`);
      assert.equal(photo.id, target.id);
      state.elapsed += 2;
    }
    assert.equal(state.complete, true);
  }
});

test('mixed reef banks leave a deeper continuous sand channel and bounded garden clusters', () => {
  assert.equal(Object.values(DIVE_REEF_SITES).flat().length, 22);
  for (const z of [-2,-6,-10]) {
    const sand = diveFloorAt(0,z);
    assert.ok(diveFloorAt(-4,z) > sand + .8);
    assert.ok(diveFloorAt(4,z) > sand + .8);
  }
  for (const x of [-4,4]) for (const z of [-3,-5,-8]) {
    assert.ok(diveFloorAt(x,z) > -6, 'the near reef shelf must reach the starting camera composition');
  }
  const initial = createDiveState();
  assert.ok(initial.position.y - diveFloorAt(initial.position.x,initial.position.z) > 1.15);
  for (let time = 0; time < 600; time += .5) {
    const turtle = diveTargetAt('turtle',time);
    assert.ok(turtle.y - diveFloorAt(turtle.x,turtle.z) > 1.15, 'the whole turtle path clears the raised shelf');
  }
  for (const [kind, sites] of Object.entries(DIVE_REEF_SITES)) {
    assert.ok(sites.length > 0 && sites.length <= 7, kind);
    for (const [x,z,scale] of sites) {
      assert.ok(Math.abs(x) >= 2.4, 'the central swim and turtle-photo corridor stays open');
      assert.ok(diveFloorAt(x,z) < -4 && scale > 0 && scale < 1.3);
    }
  }
});

test('wildlife follows continuous deterministic paths above the reef and the manta is the ray photo target', () => {
  for (const [kind,count] of [['turtle',1],['manta',1],['dolphin',1],['clownfish',5],['angelfish',4]]) {
    for (let i = 0; i < count; i++) for (let t = 0; t <= 120; t += 3) {
      const point = diveWildlifeAt(kind,i,t), next = diveWildlifeAt(kind,i,t + 1 / 60);
      assert.deepEqual(point,diveWildlifeAt(kind,i,t));
      assert.ok(point.y > diveFloorAt(point.x,point.z) + .7, `${kind} may not swim through the sand`);
      assert.ok(point.y < -.85);
      assert.ok(Math.hypot(next.x - point.x,next.y - point.y,next.z - point.z) < .035, `${kind} must glide without path discontinuities`);
      if (kind === 'manta') assert.deepEqual(point,diveTargetAt('ray',t));
    }
  }
});

test('surface preserves the gallery and pause; restart clears discoveries and returns to ready', () => {
  const state = createDiveState(); startDive(state);
  aimAt(state, 'turtle'); takeDivePhoto(state);
  setDivePaused(state, true);
  surfaceDive(state);
  assert.deepEqual(state.position, {x:0, y:-1.1, z:3});
  assert.equal(state.phase, 'paused');
  assert.equal(state.discoveries.length, 1);
  restartDive(state);
  assert.equal(state.phase, 'ready');
  assert.equal(state.discoveries.length, 0);
  assert.equal(state.elapsed, 0);
  assert.equal(state.complete, false);
});
