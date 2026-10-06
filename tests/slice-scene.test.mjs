import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSliceWorld} from '../src/slice-scene.js';

const item = (id, color = 'peach', extra = {}) => ({
  id, kind: 'fruit', color, x: 120, y: 80, z: 0, r: 30,
  vx: 0, vy: 0, rotation: 0, spin: 0, ...extra,
});
const state = extra => ({
  width: 960, height: 600, time: 0, paused: false,
  objects: [], fragments: [], particles: [], trail: [], ...extra,
});
const close = (actual, expected, tolerance = 1e-5) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
function pixels(point, camera, width, height) {
  const projected = point.clone().project(camera);
  return {x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2};
}
function volume(geometry) {
  const position = geometry.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let sum = 0;
  const indexAt = index => geometry.index ? geometry.index.getX(index) : index;
  const length = geometry.index?.count ?? position.count;
  for (let index = 0; index < length; index += 3) {
    a.fromBufferAttribute(position, indexAt(index));
    b.fromBufferAttribute(position, indexAt(index + 1));
    c.fromBufferAttribute(position, indexAt(index + 2));
    sum += a.dot(b.cross(c)) / 6;
  }
  return Math.abs(sum);
}

test('CSS pixel centers, radii and clockwise rotation survive portrait resize and cosmetic depth', () => {
  const world = createSliceWorld();
  for (const [width, height, z] of [[960, 600, 0], [320, 640, 35]]) {
    const source = state({width, height, objects: [item('a', 'peach', {z, rotation: Math.PI / 2})]});
    const before = structuredClone(source);
    world.update(source);
    const object = world.scene.getObjectByName('slice-objects').children[0];
    const center = pixels(object.getWorldPosition(new THREE.Vector3()), world.camera, width, height);
    close(center.x, 120); close(center.y, 80);
    const edge = pixels(object.localToWorld(new THREE.Vector3(1, 0, 0)), world.camera, width, height);
    close(edge.x, 120); close(edge.y, 110);
    assert.deepEqual(source, before, 'rendering must never move or otherwise mutate engine state');
  }
  world.destroy();
});

test('each fruit splits into complementary closed solids with outward-facing real cut caps', () => {
  const world = createSliceWorld();
  for (const color of ['peach', 'mint', 'gold']) {
    world.update(state({
      objects: [item('whole', color)],
      fragments: [-1, 1].map(side => item('cut', color, {side, life: 1, maxLife: 1})),
    }));
    const full = world.scene.getObjectByName('slice-objects').children[0].getObjectByName('slice-body');
    const halves = world.scene.getObjectByName('slice-fragments').children;
    assert.equal(halves.length, 2, 'same source id must retain both sides');
    let total = 0;
    for (const [index, half] of halves.entries()) {
      const side = index ? 1 : -1;
      const body = half.getObjectByName('slice-body');
      const geometry = body.geometry;
      const position = geometry.attributes.position;
      const normal = geometry.attributes.normal;
      total += volume(geometry);
      for (let vertex = 0; vertex < position.count; vertex++) {
        assert.ok(position.getX(vertex) * side > -1e-6, 'a half must not contain the other half');
      }
      const cap = geometry.groups.find(group => group.materialIndex === 1);
      assert.ok(cap?.count >= 6, 'the opening needs actual triangles, not an empty shell');
      for (let vertex = cap.start; vertex < cap.start + cap.count; vertex++) {
        close(position.getX(vertex), 0);
        close(normal.getX(vertex), -side);
      }
      const outward = new THREE.Vector3(-side, 0, 0).transformDirection(body.matrixWorld);
      assert.ok(outward.z > .2, 'both exposed interior faces must be visible to the camera');
      const localMesh = new THREE.Mesh(geometry, body.material);
      const capRay = new THREE.Raycaster(new THREE.Vector3(-side * 2, 0, .2), new THREE.Vector3(side, 0, 0));
      const hit = capRay.intersectObject(localMesh)[0];
      assert.equal(hit?.face.materialIndex, 1, 'the cap must physically cover the opening with correct triangle winding');
      close(hit.distance, 2);
    }
    close(total, volume(full.geometry), 2e-5);
  }
  world.destroy();
});

test('peach, rounded mint and pointed gold have distinct silhouettes and metal has an embossed X', () => {
  const world = createSliceWorld();
  const hit = (body, x, y) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(120 + x * 30, -80 + y * 30, 500), new THREE.Vector3(0, 0, -1));
    return ray.intersectObject(body, false).length > 0;
  };
  const silhouettes = [];
  for (const color of ['peach', 'mint', 'gold']) {
    world.update(state({objects: [item('shape', color)]}));
    const body = world.scene.getObjectByName('slice-objects').children[0].getObjectByName('slice-body');
    silhouettes.push([hit(body, 0, .9), hit(body, .6, .6)]);
    assert.ok(body.material instanceof THREE.MeshStandardMaterial);
  }
  assert.deepEqual(silhouettes, [[true, true], [false, true], [true, false]]);
  world.update(state({objects: [item('metal', 'gold', {kind: 'hazard'})]}));
  const hazard = world.scene.getObjectByName('slice-objects').children[0];
  const mark = hazard.getObjectByName('hazard-x');
  assert.equal(mark.children.length, 2);
  for (const bar of mark.children) {
    bar.geometry.computeBoundingBox();
    assert.ok(bar.geometry.boundingBox.max.z - bar.geometry.boundingBox.min.z > .05);
  }
  world.destroy();
});

test('transient meshes stay bounded, reuse geometry and drop stale objects; trail buffers also reuse storage', () => {
  const world = createSliceWorld();
  world.update(state({objects: [item('first')], trail: [{x: 10, y: 20, life: .2, maxLife: .2}, {x: 90, y: 50, life: .2, maxLife: .2}]}));
  const geometry = world.scene.getObjectByName('slice-objects').children[0].getObjectByName('slice-body').geometry;
  const blade = world.scene.getObjectByName('slice-blade');
  const positions = blade.geometry.attributes.position;
  assert.ok(blade.visible && blade.geometry.drawRange.count > 0);
  const many = Array.from({length: 1000}, (_, index) => item(index, 'peach', {life: 1, maxLife: 1, side: 1}));
  world.update(state({objects: many, fragments: many, particles: many, trail: many}));
  assert.ok(world.scene.getObjectByName('slice-objects').children.length <= 64);
  assert.ok(world.scene.getObjectByName('slice-fragments').children.length <= 128);
  assert.ok(world.scene.getObjectByName('slice-particles').count <= 256);
  assert.equal(world.scene.getObjectByName('slice-objects').children[0].getObjectByName('slice-body').geometry, geometry);
  assert.equal(blade.geometry.attributes.position, positions);
  assert.ok([...positions.array].every(Number.isFinite), 'coincident trail points cannot create NaNs');
  world.update(state({trail: [{x: 10, y: 20, life: 0, maxLife: .2}]}));
  assert.equal(world.scene.getObjectByName('slice-objects').children.length, 0);
  assert.equal(world.scene.getObjectByName('slice-fragments').children.length, 0);
  assert.equal(world.scene.getObjectByName('slice-particles').count, 0);
  assert.equal(blade.visible, false);
  world.destroy();
});

test('blade geometry honors stroke breaks and never bridges separated gestures', () => {
  const world = createSliceWorld();
  world.update(state({trail: [
    {x: 10, y: 20}, {x: 30, y: 25},
    {x: 510, y: 20, break: true}, {x: 530, y: 25},
  ]}));
  const geometry = world.scene.getObjectByName('slice-blade').geometry;
  assert.ok(geometry.drawRange.count > 0);
  for (let index = 0; index < geometry.drawRange.count; index += 3) {
    const x = [0, 1, 2].map(offset => geometry.attributes.position.getX(geometry.index.getX(index + offset)));
    assert.ok(Math.max(...x) - Math.min(...x) < 40, 'separate strokes must not create a connecting triangle');
  }
  world.destroy();
});

test('destroy releases shared geometries and materials once and disables future updates', () => {
  const world = createSliceWorld();
  world.update(state({objects: ['peach', 'mint', 'gold'].map((color, index) => item(index, color)),
    fragments: [-1, 1].map(side => item('fragment', 'mint', {side, life: 1, maxLife: 1}))}));
  const disposals = new Map();
  world.scene.traverse(object => {
    for (const resource of [object.geometry, ...(Array.isArray(object.material) ? object.material : [object.material])].filter(Boolean)) {
      if (disposals.has(resource)) continue;
      disposals.set(resource, 0);
      resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
    }
  });
  assert.ok(disposals.size > 10);
  world.destroy();
  world.destroy();
  for (const count of disposals.values()) assert.equal(count, 1);
  assert.equal(world.scene.children.length, 0);
  assert.equal(world.update(state({objects: [item('late')]})), false);
});
