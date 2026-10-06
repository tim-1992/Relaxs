import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createDemoWorld} from '../src/demolition-scene.js';
import * as mechanics from '../src/demolition-state.js';
import {createDemoState, hitDemo, stepDemo} from '../src/demolition-state.js';
import {createReleaseAudio} from '../src/release-audio.js';

// Real embedded GLB fixtures go through the production GLTFLoader. Off-center
// authoring coordinates exercise the extra fit after the reusable parser's fit.
function fixture({size = [2, 4, 1], name = 'fixture.glb', color = [.2, .65, .45, 1], yaw = 0, boxes} = {}) {
  const shapes = (boxes || [{size}]).map(shape => {
    const geometry = new THREE.BoxGeometry(...shape.size).toNonIndexed();
    geometry.translate(...(shape.position || [0, 0, 0])); geometry.rotateY(yaw); geometry.computeBoundingBox();
    return geometry;
  });
  const bounds = new THREE.Box3();
  for (const geometry of shapes) bounds.union(geometry.boundingBox);
  const minimum = bounds.min.toArray(), maximum = bounds.max.toArray();
  const positions = new Float32Array(shapes.flatMap(geometry => [...geometry.attributes.position.array]));
  const normals = new Float32Array(shapes.flatMap(geometry => [...geometry.attributes.normal.array]));
  const binary = new Uint8Array(positions.byteLength + normals.byteLength);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(normals.buffer), positions.byteLength);
  shapes.forEach(geometry => geometry.dispose());
  const json = {
    asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}],
    nodes: [{translation: [13, -8, 4], children: [1]}, {mesh: 0}],
    materials: [{pbrMetallicRoughness: {baseColorFactor: color, roughnessFactor: .6}}],
    meshes: [{name: 'genuine-glb-mesh', primitives: [{attributes: {POSITION: 0, NORMAL: 1}, material: 0}]}],
    accessors: [
      {bufferView: 0, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: minimum, max: maximum},
      {bufferView: 1, componentType: 5126, count: normals.length / 3, type: 'VEC3'},
    ],
    buffers: [{byteLength: binary.length}],
    bufferViews: [{buffer: 0, byteOffset: 0, byteLength: positions.byteLength},
      {buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength}],
  };
  const text = new TextEncoder().encode(JSON.stringify(json)), jsonSize = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(28 + jsonSize + binary.length), view = new DataView(buffer), bytes = new Uint8Array(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonSize); bytes.set(text, 20);
  view.setUint32(20 + jsonSize, binary.length, true); view.setUint32(24 + jsonSize, 0x004e4942, true);
  bytes.set(binary, 28 + jsonSize);
  return {name, buffer};
}
const meshes = root => {
  const result = []; root.traverse(object => {if (object.isMesh) result.push(object);}); return result;
};
const furniture = world => world.scene.getObjectByName('demo-furniture');
const model = (world, id) => furniture(world).children.find(root => root.userData.demoId === id);
const imported = root => root.getObjectByName('demo-tripo-model');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} differs from ${b}`);

test('embedded models replace matching visuals, preserve aspect and ground contact, and leave other furniture intact', async t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  const state = createDemoState(), before = structuredClone(state);
  world.render(state);
  const roots = new Map(furniture(world).children.map(root => [root.userData.demoId, root]));
  const tableBody = model(world, 'living-table').children[0];
  const result = await world.setTripoAssets({vase: fixture(), screen: fixture({size: [8, 5, .6], name: 'tv.glb'})});
  assert.deepEqual(result.loaded, ['vase', 'screen']);
  assert.deepEqual(result.failed, []);
  for (const object of state.objects) {
    const root = model(world, object.id);
    assert.equal(root, roots.get(object.id), 'loading assets must preserve collider roots and selection identity');
    if (!['vase', 'screen'].includes(object.kind)) {
      assert.equal(imported(root), undefined);
      continue;
    }
    assert.ok(imported(root));
    assert.equal(root.getObjectByName(object.kind === 'vase' ? 'vase-body' : 'screen-bezel'), undefined);
    const box = new THREE.Box3().setFromObject(imported(root), true), size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    close(box.min.y, object.position.y - object.size.y / 2);
    close(center.x, object.position.x); close(center.z, object.position.z);
    for (const axis of ['x', 'y', 'z']) assert.ok(size[axis] <= object.size[axis] + 1e-6);
    close(size.x / size.y, object.kind === 'vase' ? .5 : 1.6);
    close(size.z / size.y, object.kind === 'vase' ? .25 : .12);
    for (const mesh of meshes(imported(root))) assert.equal(mesh.userData.demoId, object.id);
  }
  assert.equal(model(world, 'living-table').children[0], tableBody);
  assert.deepEqual(state, before, 'asset loading cannot edit the simulation');
});

test('imported props retain collision picking, HP cracks, selection and the original support cascade/fragments', async t => {
  const world = createDemoWorld({reducedMotion: true}); t.after(() => world.dispose());
  const state = createDemoState({difficulty: 'hard'}), control = structuredClone(state);
  world.render(state);
  await world.setTripoAssets({vase: fixture(), screen: fixture({size: [8, 5, .6]})});
  const vase = state.objects.find(object => object.id === 'living-table-vase');
  for (const view of ['left', 'front', 'right']) {
    world.setView(view);
    const point = new THREE.Vector3(vase.position.x, vase.position.y, vase.position.z).project(world.camera);
    assert.equal(world.pickNdc(point.x, point.y), vase.id);
  }
  assert.equal(hitDemo(state, vase.id, {charge: .1}), hitDemo(control, vase.id, {charge: .1}));
  world.render(state, {selectedId: vase.id});
  assert.equal(model(world, vase.id).getObjectByName('damage-cracks').visible, true);
  assert.equal(world.scene.getObjectByName('demo-selection').visible, true);
  for (let i = 0; i < 10 && !state.objects.find(object => object.id === 'living-table').destroyed; i++) {
    for (const run of [state, control]) {stepDemo(run, 1); hitDemo(run, 'living-table', {charge: 1});}
    world.render(state, {selectedId: vase.id});
  }
  assert.equal(vase.destroyed, true);
  assert.equal(model(world, vase.id), undefined);
  assert.ok(state.fragments.length > 0 && state.stats.bestChain > 1);
  assert.deepEqual(state, control);
});

test('instances have private materials; breaking or resetting disposes clones without invalidating shared GLB geometry', async t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  let state = createDemoState();
  world.render(state);
  await world.setTripoAssets({vase: fixture()});
  const first = meshes(imported(model(world, 'living-table-vase')))[0];
  const second = meshes(imported(model(world, 'living-table-small-vase')))[0];
  assert.notEqual(first.material, second.material);
  assert.equal(first.geometry, second.geometry);
  const originalColor = second.material.color.getHex();
  first.material.color.setHex(0xff0000);
  assert.equal(second.material.color.getHex(), originalColor);
  let materialDisposed = 0, geometryDisposed = 0;
  first.material.addEventListener('dispose', () => materialDisposed++);
  first.geometry.addEventListener('dispose', () => geometryDisposed++);
  hitDemo(state, 'living-table-vase', {charge: 1}); world.render(state);
  assert.equal(materialDisposed, 1);
  assert.equal(geometryDisposed, 0, 'an intact second vase still uses the asset geometry');
  state = createDemoState(); world.render(state);
  assert.equal(meshes(imported(model(world, 'living-table-vase')))[0].material.color.getHex(), originalColor);
  world.dispose(); world.dispose();
  assert.equal(materialDisposed, 1); assert.equal(geometryDisposed, 1);
});

test('partial replacement and failed loads preserve other kinds and release replaced assets once', async t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  world.render(createDemoState());
  await world.setTripoAssets({vase: fixture(), screen: fixture({size: [8, 5, .6]})});
  const tv = imported(model(world, 'living-screen'));
  const oldVase = meshes(imported(model(world, 'living-table-vase')))[0];
  let released = 0; oldVase.geometry.addEventListener('dispose', () => released++);
  const failed = await world.setTripoAssets({vase: {name: 'bad.glb', buffer: new ArrayBuffer(20)}});
  assert.equal(failed.failed[0].kind, 'vase');
  assert.equal(meshes(imported(model(world, 'living-table-vase')))[0], oldVase);
  assert.equal(imported(model(world, 'living-screen')), tv);
  assert.equal(released, 0);
  await world.setTripoAssets({vase: fixture({color: [.8, .3, .2, 1]})});
  assert.equal(released, 1);
  assert.equal(imported(model(world, 'living-screen')), tv, 'vase reload cannot rebuild a healthy TV');
  world.dispose();
  assert.equal(released, 1);
});

test('newest per-kind request wins, room changes reuse assets, and unmount cancels late installs', async () => {
  const world = createDemoWorld();
  world.render(createDemoState());
  const stale = world.setTripoAssets({vase: fixture({name: 'old.glb'})});
  const latest = world.setTripoAssets({vase: fixture({name: 'latest.glb', color: [.8, .3, .2, 1]})});
  await Promise.all([stale, latest]);
  assert.equal(model(world, 'living-table-vase').userData.tripoName, 'latest.glb');
  world.render(createDemoState({room: 'study'}));
  assert.ok(imported(model(world, 'study-desk-vase')));
  const pending = world.setTripoAssets({screen: fixture({name: 'late-tv.glb'})});
  world.dispose();
  const result = await pending;
  assert.deepEqual(result.loaded, []);
  assert.equal(world.scene.children.length, 0);
  assert.deepEqual((await world.setTripoAssets({vase: fixture()})).loaded, []);
});

test('a decoded but invalid model releases GLB allocations and keeps procedural fallback usable', async t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  world.render(createDemoState());
  const vase = model(world, 'living-table-vase');
  const degenerate = fixture({size: [2, 0, 1]});
  const disposed = new Set();
  const original = THREE.BufferGeometry.prototype.dispose;
  t.mock.method(THREE.BufferGeometry.prototype, 'dispose', function () {disposed.add(this); return original.call(this);});
  const result = await world.setTripoAssets({vase: degenerate});
  assert.deepEqual(result.loaded, []);
  assert.equal(result.failed.length, 1);
  assert.ok(disposed.size > 0, 'failed decoded geometry must be reclaimed');
  assert.equal(model(world, 'living-table-vase'), vase);
  assert.ok(vase.getObjectByName('vase-body'));
  assert.equal(imported(vase), undefined);
});

test('sofas and arbitrary furniture kinds import without changing support rules or other loaded assets', async t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  const state = createDemoState(), before = structuredClone(state);
  world.render(state);
  await world.setTripoAssets({vase: fixture()});
  const vase = imported(model(world, 'living-table-vase'));
  const result = await world.setTripoAssets({
    sofa: fixture({size: [2.3, 1, 1.1]}),
    table: fixture({size: [2.2, .75, 1.15]}),
    ottoman: fixture({size: [1, .5, 1]}),
  });
  assert.deepEqual(new Set(result.loaded), new Set(['vase', 'sofa', 'table', 'ottoman']));
  assert.ok(imported(model(world, 'living-sofa')));
  assert.ok(imported(model(world, 'living-table')));
  assert.equal(imported(model(world, 'living-table-vase')), vase);
  const box = new THREE.Box3().setFromObject(imported(model(world, 'living-sofa')), true);
  close(box.min.y, 0); close(box.max.y, 1);
  const center = new THREE.Vector3(-2.35, .5, .55).project(world.camera);
  assert.equal(world.pickNdc(center.x, center.y), 'living-sofa');
  assert.deepEqual(state, before);
  const control = structuredClone(state);
  for (let i = 0; i < 12 && !state.objects.find(object => object.id === 'living-sofa').destroyed; i++) {
    for (const run of [state, control]) {stepDemo(run, 1); hitDemo(run, 'living-sofa');}
    world.render(state);
  }
  assert.ok(state.objects.filter(object => object.supportId === 'living-sofa').every(object => object.destroyed));
  assert.deepEqual(state, control);
  assert.equal(imported(model(world, 'living-table-vase')), vase);
  const custom = {...createDemoState(), objects: [{
    id: 'custom-footstool', kind: 'ottoman', material: 'fabric', color: 0x888888,
    position: {x: 0, y: .25, z: 0}, size: {x: 1, y: .5, z: 1}, hp: 50, maxHp: 50,
  }]};
  world.render(custom);
  assert.ok(imported(model(world, 'custom-footstool')));
});

test('props rest on the actual imported support surface and remain pickable without editing physics', async t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  const state = createDemoState(), before = structuredClone(state);
  world.render(state);
  // A lower seat fills the original footprint but is shorter than the old sofa.
  await world.setTripoAssets({sofa: fixture({size: [2.3, .45, 1.1]})});
  const cushion = state.objects.find(object => object.id === 'living-cushion-1');
  world.render(state, {selectedId: cushion.id});
  const root = model(world, cushion.id), bounds = new THREE.Box3().setFromObject(root.getObjectByName('demo-body'), true);
  close(bounds.min.y, .45);
  close(world.scene.getObjectByName('demo-selection').children[0].position.y, root.position.y);
  const point = root.position.clone().project(world.camera);
  assert.equal(world.pickNdc(point.x, point.y), cushion.id, 'the original sofa proxy must not swallow a visible cushion');
  assert.deepEqual(state, before);
});

test('a diagonally exported TV with a stand keeps a usable screen size and a covering pick proxy', async t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  const state = createDemoState(), before = structuredClone(state);
  world.render(state);
  await world.setTripoAssets({screen: fixture({size: [1.5, 1, .32], yaw: -Math.PI / 3})});
  world.render(state, {selectedId: 'living-screen'});
  const root = model(world, 'living-screen'), bounds = new THREE.Box3().setFromObject(imported(root), true);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > 1.4 && size.y > .9, 'the stand must not shrink the whole TV into the old 16cm panel depth');
  close(size.x / size.y, 1.5);
  const proxy = new THREE.Box3().setFromObject(root.getObjectByName('demo-pick-collider'), true);
  assert.ok(bounds.min.z >= proxy.min.z - 1e-6 && bounds.max.z <= proxy.max.z + 1e-6);
  assert.ok(world.scene.getObjectByName('demo-selection').children[0].scale.z >= size.z);
  assert.deepEqual(state, before);
});

test('sofa alignment resolves front and back so a rear-facing export exposes its seat', async t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  world.render(createDemoState());
  await world.setTripoAssets({sofa: fixture({yaw: .7, boxes: [
    {size: [2.2, .45, 1], position: [0, .225, 0]},
    {size: [2.2, .55, .16], position: [0, .725, .42]},
  ]})});
  world.render(createDemoState());
  const root = model(world, 'living-sofa'), visual = imported(root);
  const bounds = new THREE.Box3().setFromObject(visual, true), center = bounds.getCenter(new THREE.Vector3());
  const point = new THREE.Vector3(); let z = 0, count = 0;
  visual.traverse(object => {
    if (!object.isMesh) return;
    for (let index = 0; index < object.geometry.attributes.position.count; index++) {
      object.getVertexPosition(index, point).applyMatrix4(object.matrixWorld);
      if (point.y > bounds.max.y - .1) {z += point.z; count++;}
    }
  });
  assert.ok(z / count < center.z - .1, 'the tall backrest belongs behind the seat toward room -Z');
});

test('daylight passes through the window opening while solid wall still casts a shadow', t => {
  const world = createDemoWorld(); t.after(() => world.dispose());
  world.render(createDemoState());
  const shell = world.scene.getObjectByName('demo-room');
  const ray = new THREE.Raycaster();
  const blockers = (x, y) => {
    ray.set(new THREE.Vector3(x, y, 0), new THREE.Vector3(0, 0, -1));
    return ray.intersectObject(shell, true).filter(hit => hit.object.castShadow);
  };
  assert.equal(blockers(2.05, 2.35).length, 0, 'a solid wall behind decorative glass would block the sunlight');
  assert.ok(blockers(0, 1).length > 0, 'the surrounding plaster must remain an opaque room wall');
});

test('procedural PBR textures remain usable through room changes and are released exactly once', () => {
  const world = createDemoWorld();
  world.render(createDemoState());
  const textures = new Map();
  const collect = texture => {
    if (!texture?.isTexture || textures.has(texture)) return;
    textures.set(texture, 0);
    texture.addEventListener('dispose', () => textures.set(texture, textures.get(texture) + 1));
  };
  world.scene.traverse(object => {
    for (const material of [object.material].flat().filter(Boolean)) Object.values(material).forEach(collect);
  });
  collect(world.scene.environment);
  assert.ok(textures.size > 0, 'material textures must be real GPU resources');
  for (const texture of textures.keys()) {
    assert.ok(texture.image.data.length > 0);
    assert.ok(texture.image.width <= 512 && texture.image.height <= 512, 'self-contained textures stay bounded');
  }
  world.render(createDemoState({room: 'study'}));
  for (const disposed of textures.values()) assert.equal(disposed, 0, 'room reset must not dispose shared textures');
  world.dispose(); world.dispose();
  for (const disposed of textures.values()) assert.equal(disposed, 1);
});

// Small DOM/GPU boundary for the real controller + world + GLB parser. The only
// deferred operation is when the browser delivers the model-loading completion.
function mountWithAssets(tripoAssets, {fallback = false, audioFactory} = {}) {
  const events = target => {
    const listeners = new Map();
    return Object.assign(target, {
      addEventListener(name, fn) {if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn);},
      async emit(name, event) {for (const fn of listeners.get(name) || []) await fn(event);},
    });
  };
  const doc = events({hidden: false});
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.attributes = {};
      this.children = []; this.dataset = {}; this.style = {}; this.hidden = this.disabled = false;
      this.classList = {add() {}, toggle() {}};
      events(this);
    }
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      if (key === 'hidden' || key === 'disabled') this[key] = true;
    }
    getAttribute(key) {return this.attributes[key] ?? null;}
    set className(value) {this.attributes.class = value;}
    get className() {return this.attributes.class || '';}
    set textContent(value) {this.text = String(value); this.children = [];}
    get textContent() {return (this.text || '') + this.children.map(child => child.textContent).join('');}
    set innerHTML(value) {
      this.children = []; this.text = ''; const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1).text = (stack.at(-1).text || '') + token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const element = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) element.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).append(element);
        if (!['INPUT', 'BR', 'HR', 'IMG'].includes(element.tagName)) stack.push(element);
      }
    }
    append(child) {child.parentElement = this; this.children.push(child);}
    remove() {if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;}
    contains(child) {return child === this || this.children.some(element => element.contains(child));}
    closest(selector) {return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null;}
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(value => this.matches(value.trim()));
      if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      return attr ? attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2] : this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) {return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    focus() {}
    getBoundingClientRect() {return {left: 0, top: 0, width: 800, height: 500};}
  }
  const frames = new Map(); let nextFrame = 0, completeLoad, pending, sourceState;
  const win = events({
    matchMedia: () => ({matches: false}), requestAnimationFrame(fn) {frames.set(++nextFrame, fn); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);},
  });
  doc.defaultView = win; doc.createElement = tag => new Element(tag);
  const world = createDemoWorld();
  const source = readFileSync(new URL('../src/demolition-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountDemolition', 'function mountDemolition');
  const context = vm.createContext({AbortController, console: {warn() {}}, imports: {
    './demolition-state.js': mechanics,
    './release-audio.js': {createReleaseAudio: audioFactory || (() => ({pause() {}, resume() {}, destroy() {}}))},
    './demolition-scene.js': {createDemoScene() {
      if (fallback) throw new Error('no WebGL');
      return {
        render(state, options, dt) {sourceState = state; return world.render(state, options, dt);},
        setView: world.setView, resize() {}, dispose: world.dispose,
        setTripoAssets(assets) {
          pending = new Promise(resolve => {completeLoad = resolve;}).then(() => world.setTripoAssets(assets));
          return pending;
        },
      };
    }},
  }});
  vm.runInContext(source, context);
  const container = new Element('main');
  const cleanup = context.mountDemolition(container, {tripoAssets});
  const root = container.children[0];
  return {
    root, container, world, frames, win, doc, get state() {return sourceState;},
    click(selector) {return root.emit('click', {target: root.querySelector(selector), detail: 0});},
    async finishLoading() {assert.ok(completeLoad, 'mount must request the supplied GLBs'); completeLoad(); await pending; await Promise.resolve();},
    cleanup() {cleanup(); world.dispose();},
  };
}

test('mount shows the tiny Tripo label only after real assets are loaded, including partial success', async t => {
  const app = mountWithAssets({vase: fixture(), screen: {name: 'bad.glb', buffer: new ArrayBuffer(20)}});
  t.after(app.cleanup);
  const label = app.root.querySelector('[data-tripo-status]');
  assert.ok(label);
  assert.equal(label.hidden, true);
  const before = structuredClone(app.state);
  await app.finishLoading();
  assert.equal(label.hidden, false);
  assert.equal(label.textContent, 'Tripo 家具：花瓶');
  assert.deepEqual(app.state, before);
  assert.ok(imported(model(app.world, 'living-table-vase')));
  assert.ok(model(app.world, 'living-screen').getObjectByName('screen-bezel'));
});

test('unmount or WebGL fallback cannot claim that a pending Tripo model is on screen', async () => {
  const app = mountWithAssets({vase: fixture()});
  const label = app.root.querySelector('[data-tripo-status]');
  app.cleanup();
  await app.finishLoading();
  assert.equal(label.hidden, true);
  assert.equal(app.container.children.length, 0);
  assert.equal(app.world.scene.children.length, 0);
  assert.equal(app.frames.size, 0);
  const fallback = mountWithAssets({vase: fixture()}, {fallback: true});
  assert.equal(fallback.root.querySelector('[data-tripo-status]').hidden, true);
  fallback.cleanup();
});

test('the loaded label includes sofa and other furniture kinds without undefined names', async t => {
  const app = mountWithAssets({sofa: fixture({size: [2.3, 1, 1.1]}), table: fixture()});
  t.after(app.cleanup);
  await app.finishLoading();
  assert.equal(app.root.querySelector('[data-tripo-status]').textContent, 'Tripo 家具：沙发、桌子');
});

test('secondary room settings and detailed instructions start collapsed while direct play stays accessible', t => {
  const app = mountWithAssets(null); t.after(app.cleanup);
  const options = app.root.querySelector('.demo-options'), help = app.root.querySelector('.demo-help');
  assert.equal(options?.tagName, 'DETAILS');
  assert.equal(help?.tagName, 'DETAILS');
  assert.equal(options.getAttribute('open'), null); assert.equal(help.getAttribute('open'), null);
  assert.ok(options.contains(app.root.querySelector('[data-room]')));
  assert.ok(options.contains(app.root.querySelector('[data-view]')));
  assert.equal(options.contains(app.root.querySelector('[data-action="sound"]')), false, 'mute stays directly reachable');
  assert.ok(help.contains(app.root.querySelector('.demo-goal-items')));
  assert.equal(options.contains(app.root.querySelector('[data-action="pause"]')), false);
  assert.equal(options.contains(app.root.querySelector('[data-target-select]')), false);
  assert.ok(app.root.querySelector('.demo-stage'));
  assert.equal(app.root.querySelector('[data-action="strike"]').disabled, false);
});

function audioHardware(t, {defer = false} = {}) {
  const output = {contexts: [], notes: [], active: new Set()};
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  let resolveResume;
  const gate = defer ? new Promise(resolve => {resolveResume = resolve;}) : Promise.resolve();
  const parameter = () => ({value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}});
  const node = () => ({connect() {}, disconnect() {}});
  class Device {
    constructor() {output.contexts.push(this); this.state = 'suspended'; this.sampleRate = 100; this.currentTime = 0; this.destination = {};}
    createGain() {return {...node(), gain: parameter()};}
    createDynamicsCompressor() {return {...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter()};}
    createBuffer(_channels, length) {return {getChannelData: () => new Float32Array(length)};}
    createBiquadFilter() {return {...node(), frequency: parameter(), Q: parameter()};}
    source(kind) {
      return {...node(), frequency: parameter(),
        start() {output.notes.push(kind); output.active.add(this);},
        stop(at) {if (at === undefined) output.active.delete(this);}};
    }
    createOscillator() {return this.source('impact');}
    createBufferSource() {return this.source('glass');}
    async resume() {this.state = 'running'; await gate;}
    async suspend() {this.state = 'suspended';}
    async close() {this.state = 'closed';}
  }
  Object.defineProperty(globalThis, 'AudioContext', {configurable: true, value: Device});
  t.after(() => previous ? Object.defineProperty(globalThis, 'AudioContext', previous) : delete globalThis.AudioContext);
  return {...output, finish: async () => {resolveResume?.(); for (let i = 0; i < 10; i++) await Promise.resolve();}};
}

test('first play gesture unlocks real material audio, and pause, mute and cleanup silence it', async t => {
  const audio = audioHardware(t), app = mountWithAssets(null, {audioFactory: createReleaseAudio});
  t.after(app.cleanup);
  assert.equal(audio.contexts.length, 0, 'mount must not create an audio device');
  const select = app.root.querySelector('[data-target-select]');
  select.value = 'living-table-vase'; await app.root.emit('change', {target: select});
  await app.click('[data-action="strike"]'); await audio.finish();
  assert.equal(audio.contexts.length, 1);
  assert.ok(audio.notes.includes('impact') && audio.notes.includes('glass'), 'first gesture retains both strike and material break sound');
  const sound = app.root.querySelector('[data-action="sound"]');
  assert.equal(sound.getAttribute('aria-pressed'), 'true');
  await app.win.emit('blur', {});
  assert.equal(audio.active.size, 0); assert.equal(audio.contexts[0].state, 'suspended');
  assert.match(sound.textContent, /暂停/);
  await app.click('[data-action="resume"]'); await audio.finish();
  await app.click('[data-action="sound"]');
  assert.equal(sound.getAttribute('aria-pressed'), 'false');
  const before = audio.notes.length;
  stepDemo(app.state, 1);
  await app.click('[data-action="strike"]'); await audio.finish();
  assert.equal(audio.notes.length, before, 'an explicit mute must survive subsequent play gestures');
  app.cleanup();
  assert.equal(audio.contexts[0].state, 'closed'); assert.equal(audio.active.size, 0);
});

test('paused sound preference matches the button and pending first-gesture audio cannot outlive unmount', async t => {
  const audio = audioHardware(t, {defer: true});
  const app = mountWithAssets(null, {audioFactory: createReleaseAudio}); t.after(app.cleanup);
  await app.click('[data-action="pause"]');
  await app.click('[data-action="sound"]');
  const sound = app.root.querySelector('[data-action="sound"]');
  assert.equal(sound.getAttribute('aria-pressed'), 'true');
  assert.equal(audio.contexts.length, 0, 'choosing sound while paused must not activate the device');
  await app.click('[data-action="resume"]');
  await app.click('[data-action="strike"]');
  app.cleanup(); await audio.finish();
  assert.equal(audio.notes.length, 0);
  assert.equal(audio.contexts[0].state, 'closed'); assert.equal(audio.active.size, 0);
});
