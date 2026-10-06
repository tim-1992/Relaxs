import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as rules from '../src/moles-state.js';
import {molesLayout} from '../src/moles-scene.js';

function mount({fallback = false, ...options} = {}) {
  function events(object = {}) {
    const listeners = new Map();
    object.addEventListener = (type, fn, options = {}) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      if (options.signal) {
        setMaxListeners(0, options.signal);
        options.signal.addEventListener('abort', () => listeners.get(type).delete(fn), {once:true});
      }
    };
    object.emit = (type, properties = {}) => {
      const event = {target:object, preventDefault() {this.defaultPrevented = true;}, ...properties};
      for (const fn of [...listeners.get(type) || []]) fn(event);
      return event;
    };
    return object;
  }
  let now = 0, sequence = 0, sceneDisposed = 0, soundDestroyed = 0, exited = 0, observed = 0;
  const frames = new Map(), notices = [], modelRequests = [];
  const doc = events({hidden:false});
  const win = events({
    performance:{now:() => now}, devicePixelRatio:1, AbortController,
    requestAnimationFrame(fn) {frames.set(++sequence, fn); return sequence;},
    cancelAnimationFrame(id) {frames.delete(id);},
    matchMedia:() => ({matches:false}),
    ResizeObserver:class {observe() {observed++;} disconnect() {observed--;}},
  });
  doc.defaultView = win;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {};
      this.ownerDocument = doc; this.style = {setProperty() {}}; this._text = '';
      this.classList = {
        add:(...names) => {this.className = [...new Set([...this.className.split(' '), ...names])].join(' ');},
        remove:(...names) => {this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' ');},
        toggle:(name, on) => on ? this.classList.add(name) : this.classList.remove(name),
      };
      events(this);
    }
    get className() {return this.attributes.class || '';}
    set className(value) {this.attributes.class = value;}
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (key === 'hidden' || key === 'disabled') this[key] = true;
    }
    get textContent() {return this._text + this.children.map(child => child.textContent).join('');}
    set textContent(value) {this._text = String(value); this.children = [];}
    set innerHTML(value) {
      this.children = []; this._text = '';
      const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1)._text += token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const child = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) child.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).append(child);
        if (!['BR','HR','INPUT','IMG'].includes(child.tagName) && !token[0].endsWith('/>')) stack.push(child);
      }
    }
    append(child) {child.parentElement = this; this.children.push(child);}
    remove() {this.parentElement.children = this.parentElement.children.filter(child => child !== this);}
    focus() {doc.activeElement = this;}
    contains(element) {return element === this || this.children.some(child => child.contains(element));}
    getBoundingClientRect() {return {width:284,height:400,left:0,top:0};}
    matches(selector) {
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attr) return attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2];
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) {
      for (let current = this; current; current = current.parentElement)
        if (selector.split(',').some(part => current.matches(part))) return current;
      return null;
    }
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    querySelectorAll(selector) {
      return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
  }
  doc.createElement = tag => new Element(tag);
  doc.body = new Element('body'); doc.activeElement = doc.body;
  const audio = {enabled:false,paused:false, enableCalls:0,
    async enable() {this.enabled = true; this.enableCalls++; return true;},
    disable() {this.enabled = false;}, pause() {this.paused = true;},
    async resume() {this.paused = false; return true;}, hit() {}, destroy() {soundDestroyed++;},
  };
  let presentation, character = null, characterYaw = null;
  const scene = {resize() {}, flash() {},
    render(state) {presentation = structuredClone(state);},
    setCharacter(asset) {character?.dispose(); character = asset;},
    setCharacterYaw(value) {characterYaw = value;},
    dispose() {sceneDisposed++; character?.dispose(); character = null;},
  };
  const code = readFileSync(new URL('../src/moles-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountMoles', 'function mountMoles');
  const context = vm.createContext({console, AbortController, imports:{
    './moles-state.js':rules,
    './moles-scene.js':{molesLayout, createMolesScene() {if (fallback) throw new Error('No WebGL'); return scene;}},
    './release-audio.js':{createReleaseAudio:() => audio},
    './moles-character.js':{loadMolesCharacter(file, {signal}) {
      return new Promise((resolve, reject) => modelRequests.push({file, signal, resolve, reject}));
    }},
  }});
  vm.runInContext(code, context);
  const container = new Element('main');
  const cleanup = context.mountMoles(container, {onExit() {exited++;}, onAnnounce:message => notices.push(message), ...options});
  const root = container.children[0];
  const query = selector => {const element = root.querySelector(selector); assert.ok(element, selector); return element;};
  return {root, query, cleanup, frames, audio, win, doc, notices, container, modelRequests,
    get state() {return presentation;}, get sceneDisposed() {return sceneDisposed;},
    get characterYaw() {return characterYaw;},
    get soundDestroyed() {return soundDestroyed;}, get exited() {return exited;}, get observed() {return observed;},
    click(action) {root.emit('click', {target:query(`[data-moles-action="${action}"]`), detail:0});},
    hit(hole) {root.emit('click', {target:query(`[data-moles-hole="${hole}"]`), detail:1});},
    remount() {
      const container = new Element('main');
      const cleanup = context.mountMoles(container);
      return {root:container.children[0], cleanup};
    },
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 1000 / 60);
        const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
      }
    },
  };
}

test('native buttons and mapped keys hit the real state; repeated keys cannot auto-hit', () => {
  const app = mount();
  try {
    assert.equal(app.root.dataset.phase, 'ready');
    assert.equal(app.query('[data-moles-hole="0"]').disabled, true);
    app.click('start'); app.advance(700);
    let hole = app.state.holes.findIndex(Boolean);
    assert.ok(hole >= 0);
    const key = rules.MOLES_KEYS[hole].toLowerCase();
    app.root.emit('keydown', {key, target:app.root});
    const taps = app.state.taps;
    assert.equal(taps, 1);
    app.root.emit('keydown', {key, repeat:true, target:app.root});
    assert.equal(app.state.taps, taps);
    app.hit(hole);
    assert.equal(app.state.taps, 2);
    assert.equal(app.root.emit('keydown', {key:'Escape', target:app.root}).defaultPrevented, undefined);
  } finally {app.cleanup();}
});

test('blur/hidden freeze the round; resume and reset clear old wall-clock time', () => {
  const app = mount();
  try {
    app.click('start'); app.advance(1200);
    app.win.emit('blur');
    const paused = structuredClone(app.state);
    app.advance(20000);
    assert.deepEqual(app.state, paused);
    assert.equal(app.frames.size, 0);
    assert.equal(app.audio.paused, true);
    app.click('resume'); app.advance(500);
    assert.ok(app.state.elapsed < 2);
    app.doc.hidden = true; app.doc.emit('visibilitychange');
    assert.equal(app.root.dataset.paused, 'true');
    app.doc.hidden = false; app.doc.emit('visibilitychange');
    assert.equal(app.frames.size, 0, 'returning never resumes play automatically');
    app.click('reset');
    assert.equal(app.root.dataset.phase, 'ready');
    assert.equal(app.state.elapsed, 0);
    assert.equal(app.state.score, 0);
  } finally {app.cleanup();}
});

test('challenge finishes at 45 seconds and retry/practice make independent rounds', () => {
  const app = mount();
  try {
    app.click('start'); app.advance(46000);
    assert.equal(app.root.dataset.phase, 'ended');
    assert.equal(app.state.elapsed, 45);
    assert.equal(app.frames.size, 0);
    app.click('retry');
    assert.equal(app.root.dataset.phase, 'playing');
    assert.equal(app.state.elapsed, 0);
    app.click('practice');
    assert.equal(app.root.dataset.mode, 'practice');
    assert.equal(app.root.dataset.phase, 'ready');
    app.click('start'); app.advance(46000);
    assert.equal(app.root.dataset.phase, 'playing');
    app.click('finish');
    assert.equal(app.root.dataset.phase, 'ended');
  } finally {app.cleanup();}
});

test('WebGL failure leaves nine working native controls and a playable CSS scene', () => {
  const app = mount({fallback:true});
  try {
    assert.ok(app.root.className.includes('moles-fallback'));
    app.click('start'); app.advance(500);
    app.hit(0);
    assert.equal(app.root.dataset.phase, 'playing');
    assert.equal(app.query('[data-moles-hole="0"]').disabled, false);
  } finally {app.cleanup();}
});

test('sound starts with the Start gesture, pending activation cannot survive cleanup, and cleanup is idempotent', async () => {
  const app = mount();
  assert.equal(app.audio.enableCalls, 0);
  assert.equal(app.query('[data-moles-action="sound"]').attributes['aria-pressed'], 'true');
  assert.equal(app.audio.enableCalls, 0, 'intro preference need not allocate audio');
  let resolve;
  app.audio.enable = () => new Promise(done => {resolve = done;});
  app.click('start');
  assert.equal(typeof resolve, 'function');
  app.cleanup(); app.cleanup();
  resolve(true);
  await new Promise(done => setImmediate(done));
  assert.equal(app.sceneDisposed, 1);
  assert.equal(app.soundDestroyed, 1);
  assert.equal(app.frames.size, 0);
  assert.equal(app.observed, 0);
  assert.equal(app.container.children.length, 0);
  app.win.emit('blur'); app.root.emit('keydown', {key:'q', target:app.root});
  assert.equal(app.frames.size, 0);
});

test('explicit mute survives pause, retry, practice and leaving/re-entering the game slot', () => {
  const app = mount();
  try {
    app.click('sound');
    app.click('start');
    assert.equal(app.audio.enableCalls, 0);
    app.click('pause'); app.click('resume'); app.click('retry');
    app.click('practice'); app.click('start');
    assert.equal(app.audio.enableCalls, 0);
    app.cleanup();
    const next = app.remount();
    try {
      assert.equal(next.root.querySelector('[data-moles-action="sound"]').attributes['aria-pressed'], 'false');
    } finally {next.cleanup();}
  } finally {app.cleanup();}
});

test('Tripo import pauses for preview, rejects stale loads, restores the example and frees late results', async () => {
  const app = mount(), flush = () => new Promise(resolve => setImmediate(resolve));
  const asset = name => ({name, released:0, dispose() {this.released++;}});
  const upload = name => {
    const input = app.query('[data-moles-file]');
    input.files = [{name, size:100}]; input.emit('change');
  };
  try {
    assert.match(app.query('[data-moles-character-name]').textContent, /示例角色/);
    app.click('start'); app.advance(500);
    const panel = app.query('.moles-character-panel');
    panel.open = true; panel.emit('toggle');
    assert.equal(app.root.dataset.paused, 'true');
    assert.equal(app.root.dataset.characterPreview, 'true');
    upload('first.glb'); upload('second.glb');
    assert.equal(app.modelRequests[0].signal.aborted, true);
    const first = asset('first.glb'), second = asset('second.glb');
    app.modelRequests[0].resolve(first); await flush();
    assert.equal(first.released, 1);
    app.modelRequests[1].resolve(second); await flush();
    assert.match(app.query('[data-moles-character-name]').textContent, /second.glb/);
    assert.equal(second.released, 0);
    app.click('character-reset');
    assert.equal(second.released, 1);
    assert.match(app.query('[data-moles-character-name]').textContent, /示例角色/);
    upload('late.glb');
    const last = asset('late.glb');
    app.cleanup();
    assert.equal(app.modelRequests[2].signal.aborted, true);
    app.modelRequests[2].resolve(last); await flush();
    assert.equal(last.released, 1);
  } finally {app.cleanup();}
});

test('a shipped Tripo buffer uses the same loader at mount and becomes the default character', async () => {
  const buffer = new ArrayBuffer(80), name = 'mint-monster.glb';
  const app = mount({initialCharacter:{buffer, name, source:'Tripo'}});
  const asset = {name, released:0, dispose() {this.released++;}};
  try {
    assert.equal(app.modelRequests.length, 1);
    const request = app.modelRequests[0];
    assert.equal(request.file.name, name);
    assert.equal(request.file.size, buffer.byteLength);
    assert.equal(await request.file.arrayBuffer(), buffer);
    assert.equal(request.signal.aborted, false);
    assert.equal(app.root.dataset.phase, 'ready');
    assert.equal(app.frames.size, 0);
    request.resolve(asset);
    await new Promise(resolve => setImmediate(resolve));
    assert.match(app.query('[data-moles-character-name]').textContent, /Tripo.*mint-monster\.glb/);
    app.click('start'); app.advance(600);
    assert.equal(app.root.dataset.phase, 'playing');
    assert.equal(asset.released, 0);
  } finally {app.cleanup();}
  assert.equal(asset.released, 1);
});

test('the shipped monster faces the player immediately, while a personal import keeps its own front', async () => {
  const app = mount({initialCharacter:{
    buffer:new ArrayBuffer(80), name:'mint-monster.glb', source:'Tripo', frontYaw:-Math.PI / 2,
  }});
  try {
    app.modelRequests[0].resolve({name:'mint-monster.glb', dispose() {}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.characterYaw, -Math.PI / 2, 'apply the verified model correction before first play');
    app.click('character-turn');
    assert.equal(app.characterYaw, 0, 'manual turns continue relative to the corrected front');
    app.click('start'); app.advance(300); app.click('reset');
    assert.equal(app.characterYaw, 0, 'starting a new round does not reset the chosen direction');
    const input = app.query('[data-moles-file]');
    input.files = [{name:'my-character.glb', size:100}]; input.emit('change');
    app.modelRequests[1].resolve({name:'my-character.glb', dispose() {}});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.characterYaw, 0, 'the shipped monster correction does not rotate unrelated GLB imports');
  } finally {app.cleanup();}
});

test('manual imports and restoring the example supersede pending shipped-model loads', async () => {
  for (const replacement of ['manual', 'example']) {
    const app = mount({initialCharacter:{buffer:new ArrayBuffer(80), name:'shipped.glb', source:'Tripo'}});
    const shipped = {name:'shipped.glb', released:0, dispose() {this.released++;}};
    try {
      assert.equal(app.modelRequests.length, 1);
      if (replacement === 'manual') {
        const input = app.query('[data-moles-file]');
        input.files = [{name:'mine.glb', size:100}]; input.emit('change');
      } else app.click('character-reset');
      assert.equal(app.modelRequests[0].signal.aborted, true);
      app.modelRequests[0].resolve(shipped);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(shipped.released, 1);
      assert.doesNotMatch(app.query('[data-moles-character-name]').textContent, /shipped/);
      if (replacement === 'manual') {
        app.modelRequests[1].resolve({name:'mine.glb', dispose() {}});
        await new Promise(resolve => setImmediate(resolve));
        assert.match(app.query('[data-moles-character-name]').textContent, /mine\.glb/);
      }
    } finally {app.cleanup();}
  }
});

test('shipped model failure, unavailable WebGL and disposal keep the example playable without leaks', async () => {
  const initialCharacter = {buffer:new ArrayBuffer(80), name:'shipped.glb', source:'Tripo'};
  const failed = mount({initialCharacter});
  try {
    assert.equal(failed.modelRequests.length, 1);
    failed.modelRequests[0].reject(new Error('invalid GLB'));
    await new Promise(resolve => setImmediate(resolve));
    assert.match(failed.query('[data-moles-character-status]').textContent, /invalid GLB/);
    assert.match(failed.query('[data-moles-character-name]').textContent, /示例角色/);
    failed.click('start');
    assert.equal(failed.root.dataset.phase, 'playing');
  } finally {failed.cleanup();}
  const fallback = mount({fallback:true, initialCharacter});
  assert.equal(fallback.modelRequests.length, 0);
  fallback.cleanup();
  const late = mount({initialCharacter});
  assert.equal(late.modelRequests.length, 1);
  late.cleanup();
  assert.equal(late.modelRequests[0].signal.aborted, true);
  const asset = {name:'shipped.glb', released:0, dispose() {this.released++;}};
  late.modelRequests[0].resolve(asset);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(asset.released, 1);
});
