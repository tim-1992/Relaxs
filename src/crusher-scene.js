import * as THREE from 'three';
import {getCrusherVisual} from './crusher-state.js';
import {loadCrusherCar} from './crusher-model-loader.js';
import {createCrusherSurfaces} from './crusher-surfaces.js';
import {createCrusherSedan} from './crusher-models.js';
import {createCrusherWorkshop} from './crusher-workshop.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const noise = (index, salt = 0) => {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
};

function roundedCube(radius = .018) {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3(), core = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    const inner = .5 - radius;
    core.set(clamp(point.x, -inner, inner), clamp(point.y, -inner, inner), clamp(point.z, -inner, inner));
    point.sub(core).normalize().multiplyScalar(radius).add(core);
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** GPU-independent construction/pose layer, also usable for geometry tests.
 * Reuses a fixed collection of meshes: debris is the original object's parts.
 */
export function createCrusherWorld({reducedMotion = false} = {}) {
  const resources = new Set();
  const own = resource => (resources.add(resource), resource);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#858d88');
  scene.fog = new THREE.Fog('#858d88', 23, 47);
  const camera = new THREE.OrthographicCamera(-6, 6, 4, -4, .1, 80);
  camera.position.set(8, 7, 12);
  camera.lookAt(0, 1.65, 0);
  camera.updateMatrixWorld(true);
  const cube = own(roundedCube());
  const cylinder = own(new THREE.CylinderGeometry(.5, .5, 1, 20));
  const sphere = own(new THREE.SphereGeometry(.5, 12, 8));
  const {paint, environment} = createCrusherSurfaces(own);
  scene.environment = environment;
  scene.environmentIntensity = .75;
  function mesh(parent, name, geometry, material, position, scale, rotation = [0, 0, 0]) {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.position.set(...position);
    object.scale.set(...scale);
    object.rotation.set(...rotation);
    object.castShadow = object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (parent, name, material, position, scale, rotation) => mesh(parent, name, cube, material, position, scale, rotation);
  const group = (parent, name) => {const object = new THREE.Group(); object.name = name; parent.add(object); return object;};
  const {ram, plate, fan, needle, rollerGroup} = createCrusherWorkshop(scene,
    {own, mesh, box, group, paint, cylinder, sphere});
  const models = group(scene, 'crusher-toys');
  const car = createCrusherSedan(models, {own, mesh, box, paint, cylinder});

  const sofa = group(models, 'crusher-sofa');
  const upholstery = own(roundedCube(.10));
  const cushion = (name, material, position, scale, rotation) =>
    mesh(sofa, name, upholstery, material, position, scale, rotation);
  box(sofa, 'sofa-frame', paint.wood, [0, .22, 0], [1.91, .22, 1.04]);
  for (const x of [-.79, .79]) for (const z of [-.36, .36]) {
    box(sofa, 'sofa-leg', paint.wood, [x, .10, z], [.13, .20, .13], [0, 0, x > 0 ? -.08 : .08]);
  }
  for (let i = -1; i <= 1; i++) {
    cushion(`sofa-cushion-${i === 0 ? 'middle' : i}`, paint.mint, [i * .50, .46, .12], [.48, .30, .79]);
    cushion('sofa-back-cushion', paint.mintDark, [i * .51, .83, -.40], [.51, .89, .24], [-.10, 0, 0]);
    mesh(sofa, 'sofa-button', sphere, paint.mint, [i * .51, .88, -.25], [.055, .055, .035]);
    const seam = new THREE.CatmullRomCurve3([
      [-.21, 0, -.36], [.21, 0, -.36], [.23, 0, -.34], [.23, 0, .34],
      [.21, 0, .36], [-.21, 0, .36], [-.23, 0, .34], [-.23, 0, -.34],
    ].map(point => new THREE.Vector3(...point)), true, 'centripetal');
    mesh(sofa, 'sofa-piping', own(new THREE.TubeGeometry(seam, 40, .007, 4, true)),
      paint.mintDark, [i * .50, .535, .12], [1, 1, 1]);
  }
  for (const x of [-.88, .88]) cushion('sofa-arm', paint.mint, [x, .65, .02], [.27, .60, 1.05]);
  cushion('sofa-pillow', paint.mintDark, [.37, .78, -.03], [.43, .41, .16], [-.23, 0, -.18]);

  const tv = group(models, 'crusher-tv');
  box(tv, 'tv-case-back', paint.violetDark, [0, .65, -.22], [1.3, 1.05, .52]);
  box(tv, 'tv-case-left', paint.violet, [-.69, .67, .06], [.22, 1.12, .77]);
  box(tv, 'tv-case-right', paint.violet, [.57, .67, .06], [.37, 1.12, .77]);
  box(tv, 'tv-case-top', paint.violet, [-.04, 1.17, .05], [1.33, .17, .78]);
  box(tv, 'tv-case-bottom', paint.violet, [-.04, .17, .05], [1.33, .18, .78]);
  box(tv, 'tv-screen-bezel', paint.dark, [-.15, .68, .43], [1.03, .85, .10]);
  mesh(tv, 'tv-screen', own(new THREE.SphereGeometry(.5, 28, 18)), paint.screen,
    [-.15, .68, .477], [.99, .79, .14]);
  for (const y of [.9, .66]) {
    mesh(tv, 'tv-dial', cylinder, paint.cream, [.58, y, .48], [.15, .07, .15], [Math.PI / 2, 0, 0]);
  }
  for (let i = 0; i < 7; i++) box(tv, 'tv-speaker', paint.black, [.58, .29 + i * .028, .45], [.19, .009, .027]);
  for (let i = 0; i < 8; i++) box(tv, 'tv-rear-vent', paint.black, [-.46 + i * .13, .92, -.49], [.055, .21, .012]);
  for (const x of [-.52, .52]) box(tv, 'tv-foot', paint.wood, [x, .065, .10], [.15, .13, .45]);
  for (const sign of [-1, 1]) {
    mesh(tv, 'tv-antenna', cylinder, paint.steel, [sign * .22, 1.47, -.15], [.035, .56, .035], [0, 0, sign * -.65]);
    mesh(tv, 'tv-antenna-tip', sphere, paint.cream, [sign * .39, 1.69, -.15], [.065, .065, .065]);
  }
  for (const model of models.children) {
    model.children.forEach((part, index) => {
      part.userData.homePosition = part.position.clone();
      part.userData.homeScale = part.scale.clone();
      part.userData.homeRotation = part.rotation.clone();
      part.userData.seed = index;
    });
  }
  const particles = new THREE.InstancedMesh(cube, own(new THREE.MeshBasicMaterial({
    color: '#ffe3ad', transparent: true, opacity: .8, depthWrite: false,
  })), 44);
  particles.name = 'crusher-particles';
  particles.count = 0;
  particles.frustumCulled = false;
  scene.add(particles);
  const dummy = new THREE.Object3D();
  const light = new THREE.DirectionalLight('#fff1de', 2.55);
  light.position.set(-3.8, 7.6, 4.5);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {left: -7, right: 7, top: 6, bottom: -5, near: .5, far: 25});
  light.shadow.normalBias = .025;
  light.shadow.bias = -.0003;
  light.shadow.radius = 3;
  scene.add(light, new THREE.HemisphereLight('#d9e5ed', '#666354', 1.05));
  const rim = new THREE.DirectionalLight('#d4e0e7', .65);
  rim.position.set(4, 5, -5);
  scene.add(rim);
  const poseBounds = new THREE.Box3();
  let disposed = false, importedCar = null, carAbort = null, carRequest = 0;

  async function loadTripoCar(data) {
    if (disposed) throw Object.assign(new Error('工坊已关闭。'), {name: 'AbortError'});
    const request = ++carRequest;
    carAbort?.abort();
    const controller = new AbortController();
    carAbort = controller;
    const asset = await loadCrusherCar(data, {signal: controller.signal});
    if (disposed || request !== carRequest) {
      asset.dispose();
      throw Object.assign(new Error('汽车读取已取消。'), {name: 'AbortError'});
    }
    car.removeFromParent();
    importedCar?.dispose();
    importedCar = asset;
    models.add(asset.model);
    return asset.name;
  }

  function resize(width, height) {
    if (disposed) return;
    const aspect = Math.max(.25, width / Math.max(1, height));
    // Fit projected room corners instead of cropping the conveyor on mobile.
    camera.updateMatrixWorld(true);
    const inverse = camera.matrixWorldInverse;
    let extentX = 0, extentY = 0;
    for (const x of [-4.85, 4.85]) for (const y of [-.34, 4.27]) for (const z of [-1.72, 1.72]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(inverse);
      extentX = Math.max(extentX, Math.abs(point.x));
      extentY = Math.max(extentY, Math.abs(point.y));
    }
    const halfY = Math.max(extentY, extentX / aspect) * 1.05;
    camera.left = -halfY * aspect; camera.right = halfY * aspect;
    camera.top = halfY; camera.bottom = -halfY;
    camera.updateProjectionMatrix();
  }

  function render(state) {
    if (disposed) return false;
    const view = getCrusherVisual(state);
    needle.rotation.z = 1.1 - state.pressure * 2.2;
    paint.lamp.emissiveIntensity = .4 + state.pressure * .65;
    fan.rotation.x = view.belt * 9;
    rollerGroup.children.forEach(roller => {roller.rotation.y = view.belt * 4;});
    let objectTop = 0;
    for (const model of models.children) {
      model.visible = model.name === `crusher-${state.target}`;
      if (!model.visible) continue;
      model.position.set(mix(-3.12, 0, view.feed) + view.eject * 3.58, 0, 0);
      const squash = 1 - view.damage * .78;
      // Compress after every part's local rotation. A wheel's cylinder axis
      // points across the belt, but its vertical diameter must still flatten.
      model.scale.set(1 + view.damage * .10, squash, 1 + view.damage * .12);
      for (const part of model.children) {
        const {homePosition: home, homeScale: size, homeRotation: rotation, seed} = part.userData;
        const scatter = view.fracture;
        const jolt = !reducedMotion && view.impact ? Math.sin(state.phaseTime * 87 + seed) * .022 : 0;
        part.position.set(
          home.x * (1 + view.damage * .03) + (noise(seed, 1) - .5) * .65 * scatter + jolt,
          home.y + (Math.sin(scatter * Math.PI) * (.18 + noise(seed, 2) * .45)
            + scatter * noise(seed, 3) * .10) / squash,
          home.z * (1 + view.damage * .07) + (noise(seed, 4) - .5) * .30 * scatter,
        );
        part.scale.copy(size);
        part.rotation.set(rotation.x + (noise(seed, 5) - .5) * scatter * .75,
          rotation.y + (noise(seed, 6) - .5) * scatter * .65,
          rotation.z + (noise(seed, 7) - .5) * (view.damage * .10 + scatter * .6));
      }
      // Use the actual transformed vertices, including rotated fragment edges,
      // to rest the pile above the rollers. Lift gently before its leading
      // edge reaches the raised output tray (x=2.95, top y=.96).
      model.updateWorldMatrix(true, true);
      poseBounds.setFromObject(model, true);
      const floor = mix(.93, .96, clamp((poseBounds.max.x - 2.60) / .35, 0, 1));
      model.position.y = floor - poseBounds.min.y;
      objectTop = poseBounds.max.y + model.position.y;
    }
    // The shoe's underside is .115 below its origin; leave .02 clearance.
    // This also accommodates the TV antenna and fragments during retraction.
    const contactY = objectTop + .135;
    plate.position.y = Math.max(contactY, mix(2.76, contactY, view.press));
    ram.position.y = (3.26 + plate.position.y + .10) / 2;
    ram.scale.y = 3.26 - plate.position.y - .10;
    particles.count = view.dust > .015 ? (reducedMotion ? 12 : 44) : 0;
    const age = state.phase === 'breaking' ? state.phaseTime : Math.max(0, state.phaseTime - .35);
    for (let i = 0; i < particles.count; i++) {
      const angle = noise(i, state.attempts) * Math.PI * 2;
      const radius = .6 + age * (1.2 + noise(i, 8) * 1.2);
      dummy.position.set(Math.cos(angle) * radius,
        1.18 + Math.max(0, (1 + noise(i, 9) * 1.2) * age - 2 * age * age), Math.sin(angle) * radius * .6);
      dummy.rotation.set(i, age * 4 + i, i * .4);
      const size = (i % 3 === 0 ? .045 : .085) * view.dust;
      dummy.scale.set(size, size * (i % 3 === 0 ? 3 : 1), size);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
      particles.setColorAt(i, new THREE.Color(i % 3 === 0 ? '#ffd16d' : state.target === 'sofa' ? '#b9c5a8' : '#d1bf9e'));
    }
    particles.instanceMatrix.needsUpdate = true;
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
    scene.updateMatrixWorld(true);
    return true;
  }
  resize(1000, 470);
  return {scene, camera, render, resize, loadTripoCar, dispose() {
    if (disposed) return;
    disposed = true;
    carAbort?.abort();
    importedCar?.dispose(); importedCar = null;
    light.shadow.dispose();
    particles.dispose();
    for (const resource of resources) resource.dispose();
    resources.clear();
    scene.clear();
  }};
}

/** The controller owns RAF and context-loss fallback; this owns GPU resources. */
export function createCrusherScene(canvas, {reducedMotion = false} = {}) {
  let renderer, world;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'low-power'});
    renderer.setPixelRatio(Math.min(canvas.ownerDocument.defaultView.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .95;
    world = createCrusherWorld({reducedMotion});
  } catch (error) {
    world?.dispose();
    renderer?.dispose();
    throw error;
  }
  let width = 0, height = 0, disposed = false, lastState = null;
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (width === w && height === h) return;
    width = w; height = h;
    renderer.setSize(w, h, false);
    world.resize(w, h);
  }
  return {resize, render(state) {
    if (disposed) return;
    lastState = state;
    resize();
    world.render(state);
    renderer.render(world.scene, world.camera);
  }, async loadTripoCar(data) {
    const name = await world.loadTripoCar(data);
    if (!disposed && lastState) {
      world.render(lastState);
      renderer.render(world.scene, world.camera);
    }
    return name;
  }, dispose() {
    if (disposed) return;
    disposed = true;
    world.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }};
}
