import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as mechanics from '../src/ride-state.js';

function mountBoundary(options = {}, {deferAsset = false, audio = null, sceneUnavailable = false} = {}) {
  const listenerMaps = [];
  function events(target = {}) {
    const listeners = new Map(); listenerMaps.push(listeners);
    return Object.assign(target, {
      addEventListener(type, fn, config = {}) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(fn);
        if (config.signal) {
          setMaxListeners(0, config.signal);
          config.signal.addEventListener('abort', () => listeners.get(type).delete(fn), {once: true});
        }
      },
      removeEventListener(type, fn) {listeners.get(type)?.delete(fn);},
      async emit(type, properties = {}) {
        const event = {type, target: this, preventDefault() {this.defaultPrevented = true;}, ...properties};
        await Promise.all([...listeners.get(type) ?? []].map(fn => fn(event))); return event;
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
    remove() {if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;}
    contains(child) {for (let node = child; node; node = node.parentElement) if (node === this) return true; return false;}
    focus() {for (let node = this; node; node = node.parentElement) if (node.hidden) return; doc.activeElement = this;}
    getBoundingClientRect() {return {left: 0, top: 0, width: 960, height: 620};}
    setPointerCapture(id) {this.captures.add(id);}
    hasPointerCapture(id) {return this.captures.has(id);}
    releasePointerCapture(id) {this.captures.delete(id);}
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attr) return attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2];
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) {for (let node = this; node; node = node.parentElement) if (selector.split(',').some(part => node.matches(part.trim()))) return node; return null;}
    querySelectorAll(selector) {return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
  }
  let now = 0, sequence = 0, state, resolveAsset, exited = 0;
  const frames = new Map(), inputs = [], pushes = [], assets = [], trees = [], riders = [], announcements = [];
  const disposed = {scene: 0, observer: 0};
  const pending = new Promise(resolve => {resolveAsset = resolve;});
  const win = events({
    AudioContext: audio?.AudioContext,
    matchMedia: () => ({matches: false}),
    requestAnimationFrame(fn) {frames.set(++sequence, fn); return sequence;},
    cancelAnimationFrame(id) {frames.delete(id);},
    ResizeObserver: class {observe() {} disconnect() {disposed.observer++;}},
  });
  doc.defaultView = win; doc.createElement = tag => new Element(tag);
  const source = readFileSync(new URL('../src/ride-experience.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replaceAll('export function ', 'function ');
  const context = vm.createContext({AbortController, console: {...console, warn() {}}, imports: {
    './ride-state.js': {...mechanics,
      createRideState(config) {state = mechanics.createRideState(config); return state;},
      stepRide(next, input, dt) {inputs.push({...input}); mechanics.stepRide(next, input, dt);},
      pushRide(next, side) {const hit = mechanics.pushRide(next, side); pushes.push({side, hit}); return hit;},
    },
    './ride-scene.js': {createRideScene: () => {
      if (sceneUnavailable) throw new Error('WebGL unavailable');
      return {
      render(next) {state = next;}, resize() {}, dispose() {disposed.scene++;},
      setTripoVehicle(buffer, config) {assets.push({buffer, config}); return deferAsset ? pending : Promise.resolve(true);},
      setTripoTree(buffer, config) {trees.push({buffer, config}); return deferAsset ? pending : Promise.resolve(true);},
      setTripoRider(buffer, config) {riders.push({buffer, config}); return deferAsset ? pending : Promise.resolve(true);},
      getPlayerLabelPosition() {return {x: 400, y: 320, visible: true};},
    };}},
  }});
  vm.runInContext(source, context);
  const container = new Element('main');
  const cleanup = context.mountRide(container, {onExit() {exited++;}, onAnnounce(message) {announcements.push(message);}, ...options});
  const root = container.children[0];
  const query = selector => {const element = root.querySelector(selector); assert.ok(element, `missing ${selector}`); return element;};
  return {
    root, container, query, cleanup, win, doc, frames, inputs, pushes, assets, trees, riders, resolveAsset, disposed, announcements,
    createAudio: context.createRideAudio,
    get state() {return state;}, get exited() {return exited;},
    get listenerCount() {return listenerMaps.reduce((sum, map) => sum + [...map.values()].reduce((n, set) => n + set.size, 0), 0);},
    click(action) {return root.emit('click', {target: query(`[data-r="${action}"]`), detail: 0});},
    key(type, key, extra = {}) {return root.emit(type, {target: root, key, code: key === ' ' ? 'Space' : key, ...extra});},
    touch(type, control, pointerId = 7) {return root.emit(type, {target: query(`[data-ride-control="${control}"]`), pointerId, button: 0});},
    advance(ms) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 1000 / 60);
        const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now));
      }
    },
  };
}
function mounted(t, options, boundary) {const app = mountBoundary(options, boundary); t.after(app.cleanup); return app;}
const flush = async () => {for (let index = 0; index < 6; index++) await Promise.resolve();};

test('one start begins real riding; steering, boost and brake change actual simulation', async t => {
  const app = mounted(t);
  const ready = structuredClone(app.state); app.advance(1000); assert.deepEqual(app.state, ready);
  await app.click('start'); app.advance(3500);
  assert.equal(app.state.phase, 'running'); assert.ok(app.state.speed > 10 && app.state.distance > 20);
  const lateral = app.state.lateral;
  await app.touch('pointerdown', 'left'); app.advance(350); await app.touch('pointerup', 'left');
  assert.ok(app.state.lateral < lateral); assert.equal(app.query('[data-ride-control="left"]').captures.size, 0);
  await app.key('keydown', 'Shift'); app.advance(1100); await app.key('keyup', 'Shift');
  // The real engine can briefly disable boost while recovering from a rider impact.
  assert.ok(app.state.stamina < .95);
  const speed = app.state.speed;
  await app.touch('pointerdown', 'brake'); app.advance(1100); await app.touch('pointerup', 'brake');
  assert.ok(app.state.speed < speed);
  assert.ok(Number(app.query('[data-ride-speed]').textContent) >= 0);
});

test('pause and backgrounding freeze all physics and cancel captures/repeating held keys', async t => {
  const app = mounted(t);
  await app.click('start'); await app.key('keydown', 'd'); await app.touch('pointerdown', 'boost'); app.advance(500);
  await app.click('pause');
  assert.equal(app.query('[data-ride-control="boost"]').captures.size, 0); assert.equal(app.frames.size, 0);
  const frozen = structuredClone(app.state); app.advance(1500); assert.deepEqual(app.state, frozen);
  await app.click('resume'); await app.key('keydown', 'd', {repeat: true}); app.advance(200);
  assert.equal(app.inputs.at(-1).steer, 0); assert.equal(app.inputs.at(-1).boost, false);
  await app.win.emit('blur'); app.doc.hidden = true; await app.doc.emit('visibilitychange');
  const background = structuredClone(app.state);
  app.doc.hidden = false; await app.doc.emit('visibilitychange'); app.advance(1000);
  assert.deepEqual(app.state, background); assert.equal(app.frames.size, 0);
});

test('real race completes, result stops its clock, retry resets and free riding continues past the finish distance', async t => {
  const app = mounted(t);
  await app.click('start');
  for (let second = 0; second < 240 && app.state.distance < app.state.config.raceLength - 190; second++) app.advance(1000);
  const remaining = Math.ceil(app.state.config.raceLength - app.state.distance);
  assert.ok(remaining > 0 && remaining <= 200);
  assert.equal(app.query('[data-ride-distance]').textContent, `终点还剩 ${remaining} m`);
  await app.click('pause');
  const cue = app.query('[data-ride-distance]').textContent; app.advance(2000);
  assert.equal(app.query('[data-ride-distance]').textContent, cue);
  await app.click('resume'); app.advance(240000);
  assert.equal(app.state.phase, 'finished'); assert.ok(app.state.distance >= app.state.config.raceLength);
  assert.equal(app.query('.ride-result').hidden, false); assert.equal(app.frames.size, 0);
  assert.equal(app.root.dataset.result, app.state.resultReason);
  assert.match(app.query('[data-ride-result-detail]').textContent, /目标前 3/);
  assert.ok(app.doc.activeElement === app.query('.ride-result').querySelector('button'), 'finish focuses the now-visible retry action');
  const old = app.state;
  await app.click('retry'); assert.notEqual(app.state, old);
  assert.equal(app.state.phase, 'running'); assert.equal(app.state.distance, 0); assert.equal(app.state.impacts, 0);
  await app.click('pause');
  const select = app.query('[data-ride-mode]'); select.value = 'practice'; await app.root.emit('change', {target: select});
  await app.click('start'); app.advance(240000);
  assert.equal(app.state.mode, 'practice'); assert.equal(app.state.phase, 'running');
  assert.ok(app.state.distance > app.state.config.raceLength);
  assert.ok(!app.query('[data-ride-distance]').textContent.includes('终点'));
});

test('real keyboard gap selection, paced boost and side pushes can reach the podium and display its result', async t => {
  const app = mounted(t), held = new Set();
  let steerDebt = 0, brakeDebt = 0;
  await app.click('start');
  // Read visible road conditions and pulse the same binary keys a player uses.
  // No state or physics mutation: this covers the complete controller input path.
  for (let frame = 0; frame < 9000 && app.state.phase === 'running'; frame++) {
    const s = app.state, nearby = s.obstacles.filter(o => o.distance > s.distance - 2 && o.distance < s.distance + 45);
    const row = nearby.filter(o => o.distance === nearby[0]?.distance);
    const cost = lane => Math.abs(lane - s.lateral) * .4 +
      row.reduce((sum, o) => sum + (Math.abs(lane - o.lateral) < (o.type === 'barrier' ? 1.5 : 1) ? 20 : 0), 0) +
      s.opponents.reduce((sum, r) => sum + (r.fallTime === 0 && Math.abs(r.distance - s.distance) < 6 &&
        Math.abs(lane - r.lateral) < .9 ? 4 : 0), 0);
    const lane = [-2.8, -1.4, 0, 1.4, 2.8].sort((a, b) => cost(a) - cost(b))[0];
    const curve = mechanics.rideRoadAt(s.distance).curve, rate = (2 + s.speed * .1) * Math.min(1, s.speed / 8) * s.grip;
    const steer = Math.max(-1, Math.min(1, (lane - s.lateral) * 1.1 - curve * s.speed ** 2 * s.config.curveForce / Math.max(.1, rate)));
    let aheadCurve = 0;
    for (let offset = 0; offset <= 40; offset += 10) aheadCurve = Math.max(aheadCurve, Math.abs(mechanics.rideRoadAt(s.distance + offset).curve));
    const safeSpeed = Math.sqrt(s.config.gripLimit / Math.max(.00001, aheadCurve));
    steerDebt += Math.round(steer * 4) / 4;
    const turn = steerDebt >= .5 ? 1 : steerDebt <= -.5 ? -1 : 0; steerDebt -= turn;
    brakeDebt += Math.max(0, Math.min(.55, (s.speed - safeSpeed + .3) / 16));
    const brake = brakeDebt >= .5; brakeDebt -= Number(brake);
    const next = new Set();
    if (turn) next.add(turn < 0 ? 'a' : 'd');
    if (brake) next.add('s');
    if (s.elapsed % 10 < 3 && aheadCurve < .0027) next.add('Shift');
    if (s.fallTime > 0) {next.clear(); steerDebt = brakeDebt = 0;}
    for (const key of held) if (!next.has(key)) await app.key('keyup', key);
    for (const key of next) if (!held.has(key)) await app.key('keydown', key);
    held.clear(); next.forEach(key => held.add(key));
    for (const rival of s.opponents) if (Math.abs(rival.distance - s.distance) < 3.2 && Math.abs(rival.lateral - s.lateral) > .35) {
      const key = rival.lateral < s.lateral ? 'q' : 'e'; await app.key('keydown', key); await app.key('keyup', key);
    }
    app.advance(1000 / 60);
  }
  assert.equal(app.state.phase, 'finished'); assert.equal(app.state.resultReason, 'podium');
  assert.ok(app.state.rank <= app.state.goalRank && app.state.knockdowns > 0);
  assert.equal(app.root.dataset.result, 'podium');
  assert.match(app.query('[data-ride-result-title]').textContent, /领奖台/);
  assert.equal(app.frames.size, 0);
});

test('a side push is an edge-triggered real engine action, with no phantom hits out of range', async t => {
  const app = mounted(t);
  await app.click('start');
  await app.key('keydown', 'q'); await app.key('keydown', 'q', {repeat: true});
  assert.deepEqual(app.pushes, [{side: -1, hit: false}]);
  await app.key('keyup', 'q');
  let held = '';
  for (let index = 0; index < 500 && !app.pushes.some(push => push.hit); index++) {
    const rival = app.state.opponents[0], desired = Math.max(-3.5, Math.min(3.5, rival.lateral + 1.05));
    const key = app.state.lateral < desired - .1 ? 'd' : app.state.lateral > desired + .1 ? 'a' : '';
    if (held !== key) {if (held) await app.key('keyup', held); if (key) await app.key('keydown', key); held = key;}
    if (Math.abs(rival.distance - app.state.distance) <= 3.1 && app.state.lateral - rival.lateral > .4 && app.state.lateral - rival.lateral < 1.7) {
      await app.key('keydown', 'q'); await app.key('keyup', 'q');
    }
    app.advance(40);
  }
  assert.ok(app.pushes.some(push => push.hit), 'steering alongside a real rival should allow an actual push');
  assert.ok(app.state.stamina < 1);
});

test('a real knockdown releases held controls, freezes under pause and remounts without stale boost', async t => {
  const app = mounted(t);
  await app.click('start'); await app.touch('pointerdown', 'boost');
  for (let index = 0; index < 1200 && !(app.state.fallTime > 0); index++) app.advance(50);
  assert.ok(app.state.fallTime > 0, 'the real road/AI must produce a knockdown');
  assert.equal(app.query('[data-ride-control="boost"]').captures.size, 0);
  assert.equal(app.query('[data-ride-control="boost"]').disabled, true);
  await app.click('pause'); const frozen = structuredClone(app.state);
  app.advance(2000); assert.deepEqual(app.state, frozen);
  await app.click('resume'); await app.key('keydown', 'Shift', {repeat: true});
  for (let index = 0; index < 250 && app.state.fallTime > 0; index++) app.advance(20);
  assert.equal(app.state.fallTime, 0);
  assert.equal(app.query('[data-ride-control="boost"]').disabled, false);
  app.advance(30); assert.equal(app.inputs.at(-1).boost, false);
});

test('model readiness waits for success without technical HUD labels; unmount cancels late work and inputs', async t => {
  const tripoVehicle = {buffer: new ArrayBuffer(12), name: 'Touring motorcycle', yaw: Math.PI};
  const early = mounted(t, {tripoVehicle}); early.cleanup(); await flush(); assert.equal(early.assets.length, 0);
  const app = mounted(t, {tripoVehicle}, {deferAsset: true});
  await flush(); assert.equal(app.assets.length, 1); assert.equal(app.root.dataset.tripoVehicle, undefined);
  app.resolveAsset(true); await flush();
  assert.equal(app.root.dataset.tripoVehicle, 'ready');
  assert.ok(app.root.querySelector('.ride-asset-badge') === null);
  assert.ok(!app.root.textContent.includes('Tripo 3D') && !app.root.textContent.includes('Touring motorcycle'));
  await app.click('start'); await app.touch('pointerdown', 'right');
  await app.click('exit'); assert.equal(app.exited, 1);
  assert.equal(app.query('[data-ride-control="right"]').captures.size, 0);
  assert.equal(app.frames.size, 0); assert.equal(app.listenerCount, 0); assert.equal(app.container.children.length, 0);
  app.cleanup(); assert.deepEqual(app.disposed, {scene: 1, observer: 1});
  const late = mounted(t, {tripoVehicle}, {deferAsset: true}); await flush(); late.cleanup(); late.resolveAsset(true); await flush();
  assert.equal(late.root.dataset.tripoVehicle, undefined);
});

function audioBoundary({deferResume = false} = {}) {
  const contexts = [];
  class AudioContext {
    constructor() {
      this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 128;
      this.destination = {}; this.nodes = []; this.resumes = this.suspends = this.closes = 0;
      contexts.push(this);
    }
    node(kind) {
      const parameter = () => ({value: 0, setTargetAtTime(value) {this.value = value;},
        setValueAtTime(value) {this.value = value;}, exponentialRampToValueAtTime(value) {this.value = value;}});
      const node = {kind, starts: [], stops: [], disconnected: false, connections: [],
        gain: parameter(), frequency: parameter(), Q: parameter(),
        connect(target) {this.connections.push(target);}, disconnect() {this.disconnected = true;},
        start(at = 0) {this.starts.push(at);}, stop(at = 0) {this.stops.push(at);}};
      this.nodes.push(node); return node;
    }
    createGain() {return this.node('gain');}
    createOscillator() {return this.node('oscillator');}
    createBufferSource() {return this.node('buffer-source');}
    createBiquadFilter() {return this.node('filter');}
    createBuffer(_channels, count) {return {getChannelData: () => new Float32Array(count)};}
    resume() {
      this.resumes++;
      if (!deferResume) {this.state = 'running'; return Promise.resolve();}
      return new Promise(resolve => {this.completeResume = () => {if (this.state !== 'closed') this.state = 'running'; resolve();};});
    }
    suspend() {this.suspends++; this.state = 'suspended'; return Promise.resolve();}
    close() {this.closes++; this.state = 'closed'; return Promise.resolve();}
  }
  return {AudioContext, contexts};
}

test('sound is silent before Start, follows real driving, and pause/background/mute/dispose stop it', async t => {
  const audio = audioBoundary(), app = mounted(t, {}, {audio});
  assert.equal(audio.contexts.length, 0);
  assert.equal(app.query('[data-r="sound"]').getAttribute('aria-pressed'), 'false');
  await app.click('sound'); assert.equal(audio.contexts.length, 0, 'arming sound must not start the motor on the ready screen');
  await app.click('start'); await flush();
  const context = audio.contexts[0], engine = context.nodes.find(node => node.kind === 'oscillator');
  const windSource = context.nodes.find(node => node.kind === 'buffer-source' && node.loop);
  const windGain = windSource.connections[0].connections[0];
  const pitch = engine.frequency.value, wind = windGain.gain.value;
  app.advance(2800);
  assert.ok(engine.frequency.value !== pitch); assert.ok(windGain.gain.value > wind);
  assert.equal(context.state, 'running');
  await app.click('pause'); assert.equal(context.state, 'suspended');
  const resumes = context.resumes;
  app.doc.hidden = true; await app.doc.emit('visibilitychange');
  app.doc.hidden = false; await app.doc.emit('visibilitychange'); await flush();
  assert.equal(context.resumes, resumes); assert.equal(context.state, 'suspended');
  await app.click('resume'); await flush(); assert.equal(context.state, 'running');
  await app.click('sound'); assert.equal(context.state, 'suspended');
  app.advance(200); assert.equal(context.state, 'suspended');
  await app.click('sound'); await flush(); assert.equal(context.state, 'running');
  await app.win.emit('blur'); assert.equal(context.state, 'suspended');
  app.cleanup(); assert.equal(context.state, 'closed'); assert.equal(context.closes, 1);
  assert.ok(context.nodes.every(node => node.disconnected));
  assert.ok(context.nodes.filter(node => node.kind === 'oscillator' || node.kind === 'buffer-source').every(node => node.stops.length > 0));
});

test('Start enables FX once, remembers intentional mute, and labels only the player without asset filenames', async t => {
  const audio = audioBoundary(), app = mounted(t, {
    tripoTree: {buffer: new ArrayBuffer(12), name: 'pine.game.glb'},
    tripoRider: {buffer: new ArrayBuffer(12), name: 'rider.game.glb'},
  }, {audio});
  assert.equal(audio.contexts.length, 0);
  await app.click('start'); await flush();
  assert.equal(audio.contexts.length, 1); assert.equal(audio.contexts[0].state, 'running');
  assert.equal(app.trees.length, 1); assert.equal(app.riders.length, 1);
  assert.ok(app.root.querySelector('.ride-asset-badge') === null);
  assert.equal(app.root.dataset.tripoTree, 'ready'); assert.equal(app.root.dataset.tripoRider, 'ready');
  const label = app.query('.ride-player-label');
  assert.equal(label.textContent, 'Tripo · 3'); assert.equal(label.hidden, false); assert.equal(label.style.left, '400px');
  assert.equal(app.root.querySelectorAll('.ride-player-label').length, 1);
  await app.click('sound'); await app.click('pause'); await app.click('resume'); await flush();
  assert.equal(audio.contexts[0].state, 'suspended');
  await app.click('retry'); await flush(); assert.equal(audio.contexts[0].state, 'suspended');
  const late = mounted(t, {tripoTree: {buffer: new ArrayBuffer(12)}, tripoRider: {buffer: new ArrayBuffer(12)}});
  late.cleanup(); await flush(); assert.equal(late.trees.length + late.riders.length, 0);
});

test('original impact/push voices are bounded and cancelled; a delayed audio resume cannot bypass pause', async t => {
  const app = mounted(t), boundary = audioBoundary(), audio = app.createAudio(boundary);
  t.after(audio.dispose);
  await audio.enable(); await audio.resume(); audio.update({speed: 20, throttle: 1});
  const context = boundary.contexts[0];
  for (let index = 0; index < 30; index++) audio.play(index % 2 ? 'push' : 'impact');
  const voices = context.nodes.filter(node => node.kind === 'buffer-source' && !node.loop);
  assert.equal(voices.length, 6); assert.ok(voices.every(voice => voice.stops[0] > 0));
  assert.notEqual(voices[0].connections[0].frequency.value, voices[1].connections[0].frequency.value);
  audio.pause();
  assert.ok(voices.every(voice => voice.stops.at(-1) === 0 && voice.disconnected && voice.onended === null));
  assert.equal(context.state, 'suspended');
  const delayedBoundary = audioBoundary({deferResume: true}), delayed = app.createAudio(delayedBoundary);
  t.after(delayed.dispose);
  await delayed.enable(); const pending = delayed.resume();
  delayed.pause(); delayedBoundary.contexts[0].completeResume(); await pending;
  assert.equal(delayedBoundary.contexts[0].state, 'suspended');
  const lateResume = delayed.resume(); delayed.dispose(); delayedBoundary.contexts[0].completeResume(); await lateResume;
  assert.equal(delayedBoundary.contexts[0].state, 'closed');
});

test('finishing plays a short original chime with no motor, then suspends; mute, pause and dispose cancel it', async t => {
  const app = mounted(t), boundary = audioBoundary(), audio = app.createAudio(boundary);
  t.after(audio.dispose);
  await audio.enable(); await audio.resume(); audio.update({speed: 33, throttle: 1});
  const context = boundary.contexts[0];
  assert.equal(typeof audio.finish, 'function');
  audio.finish({podium: true});
  const tones = context.nodes.filter(node => node.kind === 'oscillator' && node.frequency.value > 300);
  assert.equal(tones.length, 3); assert.equal(context.state, 'running');
  assert.ok(tones.every(tone => tone.stops[0] <= context.currentTime + .8));
  const motorFilter = context.nodes.find(node => node.kind === 'filter' && node.type === 'lowpass');
  assert.equal(motorFilter.connections[0].gain.value, 0, 'finish must stop the engine immediately');
  tones.forEach(tone => tone.onended());
  assert.equal(context.state, 'suspended');
  await audio.resume(); audio.finish();
  const active = context.nodes.filter(node => node.kind === 'oscillator' && node.frequency.value > 300 && !node.disconnected);
  audio.pause(); assert.ok(active.every(tone => tone.disconnected && tone.onended === null));
  assert.equal(context.state, 'suspended');
  audio.disable(); const count = context.nodes.length; audio.finish();
  assert.equal(context.nodes.length, count, 'muted finish must not allocate or resume audio');
  audio.dispose(); assert.equal(context.state, 'closed');
});

test('without WebGL the same playable engine displays approaching collision obstacles', async t => {
  const app = mounted(t, {}, {sceneUnavailable: true});
  assert.equal(app.query('.ride-fallback').hidden, false);
  await app.click('start');
  for (let time = 0; time < 200 && app.state.distance < 55; time++) app.advance(50);
  const expected = app.state.obstacles.filter(obstacle => obstacle.distance > app.state.distance - 12 && obstacle.distance < app.state.distance + 90);
  assert.ok(expected.length > 0);
  const markers = app.query('.ride-fallback-obstacles').children.filter(element => !element.hidden);
  assert.equal(markers.length, expected.length);
  assert.ok(markers.every(marker => Number.parseFloat(marker.style.width) > 0));
  await app.click('pause'); const frozen = structuredClone(app.state);
  app.advance(1000); assert.deepEqual(app.state, frozen);
});
