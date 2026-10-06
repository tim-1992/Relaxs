import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as mechanics from '../src/slice-state.js';
import * as input from '../src/slice-input.js';

// Only browser rendering, audio and the separately tested note component are
// replaced. The real controller, pointer conversion, engine and RAF loop run.
function controllerBoundary({tripoAsset, muted = false, load, failScene = false, enable} = {}) {
  const listenerMaps = [];
  function events(target = {}) {
    const listeners = new Map(); listenerMaps.push(listeners);
    return Object.assign(target, {
      addEventListener(type, fn, options = {}) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
        if (options.signal) {
          setMaxListeners(0, options.signal);
          options.signal.addEventListener('abort', () => listeners.get(type).delete(fn), {once: true});
        }
      },
      removeEventListener(type, fn) {listeners.get(type)?.delete(fn);},
      async emit(type, properties = {}) {
        const event = {type, target: this, preventDefault() {this.defaultPrevented = true;}, ...properties};
        await Promise.all([...listeners.get(type) ?? []].map(fn => fn(event)));
        return event;
      },
    });
  }
  const doc = events({hidden: false, activeElement: null});
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
      this.attributes = {}; this.dataset = {}; this.style = {setProperty() {}};
      this.hidden = this.disabled = false; this._text = ''; this.captures = new Set();
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: (...names) => {this.className = [...new Set([...this.className.split(/\s+/), ...names])].join(' ');},
        remove: (...names) => {this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' ');},
        toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name),
      };
      events(this);
    }
    get className() {return this.attributes.class || '';}
    set className(value) {this.attributes.class = value;}
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (name === 'hidden' || name === 'disabled') this[name] = true;
    }
    getAttribute(name) {return this.attributes[name] ?? null;}
    set textContent(value) {this._text = String(value); this.children = [];}
    get textContent() {return this._text + this.children.map(child => child.textContent).join('');}
    set innerHTML(value) {
      this.children = []; this._text = ''; const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1)._text += token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const child = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) child.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).append(child);
        if (!['INPUT', 'BR', 'HR', 'IMG'].includes(child.tagName)) stack.push(child);
      }
    }
    append(child) {child.parentElement = this; this.children.push(child);}
    remove() {if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;}
    contains(child) {for (let node = child; node; node = node.parentElement) if (node === this) return true; return false;}
    focus() {doc.activeElement = this;}
    getContext() { return new Proxy({}, {get: (_object, name) => name === 'createRadialGradient' ? () => ({addColorStop() {}}) : () => {}}); }
    getBoundingClientRect() {return {left: 20, top: 30, width: 960, height: 600};}
    setPointerCapture(id) {this.captures.add(id);}
    hasPointerCapture(id) {return this.captures.has(id);}
    releasePointerCapture(id) {this.captures.delete(id);}
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector.startsWith('#')) return this.attributes.id === selector.slice(1);
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attr) return attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2];
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) {for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null;}
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.children) {
        if (child.matches(selector)) found.push(child);
        found.push(...child.querySelectorAll(selector));
      }
      return found;
    }
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  }
  let now = 100, nextFrame = 0, view, note, unavailable;
  const audioCalls = {enable: 0, pause: 0, resume: 0, disable: 0, hits: []};
  const frames = new Map(), destroyed = {scene: 0, audio: 0, note: 0, observer: 0};
  const win = events({
    matchMedia: () => ({matches: false}),
    requestAnimationFrame(fn) {frames.set(++nextFrame, fn); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);},
    ResizeObserver: class {observe() {} disconnect() {destroyed.observer++;}},
  });
  doc.defaultView = win; doc.createElement = tag => new Element(tag);
  const audio = {
    hit(...args) {audioCalls.hits.push(args);}, pause() {audioCalls.pause++;}, resume: async () => {audioCalls.resume++; return true;},
    enable: async () => {audioCalls.enable++; return enable ? enable() : true;},
    disable() {audioCalls.disable++;}, destroy() {destroyed.audio++;},
  };
  const source = readFileSync(new URL('../src/slice-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountRelease', 'function mountRelease');
  const context = vm.createContext({AbortController, console: {...console, warn() {}}, imports: {
    './slice-state.js': mechanics, './slice-input.js': input,
    './slice-scene.js': {createSliceScene: (_canvas, options) => {
      unavailable = options.onUnavailable;
      if (failScene) throw new Error('no WebGL');
      return {render(state) {view = state;}, setTripoAsset: data => load(data), destroy() {destroyed.scene++;}};
    }},
    './release-audio.js': {createReleaseAudio: () => audio},
    './worry-note.js': {mountWorryNote(_container, callbacks) {note = callbacks; return () => {destroyed.note++;};}},
  }});
  vm.runInContext(source, context);
  const container = new Element('main'), cleanup = context.mountRelease(container, {tripoAsset, muted});
  const root = container.children[0];
  const query = selector => {
    const element = root.querySelector(selector); assert.ok(element, `missing controller element: ${selector}`); return element;
  };
  const arena = query('.slice-arena');
  return {
    root, arena, query, container, cleanup, win, doc, frames, destroyed, note, audioCalls,
    loseContext() {unavailable();},
    get state() {return view;},
    get listenerCount() {return listenerMaps.reduce((total, map) => total + [...map.values()].reduce((n, listeners) => n + listeners.size, 0), 0);},
    click(selector) {const target = query(selector); assert.equal(target.disabled, false, `disabled control: ${selector}`); return root.emit('click', {target});},
    pointer(type, x, y, pointerId = 7) {return arena.emit(type, {button: 0, pointerId, isPrimary: true, clientX: x + 20, clientY: y + 30});},
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 1000 / 60);
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach(fn => fn(now));
      }
    },
  };
}

function mounted(t, options) {
  const app = controllerBoundary(options);
  t.after(() => {if (app.root.parentElement) app.cleanup();});
  return app;
}

// Orchard's real wave is three same-color fruit on a shared ballistic arc.
// No test assigns score, phase, objects, shields, or engine internals.
async function cutWave(app) {
  app.advance(800);
  const fruit = app.state.objects.filter(item => item.kind === 'fruit').sort((a, b) => a.x - b.x);
  assert.equal(fruit.length, 3);
  assert.ok(fruit.every(item => item.y > item.r && item.y < app.state.height - item.r));
  await app.pointer('pointerdown', fruit[0].x - fruit[0].r - 8, fruit[0].y);
  await app.pointer('pointermove', fruit.at(-1).x + fruit.at(-1).r + 8, fruit.at(-1).y);
  await app.pointer('pointerup', fruit.at(-1).x + fruit.at(-1).r + 8, fruit.at(-1).y);
}

test('the controller forwards the real fruit buffer, stays playable during loading and labels only completed installation', async t => {
  const fruit = {buffer: new ArrayBuffer(32), name: 'orange.glb'};
  let received, resolve;
  const pending = new Promise(done => {resolve = done;});
  const app = mounted(t, {tripoAsset: fruit, load: data => {received = data; return pending;}});
  assert.equal(received, fruit);
  assert.equal(app.root.dataset.asset, 'loading');
  assert.doesNotMatch(app.query('[data-stat="asset"]').textContent, /Tripo.*已载入/i);
  await app.click('[data-action="start"]'); await cutWave(app);
  assert.equal(app.state.score, 50);
  resolve('orange.glb'); await pending; await new Promise(setImmediate);
  assert.equal(app.root.dataset.asset, 'loaded');
  assert.match(app.query('[data-stat="asset"]').textContent, /Tripo.*鲜橙/i);
  assert.match(app.query('.slice-legend').getAttribute('aria-label'), /光环/);
  assert.equal(app.state.score, 50, 'loading must preserve the current chapter/run');
});

test('failed imports retain the local game; a late import cannot label a fallback or disposed canvas as Tripo', async t => {
  const failed = mounted(t, {tripoAsset: {buffer: new ArrayBuffer(1)}, load: async () => {throw new Error('invalid fruit');}});
  await new Promise(setImmediate);
  assert.equal(failed.root.dataset.asset, 'failed');
  await failed.click('[data-action="start"]'); await cutWave(failed);
  assert.equal(failed.state.score, 50);
  for (const unmount of [false, true]) {
    let resolve;
    const pending = new Promise(done => {resolve = done;});
    const app = mounted(t, {tripoAsset: {buffer: new ArrayBuffer(32)}, load: () => pending});
    if (unmount) app.cleanup(); else app.loseContext();
    const before = app.query('[data-stat="asset"]').textContent;
    resolve('late.glb'); await pending; await new Promise(setImmediate);
    assert.equal(app.query('[data-stat="asset"]').textContent, before);
    assert.doesNotMatch(before, /Tripo.*已载入/i);
    assert.equal(app.destroyed.scene, 1);
  }
});

test('sound is enabled by the start gesture and emits a cue, without autoplaying during mount or preview', async t => {
  const app = mounted(t);
  app.advance(2500);
  assert.equal(app.audioCalls.enable, 0);
  assert.equal(app.audioCalls.hits.length, 0);
  const clicked = app.click('[data-action="start"]');
  assert.equal(app.audioCalls.enable, 1, 'AudioContext must be enabled before the event yields');
  await clicked; await new Promise(setImmediate);
  assert.ok(app.audioCalls.hits.length > 0);
  assert.equal(app.query('[data-action="sound"]').getAttribute('aria-pressed'), 'true');
  await app.win.emit('blur');
  const hits = app.audioCalls.hits.length;
  app.advance(1000);
  assert.ok(app.audioCalls.pause > 0);
  assert.equal(app.audioCalls.hits.length, hits);
});

test('explicit mute before start survives retries, and switching sound on remains one user gesture', async t => {
  for (const initialMute of [false, true]) {
    const app = mounted(t, {muted: initialMute});
    if (!initialMute) await app.click('[data-action="sound"]');
    await app.click('[data-action="start"]');
    assert.equal(app.audioCalls.enable, 0);
    await app.click('[data-action="retry"]');
    assert.equal(app.audioCalls.enable, 0);
    const clicked = app.click('[data-action="sound"]');
    assert.equal(app.audioCalls.enable, 1);
    await clicked; await new Promise(setImmediate);
    assert.equal(app.query('[data-action="sound"]').getAttribute('aria-pressed'), 'true');
  }
});

test('pending activation cannot sound after unmount, and exit cleans up even without a parent unmount', async t => {
  let resolve;
  const pending = new Promise(done => {resolve = done;});
  const app = mounted(t, {enable: () => pending});
  const click = app.click('[data-action="start"]');
  await app.click('[data-action="exit"]');
  resolve(true); await pending; await click; await new Promise(setImmediate);
  assert.equal(app.container.children.length, 0);
  assert.equal(app.audioCalls.hits.length, 0);
  assert.equal(app.frames.size, 0);
  assert.equal(app.listenerCount, 0);
  app.cleanup();
  assert.deepEqual(app.destroyed, {scene: 1, audio: 1, note: 1, observer: 1});
});
