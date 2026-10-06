import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as mechanics from '../src/slice-state.js';
import * as input from '../src/slice-input.js';

// Only browser rendering, audio and the separately tested note component are
// replaced. The real controller, pointer conversion, engine and RAF loop run.
function controllerBoundary() {
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
  const frames = new Map(), destroyed = {scene: 0, audio: 0, note: 0, observer: 0};
  const win = events({
    matchMedia: () => ({matches: false}),
    requestAnimationFrame(fn) {frames.set(++nextFrame, fn); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);},
    ResizeObserver: class {observe() {} disconnect() {destroyed.observer++;}},
  });
  doc.defaultView = win; doc.createElement = tag => new Element(tag);
  const audio = {
    hit() {}, pause() {}, resume: async () => {}, enable: async () => true,
    disable() {}, destroy() {destroyed.audio++;},
  };
  const source = readFileSync(new URL('../src/slice-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountRelease', 'function mountRelease');
  const context = vm.createContext({AbortController, console, imports: {
    './slice-state.js': mechanics, './slice-input.js': input,
    './slice-scene.js': {createSliceScene: () => ({render(state) {view = state;}, destroy() {destroyed.scene++;}})},
    './release-audio.js': {createReleaseAudio: () => audio},
    './worry-note.js': {mountWorryNote(_container, callbacks) {note = callbacks; return () => {destroyed.note++;};}},
  }});
  vm.runInContext(source, context);
  const container = new Element('main'), cleanup = context.mountRelease(container);
  const root = container.children[0];
  const query = selector => {
    const element = root.querySelector(selector); assert.ok(element, `missing controller element: ${selector}`); return element;
  };
  const arena = query('.slice-arena');
  return {
    root, arena, query, container, cleanup, win, doc, frames, destroyed, note,
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

function mounted(t) {
  const app = controllerBoundary();
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

test('start runs real physics; pause and backgrounding freeze it and cancel pointer capture', async t => {
  const app = mounted(t);
  assert.equal(app.root.dataset.phase, 'ready');
  await app.click('[data-action="start"]'); app.advance(400);
  assert.equal(app.state.phase, 'playing');
  assert.ok(app.state.time > 0 && app.state.objects.length >= 3);
  await app.pointer('pointerdown', 200, 200);
  assert.equal(app.arena.hasPointerCapture(7), true);
  await app.click('[data-action="pause"]');
  assert.equal(app.arena.hasPointerCapture(7), false);
  assert.equal(app.state.stroke.active, false);
  assert.equal(app.query('.slice-paused').hidden, false);
  const frozen = structuredClone(app.state);
  app.advance(2000);
  assert.deepEqual(app.state, frozen);
  assert.equal(app.frames.size, 0);
  await app.click('[data-action="resume"]'); app.advance(200);
  assert.ok(app.state.time > frozen.time);
  await app.pointer('pointerdown', 100, 100);
  await app.win.emit('blur');
  const background = structuredClone(app.state);
  app.doc.hidden = true; await app.doc.emit('visibilitychange'); app.advance(2000);
  app.doc.hidden = false; await app.doc.emit('visibilitychange'); await app.win.emit('focus');
  assert.deepEqual(app.state, background);
  assert.equal(app.arena.hasPointerCapture(7), false);
  assert.equal(app.frames.size, 0);
});

test('a captured pointer stroke cannot be moved or ended by Space and arrow keys', async t => {
  const app = mounted(t);
  await app.click('[data-action="start"]'); app.advance(400);
  await app.pointer('pointerdown', 90, 70);
  await app.pointer('pointermove', 110, 70);
  const pointerStroke = structuredClone(app.state.stroke);
  const score = app.state.score;
  await app.arena.emit('keydown', {key: ' ', code: 'Space', repeat: false});
  await app.arena.emit('keydown', {key: 'ArrowRight', code: 'ArrowRight', repeat: false});
  app.advance(100);
  assert.equal(app.state.stroke.x, pointerStroke.x, 'keyboard must not connect the held pointer to its own cursor');
  assert.equal(app.state.stroke.y, pointerStroke.y);
  assert.equal(app.state.score, score, 'ignored keyboard input must not make a hidden cut');
  assert.equal(app.arena.hasPointerCapture(7), true);
  await app.arena.emit('keyup', {key: ' ', code: 'Space'});
  await app.arena.emit('keyup', {key: 'ArrowRight', code: 'ArrowRight'});
  assert.equal(app.state.stroke.active, true, 'releasing ignored Space must not end the pointer stroke');
  await app.pointer('pointermove', 130, 70);
  assert.equal(app.state.stroke.x, 130);
  await app.pointer('pointerup', 130, 70);
  assert.equal(app.state.stroke.active, false);
  assert.equal(app.arena.captures.size, 0);
  // Keyboard slicing must remain usable once the pointer releases ownership.
  await app.arena.emit('keydown', {key: ' ', code: 'Space', repeat: false});
  assert.equal(app.state.stroke.active, true);
  const keyboardX = app.state.stroke.x;
  await app.arena.emit('keydown', {key: 'ArrowRight', code: 'ArrowRight', repeat: false});
  assert.ok(app.state.stroke.x > keyboardX);
  await app.arena.emit('keyup', {key: ' ', code: 'Space'});
  assert.equal(app.state.stroke.active, false);
});

test('reset, level selection and practice selection create fresh runs rather than carrying score or strokes', async t => {
  const app = mounted(t);
  await app.click('[data-action="start"]'); await cutWave(app);
  assert.equal(app.state.score, 50);
  const old = app.state;
  await app.pointer('pointerdown', 50, 50);
  await app.click('[data-action="reset"]');
  assert.equal(app.root.dataset.phase, 'ready');
  assert.equal(app.query('.slice-ready').hidden, false);
  assert.equal(app.arena.captures.size, 0);
  await app.click('[data-action="start"]');
  assert.ok(app.state !== old);
  assert.equal(app.state.score, 0); assert.equal(app.state.chains, 0); assert.equal(app.state.time, 0);
  assert.equal(app.state.shields, 3); assert.equal(app.state.stroke.active, false);
  await app.click('[data-level="crossing"]');
  assert.equal(app.root.dataset.phase, 'ready');
  await app.click('[data-action="start"]');
  assert.equal(app.state.level, 'crossing'); assert.equal(app.state.wave, 1); assert.equal(app.state.score, 0);
  await app.click('[data-mode="practice"]');
  assert.equal(app.query('.slice-chapters').hidden, true);
  await app.click('[data-action="start"]');
  assert.equal(app.state.mode, 'practice'); assert.equal(app.state.level, 'crossing');
  assert.equal(app.state.score, 0); assert.equal(app.state.chains, 0); assert.equal(app.state.time, 0);
});

test('real pointer cuts complete a chapter, show victory, and next opens a fresh chapter', async t => {
  const app = mounted(t);
  await app.click('[data-action="start"]');
  for (let wave = 0; wave < 8; wave++) {
    await cutWave(app);
    if (wave < 7) app.advance(450);
  }
  app.advance(50);
  assert.equal(app.state.phase, 'won');
  assert.equal(app.state.score, 400); assert.equal(app.state.chains, 8);
  assert.equal(app.query('.slice-result').hidden, false);
  assert.equal(app.query('[data-action="next"]').hidden, false);
  assert.equal(app.query('[data-result="score"]').textContent, '400');
  assert.equal(app.arena.captures.size, 0); assert.equal(app.frames.size, 0);
  await app.click('[data-action="next"]');
  assert.equal(app.root.dataset.phase, 'ready'); assert.equal(app.state.level, 'crossing');
  assert.equal(app.query('.slice-result').hidden, true);
  await app.click('[data-action="start"]');
  assert.equal(app.state.score, 0); assert.equal(app.state.chains, 0); assert.equal(app.state.wave, 1);
});

test('missed real waves show loss; retry starts clean, and unmount removes RAF, listeners and capture', async t => {
  const app = mounted(t);
  await app.click('[data-action="start"]'); app.advance(45000);
  assert.equal(app.state.phase, 'lost');
  assert.equal(app.state.score, 0); assert.equal(app.state.wave, 8);
  assert.equal(app.query('.slice-result').hidden, false);
  assert.equal(app.query('[data-action="next"]').hidden, true);
  const ended = app.state;
  await app.click('[data-action="retry"]');
  assert.ok(app.state !== ended);
  assert.equal(app.state.phase, 'playing'); assert.equal(app.state.wave, 1);
  assert.equal(app.state.score, 0); assert.equal(app.state.chains, 0); assert.equal(app.state.shields, 3);
  assert.equal(app.query('.slice-result').hidden, true);
  await app.pointer('pointerdown', 120, 120);
  assert.equal(app.arena.hasPointerCapture(7), true);
  app.cleanup();
  assert.equal(app.arena.captures.size, 0); assert.equal(app.state.stroke.active, false);
  assert.equal(app.frames.size, 0); assert.equal(app.listenerCount, 0);
  assert.equal(app.container.children.length, 0);
  assert.deepEqual(app.destroyed, {scene: 1, audio: 1, note: 1, observer: 1});
  app.advance(2000);
  assert.equal(app.frames.size, 0);
});

test('opening the private note pauses and cancels a stroke; closing still requires explicit game resume', async t => {
  const app = mounted(t);
  await app.click('[data-action="start"]'); app.advance(400);
  await app.pointer('pointerdown', 100, 100);
  app.note.onOpen();
  assert.equal(app.state.paused, true); assert.equal(app.state.stroke.active, false);
  assert.equal(app.arena.captures.size, 0); assert.equal(app.frames.size, 0);
  assert.equal(app.query('.slice-paused').hidden, true);
  const frozen = structuredClone(app.state);
  app.advance(1000);
  app.note.onClose(); app.advance(1000);
  assert.deepEqual(app.state, frozen);
  assert.equal(app.query('.slice-paused').hidden, false);
  assert.equal(app.frames.size, 0);
  await app.click('[data-action="resume"]'); app.advance(200);
  assert.equal(app.state.paused, false);
  assert.ok(app.state.time > frozen.time);
});
