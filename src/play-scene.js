import * as THREE from 'three';
import {PLAY_ARENA, mirrorEnds, predictPlayTrajectory} from './play-physics.js';

// Rendering consumes the same coordinates as the physics engine.
export function createPlayScene(canvas) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 60);
  camera.position.set(0, 13, 7);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xf8f9df, 0x244c42, 2.5));
  const sun = new THREE.DirectionalLight(0xffefd0, 3.3);
  sun.position.set(-4, 9, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -6, right: 6, top: 6, bottom: -6});
  sun.shadow.bias = -.0005;
  scene.add(sun);
  const resources = new Set();
  const keep = value => (resources.add(value), value);
  const mat = (color, extra = {}) => keep(new THREE.MeshStandardMaterial({color, roughness: .72, ...extra}));
  const green = mat('#345c50'), rim = mat('#658474'), ivory = mat('#f2ebc6');
  const unlit = mat('#728f80'), lit = mat('#e7ed9b', {emissive: '#c3d377', emissiveIntensity: .6});
  const current = mat('#b5ce99');
  const clay = mat('#deb28a'), dim = mat('#24463e');
  function mesh(geometry, material, x = 0, y = 0, z = 0, parent = scene) {
    const item = new THREE.Mesh(keep(geometry), material);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }
  mesh(new THREE.BoxGeometry(7.7, .38, 9.7), green, 0, -.3, 0);
  mesh(new THREE.BoxGeometry(7.5, .13, 9.5), dim, 0, -.05, 0);
  for (const x of [-3.7, 3.7]) mesh(new THREE.BoxGeometry(.2, .27, 9.6), rim, x, .03, 0);
  for (const z of [-4.7, 4.7]) mesh(new THREE.BoxGeometry(7.5, .27, .2), rim, 0, .03, z);
  const dotGeometry = keep(new THREE.SphereGeometry(.018, 5, 4));
  for (let x = -3; x <= 3; x += 1) for (let z = -4; z <= 4; z += 1) {
    const item = new THREE.Mesh(dotGeometry, rim);
    item.position.set(x, .03, z);
    scene.add(item);
  }
  mesh(new THREE.CylinderGeometry(.38, .43, .15, 32), rim, 0, .08, 4);
  const ball = mesh(new THREE.SphereGeometry(PLAY_ARENA.ballRadius, 20, 12), ivory, 0, .22, 4);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5 + Math.PI / 2, radius = i % 2 ? .15 : .33;
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    if (i) starShape.lineTo(x, y); else starShape.moveTo(x, y);
  }
  starShape.closePath();
  const starGeometry = keep(new THREE.ExtrudeGeometry(starShape, {depth: .12, bevelEnabled: true, bevelSize: .025, bevelThickness: .025, bevelSegments: 2, steps: 1}));
  const mirrorGeometry = keep(new THREE.BoxGeometry(1, .28, .17));
  const routeGeometry = keep(new THREE.SphereGeometry(.04, 8, 6));
  const routeMaterial = mat('#d6e6b4', {transparent: true, opacity: .5});
  const path = Array.from({length: 20}, () => {
    const item = new THREE.Mesh(routeGeometry, routeMaterial);
    scene.add(item);
    return item;
  });
  let level = -1, targetMeshes = [], mirrorMeshes = [], labels = [], pathKey = '', disposed = false;
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  function resize() {
    if (disposed) return;
    const {width, height} = canvas.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const aspect = width / height, frustum = Math.max(9.3, 8.6 / aspect);
    camera.left = -frustum * aspect / 2;
    camera.right = frustum * aspect / 2;
    camera.top = frustum / 2;
    camera.bottom = -frustum / 2;
    camera.updateProjectionMatrix();
  }
  resize();
  function sync(state) {
    if (level !== state.level) {
      [...targetMeshes, ...mirrorMeshes, ...labels].forEach(item => scene.remove(item));
      labels.forEach(item => { item.material.map.dispose(); item.material.dispose(); });
      level = state.level;
      pathKey = '';
      targetMeshes = state.targets.map(target => {
        const item = new THREE.Mesh(starGeometry, unlit);
        item.rotation.x = -Math.PI / 2;
        item.position.set(target.x, .12, -target.y);
        item.castShadow = true;
        scene.add(item);
        return item;
      });
      mirrorMeshes = state.mirrors.map(item => {
        const object = new THREE.Mesh(mirrorGeometry, item.rotatable ? clay : rim);
        object.position.set(item.x, .18, -item.y);
        object.scale.x = item.length;
        object.castShadow = true;
        scene.add(object);
        return object;
      });
      labels = state.puzzle ? state.groups.map(group => {
        const badge = document.createElement('canvas'); badge.width = 128; badge.height = 128;
        const ctx = badge.getContext('2d');
        ctx.beginPath(); ctx.arc(64, 64, 52, 0, Math.PI * 2);
        ctx.fillStyle = '#dbe9b3'; ctx.fill();
        ctx.fillStyle = '#183f31'; ctx.font = 'bold 72px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(group.id + 1), 64, 67);
        const material = new THREE.SpriteMaterial({map: new THREE.CanvasTexture(badge), transparent: true, depthTest: false});
        const label = new THREE.Sprite(material);
        label.scale.set(.48, .48, 1); label.position.set(group.x, .36, -group.y);
        label.renderOrder = 2; scene.add(label);
        return label;
      }) : [];
    }
    state.targets.forEach((target, index) => { targetMeshes[index].material = target.lit ? lit : state.puzzle && target.group === state.nextGroup ? current : unlit; });
    labels.forEach((label, index) => { label.material.opacity = index === state.nextGroup ? 1 : .38; });
    state.mirrors.forEach((item, index) => { mirrorMeshes[index].rotation.y = item.angle * Math.PI / 180; });
    ball.position.set(state.ball.x, .22, -state.ball.y);
    const key = `${state.level}/${state.angle}/${state.mirrors.map(item => item.angle).join(',')}`;
    if (key !== pathKey) {
      pathKey = key;
      const points = predictPlayTrajectory(state);
      path.forEach((item, index) => {
        const point = points[Math.min(index, points.length - 1)];
        item.position.set(point.x, .18, -point.y);
      });
    }
    path.forEach(item => { item.visible = !state.ball.active && !state.complete && !state.failed; });
    renderer.render(scene, camera);
  }
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  return {
    draw: sync,
    point(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
      return hit ? {x: hit.x, y: -hit.z} : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      resources.forEach(item => item.dispose());
      labels.forEach(item => { item.material.map.dispose(); item.material.dispose(); });
      sun.shadow.map?.dispose();
      renderer.dispose();
    },
  };
}

export function createPlayFallback(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  const width = 760, height = 980;
  canvas.width = width; canvas.height = height;
  const project = p => ({x: width / 2 + p.x * 98, y: height / 2 - p.y * 98});
  function dot(point, radius, color) {
    const p = project(point);
    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
  }
  return {
    draw(state) {
      ctx.fillStyle = '#23483d'; ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = '#7c9b83'; ctx.lineWidth = 8; ctx.strokeRect(27, 39, 706, 902);
      if (!state.ball.active && !state.complete && !state.failed) predictPlayTrajectory(state).forEach(p => dot(p, 3, '#bdcea0'));
      state.mirrors.forEach(item => {
        const [a, b] = mirrorEnds(item).map(project);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.lineWidth = 17; ctx.lineCap = 'round'; ctx.strokeStyle = item.rotatable ? '#deb28a' : '#7c9b83'; ctx.stroke();
      });
      state.targets.forEach(target => {
        const p = project(target);
        ctx.fillStyle = target.lit ? '#e7ed9b' : state.puzzle && target.group === state.nextGroup ? '#b5ce99' : '#7c9b83';
        ctx.font = '48px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('✦', p.x, p.y);
      });
      if (state.puzzle) state.groups.forEach(group => {
        const p = project(group);
        dot(group, 24, group.id === state.nextGroup ? '#dbe9b3' : '#758873');
        ctx.fillStyle = '#183f31'; ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(group.id + 1), p.x, p.y + 1);
      });
      dot(state.ball, 14, '#f2ebc6');
    },
    point(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      return {x: ((clientX - rect.left) / rect.width * width - width / 2) / 98, y: (height / 2 - (clientY - rect.top) / rect.height * height) / 98};
    },
    dispose() {},
  };
}
