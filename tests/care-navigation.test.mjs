import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as ui from '../src/ui.js';
import * as data from '../src/care-data.js';
import * as state from '../src/care-state.js';

const appURL = new URL('../src/care-app.js', import.meta.url);
// Run the real app in an isolated context without a browser or extra dependencies.
// Only module imports are adapted; navigation and click handlers stay unchanged.
const appSource = readFileSync(appURL, 'utf8').replace(
  /^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
  (_statement, bindings, _quote, specifier) =>
    `const {${bindings.replace(/\s+as\s+/g, ':')}} = imports[${JSON.stringify(specifier)}];`,
);

function eventTarget(properties = {}) {
  const listeners = new Map();
  return Object.assign({
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) || [])]) listener(event);
      return !event.defaultPrevented;
    },
  }, properties);
}

function createApp(initialHash = '#home') {
  const hashEvents = [];
  const mounts = [];
  let cleanupCalls = 0;
  let renderCount = 0;
  let activeInstance = null;
  let currentURL = new URL(initialHash, 'https://care.test/');
  const document = eventTarget({ activeElement: null, title: '' });
  const main = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(value) { this._html = value; renderCount += 1; },
    focus() { document.activeElement = this; },
    scrollIntoView() {},
    querySelector() { return null; },
  };
  const dialog = () => eventTarget({
    innerHTML: '', open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
  });
  const helpDialog = dialog();
  const leaveDialog = dialog();
  const mount = eventTarget();
  document.querySelector = selector => ({
    '#main': main,
    '#care-help-dialog': helpDialog,
    '#care-leave-dialog': leaveDialog,
    '#care-practice-mount': main.innerHTML.includes('id="care-practice-mount"') ? mount : null,
  })[selector] ?? null;
  document.querySelectorAll = () => [];
  document.getElementById = id => document.querySelector(`#${id}`);

  const location = {
    get href() { return currentURL.href; },
    get hash() { return currentURL.hash; },
    set hash(value) {
      const oldURL = currentURL.href;
      const nextURL = new URL(oldURL);
      nextURL.hash = value;
      if (nextURL.href === oldURL) return;
      currentURL = nextURL;
      // Hash writes change location immediately; their events run later in order.
      hashEvents.push({ type: 'hashchange', oldURL, newURL: nextURL.href });
    },
  };
  const history = {
    replaceState(_state, _title, url) {
      // replaceState changes the URL without queuing another hashchange.
      currentURL = new URL(url, currentURL);
    },
  };
  const window = eventTarget({ location, history, scrollY: 0, scrollTo() {} });
  const matchMedia = () => ({ matches: false });
  document.defaultView = window;
  window.matchMedia = matchMedia;
  new vm.Script(appSource, { filename: fileURLToPath(appURL) }).runInNewContext({
    document, window, location, history, matchMedia, Event, URL, console,
    setTimeout, clearTimeout,
    imports: {
      './ui.js': ui,
      './care-data.js': data,
      './care-state.js': state,
      './care-practices.js': {
        mountPractice(id, container) {
          assert.equal(container, mount);
          const instance = { id };
          mounts.push(instance);
          activeInstance = instance;
          return () => {
            cleanupCalls += 1;
            if (activeInstance === instance) activeInstance = null;
          };
        },
      },
    },
  });

  function click(target) {
    const event = {
      type: 'click', target, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    document.dispatchEvent(event);
    return event;
  }
  return {
    main, document, location, leaveDialog, mounts, hashEvents,
    get activeInstance() { return activeInstance; },
    get cleanupCalls() { return cleanupCalls; },
    get renderCount() { return renderCount; },
    flushOneHashChange() {
      assert.ok(hashEvents.length, 'a hashchange must be queued before delivery');
      window.dispatchEvent(hashEvents.shift());
    },
    flushHashChanges() {
      let delivered = 0;
      while (hashEvents.length) {
        assert.ok(delivered++ < 20, 'navigation must not create an endless hashchange loop');
        this.flushOneHashChange();
      }
    },
    clickLink(hash, { skip = false } = {}) {
      const link = {
        hash, href: new URL(hash, currentURL).href,
        classList: { contains: name => skip && name === 'care-skip' },
        closest(selector) {
          if (selector === 'a[href^="#"]' || selector === 'a') return this;
          if (skip && ['.care-skip', 'a.care-skip'].includes(selector)) return this;
          return null;
        },
      };
      const event = click(link);
      // Model the native fragment navigation unless the app prevented it.
      if (!event.defaultPrevented) location.hash = hash;
      return event;
    },
    clickButton(attribute) {
      return click({
        dataset: {},
        hasAttribute: name => name === attribute,
        closest(selector) { return selector === 'button' ? this : null; },
      });
    },
  };
}

function assertPracticeRetained(app, instance) {
  assert.equal(app.cleanupCalls, 0, 'unconfirmed navigation must not clean up the practice');
  assert.equal(app.mounts.length, 1, 'the existing practice must not be remounted');
  assert.equal(app.activeInstance, instance, 'the practice holding the inputs must survive');
}

test('organizing a problem opens its own choices and returns there after confirmed departure', () => {
  const app = createApp();
  app.clickLink('#organize');
  app.flushHashChanges();
  const choices = [...app.main.innerHTML.matchAll(/href="#practice\/([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(choices, ['worry', 'reframe', 'plan', 'boundary']);
  app.clickLink('#practice/boundary');
  app.flushHashChanges();
  assert.equal(app.activeInstance.id, 'boundary');
  app.clickButton('data-back');
  assert.equal(app.leaveDialog.open, true);
  assert.equal(app.cleanupCalls, 0);
  app.clickButton('data-leave');
  app.flushHashChanges();
  assert.equal(app.location.hash, '#organize');
  assert.equal(app.cleanupCalls, 1);
});

test('switching relaxation methods preserves the current exercise until departure is confirmed', () => {
  const app = createApp('#practice/settle');
  app.clickButton('data-back');
  assert.equal(app.leaveDialog.open, true);
  app.clickButton('data-stay');
  assert.equal(app.activeInstance.id, 'settle');
  app.clickButton('data-back');
  app.clickButton('data-leave');
  app.flushHashChanges();
  assert.equal(app.location.hash, '#calm');
  const choices = [...app.main.innerHTML.matchAll(/href="#practice\/([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(choices, ['settle', 'ground']);
  app.clickLink('#practice/ground');
  app.flushHashChanges();
  assert.equal(app.activeInstance.id, 'ground');
});

test('ordinary navigation mounts a practice and cleans it up only after confirmed departure', () => {
  const app = createApp();
  app.clickLink('#practice/plan');
  app.flushHashChanges();
  assert.equal(app.mounts.length, 1);
  assert.equal(app.activeInstance.id, 'plan');

  app.clickLink('#evidence');
  assert.equal(app.leaveDialog.open, true);
  assert.equal(app.cleanupCalls, 0);
  app.clickButton('data-leave');
  app.flushHashChanges();
  assert.equal(app.leaveDialog.open, false);
  assert.equal(app.location.hash, '#evidence');
  assert.equal(app.cleanupCalls, 1);
  assert.equal(app.activeInstance, null);
  assert.match(app.main.innerHTML, /care-evidence-list/);
});

test('consecutive hash events preserve the practice while departure is pending and after staying', () => {
  const app = createApp('#practice/plan');
  const instance = app.activeInstance;
  app.location.hash = '#notes';
  app.location.hash = '#evidence';
  assert.equal(app.hashEvents.length, 2);

  app.flushOneHashChange();
  assert.equal(app.leaveDialog.open, true);
  assertPracticeRetained(app, instance);
  app.flushHashChanges();
  assertPracticeRetained(app, instance);

  app.clickButton('data-stay');
  app.flushHashChanges();
  assert.equal(app.leaveDialog.open, false);
  assert.equal(app.location.hash, '#practice/plan');
  assertPracticeRetained(app, instance);
});

test('confirming consecutive hash navigation reaches the latest destination with one cleanup', () => {
  const app = createApp('#practice/plan');
  const instance = app.activeInstance;
  app.location.hash = '#notes';
  app.location.hash = '#evidence';
  app.flushHashChanges();
  assert.equal(app.leaveDialog.open, true);
  assertPracticeRetained(app, instance);

  app.clickButton('data-leave');
  app.flushHashChanges();
  assert.equal(app.leaveDialog.open, false);
  assert.equal(app.location.hash, '#evidence', 'the latest requested destination must not be lost');
  assert.equal(app.cleanupCalls, 1);
  assert.equal(app.mounts.length, 1);
  assert.equal(app.activeInstance, null);
  assert.match(app.main.innerHTML, /care-evidence-list/);
});

test('repeated navigation to the current practice preserves its instance', () => {
  const app = createApp('#practice/plan');
  const instance = app.activeInstance;
  app.clickLink('#practice/plan');
  app.clickLink('#practice/plan');
  app.flushHashChanges();

  assertPracticeRetained(app, instance);
  assert.equal(app.location.hash, '#practice/plan');
  assert.equal(app.leaveDialog.open, false);
});

for (const route of ['#evidence', '#practice/plan']) {
  test(`skip link focuses main directly without changing ${route} or remounting`, () => {
    const app = createApp(route);
    const instance = app.activeInstance;
    const renderCount = app.renderCount;
    const event = app.clickLink('#main', { skip: true });

    assert.equal(event.defaultPrevented, true, 'skip must suppress native hash navigation');
    assert.equal(app.document.activeElement, app.main, 'skip must focus the main content directly');
    assert.equal(app.location.hash, route);
    assert.equal(app.hashEvents.length, 0, 'skip must not queue a route change');
    app.flushHashChanges();
    assert.equal(app.renderCount, renderCount, 'skip must not replace the current page');
    assert.equal(app.activeInstance, instance);
    assert.equal(app.cleanupCalls, 0);
    assert.equal(app.leaveDialog.open, false);
  });
}
