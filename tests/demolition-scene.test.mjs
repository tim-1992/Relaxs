import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createDemoWorld} from '../src/demolition-scene.js';

const prop = (id, kind, extra = {}) => ({
  id, label: kind, kind, material: 'wood', color: 0x91afa0,
  position: {x: 0, y: .75, z: 0}, size: {x: 1.4, y: 1.5, z: .8},
  hp: 3, maxHp: 3, supportId: null, destroyed: false, ...extra,
});
const state = extra => ({
  room: 'living', phase: 'playing', objects: [], fragments: [], elapsed: 0,
  stats: {hits: 0, destroyed: 0}, ...extra,
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} differs from ${b}`);

test('furniture has recognizable geometric parts, correct placement, and pick metadata on real meshes', () => {
  const world = createDemoWorld();
  const kinds = ['sofa', 'table', 'cabinet', 'shelf', 'chair', 'screen', 'vase', 'bottle', 'book', 'cushion', 'lamp', 'picture', 'speaker'];
  const source = state({objects: kinds.map((kind, index) => prop(index, kind))});
  const before = structuredClone(source);
  world.render(source);
  const furniture = world.scene.getObjectByName('demo-furniture');
  assert.equal(furniture.children.length, 13);
  for (const model of furniture.children) {
    close(model.position.y, .75);
    const meshes = [];
    model.traverse(child => { if (child.isMesh) meshes.push(child); });
    assert.ok(meshes.length >= 2, 'props need visible structure and details');
    for (const mesh of meshes) {
      assert.equal(mesh.userData.demoId, model.userData.demoId);
      assert.ok(mesh.geometry.attributes.position.count > 12);
    }
  }
  assert.ok(furniture.children[0].getObjectByName('sofa-back'));
  assert.ok(furniture.children[1].getObjectByName('table-top'));
  assert.ok(furniture.children[5].getObjectByName('screen-glass'));
  assert.ok(furniture.children[6].getObjectByName('vase-body').geometry.type === 'LatheGeometry');
  assert.ok(furniture.children[10].getObjectByName('lamp-shade'));
  assert.deepEqual(source, before);
  world.dispose();
});

test('front, left and right cameras frame all room corners at narrow and wide sizes', () => {
  const world = createDemoWorld();
  for (const [width, height] of [[280, 540], [1100, 600]]) {
    world.resize(width, height);
    for (const view of ['front', 'left', 'right']) {
      world.setView(view);
      for (const x of [-4.3, 4.3]) for (const y of [-.2, 3.3]) for (const z of [-3.3, 3.3]) {
        const projected = new THREE.Vector3(x, y, z).project(world.camera);
        assert.ok(Math.abs(projected.x) < .96 && Math.abs(projected.y) < .96, `${view} at ${width}: clipped room`);
        assert.ok(projected.z > -1 && projected.z < 1);
      }
    }
  }
  world.dispose();
});

test('ray picking follows furniture through camera changes and ignores decorations and broken props', () => {
  const world = createDemoWorld();
  world.resize(700, 500);
  const source = state({objects: [prop('cupboard', 'cabinet')]});
  world.render(source);
  for (const view of ['front', 'left', 'right']) {
    world.setView(view);
    const point = new THREE.Vector3(0, .75, 0).project(world.camera);
    assert.equal(world.pickNdc(point.x, point.y), 'cupboard');
    const floor = new THREE.Vector3(3.5, 0, 2.5).project(world.camera);
    assert.equal(world.pickNdc(floor.x, floor.y), null);
  }
  source.objects[0].destroyed = true;
  world.render(source);
  const point = new THREE.Vector3(0, .75, 0).project(world.camera);
  assert.equal(world.pickNdc(point.x, point.y), null);
  world.dispose();
});

test('selection and cracks track HP; paused zero-dt renders preserve impact animation', () => {
  const world = createDemoWorld();
  const source = state({objects: [prop('table', 'table')]});
  world.render(source, {selectedId: 'table', charge: .8});
  assert.equal(world.scene.getObjectByName('demo-selection').visible, true);
  const model = world.scene.getObjectByName('demo-furniture').children[0];
  assert.equal(model.getObjectByName('damage-cracks').visible, false);
  source.objects[0].hp = 1; source.stats.hits++;
  world.render(source, {selectedId: 'table'}, .04);
  assert.equal(model.getObjectByName('damage-cracks').visible, true);
  close(world.scene.getObjectByName('demo-health-fill').scale.x, 1 / 3);
  source.phase = 'paused';
  const rotation = model.rotation.clone();
  world.render(source, {selectedId: 'table'}, 0);
  assert.deepEqual(model.rotation.toArray(), rotation.toArray());
  world.render(source, {selectedId: null});
  assert.equal(world.scene.getObjectByName('demo-selection').visible, false);
  world.dispose();
});

test('room changes and same-room resets release old surfaces and remove stale models', () => {
  const world = createDemoWorld();
  world.render(state({objects: [prop('same-id', 'sofa')], stats: {hits: 4}}));
  const old = world.scene.getObjectByName('sofa-back').material;
  let released = 0; old.addEventListener('dispose', () => released++);
  world.render(state({room: 'study', objects: [prop('same-id', 'cabinet')]}));
  assert.equal(released, 1);
  assert.equal(world.scene.getObjectByName('sofa-back'), undefined);
  assert.ok(world.scene.getObjectByName('cabinet-door'));
  world.render(state({room: 'study', objects: [prop('same-id', 'cabinet', {destroyed: true})], stats: {hits: 5}}));
  assert.equal(world.scene.getObjectByName('demo-furniture').children.length, 0);
  world.render(state({room: 'study', objects: [prop('same-id', 'cabinet')]}));
  assert.equal(world.scene.getObjectByName('demo-furniture').children.length, 1);
  world.dispose();
});

test('fragments use engine transforms and remain bounded; disposal releases all visible resources once', () => {
  const world = createDemoWorld();
  const fragment = {id: 'f', position: {x: 1, y: 2, z: 3}, rotation: {x: .1, y: .2, z: .3},
    size: {x: .2, y: .3, z: .4}, color: 0xffab91, material: 'wood', life: 2};
  const source = state({objects: [prop('s', 'screen')], fragments: [fragment]});
  world.render(source);
  const mesh = world.scene.getObjectByName('demo-fragments-wood');
  const actual = new THREE.Matrix4(); mesh.getMatrixAt(0, actual);
  const expected = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, .2, .3)), new THREE.Vector3(.2, .3, .4));
  for (let index = 0; index < 16; index++) assert.ok(Math.abs(actual.elements[index] - expected.elements[index]) < 1e-7);
  source.fragments = Array.from({length: 400}, (_, index) => ({...fragment, id: index}));
  world.render(source);
  let count = 0;
  world.scene.getObjectByName('demo-fragments').children.forEach(part => { count += part.count; });
  assert.equal(count, 180);
  const resources = new Map();
  world.scene.traverse(object => {
    for (const resource of [object.geometry, ...(Array.isArray(object.material) ? object.material : [object.material])].filter(Boolean)) {
      if (resources.has(resource)) continue;
      resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
    }
  });
  world.dispose(); world.dispose();
  for (const value of resources.values()) assert.equal(value, 1);
  assert.equal(world.scene.children.length, 0);
  assert.equal(world.pickNdc(0, 0), null);
  assert.equal(world.render(source), false);
});
