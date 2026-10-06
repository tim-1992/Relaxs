import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as mechanics from '../src/crusher-state.js';

// The real controller and immutable engine run. Only browser DOM, RAF, WebGL
// and audio APIs are boundaries; no gameplay or input handlers are replaced.
function mountBoundary({fallback = false, difficulty = 'standard', tripoAssets, loadTripoCar} = {}) {
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
      this.attributes = {}; this.dataset = {}; this.style = {setProperty(name, value) {this[name] = value;}};
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
    get disabled() {return this._disabled || false;}
    set disabled(value) {
      this._disabled = Boolean(value);
      // Browser behavior that matters here: disabling the focused native
      // button drops focus to the body unless the controller moves it first.
      if (value && doc.activeElement === this) doc.activeElement = doc.body;
    }
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
        if (!['INPUT', 'BR', 'HR', 'IMG', 'LINK'].includes(child.tagName) && !token[0].endsWith('/>')) stack.push(child);
      }
    }
    append(...children) {for (const child of children) {child.parentElement = this; this.children.push(child);}}
    remove() {if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;}
    contains(child) {for (let node = child; node; node = node.parentElement) if (node === this) return true; return false;}
    focus() {doc.activeElement = this;}
    getBoundingClientRect() {return {left: 0, top: 0, width: 900, height: 440};}
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
  let now = 100, nextFrame = 0, exitCount = 0;
  const frames = new Map(), announcements = [];
  const destroyed = {scene: 0, audio: 0, observer: 0};
  const audioCalls = {enable: 0, pause: 0, resume: 0, disable: 0, hits: []};
  const win = events({
    performance: {now: () => now}, matchMedia: () => ({matches: false}),
    requestAnimationFrame(fn) {frames.set(++nextFrame, fn); return nextFrame;},
    cancelAnimationFrame(id) {frames.delete(id);},
    ResizeObserver: class {observe() {} disconnect() {destroyed.observer++;}},
  });
  doc.defaultView = win; doc.createElement = tag => new Element(tag);
  doc.body = new Element('body'); doc.activeElement = doc.body;
  const source = readFileSync(new URL('../src/crusher-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountCrusher', 'function mountCrusher');
  const context = vm.createContext({AbortController, console, imports: {
    './crusher-state.js': mechanics,
    './crusher-scene.js': {createCrusherScene: () => {
      if (fallback) throw new Error('No WebGL');
      return {render() {}, resize() {}, loadTripoCar, dispose() {destroyed.scene++;}};
    }},
    './release-audio.js': {createReleaseAudio: () => ({
      hit(...args) {audioCalls.hits.push(args);}, pause() {audioCalls.pause++;}, resume: async () => {audioCalls.resume++;},
      enable: async () => {audioCalls.enable++; return true;}, disable() {audioCalls.disable++;}, destroy() {destroyed.audio++;},
    })},
  }});
  vm.runInContext(source, context);
  const container = new Element('main');
  const cleanup = context.mountCrusher(container, {difficulty, tripoAssets, onAnnounce: message => announcements.push(message), onExit: () => exitCount++});
  const root = container.children[0];
  const query = selector => {const node = root.querySelector(selector); assert.ok(node, selector); return node;};
  return {
    root, win, doc, container, cleanup, frames, query, destroyed, audioCalls, announcements,
    get exits() {return exitCount;},
    get listeners() {return listenerMaps.reduce((sum, map) => sum + [...map.values()].reduce((n, set) => n + set.size, 0), 0);},
    async click(action, extra = {}) {
      const target = query(`[data-action="${action}"]`);
      assert.equal(target.disabled, false, `disabled: ${action}`);
      target.focus();
      await root.emit('click', {target, detail: 1, ...extra});
    },
    async target(id) {await root.emit('click', {target: query(`[data-target="${id}"]`), detail: 1});},
    async pointer(type, id = 7) {
      return query('[data-action="press"]').emit(type, {button: 0, pointerId: id, isPrimary: true});
    },
    async key(type, code = 'Space', target = doc.activeElement) {
      // Dispatch from real focus; a body/outside key cannot reach root.
      return (root.contains(target) ? root : win).emit(type, {
        code, key: code === 'Space' ? ' ' : code === 'Enter' ? 'Enter' : 'p', target, repeat: false,
      });
    },
    advance(ms, fps = 60) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 1000 / fps);
        const callbacks = [...frames.values()]; frames.clear();
        callbacks.forEach(callback => callback(now));
      }
    },
  };
}

function mounted(t, options) {
  const app = mountBoundary(options);
  t.after(app.cleanup);
  return app;
}
async function feed(app) {await app.click('feed'); app.advance(1350);}
async function crush(app, pressure = .69) {
  await app.pointer('pointerdown');
  app.advance(pressure / .38 * 1000);
  await app.pointer('pointerup');
  app.advance(3200);
}

test('Tripo option forwards the exact car buffer and only labels success after the scene has installed it', async t => {
  const car = {buffer: new ArrayBuffer(32), name: 'generated-car.glb'};
  let resolve, supplied;
  const loaded = new Promise(done => {resolve = done;});
  const app = mounted(t, {tripoAssets: {car}, loadTripoCar: value => {supplied = value; return loaded;}});
  assert.equal(supplied, car);
  assert.equal(app.root.dataset.carAsset, 'loading');
  assert.doesNotMatch(app.query('[data-stat="asset"]').textContent, /Tripo.*已载入/);
  await feed(app);
  assert.equal(app.root.dataset.phase, 'armed', 'loading must not block play');
  resolve('generated-car.glb');
  await loaded; await Promise.resolve();
  assert.equal(app.root.dataset.carAsset, 'loaded');
  assert.match(app.query('[data-stat="asset"]').textContent, /Tripo.*已载入/);
  await crush(app);
  assert.equal(app.root.dataset.phase, 'result');
  await app.click('next');
  assert.doesNotMatch(app.query('[data-stat="asset"]').textContent, /Tripo/, 'local sofa must not inherit a Tripo badge');
});

test('a failed car import stays playable and never labels the local car as Tripo', async t => {
  const app = mounted(t, {tripoAssets: {car: {buffer: new ArrayBuffer(1)}},
    loadTripoCar: async () => {throw new Error('invalid GLB');}});
  await new Promise(setImmediate);
  assert.equal(app.root.dataset.carAsset, 'failed');
  assert.match(app.query('[data-stat="asset"]').textContent, /未载入/);
  await feed(app); await crush(app);
  assert.equal(app.root.dataset.phase, 'result');
});

test('late car loading never changes a disposed or context-lost scene or claims a Tripo diagram', async t => {
  for (const loseContext of [false, true]) {
    let resolve;
    const loaded = new Promise(done => {resolve = done;});
    const app = mounted(t, {tripoAssets: {car: {buffer: new ArrayBuffer(32)}}, loadTripoCar: () => loaded});
    if (loseContext) await app.query('.crusher-canvas').emit('webglcontextlost');
    else app.cleanup();
    const before = app.query('[data-stat="asset"]').textContent;
    resolve('late-car.glb');
    await loaded; await Promise.resolve();
    assert.equal(app.query('[data-stat="asset"]').textContent, before);
    assert.doesNotMatch(before, /Tripo.*已载入/);
    assert.equal(app.destroyed.scene, 1);
  }
});

test('feed, pointer capture, live pressure, visible damage, retry and next work through the real controller', async t => {
  const app = mounted(t);
  assert.equal(app.root.dataset.phase, 'ready');
  assert.equal(app.query('[data-action="press"]').disabled, true);
  assert.equal(app.audioCalls.enable, 0);
  await feed(app);
  assert.equal(app.root.dataset.phase, 'armed');
  await app.pointer('pointerdown');
  assert.equal(app.query('[data-action="press"]').hasPointerCapture(7), true);
  app.advance(300);
  assert.ok(Number(app.query('.crusher-meter').getAttribute('aria-valuenow')) > 5);
  await app.pointer('pointerup');
  app.advance(1200);
  assert.equal(app.root.dataset.phase, 'armed');
  assert.ok(app.query('.crusher-status').textContent.includes('不足'));
  await crush(app);
  assert.equal(app.root.dataset.phase, 'result');
  assert.equal(app.query('.crusher-result').hidden, false);
  assert.equal(app.query('[data-stat="orders"]').textContent, '1 / 3');
  await app.click('next');
  assert.equal(app.root.dataset.phase, 'ready');
  assert.equal(app.root.dataset.target, 'sofa');
});

test('Space owns its hold, foreign pointers cannot release it, and other buttons keep native Space behavior', async t => {
  const app = mounted(t);
  await feed(app);
  const ignored = await app.key('keydown', 'Space', app.query('[data-action="sound"]'));
  assert.equal(ignored.defaultPrevented, undefined);
  assert.equal(app.root.dataset.phase, 'armed');
  await app.key('keydown');
  assert.equal(app.root.dataset.phase, 'charging');
  app.advance(1000);
  await app.pointer('pointerup', 55);
  assert.equal(app.root.dataset.phase, 'charging');
  await app.key('keyup');
  assert.equal(app.root.dataset.phase, 'pressing');
  app.advance(1200);
  await app.pointer('pointerdown');
  await app.key('keydown');
  await app.key('keyup');
  assert.equal(app.root.dataset.phase, 'charging');
  await app.pointer('pointercancel');
  assert.equal(app.root.dataset.phase, 'armed');
});

test('blur, hidden pages and pause freeze the scene; resume never resumes an abandoned pressure hold', async t => {
  const app = mounted(t);
  await feed(app);
  await app.pointer('pointerdown'); app.advance(450);
  await app.win.emit('blur');
  assert.equal(app.root.dataset.paused, 'true');
  assert.equal(app.query('[data-action="press"]').captures.size, 0);
  const pressure = app.query('.crusher-meter').getAttribute('aria-valuenow');
  app.advance(3000);
  assert.equal(app.query('.crusher-meter').getAttribute('aria-valuenow'), pressure);
  assert.equal(app.frames.size, 0);
  await app.win.emit('focus');
  assert.equal(app.root.dataset.paused, 'true');
  await app.click('resume');
  assert.equal(app.root.dataset.phase, 'armed');
  assert.equal(app.query('.crusher-meter').getAttribute('aria-valuenow'), '0');
  await app.key('keydown');
  app.doc.hidden = true; await app.doc.emit('visibilitychange');
  assert.equal(app.root.dataset.paused, 'true');
});

test('fallback keeps all three orders playable, shows completion, and offers infinite practice', async t => {
  const app = mounted(t, {fallback: true});
  assert.equal(app.query('.crusher-fallback').hidden, false);
  for (const pressure of [.69, .44, .57]) {
    await feed(app); await crush(app, pressure);
    if (app.root.dataset.phase !== 'complete') await app.click('next');
  }
  assert.equal(app.root.dataset.phase, 'complete');
  assert.equal(app.query('[data-stat="orders"]').textContent, '3 / 3');
  assert.equal(app.query('[data-action="next"]').hidden, true);
  await app.click('practice');
  assert.equal(app.root.dataset.mode, 'practice');
  await app.target('sofa');
  await feed(app); await crush(app, .44);
  await app.click('next');
  assert.equal(app.root.dataset.target, 'sofa');
  assert.equal(app.root.dataset.phase, 'ready');
});

test('a screen-reader click can start/stop pressure, first play unlocks sound, reset and exit dispose every owned resource', async t => {
  const app = mounted(t);
  assert.equal(app.audioCalls.enable, 0, 'mount cannot autoplay');
  await feed(app);
  assert.equal(app.audioCalls.enable, 1, 'feed must unlock audio inside the user gesture');
  assert.ok(app.audioCalls.hits.length > 0, 'first feed should actually sound');
  await app.click('press', {detail: 0});
  assert.equal(app.root.dataset.phase, 'charging');
  app.advance(1815);
  await app.click('press', {detail: 0});
  assert.equal(app.root.dataset.phase, 'pressing');
  await app.click('reset');
  assert.equal(app.root.dataset.phase, 'ready');
  await app.click('sound');
  assert.equal(app.audioCalls.enable, 1);
  assert.equal(app.audioCalls.disable, 1);
  assert.equal(app.query('[data-action="sound"]').getAttribute('aria-pressed'), 'false');
  await feed(app);
  await app.pointer('pointerdown');
  await app.click('exit');
  assert.equal(app.exits, 1);
  assert.equal(app.frames.size, 0);
  assert.equal(app.listeners, 0);
  assert.equal(app.container.children.length, 0);
  assert.equal(app.query('[data-action="press"]').captures.size, 0);
  assert.deepEqual(app.destroyed, {scene: 1, audio: 1, observer: 1});
  app.cleanup();
  assert.deepEqual(app.destroyed, {scene: 1, audio: 1, observer: 1});
});

test('mute survives later play gestures; pause silences audio and resume only runs from a user action', async t => {
  const app = mounted(t);
  await app.click('sound');
  await feed(app);
  assert.equal(app.audioCalls.enable, 0);
  assert.equal(app.audioCalls.hits.length, 0);
  await app.click('sound');
  assert.equal(app.audioCalls.enable, 1);
  const hits = app.audioCalls.hits.length;
  await app.win.emit('blur');
  assert.equal(app.audioCalls.pause, 1);
  app.advance(5000);
  assert.equal(app.audioCalls.hits.length, hits);
  await app.win.emit('focus');
  assert.equal(app.root.dataset.paused, 'true');
  await app.click('resume');
  assert.ok(app.audioCalls.resume > 0);
});

test('WebGL context loss keeps the current order and controls in the fallback', async t => {
  const app = mounted(t);
  await feed(app);
  const event = await app.query('.crusher-canvas').emit('webglcontextlost');
  assert.equal(event.defaultPrevented, true);
  assert.equal(app.query('.crusher-fallback').hidden, false);
  assert.equal(app.root.dataset.phase, 'armed');
  await crush(app);
  assert.equal(app.root.dataset.phase, 'result');
  assert.equal(app.destroyed.scene, 1);
});

test('visible tap mode uses a timed second click with real misses; Space hold still works while enabled', async t => {
  const app = mounted(t);
  assert.equal(app.query('[data-action="tap"]').closest('details'), null);
  await app.click('tap');
  assert.equal(app.query('[data-action="tap"]').getAttribute('aria-pressed'), 'true');
  await feed(app);
  await app.pointer('pointerdown');
  assert.equal(app.root.dataset.phase, 'armed', 'tap mode must wait for the click');
  await app.click('press');
  app.advance(150);
  await app.click('press');
  app.advance(1200);
  assert.equal(app.root.dataset.phase, 'armed', 'an early second click cannot auto-succeed');
  await app.click('press');
  app.advance(1815);
  assert.equal(app.root.dataset.zone, 'in');
  await app.click('press');
  app.advance(3200);
  assert.equal(app.root.dataset.phase, 'result');
  await app.click('next'); await feed(app);
  await app.key('keydown');
  assert.equal(app.root.dataset.phase, 'charging');
  app.advance(1158);
  await app.key('keyup');
  app.advance(3200);
  assert.equal(app.root.dataset.phase, 'result');
});

test('committing a focused pressure button keeps Space retry reachable without another click', async t => {
  const app = mounted(t);
  await feed(app);
  app.query('[data-action="press"]').focus();
  await app.key('keydown');
  app.advance(200);
  await app.key('keyup');
  assert.equal(app.root.dataset.phase, 'pressing');
  assert.ok(app.doc.activeElement === app.query('.crusher-arena'), 'focus should stay in the stable arena');
  app.advance(1200);
  assert.equal(app.root.dataset.phase, 'armed');
  await app.key('keydown');
  assert.equal(app.root.dataset.phase, 'charging');
  app.advance(1815);
  await app.key('keyup');
  app.advance(3200);
  assert.equal(app.root.dataset.phase, 'result');
});

test('committing or finishing a retry never steals focus that has moved outside the game', async t => {
  const app = mounted(t);
  await feed(app);
  app.query('[data-action="press"]').focus();
  await app.key('keydown');
  app.advance(200);
  const outside = app.doc.createElement('button');
  outside.focus();
  await app.key('keyup'); // The window keyup still ends the existing hold.
  assert.equal(app.root.dataset.phase, 'pressing');
  assert.ok(app.doc.activeElement === outside, 'commit should preserve outside focus');
  app.advance(1200);
  assert.equal(app.root.dataset.phase, 'armed');
  assert.ok(app.doc.activeElement === outside, 'retry readiness should preserve outside focus');
  await app.key('keydown');
  assert.equal(app.root.dataset.phase, 'armed', 'outside Space must not charge the game');
});

test('the stable arena supports Enter start/stop across a failed attempt without refocusing a button', async t => {
  const app = mounted(t);
  await feed(app);
  app.query('[data-action="press"]').focus();
  await app.key('keydown');
  app.advance(200);
  await app.key('keyup');
  app.advance(1200);
  await app.key('keydown', 'Enter');
  assert.equal(app.root.dataset.phase, 'charging');
  app.advance(1815);
  await app.key('keydown', 'Enter');
  assert.equal(app.root.dataset.phase, 'pressing');
  app.advance(3200);
  assert.equal(app.root.dataset.phase, 'result');
});
