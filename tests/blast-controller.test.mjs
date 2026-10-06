import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as mechanics from '../src/blast-state.js';
import {createReleaseAudio} from '../src/release-audio.js';

// Browser DOM, audio and GPU boundaries are replaced; the real controller and
// engine run. Actual geometry/raycast projection is tested in blast-scene.test.mjs.
function controllerBoundary({fallback = false, audioFactory} = {}) {
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
  let exitCount = 0, picked = null, selectedView = null;
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
    './blast-scene.js': {createBlastScene: () => {
      if (fallback) throw new Error('WebGL intentionally unavailable');
      return {render(state) {view = state;}, pick() {return picked;}, setView(value) {selectedView = value;},
        resize() {}, destroy() {destroyed.scene++;}};
    }},
    './release-audio.js': {createReleaseAudio: () => audio},
  }});
  vm.runInContext(source, context);
  const container = new Element('main'), cleanup = context.mountBlast(container, {onExit() {exitCount++;}});
  const root = container.children[0];
  const query = selector => {
    const element = root.querySelector(selector); assert.ok(element, `missing controller element: ${selector}`); return element;
  };
  const arena = query('.blast-arena');
  return {
    root, arena, query, container, cleanup, win, doc, frames, destroyed, note,
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

function mounted(t, options) {
  const app = controllerBoundary(options);
  t.after(app.cleanup);
  return app;
}

test('the initial building is visible and inert; ray selection, plant and explicit detonate run the simulation', async t => {
  const app = mounted(t);
  assert.ok(app.state.pieces.length > 25);
  assert.equal(app.frames.size, 0);
  assert.equal(app.state.phase, 'planning');
  assert.equal(app.query('[data-action="detonate"]').disabled, true);
  const target = app.state.pieces.find(piece => piece.id === app.state.suggestedTarget);
  const point = {...target.position};
  app.setPick({id: target.id, point});
  await app.pointer('pointerdown', 100, 150);
  await app.pointer('pointerup', 100, 150);
  assert.equal(app.state.selectedId, target.id);
  assert.equal(app.state.markers.length, 0);
  await app.click('[data-type="wide"]');
  await app.click('[data-action="plant"]');
  assert.equal(app.state.markers.length, 1);
  assert.deepEqual(app.state.markers[0].point, point);
  assert.equal(app.query('[data-action="detonate"]').disabled, false);
  await app.click('[data-action="detonate"]');
  assert.ok(app.doc.visibleElement === app.arena, 'detonation must bring the collapse into view before advancing');
  app.advance(1200);
  assert.equal(app.state.phase, 'collapsing');
  assert.ok(app.state.stats.chain > 0);
  app.advance(14000);
  assert.equal(app.state.phase, 'won');
  assert.equal(app.query('.blast-result').hidden, false);
  assert.equal(app.frames.size, 0);
  await app.click('[data-action="next"]');
  assert.equal(app.state.layout, 'tower');
  assert.equal(app.state.phase, 'planning');
});

test('keyboard target selection and placement work; scrolling a touch does not accidentally select a hit', async t => {
  const app = mounted(t);
  const select = app.query('[data-target-select]');
  select.value = app.state.suggestedTarget;
  await app.root.emit('change', {target: select});
  assert.equal(app.state.selectedId, select.value);
  await app.arena.emit('keydown', {key: '2', target: app.arena});
  await app.arena.emit('keydown', {key: ' ', target: app.arena});
  assert.equal(app.state.markers[0].type, 'wide');
  await app.click('[data-action="undo"]');
  assert.equal(app.state.markers.length, 0);
  const selected = app.state.selectedId;
  app.setPick({id: app.state.pieces.at(-1).id, point: app.state.pieces.at(-1).position});
  await app.pointer('pointerdown', 100, 100);
  await app.pointer('pointerup', 100, 160);
  assert.equal(app.state.selectedId, selected);
  await app.click('[data-view="left"]');
  assert.equal(app.selectedView, 'left');
  await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
  assert.notEqual(app.state.selectedId, selected);
});

test('pause, blur and hidden tabs freeze physics; reset and unmount cancel frames and listeners', async t => {
  const app = mounted(t);
  await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
  await app.click('[data-action="plant"]');
  await app.click('[data-action="detonate"]'); app.advance(150);
  await app.click('[data-action="pause"]');
  assert.equal(app.query('[data-action="sound"]').disabled, true, 'paused audio cannot silently enable behind an off label');
  const frozen = structuredClone(app.state);
  app.advance(2000);
  assert.deepEqual(app.state, frozen);
  assert.equal(app.frames.size, 0);
  await app.click('[data-action="resume"]'); app.advance(100);
  assert.ok(app.state.elapsed > frozen.elapsed);
  await app.win.emit('blur');
  const blurred = structuredClone(app.state);
  app.doc.hidden = true; await app.doc.emit('visibilitychange');
  app.doc.hidden = false; await app.doc.emit('visibilitychange'); await app.win.emit('focus');
  app.advance(1000);
  assert.deepEqual(app.state, blurred);
  await app.click('[data-action="reset"]');
  assert.equal(app.state.phase, 'planning');
  assert.equal(app.state.stats.fallen, 0);
  assert.equal(app.state.paused, false);
  await app.click('[data-layout="bridge"]');
  await app.click('[data-mode="practice"]');
  assert.equal(app.state.layout, 'bridge'); assert.equal(app.state.mode, 'practice');
  await app.click('[data-action="sound"]');
  assert.equal(app.query('[data-action="sound"]').getAttribute('aria-pressed'), 'false');
  app.cleanup(); app.cleanup();
  assert.equal(app.frames.size, 0);
  assert.equal(app.listenerCount, 0);
  assert.equal(app.container.children.length, 0);
  assert.deepEqual(app.destroyed, {scene: 1, audio: 1, observer: 1});
});

test('WebGL failure provides a clickable building diagram that can complete an attempt and retry', async t => {
  const app = mounted(t, {fallback: true});
  assert.equal(app.query('.blast-fallback').hidden, false);
  const parts = app.root.querySelectorAll('[data-piece]');
  assert.ok(parts.length > 25);
  const id = mechanics.createBlastState().suggestedTarget;
  await app.click(`[data-piece="${id}"]`);
  await app.click('[data-type="wide"]');
  await app.click('[data-action="plant"]');
  await app.click('[data-action="detonate"]'); app.advance(14000);
  assert.equal(app.root.dataset.phase, 'won');
  assert.equal(app.query('.blast-result').hidden, false);
  await app.click('[data-action="retry"]');
  assert.equal(app.root.dataset.phase, 'planning');
  assert.equal(app.query('.blast-result').hidden, true);
  await app.click('[data-action="exit"]');
  assert.equal(app.exitCount, 1);
  assert.equal(app.frames.size, 0);
});

test('mount stylesheet follows the entry base and the module compiles for the existing IIFE release format', async t => {
  const app = mounted(t);
  assert.equal(app.query('link').href, 'https://preview.example/relaxs/src/blast.css');
  const {build} = await import('esbuild');
  const compiled = await build({
    entryPoints: [new URL('../src/blast-experience.js', import.meta.url).pathname],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
    write: false, logLevel: 'silent',
  });
  assert.deepEqual(compiled.warnings, [], 'the release format must not erase a required import.meta URL');
  assert.ok(compiled.outputFiles[0].contents.length > 0);
});

function audioHardware(t, {deferred = false} = {}) {
  // Replace only the hardware boundary. In particular enable/pause/resume/hit
  // are the real shared implementation, including its enabled preference.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const waiting = [];
  const output = {contexts: 0, notes: 0, frequencies: [], release() {waiting.splice(0).forEach(resolve => resolve());}};
  const parameter = () => ({value: 0, setValueAtTime(value) {this.value = value;}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}});
  const node = () => ({connect() {}, disconnect() {}});
  class AudioDevice {
    constructor() {output.contexts++; this.state = 'suspended'; this.sampleRate = 100; this.currentTime = 0; this.destination = {};}
    createGain() {return {...node(), gain: parameter()};}
    createDynamicsCompressor() {return {...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter()};}
    createBuffer(_channels, length) {return {getChannelData: () => new Float32Array(length)};}
    createBiquadFilter() {return {...node(), frequency: parameter(), Q: parameter()};}
    createOscillator() {
      const frequency = parameter();
      return {...node(), frequency, start() {output.notes++; output.frequencies.push(frequency.value);}, stop() {}};
    }
    createBufferSource() {return this.createOscillator();}
    async resume() {
      if (deferred) await new Promise(resolve => waiting.push(resolve));
      this.state = 'running';
    }
    async suspend() {this.state = 'suspended';}
    async close() {this.state = 'closed';}
  }
  Object.defineProperty(globalThis, 'AudioContext', {configurable: true, value: AudioDevice});
  t.after(() => previous ? Object.defineProperty(globalThis, 'AudioContext', previous) : delete globalThis.AudioContext);
  return output;
}
const flushAudio = () => new Promise(resolve => setImmediate(resolve));

test('sound defaults on without autoplay; first placement and detonation reach the real synth from a gesture', async t => {
  const output = audioHardware(t), app = mounted(t, {audioFactory: createReleaseAudio});
  assert.equal(app.query('[data-action="sound"]').getAttribute('aria-pressed'), 'true');
  app.advance(2000); await flushAudio();
  assert.equal(output.contexts, 0);
  assert.equal(output.notes, 0);
  await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
  const placement = app.click('[data-action="plant"]');
  assert.equal(output.contexts, 1, 'audio must be unlocked synchronously, before the gesture handler yields');
  await placement; await flushAudio();
  assert.ok(output.notes > 0);
  await app.arena.emit('keydown', {key: 'Enter', target: app.arena}); await flushAudio();
  assert.ok(output.frequencies.includes(145), 'the first detonation must produce its actual low percussion voice');
  assert.equal(output.contexts, 1, 'all gestures reuse one audio context');
});

test('detonation during pending activation plays once after unlocking instead of losing the first blast', async t => {
  const output = audioHardware(t, {deferred: true}), app = mounted(t, {audioFactory: createReleaseAudio});
  await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
  await app.arena.emit('keydown', {key: ' ', target: app.arena});
  await app.click('[data-action="detonate"]');
  assert.equal(output.contexts, 1);
  assert.equal(output.notes, 0);
  output.release(); await flushAudio();
  assert.deepEqual(output.frequencies, [145], 'the latest gesture is the blast, with no duplicated queued placement note');
});

test('pending activation cannot emit a stale blast after pause, blur, hide, mute, retry or disposal', async t => {
  const output = audioHardware(t, {deferred: true});
  for (const stop of ['pause', 'blur', 'hide', 'mute', 'retry', 'dispose']) {
    const app = mounted(t, {audioFactory: createReleaseAudio});
    await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
    await app.click('[data-action="plant"]'); await app.click('[data-action="detonate"]');
    if (stop === 'pause') await app.click('[data-action="pause"]');
    else if (stop === 'blur') await app.win.emit('blur');
    else if (stop === 'hide') {app.doc.hidden = true; await app.doc.emit('visibilitychange');}
    else if (stop === 'mute') {
      await app.click('[data-action="sound"]');
      assert.equal(app.query('[data-action="sound"]').getAttribute('aria-pressed'), 'false');
    } else if (stop === 'retry') await app.click('[data-action="reset"]');
    else app.cleanup();
    output.release(); await flushAudio(); app.advance(400);
    assert.equal(output.notes, 0, `${stop}: activation must not resurrect a discarded sound`);
    app.cleanup();
  }
});

test('an explicit mute survives pause, retry and new detonations; explicitly enabling still plays', async t => {
  const output = audioHardware(t);
  const app = mounted(t, {audioFactory: createReleaseAudio});
  const sound = app.query('[data-action="sound"]');
  await app.click('[data-action="sound"]');
  assert.equal(sound.getAttribute('aria-pressed'), 'false');
  await app.click('[data-action="pause"]');
  assert.equal(sound.disabled, true);
  assert.match(sound.textContent, /暂停/, 'the disabled control explains why audio cannot be enabled');
  // Even a delegated click delivered to a disabled control must not set the
  // shared engine's enabled preference behind a still-off button.
  await app.root.emit('click', {target: sound});
  await app.click('[data-action="resume"]');
  assert.equal(sound.getAttribute('aria-pressed'), 'false');
  assert.equal(output.contexts, 0, 'resume must not secretly activate an audio device');
  await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
  await app.click('[data-action="plant"]'); await app.click('[data-action="detonate"]'); app.advance(250);
  assert.equal(output.notes, 0, 'detonating with the off label must remain silent');

  await app.click('[data-action="reset"]');
  assert.equal(sound.getAttribute('aria-pressed'), 'false', 'retry preserves the explicit mute');
  await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
  await app.click('[data-action="plant"]'); await app.click('[data-action="detonate"]'); await flushAudio();
  assert.equal(output.notes, 0);
  await app.click('[data-action="reset"]');
  await app.click('[data-action="sound"]');
  await flushAudio();
  assert.equal(sound.getAttribute('aria-pressed'), 'true');
  await app.arena.emit('keydown', {key: 'ArrowRight', target: app.arena});
  await app.click('[data-action="plant"]'); await app.click('[data-action="detonate"]');
  assert.ok(output.notes > 0, 'positive control: a real enabled engine must reach the audio device');
  await app.click('[data-action="pause"]');
  const pausedNotes = output.notes;
  app.advance(500);
  assert.equal(output.notes, pausedNotes);
  assert.match(sound.textContent, /开.*暂停/);
  await app.click('[data-action="resume"]');
  assert.equal(sound.getAttribute('aria-pressed'), 'true', 'pausing preserves an explicitly enabled preference');
  await app.click('[data-action="sound"]');
  app.advance(1000);
  assert.equal(output.notes, pausedNotes, 'muting again suppresses subsequent chain sounds');
});
