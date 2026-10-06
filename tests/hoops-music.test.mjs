import test from 'node:test';
import assert from 'node:assert/strict';
import {createHoopsMusic} from '../src/hoops-music.js';

function audioEnvironment(t, deferred = false) {
  let wall = 0, nextId = 0;
  const timers = new Map(), contexts = [];
  class Param {
    value = 0;
    setValueAtTime(value) { this.value = value; return this; }
    exponentialRampToValueAtTime() { return this; }
    linearRampToValueAtTime() { return this; }
    cancelScheduledValues() { return this; }
  }
  class Node {
    constructor(context, kind) {
      this.context = context; this.kind = kind; this.disconnected = false;
      for (const name of ['gain', 'frequency', 'Q', 'threshold', 'knee', 'ratio', 'attack', 'release']) this[name] = new Param();
      context.nodes.push(this);
    }
    connect() {}
    disconnect() { this.disconnected = true; }
    start(at) { this.startAt = at; }
    stop(at = this.context.currentTime) { this.stopAt = at; }
  }
  class Context {
    state = 'suspended'; currentTime = 0; sampleRate = 8000;
    nodes = []; releases = []; closeCount = 0; destination = {};
    constructor() { contexts.push(this); }
    createGain() { return new Node(this, 'gain'); }
    createDynamicsCompressor() { return new Node(this, 'compressor'); }
    createBiquadFilter() { return new Node(this, 'filter'); }
    createOscillator() { return new Node(this, 'oscillator'); }
    createBufferSource() { return new Node(this, 'noise'); }
    createBuffer(channels, size) { return {getChannelData: () => new Float32Array(size)}; }
    resume() {
      if (!deferred) { this.state = 'running'; return Promise.resolve(); }
      return new Promise(resolve => this.releases.push(() => {
        if (this.state !== 'closed') this.state = 'running';
        resolve();
      }));
    }
    suspend() { if (this.state !== 'closed') this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; this.closeCount++; return Promise.resolve(); }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const webkit = Object.getOwnPropertyDescriptor(globalThis, 'webkitAudioContext');
  Object.defineProperty(globalThis, 'AudioContext', {configurable: true, writable: true, value: Context});
  Object.defineProperty(globalThis, 'webkitAudioContext', {configurable: true, writable: true, value: undefined});
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'AudioContext', original); else delete globalThis.AudioContext;
    if (webkit) Object.defineProperty(globalThis, 'webkitAudioContext', webkit); else delete globalThis.webkitAudioContext;
  });
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => { timers.set(++nextId, {callback, at: wall + delay / 1000}); return nextId; });
  t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
  function advance(seconds) {
    const end = wall + seconds;
    while (wall < end) {
      const entry = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      const next = entry ? Math.min(end, entry[1].at) : end;
      for (const context of contexts) {
        if (context.state === 'running') context.currentTime += next - wall;
        for (const node of context.nodes) if (!node.ended && node.stopAt <= context.currentTime) {
          node.ended = true; node.onended?.();
        }
      }
      wall = next;
      if (entry && entry[1].at <= wall) { timers.delete(entry[0]); entry[1].callback(); }
    }
  }
  return {contexts, timers, advance, sources: () => contexts.flatMap(context => context.nodes.filter(node => node.startAt !== undefined))};
}

test('default and resume-before-enable are silent; enabling during pause waits for resume', async t => {
  const env = audioEnvironment(t), music = createHoopsMusic();
  t.after(() => music.dispose());
  assert.equal(await music.resume(), true);
  assert.equal(env.contexts.length, 0);
  music.pause();
  assert.equal(await music.enable(), true);
  assert.equal(env.sources().length, 0);
  assert.equal(env.timers.size, 0);
  assert.equal(await music.resume(), true);
  assert.ok(env.sources().some(node => node.kind === 'oscillator'));
  assert.ok(env.sources().some(node => node.kind === 'noise'));
  assert.equal(env.timers.size, 1);
});

test('pause cancels every scheduled voice and timer, then resumes at the saved musical beat', async t => {
  const env = audioEnvironment(t), music = createHoopsMusic();
  t.after(() => music.dispose());
  await music.enable();
  const firstBeat = Math.min(...env.sources().map(source => source.startAt));
  env.advance(.4);
  music.pause();
  const before = env.sources().length;
  assert.equal(env.timers.size, 0);
  assert.ok(env.sources().every(source => source.disconnected));
  env.advance(10);
  assert.equal(env.sources().length, before);
  await music.resume();
  env.advance(.06);
  const nextBeat = Math.min(...env.sources().slice(before).map(source => source.startAt));
  assert.ok(Math.abs(nextBeat - firstBeat - 2 * (60 / 118 / 2)) < 1e-8, 'resume must continue the eighth-note grid, not restart the phrase');
});

test('the loop has bounded live voices, repeated enable does not duplicate the scheduler, and mute is immediate', async t => {
  const env = audioEnvironment(t), music = createHoopsMusic();
  t.after(() => music.dispose());
  await music.enable(); await music.enable();
  assert.equal(env.timers.size, 1);
  for (let index = 0; index < 200; index++) {
    env.advance(.1);
    assert.ok(env.sources().filter(source => !source.disconnected).length <= 24);
  }
  music.disable();
  const count = env.sources().length;
  env.advance(1);
  assert.equal(env.sources().length, count);
  assert.equal(env.timers.size, 0);
  assert.ok(env.sources().every(source => source.disconnected));
  music.dispose(); music.dispose();
  assert.equal(env.contexts[0].closeCount, 1);
  assert.ok(env.contexts[0].nodes.every(node => node.disconnected));
});

for (const interruption of ['pause', 'disable', 'dispose']) {
  test(`pending audio permission cannot restart music after ${interruption}`, async t => {
    const env = audioEnvironment(t, true), music = createHoopsMusic();
    t.after(() => music.dispose());
    const enabling = music.enable();
    music[interruption]();
    env.contexts[0].releases.shift()();
    assert.equal(await enabling, interruption === 'pause', 'pause preserves the enabled preference; mute and dispose do not');
    assert.equal(env.sources().length, 0);
    assert.equal(env.timers.size, 0);
    assert.notEqual(env.contexts[0].state, 'running');
  });
}

test('a pending explicit resume stays silent when paused again', async t => {
  const env = audioEnvironment(t, true), music = createHoopsMusic();
  t.after(() => music.dispose());
  music.pause();
  await music.enable();
  const resuming = music.resume();
  music.pause();
  env.contexts[0].releases.shift()();
  assert.equal(await resuming, false);
  assert.equal(env.sources().length, 0);
  assert.equal(env.timers.size, 0);
});

test('resume recovers an externally suspended audio context without duplicating the timer', async t => {
  const env = audioEnvironment(t), music = createHoopsMusic();
  t.after(() => music.dispose());
  await music.enable();
  env.contexts[0].state = 'suspended';
  env.advance(.1);
  assert.equal(env.timers.size, 0);
  assert.equal(await music.resume(), true);
  assert.equal(env.contexts[0].state, 'running');
  assert.equal(env.timers.size, 1);
});

test('a stale resume cannot cancel a newer valid enable', async t => {
  const env = audioEnvironment(t, true), music = createHoopsMusic();
  t.after(() => music.dispose());
  const first = music.enable();
  music.disable();
  const latest = music.enable();
  const [oldRelease, newRelease] = env.contexts[0].releases;
  newRelease(); assert.equal(await latest, true);
  oldRelease(); assert.equal(await first, false);
  assert.equal(env.contexts[0].state, 'running');
  assert.equal(env.timers.size, 1);
  assert.ok(env.sources().length > 0);
});

test('starting play during pending music activation preserves the enabled preference', async t => {
  const env = audioEnvironment(t, true), music = createHoopsMusic();
  t.after(() => music.dispose());
  const enabling = music.enable();
  const startingGame = music.resume();
  const [enableRelease, startRelease] = env.contexts[0].releases;
  startRelease(); assert.equal(await startingGame, true);
  enableRelease(); assert.equal(await enabling, true);
  assert.equal(env.contexts[0].state, 'running');
  assert.equal(env.timers.size, 1);
  music.disable();
  assert.equal(env.timers.size, 0);
});

test('missing Web Audio fails gracefully without timers or context allocation', async t => {
  const env = audioEnvironment(t);
  globalThis.AudioContext = undefined;
  const music = createHoopsMusic();
  assert.equal(await music.enable(), false);
  assert.equal(env.contexts.length, 0);
  assert.equal(env.timers.size, 0);
  music.dispose();
});
