import * as THREE from 'three';
import {createSportAvatar,SPORT_CHARACTERS} from './sport-avatar.js';
import {BALL_START,HOOPS_RELEASE_ACTION,velocityFromAim,courtFrame,velocityFromCourtAim} from './hoops-physics.js';

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


export const HOOPS_VIEWS=Object.freeze([
  Object.freeze({id:'court',label:'人物视角'}),
]);
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const BALL_RADIUS = 0.2;
const RIM_RADIUS = 0.48;
const RIM_TUBE_RADIUS = 0.035;
const HOOP_START = { x: 0, y: 3.35, z: -3 };
const CAMERA_FOV=56;
const PALETTE = {
  teal: '#426961',
  deepTeal: '#283732',
  mint: '#aeb5a5',
  coral: '#8f5541',
  coralDark: '#4a4d46',
  cream: '#e3e1d3',
};

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Periodic aggregate at three scales: color, micro-relief and roughness are
 * independent material channels. No images or network resources are required. */
export function createHoopsSurfaceTextures({size=256}={}) {
  size=2**Math.round(Math.log2(THREE.MathUtils.clamp(Number.isFinite(size)?size:256,64,512)));
  const random=seededRandom(54271),count=size*size;
  const height=new Float32Array(count),color=new Uint8Array(count*4),roughness=new Uint8Array(count*4);
  const normal=new Uint8Array(count*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=y*size+x,grain=random()-.5;
    const broad=Math.sin(x/size*TAU*3+.4*Math.cos(y/size*TAU*2))*Math.cos(y/size*TAU*4);
    const weather=Math.sin((x+y)/size*TAU)*Math.sin((x-y)/size*TAU*2);
    const pit=random()<.025?-.5:0;
    height[i]=grain*.5+broad*.12+weather*.08+pit*.2;
    const value=Math.round(225+grain*32+broad*7+weather*8+pit*48);
    color.set([value,value,value,255],i*4);
    const rough=Math.round(212+grain*42+weather*12+pit*18);
    roughness.set([rough,rough,rough,255],i*4);
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const dx=height[y*size+(x+1)%size]-height[y*size+(x+size-1)%size];
    const dy=height[((y+1)%size)*size+x]-height[((y+size-1)%size)*size+x];
    const n=new THREE.Vector3(-dx*.9,-dy*.9,1).normalize();
    normal.set([Math.round((n.x+1)*127.5),Math.round((n.y+1)*127.5),Math.round((n.z+1)*127.5),255],(y*size+x)*4);
  }
  const texture=(data,srgb=false)=>{
    const map=new THREE.DataTexture(data,size,size);
    map.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;
    map.magFilter=THREE.LinearFilter;map.minFilter=THREE.LinearMipmapLinearFilter;
    map.generateMipmaps=true;map.needsUpdate=true;
    return map;
  };
  const map=texture(color,true),roughnessMap=texture(roughness),normalMap=texture(normal);
  let disposed=false;
  return {map,roughnessMap,normalMap,dispose(){
    if(disposed)return;
    disposed=true;map.dispose();roughnessMap.dispose();normalMap.dispose();
  }};
}

function validPoint(point) {
  return point && Number.isFinite(point.x)
    && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function applyCourtCamera(camera, {player,hoop=HOOP_START}={}) {
  const position=player && Number.isFinite(player.x) && Number.isFinite(player.z)?player:BALL_START;
  const forward=new THREE.Vector3(hoop.x-position.x,0,hoop.z-position.z);
  const span=forward.length();
  if(span<1e-6)forward.set(0,0,-1);else forward.divideScalar(span);
  const right=new THREE.Vector3(-forward.z,0,forward.x);
  const shoulder=THREE.MathUtils.clamp(camera.aspect*1.1,.5,1.6);
  const target=new THREE.Vector3(position.x,1.75+.4*(1-Math.min(span/5,1)),position.z)
    .addScaledVector(forward,Math.min(span*.45,3.5));
  const points=[];
  for(const x of [-.7,.7])for(const y of [-.04,2.05])for(const z of [-.7,.7])
    points.push(new THREE.Vector3(position.x+x,y,position.z+z));
  for(const x of [-1,1])for(const y of [0,1.35])for(const z of [-.75,.2])
    points.push(new THREE.Vector3(hoop.x+x,hoop.y+y,hoop.z+z));
  // Preserve a substantial full-body player in the foreground. Only a small
  // retreat is needed near the basket; the camera never surveys the whole park.
  for(let behind=4.5;behind<=7.5;behind+=.15) {
    camera.position.set(position.x,2.7,position.z).addScaledVector(forward,-behind).addScaledVector(right,shoulder);
    camera.lookAt(target);camera.updateMatrixWorld(true);
    if(points.every(point=>{
      const p=point.clone().project(camera);
      return Math.abs(p.x)<.91 && p.y>-.87 && p.y<.91 && p.z<1;
    }))break;
  }
}

export function createHoopsCamera(width=390,height=844,{player,hoop=HOOP_START}={}) {
  const camera=new THREE.PerspectiveCamera(CAMERA_FOV,width/height,.1,150);
  applyCourtCamera(camera,{player,hoop});
  return camera;
}

// A small separate rig avoids a head/torso blocking the eye-level view. Its
// returned grip is the ball center; it never changes the real release physics.
export function createHoopsHands({character='moss'}={}) {
  const group=new THREE.Group();
  group.name='basketball-first-person-hands';
  const resources=new Set(),keep=resource=>(resources.add(resource),resource);
  const skin=keep(new THREE.MeshStandardMaterial({roughness:.76}));
  const kit=keep(new THREE.MeshStandardMaterial({roughness:.8}));
  const cylinder=keep(new THREE.CylinderGeometry(1,1,1,10));
  const palmGeometry=keep(new THREE.SphereGeometry(.09,12,8));
  const thumbGeometry=keep(new THREE.SphereGeometry(.043,8,6));
  const ready=new THREE.Vector3(0,1,5.2),release=new THREE.Vector3().copy(BALL_START);
  const follow=new THREE.Vector3(0,1.62,5.42),grip=ready.clone(),worldGrip=ready.clone();
  const direction=new THREE.Vector3(),wrist=new THREE.Vector3(),cuff=new THREE.Vector3();
  let disposed=false;
  function mesh(geometry,material,name) {
    const object=new THREE.Mesh(geometry,material);
    object.name=name; object.castShadow=true; object.receiveShadow=true;
    group.add(object);
    return object;
  }
  const arms=[-1,1].map(side=>{
    const name=side<0?'left':'right';
    const hand=mesh(palmGeometry,skin,`fp-${name}-hand`);
    hand.scale.set(.9,1,1.25);
    return {side,anchor:new THREE.Vector3(side*.55,.5,6.15),
      hand,thumb:mesh(thumbGeometry,skin,`fp-${name}-thumb`),
      sleeve:mesh(cylinder,kit,`fp-${name}-sleeve`),forearm:mesh(cylinder,skin,`fp-${name}-forearm`)};
  });
  function segment(object,from,to,radius) {
    direction.subVectors(to,from);
    object.position.copy(from).addScaledVector(direction,.5);
    object.scale.set(radius,direction.length(),radius);
    object.quaternion.setFromUnitVectors(UP,direction.normalize());
  }
  const ease=t=>t*t*(3-2*t);
  function update({action=0,origin=BALL_START,velocity}={}) {
    if(disposed)return worldGrip;
    const progress=THREE.MathUtils.clamp(Number.isFinite(action)?action:0,0,1);
    if(progress<=HOOPS_RELEASE_ACTION)grip.lerpVectors(ready,release,ease(progress/HOOPS_RELEASE_ACTION));
    else if(progress<.7)grip.lerpVectors(release,follow,ease((progress-HOOPS_RELEASE_ACTION)/(.7-HOOPS_RELEASE_ACTION)));
    else grip.lerpVectors(follow,ready,ease((progress-.7)/.3));
    for(const arm of arms) {
      arm.hand.position.copy(grip); arm.hand.position.x+=arm.side*.21;
      arm.hand.rotation.set(-.25,-arm.side*.25,arm.side*.16);
      arm.thumb.position.copy(arm.hand.position).add(new THREE.Vector3(-arm.side*.055,-.07,-.02));
      wrist.copy(arm.hand.position); wrist.z+=.075;
      cuff.lerpVectors(arm.anchor,wrist,.35);
      segment(arm.sleeve,arm.anchor,cuff,.105);
      segment(arm.forearm,cuff,wrist,.071);
    }
    const yaw=validPoint(velocity)?Math.atan2(-velocity.x,-velocity.z):0;
    group.rotation.y=yaw;
    group.position.copy(BALL_START).applyAxisAngle(UP,yaw).negate().add(validPoint(origin)?origin:BALL_START);
    group.updateMatrixWorld(true);
    return group.localToWorld(worldGrip.copy(grip));
  }
  function setCharacter(id) {
    if(disposed)return;
    const selected=SPORT_CHARACTERS.find(item=>item.id===id)||SPORT_CHARACTERS[0];
    group.userData.character=selected.id;
    kit.color.set(selected.color);
    skin.color.set(selected.id==='robot'?'#c4d1cd':selected.id==='peach'?'#e6c19c':'#efcfa9');
  }
  setCharacter(character); update();
  return {group,update,setCharacter,dispose() {
    if(disposed)return;
    disposed=true; group.removeFromParent(); group.clear();
    for(const resource of resources)resource.dispose();
    resources.clear();
  }};
}

// Keep the feet on the court and calibrate the release pose to the unchanged
// physics origin. This also works when a character's proportions change.
export function createHoopsShooter({character='moss'}={}) {
  const group=new THREE.Group();
  group.name='basketball-avatar';
  const original=createSportAvatar({sport:'basketball',character});
  original.group.name='basketball-procedural-avatar';
  group.add(original.group);
  group.userData.character=original.group.userData.character;
  let avatar=original,tripo=null,lastPose={};
  const grip=new THREE.Vector3(),releaseGrip=new THREE.Vector3();
  let disposed=false;
  function calibrate() {
    group.position.set(0,0,0);
    group.rotation.set(0,0,0);
    group.scale.setScalar(1);
    group.updateMatrixWorld(true);
    avatar.update({action:HOOPS_RELEASE_ACTION});
    avatar.getGripPosition(releaseGrip);
    group.scale.setScalar(BALL_START.y/releaseGrip.y);
    releaseGrip.multiplyScalar(group.scale.x);
  }
  function update({time=0,action=0,aim={},origin=BALL_START,velocity=velocityFromAim(aim),move=0}={}) {
    if(disposed)return grip;
    if(!validPoint(origin))origin=BALL_START;
    if(!validPoint(velocity))velocity=velocityFromAim(aim);
    lastPose={time,action,aim,origin,velocity,move};
    group.rotation.y=Math.atan2(-velocity.x,-velocity.z);
    grip.copy(releaseGrip).applyAxisAngle(UP,group.rotation.y);
    group.position.set(origin.x-grip.x,origin.y-BALL_START.y,origin.z-grip.z);
    group.updateMatrixWorld(true);
    avatar.update({time,move,action});
    return avatar.getGripPosition(grip);
  }
  function setCharacter(id) {
    if(disposed || id==='tripo'&&!tripo || id!=='tripo'&&!SPORT_CHARACTERS.some(item=>item.id===id))return false;
    if(id!=='tripo')original.setCharacter(id);
    avatar=id==='tripo'?tripo:original;
    original.group.visible=avatar===original;
    if(tripo)tripo.group.visible=avatar===tripo;
    group.userData.character=id;
    calibrate();update(lastPose);
    return true;
  }
  calibrate();update();
  return {
    group,update,setCharacter,
    installTripoCharacter(asset) {
      if(disposed){asset.dispose();return false;}
      const selected=group.userData.character==='tripo';
      tripo?.dispose();tripo=asset;group.add(asset.group);asset.group.visible=false;
      if(selected)setCharacter('tripo');
      return true;
    },
    getTripoCharacter:()=>tripo?{name:tripo.name,rigged:tripo.rigged}:null,
    dispose() {
      if(disposed)return;
      disposed=true;original.dispose();tripo?.dispose();tripo=null;group.removeFromParent();group.clear();
    },
  };
}

/**
 * Rendering only. The held ball follows the avatar; airborne positions and
 * trajectory samples come directly from physics.
 * No animation loop or input handlers. Model loading is explicit and local.
 */
export function createHoopsScene(canvas,{character='moss',view='court',tripoTree=null}={}) {
  const resources = new Set();
  const keep = (resource) => { resources.add(resource); return resource; };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d6c5ac');
  scene.fog = new THREE.Fog('#d6c5ac', 42, 130);
  let viewId=HOOPS_VIEWS.some(item=>item.id===view)?view:'court';
  const camera = createHoopsCamera(390,844,{view:viewId});
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  canvas[RENDERER_OWNER]=renderer;
  let disposed=false;
  const cleanupTasks=[];
  function dispose() {
    if(disposed)return;
    disposed=true;
    try {
      cleanupTasks.forEach(cleanup=>cleanup());
      cleanupTasks.length=0;
      scene.environment=null;scene.clear();
      for(const resource of resources)resource.dispose();
      resources.clear();
    } finally {releaseRenderer(renderer,canvas);}
  }
  try {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const ownerWindow = canvas.ownerDocument?.defaultView ?? globalThis.window;
  const motionQuery = ownerWindow?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery?.matches ?? false;
  let width = 1;
  let height = 1;
  let elapsed = 0;
  let cameraImpulse = 0;
  let netStretch = 0;
  let netVelocity = 0;
  let netSide = 0;
  let netFlash = 0;
  let lastBallValid = false;
  let trajectoryWasVisible = false;
  let lastPresentation = null;
  let tripoRequest = 0;
  let treeRequest=0,treeAsset=null,treeAbort=null;
  let treeMeshes=[];
  const lastBall = new THREE.Vector3();
  const random = seededRandom(92626);
  const scratch = new THREE.Vector3();
  const scratch2 = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const dummy = new THREE.Object3D();
  const projected = new THREE.Vector3();
  const hoopPosition = new THREE.Vector3().copy(HOOP_START);
  const shooter=createHoopsShooter({character});
  cleanupTasks.push(()=>shooter.dispose(),()=>{
    treeAbort?.abort();treeRequest++;clearTripoTrees();lastPresentation=null;
  });
  scene.add(shooter.group);

  function material(color, extra = {}) {
    return keep(new THREE.MeshStandardMaterial({ color, roughness: 0.78, ...extra }));
  }

  function basic(color, extra = {}) {
    return keep(new THREE.MeshBasicMaterial({ color, ...extra }));
  }

  function mesh(parent, geometry, surface, position = [0, 0, 0], shadows = false) {
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(...position);
    object.castShadow = shadows;
    object.receiveShadow = shadows;
    parent.add(object);
    return object;
  }

  const cube = keep(new THREE.BoxGeometry(1, 1, 1));
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 10));

  function box(parent, size, surface, position, shadows = false) {
    const object = mesh(parent, cube, surface, position, shadows);
    object.scale.set(...size);
    return object;
  }

  function groundRect(parent, x, z, w, d, surface, y = 0.012) {
    let geometry=plane;
    if(surface.normalMap) {
      geometry=keep(new THREE.PlaneGeometry(w,d,Math.min(64,Math.ceil(w/1.5)),Math.min(64,Math.ceil(d/1.5))));
      const positions=geometry.attributes.position,uv=geometry.attributes.uv;
      const colors=new Float32Array(positions.count*3);
      // One repeat is 1.5 metres on every painted area, including the key.
      for(let i=0;i<uv.count;i++) {
        const wx=positions.getX(i)+x,wz=-positions.getY(i)+z;
        uv.setXY(i,wx/1.5,wz/1.5);
        const wear=Math.exp(-(wx*wx+(wz-.9)**2)/12)*.08;
        const mottling=Math.sin(wx*.73+wz*.25)*Math.cos(wz*.62)*.024
          +Math.sin(wx*1.9-wz*.6)*.012;
        const shade=.96-wear+mottling;
        colors.set([shade,shade,shade],i*3);
      }
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    }
    const object = mesh(parent, geometry, surface, [x, y, z]);
    object.rotation.x = -Math.PI / 2;
    if(geometry===plane)object.scale.set(w, d, 1);
    object.receiveShadow = true;
    return object;
  }

  function beam(parent, a, b, radius, surface, shadows = false) {
    const object = mesh(parent, cylinder, surface, [0, 0, 0], shadows);
    scratch.set(...b).sub(scratch2.set(...a));
    object.position.copy(scratch2).addScaledVector(scratch, 0.5);
    object.scale.set(radius, scratch.length(), radius);
    object.quaternion.setFromUnitVectors(UP, scratch.normalize());
    return object;
  }

  // Court and basketball textures are local; imported models keep their own PBR maps.
  function dataTexture(sizeX, sizeY, paint, color = true) {
    const data = new Uint8Array(sizeX * sizeY * 4);
    for (let y = 0; y < sizeY; y += 1) {
      for (let x = 0; x < sizeX; x += 1) {
        paint(data, (y * sizeX + x) * 4, x, y, sizeX, sizeY);
      }
    }
    const texture = keep(new THREE.DataTexture(data, sizeX, sizeY));
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  }

  const grain = dataTexture(128, 128, (data, i) => {
    const value = 221 + Math.floor(random() * 34);
    data.set([value, value, value, 255], i);
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.repeat.set(20, 24);
  const surfaceTextures=createHoopsSurfaceTextures({size:512});
  for(const map of [surfaceTextures.map,surfaceTextures.normalMap,surfaceTextures.roughnessMap]) {
    keep(map);map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  }
  const glowTexture = dataTexture(64, 64, (data, i, x, y, w, h) => {
    const r = Math.hypot((x + 0.5) / w * 2 - 1, (y + 0.5) / h * 2 - 1);
    data.set([255, 255, 255, Math.round(Math.max(0, 1 - r * r) ** 3 * 255)], i);
  });
  const ballMap = dataTexture(512, 256, (data, i, x, y, w, h) => {
    const u = (x + 0.5) / w * TAU;
    const v = (y + 0.5) / h * Math.PI;
    const nx = -Math.cos(u) * Math.sin(v);
    const ny = -Math.cos(v);
    const nz = Math.sin(u) * Math.sin(v);
    const seamDistance = Math.min(Math.abs(nx), Math.abs(ny),
      Math.abs(0.78 * nz + 0.6 * (2 * nx * nx - 1)));
    const seam = THREE.MathUtils.smoothstep(seamDistance, 0.012, 0.026);
    const speckle = random() * 13 - 6;
    const panelShade = 6 * Math.sin(u * 3) * Math.sin(v * 2);
    data.set([
      Math.round(THREE.MathUtils.lerp(35, 190 + panelShade + speckle, seam)),
      Math.round(THREE.MathUtils.lerp(27, 96 + panelShade + speckle, seam)),
      Math.round(THREE.MathUtils.lerp(20, 35 + speckle, seam)),
      255,
    ], i);
  });
  ballMap.wrapS = THREE.RepeatWrapping;
  ballMap.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const ballBump = dataTexture(512, 256, (data, i, x, y, w, h) => {
    const row = Math.floor(y / 3);
    const dx = ((x + (row % 2) * 1.5) % 3) - 1.5;
    const dy = (y % 3) - 1.5;
    const u=(x+.5)/w*TAU,v=(y+.5)/h*Math.PI;
    const nx=-Math.cos(u)*Math.sin(v),ny=-Math.cos(v),nz=Math.sin(u)*Math.sin(v);
    const seam=Math.min(Math.abs(nx),Math.abs(ny),Math.abs(.78*nz+.6*(2*nx*nx-1)));
    const value = seam<.018?32:Math.round(105 + 98 * Math.max(0, 1 - Math.hypot(dx, dy) / 1.8));
    data.set([value, value, value, 255], i);
  }, false);
  ballBump.wrapS = ballBump.wrapT = THREE.RepeatWrapping;
  const environmentData=new Uint8Array(128*64*4);
  const sunDirection=new THREE.Vector3(-24,15,-18.5).normalize();
  const skyColor=new THREE.Color('#b3c4d2'),groundColor=new THREE.Color('#6d6855');
  for(let y=0;y<64;y++)for(let x=0;x<128;x++) {
    const phi=(x+.5)/128*TAU,theta=(y+.5)/64*Math.PI;
    const direction=new THREE.Vector3(-Math.cos(phi)*Math.sin(theta),Math.cos(theta),Math.sin(phi)*Math.sin(theta));
    const color=groundColor.clone().lerp(skyColor,THREE.MathUtils.smoothstep(direction.y,-.12,.45));
    const sun=Math.pow(Math.max(0,direction.dot(sunDirection)),180)*.8;
    environmentData.set([Math.min(255,(color.r+sun)*255),Math.min(255,(color.g+sun*.76)*255),
      Math.min(255,(color.b+sun*.48)*255),255],(y*128+x)*4);
  }
  const environment=keep(new THREE.DataTexture(environmentData,128,64));
  environment.mapping=THREE.EquirectangularReflectionMapping;
  environment.needsUpdate=true;scene.environment=environment;scene.environmentIntensity=.72;

  // A large, camera-independent gradient dome preserves the horizon on resize.
  const skyMaterial = keep(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      horizon: { value: new THREE.Color('#ead5b4') },
      middle: { value: new THREE.Color('#aebbc9') },
      zenith: { value: new THREE.Color('#7394b7') },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 horizon;
      uniform vec3 middle;
      uniform vec3 zenith;
      varying vec3 vDirection;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
          mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
      }
      void main() {
        vec3 direction=normalize(vDirection);
        float h = direction.y;
        vec3 color = mix(horizon, middle, smoothstep(-0.05, 0.35, h));
        color = mix(color, zenith, smoothstep(0.24, 0.85, h));
        vec2 uv=direction.xz/max(.2,h)*2.5;
        float clouds=noise(uv)*.55+noise(uv*2.1)*.28+noise(uv*4.3)*.12;
        float alpha=smoothstep(.48,.73,clouds)*smoothstep(.04,.18,h)*.7;
        color=mix(color,vec3(.86,.79,.66),alpha);
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  mesh(scene, keep(new THREE.SphereGeometry(110, 32, 16)), skyMaterial);
  const sunPosition=sunDirection.clone().multiplyScalar(95);
  const sun = mesh(scene, keep(new THREE.CircleGeometry(.62, 48)),
    basic('#fff6df', { fog: false, toneMapped: false }), sunPosition.toArray());
  sun.lookAt(0,0,0);
  const sunHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({
    map: glowTexture, color: '#ffe3b5', opacity: 0.2, depthWrite: false,
    fog: false, toneMapped: false,
  })));
  // Sprite's default geometry is shared globally; own a copy for safe cleanup.
  sunHalo.geometry = keep(sunHalo.geometry.clone());
  sunHalo.position.copy(sunPosition);
  sunHalo.scale.set(9, 9, 1);
  scene.add(sunHalo);

  const hemi = new THREE.HemisphereLight('#bbcde1', '#807455', .95);
  scene.add(hemi);
  const sunlight = new THREE.DirectionalLight('#ffd2a0', 3.1);
  cleanupTasks.push(()=>sunlight.shadow.dispose());
  sunlight.position.set(-24,15,-17);
  sunlight.target.position.set(0, 0, 1.5);
  sunlight.castShadow = true;
  const shadowSize=Math.min(2048,renderer.capabilities.maxTextureSize||2048);
  sunlight.shadow.mapSize.set(shadowSize,shadowSize);
  Object.assign(sunlight.shadow.camera, {
    left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 65,
  });
  sunlight.shadow.normalBias = 0.012;
  sunlight.shadow.bias = -0.00012;
  sunlight.shadow.radius = 3;
  scene.add(sunlight, sunlight.target);
  const fill = new THREE.DirectionalLight('#c1cedc', .35);
  fill.position.set(6, 6, -7);
  scene.add(fill);

  const cream = material(PALETTE.cream);
  const floorMaterial=color=>material(color,{map:surfaceTextures.map,
    normalMap:surfaceTextures.normalMap,normalScale:new THREE.Vector2(.62,.62),vertexColors:true,
    roughnessMap:surfaceTextures.roughnessMap,roughness:1,metalness:0});
  const teal = floorMaterial(PALETTE.teal);
  const deepTeal = material(PALETTE.deepTeal);
  const coral = floorMaterial(PALETTE.coral);
  const coralDark = material(PALETTE.coralDark);
  const mint = material(PALETTE.mint);
  const pavement = floorMaterial('#77766e');
  const court = new THREE.Group();
  scene.add(court);
  groundRect(scene, 0, 0, 180, 180, pavement, -0.17);
  box(court, [14.05, 0.15, 16.4], coralDark, [0, -0.095, 1.5], true);
  groundRect(court, 0, 1.5, 13.8, 16.15, teal, 0).name='court-playing-surface';
  groundRect(court, 0, -2.4, 3.8, 6.6, coral, 0.006);
  groundRect(court, 0, -5.95, 11.7, 0.5, deepTeal, 0.007);
  groundRect(court, -6.35, 1.5, 0.22, 15.5, coral, 0.007);
  groundRect(court, 6.35, 1.5, 0.22, 15.5, coral, 0.007);

  function floorLine(x1, z1, x2, z2, thickness = 0.045, surface = cream) {
    const line = groundRect(court, (x1 + x2) / 2, (z1 + z2) / 2,
      thickness, Math.hypot(x2 - x1, z2 - z1), surface);
    line.rotation.z = Math.atan2(x2 - x1, z2 - z1);
    return line;
  }

  function floorArc(cx, cz, radius, start, end, thickness = 0.045, surface = cream) {
    const points = [];
    const segments = Math.ceil(Math.abs(end - start) * radius * 10);
    const vertices = [];
    for (let i = 0; i <= segments; i += 1) {
      const a = THREE.MathUtils.lerp(start, end, i / segments);
      points.push([Math.sin(a), Math.cos(a)]);
    }
    for (let i = 0; i < segments; i += 1) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const r0 = radius - thickness / 2;
      const r1 = radius + thickness / 2;
      vertices.push(
        cx + ax * r0, 0.013, cz + az * r0,
        cx + ax * r1, 0.013, cz + az * r1,
        cx + bx * r1, 0.013, cz + bz * r1,
        cx + ax * r0, 0.013, cz + az * r0,
        cx + bx * r1, 0.013, cz + bz * r1,
        cx + bx * r0, 0.013, cz + bz * r0,
      );
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    mesh(court, geometry, surface).receiveShadow = true;
  }

  for (const x of [-5.7, 5.7]) floorLine(x, -5.7, x, 8.55);
  for (const z of [-5.7, 8.55]) floorLine(-5.7, z, 5.7, z);
  for (const x of [-1.9, 1.9]) {
    floorLine(x, -5.7, x, 0.9);
    for (let z = -3.8; z < -0.8; z += 0.8) {
      floorLine(x, z, x + Math.sign(x) * 0.26, z, 0.06);
    }
  }
  floorLine(-1.9, 0.9, 1.9, 0.9);
  floorArc(0, 0.9, 1.9, -Math.PI / 2, Math.PI / 2);
  for (let a = Math.PI / 2; a < Math.PI * 1.5; a += 0.27) {
    floorArc(0, 0.9, 1.9, a, a + 0.13, 0.035);
  }
  floorArc(0, -3, 5.25, -Math.PI / 2, Math.PI / 2, 0.06);
  floorArc(0, -3, 1.15, -Math.PI / 2, Math.PI / 2, 0.04);
  for (const x of [-5.25, 5.25]) floorLine(x, -5.7, x, -3, 0.06);
  floorLine(-5.7, 7.6, 5.7, 7.6);
  floorArc(0, 7.6, 1.5, 0, TAU, 0.065);
  // Concrete apron, expansion joints and grass strips give the court a real site.
  const jointMaterial=material('#474a43',{roughness:1});
  for(let x=-21;x<=21;x+=3)groundRect(scene,x,0,.025,42,jointMaterial,-.162);
  for(let z=-21;z<=21;z+=3)groundRect(scene,0,z,42,.025,jointMaterial,-.161);
  const grass=floorMaterial('#46533a');
  for(const side of [-1,1]) {
    groundRect(scene,side*18,0,18,48,grass,-.15);
    box(scene,[.18,.18,19],pavement,[side*7.08,-.08,1.5],true);
  }
  groundRect(scene,0,-24,30,20,grass,-.15);

  // A loose park-edge neighborhood, with low brick buildings and distant
  // setbacks instead of an evenly spaced wall of matching towers.
  const skyline=new THREE.Group();skyline.name='park-neighborhood';scene.add(skyline);
  const buildingMaterials=['#997663','#c3b498','#948675','#b3a994','#87796c']
    .map(color=>material(color,{map:grain,roughness:.95}));
  const glass=['#4b595a','#61676a','#81796a'].map(color=>material(color,{metalness:.22,roughness:.31}));
  const stone=material('#bfb6a1',{roughness:.94}),slate=material('#585e5c',{roughness:.88});
  const roofVertices=[[-.5,0,.5],[.5,0,.5],[0,1,.5],[-.5,0,-.5],[.5,0,-.5],[0,1,-.5]];
  const roofFaces=[0,1,2,4,3,5,3,0,2,3,2,5,1,4,5,1,5,2];
  const roofGeometry=keep(new THREE.BufferGeometry());
  roofGeometry.setAttribute('position',new THREE.Float32BufferAttribute(roofFaces.flatMap(i=>roofVertices[i]),3));
  roofGeometry.computeVertexNormals();
  const blocks=[
    [-38,-43,8.5,6.2,3,0],[-27,-36,10,6.8,2,1],[-14,-44,7.2,7,4,2],
    [-3,-38,8,6.4,2,0],[11,-49,10.5,8,4,2],[24,-39,8.6,6.8,3,1],[38,-47,11,8,3,0],
  ];
  blocks.forEach(([x,z,w,d,floors,style],i)=>{
    const block=new THREE.Group();block.position.set(x,-.15,z);block.rotation.y=(i%3-1)*.07;skyline.add(block);
    const y=floors*2.95,wall=buildingMaterials[i%buildingMaterials.length];
    box(block,[w,y,d],wall,[0,y/2,0]);
    box(block,[w+.12,.32,d+.12],stone,[0,.16,0]);
    if(style<2) {
      const roof=mesh(block,roofGeometry,slate,[0,y,0]);
      roof.scale.set(w+.4,style===0?1.65:1.05,d+.4);
      box(block,[.6,1.8,.7],wall,[w*.27,y+.65,-d*.17]);
    } else {
      box(block,[w+.2,.23,d+.2],stone,[0,y,0]);
      box(block,[w*.58,2.2,d*.62],wall,[-w*.08,y+1.1,-d*.1]);
      box(block,[w*.61,.2,d*.65],stone,[-w*.08,y+2.2,-d*.1]);
    }
    const spacing=style===1?2.45:1.9,windowWidth=style===1?1.18:.83;
    for(let row=1.65;row<y-.45;row+=2.95) {
      for(let col=-w/2+1;col<w/2-.7;col+=spacing) {
        const surface=glass[Math.floor(random()*glass.length)];
        box(block,[windowWidth+.15,1.43,.11],stone,[col,row,d/2+.025]);
        box(block,[windowWidth,1.27,.03],surface,[col,row,d/2+.09]);
        box(block,[windowWidth+.24,.095,.28],stone,[col,row-.71,d/2+.1]);
      }
      for(let depth=-d/2+1;depth<d/2-.5;depth+=2.4)
        box(block,[.04,1.24,.82],glass[(i+1)%3],[w/2+.025,row,depth]);
    }
    box(block,[1.15,2.25,.06],glass[0],[.25,1.12,d/2+.09]);
  });
  for(const [x,z,y] of [[-24,-76,23],[30,-87,29]])for(let tier=0;tier<3;tier++)
    box(skyline,[14-tier*2.5,y/3,11-tier*1.8],buildingMaterials[2],
      [x+tier*.5,y/6+tier*y/3,z-tier*.7]);
  // Clouds are a soft density layer in the sky shader, not solid toy spheres.
  const cloudGroups = [];
  const fallbackTrees=new THREE.Group();
  fallbackTrees.name='court-fallback-trees';scene.add(fallbackTrees);
  const leafTexture=dataTexture(64,64,(data,i,x,y)=>{
    const u=(x-31.5)/31.5,v=(y-31.5)/31.5;
    const width=.67*Math.pow(Math.max(0,1-v*v),.8)*(1+.045*Math.sin(y*2.6));
    const edge=THREE.MathUtils.clamp((width-Math.abs(u))*40,0,1);
    const vein=Math.exp(-Math.abs(u)*80)*13;
    const shade=198+random()*35+vein;
    data.set([shade,Math.min(255,shade+12),shade-15,Math.round(edge*255)],i);
  });
  const foliageMaterial=material('#596b37',{map:leafTexture,alphaTest:.45,
    side:THREE.DoubleSide,roughness:.95,alphaToCoverage:true});
  const trunkMaterial = material('#54493a',{map:grain,roughness:1});
  const trees = [
    [-16, -16.8, 1.25], [16.5, -17.5, 1.3], [-18.3, -20.5, 1.45],
    [18, -21, 1.5], [-5.9, -18.8, 1.05], [5.9, -19.7, 1.15],
    [-16.8, 1, 1.1], [17.2, 1.5, 1.2], [-21, -25, 1.8], [22, -25, 1.6],
  ];
  const leaves=keep(new THREE.InstancedMesh(plane,foliageMaterial,trees.length*540));
  leaves.name='park-tree-leaves';leaves.castShadow=leaves.receiveShadow=true;
  const leafColor=new THREE.Color();
  let leafIndex=0;
  trees.forEach(([x, z, scale], i) => {
    const group = new THREE.Group();
    group.position.set(x, -0.12, z);
    group.scale.setScalar(scale);
    beam(group, [0, 0, 0], [0.06, 2.4, 0], 0.14, trunkMaterial, true);
    beam(group, [0, 1.35, 0], [-0.7, 2.25, 0.04], 0.085, trunkMaterial, true);
    beam(group,[0,1.8,0],[.7,2.65,-.3],.063,trunkMaterial,true);
    const crowns = [[0, 3.1, 0, 1.1], [-0.7, 2.6, .15, .9], [.7, 2.75, -.2, 1]];
    crowns.forEach(([cx, cy, cz, radius], j) => {
      beam(group,[0,1.7,0],[cx,cy+.25,cz],.032,trunkMaterial,true);
      for(let leaf=0;leaf<180;leaf++) {
        const azimuth=random()*TAU,elevation=random()*2-1,r=Math.cbrt(random())*radius;
        const radial=Math.sqrt(1-elevation*elevation);
        dummy.position.set(x+(cx+Math.cos(azimuth)*radial*r)*scale,
          -.12+(cy+elevation*r*.9)*scale,z+(cz+Math.sin(azimuth)*radial*r)*scale);
        const size=(.19+random()*.2)*scale;
        dummy.scale.set(size*.6,size,1);
        dummy.rotation.set(random()*TAU,random()*TAU,random()*TAU);
        dummy.updateMatrix();leaves.setMatrixAt(leafIndex,dummy.matrix);
        leafColor.setHSL(.22+random()*.04,.24+random()*.13,.47+random()*.2);
        leaves.setColorAt(leafIndex++,leafColor);
      }
    });
    fallbackTrees.add(group);
  });
  leaves.computeBoundingSphere();fallbackTrees.add(leaves);

  const fenceMaterial = material('#626b62', { metalness:.7,roughness:.48 });
  const fenceWire = material('#586359', { metalness:.55,roughness:.65 });
  const fence=new THREE.Group();fence.name='park-chainlink-fence';scene.add(fence);
  function fencePanel(ax,az,bx,bz) {
    const length=Math.hypot(bx-ax,bz-az),dx=(bx-ax)/length,dz=(bz-az)/length,top=2.8;
    const point=(distance,y)=>[ax+dx*distance,y,az+dz*distance];
    const posts=Math.ceil(length/2.6);
    for(let i=0;i<=posts;i++)beam(fence,point(i/posts*length,-.14),point(i/posts*length,top+.04),.033,fenceMaterial,true);
    for(const y of [.1,top])beam(fence,point(0,y),point(length,y),.027,fenceMaterial);
    for(let offset=-top;offset<length+top;offset+=.17)for(const direction of [-1,1]) {
      const low=Math.max(.14,direction===1?-offset:offset-length);
      const high=Math.min(top,direction===1?length-offset:offset);
      if(high>low)beam(fence,point(offset+direction*low,low),
        point(offset+direction*high,high),.0035,fenceWire);
    }
  }
  fencePanel(-14,-15,14,-15);
  fencePanel(-14,-15,-14,12);fencePanel(14,-15,14,12);
  const benchWood = material('#786049',{map:grain,roughness:.85});
  for (const side of [-1, 1]) {
    const bx = side * 15.5;
    for(let slat=0;slat<4;slat++) {
      box(scene,[1.9,.045,.105],benchWood,[bx,.46,-6.3-slat*.12],true);
      box(scene,[1.9,.105,.045],benchWood,[bx,.68+slat*.115,-6.77],true);
    }
    for (const dx of [-0.58, 0.58]) {
      box(scene, [.045,.58,.34], fenceMaterial, [bx + dx,.16,-6.5], true);
      beam(scene,[bx+dx,.12,-6.72],[bx+dx,1.05,-6.77],.025,fenceMaterial,true);
    }
    beam(scene, [side * 16, 0, -16], [side * 16, 5.9, -16], 0.075, deepTeal, true);
    beam(scene, [side * 16, 5.9, -16], [side * 15.35, 5.9, -16], 0.065, deepTeal);
    box(scene, [0.68, 0.11, 0.35], deepTeal, [side * 15.4, 5.88, -16]);
    box(scene, [0.53, 0.025, 0.25],
      material('#dadbd4',{metalness:.18,roughness:.4}), [side * 15.4, 5.81, -16]);
  }

  const hoopAssembly = new THREE.Group();
  hoopAssembly.name='basketball-hoop';
  hoopAssembly.position.copy(hoopPosition);
  scene.add(hoopAssembly);
  const poleMaterial = material('#3c4240', { metalness:.32,roughness:.48 });
  const steelMaterial=material('#a3aaa7',{metalness:.82,roughness:.31});
  const paddingMaterial=material('#273330',{roughness:.94});
  const rimMaterial = keep(new THREE.MeshPhysicalMaterial({
    color: '#c64c20', roughness:.48,metalness:.18,
    clearcoat:.18,emissive:'#b84416',emissiveIntensity:0,
  }));
  // This entire assembly translates with hoop. Board FRONT is exactly local z=-.62.
  box(hoopAssembly, [0.75, 0.12, 0.86], poleMaterial, [0, -3.29, -1.1], true);
  beam(hoopAssembly, [0, -3.23, -1.13], [0, 0.8, -1.13], 0.105, poleMaterial, true);
  beam(hoopAssembly, [0, 0.79, -1.13], [0, 0.79, -0.75], 0.1, poleMaterial, true);
  beam(hoopAssembly, [0, -0.1, -1.13], [0, 0.5, -0.75], 0.07, poleMaterial, true);
  box(hoopAssembly,[.36,1.35,.38],paddingMaterial,[0,-2.33,-1.1],true);
  for(const x of [-.27,.27])for(const z of [-1.38,-.84])
    mesh(hoopAssembly,keep(new THREE.CylinderGeometry(.024,.024,.035,6)),steelMaterial,[x,-3.205,z],true);
  for(const y of [-2.76,-1.89])
    box(hoopAssembly,[.37,.03,.39],poleMaterial,[0,y,-1.1]);
  const glassMaterial = keep(new THREE.MeshPhysicalMaterial({
    color:'#dce7e5',metalness:0,roughness:.09,
    transparent:true,opacity:.25,depthWrite:false,
    clearcoat:1,clearcoatRoughness:.06,envMapIntensity:1.4,side:THREE.DoubleSide,
  }));
  const board = box(hoopAssembly, [1.9, 1.4, 0.08], glassMaterial,
    [0, 0.6, -0.66]);
  board.name='basketball-backboard';
  board.renderOrder = 1;
  for (const x of [-0.918, 0.918]) {
    box(hoopAssembly, [0.064, 1.4, 0.09], steelMaterial, [x, 0.6, -0.665], true);
  }
  for (const y of [-0.068, 1.268]) {
    box(hoopAssembly, [1.9, 0.064, 0.09], steelMaterial, [0, y, -0.665], true);
  }
  for (const x of [-0.34, 0.34]) {
    box(hoopAssembly, [0.027, 0.5, 0.007], cream, [x, 0.3, -0.6165]);
  }
  for (const y of [0.05, 0.55]) {
    box(hoopAssembly, [0.707, 0.027, 0.007], cream, [0, y, -0.6165]);
  }
  for(const x of [-.72,.72])for(const y of [.05,1.14]) {
    const bolt=mesh(hoopAssembly,keep(new THREE.CylinderGeometry(.021,.021,.04,6)),
      steelMaterial,[x,y,-.598],true);
    bolt.rotation.x=Math.PI/2;
  }
  box(hoopAssembly, [0.24, 0.14, 0.07], rimMaterial, [0, -0.015, -0.583], true);
  box(hoopAssembly, [0.14, 0.045, 0.16], rimMaterial, [0, 0, -0.535], true);
  const rim = mesh(hoopAssembly,
    keep(new THREE.TorusGeometry(RIM_RADIUS, RIM_TUBE_RADIUS, 10, 72)),
    rimMaterial, [0, 0, 0], true);
  rim.name='basketball-rim';
  rim.rotation.x = Math.PI / 2;

  // Real, tapered diamond ropes. Top nodes stay fixed to the collision-aligned rim.
  const netMaterial = material('#d9d7cb', {roughness:.95,emissive:'#dddbc8'});
  const NET_COLUMNS = 12;
  const netRadii = [0.458, 0.43, 0.365, 0.3, 0.25, 0.23];
  const netDepths = [0.035, 0.16, 0.295, 0.435, 0.565, 0.7];
  const netNodes = Array.from({ length: NET_COLUMNS * netRadii.length },
    () => new THREE.Vector3());
  const netEdges = [];
  for (let level = 0; level < netRadii.length - 1; level += 1) {
    for (let i = 0; i < NET_COLUMNS; i += 1) {
      const next = (i + (level % 2 ? 1 : -1) + NET_COLUMNS) % NET_COLUMNS;
      netEdges.push([level * NET_COLUMNS + i, (level + 1) * NET_COLUMNS + i],
        [level * NET_COLUMNS + i, (level + 1) * NET_COLUMNS + next]);
    }
  }
  for (let i = 0; i < NET_COLUMNS; i += 1) {
    const base = (netRadii.length - 1) * NET_COLUMNS;
    netEdges.push([base + i, base + (i + 1) % NET_COLUMNS]);
  }
  const net = keep(new THREE.InstancedMesh(
    keep(new THREE.CylinderGeometry(0.007, 0.007, 1, 5)), netMaterial, netEdges.length,
  ));
  net.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  net.frustumCulled = false;
  hoopAssembly.add(net);

  function updateNet(time) {
    const sway = reducedMotion ? 0 : Math.sin(time * 1.7) * 0.009;
    for (let level = 0; level < netRadii.length; level += 1) {
      const t = level / (netRadii.length - 1);
      const spread = 1 + Math.max(0, netStretch) * t * 0.4;
      for (let i = 0; i < NET_COLUMNS; i += 1) {
        const angle = (i + (level % 2) * 0.5) / NET_COLUMNS * TAU;
        const flutter = reducedMotion ? 0
          : Math.sin(time * 16 + i * 1.9 + level) * Math.abs(netStretch) * t * 0.016;
        netNodes[level * NET_COLUMNS + i].set(
          Math.cos(angle) * netRadii[level] * spread + (sway + netSide * netStretch) * t * t,
          -netDepths[level] * (1 + netStretch * 0.55) + flutter,
          Math.sin(angle) * netRadii[level] * spread + netStretch * 0.065 * t * t,
        );
      }
    }
    netEdges.forEach(([a, b], i) => {
      scratch.subVectors(netNodes[b], netNodes[a]);
      dummy.position.copy(netNodes[a]).addScaledVector(scratch, 0.5);
      dummy.scale.set(1, scratch.length(), 1);
      dummy.quaternion.setFromUnitVectors(UP, scratch.normalize());
      dummy.updateMatrix();
      net.setMatrixAt(i, dummy.matrix);
    });
    net.instanceMatrix.needsUpdate = true;
    netMaterial.emissiveIntensity = netFlash * .16;
  }

  const ballMaterial = keep(new THREE.MeshPhysicalMaterial({
    map: ballMap, bumpMap: ballBump, bumpScale: 0.004,
    roughness:.83,metalness:0,clearcoat:.03,clearcoatRoughness:.7,
  }));
  const basketball = mesh(scene, keep(new THREE.SphereGeometry(BALL_RADIUS, 48, 32)),
    ballMaterial, [BALL_START.x, BALL_START.y, BALL_START.z], true);
  basketball.rotation.set(0.3, 0.45, -0.3);

  const shadowMaterial = basic('#1f241e', {
    map: glowTexture, transparent: true, opacity: 0.3,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1,
  });
  const ballShadow = groundRect(scene, 0, BALL_START.z, 1, 1, shadowMaterial, 0.018);
  ballShadow.receiveShadow = false;
  const contactMaterial=basic('#1a201b',{map:glowTexture,transparent:true,opacity:.32,
    depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const shooterShadow=groundRect(scene,0,BALL_START.z,.85,.62,contactMaterial,.021);
  shooterShadow.name='shooter-contact-shadow';shooterShadow.receiveShadow=false;
  const poleShadow = groundRect(hoopAssembly, 0, -1.1, 1.25, 1,
    basic('#23261e', { map: glowTexture, transparent: true, opacity:.26,depthWrite:false }),
    -HOOP_START.y + 0.02);
  poleShadow.receiveShadow = false;

  const TRAJECTORY_CAPACITY = 48;
  const trajectoryDots = keep(new THREE.InstancedMesh(
    keep(new THREE.SphereGeometry(1, 8, 6)),
    basic('#fff6dc', { transparent: true, opacity: 0.7, depthWrite: false }),
    TRAJECTORY_CAPACITY,
  ));
  trajectoryDots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trajectoryDots.frustumCulled = false;
  trajectoryDots.count = 0;
  trajectoryDots.visible = false;
  scene.add(trajectoryDots);

  function updateTrajectory(points, aiming) {
    trajectoryDots.visible = Boolean(aiming && Array.isArray(points) && points.length);
    if (!trajectoryDots.visible) {
      trajectoryDots.count = 0;
      trajectoryWasVisible = false;
      return;
    }
    let count = 0;
    let distance = 0;
    let previous = null;
    // Distance sampling avoids a dense solid line when physics uses tiny steps.
    for (let i = 0; i < points.length && count < TRAJECTORY_CAPACITY; i += 1) {
      const point = points[i];
      if (!validPoint(point)) continue;
      if (previous) distance += Math.hypot(point.x - previous.x,
        point.y - previous.y, point.z - previous.z);
      previous = point;
      if (i === 0 || distance < 0.27 || point.y < 0.04) continue;
      distance %= 0.27;
      const t = i / Math.max(1, points.length - 1);
      dummy.position.copy(point);
      dummy.quaternion.identity();
      dummy.scale.setScalar(0.025 * (1 - t * 0.48));
      dummy.updateMatrix();
      trajectoryDots.setMatrixAt(count, dummy.matrix);
      count += 1;
    }
    trajectoryDots.count = count;
    trajectoryDots.instanceMatrix.needsUpdate = true;
    trajectoryWasVisible = true;
  }

  const PARTICLE_CAPACITY = 96;
  const particleGeometry = keep(new THREE.IcosahedronGeometry(1, 0));
  const particleMaterial = basic('#ffffff', { transparent: true, opacity: 0.94 });
  const particleMesh = keep(new THREE.InstancedMesh(
    particleGeometry, particleMaterial, PARTICLE_CAPACITY,
  ));
  particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particleMesh.frustumCulled = false;
  particleMesh.count = 0;
  scene.add(particleMesh);
  const particleColors = ['#fff2bd', '#ffb65c', '#b9f2dc', '#fff9ea', '#f89c80']
    .map((color) => new THREE.Color(color));
  const particles = Array.from({ length: PARTICLE_CAPACITY }, () => ({
    position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    age: 1, life: 0, size: 0, rotation: 0, color: 0,
  }));
  let particleCursor = 0;
  const pulseGeometry = keep(new THREE.TorusGeometry(1, 0.018, 5, 48));
  const pulses = Array.from({ length: 5 }, () => {
    const surface = basic('#ffedba', { transparent: true, opacity: 0, depthWrite: false });
    const object = mesh(scene, pulseGeometry, surface);
    object.visible = false;
    return { object, age: 1, life: 0, size: 0.2, floor: false };
  });
  let pulseCursor = 0;

  function burst(position, { kind = 'score', power = 1 } = {}) {
    if (disposed || !validPoint(position)) return;
    const strength = THREE.MathUtils.clamp(Number.isFinite(power) ? power : 1, 0.2, 2);
    const isScore = kind === 'score';
    const isFloor = kind === 'floor';
    if (isScore) {
      netFlash = 1;
      if (!reducedMotion) {
        netVelocity = Math.min(netVelocity + 4.8 * strength, 8);
        netSide = THREE.MathUtils.clamp(position.x - hoopPosition.x, -0.3, 0.3);
        cameraImpulse = Math.min(0.085, cameraImpulse + 0.045 * strength);
      }
    } else if (kind === 'rim' && !reducedMotion) {
      netVelocity += 0.5 * strength;
    }
    if (reducedMotion) return;
    const count = isScore ? Math.round(26 * strength) : (isFloor ? 5 : 7);
    for (let i = 0; i < count; i += 1) {
      const particle = particles[particleCursor++ % PARTICLE_CAPACITY];
      const angle = random() * TAU;
      const speed = (isScore ? 0.8 + random() * 1.5 : 0.25 + random() * 0.65) * strength;
      particle.position.copy(position);
      if (isFloor) particle.position.y = Math.max(0.035, position.y * 0.15);
      particle.velocity.set(Math.cos(angle) * speed,
        (isScore ? 1.2 + random() * 2.1 : 0.3 + random() * 0.7) * strength,
        Math.sin(angle) * speed * 0.7);
      particle.age = 0;
      particle.life = isScore ? 0.55 + random() * 0.6 : 0.24 + random() * 0.2;
      particle.size = (isScore ? 0.023 + random() * 0.025 : 0.012 + random() * 0.012);
      particle.rotation = random() * TAU;
      particle.color = Math.floor(random() * particleColors.length);
    }
    const pulse = pulses[pulseCursor++ % pulses.length];
    pulse.age = 0;
    pulse.life = isScore ? 0.5 : 0.27;
    pulse.size = (isScore ? 0.75 : isFloor ? 0.42 : 0.24) * strength;
    pulse.floor = isFloor || isScore;
    pulse.object.position.copy(position);
    if (isFloor) pulse.object.position.y = 0.025;
    pulse.object.material.color.set(isScore ? '#fff1b8' : '#c8f0df');
    pulse.object.visible = true;
  }

  function updateParticles(dt) {
    let count = 0;
    for (const particle of particles) {
      particle.age += dt;
      if (particle.age >= particle.life) continue;
      const life = particle.age / particle.life;
      particle.velocity.y -= dt * 4.5;
      particle.position.addScaledVector(particle.velocity, dt);
      if (particle.position.y < 0.025) {
        particle.position.y = 0.025;
        particle.velocity.y = Math.abs(particle.velocity.y) * 0.24;
      }
      dummy.position.copy(particle.position);
      dummy.rotation.set(particle.rotation + life * 3, life * 4, particle.rotation);
      const size = particle.size * (1 - life * life);
      dummy.scale.set(size, size * 1.5, size * 0.65);
      dummy.updateMatrix();
      particleMesh.setMatrixAt(count, dummy.matrix);
      particleMesh.setColorAt(count, particleColors[particle.color]);
      count += 1;
    }
    particleMesh.count = count;
    if (count > 0) {
      particleMesh.instanceMatrix.needsUpdate = true;
      particleMesh.instanceColor.needsUpdate = true;
    }
    for (const pulse of pulses) {
      pulse.age += dt;
      if (pulse.age >= pulse.life) {
        pulse.object.visible = false;
        continue;
      }
      const t = pulse.age / pulse.life;
      pulse.object.scale.setScalar(0.04 + pulse.size * (1 - (1 - t) ** 3));
      pulse.object.material.opacity = (1 - t) ** 2 * 0.45;
      if (pulse.floor) pulse.object.rotation.set(-Math.PI / 2, 0, 0);
      else pulse.object.quaternion.copy(camera.quaternion);
    }
  }

  function applyCamera(time = 0) {
    applyCourtCamera(camera,{player:lastPresentation?.player||lastPresentation?.origin,
      hoop:lastPresentation?.hoop,height});
    if (!reducedMotion && cameraImpulse > 0.0001) {
      camera.position.x += Math.sin(time * 35) * cameraImpulse * 0.35;
      camera.position.y += Math.sin(time * 29) * cameraImpulse;
    }
    camera.updateMatrixWorld();
  }

  function resize(nextWidth, nextHeight) {
    if (disposed) return;
    width = Math.max(1, Number.isFinite(nextWidth) ? nextWidth : 1);
    height = Math.max(1, Number.isFinite(nextHeight) ? nextHeight : 1);
    const dpr = Math.min(2, Math.max(1, ownerWindow?.devicePixelRatio || 1));
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = CAMERA_FOV;
    camera.updateProjectionMatrix();
    applyCamera(elapsed);
    if(lastPresentation)render(lastPresentation,0);
  }

  function setView(id) {
    if(disposed||!HOOPS_VIEWS.some(item=>item.id===id))return false;
    viewId=id;
    cameraImpulse=0; lastBallValid=false;
    camera.fov=CAMERA_FOV;
    camera.updateProjectionMatrix();
    applyCamera(elapsed);
    if(lastPresentation)render(lastPresentation,0);
    return true;
  }

  function setCharacter(id) {
    if(disposed || !shooter.setCharacter(id))return false;
    lastBallValid=false;
    if(lastPresentation)render(lastPresentation,0);
    return true;
  }

  async function setTripoCharacter(buffer,{name}={}) {
    if(disposed)return false;
    const request=++tripoRequest;
    let asset;
    try {
      const {loadHoopsTripoCharacter}=await import('./hoops-tripo-character.js');
      if(disposed || request!==tripoRequest)return false;
      asset=await loadHoopsTripoCharacter(buffer,{name});
      if(disposed || request!==tripoRequest){asset.dispose();return false;}
      shooter.installTripoCharacter(asset);
      lastBallValid=false;
      if(lastPresentation)render(lastPresentation,0);
      return true;
    } catch {
      asset?.dispose();
      return false;
    }
  }

  function clearTripoTrees() {
    for(const object of treeMeshes){object.removeFromParent();object.dispose();}
    treeMeshes=[];treeAsset?.dispose();treeAsset=null;
  }

  async function setTripoTree(buffer,{name='松树.glb'}={}) {
    if(disposed)return false;
    const request=++treeRequest;
    treeAbort?.abort();
    const abort=new AbortController();treeAbort=abort;
    let asset=null,nextMeshes=[];
    try {
      const bytes=ArrayBuffer.isView(buffer)
        ?buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength):buffer;
      if(!(bytes instanceof ArrayBuffer))return false;
      const {loadMolesCharacter}=await import('./moles-character.js');
      if(disposed || request!==treeRequest)return false;
      asset=await loadMolesCharacter({name:/\.glb$/i.test(name)?name:`${name}.glb`,
        size:bytes.byteLength,arrayBuffer:async()=>bytes},{signal:abort.signal});
      if(disposed || request!==treeRequest){asset.dispose();return false;}
      const root=asset.createInstance();root.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(root,true);
      const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      if(bounds.isEmpty() || !Number.isFinite(size.y) || size.y<.001)throw new Error('松树尺寸无效。');
      const centerTree=new THREE.Matrix4().makeTranslation(-center.x,-bounds.min.y,-center.z);
      const sites=[[-17,-18,7.8],[17,-19,8.6],[-6,-21,7],[7,-22,7.5],[-18,2,8.2],[18,3,7.6]];
      root.traverse(object=>{
        if(!object.isMesh)return;
        if(object.isSkinnedMesh)throw new Error('松树需要静态模型。');
        const instances=new THREE.InstancedMesh(object.geometry,object.material,sites.length);
        instances.name='court-tripo-pines';instances.castShadow=instances.receiveShadow=true;
        nextMeshes.push(instances);
        sites.forEach(([x,z,height],i)=>{
          const transform=new THREE.Matrix4().compose(new THREE.Vector3(x,-.15,z),
            new THREE.Quaternion().setFromAxisAngle(UP,i*1.37),new THREE.Vector3().setScalar(height/size.y));
          transform.multiply(centerTree).multiply(object.matrixWorld);
          instances.setMatrixAt(i,transform);
        });
        instances.computeBoundingSphere();
      });
      if(!nextMeshes.length)throw new Error('松树没有可显示的网格。');
      clearTripoTrees();treeAsset=asset;asset=null;
      treeMeshes=nextMeshes;nextMeshes=[];
      treeMeshes.forEach(object=>scene.add(object));
      fallbackTrees.visible=false;
      if(lastPresentation)render(lastPresentation,0);
      return true;
    } catch {
      nextMeshes.forEach(object=>object.dispose());asset?.dispose();
      return false;
    } finally {
      if(treeAbort===abort)treeAbort=null;
    }
  }

  function project(point) {
    projected.copy(point).project(camera);
    return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
  }

  function render({ ball = BALL_START, hoop = HOOP_START, trajectory = [],
    aiming = false, combo = 0, time, holding = false, action = 0, aim,
    freeCourt=false, player=null, move=0, origin=BALL_START, velocity } = {}, dt = 1 / 60) {
    if (disposed) return;
    const step = THREE.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
    elapsed = Number.isFinite(time) ? time : elapsed + step;
    if(freeCourt && origin===BALL_START && player)origin=courtFrame(player,hoop).origin;
    lastPresentation={ball,hoop,trajectory,aiming,combo,time:elapsed,holding,action,aim,freeCourt,player,move,origin,velocity};
    if(freeCourt && !validPoint(velocity)) {
      velocity=velocityFromCourtAim(aim,origin,hoop);
    }
    if(freeCourt && Math.hypot(velocity.x,velocity.z)<1e-8) {
      const yaw=courtFrame(origin,hoop).yaw-(Number.isFinite(aim?.x)?aim.x:0)*.7;
      velocity={x:-Math.sin(yaw),y:velocity.y,z:-Math.cos(yaw)};
    }
    const courtBall=shooter.update({time:elapsed,action,aim,origin,velocity,move});
    shooterShadow.position.set(shooter.group.position.x,.021,shooter.group.position.z);
    shooterShadow.rotation.z=-shooter.group.rotation.y;
    if(holding)ball=courtBall;
    if (validPoint(hoop)) {
      hoopPosition.copy(hoop);
      hoopAssembly.position.copy(hoopPosition);
      poleShadow.position.y = -hoop.y + 0.02;
    }
    if (validPoint(ball)) {
      basketball.position.copy(ball);
      if (lastBallValid) {
        scratch.subVectors(basketball.position, lastBall);
        const distance = scratch.length();
        // Reset teleports must not spin the ball through a whole court of travel.
        if (distance > 0.0001 && distance < 2) {
          scratch2.set(scratch.z, scratch.x * 0.15, -scratch.x);
          if (scratch2.lengthSq() > 0.000001) {
            quaternion.setFromAxisAngle(scratch2.normalize(),
              Math.min(0.65, distance / BALL_RADIUS * 0.65));
            basketball.quaternion.premultiply(quaternion);
          }
        }
      }
      lastBall.copy(basketball.position);
      lastBallValid = true;
      const altitude = Math.max(0, ball.y - BALL_RADIUS);
      ballShadow.position.set(ball.x + altitude * 0.1, 0.019, ball.z + altitude * 0.06);
      const spread = 0.54 + altitude * 0.16;
      ballShadow.scale.set(spread, spread * 0.86, 1);
      shadowMaterial.opacity = 0.35 / (1 + altitude * 0.45);
    }
    if (reducedMotion) {
      netStretch = 0;
      netVelocity = 0;
      cameraImpulse = 0;
    } else {
      // Substeps keep this decorative spring stable through occasional long frames.
      let remaining = step;
      while (remaining > 0) {
        const springStep = Math.min(remaining, 1 / 120);
        netVelocity += (-65 * netStretch - 8.5 * netVelocity) * springStep;
        netStretch += netVelocity * springStep;
        remaining -= springStep;
      }
      cameraImpulse *= Math.exp(-step * 9);
    }
    netFlash *= Math.exp(-step * 3.2);
    rimMaterial.emissiveIntensity = netFlash*.3
      + Math.min(5, Math.max(0, Number(combo) || 0))*.004;
    updateNet(elapsed);
    if (aiming || trajectoryWasVisible) updateTrajectory(trajectory, aiming);
    cloudGroups.forEach((group, i) => {
      group.position.x = group.userData.homeX
        + (reducedMotion ? 0 : Math.sin(elapsed * 0.025 + i * 1.7) * 0.35);
    });
    applyCamera(elapsed);
    updateParticles(step);
    renderer.render(scene, camera);
    return basketball.position;
  }

  function onMotionChange(event) {
    reducedMotion = event.matches;
    if (reducedMotion) {
      for (const particle of particles) particle.age = particle.life;
      for (const pulse of pulses) pulse.age = pulse.life;
      cameraImpulse = netVelocity = netStretch = 0;
    }
  }
  cleanupTasks.push(()=>motionQuery?.removeEventListener?.('change',onMotionChange));
  motionQuery?.addEventListener?.('change',onMotionChange);

  // Batch static scenery by shared geometry/material without baking the movable
  // hoop or ball into it. A tree grove or all court stripes become a few draws.
  function batchStaticMeshes(root, excluded = new Set()) {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const batches = new Map();
    function collect(object) {
      if (excluded.has(object)) return;
      if (object.isMesh && !object.isInstancedMesh && !Array.isArray(object.material)) {
        const key = `${object.geometry.uuid}:${object.material.uuid}`
          + `:${object.castShadow}:${object.receiveShadow}:${object.renderOrder}`;
        if (!batches.has(key)) batches.set(key, []);
        batches.get(key).push(object);
      }
      for (const child of object.children) collect(child);
    }
    collect(root);
    const matrix = new THREE.Matrix4();
    for (const objects of batches.values()) {
      if (objects.length < 2) continue;
      const first = objects[0];
      const instances = keep(new THREE.InstancedMesh(
        first.geometry, first.material, objects.length,
      ));
      instances.castShadow = first.castShadow;
      instances.receiveShadow = first.receiveShadow;
      instances.renderOrder = first.renderOrder;
      objects.forEach((object, i) => {
        matrix.multiplyMatrices(inverse, object.matrixWorld);
        instances.setMatrixAt(i, matrix);
        object.removeFromParent();
      });
      instances.computeBoundingSphere();
      root.add(instances);
    }
  }

  for (const cloud of cloudGroups) batchStaticMeshes(cloud);
  batchStaticMeshes(fallbackTrees);
  batchStaticMeshes(scene, new Set([
    hoopAssembly, basketball, ballShadow, shooterShadow, trajectoryDots, particleMesh, shooter.group,fallbackTrees,
    ...cloudGroups, ...pulses.map((pulse) => pulse.object),
  ]));
  updateNet(0);
  resize(canvas.clientWidth || 390, canvas.clientHeight || 844);
  if(tripoTree?.buffer)setTripoTree(tripoTree.buffer,{name:tripoTree.name});
  return { resize, project, render, burst, dispose, setCharacter, setView, setTripoCharacter,setTripoTree,
    getTripoCharacter:()=>disposed?null:shooter.getTripoCharacter() };
  } catch(error) {dispose();throw error;}
}
