import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import * as THREE from 'three';
import * as hoopsScene from '../src/hoops-scene.js';
const {createHoopsCamera, createHoopsHands, createHoopsShooter}=hoopsScene;
import {HOOPS_RELEASE_ACTION,courtFrame,velocityFromCourtAim} from '../src/hoops-physics.js';

test('court shooter translates its release to the supplied origin, faces launch velocity and walks only on supplied time', () => {
  const shooter = createHoopsShooter();
  try {
    for (const character of ['moss', 'peach', 'robot']) {
      shooter.setCharacter(character);
      for (const [origin, velocity] of [
        [{x:4,y:1.45,z:0}, {x:-6,y:8,z:-3}],
        [{x:-5.3,y:1.45,z:8.2}, {x:4,y:9,z:-10}],
        [{x:0,y:1.45,z:-5.3}, {x:0,y:7,z:5}],
      ]) {
        const props = {origin, velocity, action:HOOPS_RELEASE_ACTION};
        assert.ok(shooter.update(props).distanceTo(origin) < 1e-8, 'held ball must meet the frozen launch origin');
        const facing = new THREE.Vector3(0,0,-1).applyQuaternion(shooter.group.quaternion);
        const launch = new THREE.Vector3(velocity.x,0,velocity.z).normalize();
        assert.ok(facing.dot(launch) > .9999);
        assert.equal(shooter.group.position.y, 0);
        const frame = {...props, action:0, time:.1, move:1};
        shooter.update(frame);
        const leg = shooter.group.getObjectByName('left-knee');
        const pose = leg.matrixWorld.clone();
        shooter.update(frame);
        assert.ok(leg.matrixWorld.equals(pose), 'a repeated paused pose must not advance');
        shooter.update({...frame,time:.3});
        assert.ok(!leg.matrixWorld.equals(pose), 'move must reach the real walking rig');
      }
    }
  } finally {shooter.dispose();}
});

test('court hands rotate their actual palms into the launch frame without mutating inputs', () => {
  const hands = createHoopsHands();
  try {
    const origin = {x:4,y:1.45,z:-2}, velocity = {x:-6,y:9,z:0};
    const input = {origin,velocity,action:HOOPS_RELEASE_ACTION};
    const before = structuredClone(input);
    const release = hands.update(input).clone();
    assert.ok(release.distanceTo(origin) < 1e-8);
    const palms = ['left','right'].map(side => hands.group.getObjectByName(`fp-${side}-hand`)
      .getWorldPosition(new THREE.Vector3()));
    assert.ok(palms[0].add(palms[1]).multiplyScalar(.5).distanceTo(release) < 1e-8);
    assert.deepEqual(input,before);
    const ready = hands.update({origin,velocity,action:0}).clone();
    assert.ok(Math.abs(ready.x - (origin.x-.4)) < 1e-8, 'ready ball rotates forward along the shot direction');
    assert.ok(Math.abs(ready.z-origin.z)<1e-8);
    assert.ok(hands.update({action:HOOPS_RELEASE_ACTION}).distanceTo({x:0,y:1.45,z:5.6}) < 1e-8);
  } finally {hands.dispose();}
});

test('third-person court camera follows the player from behind at shoulder height and frames the entire athlete and basket', () => {
  const hoop = {x:0,y:3.35,z:-3};
  for (const [width,height] of [[284,600],[640,620],[1100,790]]) {
    for (const player of [{x:4,z:0},{x:-5.3,z:8.2},{x:0,z:-5.3},{x:0,z:-2.6}]) {
      const camera = createHoopsCamera(width,height,{view:'court',freeCourt:true,player,hoop});
      const toward = new THREE.Vector3(hoop.x-player.x,0,hoop.z-player.z).normalize();
      const eye = new THREE.Vector3(camera.position.x-player.x,0,camera.position.z-player.z).normalize();
      assert.ok(eye.dot(toward)<-.85, 'basket and full athlete need a close, behind-the-player view');
      assert.ok(camera.position.y>=2.3 && camera.position.y<=3);
      const feet=new THREE.Vector3(player.x,0,player.z).project(camera);
      const head=new THREE.Vector3(player.x,1.8,player.z).project(camera);
      assert.ok((head.y-feet.y)/2>=.23, 'athlete must occupy at least 23% of viewport height');
      const rim=new THREE.Vector3().copy(hoop).project(camera);
      assert.ok(Math.abs(rim.x)<.4 && rim.y>-.05, 'basket stays forward and in the upper center');
      for (const x of [-.95,.95]) for(const y of [0,1.3]) {
        const edge = new THREE.Vector3(hoop.x+x,hoop.y+y,hoop.z-.62).project(camera);
        assert.ok(Math.abs(edge.x)<.96 && Math.abs(edge.y)<.96, `basket clips at ${player.x},${player.z}`);
      }
      for(const x of [-.7,.7])for(const z of [-.7,.7])for(const y of [0,2]) {
        const corner=new THREE.Vector3(player.x+x,y,player.z+z).project(camera);
        assert.ok(Math.abs(corner.x)<.96 && Math.abs(corner.y)<.9,'whole athlete must remain visible through walking and throwing');
      }
    }
  }
});

function rigFixture() {
  const scene=new THREE.Group(), bones=[];
  const bone=(name,parent,x,y,z)=>{
    const part=new THREE.Bone(); part.name=name; part.position.set(x,y,z);
    parent.add(part); bones.push(part); return part;
  };
  const hips=bone('Hips',scene,0,.9,0), spine=bone('Spine',hips,0,.4,0);
  for(const [side,sign] of [['Left',-1],['Right',1]]) {
    const arm=bone(`${side}Arm`,spine,sign*.25,.1,0);
    const forearm=bone(`${side}ForeArm`,arm,sign*.3,0,0);
    bone(`${side}Hand`,forearm,sign*.25,0,0);
    const thigh=bone(`${side}UpLeg`,hips,sign*.15,-.05,0);
    const shin=bone(`${side}Leg`,thigh,0,-.4,0);
    bone(`${side}Foot`,shin,0,-.4,0);
  }
  const geometry=new THREE.BoxGeometry(.6,1.8,.4);
  geometry.translate(0,.9,0);
  const count=geometry.attributes.position.count;
  const joints=new Uint16Array(count*4), weights=new Float32Array(count*4);
  for(let i=0;i<count;i++) {
    joints[i*4]=bones.findIndex(b=>b.name==='RightHand'); weights[i*4]=1;
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(joints,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial());
  scene.add(mesh); scene.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones));
  return {scene,scenes:[scene],mesh};
}

function tinyGLB(external=false) {
  const positions=new Float32Array([-1,0,0,1,0,0,0,2,0]);
  const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],
    meshes:[{primitives:[{attributes:{POSITION:0}}]}],
    buffers:[{byteLength:positions.byteLength,...external?{uri:'https://example.com/private.bin'}:{}}],
    bufferViews:[{buffer:0,byteLength:positions.byteLength}],
    accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,0,0],max:[1,2,0]}]};
  const text=new TextEncoder().encode(JSON.stringify(json)),size=Math.ceil(text.length/4)*4;
  const bytes=new ArrayBuffer(28+size+positions.byteLength),view=new DataView(bytes),out=new Uint8Array(bytes);
  view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,bytes.byteLength,true);
  view.setUint32(12,size,true);view.setUint32(16,0x4e4f534a,true);
  out.fill(32,20,20+size);out.set(text,20);
  view.setUint32(20+size,positions.byteLength,true);view.setUint32(24+size,0x004e4942,true);
  out.set(new Uint8Array(positions.buffer),28+size);return bytes;
}

test('Tripo character poses real skinned bones deterministically, follows the actual hands, and owns every resource', async () => {
  const api=await import('../src/hoops-tripo-character.js').catch(()=>({}));
  assert.equal(typeof api.createHoopsTripoCharacter,'function');
  const gltf=rigFixture(),asset=api.createHoopsTripoCharacter(gltf,{name:'球手'});
  try {
    assert.equal(asset.rigged,true);
    const sample=()=>gltf.mesh.getVertexPosition(0,new THREE.Vector3());
    asset.update({action:0,time:0,move:0});
    const ready=sample(),grip=asset.getGripPosition().clone();
    asset.update({action:HOOPS_RELEASE_ACTION,time:0,move:0});
    const released=asset.getGripPosition().clone();
    assert.ok(released.y>grip.y+.3,'the real hands lift rather than only a synthetic grip');
    assert.ok(sample().distanceTo(ready)>.1,'skin vertices must move with the skeleton');
    const frozen=sample();
    asset.update({action:HOOPS_RELEASE_ACTION,time:0,move:0});
    assert.ok(sample().distanceTo(frozen)<1e-8);
    const leg=gltf.scene.getObjectByName('LeftUpLeg');
    asset.update({action:0,time:.1,move:1}); const pose=leg.quaternion.clone();
    asset.update({action:0,time:.3,move:1}); assert.ok(!leg.quaternion.equals(pose));
    gltf.mesh.skeleton.computeBoneTexture();
    const resources=[gltf.mesh.geometry,gltf.mesh.material,gltf.mesh.skeleton.boneTexture];
    let disposed=0;
    resources.forEach(resource=>resource.addEventListener('dispose',()=>disposed++));
    asset.dispose();asset.dispose();
    assert.equal(disposed,resources.length);
    assert.equal(asset.group.children.length,0);
  } finally {asset.dispose();}
});

test('Tripo byte loader parses real embedded GLB, rejects remote references and identifies static fallback honestly', async () => {
  const api=await import('../src/hoops-tripo-character.js').catch(()=>({}));
  assert.equal(typeof api.loadHoopsTripoCharacter,'function');
  const asset=await api.loadHoopsTripoCharacter(new Uint8Array(tinyGLB()),{name:'本地球手'});
  try {
    assert.equal(asset.rigged,false);
    assert.equal(asset.name,'本地球手');
    assert.ok(new THREE.Box3().setFromObject(asset.group,true).getSize(new THREE.Vector3()).y>1.5);
    const position=asset.group.children[0].quaternion.clone();
    asset.update({action:.55,time:9,move:1});
    assert.ok(asset.group.children[0].quaternion.equals(position),'a static asset must not pretend to have animated bones');
  } finally {asset.dispose();}
  await assert.rejects(api.loadHoopsTripoCharacter(tinyGLB(true)),/外部|嵌入/);
  await assert.rejects(api.loadHoopsTripoCharacter(new ArrayBuffer(4)),/GLB/);
});

test('court surface has independent seamless color, roughness and unit normal data with bounded disposal', () => {
  assert.equal(typeof hoopsScene.createHoopsSurfaceTextures,'function');
  const textures=hoopsScene.createHoopsSurfaceTextures({size:128});
  const repeat=hoopsScene.createHoopsSurfaceTextures({size:128});
  try {
    assert.equal(textures.map.colorSpace,THREE.SRGBColorSpace);
    for(const texture of [textures.roughnessMap,textures.normalMap])
      assert.equal(texture.colorSpace,THREE.NoColorSpace,'material data must not be gamma decoded');
    const normals=textures.normalMap.image.data,roughness=textures.roughnessMap.image.data;
    let minimum=255,maximum=0,tilted=0;
    for(let i=0;i<normals.length;i+=4) {
      const n=[normals[i],normals[i+1],normals[i+2]].map(v=>v/255*2-1);
      assert.ok(Math.abs(Math.hypot(...n)-1)<.015);
      assert.ok(n[2]>.75,'aggregate must not create wildly tilted normals');
      if(Math.abs(n[0])>.015 || Math.abs(n[1])>.015)tilted++;
      minimum=Math.min(minimum,roughness[i+1]);maximum=Math.max(maximum,roughness[i+1]);
    }
    assert.ok(tilted>128*128*.25,'a flat normal map does not provide surface grain');
    assert.ok(minimum>140 && maximum-minimum>20,'rough acrylic retains visible roughness variation');
    const counts=new Map();
    for(const key of ['map','roughnessMap','normalMap']) {
      const texture=textures[key];
      assert.deepEqual(texture.image.data,repeat[key].image.data);
      assert.equal(texture.wrapS,THREE.RepeatWrapping);
      assert.equal(texture.wrapT,THREE.RepeatWrapping);
      assert.ok(texture.generateMipmaps);
      counts.set(key,0);texture.addEventListener('dispose',()=>counts.set(key,counts.get(key)+1));
    }
    textures.dispose();textures.dispose();
    for(const count of counts.values())assert.equal(count,1);
  } finally {textures.dispose();repeat.dispose();}
});

function assertCompleteShirtInk(label) {
  const uv=label.geometry.attributes.uv,size=128,coverage=new Uint8Array(size*size);
  for(let i=0;i<uv.count;i+=3) {
    const p=[0,1,2].map(j=>({x:uv.getX(i+j),y:uv.getY(i+j)})),[a,b,c]=p;
    const determinant=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
    if(Math.abs(determinant)<1e-9)continue;
    const minX=Math.max(0,Math.floor(Math.min(...p.map(v=>v.x))*size));
    const maxX=Math.min(size,Math.ceil(Math.max(...p.map(v=>v.x))*size));
    const minY=Math.max(0,Math.floor(Math.min(...p.map(v=>v.y))*size));
    const maxY=Math.min(size,Math.ceil(Math.max(...p.map(v=>v.y))*size));
    for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++) {
      const px=(x+.5)/size-a.x,py=(y+.5)/size-a.y;
      const u=(px*(c.y-a.y)-py*(c.x-a.x))/determinant;
      const v=((b.x-a.x)*py-(b.y-a.y)*px)/determinant;
      if(u>=0 && v>=0 && u+v<=1)coverage[y*size+x]=1;
    }
  }
  const image=label.material.map.image,ink=[0,0],covered=[0,0];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const tx=Math.floor((x+.5)/size*image.width),ty=Math.floor((y+.5)/size*image.height);
    if(image.data[(ty*image.width+tx)*4+3]<128)continue;
    const region=y>size*.62?0:1;
    ink[region]++;covered[region]+=coverage[y*size+x];
  }
  for(let i=0;i<2;i++)assert.ok(covered[i]/ink[i]>.99,`${label.name}: ${i?'number':'name'} cannot lose letters at shoulder skin boundaries`);
}

for(const filename of ['model.glb','game.glb']) {
const athletePath=new URL(`../artifacts/tripo/athlete-rig/${filename}`,import.meta.url);
test(`actual Tripo ${filename} faces the hoop at adult scale, walks forward and releases through real hands`, {
  skip:!existsSync(athletePath),
},async()=>{
  const bytes=readFileSync(athletePath);
  // Node has no browser image decoder. The actual mesh, bind matrices, joint
  // hierarchy, weights and material bindings pass through the production loader.
  const savedSelf=globalThis.self,savedDecoder=globalThis.createImageBitmap;
  let decoded=0,closed=0,asset;
  globalThis.self=globalThis;
  globalThis.createImageBitmap=async blob=>{
    assert.ok(blob.size>0 && /^image\//.test(blob.type));
    decoded++;
    return {width:2048,height:2048,close(){closed++;}};
  };
  const {loadHoopsTripoCharacter}=await import('../src/hoops-tripo-character.js');
  const shooter=createHoopsShooter();
  const bone=suffix=>{
    let found;asset.group.traverse(object=>{if(object.isBone && object.name.endsWith(suffix))found=object;});
    assert.ok(found,suffix);return found;
  };
  const position=suffix=>bone(suffix).getWorldPosition(new THREE.Vector3());
  try {
    asset=await loadHoopsTripoCharacter(bytes,{name:'真实运动员'});
    assert.equal(decoded,3,'embedded material textures go through the real local loader');
    assert.equal(asset.rigged,true);
    const labels=['front','back'].map(side=>asset.group.getObjectByName(`tripo-jersey-${side}`));
    assert.ok(labels.every(label=>label?.isSkinnedMesh),'both sides of the actual shirt need skinned lettering');
    for(const [side,label] of labels.entries()) {
      assert.deepEqual(label.userData.jersey,{name:'Tripo',number:'3',side:side?'back':'front'});
      assert.equal(label.skeleton,label.parent.skeleton,'lettering follows the original shirt skin');
      assert.equal(label.material.color.getHexString(),'ffffff');
      assert.ok(label.material.map.isDataTexture,'lettering must work without DOM/canvas');
      assertCompleteShirtInk(label);
      const texture=label.material.map.image;
      let namePixels=0,numberPixels=0;
      for(let y=0;y<texture.height;y++)for(let x=0;x<texture.width;x++) {
        const alpha=texture.data[(y*texture.width+x)*4+3];
        if(alpha>128){if(y>texture.height*.62)namePixels++;else numberPixels++;}
        if(x===0||y===0||x===texture.width-1||y===texture.height-1)assert.equal(alpha,0);
      }
      assert.ok(namePixels>400 && numberPixels>1000,'both the name and number must contain visible ink');
      const vertex=new THREE.Vector3(),original=new THREE.Vector3();
      const uv=label.geometry.attributes.uv;
      for(const pose of [{action:0},{action:HOOPS_RELEASE_ACTION},{action:.75,move:1,time:.2}]) {
        asset.update(pose);
        for(let i=0;i<label.geometry.attributes.position.count;i++) {
          const sourceIndex=label.geometry.userData.sourceVertices[i];
          label.getVertexPosition(i,vertex).applyMatrix4(label.matrixWorld);
          label.parent.getVertexPosition(sourceIndex,original).applyMatrix4(label.parent.matrixWorld);
          assert.ok(vertex.distanceTo(original)<.003,'shirt ink cannot float or separate during a throw');
          for(let component=0;component<4;component++) {
            assert.equal(label.geometry.attributes.skinIndex.getComponent(i,component),
              label.parent.geometry.attributes.skinIndex.getComponent(sourceIndex,component));
            assert.equal(label.geometry.attributes.skinWeight.getComponent(i,component),
              label.parent.geometry.attributes.skinWeight.getComponent(sourceIndex,component));
          }
          if(pose.action===0 && uv.getX(i)>0 && uv.getX(i)<1 && uv.getY(i)>0 && uv.getY(i)<1) {
            const tx=Math.floor(uv.getX(i)*texture.width),ty=Math.floor(uv.getY(i)*texture.height);
            if(texture.data[(ty*texture.width+tx)*4+3]<128)continue;
            assert.ok(vertex.y>1.075 && vertex.y<1.44,'ink must stay below the neckline and above the waist');
            assert.ok((side?1:-1)*(vertex.z+.015)>.055,'front/back ink must sit on the corresponding shirt surface');
          }
        }
      }
    }
    asset.update();
    const right=position('RightArm').sub(position('LeftArm')).normalize();
    assert.ok(right.x>.99 && Math.abs(right.z)<.05,'exported +X facing must be normalized, not assumed to be +Z');
    const standing=new THREE.Box3().setFromObject(asset.group,true);
    assert.ok(standing.max.y>1.7 && standing.max.y<1.9,'T-pose arm span must not shrink the body as depth');
    assert.ok(Math.abs(standing.min.y)<.025);
    const foot=position('LeftFoot');
    assert.ok(position('LeftToeBase').z<foot.z-.035,'toes face the same direction as the shot');
    asset.update({move:1,time:.1});
    const stepA=position('LeftFoot');
    asset.update({move:1,time:.3});
    const stepB=position('LeftFoot');
    assert.ok(Math.abs(stepB.z-stepA.z)>.15,'real legs must step along the court');
    assert.ok(Math.abs(stepB.x-stepA.x)<.1,'a foreign bone basis must not turn walking into lateral kicks');
    shooter.installTripoCharacter(asset);shooter.setCharacter('tripo');
    for(const [width,height] of [[284,600],[1100,790]])for(const player of [{x:0,z:5.6},{x:0,z:-2.6},{x:-5.3,z:8.2}]) {
      shooter.update({origin:courtFrame(player).origin,velocity:velocityFromCourtAim({x:0,power:.6},player)});
      const camera=createHoopsCamera(width,height,{player});
      const bounds=new THREE.Box3().setFromObject(asset.group,true),center=bounds.getCenter(new THREE.Vector3());
      const feet=new THREE.Vector3(center.x,bounds.min.y,center.z).project(camera);
      const head=new THREE.Vector3(center.x,bounds.max.y,center.z).project(camera);
      assert.ok((head.y-feet.y)/2>=.23,'actual Tripo body, not just a placeholder envelope, needs screen presence');
    }
    for(const velocity of [{x:0,y:9,z:-5},{x:-5,y:9,z:-2},{x:2,y:9,z:5}]) {
      const origin={x:4,y:1.45,z:-1};
      const ready=shooter.update({origin,velocity,action:0}).clone();
      const release=shooter.update({origin,velocity,action:HOOPS_RELEASE_ACTION}).clone();
      assert.ok(release.distanceTo(origin)<1e-5,'skin handoff must match the real physics launch');
      assert.ok(release.y-ready.y>.3);
      const palms=position('LeftHand').add(position('RightHand')).multiplyScalar(.5);
      assert.ok(palms.distanceTo(release)<1e-6);
      const snapshot=position('LeftHand');
      shooter.update({origin,velocity,action:HOOPS_RELEASE_ACTION});
      assert.ok(position('LeftHand').distanceTo(snapshot)<1e-7);
    }
    const resources=new Set();
    asset.group.traverse(object=>{
      if(object.geometry)resources.add(object.geometry);
      for(const material of [object.material].flat().filter(Boolean)) {
        resources.add(material);
        for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
      }
    });
    let disposed=0;resources.forEach(resource=>resource.addEventListener('dispose',()=>disposed++));
    shooter.dispose();shooter.dispose();
    assert.equal(disposed,resources.size);
    assert.equal(closed,decoded,'decoded images are owned along with their textures');
  } finally {
    shooter.dispose();asset?.dispose();
    if(savedSelf===undefined)delete globalThis.self;else globalThis.self=savedSelf;
    if(savedDecoder===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=savedDecoder;
  }
});
}
