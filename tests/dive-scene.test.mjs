import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import * as rules from '../src/dive-state.js';
import {createMolesCharacterAsset} from '../src/moles-character.js';
import {createDiveTurtleMotion} from '../src/dive-scene.js';

test('local flipper deformation leaves the shell and shared export untouched and releases its geometry once', () => {
  const geometry = new THREE.BufferGeometry();
  // +Z is the exported animal's nose; the four outer foreflipper vertices are outside the shell.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.4,.2,0, .4,.2,0, 0,.35,-.7, 0,.1,1,
    -1,0,.5, -.8,0,.3, 1,0,.5, .8,0,.3, 0,-.25,-1,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({length:9}, () => [0,1,0]).flat(), 3));
  const root = new THREE.Group(), model = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  root.add(model); root.scale.setScalar(3); root.rotation.y = .8;
  const original = geometry.attributes.position.array.slice();
  const motion = createDiveTurtleMotion(root), animated = model.geometry;
  let releases = 0; animated.addEventListener('dispose', () => releases++);
  assert.notEqual(animated, geometry);
  motion.update(1);
  for (const vertex of [0,1,2,3,8]) {
    assert.deepEqual([...animated.attributes.position.array.slice(vertex * 3, vertex * 3 + 3)],
      [...original.slice(vertex * 3, vertex * 3 + 3)], 'shell, head and tail stay rigid');
  }
  assert.ok(Math.abs(animated.attributes.position.getY(4)) > .03, 'the actual flipper vertices move');
  assert.ok(Math.abs(animated.attributes.position.getY(6)) > .03);
  assert.deepEqual(geometry.attributes.position.array, original, 'the source remains safe to clone or reload');
  const paused = animated.attributes.position.array.slice();
  motion.update(1); assert.deepEqual(animated.attributes.position.array, paused, 'same simulation time cannot drift');
  motion.dispose(); motion.dispose();
  assert.equal(model.geometry, geometry);
  assert.equal(releases, 1);
  geometry.dispose(); model.material.dispose();
});

function sceneHarness() {
  let current, disposed = 0;
  class Renderer {
    constructor({canvas}) {this.domElement = canvas; this.shadowMap = {};}
    setPixelRatio() {}
    setSize(width, height) {this.domElement.width = width; this.domElement.height = height;}
    render(scene, camera) {current = {scene, camera};}
    dispose() {disposed++;}
  }
  const code = readFileSync(new URL('../src/dive-scene.js', import.meta.url), 'utf8')
    .replace("import * as THREE from 'three';", 'const THREE = supplied;')
    .replace(/import \{([^}]+)\} from '.\/dive-state.js';/, 'const {$1} = rules;')
    .replaceAll('export function ', 'function ');
  const context = vm.createContext({supplied:{...THREE, WebGLRenderer:Renderer}, rules});
  vm.runInContext(code, context);
  const canvas = {width:600, height:400, ownerDocument:{defaultView:{devicePixelRatio:1},
    createElement() {return {getContext:() => ({drawImage() {}}), toDataURL:() => 'data:image/jpeg;base64,cGhvdG8='};},
  }};
  const scene = context.createDiveScene(canvas);
  return {scene, get current() {return current;}, get disposed() {return disposed;}};
}

test('the underwater scene follows the real camera and animated photo subjects', () => {
  const app = sceneHarness(), state = rules.createDiveState();
  try {
    app.scene.resize(320, 500); app.scene.render(state);
    assert.ok(Math.abs(app.current.camera.aspect - .64) < .001);
    assert.equal(app.current.camera.position.y, -4);
    for (const name of ['dive-seabed','dive-water-surface','dive-arch','dive-wreck','dive-turtle','dive-ray']) {
      assert.ok(app.current.scene.getObjectByName(name), name);
    }
    state.elapsed = 9; state.position = {x:2,y:-8,z:-10}; state.yaw = .5;
    app.scene.render(state);
    assert.equal(app.current.camera.position.x, 2);
    const turtle = app.current.scene.getObjectByName('dive-turtle');
    const target = rules.diveTargetAt('turtle', 9);
    assert.ok(turtle.position.distanceTo(new THREE.Vector3(target.x, target.y, target.z)) < .001);
    const still = turtle.matrix.clone();
    app.scene.render(state);
    assert.deepEqual(turtle.matrix.elements, still.elements);
    assert.match(app.scene.capture(state), /^data:image\/jpeg/);
  } finally {app.scene.dispose();}
});

test('Tripo turtle replaces the photograph subject, preserves shared resources and cleans up once', () => {
  const app = sceneHarness(), state = rules.createDiveState();
  const geometry = new THREE.BoxGeometry(1.4, .6, 2), material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, material));
  const asset = createMolesCharacterAsset({scene:root}, 'Tripo sea turtle.glb');
  let importedDisposed = 0;
  geometry.addEventListener('dispose', () => importedDisposed++);
  app.scene.setTripoAsset('turtle', asset);
  app.scene.render(state);
  const subject = app.current.scene.getObjectByName('dive-turtle');
  assert.equal(subject.getObjectByName('dive-turtle-procedural').visible, false);
  assert.ok(subject.getObjectByName('moles-imported-character'), 'generated model belongs to the tracked photo target');
  app.current.scene.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(subject.getObjectByName('dive-tripo-turtle')).getSize(new THREE.Vector3());
  assert.ok(size.length() > 2 && size.length() < 5, 'real metre-scale animal, including its rotated world bounds');
  const resources = new Set();
  app.current.scene.traverse(object => {
    if (object.geometry && object.geometry !== geometry) resources.add(object.geometry);
    for (const mat of [object.material || []].flat()) {
      if (mat === material) continue;
      resources.add(mat);
      for (const value of Object.values(mat)) if (value?.isTexture) resources.add(value);
    }
  });
  let releases = 0;
  resources.forEach(resource => resource.addEventListener('dispose', () => releases++));
  app.scene.dispose(); app.scene.dispose();
  assert.equal(app.disposed, 1);
  assert.equal(importedDisposed, 1);
  assert.equal(releases, resources.size);
});

test('imported coral bases remain grounded across sloping sand and share one disposable asset', () => {
  const app = sceneHarness(), state = rules.createDiveState();
  const geometry = new THREE.BoxGeometry(3,2,3), material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry,material));
  const asset = createMolesCharacterAsset({scene:root}, 'coral.glb');
  let releases = 0;
  geometry.addEventListener('dispose', () => releases++);
  try {
    app.scene.setTripoAsset('coral',asset); app.scene.render(state);
    app.current.scene.updateMatrixWorld(true);
    assert.equal(app.current.scene.getObjectByName('dive-coral-procedural').visible, false);
    const colonies = app.current.scene.getObjectByName('dive-tripo-coral').children;
    assert.ok(colonies.length > 1);
    for (const colony of colonies) {
      const box = new THREE.Box3().setFromObject(colony, true);
      for (const x of [box.min.x, (box.min.x + box.max.x) / 2, box.max.x]) {
        for (const z of [box.min.z, (box.min.z + box.max.z) / 2, box.max.z]) {
          assert.ok(box.min.y <= rules.diveFloorAt(x, z) + .001, 'the downhill edge of a flat coral base must not hover');
        }
      }
      const center = box.getCenter(new THREE.Vector3());
      assert.ok(box.max.y > rules.diveFloorAt(center.x, center.z) + .5, 'grounding must leave the colony visibly above the sand');
      assert.equal(colony.getObjectByProperty('isMesh', true).geometry, geometry);
    }
  } finally {app.scene.dispose();}
  assert.equal(releases, 1);
});

const reefKinds = ['turtle','coral','manta','dolphin','clownfish','angelfish','seafan','tablecoral','anemone'];
function reefFixture(kind) {
  const dimensions = {
    turtle:[1.9,.8,1.8], coral:[.373,.5,.501], manta:[3.1,1.4,4.6], dolphin:[3.5,1.3,1],
    clownfish:[.22,.34,.65], angelfish:[.2,.75,.7], seafan:[.236,.45,.457],
    tablecoral:[.214,.3,.343], anemone:[.313,.25,.332],
  };
  const geometry = new THREE.BoxGeometry(...dimensions[kind]);
  // Repeated fixture triangles simulate the declared 40k export budget without external assets.
  const sourceIndices = geometry.index.array, indices = new Uint32Array(120000);
  for (let i = 0; i < indices.length; i++) indices[i] = sourceIndices[i % sourceIndices.length];
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const material = new THREE.MeshStandardMaterial(), texture = new THREE.Texture();
  material.map = texture;
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry,material));
  const forward = {turtle:[0,0,1],manta:[-1,0,0],dolphin:[1,0,0],clownfish:[0,0,-1],angelfish:[0,0,-1]}[kind];
  if (forward) for (const [name,direction] of [['fixture-nose',1],['fixture-tail',-1]]) {
    const marker = new THREE.Object3D(); marker.name = name;
    marker.position.set(...forward).multiplyScalar(direction * .3); root.add(marker);
  }
  const asset = createMolesCharacterAsset({scene:root}, `fixture-${kind}.glb`);
  const releases = {geometry:0,material:0,texture:0};
  for (const [name, resource] of Object.entries({geometry,material,texture})) {
    resource.addEventListener('dispose', () => releases[name]++);
  }
  return {asset, releases};
}

test('nine real-model slots keep foreground fish and repeated reef assets within a bounded render budget', () => {
  const app = sceneHarness(), fixtures = reefKinds.map(kind => [kind, reefFixture(kind)]);
  try {
    for (const [kind, fixture] of fixtures) assert.equal(app.scene.setTripoAsset(kind, fixture.asset), true, kind);
    app.scene.render(rules.createDiveState());
    let triangles = 0, fishCount = 0;
    for (const kind of reefKinds) {
      const holder = app.current.scene.getObjectByName(`dive-tripo-${kind}`);
      assert.ok(holder, `the ${kind} asset must be visibly placed in the scene`);
      let copies = 0;
      holder.traverseVisible(object => {
        if (object.name === 'moles-imported-character') copies++;
        if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      });
      assert.ok(copies > 0);
      if (['clownfish','angelfish'].includes(kind)) fishCount += copies;
      else if (['coral','seafan','tablecoral','anemone'].includes(kind)) assert.ok(copies <= 7, `${kind} must not fill the ocean with huge duplicates`);
      else assert.ok(copies <= 2);
    }
    assert.ok(fishCount >= 4 && fishCount <= 12, 'a few detailed fish can form schools without a hundred high-poly copies');
    assert.ok(triangles <= 1_400_000, `imported triangle budget exceeded: ${triangles}`);
  } finally {
    app.scene.dispose();
    fixtures.forEach(([, fixture]) => fixture.asset.dispose());
  }
  for (const [, fixture] of fixtures) assert.deepEqual(fixture.releases, {geometry:1,material:1,texture:1});
});

test('raised reef gardens expose the real export proportions on both sides without blocking the opening turtle', () => {
  const app = sceneHarness(), fixtures = Object.keys(rules.DIVE_REEF_SITES).map(kind => [kind,reefFixture(kind)]);
  try {
    for (const [kind,fixture] of fixtures) app.scene.setTripoAsset(kind,fixture.asset);
    const state = rules.createDiveState();
    app.scene.resize(1000,650); app.scene.render(state);
    const {scene,camera} = app.current;
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const frames = {left:0,right:0}, gardens = [];
    for (const [kind] of fixtures) {
      const garden = scene.getObjectByName(`dive-tripo-${kind}`), geometries = new Set(), materials = new Set();
      gardens.push(garden);
      for (const colony of garden.children) {
        const bounds = new THREE.Box3().setFromObject(colony,true), center = bounds.getCenter(new THREE.Vector3());
        const distance = Math.hypot(colony.position.x,colony.position.z - 3);
        assert.ok(bounds.max.y > rules.diveFloorAt(center.x,center.z) + .25, `${kind} must emerge from the bank`);
        assert.ok(bounds.min.y < rules.diveFloorAt(center.x,center.z), `${kind} must not float above the sand`);
        const top = new THREE.Vector3(center.x,bounds.max.y,center.z).project(camera);
        if (distance < 16 && Math.abs(top.x) > .3 && Math.abs(top.x) < 1.2 && top.y > -.75 && top.y < .6) {
          frames[top.x < 0 ? 'left' : 'right']++;
        }
        colony.traverse(object => {
          if (!object.isMesh) return;
          geometries.add(object.geometry); materials.add(object.material);
          if (distance >= 16) assert.equal(object.castShadow,false, 'distant high-poly colonies skip the shadow pass');
        });
      }
      assert.equal(geometries.size,1, `${kind} clones share their GPU geometry`);
      assert.equal(materials.size,1, `${kind} clones share their material and textures`);
    }
    assert.ok(frames.left >= 3 && frames.right >= 3, 'both edges of the opening contain several visible colonies');
    const turtle = rules.diveTargetAt('turtle');
    const offset = new THREE.Vector3(turtle.x,turtle.y,turtle.z).sub(camera.position);
    const sightline = new THREE.Raycaster(camera.position,offset.clone().normalize(),0,offset.length() - 1.35);
    assert.equal(sightline.intersectObjects(gardens,true).length,0, 'the central photo corridor stays clear');
  } finally {
    app.scene.dispose(); fixtures.forEach(([,fixture]) => fixture.asset.dispose());
  }
});

test('reef composition and swimming positions do not depend on asset download order', () => {
  function composition(order) {
    const app = sceneHarness(), fixtures = order.map(kind => [kind, reefFixture(kind)]);
    try {
      for (const [kind, fixture] of fixtures) assert.equal(app.scene.setTripoAsset(kind,fixture.asset), true, kind);
      const state = rules.createDiveState(); state.elapsed = 12;
      app.scene.render(state); app.current.scene.updateMatrixWorld(true);
      return Object.fromEntries(reefKinds.map(kind => {
        const instances = [];
        app.current.scene.getObjectByName(`dive-tripo-${kind}`).traverse(object => {
          if (object.name === 'moles-imported-character') instances.push([...object.matrixWorld.elements]);
        });
        return [kind, instances];
      }));
    } finally {
      app.scene.dispose();
      fixtures.forEach(([, fixture]) => fixture.asset.dispose());
    }
  }
  assert.deepEqual(composition(reefKinds), composition([...reefKinds].reverse()));
});

test('different exported animal axes are corrected before fitting and every animal swims nose first', () => {
  const app = sceneHarness(), kinds = ['turtle','manta','dolphin','clownfish','angelfish'];
  const fixtures = kinds.map(kind => [kind,reefFixture(kind)]);
  try {
    fixtures.forEach(([kind, fixture]) => app.scene.setTripoAsset(kind,fixture.asset));
    const state = rules.createDiveState(); state.elapsed = 4;
    app.scene.render(state); app.current.scene.updateMatrixWorld(true);
    for (const kind of kinds) {
      const holder = app.current.scene.getObjectByName(`dive-tripo-${kind}`);
      const nose = holder.getObjectByName('fixture-nose').getWorldPosition(new THREE.Vector3());
      const tail = holder.getObjectByName('fixture-tail').getWorldPosition(new THREE.Vector3());
      const point = rules.diveWildlifeAt(kind,0,4), next = rules.diveWildlifeAt(kind,0,4.1);
      const direction = new THREE.Vector3(next.x - point.x,0,next.z - point.z).normalize();
      const facing = nose.sub(tail).normalize();
      assert.ok(facing.dot(direction) > .999, `${kind} must not swim backwards or sideways`);
    }
    const dolphin = app.current.scene.getObjectByName('dive-tripo-dolphin');
    const bounds = new THREE.Box3().setFromObject(dolphin,true).getSize(new THREE.Vector3());
    assert.ok(Math.max(bounds.x,bounds.z) > 2.5, 'the X-forward export must not be squeezed into the body-width budget');
  } finally {
    app.scene.dispose(); fixtures.forEach(([,fixture]) => fixture.asset.dispose());
  }
});
