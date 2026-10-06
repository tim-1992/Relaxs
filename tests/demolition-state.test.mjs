import test from 'node:test';
import assert from 'node:assert/strict';

let demo;
try { demo = await import('../src/demolition-state.js'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const api = () => { assert.ok(demo, 'the shared demolition module must be importable'); return demo; };

test('three furnished rooms have independent, valid props and resolvable support trees', () => {
  const {DEMO_ROOMS, DEMO_TOOLS, createDemoState} = api();
  assert.deepEqual(DEMO_ROOMS.map(room => room.id), ['living', 'study', 'studio']);
  assert.deepEqual(DEMO_TOOLS.map(tool => tool.id), ['hammer', 'ball', 'wave']);
  const kinds = new Set(['sofa', 'table', 'cabinet', 'shelf', 'chair', 'screen', 'vase',
    'bottle', 'book', 'cushion', 'lamp', 'picture', 'speaker']);
  const materials = new Set(['wood', 'glass', 'fabric', 'metal']);
  for (const room of DEMO_ROOMS) {
    const state = createDemoState({room: room.id});
    assert.equal(state.room, room.id);
    assert.ok(state.objects.length >= 24);
    assert.ok(new Set(state.objects.map(object => object.kind)).size >= 9, 'furnished rooms need recognizable variety');
    const ids = new Set(state.objects.map(object => object.id));
    assert.equal(ids.size, state.objects.length);
    assert.ok(state.objects.some(object => object.supportId));
    for (const object of state.objects) {
      assert.ok(kinds.has(object.kind));
      assert.ok(materials.has(object.material));
      assert.ok(Number.isInteger(object.color) && object.color >= 0 && object.color <= 0xffffff);
      assert.ok(object.hp > 0 && object.hp === object.maxHp && !object.destroyed);
      assert.ok(object.position.x - object.size.x / 2 >= -4);
      assert.ok(object.position.x + object.size.x / 2 <= 4);
      assert.ok(object.position.z - object.size.z / 2 >= -3);
      assert.ok(object.position.z + object.size.z / 2 <= 3);
      assert.ok(object.position.y - object.size.y / 2 >= -1e-8);
      const ancestors = new Set([object.id]);
      let parent = object.supportId;
      while (parent) {
        assert.ok(ids.has(parent), `${object.id} has a missing support`);
        assert.ok(!ancestors.has(parent), `${object.id} has a support cycle`);
        ancestors.add(parent);
        parent = state.objects.find(item => item.id === parent).supportId;
      }
    }
    state.objects[0].hp = 0;
    state.objects[0].position.x = 500;
    const reset = createDemoState({room: room.id});
    assert.ok(reset.objects[0].hp > 0 && reset.objects[0].position.x < 4);
  }
});

test('initial state normalizes selections and has the complete shared API', () => {
  const engine = api();
  for (const name of ['createDemoState', 'hitDemo', 'stepDemo', 'setDemoTool', 'pauseDemo',
    'resumeDemo', 'drainDemoEvents', 'getDemoGoals']) assert.equal(typeof engine[name], 'function');
  const state = engine.createDemoState({room: 'missing', difficulty: 'missing'});
  assert.equal(state.room, 'living');
  assert.equal(state.difficulty, 'standard');
  assert.equal(state.phase, 'playing');
  assert.equal(state.tool, 'hammer');
  assert.deepEqual(state.stats, {hits: 0, destroyed: 0, bestChain: 0, score: 0});
  assert.deepEqual(state.fragments, []);
  assert.equal(state.elapsed, 0);
  assert.equal(state.cooldown, 0);
  assert.equal(state.completed, false);
  const goals = engine.getDemoGoals(state);
  assert.equal(goals.length, 3);
  assert.ok(goals.every(goal => goal.target > 0 && goal.current === 0 && goal.done === false));
});

test('cushions rest on the actual rendered sofa and chair seat surfaces', async () => {
  const THREE = await import('three');
  const {createDemoWorld} = await import('../src/demolition-scene.js');
  const world = createDemoWorld();
  try {
    for (const room of api().DEMO_ROOMS) {
      const state = api().createDemoState({room: room.id});
      world.render(state);
      const furniture = world.scene.getObjectByName('demo-furniture');
      for (const cushion of state.objects.filter(object => object.kind === 'cushion')) {
        const support = state.objects.find(object => object.id === cushion.supportId);
        const supportModel = furniture.children.find(model => model.userData.demoId === support.id);
        const model = furniture.children.find(model => model.userData.demoId === cushion.id);
        const seat = supportModel.getObjectByName(`${support.kind}-seat`);
        const seatTop = new THREE.Box3().setFromObject(seat).max.y;
        const cushionBottom = new THREE.Box3().setFromObject(model.getObjectByName('cushion-body')).min.y;
        assert.ok(Math.abs(cushionBottom - seatTop) < 1e-7,
          `${cushion.id}: bottom ${cushionBottom} must touch the seat at ${seatTop}`);
      }
    }
  } finally { world.dispose(); }
});

function prop(id, material = 'wood', x = 0, supportId = null, hp = 1000) {
  return {id, label: id, kind: material === 'glass' ? 'vase' : 'book', material, color: 0x99bbcc,
    position: {x, y: .6, z: 0}, size: {x: .2, y: .2, z: .2},
    hp, maxHp: hp, supportId, destroyed: false};
}
function isolated(objects, tool = 'hammer', difficulty = 'standard') {
  const state = api().createDemoState({difficulty});
  state.objects = objects;
  api().setDemoTool(state, tool);
  return state;
}
function ready(state) { api().stepDemo(state, state.cooldown + .02); }

test('only playable hits spend cooldown, repeated clicks and tool changes cannot bypass it', () => {
  const {hitDemo, setDemoTool, drainDemoEvents} = api();
  const state = isolated([prop('target')]);
  const initial = structuredClone(state);
  assert.equal(hitDemo(state, 'missing'), false);
  assert.deepEqual(state, initial);
  assert.equal(hitDemo(state, 'target'), true);
  assert.ok(state.objects[0].hp < 1000 && state.objects[0].hp > 0);
  assert.equal(state.stats.hits, 1);
  assert.ok(state.cooldown > 0);
  assert.deepEqual(drainDemoEvents(state).map(event => event.type), ['strike', 'damage']);
  const hp = state.objects[0].hp;
  assert.equal(hitDemo(state, 'target'), false);
  assert.equal(setDemoTool(state, 'wave'), true);
  assert.equal(hitDemo(state, 'target'), false);
  assert.equal(state.objects[0].hp, hp);
  ready(state);
  assert.equal(hitDemo(state, 'target'), true);
  assert.equal(state.stats.hits, 2);
  assert.equal(setDemoTool(state, 'missing'), false);
});

test('charge strengthens real damage and invalid charge cannot poison durability', () => {
  const {hitDemo} = api();
  const weak = isolated([prop('target')]), strong = isolated([prop('target')]);
  hitDemo(weak, 'target', {charge: 0});
  hitDemo(strong, 'target', {charge: 1});
  assert.ok(strong.objects[0].hp < weak.objects[0].hp && weak.objects[0].hp < 1000);
  for (const charge of [-10, 10, NaN, Infinity]) {
    const state = isolated([prop('target')]);
    assert.equal(hitDemo(state, 'target', {charge}), true);
    assert.ok(Number.isFinite(state.objects[0].hp) && state.objects[0].hp >= strong.objects[0].hp);
  }
});

test('tool and material choices alter damage; reach distinguishes precise, medium and wide hits', () => {
  const {hitDemo} = api();
  const damage = (tool, material) => {
    const state = isolated([prop('target', material)], tool);
    hitDemo(state, 'target');
    return 1000 - state.objects[0].hp;
  };
  assert.ok(damage('ball', 'fabric') > damage('hammer', 'fabric'));
  assert.ok(damage('hammer', 'metal') > damage('wave', 'metal'));
  assert.ok(damage('wave', 'glass') > damage('wave', 'wood'));
  const hitCounts = [];
  for (const tool of ['hammer', 'ball', 'wave']) {
    const state = isolated([prop('target'), prop('near', 'wood', .85), prop('far', 'wood', 2)], tool);
    hitDemo(state, 'target');
    hitCounts.push(state.objects.filter(object => object.hp < object.maxHp).length);
  }
  assert.deepEqual(hitCounts, [1, 2, 3]);
});

test('difficulty increases real durability and cooldown while even wave damage can break hard metal', () => {
  const {createDemoState, hitDemo, setDemoTool} = api();
  const durability = [], cooldowns = [], strikes = [];
  for (const difficulty of ['easy', 'standard', 'hard']) {
    const state = createDemoState({difficulty});
    const table = state.objects.find(object => object.kind === 'table');
    durability.push(table.hp);
    let count = 0;
    while (!table.destroyed) {
      ready(state);
      assert.equal(hitDemo(state, table.id), true);
      if (!count) cooldowns.push(state.cooldown);
      assert.ok(++count < 10);
    }
    strikes.push(count);
  }
  assert.ok(durability[0] < durability[1] && durability[1] < durability[2]);
  assert.ok(cooldowns[0] < cooldowns[1] && cooldowns[1] < cooldowns[2]);
  assert.ok(strikes[2] > strikes[0]);
  const hard = createDemoState({difficulty: 'hard'});
  const metal = hard.objects.find(object => object.material === 'metal' && !object.supportId);
  setDemoTool(hard, 'wave');
  for (let i = 0; i < 20 && !metal.destroyed; i++) {
    ready(hard);
    assert.equal(hitDemo(hard, metal.id), true);
  }
  assert.equal(metal.destroyed, true);
});

test('breaking a support recursively breaks its stack exactly once in one impact chain', () => {
  const {hitDemo, drainDemoEvents} = api();
  const objects = [prop('table', 'wood', 0, null, 1), prop('book-1', 'wood', 0, 'table'),
    prop('book-2', 'wood', 0, 'book-1'), prop('vase', 'glass', .3, 'table'),
    prop('unrelated', 'wood', 3)];
  const state = isolated(objects);
  assert.equal(hitDemo(state, 'table'), true);
  assert.equal(state.stats.hits, 1);
  assert.equal(state.stats.destroyed, 4);
  assert.equal(state.stats.bestChain, 4);
  assert.ok(objects.slice(0, 4).every(object => object.destroyed && object.hp === 0));
  assert.equal(objects[4].hp, objects[4].maxHp);
  const events = drainDemoEvents(state);
  assert.equal(events.filter(event => event.type === 'break').length, 4);
  assert.equal(new Set(events.filter(event => event.type === 'break').map(event => event.id)).size, 4);
  assert.deepEqual(events.find(event => event.type === 'chain'), {type: 'chain', count: 4});
  ready(state);
  const after = structuredClone(state);
  assert.equal(hitDemo(state, 'table'), false);
  assert.deepEqual(state, after);
  assert.deepEqual(drainDemoEvents(state), []);
});

test('a wide impact cannot double-count children it both hits and removes through a support', () => {
  const state = isolated([prop('parent', 'wood', 0, null, 1), prop('child', 'glass', .3, 'parent', 1)], 'wave');
  api().hitDemo(state, 'parent');
  assert.equal(state.stats.destroyed, 2);
  assert.equal(state.stats.bestChain, 2);
  assert.equal(api().drainDemoEvents(state).filter(event => event.type === 'break').length, 2);
});

test('break fragments have the exact public shape, deterministic launch and real gravity/bounce', () => {
  const {hitDemo, stepDemo} = api();
  const a = isolated([prop('target', 'glass', 0, null, 1)]);
  const b = isolated([prop('target', 'glass', 0, null, 1)]);
  hitDemo(a, 'target'); hitDemo(b, 'target');
  assert.ok(a.fragments.length >= 4);
  assert.deepEqual(a.fragments, b.fragments);
  const fragment = a.fragments[0], start = structuredClone(fragment);
  assert.deepEqual(Object.keys(fragment).sort(),
    ['id', 'position', 'rotation', 'size', 'color', 'material', 'life'].sort());
  stepDemo(a, .1);
  const firstRise = fragment.position.y - start.position.y;
  const middle = fragment.position.y;
  stepDemo(a, .1);
  assert.ok(firstRise > 0);
  assert.ok(fragment.position.y - middle < firstRise, 'gravity reduces the rising velocity');
  assert.ok(fragment.life < start.life);
  assert.notDeepEqual(fragment.rotation, start.rotation);
  let fell = false, bounced = false, previousY = fragment.position.y;
  for (let i = 0; i < 360 && a.fragments.includes(fragment); i++) {
    stepDemo(a, 1 / 120);
    const y = fragment.position.y;
    assert.ok(y >= fragment.size.y / 2 - 1e-9, 'debris cannot fall through the room floor');
    if (y < previousY - .0001) fell = true;
    if (fell && y > previousY + .0001) bounced = true;
    previousY = y;
  }
  assert.ok(bounced, 'fragments must physically rebound after falling');
  stepDemo(a, 8);
  assert.equal(a.fragments.length, 0);
  assert.equal(Object.keys(a._sim.bodies).length, 0);
});

test('fixed fragment integration is independent of render frequency', () => {
  const {hitDemo, stepDemo} = api();
  const a = isolated([prop('target', 'glass', 0, null, 1)]);
  const b = isolated([prop('target', 'glass', 0, null, 1)]);
  hitDemo(a, 'target'); hitDemo(b, 'target');
  for (let i = 0; i < 30; i++) stepDemo(a, 1 / 30);
  for (let i = 0; i < 144; i++) stepDemo(b, 1 / 144);
  assert.deepEqual(a.fragments, b.fragments);
  assert.equal(a.elapsed, b.elapsed);
});

test('pause freezes input, cooldown and debris; resume and reset preserve ownership', () => {
  const {hitDemo, stepDemo, setDemoTool, pauseDemo, resumeDemo, createDemoState} = api();
  const state = createDemoState();
  const vase = state.objects.find(object => object.kind === 'vase');
  hitDemo(state, vase.id);
  assert.ok(state.fragments.length > 0);
  pauseDemo(state);
  const snapshot = structuredClone(state);
  stepDemo(state, 10);
  assert.equal(hitDemo(state, state.objects[0].id), false);
  assert.equal(setDemoTool(state, 'wave'), false);
  assert.deepEqual(state, snapshot);
  resumeDemo(state);
  ready(state);
  assert.equal(hitDemo(state, state.objects[0].id), true);
  const reset = createDemoState();
  assert.deepEqual(reset, createDemoState());
  assert.equal(reset.stats.hits, 0);
  assert.equal(reset.fragments.length, 0);
  assert.ok(reset.objects.every(object => !object.destroyed && object.hp === object.maxHp));
});

test('zero and invalid time cannot advance timers or effects', () => {
  const {createDemoState, stepDemo} = api();
  const state = createDemoState(), snapshot = structuredClone(state);
  for (const dt of [0, -1, NaN, Infinity]) stepDemo(state, dt);
  assert.deepEqual(state, snapshot);
});

for (const room of ['living', 'study', 'studio']) for (const difficulty of ['easy', 'standard', 'hard']) {
  test(`${room}/${difficulty}: every goal is reachable through actual hits and completion keeps play open`, () => {
    const {createDemoState, hitDemo, drainDemoEvents, getDemoGoals} = api();
    const state = createDemoState({room, difficulty});
    let completedAt, completeEvents = 0, hits = 0;
    for (const object of state.objects) {
      while (!object.destroyed) {
        ready(state);
        assert.equal(hitDemo(state, object.id, {charge: 1}), true);
        assert.ok(++hits < 400, 'every material must remain practically breakable');
        completeEvents += drainDemoEvents(state).filter(event => event.type === 'complete').length;
        if (state.completed && completedAt === undefined) completedAt = state.stats.destroyed;
      }
    }
    assert.equal(state.stats.destroyed, state.objects.length);
    assert.ok(getDemoGoals(state).every(goal => goal.done));
    assert.equal(state.completed, true);
    assert.equal(state.phase, 'playing');
    assert.equal(completeEvents, 1);
    assert.ok(completedAt < state.objects.length, 'optional goals unlock before the whole room is empty');
    assert.equal(state.stats.hits, hits);
    assert.ok(state.stats.bestChain >= 4);
  });
}

test('clearing fragile objects and stacks individually still completes the alternative clear-room goal', () => {
  const {createDemoState, hitDemo, getDemoGoals, drainDemoEvents} = api();
  const state = createDemoState();
  let completeEvents = 0;
  while (state.objects.some(object => !object.destroyed)) {
    const leaf = state.objects.find(object => !object.destroyed &&
      !state.objects.some(child => !child.destroyed && child.supportId === object.id));
    assert.ok(leaf);
    while (!leaf.destroyed) {
      ready(state);
      assert.equal(hitDemo(state, leaf.id), true);
      completeEvents += drainDemoEvents(state).filter(event => event.type === 'complete').length;
    }
  }
  assert.equal(state.stats.bestChain, 1, 'completion must not invent a historical chain');
  assert.ok(getDemoGoals(state).every(goal => goal.done));
  assert.equal(completeEvents, 1);
});

test('fragment bodies and undrained event history stay bounded under repeated impacts', () => {
  const {hitDemo, stepDemo, drainDemoEvents} = api();
  const objects = Array.from({length: 90}, (_, i) => prop(`item-${i}`, 'glass', 0, null, 1));
  objects.push(prop('durable', 'metal', 3, null, 1e7));
  const state = isolated(objects, 'wave');
  hitDemo(state, 'item-0');
  assert.equal(state.stats.destroyed, 90);
  assert.ok(state.fragments.length > 0 && state.fragments.length <= 180);
  assert.equal(new Set(state.fragments.map(fragment => fragment.id)).size, state.fragments.length);
  assert.equal(Object.keys(state._sim.bodies).length, state.fragments.length);
  for (let i = 0; i < 200; i++) { ready(state); hitDemo(state, 'durable'); }
  const events = drainDemoEvents(state);
  assert.ok(events.length > 0 && events.length <= 128);
  assert.deepEqual(drainDemoEvents(state), []);
  stepDemo(state, 10);
  assert.equal(state.fragments.length, 0);
  assert.equal(Object.keys(state._sim.bodies).length, 0);
});
