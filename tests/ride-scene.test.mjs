import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {existsSync, readFileSync} from 'node:fs';
import vm from 'node:vm';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createMolesCharacterAsset} from '../src/moles-character.js';
import {rideRoadAt} from '../src/ride-state.js';
import {loadRideTripoRider} from '../src/ride-tripo-rider.js';

let sceneApi;
try {sceneApi = await import('../src/ride-scene.js');}
catch (error) {if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;}
const api = () => {assert.ok(sceneApi, 'ride scene must be importable without WebGL'); return sceneApi;};
const state = (extra = {}) => ({
  phase: 'running', elapsed: 4, distance: 75, speed: 18, lateral: .4, lean: .3,
  stamina: .8, integrity: 1, rank: 3, overtakes: 0, impacts: 0, attackTime: 0,
  attackSide: 0, recovery: 0, config: {raceLength: 1800, roadHalfWidth: 4.2, maxSpeed: 38},
  opponents: [{id: 'r1', distance: 78, lateral: -1, speed: 17, lean: 0, stunned: 0}],
  obstacles: [{id: 'o1', distance: 103, lateral: 1.2, type: 'cone'}], events: [], ...extra,
});

test('motorcycle and rider have believable scale and actual mechanical/anatomical parts', () => {
  const world = api().createRideWorld();
  try {
    world.render(state(), {}, 0);
    const player = world.scene.getObjectByName('ride-player');
    assert.ok(player);
    for (const name of ['front-wheel', 'rear-wheel', 'front-fork-left', 'front-fork-right',
      'fuel-tank', 'engine', 'seat', 'headlight', 'exhaust', 'rider-torso',
      'rider-helmet', 'rider-visor', 'left-upper-arm', 'right-forearm',
      'left-thigh', 'right-shin', 'left-boot', 'right-glove']) {
      assert.ok(player.getObjectByName(name), `missing structural part ${name}`);
    }
    const front = player.getObjectByName('front-wheel'), rear = player.getObjectByName('rear-wheel');
    assert.ok(Math.abs(front.position.z - rear.position.z) > 1.3);
    const size = new THREE.Box3().setFromObject(player).getSize(new THREE.Vector3());
    assert.ok(size.y > 1.5 && size.y < 2.4, `rider/bike height ${size.y}`);
    assert.ok(size.z > 1.7 && size.z < 2.8, `motorcycle length ${size.z}`);
    assert.ok(size.x < 1.6, `motorcycle width ${size.x}`);
    assert.equal(front.getObjectByName('front-tire').geometry.type, 'TorusGeometry');
    assert.ok(world.scene.getObjectByName('ride-road').material.map?.isDataTexture);
    for (const name of ['ride-road', 'ride-terrain']) {
      assert.ok(world.scene.getObjectByName(name).geometry.attributes.normal.getY(20) > .5, `${name} must face the camera above the road`);
    }
    assert.ok(world.scene.getObjectByName('ride-guardrails').isInstancedMesh);
    assert.ok(world.scene.getObjectByName('ride-trees').isInstancedMesh);
    let drawCalls = 0;
    player.traverseVisible(object => {if (object.isMesh) drawCalls++;});
    assert.ok(drawCalls < 60, `default motorcycle must batch static parts for mobile (${drawCalls} draws)`);
  } finally {world.dispose();}
});

test('wheels roll from actual travelled distance and barriers show their wider physical footprint', () => {
  const world = api().createRideWorld();
  try {
    const source = state({distance: 70, elapsed: 5, speed: 20, lean: 0, obstacles: [
      {distance: 85, lateral: -1, type: 'cone'}, {distance: 90, lateral: 1, type: 'barrier'},
    ]});
    world.render(source);
    const wheel = world.scene.getObjectByName('ride-player').getObjectByName('front-wheel');
    const before = wheel.rotation.x;
    source.distance += .5; source.elapsed += .1; source.speed = 5;
    world.render(source, {}, .1);
    assert.ok(Math.abs(Math.abs(wheel.rotation.x - before) - .5 / .335) < .001, 'braking must not unwind travelled wheel rotation');
    const pool = world.scene.getObjectByName('ride-obstacles');
    const visibleSize = root => {
      const box = new THREE.Box3();
      root.traverseVisible(object => {if (object.isMesh) box.union(new THREE.Box3().setFromObject(object));});
      return box.getSize(new THREE.Vector3());
    };
    const cone = visibleSize(pool.children[0]), barrier = visibleSize(pool.children[1]);
    assert.ok(barrier.x > 1.5 && barrier.x > cone.x * 2, 'engine barrier must not be drawn as a small cone');
    assert.ok(barrier.y > .7);
  } finally {world.dispose();}
});

test('road and rivals follow actual distance/lateral coordinates, with bounded scenery and no simulation mutation', () => {
  const world = api().createRideWorld();
  try {
    const source = state(), before = structuredClone(source);
    world.render(source, {}, .016);
    assert.deepEqual(source, before);
    const road = world.scene.getObjectByName('ride-road'), positions = road.geometry.attributes.position;
    const initialRoad = Array.from(positions.array);
    const rival = world.scene.getObjectByName('ride-opponent-0'), initialRival = rival.position.clone();
    const counts = []; world.scene.traverse(object => {if (object.isMesh) counts.push(object);});
    const triangles = positions.count;
    for (let index = 0; index < 40; index++) world.render(state({distance: index * 70, elapsed: index * 4}), {}, .016);
    assert.equal(positions.count, triangles);
    assert.notDeepEqual(Array.from(positions.array), initialRoad, 'curved asphalt must actually move');
    world.render(state({opponents: [{...source.opponents[0], distance: 89, lateral: 2}]}));
    assert.ok(rival.position.distanceTo(initialRival) > 5);
    const after = []; world.scene.traverse(object => {if (object.isMesh) after.push(object);});
    assert.equal(after.length, counts.length, 'endless riding reuses geometry and object pools');
    assert.ok(world.scene.getObjectByName('ride-obstacles').children.some(object => object.visible));
  } finally {world.dispose();}
});

test('terrain stays below the full asphalt width through curves and changing road widths', () => {
  const world = api().createRideWorld(), ray = new THREE.Raycaster();
  try {
    for (const distance of [0, 75, 600, 1200]) for (const half of [3.8, 4.3, 5.2]) {
      world.render(state({distance, config: {roadHalfWidth: half, maxSpeed: 42}}));
      const road = world.scene.getObjectByName('ride-road'), terrain = world.scene.getObjectByName('ride-terrain');
      const positions = road.geometry.attributes.position;
      for (const row of [9, 15, 24, 50]) for (const across of [.05, .25, .5, .75, .95]) {
        const left = new THREE.Vector3().fromBufferAttribute(positions, row * 2);
        const right = new THREE.Vector3().fromBufferAttribute(positions, row * 2 + 1);
        const point = left.lerp(right, across); point.y += 50;
        ray.set(point, new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObjects([road, terrain], false);
        assert.ok(hits.length >= 2);
        assert.equal(hits[0].object.name, 'ride-road', `terrain covers carriageway: d=${distance}, half=${half}, row=${row}, across=${across}`);
        const asphaltY = hits.find(hit => hit.object === road).point.y;
        const terrainY = hits.find(hit => hit.object === terrain).point.y;
        assert.ok(asphaltY - terrainY >= .035, 'full carriageway needs real clearance, not polygon-offset masking');
      }
    }
  } finally {world.dispose();}
});

test('the race finish gate and road line use the actual curved-road finish position; practice has no finish', () => {
  const world = api().createRideWorld();
  try {
    const source = state({mode: 'race', distance: 1650, config: {raceLength: 1800, roadHalfWidth: 4.3, maxSpeed: 42}});
    world.render(source);
    const gate = world.scene.getObjectByName('ride-finish-gate'), line = world.scene.getObjectByName('ride-finish-line');
    assert.ok(gate?.visible && line?.isMesh, 'approaching riders need a real visible finish gate and painted road line');
    const target = rideRoadAt(1800), here = rideRoadAt(1650);
    assert.ok(gate.position.distanceTo(new THREE.Vector3(target.x - here.x, target.y - here.y, -150)) < 1e-6);
    assert.ok(Math.abs(gate.rotation.y - target.heading) < 1e-6);
    assert.ok(line.material.map?.isDataTexture);
    assert.ok(Math.abs(line.scale.x - 8.6) < .001, 'the checkered line spans the full carriageway');
    source.mode = 'practice'; world.render(source);
    assert.equal(gate.visible, false);
    source.mode = 'race'; source.distance = 20; world.render(source);
    assert.equal(gate.visible, false, 'the finish is not a repeating scenery prop');
  } finally {world.dispose();}
});

test('the first stopped finish frame keeps the line, gate and rider above the compact result card on every viewport', () => {
  const world = api().createRideWorld();
  try {
    for (const [width, height] of [[320, 460], [320, 600], [640, 620], [1100, 790]]) {
      world.resize(width, height);
      const source = state({mode: 'race', distance: 1798, speed: 32, lean: 0, lateral: 2.8});
      world.render(source, {}, .016);
      source.distance = 1800; source.phase = 'finished'; world.render(source, {}, 0);
      const gate = world.scene.getObjectByName('ride-finish-gate');
      assert.ok(gate?.visible);
      for (const name of ['ride-finish-line', 'ride-finish-banner', 'rider-helmet']) {
        const object = world.scene.getObjectByName(name), box = new THREE.Box3().setFromObject(object);
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(world.camera), pixelY = (1 - point.y) * height / 2;
          assert.ok(Math.abs(point.x) < .98 && pixelY > 90 && pixelY < height - 170,
            `${name} clipped or covered by results at ${width}×${height}: ${point.toArray()}`);
        }
      }
      const camera = world.camera.matrixWorld.clone(); world.render(source, {}, .8);
      assert.ok(world.camera.matrixWorld.equals(camera), 'finished render does not keep drifting the scene');
    }
  } finally {world.dispose();}
});

test('PBR metal receives a bounded HDR sky reflection environment that is released on disposal', () => {
  const world = api().createRideWorld(), environment = world.scene.environment;
  assert.ok(environment?.isDataTexture, 'imported metal needs a sky reflection map rather than only direct lights');
  assert.equal(environment.mapping, THREE.EquirectangularReflectionMapping);
  assert.equal(environment.colorSpace, THREE.LinearSRGBColorSpace);
  assert.ok(environment.image.width <= 256 && environment.image.height <= 128);
  const pixels = environment.image.data;
  const channel = index => environment.type === THREE.HalfFloatType ? THREE.DataUtils.fromHalfFloat(pixels[index]) : pixels[index];
  let brightest = 0;
  for (let index = 0; index < pixels.length; index += 4) brightest = Math.max(brightest, channel(index));
  assert.ok(brightest > 2, 'the sun must retain HDR energy for realistic highlights');
  assert.ok(channel(0) !== channel(pixels.length - 4), 'ground and sky reflections must be different');
  let releases = 0; environment.addEventListener('dispose', () => releases++);
  for (let index = 0; index < 8; index++) world.render(state({distance: index * 90}));
  assert.equal(world.scene.environment, environment, 'riding must not generate new environment maps per frame');
  world.dispose(); world.dispose();
  assert.equal(releases, 1); assert.equal(world.scene.environment, null);
});

test('Tripo foreground trees use bounded per-mesh instancing and release shared assets once', () => {
  const world = api().createRideWorld(), source = new THREE.Group();
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.18, .3, 5, 9), new THREE.MeshStandardMaterial({color: 0x564633}));
  stem.position.y = 2.5;
  const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 1), new THREE.MeshStandardMaterial({color: 0x426249}));
  foliage.position.set(.3, 5, -.1); source.add(stem, foliage);
  const asset = createMolesCharacterAsset({scene: source, scenes: [source]}, 'Pine.glb');
  let released = 0; stem.geometry.addEventListener('dispose', () => released++);
  try {
    assert.equal(typeof world.installTripoTree, 'function');
    assert.equal(world.installTripoTree(asset), true);
    world.render(state());
    const trees = world.scene.getObjectByName('ride-tripo-trees');
    assert.equal(trees.children.length, 2, 'one draw object per source mesh, not 24 cloned scene graphs');
    for (const tree of trees.children) assert.ok(tree.isInstancedMesh && tree.count >= 15 && tree.count <= 25);
    const matrix = trees.children[0].instanceMatrix.array.slice();
    for (let index = 0; index < 30; index++) world.render(state({distance: index * 45}));
    assert.equal(trees.children.length, 2); assert.notDeepEqual(trees.children[0].instanceMatrix.array, matrix);
    assert.ok(world.scene.getObjectByName('ride-trees').count > 0, 'far vegetation remains');
  } finally {world.dispose(); world.dispose();}
  assert.equal(released, 1);
});

test('chase framing fits the rider on mobile/desktop; lean and a nearby push visibly move actual joints', () => {
  const world = api().createRideWorld();
  try {
    for (const [width, height] of [[320, 600], [640, 620], [1100, 790]]) {
      world.resize(width, height); world.render(state({lean: 0, lateral: 0}), {}, 0);
      const box = new THREE.Box3().setFromObject(world.scene.getObjectByName('ride-player'));
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(world.camera);
        assert.ok(Math.abs(point.x) < .94 && point.y < .65 && point.y > -.63, `rider is hidden by HUD at ${width}×${height}`);
      }
    }
    const source = state({lean: 0}), player = world.scene.getObjectByName('ride-player');
    world.render(source, {}, 0);
    const hand = player.getObjectByName('right-glove'), resting = hand.getWorldPosition(new THREE.Vector3());
    source.attackTime = .18; source.attackSide = 1; source.lean = .8;
    world.render(source, {}, .016);
    assert.ok(Math.abs(player.rotation.z) > .1);
    assert.ok(hand.getWorldPosition(new THREE.Vector3()).distanceTo(resting) > .25, 'push must extend the rider arm');
    source.phase = 'paused';
    world.render(source, {}, 0);
    const frozen = hand.matrixWorld.clone(), camera = world.camera.matrixWorld.clone();
    world.render(source, {boost: true}, 0);
    assert.ok(hand.matrixWorld.equals(frozen) && world.camera.matrixWorld.equals(camera));
  } finally {world.dispose();}
});

test('an opponent visibly draws its arm back during the counterattack warning before the push', () => {
  const world = api().createRideWorld();
  try {
    const source = state(), rival = world.scene.getObjectByName('ride-opponent-0');
    world.render(source);
    const hand = rival.getObjectByName('right-glove');
    const ready = hand.position.clone();
    source.opponents[0].attackSide = 1; source.opponents[0].attackWindup = .45;
    world.render(source, {}, .016);
    assert.ok(hand.position.distanceTo(ready) > .15, 'the warning must move the attacking arm before contact');
    assert.ok(hand.position.y > ready.y, 'the rider should visibly prepare the push');
    source.opponents[0].attackWindup = 0; source.opponents[0].attackTime = .18;
    world.render(source, {}, .016);
    assert.ok(hand.position.x > ready.x + .4, 'the prepared arm then extends toward the rival');
  } finally {world.dispose();}
});

test('a knockdown visibly separates rider and bike, tumbles, freezes while paused and remounts', () => {
  const world = api().createRideWorld();
  try {
    const source = state({lean: 0, fallTime: 0, fallSide: 1});
    world.render(source);
    const player = world.scene.getObjectByName('ride-player');
    const rider = player.getObjectByName('rider-hips'), bike = player.getObjectByName('fuel-tank');
    const seated = rider.getWorldPosition(new THREE.Vector3());
    source.fallTime = 2.4; world.render(source, {}, .016);
    const thrown = rider.getWorldPosition(new THREE.Vector3());
    assert.ok(thrown.distanceTo(seated) > 1, 'knockdown must move the actual rider away from the vehicle');
    assert.ok(thrown.y > seated.y + .3);
    source.fallTime = 1.5; world.render(source, {}, .016);
    const landed = rider.getWorldPosition(new THREE.Vector3());
    assert.ok(landed.y < thrown.y - .5);
    assert.ok(landed.distanceTo(bike.getWorldPosition(new THREE.Vector3())) > 1.3);
    const tumbling = rider.matrixWorld.clone();
    source.fallTime = 1.1; world.render(source, {}, .016);
    assert.ok(!rider.matrixWorld.equals(tumbling));
    source.phase = 'paused'; world.render(source, {}, 0);
    const frozen = rider.matrixWorld.clone(); world.render(source, {}, .8);
    assert.ok(rider.matrixWorld.equals(frozen));
    source.phase = 'running'; source.fallTime = 0; world.render(source, {}, .016);
    assert.ok(rider.getWorldPosition(new THREE.Vector3()).distanceTo(seated) < .0001);
    source.opponents[0].fallTime = 2.2; source.opponents[0].fallSide = -1; world.render(source, {}, .016);
    const rival = world.scene.getObjectByName('ride-opponent-0');
    const local = rival.worldToLocal(rival.getObjectByName('rider-hips').getWorldPosition(new THREE.Vector3()));
    assert.ok(local.x < -1, 'opponents use their own fall state and side');
  } finally {world.dispose();}
});

test('only the player wears number 3 and its label anchor follows the actual falling head', () => {
  const world = api().createRideWorld();
  try {
    world.resize(1100, 790);
    const source = state({lean: 0}); world.render(source);
    assert.ok(world.scene.getObjectByName('ride-player').getObjectByName('jersey-number-3'));
    assert.equal(world.scene.getObjectByName('ride-opponent-0').getObjectByName('jersey-number-3'), undefined);
    assert.equal(typeof world.getPlayerLabelPosition, 'function');
    const ready = world.getPlayerLabelPosition();
    assert.ok(ready.visible && ready.x > 0 && ready.x < 1100 && ready.y > 0 && ready.y < 790);
    source.fallTime = 2.4; source.fallSide = 1; world.render(source, {}, .016);
    const thrown = world.getPlayerLabelPosition();
    assert.ok(Math.hypot(thrown.x - ready.x, thrown.y - ready.y) > 30);
    for (const [width, height] of [[320, 600], [640, 620], [1100, 790]]) {
      world.resize(width, height);
      for (const side of [-1, 1]) for (const remaining of [3, 2.4, 1.5, .6, .15]) {
        source.fallSide = side; source.fallTime = remaining; world.render(source, {}, .1);
        const point = world.getPlayerLabelPosition();
        assert.ok(point.visible && point.x > 20 && point.x < width - 20 && point.y > 130 && point.y < height - 85,
          `player identity must remain visible through a fall at ${width}×${height}`);
      }
    }
  } finally {world.dispose();}
});

test('shared rigged rider instances receive independent fall poses and release the asset once', () => {
  const world = api().createRideWorld(), instances = [];
  let releases = 0;
  const rider = {createInstance() {
    const group = new THREE.Group(), poses = [];
    const head = new THREE.Bone(); head.name = 'mixamorig:Head'; head.position.set(0, 1.72, -.2); group.add(head);
    const instance = {group, head, poses, update(pose) {poses.push({...pose});}};
    instances.push(instance); return instance;
  }, dispose() {releases++;}};
  try {
    world.installTripoRider(rider);
    assert.equal(instances.length, 6, 'player and five rivals should share one asset with independent skeletons');
    const source = state({fallTime: 1.5, fallSide: -1, fallProgress: .5});
    source.opponents[0].fallTime = 2.25; source.opponents[0].fallSide = 1;
    source.opponents[0].fallProgress = .25;
    world.render(source);
    assert.equal(world.scene.getObjectByName('ride-player').getObjectByName('ride-rider').visible, false);
    assert.equal(instances[0].poses.at(-1).fallProgress, .5); assert.equal(instances[0].poses.at(-1).fallSide, -1);
    assert.equal(instances[1].poses.at(-1).fallProgress, .25); assert.equal(instances[1].poses.at(-1).fallSide, 1);
    const {head} = instances[0];
    assert.ok(head.getWorldPosition(new THREE.Vector3()).x < -1);
    const point = head.getWorldPosition(new THREE.Vector3()); point.y += .32; point.project(world.camera);
    const label = world.getPlayerLabelPosition();
    assert.ok(Math.abs(label.x - (point.x + 1) * 480) < .001, 'label follows the imported head bone');
    source.phase = 'paused'; world.render(source, {}, 0); const frozen = head.matrixWorld.clone();
    world.render(source, {}, .5); assert.ok(head.matrixWorld.equals(frozen));
    const oldHead = head.parent;
    let failedReleases = 0;
    assert.throws(() => world.installTripoRider({createInstance: () => ({group: new THREE.Group()}), dispose() {failedReleases++;}}));
    assert.equal(failedReleases, 1); assert.equal(head.parent, oldHead, 'a failed replacement keeps the working rider');
    assert.equal(releases, 0);
  } finally {world.dispose(); world.dispose();}
  assert.equal(releases, 1); assert.ok(instances.every(instance => instance.group.parent === null));
});

const riderArtifact = ['game.glb', 'model.glb'].map(file => new URL(`../artifacts/tripo/rider-rig/${file}`, import.meta.url)).find(existsSync);
test('actual Tripo rider integrates with the bike carrier, skin, player-only number and falling head label', {skip: !riderArtifact}, async () => {
  const savedSelf = globalThis.self, savedDecoder = globalThis.createImageBitmap;
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async () => ({width: 1024, height: 1024, close() {}});
  const world = api().createRideWorld();
  try {
    const asset = await loadRideTripoRider(readFileSync(riderArtifact));
    world.installTripoRider(asset);
    const source = state({fallTime: 0, fallProgress: 0, lean: 0}); world.render(source);
    const player = world.scene.getObjectByName('ride-player'), rival = world.scene.getObjectByName('ride-opponent-0');
    assert.ok(player.getObjectByName('ride-jersey-back').visible);
    assert.equal(rival.getObjectByName('ride-jersey-back').visible, false);
    let hand; rival.traverse(object => {if (object.isBone && object.name.endsWith('RightHand')) hand = object;});
    assert.ok(hand); const resting = hand.getWorldPosition(new THREE.Vector3());
    source.opponents[0].attackSide = 1; source.opponents[0].attackWindup = .45; world.render(source, {}, 0);
    assert.ok(hand.getWorldPosition(new THREE.Vector3()).distanceTo(resting) > .1,
      'the imported rider must visibly prepare an announced counterattack before its hit');
    assert.equal(source.opponents[0].attackTime, undefined, 'visual preparation cannot trigger a physical attack');
    const ready = world.getPlayerLabelPosition();
    source.fallTime = 1.5; source.fallProgress = .5; source.fallSide = -1; world.render(source, {}, .016);
    const fallen = world.getPlayerLabelPosition();
    assert.ok(Math.hypot(fallen.x - ready.x, fallen.y - ready.y) > 30);
    source.phase = 'paused'; world.render(source, {}, 0);
    assert.deepEqual(world.getPlayerLabelPosition(), fallen);
  } finally {
    world.dispose(); globalThis.self = savedSelf; globalThis.createImageBitmap = savedDecoder;
  }
});

test('Tripo vehicles share loaded geometry, retain the rider and support an explicit yaw correction', () => {
  const world = api().createRideWorld(), source = new THREE.Group();
  // A local geometry fixture exercises real normalization/resource ownership.
  const geometry = new THREE.BoxGeometry(4, 2, 1), material = new THREE.MeshStandardMaterial();
  source.add(new THREE.Mesh(geometry, material));
  const asset = createMolesCharacterAsset({scene: source, scenes: [source]}, 'Road motorcycle.glb');
  let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
  try {
    assert.equal(world.installTripoVehicle(asset, {name: 'Road motorcycle', yaw: Math.PI / 2}), true);
    world.render(state(), {}, 0);
    const models = []; world.scene.traverse(object => {if (object.name === 'ride-tripo-vehicle') models.push(object);});
    assert.equal(models.length, 6, 'the player and five rivals reuse the actual imported vehicle');
    const geometries = new Set();
    models.forEach(model => model.traverse(object => {if (object.isMesh) geometries.add(object.geometry);}));
    assert.equal(geometries.size, 1);
    const player = world.scene.getObjectByName('ride-player');
    assert.equal(player.getObjectByName('ride-procedural-vehicle').visible, false);
    assert.equal(player.getObjectByName('ride-rider').visible, true);
    const bounds = new THREE.Box3().setFromObject(models[0]).getSize(new THREE.Vector3());
    assert.ok(bounds.z > 1.8 && bounds.z < 2.5); assert.ok(bounds.x < 1.1);
  } finally {world.dispose(); world.dispose();}
  assert.equal(disposed, 1);
});

const motorcycleArtifact = new URL('../artifacts/tripo/realistic-motorcycle/game.glb', import.meta.url);
test('the supplied Tripo motorcycle faces forward and keeps its wheelbase despite wide mirrors', {
  skip: !existsSync(motorcycleArtifact) && 'generated asset is not present in this checkout',
}, () => {
  const bytes = readFileSync(motorcycleArtifact), jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binStart = 28 + jsonLength, primitive = json.meshes[0].primitives[0];
  const position = json.accessors[primitive.attributes.POSITION], view = json.bufferViews[position.bufferView];
  const offset = binStart + (view.byteOffset || 0) + (position.byteOffset || 0);
  const vertices = new Float32Array(position.count * 3);
  for (let index = 0; index < vertices.length; index++) vertices[index] = bytes.readFloatLE(offset + index * 4);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  assert.deepEqual(geometry.boundingBox.min.toArray(), position.min);
  assert.deepEqual(geometry.boundingBox.max.toArray(), position.max);
  const model = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  model.name = json.meshes[0].name;
  const node = new THREE.Group(); node.add(model); node.applyMatrix4(new THREE.Matrix4().fromArray(json.nodes[0].matrix));
  // Side-profile inspection identifies this point as the +Z front wheel, not the tail.
  const front = new THREE.Object3D(); front.name = 'verified-front-wheel'; front.position.set(0, -.14, .35); node.add(front);
  const source = new THREE.Group(); source.add(node);
  const originalSize = new THREE.Box3().setFromObject(source).getSize(new THREE.Vector3());
  assert.ok(Math.abs(originalSize.z - 1.94681) < .00001);
  const asset = createMolesCharacterAsset({scene: source, scenes: [source]}, 'game.glb');
  const world = api().createRideWorld();
  try {
    world.installTripoVehicle(asset);
    const player = world.scene.getObjectByName('ride-player'), vehicle = player.getObjectByName('ride-tripo-vehicle');
    const frontPosition = player.worldToLocal(vehicle.getObjectByName('verified-front-wheel').getWorldPosition(new THREE.Vector3()));
    assert.ok(frontPosition.z < -.7, `verified front wheel points backwards (${frontPosition.z})`);
    const size = new THREE.Box3().setFromObject(vehicle).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.z - 2.14) < .00001, `wide mirrors must not shrink the wheelbase: ${size.z}`);
    assert.ok(size.x > 1.09 && size.x < 1.12); assert.ok(size.y > 1.30 && size.y < 1.34);
    for (const [width, height] of [[320, 600], [640, 620], [1100, 790]]) {
      world.resize(width, height); world.render(state({lean: 0, lateral: 0}));
      const bounds = new THREE.Box3().setFromObject(player);
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(world.camera);
        assert.ok(Math.abs(point.x) < .94 && point.y < .65 && point.y > -.63, `generated bike clipped at ${width}×${height}`);
      }
    }
  } finally {world.dispose();}
});

test('scene disposal releases generated geometries, materials and textures exactly once', () => {
  const world = api().createRideWorld();
  world.render(state());
  const resources = new Map();
  world.scene.traverse(object => {
    for (const resource of [object.geometry, ...(Array.isArray(object.material) ? object.material : [object.material])].filter(Boolean)) {
      if (!resources.has(resource)) {
        resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
      }
      if (resource.isMaterial) for (const texture of Object.values(resource).filter(value => value?.isTexture)) {
        if (!resources.has(texture)) {resources.set(texture, 0); texture.addEventListener('dispose', () => resources.set(texture, resources.get(texture) + 1));}
      }
    }
  });
  world.dispose(); world.dispose();
  for (const count of resources.values()) assert.equal(count, 1);
  assert.equal(world.scene.children.length, 0);
  assert.equal(world.render(state()), false);
});

test('canvas wrapper aborts late Tripo loads and releases WebGL on context loss/unmount exactly once', async () => {
  const requests = [], renderers = [], listeners = new Map();
  class Renderer {
    constructor() {this.shadowMap = {}; this.debug = {}; this.disposes = this.losses = 0; renderers.push(this);}
    setPixelRatio() {} setSize() {} render() {}
    dispose() {this.disposes++;} forceContextLoss() {this.losses++;}
  }
  const canvas = {
    ownerDocument: {defaultView: {devicePixelRatio: 2}},
    getBoundingClientRect: () => ({width: 320, height: 600}),
    addEventListener(name, fn) {listeners.set(name, fn);},
    removeEventListener(name) {listeners.delete(name);},
  };
  const source = readFileSync(new URL('../src/ride-scene.js', import.meta.url), 'utf8')
    .replace(/^import \* as THREE .*;$/m, 'const THREE = imports.THREE;')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace("await import('./ride-tripo-rider.js')", "await Promise.resolve(imports['./ride-tripo-rider.js'])")
    .replaceAll('export function ', 'function ');
  const context = vm.createContext({AbortController, ArrayBuffer, console, imports: {
    THREE: {...THREE, WebGLRenderer: Renderer},
    'three/addons/utils/BufferGeometryUtils.js': {mergeGeometries},
    './ride-state.js': {rideRoadAt},
    './moles-character.js': {loadMolesCharacter(file, options) {
      return new Promise(resolve => requests.push({file, ...options, resolve}));
    }},
    './ride-tripo-rider.js': {loadRideTripoRider(buffer, options) {
      return new Promise(resolve => requests.push({buffer, ...options, resolve}));
    }},
  }});
  vm.runInContext(source, context);
  const scene = context.createRideScene(canvas);
  assert.equal(renderers[0].shadowMap.type, THREE.PCFShadowMap, 'current Three.js uses PCF shadows');
  scene.render(state()); scene.resize();
  const pending = scene.setTripoVehicle(new Uint8Array(24), {name: 'Generated touring bike'});
  assert.equal(requests.length, 1); assert.equal(requests[0].file.size, 24);
  const treePending = scene.setTripoTree(new Uint8Array(24), {name: 'Generated pine'});
  assert.equal(requests.length, 2); assert.equal(requests[0].signal.aborted, false, 'tree loading must not cancel the bike request');
  const riderPending = scene.setTripoRider(new Uint8Array(24), {name: 'Tripo 3'});
  await Promise.resolve();
  assert.equal(requests.length, 3); assert.ok(requests.every(request => !request.signal.aborted));
  let disposed = 0;
  const lostEvent = {preventDefault() {this.prevented = true;}};
  listeners.get('webglcontextlost')(lostEvent);
  assert.equal(lostEvent.prevented, true); assert.ok(requests.every(request => request.signal.aborted));
  assert.throws(() => scene.render(state()), /WebGL/);
  requests[0].resolve({dispose() {disposed++;}}); assert.equal(await pending, false);
  requests[1].resolve({dispose() {disposed++;}}); assert.equal(await treePending, false);
  requests[2].resolve({dispose() {disposed++;}}); assert.equal(await riderPending, false);
  assert.equal(disposed, 3);
  scene.dispose(); scene.dispose();
  assert.equal(renderers[0].disposes, 1); assert.equal(renderers[0].losses, 1); assert.equal(listeners.size, 0);
  assert.equal(await scene.setTripoVehicle(new ArrayBuffer(12)), false);
  assert.equal(await scene.setTripoTree(new ArrayBuffer(12)), false);
  assert.equal(await scene.setTripoRider(new ArrayBuffer(12)), false);
  assert.equal(requests.length, 3, 'disposed scenes must not launch a new model read');
});
