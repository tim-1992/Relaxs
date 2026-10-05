const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeArcadeDifficulty(value) {
  return value === 'standard' || value === 'hard' ? value : 'easy';
}

export const TARGET_MARKS = Object.freeze([
  Object.freeze({ id: 0, shape: 'triangle', symbol: '△', name: '三角', label: '1号三角' }),
  Object.freeze({ id: 1, shape: 'square', symbol: '□', name: '方块', label: '2号方块' }),
  Object.freeze({ id: 2, shape: 'circle', symbol: '○', name: '圆形', label: '3号圆形' }),
  Object.freeze({ id: 3, shape: 'diamond', symbol: '◇', name: '菱形', label: '4号菱形' }),
]);

export function createTargetChallenge(difficulty = 'easy') {
  difficulty = normalizeArcadeDifficulty(difficulty);
  const sequence = difficulty === 'hard' ? [3, 1, 0, 2, 1, 3, 2, 0, 3]
    : difficulty === 'standard' ? [2, 0, 3, 1, 2, 1] : [];
  return {
    difficulty, sequence, goal: sequence.length || 12,
    ammo: difficulty === 'hard' ? 10 : difficulty === 'standard' ? 8 : null,
    progress: 0, shots: 0, status: 'playing',
  };
}

/** hitId is the target actually hit/chosen; null is an empty shot. */
export function recordTargetShot(state, hitId) {
  if (state.status !== 'playing') return { accepted: false };
  const validHit = Number.isInteger(hitId) && hitId >= 0 && hitId < TARGET_MARKS.length;
  const expected = state.sequence[state.progress] ?? null;
  const correct = validHit && (state.difficulty === 'easy' || hitId === expected);
  state.shots++;
  if (state.ammo !== null) state.ammo--;
  if (correct) state.progress++;
  // A correct final shot wins even if it spends the last round.
  if (state.progress === state.goal) state.status = 'won';
  else if (state.ammo === 0) state.status = 'lost';
  return { accepted: true, outcome: correct ? 'correct' : validHit ? 'wrong' : 'miss', expected };
}

export const TENNIS_COURT = Object.freeze({
  left: 34, right: 606, wallY: 80, paddleY: 373, contactY: 353,
  bottom: 454, paddleHalfWidth: 65, contactReach: 76, returnSpeed: 248,
});

export const TENNIS_ZONES = Object.freeze([
  Object.freeze({ id: 'left', label: '左区', symbol: 'Ⅰ', left: 34, right: 224 }),
  Object.freeze({ id: 'center', label: '中区', symbol: 'Ⅱ', left: 224, right: 416 }),
  Object.freeze({ id: 'right', label: '右区', symbol: 'Ⅲ', left: 416, right: 606 }),
]);

export function tennisWallZone(x) {
  if (!Number.isFinite(x) || x < TENNIS_COURT.left || x > TENNIS_COURT.right) return null;
  return x < 224 ? 'left' : x < 416 ? 'center' : 'right';
}

/** Challenge modes only; easy tennis retains its original five-ball rally. */
export function createTennisChallenge(difficulty = 'standard') {
  difficulty = difficulty === 'hard' ? 'hard' : 'standard';
  const routes = [['left', 'right', 'center']];
  if (difficulty === 'hard') routes.push(['right', 'left', 'right'], ['center', 'left', 'center']);
  return { difficulty, routes, routeIndex: 0, step: 0, ballsLeft: 5, status: 'playing' };
}

export function recordTennisWallHit(state, x, playerReturn) {
  const zone = tennisWallZone(x);
  if (state.status !== 'playing' || !playerReturn || !zone) return { accepted: false };
  const expected = state.routes[state.routeIndex][state.step];
  const correct = zone === expected;
  if (correct) {
    state.step++;
    if (state.step === state.routes[state.routeIndex].length) {
      state.routeIndex++;
      state.step = 0;
      if (state.routeIndex === state.routes.length) state.status = 'won';
    }
  } else {
    state.step = 0;
  }
  return { accepted: true, correct, zone, expected };
}

export function missTennisBall(state) {
  if (state.status !== 'playing') return false;
  state.ballsLeft--;
  state.step = 0;
  if (state.ballsLeft === 0) state.status = 'lost';
  return true;
}

export function tennisReturnVelocity(ballX, paddleX) {
  if (!Number.isFinite(ballX) || !Number.isFinite(paddleX) ||
      Math.abs(ballX - paddleX) > TENNIS_COURT.contactReach) return null;
  const offset = clamp((ballX - paddleX) / TENNIS_COURT.paddleHalfWidth, -1, 1);
  const vx = offset * TENNIS_COURT.returnSpeed * .88;
  return { vx, vy: -Math.sqrt(TENNIS_COURT.returnSpeed ** 2 - vx ** 2) };
}

export function releaseTennisBall(ball, paddleX) {
  if (!ball.held || ball.out) return false;
  const velocity = tennisReturnVelocity(ball.x, paddleX);
  if (!velocity) return false;
  Object.assign(ball, velocity, { held: false, playerReturn: true, missedPaddle: false });
  return true;
}

/** Fold a straight ray at the two side walls to predict its real landing. */
export function projectTennisX(ball, y) {
  if (!ball.vy) return null;
  const time = (y - ball.y) / ball.vy;
  if (time < 0 || !Number.isFinite(time)) return null;
  const width = TENNIS_COURT.right - TENNIS_COURT.left;
  const unfolded = ball.x - TENNIS_COURT.left + ball.vx * time;
  const phase = ((unfolded % (2 * width)) + 2 * width) % (2 * width);
  return TENNIS_COURT.left + (phase <= width ? phase : 2 * width - phase);
}

/**
 * Swept collisions keep wall zones and catches independent of frame rate.
 * A caught ball stops until releaseTennisBall: planning never uses a timer.
 */
export function advanceTennisFlight(ball, elapsed, paddleX) {
  if (ball.held || ball.out || !Number.isFinite(elapsed) || elapsed <= 0) return [];
  const events = [];
  let remaining = elapsed;
  for (let collisions = 0; remaining > 1e-10 && collisions < 128; collisions++) {
    const sideX = ball.vx > 0 ? TENNIS_COURT.right : TENNIS_COURT.left;
    const sideTime = ball.vx ? Math.max(0, (sideX - ball.x) / ball.vx) : Infinity;
    const headingUp = ball.vy < 0;
    const canCatch = !headingUp && !ball.missedPaddle && ball.y <= TENNIS_COURT.contactY;
    const lineY = headingUp ? TENNIS_COURT.wallY : canCatch ? TENNIS_COURT.contactY : TENNIS_COURT.bottom;
    const lineTime = ball.vy ? Math.max(0, (lineY - ball.y) / ball.vy) : Infinity;
    const time = Math.min(remaining, sideTime, lineTime);
    ball.x += ball.vx * time;
    ball.y += ball.vy * time;
    remaining -= time;
    if (sideTime <= time + 1e-10) {
      ball.x = sideX;
      ball.vx *= -1;
    }
    if (lineTime <= time + 1e-10) {
      ball.y = lineY;
      if (headingUp) {
        ball.vy *= -1;
        events.push({ type: 'wall', x: ball.x, playerReturn: Boolean(ball.playerReturn) });
        ball.playerReturn = false;
      } else if (canCatch) {
        if (Math.abs(ball.x - paddleX) <= TENNIS_COURT.contactReach) {
          Object.assign(ball, { vx: 0, vy: 0, held: true });
          events.push({ type: 'catch', x: ball.x });
          break;
        }
        ball.missedPaddle = true;
      } else {
        Object.assign(ball, { vx: 0, vy: 0, out: true });
        events.push({ type: 'out' });
        break;
      }
    }
  }
  return events;
}
