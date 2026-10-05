// A deliberately toy-like support puzzle. Distances and strengths are game units.
// No browser, timers, randomness or rendering dependencies belong in this module.
export const BLAST_LAYOUTS = Object.freeze([
  {id: 'house', name: '薄荷小楼', subtitle: '03 / LITTLE HOUSE', hint: '先看看底层。连着更多横梁的支点，会带来更长的连锁。'},
  {id: 'tower', name: '日落高塔', subtitle: '04 / SUNSET TOWER', hint: '四层叠起来的小塔。试试让一侧先失去支撑。'},
  {id: 'bridge', name: '周末天桥', subtitle: '02 / WEEKEND BRIDGE', hint: '桥面连着两边。中间的连接点，也许藏着惊喜。'},
]);
export const BLAST_TYPES = Object.freeze([
  {id: 'small', name: '小范围', caption: 'SMALL', radius: 1.12},
  {id: 'wide', name: '大范围', caption: 'WIDE', radius: 2.85},
]);
const RULES = {easy: {placements: 3, target: 55}, standard: {placements: 2, target: 65}, hard: {placements: 1, target: 75}};
const STEP = 1 / 60;
const vector = (x = 0, y = 0, z = 0) => ({x, y, z});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const sample = (index, salt = 0) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.545;
  return value - Math.floor(value);
};

function building(layout) {
  const pieces = [];
  const add = (id, label, kind, position, size, supports = [], extra = {}) => {
    const piece = {
      id: `${layout}-${id}`, label, kind, position, origin: {...position}, size,
      color: 0xc7dece, supports: supports.map(support => `${layout}-${support}`),
      required: supports.length, anchor: supports.length === 0,
      status: 'stable', rotation: vector(), velocity: vector(), spin: vector(),
      delay: null, bounces: 0, index: pieces.length, ...extra,
    };
    pieces.push(piece);
    return id;
  };
  if (layout === 'bridge') {
    const xs = [-4.05, -1.35, 1.35, 4.05], zs = [-.85, .85];
    for (let x = 0; x < xs.length; x++) for (let z = 0; z < 2; z++) {
      add(`column-0-${x}-${z}`, `${z ? '前' : '后'}排 · ${x + 1} 号桥墩`, 'column',
        vector(xs[x], 1.24, zs[z]), vector(.42, 2.48, .42), [], {color: 0xedb98f});
    }
    for (let bay = 0; bay < 3; bay++) for (let z = 0; z < 2; z++) {
      const x = (xs[bay] + xs[bay + 1]) / 2;
      const beam = add(`beam-0-${bay}-${z}`, `${bay + 1} 跨 · ${z ? '前' : '后'}横梁`, 'beam',
        vector(x, 2.51, zs[z]), vector(2.78, .28, .34),
        [`column-0-${bay}-${z}`, `column-0-${bay + 1}-${z}`], {color: 0xdf8c63});
      const deck = add(`floor-0-${bay}-${z}`, `${bay + 1} 跨 · ${z ? '前' : '后'}桥面`, 'floor',
        vector(x, 2.74, z ? .46 : -.46), vector(2.65, .2, .94), [beam], {color: 0xf2dbad});
      add(`rail-0-${bay}-${z}`, `${bay + 1} 跨 · ${z ? '前' : '后'}栏杆`, 'rail',
        vector(x, 3.31, zs[z]), vector(2.62, .95, .13), [deck], {color: 0x80bdb0});
      add(`trim-0-${bay}-${z}`, `${bay + 1} 跨 · 桥边装饰`, 'trim',
        vector(x, 2.47, zs[z] * 1.22), vector(2.5, .13, .12), [beam], {color: 0x6c9e93});
    }
    return {pieces, suggestedTarget: 'bridge-column-0-1-1'};
  }

  const tower = layout === 'tower';
  const xs = tower ? [-1.18, 1.18] : [-2.5, 0, 2.5];
  const zs = tower ? [-1.18, 1.18] : [-1.3, 1.3];
  const floors = tower ? 4 : 3, bayWidth = xs[1] - xs[0], depth = zs[1] - zs[0];
  for (let level = 0; level < floors; level++) {
    const y = level * 2;
    for (let x = 0; x < xs.length; x++) for (let z = 0; z < 2; z++) {
      const supports = level ? [`floor-${level - 1}-${Math.min(x, xs.length - 2)}-${z}`] : [];
      add(`column-${level}-${x}-${z}`, `${level + 1} 层 · ${z ? '前' : '后'}排 ${x + 1} 号立柱`, 'column',
        vector(xs[x], y + .89, zs[z]), vector(.3, 1.78, .3), supports,
        {color: tower ? 0xf1d3b0 : 0xd9e4cf});
    }
    for (let bay = 0; bay < xs.length - 1; bay++) for (let z = 0; z < 2; z++) {
      const x = (xs[bay] + xs[bay + 1]) / 2;
      const beam = add(`beam-${level}-${bay}-${z}`, `${level + 1} 层 · ${z ? '前' : '后'} ${bay + 1} 号横梁`, 'beam',
        vector(x, y + 1.83, zs[z]), vector(bayWidth + .25, .28, .34),
        [`column-${level}-${bay}-${z}`, `column-${level}-${bay + 1}-${z}`],
        {color: tower ? 0xdb8b6d : 0x74a99b});
      add(`floor-${level}-${bay}-${z}`, `${level + 1} 层 · ${z ? '前' : '后'} ${bay + 1} 号楼板`, 'floor',
        vector(x, y + 1.99, zs[z] / 2), vector(bayWidth + .12, .18, depth / 2 + .1),
        [beam], {color: 0xf0d9b5});
      add(`wall-${level}-${bay}-${z}`, `${level + 1} 层 · ${z ? '前' : '后'} ${bay + 1} 扇窗墙`, 'wall',
        vector(x, y + .92, zs[z]), vector(bayWidth - .36, 1.44, .2), [beam],
        {color: tower ? (level % 2 ? 0xe4a785 : 0xecc5a0) : (level % 2 ? 0x9cc7b4 : 0xb5d7bd)});
    }
    for (const [side, x] of [[0, xs[0]], [1, xs.at(-1)]]) {
      add(`side-${level}-${side}`, `${level + 1} 层 · ${side ? '右' : '左'}侧窗墙`, 'wall',
        vector(x, y + .92, 0), vector(.2, 1.44, depth - .35),
        [`column-${level}-${side ? xs.length - 1 : 0}-0`, `column-${level}-${side ? xs.length - 1 : 0}-1`],
        {color: tower ? 0xdbab8e : 0xa4c4ab, sideWall: true});
    }
  }
  const top = floors * 2;
  for (let bay = 0; bay < xs.length - 1; bay++) for (let z = 0; z < 2; z++) {
    const x = (xs[bay] + xs[bay + 1]) / 2;
    add(`roof-${bay}-${z}`, `屋顶 · ${bay + 1} 号${z ? '前' : '后'}坡`, 'roof',
      vector(x, top + .25, zs[z] / 2), vector(bayWidth + .38, .2, depth / 2 + .44),
      [`floor-${floors - 1}-${bay}-${z}`],
      {color: tower ? 0x779c96 : 0xe4a177, rotation: vector(z ? .16 : -.16, 0, 0)});
  }
  add('chimney', '屋顶 · 小烟囱', 'chimney', vector(xs[0] + .53, top + .63, -.46),
    vector(.42, .85, .48), ['roof-0-0'], {color: 0xf3dbc0});
  return {pieces, suggestedTarget: `${layout}-column-0-${tower ? 0 : 1}-1`};
}

export function createBlastState({layout = 'house', difficulty = 'standard', mode = 'challenge'} = {}) {
  if (!BLAST_LAYOUTS.some(item => item.id === layout)) layout = 'house';
  if (!Object.hasOwn(RULES, difficulty)) difficulty = 'standard';
  if (mode !== 'practice') mode = 'challenge';
  const {pieces, suggestedTarget} = building(layout);
  return {
    layout, difficulty, mode, phase: 'planning', paused: false, blastType: 'small',
    pieces, suggestedTarget, selectedId: null, selectedPoint: null,
    markers: [], bursts: [], effects: [], events: [], elapsed: 0, attemptTime: 0,
    accumulator: 0, nextMarker: 1,
    stats: {fallen: 0, direct: 0, chain: 0, bounces: 0},
  };
}

const editable = state => state.phase === 'planning' && !state.paused;
const typeOf = id => BLAST_TYPES.find(type => type.id === id);
function emit(state, event) {
  state.events.push(event);
  if (state.events.length > 96) state.events.splice(0, state.events.length - 96);
}
function distanceToPiece(point, piece) {
  return Math.hypot(...['x', 'y', 'z'].map(axis =>
    Math.max(0, Math.abs(point[axis] - piece.position[axis]) - piece.size[axis] / 2)));
}

/** Ray hits retain their exact surface position; keyboard selection uses its front face. */
export function selectBlastTarget(state, id, point) {
  if (!editable(state)) return false;
  const piece = state.pieces.find(item => item.id === id && item.status === 'stable');
  if (!piece) return false;
  if (point && (!['x', 'y', 'z'].every(axis => Number.isFinite(point[axis])) || distanceToPiece(point, piece) > .25)) return false;
  state.selectedId = id;
  state.selectedPoint = point ? {...point} : {...piece.position, z: piece.position.z + piece.size.z / 2};
  return true;
}
export function setBlastType(state, type) {
  if (!editable(state) || !typeOf(type)) return false;
  state.blastType = type;
  return true;
}
export function plantBlast(state) {
  if (!editable(state) || !state.selectedPoint) return false;
  if (!state.pieces.some(piece => piece.id === state.selectedId && piece.status === 'stable')) return false;
  if (state.markers.some(marker => marker.pieceId === state.selectedId)) return false;
  if (getBlastProgress(state).remaining <= 0) return false;
  state.markers.push({id: state.nextMarker++, pieceId: state.selectedId, point: {...state.selectedPoint}, type: state.blastType});
  emit(state, {type: 'planted', count: state.markers.length});
  return true;
}
export function removeBlast(state, id = state.markers.at(-1)?.id) {
  if (!editable(state)) return false;
  const index = state.markers.findIndex(marker => marker.id === id);
  if (index < 0) return false;
  state.markers.splice(index, 1);
  emit(state, {type: 'removed', count: state.markers.length});
  return true;
}

function detach(state, piece, direct, point = piece.position) {
  if (piece.status !== 'stable') return;
  piece.status = 'falling';
  piece.delay = null;
  const s = piece.index;
  piece.velocity = vector(
    (sample(s, 1) - .5) * (direct ? 4 : 1.1) + (piece.position.x - point.x) * .4,
    direct ? .9 + sample(s, 2) * 1.8 : -.15,
    (sample(s, 3) - .5) * (direct ? 3 : 1.2),
  );
  piece.spin = vector((sample(s, 4) - .5) * 2.8, (sample(s, 5) - .5) * 1.8, (sample(s, 6) - .5) * 2.8);
  state.stats.fallen++;
  state.stats[direct ? 'direct' : 'chain']++;
}

export function detonateBlast(state) {
  if (!editable(state) || !state.markers.length) return false;
  state.phase = 'collapsing';
  state.attemptTime = state.accumulator = 0;
  state.bursts = state.markers.map(marker => ({point: {...marker.point}, radius: typeOf(marker.type).radius, age: 0}));
  for (const marker of state.markers) {
    for (const piece of state.pieces) {
      if (piece.status === 'stable' && distanceToPiece(marker.point, piece) <= typeOf(marker.type).radius) {
        detach(state, piece, true, marker.point);
      }
    }
  }
  state.markers = [];
  state.selectedId = state.selectedPoint = null;
  emit(state, {type: 'detonate', direct: state.stats.direct});
  return true;
}

function halfHeight(piece) {
  // The y row of an XYZ Euler rotation gives the exact rotated box's ground clearance.
  const {x, y, z} = piece.rotation;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  return (Math.abs(cx * sz + sx * cz * sy) * piece.size.x +
    Math.abs(cx * cz - sx * sz * sy) * piece.size.y + Math.abs(sx * cy) * piece.size.z) / 2;
}

function fixedStep(state) {
  state.elapsed += STEP;
  state.attemptTime += STEP;
  for (const burst of state.bursts) burst.age += STEP;
  state.bursts = state.bursts.filter(burst => burst.age < .8);
  for (const effect of state.effects) effect.age += STEP;
  state.effects = state.effects.filter(effect => effect.age < .65);
  const intact = new Set(state.pieces.filter(piece => piece.status === 'stable').map(piece => piece.id));
  let released = 0;
  for (const piece of state.pieces) {
    if (piece.status === 'stable' && !piece.anchor) {
      const supports = piece.supports.filter(id => intact.has(id)).length;
      if (supports < piece.required) {
        if (piece.delay === null) piece.delay = .14 + sample(piece.index, 7) * .12;
        piece.delay -= STEP;
        if (piece.delay <= 0) {detach(state, piece, false); released++;}
      }
    }
    if (piece.status !== 'falling') continue;
    piece.velocity.y -= 11 * STEP;
    for (const axis of ['x', 'y', 'z']) {
      piece.position[axis] += piece.velocity[axis] * STEP;
      piece.rotation[axis] += piece.spin[axis] * STEP;
    }
    const ground = .04 + sample(piece.index, 8) * .12 + halfHeight(piece);
    if (piece.position.y <= ground && piece.velocity.y < 0) {
      const speed = -piece.velocity.y;
      piece.position.y = ground;
      piece.velocity.y = speed * .23;
      piece.velocity.x *= .48;
      piece.velocity.z *= .48;
      for (const axis of ['x', 'y', 'z']) piece.spin[axis] *= .48;
      piece.bounces++;
      state.stats.bounces++;
      if (speed > 2 && state.effects.length < 48) {
        state.effects.push({point: {...piece.position, y: .1}, age: 0, seed: piece.index});
      }
      if (speed < .8 || piece.bounces >= 4) {
        piece.status = 'settled';
        piece.velocity = piece.spin = vector();
      }
    }
    piece.position.x = clamp(piece.position.x, -10, 10);
    piece.position.z = clamp(piece.position.z, -7, 7);
  }
  if (released) emit(state, {type: 'chain', count: released, total: state.stats.chain});
  const moving = state.pieces.some(piece => piece.status === 'falling' || piece.delay !== null);
  if ((!moving && state.attemptTime > 1) || state.attemptTime >= 12) {
    // A hard upper bound also handles a nearly flat fragment skittering forever.
    for (const piece of state.pieces) if (piece.status === 'falling') {
      piece.status = 'settled';
      piece.position.y = halfHeight(piece) + .08;
      piece.velocity = piece.spin = vector();
    }
    state.effects = [];
    state.bursts = [];
    const progress = getBlastProgress(state);
    state.phase = state.mode === 'practice' && progress.percent < 100 ? 'planning'
      : progress.percent >= (state.mode === 'practice' ? 100 : progress.target) ? 'won' : 'lost';
    emit(state, {type: state.phase === 'planning' ? 'settled' : 'complete', phase: state.phase, percent: progress.percent});
  }
}

export function stepBlast(state, dt) {
  if (state.paused || state.phase !== 'collapsing' || !Number.isFinite(dt) || dt <= 0) return false;
  state.accumulator += Math.min(dt, .25);
  while (state.accumulator >= STEP && state.phase === 'collapsing') {
    state.accumulator -= STEP;
    fixedStep(state);
  }
  if (state.phase !== 'collapsing') state.accumulator = 0;
  return true;
}
export function pauseBlast(state) {
  if (state.phase === 'won' || state.phase === 'lost' || state.paused) return false;
  state.paused = true;
  return true;
}
export function resumeBlast(state) {
  if (!state.paused) return false;
  state.paused = false;
  return true;
}
export function retryBlast(state) {
  return createBlastState({layout: state.layout, difficulty: state.difficulty, mode: state.mode});
}
export function nextBlast(state) {
  const index = BLAST_LAYOUTS.findIndex(layout => layout.id === state.layout);
  return createBlastState({layout: BLAST_LAYOUTS[(index + 1) % BLAST_LAYOUTS.length].id, difficulty: state.difficulty, mode: state.mode});
}
export function getBlastProgress(state) {
  const rule = RULES[state.difficulty];
  return {
    percent: Math.floor(state.stats.fallen / state.pieces.length * 100),
    target: state.mode === 'practice' ? 100 : rule.target,
    remaining: (state.mode === 'practice' ? 6 : rule.placements) - state.markers.length,
    total: state.pieces.length, fallen: state.stats.fallen, chain: state.stats.chain,
  };
}
export function drainBlastEvents(state) {
  return state.events.splice(0);
}
