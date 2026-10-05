import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {loadMolesCharacter} from './moles-character.js';
import {loadHoopsTripoCharacter} from './hoops-tripo-character.js';
import {loadTripoAsset} from './tripo-assets.js';

// A canvas may be synchronously reused while the previous scene is retiring.
const RENDERER_OWNER=Symbol.for('relaxs.rendererOwner');
function releaseRenderer(renderer,canvas) {
  renderer.dispose();
  Promise.resolve().then(()=>{
    if(canvas[RENDERER_OWNER]!==renderer)return;
    delete canvas[RENDERER_OWNER];
    renderer.forceContextLoss?.();
  });
}


export function mountGamePreviews(root,games) {
  let disposed=false;
  const cleanups=[];
  for(const game of games) {
    const canvas=root.querySelector(`[data-preview="${game.id}"]`);
    const status=root.querySelector(`[data-preview-status="${game.id}"]`);
    let renderer;
    try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});}
    catch{status.textContent='进入小世界 ↗';continue;}
    canvas[RENDERER_OWNER]=renderer;
    const resources=[],models=new Map(),abort=new AbortController();
    let active=true,scene=null,key=null,generator=null,room=null,env=null,observe=null,ro=null,card=null;
    let frame=0,hover=false,visible=true,last=0,clock=0,athlete=null,heldBall=null;
    const enter=()=>{hover=true;},leave=()=>{hover=false;};
    function cleanup() {
      if(!active)return;
      active=false;
      abort.abort();cancelAnimationFrame(frame);ro?.disconnect();observe?.disconnect();
      card?.removeEventListener('pointerenter',enter);card?.removeEventListener('pointerleave',leave);
      try {
        resources.forEach(asset=>asset.dispose());resources.length=0;
        const geometries=new Set(),materials=new Set();
        scene?.traverse(object=>{
          if(object.geometry)geometries.add(object.geometry);
          [object.material].flat().filter(Boolean).forEach(material=>materials.add(material));
        });
        geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
        key?.shadow.dispose();env?.dispose();generator?.dispose();room?.dispose();
        if(scene){scene.environment=null;scene.clear();}
        models.clear();athlete=heldBall=null;
      } finally {releaseRenderer(renderer,canvas);}
    }
    cleanups.push(cleanup);
    try {
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.12;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.type=THREE.PCFShadowMap;
    scene=new THREE.Scene();const world=new THREE.Group();
    scene.add(world);
    const camera=new THREE.PerspectiveCamera(34,1,.1,80);
    camera.position.set(3.9,2.6,5.9);camera.lookAt(0,.75,0);
    generator=new THREE.PMREMGenerator(renderer);room=new RoomEnvironment();
    env=generator.fromScene(room,.05);scene.environment=env.texture;
    generator.dispose();room.dispose();generator=room=null;
    key=new THREE.DirectionalLight(0xffe7c9,3.2);
    key.position.set(-3,7,5);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);key.shadow.normalBias=.025;
    key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=5;key.shadow.camera.bottom=-5;
    scene.add(key,new THREE.HemisphereLight(0xc7e8f9,0x14212c,1.4));
    const rim=new THREE.DirectionalLight(0x7bd7e8,2);rim.position.set(3,3,-4);scene.add(rim);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({color:0x00090e,opacity:.35}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.006;floor.receiveShadow=true;scene.add(floor);
    card=canvas.closest('a');
    card.addEventListener('pointerenter',enter);card.addEventListener('pointerleave',leave);
    observe=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});
    observe.observe(canvas);
    function frameModels(){
      if(disposed || !active || !world.children.length)return;
      world.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(world,true),center=box.getCenter(new THREE.Vector3());
      const direction=new THREE.Vector3(3.2,1.8,5.9).normalize();
      const corners=[];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
        corners.push(new THREE.Vector3(x,y,z));
      for(let distance=3;distance<=10;distance+=.1){
        camera.position.copy(center).addScaledVector(direction,distance);
        camera.lookAt(center);camera.updateMatrixWorld(true);
        if(corners.every(point=>{
          const projected=point.clone().project(camera);
          return Math.abs(projected.x)<.85 && Math.abs(projected.y)<.82;
        }))break;
      }
    }
    function resize(){
      if(disposed || !active)return;
      const rect=canvas.getBoundingClientRect();
      if(rect.width<1||rect.height<1)return;
      renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();
      frameModels();
    }
    ro=new ResizeObserver(resize);ro.observe(canvas);resize();
    function shape(geometry,color,position,material={}) {
      const object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.25,metalness:.35,...material}));
      object.position.set(...position);object.castShadow=object.receiveShadow=true;world.add(object);return object;
    }
    if(game.id==='hoops') {
      shape(new THREE.BoxGeometry(1.1,.7,.06),0xb5c8c6,[1.35,2.0,-.5],{roughness:.2,metalness:.5});
      shape(new THREE.CylinderGeometry(.035,.055,2.1,16),0x546b73,[1.35,1.0,-.62]);
      const hoop=shape(new THREE.TorusGeometry(.22,.022,10,40),0xe5854c,[1.35,1.74,-.3]);hoop.rotation.x=Math.PI/2;
    }
    if(game.id==='moles') {
      for(const x of [-.75,0,.75])shape(new THREE.TorusGeometry(.38,.08,12,40),0x496d61,[x,.03,0]).rotation.x=Math.PI/2;
    }
    if(game.id==='breath') {
      const orb=shape(new THREE.SphereGeometry(.92,72,48),0x85cada,[0,1.1,0],{roughness:.1,metalness:.7});
      orb.material.envMapIntensity=2.5;
      for(let i=0;i<3;i++){
        const ring=shape(new THREE.TorusGeometry(1.28+i*.11,.01,8,100),0xa6d8d3,[0,1.1,0]);
        ring.rotation.set(.7+i*.3,0,.2+i*.4);
      }
      status.hidden=true;
      frameModels();
    }
    async function add(id,index) {
      const data=await loadTripoAsset(id);if(disposed || !active)return;
      let model;
      if(id==='player') {
        athlete=await loadHoopsTripoCharacter(data.buffer,{name:data.name});
        if(disposed || !active){athlete.dispose();return;}
        resources.push(athlete);model=athlete.group;athlete.update({action:.18});
        heldBall=shape(new THREE.SphereGeometry(.15,28,20),0xae522d,[0,0,0],{roughness:.9,metalness:0});
        for(const angle of [0,Math.PI/2]) {
          const seam=new THREE.Mesh(new THREE.TorusGeometry(.1502,.003,6,48),new THREE.MeshStandardMaterial({color:0x3d2219,roughness:1}));
          seam.rotation.y=angle;heldBall.add(seam);
        }
      } else {
        const asset=await loadMolesCharacter({name:data.name,size:data.buffer.byteLength,arrayBuffer:async()=>data.buffer},{signal:abort.signal});
        if(disposed || !active){asset.dispose();return;}
        resources.push(asset);model=asset.createInstance();
      }
      if(Number.isFinite(data.frontYaw))model.rotation.y=data.frontYaw;
      const holder=new THREE.Group();holder.add(model);world.add(holder);
      model.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(model,true),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
      const desired=id==='monster'?1.65:id==='vase'?.7:id==='tv'?1.1:id==='sofa'?2.65:id==='coral'?1.8:id==='player'?1.85:2.85;
      const scale=desired/Math.max(size.x,size.y,size.z);
      model.scale.multiplyScalar(scale);model.position.addScaledVector(center,-scale);model.position.y-= (box.min.y-center.y)*scale;
      if(game.id==='dive') {
        if(id==='turtle'){holder.position.set(0,1.1,.1);holder.rotation.y=-.55;}
        else holder.position.set(-.35,0,-.6);
      } else if(game.id==='demolition') {
        holder.position.set(index===0?-.4:index===1?1.1:-1.1,0,index===1?-.55:.15);
        holder.rotation.y=index===0?.15:-.3;
      } else if(game.id==='memory')holder.position.set(index===0?-.6:.9,0,0);
      else if(game.id==='hoops'){holder.position.x=-.4;holder.rotation.y=Math.PI+.2;}
      else if(game.id==='ride')holder.rotation.y=-.55;
      holder.traverse(object=>{if(object.isMesh){object.castShadow=object.receiveShadow=true;}});
      models.set(id,holder);status.hidden=true;
      if(athlete && heldBall){world.updateMatrixWorld(true);heldBall.position.copy(world.worldToLocal(athlete.getGripPosition(new THREE.Vector3())));}
      frameModels();
    }
    Promise.allSettled(game.assets.map(add)).then(results=>{
      if(!disposed && active && game.assets.length && results.every(result=>result.status==='rejected'))status.textContent='进入体验 ↗';
    });
    const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
    function render(now) {
      if(disposed || !active)return;
      frame=requestAnimationFrame(render);
      if(!visible||document.hidden||now-last<50)return;
      const dt=Math.min(.1,(now-last)/1000||0);last=now;clock+=dt;
      if(!reduce){world.rotation.y=THREE.MathUtils.damp(world.rotation.y,hover?.12:0,2,dt);
        if(game.id==='dive' && models.has('turtle'))models.get('turtle').position.y=1.1+Math.sin(clock*.6)*.06;}
      if(athlete && heldBall){world.updateMatrixWorld(true);athlete.update({action:.18});heldBall.position.copy(world.worldToLocal(athlete.getGripPosition(new THREE.Vector3())));}
      renderer.render(scene,camera);
    }
    frame=requestAnimationFrame(render);
    } catch {cleanup();status.textContent='进入体验 ↗';}
  }
  return()=>{if(disposed)return;disposed=true;cleanups.forEach(fn=>fn());cleanups.length=0;};
}
