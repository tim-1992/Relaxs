// Pure, local room mechanics. All clocks are advanced explicitly by stepDemo.
export const DEMO_ROOMS = [
  {id: 'living', name: '薄荷客厅', subtitle: '先敲茶几，看看摆件怎样一起落下。'},
  {id: 'study', name: '加班书房', subtitle: '书桌、书架和没看完的书，今天都可以放下。'},
  {id: 'studio', name: '周末游戏角', subtitle: '拆开游戏角，找一场更大的连锁。'},
];

export const DEMO_TOOLS = [
  {id: 'hammer', name: '小锤', hint: '精准敲击，适合木料和金属；按住蓄力。', cooldown: .28},
  {id: 'ball', name: '保龄球', hint: '重击附近物件，适合家具和软垫。', cooldown: .75},
  {id: 'wave', name: '冲击波', hint: '范围更广，擅长同时打碎玻璃摆件。', cooldown: 1.1},
];

const COLORS = {wood: 0xc69b73, pale: 0xe9d6b6, mint: 0x9dceba, peach: 0xe8aaa0,
  blue: 0x93b9d2, gold: 0xe6c56e, dark: 0x49566c, white: 0xf2eadb};
const DURABILITY = {sofa: 130, table: 100, cabinet: 135, shelf: 95, chair: 65,
  screen: 50, vase: 24, bottle: 18, book: 18, cushion: 22, lamp: 60, picture: 26, speaker: 65};
const DIFFICULTIES = {easy: {hp: .75, cooldown: .8}, standard: {hp: 1, cooldown: 1},
  hard: {hp: 1.45, cooldown: 1.2}};
const IMPACTS = {
  hammer: {damage: 50, radius: 0, material: {wood: 1.15, glass: 1.5, fabric: .45, metal: 1.15}},
  ball: {damage: 72, radius: 1.25, material: {wood: 1.1, glass: 1.35, fabric: 1.1, metal: .55}},
  wave: {damage: 36, radius: 2.5, material: {wood: .8, glass: 1.7, fabric: .55, metal: .4}},
};
const TICK = 1 / 120, FRAGMENT_LIMIT = 180, EVENT_LIMIT = 128;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const xyz = ([x, y, z]) => ({x, y, z});

function furnish(room, durability) {
  const objects = [];
  const add = (key, label, kind, material, position, size, color, support = null) => {
    const id = `${room}-${key}`, maxHp = Math.ceil(DURABILITY[kind] * durability);
    objects.push({id, label, kind, material, color, position: xyz(position), size: xyz(size),
      hp: maxHp, maxHp, supportId: support ? `${room}-${support}` : null, destroyed: false});
    return key;
  };
  const bookStack = (key, label, x, bottom, z, count, support) => {
    for (let i = 0; i < count; i++) {
      const next = `${key}-${i + 1}`;
      add(next, `${label} ${i + 1}`, 'book', 'wood', [x, bottom + .05 + i * .1, z],
        [.44, .1, .32], [COLORS.mint, COLORS.peach, COLORS.gold, COLORS.blue][i % 4], support);
      support = next;
    }
  };
  const shelfBooks = (key, x, z, support) => {
    for (let row = 0; row < 2; row++) for (let i = 0; i < 3; i++) {
      add(`${key}-${row}-${i}`, `${row ? '上层' : '下层'}书本 ${i + 1}`, 'book', 'wood',
        [x + (i - 1) * .28, .71 + row * .83, z], [.18, .38, .3],
        [COLORS.peach, COLORS.blue, COLORS.gold][i], support);
    }
  };
  const vase = (key, x, bottom, z, support, color = COLORS.white) =>
    add(key, '陶瓷花瓶', 'vase', 'glass', [x, bottom + .24, z], [.28, .48, .28], color, support);
  const bottle = (key, x, bottom, z, support) =>
    add(key, '玻璃饮料瓶', 'bottle', 'glass', [x, bottom + .19, z], [.18, .38, .18], COLORS.blue, support);
  const cushion = (key, x, z, support, color = COLORS.peach) => {
    const seat = objects.find(object => object.id === `${room}-${support}`);
    // Match demolition-scene's seat meshes, not the full backrest height.
    // Its cushion sphere is .88 high, so its lower extent is .44 of size.y.
    const surface = seat.position.y + seat.size.y * (seat.kind === 'sofa' ? .105 : .04);
    return add(key, '柔软抱枕', 'cushion', 'fabric', [x, surface + .26 * .44, z],
      [.5, .26, .48], color, support);
  };

  if (room === 'living') {
    add('sofa', '薄荷长沙发', 'sofa', 'fabric', [-2.35, .5, .55], [2.3, 1, 1.1], COLORS.mint);
    add('table', '木质茶几', 'table', 'wood', [.15, .375, .8], [2.2, .75, 1.15], COLORS.wood);
    add('cabinet', '电视矮柜', 'cabinet', 'wood', [.6, .4, -2.25], [2.4, .8, .65], COLORS.pale);
    add('shelf', '靠墙书架', 'shelf', 'wood', [3.05, 1.2, -1.8], [1.15, 2.4, .7], COLORS.wood);
    add('chair', '阅读单椅', 'chair', 'wood', [2.7, .5, 1.15], [.9, 1, .95], COLORS.pale);
    add('lamp', '暖光落地灯', 'lamp', 'metal', [-3.45, .8, -1.1], [.45, 1.6, .45], COLORS.gold);
    add('picture', '日落挂画', 'picture', 'wood', [-1.3, 2, -2.91], [1.25, .85, .12], COLORS.peach);
    add('small-picture', '周末小画', 'picture', 'wood', [.5, 2.25, -2.91], [.7, .55, .12], COLORS.blue);
    add('screen', '客厅电视', 'screen', 'glass', [.6, 1.32, -2.25], [1.65, 1, .16], COLORS.dark, 'cabinet');
    for (const side of [-1, 1]) add(`speaker-${side}`, '电视音箱', 'speaker', 'metal',
      [.6 + side, 1.1, -2.25], [.3, .6, .3], COLORS.dark, 'cabinet');
    for (let i = 0; i < 3; i++) cushion(`cushion-${i}`, -3.05 + i * .68, .55, 'sofa');
    cushion('chair-cushion', 2.7, 1.15, 'chair', COLORS.mint);
    vase('table-vase', -.58, .75, .48, 'table');
    vase('table-small-vase', -.6, .75, 1.1, 'table', COLORS.peach);
    bottle('table-bottle-1', .03, .75, .48, 'table');
    bottle('table-bottle-2', .27, .75, .48, 'table');
    bookStack('magazine', '休息日杂志', .7, .75, .94, 3, 'table');
    shelfBooks('shelf-book', 3.05, -1.8, 'shelf');
    vase('shelf-vase-1', 2.76, 2.4, -1.8, 'shelf');
    vase('shelf-vase-2', 3.3, 2.4, -1.8, 'shelf', COLORS.mint);
  } else if (room === 'study') {
    add('desk', '加班大书桌', 'table', 'wood', [.05, .4, -.2], [2.75, .8, 1.25], COLORS.wood);
    add('chair', '办公椅', 'chair', 'metal', [.1, .5, 1.4], [.9, 1, .9], COLORS.dark);
    add('shelf', '满满的书架', 'shelf', 'wood', [-2.45, 1.2, -2.25], [1.4, 2.4, .75], COLORS.pale);
    add('cabinet', '文件柜', 'cabinet', 'wood', [2.85, .75, -1.8], [1.2, 1.5, .75], COLORS.mint);
    add('side-table', '窗边小桌', 'table', 'wood', [-2.65, .4, 1.2], [1.1, .8, .9], COLORS.pale);
    add('lamp', '书房落地灯', 'lamp', 'metal', [3.4, .8, .9], [.45, 1.6, .45], COLORS.gold);
    add('picture', '待办清单挂画', 'picture', 'wood', [.2, 2.2, -2.91], [1.4, .9, .12], COLORS.blue);
    add('screen', '工作显示器', 'screen', 'glass', [.1, 1.25, -.55], [1.25, .85, .16], COLORS.dark, 'desk');
    add('desk-lamp', '桌面台灯', 'lamp', 'metal', [-.96, 1.13, -.42], [.35, .66, .35], COLORS.gold, 'desk');
    for (const side of [-1, 1]) add(`speaker-${side}`, '桌面小音箱', 'speaker', 'metal',
      [side * .7, .99, -.46], [.25, .38, .25], COLORS.dark, 'desk');
    bookStack('draft', '项目笔记', .85, .8, .15, 4, 'desk');
    bottle('desk-bottle-1', -.75, .8, .12, 'desk');
    bottle('desk-bottle-2', -.44, .8, .12, 'desk');
    vase('desk-vase', -.07, .8, .15, 'desk', COLORS.mint);
    shelfBooks('shelf-book', -2.45, -2.25, 'shelf');
    vase('shelf-vase-1', -2.85, 2.4, -2.25, 'shelf');
    vase('shelf-vase-2', -2.1, 2.4, -2.25, 'shelf', COLORS.peach);
    bookStack('files', '归档文件', 2.65, 1.5, -1.8, 3, 'cabinet');
    vase('cabinet-vase', 3.16, 1.5, -1.8, 'cabinet');
    bookStack('weekend', '还没翻开的书', -2.82, .8, 1.3, 2, 'side-table');
    bottle('side-bottle', -2.36, .8, 1.06, 'side-table');
    cushion('chair-cushion', .1, 1.4, 'chair', COLORS.mint);
  } else {
    add('sofa', '游戏双人沙发', 'sofa', 'fabric', [-1.5, .5, 1.5], [2.25, 1, 1.15], COLORS.peach);
    add('table', '游戏小方桌', 'table', 'wood', [.1, .3, -.05], [1.65, .6, 1.1], COLORS.pale);
    add('cabinet', '主机电视柜', 'cabinet', 'wood', [1.15, .35, -2.25], [2.5, .7, .75], COLORS.blue);
    add('shelf', '收藏书架', 'shelf', 'wood', [-3, 1.2, -1.8], [1.15, 2.4, .7], COLORS.wood);
    add('chair', '玩家单椅', 'chair', 'metal', [2.8, .5, .9], [.95, 1, .95], COLORS.dark);
    add('side-cabinet', '游戏收藏柜', 'cabinet', 'wood', [3.15, .65, -1.7], [1, 1.3, .8], COLORS.mint);
    add('lamp', '角落氛围灯', 'lamp', 'metal', [-3.4, .8, 1.1], [.4, 1.6, .4], COLORS.gold);
    add('picture', '像素风挂画', 'picture', 'wood', [-1.25, 2.15, -2.91], [1.05, .9, .12], COLORS.gold);
    add('screen', '游戏大屏', 'screen', 'glass', [1.15, 1.28, -2.25], [1.75, 1.12, .16], COLORS.dark, 'cabinet');
    for (const side of [-1, 1]) add(`speaker-${side}`, '游戏音箱', 'speaker', 'metal',
      [1.15 + side * 1.03, 1.03, -2.25], [.3, .66, .3], COLORS.dark, 'cabinet');
    for (let i = 0; i < 3; i++) cushion(`cushion-${i}`, -2.15 + i * .63, 1.5, 'sofa',
      [COLORS.mint, COLORS.blue, COLORS.gold][i]);
    cushion('chair-cushion', 2.8, .9, 'chair', COLORS.peach);
    bookStack('game-guide', '游戏攻略本', -.4, .6, .12, 4, 'table');
    for (let i = 0; i < 3; i++) bottle(`table-bottle-${i}`, -.4 + i * .32, .6, -.35, 'table');
    vase('table-vase', .57, .6, .12, 'table', COLORS.mint);
    shelfBooks('collection', -3, -1.8, 'shelf');
    vase('shelf-vase-1', -3.28, 2.4, -1.8, 'shelf', COLORS.peach);
    vase('shelf-vase-2', -2.76, 2.4, -1.8, 'shelf', COLORS.blue);
    bookStack('spare-guide', '收藏画册', 3.15, 1.3, -1.7, 3, 'side-cabinet');
  }
  return objects;
}

export function createDemoState({room = 'living', difficulty = 'standard'} = {}) {
  if (!DEMO_ROOMS.some(item => item.id === room)) room = 'living';
  if (!Object.hasOwn(DIFFICULTIES, difficulty)) difficulty = 'standard';
  return {room, difficulty, phase: 'playing', tool: 'hammer',
    objects: furnish(room, DIFFICULTIES[difficulty].hp), fragments: [], elapsed: 0, cooldown: 0,
    stats: {hits: 0, destroyed: 0, bestChain: 0, score: 0}, completed: false,
    _sim: {accumulator: 0, seed: 0x5eeda11, fragmentId: 0, bodies: {}, events: []}};
}

export function getDemoGoals(state) {
  const destroyed = state.objects.filter(object => object.destroyed).length;
  const fragile = state.objects.filter(object => object.material === 'glass');
  const all = destroyed === state.objects.length;
  return [
    {id: 'room', label: '拆掉四分之三的物件', current: destroyed, target: Math.ceil(state.objects.length * .75)},
    {id: 'fragile', label: '打碎易碎摆件', current: fragile.filter(object => object.destroyed).length,
      target: Math.ceil(fragile.length * .7)},
    {id: 'chain', label: '一次连锁拆下 4 件，或清空房间', current: all ? Math.max(4, state.stats.bestChain) : state.stats.bestChain,
      target: 4},
  ].map(goal => ({...goal, done: goal.current >= goal.target}));
}

function emit(state, event) {
  const events = state._sim.events;
  events.push(event);
  if (events.length > EVENT_LIMIT) events.splice(0, events.length - EVENT_LIMIT);
}

function random(state) {
  state._sim.seed = (Math.imul(state._sim.seed, 1664525) + 1013904223) >>> 0;
  return state._sim.seed / 4294967296;
}

function scatter(state, object, origin, power) {
  const count = ['sofa', 'table', 'cabinet', 'shelf'].includes(object.kind) ? 14
    : object.kind === 'book' ? 4 : 8;
  for (let i = 0; i < count; i++) {
    const size = {
      x: clamp(object.size.x * (.17 + random(state) * .12), .07, .38),
      y: clamp(object.size.y * (.15 + random(state) * .1), .05, .28),
      z: clamp(object.size.z * (.17 + random(state) * .12), .07, .32),
    };
    const position = {
      x: clamp(object.position.x + (random(state) - .5) * object.size.x * .7, -4 + size.x / 2, 4 - size.x / 2),
      y: Math.max(size.y / 2, object.position.y + (random(state) - .5) * object.size.y * .7),
      z: clamp(object.position.z + (random(state) - .5) * object.size.z * .7, -3 + size.z / 2, 3 - size.z / 2),
    };
    const angle = Math.atan2(position.z - origin.z, position.x - origin.x) + (random(state) - .5);
    const speed = (1 + random(state) * 2.2) * (.6 + power * .6);
    const fragment = {id: `debris-${++state._sim.fragmentId}`, position,
      rotation: {x: random(state) * Math.PI, y: random(state) * Math.PI, z: random(state) * Math.PI},
      size, color: object.color, material: object.material, life: 2.8 + random(state) * 1.4};
    state._sim.bodies[fragment.id] = {
      velocity: {x: Math.cos(angle) * speed, y: 1.5 + random(state) * 3.2 + power * .8,
        z: Math.sin(angle) * speed},
      spin: {x: (random(state) - .5) * 7, y: (random(state) - .5) * 7, z: (random(state) - .5) * 7},
      grounded: false,
    };
    state.fragments.push(fragment);
    if (state.fragments.length > FRAGMENT_LIMIT) {
      delete state._sim.bodies[state.fragments.shift().id];
    }
  }
}

function breakObject(state, object, origin, power, broken) {
  if (object.destroyed) return;
  object.hp = 0;
  object.destroyed = true;
  broken.push(object.id);
  state.stats.destroyed++;
  emit(state, {type: 'break', id: object.id, position: {...object.position}, material: object.material});
  scatter(state, object, origin, power);
  // Support is a dependency: removing a shelf also removes everything resting
  // on it, including stacked children. Marking first prevents duplicate breaks.
  for (const child of state.objects) if (!child.destroyed && child.supportId === object.id) {
    emit(state, {type: 'damage', id: child.id});
    breakObject(state, child, origin, power, broken);
  }
}

function surfaceDistance(position, object) {
  return Math.hypot(...['x', 'y', 'z'].map(axis =>
    Math.max(0, Math.abs(position[axis] - object.position[axis]) - object.size[axis] / 2)));
}

export function hitDemo(state, id, {charge = 1} = {}) {
  if (state.phase !== 'playing' || state.cooldown > 1e-9) return false;
  const target = state.objects.find(object => object.id === id && !object.destroyed);
  if (!target) return false;
  const amount = Number.isFinite(charge) ? clamp(charge, 0, 1) : 1;
  const power = .35 + amount * .65, config = IMPACTS[state.tool];
  const origin = {...target.position}, reach = config.radius * (.65 + amount * .35);
  const tool = DEMO_TOOLS.find(item => item.id === state.tool);
  state.cooldown = tool.cooldown * DIFFICULTIES[state.difficulty].cooldown;
  state.stats.hits++;
  emit(state, {type: 'strike', position: origin, tool: state.tool, power});
  const broken = [];
  const targets = state.objects.filter(object => !object.destroyed &&
    (object === target || reach > 0 && surfaceDistance(origin, object) < reach));
  // Resolve the selected prop first so a hammer reliably targets a support.
  targets.sort((a, b) => Number(b === target) - Number(a === target));
  for (const object of targets) {
    if (object.destroyed) continue;
    const falloff = object === target ? 1 : .25 + .75 * (1 - surfaceDistance(origin, object) / reach);
    const damage = config.damage * config.material[object.material] * power * falloff;
    object.hp = Math.max(0, object.hp - damage);
    emit(state, {type: 'damage', id: object.id});
    if (object.hp <= 1e-9) breakObject(state, object, origin, power, broken);
  }
  state.stats.bestChain = Math.max(state.stats.bestChain, broken.length);
  state.stats.score += broken.length * 10 + Math.max(0, broken.length - 1) * 5;
  if (broken.length >= 2) emit(state, {type: 'chain', count: broken.length});
  if (!state.completed && getDemoGoals(state).every(goal => goal.done)) {
    state.completed = true;
    emit(state, {type: 'complete'});
  }
  return true;
}

function moveFragment(fragment, body) {
  const p = fragment.position, v = body.velocity, floor = fragment.size.y / 2;
  p.x += v.x * TICK;
  p.z += v.z * TICK;
  if (!body.grounded) {
    p.y += v.y * TICK - 9.8 * TICK * TICK / 2;
    v.y -= 9.8 * TICK;
    if (p.y < floor) {
      p.y = floor;
      const bounce = fragment.material === 'fabric' ? .2 : fragment.material === 'metal' ? .45 : .35;
      v.y = Math.abs(v.y) * bounce;
      v.x *= .68; v.z *= .68;
      if (v.y < .45) { v.y = 0; body.grounded = true; }
    }
  } else {
    v.x *= .94; v.z *= .94;
    if (Math.hypot(v.x, v.z) < .02) { v.x = 0; v.z = 0; }
  }
  for (const [axis, halfRoom] of [['x', 4], ['z', 3]]) {
    const edge = halfRoom - fragment.size[axis] / 2;
    if (Math.abs(p[axis]) > edge) {
      p[axis] = clamp(p[axis], -edge, edge);
      v[axis] *= -.45;
    }
  }
  for (const axis of ['x', 'y', 'z']) {
    fragment.rotation[axis] += body.spin[axis] * TICK;
    if (body.grounded) body.spin[axis] *= .94;
  }
}

export function stepDemo(state, dt) {
  if (state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  // A fixed physics clock gives the same debris at 30, 60 or 144 Hz. Bound
  // exceptional catch-up work; normal frame deltas are fully consumed.
  state._sim.accumulator += Math.min(dt, 60);
  while (state._sim.accumulator + 1e-12 >= TICK) {
    state._sim.accumulator = Math.max(0, state._sim.accumulator - TICK);
    state.elapsed += TICK;
    state.cooldown = Math.max(0, state.cooldown - TICK);
    const alive = [];
    for (const fragment of state.fragments) {
      fragment.life -= TICK;
      if (fragment.life <= 1e-9) {
        delete state._sim.bodies[fragment.id];
      } else {
        moveFragment(fragment, state._sim.bodies[fragment.id]);
        alive.push(fragment);
      }
    }
    state.fragments = alive;
  }
}
export function setDemoTool(state, id) {
  if (state.phase !== 'playing' || !DEMO_TOOLS.some(tool => tool.id === id)) return false;
  state.tool = id;
  return true;
}
export function pauseDemo(state) {
  const changed = state.phase === 'playing';
  state.phase = 'paused';
  return changed;
}
export function resumeDemo(state) {
  const changed = state.phase === 'paused';
  state.phase = 'playing';
  return changed;
}
export function drainDemoEvents(state) { return state._sim.events.splice(0); }
