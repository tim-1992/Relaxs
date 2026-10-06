import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createBlastWorld} from '../src/blast-scene.js';
import {createBlastState, selectBlastTarget, plantBlast, setBlastType, detonateBlast, stepBlast} from '../src/blast-state.js';

test('all model pieces own pickable geometry; walls have real window assemblies and debris stays visible', () => {
  const world = createBlastWorld();
  const state = createBlastState();
  const before = structuredClone(state);
  world.update(state);
  assert.deepEqual(state, before, 'drawing cannot mutate simulation');
  const pieces = world.scene.getObjectByName('blast-pieces');
  assert.equal(pieces.children.length, state.pieces.length);
  const windows = [];
  pieces.traverse(object => {if (object.name === 'blast-window') windows.push(object);});
  assert.ok(windows.length >= 12);
  for (const group of pieces.children) {
    assert.ok(group.children.length);
    group.traverse(object => {if (object.isMesh) assert.equal(object.userData.pieceId, group.userData.pieceId);});
  }
  selectBlastTarget(state, state.suggestedTarget);
  setBlastType(state, 'wide'); plantBlast(state); detonateBlast(state);
  for (let i = 0; i < 180; i++) stepBlast(state, 1 / 60);
  world.update(state);
  assert.equal(pieces.children.length, state.pieces.length);
  const fallen = state.pieces.find(piece => piece.status === 'settled');
  const rendered = pieces.children.find(group => group.userData.pieceId === fallen.id);
  assert.ok(rendered.visible);
  assert.equal(rendered.position.y, fallen.position.y);
  assert.equal(rendered.rotation.z, fallen.rotation.z);
  world.destroy();
});

test('real raycasting returns the exact visible hit point and excludes worksite scenery or fallen pieces', () => {
  const world = createBlastWorld();
  world.resize(900, 560);
  const state = createBlastState();
  world.update(state);
  let hits = 0;
  for (let x = -.65; x <= .65; x += .08) for (let y = -.55; y <= .65; y += .08) {
    const hit = world.pick(x, y);
    if (!hit) continue;
    hits++;
    assert.ok(state.pieces.some(piece => piece.id === hit.id));
    assert.ok(selectBlastTarget(state, hit.id, hit.point), 'a real ray hit must be accepted by the engine');
  }
  assert.ok(hits > 15);
  assert.equal(world.pick(.99, .99), null);
  assert.equal(world.pick(NaN, 0), null);
  setBlastType(state, 'wide'); selectBlastTarget(state, state.suggestedTarget); plantBlast(state); detonateBlast(state);
  world.update(state);
  for (let x = -.8; x < .8; x += .1) {
    const hit = world.pick(x, 0);
    if (hit) assert.equal(state.pieces.find(piece => piece.id === hit.id).status, 'stable');
  }
  world.destroy();
});

test('front, left, and right camera views fit every intact building at narrow and wide aspect ratios', () => {
  const world = createBlastWorld();
  const positions = [];
  for (const view of ['left', 'front', 'right']) {
    assert.equal(world.setView(view), true);
    positions.push(world.camera.position.x);
    for (const layout of ['house', 'tower', 'bridge']) {
      const state = createBlastState({layout});
      world.update(state);
      for (const [width, height] of [[320, 400], [1200, 540]]) {
        world.resize(width, height);
        for (const piece of state.pieces) {
          for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) {
            const p = new THREE.Vector3(piece.position.x + x * piece.size.x,
              piece.position.y + y * piece.size.y, piece.position.z + z * piece.size.z).project(world.camera);
            assert.ok(Math.abs(p.x) < .95 && Math.abs(p.y) < .95, `${layout}/${view}/${width}: clipped building`);
          }
        }
      }
    }
  }
  assert.equal(new Set(positions).size, 3);
  assert.equal(world.setView('invalid'), false);
  world.destroy();
});

test('placement markers retain selected hit positions and all owned GPU resources dispose exactly once', () => {
  const world = createBlastWorld();
  const state = createBlastState();
  selectBlastTarget(state, state.suggestedTarget); plantBlast(state);
  world.update(state);
  const markers = world.scene.getObjectByName('blast-markers');
  assert.equal(markers.children.length, 1);
  assert.deepEqual(markers.children[0].position.toArray(), Object.values(state.markers[0].point));
  const projected = markers.children[0].getWorldPosition(new THREE.Vector3()).project(world.camera);
  const pin = world.project(state.markers[0].point);
  assert.ok(Math.abs(pin.x - (projected.x + 1) / 2) < 1e-6);
  assert.ok(Math.abs(pin.y - (1 - projected.y) / 2) < 1e-6);
  const tracked = new Map();
  world.scene.traverse(object => {
    for (const resource of [object.geometry, ...[object.material].flat()].filter(Boolean)) {
      if (tracked.has(resource)) continue;
      tracked.set(resource, 0);
      resource.addEventListener('dispose', () => tracked.set(resource, tracked.get(resource) + 1));
    }
  });
  world.update(createBlastState({layout: 'tower'}));
  assert.equal(markers.children.length, 0);
  world.destroy(); world.destroy();
  for (const count of tracked.values()) assert.equal(count, 1);
  assert.equal(world.scene.children.length, 0);
  assert.equal(world.update(state), false);
  assert.equal(world.pick(0, 0), null);
});
