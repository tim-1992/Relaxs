/** Pure, immutable crusher simulation. Durations are seconds; pressure is 0–1.
 * No wall clock, random source, DOM, animation loop or frame-dependent physics.
 */
export const CRUSHER_TARGETS = Object.freeze([
  Object.freeze({id: 'car', name: '玩具小车', material: '金属车身', color: '#ed8d69', center: .69,
    stages: Object.freeze([{label: '车壳预压', center: .44}, {label: '底盘压实', center: .76}])}),
  Object.freeze({id: 'sofa', name: '旧沙发', material: '海绵与木框', color: '#8fc6ad', center: .44,
    stages: Object.freeze([{label: '海绵预压', center: .30}, {label: '木框压实', center: .63}])}),
  Object.freeze({id: 'tv', name: '老电视', material: '屏幕与外壳', color: '#c2b4df', center: .57,
    stages: Object.freeze([{label: '屏幕预压', center: .38}, {label: '外壳压实', center: .69}])}),
]);
export const CRUSHER_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({name: '轻松', width: .30, cycles: 1}),
  standard: Object.freeze({name: '标准', width: .20, cycles: 1}),
  hard: Object.freeze({name: '挑战', width: .17, cycles: 2}),
});
const DURATIONS = {feeding: 1.25, pressing: 1, breaking: .8, ejecting: 1.2};
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const targetOf = state => CRUSHER_TARGETS.find(target => target.id === state.target);

export function createCrusherState({difficulty = 'standard', target = 'car', mode = 'orders'} = {}) {
  return {
    difficulty: Object.hasOwn(CRUSHER_DIFFICULTIES, difficulty) ? difficulty : 'standard',
    target: CRUSHER_TARGETS.some(item => item.id === target) ? target : 'car',
    mode: mode === 'practice' ? 'practice' : 'orders',
    phase: 'ready', paused: false, time: 0, phaseTime: 0, pressure: 0,
    damage: 0, stage: 0, attempts: 0, objectAttempts: 0, crushed: 0,
    completed: [], score: 0, lastShot: null, revision: 0,
  };
}

export function getCrusherBand(state) {
  const target = targetOf(state);
  const {width, cycles} = CRUSHER_DIFFICULTIES[state.difficulty];
  const material = cycles > 1 ? target.stages[state.stage] : {label: target.material, center: target.center};
  return {min: material.center - width / 2, max: material.center + width / 2,
    label: material.label, cycle: state.stage + 1, cycles};
}

export function selectCrusherTarget(state, target) {
  if (state.paused || state.phase !== 'ready' || target === state.target ||
      !CRUSHER_TARGETS.some(item => item.id === target) ||
      state.mode === 'orders' && state.completed.includes(target)) return state;
  return {...state, target, revision: state.revision + 1};
}

export function feedCrusher(state) {
  if (state.paused || state.phase !== 'ready') return state;
  return {...state, phase: 'feeding', phaseTime: 0, revision: state.revision + 1};
}

export function beginCrusherPressure(state) {
  if (state.paused || state.phase !== 'armed') return state;
  return {...state, phase: 'charging', phaseTime: 0, pressure: 0, revision: state.revision + 1};
}

export function cancelCrusherPressure(state) {
  if (state.phase !== 'charging') return state;
  return {...state, phase: 'armed', pressure: 0, phaseTime: 0, revision: state.revision + 1};
}

export function releaseCrusherPressure(state) {
  if (state.paused || state.phase !== 'charging') return state;
  const band = getCrusherBand(state);
  const matched = state.pressure >= band.min - 1e-9 && state.pressure <= band.max + 1e-9;
  const success = matched && band.cycle === band.cycles;
  const accuracy = clamp(1 - Math.abs(state.pressure - (band.min + band.max) / 2) / ((band.max - band.min) / 2));
  const damage = success ? 1 : Math.min(.62, state.damage + (matched ? .30 : .10 + state.pressure * .08));
  return {...state, phase: 'pressing', phaseTime: 0, attempts: state.attempts + 1,
    objectAttempts: state.objectAttempts + 1, revision: state.revision + 1,
    lastShot: {pressure: state.pressure, matched, success, accuracy, band,
      before: state.damage, after: damage, points: success ? 100 + Math.round(accuracy * 50) : 0},
  };
}

function transition(state) {
  if (state.phase === 'feeding') return {...state, phase: 'armed', phaseTime: 0, revision: state.revision + 1};
  if (state.phase === 'pressing') {
    const shot = state.lastShot;
    return {...state, phase: shot.success ? 'breaking' : 'armed', phaseTime: 0,
      damage: shot.after, pressure: 0, stage: shot.success ? state.stage : shot.matched ? state.stage + 1 : 0,
      revision: state.revision + 1};
  }
  if (state.phase === 'breaking') return {...state, phase: 'ejecting', phaseTime: 0, revision: state.revision + 1};
  const completed = state.mode === 'orders' ? [...state.completed, state.target] : state.completed;
  return {...state, phase: completed.length === 3 ? 'complete' : 'result', phaseTime: 0,
    crushed: state.crushed + 1, completed, score: state.score + state.lastShot.points,
    revision: state.revision + 1};
}

/** Consume every elapsed second, including phase boundaries, rather than dropping
 * slow frames. The controller cancels background time before calling this. */
export function stepCrusher(state, dt) {
  if (state.paused || !Number.isFinite(dt) || dt <= 0 ||
      ['ready', 'result', 'complete'].includes(state.phase)) return state;
  let next = {...state}, remaining = dt;
  while (remaining > 1e-10) {
    const duration = DURATIONS[next.phase];
    if (!duration) {
      next.time += remaining;
      next.phaseTime += remaining;
      if (next.phase === 'charging') next.pressure = clamp(next.pressure + remaining * .38);
      break;
    }
    const amount = Math.min(remaining, Math.max(0, duration - next.phaseTime));
    next.time += amount;
    next.phaseTime += amount;
    remaining -= amount;
    if (next.phaseTime >= duration - 1e-10) next = transition(next);
    if (['result', 'complete'].includes(next.phase)) break;
  }
  return next;
}

export function pauseCrusher(state) {
  return state.paused ? state : {...state, paused: true, revision: state.revision + 1};
}

export function resumeCrusher(state) {
  if (!state.paused) return state;
  // A held pointer/key is never silently resumed after a blur.
  return {...cancelCrusherPressure(state), paused: false, revision: state.revision + 1};
}

export function nextCrusher(state, target) {
  if (state.paused || state.phase !== 'result') return state;
  const available = CRUSHER_TARGETS.filter(item => state.mode === 'practice' || !state.completed.includes(item.id));
  const chosen = available.find(item => item.id === target)?.id ??
    (state.mode === 'practice' ? state.target : available[0]?.id);
  return {...state, target: chosen, phase: 'ready', phaseTime: 0, pressure: 0, damage: 0,
    objectAttempts: 0, stage: 0, lastShot: null, revision: state.revision + 1};
}

export function replayCrusher(state, options = {}) {
  return createCrusherState({difficulty: state.difficulty, mode: state.mode, target: state.target, ...options});
}

/** A deterministic pose shared by the Three scene and the DOM fallback.
 * Real object parts remain visible throughout compression, fracture and ejection.
 */
export function getCrusherVisual(state) {
  const t = state.phaseTime;
  let feed = state.phase === 'ready' ? 0 : state.phase === 'feeding' ? smooth(t / 1.25) : 1;
  let press = 0, fracture = 0, eject = 0, dust = 0, damage = state.damage;
  if (state.phase === 'charging') press = state.pressure * .13;
  if (state.phase === 'pressing') {
    const impact = smooth((t - .10) / .50);
    damage = state.lastShot.before + (state.lastShot.after - state.lastShot.before) * impact;
    press = state.lastShot.success ? smooth(t / .60) : smooth(t / .52) * (1 - smooth((t - .70) / .30));
    dust = Math.sin(clamp((t - .35) / .60) * Math.PI) * .45;
  }
  if (state.phase === 'breaking') {
    press = 1 - smooth(t / .6);
    fracture = smooth(t / .55);
    dust = Math.sin(clamp(t / .8) * Math.PI);
  }
  if (state.phase === 'ejecting' || state.phase === 'result' || state.phase === 'complete') {
    fracture = 1;
    eject = state.phase === 'ejecting' ? smooth(t / 1.2) : 1;
  }
  return {feed, press, damage, fracture, eject, dust,
    motor: ['feeding', 'ejecting'].includes(state.phase),
    belt: state.phase === 'feeding' ? feed * 4 : state.phase === 'ejecting' ? 4 + eject * 4 : feed * 4,
    impact: state.phase === 'pressing' && t > .35 && t < .75,
  };
}
