import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRIPO_ASSETS} from '../src/tripo-assets.js';

// Decode the exact payload shipped to the browser, without evaluating its script
// or depending on the optional generation artifacts.
export function shippedTripoBytes(id) {
  const asset = TRIPO_ASSETS[id];
  assert.ok(asset, `unknown shipped Tripo asset: ${id}`);
  const script = readFileSync(new URL(`../src/tripo-data-${asset.file}.js`, import.meta.url), 'utf8');
  const data = script.match(/^(?:\/\*[\s\S]*?\*\/\s*)?\(globalThis\.__RELAXS_TRIPO_DATA__\s*\|\|=\s*\{\}\)\[("[^"]+")\]\s*=\s*("[A-Za-z0-9+/=]+");\s*$/);
  assert.ok(data, `${id} binary script must contain data only`);
  assert.equal(JSON.parse(data[1]), id, `${id} binary script must populate its registered key`);
  const encoded = JSON.parse(data[2]), bytes = Buffer.from(encoded, 'base64');
  assert.equal(bytes.toString('base64'), encoded, `${id} binary script must contain complete base64`);
  return bytes;
}
