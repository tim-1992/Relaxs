import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {setMaxListeners} from 'node:events';
import * as state from '../src/planet-state.js';

function target(properties = {}) {
  const listeners = new Map();
  return Object.assign(properties, {
    addEventListener(type, callback, {signal} = {}) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
      if (signal) {
        setMaxListeners(0, signal);
        signal.addEventListener('abort', () => listeners.get(type).delete(callback), {once:true});
      }
    },
    removeEventListener(type, callback) {listeners.get(type)?.delete(callback);},
    emit(type, details = {}) {
      const event = {target:this, preventDefault() {this.defaultPrevented = true;}, ...details};
      for (const callback of [...listeners.get(type) || []]) callback(event);
      return event;
    },
  });
}

function app({hash = '#orbit/play', failures = 0} = {}) {
  const elements = new Map(), timers = new Map(), scenes = [], deferredLosses = [];
  let serial = 0, libraryActive = false, attempts = 0;
  function element(id) {
    const node = target({
      id, dataset:{}, hidden:false, innerHTML:'', textContent:'', style:{setProperty() {}},
      setAttribute() {}, focus() {}, scrollIntoView() {}, replaceChildren() {},
      querySelector(selector) {return get(`${id} ${selector}`);},
      cloneNode() {return element(id);},
      replaceWith(next) {elements.set(id, next);},
    });
    return node;
  }
  function get(id) {if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id);}
  const classNames = new Set(['planet-app']);
  const doc = target({
    hidden:false, getElementById:get,
    querySelector:selector => selector === 'dialog[open]' ? null : get(selector),
    querySelectorAll:() => [],
    documentElement:{style:{setProperty() {}}},
    body:{dataset:{}, classList:{
      add:name => classNames.add(name), remove:name => classNames.delete(name),
      contains:name => classNames.has(name),
    }},
  });
  const win = target({scrollTo() {}});
  const location = {hash};
  const createPlanetScene = canvas => {
    attempts++;
    assert.equal(libraryActive, false, 'library contexts are released before a new lobby is created');
    if (attempts <= failures) throw new Error('GPU temporarily unavailable');
    const scene = {
      canvas, alive:true, active:true, selected:null, disposeCount:0,
      select(id) {this.selected = id;}, leave() {},
      setActive(value) {this.active = value;},
      dispose() {
        this.disposeCount++; this.alive = false;
        // Deliberate renderer disposal must not start a recovery loop.
        deferredLosses.push(canvas);
      },
    };
    scenes.push(scene);
    return scene;
  };
  const imports = new Proxy({
    './planet-state.js':state, './planet-scene.js':{createPlanetScene},
    './game-library.js':{gameCatalog:[], mountGameLibrary() {
      libraryActive = true; return () => {libraryActive = false;};
    }},
  }, {get:(modules, name) => modules[name] || {}});
  const source = readFileSync(new URL('../src/planet-entry.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, path) => `const {${names}} = imports[${JSON.stringify(path)}];`);
  const context = vm.createContext({
    imports, document:doc, window:win, location, AbortController,
    history:{replaceState(_state, _title, next) {location.hash = next;}},
    console:{warn() {}, error() {}},
    setTimeout(fn) {timers.set(++serial, fn); return serial;},
    clearTimeout(id) {timers.delete(id);},
  });
  vm.runInContext(source, context);
  return {
    get, doc, win, scenes, timers, location,
    get attempts() {return attempts;},
    get fallback() {return classNames.has('no-webgl');},
    navigate(hash) {location.hash = hash; win.emit('hashchange');},
    tick() {
      deferredLosses.splice(0).forEach(canvas => canvas.emit('webglcontextlost'));
      const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());
    },
    close() {win.emit('pagehide');},
  };
}

test('a lost planet context recovers on a fresh canvas with the selected world intact', () => {
  const page = app({hash:'#orbit/release'});
  try {
    const first = page.scenes[0], canvas = page.get('planet-canvas');
    assert.equal(first.selected, 'release');
    const loss = canvas.emit('webglcontextlost');
    assert.ok(loss.defaultPrevented);
    assert.equal(page.fallback, true);
    page.tick();
    assert.equal(page.fallback, false, 'a temporary interruption cannot permanently leave the CSS planet');
    assert.notEqual(page.get('planet-canvas'), canvas, 'never try to draw into the lost canvas again');
    assert.equal(page.scenes.at(-1).selected, 'release');
    assert.equal(page.scenes.at(-1).active, true);
    assert.equal(first.disposeCount, 1);
    assert.equal(page.get('render-notice').hidden, true);
  } finally {page.close();}
});

test('repeated library visits release the lobby context and return to one animated world set', () => {
  const page = app();
  try {
    for (let i = 0; i < 12; i++) {
      const canvas = page.get('planet-canvas');
      page.navigate('#planet/play');
      assert.equal(page.scenes.filter(scene => scene.alive).length, 0, 'no inactive lobby GPU context is retained');
      assert.equal(page.timers.size, 0, 'intentional disposal is not a render failure');
      page.navigate('#orbit/play');
      assert.equal(page.scenes.filter(scene => scene.alive).length, 1);
      assert.notEqual(page.get('planet-canvas'), canvas);
      assert.equal(page.scenes.at(-1).active, true);
      assert.equal(page.fallback, false);
    }
  } finally {page.close();}
  assert.ok(page.scenes.every(scene => scene.disposeCount === 1));
});

test('direct library links allocate no hidden planet renderer', () => {
  const page = app({hash:'#planet/calm'});
  try {
    assert.equal(page.attempts, 0);
    page.navigate('#orbit/calm');
    assert.equal(page.attempts, 1);
    assert.equal(page.scenes[0].selected, 'calm');
  } finally {page.close();}
});

test('temporary startup failure automatically retries; persistent failure is bounded and manually retryable', () => {
  const temporary = app({failures:1});
  try {
    assert.equal(temporary.fallback, true);
    temporary.tick();
    assert.equal(temporary.fallback, false);
  } finally {temporary.close();}
  const persistent = app({failures:20});
  try {
    for (let i = 0; i < 12; i++) persistent.tick();
    assert.equal(persistent.attempts, 3, 'initial attempt plus two retries, not an endless GPU retry loop');
    assert.equal(persistent.timers.size, 0);
    assert.equal(persistent.fallback, true);
    persistent.get('retry-planets').emit('click');
    assert.equal(persistent.attempts, 4, 'user can retry without losing the selected route');
  } finally {persistent.close();}
});

test('leaving the lobby cancels recovery and bfcache restores only the active route', () => {
  const page = app();
  try {
    page.get('planet-canvas').emit('webglcontextlost');
    page.navigate('#planet/release');
    page.tick();
    assert.equal(page.scenes.filter(scene => scene.alive).length, 0);
    page.close();
    page.win.emit('pageshow', {persisted:true});
    assert.equal(page.scenes.filter(scene => scene.alive).length, 0);
    page.navigate('#orbit/release');
    assert.equal(page.scenes.at(-1).selected, 'release');
    assert.equal(page.fallback, false);
  } finally {page.close();}
});
