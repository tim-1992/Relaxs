import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as scene from '../src/slice-scene.js';
import {createMolesCharacterAsset} from '../src/moles-character.js';

const item = (id, color = 'peach', extra = {}) => ({
  id, kind: 'fruit', color, x: 120, y: 80, z: 0, r: 30, rotation: 0, ...extra,
});
const view = extra => ({width: 960, height: 600, time: 0, objects: [], fragments: [], particles: [], trail: [], ...extra});

function orangeGLB() {
  const geometry = new THREE.SphereGeometry(2, 20, 12).toNonIndexed();
  const binary = [], bufferViews = [], accessors = [];
  for (const [name, type] of [['position', 'VEC3'], ['normal', 'VEC3'], ['uv', 'VEC2']]) {
    const attribute = geometry.attributes[name];
    bufferViews.push({buffer: 0, byteOffset: binary.length, byteLength: attribute.array.byteLength});
    binary.push(...new Uint8Array(attribute.array.buffer));
    accessors.push({bufferView: bufferViews.length - 1, componentType: 5126, count: attribute.count, type,
      ...(name === 'position' ? {min: [-2, -2, -2], max: [2, 2, 2]} : {})});
  }
  const json = {asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}],
    nodes: [{mesh: 0, scale: [3, 3, 3], translation: [5, 2, -3]}],
    meshes: [{name: 'generated-orange', primitives: [{attributes: {POSITION: 0, NORMAL: 1, TEXCOORD_0: 2}, material: 0}]}],
    materials: [{name: 'photographed peel', pbrMetallicRoughness: {baseColorFactor: [.93, .38, .04, 1], roughnessFactor: .72}}],
    buffers: [{byteLength: binary.length}], bufferViews, accessors};
  const text = new TextEncoder().encode(JSON.stringify(json)), size = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(28 + size + binary.length), header = new DataView(buffer);
  [0x46546c67, 2, buffer.byteLength, size, 0x4e4f534a].forEach((value, i) => header.setUint32(i * 4, value, true));
  new Uint8Array(buffer, 20, size).fill(32); new Uint8Array(buffer, 20, text.length).set(text);
  header.setUint32(20 + size, binary.length, true); header.setUint32(24 + size, 0x004e4942, true);
  new Uint8Array(buffer, 28 + size).set(binary); geometry.dispose();
  return buffer;
}

function volume(geometry) {
  const position = geometry.attributes.position, points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let sum = 0;
  for (let i = 0; i < (geometry.index?.count ?? position.count); i += 3) {
    points.forEach((point, j) => point.fromBufferAttribute(position, geometry.index ? geometry.index.getX(i + j) : i + j));
    sum += points[0].dot(points[1].cross(points[2])) / 6;
  }
  return Math.abs(sum);
}

test('clipping interpolates the original UVs at new peel vertices', () => {
  assert.equal(typeof scene.cappedHalf, 'function');
  const source = new THREE.BufferGeometry();
  source.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0], 3));
  source.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  source.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2));
  const half = scene.cappedHalf(source, 1);
  const {position, uv} = half.attributes;
  assert.equal(uv.count, position.count);
  const boundary = new Set();
  for (let i = 0; i < position.count; i++) if (position.getX(i) === 0) {
    boundary.add(`${uv.getX(i)},${uv.getY(i)}`);
  }
  assert.ok(boundary.has('0.5,0'));
  assert.ok(boundary.has('0.5,0.5'));
  assert.deepEqual([...source.attributes.uv.array], [0, 0, 1, 0, 1, 1]);
  source.dispose(); half.dispose();
});

test('multi-material imported halves keep peel groups and seal a UV-mapped outward cross-section', () => {
  assert.equal(typeof scene.cappedHalf, 'function');
  const source = new THREE.BoxGeometry(2, 2, 2);
  let combined = 0;
  for (const side of [-1, 1]) {
    const half = scene.cappedHalf(source, side, {materialCount: 6});
    combined += volume(half);
    const cap = half.groups.find(group => group.materialIndex === 6);
    assert.ok(cap?.count >= 6);
    assert.ok(half.groups.some(group => group.materialIndex > 0 && group.materialIndex < 6), 'original skin groups were lost');
    const {position, normal, uv} = half.attributes;
    for (let i = 0; i < position.count; i++) assert.ok(position.getX(i) * side >= -1e-7);
    for (let i = cap.start; i < cap.start + cap.count; i++) {
      assert.equal(position.getX(i), 0); assert.equal(normal.getX(i), -side);
      assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1);
    }
    const materials = Array.from({length: 7}, () => new THREE.MeshBasicMaterial());
    const ray = new THREE.Raycaster(new THREE.Vector3(-side * 3, .2, .3), new THREE.Vector3(side, 0, 0));
    assert.equal(ray.intersectObject(new THREE.Mesh(half, materials))[0]?.face.materialIndex, 6);
    materials.forEach(material => material.dispose()); half.dispose();
  }
  assert.ok(Math.abs(volume(source) - 8) < 1e-7);
  assert.ok(Math.abs(combined - 8) < 1e-7);
  source.dispose();
});

test('cut caps follow a concave fruit/stem outline and preserve holes instead of filling its convex hull', () => {
  const outline = new THREE.Shape();
  outline.moveTo(-1, -1); outline.lineTo(1, -1); outline.lineTo(1, .5);
  outline.lineTo(.15, .5); outline.lineTo(.15, 1); outline.lineTo(-.15, 1);
  outline.lineTo(-.15, .5); outline.lineTo(-1, .5); outline.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-.3, -.7); hole.lineTo(-.3, -.2); hole.lineTo(.3, -.2);
  hole.lineTo(.3, -.7); hole.closePath(); outline.holes.push(hole);
  const source = new THREE.ExtrudeGeometry(outline, {depth: 2, bevelEnabled: false, steps: 1})
    .translate(0, 0, -1).rotateY(Math.PI / 2);
  const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
  for (const side of [-1, 1]) {
    const half = scene.cappedHalf(source, side), mesh = new THREE.Mesh(half, materials);
    const hit = (y, z) => new THREE.Raycaster(new THREE.Vector3(-side * 3, y, z),
      new THREE.Vector3(side, 0, 0)).intersectObject(mesh);
    assert.equal(hit(.75, .3).length, 0, 'flesh must not bridge the air beside the narrow fruit stem');
    assert.equal(hit(-.4, 0).length, 0, 'a real hole through the source must stay open');
    assert.equal(hit(.2, .2)[0]?.face.materialIndex, 1, 'actual fruit interior needs a visible cap');
    const cap = half.groups.find(group => group.materialIndex === 1);
    const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    let area = 0;
    for (let i = cap.start; i < cap.start + cap.count; i += 3) {
      points.forEach((point, j) => point.fromBufferAttribute(half.attributes.position, i + j));
      area += points[1].sub(points[0]).cross(points[2].sub(points[0])).length() / 2;
    }
    assert.ok(Math.abs(area - 2.85) < 1e-6, `cap area ${area} should match the source section`);
    half.dispose();
  }
  materials.forEach(material => material.dispose()); source.dispose();
});

test('fitting/cutting a private fruit preserves source geometry, materials, atlases and collision dimensions', () => {
  assert.equal(typeof scene.createSliceFruitAsset, 'function');
  const original = new THREE.Group(), geometry = new THREE.SphereGeometry(2, 20, 12);
  const map = new THREE.DataTexture(new Uint8Array([230, 120, 12, 255]), 1, 1);
  const material = new THREE.MeshStandardMaterial({map});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(8, 9, 10); original.add(mesh);
  const positions = geometry.attributes.position.array.slice(), color = material.color.clone();
  let released = 0, mapsReleased = 0;
  geometry.addEventListener('dispose', () => released++); map.addEventListener('dispose', () => mapsReleased++);
  const asset = scene.createSliceFruitAsset(createMolesCharacterAsset({scene: original}, 'orange.glb'));
  const full = asset.models.get('peach/0').getObjectByName('slice-body');
  assert.notEqual(full.geometry, geometry); assert.notEqual(full.material, material);
  assert.equal(full.material.map, map);
  const bounds = new THREE.Box3().setFromBufferAttribute(full.geometry.attributes.position);
  assert.ok(bounds.min.x >= -1 && bounds.max.x <= 1);
  assert.ok(bounds.getCenter(new THREE.Vector3()).length() < .001);
  const halves = [-1, 1].map(side => asset.models.get(`peach/${side}`).getObjectByName('slice-body'));
  assert.equal(halves[0].geometry.attributes.uv.count, halves[0].geometry.attributes.position.count);
  assert.ok(Math.abs(volume(full.geometry) - halves.reduce((sum, part) => sum + volume(part.geometry), 0)) < 1e-5);
  full.material.color.set('#abcdef');
  assert.deepEqual(material.color, color);
  assert.deepEqual(geometry.attributes.position.array, positions);
  assert.equal(released, 0); assert.equal(mapsReleased, 0);
  asset.dispose(); asset.dispose();
  assert.equal(released, 1); assert.equal(mapsReleased, 1);
});

test('actual GLB templates replace all safe colors and their halves, with distinct halos and unchanged hazards/state', async () => {
  const world = scene.createSliceWorld();
  assert.equal(typeof world.setTripoAsset, 'function');
  const state = view({objects: ['peach', 'mint', 'gold'].map((color, i) => item(i, color))
    .concat(item('hazard', 'gold', {kind: 'hazard'}))});
  world.update(state);
  const hazard = world.scene.getObjectByName('slice-objects').children.at(-1);
  const before = structuredClone(state);
  assert.equal(await world.setTripoAsset({buffer: orangeGLB(), name: 'actual-orange.glb'}), 'actual-orange.glb');
  world.update(state);
  assert.deepEqual(state, before);
  const safe = world.scene.getObjectByName('slice-objects').children.filter(object => object.userData.id !== 'hazard');
  for (const object of safe) {
    assert.equal(object.userData.source, 'tripo');
    assert.equal(object.getObjectByName('slice-body').material.name, 'photographed peel');
    assert.ok(object.getObjectByName('slice-color-aura'));
  }
  assert.equal(new Set(safe.map(object => object.getObjectByName('slice-color-aura').material.color.getHex())).size, 3);
  assert.ok(world.scene.getObjectByName('slice-objects').children.includes(hazard));
  assert.ok(hazard.getObjectByName('hazard-x'));
  assert.equal(hazard.getObjectByName('slice-color-aura'), undefined);
  const shared = safe[0].getObjectByName('slice-body').geometry;
  assert.equal(safe[1].getObjectByName('slice-body').geometry, shared);
  state.objects = [];
  state.fragments = [-1, 1].map(side => item('cut', 'mint', {side, life: 1, maxLife: 1}));
  world.update(state);
  for (const fragment of world.scene.getObjectByName('slice-fragments').children) {
    assert.equal(fragment.userData.source, 'tripo');
    const body = fragment.getObjectByName('slice-body');
    assert.ok(body.material.at(-1).map?.isDataTexture, 'cross section needs actual orange flesh texture');
    assert.ok(new Set(body.material.at(-1).map.image.data).size > 80);
    const cap = body.geometry.groups.at(-1), position = body.geometry.attributes.position;
    assert.ok(cap.count > 0 && position.getX(cap.start) === 0);
    const outward = new THREE.Vector3().fromBufferAttribute(body.geometry.attributes.normal, cap.start)
      .transformDirection(body.matrixWorld);
    assert.ok(outward.z > .2, 'cut faces must turn toward the player');
  }
  world.destroy();
});

test('failed imports preserve playable models; replacement/unmount abort stale imports and dispose imported resources once', async () => {
  const world = scene.createSliceWorld();
  assert.equal(typeof world.setTripoAsset, 'function');
  const state = view({objects: [item('fruit')], fragments: [-1, 1].map(side => item('cut', 'gold', {side, life: 1, maxLife: 1}))});
  world.update(state);
  const original = world.scene.getObjectByName('slice-objects').children[0];
  await assert.rejects(world.setTripoAsset({buffer: new ArrayBuffer(10), name: 'bad.glb'}));
  world.update(state);
  assert.equal(world.scene.getObjectByName('slice-objects').children[0], original);
  const first = world.setTripoAsset({buffer: orangeGLB(), name: 'old.glb'});
  const second = world.setTripoAsset({buffer: orangeGLB(), name: 'new.glb'});
  await assert.rejects(first, {name: 'AbortError'}); await second;
  world.update(state);
  const resources = new Map();
  world.scene.getObjectByName('slice-objects').traverse(collect);
  world.scene.getObjectByName('slice-fragments').traverse(collect);
  function collect(object) {
    const materials = [object.material].flat().filter(Boolean);
    for (const resource of [object.geometry, ...materials, ...materials.flatMap(material => Object.values(material).filter(value => value?.isTexture))].filter(Boolean)) {
      if (!resources.has(resource)) {
        resources.set(resource, 0);
        resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
      }
    }
  }
  const late = world.setTripoAsset({buffer: orangeGLB(), name: 'late.glb'});
  world.destroy(); world.destroy();
  await assert.rejects(late, {name: 'AbortError'});
  for (const count of resources.values()) assert.equal(count, 1);
  assert.equal(world.scene.children.length, 0);
});
