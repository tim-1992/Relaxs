import test from 'node:test';
import assert from 'node:assert/strict';
import * as mechanics from '../src/release-state.js';
import {RELEASE_LEVELS, releaseTrajectory, releaseLaunch} from '../src/release-challenges.js';
import {createReleaseScene} from '../src/release-scene.js';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as challenges from '../src/release-challenges.js';
import * as releaseAudio from '../src/release-audio.js';

// These tests exercise the actual contact solver, never an injected score.
const challenge = (level = 'tower') => mechanics.createReleaseState({mode: 'challenge', level});
function simulate(state, seconds, fps = 60) {
  for (let tick = 0; tick < seconds * fps; tick++) mechanics.stepRelease(state, 1 / fps);
}

test('challenge layouts stay standing without input and cannot be moved with free-mode controls', () => {
  const state = challenge();
  assert.equal(state.mode, 'challenge');
  assert.equal(state.challenge.phase, 'aiming');
  const before = structuredClone(state);
  simulate(state, 20);
  assert.deepEqual(state.bodies, before.bodies);
  assert.equal(mechanics.applyReleaseImpulse(state, state.bodies[0].id, {z: -12}), false);
  assert.equal(mechanics.beginReleaseDrag(state, state.bodies[0].id), false);
  assert.equal(mechanics.moveReleaseDrag(state, state.bodies[0].id, {x: 4, y: 3, z: 0}), false);
  assert.equal(mechanics.toppleRelease(state), false);
  assert.deepEqual(state.bodies, before.bodies);
  assert.equal(state.challenge.knocked.length, 0);
});

test('one launch spends one attempt, locks a second shot, and awards no progress before physics', () => {
  const state = challenge();
  assert.equal(mechanics.fireReleaseChallenge(state), true);
  assert.equal(state.challenge.shotsUsed, 1);
  assert.equal(state.challenge.phase, 'flying');
  assert.deepEqual(state.challenge.knocked, []);
  assert.equal(mechanics.fireReleaseChallenge(state), false);
  assert.equal(state.challenge.shotsUsed, 1);
  assert.equal(mechanics.aimReleaseChallenge(state, {angle: 50}), false);
});

test('a missed last throw loses; retry restores every target and the full shot budget', () => {
  const state = challenge();
  while (state.challenge.phase !== 'lost') {
    assert.equal(state.challenge.phase, 'aiming');
    mechanics.aimReleaseChallenge(state, {angle: 55, power: 15, projectile: 'pebble'});
    assert.equal(mechanics.fireReleaseChallenge(state), true);
    simulate(state, 11);
    assert.ok(state.challenge.shotsUsed <= 3);
  }
  assert.equal(state.challenge.knocked.length, 0);
  assert.equal(mechanics.fireReleaseChallenge(state), false);
  mechanics.resetRelease(state);
  assert.equal(state.challenge.phase, 'aiming');
  assert.equal(state.challenge.shotsUsed, 0);
  assert.equal(state.challenge.knocked.length, 0);
  assert.equal(state.bodies.length, 24);
  assert.ok(state.bodies.every(body => body.sleeping && body.target));
});

test('pause freezes an in-flight challenge and reset cannot resume a paused session', () => {
  const state = challenge();
  mechanics.fireReleaseChallenge(state);
  simulate(state, .15);
  mechanics.pauseRelease(state);
  const paused = structuredClone(state);
  simulate(state, 20);
  assert.deepEqual(state, paused);
  assert.equal(mechanics.fireReleaseChallenge(state), false);
  assert.equal(mechanics.setReleaseMode(state, 'free'), false);
  mechanics.resetRelease(state);
  assert.equal(state.paused, true);
  assert.equal(state.needsContinue, true);
  assert.equal(mechanics.fireReleaseChallenge(state), false);
  mechanics.resumeRelease(state);
  assert.equal(mechanics.fireReleaseChallenge(state), true);
});

test('free mode still supports all toys and switching back starts a fresh challenge', () => {
  const state = challenge();
  assert.equal(mechanics.setReleaseMode(state, 'free'), true);
  assert.equal(state.challenge, null);
  assert.equal(mechanics.beginReleaseDrag(state, 'ring'), true);
  mechanics.endReleaseDrag(state, 'ring', {y: 4});
  assert.equal(mechanics.toppleRelease(state), true);
  assert.equal(mechanics.setReleaseMode(state, 'challenge', 'wall'), true);
  assert.equal(state.bodies.length, 36);
  assert.ok(state.bodies.every(body => !body.held));
  assert.equal(state.challenge.shotsUsed, 0);
});

test('worry flow freezes a shot, clears private text, and continues the same attempt', () => {
  const state = challenge();
  mechanics.fireReleaseChallenge(state);
  simulate(state, .1);
  mechanics.openWorry(state);
  mechanics.setWorryText(state, 'only here');
  const positions = structuredClone(state.bodies);
  simulate(state, 5);
  assert.deepEqual(state.bodies, positions);
  assert.equal(mechanics.setReleaseMode(state, 'free'), false);
  mechanics.crumpleWorry(state);
  assert.equal(JSON.stringify(state).includes('only here'), false);
  mechanics.closeWorry(state);
  assert.equal(state.challenge.shotsUsed, 1);
  assert.equal(state.challenge.phase, 'flying');
  simulate(state, 11);
  assert.notEqual(state.challenge.phase, 'flying');
});

for (const [level, count, required, throws] of [
  ['tower', 24, 12, [{angle: 0, power: 60, projectile: 'puff'}, {angle: 16, power: 75, projectile: 'pebble'}]],
  ['wall', 36, 18, [{angle: -12, power: 70, projectile: 'puff'}, {angle: 12, power: 70, projectile: 'pebble'}, {angle: 24, power: 70, projectile: 'pebble'}]],
  ['bridge', 48, 24, [{angle: -12, power: 70, projectile: 'puff'}, {angle: 12, power: 70, projectile: 'pebble'}]],
]) {
  test(`${level}: ${count} real bodies can reach ${required} displaced targets within the shot budget`, () => {
    const state = challenge(level);
    assert.equal(state.bodies.length, count);
    const homes = structuredClone(state.bodies);
    for (const shot of throws) {
      if (state.challenge.phase === 'won') break;
      assert.equal(mechanics.aimReleaseChallenge(state, shot), true);
      assert.equal(mechanics.fireReleaseChallenge(state), true);
      simulate(state, 11);
    }
    assert.equal(state.challenge.phase, 'won');
    assert.ok(state.challenge.knocked.length >= required);
    assert.equal(new Set(state.challenge.knocked).size, state.challenge.knocked.length);
    assert.ok(state.challenge.shotsUsed <= RELEASE_LEVELS.find(item => item.id === level).shots);
    assert.ok(state.bodies.filter((body, index) =>
      Math.hypot(body.position.x - homes[index].position.x, body.position.y - homes[index].position.y,
        body.position.z - homes[index].position.z) > .5).length >= required,
    'the collision solver must actually move the targets, not just mark them');
    assert.equal(mechanics.fireReleaseChallenge(state), false);
  });
}

test('the default first throw keeps its chain reaction but cannot finish the first level', () => {
  const state = challenge();
  mechanics.fireReleaseChallenge(state);
  simulate(state, 11);
  assert.equal(state.challenge.phase, 'aiming');
  assert.ok(state.challenge.knocked.length >= 8 && state.challenge.knocked.length < 12);
  assert.equal(state.challenge.shotsUsed, 1);
});

test('challenge contacts and scoring are identical at 60 and 90 Hz', () => {
  const regular = challenge('bridge'), highRefresh = challenge('bridge');
  for (const state of [regular, highRefresh]) {
    mechanics.aimReleaseChallenge(state, {angle: -12, power: 70, projectile: 'puff'});
    mechanics.fireReleaseChallenge(state);
  }
  simulate(regular, 11, 60);
  simulate(highRefresh, 11, 90);
  assert.deepEqual(highRefresh.challenge.knocked, regular.challenge.knocked);
  assert.deepEqual(highRefresh.bodies, regular.bodies);
});

test('invalid aim cannot corrupt a throw and the visible trajectory uses its actual launch vector', () => {
  const state = challenge();
  const before = structuredClone(state);
  for (const aim of [{angle: NaN}, {power: Infinity}, {projectile: 'unknown'}]) {
    assert.equal(mechanics.aimReleaseChallenge(state, aim), false);
    assert.deepEqual(state, before);
  }
  mechanics.aimReleaseChallenge(state, {angle: -25, power: 75, projectile: 'pebble'});
  const {position, velocity} = releaseLaunch(state.challenge);
  const points = releaseTrajectory(state.challenge);
  assert.ok(points.length >= 5);
  assert.deepEqual(points[0], position);
  assert.ok(points.at(-1).x < points[0].x && points.at(-1).z < points[0].z);
  mechanics.fireReleaseChallenge(state);
  const projectile = state.bodies.find(body => body.id === 'projectile');
  assert.deepEqual(projectile.position, position);
  assert.deepEqual(projectile.velocity, velocity);
  mechanics.stepRelease(state, 1 / 120);
  assert.ok(Math.abs(projectile.position.x - velocity.x / 120) < 1e-10);
});

function sceneBoundary(t, state, onAim = () => {}) {
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true, value: class {observe() {} disconnect() {}},
  });
  t.after(() => {
    if (originalObserver) Object.defineProperty(globalThis, 'ResizeObserver', originalObserver);
    else delete globalThis.ResizeObserver;
  });
  const canvas = new EventTarget();
  Object.assign(canvas, {
    classList: {add() {}, remove() {}},
    getBoundingClientRect: () => ({left: 0, top: 0, width: 900, height: 500}),
  });
  const renderer = {
    shadowMap: {}, renderLists: {dispose() {}},
    setPixelRatio() {}, setClearColor() {}, setSize() {}, dispose() {}, forceContextLoss() {},
    render(scene, camera) {
      scene.updateMatrixWorld(); camera.updateMatrixWorld();
      this.scene = scene; this.camera = camera;
    },
  };
  const scene = createReleaseScene(canvas, {state, onAim, rendererFactory: () => renderer});
  assert.ok(scene);
  t.after(() => scene.destroy());
  return {scene, renderer, canvas};
}

test('3D meshes reconcile all three layouts, projectile launches and switching back to free play', t => {
  const state = challenge();
  const {scene, renderer} = sceneBoundary(t, state);
  const groups = () => renderer.scene.children.filter(item => item.userData.bodyId);
  assert.equal(groups().length, 24);
  const oldGeometries = [];
  for (const group of groups()) group.traverse(item => {if (item.geometry) oldGeometries.push(item.geometry);});
  let removed = 0;
  for (const geometry of oldGeometries) geometry.addEventListener('dispose', () => removed++);
  mechanics.setReleaseMode(state, 'challenge', 'bridge');
  scene.render();
  assert.equal(groups().length, 48);
  const beam = state.bodies.find(body => body.half.x > .8);
  const renderedBeam = groups().find(group => group.userData.bodyId === beam.id);
  assert.ok(renderedBeam.children[0].geometry.parameters.width > 1.9);
  mechanics.fireReleaseChallenge(state);
  scene.render();
  assert.equal(groups().length, 49);
  mechanics.setReleaseMode(state, 'free');
  scene.render();
  assert.equal(groups().length, 7);
  assert.equal(removed, oldGeometries.length, 'replaced target geometry must be released');
});

test('left/front/right cameras map pointer aiming to the same world point without dragging targets', t => {
  const state = challenge();
  const aims = [];
  const {scene, renderer, canvas} = sceneBoundary(t, state, point => aims.push({...point}));
  const before = structuredClone(state.bodies);
  for (const [view, sign] of [['left', -1], ['front', 0], ['right', 1]]) {
    assert.equal(scene.setView(view), true);
    assert.equal(Math.sign(renderer.camera.position.x), sign);
    const point = new THREE.Vector3(-1, 0, -.9).project(renderer.camera);
    const event = new Event('pointerdown', {cancelable: true});
    Object.assign(event, {
      clientX: (point.x + 1) * 450, clientY: (1 - point.y) * 250,
      button: 0, pointerId: 1, isPrimary: true,
    });
    canvas.dispatchEvent(event);
    assert.ok(Math.abs(aims.at(-1).x + 1) < 1e-8);
    assert.ok(Math.abs(aims.at(-1).z + .9) < 1e-8);
  }
  assert.equal(scene.setView('invalid'), false);
  assert.deepEqual(state.bodies, before);
  assert.equal(aims.length, 3);
  mechanics.fireReleaseChallenge(state);
  canvas.dispatchEvent(Object.assign(new Event('pointerdown'), {button: 0, isPrimary: true}));
  assert.equal(aims.length, 3, 'aiming is locked during a shot');
});

// A DOM/timer boundary for the real controller, following care-navigation.test.
// Only the GPU boundary is unavailable; game state, physics, events and timers
// run unchanged. This does not replace the parent's actual browser UI QA.
function controllerBoundary() {
  function events(target = {}) {
    const listeners = new Map();
    return Object.assign(target, {
      addEventListener(type, fn, options = {}) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
        options.signal?.addEventListener('abort', () => listeners.get(type)?.delete(fn), {once: true});
      },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
      emit(type, properties = {}) {
        const event = {type, target: this, preventDefault() { this.defaultPrevented = true; }, ...properties};
        for (const fn of [...listeners.get(type) ?? []]) fn(event);
      },
    });
  }
  const doc = events({hidden: false, activeElement: null});
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
      this.attributes = {}; this.dataset = {}; this.style = {setProperty() {}};
      this.value = ''; this.hidden = this.disabled = this.open = false;
      this._text = ''; this._html = '';
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: (...names) => {this.className = [...new Set([...this.className.split(/\s+/), ...names])].join(' ');},
        remove: (...names) => {this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' ');},
        toggle: (name, active) => {if (active) this.classList.add(name); else this.classList.remove(name);},
      };
      events(this);
    }
    get className() { return this.attributes.class ?? ''; }
    set className(value) { this.attributes.class = value; }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (name === 'hidden' || name === 'disabled') this[name] = true;
      if (name === 'value') this.value = String(value);
    }
    getAttribute(name) { return this.attributes[name] ?? null; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set innerHTML(value) {
      this._html = value; this._text = ''; this.children = [];
      if (this.tagName === 'SVG') return; // SVG is output only; no controller selectors enter it.
      const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1)._text += token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const element = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) element.setAttribute(attr[1], attr[2] ?? '');
        stack.at(-1).append(element);
        if (!['INPUT', 'BR', 'HR', 'IMG'].includes(element.tagName) && !token[0].endsWith('/>')) stack.push(element);
      }
    }
    get innerHTML() { return this._html; }
    append(element) { element.parentElement = this; this.children.push(element); }
    remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
    focus() { doc.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    matches(selector) {
      if (selector.endsWith(':last-child')) return this.parentElement?.children.at(-1) === this && this.matches(selector.slice(0, -11));
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      if (selector.startsWith('#')) return this.attributes.id === selector.slice(1);
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attr) return attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2];
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) if (selector.split(',').some(part => node.matches(part))) return node;
      return null;
    }
    querySelectorAll(selector) {
      const parts = selector.split(' ');
      const result = [];
      const visit = node => {
        for (const child of node.children) {
          if (child.matches(parts.at(-1))) {
            let ancestor = child.parentElement, index = parts.length - 2;
            while (ancestor && index >= 0) {if (ancestor.matches(parts[index])) index--; ancestor = ancestor.parentElement;}
            if (index < 0) result.push(child);
          }
          visit(child);
        }
      };
      visit(this);
      return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  }
  let now = 100, sequence = 0;
  const frames = new Map(), timers = new Map();
  const win = events({
    performance: {now: () => now},
    matchMedia: () => events({matches: true}),
    requestAnimationFrame(fn) { const id = ++sequence; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, {fn, at: now + delay}); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  doc.defaultView = win;
  doc.createElement = tag => new Element(tag);
  const container = new Element('main');
  const source = readFileSync(new URL('../src/release-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, bindings, _quote, file) => `const {${bindings}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountRelease', 'function mountRelease');
  const context = vm.createContext({
    AbortController, console, imports: {
      './release-state.js': mechanics, './release-challenges.js': challenges,
      './release-audio.js': releaseAudio, './release-scene.js': {createReleaseScene: () => null},
    },
  });
  vm.runInContext(source, context);
  const cleanup = context.mountRelease(container);
  const root = container.children[0];
  const query = selector => {
    const result = root.querySelector(selector);
    assert.ok(result, `controller element exists: ${selector}`);
    return result;
  };
  return {
    root, query, cleanup, win, doc, frames, timers,
    click(selector) {const target = query(selector); root.emit('click', {target});},
    input(selector, value) {const target = query(selector); target.value = value; target.emit('input');},
    advance(milliseconds) {
      const until = now + milliseconds;
      while (now < until) {
        now = Math.min(until, now + 1000 / 60);
        const callbacks = [...frames.values()]; frames.clear();
        for (const fn of callbacks) fn(now);
        for (const [id, timer] of [...timers]) if (timer.at <= now) {timers.delete(id); timer.fn();}
      }
    },
  };
}

test('controller fallback runs real launches through failure, retry, victory and next level', t => {
  const app = controllerBoundary();
  t.after(app.cleanup);
  assert.equal(app.root.dataset.releaseMode, 'challenge');
  assert.match(app.query('.release-render-label').textContent, /二维/);
  assert.equal(app.query('.release-view-controls').hidden, true);
  assert.equal(app.query('.release-pads').hidden, true);
  assert.equal(app.query('[data-action="topple"]').disabled, true);
  app.click('[data-projectile="pebble"]');
  app.input('[data-aim="angle"]', '55');
  app.input('[data-aim="power"]', '15');
  for (let i = 0; i < 3; i++) {
    app.click('[data-action="fire"]');
    assert.equal(app.query('[data-action="fire"]').disabled, true);
    app.click('[data-action="fire"]');
    app.advance(11000);
  }
  assert.equal(app.query('.release-result').hidden, false);
  assert.equal(app.query('[data-action="next"]').hidden, true);
  assert.equal(app.query('progress').value, 0, 'three misses must never earn a win');
  app.click('[data-action="retry"]');
  assert.equal(app.query('.release-result').hidden, true);
  assert.equal(app.query('[data-action="fire"]').disabled, false);
  const initial = app.query('.release-challenge-map').innerHTML;
  app.click('[data-action="fire"]');
  app.advance(11000);
  assert.notEqual(app.query('.release-challenge-map').innerHTML, initial);
  assert.equal(app.query('progress').value, 11);
  assert.equal(app.query('[data-action="next"]').hidden, true);
  app.click('[data-projectile="pebble"]');
  app.input('[data-aim="angle"]', '16');
  app.input('[data-aim="power"]', '75');
  app.click('[data-action="fire"]');
  app.advance(11000);
  assert.equal(app.query('progress').value, 12);
  assert.equal(app.query('[data-action="next"]').hidden, false);
  app.click('[data-action="next"]');
  assert.equal(app.query('progress').max, 18);
  assert.equal(app.query('progress').value, 0);
  assert.equal(app.query('[data-action="fire"]').disabled, false);
});

test('controller pause freezes fallback physics; mode change and worry cleanup remain safe', t => {
  const app = controllerBoundary();
  t.after(app.cleanup);
  app.click('[data-action="fire"]');
  app.advance(200);
  app.win.emit('blur');
  const paused = app.query('.release-challenge-map').innerHTML;
  app.advance(4000);
  assert.equal(app.query('.release-challenge-map').innerHTML, paused);
  app.click('[data-mode="free"]');
  assert.equal(app.root.dataset.releaseMode, 'challenge');
  app.click('[data-action="continue"]');
  app.advance(11000);
  app.click('[data-mode="free"]');
  assert.equal(app.root.dataset.releaseMode, 'free');
  assert.equal(app.query('.release-pads').hidden, false);
  assert.equal(app.query('.release-challenge-visual').hidden, true);
  app.click('[data-action="worry"]');
  app.input('textarea', 'private text during a switch');
  app.win.emit('pagehide');
  assert.equal(app.query('textarea').value, '');
  assert.equal(app.query('.release-dialog').open, false);
  assert.equal(app.query('.release-pause-cover').hidden, false);
  app.click('[data-action="continue"]');
  app.click('[data-action="worry"]');
  app.input('textarea', 'clear before toss');
  app.click('[data-action="crumple"]');
  assert.equal(app.query('textarea').value, '');
  app.click('[data-action="toss"]');
  app.cleanup();
  assert.equal(app.frames.size, 0);
  assert.equal(app.timers.size, 0);
  assert.equal(app.root.parentElement, null);
});
