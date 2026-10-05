import * as THREE from 'three';
import {TENNIS_COURT, TENNIS_ZONES} from './arcade-challenges.js';
import {createSportAvatar} from './sport-avatar.js';
export {SPORT_CHARACTERS} from './sport-avatar.js';

const SCALE = .018;
const BALL_HEIGHT = .89;
const RACKET_HEIGHT = .89;
const RACKET_Z = (TENNIS_COURT.contactY - 260) * .02;

export function tennisWorldPoint(point, height = BALL_HEIGHT) {
  return new THREE.Vector3((point.x - 320) * SCALE, height, (point.y - 260) * .02);
}

export function createTennisTrail() {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(7 * 3), 3);
  positions.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setDrawRange(0, 0);
  return {
    geometry,
    update(points) {
      const count = Math.min(7, points.length);
      for (let index = 0; index < count; index++) {
        const point = points[points.length - count + index];
        positions.setXYZ(index, (point.x - 320) * SCALE, BALL_HEIGHT, (point.y - 260) * .02);
      }
      geometry.setDrawRange(0, count);
      positions.needsUpdate = true;
    },
  };
}

/** Adapt the shared rig to the real racket contact line without changing its meshes. */
export function createTennisAvatar(character = 'moss') {
  const avatar = createSportAvatar({sport: 'tennis', character});
  let offset = new THREE.Vector3();
  function calibrate() {
    avatar.group.position.set(0, 0, 0);
    avatar.group.scale.setScalar(1.65);
    // A forgiving, visibly wide racket matches the unchanged 130-unit hit area.
    avatar.group.getObjectByName('avatar-racket').scale.x = 3.3;
    avatar.update({action: 0, move: 0});
    offset = avatar.group.getObjectByName('racket-head').getWorldPosition(new THREE.Vector3());
  }
  calibrate();
  return {
    group: avatar.group,
    setCharacter(id) { avatar.setCharacter(id); calibrate(); },
    update({paddleX = 320, time = 0, move = 0, action = 0} = {}) {
      avatar.group.position.set((paddleX - 320) * SCALE - offset.x, 0, RACKET_Z - offset.z);
      avatar.update({time, move, action});
    },
    dispose: avatar.dispose,
  };
}

export function createTennisScene(canvas, {onResize = () => {}} = {}) {
  const resources = new Set();
  const keep = value => (resources.add(value), value);
  let renderer, observer, sun, disposed = false;
  let actor = null;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'low-power'});
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor('#c9d5bd');
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog('#c9d5bd', 18, 32);
    const camera = new THREE.PerspectiveCamera(43, 640 / 440, .1, 60);
    camera.position.set(0, 10.8, 14);
    camera.lookAt(0, .55, .25);
    scene.add(new THREE.HemisphereLight('#fff5d8', '#43685c', 2.5));
    sun = new THREE.DirectionalLight('#fff0cc', 3);
    sun.position.set(-5, 10, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {left: -9, right: 9, top: 9, bottom: -9, near: .5, far: 30});
    sun.shadow.bias = -.0005;
    scene.add(sun);
    const mat = (color, props = {}) => keep(new THREE.MeshStandardMaterial({color, roughness: .8, ...props}));
    const courtMat = mat('#618977'), edgeMat = mat('#496f60'), cream = mat('#ede9ce');
    function mesh(geometry, material, x, y, z) {
      const object = new THREE.Mesh(keep(geometry), material);
      object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
      scene.add(object); return object;
    }
    mesh(new THREE.BoxGeometry(12.3, .3, 12.5), edgeMat, 0, -.22, .9);
    mesh(new THREE.BoxGeometry(10.55, .08, 9.5), courtMat, 0, -.015, .45);
    mesh(new THREE.PlaneGeometry(70, 70), mat('#b5c4a7'), 0, -.39, 0).rotation.x = -Math.PI / 2;
    const lineMaterial = keep(new THREE.LineBasicMaterial({color: '#dce7cb'}));
    function courtLine(points) {
      const geometry = keep(new THREE.BufferGeometry().setFromPoints(points.map(point => tennisWorldPoint(point, .042))));
      scene.add(new THREE.Line(geometry, lineMaterial));
    }
    courtLine([{x:34,y:80},{x:34,y:414},{x:606,y:414},{x:606,y:80}]);
    courtLine([{x:34,y:245},{x:606,y:245}]);
    courtLine([{x:320,y:245},{x:320,y:414}]);
    for (const x of [88,552]) courtLine([{x,y:80},{x,y:414}]);
    mesh(new THREE.BoxGeometry(11.25, 2.3, .28), mat('#dadbb9'), 0, 1.1, -3.82);
    mesh(new THREE.BoxGeometry(11.4, .13, .4), cream, 0, 2.32, -3.82);
    const zoneMeshes = [];
    for (const [index, zone] of TENNIS_ZONES.entries()) {
      const center = (zone.left + zone.right) / 2;
      const material = mat(['#9eac7c','#82a291','#a2b598'][index]);
      const panel = mesh(new THREE.BoxGeometry((zone.right-zone.left)*SCALE-.08, 1.55, .08),
        material, (center-320)*SCALE, 1.05, -3.62);
      zoneMeshes.push(panel);
      // Roman tally marks are geometric and remain readable without textures.
      for (let mark = 0; mark <= index; mark++) mesh(new THREE.BoxGeometry(.045, .29, .045), cream,
        (center-320)*SCALE + (mark-index/2)*.14, 1.68, -3.54);
    }
    for (const x of [-6.3, 6.3]) {
      mesh(new THREE.CylinderGeometry(.08,.11,3.8,10), edgeMat, x, 1.7, -2.5);
      const treeMat = mat(x < 0 ? '#809b70' : '#99ad7c');
      mesh(new THREE.IcosahedronGeometry(1.3, 1), treeMat, x, 3.05, -2.5);
    }
    const ballMesh = mesh(new THREE.SphereGeometry(11*SCALE, 20, 14), mat('#f1e998', {roughness: .5}), 0, BALL_HEIGHT, 0);
    const seam = new THREE.Mesh(keep(new THREE.TorusGeometry(11*SCALE+.002,.007,5,32)), cream);
    seam.rotation.x = .8; ballMesh.add(seam);
    const shadow = mesh(new THREE.CircleGeometry(.23, 24), keep(new THREE.MeshBasicMaterial({color: '#183c2b',transparent:true,opacity:.22,depthWrite:false})),0,.05,0);
    shadow.rotation.x = -Math.PI/2;
    const trail = createTennisTrail();
    keep(trail.geometry);
    const trailLine = new THREE.Line(trail.geometry, keep(new THREE.LineBasicMaterial({color:'#f5edc0',transparent:true,opacity:.5})));
    trailLine.frustumCulled = false;
    scene.add(trailLine);
    const ringGeometry = keep(new THREE.TorusGeometry(.24,.025,6,28));
    const landing = new THREE.Mesh(ringGeometry, keep(new THREE.MeshBasicMaterial({color:'#f4ecb1'})));
    const catcher = new THREE.Mesh(keep(new THREE.TorusGeometry(.42,.025,6,32)), keep(new THREE.MeshBasicMaterial({color:'#f2ecc4'})));
    catcher.rotation.x = Math.PI/2;
    scene.add(landing, catcher);
    const hitMark = new THREE.Mesh(keep(new THREE.TorusGeometry(.2,.025,6,28)), keep(new THREE.MeshBasicMaterial({color:'#fff3b9',transparent:true,opacity:1})));
    scene.add(hitMark);
    const contact = new THREE.Mesh(keep(new THREE.SphereGeometry(.055,10,8)), keep(new THREE.MeshBasicMaterial({color:'#e89e76'})));
    scene.add(contact);
    actor=createTennisAvatar(); scene.add(actor.group);
    let swingRemaining = 0, markRemaining = 0, markX = 320, time = 0, previousX = 320, moving = 0;
    function resize() {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      onResize();
    }
    observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const ray = new THREE.Raycaster();
    const paddlePlane = new THREE.Plane(new THREE.Vector3(0,0,1), -RACKET_Z);
    return {
      select(kind) { actor.setCharacter(kind); },
      swing() { swingRemaining = .42; },
      wallHit(x) { markX=x; markRemaining=.85; },
      reset() { swingRemaining=0; markRemaining=0; moving=0; previousX=320; time=0; },
      advance(dt) { time+=dt; swingRemaining=Math.max(0,swingRemaining-dt); markRemaining=Math.max(0,markRemaining-dt); },
      animating() { return swingRemaining>0 || markRemaining>0 || moving>.01; },
      pointerX(point) {
        const row = new THREE.Vector3(0,RACKET_HEIGHT,RACKET_Z).project(camera).y;
        ray.setFromCamera(new THREE.Vector2(point.x/640*2-1,row),camera);
        const hit=ray.ray.intersectPlane(paddlePlane,new THREE.Vector3());
        return hit ? hit.x/SCALE+320 : point.x;
      },
      draw({paddleX, ball, trail: trailPoints=[], expected=null, zones=false, predicted=null, catchX=null}) {
        if (disposed) return;
        moving=THREE.MathUtils.lerp(moving,Math.min(1,Math.abs(paddleX-previousX)/5),.25); previousX=paddleX;
        const action = swingRemaining ? 1-swingRemaining/.42 : 0;
        actor.update({paddleX,action,move:moving,time});
        zoneMeshes.forEach((panel,index) => {
          panel.material.emissive.set(zones && TENNIS_ZONES[index].id===expected ? '#d6d998' : '#000000');
          panel.material.emissiveIntensity=.28;
        });
        ballMesh.visible=Boolean(ball&&!ball.out);
        shadow.visible=ballMesh.visible;
        if (ballMesh.visible) {
          ballMesh.position.copy(tennisWorldPoint(ball));
          ballMesh.rotation.z=time*2;
          shadow.position.copy(tennisWorldPoint(ball,.055));
        }
        trail.update(trailPoints);
        trailLine.visible=trailPoints.length>1;
        landing.visible=predicted!==null;
        if (landing.visible) landing.position.copy(tennisWorldPoint({x:predicted,y:80},BALL_HEIGHT)).setZ(-3.51);
        catcher.visible=catchX!==null;
        if(catcher.visible) catcher.position.copy(tennisWorldPoint({x:catchX,y:TENNIS_COURT.contactY},.07));
        hitMark.visible=markRemaining>0;
        if(hitMark.visible) {
          hitMark.position.copy(tennisWorldPoint({x:markX,y:80},BALL_HEIGHT)).setZ(-3.5);
          hitMark.scale.setScalar(1+(.85-markRemaining)*2);
          hitMark.material.opacity=markRemaining/.85;
        }
        contact.visible=Boolean(ball?.held && Math.abs(ball.y-TENNIS_COURT.contactY)<1 && Math.abs(ball.x-paddleX)<=TENNIS_COURT.contactReach);
        if(contact.visible) contact.position.copy(tennisWorldPoint({x:ball.x,y:TENNIS_COURT.contactY},RACKET_HEIGHT+.07));
        renderer.render(scene,camera);
      },
      dispose() {
        if(disposed)return; disposed=true; observer.disconnect();
        actor.dispose(); resources.forEach(resource=>resource.dispose());
        sun.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss();
      },
    };
  } catch(error) {
    disposed=true; observer?.disconnect();
    actor?.dispose(); resources.forEach(resource=>resource.dispose());
    sun?.shadow.map?.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
    throw error;
  }
}
