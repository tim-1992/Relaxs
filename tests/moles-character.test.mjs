import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  MOLES_MAX_MODEL_BYTES, inspectMolesGLB, createMolesCharacterAsset, loadMolesCharacter,
} from '../src/moles-character.js';

function glb(json, binary = new Uint8Array()) {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonSize = Math.ceil(encoded.length / 4) * 4, binSize = Math.ceil(binary.byteLength / 4) * 4;
  const bytes = new ArrayBuffer(12 + 8 + jsonSize + (binSize ? 8 + binSize : 0));
  const view = new DataView(bytes), out = new Uint8Array(bytes);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true);
  out.fill(32, 20, 20 + jsonSize); out.set(encoded, 20);
  if (binSize) {
    view.setUint32(20 + jsonSize, binSize, true); view.setUint32(24 + jsonSize, 0x004e4942, true);
    out.set(binary, 28 + jsonSize);
  }
  return bytes;
}

test('GLB preflight rejects external resources, malformed containers and compressed dependencies', () => {
  assert.equal(inspectMolesGLB(glb({asset:{version:'2.0'}})).asset.version, '2.0');
  for (const uri of ['https://example.com/texture.png', '//example.com/a.bin', 'texture.png', 'blob:untrusted']) {
    assert.throws(() => inspectMolesGLB(glb({asset:{version:'2.0'}, images:[{uri}]})), /外部|嵌入/);
  }
  assert.throws(() => inspectMolesGLB(glb({asset:{version:'2.0'}, extensionsUsed:['KHR_draco_mesh_compression']})), /压缩/);
  assert.throws(() => inspectMolesGLB(new ArrayBuffer(10)), /GLB/);
  const malformed = glb({asset:{version:'2.0'}});
  new DataView(malformed).setUint32(8, 123, true);
  assert.throws(() => inspectMolesGLB(malformed), /GLB/);
});

test('oversized files are rejected before reading and cancelled reads never decode', async () => {
  let read = false;
  await assert.rejects(loadMolesCharacter({name:'too-large.glb', size:MOLES_MAX_MODEL_BYTES+1, arrayBuffer() {read=true;}}), /20 MB/);
  assert.equal(read, false);
  const abort = new AbortController();
  let release;
  const pending = loadMolesCharacter({name:'late.glb', size:100, arrayBuffer:() => new Promise(resolve => {release=resolve;})}, {signal:abort.signal});
  abort.abort();
  release(glb({asset:{version:'2.0'}}));
  await assert.rejects(pending, {name:'AbortError'});
});

test('nine fitted clones share mesh resources and release them exactly once', () => {
  const geometry = new THREE.BoxGeometry(4, 8, 2), material = new THREE.MeshStandardMaterial();
  const texture = new THREE.Texture(); material.map = texture;
  let closed = 0; texture.source.data = {close() {closed++;}};
  const root = new THREE.Group(), mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(13, -8, 4); root.add(mesh);
  const asset = createMolesCharacterAsset({scene:root, scenes:[root]}, '我的 Tripo 小怪兽.glb');
  const clones = Array.from({length:9}, () => asset.createInstance());
  assert.equal(asset.name, '我的 Tripo 小怪兽.glb');
  for (const clone of clones) {
    const box = new THREE.Box3().setFromObject(clone), size = box.getSize(new THREE.Vector3());
    assert.ok(size.y <= 1.400001 && size.x <= 1.300001 && size.z <= .850001);
    assert.ok(Math.abs(box.min.y + .3) < 1e-8);
    assert.ok(Math.abs(box.getCenter(new THREE.Vector3()).x) < 1e-8);
    const meshes = []; clone.traverse(object => {if (object.isMesh) meshes.push(object);});
    assert.equal(meshes[0].geometry, geometry);
    assert.equal(meshes[0].material, material);
  }
  let disposed = 0;
  for (const resource of [geometry, material, texture]) resource.addEventListener('dispose', () => disposed++);
  asset.dispose(); asset.dispose();
  assert.equal(disposed, 3);
  assert.equal(closed, 1);
  assert.throws(() => asset.createInstance(), /释放/);
});

test('a small self-contained GLB loads through the actual GLTFLoader', async () => {
  const positions = new Float32Array([-1,0,0, 1,0,0, 0,2,0]);
  const bytes = glb({
    asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}],
    accessors:[{bufferView:0, componentType:5126, count:3, type:'VEC3', min:[-1,0,0], max:[1,2,0]}],
    buffers:[{byteLength:positions.byteLength}], bufferViews:[{buffer:0, byteOffset:0, byteLength:positions.byteLength}],
  }, new Uint8Array(positions.buffer));
  const asset = await loadMolesCharacter({name:'Tripo-test.glb',size:bytes.byteLength,arrayBuffer:async () => bytes});
  try {
    assert.equal(asset.name, 'Tripo-test.glb');
    assert.ok(asset.createInstance().isGroup);
  } finally {asset.dispose();}
});
