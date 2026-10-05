// Local, deterministic layouts and rules. A throw earns no score on its own:
// progress comes exclusively from target poses produced by release-state's solver.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const colors = ['#c6cdb0', '#d6b2cb', '#efb497', '#e6cf9c'];
const column = (x, z, count, half = .34) => Array.from({length: count}, (_, i) =>
  ({x, y: half + i * half * 2, z, half: {x: half, y: half, z: half}}));

export const RELEASE_LEVELS = [
  {
    id: 'tower', name: '四柱高塔', subtitle: '24 块积木。找准底部，让上层失去支撑。',
    hint: '正面观察接缝。软团接触面宽，试着把底层推离原位。',
    shots: 3, goal: 12, blocks: [-.75, .75].flatMap(x => [-1.3, -0.1].flatMap(z => column(x, z, 6))),
  },
  {
    id: 'wall', name: '积木长墙', subtitle: '36 块积木。选一段薄弱处，从下往上拆。',
    hint: '换个视角看墙的厚度。软团能碰到相邻两列，石头更适合集中拆一列。',
    shots: 4, goal: 18, blocks: [-2.25, -1.35, -.45, .45, 1.35, 2.25].flatMap(x => column(x, -.9, 6, .36)),
  },
  {
    id: 'bridge', name: '桥下的空隙', subtitle: '48 块积木。观察横梁靠什么撑住，再决定顺序。',
    hint: '先看左右桥脚。横梁失去支撑后，上面的积木也会落下。',
    shots: 4, goal: 24, blocks: [
      ...[-1.8, -.6, .6, 1.8].flatMap(x => [-1.25, 0].flatMap(z => column(x, z, 4, .32))),
      ...[-1.2, 1.2].flatMap(x => [-1.25, 0].map(z =>
        ({x, y: 2.72, z, half: {x: .98, y: .16, z: .32}}))),
      ...[-2.1, -1.26, -.42, .42, 1.26, 2.1].flatMap(x => [-1.25, 0].map(z =>
        ({x, y: 3.2, z, half: {x: .32, y: .32, z: .32}}))),
    ],
  },
];

export const RELEASE_PROJECTILES = [
  {id: 'puff', name: '软团', note: '宽而轻 · 容易碰到相邻积木', half: .62, mass: 1.2, color: '#edaa99'},
  {id: 'pebble', name: '石头', note: '小而重 · 集中推开一个支点', half: .34, mass: 3, color: '#e6be86'},
];

export function releaseLevel(id) {
  return RELEASE_LEVELS.find(level => level.id === id) ?? RELEASE_LEVELS[0];
}

export function createChallengeLayout(id) {
  const level = releaseLevel(id);
  const bodies = level.blocks.map((block, index) => ({
    id: `target-${index}`, kind: 'block', target: true, color: colors[index % colors.length],
    position: {x: block.x, y: block.y, z: block.z},
    half: {...(block.half ?? {x: .43, y: .43, z: .43})},
    rotation: {x: 0, y: 0, z: 0}, velocity: {x: 0, y: 0, z: 0},
    angularVelocity: {x: 0, y: 0, z: 0}, mass: block.half?.x > .8 ? 1.6 : .8,
    pulse: 0, held: false, sleeping: true,
  }));
  return {
    bodies,
    challenge: {
      levelId: level.id, phase: 'aiming', shotsUsed: 0, knocked: [],
      angle: 0, power: 60, projectile: 'puff', shotTime: 0, quietTime: 0, accumulator: 0,
      homes: Object.fromEntries(bodies.map(body => [body.id, {...body.position}])),
    },
  };
}

export function aimReleaseChallenge(state, {angle, power, projectile} = {}) {
  const challenge = state.challenge;
  if (state.mode !== 'challenge' || state.paused || challenge?.phase !== 'aiming') return false;
  if ((angle !== undefined && !Number.isFinite(angle)) || (power !== undefined && !Number.isFinite(power)) ||
      (projectile !== undefined && !RELEASE_PROJECTILES.some(item => item.id === projectile))) return false;
  if (angle !== undefined) challenge.angle = clamp(angle, -55, 55);
  if (power !== undefined) challenge.power = clamp(power, 15, 100);
  if (projectile !== undefined) challenge.projectile = projectile;
  return true;
}

// Used by the real projectile AND the visual guide; the guide predicts free flight,
// not a promised impact. Contact, gravity and friction decide the actual outcome.
export function releaseLaunch(challenge) {
  const spec = RELEASE_PROJECTILES.find(item => item.id === challenge.projectile) ?? RELEASE_PROJECTILES[0];
  const angle = challenge.angle * Math.PI / 180;
  const speed = 5 + challenge.power * .085;
  return {
    spec, position: {x: 0, y: .82, z: 2.35},
    velocity: {x: Math.sin(angle) * speed, y: 1.8, z: -Math.cos(angle) * speed},
  };
}

export function releaseTrajectory(challenge) {
  const {position, velocity, spec} = releaseLaunch(challenge);
  const points = [];
  for (let i = 0; i <= 24; i++) {
    const t = i * .025;
    const point = {x: position.x + velocity.x * t,
      y: position.y + velocity.y * t - 6.5 * t * t, z: position.z + velocity.z * t};
    if (point.y < spec.half || Math.abs(point.x) > 5.1 || Math.abs(point.z) > 2.9) break;
    points.push(point);
  }
  return points;
}

export function fireReleaseChallenge(state) {
  const challenge = state.challenge;
  if (state.mode !== 'challenge' || state.paused || challenge?.phase !== 'aiming' ||
      challenge.shotsUsed >= releaseLevel(challenge.levelId).shots) return false;
  const {spec, position, velocity} = releaseLaunch(challenge);
  state.bodies.push({
    id: 'projectile', kind: spec.id, color: spec.color, position, velocity,
    half: {x: spec.half, y: spec.half, z: spec.half}, mass: spec.mass,
    rotation: {x: 0, y: 0, z: 0}, angularVelocity: {x: -2, y: .2, z: 0},
    pulse: 0, sleeping: false, held: false,
  });
  challenge.shotsUsed++;
  challenge.phase = 'flying';
  challenge.shotTime = challenge.quietTime = challenge.accumulator = 0;
  return true;
}

export function updateReleaseChallenge(state, dt) {
  const challenge = state.challenge;
  if (!challenge || challenge.phase !== 'flying') return;
  challenge.shotTime += dt;
  for (const body of state.bodies) {
    const home = challenge.homes[body.id];
    if (!home || challenge.knocked.includes(body.id)) continue;
    if (Math.hypot(body.position.x - home.x, body.position.z - home.z) > .7 ||
        home.y - body.position.y > .58 ||
        Math.hypot(Math.sin(body.rotation.x), Math.sin(body.rotation.z)) > .8) {
      challenge.knocked.push(body.id);
    }
  }
  const quiet = state.bodies.every(body => body.sleeping ||
    (Math.hypot(...Object.values(body.velocity)) < .22 &&
     Math.hypot(...Object.values(body.angularVelocity)) < .18));
  challenge.quietTime = quiet ? challenge.quietTime + dt : 0;
  // Bound pathological contact jitter, not the player's thinking time. Positions
  // and scores are left as actually simulated; no timeout grants extra progress.
  if (challenge.shotTime < .8 || (challenge.quietTime < .45 && challenge.shotTime < 10)) return;
  state.bodies = state.bodies.filter(body => body.target);
  for (const body of state.bodies) {
    body.velocity = {x: 0, y: 0, z: 0};
    body.angularVelocity = {x: 0, y: 0, z: 0};
    body.sleeping = true;
    body.pulse = 0;
  }
  const level = releaseLevel(challenge.levelId);
  challenge.phase = challenge.knocked.length >= level.goal ? 'won' :
    challenge.shotsUsed >= level.shots ? 'lost' : 'aiming';
}
