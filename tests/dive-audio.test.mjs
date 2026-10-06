import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiveAudio} from '../src/dive-audio.js';

function audioHarness({deferred = false} = {}) {
  const timers = new Map(), intervals = new Map(), nodes = [], contexts = [];
  let sequence = 0;
  const resumes = [];
  class Parameter {
    constructor(value = 0) {this.value = value; this.events = [];}
    setValueAtTime(value, at) {this.value = value; this.events.push({value,at});}
    linearRampToValueAtTime(value, at) {this.events.push({value,at});}
    exponentialRampToValueAtTime(value, at) {this.events.push({value,at});}
    setTargetAtTime(value, at) {this.value = value; this.events.push({value,at});}
    cancelScheduledValues() {}
  }
  function node(type) {
    const value = {type, gain:new Parameter(), frequency:new Parameter(), Q:new Parameter(), delayTime:new Parameter(),
      pan:new Parameter(), detune:new Parameter(), connections:[], stopped:false, disconnected:false,
      connect(other) {this.connections.push(other); return other;}, disconnect() {this.disconnected = true;},
      start() {this.started = true;}, stop() {this.stopped = true;},
    };
    nodes.push(value); return value;
  }
  class Context {
    constructor() {this.currentTime = 0; this.sampleRate = 1000; this.state = 'suspended'; this.destination = {}; contexts.push(this);}
    createGain() {return node('gain');}
    createOscillator() {return node('oscillator');}
    createBufferSource() {return node('buffer');}
    createBiquadFilter() {return node('filter');}
    createStereoPanner() {return node('pan');}
    createDelay() {return node('delay');}
    createBuffer(channels, length) {const data = Array.from({length:channels}, () => new Float32Array(length)); return {getChannelData:index => data[index]};}
    async resume() {if (deferred) await new Promise(resolve => resumes.push(resolve)); this.state = 'running';}
    async suspend() {this.state = 'suspended';}
    async close() {this.state = 'closed';}
  }
  const view = {
    AudioContext:Context,
    setInterval(fn) {intervals.set(++sequence,fn); return sequence;}, clearInterval(id) {intervals.delete(id);},
    setTimeout(fn) {timers.set(++sequence,fn); return sequence;}, clearTimeout(id) {timers.delete(id);},
  };
  return {audio:createDiveAudio({view}), contexts, nodes, timers, intervals,
    resume(index = 0) {resumes[index]?.();}, flushTimers() {for (const fn of timers.values()) fn(); timers.clear();},
  };
}

test('original ambient sound allocates only after play and camera sound follows the active session', async () => {
  const app = audioHarness();
  assert.equal(app.contexts.length, 0);
  assert.equal(app.audio.capture(), false);
  assert.equal(await app.audio.play(), true);
  assert.equal(app.contexts.length, 1);
  assert.equal(app.contexts[0].state, 'running');
  assert.equal(app.intervals.size, 1);
  assert.ok(app.nodes.some(node => node.type === 'buffer' && node.started), 'water noise runs through the audio graph');
  assert.equal(app.audio.capture(), true);
  app.audio.pause();
  assert.equal(app.audio.capture(), false);
  assert.equal(app.intervals.size, 0);
  app.flushTimers();
  assert.equal(app.contexts[0].state, 'suspended');
  await app.audio.play();
  assert.equal(app.contexts.length, 1);
  app.audio.dispose(); app.audio.dispose();
  assert.equal(app.contexts[0].state, 'closed');
  assert.equal(app.timers.size, 0);
  assert.equal(app.intervals.size, 0);
  assert.ok(app.nodes.every(node => node.disconnected));
  assert.ok(app.nodes.filter(node => node.started).every(node => node.stopped));
});

test('a pending audio resume cannot turn music back on after pause or disposal', async () => {
  for (const action of ['pause','dispose']) {
    const app = audioHarness({deferred:true});
    const playing = app.audio.play();
    app.audio[action]();
    app.resume();
    assert.equal(await playing, false);
    assert.equal(app.intervals.size, 0);
    assert.equal(app.audio.capture(), false);
    app.audio.dispose();
  }
});

test('unsupported audio reports unavailability without breaking the silent experience', async () => {
  let notice = 0;
  const audio = createDiveAudio({view:{}, onUnavailable() {notice++;}});
  assert.equal(await audio.play(), false);
  assert.equal(audio.capture(), false);
  audio.pause(); audio.dispose();
  assert.equal(notice, 1);
});

test('an obsolete resume never suspends a newer user-requested start', async () => {
  const app = audioHarness({deferred:true});
  const oldStart = app.audio.play();
  app.audio.pause();
  const newStart = app.audio.play();
  app.resume(0);
  assert.equal(await oldStart, false);
  assert.equal(app.contexts[0].state, 'running', 'the newer start still owns the audio context');
  app.resume(1);
  assert.equal(await newStart, true);
  app.audio.dispose();
});
