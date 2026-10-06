// Road-local metres, seconds and m/s. Only stepRide advances the simulation.
const STEP = 1 / 120;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const toward = (value, target, amount) => value + clamp(target - value, -amount, amount);
const DIFFICULTIES = {
  easy: {opponentSpeed: 26, damage: .12, cruiseSpeed: 34.44, curveForce: .25, gripLimit: 9},
  standard: {opponentSpeed: 33, damage: .14, cruiseSpeed: 33.5, curveForce: .65, gripLimit: 4.5},
  hard: {opponentSpeed: 34, damage: .19, cruiseSpeed: 33, curveForce: .7, gripLimit: 4.1},
};
const LANES = [-2.6, -1.3, 0, 1.3, 2.6];
const FALL_DURATION = 3;

export function rideRoadAt(distance = 0) {
  const d = finite(distance);
  const dx = 20 / 105 * Math.cos(d / 105) + 8 / 250 * Math.cos(d / 250) + 7 / 55 * Math.cos(d / 55);
  const ddx = -20 / 105 ** 2 * Math.sin(d / 105) - 8 / 250 ** 2 * Math.sin(d / 250) -
    7 / 55 ** 2 * Math.sin(d / 55);
  return {
    x: 20 * Math.sin(d / 105) + 8 * Math.sin(d / 250) + 7 * Math.sin(d / 55),
    y: .8 * Math.sin(d / 180) + .3 * Math.sin(d / 65),
    heading: -Math.atan(dx),
    curve: -ddx / (1 + dx * dx),
  };
}

function random(state) {
  state._sim.seed = (Math.imul(state._sim.seed, 1664525) + 1013904223) >>> 0;
  return state._sim.seed / 4294967296;
}
function emit(state, event) {
  state.events.push(event);
  if (state.events.length > 32) state.events.splice(0, state.events.length - 32);
}

function fillRoad(state) {
  state.obstacles = state.obstacles.filter(obstacle => {
    if (obstacle.distance >= state.distance - 35) return true;
    delete state._sim.hitObstacles[obstacle.id];
    return false;
  });
  while (state.obstacles.length < (state.config.competitive ? 15 : 16) &&
    state._sim.nextObstacleDistance < state.distance + 500) {
    const distance = state._sim.nextObstacleDistance;
    if (state.mode === 'race' && distance > state.config.raceLength - 25) break;
    if (!state.config.competitive) {
      const id = `road-${++state._sim.obstacleId}`;
      const lateral = [-2.65, -.85, .9, 2.65][Math.floor(random(state) * 4)];
      state.obstacles.push({id, distance, lateral, type: random(state) < .6 ? 'cone' : 'barrier'});
      state._sim.nextObstacleDistance += 70 + random(state) * 40;
      continue;
    }
    // Adjacent gaps move at most one lane per row. A rider always has a wide
    // corridor and time to reach it; never generate an across-the-road wall.
    const sim = state._sim;
    const change = random(state) < .5 ? -1 : 1;
    sim.gapLane = clamp(sim.gapLane + change, -1, 1);
    const blocked = [-1, 0, 1].filter(lane => lane !== sim.gapLane);
    const pair = random(state) < (state.difficulty === 'hard' ? .4 : .25);
    const lanes = pair ? blocked : [blocked.includes(0) ? 0 : blocked[Math.floor(random(state) * 2)]];
    for (const lane of lanes) state.obstacles.push({
      id: `road-${++sim.obstacleId}`, distance, lateral: lane * 2.6,
      type: random(state) < .65 ? 'cone' : 'barrier',
    });
    sim.nextObstacleDistance += (state.difficulty === 'hard' ? 38 : 45) +
      random(state) * (state.difficulty === 'hard' ? 14 : 10);
  }
}

export function createRideState({difficulty = 'standard', mode = 'race', seed = 13} = {}) {
  if (!Object.hasOwn(DIFFICULTIES, difficulty)) difficulty = 'standard';
  if (mode !== 'practice') mode = 'race';
  const competitive = difficulty !== 'easy' && mode === 'race';
  const tuning = DIFFICULTIES[competitive ? difficulty : 'easy'];
  const state = {
    difficulty, mode, phase: 'ready', elapsed: 0, distance: 0, speed: 0, lateral: 0, lean: 0,
    stamina: 1, integrity: 1, rank: 6, overtakes: 0, impacts: 0,
    attackTime: 0, attackSide: 0, recovery: 0, opponents: [], obstacles: [], events: [],
    fallTime: 0, fallSide: 1, fallProgress: 0, falls: 0, knockdowns: 0, grip: 1, cornerSpeed: 42,
    goalRank: competitive ? 3 : null, resultReason: null,
    config: {raceLength: 1800, roadHalfWidth: 4.3, maxSpeed: 42, competitive,
      cruiseSpeed: tuning.cruiseSpeed, curveForce: tuning.curveForce, gripLimit: tuning.gripLimit},
    _sim: {seed: finite(seed, 13) >>> 0, accumulator: 0, lateralVelocity: 0, pushCooldown: 0,
      impactCooldown: 0, resumePhase: 'ready', obstacleId: 0, nextObstacleDistance: competitive ? 140 : 80,
      gapLane: 0, wallSide: 0, remountGrace: 0,
      hitObstacles: {}, profiles: {}, wasAhead: {}, finishTimes: {}},
  };
  for (let i = 0; i < 5; i++) {
    const id = `rider-${i + 1}`;
    state.opponents.push({id, distance: 8 + i * 7, lateral: LANES[i],
      speed: 0, lean: 0, stunned: 0, fallTime: 0, fallSide: 1, fallProgress: 0,
      attackWindup: 0, attackTime: 0, attackSide: 0, pushCooldown: 0});
    state._sim.profiles[id] = {
      lane: LANES[i], cruise: tuning.opponentSpeed + i * (competitive ? .45 : .65) + random(state) * .3,
      phase: random(state) * Math.PI * 2, acceleration: (competitive ? 6 : 5) + random(state) * .6, lastObstacle: null,
    };
    state._sim.wasAhead[id] = true;
  }
  fillRoad(state);
  return state;
}

export function startRide(state) {
  if (state.phase !== 'ready') return false;
  state.phase = 'running';
  return true;
}

export function setRidePaused(state, paused) {
  if (typeof paused !== 'boolean' || state.phase === 'finished') return false;
  if (paused) {
    if (state.phase === 'paused') return false;
    state._sim.resumePhase = state.phase;
    state.phase = 'paused';
  } else {
    if (state.phase !== 'paused') return false;
    state.phase = state._sim.resumePhase;
  }
  return true;
}

export function pushRide(state, side) {
  if (state.phase !== 'running' || (side !== -1 && side !== 1) ||
    state._sim.pushCooldown > 0 || state.recovery > 0 || state.fallTime > 0 || state.stamina < .14) return false;
  const rival = state.opponents.filter(opponent => {
    const gap = (opponent.lateral - state.lateral) * side;
    return gap >= .35 && gap <= 1.75 && Math.abs(opponent.distance - state.distance) <= 3.2 &&
      opponent.fallTime <= 0 && state._sim.finishTimes[opponent.id] === undefined;
  }).sort((a, b) => Math.abs(a.distance - state.distance) - Math.abs(b.distance - state.distance))[0];
  if (!rival) return false;
  state.stamina = Math.max(0, state.stamina - .14);
  state._sim.pushCooldown = 1;
  state.attackTime = .28;
  state.attackSide = side;
  rival.lateral = clamp(rival.lateral + side * .8, -state.config.roadHalfWidth + .35, state.config.roadHalfWidth - .35);
  knockdown(state, rival, side, 'push', 'player');
  emit(state, {type: 'push', side, opponentId: rival.id});
  return true;
}

function knockdown(state, actor, side, cause, sourceId) {
  if (actor.fallTime > 0 || (actor === state && state._sim.remountGrace > 0)) return false;
  actor.fallTime = FALL_DURATION; actor.fallProgress = 0;
  actor.fallSide = side < 0 ? -1 : 1; actor.speed *= .25;
  actor.lean = actor.fallSide * .65;
  actor.attackTime = 0; actor.attackWindup = 0; actor.attackSide = 0;
  if (actor === state) {
    state.falls++; state.recovery = FALL_DURATION;
    state._sim.lateralVelocity = 0; state._sim.impactCooldown = FALL_DURATION;
  } else {
    actor.stunned = FALL_DURATION; actor.pushCooldown = Math.max(actor.pushCooldown, 6);
    if (sourceId === 'player') state.knockdowns++;
  }
  emit(state, {type: 'knockdown', targetId: actor === state ? 'player' : actor.id,
    side: actor.fallSide, cause, sourceId});
  return true;
}

function stepFall(state, actor) {
  actor.fallTime = Math.max(0, actor.fallTime - STEP);
  actor.fallProgress = clamp(1 - actor.fallTime / FALL_DURATION, 0, 1);
  actor.speed = toward(actor.speed, 0, STEP * 22);
  actor.distance += actor.speed * STEP;
  if (actor === state) {
    state.recovery = actor.fallTime;
    if (!actor.fallTime) {
      state._sim.remountGrace = 2;
      state._sim.impactCooldown = 2;
      emit(state, {type: 'remount', targetId: 'player'});
    }
  } else {
    actor.stunned = actor.fallTime;
    if (!actor.fallTime) emit(state, {type: 'remount', targetId: actor.id});
  }
}

// Continuous contact in road-local lateral/longitudinal space.
function sweptContact(x0, z0, x1, z1, halfWidth, halfLength) {
  let enter = 0, leave = 1;
  for (const [start, end, size] of [[x0, x1, halfWidth], [z0, z1, halfLength]]) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-12) { if (Math.abs(start) > size) return false; continue; }
    const a = (-size - start) / delta, b = (size - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

function impact(state, kind, id, side = 0) {
  if (state._sim.impactCooldown > 0 || state.fallTime > 0) return false;
  const severity = .5 + .5 * clamp(state.speed / state.config.maxSpeed, 0, 1);
  state.impacts++;
  state.integrity = Math.max(0, state.integrity - DIFFICULTIES[state.difficulty].damage * severity);
  state.speed *= kind === 'rider' ? .7 : .55;
  state.recovery = state.integrity <= .01 ? 2.2 : .8;
  state._sim.impactCooldown = 1.1;
  state._sim.lateralVelocity += side * 1.4;
  emit(state, {type: 'impact', kind, id, severity});
  return true;
}

function counterPush(state, opponent) {
  if (!state.config.competitive || state.elapsed < 8 || opponent.fallTime > 0 || opponent.stunned > 0) return;
  const lateral = state.lateral - opponent.lateral;
  const inReach = Math.abs(lateral) >= .8 && Math.abs(lateral) <= 1.8 &&
    Math.abs(state.distance - opponent.distance) <= 3;
  if (opponent.attackWindup > 0) {
    opponent.attackWindup = Math.max(0, opponent.attackWindup - STEP);
    opponent.lean = opponent.attackSide * .4;
    if (!opponent.attackWindup) {
      opponent.pushCooldown = state.difficulty === 'hard' ? 6 : 8;
      opponent.attackTime = .3;
      if (inReach && Math.sign(lateral) === opponent.attackSide && state.fallTime <= 0 &&
        state._sim.remountGrace <= 0 && state.recovery <= 0) {
        if (impact(state, 'push', opponent.id, opponent.attackSide)) {
          knockdown(state, state, opponent.attackSide, 'push', opponent.id);
        }
      }
    }
  } else if (opponent.pushCooldown <= 0 && inReach && Math.abs(opponent.speed - state.speed) < 5 &&
    state.fallTime <= 0 && state._sim.remountGrace <= 0 && state.recovery <= 0) {
    // No surprise ranged hits: the player can brake, move clear, or push first.
    opponent.attackWindup = .9;
    opponent.attackSide = Math.sign(lateral);
    emit(state, {type: 'rival-windup', opponentId: opponent.id, targetId: 'player',
      side: opponent.attackSide, fromSide: -opponent.attackSide, duration: .9});
  }
}

function moveOpponents(state, startTime) {
  const previous = new Map();
  const limit = state.config.roadHalfWidth - .35;
  for (const opponent of state.opponents) {
    previous.set(opponent.id, {distance: opponent.distance, lateral: opponent.lateral});
    if (state.mode === 'race' && opponent.distance >= state.config.raceLength) {
      state._sim.finishTimes[opponent.id] ??= startTime;
      opponent.distance = state.config.raceLength; opponent.speed = 0;
      continue;
    }
    const profile = state._sim.profiles[opponent.id];
    opponent.pushCooldown = Math.max(0, opponent.pushCooldown - STEP);
    opponent.attackTime = Math.max(0, opponent.attackTime - STEP);
    if (opponent.fallTime > 0) {stepFall(state, opponent); continue;}
    opponent.stunned = Math.max(0, opponent.stunned - STEP);
    const road = rideRoadAt(opponent.distance);
    const cruise = state.config.competitive
      ? Math.min(profile.cruise, Math.sqrt((state.config.gripLimit + .5) / Math.max(.00001, Math.abs(road.curve))))
      : profile.cruise * (1 - Math.min(.08, Math.abs(road.curve) * 20));
    const targetSpeed = cruise * (opponent.stunned > 0 ? .35 : 1);
    opponent.speed = toward(opponent.speed, targetSpeed, STEP *
      (targetSpeed < opponent.speed ? 10 : profile.acceleration));
    let lane = profile.lane + Math.sin(opponent.distance * .024 + profile.phase) * .25;
    const gap = opponent.distance - state.distance;
    if (state.config.competitive && state.elapsed > 6 && state.fallTime <= 0) {
      if (gap > 2 && gap < 10 && state.speed > opponent.speed + .5) {
        lane = clamp(state.lateral, opponent.lateral - 1.1, opponent.lateral + 1.1);
      } else if (gap < -1 && gap > -14 && opponent.speed > state.speed + .5) {
        lane = state.lateral + (opponent.lateral <= state.lateral ? -1.25 : 1.25);
      }
    }
    const upcoming = state.obstacles.filter(item => item.distance > opponent.distance - 2 &&
      item.distance < opponent.distance + (state.config.competitive ? 48 : 30));
    const nearest = upcoming[0]?.distance;
    const row = upcoming.filter(item => item.distance === nearest);
    const clear = candidate => row.every(item =>
      Math.abs(item.lateral - candidate) > (item.type === 'barrier' ? 1.15 : .62) + .18);
    if (!clear(lane)) {
      lane = [-2.6, 0, 2.6].filter(clear).sort((a, b) =>
        Math.abs(a - opponent.lateral) - Math.abs(b - opponent.lateral))[0] ?? lane;
      profile.lane = lane;
    }
    if (Math.abs(gap) < 2 && Math.abs(lane - state.lateral) < .75 && state.fallTime <= 0) {
      lane += opponent.lateral <= state.lateral ? -1 : 1;
    }
    const oldLateral = opponent.lateral;
    if (opponent.stunned <= 0 && opponent.attackWindup <= 0) {
      opponent.lateral = toward(opponent.lateral, clamp(lane, -limit, limit),
        STEP * (state.config.competitive ? 2.3 : 1.5));
    }
    opponent.lean += (clamp((opponent.lateral - oldLateral) / STEP * .2 -
      road.curve * opponent.speed ** 2 * .06, -.55, .55) - opponent.lean) * .07;
    const oldDistance = opponent.distance;
    opponent.distance += opponent.speed * STEP;
    if (state.mode === 'race' && opponent.distance >= state.config.raceLength) {
      state._sim.finishTimes[opponent.id] = startTime + STEP *
        (state.config.raceLength - oldDistance) / (opponent.distance - oldDistance);
      opponent.distance = state.config.raceLength;
      opponent.speed = 0;
    }
    for (const item of state.obstacles) {
      if (profile.lastObstacle === item.id || opponent.stunned > 0) continue;
      if (sweptContact(oldLateral - item.lateral, oldDistance - item.distance,
        opponent.lateral - item.lateral, opponent.distance - item.distance,
        item.type === 'barrier' ? 1.15 : .62, 1.25)) {
        profile.lastObstacle = item.id;
        opponent.speed *= .55; opponent.stunned = .7;
      }
    }
    counterPush(state, opponent);
  }
  return previous;
}

function updateRank(state, finishTime = null) {
  if (finishTime !== null) {
    state.rank = 1 + state.opponents.filter(opponent =>
      state._sim.finishTimes[opponent.id] !== undefined && state._sim.finishTimes[opponent.id] <= finishTime).length;
    return;
  }
  state.rank = 1 + state.opponents.filter(opponent => opponent.distance > state.distance).length;
}

function fixedStep(state, input) {
  const sim = state._sim, startTime = state.elapsed;
  const oldDistance = state.distance, oldLateral = state.lateral;
  state.elapsed += STEP;
  state.attackTime = Math.max(0, state.attackTime - STEP);
  if (!state.attackTime) state.attackSide = 0;
  sim.pushCooldown = Math.max(0, sim.pushCooldown - STEP);
  sim.impactCooldown = Math.max(0, sim.impactCooldown - STEP);
  sim.remountGrace = Math.max(0, sim.remountGrace - STEP);
  state.recovery = Math.max(0, state.recovery - STEP);
  state.integrity = Math.min(1, state.integrity + STEP *
    (state.fallTime > 0 ? .06 : state.config.competitive ? .006 : state.recovery > 0 ? .12 : .025));

  const boosting = input.boost && state.fallTime <= 0 && input.throttle > .2 && input.brake < .2 &&
    state.stamina > 0 && state.recovery <= 0;
  if (boosting) state.stamina = Math.max(0, state.stamina - STEP * .24);
  else if (!input.boost || state.fallTime > 0) state.stamina = Math.min(1, state.stamina + STEP * .14);
  if (state.fallTime > 0) {
    stepFall(state, state);
  } else {
  const topSpeed = (boosting ? state.config.maxSpeed : state.config.cruiseSpeed) * (.8 + state.integrity * .2);
  const targetSpeed = topSpeed * input.throttle * (1 - input.brake);
  const acceleration = targetSpeed >= state.speed
    ? (boosting ? 10 : 7.5) * (state.recovery > 0 ? .45 : 1)
    : input.brake > 0 ? 2 + input.brake * 18 : 2 + state.speed * .04;
  state.speed = clamp(toward(state.speed, targetSpeed, acceleration * STEP), 0, state.config.maxSpeed);

  const curve = rideRoadAt(state.distance).curve;
  const load = Math.abs(curve) * state.speed ** 2;
  state.grip = clamp(1 - Math.max(0, load / state.config.gripLimit - 1) * .7, .55, 1);
  state.cornerSpeed = Math.min(state.config.maxSpeed,
    Math.sqrt(state.config.gripLimit / Math.max(.00001, Math.abs(curve))));
  const steerRate = (2 + state.speed * .1) * Math.min(1, state.speed / 8);
  const lateralTarget = input.steer * steerRate * state.grip * (state.recovery > 0 ? .65 : 1) +
    curve * state.speed ** 2 * state.config.curveForce;
  sim.lateralVelocity += (lateralTarget - sim.lateralVelocity) * (1 - Math.exp(-7 * STEP));
  state.lateral += sim.lateralVelocity * STEP;
  state.lean += (clamp(input.steer * .4 + sim.lateralVelocity * .055 -
    curve * state.speed ** 2 * .08 + Math.sin(state.elapsed * 19) * Math.min(.15, state.recovery * .1),
  -.65, .65) - state.lean) * .09;
  state.distance += state.speed * STEP;
  }
  const previousOpponents = moveOpponents(state, startTime);

  const limit = state.config.roadHalfWidth - .35;
  if (Math.abs(state.lateral) > limit) {
    const side = state.lateral > 0 ? -1 : 1;
    state.lateral = clamp(state.lateral, -limit, limit);
    sim.lateralVelocity *= .3;
    const speed = state.speed;
    if (sim.wallSide !== side && impact(state, 'edge', side < 0 ? 'right' : 'left', side) &&
      speed > 30 && state.config.competitive) knockdown(state, state, side, 'edge', null);
    sim.wallSide = side;
  } else if (Math.abs(state.lateral) < limit - .25) sim.wallSide = 0;
  for (const obstacle of state.obstacles) {
    if (sim.hitObstacles[obstacle.id]) continue;
    if (sweptContact(oldLateral - obstacle.lateral, oldDistance - obstacle.distance,
      state.lateral - obstacle.lateral, state.distance - obstacle.distance,
      obstacle.type === 'barrier' ? 1.15 : .62, 1.25)) {
      sim.hitObstacles[obstacle.id] = true;
      const speed = state.speed, side = state.lateral <= obstacle.lateral ? -1 : 1;
      if (impact(state, 'obstacle', obstacle.id, side) && speed > 30 &&
        state.config.competitive) knockdown(state, state, side, 'obstacle', obstacle.id);
    }
  }
  for (const opponent of state.opponents) {
    if (sim.finishTimes[opponent.id] !== undefined || opponent.fallTime > 0 || state.fallTime > 0) continue;
    const previous = previousOpponents.get(opponent.id);
    if (sweptContact(oldLateral - previous.lateral, oldDistance - previous.distance,
      state.lateral - opponent.lateral, state.distance - opponent.distance, .68, 1.8)) {
      const closing = state.speed - opponent.speed;
      const sideSpeed = Math.abs(sim.lateralVelocity - (opponent.lateral - previous.lateral) / STEP);
      if (impact(state, 'rider', opponent.id, state.lateral <= opponent.lateral ? -1 : 1)) {
        if (closing > 7 || (sideSpeed > 2.8 && Math.abs(input.steer) > .4)) {
          knockdown(state, opponent, state.lateral <= opponent.lateral ? 1 : -1, 'collision', 'player');
        } else if (closing < -8 && state.config.competitive) {
          knockdown(state, state, state.lateral <= opponent.lateral ? -1 : 1, 'collision', opponent.id);
        } else {
          opponent.stunned = Math.max(.65, opponent.stunned);
          opponent.speed *= .8;
        }
      }
    }
  }

  for (const opponent of state.opponents) {
    if (sim.wasAhead[opponent.id] && opponent.distance < state.distance - .8) {
      state.overtakes++; sim.wasAhead[opponent.id] = false;
      emit(state, {type: 'overtake', opponentId: opponent.id});
    } else if (opponent.distance > state.distance + .8) sim.wasAhead[opponent.id] = true;
  }
  if (state.mode === 'race' && state.distance >= state.config.raceLength) {
    const time = startTime + STEP * (state.config.raceLength - oldDistance) / (state.distance - oldDistance);
    state.distance = state.config.raceLength;
    state.elapsed = time;
    updateRank(state, time);
    state.phase = 'finished';
    state.resultReason = state.goalRank !== null && state.rank <= state.goalRank ? 'podium' : 'finish';
    emit(state, {type: 'finish', rank: state.rank, time, resultReason: state.resultReason});
    return;
  }
  if (state.mode === 'practice') {
    for (const opponent of state.opponents) if (Math.abs(opponent.distance - state.distance) > 220) {
      const wasFarAhead = opponent.distance > state.distance;
      opponent.distance = state.distance + (wasFarAhead ? -80 : 120);
      opponent.lateral = sim.profiles[opponent.id].lane;
      opponent.speed = sim.profiles[opponent.id].cruise;
      opponent.stunned = 0; opponent.fallTime = 0; opponent.fallProgress = 0;
      opponent.attackWindup = 0; opponent.attackTime = 0;
      sim.wasAhead[opponent.id] = !wasFarAhead;
    }
  }
  updateRank(state);
  fillRoad(state);
}

export function stepRide(state, controls = {}, dt) {
  if (state.phase !== 'running' || !Number.isFinite(dt) || dt <= 0) return false;
  state.events.length = 0;
  const input = {
    steer: clamp(finite(controls?.steer), -1, 1),
    throttle: clamp(finite(controls?.throttle), 0, 1),
    brake: clamp(finite(controls?.brake), 0, 1),
    boost: controls?.boost === true,
  };
  state._sim.accumulator += Math.min(dt, .25);
  while (state._sim.accumulator + 1e-12 >= STEP && state.phase === 'running') {
    state._sim.accumulator = Math.max(0, state._sim.accumulator - STEP);
    fixedStep(state, input);
  }
  if (state.phase === 'finished') state._sim.accumulator = 0;
  return true;
}
