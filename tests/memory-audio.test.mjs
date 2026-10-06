import test from 'node:test';
import assert from 'node:assert/strict';
import * as memory from '../src/memory-game.js';

function harness({deferred = false} = {}) {
  assert.equal(typeof memory.createMemoryAudio, 'function', 'memory needs its own gentle synth');
  const contexts = [], nodes = [], resumes = [];
  const parameter = () => ({setValueAtTime() {}, exponentialRampToValueAtTime() {}});
  const node = () => ({connect() {}, disconnect() {this.disconnected = true;}});
  class AudioContext {
    constructor() {this.state = 'suspended'; this.currentTime = 0; this.destination = {}; contexts.push(this);}
    createGain() {const gain = {...node(), gain: parameter()}; nodes.push(gain); return gain;}
    createOscillator() {
      const source = {...node(), frequency: parameter(), stops: [],
        start(at) {this.started = at;}, stop(at) {this.stops.push(at);}};
      nodes.push(source); return source;
    }
    async resume() {if (deferred) await new Promise(resolve => resumes.push(resolve)); this.state = 'running';}
    async suspend() {this.state = 'suspended';}
    async close() {this.state = 'closed';}
  }
  const audio = memory.createMemoryAudio({view: {AudioContext}});
  return {audio, contexts, nodes, resumes, sources: () => nodes.filter(node => node.frequency)};
}

test('sound is opt-in; flip, match and completion create distinct short original tones', async () => {
  const app = harness();
  assert.equal(app.contexts.length, 0);
  assert.equal(app.audio.play('flip'), false);
  assert.equal(await app.audio.setEnabled(true), true);
  for (const [kind, count] of [['flip', 1], ['match', 2], ['complete', 4]]) {
    const before = app.sources().length;
    assert.equal(app.audio.play(kind), true);
    assert.equal(app.sources().length - before, count);
  }
  assert.ok(app.sources().every(source => source.stops[0] > source.started && source.stops[0] - source.started < 1));
  app.audio.pause();
  assert.ok(app.sources().every(source => source.disconnected && source.stops.length === 2));
  assert.equal(app.audio.play('match'), false);
  assert.equal(app.contexts[0].state, 'suspended');
  await app.audio.resume();
  assert.equal(app.contexts.length, 1);
  assert.equal(app.audio.play('flip'), true);
  app.audio.dispose(); app.audio.dispose();
  assert.equal(app.contexts[0].state, 'closed');
  assert.ok(app.nodes.every(node => node.disconnected));
});

test('turning sound off during pause stays off after resume', async () => {
  const app = harness();
  await app.audio.setEnabled(true);
  app.audio.pause();
  await app.audio.setEnabled(false);
  await app.audio.resume();
  assert.equal(app.audio.enabled, false);
  assert.equal(app.audio.play('flip'), false);
  assert.equal(app.contexts[0].state, 'suspended');
  app.audio.dispose();
});

test('pending user audio activation cannot outlive pause, mute or unmount', async () => {
  for (const action of ['pause', 'mute', 'dispose']) {
    const app = harness({deferred: true});
    const pending = app.audio.setEnabled(true);
    if (action === 'mute') await app.audio.setEnabled(false); else app.audio[action]();
    app.resumes[0]();
    assert.equal(await pending, false);
    assert.equal(app.audio.play('flip'), false);
    assert.notEqual(app.contexts[0].state, 'running');
    app.audio.dispose();
  }
});

test('older activation cannot suspend a newer explicit user resume', async () => {
  const app = harness({deferred: true});
  const old = app.audio.setEnabled(true);
  app.audio.pause();
  const next = app.audio.resume();
  app.resumes[0](); await old;
  app.resumes[1](); assert.equal(await next, true);
  assert.equal(app.audio.play('flip'), true);
  app.audio.dispose();
});

test('unavailable WebAudio leaves the game silent and disables the audio preference', async () => {
  assert.equal(typeof memory.createMemoryAudio, 'function');
  const audio = memory.createMemoryAudio({view: {}});
  assert.equal(await audio.setEnabled(true), false);
  assert.equal(audio.enabled, false);
  assert.equal(audio.play('flip'), false);
  audio.dispose();
});
