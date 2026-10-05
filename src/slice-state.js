// Pixel-space mechanics only: no DOM, timers, storage, audio or network.
export const SLICE_LEVELS = [
  {id: 'orchard', name: '同色小果园', note: '找一排同色小物，一笔划过三个。', waves: 8, goal: 200, chains: 2},
  {id: 'crossing', name: '交错的颜色', note: '颜色会打断连切。挑一组同色，绕开带 × 的金属块。', waves: 10, goal: 300, chains: 3},
  {id: 'flow', name: '流动的连锁', note: '观察交错的弧线，等同色小物聚在一起再出刀。', waves: 12, goal: 420, chains: 4},
];

export const SLICE_COLORS = [
  {id: 'peach', name: '蜜桃', color: '#f5b39e', shape: 'sphere'},
  {id: 'mint', name: '薄荷', color: '#b5dfc5', shape: 'cube'},
  {id: 'gold', name: '暖金', color: '#f1d080', shape: 'diamond'},
];

const TICK = 1 / 120;
const CHAIN_GAP = .55;
const WAVE_BEAT = .35;
const LIMIT = {objects: 64, fragments: 96, particles: 192, trail: 32, events: 64};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const size = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
const radius = (width, height) => clamp(Math.min(width * .068, height * .085), 24, 42);
const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const levelOf = state => SLICE_LEVELS.find(level => level.id === state.level);

function boundedPush(array, value, limit) {
  array.push(value);
  if (array.length > limit) array.splice(0, array.length - limit);
}

// Separate streams ensure that making more particles never changes later waves.
function random(state, effects = false) {
  const key = effects ? 'effectSeed' : 'waveSeed';
  let value = state._sim[key] = (state._sim[key] + 0x6d2b79f5) >>> 0;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

function event(state, type, {x = state.width / 2, y = state.height * .4,
  color = 'peach', count = 0, points = 0} = {}) {
  boundedPush(state.events, {type, x, y, color, count, points}, LIMIT.events);
}

function clearRun(stroke) {
  stroke.color = null;
  stroke.count = 0;
  stroke.lastHit = -1;
}

export function createSliceState({level = 'orchard', mode = 'challenge', width = 960, height = 600, seed = 1} = {}) {
  width = size(width, 960);
  height = size(height, 600);
  seed = Number.isFinite(seed) ? seed >>> 0 : 1;
  return {
    level: SLICE_LEVELS.some(item => item.id === level) ? level : 'orchard',
    mode: mode === 'practice' ? 'practice' : 'challenge',
    width, height, phase: 'ready', paused: false, time: 0, wave: 0,
    score: 0, chains: 0, bestChain: 0, shields: 3,
    objects: [], fragments: [], particles: [], trail: [], events: [],
    stroke: {active: false, x: 0, y: 0, color: null, count: 0, lastHit: -1},
    _sim: {waveSeed: seed, effectSeed: seed ^ 0x9e3779b9,
      objectId: 0, particleId: 0, accumulator: 0, clearAt: null, gravity: height * .82},
  };
}

function spawnWave(state) {
  const chapter = SLICE_LEVELS.findIndex(item => item.id === state.level);
  const r = radius(state.width, state.height);
  const colorIndex = (state.wave + Math.floor(random(state) * 3)) % SLICE_COLORS.length;
  const color = SLICE_COLORS[colorIndex].id;
  const direction = state.wave % 2 ? -1 : 1;
  const flight = 2.7 + random(state) * .15;
  const velocity = direction * state.width * [.035, .08, .12][chapter];
  const apexX = state.width * (.5 + (random(state) - .5) * .06);
  const spacing = r * 2.4;
  state.wave++;
  state._sim.clearAt = null;
  // A fresh formation is a fresh run even when the pointer remains held.
  clearRun(state.stroke);

  function add(kind, tint, x, vx, duration, bodyRadius = r) {
    boundedPush(state.objects, {
      id: `object-${++state._sim.objectId}`, kind, color: tint,
      x, y: state.height + bodyRadius * .65, z: (random(state) - .5) * r * .5,
      r: bodyRadius, vx, vy: -state._sim.gravity * duration / 2,
      rotation: (random(state) - .5) * .9, spin: (random(state) - .5) * (kind === 'hazard' ? .7 : 1.8),
    }, LIMIT.objects);
  }
  // All three share a ballistic arc. Their spacing remains readable on a phone.
  for (let i = 0; i < 3; i++) {
    add('fruit', color, apexX - velocity * flight / 2 + (i - 1) * spacing, velocity, flight);
  }
  if (chapter) {
    const otherColor = SLICE_COLORS[(colorIndex + 1 + state.wave % 2) % 3].id;
    const otherFlight = flight - (chapter === 1 ? .42 : .25);
    const otherVelocity = -velocity * .95;
    const otherApex = state.width * (.5 + direction * .08);
    for (let i = 0; i < chapter; i++) {
      add('fruit', otherColor, otherApex - otherVelocity * otherFlight / 2 +
        (i - (chapter - 1) / 2) * spacing, otherVelocity, otherFlight);
    }
    if (chapter === 2 || state.wave % 2 === 0) {
      const duration = flight - .65;
      const vx = -direction * state.width * .025;
      const hazardRadius = Math.max(24, r * .86);
      const x = clamp(state.width * (direction > 0 ? .78 : .22) - vx * duration / 2,
        hazardRadius, state.width - hazardRadius);
      add('hazard', 'gold', x, vx, duration, hazardRadius);
    }
  }
  event(state, 'wave', {x: apexX, y: state.height - r, color, count: state.wave});
}

export function startSlice(state) {
  if (state.phase !== 'ready' || state.paused) return false;
  state.phase = 'playing';
  spawnWave(state);
  return true;
}

function finish(state, phase) {
  if (state.phase !== 'playing') return;
  state.phase = phase;
  endSlice(state);
  event(state, phase, {count: state.chains, points: state.score});
}

function settleWave(state) {
  if (state.phase !== 'playing' || state.objects.length) return;
  const level = levelOf(state);
  if (state.mode !== 'practice' && state.wave >= level.waves) {
    finish(state, state.score >= level.goal && state.chains >= level.chains ? 'won' : 'lost');
    return;
  }
  if (state._sim.clearAt === null) state._sim.clearAt = state.time + WAVE_BEAT;
  if (state.time + 1e-10 >= state._sim.clearAt) spawnWave(state);
}

function fly(body, dt, gravity) {
  body.x += body.vx * dt;
  body.y += body.vy * dt + gravity * dt * dt / 2;
  body.vy += gravity * dt;
  if (Number.isFinite(body.spin)) body.rotation += body.spin * dt;
}

export function stepSlice(state, dt) {
  if (state.paused || state.phase === 'ready' || !Number.isFinite(dt) || dt <= 0) return;
  // Normal deltas are fully consumed; an invalid giant catch-up cannot monopolize
  // the caller. Rendering frequency never changes the contact or wave clock.
  state._sim.accumulator += Math.min(dt, 60);
  while (state._sim.accumulator + 1e-12 >= TICK) {
    state._sim.accumulator = Math.max(0, state._sim.accumulator - TICK);
    state.time += TICK;
    if (state.stroke.count && state.time - state.stroke.lastHit > CHAIN_GAP) clearRun(state.stroke);
    for (const object of state.objects) fly(object, TICK, state._sim.gravity);
    state.objects = state.objects.filter(object =>
      !(object.vy > 0 && object.y - object.r > state.height + 8) &&
      object.x + object.r > -state.width * .25 && object.x - object.r < state.width * 1.25);
    for (const fragment of state.fragments) {
      fly(fragment, TICK, state._sim.gravity);
      fragment.life -= TICK;
    }
    for (const particle of state.particles) {
      fly(particle, TICK, state._sim.gravity * .7);
      particle.life -= TICK;
    }
    for (const point of state.trail) point.life -= TICK;
    state.fragments = state.fragments.filter(fragment => fragment.life > 1e-9);
    state.particles = state.particles.filter(particle => particle.life > 1e-9);
    state.trail = state.trail.filter(point => point.life > 1e-9);
    settleWave(state);
  }
}

function trailPoint(state, x, y, startsStroke = false) {
  boundedPush(state.trail, {x, y, z: 0, time: state.time, life: .22, maxLife: .22,
    break: startsStroke}, LIMIT.trail);
}

export function beginSlice(state, point) {
  if (state.paused || state.phase !== 'playing' || state.stroke.active || !validPoint(point)) return false;
  state.stroke.active = true;
  state.stroke.x = clamp(point.x, -state.width, state.width * 2);
  state.stroke.y = clamp(point.y, -state.height, state.height * 2);
  clearRun(state.stroke);
  trailPoint(state, state.stroke.x, state.stroke.y, true);
  return true;
}

// Liang–Barsky clipping means dragging outside a captured canvas cannot cut
// invisible objects underneath its bottom edge or beyond either side.
function clipBlade(from, to, width, height) {
  const dx = to.x - from.x, dy = to.y - from.y;
  let start = 0, end = 1;
  const p = [-dx, dx, -dy, dy], q = [from.x, width - from.x, from.y, height - from.y];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return null; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) start = Math.max(start, t);
    else end = Math.min(end, t);
    if (start > end) return null;
  }
  return {from: {x: from.x + dx * start, y: from.y + dy * start},
    to: {x: from.x + dx * end, y: from.y + dy * end}};
}

function entryTime(from, to, object, bladeRadius) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const fx = from.x - object.x, fy = from.y - object.y;
  const a = dx * dx + dy * dy;
  if (a < 1e-10) return null;
  const c = fx * fx + fy * fy - (object.r + bladeRadius) ** 2;
  if (c <= 0) return 0;
  const b = 2 * (fx * dx + fy * dy), discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function split(state, object, from, to) {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const nx = -(to.y - from.y) / length, ny = (to.x - from.x) / length;
  const turn = Math.atan2(ny, nx);
  for (const side of [-1, 1]) {
    const maxLife = 1.3;
    boundedPush(state.fragments, {
      ...object, id: `${object.id}-half-${side}`, side,
      x: object.x + nx * side * object.r * .13,
      y: object.y + ny * side * object.r * .13,
      z: object.z + side * object.r * .08,
      vx: object.vx * .45 + nx * side * object.r * 3.2,
      vy: object.vy * .4 + ny * side * object.r * 3.2 - object.r,
      rotation: turn, spin: side * (1.2 + random(state, true) * 1.6),
      life: maxLife, maxLife,
    }, LIMIT.fragments);
  }
  for (let i = 0; i < 6; i++) {
    const angle = random(state, true) * Math.PI * 2;
    const speed = object.r * (2 + random(state, true) * 4);
    const maxLife = .35 + random(state, true) * .3;
    boundedPush(state.particles, {
      id: `particle-${++state._sim.particleId}`, x: object.x, y: object.y,
      z: object.z + (random(state, true) - .5) * object.r * .4,
      vx: Math.cos(angle) * speed + object.vx * .2,
      vy: Math.sin(angle) * speed - object.r * 1.5,
      r: 2 + random(state, true) * 3, color: object.color, life: maxLife, maxLife,
    }, LIMIT.particles);
  }
}

function hit(state, object, from, to) {
  state.objects.splice(state.objects.indexOf(object), 1);
  split(state, object, from, to);
  if (object.kind === 'hazard') {
    clearRun(state.stroke);
    state.shields = Math.max(0, state.shields - 1);
    event(state, 'hazard', {...object, count: state.shields});
    if (state.mode !== 'practice' && state.shields === 0) finish(state, 'lost');
    return;
  }
  const stroke = state.stroke;
  if (stroke.color !== object.color || state.time - stroke.lastHit > CHAIN_GAP) clearRun(stroke);
  stroke.color = object.color;
  stroke.count++;
  stroke.lastHit = state.time;
  state.bestChain = Math.max(state.bestChain, stroke.count);
  state.score += 10;
  event(state, 'slice', {...object, count: stroke.count, points: 10});
  if (stroke.count >= 3) {
    const bonus = stroke.count === 3 ? 20 : 10;
    if (stroke.count === 3) state.chains++;
    state.score += bonus;
    event(state, 'chain', {...object, count: stroke.count, points: bonus});
  }
}

export function moveSlice(state, point) {
  if (state.paused || state.phase !== 'playing' || !state.stroke.active || !validPoint(point)) return false;
  const from = {x: state.stroke.x, y: state.stroke.y};
  const to = {x: clamp(point.x, -state.width, state.width * 2),
    y: clamp(point.y, -state.height, state.height * 2)};
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1e-6) return false;
  state.stroke.x = to.x;
  state.stroke.y = to.y;
  trailPoint(state, to.x, to.y);
  const blade = clipBlade(from, to, state.width, state.height);
  if (!blade) return true;
  const thickness = radius(state.width, state.height) * .09;
  const hits = state.objects
    .filter(object => object.x + object.r > 0 && object.x - object.r < state.width &&
      object.y + object.r > 0 && object.y - object.r < state.height)
    .map(object => ({object, t: entryTime(blade.from, blade.to, object, thickness)}))
    .filter(item => item.t !== null)
    .sort((a, b) => a.t - b.t || a.object.id.localeCompare(b.object.id));
  for (const {object} of hits) {
    if (state.phase !== 'playing') break;
    hit(state, object, blade.from, blade.to);
  }
  settleWave(state);
  return true;
}

export function endSlice(state) {
  const wasActive = state.stroke.active;
  state.stroke.active = false;
  clearRun(state.stroke);
  return wasActive;
}

export function pauseSlice(state) {
  const changed = !state.paused;
  endSlice(state);
  state.trail.length = 0;
  state.paused = true;
  return changed;
}

export function resumeSlice(state) {
  const changed = state.paused;
  state.paused = false;
  return changed;
}

export function resizeSlice(state, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const sx = width / state.width, sy = height / state.height;
  const sr = radius(width, height) / radius(state.width, state.height);
  endSlice(state);
  state.trail.length = 0;
  for (const body of [...state.objects, ...state.fragments, ...state.particles]) {
    body.x *= sx; body.y *= sy; body.vx *= sx; body.vy *= sy; body.z *= sr;
    body.r = body.kind ? clamp(body.r * sr, 24, 42) : clamp(body.r * sr, 1, 8);
  }
  for (const item of state.events) { item.x *= sx; item.y *= sy; }
  state.stroke.x *= sx; state.stroke.y *= sy;
  state.width = width; state.height = height;
  state._sim.gravity = height * .82;
  return true;
}

export function drainSliceEvents(state) {
  return state.events.splice(0);
}
