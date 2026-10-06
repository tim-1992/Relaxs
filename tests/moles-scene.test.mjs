import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {molesLayout} from '../src/moles-scene.js';
import {createMolesCharacterAsset, loadMolesCharacter} from '../src/moles-character.js';

function sceneHarness() {
  let graph;
  class Renderer {
    setPixelRatio() {} setSize() {} dispose() {}
    render(scene) {graph = scene;}
  }
  const code = readFileSync(new URL('../src/moles-scene.js', import.meta.url), 'utf8')
    .replace("import * as THREE from 'three';", 'const THREE = provided;')
    .replaceAll('export function ', 'function ');
  const context = vm.createContext({provided: {...THREE, WebGLRenderer: Renderer}});
  vm.runInContext(code, context);
  const scene = context.createMolesScene({});
  scene.resize(390, 470);
  scene.render({preview:true, holes:[], elapsed:1, phase:'ready'});
  return {scene, graph};
}

function localBounds(object, parent = object.parent) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object, true)
    .applyMatrix4(parent.matrixWorld.clone().invert());
}

function assertImportedGear(graph) {
  const critter = hole => graph.getObjectByName(`moles-critter-${hole}`);
  for (const hole of [1, 2, 4]) {
    const group = critter(hole), model = group.getObjectByName('moles-imported-character');
    const body = localBounds(model);
    assert.ok(body.min.x >= -.71 && body.max.x <= .71, 'body fits the established critter footprint');
    assert.ok(body.min.y >= -.300001 && body.max.y <= 1.400001 - .3);
    if (hole === 1) {
      const helmet = graph.getObjectByName('moles-helmet-1');
      const brim = localBounds(helmet.children[1], group);
      assert.ok(brim.min.y < body.max.y - .04, 'helmet brim overlaps the crown instead of floating above it');
      assert.ok(brim.max.y > body.max.y - .35, 'helmet does not cover the face');
      assert.ok(localBounds(helmet, group).max.y > body.max.y, 'helmet dome covers the crown');
    } else if (hole === 2) {
      const star = localBounds(graph.getObjectByName('moles-star-2'), group);
      assert.ok(star.min.y - body.max.y >= -.01 && star.min.y - body.max.y <= .08,
        'star sits directly above the imported head');
    } else {
      const stem = localBounds(graph.getObjectByName('moles-leaves-4').children[0], group);
      assert.ok(Math.abs(stem.min.y - body.max.y) < .08, 'leaf stem is attached to the imported head');
    }
    group.traverseVisible(object => {
      if (!object.isMesh) return;
      const box = localBounds(object, group);
      assert.ok(box.min.x >= -1.225 && box.max.x <= 1.225 &&
        box.min.y >= -.825 && box.max.y <= 1.825, 'full body and visible markers stay inside the hit button');
    });
  }
}

test('all nine hit areas are separated and comfortably tappable on narrow screens', () => {
  for (const [width, height] of [[284, 400], [390, 470], [1000, 540]]) {
    const {holes} = molesLayout(width, height);
    assert.equal(holes.length, 9);
    for (const hole of holes) {
      assert.ok(hole.width * width > 44 && hole.height * height > 44);
      assert.ok(hole.x - hole.width / 2 > 0 && hole.x + hole.width / 2 < 1);
      assert.ok(hole.y - hole.height / 2 > 0 && hole.y + hole.height / 2 < 1);
    }
    for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
      const a = holes[i], b = holes[j];
      assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 ||
        Math.abs(a.y - b.y) >= (a.height + b.height) / 2);
    }
  }
});

test('the real scene shows distinct meshes, breaks helmets, and disposes every owned resource once', () => {
  let latest, rendererDisposed = 0;
  class Renderer {
    setPixelRatio() {} setSize() {}
    render(scene, camera) {latest = {scene, camera};}
    dispose() {rendererDisposed++;}
  }
  const code = readFileSync(new URL('../src/moles-scene.js', import.meta.url), 'utf8')
    .replace("import * as THREE from 'three';", 'const THREE = provided;')
    .replaceAll('export function ', 'function ');
  const context = vm.createContext({provided: {...THREE, WebGLRenderer: Renderer}});
  vm.runInContext(code, context);
  const scene = context.createMolesScene({ownerDocument:{defaultView:{devicePixelRatio:1}}});
  scene.resize(284, 400);
  const holes = Array(9).fill(null);
  holes[0] = {type:'helmet', hp:2, bornAt:0, expiresAt:3};
  holes[1] = {type:'shiny', hp:1, bornAt:0, expiresAt:3};
  holes[2] = {type:'friend', hp:1, bornAt:0, expiresAt:3};
  scene.render({holes, elapsed:.4, phase:'playing'});
  assert.equal(latest.scene.getObjectByName('moles-helmet-0').visible, true);
  assert.equal(latest.scene.getObjectByName('moles-star-1').visible, true);
  assert.equal(latest.scene.getObjectByName('moles-leaves-2').visible, true);
  latest.scene.updateMatrixWorld(true);
  const hitAreas = molesLayout(284, 400).holes;
  for (const hole of [0,1,2]) {
    const area = hitAreas[hole];
    const bounds = new THREE.Box3().setFromObject(latest.scene.getObjectByName(`moles-critter-${hole}`));
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      const point = new THREE.Vector3(x, y, 0).project(latest.camera);
      const px = (point.x + 1) / 2, py = (1 - point.y) / 2;
      assert.ok(px >= area.x - area.width / 2 && px <= area.x + area.width / 2);
      assert.ok(py >= area.y - area.height / 2 && py <= area.y + area.height / 2, 'headgear must stay inside the actual hit button');
    }
  }
  holes[0].hp = 1;
  scene.render({holes, elapsed:.4, phase:'playing'});
  assert.equal(latest.scene.getObjectByName('moles-helmet-0').visible, false);
  const importedGeometry = new THREE.BoxGeometry(1, 2, .5), importedMaterial = new THREE.MeshStandardMaterial();
  const importedRoot = new THREE.Group(); importedRoot.add(new THREE.Mesh(importedGeometry, importedMaterial));
  let importedDisposed = 0;
  importedGeometry.addEventListener('dispose', () => importedDisposed++);
  const asset = createMolesCharacterAsset({scene:importedRoot}, 'Tripo.glb');
  scene.setCharacter(asset);
  scene.render({holes, elapsed:.4, phase:'playing'});
  const imported = [];
  latest.scene.traverse(object => {if (object.name === 'moles-imported-character') imported.push(object);});
  assert.equal(imported.length, 9);
  assert.equal(latest.scene.getObjectByName('moles-star-1').visible, true);
  assert.equal(latest.scene.getObjectByName('moles-leaves-2').visible, true);
  scene.setCharacterYaw(Math.PI);
  assert.ok(imported.every(object => object.rotation.y === Math.PI));
  scene.setCharacter(null);
  assert.equal(importedDisposed, 1);
  assert.ok(imported.every(object => !object.parent));
  const resources = new Set();
  latest.scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of object.material ? [object.material].flat() : []) resources.add(material);
  });
  let released = 0;
  for (const resource of resources) resource.addEventListener('dispose', () => released++);
  scene.dispose(); scene.dispose();
  assert.equal(rendererDisposed, 1);
  assert.equal(released, resources.size);
});

test('short imported bodies keep headgear attached through turns and emergence; defaults restore exactly', () => {
  const {scene, graph} = sceneHarness();
  const markers = ['moles-helmet-1', 'moles-star-2', 'moles-leaves-4'];
  const transforms = () => markers.map(name => {
    const object = graph.getObjectByName(name);
    return [...object.position.toArray(), ...object.scale.toArray()];
  });
  const defaults = transforms();
  const source = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2.4), new THREE.MeshStandardMaterial());
  mesh.position.set(3, -4, 6); source.add(mesh);
  const asset = createMolesCharacterAsset({scene:source}, 'short.glb');
  const reference = asset.createInstance(), initialBounds = new THREE.Box3().setFromObject(reference, true);
  scene.setCharacter(asset);
  try {
    for (const yaw of [0, -Math.PI / 2, Math.PI, 0]) {
      scene.setCharacterYaw(yaw);
      assertImportedGear(graph);
    }
    const fullSize = localBounds(graph.getObjectByName('moles-critter-1').getObjectByName('moles-imported-character'));
    scene.render({phase:'playing', elapsed:.03,
      holes:Array.from({length:9}, () => ({type:'helmet', hp:2, bornAt:0, expiresAt:3}))});
    scene.setCharacterYaw(Math.PI / 2);
    scene.setCharacterYaw(0);
    const emergingSize = localBounds(graph.getObjectByName('moles-critter-1').getObjectByName('moles-imported-character'));
    assert.ok(fullSize.min.distanceTo(emergingSize.min) < 1e-8);
    assert.ok(fullSize.max.distanceTo(emergingSize.max) < 1e-8, 'pop animation cannot compound the fitting scale');
    assert.ok(initialBounds.equals(new THREE.Box3().setFromObject(reference, true)),
      'scene fitting does not change shared asset normalization or geometry');
    scene.setCharacter(null);
    assert.deepEqual(transforms(), defaults);
  } finally {scene.dispose();}
});

const monsterPath = new URL('../artifacts/tripo/mint-monster/game.glb', import.meta.url);
test('the actual front-facing Tripo monster fills the mole footprint and wears attached markers', {
  skip: !existsSync(monsterPath),
}, async () => {
  const previousSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  const previousBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  globalThis.self = globalThis;
  // Only the browser image decoder/GPU are substituted; GLTF geometry and transforms are real.
  globalThis.createImageBitmap = async () => ({width:2048, height:2048, close() {}});
  const {scene, graph} = sceneHarness();
  try {
    const bytes = readFileSync(monsterPath);
    const asset = await loadMolesCharacter({name:'monster.glb', size:bytes.byteLength,
      arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)});
    scene.setCharacter(asset);
    scene.setCharacterYaw(-Math.PI / 2);
    assertImportedGear(graph);
    const model = graph.getObjectByName('moles-critter-1').getObjectByName('moles-imported-character');
    assert.equal(model.rotation.y, -Math.PI / 2);
    assert.ok(localBounds(model).getSize(new THREE.Vector3()).y >= 1.3, 'short asset fills the available body height');
  } finally {
    scene.dispose();
    for (const [key, descriptor] of [['self', previousSelf], ['createImageBitmap', previousBitmap]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
});
