import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as mechanics from '../src/blast-state.js';

// Browser/GPU boundaries only. The production controller, input and support
// puzzle run here; actual GLB geometry and picking run in blast-tripo.test.mjs.
function controllerBoundary({fallback = false, audioFactory, tripoAssets = null, install} = {}) {
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
  const doc = events({hidden: false, activeElement: null, baseURI: 'https://preview.example/relaxs/index.html'});
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
    scrollIntoView(options) {doc.visibleElement = this; this.scrollOptions = options;}
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
  let now = 100, nextFrame = 0, view, note;
  const frames = new Map(), destroyed = {scene: 0, audio: 0, observer: 0};
  let exitCount = 0, picked = null, selectedView = null, unavailable;
  const cargo = {loaded: [], total: 0, supported: 0, falling: 0, salvaged: 0};
  const win = events({
    matchMedia: () => ({matches: false}),
    requestAnimationFrame(fn) {frames.set(++nextFrame, fn); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);},
    ResizeObserver: class {observe() {} disconnect() {destroyed.observer++;}},
  });
  doc.defaultView = win; doc.createElement = tag => new Element(tag);
  const audio = audioFactory ? audioFactory() : {
    hit() {}, pause() {}, resume: async () => {}, enable: async () => true,
    disable() {}, destroy() {destroyed.audio++;},
  };
  const source = readFileSync(new URL('../src/blast-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replaceAll('import.meta.url', JSON.stringify(new URL('../src/blast-experience.js', import.meta.url).href))
    .replace('export function mountBlast', 'function mountBlast');
  const context = vm.createContext({AbortController, URL, console, imports: {
    './blast-state.js': mechanics,
    './blast-scene.js': {createBlastScene: (_canvas, options) => {
      unavailable = options.onUnavailable;
      if (fallback) throw new Error('WebGL intentionally unavailable');
      return {render(state) {view = state;}, pick() {return picked;}, setView(value) {selectedView = value;},
        resize() {}, destroy() {destroyed.scene++;},
        getTripoStatus: () => cargo, async setTripoAssets(data) {
          const result = await install(data);
          Object.assign(cargo, {loaded: result.loaded, total: result.loaded.length, supported: result.loaded.length});
          return result;
        }};
    }},
    './release-audio.js': {createReleaseAudio: () => audio},
  }});
  vm.runInContext(source, context);
  const container = new Element('main'), cleanup = context.mountBlast(container, {tripoAssets, onExit() {exitCount++;}});
  const root = container.children[0];
  const query = selector => {
    const element = root.querySelector(selector); assert.ok(element, `missing controller element: ${selector}`); return element;
  };
  const arena = query('.blast-arena');
  return {
    root, arena, query, container, cleanup, win, doc, frames, destroyed, note, cargo,
    loseContext() {unavailable();},
    get state() {return view;},
    get exitCount() {return exitCount;},
    get selectedView() {return selectedView;},
    setPick(hit) {picked = hit;},
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


function pending() {
  let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('asset installation stays playable, forwards hub aliases, and labels/counts only installed real contents', async t => {
  const task = pending(), tripoAssets = {sofa: {buffer: new ArrayBuffer(4), name: 'sofa.glb'}, screen: {buffer: new ArrayBuffer(4), name: 'tv.glb'}};
  const app = controllerBoundary({tripoAssets, install(data) {assert.equal(data, tripoAssets); return task.promise;}});
  t.after(app.cleanup);
  assert.equal(app.root.dataset.asset, 'loading');
  assert.doesNotMatch(app.query('[data-stat="cargo"]').textContent, /Tripo/);
  await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
  await app.click('[data-action="plant"]');
  assert.equal(app.state.markers.length, 1, 'loading may not block placement');
  task.resolve({loaded: ['sofa', 'tv'], failed: []}); await flush();
  assert.equal(app.root.dataset.asset, 'loaded');
  assert.match(app.query('[data-stat="cargo"]').textContent, /Tripo.*2/);
  assert.equal(app.query('[data-stat="cargo-instruction"]').hidden, false);
  const floor = app.state.pieces.find(piece => piece.kind === 'floor');
  app.setPick({id: floor.id, point: {...floor.position, y: floor.position.y + floor.size.y / 2}, source: 'tripo', kind: 'sofa'});
  await app.pointer('pointerdown', 100, 150); await app.pointer('pointerup', 100, 150);
  assert.equal(app.state.selectedId, floor.id);
  assert.match(app.query('.blast-status').textContent, /沙发.*楼板/);
  Object.assign(app.cargo, {supported: 1, salvaged: 1}); await app.win.emit('resize');
  assert.match(app.query('[data-stat="cargo"]').textContent, /1.*2/);
  await app.click('[data-action="reset"]');
  assert.equal(app.state.phase, 'planning');
  assert.equal(app.state.markers.length, 0);
});

test('failed and partial installs stay honest; context loss/unmount reject late loaded labels', async t => {
  const tripoAssets = {car: {buffer: new ArrayBuffer(4), name: 'car.glb'}};
  const failed = controllerBoundary({tripoAssets, install: async () => ({loaded: [], failed: [{kind: 'car'}]})});
  t.after(failed.cleanup); await flush();
  assert.equal(failed.root.dataset.asset, 'failed');
  assert.doesNotMatch(failed.query('[data-stat="cargo"]').textContent, /Tripo/);
  await failed.arena.emit('keydown', {key: 'ArrowRight', target: failed.arena});
  await failed.click('[data-action="plant"]'); await failed.click('[data-action="detonate"]');
  assert.equal(failed.state.phase, 'collapsing');
  const partial = controllerBoundary({tripoAssets, install: async () => ({loaded: ['sofa'], failed: [{kind: 'car'}]})});
  t.after(partial.cleanup); await flush();
  assert.equal(partial.root.dataset.asset, 'loaded');
  assert.match(partial.query('[data-stat="cargo"]').textContent, /Tripo.*1/);
  for (const end of ['fallback', 'unmount']) {
    const task = pending(), app = controllerBoundary({tripoAssets, install: () => task.promise});
    t.after(app.cleanup);
    if (end === 'fallback') app.loseContext(); else app.cleanup();
    task.resolve({loaded: ['car'], failed: []}); await flush();
    assert.notEqual(app.root.dataset.asset, 'loaded');
    if (end === 'fallback') {
      assert.equal(app.root.dataset.asset, 'fallback');
      assert.equal(app.query('.blast-fallback').hidden, false);
    } else {assert.equal(app.listenerCount, 0); assert.equal(app.frames.size, 0);}
  }
});
