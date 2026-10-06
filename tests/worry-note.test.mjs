import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import vm from 'node:vm';

// Browser boundaries only: the real module owns its state, input, callbacks and
// timers. Delayed native close events intentionally allow close/reopen races.
function fixture({reducedMotion = false, modalFails = false} = {}) {
  const targets = [], nativeCloseEvents = [], timers = new Map(), calls = [];
  let now = 0, nextTimer = 0;
  function events(object = {}) {
    const listeners = new Map();
    targets.push(listeners);
    object.addEventListener = (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    };
    object.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
    object.dispatchEvent = event => {
      for (const fn of [...listeners.get(event.type) ?? []]) fn(event);
      if (event.bubbles && !event.propagationStopped) object.parentElement?.dispatchEvent(event);
    };
    object.emit = (type, properties = {}) => {
      const event = {
        type, target: object, bubbles: false, defaultPrevented: false, propagationStopped: false,
        preventDefault() {this.defaultPrevented = true;},
        stopPropagation() {this.propagationStopped = true;},
        ...properties,
      };
      object.dispatchEvent(event);
      return event;
    };
    return object;
  }
  const forbidden = () => assert.fail('private writing must not use storage or network');
  const storage = new Proxy({}, {get: forbidden, set: forbidden});
  const win = events({
    performance: {now: () => now}, localStorage: storage, sessionStorage: storage,
    matchMedia: () => ({matches: reducedMotion}),
    setTimeout(fn, ms) {const id = ++nextTimer; timers.set(id, {fn, at: now + ms}); return id;},
    clearTimeout(id) {timers.delete(id);},
  });
  const doc = events({defaultView: win, hidden: false, activeElement: null});
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.ownerDocument = doc;
      this.children = []; this.attributes = {}; this.dataset = {}; this._text = '';
      this.value = ''; this.defaultValue = ''; this.hidden = this.disabled = this.open = false;
      this.style = {setProperty() {}};
      this.classList = {
        add: (...names) => {this.className = [...new Set([...this.className.split(' '), ...names])].join(' ');},
        remove: (...names) => {this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' ');},
        toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name),
        contains: name => this.className.split(' ').includes(name),
      };
      events(this);
    }
    get className() {return this.attributes.class || '';}
    set className(value) {this.attributes.class = value;}
    get isConnected() {return this === container || Boolean(this.parentElement?.isConnected);}
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (['hidden', 'disabled'].includes(key)) this[key] = true;
    }
    get textContent() {return this._text + this.children.map(child => child.textContent).join('');}
    set textContent(value) {this._text = String(value); this.children = [];}
    set innerHTML(value) {
      this.children = []; this._text = '';
      const stack = [this];
      for (const token of value.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
        if (token[3]) {stack.at(-1)._text += token[3]; continue;}
        if (token[0].startsWith('</')) {stack.pop(); continue;}
        const child = new Element(token[1]);
        for (const attr of token[2].matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) child.setAttribute(attr[1], attr[2] || '');
        stack.at(-1).append(child);
        if (!['INPUT', 'BR', 'HR'].includes(child.tagName)) stack.push(child);
      }
    }
    append(child) {child.parentElement = this; this.children.push(child);}
    remove() {this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null;}
    focus() {doc.activeElement = this;}
    showModal() {if (modalFails) throw new Error('dialog unavailable'); this.open = true;}
    close() {if (!this.open) return; this.open = false; nativeCloseEvents.push(() => this.emit('close'));}
    matches(selector) {
      if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
      const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attr) return attr[2] === undefined ? attr[1] in this.attributes : this.attributes[attr[1]] === attr[2];
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) {
      for (let element = this; element; element = element.parentElement) if (element.matches(selector)) return element;
      return null;
    }
    querySelector(selector) {
      for (const child of this.children) {
        if (child.matches(selector)) return child;
        const nested = child.querySelector(selector); if (nested) return nested;
      }
      return null;
    }
  }
  doc.createElement = tag => new Element(tag);
  const container = new Element('main');
  const sourceURL = new URL('../src/worry-note.js', import.meta.url);
  const source = existsSync(sourceURL) ? readFileSync(sourceURL, 'utf8') : '';
  const context = vm.createContext({
    console, document: doc, window: win, fetch: forbidden, navigator: {sendBeacon: forbidden},
    localStorage: storage, sessionStorage: storage, XMLHttpRequest: forbidden, WebSocket: forbidden,
  });
  vm.runInContext(source.replace('export function mountWorryNote', 'function mountWorryNote'), context);
  assert.equal(typeof context.mountWorryNote, 'function', 'the standalone worry note module must exist');
  const cleanup = context.mountWorryNote(container, {
    onOpen: (...args) => calls.push(['open', ...args]),
    onClose: (...args) => calls.push(['close', ...args]),
    onAnnounce: (...args) => calls.push(['announce', ...args]),
  });
  const root = container.children[0];
  const query = selector => {
    const element = root.querySelector(selector); assert.ok(element, `missing control: ${selector}`); return element;
  };
  return {
    cleanup, root, container, query, calls, win, doc, timers,
    get listenerCount() {return targets.reduce((sum, listeners) => sum + [...listeners.values()].reduce((n, list) => n + list.size, 0), 0);},
    click(action) {return query(`[data-worry-action="${action}"]`).emit('click', {bubbles: true});},
    input(text) {const element = query('textarea'); element.value = text; element.emit('input', {bubbles: true});},
    flushClose() {nativeCloseEvents.splice(0).forEach(fn => fn());},
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const pending = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!pending) break;
        now = pending[1].at; timers.delete(pending[0]); pending[1].fn();
      }
      now = end;
    },
  };
}

const count = (app, kind) => app.calls.filter(call => call[0] === kind).length;
const isDone = app => !app.query('[data-worry-action="done"]').hidden;

test('crumpling destroys the writing before showing paper, and completion waits for an explicit close', t => {
  const app = fixture(); t.after(app.cleanup);
  app.click('open');
  assert.equal(count(app, 'open'), 1);
  assert.equal(app.query('dialog').open, true);
  app.input('私密的事情'.repeat(80));
  assert.equal(app.query('textarea').value.length, 240);
  const privateText = 'only this textarea may hold my private sentence';
  let parentInputs = 0;
  const parentInput = () => parentInputs++;
  app.container.addEventListener('input', parentInput);
  app.input(privateText);
  assert.equal(parentInputs, 0, 'private textarea input must not enter host game input handlers');
  app.container.removeEventListener('input', parentInput);
  app.query('textarea').defaultValue = privateText;
  app.click('crumple');
  assert.equal(app.query('textarea').value, '');
  assert.equal(app.query('textarea').defaultValue, '');
  assert.equal(app.root.textContent.includes(privateText), false);
  assert.equal(JSON.stringify(app.calls).includes(privateText), false);
  assert.equal(app.query('.release-worry-writing').hidden, true);
  assert.equal(app.query('.release-worry-ball-step').hidden, false);
  app.click('toss'); app.click('toss');
  assert.equal(app.timers.size, 1);
  app.advance(850); assert.equal(isDone(app), false);
  app.advance(100); assert.equal(isDone(app), true);
  assert.equal(app.query('dialog').open, true);
  assert.equal(count(app, 'close'), 0);
  app.click('done'); app.flushClose();
  assert.equal(count(app, 'close'), 1);
  assert.ok(app.doc.activeElement === app.query('[data-worry-action="open"]'));
  app.click('open');
  assert.equal(app.query('textarea').value, '');
});

test('Escape stays inside the native dialog and every exit clears the form', t => {
  for (const exit of ['close', 'cancel', 'native-close', 'pagehide']) {
    const app = fixture(); t.after(app.cleanup);
    app.click('open'); app.input('erase on ' + exit);
    let parentKeys = 0;
    const parentKey = () => parentKeys++;
    app.container.addEventListener('keydown', parentKey);
    const key = app.query('textarea').emit('keydown', {key: 'Escape', bubbles: true});
    assert.equal(parentKeys, 0);
    assert.equal(key.defaultPrevented, false, 'native Escape must still generate its cancel event');
    app.container.removeEventListener('keydown', parentKey);
    if (exit === 'cancel') {
      const cancel = app.query('dialog').emit('cancel');
      assert.equal(cancel.defaultPrevented, true);
      assert.equal(cancel.propagationStopped, true);
    } else if (exit === 'native-close') app.query('dialog').close();
    else if (exit === 'pagehide') app.win.emit('pagehide');
    else app.click('close');
    app.flushClose();
    assert.equal(app.query('textarea').value, '');
    assert.equal(app.query('textarea').textContent, '');
    assert.equal(count(app, 'close'), 1);
    assert.equal(app.query('dialog').open, false);
  }
});

test('blur and hidden time do not consume the remaining toss or resume the parent', t => {
  const app = fixture(); t.after(app.cleanup);
  app.click('open'); app.click('crumple'); app.click('toss'); app.advance(300);
  app.win.emit('blur');
  app.doc.hidden = true; app.doc.emit('visibilitychange');
  assert.equal(app.timers.size, 0);
  app.advance(10000);
  app.doc.hidden = false; app.doc.emit('visibilitychange'); app.win.emit('focus');
  assert.equal(isDone(app), false);
  assert.equal(app.timers.size, 0, 'returning to the tab still waits for explicit continue');
  app.click('continue');
  app.advance(580); assert.equal(isDone(app), false);
  app.advance(30); assert.equal(isDone(app), true);
  assert.equal(count(app, 'open'), 1);
  assert.equal(count(app, 'close'), 0);
  assert.equal(app.query('dialog').open, true);
});

test('disposing an active note clears private text, clock, listeners and owned DOM exactly once', t => {
  for (const phase of ['writing', 'tossing']) {
    const app = fixture(); t.after(app.cleanup);
    app.click('open'); app.input('private before disposal');
    if (phase === 'tossing') {
      app.click('crumple'); app.click('toss');
      // A late input must not reintroduce text into a discarded form.
      app.input('late private input');
      assert.equal(app.query('textarea').value, '');
      assert.equal(app.timers.size, 1);
    }
    const textarea = app.query('textarea');
    app.cleanup(); app.cleanup(); app.flushClose(); app.advance(5000);
    assert.equal(textarea.value, '');
    assert.equal(textarea.textContent, '');
    assert.equal(app.timers.size, 0);
    assert.equal(app.listenerCount, 0);
    assert.equal(app.container.children.length, 0);
    assert.equal(count(app, 'close'), 1);
  }
});

test('a queued close from the previous opening cannot close a newly opened note', t => {
  const app = fixture(); t.after(app.cleanup);
  app.click('open'); app.click('close'); app.click('open'); app.input('new opening');
  app.flushClose();
  assert.equal(app.query('dialog').open, true);
  assert.equal(app.query('textarea').value, 'new opening');
  assert.equal(count(app, 'open'), 2);
  assert.equal(count(app, 'close'), 1);
});

test('reduced motion completes without a moving timer and a failed modal balances the parent callbacks', t => {
  const reduced = fixture({reducedMotion: true}); t.after(reduced.cleanup);
  reduced.click('open'); reduced.click('crumple'); reduced.click('toss');
  reduced.advance(200);
  assert.equal(isDone(reduced), true);
  assert.equal(reduced.timers.size, 0);
  assert.equal(count(reduced, 'close'), 0);
  const failed = fixture({modalFails: true}); t.after(failed.cleanup);
  failed.click('open');
  assert.equal(failed.query('dialog').open, false);
  assert.equal(count(failed, 'open'), 1);
  assert.equal(count(failed, 'close'), 1);
  assert.equal(count(failed, 'announce'), 1);
  assert.equal(failed.query('textarea').value, '');
});
