import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createBlastWorld} from '../src/blast-scene.js';
import {inspectMolesGLB} from '../src/moles-character.js';
import {shippedTripoBytes} from './tripo-fixture.mjs';
import {
  createBlastState, selectBlastTarget, setBlastType, plantBlast, detonateBlast,
  stepBlast, pauseBlast, resumeBlast, retryBlast,
} from '../src/blast-state.js';

function fixture(name = 'cargo.glb', dimensions = [2, 1, 1]) {
  const geometry = new THREE.BoxGeometry(...dimensions).toNonIndexed();
  const attributes = ['position', 'normal', 'uv'].map(key => geometry.attributes[key]);
  const binary = new Uint8Array(attributes.reduce((sum, attribute) => sum + attribute.array.byteLength, 0));
  let offset = 0;
  const bufferViews = attributes.map(attribute => {
    const view = {buffer: 0, byteOffset: offset, byteLength: attribute.array.byteLength};
    binary.set(new Uint8Array(attribute.array.buffer), offset); offset += attribute.array.byteLength; return view;
  });
  const json = {asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}],
    nodes: [{translation: [9, -4, 7], rotation: [0, Math.sin(.2), 0, Math.cos(.2)], mesh: 0}],
    meshes: [{primitives: [{attributes: {POSITION: 0, NORMAL: 1, TEXCOORD_0: 2}, material: 0}]}],
    materials: [{name: 'original cargo surface', pbrMetallicRoughness: {baseColorFactor: [.7, .3, .15, 1]}}],
    accessors: attributes.map((attribute, i) => ({bufferView: i, componentType: 5126,
      type: i === 2 ? 'VEC2' : 'VEC3', count: attribute.count,
      ...(i === 0 ? {min: dimensions.map(value => -value / 2), max: dimensions.map(value => value / 2)} : {})})),
    buffers: [{byteLength: binary.byteLength}], bufferViews};
  const text = new TextEncoder().encode(JSON.stringify(json)), padded = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(28 + padded + binary.length), header = new DataView(buffer);
  [0x46546c67, 2, buffer.byteLength, padded, 0x4e4f534a].forEach((value, i) => header.setUint32(i * 4, value, true));
  new Uint8Array(buffer, 20, padded).fill(32); new Uint8Array(buffer, 20, text.length).set(text);
  header.setUint32(20 + padded, binary.length, true); header.setUint32(24 + padded, 0x004e4942, true);
  new Uint8Array(buffer, 28 + padded).set(binary); geometry.dispose();
  return {buffer, name};
}

const props = world => world.scene.getObjectByName('blast-tripo-props').children;
const meshes = root => {
  const result = []; root.traverse(object => {if (object.isMesh) result.push(object);}); return result;
};
const bounds = root => new THREE.Box3().setFromObject(root, true);
const pose = world => props(world).map(root => [...root.position.toArray(), ...root.quaternion.toArray(), root.userData.status]);

test('real cargo sits on destructible floors; clicking its geometry selects that support with a valid placement point', async t => {
  const world = createBlastWorld(); t.after(() => world.destroy());
  assert.equal(typeof world.setTripoAssets, 'function');
  const state = createBlastState({layout: 'bridge'}), before = structuredClone(state);
  world.update(state);
  await world.setTripoAssets({sofa: fixture(), screen: fixture('tv.glb', [1.6, 1, .2]), car: fixture('car.glb', [3, 1, 1.4])});
  world.update(state);
  assert.deepEqual(state, before);
  assert.equal(props(world).length, 3);
  for (const root of props(world)) {
    const floor = state.pieces.find(piece => piece.id === root.userData.supportId);
    assert.equal(floor.kind, 'floor');
    assert.equal(root.userData.source, 'tripo');
    assert.ok(Math.abs(bounds(root).min.y - floor.position.y - floor.size.y / 2 - .02) < 1e-5);
    world.setView('front'); world.update(state);
    // Railings can occlude the center. Find an exposed patch of the real cargo
    // face rather than asking the picker to select through a solid rail.
    const box = bounds(root);
    let hit;
    for (const u of [.2, .4, .6, .8]) for (const v of [.2, .4, .6, .8]) {
      const point = new THREE.Vector3(THREE.MathUtils.lerp(box.min.x, box.max.x, u),
        THREE.MathUtils.lerp(box.min.y, box.max.y, v), box.max.z).project(world.camera);
      const candidate = world.pick(point.x, point.y);
      if (candidate?.source === 'tripo' && candidate.id === floor.id) hit = candidate;
    }
    assert.equal(hit?.id, floor.id, 'the visible imported object must select its real supporting floor');
    assert.equal(hit?.source, 'tripo');
    assert.equal(selectBlastTarget(state, hit.id, hit.point), true, 'cargo hit points must be clamped onto a valid structural target');
    assert.equal(plantBlast(state), true);
    state.markers = [];
  }
});

test('props tumble with a lost support, remain as grounded salvage, freeze on pause and reset without changing scoring', async t => {
  const world = createBlastWorld(); t.after(() => world.destroy());
  assert.equal(typeof world.setTripoAssets, 'function');
  const state = createBlastState({layout: 'bridge'});
  world.update(state); await world.setTripoAssets({car: fixture('car.glb', [3, 1, 1.4])}); world.update(state);
  const home = pose(world), root = props(world)[0], originalGeometry = meshes(root)[0].geometry;
  const supportId = root.userData.supportId;
  selectBlastTarget(state, supportId); setBlastType(state, 'wide'); plantBlast(state);
  const control = structuredClone(state);
  detonateBlast(state); detonateBlast(control);
  for (let i = 0; i < 24; i++) {
    stepBlast(state, 1 / 60); stepBlast(control, 1 / 60); world.update(state);
  }
  assert.notDeepEqual(pose(world), home);
  assert.equal(root.userData.status, 'falling');
  assert.ok(root.quaternion.x || root.quaternion.z, 'cargo needs visible tumbling, not only a status change');
  pauseBlast(state); const frozen = pose(world);
  for (let i = 0; i < 30; i++) {stepBlast(state, .1); world.update(state);}
  assert.deepEqual(pose(world), frozen);
  resumeBlast(state);
  for (let i = 0; i < 180; i++) {stepBlast(state, .1); stepBlast(control, .1); world.update(state);}
  assert.deepEqual(state, control, 'imported contents must preserve the existing support puzzle and scoring');
  assert.equal(root.userData.status, 'salvaged');
  assert.ok(bounds(root).min.y > -.001 && bounds(root).min.y < .07, 'the lowest actual rotated vertex must rest on the site');
  assert.equal(props(world)[0], root, 'falling cargo stays visible');
  world.update(retryBlast(state));
  assert.deepEqual(pose(world), home);
  assert.equal(meshes(props(world)[0])[0].geometry, originalGeometry, 'retry must reuse decoded geometry');
});

test('cargo poses depend on the structural snapshot rather than render frequency; every layout stays fitted', async t => {
  const a = createBlastWorld(), b = createBlastWorld(); t.after(() => {a.destroy(); b.destroy();});
  assert.equal(typeof a.setTripoAssets, 'function');
  await a.setTripoAssets({sofa: fixture()}); await b.setTripoAssets({sofa: fixture()});
  for (const layout of ['house', 'tower', 'bridge']) {
    const state = createBlastState({layout}); a.update(state); b.update(state);
    for (const view of ['left', 'front', 'right']) {
      a.setView(view); a.resize(320, 430); a.update(state);
      const box = bounds(props(a)[0]);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const projected = new THREE.Vector3(x, y, z).project(a.camera);
        assert.ok(Math.abs(projected.x) < .98 && Math.abs(projected.y) < .98);
      }
    }
    selectBlastTarget(state, props(a)[0].userData.supportId); setBlastType(state, 'wide'); plantBlast(state); detonateBlast(state);
    for (let i = 0; i < 180; i++) {stepBlast(state, 1 / 60); a.update(state); if (i % 6 === 0) b.update(state);}
    b.update(state);
    assert.deepEqual(pose(a), pose(b), 'late loading or a slow renderer must reproduce the same physical pose');
  }
});

test('failed/stale imports preserve playable assets; reloads and unmount release all private/shared resources once', async () => {
  const world = createBlastWorld();
  assert.equal(typeof world.setTripoAssets, 'function');
  const state = createBlastState(); world.update(state);
  await world.setTripoAssets({sofa: fixture()}); world.update(state);
  const original = props(world)[0];
  const failed = await world.setTripoAssets({sofa: {name: 'bad.glb', buffer: new ArrayBuffer(20)}});
  assert.equal(failed.failed.length, 1); world.update(state);
  assert.equal(props(world)[0], original);
  let released = 0; meshes(original)[0].geometry.addEventListener('dispose', () => released++);
  const first = world.setTripoAssets({sofa: fixture('stale.glb')});
  const last = world.setTripoAssets({sofa: fixture('latest.glb')});
  await Promise.all([first, last]); world.update(state);
  assert.equal(props(world)[0].userData.assetName, 'latest.glb'); assert.equal(released, 1);
  const disposals = new Map();
  for (const object of meshes(props(world)[0])) {
    for (const resource of [object.geometry, ...[object.material].flat()]) if (!disposals.has(resource)) {
      disposals.set(resource, 0); resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
    }
  }
  const late = world.setTripoAssets({tv: fixture('late.glb')});
  world.destroy(); world.destroy(); await late;
  assert.equal(world.scene.children.length, 0);
  assert.ok([...disposals.values()].every(count => count === 1));
});

test('the shipped sofa/TV/car keep their original UVs and PBR maps through placement, collapse and disposal', async t => {
  const savedSelf = globalThis.self, savedDecoder = globalThis.createImageBitmap, images = [];
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async blob => {
    assert.ok(blob.size > 0);
    const image = {width: 2048, height: 2048, digest: digest(Buffer.from(await blob.arrayBuffer())),
      closes: 0, close() {this.closes++;}};
    images.push(image); return image;
  };
  t.after(() => {
    if (savedSelf === undefined) delete globalThis.self; else globalThis.self = savedSelf;
    if (savedDecoder === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = savedDecoder;
  });
  const assets = Object.fromEntries(['sofa', 'tv', 'car'].map(kind => [kind, {
    buffer: shippedTripoBytes(kind), name: `${kind}.glb`,
  }]));
  const sources = Object.fromEntries(Object.entries(assets).map(([kind, {buffer: bytes}]) => {
    const json = inspectMolesGLB(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.match(json.asset.generator, /tripo/i);
    const binary = bytes.subarray(28 + bytes.readUInt32LE(12));
    return [kind, {vertices: json.meshes.flatMap(mesh => mesh.primitives)
      .reduce((sum, primitive) => sum + json.accessors[primitive.attributes.POSITION].count, 0),
    images: new Set(json.images.map(image => {
      const view = json.bufferViews[image.bufferView], start = view.byteOffset || 0;
      return digest(binary.subarray(start, start + view.byteLength));
    }))}];
  }));
  const world = createBlastWorld(); t.after(() => world.destroy());
  assert.equal(typeof world.setTripoAssets, 'function');
  const state = createBlastState({layout: 'bridge', difficulty: 'easy'}); world.update(state);
  const result = await world.setTripoAssets(assets); world.update(state);
  assert.deepEqual(result.loaded.sort(), ['car', 'sofa', 'tv']); assert.deepEqual(result.failed, []);
  for (const root of props(world)) {
    let vertices = 0;
    for (const mesh of meshes(root)) {
      vertices += mesh.geometry.attributes.position.count;
      assert.equal(mesh.geometry.attributes.uv.count, mesh.geometry.attributes.position.count);
      for (const material of [mesh.material].flat()) {
        assert.ok(sources[root.userData.kind].images.has(material.map?.image.digest),
          'each object must use the embedded atlas from its own generated GLB');
        assert.ok(material.normalMap && material.roughnessMap, 'real PBR material bindings must survive');
      }
    }
    assert.ok(vertices > 10000, 'a label or proxy box cannot substitute for the generated model');
    assert.equal(vertices, sources[root.userData.kind].vertices);
    const floor = state.pieces.find(piece => piece.id === root.userData.supportId);
    assert.ok(Math.abs(bounds(root).min.y - floor.position.y - floor.size.y / 2 - .02) < .001);
    selectBlastTarget(state, floor.id); setBlastType(state, 'wide'); plantBlast(state);
  }
  assert.equal(state.markers.length, 3, 'each real object provides a usable structural target');
  detonateBlast(state);
  for (let i = 0; i < 720; i++) {stepBlast(state, 1 / 60); world.update(state);}
  assert.ok(props(world).every(root => root.userData.status === 'salvaged'));
  for (const root of props(world).filter(root => root.userData.status === 'salvaged')) {
    assert.ok(bounds(root).min.y >= -.001 && bounds(root).min.y < .07);
  }
  const geometry = new Map(props(world).map(root => [root.userData.kind, meshes(root)[0].geometry]));
  for (const layout of ['house', 'tower']) {
    const next = createBlastState({layout, difficulty: 'easy'}); world.update(next);
    world.setView('front');
    for (const root of props(world)) {
      const point = bounds(root).getCenter(new THREE.Vector3()).project(world.camera);
      const hit = world.pick(point.x, point.y);
      assert.equal(hit?.source, 'tripo', `${layout}/${root.userData.kind}: actual contents must be visible and selectable through the open bay`);
      assert.equal(hit?.id, root.userData.supportId);
    }
    for (const root of props(world)) {
      assert.equal(meshes(root)[0].geometry, geometry.get(root.userData.kind));
      selectBlastTarget(next, root.userData.supportId); setBlastType(next, 'wide'); assert.equal(plantBlast(next), true);
    }
    detonateBlast(next);
    for (let i = 0; i < 720; i++) {stepBlast(next, 1 / 60); world.update(next);}
    for (const root of props(world)) {
      assert.equal(root.userData.status, 'salvaged');
      assert.ok(bounds(root).min.y >= -.001 && bounds(root).min.y < .07, `${layout}/${root.userData.kind}: floating or sunken salvage`);
    }
  }
  world.destroy();
  assert.ok(images.length >= 6 && images.every(image => image.closes === 1));
});
