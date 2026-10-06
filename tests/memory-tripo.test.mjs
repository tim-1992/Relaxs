import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {TRIPO_ASSETS, loadTripoAsset} from '../src/tripo-assets.js';
import {inspectMolesGLB} from '../src/moles-character.js';

let art;
try {art = await import('../src/memory-tripo-art.js');}
catch (error) {if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;}
const api = () => {assert.ok(art, 'memory must render its Tripo card faces'); return art;};

function glb() {
  const geometry = new THREE.BoxGeometry(2, 4, 1).toNonIndexed();
  const positions = geometry.attributes.position.array;
  const bytes = new Uint8Array(positions.buffer.slice(0));
  const json = {
    asset: {version: '2.0'}, scene: 0, scenes: [{nodes: [0]}],
    nodes: [{mesh: 0, translation: [8, -3, 2]}],
    meshes: [{primitives: [{attributes: {POSITION: 0}, material: 0}]}],
    materials: [{pbrMetallicRoughness: {baseColorFactor: [.25, .6, .4, 1]}}],
    buffers: [{byteLength: bytes.length}], bufferViews: [{buffer: 0, byteLength: bytes.length}],
    accessors: [{bufferView: 0, componentType: 5126, count: positions.length / 3,
      type: 'VEC3', min: [-1, -2, -.5], max: [1, 2, .5]}],
  };
  geometry.dispose();
  const text = new TextEncoder().encode(JSON.stringify(json)), size = Math.ceil(text.length / 4) * 4;
  const buffer = new ArrayBuffer(28 + size + bytes.length), view = new DataView(buffer), data = new Uint8Array(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, size, true); view.setUint32(16, 0x4e4f534a, true);
  data.fill(32, 20, 20 + size); data.set(text, 20);
  view.setUint32(20 + size, bytes.length, true); view.setUint32(24 + size, 0x004e4942, true);
  data.set(bytes, 28 + size);
  return {buffer, name: 'real-fixture.glb', source: 'Tripo'};
}

test('easy uses six distinct high-quality registry models; larger decks have distinct, named views', () => {
  const easy = api().memoryTripoFaces(6);
  assert.equal(easy.length, 6);
  assert.equal(new Set(easy.map(face => face.id)).size, 6);
  assert.ok(easy.every(face => TRIPO_ASSETS[face.id]?.model.startsWith('H')));
  const hard = api().memoryTripoFaces(12);
  assert.equal(hard.length, 12);
  assert.equal(new Set(hard.map(face => `${face.id}/${face.yaw}/${face.elevation}`)).size, 12);
  assert.equal(new Set(hard.map(face => face.name)).size, 12);
  assert.ok(hard.every(face => TRIPO_ASSETS[face.id]));
  const future = api().memoryTripoFaces(12, {...TRIPO_ASSETS,
    robot: {name: '机器人', model: 'H 3.1'}, fruit: {name: '水果', model: 'H 3.1'}});
  assert.ok(future.some(face => face.id === 'robot') && future.some(face => face.id === 'fruit'));
});

test('hard prefers twelve independent registry identities including orange/pine, never athlete plus its rig', () => {
  const faces = api().memoryTripoFaces(12);
  assert.equal(new Set(faces.map(face => TRIPO_ASSETS[face.id].task)).size, 12);
  assert.ok(faces.some(face => face.id === 'orange'));
  assert.ok(faces.some(face => face.id === 'pine'));
  assert.ok(!faces.some(face => face.id === 'athlete') || !faces.some(face => face.id === 'player'));
  assert.ok(faces.every(face => face.name.length <= 7), 'card labels remain readable in a small mobile grid');
});

function studioBoundary() {
  const rendered = [], listeners = new Map();
  let disposed = 0, contextLost = 0, environmentDisposed = 0, factoryCalls = 0;
  const renderer = {
    debug: {},
    domElement: {
      addEventListener(type, listener) {listeners.set(type, listener);},
      removeEventListener(type) {listeners.delete(type);},
      toDataURL() {return `data:image/png;base64,${Buffer.from(`image-${rendered.length}`).toString('base64')}`;},
    },
    setPixelRatio() {}, setSize() {}, setClearColor() {},
    render(scene, camera) {
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const model = scene.getObjectByName('memory-tripo-subject');
      assert.ok(model, 'the actual imported subject reaches the renderer');
      const bounds = new THREE.Box3().setFromObject(model, true);
      const points = [];
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z).project(camera));
      }
      rendered.push({points, scene, camera});
    },
    dispose() {disposed++;}, forceContextLoss() {contextLost++;},
  };
  const texture = new THREE.Texture();
  texture.addEventListener('dispose', () => environmentDisposed++);
  const studio = api().createMemoryThumbnailStudio({
    rendererFactory() {factoryCalls++; return renderer;},
    environmentFactory() {return {texture, dispose: () => texture.dispose()};},
  });
  return {studio, rendered, renderer, listeners,
    counts: () => ({disposed, contextLost, environmentDisposed, factoryCalls})};
}

test('real embedded GLBs are fitted inside card frames and one offscreen studio is released after the batch', async t => {
  const boundary = studioBoundary(), calls = [], released = new Set();
  const original = THREE.BufferGeometry.prototype.dispose;
  t.mock.method(THREE.BufferGeometry.prototype, 'dispose', function () {released.add(this); return original.call(this);});
  const gallery = await api().loadMemoryTripoArt({
    count: 12,
    loadAsset: async id => {calls.push(id); return glb();},
    createStudio: () => boundary.studio,
  });
  assert.equal(gallery.faces.filter(Boolean).length, 12);
  assert.equal(new Set(calls).size, calls.length, 'different views must reuse a decoded asset');
  assert.equal(boundary.rendered.length, 12);
  for (const frame of boundary.rendered) {
    assert.ok(frame.points.every(point => point.x > -1 && point.x < 1 && point.y > -1 && point.y < 1));
  }
  assert.ok(gallery.faces.every(face => face.src.startsWith('data:image/png;base64,') && face.source === 'Tripo'));
  assert.ok(released.size >= calls.length, 'loaded mesh geometry is released after thumbnail capture');
  assert.deepEqual(boundary.counts(), {disposed: 1, contextLost: 1, environmentDisposed: 1, factoryCalls: 1});
  gallery.dispose(); gallery.dispose();
  assert.equal(gallery.faces.length, 0, 'disposing a gallery releases retained image strings');
});

test('a failed asset leaves just its own card as fallback without blocking successful models', async () => {
  const boundary = studioBoundary();
  const gallery = await api().loadMemoryTripoArt({
    count: 6, createStudio: () => boundary.studio,
    loadAsset: async id => {if (id === 'turtle') throw Error('unavailable'); return glb();},
  });
  assert.equal(gallery.faces.filter(Boolean).length, 5);
  assert.equal(gallery.faces[2], null);
  assert.equal(boundary.counts().disposed, 1);
  gallery.dispose();
});

test('a pending twelfth model is replaced by an honestly labelled distinct view, using the same renderer', async () => {
  const boundary = studioBoundary(), calls = [];
  const gallery = await api().loadMemoryTripoArt({
    count: 12, createStudio: () => boundary.studio,
    loadAsset: async id => {calls.push(id); if (id === 'rider') throw Error('binary pending'); return glb();},
  });
  assert.equal(gallery.faces.filter(Boolean).length, 12);
  assert.equal(new Set(gallery.faces.map(face => face.id)).size, 11);
  assert.equal(new Set(gallery.faces.map(face => face.name)).size, 12);
  const repeated = gallery.faces.filter(face => gallery.faces.filter(other => other.id === face.id).length > 1);
  assert.equal(repeated.length, 2);
  assert.ok(repeated.every(face => /斜视|俯视|侧面/.test(face.name)));
  assert.ok(Math.abs(repeated[0].elevation - repeated[1].elevation) > .6);
  assert.equal(new Set(calls).size, calls.length, 'view fallback reuses already loaded binary bytes');
  assert.equal(boundary.counts().factoryCalls, 1);
  assert.equal(boundary.counts().disposed, 1);
  gallery.dispose();
});

test('GPU failure preserves the complete fallback deck without loading model binaries', async () => {
  let loads = 0;
  const gallery = await api().loadMemoryTripoArt({
    count: 8, createStudio() {throw Error('no GPU');}, loadAsset: async () => {loads++; return glb();},
  });
  assert.equal(loads, 0);
  assert.equal(gallery.faces.length, 8);
  assert.ok(gallery.faces.every(face => face === null));
  gallery.dispose();
});

test('cancellation releases the GPU immediately and no late asset can publish thumbnails', async () => {
  const boundary = studioBoundary(), abort = new AbortController();
  let deliver, calls = 0;
  const pending = api().loadMemoryTripoArt({
    count: 6, signal: abort.signal, createStudio: () => boundary.studio,
    loadAsset: () => {calls++; return new Promise(resolve => {deliver = resolve;});},
  });
  abort.abort();
  assert.equal(boundary.counts().disposed, 1, 'unmount cannot hold GPU resources until a registry timeout');
  deliver(glb());
  const gallery = await pending;
  assert.equal(calls, 1);
  assert.ok(gallery.faces.every(face => face === null));
  assert.equal(boundary.rendered.length, 0);
  assert.equal(boundary.counts().disposed, 1);
  gallery.dispose();
});

test('context loss never yields a claimed thumbnail and the studio disposes once', () => {
  const boundary = studioBoundary();
  boundary.listeners.get('webglcontextlost')({preventDefault() {}});
  const subject = new THREE.Group();
  assert.throws(() => boundary.studio.render(subject, api().memoryTripoFaces(6)[0]));
  boundary.studio.dispose();
  assert.equal(boundary.counts().disposed, 1);
});

test('shader failure cannot export a blank PNG and claim that its model rendered', () => {
  const boundary = studioBoundary();
  boundary.renderer.render = () => boundary.renderer.debug.onShaderError();
  const subject = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  assert.throws(() => boundary.studio.render(subject, api().memoryTripoFaces(6)[0]), /材质|渲染/);
  subject.geometry.dispose(); subject.material.dispose(); boundary.studio.dispose();
});

test('actual registry card models, including orange and pine, have usable embedded geometry and materials', async t => {
  const previousDocument = globalThis.document, previousData = globalThis.__RELAXS_TRIPO_DATA__;
  const loaded = [];
  globalThis.document = {
    baseURI: new URL('../index.html', import.meta.url).href,
    createElement: () => ({remove() {}}),
    head: {append(script) {
      const path = new URL(script.src);
      assert.equal(path.protocol, 'file:', 'only the project binary registry is used');
      loaded.push(path.pathname);
      void readFile(path, 'utf8').then(source => {
        vm.runInThisContext(source, {filename: path.pathname});
        script.onload();
      }).catch(() => script.onerror());
    }},
  };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousData === undefined) delete globalThis.__RELAXS_TRIPO_DATA__; else globalThis.__RELAXS_TRIPO_DATA__ = previousData;
  });
  const faces = api().memoryTripoFaces(12);
  const results = await Promise.allSettled(faces.map(face => loadTripoAsset(face.id)));
  assert.equal(new Set(loaded).size, 12);
  assert.ok(results.filter(result => result.status === 'fulfilled').length >= 11);
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === 'rejected') {
      assert.equal(faces[index].id, 'rider', 'only the pending rider binary can use the distinct-view fallback');
      continue;
    }
    const model = inspectMolesGLB(result.value.buffer);
    assert.equal(result.value.source, 'Tripo');
    assert.ok(model.meshes.some(mesh => mesh.primitives.some(primitive => model.accessors[primitive.attributes.POSITION].count > 100)));
    assert.ok(model.materials?.some(material => material.pbrMetallicRoughness));
    assert.ok(model.images?.length, 'the high-quality assets include their original texture maps');
  }
});
