import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function audioHarness({deferred = false} = {}) {
  const nodes = [], contexts = [], timers = new Map();
  let serial = 0, resolveResume;
  class Parameter {
    constructor(value = 0) {this.value = value;}
    cancelScheduledValues() {}
    setValueAtTime(value) {this.value = value;}
    setTargetAtTime(value) {this.value = value;}
  }
  function node(category) {
    const value = {category, outputs:[], gain:new Parameter(), frequency:new Parameter(), Q:new Parameter(), detune:new Parameter(),
      disconnected:false, stopped:false, started:false,
      connect(destination) {this.outputs.push(destination);}, disconnect() {this.disconnected = true;},
      start() {this.started = true;}, stop() {this.stopped = true;},
    };
    nodes.push(value); return value;
  }
  class Context {
    constructor() {this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 1000; this.destination = {}; contexts.push(this);}
    createGain() {return node('gain');}
    createBufferSource() {return node('noise');}
    createOscillator() {return node('tone');}
    createBiquadFilter() {return node('filter');}
    createBuffer(channels, length) {return {getChannelData:() => new Float32Array(length)};}
    async resume() {if (deferred) await new Promise(resolve => {resolveResume = resolve;}); this.state = 'running';}
    async suspend() {this.state = 'suspended';}
    async close() {this.state = 'closed';}
  }
  const code = readFileSync(new URL('../src/calm-audio.js',import.meta.url),'utf8').replace('export function createCalmAudio','function createCalmAudio');
  const context = vm.createContext({AudioContext:Context,
    setTimeout(fn) {timers.set(++serial,fn); return serial;}, clearTimeout(id) {timers.delete(id);},
  });
  vm.runInContext(code, context);
  const audio = context.createCalmAudio();
  function audibleGain(value) {
    if (value === contexts[0]?.destination) return 1;
    if (!value.outputs || value.disconnected) return 0;
    return (value.category === 'gain' ? value.gain.value : 1) *
      value.outputs.reduce((total,next) => total + audibleGain(next),0);
  }
  return {audio, nodes, contexts, timers, audibleGain,
    resume() {resolveResume?.();}, flushTimers() {const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn());},
  };
}

test('default audio routes a quiet original chord after play, and pause/disposal silence every source', async () => {
  const app = audioHarness();
  assert.equal(app.contexts.length, 0);
  assert.equal(await app.audio.play(), true);
  const tones = app.nodes.filter(node => node.category === 'tone' && node.frequency.value > 100);
  assert.ok(tones.filter(node => app.audibleGain(node) > 0).length >= 3, 'default selects tonal space ambience');
  assert.ok(tones.every(node => app.audibleGain(node) < .02), 'background voices stay quiet');
  await app.audio.play('sea');
  assert.ok(tones.every(node => app.audibleGain(node) === 0), 'selecting sea mutes the chord layer');
  await app.audio.play('space');
  app.audio.pause(); app.flushTimers();
  assert.equal(app.contexts[0].state, 'suspended');
  assert.ok(app.nodes.filter(node => node.started).every(node => app.audibleGain(node) === 0));
  await app.audio.play();
  app.audio.dispose(); app.audio.dispose(); app.flushTimers();
  assert.equal(app.contexts[0].state, 'closed');
  assert.ok(app.nodes.every(node => node.disconnected));
  assert.ok(app.nodes.filter(node => node.started).every(node => node.stopped));
  assert.equal(app.timers.size, 0);
});

test('pending playback cannot become audible after pause or cleanup', async () => {
  for (const action of ['pause','dispose']) {
    const app = audioHarness({deferred:true});
    const playing = app.audio.play();
    app.audio[action](); app.resume();
    assert.equal(await playing, false);
    assert.ok(app.nodes.filter(node => node.started).every(node => app.audibleGain(node) === 0));
    app.audio.dispose(); app.flushTimers();
    assert.ok(app.nodes.filter(node => node.started).every(node => node.stopped));
    assert.equal(app.timers.size, 0);
  }
});
