import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as clock from '../src/calm-clock.js';

function mount() {
  function eventTarget(object = {}) {
    const listeners = new Map();
    object.addEventListener = (name, fn) => {if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn);};
    object.removeEventListener = (name, fn) => listeners.get(name)?.delete(fn);
    object.emit = (name, detail = {}) => {
      const event = {target:object, ...detail};
      for (const fn of [...listeners.get(name) || []]) fn(event);
    };
    return object;
  }
  let now = 0, serial = 0;
  const frames = new Map(), notices = [], media = eventTarget({matches:false}), doc = eventTarget({hidden:false});
  const view = eventTarget({
    performance:{now:() => now}, matchMedia:() => media,
    requestAnimationFrame(fn) {frames.set(++serial,fn); return serial;},
    cancelAnimationFrame(id) {frames.delete(id);},
  });
  doc.defaultView = view;
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.dataset = {}; this.attrs = {};
      this.children = []; this._text = ''; this.open = false; this.style = {setProperty() {}};
      eventTarget(this);
    }
    set className(value) {this.attrs.class = value;}
    get className() {return this.attrs.class || '';}
    setAttribute(key, value) {
      this.attrs[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (['name','value','id'].includes(key)) this[key] = String(value);
      if (['hidden','disabled','checked','selected'].includes(key)) this[key] = true;
    }
    getAttribute(key) {return this.attrs[key];}
    set textContent(value) {this._text = String(value); this.children = [];}
    get textContent() {return this._text + this.children.map(node => node.textContent).join('');}
    set innerHTML(value) {
      this.children = []; this._text = ''; const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1)._text += token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const node = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) node.setAttribute(attr[1],attr[2] || '');
        stack.at(-1).append(node);
        if (!['INPUT','BR','HR'].includes(node.tagName)) stack.push(node);
      }
      for (const select of this.querySelectorAll('select')) {
        select.value = select.children.find(node => node.selected)?.value || select.children[0]?.value;
      }
    }
    append(node) {this.children.push(node); node.parentElement = this;}
    remove() {this.parentElement.children = this.parentElement.children.filter(node => node !== this);}
    focus() {doc.activeElement = this;}
    contains(node) {return node === this || this.children.some(child => child.contains(node));}
    matches(selector) {
      if (selector.endsWith(':checked')) return Boolean(this.checked) && this.matches(selector.slice(0,-8));
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      const attr = /^(\w+)?\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attr) return (!attr[1] || this.tagName === attr[1].toUpperCase()) &&
        (attr[3] === undefined ? attr[2] in this.attrs : this.attrs[attr[2]] === attr[3]);
      return this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) {return this.children.flatMap(node => [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]);}
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    closest(selector) {for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null;}
  }
  doc.createElement = tag => new Element(tag); doc.body = new Element('body'); doc.activeElement = doc.body;
  const audio = {available:true, plays:[], pauses:0, disposed:0,
    async play(sound, volume) {this.plays.push({sound,volume}); return true;},
    pause() {this.pauses++;}, setVolume() {}, dispose() {this.disposed++;},
  };
  const code = readFileSync(new URL('../src/calm-experience.js', import.meta.url),'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_,names,_quote,file) => `const {${names}}=imports[${JSON.stringify(file)}];`)
    .replace('export function mountCalm','function mountCalm');
  const context = vm.createContext({imports:{
    './calm-clock.js':clock, './calm-audio.js':{createCalmAudio:() => audio},
  }});
  vm.runInContext(code,context);
  const container = new Element('main');
  const cleanup = context.mountCalm(container,{onAnnounce:message => notices.push(message)});
  const root = container.children[0];
  const query = selector => {const node = root.querySelector(selector); assert.ok(node, selector); return node;};
  return {root, cleanup, query, audio, doc, view, frames, notices, container,
    click(action) {root.emit('click',{target:query(`[data-calm-action="${action}"]`)});},
    advance(ms) {now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));},
    choose(input) {
      for (const candidate of root.querySelectorAll('input')) if (candidate.name === input.name) candidate.checked = candidate === input;
      root.emit('change',{target:input});
    },
    remount() {const next = new Element('main'); const cleanup = context.mountCalm(next); return {root:next.children[0],cleanup};},
  };
}

test('breathing starts original space audio only on Start; rhythm and duration are initially folded', async () => {
  const app = mount();
  try {
    const preferences = app.query('.calm-preferences');
    assert.equal(preferences.tagName, 'DETAILS');
    assert.equal(preferences.open, false);
    assert.ok(preferences.contains(app.query('[data-calm="patterns"]')));
    assert.ok(preferences.contains(app.query('[data-calm="durations"]')));
    assert.equal(app.query('[data-calm="sound"]').value, 'space');
    assert.equal(app.audio.plays.length, 0);
    assert.equal(app.query('[data-calm-action="sound"]').getAttribute('aria-pressed'), 'true');
    preferences.open = true;
    app.click('primary'); await Promise.resolve();
    assert.deepEqual(app.audio.plays, [{sound:'space',volume:30}]);
    assert.equal(preferences.open, false, 'Start returns the focus to the breathing experience');
    assert.equal(app.root.dataset.state, 'running');
  } finally {app.cleanup();}
});

test('folded settings retain accessible native controls and keep active-session settings locked', () => {
  const app = mount();
  try {
    const preferences = app.query('.calm-preferences'); preferences.open = true;
    const duration = app.root.querySelectorAll('input').find(input => input.value === '180000');
    app.choose(duration);
    assert.match(app.query('[data-calm="timer"]').textContent, /3:00/);
    app.click('primary');
    assert.equal(app.query('[data-calm="patterns"]').disabled, true);
    assert.equal(app.query('[data-calm="durations"]').disabled, true);
    app.click('primary');
    assert.equal(app.root.dataset.state, 'paused');
    assert.equal(app.query('[data-calm="durations"]').disabled, true);
    const finish = app.query('[data-calm-action="finish"]'); finish.focus(); app.click('finish');
    assert.equal(app.query('[data-calm="durations"]').disabled, false);
    assert.equal(app.doc.activeElement, app.query('[data-calm-action="primary"]'));
  } finally {app.cleanup();}
});

test('mute survives pause, retry and remount; automatic absence freezes the clock and sound', () => {
  const app = mount();
  try {
    app.click('sound'); app.click('primary'); app.advance(4000);
    assert.equal(app.audio.plays.length, 0);
    app.view.emit('blur');
    const timer = app.query('[data-calm="timer"]').textContent;
    const pauses = app.audio.pauses;
    app.advance(90000);
    assert.equal(app.query('[data-calm="timer"]').textContent, timer);
    assert.equal(app.root.dataset.state, 'paused');
    assert.equal(app.frames.size, 0);
    app.click('primary'); app.click('finish'); app.click('primary');
    assert.equal(app.audio.plays.length, 0);
    assert.ok(app.audio.pauses >= pauses);
    app.cleanup();
    const next = app.remount();
    try {assert.equal(next.root.querySelector('[data-calm-action="sound"]').getAttribute('aria-pressed'), 'false');}
    finally {next.cleanup();}
  } finally {app.cleanup();}
});

test('pending audio activation cannot overwrite pause or leave work after cleanup', async () => {
  const app = mount();
  let resolve;
  app.audio.play = () => new Promise(done => {resolve = done;});
  app.click('primary');
  assert.equal(typeof resolve, 'function');
  app.doc.hidden = true; app.doc.emit('visibilitychange');
  resolve(true); await new Promise(done => setImmediate(done));
  assert.equal(app.root.dataset.state, 'paused');
  assert.equal(app.query('[data-calm="audio-badge"]').textContent, '已暂停');
  app.cleanup(); app.cleanup();
  assert.equal(app.audio.disposed, 1);
  assert.equal(app.frames.size, 0);
  assert.equal(app.container.children.length, 0);
  app.view.emit('blur'); app.view.emit('pagehide');
  assert.equal(app.frames.size, 0);
});
