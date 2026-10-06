import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {inspectMolesGLB} from '../src/moles-character.js';
import {createCrusherWorld} from '../src/crusher-scene.js';
import {createCrusherState, feedCrusher, stepCrusher, beginCrusherPressure, releaseCrusherPressure} from '../src/crusher-state.js';

const modelPath = new URL('../artifacts/tripo/realistic-car/model.glb', import.meta.url);
const gamePath = new URL('../artifacts/tripo/realistic-car/game.glb', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function glb(path) {
  const bytes = readFileSync(path);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const json = inspectMolesGLB(buffer);
  const binary = bytes.subarray(28 + bytes.readUInt32LE(12));
  const viewBytes = index => {
    const view = json.bufferViews[index], start = view.byteOffset || 0;
    return binary.subarray(start, start + view.byteLength);
  };
  function accessor(index) {
    const info = json.accessors[index], source = viewBytes(info.bufferView);
    const components = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[info.type];
    const ArrayType = {5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array}[info.componentType];
    const start = info.byteOffset || 0, length = info.count * components * ArrayType.BYTES_PER_ELEMENT;
    const copied = source.subarray(start, start + length);
    return {data: new ArrayType(copied.buffer.slice(copied.byteOffset, copied.byteOffset + copied.byteLength)), components};
  }
  return {bytes, buffer, json, viewBytes, accessor};
}

// No WebGL or browser is started. GLTFLoader, embedded bytes, geometry,
// transforms and materials are real. Replace only browser bitmap decoding,
// reading dimensions from the actual encoded image and tracking its lifecycle.
function bitmapBoundary(t) {
  const original = {self: globalThis.self, createImageBitmap: globalThis.createImageBitmap};
  const images = [];
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async blob => {
    const bytes = Buffer.from(await blob.arrayBuffer());
    let width, height;
    if (bytes.subarray(1, 4).toString() === 'PNG') {
      width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    } else if (bytes.subarray(0, 4).toString() === 'RIFF') {
      const kind = bytes.subarray(12, 16).toString();
      if (kind === 'VP8 ') {width = bytes.readUInt16LE(26) & 0x3fff; height = bytes.readUInt16LE(28) & 0x3fff;}
      else if (kind === 'VP8X') {width = 1 + bytes.readUIntLE(24, 3); height = 1 + bytes.readUIntLE(27, 3);}
      else if (kind === 'VP8L') {
        const bits = bytes.readUInt32LE(21);
        width = 1 + (bits & 0x3fff); height = 1 + ((bits >>> 14) & 0x3fff);
      }
    } else if (bytes.readUInt16BE(0) === 0xffd8) {
      for (let offset = 2; offset < bytes.length;) {
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++], length = bytes.readUInt16BE(offset);
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break;
        }
        offset += length;
      }
    }
    assert.ok(width > 0 && height > 0, 'actual embedded image header must decode');
    const image = {width, height, digest: hash(bytes), closed: 0, close() {this.closed++;}};
    images.push(image);
    return image;
  };
  t.after(() => {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  });
  return images;
}

test('the real 2K car preserves the original Tripo geometry and embedded PBR maps', {
  skip: !existsSync(modelPath) || !existsSync(gamePath) ? 'generated car artifacts are not in this checkout' : false,
}, () => {
  const original = glb(modelPath), game = glb(gamePath);
  assert.match(game.json.asset.generator, /tripo/i);
  assert.ok(game.bytes.length < original.bytes.length / 2);
  assert.deepEqual(game.json.nodes, original.json.nodes);
  assert.deepEqual(game.json.meshes, original.json.meshes);
  assert.deepEqual(game.json.materials, original.json.materials);
  for (const mesh of game.json.meshes) for (const primitive of mesh.primitives) {
    for (const index of [primitive.indices, ...Object.values(primitive.attributes)]) {
      assert.deepEqual(game.accessor(index), original.accessor(index), '2K optimization must only change images');
    }
  }
});

for (const [name, path] of [['model.glb', modelPath], ['game.glb', gamePath]]) {
  test(`real ${name} is the active car, faces +X and preserves world-Y crush/grounding through ejection`, {
    skip: !existsSync(path) ? 'generated car artifact is not in this checkout' : false,
  }, async t => {
    const input = glb(path), images = bitmapBoundary(t);
    const world = createCrusherWorld({reducedMotion: true});
    t.after(() => world.dispose());
    const procedural = world.scene.getObjectByName('crusher-car');
    assert.equal(await world.loadTripoCar({buffer: input.buffer, name}), name);
    let state = createCrusherState();
    world.render(state);
    const car = world.scene.getObjectByName('crusher-car');
    assert.notEqual(car, procedural);
    assert.equal(procedural.parent, null);
    assert.equal(car.userData.source, 'tripo');
    assert.equal(car.userData.assetName, name);
    assert.equal(car.getObjectByName('car-roof'), undefined, 'the procedural car cannot masquerade as the loaded asset');
    assert.equal(world.scene.getObjectByName('crusher-toys').children.filter(object => object.name === 'crusher-car').length, 1);
    const primitive = input.json.meshes[0].primitives[0];
    const originalTriangles = input.accessor(primitive.indices).data.length / 3;
    assert.ok(originalTriangles > 30000, 'exercise the real generated mesh');
    assert.equal(car.children.reduce((count, part) => count + part.geometry.attributes.position.count / 3, 0), originalTriangles);
    assert.ok(car.children.length > 4, 'a single generated mesh must become actual fracture parts');
    const expectedImages = new Set(input.json.images.map(image => hash(input.viewBytes(image.bufferView))));
    assert.equal(images.length, 3);
    for (const image of images) {
      assert.ok(expectedImages.has(image.digest), 'the textures must come from this GLB');
      if (name === 'game.glb') assert.deepEqual([image.width, image.height], [2048, 2048]);
    }
    for (const part of car.children) {
      assert.ok(part.geometry.attributes.uv && part.geometry.attributes.normal);
      for (const material of [part.material].flat()) {
        for (const slot of ['map', 'normalMap', 'metalnessMap', 'roughnessMap']) {
          assert.ok(expectedImages.has(material[slot]?.image.digest), `missing original ${slot}`);
        }
      }
    }

    // Offline inspection of both textured end views confirms the grille and
    // headlights are at source +X; the red taillights are at -X. Track those
    // exact source vertices via their retained UVs, rather than mesh names.
    const positions = input.accessor(primitive.attributes.POSITION).data;
    const uvs = input.accessor(primitive.attributes.TEXCOORD_0).data;
    let frontIndex = 0, rearIndex = 0;
    for (let i = 0; i < positions.length / 3; i++) {
      if (positions[i * 3] > positions[frontIndex * 3]) frontIndex = i;
      if (positions[i * 3] < positions[rearIndex * 3]) rearIndex = i;
    }
    function landmark(index) {
      for (const part of car.children) {
        const {uv, position} = part.geometry.attributes;
        for (let i = 0; i < uv.count; i++) {
          if (uv.getX(i) === uvs[index * 2] && uv.getY(i) === uvs[index * 2 + 1]) {
            return new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld);
          }
        }
      }
      assert.fail('source landmark/UV was lost');
    }
    const front = landmark(frontIndex), rear = landmark(rearIndex);
    assert.ok(front.x > car.position.x + .8 && rear.x < car.position.x - .8, 'nose must lead toward press/outfeed +X');
    const initial = new THREE.Box3().setFromObject(car, true);
    const sourceArrays = car.children.map(part => part.geometry.attributes.position.array.slice());
    state = stepCrusher(feedCrusher(state), 1.3);
    world.render(state);
    assert.ok(car.position.x > -1e-6, 'actual model must move on the conveyor');
    const shot = releaseCrusherPressure(stepCrusher(beginCrusherPressure(state), .69 / .38));
    world.render(stepCrusher(shot, .65));
    const flattened = new THREE.Box3().setFromObject(car, true);
    assert.ok(flattened.max.y - flattened.min.y < (initial.max.y - initial.min.y) * .35);
    assert.ok(flattened.max.x - flattened.min.x > (initial.max.x - initial.min.x) * .95, 'only compress in world Y');
    const compressed = car.children.map(part => part.position.clone());
    world.render(stepCrusher(shot, 1.45));
    assert.ok(car.children.some((part, i) => part.position.distanceTo(compressed[i]) > .1));
    for (let frame = 0; frame <= 64; frame++) {
      const pose = stepCrusher(shot, frame / 20);
      world.render(pose);
      const bounds = new THREE.Box3().setFromObject(car, true);
      assert.ok(bounds.min.y >= .90 - 1e-6, 'no real vertex may sink through the rollers');
      if (bounds.max.x >= 2.95) assert.ok(bounds.min.y >= .96 - 1e-6, 'real fragments must clear the raised tray');
      if (['pressing', 'breaking'].includes(pose.phase)) {
        const head = new THREE.Box3().setFromObject(world.scene.getObjectByName('press-shoe'), true);
        assert.ok(bounds.max.y < head.min.y, 'car may not intersect the press shoe');
      }
    }
    assert.ok(car.position.x > 3);
    car.children.forEach((part, i) => assert.deepEqual(part.geometry.attributes.position.array, sourceArrays[i],
      'group compression must not modify shared source vertex buffers'));
    world.dispose();
    assert.ok(images.every(image => image.closed === 1), 'every embedded bitmap must close once');
  });
}
