import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as rules from '../src/dive-state.js';

function mount({failScene = false, pose, ...options} = {}) {
  function eventTarget(object = {}) {
    const events = new Map();
    object.addEventListener = (name, fn, {signal} = {}) => {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(fn);
      if (signal) {setMaxListeners(0, signal); signal.addEventListener('abort', () => events.get(name).delete(fn), {once:true});}
    };
    object.emit = (name, detail = {}) => {
      const event = {target:object, preventDefault() {this.defaultPrevented = true;}, stopPropagation() {}, ...detail};
      for (const fn of [...events.get(name) || []]) fn(event);
      return event;
    };
    return object;
  }
  const frames = new Map(), notices = [], requests = [];
  let now = 0, serial = 0, rendered, released = 0, observed = 0, photos = 0;
  const doc = eventTarget({hidden:false});
  const win = eventTarget({
    AbortController, performance:{now:() => now}, matchMedia:() => ({matches:false}),
    requestAnimationFrame(fn) {frames.set(++serial, fn); return serial;},
    cancelAnimationFrame(id) {frames.delete(id);},
    ResizeObserver:class {observe() {observed++;} disconnect() {observed--;}},
  });
  doc.defaultView = win;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {};
      this.style = {setProperty() {}}; this.ownerDocument = doc; this._text = ''; this.open = false; this.captures = new Set();
      this.classList = {add:(...names) => {this.className += ` ${names.join(' ')}`;},
        remove:(name) => {this.className = this.className.split(' ').filter(n => n !== name).join(' ');}};
      eventTarget(this);
    }
    set className(value) {this.attributes.class = value;}
    get className() {return this.attributes.class || '';}
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_,c) => c.toUpperCase())] = String(value);
      if (key === 'hidden' || key === 'disabled') this[key] = true;
    }
    getAttribute(key) {return this.attributes[key];}
    removeAttribute(key) {delete this.attributes[key]; if (key === 'src') this.src = '';}
    set innerHTML(value) {
      this.children = []; this._text = ''; const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1)._text += token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const node = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) node.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).append(node);
        if (!['BR','INPUT','IMG','HR'].includes(node.tagName)) stack.push(node);
      }
    }
    get textContent() {return this._text + this.children.map(child => child.textContent).join('');}
    set textContent(value) {this._text = String(value); this.children = [];}
    append(node) {node.parentElement = this; this.children.push(node);}
    remove() {this.parentElement.children = this.parentElement.children.filter(node => node !== this);}
    matches(selector) {
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      return attr ? attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2] : this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) {return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    closest(selector) {
      for (let node = this; node; node = node.parentElement) if (selector.split(',').some(item => node.matches(item.trim()))) return node;
      return null;
    }
    contains(node) {return node === this || this.children.some(child => child.contains(node));}
    focus() {doc.activeElement = this;}
    getBoundingClientRect() {return {width:320,height:500,left:0,top:0};}
    setPointerCapture(id) {this.captures.add(id);}
    hasPointerCapture(id) {return this.captures.has(id);}
    releasePointerCapture(id) {this.captures.delete(id);}
    showModal() {this.open = true;}
    close() {this.open = false; this.emit('close');}
  }
  doc.createElement = tag => new Element(tag); doc.body = new Element('body'); doc.activeElement = doc.body;
  const installed = new Map();
  const scene = {resize() {}, render(state) {rendered = state;},
    capture() {photos++; return 'data:image/jpeg;base64,cGhvdG8=';},
    setTripoAsset(kind, asset) {installed.get(kind)?.dispose(); installed.set(kind, asset); return true;},
    dispose() {released++; installed.forEach(asset => asset.dispose()); installed.clear();},
  };
  const audio = {available:true, plays:0, captures:0, pauses:0, disposed:0,
    async play() {this.plays++; return true;}, capture() {this.captures++;},
    pause() {this.pauses++;}, dispose() {this.disposed++;}};
  const code = readFileSync(new URL('../src/dive-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm, (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountDive', 'function mountDive');
  const context = vm.createContext({AbortController, console, imports:{
    './dive-state.js':{...rules, createDiveState() {return Object.assign(rules.createDiveState(), pose || {});}},
    './dive-scene.js':{createDiveScene() {if (failScene) throw new Error('WebGL unavailable'); return scene;}},
    './dive-audio.js':{createDiveAudio:() => audio},
    './moles-character.js':{loadMolesCharacter(file, {signal}) {return new Promise((resolve,reject) => requests.push({file,signal,resolve,reject}));}},
  }});
  vm.runInContext(code, context);
  const container = new Element('main');
  const cleanup = context.mountDive(container, {onAnnounce:message => notices.push(message), ...options});
  const root = container.children[0], query = selector => {const element = root.querySelector(selector); assert.ok(element, selector); return element;};
  return {root, query, cleanup, container, win, doc, frames, requests, notices, audio,
    get state() {return rendered;}, get released() {return released;}, get observed() {return observed;}, get photos() {return photos;},
    click(action) {root.emit('click', {target:query(`[data-dive-action="${action}"]`), detail:0});},
    key(key, type = 'keydown', detail = {}) {return root.emit(type, {key, target:root, ...detail});},
    advance(ms) {
      const end = now + ms;
      while (now < end) {now = Math.min(end, now + 1000 / 60); const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));}
    },
  };
}

test('start, keyboard swimming, blur and resume do not retain movement or hidden elapsed time', () => {
  const app = mount();
  try {
    assert.equal(app.frames.size, 0);
    app.click('primary'); app.key('w'); app.advance(1000);
    assert.ok(app.state.position.z < 2);
    app.win.emit('blur');
    const frozen = structuredClone(app.state);
    app.advance(90000);
    assert.deepEqual(structuredClone(app.state), frozen);
    assert.equal(app.frames.size, 0);
    app.click('primary'); app.advance(500);
    assert.ok(Math.abs(app.state.position.z - frozen.position.z) < .001);
    assert.ok(app.state.elapsed < 2);
    const input = app.doc.createElement('input');
    assert.equal(app.key('q', 'keydown', {target:input}).defaultPrevented, undefined);
  } finally {app.cleanup();}
});

test('drag look and held touch controls release capture on pause, lost capture and disposal', () => {
  const app = mount();
  try {
    app.click('primary');
    const viewport = app.query('.dive-viewport'), move = app.query('[data-dive-control="forward"]');
    viewport.emit('pointerdown', {pointerId:1, button:0, clientX:100, clientY:100});
    viewport.emit('pointermove', {pointerId:1, clientX:150, clientY:90});
    assert.ok(app.state.yaw < 0);
    assert.equal(viewport.hasPointerCapture(1), true);
    move.emit('pointerdown', {pointerId:2, button:0});
    app.advance(400);
    const before = app.state.elapsed;
    app.click('pause');
    assert.equal(viewport.hasPointerCapture(1), false);
    assert.equal(move.hasPointerCapture(2), false);
    app.advance(3000);
    assert.equal(app.state.elapsed, before);
    app.click('primary');
    move.emit('pointerdown', {pointerId:3, button:0});
    move.emit('lostpointercapture', {pointerId:3});
    app.advance(100);
    const point = structuredClone(app.state.position);
    app.advance(300);
    assert.deepEqual(app.state.position, point);
    viewport.emit('pointerdown', {pointerId:4, button:0, clientX:0, clientY:0});
    app.cleanup();
    assert.equal(viewport.hasPointerCapture(4), false);
    assert.equal(app.frames.size, 0);
    assert.equal(app.released, 1);
    assert.equal(app.observed, 0);
  } finally {app.cleanup();}
});

test('photo preview and gallery contain the actual capture; surface preserves it and restart clears it', () => {
  const point = rules.diveTargetAt('arch', 0);
  const app = mount({pose:{position:{...point,z:point.z + 12},yaw:0,pitch:0}});
  try {
    app.click('primary'); app.click('primary');
    assert.equal(app.state.discoveries.length, 1);
    assert.equal(app.photos, 1);
    assert.match(app.query('[data-dive-preview]').src, /^data:image\/jpeg/);
    assert.equal(app.query('[data-dive-download]').href, app.query('[data-dive-preview]').src);
    app.click('gallery');
    assert.equal(app.state.phase, 'paused');
    assert.equal(app.query('.dive-gallery').open, true);
    app.key('p'); assert.equal(app.state.phase, 'paused', 'shortcuts cannot resume behind a dialog');
    app.click('close-gallery'); app.click('surface');
    assert.equal(app.state.discoveries.length, 1);
    assert.equal(app.state.position.y, -1.1);
    app.click('restart');
    assert.equal(app.state.phase, 'ready');
    assert.equal(app.state.discoveries.length, 0);
    assert.equal(app.query('[data-dive-preview]').src, '');
  } finally {app.cleanup();}
});

test('the framing HUD and shutter both use the current viewport after a phone rotation', () => {
  const point = rules.diveTargetAt('arch');
  const app = mount({pose:{position:{...point,z:point.z + 10},yaw:0,pitch:0}});
  try {
    app.click('primary');
    assert.equal(app.root.dataset.framed, 'false', 'the arch is cropped on the portrait phone');
    app.click('primary');
    assert.equal(app.state.discoveries.length, 0, 'a cropped photo must not count despite aiming at its centre');
    assert.equal(app.photos, 1, 'a free photograph can still be kept as a preview');
    app.query('.dive-viewport').getBoundingClientRect = () => ({width:800,height:500});
    app.win.emit('resize');
    assert.equal(app.root.dataset.framed, 'true');
    app.advance(1200); app.click('primary');
    assert.equal(app.state.discoveries[0]?.id, 'arch', 'the same subject now fits the wider frame');
  } finally {app.cleanup();}
});

test('assets install only while mounted and loading failure keeps a playable procedural subject', async () => {
  const buffer = new ArrayBuffer(80);
  const app = mount({tripoAssets:{turtle:{buffer,name:'turtle.glb'},coral:{buffer,name:'coral.glb'}}});
  const asset = {name:'turtle.glb', released:0, dispose() {this.released++;}};
  try {
    assert.equal(app.requests.length, 2);
    assert.equal(app.query('.dive-viewport').contains(app.query('[data-dive-models]')), false);
    assert.equal(app.query('.dive-settings').contains(app.query('[data-dive-models]')), true);
    assert.equal(await app.requests[0].file.arrayBuffer(), buffer);
    assert.doesNotMatch(app.query('[data-dive-models]').textContent, /Tripo 海龟/);
    app.requests[0].resolve(asset);
    app.requests[1].reject(new Error('invalid coral'));
    await new Promise(resolve => setImmediate(resolve));
    assert.match(app.query('[data-dive-models]').textContent, /Tripo 海龟/);
    app.click('primary'); assert.equal(app.state.phase, 'running');
  } finally {app.cleanup();}
  assert.equal(asset.released, 1);
  const late = mount({tripoAssets:{turtle:{buffer,name:'turtle.glb'}}});
  late.cleanup(); late.cleanup();
  assert.equal(late.requests[0].signal.aborted, true);
  const obsolete = {released:0,dispose() {this.released++;}};
  late.requests[0].resolve(obsolete);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(obsolete.released, 1);
  assert.equal(late.container.children.length, 0);
  const fallback = mount({failScene:true,tripoAssets:{turtle:{buffer,name:'turtle.glb'}}});
  assert.equal(fallback.requests.length, 0);
  assert.equal(fallback.frames.size, 0);
  assert.equal(fallback.root.dataset.unavailable, 'true');
  fallback.cleanup();
});

test('all reef asset descriptors load independently and advertise only successfully installed models', async () => {
  const kinds = ['turtle','coral','manta','dolphin','clownfish','angelfish','seafan','tablecoral','anemone'];
  const tripoAssets = Object.fromEntries(kinds.map(kind => [kind, {buffer:new ArrayBuffer(80),name:`fixture-${kind}.glb`}]));
  const app = mount({tripoAssets});
  const installed = [];
  try {
    assert.equal(app.requests.length, kinds.length, 'every supplied reef species must reach the validated loader');
    assert.doesNotMatch(app.query('[data-dive-models]').textContent, /Tripo/);
    for (const request of [...app.requests].reverse()) {
      const kind = request.file.name.replace(/^fixture-/, '').replace(/\.glb$/, '');
      if (kind === 'seafan') {request.reject(new Error('fixture decode error')); continue;}
      const asset = {name:request.file.name, released:0, dispose() {this.released++;}};
      installed.push(asset); request.resolve(asset);
    }
    await new Promise(resolve => setImmediate(resolve));
    const provenance = app.query('[data-dive-models]').textContent;
    for (const label of ['海龟','珊瑚','蝠鲼','海豚','小丑鱼','神仙鱼','桌形珊瑚','海葵']) {
      assert.ok(provenance.includes(label), `${label} must be credited only after installation`);
    }
    assert.doesNotMatch(provenance, /Tripo 海扇/);
    assert.match(app.query('[data-dive-model-note]').textContent, /海扇/);
    assert.equal(app.query('.dive-viewport').contains(app.query('[data-dive-models]')), false);
    app.click('primary');
    assert.equal(app.state.phase, 'running', 'one failed asset cannot block swimming');
  } finally {app.cleanup();}
  for (const asset of installed) assert.equal(asset.released, 1);
});

test('late fish and reef imports after exit are disposed without reviving the old scene', async () => {
  const kinds = ['manta','dolphin','clownfish','angelfish','seafan','tablecoral','anemone'];
  const app = mount({tripoAssets:Object.fromEntries(kinds.map(kind =>
    [kind, {buffer:new ArrayBuffer(80),name:`fixture-${kind}.glb`}]))});
  try {
    assert.equal(app.requests.length, kinds.length);
    app.cleanup();
    const late = app.requests.map(request => {
      assert.equal(request.signal.aborted, true);
      const asset = {released:0, dispose() {this.released++;}};
      request.resolve(asset); return asset;
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.container.children.length, 0);
    assert.equal(app.frames.size, 0);
    assert.equal(app.released, 1);
    late.forEach(asset => assert.equal(asset.released, 1));
  } finally {app.cleanup();}
});

test('Continue closes settings and actually resumes; a focus move out of the game clears held keys', () => {
  const app = mount();
  try {
    app.click('primary'); app.key('w');
    const settings = app.query('.dive-settings');
    settings.open = true; settings.emit('toggle');
    assert.equal(app.state.phase, 'paused');
    app.click('primary');
    assert.equal(settings.open, false);
    assert.equal(app.state.phase, 'running');
    app.key('w'); app.advance(300);
    app.root.emit('focusout', {relatedTarget:app.doc.body});
    const frozen = structuredClone(app.state);
    app.advance(1000);
    assert.deepEqual(structuredClone(app.state), frozen);
  } finally {app.cleanup();}
});

test('music begins on the Start gesture, follows mute/pause and includes a camera sound', async () => {
  const app = mount();
  try {
    assert.equal(app.audio.plays, 0);
    app.click('primary');
    assert.equal(app.audio.plays, 1);
    app.click('primary');
    assert.equal(app.audio.captures, 1);
    app.click('sound');
    const plays = app.audio.plays, pauses = app.audio.pauses;
    app.win.emit('blur');
    assert.ok(app.audio.pauses > pauses);
    app.click('primary');
    assert.equal(app.audio.plays, plays, 'muted preference survives resume');
    app.click('sound');
    assert.equal(app.audio.plays, plays + 1);
    app.cleanup();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.audio.disposed, 1);
  } finally {app.cleanup();}
});
