import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {existsSync, readFileSync} from 'node:fs';

const api = await import('../src/ride-tripo-rider.js');
const near = (actual, expected, tolerance = .025) => assert.ok(actual.distanceTo(new THREE.Vector3(...expected)) < tolerance,
  `${actual.toArray()} is not near ${expected}`);
const bone = (instance, suffix) => {
  let result;
  instance.group.traverse(object => {if (object.isBone && object.name.endsWith(suffix)) result = object;});
  assert.ok(result, suffix); return result;
};
const local = (instance, suffix) => instance.group.worldToLocal(bone(instance, suffix).getWorldPosition(new THREE.Vector3()));
const body = instance => instance.group.getObjectByName('test-rider-body');

function fixture({skinned = true, yaw = .67} = {}) {
  const scene = new THREE.Group(); scene.rotation.y = yaw;
  const bones = [];
  const joint = (name, parent, position) => {
    const object = new THREE.Bone(); object.name = `mixamorig:${name}`; object.position.set(...position);
    parent.add(object); bones.push(object); return object;
  };
  const hips = joint('Hips', scene, [0, 1, 0]), spine = joint('Spine', hips, [0, .18, 0]);
  const spine1 = joint('Spine1', spine, [0, .18, 0]), chest = joint('Spine2', spine1, [0, .16, 0]);
  const neck = joint('Neck', chest, [0, .09, 0]), head = joint('Head', neck, [0, .12, 0]);
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    const shoulder = joint(`${side}Shoulder`, chest, [sign * .10, .02, 0]);
    const arm = joint(`${side}Arm`, shoulder, [sign * .12, 0, 0]);
    const lower = joint(`${side}ForeArm`, arm, [sign * .30, 0, 0]);
    const hand = joint(`${side}Hand`, lower, [sign * .27, 0, 0]);
    joint(`${side}HandMiddle1`, hand, [sign * .10, 0, 0]);
    const thigh = joint(`${side}UpLeg`, hips, [sign * .13, -.06, 0]);
    const calf = joint(`${side}Leg`, thigh, [0, -.44, 0]);
    const foot = joint(`${side}Foot`, calf, [0, -.43, 0]);
    joint(`${side}ToeBase`, foot, [0, -.045, .14]);
  }
  const data = {position: [], normal: [], uv: [], skinIndex: [], skinWeight: []};
  const add = (size, center, name) => {
    const geometry = new THREE.BoxGeometry(...size, 4, 4, 4).toNonIndexed(); geometry.translate(...center);
    const count = geometry.attributes.position.count, index = bones.findIndex(b => b.name.endsWith(`:${name}`));
    for (const key of ['position', 'normal', 'uv']) data[key].push(...geometry.attributes[key].array);
    for (let i = 0; i < count; i++) {data.skinIndex.push(index, 0, 0, 0); data.skinWeight.push(1, 0, 0, 0);}
    geometry.dispose();
  };
  add([.42, .55, .24], [0, 1.3, 0], 'Spine1');
  add([.30, .34, .32], [0, 1.81, .015], 'Head');
  for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
    add([.30, .12, .13], [sign * .37, 1.54, 0], `${side}Arm`);
    add([.27, .10, .11], [sign * .655, 1.54, 0], `${side}ForeArm`);
    add([.16, .10, .14], [sign * .85, 1.54, 0], `${side}Hand`);
    add([.16, .44, .18], [sign * .13, .72, 0], `${side}UpLeg`);
    add([.12, .43, .13], [sign * .13, .285, 0], `${side}Leg`);
    add([.13, .13, .27], [sign * .13, .08, .08], `${side}Foot`);
  }
  const geometry = new THREE.BufferGeometry();
  for (const [key, values] of Object.entries(data)) {
    geometry.setAttribute(key, key === 'skinIndex' ? new THREE.Uint16BufferAttribute(values, 4)
      : new THREE.Float32BufferAttribute(values, key === 'uv' ? 2 : key === 'skinWeight' ? 4 : 3));
  }
  const texture = new THREE.DataTexture(new Uint8Array(16).fill(255), 2, 2);
  const material = new THREE.MeshStandardMaterial({map: texture});
  const mesh = skinned ? new THREE.SkinnedMesh(geometry, material) : new THREE.Mesh(geometry, material);
  mesh.name = 'test-rider-body'; scene.add(mesh); scene.updateMatrixWorld(true);
  if (skinned) mesh.bind(new THREE.Skeleton(bones));
  return {scene, scenes: [scene], mesh, bones, head};
}

function makeAsset(options) {
  assert.equal(typeof api.createRideTripoRider, 'function');
  return api.createRideTripoRider(fixture(options), {name: 'Test rider'});
}

test('six riders share geometry/textures but own independent bones, bindings and disposal', t => {
  const asset = makeAsset(); t.after(() => asset.dispose());
  assert.equal(asset.skinned, true); assert.equal(asset.rigged, true); assert.equal(asset.forward, '-Z');
  const riders = Array.from({length: 6}, () => asset.createInstance());
  for (const rider of riders) assert.equal(rider.rigged, true);
  const a = body(riders[0]), b = body(riders[1]);
  assert.equal(a.geometry, b.geometry); assert.equal(a.material.map, b.material.map);
  assert.notEqual(a.skeleton, b.skeleton); assert.notEqual(a.skeleton.bones[0], b.skeleton.bones[0]);
  assert.notEqual(a.skeleton.boneInverses[0], b.skeleton.boneInverses[0]);
  const frozen = bone(riders[1], 'LeftForeArm').quaternion.clone();
  riders[0].update({time: .4, attackSide: -1, attackTime: .15});
  assert.deepEqual(bone(riders[1], 'LeftForeArm').quaternion.toArray(), frozen.toArray());
  let geometryReleased = 0, textureReleased = 0, boneTextureReleased = 0;
  a.geometry.addEventListener('dispose', () => geometryReleased++);
  a.material.map.addEventListener('dispose', () => textureReleased++);
  a.skeleton.computeBoneTexture();
  a.skeleton.boneTexture.addEventListener('dispose', () => boneTextureReleased++);
  riders[0].dispose(); riders[0].dispose();
  assert.equal(boneTextureReleased, 1); assert.equal(geometryReleased, 0); assert.equal(textureReleased, 0);
  assert.ok(riders[1].group.children.length > 0);
  asset.dispose(); asset.dispose();
  assert.equal(geometryReleased, 1); assert.equal(textureReleased, 1);
  for (const rider of riders) assert.equal(rider.group.children.length, 0);
  assert.throws(() => asset.createInstance(), /释放|disposed/i);
});

test('real joints form the motorcycle pose in metres and survive a transformed parent', t => {
  const asset = makeAsset(); t.after(() => asset.dispose());
  const rider = asset.createInstance();
  near(local(rider, 'Hips'), [0, 1.055, .29], 1e-6);
  near(rider.group.worldToLocal(rider.getHeadPosition()), [0, 1.72, -.215], .18);
  assert.ok(Math.abs(rider.getHeadPosition().y - 1.72) < .015);
  for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
    near(local(rider, `${side}Hand`), [sign * .29, 1.105, -.535], .035);
    near(local(rider, `${side}Foot`), [sign * .27, .48, .14], .035);
    assert.ok(local(rider, `${side}Leg`).z < local(rider, `${side}Foot`).z - .10, 'knee bends forward over the tank');
    assert.ok(local(rider, `${side}ToeBase`).z < local(rider, `${side}Foot`).z, 'boots point along game -Z');
  }
  rider.group.position.set(8, 2, -4); rider.group.rotation.set(.1, .9, -.3); rider.group.scale.setScalar(1.3);
  rider.update({time: 0});
  near(local(rider, 'Hips'), [0, 1.055, .29], 1e-6);
  near(local(rider, 'LeftHand'), [-.29, 1.105, -.535], .035);
  const transformedSkin = rider.group.worldToLocal(vertexAt(rider, 'LeftHand'));
  rider.group.position.set(0, 0, 0); rider.group.rotation.set(0, 0, 0); rider.group.scale.setScalar(1);
  rider.update();
  near(vertexAt(rider, 'LeftHand'), transformedSkin.toArray(), 1e-7);
});

function vertexAt(instance, suffix) {
  const mesh = body(instance), joints = mesh.geometry.attributes.skinIndex;
  const index = mesh.skeleton.bones.findIndex(b => b.name.endsWith(suffix));
  let vertex = 0; while (vertex < joints.count && joints.getX(vertex) !== index) vertex++;
  assert.ok(vertex < joints.count);
  return mesh.getVertexPosition(vertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
}

test('pushes and fall flails deform actual skin deterministically without moving the owned root', t => {
  const asset = makeAsset(); t.after(() => asset.dispose());
  const rider = asset.createInstance(), grip = local(rider, 'LeftHand'), skin = vertexAt(rider, 'LeftHand');
  const root = rider.group.matrix.clone();
  rider.update({time: .5, attackSide: -1, attackTime: .15});
  assert.ok(local(rider, 'LeftHand').x < grip.x - .3);
  near(local(rider, 'RightHand'), [.29, 1.105, -.535], .035);
  assert.ok(vertexAt(rider, 'LeftHand').distanceTo(skin) > .2, 'rotating a wrapper cannot satisfy actual vertex deformation');
  const posed = vertexAt(rider, 'LeftHand');
  rider.update({time: .5, attackSide: -1, attackTime: .15});
  near(vertexAt(rider, 'LeftHand'), posed.toArray(), 1e-8);
  rider.update({time: .5, fallProgress: .4, fallSide: -1});
  const hand = local(rider, 'LeftHand'), foot = local(rider, 'LeftFoot');
  rider.update({time: .7, fallProgress: .4, fallSide: -1});
  assert.ok(local(rider, 'LeftHand').distanceTo(hand) > .03);
  assert.ok(local(rider, 'LeftFoot').distanceTo(foot) > .03);
  assert.deepEqual(rider.group.matrix.toArray(), root.toArray(), 'ride-scene exclusively owns whole-body falls');
  rider.update({time: Infinity, attackTime: NaN, fallProgress: -10});
  near(local(rider, 'LeftHand'), [-.29, 1.105, -.535], .035);
});

test('white back number is real skinned geometry sharing the shirt skeleton', t => {
  const asset = makeAsset(); t.after(() => asset.dispose());
  const rider = asset.createInstance(), label = rider.group.getObjectByName('ride-jersey-back');
  assert.ok(label?.isSkinnedMesh);
  assert.equal(label.skeleton, label.parent.skeleton);
  assert.equal(label.material.color.getHexString(), 'ffffff');
  assert.equal(label.userData.jersey.number, '3');
  assert.equal(label.userData.jersey.side, 'back');
  const pixels = label.material.map.image.data;
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 128));
  assert.ok(label.geometry.attributes.skinWeight.count > 0);
  const before = label.getVertexPosition(0, new THREE.Vector3()).applyMatrix4(label.matrixWorld);
  rider.group.position.set(6, 2, -3); rider.group.rotation.y = 1; rider.update();
  const after = rider.group.worldToLocal(label.getVertexPosition(0, new THREE.Vector3()).applyMatrix4(label.matrixWorld));
  near(after, before.toArray(), 1e-7);
});

test('unskinned T-pose and incomplete rigs are reported honestly and cannot masquerade as seated riders', () => {
  const asset = makeAsset({skinned: false});
  assert.equal(asset.skinned, false); assert.equal(asset.rigged, false);
  assert.throws(() => asset.createInstance(), /骨骼|rig/i);
  asset.dispose();
  const gltf = fixture(); gltf.bones.find(b => b.name.endsWith('RightFoot')).name = 'missing-foot';
  const incomplete = api.createRideTripoRider(gltf);
  assert.equal(incomplete.skinned, true); assert.equal(incomplete.rigged, false);
  assert.throws(() => incomplete.createInstance(), /骨骼|rig/i); incomplete.dispose();
});

function binaryRig({textured = false, collapsed = false} = {}) {
  const gltf = fixture({yaw: 0}), nodes = [], objects = [];
  gltf.scene.traverse(object => {objects.push(object); nodes.push({name: object.name});});
  const json = {asset: {version: '2.0'}, scenes: [{nodes: [0]}], scene: 0, nodes, meshes: [],
    skins: [], materials: [{pbrMetallicRoughness: {baseColorFactor: [.3, .3, .3, 1]}}], accessors: [], bufferViews: [], buffers: []};
  const blocks = []; let length = 0;
  const accessor = (array, components, type, min, max) => {
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const view = json.bufferViews.length; json.bufferViews.push({buffer: 0, byteOffset: length, byteLength: bytes.length});
    blocks.push({offset: length, bytes: bytes.slice()}); length += Math.ceil(bytes.length / 4) * 4;
    json.accessors.push({bufferView: view, componentType: type, count: array.length / components,
      type: {2: 'VEC2', 3: 'VEC3', 4: 'VEC4', 16: 'MAT4'}[components], ...(min ? {min, max} : {})});
    return json.accessors.length - 1;
  };
  for (let index = 0; index < objects.length; index++) {
    const object = objects[index], node = nodes[index];
    node.translation = object.position.toArray(); node.rotation = object.quaternion.toArray(); node.scale = object.scale.toArray();
    if (object.children.length) node.children = object.children.map(child => objects.indexOf(child));
    if (object.isSkinnedMesh) {
      const attributes = {}, names = {position: 'POSITION', normal: 'NORMAL', uv: 'TEXCOORD_0', skinIndex: 'JOINTS_0', skinWeight: 'WEIGHTS_0'};
      object.geometry.computeBoundingBox();
      for (const [key, value] of Object.entries(object.geometry.attributes)) attributes[names[key]] = accessor(value.array, value.itemSize,
        key === 'skinIndex' ? 5123 : 5126, key === 'position' ? object.geometry.boundingBox.min.toArray() : null,
        key === 'position' ? object.geometry.boundingBox.max.toArray() : null);
      node.mesh = json.meshes.length; json.meshes.push({primitives: [{attributes, material: 0}]});
      node.skin = 0; json.skins.push({joints: object.skeleton.bones.map(joint => objects.indexOf(joint)),
        inverseBindMatrices: accessor(new Float32Array(object.skeleton.boneInverses.flatMap(matrix => matrix.toArray())), 16, 5126)});
    }
  }
  if (textured) {
    json.images = [{uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XkAAAAASUVORK5CYII='}];
    json.textures = [{source: 0}]; json.materials[0].pbrMetallicRoughness.baseColorTexture = {index: 0};
  }
  if (collapsed) json.nodes[0].scale = [0, 0, 0];
  json.buffers.push({byteLength: length});
  const text = new TextEncoder().encode(JSON.stringify(json)), padded = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(28 + padded + length), bytes = new Uint8Array(buffer), view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + padded); bytes.set(text, 20);
  view.setUint32(20 + padded, length, true); view.setUint32(24 + padded, 0x004e4942, true);
  for (const block of blocks) bytes.set(block.bytes, 28 + padded + block.offset);
  gltf.mesh.geometry.dispose(); gltf.mesh.material.map.dispose(); gltf.mesh.material.dispose(); gltf.mesh.skeleton.dispose();
  return buffer;
}

test('the real GLTFLoader accepts inline rig bytes, rejects oversized data and respects cancellation', async t => {
  assert.equal(typeof api.loadRideTripoRider, 'function');
  const asset = await api.loadRideTripoRider(binaryRig(), {name: 'Embedded rider'}); t.after(() => asset.dispose());
  assert.equal(asset.rigged, true); assert.equal(asset.createInstance().rigged, true);
  await assert.rejects(api.loadRideTripoRider(new ArrayBuffer(20 * 1024 * 1024 + 1)), /20|MB/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(api.loadRideTripoRider(binaryRig(), {signal: abort.signal}), {name: 'AbortError'});
});

test('failed fitting releases parsed images, and abort also releases a late image decode', async t => {
  const savedSelf = globalThis.self, decoder = globalThis.createImageBitmap;
  let decoded = 0, closed = 0;
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async () => {decoded++; return {width: 1, height: 1, close() {closed++;}};};
  t.after(() => {globalThis.self = savedSelf; globalThis.createImageBitmap = decoder;});
  await assert.rejects(api.loadRideTripoRider(binaryRig({textured: true, collapsed: true})), /骨骼|尺寸/);
  assert.equal(decoded, 1); assert.equal(closed, 1);

  let finishDecode, decoding;
  const started = new Promise(resolve => {decoding = resolve;});
  globalThis.createImageBitmap = () => new Promise(resolve => {
    finishDecode = () => {decoded++; resolve({width: 1, height: 1, close() {closed++;}});};
    decoding();
  });
  const abort = new AbortController();
  const loading = api.loadRideTripoRider(binaryRig({textured: true}), {signal: abort.signal});
  const rejected = assert.rejects(loading, {name: 'AbortError'});
  await started; abort.abort(); await rejected;
  finishDecode();
  for (let i = 0; i < 30 && closed < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(decoded, 2); assert.equal(closed, 2, 'the asset pool owns late dependencies even after cancellation');
});

const realPath = ['game.glb', 'model.glb'].map(file => new URL(`../artifacts/tripo/rider-rig/${file}`, import.meta.url)).find(existsSync);
test('the actual rigged Tripo rider reaches grips and pegs through its real bind skin', {skip: !realPath}, async t => {
  const savedSelf = globalThis.self, decoder = globalThis.createImageBitmap;
  let decoded = 0, closed = 0;
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async blob => {
    assert.ok(blob.size > 0); decoded++;
    return {width: 2048, height: 2048, close() {closed++;}};
  };
  t.after(() => {globalThis.self = savedSelf; globalThis.createImageBitmap = decoder;});
  const asset = await api.loadRideTripoRider(readFileSync(realPath));
  try {
    assert.equal(asset.skinned, true); assert.equal(asset.rigged, true);
    const rider = asset.createInstance();
    for (const [side, sign] of [['Left', -1], ['Right', 1]]) {
      near(local(rider, `${side}Hand`), [sign * .29, 1.105, -.535], .07);
      near(local(rider, `${side}Foot`), [sign * .27, .48, .14], .04);
    }
    assert.ok(rider.group.getObjectByName('ride-jersey-back')?.isSkinnedMesh);
    let mesh;
    rider.group.traverse(object => {if (object.isSkinnedMesh && object.name !== 'ride-jersey-back') mesh ||= object;});
    const handIndex = mesh.skeleton.bones.findIndex(joint => joint.name.endsWith('RightHand'));
    const weights = mesh.geometry.attributes.skinWeight, joints = mesh.geometry.attributes.skinIndex;
    let handVertex = -1;
    for (let i = 0; i < weights.count && handVertex < 0; i++)
      for (let j = 0; j < 4; j++) if (joints.getComponent(i, j) === handIndex && weights.getComponent(i, j) > .7) handVertex = i;
    assert.ok(handVertex >= 0, 'the actual export has right-hand-weighted skin');
    const vertex = () => mesh.getVertexPosition(handVertex, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const neutral = vertex(), grip = local(rider, 'RightHand'), left = local(rider, 'LeftHand');
    assert.ok(neutral.distanceTo(grip) < .24, 'neutral glove geometry follows the grip joint, not a stale bind transform');
    const glove = new THREE.Vector3(); let gloveCount = 0;
    for (let i = 0; i < weights.count; i++) {
      let weight = 0;
      for (let j = 0; j < 4; j++) if (joints.getComponent(i, j) === handIndex) weight += weights.getComponent(i, j);
      if (weight > .6) {glove.add(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)); gloveCount++;}
    }
    glove.divideScalar(gloveCount).sub(grip);
    assert.ok(glove.angleTo(new THREE.Vector3(.02, -.045, -.12)) < .2,
      `glove should extend forward from wrist toward bars, even without finger joints: ${glove.toArray()}`);
    rider.update({time: .5, attackTime: .15, attackSide: 1});
    assert.ok(local(rider, 'RightHand').x > grip.x + .25);
    assert.ok(vertex().distanceTo(neutral) > .20, 'actual GLB skin moves with the pushing arm');
    near(local(rider, 'LeftHand'), left.toArray(), 1e-6);
    rider.update();
    near(vertex(), neutral.toArray(), 1e-6);
    assert.ok(decoded > 0);
  } finally {asset.dispose();}
  assert.equal(closed, decoded);
});
