export const DIVE_TARGETS = Object.freeze([
  {id:'turtle', name:'绿海龟', caption:'礁缘的慢旅行者', range:10, frameRadius:1.35, hint:'浅礁上方 · 约 5 米'},
  {id:'ray', name:'蝠鲼', caption:'蓝水中缓缓舒展的翅膀', range:14, frameRadius:2.7, hint:'东侧礁缘 · 约 7 米'},
  {id:'arch', name:'珊瑚拱门', caption:'阳光穿过礁石的地方', range:16, frameRadius:3.75, hint:'西侧礁台 · 约 7 米'},
  {id:'wreck', name:'旧木船', caption:'被海洋慢慢收回的小船', range:16, frameRadius:3.4, hint:'远处深蓝 · 约 16 米'},
]);

export const DIVE_FOV = 58;
export const DIVE_ASSET_NAMES = Object.freeze({
  turtle:'海龟', coral:'珊瑚', manta:'蝠鲼', dolphin:'海豚', clownfish:'小丑鱼',
  angelfish:'神仙鱼', seafan:'海扇', tablecoral:'桌形珊瑚', anemone:'海葵',
});
// Fixed sites make the composition independent of asynchronous asset arrival.
export const DIVE_REEF_SITES = Object.freeze({
  coral:[[-5.3,-5.9,1.08,.4],[4.7,-8.8,.85,-1],[-6.3,-12.2,.8,1.3],[6,-11,.72,.2]],
  tablecoral:[[-3.6,-3.4,1.05,.2],[4.4,-6.7,1.1,-1.4],[-3.25,-8.8,.88,1.2],
    [-5.8,-4.3,.74,-.6],[5.5,-11.8,.78,.8],[-7.5,-15.5,.68,2.1],[8.6,-19,.6,-2]],
  seafan:[[-4.5,-3,.98,.35],[5.1,-8.8,1.03,-.55],[-6.7,-11.7,.83,0],
    [-3.8,-13.5,.72,.6],[7.5,-18,.65,-.5]],
  anemone:[[4.15,-5.7,1,.15],[-4.6,-9,.9,1.6],[4,-10.1,.8,-.8],
    [5.1,-4.2,.68,.5],[-4.4,-5.5,.77,-1.2],[-7,-10,.65,2]],
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const axis = value => Number.isFinite(value) ? clamp(value, -1, 1) : 0;
const spawn = () => ({x:0, y:-4, z:3});
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const FIXED_STEP = 1 / 120;

// The renderer uses this same seabed, so swimming cannot go under a visible sand bank.
export function diveFloorAt(x, z) {
  const channel = .65 * Math.sin((z + 4) * .12);
  const floor = -20 + 9.2 * Math.exp(-(x * x / 1000 + (z + 4) ** 2 / 800))
    + 3.3 * Math.exp(-((x + 14) ** 2 / 220 + (z + 16) ** 2 / 650))
    + 2.2 * Math.exp(-((x - 20) ** 2 / 280 + (z + 14) ** 2 / 380))
    + 1.65 * Math.exp(-((Math.abs(x - channel) - 4.3) ** 2 / 5.8 + (z + 5) ** 2 / 250))
    + 2.35 * Math.exp(-(x * x / 260 + (z + 4) ** 2 / 420))
    + .08 * Math.sin(x * .19 + z * .1) + .06 * Math.cos(z * .29);
  // Broad reef tops support the exported coral bases; the central channel stays below the turtle.
  const across = Math.abs(x - channel);
  const inner = clamp((across - 2.6) / 1.1,0,1), outer = clamp((across - 7.5) / 3.5,0,1);
  const bank = inner * inner * (3 - 2 * inner) * (1 - outer * outer * (3 - 2 * outer))
    * Math.exp(-(((z + 4) / 11) ** 4));
  const terrace = -5 - .004 * (z + 5) ** 2;
  return floor + Math.max(0,terrace - floor) * bank;
}

export function diveTargetAt(id, time = 0) {
  const t = Number.isFinite(time) ? time : 0;
  if (id === 'turtle') return {x:.8 + 1.4 * Math.sin(t * .07), y:-4.75 + .2 * Math.sin(t * .2), z:-5.55 + 2.4 * Math.cos(t * .07 - .65)};
  if (id === 'ray') {
    const x = 5.5 + 4 * Math.sin(t * .055 + .45), z = -17 + 4 * Math.cos(t * .055 + .45);
    return {x, y:diveFloorAt(x, z) + 3.5, z};
  }
  if (id === 'arch') return {x:-13, y:diveFloorAt(-13, -16) + 3.4, z:-16};
  if (id === 'wreck') return {x:17, y:diveFloorAt(17, -36) + 2, z:-36};
  return null;
}

export function diveWildlifeAt(kind, index = 0, time = 0) {
  const t = Number.isFinite(time) ? time : 0;
  if (kind === 'manta') return diveTargetAt('ray', t);
  if (kind === 'turtle') return diveTargetAt('turtle', t);
  if (kind === 'dolphin') return {
    x:-5 + 7 * Math.sin(t * .045 + .25), y:-3.25 + .35 * Math.sin(t * .08),
    z:-15 + 3.8 * Math.cos(t * .045 + .25),
  };
  if (kind === 'clownfish') {
    const [cx,cz] = DIVE_REEF_SITES.anemone[index % 2];
    const phase = t * .34 + index * 2.4, radius = .38 + Math.floor(index / 2) * .13;
    return {x:cx + Math.cos(phase) * radius, z:cz + Math.sin(phase) * radius,
      y:diveFloorAt(cx,cz) + 1.2 + .15 * Math.sin(t * .6 + index)};
  }
  if (kind === 'angelfish') {
    const offsets = [[-.6,.12,-.5],[.1,.4,.2],[.55,-.1,-.05],[-.2,.2,.8]][index % 4];
    const phase = t * .11, x = -1.9 + Math.sin(phase) * 1.8 + offsets[0];
    const z = -10.5 + Math.cos(phase * .7) * 1.1 + offsets[2];
    return {x, z, y:diveFloorAt(x,z) + 1.9 + offsets[1] + Math.sin(t * .65 + index) * .07};
  }
  return null;
}

export function createDiveState() {
  const position = spawn(), turtle = diveTargetAt('turtle');
  const dx = turtle.x - position.x, dy = turtle.y - position.y, dz = turtle.z - position.z;
  return {
    phase:'ready', elapsed:0, accumulator:0, position, velocity:{x:0,y:0,z:0},
    yaw:Math.atan2(-dx,-dz), pitch:Math.atan2(dy,Math.hypot(dx,dz)),
    discoveries:[], complete:false, nextPhotoAt:0,
  };
}

export function startDive(state) {
  if (state.phase !== 'ready') return false;
  state.phase = 'running'; return true;
}

export function setDivePaused(state, paused) {
  if (paused && state.phase === 'running') {
    state.phase = 'paused'; state.accumulator = 0; return true;
  }
  if (!paused && state.phase === 'paused') {state.phase = 'running'; return true;}
  return false;
}

export function lookDive(state, yawDelta, pitchDelta) {
  if (state.phase !== 'running') return;
  if (Number.isFinite(yawDelta)) state.yaw = wrap(state.yaw + yawDelta);
  if (Number.isFinite(pitchDelta)) state.pitch = clamp(state.pitch + pitchDelta, -1.32, 1.25);
}

export function stepDive(state, input = {}, dt = 0) {
  if (state.phase !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
  state.accumulator += Math.min(.25, dt);
  while (state.accumulator + 1e-10 >= FIXED_STEP) {
    state.accumulator = Math.max(0, state.accumulator - FIXED_STEP);
    lookDive(state, axis(input.lookX) * FIXED_STEP * 1.05, axis(input.lookY) * FIXED_STEP * .85);
    const forward = axis(input.forward), strafe = axis(input.strafe), rise = axis(input.rise);
    const c = Math.cos(state.pitch), s = Math.sin(state.pitch);
    let x = -Math.sin(state.yaw) * c * forward + Math.cos(state.yaw) * strafe;
    let y = s * forward + rise;
    let z = -Math.cos(state.yaw) * c * forward - Math.sin(state.yaw) * strafe;
    const length = Math.max(1, Math.hypot(x, y, z));
    x *= 3.1 / length; y *= 3.1 / length; z *= 3.1 / length;
    const damping = Math.exp(-4 * FIXED_STEP);
    for (const [key, desired] of [['x',x], ['y',y], ['z',z]]) {
      const previous = state.velocity[key];
      state.velocity[key] = desired + (previous - desired) * damping;
      state.position[key] += desired * FIXED_STEP + (previous - desired) * (1 - damping) / 4;
    }
    state.position.x = clamp(state.position.x, -44, 44);
    state.position.z = clamp(state.position.z, -60, 28);
    state.position.y = clamp(state.position.y, diveFloorAt(state.position.x, state.position.z) + 1.15, -.85);
    state.elapsed += FIXED_STEP;
  }
}

export function surfaceDive(state) {
  state.position = {...spawn(), y:-1.1}; state.velocity = {x:0,y:0,z:0};
  state.yaw = 0; state.pitch = -.18; state.accumulator = 0;
}

export function restartDive(state) {
  Object.assign(state, createDiveState());
}

export function diveDepthZone(state) {
  const depth = -state.position.y;
  return depth < 6 ? {id:'sunlit', name:'透光浅水'}
    : depth < 13 ? {id:'reef', name:'珊瑚礁缘'} : {id:'blue', name:'深蓝沙坡'};
}

export function divePhotoCandidate(state, {aspect = 1} = {}) {
  if (state.phase !== 'running') return null;
  const forward = {
    x:-Math.sin(state.yaw) * Math.cos(state.pitch),
    y:Math.sin(state.pitch),
    z:-Math.cos(state.yaw) * Math.cos(state.pitch),
  };
  const right = {x:Math.cos(state.yaw), y:0, z:-Math.sin(state.yaw)};
  const up = {x:Math.sin(state.yaw) * Math.sin(state.pitch), y:Math.cos(state.pitch),
    z:Math.cos(state.yaw) * Math.sin(state.pitch)};
  const vertical = Math.tan(DIVE_FOV * Math.PI / 360);
  const horizontal = vertical * (Number.isFinite(aspect) && aspect > 0 ? aspect : 1);
  let best = null;
  for (const target of DIVE_TARGETS) {
    const point = diveTargetAt(target.id, state.elapsed);
    const dx = point.x - state.position.x, dy = point.y - state.position.y, dz = point.z - state.position.z;
    const distance = Math.hypot(dx, dy, dz);
    const depth = dx * forward.x + dy * forward.y + dz * forward.z;
    if (distance < 1 || distance > target.range ||
      depth / distance < Math.cos(.17)) continue;
    // Keep the entire subject inside both frustum planes, with room around the photograph.
    const radius = target.frameRadius;
    const x = Math.abs(dx * right.x + dz * right.z), y = Math.abs(dx * up.x + dy * up.y + dz * up.z);
    if (x + radius * Math.hypot(1, horizontal) > depth * horizontal * .95 ||
      y + radius * Math.hypot(1, vertical) > depth * vertical * .95) continue;
    let blocked = false;
    for (let step = 1; step < Math.ceil(distance); step++) {
      const part = step / Math.ceil(distance);
      if (state.position.y + dy * part < diveFloorAt(state.position.x + dx * part, state.position.z + dz * part) + .15) {
        blocked = true; break;
      }
    }
    if (!blocked && (!best || distance < best.distance)) best = {...target, distance};
  }
  return best;
}

export function takeDivePhoto(state, framing) {
  if (state.phase !== 'running') return {ok:false, reason:'paused'};
  if (state.elapsed < state.nextPhotoAt) return {ok:false, reason:'cooldown'};
  const target = divePhotoCandidate(state, framing);
  if (!target) return {ok:false, reason:'framing'};
  if (state.discoveries.some(photo => photo.id === target.id)) return {ok:false, reason:'collected', id:target.id};
  const photo = {id:target.id, at:state.elapsed, depth:-state.position.y};
  state.discoveries.push(photo); state.nextPhotoAt = state.elapsed + 1.1;
  state.complete = state.discoveries.length === DIVE_TARGETS.length;
  return {ok:true, ...photo, complete:state.complete};
}
