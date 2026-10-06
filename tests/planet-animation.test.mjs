import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import {breathPhase} from '../src/planet-state.js';

function mount({reduced = false} = {}) {
  const frames = new Map(), listeners = new Map();
  let serial = 0, now = 100, rendered, released = 0, lost = 0;
  const doc = {
    hidden:false,
    addEventListener:(name, fn) => listeners.set(name, fn),
    removeEventListener:name => listeners.delete(name),
  };
  const motion = {matches:reduced, addEventListener() {}, removeEventListener() {}};
  class Renderer {
    constructor() {this.shadowMap = {};}
    setPixelRatio() {} setSize() {} setClearColor() {}
    render(scene) {rendered = scene;}
    dispose() {released++;}
    forceContextLoss() {lost++;}
  }
  const source = readFileSync(new URL('../src/planet-scene.js', import.meta.url), 'utf8')
    .replace("import * as THREE from 'three';", 'const THREE = imports.THREE;')
    .replace("import {breathPhase} from './planet-state.js';", 'const {breathPhase} = imports;')
    .replace('export function createPlanetScene', 'function createPlanetScene');
  const context = vm.createContext({
    imports:{THREE:{...THREE, WebGLRenderer:Renderer}, breathPhase},
    document:doc, window:{devicePixelRatio:1, matchMedia:() => motion},
    ResizeObserver:class {observe() {} disconnect() {}},
    requestAnimationFrame(fn) {frames.set(++serial, fn); return serial;},
    cancelAnimationFrame(id) {frames.delete(id);},
  });
  vm.runInContext(source, context);
  const scene = context.createPlanetScene({parentElement:{}, getBoundingClientRect:() => ({width:1280,height:400})});
  return {
    scene, frames, doc,
    get worlds() {return rendered.children.filter(child => child.isGroup);},
    get released() {return released;}, get lost() {return lost;},
    advance(seconds) {
      for (let i = 0; i < seconds * 60; i++) {
        now += 1000 / 60;
        const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
      }
    },
    visibility(hidden) {doc.hidden = hidden; listeners.get('visibilitychange')?.();},
  };
}

test('all three planet models continuously rotate instead of barely rocking backwards and forwards', () => {
  const app = mount();
  try {
    app.advance(1);
    let previous = app.worlds.map(world => world.children[0].rotation.y);
    for (let i = 0; i < 6; i++) {
      app.advance(4);
      const next = app.worlds.map(world => world.children[0].rotation.y);
      next.forEach((angle, index) => {
        assert.ok(angle - previous[index] > .16 && angle - previous[index] < .6,
          `world ${index} needs a perceptible, gentle, forward turn each four seconds`);
      });
      previous = next;
    }
  } finally {app.scene.dispose();}
});

test('animation resumes after inactive and hidden periods without duplicate animation loops', () => {
  const app = mount();
  try {
    app.advance(1);
    app.scene.setActive(false);
    assert.equal(app.frames.size, 0);
    app.advance(3);
    const before = app.worlds[0].children[0].rotation.y;
    app.scene.setActive(true); app.scene.setActive(true);
    assert.equal(app.frames.size, 1);
    app.advance(3);
    assert.ok(app.worlds[0].children[0].rotation.y > before + .1);
    app.visibility(true); assert.equal(app.frames.size, 0);
    app.visibility(false); assert.equal(app.frames.size, 1);
    app.advance(1);
    assert.equal(app.frames.size, 1);
  } finally {app.scene.dispose();}
  app.scene.dispose();
  assert.equal(app.released, 1);
  assert.equal(app.lost, 1, 'disposing a planet also releases its GPU context');
});

test('reduced motion keeps models still but planet selection continues to work', () => {
  const app = mount({reduced:true});
  try {
    app.advance(1);
    const angles = app.worlds.map(world => world.children[0].rotation.y);
    app.scene.select('release');
    app.advance(3);
    assert.deepEqual(app.worlds.map(world => world.children[0].rotation.y), angles);
    assert.ok(app.worlds[2].scale.x > app.worlds[0].scale.x);
    assert.equal(app.frames.size, 0);
  } finally {app.scene.dispose();}
});
