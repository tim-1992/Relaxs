import test from 'node:test';
import assert from 'node:assert/strict';
import {createReleaseAudio} from '../src/release-audio.js';

// Exercise the actual synth used by crusher. Only the browser's WebAudio
// nodes/clock are replaced; voice ownership and lifecycle stay real.
function audioBoundary(t, {deferResume = false} = {}) {
  const previous = globalThis.AudioContext, contexts = [], sources = [];
  const parameter = () => ({
    value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {},
  });
  const node = () => ({connect() {}, disconnect() {this.disconnected = true;}});
  class AudioContext {
    constructor() {
      this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000;
      this.destination = node(); this.resumes = this.suspends = this.closes = 0; contexts.push(this);
    }
    createGain() {return {...node(), gain: parameter()};}
    createDynamicsCompressor() {
      return {...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter()};
    }
    createBuffer(_channels, count) {const samples = new Float32Array(count); return {getChannelData: () => samples};}
    createBiquadFilter() {return {...node(), frequency: parameter(), Q: parameter()};}
    createOscillator() {
      const source = {...node(), frequency: parameter(), stops: [],
        start(time) {this.started = time;}, stop(time) {this.stops.push(time);}};
      sources.push(source); return source;
    }
    createBufferSource() {return this.createOscillator();}
    async resume() {
      this.resumes++;
      if (deferResume) await new Promise(resolve => {this.finishResume = resolve;});
      this.state = 'running';
    }
    async suspend() {this.suspends++; this.state = 'suspended';}
    async close() {this.closes++; this.state = 'closed';}
  }
  globalThis.AudioContext = AudioContext;
  const audio = createReleaseAudio();
  t.after(() => {
    audio.destroy();
    if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous;
  });
  return {audio, contexts, sources};
}

test('crusher synth creates audio on activation, plays real source nodes, reuses its context and immediately stops on pause/mute', async t => {
  const {audio, contexts, sources} = audioBoundary(t);
  assert.equal(contexts.length, 0, 'mounting cannot create an autoplaying context');
  const activation = audio.enable();
  assert.equal(contexts.length, 1, 'context creation happens synchronously in the gesture');
  assert.equal(contexts[0].resumes, 1);
  assert.equal(await activation, true);
  audio.hit(3, .2); audio.hit(0, .8); audio.hit(2, .45);
  assert.equal(sources.length, 3);
  assert.ok(sources.every(source => source.started === 0 && source.stops[0] > 0));
  audio.pause();
  assert.equal(contexts[0].state, 'suspended');
  assert.ok(sources.every(source => source.disconnected && source.stops.includes(undefined)));
  audio.hit(1);
  assert.equal(sources.length, 3);
  await audio.resume(); audio.hit(1);
  assert.equal(contexts.length, 1, 'resume must reuse the synth');
  assert.equal(sources.length, 4);
  audio.disable(); audio.hit(1);
  assert.equal(sources.length, 4);
  assert.equal(contexts[0].state, 'suspended');
  audio.destroy(); audio.destroy();
  assert.equal(contexts[0].closes, 1);
  assert.ok(sources.every(source => source.disconnected));
});

test('an audio activation resolving after pause or cleanup cannot emit a delayed sound', async t => {
  for (const destroy of [false, true]) {
    await t.test(destroy ? 'unmounted' : 'paused', async t => {
      const {audio, contexts, sources} = audioBoundary(t, {deferResume: true});
      const pending = audio.enable();
      if (destroy) audio.destroy(); else audio.pause();
      contexts[0].finishResume();
      await pending;
      audio.hit(0);
      assert.equal(sources.length, 0);
      assert.notEqual(contexts[0].state, 'running');
      if (destroy) assert.equal(contexts[0].closes, 1);
    });
  }
});
