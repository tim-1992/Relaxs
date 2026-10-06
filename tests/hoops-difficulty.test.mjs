import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setMaxListeners} from 'node:events';
import vm from 'node:vm';
import {
  HOOP, BALL_START, createShot, velocityFromAim, stepShot, predictTrajectory,
} from '../src/hoops-physics.js';

function simulate(aim, challenge, dt = 1 / 60) {
  const shot = createShot(velocityFromAim(aim), {wind: challenge.wind});
  for (let frame = 0; frame < Math.ceil(6 / dt) && !shot.done; frame++) {
    stepShot(shot, dt, challenge.hoop);
  }
  return shot;
}

test('constant wind bends a real airborne shot in the declared direction', () => {
  const calm = createShot({x: 0, y: 8, z: -6});
  const right = createShot({x: 0, y: 8, z: -6}, {wind: {x: 1.2, z: 0}});
  const left = createShot({x: 0, y: 8, z: -6}, {wind: {x: -1.2, z: 0}});
  for (let frame = 0; frame < 30; frame++) {
    for (const shot of [calm, right, left]) stepShot(shot, 1 / 60);
  }
  assert.ok(Math.abs(calm.position.x) < 1e-10);
  assert.ok(Math.abs(right.position.x - .15) < 1e-8);
  assert.ok(Math.abs(left.position.x + .15) < 1e-8);
  assert.ok(Math.abs(right.velocity.x - .6) < 1e-8);
  assert.equal(right.position.y, calm.position.y);
});

test('a launched shot keeps its wind when later conditions are changed', () => {
  const wind = {x: .8, z: 0};
  const shot = createShot({x: 0, y: 8, z: -6}, {wind});
  wind.x = -100;
  stepShot(shot, .1);
  assert.ok(shot.position.x > 0 && shot.position.x < .01);
  const invalid = createShot({x: 0, y: 8, z: -6}, {wind: {x: Infinity, z: NaN}});
  stepShot(invalid, .1);
  assert.ok(Object.values(invalid.position).every(Number.isFinite));
});

test('short trajectory uses the same wind integration as flight and hides the landing', () => {
  const velocity = velocityFromAim({x: -.24, power: .7});
  const wind = {x: 1.1, z: 0};
  const short = predictTrajectory(velocity, HOOP, {wind, maxTime: .6});
  const full = predictTrajectory(velocity, HOOP, {wind});
  assert.equal(short.length, 13);
  assert.ok(full.length > short.length + 8);
  const shot = createShot(velocity, {wind});
  for (let index = 1; index < short.length; index++) {
    stepShot(shot, .05, HOOP);
    assert.deepEqual(short[index], shot.position);
  }
  assert.ok(short.at(-1).z > HOOP.z + 3);
});

test('misses retain a measured descending crossing for distance and direction feedback', () => {
  const shot = simulate({x: .8, power: .6}, {hoop: HOOP, wind: {x: 0, z: 0}});
  assert.equal(shot.scored, false);
  assert.ok(shot.crossing);
  assert.equal(shot.crossing.y, HOOP.y);
  assert.ok(shot.crossing.x > HOOP.x + 1);
});

test('difficulty layouts are fixed, change both distance and side, and preserve easy practice', async () => {
  const {getHoopsChallenge} = await import('../src/hoops-challenges.js');
  const defaults = getHoopsChallenge();
  assert.deepEqual(defaults.hoop, HOOP);
  assert.deepEqual(defaults.wind, {x: 0, z: 0});
  for (const difficulty of ['standard', 'hard']) {
    const layouts = Array.from({length: 10}, (_, index) => getHoopsChallenge(difficulty, index));
    for (let index = 1; index < layouts.length; index++) {
      assert.notEqual(layouts[index].hoop.x, layouts[index - 1].hoop.x);
      assert.notEqual(layouts[index].hoop.z, layouts[index - 1].hoop.z);
    }
    assert.ok(new Set(layouts.map(item => item.hoop.z)).size >= 7);
    assert.deepEqual(layouts, Array.from({length: 10}, (_, index) => getHoopsChallenge(difficulty, index)));
    const practice = getHoopsChallenge(difficulty, 7, {practice: true});
    assert.deepEqual(practice.hoop, HOOP);
    assert.deepEqual(practice.wind, {x: 0, z: 0});
    assert.ok(practice.previewSeconds > layouts.at(-1).previewSeconds || difficulty === 'standard');
  }
  const hard = getHoopsChallenge('hard', 0);
  assert.notEqual(hard.wind.x, 0);
  assert.ok(hard.previewSeconds < getHoopsChallenge('standard', 0).previewSeconds / 2);
  hard.hoop.x = 999;
  hard.wind.x = 999;
  assert.notEqual(getHoopsChallenge('hard', 0).hoop.x, 999);
  assert.notEqual(getHoopsChallenge('hard', 0).wind.x, 999);
});

// Search only values reachable from the visible direction/power buttons.
// No stored answer, aiming assistance, or alternative physics is used here.
const directions = [...new Set([0, ...Array.from({length: 16}, (_, index) =>
  [(index + 1) * .06, -(index + 1) * .06]).flat(), 1, -1])];
const powers = Array.from({length: 39}, (_, index) => Number((.05 + index * .025).toFixed(3)));

test('every standard/hard puzzle has a real keyboard-reachable solution at multiple frame rates', async () => {
  const {getHoopsChallenge} = await import('../src/hoops-challenges.js');
  for (const difficulty of ['standard', 'hard']) {
    for (let index = 0; index < 10; index++) {
      const challenge = getHoopsChallenge(difficulty, index);
      let answer;
      search: for (const power of powers) {
        for (const x of directions) {
          const aim = {x, power};
          if ([1 / 30, 1 / 60, 1 / 120].every(dt => simulate(aim, challenge, dt).scored)) {
            answer = aim;
            break search;
          }
        }
      }
      assert.ok(answer, `${difficulty} puzzle ${index + 1} has no usable solution`);
    }
  }
});

test('default 60% cannot clear standard/hard, even by tuning direction alone', async () => {
  const {getHoopsChallenge} = await import('../src/hoops-challenges.js');
  for (const difficulty of ['standard', 'hard']) {
    let defaultWins = 0;
    let powerChangesNeeded = 0;
    for (let index = 0; index < 10; index++) {
      const challenge = getHoopsChallenge(difficulty, index);
      if (simulate({x: 0, power: .6}, challenge).scored) defaultWins++;
      if (!directions.some(x => simulate({x, power: .6}, challenge).scored)) powerChangesNeeded++;
    }
    assert.ok(defaultWins <= 2, `${difficulty}: default clears ${defaultWins}/10`);
    assert.ok(powerChangesNeeded >= 6, `${difficulty}: only ${powerChangesNeeded} layouts require a power change`);
  }
  assert.ok(simulate({x: 0, power: .6}, {hoop: HOOP, wind: {x: 0, z: 0}}).scored);
});

test('puzzle misses can retry, solved layouts advance manually, and reset is independent', async () => {
  const {createHoopsPuzzle, recordHoopsAttempt, nextHoopsPuzzle} = await import('../src/hoops-challenges.js');
  const run = createHoopsPuzzle('hard');
  assert.equal(nextHoopsPuzzle(run), false);
  recordHoopsAttempt(run, false);
  recordHoopsAttempt(run, false);
  assert.equal(run.index, 0);
  assert.equal(run.attempts, 2);
  assert.equal(run.stageAttempts, 2);
  assert.equal(run.solved, 0);
  assert.equal(run.status, 'aiming');
  recordHoopsAttempt(run, true);
  assert.equal(run.status, 'cleared');
  assert.equal(run.index, 0);
  assert.equal(run.solved, 1);
  assert.equal(recordHoopsAttempt(run, true), false);
  assert.equal(nextHoopsPuzzle(run), true);
  assert.equal(run.index, 1);
  assert.equal(run.stageAttempts, 0);
  for (let index = 1; index < 10; index++) {
    recordHoopsAttempt(run, true);
    if (index < 9) assert.equal(nextHoopsPuzzle(run), true);
  }
  assert.equal(run.status, 'complete');
  assert.equal(run.solved, 10);
  assert.equal(run.attempts, 12);
  assert.equal(nextHoopsPuzzle(run), false);
  const reset = createHoopsPuzzle('hard');
  assert.equal(reset.index, 0);
  assert.equal(reset.attempts, 0);
  assert.equal(reset.status, 'aiming');
  assert.deepEqual(BALL_START, {x: 0, y: 1.45, z: 5.6});
});

test('throw windup freezes at zero dt, releases once, and leaves only post-release time for physics', async () => {
  const {createThrowMotion, stepThrowMotion} = await import('../src/hoops-physics.js');
  assert.equal(typeof createThrowMotion, 'function');
  const motion = createThrowMotion(.8);
  const held = structuredClone(motion);
  for (const dt of [0, -1, NaN, Infinity]) {
    assert.equal(stepThrowMotion(motion, dt).release, false);
    assert.deepEqual(motion, held);
  }
  let releases = 0, flightTime = 0, elapsed = 0, releaseAt;
  for (let frame = 0; frame < 30; frame++) {
    const step = stepThrowMotion(motion, .05);
    elapsed += .05;
    if (step.release) { releases++; releaseAt = elapsed - step.flightTime; }
    flightTime += step.flightTime;
    assert.ok(motion.action >= 0 && motion.action <= 1);
  }
  assert.equal(releases, 1);
  assert.ok(releaseAt > .2 && releaseAt < .5, 'hands must rise before release');
  assert.ok(Math.abs(flightTime - (elapsed - releaseAt)) < 1e-10);
  assert.equal(motion.finished, true);
  assert.equal(motion.action, 1, 'the follow-through must return to a resting pose');
});

test('every character releases at the calibrated physics origin, with a visible held-ball lift', async () => {
  const {createHoopsShooter} = await import('../src/hoops-scene.js');
  const {SPORT_CHARACTERS} = await import('../src/sport-avatar.js');
  const {HOOPS_RELEASE_ACTION} = await import('../src/hoops-physics.js');
  assert.equal(typeof createHoopsShooter, 'function');
  const shooter = createHoopsShooter();
  for (const character of SPORT_CHARACTERS) {
    shooter.setCharacter(character.id);
    for (const aim of [{x: 0, power: .6}, {x: -.96, power: .9}, {x: .96, power: .3}]) {
      const held = shooter.update({action: 0, aim}).clone();
      const release = shooter.update({action: HOOPS_RELEASE_ACTION, aim}).clone();
      assert.ok(release.y - held.y > .4, `${character.id} must lift the ball`);
      assert.ok(release.distanceTo({x: 0, y: 1.45, z: 5.6}) < 1e-8);
      assert.equal(shooter.group.position.y, 0, 'the character stands on the court');
      const shot = createShot(velocityFromAim(aim), {wind: {x: 1.25}});
      assert.ok(release.distanceTo(shot.position) < 1e-8, 'no teleport when physics takes over');
    }
  }
  shooter.dispose();
  shooter.dispose();
});

test('the court camera keeps the entire shooter and all puzzle baskets inside phone and desktop frames', async () => {
  const THREE = await import('three');
  const {createHoopsCamera, createHoopsShooter} = await import('../src/hoops-scene.js');
  const {getHoopsChallenge} = await import('../src/hoops-challenges.js');
  assert.equal(typeof createHoopsCamera, 'function');
  const shooter = createHoopsShooter();
  for (const [width, height] of [[284, 600], [390, 700], [900, 560]]) {
    let camera = createHoopsCamera(width, height);
    const screen = point => {
      const projected = point.clone().project(camera);
      return {x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2};
    };
    for (const character of ['moss', 'peach', 'robot']) {
      shooter.setCharacter(character);
      for (const action of [0, .22, .55, .8]) for (const x of [-1, 0, 1]) {
        shooter.update({action, aim: {x}});
        const bounds = new THREE.Box3().setFromObject(shooter.group);
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z]) {
              const point = screen(new THREE.Vector3(x, y, z));
              assert.ok(point.x > 8 && point.x < width - 8, `${character} cropped horizontally`);
              assert.ok(point.y > height * .05 && point.y < height * .95, `${character} cropped vertically`);
            }
      }
    }
    for (const difficulty of ['standard', 'hard']) for (let index = 0; index < 10; index++) {
      const hoop = getHoopsChallenge(difficulty, index).hoop;
      camera = createHoopsCamera(width, height, {hoop});
      for (const side of [-1, 1]) {
        const point = screen(new THREE.Vector3(hoop.x + side * .95, hoop.y + 1.3, hoop.z - .62));
        assert.ok(point.x > 8 && point.x < width - 8, 'backboard must remain in view');
        assert.ok(point.y > height * .05 && point.y < height * .7, 'basket must be visible ahead of the player');
      }
    }
  }
  shooter.dispose();
});

test('the complete scene constructs and animates the character without unresolved camera references', async () => {
  const THREE = await import('three');
  const avatars = await import('../src/sport-avatar.js');
  const physics = await import('../src/hoops-physics.js');
  let rendered;
  class RendererBoundary {
    constructor() {
      this.shadowMap = {}; this.renderLists = {dispose() {}};
      this.capabilities = {getMaxAnisotropy: () => 1};
    }
    setPixelRatio() {} setSize() {} dispose() {}
    render(scene, camera) {rendered = {scene, camera};}
  }
  const source = readFileSync(new URL('../src/hoops-scene.js', import.meta.url), 'utf8')
    .replace("import * as THREE from 'three';", 'const THREE = imports.three;')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replaceAll('export function ', 'function ')
    .replaceAll('export const ', 'const ');
  const context = vm.createContext({console, imports: {
    three: {...THREE, WebGLRenderer: RendererBoundary},
    './sport-avatar.js': avatars, './hoops-physics.js': physics,
  }});
  vm.runInContext(source, context);
  const scene = context.createHoopsScene({
    clientWidth: 390, clientHeight: 700,
    ownerDocument: {defaultView: {devicePixelRatio: 1}},
  });
  try {
    const held = scene.render({holding: true, action: 0}, 0).clone();
    const raised = scene.render({holding: true, action: .55}, .05).clone();
    assert.ok(raised.y - held.y > .4);
    assert.ok(raised.distanceTo(BALL_START) < 1e-8);
    assert.ok(rendered.scene.getObjectByName('right-hand'), 'static batching must leave animated hands in the rig');
    scene.setCharacter('peach');
    scene.render({holding: true}, 0);
    assert.equal(rendered.scene.getObjectByName('basketball-avatar').userData.character, 'peach');
  } finally {
    scene.dispose(); scene.dispose();
  }
});

// Exercise the mounted controller with real physics, camera and character rig.
// This small DOM/RAF boundary replaces browser APIs and the GPU draw only.
async function mountedHoops(options = {}) {
  const physics = await import('../src/hoops-physics.js');
  const challenges = await import('../src/hoops-challenges.js');
  const characters = await import('../src/sport-avatar.js');
  const {createHoopsShooter, createHoopsCamera} = await import('../src/hoops-scene.js');
  function events(object = {}) {
    const listeners = new Map();
    object.addEventListener = (type, fn, config = {}) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      if (config.signal) {
        setMaxListeners(0, config.signal);
        config.signal.addEventListener('abort', () => listeners.get(type).delete(fn), {once: true});
      }
    };
    object.emit = (type, properties = {}) => {
      const event = {target: object, preventDefault() {this.defaultPrevented = true;}, ...properties};
      for (const fn of [...listeners.get(type) ?? []]) fn(event);
      return event;
    };
    return object;
  }
  const doc = events({hidden: false}), win = events();
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {};
      this.ownerDocument = doc; this.style = {setProperty() {}}; this._text = '';
      this.classList = {
        add: (...names) => {this.className = [...new Set([...this.className.split(' '), ...names])].join(' ');},
        remove: (...names) => {this.className = this.className.split(' ').filter(name => !names.includes(name)).join(' ');},
        toggle: (name, enabled) => enabled ? this.classList.add(name) : this.classList.remove(name),
      };
      events(this);
    }
    get className() {return this.attributes.class || '';}
    set className(value) {this.attributes.class = value;}
    setAttribute(key, value) {
      this.attributes[key] = String(value);
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value);
      if (['hidden', 'disabled'].includes(key)) this[key] = true;
      if (key === 'value') this.value = value;
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
        stack.at(-1).appendChild(child);
        if (!['INPUT', 'BR', 'HR', 'IMG'].includes(child.tagName) && !token[0].endsWith('/>')) stack.push(child);
      }
    }
    appendChild(child) {child.parentElement = this; this.children.push(child);}
    remove() {this.parentElement.children = this.parentElement.children.filter(child => child !== this);}
    focus() {doc.activeElement = this;}
    getBoundingClientRect() {return {left: 0, top: 0, width: 390, height: 700};}
    setPointerCapture(id) {this.capture = id;}
    hasPointerCapture(id) {return this.capture === id;}
    releasePointerCapture() {this.capture = undefined;}
    matches(selector) {
      if (selector.startsWith('.')) return this.className.split(' ').includes(selector.slice(1));
      const attribute = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
      if (attribute) return attribute[2] === undefined ? attribute[1] in this.attributes : this.attributes[attribute[1]] === attribute[2];
      return this.tagName === selector.toUpperCase();
    }
    closest(selector) {
      for (let element = this; element; element = element.parentElement)
        if (selector.split(',').some(part => element.matches(part))) return element;
      return null;
    }
    querySelector(selector) {
      for (const child of this.children) {
        if (child.matches(selector)) return child;
        const nested = child.querySelector(selector); if (nested) return nested;
      }
      return null;
    }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
      ]);
    }
  }
  doc.createElement = tag => new Element(tag);
  let now = 0, sequence = 0, lastFrame, played = 0, disposed = 0, currentView;
  const frames = new Map(), shooter = createHoopsShooter(), camera = createHoopsCamera(390, 700);
  const music = {enabled:false,paused:false,destroyed:false,
    async enable(){this.enabled=true;return true;},disable(){this.enabled=false;},
    pause(){this.paused=true;},async resume(){this.paused=false;return true;},dispose(){this.destroyed=true;}};
  const scene = {
    resize() {}, burst() {}, setCharacter: shooter.setCharacter,
    setView(value) {currentView = value;},
    project(point) {const p = shooter.group.position.clone().copy(point).project(camera); return {x: (p.x + 1) * 195, y: (1 - p.y) * 350};},
    render(state) {
      const grip = shooter.update(state);
      const ball = state.holding ? grip : state.ball;
      lastFrame = structuredClone({...state, ball: {x: ball.x, y: ball.y, z: ball.z}});
      return ball;
    },
    dispose() {disposed++; shooter.dispose();},
  };
  const source = readFileSync(new URL('../src/hoops.js', import.meta.url), 'utf8')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace('export function mountHoops', 'function mountHoops');
  const context = vm.createContext({
    document: doc, window: win, AbortController, console,
    ResizeObserver: class {observe() {} disconnect() {}},
    requestAnimationFrame(fn) {frames.set(++sequence, fn); return sequence;},
    cancelAnimationFrame(id) {frames.delete(id);},
    imports: {'./hoops-physics.js': physics, './hoops-challenges.js': challenges,
      './hoops-music.js': {createHoopsMusic: () => music},
      './sport-avatar.js': characters, './hoops-scene.js': {createHoopsScene: (_canvas, config) => {
        currentView = config.view; return scene;
      }}},
  });
  vm.runInContext(source, context);
  const container = new Element('main');
  const cleanup = context.mountHoops(container, {markPlayed() {played++;}, embedded: true, ...options});
  const root = container.children[0];
  const query = selector => {
    const result = root.querySelector(selector); assert.ok(result, `missing controller element: ${selector}`); return result;
  };
  return {
    root, query, cleanup, win, doc, frames, shooter, music,
    get lastFrame() {return lastFrame;}, get played() {return played;}, get disposed() {return disposed;},
    get currentView() {return currentView;},
    click(selector) {root.emit('click', {target: query(selector), detail: 0});},
    advance(milliseconds) {
      const end = now + milliseconds;
      while (now < end) {
        now = Math.min(end, now + 1000 / 60);
        const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now));
      }
    },
  };
}

test('mounted hoops freezes a held windup on pause, prevents duplicate launches, then scores with real physics', async t => {
  const app = await mountedHoops();
  t.after(app.cleanup);
  app.click('[data-h="start"]');
  const selector = app.query('[data-h-character]');
  selector.focus(); selector.value = 'robot'; selector.emit('change');
  assert.ok(app.doc.activeElement === selector, 'native character selection must retain keyboard focus');
  assert.equal(app.shooter.group.userData.character, 'robot');
  app.click('[data-h="shoot"]');
  app.click('[data-h="shoot"]');
  app.advance(180);
  assert.equal(app.root.dataset.phase, 'windup');
  assert.equal(app.lastFrame.holding, true);
  assert.equal(app.played, 1);
  assert.equal(selector.disabled, true);
  app.click('[data-h="pause"]');
  const frozen = structuredClone(app.lastFrame);
  app.advance(2000);
  assert.equal(app.root.dataset.phase, 'paused');
  assert.deepEqual(app.lastFrame, frozen);
  app.click('[data-h="resume"]');
  app.advance(100);
  assert.equal(app.root.dataset.phase, 'windup', 'pause time must not finish the windup');
  app.advance(200);
  assert.equal(app.root.dataset.phase, 'flight');
  assert.equal(app.lastFrame.holding, false);
  assert.ok(app.lastFrame.ball.y > BALL_START.y);
  app.advance(4000);
  assert.equal(app.root.dataset.phase, 'ready');
  assert.equal(app.query('[data-h-score]').textContent, '3');
  assert.equal(app.played, 1);
  assert.equal(app.shooter.group.userData.character, 'robot');
  assert.equal(selector.disabled, false);
});

test('restart cancels a pending throw and cleanup removes its clock and character resources', async () => {
  const app = await mountedHoops({difficulty: 'hard'});
  app.click('[data-h="start"]');
  app.click('[data-h="shoot"]');
  app.advance(100);
  app.win.emit('blur');
  assert.equal(app.root.dataset.phase, 'paused');
  app.click('[data-h="restart"]');
  app.advance(600);
  assert.equal(app.root.dataset.phase, 'ready');
  assert.equal(app.lastFrame.holding, true);
  assert.equal(app.query('[data-h-score]').textContent, '0');
  const escape = app.root.emit('keydown', {key: 'Escape', code: 'Escape'});
  assert.equal(escape.defaultPrevented, undefined, 'embedded Escape must reach the parent');
  assert.equal(app.root.dataset.phase, 'ready');
  let geometryDisposed = false;
  app.shooter.group.getObjectByName('avatar-head').geometry.addEventListener('dispose', () => {geometryDisposed = true;});
  app.cleanup(); app.cleanup();
  assert.equal(app.frames.size, 0);
  assert.equal(app.disposed, 1);
  assert.equal(geometryDisposed, true);
});

test('left/right aiming is visible without expanding power controls and recenter preserves power', async t => {
  const app = await mountedHoops();
  t.after(app.cleanup);
  app.click('[data-h="start"]');
  assert.equal(app.root.dataset.view, 'court');
  assert.equal(app.currentView, 'court');
  assert.equal(app.query('.hoops-direction-controls').hidden, false);
  assert.equal(app.query('.hoops-assist').hidden, true);
  app.click('[data-h="left"]');
  app.advance(20);
  assert.equal(app.lastFrame.aim.x, -.06);
  assert.match(app.query('[data-h-direction]').textContent, /左/);
  assert.equal(app.query('.hoops-assist').hidden, true);
  assert.ok(app.lastFrame.trajectory.length > 0, 'direction buttons should expose a real trajectory');
  app.click('[data-h="right"]'); app.click('[data-h="right"]');
  app.advance(20);
  assert.equal(app.lastFrame.aim.x, .06);
  app.click('[data-h="stronger"]');
  const power = app.query('[data-h-power]').textContent;
  app.click('[data-h="center"]');
  app.advance(20);
  assert.equal(app.lastFrame.aim.x, 0);
  assert.equal(app.query('[data-h-direction]').textContent, '正中');
  assert.equal(app.query('[data-h-power]').textContent, power);
});

test('the retained third-person control preserves aim, question and a paused throw without advancing its clock', async t => {
  const app = await mountedHoops({difficulty: 'standard'});
  t.after(app.cleanup);
  app.click('[data-h="start"]');
  app.click('[data-h="left"]'); app.click('[data-h="weaker"]');
  app.advance(20);
  const aim = structuredClone(app.lastFrame.aim), hoop = structuredClone(app.lastFrame.hoop);
  app.click('[data-h-view="court"]');
  assert.equal(app.currentView, 'court');
  assert.deepEqual(app.lastFrame.aim, aim);
  assert.deepEqual(app.lastFrame.hoop, hoop);
  app.click('[data-h="shoot"]'); app.advance(150); app.click('[data-h="pause"]');
  const before = structuredClone(app.lastFrame);
  app.click('[data-h-view="court"]');
  assert.equal(app.root.dataset.phase, 'paused');
  assert.equal(app.currentView, 'court');
  assert.equal(app.lastFrame.time, before.time);
  assert.equal(app.lastFrame.action, before.action);
  assert.deepEqual(app.lastFrame.ball, before.ball);
  assert.equal(app.query('[data-h-score]').textContent, '0');
  assert.equal(app.played, 1);
  assert.equal(app.frames.size, 0);
});

test('switching perspective cancels a captured drag without throwing on pointer release', async t => {
  const app = await mountedHoops();
  t.after(app.cleanup);
  app.click('[data-h="start"]'); app.advance(20);
  const handle = app.query('[data-h="ball"]'), surface = app.query('.hoops-surface');
  const x = parseFloat(handle.style.left), y = parseFloat(handle.style.top);
  surface.emit('pointerdown', {target: handle, pointerId: 9, button: 0, clientX: x, clientY: y});
  surface.emit('pointermove', {target: handle, pointerId: 9, clientX: x + 15, clientY: y - 80});
  assert.equal(surface.capture, 9);
  app.click('[data-h-view="court"]');
  assert.equal(surface.capture, undefined);
  surface.emit('pointerup', {target: handle, pointerId: 9, clientX: x + 15, clientY: y - 100});
  app.advance(500);
  assert.equal(app.root.dataset.phase, 'ready');
  assert.equal(app.played, 0);
  assert.equal(app.lastFrame.holding, true);
});

test('changing cameras while paused preserves a charged ready pose', async t => {
  const app = await mountedHoops();
  t.after(app.cleanup);
  app.click('[data-h="start"]'); app.click('[data-h="stronger"]'); app.advance(100);
  const action = app.lastFrame.action;
  assert.ok(action > 0);
  app.click('[data-h="pause"]'); app.click('[data-h-view="court"]');
  assert.equal(app.lastFrame.action, action);
  assert.equal(app.frames.size, 0);
});

test('moving-hoop practice uses live target motion and freezes it on pause, including view changes', async t => {
  const app = await mountedHoops({difficulty:'standard'});
  t.after(app.cleanup);
  app.click('[data-h="moving-practice"]');
  app.advance(100);
  const first = {...app.lastFrame.hoop};
  app.advance(500);
  assert.notEqual(app.lastFrame.hoop.x, first.x);
  assert.equal(app.root.dataset.mode, 'practice');
  assert.match(app.query('[data-h-mode]').textContent, /移动/);
  assert.equal(app.query('[data-h-score]').textContent, '0');
  app.click('[data-h="pause"]');
  const pausedHoop = {...app.lastFrame.hoop}, pausedTime = app.lastFrame.time;
  app.advance(1000); app.click('[data-h-view="court"]');
  assert.deepEqual({...app.lastFrame.hoop}, pausedHoop);
  assert.equal(app.lastFrame.time, pausedTime);
  app.click('[data-h="resume"]'); app.advance(500);
  assert.notEqual(app.lastFrame.hoop.x, pausedHoop.x);
});

test('background music is separately opt-in and follows pause/resume/dispose', async () => {
  const app = await mountedHoops();
  assert.equal(app.music.enabled, false);
  assert.equal(app.query('[data-h="music"]').attributes['aria-pressed'], 'false');
  app.click('[data-h="music"]');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.music.enabled, true);
  assert.equal(app.query('[data-h="music"]').attributes['aria-pressed'], 'true');
  assert.equal(app.query('[data-h="sound"]').attributes['aria-pressed'], 'false');
  app.click('[data-h="start"]'); app.click('[data-h="pause"]');
  assert.equal(app.music.paused, true);
  app.click('[data-h="resume"]');
  assert.equal(app.music.paused, false);
  app.click('[data-h="music"]');
  assert.equal(app.music.enabled, false);
  app.cleanup();
  assert.equal(app.music.destroyed, true);
});
