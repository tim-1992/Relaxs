import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMolesCharacterAsset} from '../src/moles-character.js';
import {createCrusherCarAsset, loadCrusherCar} from '../src/crusher-model-loader.js';
import {createCrusherWorld} from '../src/crusher-scene.js';
import {createCrusherState, feedCrusher, stepCrusher, beginCrusherPressure, releaseCrusherPressure} from '../src/crusher-state.js';

function carGLB() {
  const geometry = new THREE.BoxGeometry(4.4, 1.45, 1.8).toNonIndexed();
  const names = ['position', 'normal', 'uv'], binary = [];
  const views = [], accessors = [];
  for (const name of names) {
    const attribute = geometry.attributes[name];
    views.push({buffer: 0, byteOffset: binary.length, byteLength: attribute.array.byteLength});
    binary.push(...new Uint8Array(attribute.array.buffer));
    accessors.push({bufferView: views.length - 1, componentType: 5126, count: attribute.count,
      type: attribute.itemSize === 3 ? 'VEC3' : 'VEC2',
      ...(name === 'position' ? {min: [-2.2, -.725, -.9], max: [2.2, .725, .9]} : {})});
  }
  const json = {asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}], nodes: [{mesh: 0}],
    meshes: [{primitives: [{attributes: {POSITION: 0, NORMAL: 1, TEXCOORD_0: 2}, material: 0}]}],
    materials: [{name: 'Tripo paint', pbrMetallicRoughness: {baseColorFactor: [.12, .18, .22, 1], metalnessFactor: .7, roughnessFactor: .35}}],
    buffers: [{byteLength: binary.length}], bufferViews: views, accessors};
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const result = new ArrayBuffer(12 + 8 + jsonLength + 8 + binary.length);
  const header = new DataView(result);
  [0x46546c67, 2, result.byteLength, jsonLength, 0x4e4f534a].forEach((n, i) => header.setUint32(i * 4, n, true));
  new Uint8Array(result, 20, jsonLength).fill(32);
  new Uint8Array(result, 20, text.length).set(text);
  header.setUint32(20 + jsonLength, binary.length, true);
  header.setUint32(24 + jsonLength, 0x004e4942, true);
  new Uint8Array(result, 28 + jsonLength).set(binary);
  geometry.dispose();
  return result;
}

test('actual embedded GLB loads as fitted, UV-preserving fracture parts, not a decorative second car', async () => {
  const asset = await loadCrusherCar({buffer: carGLB(), name: 'generated-car.glb'});
  assert.equal(asset.name, 'generated-car.glb');
  assert.equal(asset.model.name, 'crusher-car');
  assert.ok(asset.model.children.length > 1, 'a single source mesh needs actual breakable surface pieces');
  asset.model.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(asset.model, true).getSize(new THREE.Vector3());
  assert.ok(size.x > 2 && size.x <= 2.66);
  assert.ok(size.z < 1.15 && size.y < 1.2);
  for (const part of asset.model.children) {
    assert.ok(part.geometry.attributes.uv?.count > 0);
    assert.ok(part.geometry.attributes.normal?.count > 0);
    assert.ok(part.material.metalness > .6);
  }
  asset.dispose();
});

test('normalizing and deforming an imported instance never changes shared source vertices, materials or textures', () => {
  const source = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1.8, 1.45, 4.4);
  const map = new THREE.DataTexture(new Uint8Array([150, 170, 180, 255]), 1, 1);
  const material = new THREE.MeshStandardMaterial({color: '#40596c', map, metalness: .8});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = .12;
  source.add(mesh);
  const before = geometry.attributes.position.array.slice(), color = material.color.clone();
  let released = 0, mapReleased = 0;
  geometry.addEventListener('dispose', () => released++);
  map.addEventListener('dispose', () => mapReleased++);
  const asset = createCrusherCarAsset(createMolesCharacterAsset({scene: source}, 'painted.glb'));
  const part = asset.model.children[0];
  assert.notEqual(part.geometry, geometry);
  assert.notEqual(part.material, material);
  assert.equal(part.material.map, map, 'keep the source texture alive rather than losing its atlas');
  part.geometry.attributes.position.setY(0, 999);
  part.material.color.set('#ffffff');
  assert.deepEqual(geometry.attributes.position.array, before);
  assert.deepEqual(material.color, color);
  assert.equal(released, 0);
  assert.equal(mapReleased, 0);
  asset.dispose(); asset.dispose();
  assert.equal(released, 1);
  assert.equal(mapReleased, 1);
});

test('partitioned GLB surfaces retain the correct material groups, colors, normals, tangents and UVs', () => {
  const geometry = new THREE.BoxGeometry(4.4, 1.4, 1.8).toNonIndexed();
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  const tangents = new Float32Array(geometry.attributes.position.count * 4);
  const materials = [];
  for (const {start, count, materialIndex} of geometry.groups) {
    materials[materialIndex] = new THREE.MeshStandardMaterial({name: `surface-${materialIndex}`, vertexColors: true});
    for (let v = start; v < start + count; v++) {
      colors.set([materialIndex / 8, .25, .5], v * 3);
      tangents.set([1, 0, 0, -1], v * 4);
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('tangent', new THREE.BufferAttribute(tangents, 4));
  const source = new THREE.Group();
  source.add(new THREE.Mesh(geometry, materials));
  const asset = createCrusherCarAsset(createMolesCharacterAsset({scene: source}, 'six-surfaces.glb'));
  let triangles = 0;
  const seen = new Set();
  for (const part of asset.model.children) {
    const {normal, uv, color, tangent, position} = part.geometry.attributes;
    assert.equal(normal.count, position.count); assert.equal(uv.count, position.count);
    assert.equal(tangent.count, position.count);
    for (const {start, count, materialIndex} of part.geometry.groups) {
      const material = part.material[materialIndex];
      assert.equal(material.name, `surface-${materialIndex}`);
      assert.notEqual(material, materials[materialIndex]);
      seen.add(materialIndex);
      for (let v = start; v < start + count; v++) {
        assert.equal(color.getX(v), materialIndex / 8);
        assert.equal(tangent.getW(v), -1);
      }
      triangles += count / 3;
    }
  }
  assert.equal(triangles, geometry.attributes.position.count / 3);
  assert.equal(seen.size, 6);
  asset.dispose();
});

test('loaded Tripo car is the selected feed/press/fracture/eject object with world-Y compression and safe grounding', async () => {
  const world = createCrusherWorld();
  await world.loadTripoCar({buffer: carGLB(), name: 'actual-car.glb'});
  let state = createCrusherState();
  world.render(state);
  const car = world.scene.getObjectByName('crusher-car');
  assert.equal(car.userData.source, 'tripo');
  assert.equal(world.scene.getObjectByName('crusher-toys').children.filter(item => item.name === 'crusher-car').length, 1);
  const original = new THREE.Box3().setFromObject(car, true), originalX = car.position.x;
  state = stepCrusher(feedCrusher(state), 1.3);
  world.render(state);
  assert.ok(car.position.x > originalX + 2);
  state = releaseCrusherPressure(stepCrusher(beginCrusherPressure(state), .69 / .38));
  world.render(stepCrusher(state, .65));
  const flattened = new THREE.Box3().setFromObject(car, true);
  assert.ok(flattened.max.y - flattened.min.y < (original.max.y - original.min.y) * .35);
  assert.ok(flattened.min.y >= .90);
  const part = car.children[0], pose = part.position.clone();
  world.render(stepCrusher(state, 1.45));
  assert.ok(part.position.distanceTo(pose) > .02);
  world.render(stepCrusher(state, 3.2));
  assert.ok(car.position.x > 2);
  assert.ok(new THREE.Box3().setFromObject(car, true).min.y >= .96 - 1e-6);
  world.dispose();
});

test('bad and aborted assets keep the working local model; unmount cannot attach a late load', async () => {
  const world = createCrusherWorld();
  const local = world.scene.getObjectByName('crusher-car');
  await assert.rejects(world.loadTripoCar({buffer: new ArrayBuffer(12), name: 'broken.glb'}));
  assert.equal(world.scene.getObjectByName('crusher-car'), local);
  const pending = world.loadTripoCar({buffer: carGLB(), name: 'late.glb'});
  world.dispose();
  await assert.rejects(pending, {name: 'AbortError'});
  assert.equal(world.scene.children.length, 0);
});

test('replacement loads dispose private resources once and superseded requests cannot replace the newer car', async () => {
  const world = createCrusherWorld();
  const first = world.loadTripoCar({buffer: carGLB(), name: 'superseded.glb'});
  const second = world.loadTripoCar({buffer: carGLB(), name: 'current.glb'});
  await assert.rejects(first, {name: 'AbortError'});
  assert.equal(await second, 'current.glb');
  const old = world.scene.getObjectByName('crusher-car');
  const resources = new Set();
  old.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    [object.material].flat().filter(Boolean).forEach(material => resources.add(material));
  });
  const released = new Map([...resources].map(resource => [resource, 0]));
  resources.forEach(resource => resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1)));
  await world.loadTripoCar({buffer: carGLB(), name: 'replacement.glb'});
  assert.equal(old.parent, null);
  assert.equal(world.scene.getObjectByName('crusher-car').userData.assetName, 'replacement.glb');
  world.dispose();
  for (const count of released.values()) assert.equal(count, 1);
});
