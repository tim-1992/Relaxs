import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createReleaseState, resetRelease, applyReleaseImpulse, toppleRelease,
  stepRelease, beginReleaseDrag, moveReleaseDrag, endReleaseDrag,
  pauseRelease, resumeRelease, releaseShortcut, openWorry, setWorryText,
  crumpleWorry, tossWorry, finishWorry, closeWorry, resumeWorry,
} from '../src/release-state.js';
import {createReleaseAudio} from '../src/release-audio.js';
import {createReleaseScene} from '../src/release-scene.js';
import * as THREE from 'three';

test('reset restores a stable arrangement after impacts and dragging', () => {
  const state = createReleaseState();
  const original = structuredClone(state.bodies);
  assert.ok(state.bodies.length >= 7);
  toppleRelease(state);
  for (let i = 0; i < 90; i++) stepRelease(state, 1 / 60);
  assert.notDeepEqual(state.bodies, original);
  beginReleaseDrag(state, 'puff');
  moveReleaseDrag(state, 'puff', {x: 4, y: 4, z: 2});
  resetRelease(state);
  assert.deepEqual(state.bodies, original);
  for (let i = 0; i < 120; i++) stepRelease(state, 1 / 60);
  assert.deepEqual(state.bodies, original);
});

test('a tap jumps a toy and gravity eventually settles it on the table', () => {
  const state = createReleaseState();
  const body = state.bodies.find(item => item.id === 'puff');
  const floor = body.position.y;
  assert.equal(applyReleaseImpulse(state, 'puff', {x: 0, y: 6, z: 0}), true);
  stepRelease(state, .05);
  assert.ok(body.position.y > floor);
  for (let i = 0; i < 900; i++) stepRelease(state, 1 / 60);
  assert.ok(Math.abs(body.position.y - floor) < .02);
  assert.ok(body.sleeping);
  assert.deepEqual(body.velocity, {x: 0, y: 0, z: 0});
});

test('invalid impulses do not poison state and repeated throws stay bounded', () => {
  const state = createReleaseState();
  const before = structuredClone(state);
  assert.equal(applyReleaseImpulse(state, 'missing', {y: 5}), false);
  assert.equal(applyReleaseImpulse(state, 'puff', {x: NaN, y: Infinity, z: 0}), false);
  assert.deepEqual(state, before);
  for (let i = 0; i < 1200; i++) {
    if (i % 20 === 0) applyReleaseImpulse(state, 'puff', {x: 1e6, y: 1e6, z: -1e6});
    stepRelease(state, i === 50 ? 10000 : 1 / 60);
    for (const body of state.bodies) {
      assert.ok(Object.values(body.position).every(Number.isFinite));
      assert.ok(Object.values(body.velocity).every(Number.isFinite));
      assert.ok(Math.abs(body.position.x) <= 5.4);
      assert.ok(Math.abs(body.position.z) <= 3.1);
      assert.ok(body.position.y >= body.half.y - 1e-8);
      assert.ok(body.position.y <= 6.5);
      assert.ok(Math.hypot(...Object.values(body.velocity)) <= 16.01);
    }
  }
});

test('toppling wakes the entire stack and reset does not share mutable bodies', () => {
  const state = createReleaseState();
  const untouched = createReleaseState();
  assert.equal(toppleRelease(state), true);
  assert.ok(state.bodies.every(body => !body.sleeping));
  assert.ok(state.bodies.filter(body => body.kind === 'block').every(body => body.velocity.x !== 0));
  stepRelease(state, .05);
  assert.ok(untouched.bodies.every(body => body.sleeping));
  resetRelease(state);
  state.bodies[0].position.x = 999;
  assert.notEqual(untouched.bodies[0].position.x, 999);
});

test('drag positions and release speed are clamped and held toys ignore gravity', () => {
  const state = createReleaseState();
  const body = state.bodies.find(item => item.id === 'ring');
  assert.equal(beginReleaseDrag(state, 'ring'), true);
  assert.equal(moveReleaseDrag(state, 'ring', {x: 999, y: 999, z: -999}), true);
  const heldPosition = {...body.position};
  stepRelease(state, .05);
  assert.deepEqual(body.position, heldPosition);
  assert.ok(body.position.x < 5.4 && body.position.y <= 6.5 && body.position.z > -3.1);
  assert.equal(endReleaseDrag(state, 'ring', {x: 1000, y: 1000, z: -1000}), true);
  assert.equal(body.held, false);
  assert.ok(Math.hypot(...Object.values(body.velocity)) <= 16);
  stepRelease(state, .05);
  assert.notDeepEqual(body.position, heldPosition);
});

test('invalid drag coordinates and invalid time do not corrupt an active scene', () => {
  const state = createReleaseState();
  beginReleaseDrag(state, 'puff');
  const before = structuredClone(state);
  assert.equal(moveReleaseDrag(state, 'puff', {x: NaN, y: 2, z: 0}), false);
  for (const dt of [-1, 0, Infinity, NaN]) stepRelease(state, dt);
  assert.deepEqual(state, before);
});

test('blur pauses physics, releases dragging, and requires explicit continue', () => {
  const state = createReleaseState();
  beginReleaseDrag(state, 'puff');
  moveReleaseDrag(state, 'puff', {x: -3, y: 3, z: 0});
  pauseRelease(state);
  assert.ok(state.paused && state.needsContinue);
  assert.ok(state.bodies.every(body => !body.held));
  const before = structuredClone(state);
  stepRelease(state, 5);
  assert.equal(applyReleaseImpulse(state, 'puff', {y: 5}), false);
  assert.equal(toppleRelease(state), false);
  assert.equal(beginReleaseDrag(state, 'puff'), false);
  assert.deepEqual(state, before);
  assert.equal(resumeRelease(state), true);
  stepRelease(state, .05);
  assert.notDeepEqual(state.bodies, before.bodies);
});

test('worry input is optional and disappears at crumple, before the toss', () => {
  const state = createReleaseState();
  openWorry(state);
  assert.equal(state.worry.phase, 'writing');
  assert.ok(state.paused);
  setWorryText(state, 'a private thought');
  assert.equal(crumpleWorry(state), true);
  assert.equal(state.worry.text, '');
  assert.equal(JSON.stringify(state).includes('a private thought'), false);
  assert.equal(state.worry.phase, 'ready');
  assert.equal(tossWorry(state), true);
  assert.equal(state.worry.phase, 'tossing');
  assert.equal(finishWorry(state), true);
  assert.equal(state.worry.phase, 'done');
  closeWorry(state);
  assert.equal(state.worry.phase, 'closed');
  assert.equal(state.paused, false);
  openWorry(state);
  assert.equal(crumpleWorry(state), true);
  assert.equal(tossWorry(state), true);
});

test('worry cancellation clears text and all transient steps', () => {
  const state = createReleaseState();
  openWorry(state);
  setWorryText(state, '<script>private</script>');
  closeWorry(state);
  assert.deepEqual(state.worry, {phase: 'closed', text: ''});
  assert.equal(state.paused, false);
  openWorry(state);
  crumpleWorry(state);
  tossWorry(state);
  closeWorry(state);
  assert.equal(finishWorry(state), false);
  assert.deepEqual(state.worry, {phase: 'closed', text: ''});
});

test('input is limited to 240 UTF-16 units without cutting a surrogate pair', () => {
  const state = createReleaseState();
  openWorry(state);
  setWorryText(state, 'x'.repeat(400));
  assert.equal(state.worry.text.length, 240);
  setWorryText(state, 'x'.repeat(239) + '🌙');
  assert.equal(state.worry.text, 'x'.repeat(239));
  crumpleWorry(state);
  assert.equal(setWorryText(state, 'late input'), '');
  assert.equal(state.worry.text, '');
});

test('a dialog cannot bypass a blur pause or be resumed while open', () => {
  const state = createReleaseState();
  openWorry(state);
  assert.equal(resumeRelease(state), false);
  pauseRelease(state);
  closeWorry(state);
  assert.ok(state.paused && state.needsContinue);
  assert.equal(resumeRelease(state), true);
  assert.equal(state.paused, false);
  pauseRelease(state);
  openWorry(state);
  closeWorry(state);
  assert.ok(state.paused);
});

test('worry steps cannot skip or replay the toss', () => {
  const state = createReleaseState();
  assert.equal(tossWorry(state), false);
  assert.equal(finishWorry(state), false);
  assert.equal(crumpleWorry(state), false);
  openWorry(state);
  assert.equal(tossWorry(state), false);
  crumpleWorry(state);
  tossWorry(state);
  assert.equal(tossWorry(state), false);
  finishWorry(state);
  assert.equal(finishWorry(state), false);
});

test('continuing a paused worry flow keeps the toy table paused until the dialog closes', () => {
  const state = createReleaseState();
  assert.equal(resumeWorry(state), false);
  openWorry(state);
  pauseRelease(state);
  assert.equal(resumeWorry(state), true);
  assert.ok(state.paused);
  assert.equal(state.needsContinue, false);
  closeWorry(state);
  assert.equal(state.paused, false);
});

test('a blur cannot advance or finish a worry animation before manual continuation', () => {
  const state = createReleaseState();
  openWorry(state);
  pauseRelease(state);
  assert.equal(crumpleWorry(state), false);
  resumeWorry(state);
  crumpleWorry(state);
  pauseRelease(state);
  assert.equal(tossWorry(state), false);
  resumeWorry(state);
  tossWorry(state);
  pauseRelease(state);
  assert.equal(finishWorry(state), false);
  resumeWorry(state);
  assert.equal(finishWorry(state), true);
});

test('A/S/D/F map to tactile controls, with no keyboard interception while typing', () => {
  for (const [key, id] of [['a', 'puff'], ['s', 'pebble'], ['d', 'ring'], ['f', 'stack']]) {
    assert.equal(releaseShortcut({key}), id);
    assert.equal(releaseShortcut({key: key.toUpperCase()}), id);
  }
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY']) {
    assert.equal(releaseShortcut({key: 'a', target: {tagName}}), null);
  }
  for (const property of ['isComposing', 'defaultPrevented', 'ctrlKey', 'metaKey', 'altKey', 'repeat']) {
    assert.equal(releaseShortcut({key: 'a', [property]: true}), null);
  }
  assert.equal(releaseShortcut({key: 'a', target: {isContentEditable: true}}), null);
  assert.equal(releaseShortcut({key: 'a', target: {closest: () => ({})}}), null);
  assert.equal(releaseShortcut({key: 'Escape'}), null);
});

// Exercise our audio lifecycle with a clockless Web Audio boundary. Sources stay
// live until explicitly stopped; scheduling a future stop is not an immediate stop.
function audioBoundary(t, {deferResume = false} = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const contexts = [];
  const param = () => ({
    value: 0,
    setValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { this.value = value; },
    setTargetAtTime(value) { this.value = value; },
  });
  class AudioContextBoundary {
    constructor() {
      this.state = 'suspended';
      this.sampleRate = 1000;
      this.currentTime = 0;
      this.destination = {};
      this.nodes = [];
      this.closed = 0;
      contexts.push(this);
    }
    node() {
      const node = {
        connections: new Set(), active: false,
        connect(destination) { this.connections.add(destination); },
        disconnect() { this.connections.clear(); },
        start() { this.active = true; },
        stop(when) { if (when === undefined) this.active = false; },
      };
      this.nodes.push(node);
      return node;
    }
    createGain() { return Object.assign(this.node(), {gain: param()}); }
    createDynamicsCompressor() {
      return Object.assign(this.node(), Object.fromEntries(
        ['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, param()])));
    }
    createBuffer() { return {getChannelData: () => new Float32Array(160)}; }
    createOscillator() { return Object.assign(this.node(), {frequency: param()}); }
    createBufferSource() { return this.node(); }
    createBiquadFilter() { return Object.assign(this.node(), {frequency: param(), Q: param()}); }
    async resume() {
      if (deferResume) await new Promise(resolve => { this.allowResume = resolve; });
      if (this.state !== 'closed') this.state = 'running';
    }
    async suspend() { if (this.state !== 'closed') this.state = 'suspended'; }
    async close() {
      this.state = 'closed';
      this.closed++;
      for (const node of this.nodes) node.active = false;
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', {value: AudioContextBoundary, configurable: true});
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original);
    else delete globalThis.AudioContext;
  });
  return contexts;
}

test('sound stays unallocated when muted and blur stops every live percussion voice', async t => {
  const contexts = audioBoundary(t);
  const audio = createReleaseAudio();
  t.after(() => audio.destroy());
  audio.hit(0);
  assert.equal(contexts.length, 0);
  assert.equal(await audio.enable(), true);
  for (let index = 0; index < 4; index++) audio.hit(index);
  const context = contexts[0];
  assert.equal(context.nodes.filter(node => node.active).length, 4);
  audio.pause();
  assert.equal(context.state, 'suspended');
  assert.equal(context.nodes.filter(node => node.active).length, 0);
  audio.hit(0);
  assert.equal(context.nodes.filter(node => node.active).length, 0);
  await audio.resume();
  audio.hit(1);
  assert.equal(context.nodes.filter(node => node.active).length, 1);
  audio.destroy();
  audio.destroy();
  assert.equal(context.closed, 1);
  assert.ok(context.nodes.every(node => node.connections.size === 0));
});

test('muting stops notes and pending sound permission cannot resurrect an unmounted mode', async t => {
  const contexts = audioBoundary(t, {deferResume: true});
  const audio = createReleaseAudio();
  const pending = audio.enable();
  const context = contexts[0];
  audio.destroy();
  context.allowResume();
  assert.equal(await pending, false);
  assert.equal(context.state, 'closed');
  assert.equal(context.closed, 1);
  assert.ok(context.nodes.every(node => node.connections.size === 0));
  assert.equal(await audio.enable(), false);
});

test('volume is bounded and muting disconnects live sources without reactivating them', async t => {
  const contexts = audioBoundary(t);
  const audio = createReleaseAudio();
  t.after(() => audio.destroy());
  await audio.enable();
  audio.setVolume(999);
  assert.ok(contexts[0].nodes[0].gain.value <= .5);
  audio.setVolume(-999);
  assert.equal(contexts[0].nodes[0].gain.value, 0);
  audio.hit(2);
  audio.disable();
  assert.equal(contexts[0].state, 'suspended');
  assert.ok(contexts[0].nodes.every(node => !node.active));
  await audio.resume();
  audio.hit(0);
  assert.ok(contexts[0].nodes.every(node => !node.active));
});

test('dragging wakes rendering under reduced motion and disposal removes pointer listeners', t => {
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
  const observers = [];
  class ResizeBoundary {
    constructor() { this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {value: ResizeBoundary, configurable: true});
  t.after(() => {
    if (originalObserver) Object.defineProperty(globalThis, 'ResizeObserver', originalObserver);
    else delete globalThis.ResizeObserver;
  });
  class CanvasBoundary extends EventTarget {
    constructor() {
      super();
      this.captured = new Set();
      const classes = new Set();
      this.classList = {add: value => classes.add(value), remove: value => classes.delete(value)};
    }
    getBoundingClientRect() { return {left: 0, top: 0, width: 800, height: 400}; }
    setPointerCapture(id) { this.captured.add(id); }
    hasPointerCapture(id) { return this.captured.has(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
  }
  const canvas = new CanvasBoundary();
  const renderer = {
    shadowMap: {}, renderLists: {dispose() {}}, disposed: 0,
    setPixelRatio() {}, setClearColor() {}, setSize() {},
    render(scene, camera) {
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      this.camera = camera;
    },
    dispose() { this.disposed++; },
    forceContextLoss() {},
  };
  const state = createReleaseState();
  let activity = 0;
  let impacts = 0;
  const scene = createReleaseScene(canvas, {
    state, reducedMotion: true, rendererFactory: () => renderer,
    onActivity: () => activity++, onImpact: () => impacts++,
  });
  assert.ok(scene);
  t.after(() => scene.destroy());
  const puff = state.bodies.find(body => body.id === 'puff');
  const projected = new THREE.Vector3(puff.position.x, puff.position.y, puff.position.z).project(renderer.camera);
  const x = (projected.x + 1) * 400;
  const y = (1 - projected.y) * 200;
  function pointer(type, dx = 0, time = 0) {
    const event = new Event(type, {cancelable: true});
    for (const [key, value] of Object.entries({
      clientX: x + dx, clientY: y, button: 0, pointerId: 1, isPrimary: true, timeStamp: time,
    })) Object.defineProperty(event, key, {value});
    canvas.dispatchEvent(event);
  }
  pointer('pointerdown', 0, 0);
  pointer('pointermove', 45, 30);
  assert.ok(puff.held);
  assert.ok(activity > 0, 'explicit dragging must request a frame even after the idle loop stops');
  assert.notEqual(puff.position.x, -3.45);
  pointer('pointerup', 45, 40);
  assert.equal(puff.held, false);
  assert.equal(impacts, 1);
  scene.destroy();
  scene.destroy();
  assert.equal(renderer.disposed, 1);
  assert.ok(observers.every(observer => observer.disconnected));
  const before = structuredClone(state);
  pointer('pointerdown', 0, 50);
  pointer('pointermove', 45, 80);
  assert.deepEqual(state, before);
});
