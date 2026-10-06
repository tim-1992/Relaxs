import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {inspectMolesGLB} from './moles-character.js';
import {HOOPS_RELEASE_ACTION} from './hoops-physics.js';

function resourcePool() {
  const owned=new Set(),released=new Set(),images=new Set();
  let disposed=false;
  function release(resource) {
    if(released.has(resource))return;
    released.add(resource);resource.dispose();
    if(resource.isTexture)for(const image of [resource.source?.data].flat()) {
      if(image?.close && !images.has(image)){images.add(image);image.close();}
    }
  }
  function own(resource) {
    if(!resource || owned.has(resource))return;
    owned.add(resource);if(disposed)release(resource);
  }
  function collect(value) {
    if(Array.isArray(value)){value.forEach(collect);return;}
    if(!value)return;
    if(value.isTexture || value.isBufferGeometry)own(value);
    else if(value.isMaterial) {
      own(value);Object.values(value).forEach(item=>{if(item?.isTexture)own(item);});
    } else if(value.isObject3D)value.traverse(object=>{
      collect(object.geometry);collect(object.material);own(object.skeleton);
    });
  }
  return {collect,dispose(){if(!disposed){disposed=true;owned.forEach(release);}}};
}

// Rotate a real joint in world space, retaining the rig's authored bone axes.
// This works with both Mixamo and Tripo humanoid rigs without Euler-axis guesses.
function pointBone(bone,child,target) {
  const pivot=bone.getWorldPosition(new THREE.Vector3());
  const from=child.getWorldPosition(new THREE.Vector3()).sub(pivot).normalize();
  const to=target.clone().sub(pivot).normalize();
  const world=bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromUnitVectors(from,to));
  const parent=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  bone.quaternion.copy(parent.multiply(world));
  bone.updateWorldMatrix(false,true);
}

function turnBone(bone,axis,angle) {
  if(!bone)return;
  const world=bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromAxisAngle(axis,angle));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
  bone.updateWorldMatrix(false,true);
}

function reach(arm,target,bend) {
  const shoulder=arm.upper.getWorldPosition(new THREE.Vector3());
  const elbow=arm.lower.getWorldPosition(new THREE.Vector3());
  const hand=arm.hand.getWorldPosition(new THREE.Vector3());
  const upperLength=elbow.distanceTo(shoulder),lowerLength=hand.distanceTo(elbow);
  const direction=target.clone().sub(shoulder);
  const distance=Math.min(direction.length(),upperLength+lowerLength-1e-5);
  if(distance<1e-5 || upperLength<1e-5 || lowerLength<1e-5)return;
  direction.normalize();
  const along=(upperLength**2-lowerLength**2+distance**2)/(2*distance);
  const height=Math.sqrt(Math.max(0,upperLength**2-along**2));
  bend.addScaledVector(direction,-bend.dot(direction)).normalize();
  elbow.copy(shoulder).addScaledVector(direction,along).addScaledVector(bend,height);
  pointBone(arm.upper,arm.lower,elbow);
  pointBone(arm.lower,arm.hand,target);
}

// A small vector lettering atlas works in browsers and headless asset previews;
// it needs neither a system font nor a Canvas/DOM implementation.
function jerseyTexture() {
  const size=512,data=new Uint8Array(size*size*4);
  for(let i=0;i<size*size;i++)data.set([255,255,255,0],i*4);
  function stroke(points,width) {
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],ax=a[0]*size,ay=a[1]*size,bx=b[0]*size,by=b[1]*size;
      const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy,radius=width*size/2;
      for(let y=Math.max(0,Math.floor(Math.min(ay,by)-radius-1));y<Math.min(size,Math.ceil(Math.max(ay,by)+radius+1));y++)
        for(let x=Math.max(0,Math.floor(Math.min(ax,bx)-radius-1));x<Math.min(size,Math.ceil(Math.max(ax,bx)+radius+1));x++) {
          const t=length?THREE.MathUtils.clamp(((x+.5-ax)*dx+(y+.5-ay)*dy)/length,0,1):0;
          const coverage=THREE.MathUtils.clamp(radius+.5-Math.hypot(x+.5-ax-t*dx,y+.5-ay-t*dy),0,1);
          // DataTexture row zero is the bottom of the shirt UV rectangle.
          const index=((size-1-y)*size+x)*4+3;
          data[index]=Math.max(data[index],Math.round(coverage*255));
        }
    }
  }
  const paths=[
    [[.1,.12],[.29,.12]],[[.195,.12],[.195,.29]], // T
    [[.35,.29],[.35,.18],[.39,.17],[.43,.185]], // r
    [[.49,.19],[.49,.29]],[[.49,.135],[.49,.135]], // i
    [[.57,.36],[.57,.185],[.625,.175],[.67,.2],[.675,.255],[.635,.285],[.57,.275]], // p
    Array.from({length:25},(_,i)=>[.79+Math.cos(i/24*Math.PI*2)*.055,.232+Math.sin(i/24*Math.PI*2)*.057]),
  ];
  paths.forEach(path=>stroke(path,.028));
  const curve=(...p)=>new THREE.CubicBezierCurve(...p.map(v=>new THREE.Vector2(...v))).getPoints(20).map(p=>p.toArray());
  stroke([
    ...curve([.34,.465],[.52,.36],[.79,.44],[.64,.60]),
    ...curve([.64,.60],[.59,.645],[.49,.65],[.455,.65]),
    ...curve([.455,.65],[.75,.59],[.81,.96],[.34,.875]),
  ],.065);
  const texture=new THREE.DataTexture(data,size,size);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}

function addJersey(source,group,arms,bones,pool) {
  const spine=bones.find(bone=>/spine$/i.test(bone.name));
  if(!spine)return;
  group.updateWorldMatrix(true,true);
  const local=object=>group.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
  const left=local(arms[0].upper),right=local(arms[1].upper),waist=local(spine);
  const center=left.clone().add(right).multiplyScalar(.5);
  const width=Math.abs(right.x-left.x)*.78,bottom=waist.y+.04,top=center.y-.055;
  if(width<.1 || top-bottom<.15)return;
  const meshes=[];
  source.traverse(object=>{if(object.isSkinnedMesh)meshes.push(object);});
  let material;
  for(const mesh of meshes) {
    const original=mesh.geometry,position=original.attributes.position,normal=original.attributes.normal;
    const joints=original.attributes.skinIndex,weights=original.attributes.skinWeight;
    if(!normal || !joints || !weights)continue;
    const matrix=new THREE.Matrix4().copy(group.matrixWorld).invert().multiply(mesh.matrixWorld);
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix);
    const torso=mesh.skeleton.bones.map(bone=>/spine|chest|hips|torso/i.test(bone.name));
    const points=[],normals=[],torsoWeight=[];
    for(let i=0;i<position.count;i++) {
      points.push(new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix));
      normals.push(new THREE.Vector3().fromBufferAttribute(normal,i).applyNormalMatrix(normalMatrix));
      let weight=0;
      for(let j=0;j<4;j++)if(torso[joints.getComponent(i,j)])weight+=weights.getComponent(i,j);
      torsoWeight.push(weight);
    }
    for(const side of [-1,1]) {
      const selected=[],index=original.index;
      for(let i=0;i<(index?.count||position.count);i+=3) {
        const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j),p=ids.map(id=>points[id]);
        if(ids.reduce((sum,id)=>sum+torsoWeight[id],0)<1.2
          || ids.reduce((sum,id)=>sum+normals[id].z*side,0)<.1
          || p.reduce((sum,v)=>sum+(v.z-waist.z)*side,0)<.12
          || Math.min(...p.map(v=>v.x))>center.x+width/2 || Math.max(...p.map(v=>v.x))<center.x-width/2
          || Math.min(...p.map(v=>v.y))>top || Math.max(...p.map(v=>v.y))<bottom)continue;
        selected.push(...ids);
      }
      if(!selected.length)continue;
      const geometry=new THREE.BufferGeometry(),attributes={position:[],normal:[],uv:[],skinIndex:[],skinWeight:[]};
      const scale=new THREE.Vector3();mesh.getWorldScale(scale);
      const separation=.001/Math.max(scale.x,scale.y,scale.z);
      for(const id of selected) {
        const point=new THREE.Vector3().fromBufferAttribute(position,id)
          .addScaledVector(new THREE.Vector3().fromBufferAttribute(normal,id),separation);
        attributes.position.push(...point.toArray());
        attributes.normal.push(normal.getX(id),normal.getY(id),normal.getZ(id));
        attributes.uv.push(.5+side*(points[id].x-center.x)/width,(points[id].y-bottom)/(top-bottom));
        for(let j=0;j<4;j++){attributes.skinIndex.push(joints.getComponent(id,j));attributes.skinWeight.push(weights.getComponent(id,j));}
      }
      for(const [name,array] of Object.entries(attributes))
        geometry.setAttribute(name,name==='skinIndex'?new THREE.Uint16BufferAttribute(array,4):
          new THREE.Float32BufferAttribute(array,name==='uv'?2:name==='skinWeight'?4:3));
      geometry.userData.sourceVertices=selected;
      if(!material)material=new THREE.MeshStandardMaterial({
        color:'#ffffff',map:jerseyTexture(),roughness:.86,metalness:0,
        alphaTest:.08,alphaToCoverage:true,depthWrite:false,
        polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
      });
      const ink=new THREE.SkinnedMesh(geometry,material);
      ink.name=`tripo-jersey-${side<0?'front':'back'}`;
      ink.userData.jersey={name:'Tripo',number:'3',side:side<0?'front':'back'};
      ink.frustumCulled=false;ink.receiveShadow=true;
      mesh.add(ink);ink.bindMode=mesh.bindMode;ink.bind(mesh.skeleton,mesh.bindMatrix);
      pool.collect(ink);
    }
  }
}

/** Owns one parsed GLB. Bones use explicit action/time, never a private clock.
 * A model without a usable skinned arm chain stays static and reports rigged=false.
 */
export function createHoopsTripoCharacter(gltf,{name='Tripo 球手'}={},pool=resourcePool()) {
  const group=new THREE.Group();
  group.name='basketball-tripo-character';
  pool.collect(gltf.scenes||gltf.scene);
  let disposed=false;
  try {
    const source=gltf.scene;
    if(!source)throw new Error('GLB 中没有角色。');
    source.updateMatrixWorld(true);
    const bones=[],rest=new Map();
    let skinned=false;
    source.traverse(object=>{
      if(object.isMesh){object.castShadow=object.receiveShadow=true;}
      if(object.isSkinnedMesh){skinned=true;object.frustumCulled=false;}
      if(object.isBone){bones.push(object);rest.set(object,object.quaternion.clone());}
    });
    const find=(side,parts)=>bones.find(bone=>{
      const key=bone.name.toLowerCase().replace(/[^a-z]/g,'');
      return parts.some(part=>key.endsWith(side+part) || key.endsWith(part+side) ||
        key.endsWith(part+side[0]) || key.endsWith(side[0]+part));
    });
    const arms=['left','right'].map((side,index)=>({
      side:index===0?-1:1,
      upper:find(side,['arm','upperarm']),lower:find(side,['forearm','lowerarm']),hand:find(side,['hand','wrist']),
    }));
    const rigged=skinned && arms.every(arm=>arm.upper && arm.lower && arm.hand);
    const oriented=new THREE.Group(),fitted=new THREE.Group(),offset=new THREE.Group();
    // Tripo's real biped export can face +X even though its joints have Mixamo
    // names. Anatomical right defines the horizontal basis before fitting.
    let yaw=Math.PI;
    if(rigged) {
      const right=arms[1].upper.getWorldPosition(new THREE.Vector3())
        .sub(arms[0].upper.getWorldPosition(new THREE.Vector3()));
      if(Math.hypot(right.x,right.z)>1e-5)yaw=Math.atan2(right.z,right.x);
    }
    oriented.rotation.y=yaw;oriented.add(source);oriented.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(oriented,true);
    const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    if(bounds.isEmpty() || ![...size.toArray(),...center.toArray()].every(Number.isFinite) || size.y<1e-5)
      throw new Error('GLB 角色尺寸无效。');
    fitted.scale.setScalar(Math.min(1.8/size.y,2.2/Math.max(size.x,1e-5),1.4/Math.max(size.z,1e-5)));
    offset.position.set(-center.x,-bounds.min.y,-center.z);
    offset.add(oriented);fitted.add(offset);group.add(fitted);
    if(rigged)addJersey(source,group,arms,bones,pool);
    const legs=['left','right'].map(side=>({upper:find(side,['upleg','thigh','upperleg']),lower:find(side,['leg','calf','lowerleg'])}));
    const grip=new THREE.Vector3(),other=new THREE.Vector3();
    const ready=new THREE.Vector3(0,1.02,-.42),release=new THREE.Vector3(0,1.45,-.34),follow=new THREE.Vector3(0,1.65,-.25);
    const ball=ready.clone(),target=new THREE.Vector3(),bend=new THREE.Vector3(),worldRotation=new THREE.Quaternion();
    const rightAxis=new THREE.Vector3();
    const ease=t=>t*t*(3-2*t);
    function getGripPosition(out=new THREE.Vector3()) {
      group.updateWorldMatrix(true,true);
      if(rigged) {
        arms[0].hand.getWorldPosition(out);
        return out.add(arms[1].hand.getWorldPosition(other)).multiplyScalar(.5);
      }
      return group.localToWorld(out.set(0,1.45,-.42));
    }
    function update({time=0,move=0,action=0}={}) {
      if(disposed)return grip;
      if(rigged) {
        for(const bone of bones)bone.quaternion.copy(rest.get(bone));
        const p=THREE.MathUtils.clamp(Number.isFinite(action)?action:0,0,1);
        const gait=Math.sin((Number.isFinite(time)?time:0)*13)*THREE.MathUtils.clamp(Number.isFinite(move)?move:0,0,1);
        group.updateWorldMatrix(true,true);
        group.getWorldQuaternion(worldRotation);
        rightAxis.set(1,0,0).applyQuaternion(worldRotation);
        legs.forEach((leg,index)=>{
          const stride=gait*(index?-1:1);
          turnBone(leg.upper,rightAxis,stride*.38);
          turnBone(leg.lower,rightAxis,-Math.max(0,stride)*.55);
        });
        if(p<=HOOPS_RELEASE_ACTION)ball.lerpVectors(ready,release,ease(p/HOOPS_RELEASE_ACTION));
        else if(p<.75)ball.lerpVectors(release,follow,ease((p-HOOPS_RELEASE_ACTION)/(.75-HOOPS_RELEASE_ACTION)));
        else ball.lerpVectors(follow,ready,ease((p-.75)/.25));
        group.updateWorldMatrix(true,true);
        for(const arm of arms) {
          target.copy(ball);target.x+=arm.side*.14;
          group.localToWorld(target);
          bend.set(arm.side*.7,-.8,.15).applyQuaternion(worldRotation);
          reach(arm,target,bend);
        }
      }
      group.updateMatrixWorld(true);
      // CPU geometry queries and the renderer use the same current skin matrices.
      source.traverse(object=>object.skeleton?.update());
      return getGripPosition(grip);
    }
    update();
    return {group,rigged,name:String(name||'Tripo 球手').slice(0,120),update,getGripPosition,dispose() {
      if(disposed)return;
      disposed=true;pool.collect(group);group.removeFromParent();group.clear();pool.dispose();
    }};
  } catch(error) {pool.dispose();throw error;}
}

export async function loadHoopsTripoCharacter(buffer,options={}) {
  const bytes=ArrayBuffer.isView(buffer)
    ?buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength):buffer;
  if(!(bytes instanceof ArrayBuffer))throw new Error('请提供内嵌的 GLB 字节。');
  inspectMolesGLB(bytes);
  const pool=resourcePool(),urls=new Set(),manager=new THREE.LoadingManager();
  let settled=false;
  manager.setURLModifier(url=>{
    if(url.startsWith('blob:')) {
      if(settled){URL.revokeObjectURL(url);throw new Error('GLB 读取已结束。');}
      urls.add(url);return url;
    }
    if(/^data:/i.test(url))return url; // URI types already checked by preflight.
    throw new Error('GLB 外部资源已阻止。');
  });
  const loader=new GLTFLoader(manager);
  loader.register(parser=>{
    const dependency=parser.getDependency.bind(parser);
    parser.getDependency=(type,index)=>dependency(type,index).then(value=>{pool.collect(value);return value;});
    return {name:'HOOPS_TRIPO_RESOURCES'};
  });
  try {
    const gltf=await loader.parseAsync(bytes,'');
    return createHoopsTripoCharacter(gltf,options,pool);
  } catch(error) {pool.dispose();throw error;}
  finally {settled=true;urls.forEach(url=>URL.revokeObjectURL(url));}
}
