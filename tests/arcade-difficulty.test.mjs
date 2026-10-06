import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeArcadeDifficulty, createTargetChallenge, recordTargetShot,
  createTennisChallenge, recordTennisWallHit, missTennisBall,
  tennisReturnVelocity, releaseTennisBall, advanceTennisFlight, projectTennisX,
  TENNIS_COURT, tennisWallZone,
} from '../src/arcade-challenges.js';
import * as THREE from 'three';
import * as tennisScene from '../src/tennis-scene.js';
import {spawnSync} from 'node:child_process';

test('the legacy arcade entry loads without an import map or eagerly resolving WebGL dependencies', () => {
  const entry = new URL('../src/arcade.js', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', `
    import {SourceTextModule} from 'node:vm';
    import {readFile} from 'node:fs/promises';
    const cache = new Map();
    async function load(url) {
      if (!cache.has(url)) cache.set(url, new SourceTextModule(await readFile(new URL(url), 'utf8'), {identifier:url}));
      return cache.get(url);
    }
    const entry = await load(${JSON.stringify(entry)});
    await entry.link((specifier, owner) => {
      if (!specifier.startsWith('.')) throw new Error('Legacy page has no import map for ' + specifier);
      return load(new URL(specifier, owner.identifier).href);
    });
    await entry.evaluate();
    if (typeof entry.namespace.mountArcade !== 'function') throw new Error('Missing arcade entry');
  `], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

test('the 3D trail grows from empty, clears, and reuses its GPU position buffer', () => {
  const trail = tennisScene.createTennisTrail();
  const attribute = trail.geometry.attributes.position;
  trail.update([]);
  assert.equal(trail.geometry.drawRange.count, 0);
  trail.update([{x: 320, y: 80}, {x: 400, y: 353}]);
  assert.equal(trail.geometry.drawRange.count, 2);
  assert.ok(Math.abs(attribute.getX(1) - 1.44) < 1e-6);
  assert.ok(Math.abs(attribute.getZ(1) - 1.86) < 1e-6);
  trail.update(Array.from({length: 20}, (_, i) => ({x: 200 + i, y: 250})));
  assert.equal(trail.geometry.drawRange.count, 7);
  assert.equal(trail.geometry.attributes.position, attribute);
  trail.update([]);
  assert.equal(trail.geometry.drawRange.count, 0);
  trail.geometry.dispose();
});

test('all shared tennis characters align the real racket with collision x/z and animate a swing', () => {
  const actor = tennisScene.createTennisAvatar();
  for (const character of ['moss', 'peach', 'robot']) {
    actor.setCharacter(character);
    assert.equal(actor.group.userData.character, character);
    for (const paddleX of [34, 320, 606]) {
      actor.update({paddleX, action: 0});
      const head = actor.group.getObjectByName('racket-head');
      const ready = head.getWorldPosition(new THREE.Vector3());
      const collision = tennisScene.tennisWorldPoint({x: paddleX, y: TENNIS_COURT.contactY});
      assert.ok(Math.abs(ready.x - collision.x) < 1e-9);
      assert.ok(Math.abs(ready.y - collision.y) < .02);
      assert.ok(Math.abs(ready.z - collision.z) < 1e-9);
      assert.equal(actor.group.position.y, 0);
      actor.update({paddleX, action: .5});
      assert.ok(head.getWorldPosition(new THREE.Vector3()).distanceTo(ready) > .3);
      actor.update({paddleX, action: 1});
      assert.ok(head.getWorldPosition(new THREE.Vector3()).distanceTo(ready) < 1e-9);
    }
  }
  actor.dispose();
  actor.dispose();
  assert.equal(actor.group.children.length, 0);
});

test('missing or unknown difficulty retains the legacy easy target rules', () => {
  assert.equal(normalizeArcadeDifficulty(), 'easy');
  assert.equal(normalizeArcadeDifficulty('unknown'), 'easy');
  const state = createTargetChallenge();
  for (let i = 0; i < 20; i++) recordTargetShot(state, null);
  assert.equal(state.ammo, null);
  assert.equal(state.status, 'playing');
  for (let i = 0; i < 12; i++) recordTargetShot(state, 0);
  assert.equal(state.status, 'won');
  assert.equal(state.progress, 12);
  assert.equal(state.shots, 32);
});

test('wrong-order shots and empty shots consume ammo without advancing the sequence', () => {
  const state = createTargetChallenge('standard');
  assert.equal(state.ammo, 8);
  assert.equal(recordTargetShot(state, 0).outcome, 'wrong');
  assert.equal(state.progress, 0);
  assert.equal(state.ammo, 7);
  assert.equal(recordTargetShot(state, null).outcome, 'miss');
  assert.equal(state.progress, 0);
  assert.equal(state.ammo, 6);
  assert.equal(recordTargetShot(state, 2).outcome, 'correct');
  assert.equal(state.progress, 1);
  assert.equal(state.ammo, 5);
});

test('repeatedly firing at one selected target cannot auto-select the next correct target', () => {
  const state = createTargetChallenge('standard');
  for (let i = 0; i < 8; i++) recordTargetShot(state, 2);
  assert.equal(state.progress, 1);
  assert.equal(state.ammo, 0);
  assert.equal(state.status, 'lost');
  const ended = structuredClone(state);
  assert.equal(recordTargetShot(state, 0).accepted, false);
  assert.deepEqual(state, ended);
});

test('the final available round can win, and a completed target game cannot spend more ammo', () => {
  const state = createTargetChallenge('standard');
  recordTargetShot(state, null);
  recordTargetShot(state, 0);
  for (const target of [2, 0, 3, 1, 2, 1]) recordTargetShot(state, target);
  assert.equal(state.status, 'won');
  assert.equal(state.progress, 6);
  assert.equal(state.ammo, 0);
  const ended = structuredClone(state);
  recordTargetShot(state, 1);
  assert.deepEqual(state, ended);
});

test('hard target order is longer, has one spare round, and a new round resets all progress', () => {
  const hard = createTargetChallenge('hard');
  recordTargetShot(hard, null);
  for (const target of [3, 1, 0, 2, 1, 3, 2, 0, 3]) recordTargetShot(hard, target);
  assert.equal(hard.status, 'won');
  assert.equal(hard.progress, 9);
  assert.equal(hard.ammo, 0);
  const reset = createTargetChallenge('hard');
  assert.equal(reset.progress, 0);
  assert.equal(reset.shots, 0);
  assert.equal(reset.ammo, 10);
  assert.equal(reset.status, 'playing');
});

test('a tennis route advances only for an actual player return to the required wall zone', () => {
  const state = createTennisChallenge('standard');
  recordTennisWallHit(state, 100, false);
  assert.equal(state.step, 0);
  recordTennisWallHit(state, 500, true);
  assert.equal(state.step, 0);
  recordTennisWallHit(state, 100, true);
  assert.equal(state.step, 1);
  recordTennisWallHit(state, 320, true);
  assert.equal(state.step, 0);
  for (const x of [100, 500, 320]) recordTennisWallHit(state, x, true);
  assert.equal(state.status, 'won');
  assert.equal(state.routeIndex, 1);
});

test('hard tennis keeps completed routes but resets an interrupted route', () => {
  const state = createTennisChallenge('hard');
  for (const x of [100, 500, 320]) recordTennisWallHit(state, x, true);
  assert.equal(state.routeIndex, 1);
  recordTennisWallHit(state, 500, true);
  assert.equal(state.step, 1);
  recordTennisWallHit(state, 320, true);
  assert.equal(state.routeIndex, 1);
  assert.equal(state.step, 0);
  for (const x of [500, 100, 500, 320, 100, 320]) recordTennisWallHit(state, x, true);
  assert.equal(state.status, 'won');
  assert.equal(state.routeIndex, 3);
});

test('five dropped balls end the tennis challenge and cannot mutate a finished round', () => {
  const state = createTennisChallenge('hard');
  recordTennisWallHit(state, 100, true);
  missTennisBall(state);
  assert.equal(state.step, 0);
  assert.equal(state.ballsLeft, 4);
  for (let i = 0; i < 4; i++) missTennisBall(state);
  assert.equal(state.status, 'lost');
  const ended = structuredClone(state);
  missTennisBall(state);
  recordTennisWallHit(state, 100, true);
  assert.deepEqual(state, ended);
});

function flightFrom(paddleX) {
  const ball = { x: 320, y: 353, vx: 0, vy: 0, held: true, out: false, playerReturn: false };
  assert.equal(releaseTennisBall(ball, paddleX), true);
  let wall;
  for (let i = 0; i < 400 && !wall; i++) {
    wall = advanceTennisFlight(ball, .02, paddleX).find(event => event.type === 'wall');
  }
  assert.ok(wall, 'the physically launched ball must reach the wall');
  return wall;
}

test('paddle contact position changes real wall collisions and therefore route progress', () => {
  const left = flightFrom(360);
  const center = flightFrom(320);
  const right = flightFrom(280);
  assert.ok(left.x < 224);
  assert.equal(center.x, 320);
  assert.ok(right.x >= 416);
  const state = createTennisChallenge('standard');
  for (const hit of [left, right, center]) recordTennisWallHit(state, hit.x, hit.playerReturn);
  assert.equal(state.status, 'won');
});

test('an off-paddle strike cannot launch, and return speed is independent of contact offset', () => {
  const ball = { x: 320, y: 353, vx: 0, vy: 0, held: true, out: false };
  assert.equal(releaseTennisBall(ball, 200), false);
  assert.equal(ball.held, true);
  for (const paddleX of [260, 320, 380]) {
    const velocity = tennisReturnVelocity(320, paddleX);
    assert.ok(Math.abs(Math.hypot(velocity.vx, velocity.vy) - 248) < 1e-9);
  }
});

test('wall prediction agrees with the actual side-wall rebound instead of clamping the shot', () => {
  const ball = { x: 570, y: 353, vx: 0, vy: 0, held: true, out: false };
  releaseTennisBall(ball, 510);
  const predicted = projectTennisX(ball, 80);
  let wall;
  for (let i = 0; i < 500 && !wall; i++) {
    wall = advanceTennisFlight(ball, .013, 510).find(event => event.type === 'wall');
  }
  assert.ok(wall.x < 416);
  assert.ok(Math.abs(wall.x - predicted) < 1e-7);
});

test('a caught ball stays still for unlimited planning time and only the next strike releases it', () => {
  const ball = { x: 300, y: 340, vx: 0, vy: 248, held: false, out: false, playerReturn: false };
  const events = advanceTennisFlight(ball, .2, 300);
  assert.equal(events[0].type, 'catch');
  assert.equal(ball.held, true);
  assert.equal(ball.y, 353);
  const held = structuredClone(ball);
  assert.deepEqual(advanceTennisFlight(ball, 600, 300), []);
  assert.deepEqual(ball, held);
  assert.equal(releaseTennisBall(ball, 340), true);
  assert.equal(ball.held, false);
  assert.ok(ball.vx < 0);
});

test('missing the paddle produces one drop event without silently returning the ball', () => {
  const ball = { x: 500, y: 340, vx: 0, vy: 248, held: false, out: false, playerReturn: false };
  const events = advanceTennisFlight(ball, 1, 200);
  assert.deepEqual(events.map(event => event.type), ['out']);
  assert.equal(ball.out, true);
  assert.equal(ball.held, false);
  assert.deepEqual(advanceTennisFlight(ball, 1, 200), []);
});

test('the catch marker predicts a complete wall-and-side-wall return across uneven frames', () => {
  const initial = {x: 320, y: 353, vx: 0, vy: 0, held: true, out: false};
  releaseTennisBall(initial, 380);
  const catchX = projectTennisX(initial, -193);
  const regular = structuredClone(initial);
  const uneven = structuredClone(initial);
  for (let i = 0; i < 500; i++) advanceTennisFlight(regular, .01, catchX);
  for (const dt of [.7, .01, 1.2, .34, 2.75]) advanceTennisFlight(uneven, dt, catchX);
  assert.equal(regular.held, true);
  assert.equal(uneven.held, true);
  assert.ok(Math.abs(uneven.x - catchX) < 1e-7);
  assert.ok(Math.abs(regular.x - uneven.x) < 1e-7);
});

test('both tennis difficulties can win through consecutive real shots and catches, including bank shots', () => {
  for (const difficulty of ['standard', 'hard']) {
    const state = createTennisChallenge(difficulty);
    const ball = {x: 320, y: 353, vx: 0, vy: 0, held: true, out: false};
    const sequence = difficulty === 'standard' ? ['left', 'right', 'center']
      : ['left', 'right', 'center', 'right', 'left', 'right', 'center', 'left', 'center'];
    for (const zone of sequence) {
      const candidates = [];
      for (let paddleX = TENNIS_COURT.left; paddleX <= TENNIS_COURT.right; paddleX++) {
        const velocity = tennisReturnVelocity(ball.x, paddleX);
        if (!velocity) continue;
        const landing = projectTennisX({...ball, ...velocity}, 80);
        if (tennisWallZone(landing) === zone) {
          candidates.push({paddleX, error: Math.abs(landing - {left: 129, center: 320, right: 511}[zone])});
        }
      }
      assert.ok(candidates.length, `must be able to reach ${zone} from ${ball.x}`);
      candidates.sort((a, b) => a.error - b.error);
      releaseTennisBall(ball, candidates[0].paddleX);
      const catchX = projectTennisX(ball, -193);
      let wall;
      for (let i = 0; i < 2_000 && !ball.held && !ball.out; i++) {
        for (const event of advanceTennisFlight(ball, .01, catchX)) {
          if (event.type === 'wall') wall = event;
        }
      }
      assert.equal(ball.held, true);
      assert.ok(wall);
      assert.equal(recordTennisWallHit(state, wall.x, wall.playerReturn).correct, true);
    }
    assert.equal(state.status, 'won');
    assert.equal(state.ballsLeft, 5);
  }
});
