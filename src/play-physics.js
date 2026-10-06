const star = (x, y) => ({x, y});
const mirror = (x, y, length, angle = 0, rotatable = false) => ({x, y, length, angle, rotatable});

export const PLAY_LEVELS = [
  {name: '第一束光', subtitle: '碰到一颗，相邻的星星会一起亮起来。', hint: '从正前方开始，试着碰到最下面那颗星星。', targets: [star(0,.7),star(-.55,1.35),star(.55,1.35),star(0,2.05)], mirrors: []},
  {name: '绕个小弯', subtitle: '借一下边界，让小球绕过中间的挡板。', hint: '朝右侧边界试一试。右边的空隙能带你绕过挡板。', targets: [star(1.65,1.1),star(2.3,1.65),star(1.65,2.2),star(2.3,2.75)], mirrors: [mirror(0,-.2,3.8)]},
  {name: '左右逢源', subtitle: '两片星光，给小球选一条自己的路。', hint: '反弹板可以转动。先点亮一边，再照顾另一边。', targets: [star(-2,1.5),star(-2.5,2.25),star(-1.75,2.9),star(2,1.5),star(2.5,2.25),star(1.75,2.9)], mirrors: [mirror(0,-.55,1.9,32,true)]},
  {name: '换个方向', subtitle: '转动反弹板，看看路线会有什么不同。', hint: '试着转动橙色反弹板，再借两侧边界向上走。', targets: [star(-2.2,2.1),star(-1.55,2.8),star(-2.35,3.45),star(2.2,2.1),star(1.55,2.8),star(2.35,3.45)], mirrors: [mirror(0,.45,3.9),mirror(0,-1.65,1.3,-32,true)]},
  {name: '一片小宇宙', subtitle: '把三片星光都点亮，慢慢来也可以。', hint: '两侧的星星离你更近。试着先点亮它们，再找通向中间的路。', targets: [star(-2.35,-.4),star(-2.7,.35),star(-2.15,1.1),star(2.35,-.4),star(2.7,.35),star(2.15,1.1),star(0,2.15),star(-.55,2.85),star(.55,2.85)], mirrors: [mirror(-1.05,.75,1.55,35,true),mirror(1.05,.75,1.55,-35,true)]},
];

export const PLAY_ARENA = {halfWidth: 3.6, halfHeight: 4.6, ballRadius: .14, targetRadius: .27, chainDistance: 1.14};
const radians = degrees => degrees * Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const puzzleBounces = {
  standard: [[1], [1], [1, 1], [1, 1], [0, 0, 1]],
  hard: [[2], [2], [2, 1], [2, 2], [1, 1, 2]],
};

export function createPlayState(level = 0, difficulty = 'easy') {
  const index = Number.isInteger(level) ? clamp(level, 0, PLAY_LEVELS.length - 1) : 0;
  const definition = PLAY_LEVELS[index];
  const puzzle = Boolean(puzzleBounces[difficulty]);
  const targets = definition.targets.map((target, id) => ({...target, id, lit: false, group: -1}));
  const groups = [];
  for (const seed of targets) {
    if (seed.group !== -1) continue;
    const group = {id: groups.length, x: seed.x, y: seed.y - .62, bounces: 0};
    groups.push(group);
    const queue = [seed];
    seed.group = group.id;
    while (queue.length) {
      const from = queue.shift();
      for (const target of targets) {
        if (target.group === -1 && Math.hypot(target.x - from.x, target.y - from.y) <= PLAY_ARENA.chainDistance) {
          target.group = group.id;
          queue.push(target);
        }
      }
    }
    group.bounces = puzzleBounces[difficulty]?.[index][group.id] ?? 0;
  }
  return {
    level: index, difficulty, puzzle, groups, nextGroup: 0,
    maxShots: puzzle ? groups.length + (difficulty === 'hard' ? 1 : 2) : Infinity,
    angle: 0, shots: 0, elapsed: 0, remainder: 0, paused: false, complete: false, failed: false,
    targets,
    mirrors: definition.mirrors.map((item, id) => ({...item, id})),
    ball: {x: 0, y: -4, vx: 0, vy: 0, active: false, life: 0, bounces: 0},
    events: [],
  };
}

export function firePlayBall(state, angle = state.angle) {
  if (state.paused || state.complete || state.failed || state.shots >= state.maxShots || state.ball.active || !Number.isFinite(angle)) return false;
  state.angle = clamp(angle, -75, 75);
  state.remainder = 0;
  const a = radians(state.angle);
  state.ball = {x: 0, y: -4, vx: Math.sin(a) * 7.8, vy: Math.cos(a) * 7.8, active: true, life: 0, bounces: 0};
  state.shots++;
  state.events.push({type: 'launch', x: 0, y: -4});
  return true;
}

export function recallPlayBall(state) {
  state.remainder = 0;
  state.ball = {x: 0, y: -4, vx: 0, vy: 0, active: false, life: 0, bounces: 0};
  if (!state.complete && state.shots >= state.maxShots) state.failed = true;
}

export function rotatePlayMirror(state, index) {
  const item = state.mirrors[index];
  if (!item?.rotatable || state.ball.active || state.complete || state.failed || state.paused) return false;
  item.angle = -item.angle;
  state.events.push({type: 'turn', x: item.x, y: item.y});
  return true;
}

export function mirrorEnds(item) {
  const dx = Math.cos(radians(item.angle)) * item.length / 2;
  const dy = Math.sin(radians(item.angle)) * item.length / 2;
  return [{x: item.x - dx, y: item.y - dy}, {x: item.x + dx, y: item.y + dy}];
}

function lightCluster(state, first) {
  if (state.puzzle && (first.group !== state.nextGroup || state.ball.bounces !== state.groups[state.nextGroup].bounces)) {
    state.events.push({type: 'rule-miss', reason: first.group !== state.nextGroup ? 'order' : 'bounces', actual: state.ball.bounces});
    recallPlayBall(state);
    return;
  }
  const queue = [first];
  while (queue.length) {
    const target = queue.shift();
    if (target.lit) continue;
    target.lit = true;
    state.events.push({type: 'light', x: target.x, y: target.y, id: target.id});
    for (const candidate of state.targets) {
      if (!candidate.lit && Math.hypot(candidate.x - target.x, candidate.y - target.y) <= PLAY_ARENA.chainDistance) queue.push(candidate);
    }
  }
  if (state.puzzle) state.nextGroup++;
  if (state.targets.every(target => target.lit)) {
    state.complete = true;
    state.ball.active = false;
    state.events.push({type: 'complete'});
  } else if (state.puzzle) {
    recallPlayBall(state);
  }
}

function bounce(state) {
  state.ball.bounces++;
  state.events.push({type: 'bounce', x: state.ball.x, y: state.ball.y});
  if (state.puzzle && state.ball.bounces > state.groups[state.nextGroup].bounces) {
    state.events.push({type: 'rule-miss', reason: 'bounces', actual: state.ball.bounces});
    recallPlayBall(state);
  }
}

function reflectFromMirror(state, item) {
  const b = state.ball;
  const [a, c] = mirrorEnds(item);
  const sx = c.x - a.x, sy = c.y - a.y;
  const t = clamp(((b.x - a.x) * sx + (b.y - a.y) * sy) / (sx * sx + sy * sy), 0, 1);
  const dx = b.x - (a.x + sx * t), dy = b.y - (a.y + sy * t);
  const distance = Math.hypot(dx, dy);
  const minimum = PLAY_ARENA.ballRadius + .085;
  if (distance >= minimum) return;
  let nx, ny;
  if (distance > .00001) { nx = dx / distance; ny = dy / distance; }
  else {
    const length = Math.hypot(sx, sy);
    nx = -sy / length; ny = sx / length;
    if (b.vx * nx + b.vy * ny > 0) { nx = -nx; ny = -ny; }
  }
  b.x += nx * (minimum - distance + .001);
  b.y += ny * (minimum - distance + .001);
  const approach = b.vx * nx + b.vy * ny;
  if (approach < 0) {
    b.vx -= 2 * approach * nx;
    b.vy -= 2 * approach * ny;
    bounce(state);
  }
}

function tick(state, dt) {
  const ball = state.ball;
  state.elapsed += dt;
  ball.life += dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  const xLimit = PLAY_ARENA.halfWidth - PLAY_ARENA.ballRadius;
  const yLimit = PLAY_ARENA.halfHeight - PLAY_ARENA.ballRadius;
  if (Math.abs(ball.x) > xLimit) {
    ball.x = Math.sign(ball.x) * xLimit;
    ball.vx = -Math.sign(ball.x) * Math.abs(ball.vx);
    bounce(state);
    if (!state.ball.active) return;
  }
  if (Math.abs(ball.y) > yLimit) {
    ball.y = Math.sign(ball.y) * yLimit;
    ball.vy = -Math.sign(ball.y) * Math.abs(ball.vy);
    bounce(state);
    if (!state.ball.active) return;
  }
  for (const item of state.mirrors) {
    reflectFromMirror(state, item);
    if (!state.ball.active) return;
  }
  for (const target of state.targets) {
    if (!target.lit && Math.hypot(target.x - ball.x, target.y - ball.y) < PLAY_ARENA.targetRadius + PLAY_ARENA.ballRadius) {
      lightCluster(state, target);
      if (!state.ball.active) return;
    }
  }
  if (ball.life >= 7 && ball.active) {
    recallPlayBall(state);
    state.events.push({type: 'rest'});
  }
}

export function advancePlay(state, elapsed) {
  if (!state.ball.active || state.paused || state.complete || state.failed || !Number.isFinite(elapsed) || elapsed <= 0) return;
  const step = 1 / 240;
  state.remainder += Math.min(elapsed, .2);
  while (state.remainder + 1e-10 >= step && state.ball.active) {
    state.remainder = Math.max(0, state.remainder - step);
    tick(state, step);
  }
}

export function predictPlayTrajectory(state, seconds = state.difficulty === 'hard' ? .4 : .95) {
  const preview = structuredClone(state);
  preview.targets = [];
  preview.complete = false;
  preview.paused = false;
  preview.failed = false;
  preview.puzzle = false;
  preview.maxShots = Infinity;
  preview.ball.active = false;
  preview.events = [];
  firePlayBall(preview, state.angle);
  const points = [{x: preview.ball.x, y: preview.ball.y}];
  for (let i = 0; i < seconds * 60; i++) {
    advancePlay(preview, 1 / 60);
    if (i % 3 === 0) points.push({x: preview.ball.x, y: preview.ball.y});
  }
  return points;
}
