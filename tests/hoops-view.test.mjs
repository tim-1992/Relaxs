import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import * as hoops from '../src/hoops-scene.js';
import * as avatars from '../src/sport-avatar.js';
import * as physics from '../src/hoops-physics.js';
import {getHoopsChallenge} from '../src/hoops-challenges.js';
import * as tripo from '../src/hoops-tripo-character.js';

test('the offered and default view shows a third-person athlete', () => {
  assert.deepEqual(hoops.HOOPS_VIEWS, [
    {id: 'court', label: '人物视角'},
  ]);
  const court = hoops.createHoopsCamera(320, 600);
  assert.ok(court.position.z>physics.BALL_START.z,'default camera follows behind the visible player');
  assert.ok(court.position.y>=2.3 && court.position.y<=3,'camera should stay close to shoulder height');
  assert.equal(court.fov, 56);
  const oldOption = hoops.createHoopsCamera(320,600,{view:'first-person'});
  assert.deepEqual(oldOption.position.toArray(),court.position.toArray());
});

test('dedicated hands lift to the exact physics origin for all characters without allocating on switches', () => {
  assert.equal(typeof hoops.createHoopsHands, 'function');
  const hands = hoops.createHoopsHands();
  const geometry = new Set(), materials = new Set();
  hands.group.traverse(object => {
    if (object.geometry) geometry.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  let released = 0;
  for (const resource of [...geometry, ...materials]) resource.addEventListener('dispose', () => released++);
  for (let turn = 0; turn < 9; turn++) {
    const character = avatars.SPORT_CHARACTERS[turn % 3];
    hands.setCharacter(character.id);
    const ready = hands.update({action: 0}).clone();
    assert.ok(ready.distanceTo(new THREE.Vector3(0, 1, 5.2)) < 1e-8);
    const grip = hands.update({action: physics.HOOPS_RELEASE_ACTION}).clone();
    assert.ok(grip.distanceTo(physics.BALL_START) < 1e-8);
    assert.ok(grip.y - ready.y > .4);
    const palms = ['fp-left-hand', 'fp-right-hand'].map(name => hands.group.getObjectByName(name).getWorldPosition(new THREE.Vector3()));
    assert.ok(palms[0].add(palms[1]).multiplyScalar(.5).distanceTo(grip) < 1e-8);
    assert.equal(hands.group.getObjectByName('fp-left-sleeve').material.color.getHexString(),
      new THREE.Color(character.color).getHexString());
    const follow = hands.update({action: .7}).clone();
    assert.ok(follow.y > grip.y, 'hands should finish upward after release');
    assert.ok(hands.update({action: 1}).distanceTo(ready) < 1e-8);
    hands.group.traverse(object => {
      if (object.geometry) assert.ok(geometry.has(object.geometry));
      if (object.material) assert.ok(materials.has(object.material));
    });
  }
  hands.dispose(); hands.dispose();
  assert.equal(released, geometry.size + materials.size);
});

function fullScene({loadTripo=tripo.loadHoopsTripoCharacter,view='court'}={}) {
  let rendered;
  class Renderer {
    constructor() {this.shadowMap = {}; this.renderLists = {dispose() {}}; this.capabilities = {getMaxAnisotropy: () => 1};}
    setPixelRatio() {} setSize() {} dispose() {}
    render(scene, camera) {rendered = {scene, camera};}
  }
  const source = readFileSync(new URL('../src/hoops-scene.js', import.meta.url), 'utf8')
    .replace("import * as THREE from 'three';", 'const THREE = imports.three;')
    .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
      (_, names, _quote, file) => `const {${names}} = imports[${JSON.stringify(file)}];`)
    .replace("import('./hoops-tripo-character.js')",'imports.tripoModule()')
    .replaceAll('export function ', 'function ').replaceAll('export const ', 'const ');
  const context = vm.createContext({console, imports: {
    three: {...THREE, WebGLRenderer: Renderer}, './sport-avatar.js': avatars, './hoops-physics.js': physics,
    tripoModule:async()=>({loadHoopsTripoCharacter:loadTripo}),
  }});
  vm.runInContext(source, context);
  const scene = context.createHoopsScene({clientWidth: 320, clientHeight: 600,
    ownerDocument: {defaultView: {devicePixelRatio: 1}}}, {character: 'peach', view});
  return {scene, get rendered() {return rendered;}};
}

test('third-person framing keeps the full athlete and moving baskets in frame across phone and desktop sizes', () => {
  const app = fullScene();
  try {
    for (const [width, height] of [[320, 600], [640, 620], [1100, 790]]) {
      app.scene.resize(width, height);
      app.scene.render({holding: true, action: 0, time: 0}, 0);
      for (const difficulty of ['standard', 'hard']) for (const index of [7, 8, 9]) {
        const base = getHoopsChallenge(difficulty, index).hoop;
        // Cover the complete promised sinusoid envelope, including x=-2.53.
        // This tests presentation independently of the target's physics clock.
        for (const offset of [-.85, 0, .85]) {
          const hoop = {...base, x: base.x + offset};
          app.scene.render({hoop, holding: true, action: 0, time: 0}, 0);
          const avatar=app.rendered.scene.getObjectByName('basketball-avatar');
          assert.ok(avatar.visible);
          const bounds=new THREE.Box3().setFromObject(avatar,true);
          for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]) {
            const p=app.scene.project({x,y,z});
            assert.ok(p.x>8 && p.x<width-8 && p.y>height*.04 && p.y<height*.94,'character must not be cropped');
          }
          for (const side of [-1, 1]) {
            const edge = app.scene.project({x: hoop.x + side * .95, y: hoop.y + 1.3, z: hoop.z - .62});
            assert.ok(edge.x > 8 && edge.x < width - 8,
              `${difficulty} question ${index + 1} clips at x=${hoop.x} on ${width}×${height}`);
            assert.ok(edge.y > height*.04 && edge.y < height*.94);
          }
        }
      }
    }
  } finally {app.scene.dispose();}
});

test('full scene switches and resizes while paused, preserves character and physics, and clears camera shake', () => {
  const app = fullScene({view:'first-person'}), scene = app.scene;
  try {
    assert.equal(typeof scene.setView, 'function');
    const state = {holding: true, action: .22, time: 4, hoop: getHoopsChallenge('hard', 2).hoop, aim: {x: -.4, power: .8}};
    const original = structuredClone(state);
    const held = scene.render(state, 0).clone();
    const avatar = app.rendered.scene.getObjectByName('basketball-avatar');
    assert.equal(avatar.visible,true,'even an old first-person mount option must show the full character');
    const camera = app.rendered.camera.position.clone();
    scene.render(state, 0);
    assert.ok(app.rendered.camera.position.distanceTo(camera) < 1e-10, 'paused camera does not drift');
    assert.equal(scene.setView('court'), true);
    scene.render(state, 0);
    assert.equal(avatar.visible,true);
    scene.setCharacter('robot');
    assert.equal(scene.setView('first-person'),false);
    scene.resize(640, 620);
    assert.ok(scene.render(state, 0).distanceTo(held) < 1e-10);
    assert.equal(avatar.userData.character,'robot');
    assert.equal(scene.setView('invalid'), false);
    const shot = physics.createShot(physics.velocityFromAim(state.aim), {wind: {x: 1}});
    physics.stepShot(shot, .1, state.hoop);
    const before = structuredClone(shot);
    assert.deepEqual(scene.render({...state, holding: false, ball: shot.position}, 0).toArray(),
      [shot.position.x, shot.position.y, shot.position.z]);
    assert.deepEqual(shot, before); assert.deepEqual(state, original);
  } finally {scene.dispose(); scene.dispose();}
});

test('full free-court scene preserves moved release and airborne world coordinates across paused view switches', () => {
  const app=fullScene(), scene=app.scene;
  const state={freeCourt:true,player:{x:4,z:-1},origin:{x:4,y:1.45,z:-1},
    velocity:{x:-7,y:8,z:-3.5},holding:true,action:physics.HOOPS_RELEASE_ACTION,time:3,move:0};
  const before=structuredClone(state);
  try {
    for(const view of ['first-person','court','first-person']) {
      scene.setView(view); scene.resize(320,600);
      assert.ok(scene.render(state,0).distanceTo(state.origin)<1e-8);
      scene.setCharacter('robot');
      assert.ok(scene.render(state,0).distanceTo(state.origin)<1e-8);
    }
    const airborne={x:2.3,y:4.9,z:-2.8};
    assert.deepEqual(scene.render({...state,holding:false,ball:airborne},0).toArray(),[2.3,4.9,-2.8]);
    assert.deepEqual(state,before);
  } finally {scene.dispose();}
});

test('Tripo installs without forcing a selection, releases at the same origin, and disposes late async loads', async () => {
  const pending=[];
  const app=fullScene({loadTripo:()=>new Promise(resolve=>pending.push(resolve))});
  function asset() {
    const source=new THREE.Group(),geometry=new THREE.BoxGeometry(.7,1.8,.4);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial()); mesh.position.y=.9;source.add(mesh);
    let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
    return {value:tripo.createHoopsTripoCharacter({scene:source},{name:'本地 Tripo'}),get disposed(){return disposed;}};
  }
  assert.equal(typeof app.scene.setTripoCharacter,'function');
  assert.equal(app.scene.setCharacter('tripo'),false,'unavailable model cannot hide the original character');
  const first=asset(),request=app.scene.setTripoCharacter(new ArrayBuffer(1),{name:'球手'});
  await new Promise(resolve=>setImmediate(resolve));
  pending.shift()(first.value);assert.equal(await request,true);
  app.scene.render({holding:true},0);
  assert.equal(app.rendered.scene.getObjectByName('basketball-avatar').userData.character,'peach');
  assert.equal(app.scene.setCharacter('tripo'),true);
  assert.equal(app.scene.getTripoCharacter().rigged,false);
  app.scene.setView('court');
  const origin={x:-4,y:1.45,z:2};
  const props={freeCourt:true,origin,player:origin,holding:true,action:physics.HOOPS_RELEASE_ACTION};
  assert.ok(app.scene.render(props,0).distanceTo(origin)<1e-8);
  app.scene.setCharacter('moss');assert.ok(app.scene.render(props,0).distanceTo(origin)<1e-8);
  app.scene.setCharacter('tripo');assert.ok(app.scene.render(props,0).distanceTo(origin)<1e-8);
  const stale=asset(),latest=asset();
  const older=app.scene.setTripoCharacter(new ArrayBuffer(2)),newer=app.scene.setTripoCharacter(new ArrayBuffer(3));
  await new Promise(resolve=>setImmediate(resolve));
  // Both requests may reach the parser; a stale decode must never replace newer data.
  if(pending.length===2){pending.shift()(stale.value);assert.equal(await older,false);assert.equal(stale.disposed,1);}
  else {assert.equal(await older,false);stale.value.dispose();}
  pending.shift()(latest.value);assert.equal(await newer,true);
  assert.equal(first.disposed,1);
  const late=asset(),lateRequest=app.scene.setTripoCharacter(new ArrayBuffer(4));
  await new Promise(resolve=>setImmediate(resolve));
  app.scene.dispose();app.scene.dispose();pending.shift()(late.value);
  assert.equal(await lateRequest,false);
  assert.equal(late.disposed,1);assert.equal(latest.disposed,1);
  assert.equal(app.scene.setCharacter('tripo'),false);
});

test('realistic scene uses physical ground maps and sky reflections without fogging the playable court', () => {
  const app=fullScene();
  try {
    app.scene.setView('court');app.scene.resize(320,600);
    app.scene.render({freeCourt:true,player:{x:5.3,z:8.2},holding:true},0);
    const {scene,camera}=app.rendered,ground=scene.getObjectByName('court-playing-surface');
    assert.ok(ground?.material.normalMap && ground.material.roughnessMap);
    assert.ok(ground.receiveShadow);
    assert.ok(scene.environment?.isDataTexture,'metal and glass need a local lighting environment');
    for(const x of [-5.3,5.3])for(const z of [-5.3,8.2])
      assert.ok(scene.fog.near>camera.position.distanceTo(new THREE.Vector3(x,0,z)),'fog must start beyond play');
    const contact=scene.getObjectByName('shooter-contact-shadow');
    assert.ok(contact?.material.transparent && contact.material.map);
    const before=contact.position.clone();
    app.scene.render({freeCourt:true,player:{x:-4,z:0},holding:true},0);
    assert.ok(contact.position.distanceTo(before)>4,'contact shadow must follow the actual moving character');
    let light;
    scene.traverse(object=>{if(object.isDirectionalLight && object.castShadow)light=object;});
    assert.ok(light && light.shadow.mapSize.x>=1024);
    light.shadow.camera.updateProjectionMatrix();light.shadow.updateMatrices(light);
    for(const x of [-5.3,5.3])for(const z of [-5.3,8.2]) {
      const projected=new THREE.Vector3(x,0,z).project(light.shadow.camera);
      assert.ok(Math.abs(projected.x)<=1 && Math.abs(projected.y)<=1 && Math.abs(projected.z)<=1);
    }
    const resources=new Set();
    scene.traverse(object=>{
      if(object.geometry)resources.add(object.geometry);
      for(const material of [object.material].flat().filter(Boolean)) {
        resources.add(material);
        for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
      }
    });
    resources.add(scene.environment);
    let disposed=0;resources.forEach(resource=>resource.addEventListener('dispose',()=>disposed++));
    app.scene.dispose();app.scene.dispose();
    assert.equal(disposed,resources.size,'every new texture, material and geometry must be released once');
  } finally {app.scene.dispose();}
});
