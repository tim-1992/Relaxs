import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import * as mechanics from '../src/memory-state.js';

// Real controller and mechanics; only DOM, GPU completion and audio hardware
// are replaced so browser lifecycle races can be exercised without a browser.
function mount({difficulty = 'easy', decodeFails = false, muted = false, deferredAudio = false} = {}) {
  const listeners = [], timers = new Map(), audioContexts = [], sources = [];
  let sequence = 0, state, deliver, reject, loadSignal, releases = 0, exited = 0;
  const resumes = [];
  function events(target) {
    const map = new Map(); listeners.push(map);
    return Object.assign(target, {
      addEventListener(type, fn, {signal} = {}) {
        if (!map.has(type)) map.set(type, new Set());
        map.get(type).add(fn);
        if (signal) {setMaxListeners(0, signal); signal.addEventListener('abort', () => map.get(type).delete(fn), {once: true});}
      },
      async emit(type, event = {}) {for (const fn of map.get(type) || []) await fn({target: this, ...event});},
    });
  }
  const doc = events({hidden: false, hasFocus: () => true});
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
      this.attributes = {}; this.dataset = {}; this.style = {}; this.hidden = this.disabled = false; this.text = '';
      this.classList = {
        contains: name => this.className.split(/\s+/).includes(name),
        add: name => {if (!this.classList.contains(name)) this.className += ` ${name}`;},
        remove: name => {this.className = this.className.split(/\s+/).filter(item => item !== name).join(' ');},
        toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name),
      };
      events(this);
    }
    set className(value) {this.attributes.class = value;}
    get className() {return this.attributes.class || '';}
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (['hidden', 'disabled'].includes(name)) this[name] = true;
    }
    getAttribute(name) {return this.attributes[name] ?? null;}
    hasAttribute(name) {return name in this.attributes;}
    removeAttribute(name) {delete this.attributes[name];}
    set textContent(value) {this.text = String(value); this.children = [];}
    get textContent() {return this.text + this.children.map(child => child.textContent).join('');}
    set innerHTML(value) {
      this.children = []; this.text = ''; const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1).text += token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const child = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) child.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).append(child);
        if (!token[0].endsWith('/>') && !['IMG', 'BR', 'INPUT'].includes(child.tagName)) stack.push(child);
      }
    }
    append(...children) {for (const child of children) {child.parentElement = this; this.children.push(child);}}
    remove() {if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;}
    contains(node) {return node === this || this.children.some(child => child.contains(node));}
    matches(selector) {
      if (selector.endsWith(':not(:disabled)')) return !this.disabled && this.matches(selector.replace(':not(:disabled)', ''));
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      return attr ? attr[2] === undefined ? this.hasAttribute(attr[1]) : this.getAttribute(attr[1]) === attr[2]
        : this.tagName === selector.toUpperCase();
    }
    closest(selector) {return this.matches(selector) ? this : this.parentElement?.closest(selector);}
    querySelectorAll(selector) {return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    focus() {doc.activeElement = this;}
    async decode() {if (decodeFails && (this.src || this.getAttribute('src')).endsWith('MA==')) throw Error('decode failed');}
  }
  const param = () => ({setValueAtTime() {}, exponentialRampToValueAtTime() {}});
  const node = () => ({connect() {}, disconnect() {this.disconnected = true;}});
  class AudioContext {
    constructor() {this.currentTime = 0; this.state = 'suspended'; this.destination = {}; audioContexts.push(this);}
    createGain() {return {...node(), gain: param()};}
    createOscillator() {
      const source = {...node(), frequency: param(), start() {this.started = true;}, stop() {this.stopped = true;}};
      sources.push(source); return source;
    }
    async resume() {if (deferredAudio) await new Promise(resolve => resumes.push(resolve)); this.state = 'running';}
    async suspend() {this.state = 'suspended';}
    async close() {this.state = 'closed';}
  }
  const win = events({
    AudioContext, setTimeout(fn) {timers.set(++sequence, fn); return sequence;},
    clearTimeout(id) {timers.delete(id);},
  });
  doc.defaultView = win; doc.createElement = tag => new Element(tag); doc.body = new Element('body'); doc.activeElement = doc.body;
  const pending = new Promise((resolve, fail) => {deliver = resolve; reject = fail;});
  const source = readFileSync(new URL('../src/memory-game.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, path) => `const {${names}} = imports[${JSON.stringify(path)}];`)
    .replaceAll('export function ', 'function ').replaceAll('export const ', 'const ');
  const context = vm.createContext({
    AbortController, document: doc, window: win, console,
    setTimeout: win.setTimeout, clearTimeout: win.clearTimeout,
    imports: {
      './memory-state.js': {...mechanics, createMemoryState(random, level) {state = mechanics.createMemoryState(random, level); return state;}},
      './memory-tripo-art.js': {loadMemoryTripoArt({signal}) {loadSignal = signal; return pending;}},
    },
  });
  vm.runInContext(source, context);
  const container = new Element('main'), notices = [];
  const cleanup = context.mountMemory(container, {difficulty, muted, onExit() {exited++;}, onAnnounce: message => notices.push(message)});
  const root = container.children[0];
  const query = selector => {const element = root.querySelector(selector); assert.ok(element, `missing ${selector}`); return element;};
  return {
    root, query, container, doc, win, timers, audioContexts, sources, notices, cleanup, resumes,
    get state() {return state;}, get released() {return releases;}, get signal() {return loadSignal;}, get exited() {return exited;},
    get listenerCount() {return listeners.reduce((count, map) => count + [...map.values()].reduce((sum, set) => sum + set.size, 0), 0);},
    click(action) {return root.emit('click', {target: query(`[data-memory-action="${action}"]`)});},
    flip(index) {return root.emit('click', {target: query(`[data-card="${index}"]`)});},
    settle() {const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn());},
    ready({failed = []} = {}) {
      deliver({faces: Array.from({length: state.totalPairs}, (_, i) => failed.includes(i) ? null
        : {name: `模型 ${i}`, id: `model-${i}`, source: 'Tripo', src: `data:image/png;base64,${Buffer.from(String(i)).toString('base64')}`}),
      dispose() {releases++;}});
    },
    reject,
  };
}
const flush = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};
const pair = (state, value) => state.cards.flatMap((card, index) => card.value === value ? [index] : []);

test('only decoded, installed card faces receive the Tripo badge; both copies share the same image and label', async t => {
  const app = mount(); t.after(app.cleanup);
  assert.equal(app.query('[data-memory-tripo]').hidden, true);
  assert.equal(app.root.querySelectorAll('img').length, 0);
  app.ready(); await flush();
  assert.equal(app.query('[data-memory-tripo]').hidden, false);
  assert.equal(app.root.querySelectorAll('img').length, 12);
  for (let value = 0; value < 6; value++) {
    const [a, b] = pair(app.state, value).map(index => app.query(`[data-card="${index}"]`));
    assert.equal(a.querySelector('img').getAttribute('src'), b.querySelector('img').getAttribute('src'));
    assert.equal(a.querySelector('small').textContent, b.querySelector('small').textContent);
  }
  assert.equal(app.audioContexts.length, 0);
});

test('a load completing after the first flip cannot change memory cues until the next shuffle', async t => {
  const app = mount(); t.after(app.cleanup);
  await app.flip(0);
  const label = app.query('[data-card="0"]').getAttribute('aria-label');
  app.ready(); await flush();
  assert.equal(app.root.querySelectorAll('img').length, 0);
  assert.equal(app.query('[data-card="0"]').getAttribute('aria-label'), label);
  assert.equal(app.query('[data-memory-tripo]').hidden, true);
  await app.click('reset');
  assert.equal(app.root.querySelectorAll('img').length, 12);
  assert.equal(app.query('[data-memory-tripo]').hidden, false);
  assert.equal(app.state.turns, 0);
});

test('failed image decoding and failed asset slots stay playable without inflating the Tripo count', async t => {
  const app = mount({decodeFails: true}); t.after(app.cleanup);
  app.ready({failed: [2]}); await flush();
  assert.equal(app.root.querySelectorAll('img').length, 8);
  assert.match(app.query('[data-memory-tripo]').textContent, /4\s*\/\s*6/);
  for (let value = 0; value < 6; value++) {
    for (const index of pair(app.state, value)) await app.flip(index);
    app.settle();
  }
  assert.equal(app.state.complete, true);
  assert.equal(app.notices.length, 1);
});

test('pause and hidden stop pending turns and active audio; muting while paused survives resume', async t => {
  const app = mount(); t.after(app.cleanup);
  app.ready(); await flush();
  await app.flip(0);
  const different = app.state.cards.findIndex(card => card.value !== app.state.cards[0].value);
  await app.flip(different);
  assert.ok(app.sources.length >= 2);
  assert.equal(app.timers.size, 1);
  app.doc.hidden = true; await app.doc.emit('visibilitychange');
  assert.equal(app.state.paused, true);
  assert.equal(app.timers.size, 0);
  assert.ok(app.sources.every(source => source.stopped && source.disconnected));
  assert.equal(app.audioContexts[0].state, 'suspended');
  await app.click('sound');
  app.doc.hidden = false;
  await app.click('resume');
  assert.equal(app.state.paused, false);
  assert.equal(app.timers.size, 1);
  app.settle();
  assert.equal(app.audioContexts[0].state, 'suspended');
  assert.equal(app.query('[data-memory-action="sound"]').getAttribute('aria-pressed'), 'false');
});

test('match and completion tones follow real successful turns, never rejected third flips', async t => {
  const app = mount(); t.after(app.cleanup);
  app.ready(); await flush();
  for (let value = 0; value < 6; value++) {
    for (const index of pair(app.state, value)) await app.flip(index);
    const beforeRejected = app.sources.length;
    await app.flip(0);
    assert.equal(app.sources.length, beforeRejected);
    // Browser reports the end of short tones before the turn settles.
    app.sources.forEach(source => source.onended?.());
    const before = app.sources.length;
    app.settle();
    assert.equal(app.sources.length - before, value === 5 ? 4 : 2);
    app.sources.forEach(source => source.onended?.());
  }
  assert.equal(app.state.complete, true);
  await app.win.emit('blur');
  assert.equal(app.audioContexts[0].state, 'suspended', 'even a finished round must silence on blur');
});

test('unmount aborts a pending art load and releases a late gallery without changing the detached UI', async () => {
  const app = mount();
  await app.flip(0);
  app.cleanup(); app.cleanup();
  assert.equal(app.signal.aborted, true);
  assert.equal(app.container.children.length, 0);
  assert.equal(app.listenerCount, 0);
  assert.equal(app.timers.size, 0);
  assert.equal(app.audioContexts[0].state, 'closed');
  app.ready(); await flush();
  assert.equal(app.released, 1);
  assert.equal(app.root.querySelectorAll('img').length, 0);
});

test('art failure preserves hard-mode turn limits, retry and exit', async t => {
  const app = mount({difficulty: 'hard'}); t.after(app.cleanup);
  app.reject(Error('no GPU')); await flush();
  assert.equal(app.query('[data-memory-tripo]').hidden, true);
  assert.equal(app.state.totalPairs, 12);
  const other = app.state.cards.findIndex(card => card.value !== app.state.cards[0].value);
  for (let turn = 0; turn < 28; turn++) {await app.flip(0); await app.flip(other); app.settle();}
  assert.equal(app.state.failed, true);
  await app.click('retry');
  assert.equal(app.state.failed, false);
  assert.equal(app.state.turns, 0);
  await app.click('exit');
  assert.equal(app.exited, 1);
});

test('first accepted flip activates default audio within the user gesture, not during mount or loading', async t => {
  const app = mount(); t.after(app.cleanup);
  app.ready(); await flush();
  assert.equal(app.audioContexts.length, 0);
  assert.equal(app.sources.length, 0);
  await app.flip(0);
  assert.equal(app.audioContexts.length, 1);
  assert.equal(app.sources.length, 1);
  assert.equal(app.audioContexts[0].state, 'running');
  assert.equal(app.query('[data-memory-action="sound"]').getAttribute('aria-pressed'), 'true');
  await app.flip(0);
  assert.equal(app.sources.length, 1, 'a rejected repeat flip cannot trigger audio');
});

test('explicit mute before the first flip survives shuffle, pause and resume without allocating audio', async t => {
  const app = mount(); t.after(app.cleanup);
  await app.click('sound');
  await app.flip(0);
  await app.click('reset');
  await app.click('pause');
  await app.click('resume');
  await app.flip(0);
  assert.equal(app.audioContexts.length, 0);
  assert.equal(app.query('[data-memory-action="sound"]').getAttribute('aria-pressed'), 'false');
  const initiallyMuted = mount({muted: true}); t.after(initiallyMuted.cleanup);
  await initiallyMuted.flip(0);
  assert.equal(initiallyMuted.audioContexts.length, 0);
});

test('a delayed first-flip audio activation cannot play after pause or a new round', async t => {
  for (const action of ['pause', 'reset']) {
    const app = mount({deferredAudio: true}); t.after(app.cleanup);
    const flipping = app.flip(0);
    assert.equal(app.resumes.length, 1);
    await app.click(action);
    app.resumes[0]();
    await flipping;
    assert.equal(app.sources.length, 0);
    if (action === 'pause') assert.equal(app.audioContexts[0].state, 'suspended');
  }
});
