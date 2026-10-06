import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {inspectMolesGLB} from '../src/moles-character.js';
import {createSliceWorld} from '../src/slice-scene.js';
import {shippedTripoBytes} from './tripo-fixture.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// Test the real GLTFLoader/geometry/material path; only browser image decoding
// is substituted. Public clones use the shipped orange when game.glb is absent.
function imageBoundary(t) {
  const before = {self: globalThis.self, createImageBitmap: globalThis.createImageBitmap};
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
    assert.ok(width && height, 'read the embedded image dimensions');
    const image = {width, height, digest: digest(bytes), closed: 0, close() {this.closed++;}};
    images.push(image);
    return image;
  };
  t.after(() => {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  });
  return images;
}

function sourcePeelSamples(geometry) {
  const {position, uv} = geometry.attributes, samples = new Set();
  const key = values => values.map(value => Math.round(value * 1e5)).join(',');
  const read = i => [position.getX(i), position.getY(i), position.getZ(i), uv.getX(i), uv.getY(i)];
  for (let i = 0; i < position.count; i++) samples.add(key(read(i)));
  for (let i = 0; i < (geometry.index?.count ?? position.count); i += 3) {
    const triangle = [0, 1, 2].map(j => read(geometry.index ? geometry.index.getX(i + j) : i + j));
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      if (a[0] * b[0] >= 0) continue;
      const t = -a[0] / (b[0] - a[0]);
      samples.add(key(a.map((value, index) => index === 0 ? 0 : Math.fround(value + (b[index] - value) * t))));
    }
  }
  return {has: values => samples.has(key(values))};
}

for (const filename of ['model.glb', 'game.glb']) {
  const path = new URL(`../artifacts/tripo/realistic-orange/${filename}`, import.meta.url);
  const hasArtifact = existsSync(path);
  test(`generated orange ${filename} is the sliceable mesh with original PBR atlases and two sealed UV-preserving halves`, {
    skip: filename === 'model.glb' && !hasArtifact &&
      'Raw original artifacts/tripo/realistic-orange/model.glb is absent from this source checkout; original-fixture audit requires it',
  }, async t => {
    const bytes = filename === 'game.glb' && !hasArtifact ? shippedTripoBytes('orange') : readFileSync(path);
    if (!hasArtifact) t.diagnostic('Testing the real orange embedded in src/tripo-data-orange.js');
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const json = inspectMolesGLB(buffer);
    assert.match(json.asset.generator, /tripo/i);
    const binary = bytes.subarray(28 + bytes.readUInt32LE(12));
    const originalImages = new Set(json.images.map(image => {
      const view = json.bufferViews[image.bufferView], start = view.byteOffset || 0;
      return digest(binary.subarray(start, start + view.byteLength));
    }));
    const triangles = json.meshes.flatMap(mesh => mesh.primitives).reduce((sum, primitive) =>
      sum + json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3, 0);
    const images = imageBoundary(t), world = createSliceWorld();
    t.after(() => world.destroy());
    const state = {width: 960, height: 600, time: 0, objects: [
      {id: 'fruit', kind: 'fruit', color: 'peach', x: 200, y: 200, r: 50, rotation: 0},
    ], fragments: [], particles: [], trail: []};
    world.update(state);
    const local = world.scene.getObjectByName('slice-objects').children[0];
    await world.setTripoAsset({buffer, name: filename});
    world.update(state);
    const fruit = world.scene.getObjectByName('slice-objects').children[0];
    assert.notEqual(fruit, local);
    assert.equal(local.parent, null);
    assert.equal(fruit.userData.source, 'tripo');
    const peels = [];
    fruit.traverse(object => {if (object.name === 'slice-body' || object.name.startsWith('slice-peel-')) peels.push(object);});
    assert.ok(peels.length);
    const sourceUVs = new Map(peels.map(part => [part.name, sourcePeelSamples(part.geometry)]));
    assert.equal(peels.reduce((sum, part) => sum + (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3, 0), triangles);
    for (const peel of peels) {
      const {position, uv} = peel.geometry.attributes;
      assert.equal(position.count, uv.count);
      const point = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(peel.matrixWorld);
        assert.ok(Math.hypot(point.x - 200, point.y + 200) <= 50 + 1e-4, 'photoreal mesh must fit the actual hit radius');
      }
      for (const material of [peel.material].flat()) {
        assert.ok(originalImages.has(material.map?.image.digest));
        for (const map of [material.normalMap, material.roughnessMap, material.metalnessMap].filter(Boolean)) {
          assert.ok(originalImages.has(map.image.digest));
        }
      }
    }
    assert.equal(images.length, originalImages.size);
    if (filename === 'game.glb') assert.ok(images.every(image => image.width <= 2048 && image.height <= 2048));
    state.objects = [];
    state.fragments = [-1, 1].map(side => ({
      id: 'fruit', kind: 'fruit', color: 'peach', side, x: 200, y: 200, r: 50, rotation: 0, life: 1, maxLife: 1,
    }));
    world.update(state);
    const halves = world.scene.getObjectByName('slice-fragments').children;
    assert.equal(halves.length, 2);
    for (const half of halves) {
      assert.equal(half.userData.source, 'tripo');
      let caps = 0;
      half.traverse(part => {
        if (part.name !== 'slice-body' && !part.name.startsWith('slice-peel-')) return;
        const {position, normal, uv} = part.geometry.attributes;
        assert.equal(uv.count, position.count);
        for (let i = 0; i < position.count; i++) {
          assert.ok(position.getX(i) * half.userData.side >= -1e-6);
          assert.ok(Number.isFinite(uv.getX(i) + uv.getY(i)));
        }
        const cap = part.geometry.groups.find(group => group.materialIndex === part.material.length - 1);
        if (!cap) return;
        caps++;
        assert.ok(cap.count >= 3 && part.material.at(-1).map.isDataTexture);
        const point = new THREE.Vector3().fromBufferAttribute(normal, cap.start).transformDirection(part.matrixWorld);
        assert.ok(point.z > .2, 'real cut faces should open toward the player');
        for (let i = cap.start; i < cap.start + cap.count; i++) assert.equal(position.getX(i), 0);
        for (let i = 0; i < cap.start; i++) {
          assert.ok(sourceUVs.get(part.name).has([position.getX(i), position.getY(i), position.getZ(i), uv.getX(i), uv.getY(i)]),
            'every cut peel UV must be an original sample or its correctly interpolated crossing');
        }
        let shellBoundaryArea = 0, capArea = 0;
        for (let i = 0; i < cap.start; i += 3) for (let j = 0; j < 3; j++) {
          const a = i + j, b = i + (j + 1) % 3;
          if (Math.abs(position.getX(a)) < 1e-7 && Math.abs(position.getX(b)) < 1e-7) {
            shellBoundaryArea += position.getY(a) * position.getZ(b) - position.getY(b) * position.getZ(a);
          }
        }
        for (let i = cap.start; i < cap.start + cap.count; i += 3) {
          const area = (position.getY(i + 1) - position.getY(i)) * (position.getZ(i + 2) - position.getZ(i))
            - (position.getZ(i + 1) - position.getZ(i)) * (position.getY(i + 2) - position.getY(i));
          assert.ok(area * -half.userData.side >= 0, 'each actual cap triangle must wind outward');
          capArea += area;
        }
        assert.ok(Math.abs(capArea + shellBoundaryArea) < 1e-6,
          'flesh must exactly fill the original section, including the fruit-stem indentation');
      });
      assert.ok(caps > 0, 'a real cut cap must replace the opening');
    }
    world.destroy();
    assert.ok(images.every(image => image.closed === 1));
  });
}
