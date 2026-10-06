import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectMolesGLB} from '../src/moles-character.js';
import {TRIPO_ASSETS} from '../src/tripo-assets.js';
import {shippedTripoBytes} from './tripo-fixture.mjs';

const folders = {
  monster:'mint-monster', athlete:'realistic-athlete', player:'athlete-rig',
  motorcycle:'realistic-motorcycle', turtle:'realistic-turtle', coral:'realistic-coral',
  sofa:'realistic-sofa', tv:'realistic-tv', vase:'realistic-vase', car:'realistic-car',
  orange:'realistic-orange', pine:'realistic-pine', rider:'rider-rig',
  manta:'reef-manta', dolphin:'reef-dolphin', clownfish:'reef-clownfish', angelfish:'reef-angelfish',
  seafan:'reef-seafan', tablecoral:'reef-tablecoral', anemone:'reef-anemone',
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function unpack(bytes) {
  const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());
  const binary = bytes.subarray(28+bytes.readUInt32LE(12));
  return {json,binary};
}

test('every shipped data script contains a self-contained GLB with valid buffers and declared WebP textures', () => {
  assert.deepEqual(Object.keys(folders).sort(),Object.keys(TRIPO_ASSETS).sort(),'verify every registered asset');
  for(const id of Object.keys(folders)) {
    const bytes=shippedTripoBytes(id);
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    inspectMolesGLB(buffer);
    const {json,binary}=unpack(bytes);
    assert.ok(json.meshes?.length && json.accessors?.length,`${id} must contain real mesh data`);
    for(const view of json.bufferViews) {
      assert.ok((view.byteOffset||0)+view.byteLength<=binary.length,`${id} truncated buffer`);
    }
    assert.ok(json.extensionsRequired?.includes('EXT_texture_webp'),`${id} must declare its WebP dependency`);
    assert.ok(json.extensionsUsed?.includes('EXT_texture_webp'));
    for(const texture of json.textures) {
      const source=texture.extensions?.EXT_texture_webp?.source;
      assert.equal(json.images[source]?.mimeType,'image/webp',`${id} texture must refer to its actual WebP image`);
    }
  }
});

for(const [id,folder] of Object.entries(folders)) {
  const originalPath=new URL(`../artifacts/tripo/${folder}/model.glb`,import.meta.url);
  test(`${id}: shipped geometry and rig preserve the original generated model`, {
    skip:!existsSync(originalPath) && `Original artifacts/tripo/${folder}/model.glb is absent from this source checkout; original-model preservation comparison requires it`,
  },()=>{
    const bytes=shippedTripoBytes(id), {json,binary}=unpack(bytes);
    const original=unpack(readFileSync(originalPath));
    assert.deepEqual(json.meshes,original.json.meshes,`${id} mesh topology must be unchanged`);
    assert.deepEqual(json.accessors,original.json.accessors,`${id} vertex layout must be unchanged`);
    assert.deepEqual(json.nodes,original.json.nodes,`${id} transforms must be unchanged`);
    assert.deepEqual(json.skins,original.json.skins,`${id} joints and bind matrices must be unchanged`);
    const images=new Set(json.images.map(image=>image.bufferView));
    for(const [index,view] of json.bufferViews.entries()) {
      if(images.has(index))continue;
      const before=original.json.bufferViews[index];
      const actual=binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
      const expected=original.binary.subarray(before.byteOffset||0,(before.byteOffset||0)+before.byteLength);
      assert.equal(hash(actual),hash(expected),`${id} geometry/animation buffer ${index} changed`);
    }
    const optimizedPath=new URL(`../artifacts/tripo/${folder}/game.glb`,import.meta.url);
    if(existsSync(optimizedPath)) {
      assert.equal(hash(bytes),hash(readFileSync(optimizedPath)),`${id} shipped binary differs from verified GLB`);
    }
  });
}
