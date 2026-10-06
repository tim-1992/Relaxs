import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as engine from '../src/demolition-state.js';

// Real controller and mechanics; only the browser/renderer/audio are boundaries.
function mountBoundary({fallback = false} = {}) {
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
      this.hidden = this.disabled = false; this._text = ''; this.value = ''; this.captures = new Set();
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
      if (name === 'value') this.value = String(value);
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
    append(...children) {for (const child of children) {child.parentElement = this; this.children.push(child);}}
    replaceChildren(...children) {this.children = []; this._text = ''; this.append(...children);}
    remove() {if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;}
    contains(child) {for (let node = child; node; node = node.parentElement) if (node === this) return true; return false;}
    focus() {doc.activeElement = this;}
    getBoundingClientRect() {return {left: 20, top: 30, right: 980, bottom: 630, width: 960, height: 600};}
    setPointerCapture(id) {this.captures.add(id);}
    hasPointerCapture(id) {return this.captures.has(id);}
    releasePointerCapture(id) {this.captures.delete(id);}
    matches(selector) {
      if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attr) return attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2];
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) {for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null;}
    querySelectorAll(selector) {
      const found = [];
      for (const child of this.children) {if (child.matches(selector)) found.push(child); found.push(...child.querySelectorAll(selector));}
      return found;
    }
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  }
  let now = 100, nextFrame = 0, state, rendered, pickId, exitCount = 0;
  const frames = new Map(), views = [], announcements = [];
  const destroyed = {scene: 0, audio: 0, observer: 0};
  const audioCalls = {enable: 0, disable: 0, pause: 0, resume: 0, hit: 0};
  const win = events({
    matchMedia: () => ({matches: false}),
    requestAnimationFrame(fn) {frames.set(++nextFrame, fn); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);},
    ResizeObserver: class {observe() {} disconnect() {destroyed.observer++;}},
  });
  doc.defaultView = win; doc.createElement = tag => new Element(tag);
  const audio = {
    hit() {audioCalls.hit++;}, pause() {audioCalls.pause++;}, resume: async () => {audioCalls.resume++; return true;},
    enable: async () => {audioCalls.enable++; return true;}, disable() {audioCalls.disable++;},
    destroy() {destroyed.audio++;},
  };
  const source = readFileSync(new URL('../src/demolition-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountDemolition', 'function mountDemolition');
  // Capturing state at the factory also permits fallback coverage without
  // inventing a second simulation or changing the real engine's data.
  const mechanics = {...engine, createDemoState(options) {state = engine.createDemoState(options); return state;}};
  const context = vm.createContext({AbortController, console: {warn() {}}, imports: {
    './demolition-state.js': mechanics,
    './demolition-scene.js': {createDemoScene: () => {
      if (fallback) throw new Error('WebGL unavailable');
      return {
        render(next, options, dt) {state = next; rendered = {options, dt};},
        pick() {return pickId;}, setView(id) {views.push(id);}, resize() {},
        dispose() {destroyed.scene++;},
      };
    }},
    './release-audio.js': {createReleaseAudio: () => audio},
  }});
  vm.runInContext(source, context);
  const container = new Element('main');
  const cleanup = context.mountDemolition(container, {onExit() {exitCount++;}, onAnnounce(text) {announcements.push(text);}});
  const root = container.children[0];
  const query = selector => {
    const element = root.querySelector(selector); assert.ok(element, `missing controller element: ${selector}`); return element;
  };
  const stage = query('.demo-stage');
  return {
    root, stage, query, cleanup, container, win, doc, frames, destroyed, audioCalls, views, announcements,
    get state() {return state;}, get rendered() {return rendered;}, get exitCount() {return exitCount;},
    get listenerCount() {return listenerMaps.reduce((total, map) => total + [...map.values()].reduce((n, listeners) => n + listeners.size, 0), 0);},
    pick(id) {pickId = id;},
    click(selector, detail = 0) {const target = query(selector); assert.equal(target.disabled, false, `disabled: ${selector}`); return root.emit('click', {target, detail});},
    pointer(type, pointerId = 7) {return stage.emit(type, {target: query('canvas'), button: 0, pointerId, isPrimary: true, clientX: 300, clientY: 300});},
    key(type, key, props = {}) {return root.emit(type, {target: stage, key, code: key === ' ' ? 'Space' : key, ...props});},
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 1000 / 60);
        const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now));
      }
    },
  };
}

function mounted(t, options) {
  const app = mountBoundary(options); t.after(app.cleanup); return app;
}

test('active room: pointer selects, hold charges, release makes one real hit; keyboard cannot steal capture', async t => {
  const app = mounted(t);
  assert.equal(app.state.phase, 'playing');
  assert.equal(app.audioCalls.enable, 0, 'audio must start muted');
  const object = app.state.objects.find(item => item.kind === 'table'), hp = object.hp;
  app.pick(object.id); await app.pointer('pointerdown');
  assert.equal(app.state.stats.hits, 0);
  assert.equal(app.stage.hasPointerCapture(7), true);
  await app.key('keydown', ' '); await app.key('keydown', 'ArrowRight'); await app.key('keyup', ' ');
  assert.equal(app.stage.hasPointerCapture(7), true);
  app.advance(900);
  assert.equal(app.rendered.options.charge, 1);
  assert.equal(app.rendered.options.selectedId, object.id);
  await app.pointer('pointerup');
  assert.equal(app.state.stats.hits, 1); assert.ok(object.hp < hp);
  assert.equal(app.stage.captures.size, 0);
  await app.pointer('pointerup'); assert.equal(app.state.stats.hits, 1);
});

test('pause/background cancel charge and freeze physics until explicit resume', async t => {
  const app = mounted(t);
  app.pick(app.state.objects.find(item => item.kind === 'vase').id);
  await app.pointer('pointerdown'); app.advance(900); await app.pointer('pointerup');
  assert.ok(app.state.fragments.length > 0, 'freeze actual moving debris after a real hit');
  assert.ok(app.state.cooldown > 0);
  await app.click('[data-action="pause"]');
  const afterImpact = structuredClone(app.state); app.advance(1000);
  assert.deepEqual(app.state, afterImpact, 'pause freezes cooldown and debris as well as elapsed time');
  await app.click('[data-action="resume"]'); app.advance(400);
  app.pick(app.state.objects[0].id); await app.pointer('pointerdown'); app.advance(100);
  await app.click('[data-action="pause"]');
  assert.equal(app.stage.captures.size, 0); assert.equal(app.frames.size, 0);
  const frozen = structuredClone(app.state); app.advance(1500);
  await app.pointer('pointerup'); assert.deepEqual(app.state, frozen);
  await app.click('[data-action="resume"]'); app.advance(300);
  assert.ok(app.state.elapsed > frozen.elapsed);
  await app.win.emit('blur');
  app.doc.hidden = true; await app.doc.emit('visibilitychange');
  const hidden = structuredClone(app.state);
  app.doc.hidden = false; await app.doc.emit('visibilitychange'); await app.win.emit('focus'); app.advance(1000);
  assert.deepEqual(app.state, hidden); assert.equal(app.frames.size, 0);
  assert.equal(app.query('.demo-paused').hidden, false);
});

test('keyboard/accessibility hit real targets; reset, room and view cancel pending input', async t => {
  const app = mounted(t);
  await app.key('keydown', '2'); assert.equal(app.state.tool, 'ball');
  await app.key('keydown', 'ArrowRight');
  const selected = app.rendered.options.selectedId;
  await app.key('keydown', ' '); app.advance(900); await app.key('keyup', ' ');
  assert.equal(app.state.stats.hits, 1);
  app.advance(1500);
  const select = app.query('[data-target-select]');
  select.value = app.state.objects.find(item => !item.destroyed && item.id !== selected).id;
  await app.root.emit('change', {target: select});
  await app.click('[data-action="strike"]'); assert.equal(app.state.stats.hits, 2);
  const old = app.state;
  app.advance(1500); app.pick(app.state.objects.find(item => !item.destroyed).id); await app.pointer('pointerdown');
  await app.click('[data-view="right"]'); assert.equal(app.stage.captures.size, 0); assert.equal(app.views.at(-1), 'right');
  await app.pointer('pointerdown'); assert.equal(app.stage.captures.size, 1);
  await app.click('[data-action="reset"]');
  assert.equal(app.stage.captures.size, 0);
  assert.notEqual(app.state, old); assert.equal(app.state.stats.hits, 0); assert.equal(app.state.elapsed, 0);
  assert.equal(app.state.tool, 'ball'); assert.equal(app.state.phase, 'playing');
  await app.click('[data-room="study"]');
  assert.equal(app.state.room, 'study'); assert.equal(app.state.stats.destroyed, 0);
  assert.equal(app.state.objects.every(item => !item.destroyed && item.hp === item.maxHp), true);
  assert.equal(app.views.at(-1), 'right', 'reset/room changes preserve the selected view');
});

test('simplified view uses the same engine and goals without ending free play', async t => {
  const app = mounted(t, {fallback: true});
  assert.equal(app.query('.demo-fallback').hidden, false);
  let hits = 0;
  while (app.state.objects.some(item => !item.destroyed) && hits++ < 500) {
    const object = app.state.objects.find(item => !item.destroyed);
    await app.click(`[data-prop="${object.id}"]`);
    app.advance(1200);
  }
  assert.ok(hits < 500, 'accessible play must be able to empty the room');
  assert.equal(app.state.completed, true); assert.equal(app.state.phase, 'playing');
  assert.ok(engine.getDemoGoals(app.state).every(goal => goal.done));
  assert.equal(app.query('[data-action="next"]').hidden, false);
  await app.click('[data-action="next"]'); assert.equal(app.state.room, 'study');
  assert.equal(app.state.stats.hits, 0);
});

test('sound, exit and idempotent disposal release captures, RAF, listeners and resources', async t => {
  const app = mounted(t);
  await app.click('[data-action="pause"]'); assert.ok(app.audioCalls.pause > 0);
  await app.click('[data-action="sound"]'); assert.equal(app.audioCalls.enable, 1);
  assert.equal(app.state.phase, 'paused', 'enabling sound is not consent to resume physics');
  assert.equal(app.frames.size, 0);
  await app.click('[data-action="sound"]'); assert.equal(app.audioCalls.disable, 1);
  await app.click('[data-action="sound"]'); assert.equal(app.audioCalls.enable, 2);
  await app.click('[data-action="resume"]');
  app.pick(app.state.objects[0].id); await app.pointer('pointerdown');
  await app.click('[data-action="exit"]');
  assert.equal(app.exitCount, 1); assert.equal(app.stage.captures.size, 0);
  assert.equal(app.frames.size, 0); assert.equal(app.listenerCount, 0); assert.equal(app.container.children.length, 0);
  assert.deepEqual(app.destroyed, {scene: 1, audio: 1, observer: 1});
  app.cleanup(); app.advance(1000);
  assert.deepEqual(app.destroyed, {scene: 1, audio: 1, observer: 1});
});
