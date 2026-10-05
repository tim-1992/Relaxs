export const MOLES_KEYS = Object.freeze(['Q', 'W', 'E', 'A', 'S', 'D', 'Z', 'X', 'C']);
export const MOLES_TYPES = Object.freeze({
  normal: Object.freeze({name: '普通小怪兽', points: 10, hits: 1}),
  helmet: Object.freeze({name: '头盔小怪兽', points: 20, hits: 2}),
  shiny: Object.freeze({name: '星星小怪兽', points: 30, hits: 1}),
  friend: Object.freeze({name: '叶子朋友', points: -15, hits: 1}),
});
export const MOLES_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({label: '轻松', interval: 1.05, life: 2.05, speedup: .16, capacity: 2}),
  standard: Object.freeze({label: '挑战', interval: .82, life: 1.65, speedup: .17, capacity: 3}),
  hard: Object.freeze({label: '进阶', interval: .65, life: 1.35, speedup: .19, capacity: 3}),
});
const EPSILON = 1e-9;
const active = state => state.phase === 'playing' && !state.paused;
const waveAt = time => Math.min(3, 1 + Math.floor((time + EPSILON) / 15));
const validHole = hole => Number.isInteger(hole) && hole >= 0 && hole < 9;

export function createMolesState({difficulty = 'standard', mode = 'challenge', seed = 12345} = {}) {
  const level = Object.hasOwn(MOLES_DIFFICULTIES, difficulty) ? difficulty : 'standard';
  const practice = mode === 'practice';
  const initialSeed = Number.isFinite(seed) ? seed >>> 0 : 12345;
  return {
    difficulty: level, mode: practice ? 'practice' : 'challenge',
    phase: 'ready', paused: false, duration: practice ? Infinity : 45, elapsed: 0,
    wave: 1, holes: Array(9).fill(null), nextSpawn: .35, seed: initialSeed, random: initialSeed,
    sequence: 0, spawned: 0, score: 0, combo: 0, bestCombo: 0,
    taps: 0, goodHits: 0, caught: 0, missed: 0, friendHits: 0, events: [],
  };
}

export function resetMoles(state, options = {}) {
  Object.assign(state, createMolesState({
    difficulty: state.difficulty, mode: state.mode, seed: state.seed, ...options,
  }));
  return state;
}

export function startMoles(state) {
  if (state.phase !== 'ready') return false;
  state.phase = 'playing';
  return true;
}

function event(state, type, details = {}) {
  const value = {type, at: state.elapsed, ...details};
  state.events.push(value);
  return value;
}

function random(state) {
  state.random = (Math.imul(state.random, 1664525) + 1013904223) >>> 0;
  return state.random / 4294967296;
}

export function spawnMole(state, hole, type, lifetime) {
  if (!active(state) || !validHole(hole) || state.holes[hole] || !Object.hasOwn(MOLES_TYPES, type)) return false;
  const rules = MOLES_DIFFICULTIES[state.difficulty];
  const life = Number.isFinite(lifetime) && lifetime > 0 ? lifetime
    : rules.life * (1 - (state.wave - 1) * rules.speedup) + (type === 'helmet' ? .45 : 0);
  const mole = {id: ++state.sequence, type, hp: MOLES_TYPES[type].hits,
    bornAt: state.elapsed, expiresAt: state.elapsed + life};
  state.holes[hole] = mole;
  state.spawned++;
  event(state, 'spawn', {hole, id: mole.id, kind: type});
  return true;
}

function schedule(state) {
  const rules = MOLES_DIFFICULTIES[state.difficulty];
  const empty = state.holes.flatMap((mole, hole) => mole ? [] : [hole]);
  const capacity = rules.capacity + (state.wave === 3 ? 1 : 0);
  if (9 - empty.length < capacity) {
    const hole = empty[Math.floor(random(state) * empty.length)];
    const choice = random(state);
    const kind = choice < .19 ? 'friend' : choice < .31 ? 'shiny' : choice < .54 ? 'helmet' : 'normal';
    spawnMole(state, hole, kind);
  }
  state.nextSpawn = state.elapsed + rules.interval * (1 - (state.wave - 1) * rules.speedup) * (.9 + random(state) * .2);
}

export function hitMole(state, hole) {
  if (!active(state) || !validHole(hole)) return null;
  state.taps++;
  const mole = state.holes[hole];
  if (!mole) {
    state.combo = 0;
    return event(state, 'empty', {hole, points: 0});
  }
  if (mole.type === 'friend') {
    state.holes[hole] = null;
    const penalty = Math.min(15, state.score);
    state.score -= penalty;
    state.friendHits++;
    state.combo = 0;
    return event(state, 'friend', {hole, points: -penalty});
  }
  state.goodHits++;
  if (--mole.hp > 0) return event(state, 'armour', {hole, points: 0});
  state.holes[hole] = null;
  state.caught++;
  state.combo++;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const points = MOLES_TYPES[mole.type].points + Math.min(3, Math.floor(state.combo / 5)) * 5;
  state.score += points;
  return event(state, 'hit', {hole, kind: mole.type, points});
}

export function finishMoles(state, reason = 'manual') {
  if (state.phase !== 'playing') return false;
  state.phase = 'ended';
  state.paused = false;
  state.holes.fill(null);
  event(state, 'end', {reason});
  return true;
}

// Visit exact spawn/expiry times, rather than integrating a countdown per frame.
// A 45-second step and 2700 steps of 1/60 produce the same sequence of critters.
export function stepMoles(state, dt) {
  if (!active(state) || !Number.isFinite(dt) || dt <= 0) return;
  const until = Math.min(state.duration, state.elapsed + dt);
  while (state.phase === 'playing') {
    const expiry = Math.min(...state.holes.filter(Boolean).map(mole => mole.expiresAt));
    const next = Math.min(state.nextSpawn, expiry, state.duration);
    if (next > until + EPSILON) break;
    state.elapsed = next;
    if (next >= state.duration - EPSILON) {
      state.elapsed = state.duration;
      finishMoles(state, 'time');
      break;
    }
    state.wave = waveAt(next);
    state.holes.forEach((mole, hole) => {
      if (!mole || mole.expiresAt > next + EPSILON) return;
      state.holes[hole] = null;
      if (mole.type === 'friend') event(state, 'safe', {hole});
      else {
        state.missed++;
        state.combo = 0;
        event(state, 'miss', {hole});
      }
    });
    if (state.nextSpawn <= next + EPSILON) schedule(state);
  }
  if (state.phase === 'playing') state.elapsed = until;
  state.wave = waveAt(state.elapsed);
}

export function pauseMoles(state) {
  if (!active(state)) return false;
  state.paused = true;
  return true;
}

export function resumeMoles(state) {
  if (state.phase !== 'playing' || !state.paused) return false;
  state.paused = false;
  return true;
}

export const drainMolesEvents = state => state.events.splice(0);
export const molesAccuracy = state => state.taps ? Math.round(state.goodHits / state.taps * 100) : 0;

export function molesHoleForKey(event) {
  const target = event.target;
  if (event.defaultPrevented || event.repeat || event.isComposing ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
      target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName) ||
      target?.closest?.('[contenteditable="true"],[role="textbox"]')) return null;
  const hole = MOLES_KEYS.indexOf(event.key?.toUpperCase());
  return hole < 0 ? null : hole;
}
