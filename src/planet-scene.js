import * as THREE from 'three';
import {breathPhase} from './planet-state.js';

const TAU = Math.PI * 2;
const IDS = ['play', 'calm', 'release'];
const UP = new THREE.Vector3(0, 1, 0);
const RADIUS = 1.6;

// The worlds are procedural placeholders. Replace their visual groups with
// exported Tripo assets later without changing navigation or input handling.
export function createPlanetScene(canvas) {
  const resources = new Set();
  const keep = resource => (resources.add(resource), resource);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 3.25, -2.65, .1, 60);
  camera.position.set(0, 0, 15);
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const ambient = new THREE.HemisphereLight('#e1edda', '#2e464b', 2.25);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff0d4', 3.5);
  sun.position.set(-4, 7, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -10, right: 10, top: 5, bottom: -5, near: .1, far: 25});
  sun.shadow.normalBias = .025;
  sun.shadow.bias = -.0002;
  scene.add(sun);
  const rim = new THREE.DirectionalLight('#8fc4ca', 2);
  rim.position.set(4, 2, -4);
  scene.add(rim);

  const material = (color, props = {}) => keep(new THREE.MeshStandardMaterial({color, roughness: .8, ...props}));
  const sphere = keep(new THREE.SphereGeometry(1, 48, 32));
  const smallSphere = keep(new THREE.SphereGeometry(1, 20, 14));
  const cube = keep(new THREE.BoxGeometry(1, 1, 1, 2, 2, 2));
  const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 16));
  const cone = keep(new THREE.ConeGeometry(1, 1, 16));
  const palette = {
    sea: material('#4d9291', {roughness: .5, metalness: .12}),
    shore: material('#d7d5a1'), grass: material('#93b782'),
    darkGrass: material('#679370'), sage: material('#b7c697'),
    foliage: material('#729b72'), darkLeaf: material('#416c5e'),
    wood: material('#a69278'), cream: material('#eee4c4'),
    yellow: material('#f1c774', {roughness: .48}), peach: material('#dfa38c'),
    lilac: material('#bdacd5'), cloud: material('#e6e6dc'),
    water: material('#95afbe', {roughness: .38, metalness: .15}),
    lake: material('#b0c7ca', {roughness: .32, metalness: .12}),
    terra: material('#b78069'), sand: material('#d7a680'),
    rose: material('#cf999d'), violet: material('#8f87ad'),
    coral: material('#e59d7c'), orange: material('#e8b36e'),
  };

  function mesh(parent, geometry, surface, position = [0, 0, 0], scale = [1, 1, 1]) {
    const item = new THREE.Mesh(geometry, surface);
    item.position.set(...position);
    item.scale.set(...scale);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  }

  function point(latitude, longitude, radius = RADIUS) {
    const lat = latitude * Math.PI / 180;
    const lon = longitude * Math.PI / 180;
    return new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).multiplyScalar(radius);
  }

  function surfaceGroup(parent, lat, lon, radius = RADIUS + .02) {
    const group = new THREE.Group();
    group.position.copy(point(lat, lon, radius));
    group.quaternion.setFromUnitVectors(UP, group.position.clone().normalize());
    parent.add(group);
    return group;
  }

  // A curved island on the surface, with an irregular but smooth coastline.
  function island(parent, lat, lon, angularSize, surface, offset = .014, phase = 0) {
    const normal = point(lat, lon, 1);
    const tangent = new THREE.Vector3().crossVectors(UP, normal).normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    const positions = [], indices = [];
    const rings = 12, segments = 80;
    for (let r = 0; r <= rings; r++) {
      for (let a = 0; a <= segments; a++) {
        const angle = a / segments * TAU;
        const coast = 1 + .12 * Math.sin(angle * 3 + phase) + .065 * Math.cos(angle * 5 - phase);
        const spread = angularSize * r / rings * coast;
        const v = normal.clone().multiplyScalar(Math.cos(spread))
          .addScaledVector(tangent, Math.sin(spread) * Math.cos(angle))
          .addScaledVector(bitangent, Math.sin(spread) * Math.sin(angle))
          .multiplyScalar(RADIUS + offset);
        positions.push(v.x, v.y, v.z);
        if (r < rings && a < segments) {
          const k = r * (segments + 1) + a;
          indices.push(k, k + 1, k + segments + 1, k + 1, k + segments + 2, k + segments + 1);
        }
      }
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const land = mesh(parent, geometry, surface);
    land.material.side = THREE.DoubleSide;
    return land;
  }

  function tree(parent, lat, lon, scale = 1, evergreen = false) {
    const group = surfaceGroup(parent, lat, lon, RADIUS + .04);
    group.scale.setScalar(scale);
    mesh(group, cylinder, palette.wood, [0, .13, 0], [.035, .26, .035]);
    if (evergreen) {
      for (let i = 0; i < 3; i++) mesh(group, cone, i % 2 ? palette.foliage : palette.darkLeaf, [0, .27 + i * .13, 0], [.2 - i * .045, .3, .2 - i * .045]);
    } else {
      mesh(group, smallSphere, palette.foliage, [0, .38, 0], [.18, .23, .18]);
      mesh(group, smallSphere, palette.sage, [.1, .39, .02], [.13, .16, .13]);
      mesh(group, smallSphere, palette.darkGrass, [-.1, .31, .03], [.13, .15, .13]);
    }
  }

  function cloud(parent, position, scale = 1) {
    const group = new THREE.Group();
    group.position.set(...position);
    group.scale.setScalar(scale);
    parent.add(group);
    for (const [x, y, z, r] of [[-.23, 0, 0, .22], [0, .09, 0, .3], [.26, .015, .01, .2], [.04, -.035, .12, .2]]) {
      mesh(group, smallSphere, palette.cloud, [x, y, z], [r, r * .72, r * .8]);
    }
    return group;
  }

  function line(parent, points, color, opacity = .35) {
    const geometry = keep(new THREE.BufferGeometry().setFromPoints(points));
    const surface = keep(new THREE.LineBasicMaterial({color, transparent: true, opacity}));
    const result = new THREE.Line(geometry, surface);
    parent.add(result);
    return result;
  }

  function planet(surface) {
    const root = new THREE.Group();
    const model = new THREE.Group();
    root.add(model);
    scene.add(root);
    mesh(model, sphere, surface, [0, 0, 0], [RADIUS, RADIUS, RADIUS]);
    return {root, model, floaters: []};
  }

  const play = planet(palette.sea);
  island(play.model, 47, -12, .91, palette.shore);
  island(play.model, 47, -12, .885, palette.grass, .035);
  island(play.model, -36, -30, .37, palette.shore, .01, 2);
  island(play.model, -36, -30, .345, palette.darkGrass, .03, 2);
  island(play.model, 8, 110, .62, palette.grass, .035, 1);
  const trees = [[68,-15,.85,true], [50,-42,1.05,false], [64,38,.8,true], [35,-45,.7,true], [61,7,.72,false], [50,43,.9,false], [-34,-29,.65,false], [-43,-34,.5,true]];
  for (const args of trees) tree(play.model, ...args);

  const routePoints = [];
  for (let i = 0; i < 48; i++) {
    const t = i / 48 * TAU;
    routePoints.push(point(34 + 14 * Math.sin(t), -2 + 28 * Math.cos(t), RADIUS + .065));
  }
  const track = new THREE.CatmullRomCurve3(routePoints, true);
  mesh(play.model, keep(new THREE.TubeGeometry(track, 120, .046, 8, true)), palette.cream);
  const ball = mesh(play.model, smallSphere, palette.yellow, track.getPoint(0).toArray(), [.13, .13, .13]);
  const arch = surfaceGroup(play.model, 30, -29, RADIUS + .07);
  mesh(arch, keep(new THREE.TorusGeometry(.26, .062, 10, 36, Math.PI)), palette.peach, [0, .1, 0]);
  mesh(arch, cylinder, palette.peach, [-.26, .05, 0], [.062, .1, .062]);
  mesh(arch, cylinder, palette.peach, [.26, .05, 0], [.062, .1, .062]);
  const blocks = surfaceGroup(play.model, 27, 22, RADIUS + .07);
  for (let i = 0; i < 3; i++) mesh(blocks, cube, i % 2 ? palette.peach : palette.cream, [(i - 1) * .19, .07 + i * .035, 0], [.17, .14 + i * .07, .23]);
  play.floaters.push(cloud(play.model, [-1.33, 1.51, .23], .63), cloud(play.model, [1.45, .66, -.1], .65));

  const calm = planet(palette.water);
  island(calm.model, 51, -5, .73, palette.cream, .022, 1.6);
  island(calm.model, 51, -5, .69, palette.lake, .035, 1.6);
  for (let i = 0; i < 4; i++) {
    const ripple = [];
    const center = point(43, 0, 1);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), center);
    for (let j = 0; j <= 100; j++) {
      const angle = j / 100 * TAU;
      const spread = .14 + i * .1;
      ripple.push(new THREE.Vector3(Math.sin(spread) * Math.cos(angle), Math.sin(spread) * Math.sin(angle), Math.cos(spread)).applyQuaternion(quaternion).multiplyScalar(RADIUS + .045));
    }
    line(calm.model, ripple, '#e2e5e6', .6 - i * .08);
  }
  const calmRing = mesh(calm.model, keep(new THREE.TorusGeometry(2.04, .032, 8, 140)), material('#c3becf', {roughness: .5}), [0, -.04, 0]);
  calmRing.rotation.set(1.2, .12, -.25);
  const fineRing = mesh(calm.model, keep(new THREE.TorusGeometry(2.19, .009, 5, 140)), palette.lilac);
  fineRing.rotation.copy(calmRing.rotation);
  calm.floaters.push(cloud(calm.model, [-.6, 1.72, .5], 1.2), cloud(calm.model, [.79, 1.29, .94], .68));
  mesh(calm.model, smallSphere, palette.cream, [-1.82, 1.35, -.35], [.19, .19, .19]);
  island(calm.model, -40, -33, .24, palette.lilac, .014);

  const release = planet(palette.terra);
  island(release.model, 55, -7, .89, palette.sand, .025, 3);
  island(release.model, -27, -44, .29, palette.rose, .018);
  island(release.model, -3, 63, .46, palette.violet, .012, 2);
  const releaseToys = [];
  const toyData = [[52,-25,.32,palette.coral], [68,20,.28,palette.cream], [34,28,.26,palette.violet], [32,-47,.23,palette.orange], [13,-15,.24,palette.rose], [48,5,.2,palette.cream]];
  for (const [lat, lon, size, surface] of toyData) {
    const group = surfaceGroup(release.model, lat, lon, RADIUS + size * .42);
    const toy = mesh(group, cube, surface, [0, .11, 0], [size, size, size]);
    toy.rotation.set(.1, .3 + lat / 100, .1);
    releaseToys.push({group, toy, base: group.position.clone(), phase: lat});
  }
  const drum = surfaceGroup(release.model, 47, -25, RADIUS + .13);
  mesh(drum, cylinder, palette.violet, [0, .17, 0], [.27, .29, .27]);
  mesh(drum, cylinder, palette.cream, [0, .325, 0], [.285, .025, .285]);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU;
    mesh(drum, smallSphere, palette.yellow, [Math.cos(a) * .271, .24, Math.sin(a) * .271], [.018, .018, .018]);
  }
  const hoop = mesh(release.model, keep(new THREE.TorusGeometry(.44, .12, 16, 48)), palette.orange, [.42, 1.66, .12]);
  hoop.rotation.set(.35, .2, -.4);
  const satellite = mesh(release.model, smallSphere, palette.coral, [1.81, .81, -.15], [.25, .25, .25]);
  release.floaters.push(satellite);
  const satelliteRing = mesh(release.model, keep(new THREE.TorusGeometry(.37, .025, 8, 50)), palette.cream, satellite.position.toArray());
  satelliteRing.rotation.set(.7, -.2, .3);

  const worlds = [play, calm, release];
  worlds.forEach((world, index) => {
    world.model.rotation.set(-.06, index === 0 ? .13 : -.08, index === 2 ? -.12 : .05);
    world.floaters.forEach(item => { item.userData.home = item.position.clone(); });
  });

  let selected = 0, orbit = 0, orbitTarget = 0, entry = 0, entryTarget = 0;
  let disposed = false, active = true, frame = 0, clock = 0, last = 0, spread = 5;
  let bounce = 0, ballProgress = 0, ballTravel = 0, breathing = false, breathStarted = 0;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches;

  function resize() {
    const {width, height} = canvas.getBoundingClientRect();
    if (!width || !height || disposed) return;
    renderer.setSize(width, height, false);
    const frustum = width <= 700 ? 6.05 : 5.9;
    const halfWidth = frustum * width / height / 2;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = frustum / 2 + .3;
    camera.bottom = -frustum / 2 + .3;
    camera.updateProjectionMatrix();
    spread = halfWidth * (width <= 700 ? 1.05 : .78);
    requestFrame();
  }

  function draw(timestamp) {
    frame = 0;
    if (disposed || !active || document.hidden) return;
    const dt = last ? Math.min((timestamp - last) / 1000, .05) : .016;
    last = timestamp;
    clock += dt;
    const ease = reduced ? 1 : 1 - Math.exp(-dt * 6.5);
    orbit += (orbitTarget - orbit) * ease;
    entry += (entryTarget - entry) * ease;
    bounce = Math.max(0, bounce - dt * 1.15);
    if (ballTravel > 0) {
      const travel = Math.min(ballTravel, dt * (reduced ? 2 : .34));
      ballProgress = (ballProgress + travel) % 1;
      ballTravel -= travel;
    }
    ball.position.copy(track.getPoint(ballProgress));
    ball.position.addScaledVector(ball.position.clone().normalize(), .11);

    worlds.forEach((world, index) => {
      const angle = index * TAU / 3 + orbit;
      const prominence = Math.max(0, (Math.cos(angle) + .5) / 1.5);
      const isSelected = selected === index;
      const size = THREE.MathUtils.lerp(.61, 1.21, prominence) * (isSelected ? 1 + entry * .12 : 1 - entry * .96);
      const breatheScale = index === 1 && breathing && !reduced ? 1 + breathPhase(breathStarted, timestamp).expansion * .09 : 1;
      world.root.position.set(Math.sin(angle) * spread * (1 + entry * .4), -.06 + prominence * .03, (Math.cos(angle) - 1) * 1.5);
      world.root.scale.setScalar(size * breatheScale);
      world.model.rotation.y = (index === 0 ? .13 : -.08) + (reduced ? 0 : clock * [.085, .065, .075][index]);
      world.model.position.y = reduced ? 0 : Math.sin(clock * .9 + index) * .025;
      if (index === 2 && bounce > 0 && !reduced) {
        world.model.scale.set(1 + Math.sin(bounce * 12) * bounce * .02, 1 - Math.sin(bounce * 12) * bounce * .025, 1);
      } else world.model.scale.setScalar(1);
      world.floaters.forEach((item, j) => {
        item.position.copy(item.userData.home);
        if (!reduced) item.position.y += Math.sin(clock * .7 + j * 2) * .04;
      });
    });
    releaseToys.forEach(({group, toy, base, phase}, i) => {
      group.position.copy(base);
      if (!reduced && bounce > 0) {
        const lift = Math.abs(Math.sin((1 - bounce) * 7 + i * .35)) * bounce * .7;
        group.position.addScaledVector(base.clone().normalize(), lift);
        toy.rotation.z = .1 + Math.sin((1 - bounce) * 9 + phase) * bounce;
        toy.rotation.x = .1 + Math.sin((1 - bounce) * 7 + phase) * bounce;
      } else {
        toy.rotation.z = .1;
        toy.rotation.x = .1;
      }
    });
    renderer.render(scene, camera);
    const unsettled = Math.abs(orbitTarget - orbit) > .0005 || Math.abs(entryTarget - entry) > .0005;
    if (!reduced || unsettled || ballTravel > 0 || bounce > 0) requestFrame();
  }

  function requestFrame() {
    if (!frame && !disposed && active && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function select(id, immediate = false) {
    const next = IDS.indexOf(id);
    if (next < 0) return;
    let difference = next - selected;
    if (difference > 1) difference -= 3;
    if (difference < -1) difference += 3;
    orbitTarget -= difference * TAU / 3;
    selected = next;
    if (immediate) orbit = orbitTarget;
    requestFrame();
  }
  function visibility() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    if (!document.hidden) requestFrame();
  }
  function updateMotion() {
    reduced = motion.matches;
    requestFrame();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', updateMotion);
  resize();
  requestFrame();

  return {
    select,
    setActive(value) {
      active = value;
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      if (active) resize();
    },
    enter(id) { select(id); entryTarget = 1; requestFrame(); },
    leave() { entryTarget = 0; breathing = false; breathStarted = 0; requestFrame(); },
    pulse() { if (selected === 0) ballTravel = 1; else bounce = 1; requestFrame(); },
    setBreathing(active, startedAt = performance.now()) { breathing = active; if (active) breathStarted = startedAt; requestFrame(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', updateMotion);
      resources.forEach(resource => resource.dispose());
      sun.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
