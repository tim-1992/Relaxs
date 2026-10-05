import {HOOP, BALL_START} from './hoops-physics.js';

export const HOOPS_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    label: '轻松', title: '找找投篮手感',
    description: '十球计分，完整轨迹。也可以切换到固定篮筐的自由练习。',
    previewSeconds: 1.8,
  }),
  standard: Object.freeze({
    label: '标准', title: '十球，十个角度',
    description: '观察篮筐的远近和左右位置，调整方向与力度。最后三题篮筐会缓慢左右移动，观察节奏再出手。投失可重试，命中后进入下一题，不限时。',
    previewSeconds: 1.8,
  }),
  hard: Object.freeze({
    label: '困难', title: '把风，也算进去',
    description: '十个布局，加上恒定横风；最后三题篮筐会左右移动。轨迹只显示起飞段，预留反风方向和篮筐移动的距离。不限时，可反复试投。',
    previewSeconds: .6,
  }),
});

const easyX = Object.freeze([0, 0, 0, .65, -.65, 0, 1, -1, .45, 0]);
// [base lateral position, depth, constant crosswind acceleration].
// The last three puzzles add a deterministic lateral sweep around these bases.
const standard = Object.freeze([
  [-.72, -1.55, 0], [.96, -4.25, 0], [-1.44, -2.05, 0], [1.68, -4.9, 0],
  [-1.08, -3.55, 0], [.48, -1.05, 0], [1.32, -4.55, 0], [-1.68, -2.65, 0],
  [.84, -5.15, 0], [-.36, -3.85, 0],
].map(Object.freeze));
const hard = Object.freeze([
  [.96, -2.15, .65], [-1.2, -4.2, -.85], [1.56, -3.5, -1.05], [-.84, -1.5, .85],
  [1.08, -5.1, 1.25], [-1.44, -2.8, -1.05], [.48, -4.6, -.65], [-1.68, -3.85, 1.25],
  [1.44, -1.05, -.85], [-.6, -4.95, .65],
].map(Object.freeze));

export function normalizeHoopsDifficulty(value = 'easy') {
  return Object.hasOwn(HOOPS_DIFFICULTIES, value) ? value : 'easy';
}

export function getHoopsChallenge(difficulty = 'easy', index = 0, {practice = false} = {}) {
  const level = normalizeHoopsDifficulty(difficulty);
  const number = Number.isFinite(index) ? Math.max(0, Math.min(9, Math.floor(index))) : 0;
  const row = practice ? [0, HOOP.z, 0]
    : level === 'easy' ? [easyX[number], HOOP.z, 0] : (level === 'hard' ? hard : standard)[number];
  const [x, z, force] = row;
  const windLevel = force === 0 ? 0 : Math.max(1, Math.min(4, Math.round((Math.abs(force) - .45) / .2)));
  const moving = !practice && level !== 'easy' && number >= 7;
  return {
    difficulty: practice ? 'easy' : level,
    index: number,
    hoop: {...HOOP, x, z},
    motion: moving ? {
      amplitude: (level === 'hard' ? [.45, .65, .85] : [.35, .55, .75])[number - 7],
      period: [6.5, 5.5, 4.5][number - 7],
      phase: 0,
    } : null,
    wind: {x: force, z: 0},
    windLevel,
    distance: Math.hypot(x - BALL_START.x, z - BALL_START.z),
    previewSeconds: practice ? 1.8 : HOOPS_DIFFICULTIES[level].previewSeconds,
  };
}

// Time belongs to the caller's active question clock, never the wall clock.
export function getHoopsTarget(challenge, time = 0) {
  const target = {...challenge.hoop};
  if (!challenge.motion) return target;
  const {amplitude, period, phase} = challenge.motion;
  const elapsed = Number.isFinite(time) ? Math.max(0, time) : 0;
  target.x += amplitude * Math.sin(elapsed / period * Math.PI * 2 + phase);
  return target;
}

export function createHoopsPuzzle(difficulty = 'standard') {
  return {difficulty: normalizeHoopsDifficulty(difficulty), index: 0, attempts: 0,
    stageAttempts: 0, solved: 0, status: 'aiming'};
}

export function recordHoopsAttempt(run, made) {
  if (run.status !== 'aiming') return false;
  run.attempts++;
  run.stageAttempts++;
  if (made) {
    run.solved++;
    run.status = run.solved === 10 ? 'complete' : 'cleared';
  }
  return true;
}

export function nextHoopsPuzzle(run) {
  if (run.status !== 'cleared') return false;
  run.index++;
  run.stageAttempts = 0;
  run.status = 'aiming';
  return true;
}

export function hoopsMissHint(shot, challenge) {
  const crossing = shot.crossing;
  if (!crossing) return '还没越过篮筐高度。试着加一点力度，再观察弧线。';
  const target = shot.crossingHoop || challenge.hoop;
  const dx = crossing.x - target.x;
  const dz = crossing.z - target.z;
  const adjustments = [];
  if (Math.abs(dx) > .28) adjustments.push(dx > 0 ? '落点偏右，方向往左调' : '落点偏左，方向往右调');
  if (Math.abs(dz) > .3) adjustments.push(dz > 0 ? '距离偏近，力度加一点' : '距离偏远，力度减一点');
  if (adjustments.length) return `${adjustments.join('；')}。`;
  return shot.touchedRim || shot.touchedBoard
    ? '擦到篮沿或篮板了。接近了，试着小幅调整方向或力度。'
    : '已经很接近。保留这条思路，小幅调整再试。';
}
