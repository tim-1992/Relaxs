import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import * as avatars from '../src/sport-avatar.js';
import * as physics from '../src/hoops-physics.js';
import * as dive from '../src/dive-state.js';
import {createMolesState} from '../src/moles-state.js';

const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
};
const canvas=()=>({
  clientWidth:320,clientHeight:600,width:320,height:600,
  ownerDocument:{defaultView:{devicePixelRatio:1}},
  closest:()=>({addEventListener(){},removeEventListener(){}}),
  getBoundingClientRect:()=>({width:320,height:300}),
});

// The GPU and DOM boundary is substituted; scenes, geometry, materials,
// shadows, instance buffers and lifecycle code remain the production objects.
function harness({failSize=false,failPixelRatio=false,failEnvironment=0,loadPlayer,loadTree}={}) {
  const renderers=[],contexts=new WeakMap(),frames=new Map(),log=[];
  let environmentCalls=0,nextFrame=0;
  class Renderer {
    constructor({canvas}) {
      this.domElement=canvas;this.shadowMap={};this.renderLists={dispose(){}};
      this.capabilities={getMaxAnisotropy:()=>1};
      this.disposals=0;this.losses=0;
      if(!contexts.has(canvas))contexts.set(canvas,{lost:false});
      this.context=contexts.get(canvas);
      renderers.push(this);
    }
    setPixelRatio() {if(failPixelRatio)throw new Error('renderer configuration failed');}
    setSize() {if(failSize)throw new Error('setup failed');}
    render(scene,camera) {
      assert.equal(this.context.lost,false,'a retired renderer must not lose a replacement’s context');
      this.scene=scene;this.camera=camera;scene.updateMatrixWorld(true);
      scene.traverse(object=>{
        if(object.isDirectionalLight && object.castShadow && !object.shadow.map)
          object.shadow.map=new THREE.WebGLRenderTarget(16,16);
      });
    }
    dispose() {this.disposals++;log.push('renderer-dispose');}
    forceContextLoss() {this.losses++;this.context.lost=true;log.push('context-loss');}
  }
  const imports={
    three:{...THREE,WebGLRenderer:Renderer,PMREMGenerator:class {
      fromScene() {
        if(++environmentCalls===failEnvironment)throw new Error('environment setup failed');
        return new THREE.WebGLRenderTarget(16,16);
      }
      dispose() {}
    }},
    './sport-avatar.js':avatars,'./hoops-physics.js':physics,'./dive-state.js':dive,
    playerModule:async()=>({loadHoopsTripoCharacter:loadPlayer}),
    treeModule:async()=>({loadMolesCharacter:loadTree}),
  };
  function module(file) {
    const source=readFileSync(new URL(`../src/${file}.js`,import.meta.url),'utf8')
      .replace("import * as THREE from 'three';",'const THREE=imports.three;')
      .replace(/^import\s+\{([^}]+)\}\s+from\s+(['"])([^'"]+)\2;?/gm,
        (_,names,_quote,path)=>`const {${names}}=imports[${JSON.stringify(path)}];`)
      .replace("import('./hoops-tripo-character.js')",'imports.playerModule()')
      .replace("import('./moles-character.js')",'imports.treeModule()')
      .replaceAll('export function ','function ').replaceAll('export const ','const ');
    const context=vm.createContext({
      imports,console,AbortController,ArrayBuffer,Uint8Array,devicePixelRatio:1,
      document:{hidden:false},matchMedia:()=>({matches:false}),
      IntersectionObserver:class{observe(){}disconnect(){}},
      ResizeObserver:class{observe(){}disconnect(){}},
      requestAnimationFrame:fn=>(frames.set(++nextFrame,fn),nextFrame),
      cancelAnimationFrame:id=>frames.delete(id),
    });
    vm.runInContext(source,context);
    return context;
  }
  function scene(kind,element=canvas()) {
    const factory={hoops:'createHoopsScene',moles:'createMolesScene',dive:'createDiveScene'}[kind];
    return module(`${kind}-scene`)[factory](element);
  }
  function previews(games) {
    imports['three/addons/environments/RoomEnvironment.js']={RoomEnvironment:class{dispose(){}}};
    imports['./hoops-tripo-character.js']={loadHoopsTripoCharacter:loadPlayer};
    imports['./moles-character.js']={loadMolesCharacter:loadTree};
    imports['./tripo-assets.js']={loadTripoAsset:async()=>({buffer:new ArrayBuffer(8),name:'local.glb'})};
    const canvases=new Map(games.map(game=>[game.id,canvas()])),statuses=new Map(games.map(game=>[game.id,{}]));
    const root={querySelector(selector) {
      const id=selector.match(/="([^"]+)"/)[1];
      return (selector.includes('status')?statuses:canvases).get(id);
    }};
    return module('game-previews').mountGamePreviews(root,games);
  }
  return {scene,previews,renderers,frames,log,tick() {
    for(const [id,callback] of [...frames]){frames.delete(id);callback(100);}
  }};
}

for(const kind of ['hoops','moles','dive'])test(`${kind} releases resources before its context, exactly once`,async()=>{
  const app=harness(),scene=app.scene(kind),renderer=app.renderers[0];
  scene.render(kind==='dive'?dive.createDiveState():kind==='moles'?createMolesState():{holding:true},0);
  let geometry;
  renderer.scene.traverse(object=>{if(!geometry && object.geometry)geometry=object.geometry;});
  geometry.addEventListener('dispose',()=>app.log.push('geometry-dispose'));
  scene.dispose();scene.dispose();
  assert.equal(renderer.disposals,1);
  assert.equal(renderer.losses,0,'context retirement waits until synchronous canvas replacement finishes');
  await settle();
  assert.equal(renderer.losses,1);
  assert.ok(app.log.indexOf('geometry-dispose')<app.log.indexOf('renderer-dispose'));
  assert.ok(app.log.indexOf('renderer-dispose')<app.log.indexOf('context-loss'));
});

test('retiring a scene never invalidates another renderer that already acquired the same canvas',async()=>{
  const app=harness(),element=canvas(),first=app.scene('moles',element);
  first.dispose();
  const replacement=app.scene('dive',element);
  await settle();
  assert.equal(app.renderers[0].losses,0);
  replacement.render(dive.createDiveState());
  replacement.dispose();await settle();
  assert.equal(app.renderers[1].losses,1);
});

test('dive explicitly releases every instance matrix/color allocation on teardown',()=>{
  const app=harness(),scene=app.scene('dive');
  scene.render(dive.createDiveState());
  const instances=[];
  app.renderers[0].scene.traverse(object=>{if(object.isInstancedMesh)instances.push(object);});
  assert.ok(instances.length>=8);
  const counts=new Map(instances.map(object=>[object,0]));
  instances.forEach(object=>object.addEventListener('dispose',()=>counts.set(object,counts.get(object)+1)));
  scene.dispose();scene.dispose();
  assert.ok([...counts.values()].every(count=>count===1),'disposing shared geometry does not release instance buffers');
});

test('a hoops initialization failure retires its renderer without returning a scene',async()=>{
  const app=harness({failSize:true});
  assert.throws(()=>app.scene('hoops'),/setup failed/);
  await settle();
  assert.equal(app.renderers[0].disposals,1);
  assert.equal(app.renderers[0].losses,1);
});

test('a dive renderer configuration failure also releases its context',async()=>{
  const app=harness({failPixelRatio:true});
  assert.throws(()=>app.scene('dive'),/renderer configuration failed/);
  await settle();
  assert.equal(app.renderers[0].disposals,1);
  assert.equal(app.renderers[0].losses,1);
});

test('preview cards retire all contexts and RAFs across repeated navigation, idempotently',async()=>{
  const app=harness(),games=[{id:'breath',assets:[]},{id:'moles',assets:[]}];
  for(let i=0;i<3;i++) {
    const cleanup=app.previews(games);app.tick();
    cleanup();cleanup();await settle();
    assert.equal(app.frames.size,0);
    assert.ok(app.renderers.every(renderer=>renderer.disposals===1 && renderer.losses===1));
  }
  assert.equal(app.renderers.length,6);
});

test('one preview setup failure disposes that card and leaves the remaining cards cleanable',async()=>{
  const app=harness({failEnvironment:2});
  let cleanup;
  assert.doesNotThrow(()=>{cleanup=app.previews([{id:'breath',assets:[]},{id:'moles',assets:[]}]);});
  await settle();
  assert.equal(app.renderers[1].disposals,1);assert.equal(app.renderers[1].losses,1);
  assert.equal(app.frames.size,1);
  cleanup();await settle();
  assert.equal(app.frames.size,0);
  assert.equal(app.renderers[0].losses,1);
});

function asset() {
  const group=new THREE.Group(),geometry=new THREE.BoxGeometry(.4,1.8,.3);
  const material=new THREE.MeshStandardMaterial();
  group.add(new THREE.Mesh(geometry,material));
  let disposals=0;
  return {group,rigged:false,name:'local',update(){},
    getGripPosition(out=new THREE.Vector3()){return group.localToWorld(out.set(0,1.2,-.3));},
    createInstance(){return group.clone(true);},
    get disposals(){return disposals;},
    dispose(){disposals++;geometry.dispose();material.dispose();group.removeFromParent();group.clear();},
  };
}

test('a preview player completing after unmount is disposed without resurrecting its renderer',async()=>{
  const pending=deferred(),late=asset();
  const app=harness({loadPlayer:()=>pending.promise});
  const cleanup=app.previews([{id:'hoops',assets:['player']}]);
  await settle();cleanup();cleanup();pending.resolve(late);await settle();
  assert.equal(late.disposals,1);assert.equal(app.frames.size,0);
  assert.equal(app.renderers[0].disposals,1);assert.equal(app.renderers[0].losses,1);
});

for(const kind of ['player','tree'])test(`a late hoops ${kind} cannot retain or revive a retired context`,async()=>{
  const pending=deferred(),late=asset();
  const app=harness(kind==='player'?{loadPlayer:()=>pending.promise}:{loadTree:()=>pending.promise});
  const scene=app.scene('hoops');
  const request=kind==='player'?scene.setTripoCharacter(new ArrayBuffer(8)):scene.setTripoTree(new ArrayBuffer(8));
  await settle();scene.dispose();pending.resolve(late);
  assert.equal(await request,false);await settle();
  assert.equal(late.disposals,1);assert.equal(app.renderers[0].losses,1);
});
