// Local, ephemeral mechanics. This module has no storage, network or DOM access.
import {createChallengeLayout, updateReleaseChallenge} from './release-challenges.js';
export {aimReleaseChallenge, fireReleaseChallenge} from './release-challenges.js';

export const RELEASE_BOUNDS = Object.freeze({x: 5.4, z: 3.1, ceiling: 6.5});
export const WORRY_LIMIT = 240;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const zero = () => ({x: 0, y: 0, z: 0});
const finiteVector = value => value && ['x', 'y', 'z'].every(axis =>
  value[axis] === undefined || Number.isFinite(value[axis]));

function makeBodies() {
  const specifications = [
    ['puff', 'puff', -3.45, .76, .7, .87, .76, .87, '#edaa99'],
    ['pebble', 'pebble', -.85, .62, -.8, .87, .62, .78, '#e6be86'],
    ['ring', 'ring', .75, .26, 1.3, .91, .26, .91, '#c0b5de'],
    ...['#c6cdb0', '#d6b2cb', '#efb497', '#e6cf9c'].map((color, index) =>
      [`block-${index}`, 'block', 3.15, .43 + index * .88, -.8, .43, .43, .43, color]),
  ];
  return specifications.map(([id, kind, x, y, z, hx, hy, hz, color], index) => ({
    id, kind, color, position: {x, y, z}, half: {x: hx, y: hy, z: hz},
    velocity: zero(), rotation: {x: 0, y: index % 2 ? .12 : -.12, z: 0},
    angularVelocity: zero(), pulse: 0, held: false, sleeping: true,
  }));
}

export function createReleaseState({mode = 'free', level = 'tower'} = {}) {
  const state = {
    mode: 'free', challenge: null, bodies: makeBodies(), elapsed: 0, paused: false, needsContinue: false,
    worry: {phase: 'closed', text: ''},
  };
  if (mode === 'challenge') setReleaseMode(state, mode, level);
  return state;
}

export function resetRelease(state) {
  if (state.mode === 'challenge') Object.assign(state, createChallengeLayout(state.challenge.levelId));
  else state.bodies = makeBodies();
  state.elapsed = 0;
}

export function setReleaseMode(state, mode, level = 'tower') {
  if (state.paused || state.worry.phase !== 'closed' || !['free', 'challenge'].includes(mode)) return false;
  state.mode = mode;
  if (mode === 'challenge') Object.assign(state, createChallengeLayout(level));
  else { state.challenge = null; state.bodies = makeBodies(); }
  state.elapsed = 0;
  return true;
}

function limitVelocity(velocity) {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed > 16) for (const axis of ['x', 'y', 'z']) velocity[axis] *= 16 / speed;
}

function wakeStack(state, body) {
  if (body.kind === 'block') {
    for (const item of state.bodies) if (item.kind === 'block') item.sleeping = false;
  }
}

export function applyReleaseImpulse(state, id, impulse = {x: 0, y: 5.5, z: 0}) {
  const body = state.bodies.find(item => item.id === id);
  if (state.mode === 'challenge' || state.paused || !body || body.held || !finiteVector(impulse)) return false;
  for (const axis of ['x', 'y', 'z']) body.velocity[axis] += clamp(impulse[axis] ?? 0, -12, 12);
  limitVelocity(body.velocity);
  body.angularVelocity.x += clamp(impulse.z ?? 0, -5, 5) * .65 + .7;
  body.angularVelocity.z -= clamp(impulse.x ?? 0, -5, 5) * .65 + .45;
  body.angularVelocity.y += .65;
  body.pulse = 1;
  body.sleeping = false;
  wakeStack(state, body);
  return true;
}

export function toppleRelease(state) {
  if (state.mode === 'challenge' || state.paused) return false;
  state.bodies.forEach((body, index) => applyReleaseImpulse(state, body.id, {
    x: (index % 2 ? -1 : 1) * (2.4 + index * .24),
    y: 3.2 + (index % 3) * .65,
    z: (index % 2 ? 1 : -1) * 2.1,
  }));
  return true;
}

function clampPosition(body) {
  body.position.x = clamp(body.position.x, -RELEASE_BOUNDS.x + body.half.x, RELEASE_BOUNDS.x - body.half.x);
  body.position.z = clamp(body.position.z, -RELEASE_BOUNDS.z + body.half.z, RELEASE_BOUNDS.z - body.half.z);
  body.position.y = clamp(body.position.y, body.half.y, RELEASE_BOUNDS.ceiling - body.half.y);
}

export function beginReleaseDrag(state, id) {
  const body = state.bodies.find(item => item.id === id);
  if (state.mode === 'challenge' || state.paused || !body || state.bodies.some(item => item.held)) return false;
  body.held = true;
  body.sleeping = false;
  body.velocity = zero();
  body.angularVelocity = zero();
  wakeStack(state, body);
  return true;
}

export function moveReleaseDrag(state, id, position) {
  const body = state.bodies.find(item => item.id === id);
  if (state.mode === 'challenge' || state.paused || !body?.held || !finiteVector(position) ||
      !['x', 'y', 'z'].every(axis => Number.isFinite(position[axis]))) return false;
  Object.assign(body.position, position);
  clampPosition(body);
  return true;
}

export function endReleaseDrag(state, id, velocity = zero()) {
  const body = state.bodies.find(item => item.id === id);
  if (!body?.held) return false;
  body.held = false;
  body.velocity = zero();
  body.sleeping = false;
  if (state.paused || !finiteVector(velocity)) return true;
  return applyReleaseImpulse(state, id, velocity);
}

function collide(a, b) {
  if (a.held || b.held || (a.sleeping && b.sleeping)) return;
  const overlap = {};
  for (const axis of ['x', 'y', 'z']) {
    overlap[axis] = a.half[axis] + b.half[axis] - Math.abs(b.position[axis] - a.position[axis]);
    if (overlap[axis] <= .001) return;
  }
  const axis = ['x', 'y', 'z'].reduce((best, next) => overlap[next] < overlap[best] ? next : best);
  const direction = b.position[axis] >= a.position[axis] ? 1 : -1;
  const inverseA = 1 / (a.mass ?? 1), inverseB = 1 / (b.mass ?? 1);
  const inverseSum = inverseA + inverseB;
  const correction = overlap[axis] + .001;
  a.position[axis] -= correction * inverseA / inverseSum * direction;
  b.position[axis] += correction * inverseB / inverseSum * direction;
  const approach = (b.velocity[axis] - a.velocity[axis]) * direction;
  if (approach < 0) {
    const impulse = -approach * 1.34 / inverseSum;
    a.velocity[axis] -= impulse * inverseA * direction;
    b.velocity[axis] += impulse * inverseB * direction;
    if (approach < -.8 && axis !== 'y') {
      const rotationAxis = axis === 'x' ? 'z' : 'x';
      const spin = impulse * direction * (axis === 'x' ? -.35 : .35);
      a.angularVelocity[rotationAxis] -= spin * inverseA;
      b.angularVelocity[rotationAxis] += spin * inverseB;
    }
    if (approach < -.8) a.pulse = b.pulse = Math.min(1, -approach / 7);
  }
  a.sleeping = b.sleeping = false;
}

function supported(body, bodies) {
  if (body.position.y - body.half.y <= .025) return true;
  return bodies.some(other => other !== body &&
    Math.abs(body.position.y - body.half.y - other.position.y - other.half.y) < .065 &&
    ['x', 'z'].every(axis => Math.abs(body.position[axis] - other.position[axis]) <
      body.half[axis] + other.half[axis] - .06));
}

function advance(state, dt) {
  if (state.mode === 'challenge') {
    for (const body of state.bodies) {
      if (body.sleeping && !supported(body, state.bodies)) body.sleeping = false;
    }
  }
  for (const body of state.bodies) {
    if (body.held || body.sleeping) continue;
    const {position: p, velocity: v, angularVelocity: angular, rotation} = body;
    v.y -= 13 * dt;
    for (const axis of ['x', 'y', 'z']) {
      p[axis] += v[axis] * dt;
      rotation[axis] += angular[axis] * dt;
      angular[axis] *= Math.exp(-2.2 * dt);
    }
    body.pulse *= Math.exp(-10 * dt);
    if (body.pulse < .002) body.pulse = 0;
    for (const axis of ['x', 'z']) {
      const limit = RELEASE_BOUNDS[axis] - body.half[axis];
      if (Math.abs(p[axis]) > limit) {
        p[axis] = Math.sign(p[axis]) * limit;
        v[axis] = -Math.sign(p[axis]) * Math.abs(v[axis]) * .55;
        body.pulse = .55;
      }
    }
    if (p.y > RELEASE_BOUNDS.ceiling - body.half.y) {
      p.y = RELEASE_BOUNDS.ceiling - body.half.y;
      v.y = -Math.abs(v.y) * .4;
    }
    if (p.y <= body.half.y + .003) {
      p.y = body.half.y;
      if (v.y < -.75) {
        body.pulse = Math.min(1, -v.y / 8);
        v.y = -v.y * .43;
      } else v.y = 0;
      v.x *= Math.exp(-7 * dt);
      v.z *= Math.exp(-7 * dt);
      rotation.x *= Math.exp(-12 * dt);
      rotation.z *= Math.exp(-12 * dt);
      angular.x *= Math.exp(-12 * dt);
      angular.z *= Math.exp(-12 * dt);
      if (Math.hypot(v.x, v.y, v.z) < .045 &&
          Math.abs(rotation.x) + Math.abs(rotation.z) < .025 && body.pulse < .015) {
        body.velocity = zero();
        body.angularVelocity = zero();
        rotation.x = rotation.z = body.pulse = 0;
        body.sleeping = true;
      }
    }
  }
  // Small substeps and two contact passes keep tossed pieces on the toy table.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < state.bodies.length; i++) {
      for (let j = i + 1; j < state.bodies.length; j++) collide(state.bodies[i], state.bodies[j]);
    }
  }
  for (const body of state.bodies) {
    clampPosition(body);
    limitVelocity(body.velocity);
    if (state.mode === 'challenge' && !body.sleeping) {
      // Resting contacts carry small downward solver impulses from the stack's
      // weight. A supported body may sleep without waiting for those to vanish.
      const resting = Math.hypot(body.velocity.x, body.velocity.z) < .14 && Math.abs(body.velocity.y) < .7 &&
        Math.hypot(...Object.values(body.angularVelocity)) < .18 && supported(body, state.bodies);
      body.restTime = resting ? (body.restTime ?? 0) + dt : 0;
      if (body.restTime > .35) {
        body.sleeping = true;
        body.velocity = zero();
        body.angularVelocity = zero();
      }
    }
  }
}

export function stepRelease(state, seconds) {
  if (state.paused || !Number.isFinite(seconds) || seconds <= 0) return;
  if (state.mode === 'challenge' && state.challenge.phase !== 'flying') return;
  const duration = Math.min(seconds, .05);
  if (state.mode === 'challenge') {
    // Fixed contacts keep aiming reproducible across 60/90/120 Hz displays and
    // ordinary RAF jitter. A long hidden frame still cannot fast-forward a shot.
    const dt = 1 / 120;
    state.challenge.accumulator += duration;
    while (state.challenge.accumulator + 1e-12 >= dt && state.challenge.phase === 'flying') {
      state.challenge.accumulator = Math.max(0, state.challenge.accumulator - dt);
      advance(state, dt);
      updateReleaseChallenge(state, dt);
    }
    if (state.challenge.phase !== 'flying') state.challenge.accumulator = 0;
    state.elapsed += duration;
    return;
  }
  const steps = Math.ceil(duration / (1 / 120));
  for (let step = 0; step < steps; step++) {
    advance(state, duration / steps);
  }
  state.elapsed += duration;
}

export function pauseRelease(state) {
  state.paused = true;
  state.needsContinue = true;
  for (const body of state.bodies) if (body.held) endReleaseDrag(state, body.id);
}

export function resumeRelease(state) {
  if (state.worry.phase !== 'closed') return false;
  state.paused = state.needsContinue = false;
  return true;
}

export function releaseShortcut(event) {
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
      event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  const target = event.target;
  if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(target?.tagName) ||
      target?.closest?.('button,a,summary,input,textarea,select,[contenteditable],[role="textbox"],[role="slider"],[role="button"],dialog')) return null;
  return {a: 'puff', s: 'pebble', d: 'ring', f: 'stack'}[event.key?.toLowerCase()] ?? null;
}

export function openWorry(state) {
  if (state.worry.phase !== 'closed') return false;
  state.worry = {phase: 'writing', text: ''};
  state.paused = true;
  for (const body of state.bodies) if (body.held) endReleaseDrag(state, body.id);
  return true;
}

export function setWorryText(state, text) {
  if (state.worry.phase !== 'writing') return '';
  state.worry.text = typeof text === 'string'
    ? text.slice(0, WORRY_LIMIT).replace(/[\uD800-\uDBFF]$/, '') : '';
  return state.worry.text;
}

export function crumpleWorry(state) {
  if (state.needsContinue || state.worry.phase !== 'writing') return false;
  state.worry.text = '';
  state.worry.phase = 'ready';
  return true;
}

export function tossWorry(state) {
  if (state.needsContinue || state.worry.phase !== 'ready') return false;
  state.worry.phase = 'tossing';
  return true;
}

export function finishWorry(state) {
  if (state.needsContinue || state.worry.phase !== 'tossing') return false;
  state.worry.phase = 'done';
  return true;
}

export function closeWorry(state) {
  state.worry = {phase: 'closed', text: ''};
  state.paused = state.needsContinue;
}

export function resumeWorry(state) {
  if (state.worry.phase === 'closed') return false;
  state.needsContinue = false;
  return true;
}
