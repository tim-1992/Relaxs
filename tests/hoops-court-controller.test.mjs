import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as physics from '../src/hoops-physics.js';
import * as challenges from '../src/hoops-challenges.js';
import {SPORT_CHARACTERS} from '../src/sport-avatar.js';

// Keep input, throw timing, movement, prediction and scoring real. Only DOM,
// animation scheduling, audio and the WebGL/asset boundary are replaced.
function mountBoundary(options = {}, {tripoResult = true, deferTripo = false} = {}) {
  const maps = [];
  function events(target = {}) {
    const listeners = new Map(); maps.push(listeners);
    return Object.assign(target, {
      addEventListener(type, fn, config = {}) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
        if (config.signal) {
          setMaxListeners(0, config.signal);
          config.signal.addEventListener('abort', () => listeners.get(type).delete(fn), {once: true});
        }
      },
      async emit(type, properties = {}) {
        const event = {type, target: this, preventDefault() {this.defaultPrevented = true;}, ...properties};
        await Promise.all([...listeners.get(type) ?? []].map(fn => fn(event)));
        return event;
      },
    });
  }
  const doc = events({hidden: false}), win = events();
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {};
      this.ownerDocument = doc; this.style = {setProperty() {}}; this._text = ''; this.value = '';
      this.captures = new Set(); this.hidden = this.disabled = false;
      this.classList = {
        add: (...names) => {this.className = [...new Set([...this.className.split(' '), ...names])].join(' ');},
        remove: (...names) => {this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' ');},
        toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name),
      };
      events(this);
    }
    get className() {return this.attributes.class || '';}
    set className(value) {this.attributes.class = value;}
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (['hidden', 'disabled'].includes(key)) this[key] = true;
      if (key === 'value') this.value = value;
    }
    getAttribute(key) {return this.attributes[key] ?? null;}
    get textContent() {return this._text + this.children.map(child => child.textContent).join('');}
    set textContent(value) {this._text = String(value); this.children = [];}
    set innerHTML(value) {
      this.children = []; this._text = ''; const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1)._text += token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const child = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) child.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).appendChild(child);
        if (!['INPUT', 'BR', 'HR', 'IMG'].includes(child.tagName) && !token[0].endsWith('/>')) stack.push(child);
      }
    }
    appendChild(child) {child.parentElement = this; this.children.push(child);}
    remove() {if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;}
    contains(child) {for (let node = child; node; node = node.parentElement) if (node === this) return true; return false;}
    focus() {doc.activeElement = this;}
    getBoundingClientRect() {return {left: 0, top: 0, width: 640, height: 700};}
    setPointerCapture(id) {this.captures.add(id);}
    hasPointerCapture(id) {return this.captures.has(id);}
    releasePointerCapture(id) {this.captures.delete(id);}
    matches(selector) {
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attribute) return attribute[2] === undefined ? attribute[1] in this.attributes : this.attributes[attribute[1]] === attribute[2];
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) if (selector.split(',').some(part => node.matches(part.trim()))) return node;
      return null;
    }
    querySelectorAll(selector) {return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  }
  doc.createElement = tag => new Element(tag); doc.defaultView = win;
  let now = 0, sequence = 0, rendered, sceneDisposed = 0, observedDisposed = 0, played = 0, resolveTripo;
  const frames = new Map(), shots = [], predictions = [], selected = [], views = [], assets = [];
  const tripoPending = new Promise(resolve => {resolveTripo = resolve;});
  const music = {async enable() {return true;}, disable() {}, pause() {}, async resume() {}, dispose() {}};
  const scene = {
    resize() {}, burst() {}, setView(id) {views.push(id);}, setCharacter(id) {selected.push(id);},
    project() {return {x: 320, y: 434};},
    render(state) {
      rendered = structuredClone(state);
      return state.holding ? {...state.origin ?? physics.BALL_START} : state.ball;
    },
    setTripoCharacter(buffer, config) {assets.push({buffer, config}); return deferTripo ? tripoPending : Promise.resolve(tripoResult);},
    dispose() {sceneDisposed++;},
  };
  const source = readFileSync(new URL('../src/hoops.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountHoops', 'function mountHoops');
  const context = vm.createContext({
    document: doc, window: win, AbortController, console: {...console, warn() {}},
    ResizeObserver: class {observe() {} disconnect() {observedDisposed++;}},
    requestAnimationFrame(fn) {frames.set(++sequence, fn); return sequence;}, cancelAnimationFrame(id) {frames.delete(id);},
    imports: {
      './hoops-physics.js': {...physics,
        createShot(velocity, config) {const shot = physics.createShot(velocity, config); shots.push({velocity: structuredClone(velocity), config: structuredClone(config), shot}); return shot;},
        predictTrajectory(velocity, hoop, config) {
          const result = physics.predictTrajectory(velocity, hoop, config); predictions.push(structuredClone({velocity, config, first: result[0]})); return result;
        },
      },
      './hoops-challenges.js': challenges, './hoops-music.js': {createHoopsMusic: () => music},
      './sport-avatar.js': {SPORT_CHARACTERS}, './hoops-scene.js': {createHoopsScene: () => scene},
    },
  });
  vm.runInContext(source, context);
  const container = new Element('main');
  const cleanup = context.mountHoops(container, {embedded: true, markPlayed() {played++;}, ...options});
  const root = container.children[0];
  const query = selector => {const result = root.querySelector(selector); assert.ok(result, `missing: ${selector}`); return result;};
  return {
    root, container, query, cleanup, win, doc, frames, predictions, shots, selected, views, assets, resolveTripo,
    get rendered() {return rendered;}, get played() {return played;},
    get disposed() {return {scene: sceneDisposed, observer: observedDisposed};},
    get listenerCount() {return maps.reduce((sum, map) => sum + [...map.values()].reduce((n, set) => n + set.size, 0), 0);},
    click(selector) {return root.emit('click', {target: query(selector), detail: 0});},
    key(type, key, extra = {}) {return root.emit(type, {target: root, key, code: key === ' ' ? 'Space' : key, ...extra});},
    pointer(type, target, pointerId = 7, position = {clientX: 320, clientY: 434}) {
      return query('.hoops-surface').emit(type, {target: query(target), pointerId, button: 0, isPrimary: true, ...position});
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      while (now < end) {
        now = Math.min(end, now + 1000 / 60);
        const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
      }
    },
  };
}
function mounted(t, options, boundary) {const app = mountBoundary(options, boundary); t.after(app.cleanup); return app;}
const flush = async () => {for (let i = 0; i < 6; i++) await Promise.resolve();};

test('court entry moves with WASD/touch, recomputes real trajectory, and keeps arrows for aiming', async t => {
  const app = mounted(t);
  await app.click('[data-h="court"]'); app.advance(30);
  assert.equal(app.root.dataset.mode, 'court'); assert.equal(app.root.dataset.phase, 'ready');
  assert.deepEqual(app.rendered.player, {x: 0, z: 5.6});
  await app.key('keydown', 'w'); app.advance(600); await app.key('keyup', 'w');
  assert.ok(app.rendered.player.z < 4.3); assert.equal(app.rendered.player.x, 0);
  assert.deepEqual(app.predictions.at(-1).first, app.rendered.origin);
  assert.deepEqual(app.predictions.at(-1).velocity, physics.velocityFromCourtAim(app.rendered.aim, app.rendered.player));
  const position = {...app.rendered.player};
  await app.key('keydown', 'ArrowRight'); await app.key('keyup', 'ArrowRight'); app.advance(200);
  assert.deepEqual(app.rendered.player, position); assert.ok(app.rendered.aim.x > 0);
  await app.pointer('pointerdown', '[data-h-move="right"]', 11); app.advance(300);
  assert.ok(app.rendered.player.x > position.x);
  await app.pointer('pointerup', '[data-h-move="right"]', 11);
  assert.equal(app.query('[data-h-move="right"]').captures.size, 0);
  const stopped = {...app.rendered.player}; app.advance(300);
  assert.deepEqual(app.rendered.player, stopped);
});

test('a live court shot copies its origin/velocity at windup, freezes walking, and scores with real physics', async t => {
  const app = mounted(t);
  await app.click('[data-h="court"]'); app.advance(30);
  await app.key('keydown', 'w'); app.advance(500); await app.key('keyup', 'w');
  const player = {...app.rendered.player}, origin = physics.courtFrame(player).origin;
  let power;
  for (let candidate = .05; candidate <= 1 && power === undefined; candidate += .0025) {
    const shot = physics.createShot(physics.velocityFromCourtAim({x: 0, power: candidate}, player), {origin});
    for (let i = 0; i < 600 && !shot.done && !shot.scored; i++) physics.stepShot(shot, 1 / 120);
    // Avoid a grazing rim/board bounce whose outcome depends on the fractional
    // release step; the controller test needs a clear, reproducible basket.
    if (shot.scored && !shot.touchedRim && !shot.touchedBoard) power = candidate;
  }
  assert.ok(power !== undefined, 'find a legal real-physics shot from the walked-to position');
  await app.pointer('pointerdown', '[data-h="ball"]');
  await app.pointer('pointerup', '[data-h="ball"]', 7, {clientX: 320, clientY: 434 - 700 * .34 * power});
  assert.equal(app.root.dataset.phase, 'windup');
  await app.key('keydown', 'd'); await app.click('[data-h="reset-position"]'); app.advance(200);
  assert.deepEqual(app.rendered.player, player);
  assert.deepEqual(app.rendered.origin, origin); assert.equal(app.played, 1);
  await app.click('[data-h="pause"]'); app.advance(1000); await app.click('[data-h="resume"]'); app.advance(250);
  assert.equal(app.shots.length, 1); assert.deepEqual(app.shots[0].config.origin, origin);
  const expectedVelocity = physics.velocityFromCourtAim({x: 0, power}, player);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(app.shots[0].velocity[axis] - expectedVelocity[axis]) < 1e-9);
  app.advance(5000);
  assert.equal(app.root.dataset.phase, 'ready');
  assert.ok(Number(app.query('[data-h-score]').textContent) > 0, JSON.stringify({power, actual: app.shots[0].shot}));
  assert.deepEqual(app.rendered.player, player, 'keys pressed during a throw must not start walking when it ends');
});

test('pause/blur cancel movement capture and keys; view preserves position; reset and mode changes restore spawn', async t => {
  const app = mounted(t);
  await app.click('[data-h="court"]'); app.advance(30);
  await app.key('keydown', 'w'); await app.pointer('pointerdown', '[data-h-move="left"]', 9); app.advance(300);
  await app.click('[data-h-view="court"]'); app.advance(50);
  const atView = {...app.rendered.player};
  assert.ok(atView.z < 5.6); assert.equal(app.views.at(-1), 'court');
  await app.click('[data-h="pause"]');
  assert.equal(app.query('[data-h-move="left"]').captures.size, 0); assert.equal(app.frames.size, 0);
  await app.click('[data-h="resume"]');
  await app.key('keydown', 'w', {repeat: true});
  app.advance(500); assert.deepEqual(app.rendered.player, atView, 'a held key repeating after pause must require a fresh press');
  await app.key('keydown', 's'); app.advance(100); await app.win.emit('blur');
  const background = {...app.rendered.player}; app.doc.hidden = true; await app.doc.emit('visibilitychange');
  app.doc.hidden = false; await app.doc.emit('visibilitychange'); app.advance(300);
  assert.equal(app.root.dataset.phase, 'paused'); assert.deepEqual(app.rendered.player, background);
  await app.click('[data-h="resume"]'); await app.click('[data-h="reset-position"]'); app.advance(30);
  assert.deepEqual(app.rendered.player, {x: 0, z: 5.6});
  await app.click('[data-h="pause"]'); await app.click('[data-h="modes"]'); await app.click('[data-h="start"]'); app.advance(30);
  assert.equal(app.root.dataset.mode, 'challenge'); assert.equal(app.rendered.freeCourt, false);
  assert.deepEqual(app.rendered.origin, physics.BALL_START);
  await app.key('keydown', 'w'); app.advance(300);
  assert.deepEqual(app.rendered.origin, physics.BALL_START);
});

test('Tripo becomes selectable only after success, persists across modes, and respects a newer character choice', async t => {
  const model = {buffer: new ArrayBuffer(8), name: 'Tripo 球手'};
  const app = mounted(t, {tripoCharacter: model}, {deferTripo: true});
  await flush();
  assert.equal(app.assets.length, 1); assert.equal(app.root.querySelector('[value="tripo"]'), null);
  app.resolveTripo(true); await flush(); await app.click('[data-h="court"]'); app.advance(30);
  assert.equal(app.query('[value="tripo"]').textContent, model.name);
  assert.equal(app.query('[data-h-character]').value, 'tripo'); assert.equal(app.selected.at(-1), 'tripo');
  await app.click('[data-h="pause"]'); await app.click('[data-h="restart"]'); app.advance(30);
  assert.equal(app.query('[data-h-character]').value, 'tripo');
  const failed = mounted(t, {tripoCharacter: model}, {tripoResult: false});
  await flush(); assert.equal(failed.root.querySelector('[value="tripo"]'), null);
  const invalid = mounted(t, {tripoCharacter: model}, {tripoResult: null});
  await flush(); assert.equal(Boolean(invalid.root.querySelector('[value="tripo"]')), false);
  const changed = mounted(t, {tripoCharacter: model}, {deferTripo: true});
  await changed.click('[data-h="court"]');
  const select = changed.query('[data-h-character]'); select.value = 'robot'; await select.emit('change');
  changed.resolveTripo(true); await flush();
  assert.equal(select.value, 'robot'); assert.equal(changed.selected.at(-1), 'robot');
});

test('disposal cancels all input/RAF and never starts or applies a late Tripo load', async t => {
  const model = {buffer: new ArrayBuffer(8), name: 'Tripo 球手'};
  const early = mounted(t, {tripoCharacter: model});
  early.cleanup(); await flush();
  assert.equal(early.assets.length, 0, 'do not start asset parsing after synchronous unmount');
  const app = mounted(t, {tripoCharacter: model}, {deferTripo: true});
  await flush(); await app.click('[data-h="court"]'); app.advance(30);
  await app.key('keydown', 'w'); await app.pointer('pointerdown', '[data-h-move="right"]', 8);
  const pad = app.query('[data-h-move="right"]');
  app.cleanup(); app.resolveTripo(true); await flush(); app.advance(500);
  assert.equal(pad.captures.size, 0); assert.equal(app.frames.size, 0); assert.equal(app.listenerCount, 0);
  assert.equal(app.container.children.length, 0); assert.equal(app.selected.includes('tripo'), false);
  assert.deepEqual(app.disposed, {scene: 1, observer: 1});
});
