import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rideRoadAt} from './ride-state.js';
import {loadMolesCharacter} from './moles-character.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = value => Number.isFinite(value) ? value : 0;
const hash = value => {
  const number = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return number - Math.floor(number);
};
const BIKE_COLORS = [0xad492a, 0x314855, 0x98957f, 0x485a40, 0x6c4650, 0xb2b8b5];
// Both model.glb and texture-optimized game.glb retain this mesh identity.
// Geometry/profile inspection: +Z is the front, Y is up; source size is 1.0062785 × 1.1999999 × 1.946810m.
const VERIFIED_TRIPO_MOTORCYCLE = 'tripo_mesh_7885bf4e-3a36-4067-9ea6-831322094b5d';
const smooth = value => {const t = clamp(value, 0, 1); return t * t * (3 - 2 * t);};
function fallPose(remaining, direction, progress) {
  if (!(remaining > 0)) return {active: false, x: 0, y: 1.055, z: .29, pitch: 0, roll: 0, stand: 0, tip: 0};
  const p = clamp(Number.isFinite(progress) ? progress : 1 - remaining / 3, 0, 1), side = direction < 0 ? -1 : 1;
  let x, y, z, pitch, roll, stand = 0;
  if (p < .24) {
    const t = p / .24;
    x = side * 1.8 * smooth(t); y = 1.055 + Math.sin(t * Math.PI) * 1.0;
    z = .29 + t * .5; pitch = t * Math.PI * .6; roll = side * t * Math.PI * .7;
  } else if (p < .64) {
    const t = (p - .24) / .4;
    x = side * (1.8 + t * .7); y = .55 + Math.abs(Math.sin(t * Math.PI * 3)) * .13;
    z = .79 + t * .4; pitch = Math.PI * .6 + t * Math.PI * 4; roll = side * Math.PI * .7;
  } else if (p < .83) {
    const t = smooth((p - .64) / .19);
    x = side * 2.5; y = .55 + t * .505; z = 1.19;
    pitch = Math.PI * .6 * (1 - t); roll = side * Math.PI * .7 * (1 - t); stand = t;
  } else {
    const t = smooth((p - .83) / .17);
    x = side * 2.5 * (1 - t); y = 1.055 + Math.sin(t * Math.PI) * .3; z = .29 + .9 * (1 - t);
    pitch = 0; roll = 0; stand = 1 - t;
  }
  return {active: true, progress: p, x, y, z, pitch, roll, stand,
    tip: side * 1.25 * smooth(p / .17) * (1 - smooth((p - .74) / .24))};
}

/** DOM-free scene graph; physics remains exclusively in ride-state. */
export function createRideWorld({reducedMotion = false} = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(59, 1, .08, 1000);
  const resources = new Set(), cache = new Map(), paintCache = new Map();
  const own = resource => (resources.add(resource), resource);
  const geometry = (name, make) => {if (!cache.has(name)) cache.set(name, own(make())); return cache.get(name);};
  const paint = (name, color, options = {}) => {
    if (!paintCache.has(name)) paintCache.set(name, own(new THREE.MeshStandardMaterial({color, roughness: .65, ...options})));
    return paintCache.get(name);
  };
  const g = {
    box: geometry('box', () => new THREE.BoxGeometry(1, 1, 1)),
    sphere: geometry('sphere', () => new THREE.SphereGeometry(1, 20, 14)),
    rod: geometry('rod', () => new THREE.CylinderGeometry(1, 1, 1, 12)),
  };
  const m = {
    steel: paint('steel', 0x8e999e, {metalness: .75, roughness: .32}),
    frame: paint('frame', 0x252b2e, {metalness: .65, roughness: .4}),
    rubber: paint('rubber', 0x15191c, {roughness: .97}),
    leather: paint('leather', 0x25282a, {roughness: .82}),
    black: paint('black', 0x11191d, {roughness: .58}),
    engine: paint('engine', 0x535d62, {metalness: .8, roughness: .45}),
    visor: paint('visor', 0x182a33, {metalness: .7, roughness: .13}),
    glass: paint('glass', 0xc5d3d6, {metalness: .35, roughness: .13, transparent: true, opacity: .5}),
    lamp: paint('lamp', 0xffebc9, {emissive: 0xffde9c, emissiveIntensity: 1.8, roughness: .2}),
    red: paint('tail-lamp', 0xd33b28, {emissive: 0xff270c, emissiveIntensity: .8}),
    amber: paint('signal', 0xdc9839, {emissive: 0xe78020, emissiveIntensity: .45}),
    pants: paint('pants', 0x273138, {roughness: .91}),
    reflective: paint('reflective', 0xd1d5c8, {roughness: .4}),
  };
  const temp = new THREE.Vector3(), delta = new THREE.Vector3(), dummy = new THREE.Object3D();
  const shade = new THREE.Color();
  let disposed = false, lastState = null, lastImpacts = 0, shake = 0, lastElapsed = 0;
  let importedAsset = null, importedRoots = [], lastFrame = null, width = 960, height = 620;
  let importedTreeAsset = null, treeInstances = [], importedRiderAsset = null;
  const importedTrees = new THREE.Group(); importedTrees.name = 'ride-tripo-trees'; scene.add(importedTrees);
  const treeMatrix = new THREE.Matrix4();
  const cameraTarget = new THREE.Vector3(), desiredEye = new THREE.Vector3(), desiredTarget = new THREE.Vector3();

  function mesh(parent, geom, material, scale = [1, 1, 1], position = [0, 0, 0], name = '') {
    const object = new THREE.Mesh(geom, material);
    object.name = name; object.scale.set(...scale); object.position.set(...position);
    object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
  }
  function linkBetween(object, start, end, radius) {
    object.position.set(...start); delta.set(...end).sub(object.position);
    object.position.addScaledVector(delta, .5);
    object.scale.set(radius, delta.length(), radius);
    object.quaternion.setFromUnitVectors(UP, delta.normalize());
  }
  function rod(parent, material, start, end, radius, name = '') {
    const object = mesh(parent, g.rod, material, [1, 1, 1], [0, 0, 0], name);
    linkBetween(object, start, end, radius); return object;
  }
  const oval = (parent, material, size, position, name) => mesh(parent, g.sphere, material, size, position, name);

  function batchStaticParts(parent) {
    const groups = new Map();
    for (const part of parent.children) {
      if (!part.isMesh || part.material.transparent) continue;
      if (!groups.has(part.material)) groups.set(part.material, []);
      groups.get(part.material).push(part);
    }
    for (const [material, parts] of groups) {
      if (parts.length < 2) continue;
      const transformed = parts.map(part => {part.updateMatrix(); return part.geometry.clone().applyMatrix4(part.matrix);});
      const merged = mergeGeometries(transformed);
      transformed.forEach(geom => geom.dispose());
      if (!merged) continue;
      mesh(parent, own(merged), material, [1, 1, 1], [0, 0, 0], 'batched-mechanical-parts');
      // Retain named anatomical/mechanical anchors for inspection; only the batch is drawn.
      parts.forEach(part => {part.visible = false;});
    }
  }

  function motorcycle(color, index) {
    const root = new THREE.Group(); root.name = index ? `ride-opponent-${index - 1}` : 'ride-player';
    const vehicleRig = new THREE.Group(); vehicleRig.name = 'ride-vehicle-motion'; root.add(vehicleRig);
    const vehicle = new THREE.Group(); vehicle.name = 'ride-procedural-vehicle'; vehicleRig.add(vehicle);
    const riderMotion = new THREE.Group(); riderMotion.name = 'ride-rider-motion'; root.add(riderMotion);
    const riderBody = new THREE.Group(); riderBody.name = 'ride-rider-body'; riderMotion.add(riderBody);
    const rider = new THREE.Group(); rider.name = 'ride-rider'; riderBody.add(rider);
    let importedRider = null, importedHead = null;
    const body = paint(`body-${color}`, color, {metalness: .3, roughness: .32});
    const jacket = paint(`jacket-${index}`, index === 0 ? 0x595c54 : color, {roughness: .88});
    const helmetPaint = paint(`helmet-${index}`, index === 0 ? 0xd6d1c2 : color, {roughness: .3});
    const wheels = [];
    for (const [label, z] of [['front', -.75], ['rear', .73]]) {
      const wheel = new THREE.Group(); wheel.name = `${label}-wheel`; wheel.position.set(0, .335, z); vehicle.add(wheel);
      const tire = mesh(wheel, geometry('tire', () => new THREE.TorusGeometry(.276, .06, 12, 40)), m.rubber,
        [1, 1, 1], [0, 0, 0], `${label}-tire`); tire.rotation.y = Math.PI / 2;
      const rim = mesh(wheel, geometry('rim', () => new THREE.TorusGeometry(.231, .018, 8, 32)), m.steel);
      rim.rotation.y = Math.PI / 2;
      rod(wheel, m.engine, [-.105, 0, 0], [.105, 0, 0], .056, `${label}-hub`);
      for (let spoke = 0; spoke < 10; spoke++) {
        const angle = spoke * Math.PI / 5;
        rod(wheel, m.steel, [0, 0, 0], [0, Math.sin(angle) * .23, Math.cos(angle) * .23], .012);
      }
      const disc = mesh(wheel, geometry('brake-disc', () => new THREE.CylinderGeometry(.168, .168, .012, 32)),
        m.engine, [1, 1, 1], [.077, 0, 0], `${label}-brake-disc`); disc.rotation.z = Math.PI / 2;
      wheels.push(wheel);
      const fender = mesh(vehicle, geometry('fender', () => new THREE.CylinderGeometry(.369, .369, .18, 28, 1, true, 0, Math.PI)),
        label === 'front' ? body : m.black, [1, 1, 1], [0, .335, z], `${label}-fender`);
      fender.rotation.z = Math.PI / 2;
    }
    for (const side of [-1, 1]) {
      rod(vehicle, m.steel, [side * .11, .335, -.75], [side * .11, 1.05, -.47], .025, `front-fork-${side < 0 ? 'left' : 'right'}`);
      rod(vehicle, m.frame, [side * .11, .73, -.595], [side * .11, 1.05, -.47], .036);
      rod(vehicle, m.frame, [side * .17, .43, .08], [side * .11, .335, .73], .041, 'swingarm');
      rod(vehicle, m.frame, [side * .12, 1.0, -.42], [side * .18, .43, .08], .03);
      rod(vehicle, m.frame, [side * .12, 1.0, -.42], [side * .16, .85, .43], .028);
      rod(vehicle, m.frame, [side * .16, .85, .43], [side * .18, .43, .08], .028);
      rod(vehicle, m.steel, [side * .12, .77, .41], [side * .10, .42, .62], .036, 'rear-suspension');
      for (let ring = 0; ring < 6; ring++) {
        const spring = mesh(vehicle, geometry('spring-ring', () => new THREE.TorusGeometry(.045, .008, 6, 14)),
          m.black, [1, 1, 1], [side * .11, .48 + ring * .041, .59 - ring * .024]);
        spring.rotation.x = 1.05;
      }
      rod(vehicle, m.frame, [side * .18, .44, .2], [side * .31, .44, .2], .021, 'foot-peg');
      rod(vehicle, m.frame, [side * .29, 1.11, -.53], [side * .38, 1.31, -.55], .009, 'mirror-stem');
      oval(vehicle, m.frame, [.088, .045, .023], [side * .39, 1.31, -.55], 'mirror');
      mesh(vehicle, g.sphere, m.glass, [.073, .033, .008], [side * .39, 1.31, -.528]);
      oval(vehicle, m.amber, [.028, .023, .036], [side * .23, .93, -.71], 'turn-signal');
    }
    oval(vehicle, body, [.245, .185, .355], [0, .885, -.17], 'fuel-tank');
    mesh(vehicle, geometry('fuel-cap', () => new THREE.CylinderGeometry(.043, .043, .007, 20)),
      m.steel, [1, 1, 1], [0, 1.065, -.14], 'fuel-cap');
    oval(vehicle, m.leather, [.207, .073, .35], [0, .937, .285], 'seat');
    oval(vehicle, body, [.182, .088, .22], [0, .9, .55], 'rear-cowl');
    rod(vehicle, m.engine, [-.21, .53, .01], [.21, .53, .01], .165, 'engine');
    for (let fin = 0; fin < 7; fin++) {
      const metal = mesh(vehicle, g.box, m.engine, [.32, .015, .22], [0, .54 + fin * .025, -.14], 'engine-fin');
      metal.rotation.x = -.24;
    }
    for (const side of [-1, 1]) {
      mesh(vehicle, g.box, body, [.04, .21, .37], [side * .203, .71, .16], 'side-panel').rotation.x = -.12;
    }
    const exhaustPath = new THREE.CatmullRomCurve3([[.13, .64, -.25], [.21, .34, -.18], [.28, .32, .18], [.29, .41, .65]]
      .map(point => new THREE.Vector3(...point)));
    mesh(vehicle, geometry('exhaust-pipe', () => new THREE.TubeGeometry(exhaustPath, 20, .028, 8, false)), m.steel);
    rod(vehicle, m.engine, [.29, .36, .37], [.29, .49, .84], .067, 'exhaust');
    rod(vehicle, m.black, [.29, .49, .83], [.29, .495, .87], .049);
    rod(vehicle, m.steel, [-.30, 1.11, -.53], [.30, 1.11, -.53], .017, 'handlebar');
    for (const side of [-1, 1]) rod(vehicle, m.rubber, [side * .22, 1.11, -.53], [side * .34, 1.11, -.53], .027, 'grip');
    const headlamp = mesh(vehicle, geometry('headlamp', () => new THREE.CylinderGeometry(.126, .126, .1, 28)),
      m.frame, [1, 1, 1], [0, .99, -.635], 'headlight'); headlamp.rotation.x = Math.PI / 2;
    const lens = mesh(vehicle, geometry('lens', () => new THREE.CircleGeometry(.113, 28)), m.lamp,
      [1, 1, 1], [0, .99, -.688]); lens.rotation.y = Math.PI;
    const windscreen = mesh(vehicle, geometry('windscreen', () => new THREE.SphereGeometry(1, 20, 10, Math.PI, Math.PI, .3, .65)),
      m.glass, [.24, .38, .22], [0, 1.08, -.43], 'windscreen');
    windscreen.rotation.x = -.35;
    mesh(vehicle, g.box, m.red, [.16, .035, .04], [0, .92, .737], 'tail-light');
    mesh(vehicle, g.box, m.reflective, [.17, .1, .013], [0, .76, .79], 'registration-plate').rotation.x = -.15;

    oval(rider, m.pants, [.18, .12, .15], [0, 1.055, .29], 'rider-hips');
    rod(rider, jacket, [0, 1.09, .28], [0, 1.48, -.1], .204, 'rider-torso');
    oval(rider, jacket, [.245, .13, .16], [0, 1.43, -.06], 'rider-shoulders');
    rod(rider, m.black, [0, 1.49, -.1], [0, 1.60, -.17], .065, 'rider-neck');
    oval(rider, helmetPaint, [.168, .199, .208], [0, 1.72, -.215], 'rider-helmet');
    oval(rider, m.black, [.145, .075, .115], [0, 1.63, -.31], 'helmet-chin');
    mesh(rider, geometry('visor', () => new THREE.SphereGeometry(1, 24, 12, Math.PI + .14, Math.PI - .28, Math.PI * .33, Math.PI * .31)),
      m.visor, [.172, .202, .213], [0, 1.72, -.215], 'rider-visor');
    if (index === 0) {
      const glyph = ['11110', '00011', '00011', '01110', '00011', '00011', '11110'];
      const pixels = new Uint8Array(40 * 56 * 4);
      for (let y = 0; y < 56; y++) for (let x = 0; x < 40; x++) {
        const offset = (y * 40 + x) * 4;
        pixels.set([244, 233, 206, glyph[Math.floor(y / 8)][Math.floor(x / 8)] === '1' ? 255 : 0], offset);
      }
      const texture = own(new THREE.DataTexture(pixels, 40, 56, THREE.RGBAFormat));
      texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
      const material = own(new THREE.MeshBasicMaterial({map: texture, transparent: true, depthWrite: false}));
      const number = mesh(rider, geometry('jersey-number-plane', () => new THREE.PlaneGeometry(.15, .22)), material,
        [1, 1, 1], [0, 1.435, .25], 'jersey-number-3');
      number.rotation.x = -.77; number.castShadow = false;
    }
    const legs = [];
    for (const side of [-1, 1]) {
      const tag = side < 0 ? 'left' : 'right';
      legs.push({side,
        upper: rod(rider, m.pants, [side * .13, 1.055, .27], [side * .255, .74, -.03], .088, `${tag}-thigh`),
        knee: oval(rider, m.leather, [.076, .096, .073], [side * .255, .74, -.04], `${tag}-knee`),
        lower: rod(rider, m.pants, [side * .255, .74, -.03], [side * .265, .49, .2], .065, `${tag}-shin`),
        boot: oval(rider, m.leather, [.065, .066, .143], [side * .27, .477, .14], `${tag}-boot`),
      });
    }
    const arms = [-1, 1].map(side => {
      const tag = side < 0 ? 'left' : 'right';
      return {side,
        upper: rod(rider, jacket, [0, 0, 0], [0, 1, 0], .075, `${tag}-upper-arm`),
        lower: rod(rider, jacket, [0, 0, 0], [0, 1, 0], .06, `${tag}-forearm`),
        elbow: oval(rider, m.leather, [.073, .076, .073], [0, 0, 0], `${tag}-elbow`),
        glove: oval(rider, m.leather, [.062, .05, .083], [0, 0, 0], `${tag}-glove`),
      };
    });
    wheels.forEach(batchStaticParts); batchStaticParts(vehicle);
    const update = ({time = 0, distance = 0, speed = 0, lean = 0, attackTime = 0, attackSide = 0, attackWindup = 0, recovery = 0, fallTime = 0, fallSide = 1, fallProgress} = {}) => {
      const pose = fallPose(fallTime, fallSide, fallProgress);
      root.rotation.z = -clamp(lean, -1, 1) * (pose.active ? .06 : .36);
      vehicleRig.rotation.z = pose.tip; vehicleRig.position.set(Math.sin(pose.tip) * .18, Math.abs(Math.sin(pose.tip)) * .18, 0);
      riderMotion.position.set(pose.x, pose.y, pose.z);
      riderMotion.rotation.set(pose.pitch, 0, pose.roll - (pose.active ? root.rotation.z : 0));
      riderBody.position.set(0, -1.055, -.29);
      for (const wheel of wheels) wheel.rotation.x = -distance / .335;
      const vibration = reducedMotion ? 0 : Math.sin(time * 22) * Math.min(speed / 30, 1) * .007;
      riderBody.position.y += pose.active ? 0 : vibration;
      rider.rotation.z = recovery > 0 && !pose.active && !reducedMotion ? Math.sin(time * 28) * .02 : 0;
      for (const leg of legs) {
        const s = leg.side, stand = pose.stand;
        const knee = [s * (.255 - stand * .1), .74 - stand * .16, -.03 + stand * .25];
        const foot = [s * (.265 - stand * .11), .49 - stand * .36, .2];
        linkBetween(leg.upper, [s * .13, 1.055, .27], knee, .088);
        linkBetween(leg.lower, knee, foot, .065);
        leg.knee.position.set(...knee); leg.boot.position.set(foot[0], foot[1] - .013, foot[2] - .06);
      }
      for (const arm of arms) {
        const side = arm.side, reach = attackSide === side ? clamp(attackTime * 5, 0, 1) : 0;
        const prepare = !pose.active && attackSide === side && attackWindup > 0 ? .45 + .55 * (1 - clamp(attackWindup / .9, 0, 1)) : 0;
        const shoulder = [side * .214, 1.445, -.08];
        const scatter = pose.active ? (1 - pose.stand) * .75 : 0;
        const elbow = [side * (.29 + reach * .23 + scatter * .22), 1.23 + reach * .19 + prepare * .13, -.29 + reach * .12 + scatter * .18 + prepare * .16];
        const hand = [side * (.29 + reach * .6 + scatter * .5 - prepare * .08), 1.105 + reach * .28 + scatter * .15 + prepare * .26, -.535 + reach * .4 + scatter * .5 + prepare * .22];
        linkBetween(arm.upper, shoulder, elbow, .073); linkBetween(arm.lower, elbow, hand, .057);
        arm.elbow.position.set(...elbow); arm.glove.position.set(...hand);
      }
      // The shared rig's public push curve also supplies a small preparatory
      // arm lift during the warning; this never changes the simulation attack.
      const rigAttackTime = attackTime || (attackWindup > 0 && !pose.active ? .285 - .03 * (1 - clamp(attackWindup / .9, 0, 1)) : 0);
      importedRider?.update({time, attackTime: rigAttackTime, attackSide, attackWindup, fallTime, fallSide,
        fallProgress: pose.progress || 0, stand: pose.stand});
    };
    update(); scene.add(root);
    return {root, vehicle, vehicleRig, rider, update,
      installRider(instance) {
        importedRider?.group.removeFromParent(); importedRider = instance; importedHead = null;
        instance.group.traverse(object => {
          if (object.isBone && object.name.replace(/[^a-z]/gi, '').toLowerCase().endsWith('head')) importedHead ??= object;
          if (index && (object.name === 'jersey-number-3' || object.userData.jersey?.number === '3')) object.visible = false;
        });
        rider.visible = false; riderBody.add(instance.group);
      },
      headPosition(out) {
        if (importedRider?.getHeadPosition) return importedRider.getHeadPosition(out) || out;
        if (importedHead) return importedHead.getWorldPosition(out);
        if (importedRider) return importedRider.group.localToWorld(out.set(0, 1.72, -.215));
        return rider.getObjectByName('rider-helmet').getWorldPosition(out);
      },
      removeRider() {importedRider?.group.removeFromParent(); importedRider = importedHead = null; rider.visible = true;},
    };
  }
  const bikes = BIKE_COLORS.map(motorcycle);

  function grainTexture(asphalt) {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let index = 0; index < size * size; index++) {
      const noise = hash(index + (asphalt ? 16 : 281));
      const fleck = asphalt ? (noise > .965 ? 40 : noise * 18) : noise * 30;
      const base = asphalt ? [45, 49, 51] : [67, 85, 51];
      for (let channel = 0; channel < 3; channel++) data[index * 4 + channel] = base[channel] + fleck;
      data[index * 4 + 3] = 255;
    }
    const texture = own(new THREE.DataTexture(data, size, size, THREE.RGBAFormat));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
  }
  const asphalt = grainTexture(true), grass = grainTexture(false);
  const roadMat = paint('road', 0xffffff, {map: asphalt, bumpMap: asphalt, bumpScale: .008, roughness: .96});
  const earthMat = paint('earth', 0xcbd2ae, {map: grass, roughness: 1, vertexColors: true});
  const shoulderMat = paint('shoulder', 0x77776c, {map: asphalt, roughness: 1});
  const whitePaint = paint('road-paint', 0xd6d3bc, {roughness: .95});
  const centerPaint = paint('center-paint', 0xc2b777, {roughness: .97});
  const SEGMENTS = 96, STEP = 4, START = -32;
  function strip(name, material, offset, halfWidth, elevation = .006) {
    const geom = own(new THREE.BufferGeometry());
    const positions = new Float32Array((SEGMENTS + 1) * 6), uvs = new Float32Array((SEGMENTS + 1) * 4);
    const indices = [];
    for (let index = 0; index < SEGMENTS; index++) indices.push(index * 2, index * 2 + 1, index * 2 + 2, index * 2 + 1, index * 2 + 3, index * 2 + 2);
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));
    geom.setIndex(indices);
    const object = mesh(scene, geom, material, [1, 1, 1], [0, 0, 0], name);
    object.castShadow = false; object.frustumCulled = false;
    return {object, positions, uvs, offset, halfWidth, elevation};
  }
  const strips = [
    strip('ride-road', roadMat, () => 0, half => half),
    strip('left-gravel', shoulderMat, half => -half - .5, () => .5, -.01),
    strip('right-gravel', shoulderMat, half => half + .5, () => .5, -.01),
    strip('left-edge-line', whitePaint, half => -half + .2, () => .06, .016),
    strip('right-edge-line', whitePaint, half => half - .2, () => .06, .016),
  ];
  // Explicit flat shoulder vertices prevent uphill interpolation through asphalt.
  const terrainColumns = [-95, -50, -25, -13, -7.3, -5.3, 0, 5.3, 7.3, 13, 25, 50, 95];
  const terrainGeometry = own(new THREE.BufferGeometry());
  const terrainPositions = new Float32Array((SEGMENTS + 1) * terrainColumns.length * 3);
  const terrainColors = new Float32Array(terrainPositions.length), terrainUV = new Float32Array((SEGMENTS + 1) * terrainColumns.length * 2);
  const terrainIndices = [];
  for (let row = 0; row < SEGMENTS; row++) for (let column = 0; column < terrainColumns.length - 1; column++) {
    const a = row * terrainColumns.length + column, b = a + terrainColumns.length;
    terrainIndices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  terrainGeometry.setAttribute('position', new THREE.BufferAttribute(terrainPositions, 3).setUsage(THREE.DynamicDrawUsage));
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3));
  terrainGeometry.setAttribute('uv', new THREE.BufferAttribute(terrainUV, 2).setUsage(THREE.DynamicDrawUsage));
  terrainGeometry.setIndex(terrainIndices);
  const terrain = mesh(scene, terrainGeometry, earthMat, [1, 1, 1], [0, 0, 0], 'ride-terrain');
  terrain.castShadow = false; terrain.frustumCulled = false;
  function instances(name, geom, material, count) {
    const object = new THREE.InstancedMesh(geom, material, count);
    object.name = name; object.castShadow = true; object.receiveShadow = true; object.frustumCulled = false;
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(object); return object;
  }
  const guardrails = instances('ride-guardrails', g.box, paint('guardrail', 0x98a3a2, {metalness: .7, roughness: .46}), 128);
  const posts = instances('ride-posts', g.box, m.engine, 128);
  const centerLines = instances('ride-center-lines', g.box, centerPaint, 48);
  const finishGate = new THREE.Group(); finishGate.name = 'ride-finish-gate'; finishGate.visible = false; scene.add(finishGate);
  function finishTexture(banner) {
    const width = banner ? 512 : 32, height = banner ? 64 : 4, data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const border = !banner || y < 8 || y >= height - 8;
      const light = border && ((Math.floor(x / (banner ? 8 : 1)) + Math.floor(y / (banner ? 8 : 1))) % 2 === 0);
      data.set(light ? [236, 229, 209, 255] : [31, 39, 41, 255], (y * width + x) * 4);
    }
    if (banner) {
      const letters = {
        F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
        I: ['111', '010', '010', '010', '010', '010', '111'],
        N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
        S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
        H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
      };
      let left = 168;
      for (const letter of 'FINISH') {
        const glyph = letters[letter];
        for (let row = 0; row < 7; row++) for (let column = 0; column < glyph[0].length; column++) if (glyph[row][column] === '1') {
          for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
            data.set([241, 237, 221, 255], ((49 - row * 5 - y) * width + left + column * 5 + x) * 4);
          }
        }
        left += (glyph[0].length + 1) * 5;
      }
    }
    const texture = own(new THREE.DataTexture(data, width, height));
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.needsUpdate = true; return texture;
  }
  const finishPaint = own(new THREE.MeshStandardMaterial({map: finishTexture(false), roughness: .98,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1}));
  const finishLine = mesh(finishGate, geometry('finish-line', () => new THREE.PlaneGeometry(1, 1)), finishPaint,
    [8.6, 1.3, 1], [0, .038, 0], 'ride-finish-line');
  finishLine.rotation.x = -Math.PI / 2; finishLine.castShadow = false;
  const finishBanner = mesh(finishGate, geometry('finish-banner', () => new THREE.PlaneGeometry(1, 1)),
    own(new THREE.MeshStandardMaterial({map: finishTexture(true), roughness: .86, side: THREE.DoubleSide})),
    [9.4, .72, 1], [0, 4.32, .012], 'ride-finish-banner');
  const finishBeam = rod(finishGate, m.steel, [-4.85, 4.72, 0], [4.85, 4.72, 0], .08);
  const finishPosts = [-1, 1].map(side => ({
    side, pole: rod(finishGate, m.steel, [side * 4.85, 0, 0], [side * 4.85, 4.72, 0], .09),
    foot: mesh(finishGate, g.box, m.frame, [.44, .08, .72], [side * 4.85, .04, 0]),
    brace: rod(finishGate, m.steel, [side * 4.85, 3.84, 0], [side * 4.12, 4.72, 0], .045),
  }));
  const trunks = instances('ride-tree-trunks', g.rod, paint('bark', 0x544b40, {roughness: 1}), 84);
  function foliageGeometry(name, seed) {
    return geometry(name, () => {
      const geom = new THREE.IcosahedronGeometry(1, 2), points = geom.attributes.position;
      for (let index = 0; index < points.count; index++) {
        const x = points.getX(index), y = points.getY(index), z = points.getZ(index);
        const radius = .85 + .13 * Math.sin(x * 9 + y * 6 + seed) * Math.cos(z * 7 - y * 4) + .10 * Math.sin(x * 4 - z * 5);
        points.setXYZ(index, x * radius, y * radius, z * radius);
      }
      return geom;
    });
  }
  const trees = instances('ride-trees', foliageGeometry('leaf-cluster', 3), paint('foliage', 0xffffff, {roughness: 1}), 588);
  const pines = instances('ride-pines', foliageGeometry('needle-cluster', 9), paint('pine-leaves', 0x496445, {roughness: 1}), 588);
  const obstacles = new THREE.Group(); obstacles.name = 'ride-obstacles'; scene.add(obstacles);
  for (let index = 0; index < 16; index++) {
    const obstacle = new THREE.Group(); obstacle.visible = false; obstacles.add(obstacle);
    const cone = new THREE.Group(); cone.name = 'traffic-cone'; obstacle.add(cone);
    mesh(cone, g.box, m.rubber, [.44, .055, .44], [0, .027, 0]);
    mesh(cone, geometry('traffic-cone', () => new THREE.ConeGeometry(.165, .64, 20)), m.amber, [1, 1, 1], [0, .35, 0]);
    mesh(cone, geometry('cone-stripe', () => new THREE.CylinderGeometry(.071, .095, .095, 20)), m.reflective, [1, 1, 1], [0, .38, 0]);
    const barrier = new THREE.Group(); barrier.name = 'road-barrier'; obstacle.add(barrier);
    mesh(barrier, g.box, m.reflective, [1.8, .37, .15], [0, .64, 0]);
    for (let stripe = -2; stripe <= 2; stripe++) {
      mesh(barrier, g.box, m.amber, [.12, .37, .015], [stripe * .32, .64, .082]).rotation.z = -.38;
    }
    for (const side of [-1, 1]) {
      mesh(barrier, g.box, m.frame, [.075, .7, .075], [side * .69, .35, 0]);
      mesh(barrier, g.box, m.rubber, [.28, .08, .57], [side * .69, .04, 0]);
    }
    batchStaticParts(barrier); barrier.visible = false;
  }
  const sky = mesh(scene, geometry('sky', () => new THREE.SphereGeometry(800, 24, 16)), own(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {top: {value: new THREE.Color(0x3e8abd)}, horizon: {value: new THREE.Color(0xc1dce2)}},
    vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 direction;
      uniform vec3 top; uniform vec3 horizon;
      void main(){
        vec3 n=normalize(direction);
        vec3 c=mix(horizon,top,pow(max(n.y,0.0),0.42));
        float sun=pow(max(dot(n,normalize(vec3(-0.5,0.55,0.32))),0.0),240.0);
        gl_FragColor=vec4(c+vec3(1.0,0.83,0.56)*sun*0.8,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })), [1, 1, 1], [0, 0, 0], 'ride-sky');
  sky.castShadow = sky.receiveShadow = false;
  // A small linear HDR sky is converted to roughness-filtered reflections by
  // Three.js. Keep sunlight above 1 so polished imported metal can reflect it.
  const environmentWidth = 256, environmentHeight = 128;
  const environmentPixels = new Uint16Array(environmentWidth * environmentHeight * 4);
  const environmentTop = new THREE.Color(0x3e8abd), environmentHorizon = new THREE.Color(0xc1dce2);
  const environmentGround = new THREE.Color(0x48533b), environmentColor = new THREE.Color();
  const sunDirection = new THREE.Vector3(-.5, .55, .32).normalize(), sampleDirection = new THREE.Vector3();
  for (let y = 0; y < environmentHeight; y++) for (let x = 0; x < environmentWidth; x++) {
    const longitude = (x + .5) / environmentWidth * Math.PI * 2, latitude = (y + .5) / environmentHeight * Math.PI;
    sampleDirection.set(-Math.cos(longitude) * Math.sin(latitude), Math.cos(latitude), Math.sin(longitude) * Math.sin(latitude));
    if (sampleDirection.y >= 0) environmentColor.copy(environmentHorizon).lerp(environmentTop, sampleDirection.y ** .42);
    else environmentColor.copy(environmentHorizon).lerp(environmentGround, smooth(-sampleDirection.y * 5));
    const sunlight = Math.max(0, sampleDirection.dot(sunDirection)) ** 240 * 12;
    const offset = (y * environmentWidth + x) * 4;
    environmentPixels[offset] = THREE.DataUtils.toHalfFloat(environmentColor.r + sunlight);
    environmentPixels[offset + 1] = THREE.DataUtils.toHalfFloat(environmentColor.g + sunlight * .83);
    environmentPixels[offset + 2] = THREE.DataUtils.toHalfFloat(environmentColor.b + sunlight * .56);
    environmentPixels[offset + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const environment = own(new THREE.DataTexture(environmentPixels, environmentWidth, environmentHeight, THREE.RGBAFormat, THREE.HalfFloatType));
  environment.mapping = THREE.EquirectangularReflectionMapping; environment.colorSpace = THREE.LinearSRGBColorSpace;
  environment.needsUpdate = true; scene.environment = environment; scene.environmentIntensity = .7;
  const hills = new THREE.Group(); hills.name = 'ride-hills'; scene.add(hills);
  for (let layer = 0; layer < 3; layer++) {
    const geom = own(new THREE.PlaneGeometry(1400, 480, 100, 32).rotateX(-Math.PI / 2));
    const points = geom.attributes.position;
    for (let index = 0; index < points.count; index++) {
      const x = points.getX(index), z = points.getZ(index) - 530 - layer * 190;
      const slope = Math.min(1, Math.max(0, (Math.abs(x) - 45) / 150));
      const valley = slope * slope * (3 - 2 * slope);
      const ridge = 64 + 22 * Math.sin(x * .008 + z * .004 + layer) +
        14 * Math.cos(z * .018 - x * .011) + 8 * Math.sin(x * .03 + z * .024);
      points.setXYZ(index, x, -14 + valley * ridge * (1 + layer * .17), z);
      geom.attributes.uv.setXY(index, x * .03, z * .03);
    }
    geom.computeVertexNormals();
    const material = own(new THREE.MeshStandardMaterial({color: [0x657f61, 0x789387, 0x8ca8a3][layer], roughness: 1, map: grass}));
    const hill = mesh(hills, geom, material); hill.castShadow = hill.receiveShadow = false;
  }
  scene.fog = new THREE.FogExp2(0xb5d0d5, .0039);
  const ambient = new THREE.HemisphereLight(0xd2e7f2, 0x65724e, 1.85); scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffedcf, 2.7);
  sun.position.set(-24, 36, 12); sun.target.position.set(0, 0, -14); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -18, right: 18, top: 26, bottom: -22, near: .5, far: 100});
  sun.shadow.normalBias = .04; sun.shadow.bias = -.0002; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xc2dbe2, .7); fill.position.set(10, 9, -20); scene.add(fill);

  function worldPoint(distance, lateral, reference, out = temp) {
    const road = rideRoadAt(distance);
    out.set(road.x - reference.x + Math.cos(road.heading) * lateral,
      road.y - reference.y, -(distance - reference.distance) - Math.sin(road.heading) * lateral);
    return road;
  }
  function put(object, index, position, scale, yaw = 0) {
    dummy.position.copy(position); dummy.scale.set(...scale); dummy.rotation.set(0, yaw, 0); dummy.updateMatrix();
    object.setMatrixAt(index, dummy.matrix);
  }
  function updateRoad(state, reference) {
    const half = state.config?.roadHalfWidth || 4.2;
    terrainColumns[4] = -half - 3; terrainColumns[5] = -half - 1;
    terrainColumns[7] = half + 1; terrainColumns[8] = half + 3;
    for (let row = 0; row <= SEGMENTS; row++) {
      const distance = state.distance + START + row * STEP;
      for (const strip of strips) {
        for (let side = 0; side < 2; side++) {
          worldPoint(distance, strip.offset(half) + (side ? 1 : -1) * strip.halfWidth(half), reference);
          const index = row * 6 + side * 3;
          strip.positions.set([temp.x, temp.y + strip.elevation, temp.z], index);
          strip.uvs.set([side * strip.halfWidth(half) * 2, distance * .52], row * 4 + side * 2);
        }
      }
      for (let column = 0; column < terrainColumns.length; column++) {
        const lateral = terrainColumns[column], index = row * terrainColumns.length + column;
        worldPoint(distance, lateral, reference);
        const shoulder = Math.max(0, Math.abs(lateral) - half - 1);
        const rise = shoulder * .18 * (1.1 + .65 * Math.sin(distance * .021 + lateral * .027));
        terrainPositions.set([temp.x, temp.y - .045 + rise, temp.z], index * 3);
        const tint = .74 + .2 * hash(Math.floor(distance / 9) + column * 7);
        terrainColors.set([tint, tint, tint * .91], index * 3);
        terrainUV.set([lateral * .19, distance * .19], index * 2);
      }
    }
    for (const strip of strips) {
      strip.object.geometry.attributes.position.needsUpdate = true; strip.object.geometry.attributes.uv.needsUpdate = true;
      strip.object.geometry.computeVertexNormals();
    }
    terrainGeometry.attributes.position.needsUpdate = true; terrainGeometry.attributes.color.needsUpdate = true;
    terrainGeometry.attributes.uv.needsUpdate = true; terrainGeometry.computeVertexNormals();
    const railStart = Math.floor((state.distance - 24) / 6) * 6;
    for (let index = 0; index < 64; index++) {
      const distance = railStart + index * 6;
      for (const [side, sign] of [[0, -1], [1, 1]]) {
        const road = worldPoint(distance, sign * (half + .85), reference);
        temp.y += .71; put(guardrails, index * 2 + side, temp, [.08, .22, 6.08], road.heading);
        temp.y -= .3; put(posts, index * 2 + side, temp, [.085, .86, .075], road.heading);
      }
    }
    for (let index = 0; index < 48; index++) {
      const distance = Math.floor((state.distance - 24) / 8) * 8 + index * 8;
      const road = worldPoint(distance, 0, reference); temp.y += .02;
      put(centerLines, index, temp, [.11, .012, 3.4], road.heading);
    }
    for (const object of [guardrails, posts, centerLines]) object.instanceMatrix.needsUpdate = true;
  }
  function updateScenery(state, reference) {
    const base = Math.floor((state.distance - 24) / 10);
    let foliageCount = 0, pineCount = 0, trunkCount = 0;
    for (let index = 0; index < 84; index++) {
      const row = Math.floor(index / 2), side = index % 2 ? 1 : -1, seed = (base + row) * 13 + side * 37;
      const distance = (base + row) * 10 + hash(seed) * 6;
      if (importedTreeAsset && distance < state.distance + 145) continue;
      const lateral = side * (8 + hash(seed + 9) * 23), h = 4.5 + hash(seed + 18) * 5;
      worldPoint(distance, lateral, reference);
      temp.y += Math.max(0, Math.abs(lateral) - (state.config?.roadHalfWidth || 4.2) - 1) *
        .18 * (1.1 + .65 * Math.sin(distance * .021 + lateral * .027));
      const ground = temp.y, trunkX = temp.x, trunkZ = temp.z;
      temp.y = ground + h * .28; put(trunks, trunkCount++, temp, [.09 + h * .008, h * .56, .09 + h * .008]);
      if (hash(seed + 25) > .38) {
        for (let layer = 0; layer < 7; layer++) {
          const angle = layer * 2.4 + hash(seed) * 6;
          const radius = h * (.08 + .12 * hash(seed + layer * 9));
          temp.set(trunkX + Math.cos(angle) * radius, ground + h * (.45 + layer * .065), trunkZ + Math.sin(angle) * radius);
          const size = h * (.26 - layer * .009);
          put(trees, foliageCount, temp, [size, size * .68, size * (.8 + .3 * hash(seed + layer))], angle);
          shade.setRGB(.13 + hash(seed) * .06, .22 + hash(seed + 4) * .09, .10 + hash(seed + 6) * .045);
          trees.setColorAt(foliageCount++, shade);
        }
      } else {
        for (let layer = 0; layer < 7; layer++) {
          const angle = layer * 2.4 + hash(seed) * 6, size = h * (.27 - layer * .03);
          temp.set(trunkX + Math.cos(angle) * size * .24, ground + h * (.31 + layer * .105), trunkZ + Math.sin(angle) * size * .24);
          put(pines, pineCount++, temp, [size, h * .12, size * (.83 + .2 * hash(seed + layer))], angle);
        }
      }
    }
    trees.count = foliageCount; pines.count = pineCount; trunks.count = trunkCount;
    for (const object of [trees, pines, trunks]) object.instanceMatrix.needsUpdate = true;
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
    if (importedTreeAsset) {
      const start = Math.floor((state.distance - 18) / 14);
      for (let index = 0; index < 24; index++) {
        const row = start + Math.floor(index / 2), side = index % 2 ? 1 : -1, seed = row * 19 + side * 11;
        const distance = row * 14 + hash(seed) * 4;
        const lateral = side * ((state.config?.roadHalfWidth || 4.2) + 3.1 + hash(seed + 5) * 6);
        worldPoint(distance, lateral, reference);
        temp.y += Math.max(0, Math.abs(lateral) - (state.config?.roadHalfWidth || 4.2) - 1) *
          .18 * (1.1 + .65 * Math.sin(distance * .021 + lateral * .027)) - .035;
        dummy.position.copy(temp); dummy.scale.setScalar(.78 + hash(seed + 7) * .5);
        dummy.rotation.set(0, hash(seed + 9) * Math.PI * 2, 0); dummy.updateMatrix();
        for (const entry of treeInstances) {
          treeMatrix.multiplyMatrices(dummy.matrix, entry.localMatrix);
          entry.mesh.setMatrixAt(index, treeMatrix);
        }
      }
      for (const entry of treeInstances) entry.mesh.instanceMatrix.needsUpdate = true;
    }
    hills.position.x = -reference.x * .08;
  }
  function resize(nextWidth, nextHeight) {
    if (disposed || nextWidth <= 0 || nextHeight <= 0) return;
    width = nextWidth; height = nextHeight; camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  function render(state, {boost = false} = {}, dt = 0) {
    if (disposed) return false;
    const reset = lastState !== state || state.elapsed < lastElapsed;
    const activeDt = state.phase === 'running' ? clamp(finite(dt), 0, .1) : 0;
    const reference = {...rideRoadAt(state.distance), distance: state.distance};
    if (reset) {shake = 0; lastImpacts = state.impacts;}
    if (state.impacts > lastImpacts) shake = .38;
    if (activeDt) shake = Math.max(0, shake - activeDt);
    lastImpacts = state.impacts; lastState = state; lastElapsed = state.elapsed;
    updateRoad(state, reference); updateScenery(state, reference);
    const finishDistance = finite(state.config?.raceLength), remaining = finishDistance - state.distance;
    const finished = state.mode === 'race' && state.phase === 'finished';
    finishGate.visible = state.mode === 'race' && finishDistance > 0 && (finished || (remaining >= -20 && remaining <= 330));
    if (finishGate.visible) {
      const finishRoad = worldPoint(finishDistance, 0, reference), half = state.config?.roadHalfWidth || 4.3, edge = half + .55;
      finishGate.position.copy(temp); finishGate.rotation.y = finishRoad.heading;
      finishLine.scale.x = half * 2; finishBanner.scale.x = edge * 2 - .3;
      linkBetween(finishBeam, [-edge, 4.72, 0], [edge, 4.72, 0], .08);
      for (const post of finishPosts) {
        linkBetween(post.pole, [post.side * edge, 0, 0], [post.side * edge, 4.72, 0], .09);
        post.foot.position.x = post.side * edge;
        linkBetween(post.brace, [post.side * edge, 3.84, 0], [post.side * (edge - .73), 4.72, 0], .045);
      }
    }
    for (let index = 0; index < bikes.length; index++) {
      const actor = index ? state.opponents[index - 1] : state, bike = bikes[index];
      const visible = actor && Math.abs(actor.distance - state.distance) < 230;
      bike.root.visible = !!visible; if (!visible) continue;
      const road = worldPoint(actor.distance, actor.lateral, reference);
      bike.root.position.copy(temp); bike.root.rotation.y = road.heading;
      bike.update({time: state.elapsed, distance: actor.distance, speed: actor.speed, lean: actor.lean || 0,
        attackSide: actor.attackSide || 0, attackTime: actor.attackTime || 0, attackWindup: actor.attackWindup || 0,
        recovery: index ? actor.stunned : state.recovery, fallTime: actor.fallTime || 0, fallSide: actor.fallSide || 1,
        fallProgress: actor.fallProgress});
    }
    for (let index = 0; index < obstacles.children.length; index++) {
      const object = state.obstacles[index], model = obstacles.children[index];
      model.visible = !!object && object.distance > state.distance - 15 && object.distance < state.distance + 340;
      if (!model.visible) continue;
      const road = worldPoint(object.distance, object.lateral, reference);
      model.position.copy(temp); model.rotation.y = road.heading;
      model.children[0].visible = object.type !== 'barrier';
      model.children[1].visible = object.type === 'barrier';
    }
    const player = bikes[0].root;
    const playerFalling = state.fallTime > 0;
    const back = 8.2 + clamp(state.speed / 40, 0, 1) * .8 + (playerFalling ? 2.2 : 0);
    desiredEye.set(player.position.x + Math.sin(reference.heading) * back,
      player.position.y + 3.2 + (playerFalling ? .5 : 0), player.position.z + Math.cos(reference.heading) * back);
    worldPoint(state.distance + 8, state.lateral * .45, reference, desiredTarget); desiredTarget.y += .56;
    if (finished) {
      const half = state.config?.roadHalfWidth || 4.3;
      const finishBack = Math.max(11.5, (half + .75) * 1.22 / (Math.tan(59 * Math.PI / 360) * camera.aspect));
      const heading = finishGate.rotation.y;
      desiredEye.copy(finishGate.position).add(new THREE.Vector3(Math.sin(heading) * finishBack, 5, Math.cos(heading) * finishBack));
      desiredTarget.copy(finishGate.position); desiredTarget.y += 1.2;
    }
    if (finished || reset || !lastFrame) {camera.position.copy(desiredEye); cameraTarget.copy(desiredTarget);}
    else if (activeDt) {
      const damping = 1 - Math.exp(-activeDt * 8);
      camera.position.lerp(desiredEye, damping); cameraTarget.lerp(desiredTarget, damping);
    }
    camera.lookAt(cameraTarget);
    if (!finished && !reducedMotion) camera.rotateZ(-state.lean * .027 + Math.sin(state.elapsed * 57) * shake * .018);
    const fov = 59 + Math.min(1, state.speed / (state.config?.maxSpeed || 38)) * (reducedMotion ? 2 : 8) + (boost && state.phase === 'running' && !reducedMotion ? 2 : 0);
    if (finished || reset || activeDt || !lastFrame) camera.fov = finished ? 59 : fov;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
    lastFrame = {state, boost};
    return true;
  }

  function installTripoVehicle(asset, {yaw, name} = {}) {
    if (disposed) {asset.dispose(); return false;}
    const created = [];
    try {
      for (let index = 0; index < bikes.length; index++) {
        const imported = asset.createInstance();
        const orientation = new THREE.Group(); orientation.add(imported); orientation.updateMatrixWorld(true);
        const initial = new THREE.Box3().setFromObject(orientation), initialSize = initial.getSize(new THREE.Vector3());
        const verifiedMotorcycle = !!imported.getObjectByName(VERIFIED_TRIPO_MOTORCYCLE);
        const defaultYaw = verifiedMotorcycle ? Math.PI : initialSize.x > initialSize.z * 1.2 ? Math.PI / 2 : 0;
        orientation.rotation.y = Number.isFinite(yaw) ? yaw : defaultYaw;
        orientation.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(orientation), size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        if (!size.toArray().every(value => Number.isFinite(value) && value > .00001)) throw new Error('Invalid vehicle bounds');
        // Mirrors are wider than the chassis. Preserve the verified bike's wheelbase
        // and saddle height instead of reducing the whole vehicle to a narrow width.
        const scale = Math.min(2.14 / size.z, (verifiedMotorcycle ? 1.15 : .95) / size.x, (verifiedMotorcycle ? 1.4 : 1.35) / size.y);
        const fitted = new THREE.Group(); fitted.add(orientation); fitted.scale.setScalar(scale);
        fitted.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
        const root = new THREE.Group(); root.name = 'ride-tripo-vehicle'; root.userData.assetName = name || asset.name;
        root.userData.vehicleYaw = orientation.rotation.y;
        root.add(fitted);
        imported.traverse(object => {if (object.isMesh) {object.castShadow = true; object.receiveShadow = true;}});
        created.push(root);
      }
      for (const root of importedRoots) root.removeFromParent();
      importedAsset?.dispose(); importedAsset = asset; importedRoots = created;
      for (const [index, root] of created.entries()) {bikes[index].vehicle.visible = false; bikes[index].vehicleRig.add(root);}
      scene.updateMatrixWorld(true); return true;
    } catch (error) {
      created.forEach(root => root.removeFromParent()); asset.dispose(); throw error;
    }
  }
  function installTripoTree(asset, {name} = {}) {
    if (disposed) {asset.dispose(); return false;}
    const created = [];
    try {
      const template = asset.createInstance(); template.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(template), size = bounds.getSize(new THREE.Vector3());
      if (!size.toArray().every(value => Number.isFinite(value) && value > .00001)) throw new Error('Invalid tree bounds');
      const center = bounds.getCenter(new THREE.Vector3()), scale = Math.min(8 / size.y, 6 / Math.max(size.x, size.z));
      const normalization = new THREE.Matrix4().makeScale(scale, scale, scale);
      normalization.setPosition(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      template.traverseVisible(object => {
        if (!object.isMesh) return;
        const tree = new THREE.InstancedMesh(object.geometry, object.material, 24);
        tree.name = 'ride-tripo-tree-mesh'; tree.castShadow = tree.receiveShadow = true; tree.frustumCulled = false;
        tree.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        created.push({mesh: tree, localMatrix: normalization.clone().multiply(object.matrixWorld)});
      });
      if (!created.length) throw new Error('Tree has no visible meshes');
      for (const entry of treeInstances) {entry.mesh.removeFromParent(); entry.mesh.dispose();}
      importedTreeAsset?.dispose(); importedTreeAsset = asset; treeInstances = created;
      importedTrees.userData.assetName = name || asset.name;
      for (const entry of treeInstances) importedTrees.add(entry.mesh);
      return true;
    } catch (error) {
      created.forEach(entry => entry.mesh.dispose()); asset.dispose(); throw error;
    }
  }
  function installTripoRider(asset) {
    if (disposed) {asset.dispose(); return false;}
    const created = [];
    try {
      if (typeof asset?.createInstance !== 'function') throw new Error('骑手模型缺少可用的共享骨骼接口。');
      for (let index = 0; index < bikes.length; index++) {
        const instance = asset.createInstance();
        if (!instance?.group?.isObject3D || typeof instance.update !== 'function') throw new Error('骑手模型缺少可用的骨骼姿态接口。');
        created.push(instance);
      }
      // Helper poses use bike-local metres: hips (0, 1.055, .29), grips
      // (+/-.29, 1.105, -.535), forward -Z. It owns bone poses and the back 3;
      // ride-rider-motion supplies the shared fling/roll/remount root transform.
      bikes.forEach(bike => bike.removeRider()); importedRiderAsset?.dispose(); importedRiderAsset = asset;
      bikes.forEach((bike, index) => bike.installRider(created[index]));
      if (lastFrame) render(lastFrame.state, {boost: lastFrame.boost}, 0);
      else scene.updateMatrixWorld(true);
      return true;
    } catch (error) {
      created.forEach(instance => instance.group.removeFromParent()); asset?.dispose(); throw error;
    }
  }
  function getPlayerLabelPosition() {
    if (disposed) return null;
    const point = bikes[0].headPosition(new THREE.Vector3()); point.y += .32; point.project(camera);
    return {x: (point.x + 1) * width / 2, y: (1 - point.y) * height / 2,
      visible: Number.isFinite(point.x + point.y + point.z) && point.z >= -1 && point.z <= 1};
  }
  function dispose() {
    if (disposed) return;
    disposed = true; importedRoots.forEach(root => root.removeFromParent()); importedRoots = [];
    importedAsset?.dispose(); importedAsset = null;
    bikes.forEach(bike => bike.removeRider()); importedRiderAsset?.dispose(); importedRiderAsset = null;
    for (const entry of treeInstances) {entry.mesh.removeFromParent(); entry.mesh.dispose();}
    treeInstances = []; importedTreeAsset?.dispose(); importedTreeAsset = null;
    sun.shadow.map?.dispose(); sun.shadow.mapPass?.dispose();
    for (const resource of resources) resource.dispose();
    resources.clear(); scene.environment = null; scene.clear();
  }
  return {scene, camera, render, resize, installTripoVehicle, installTripoTree, installTripoRider, getPlayerLabelPosition, dispose};
}

export function createRideScene(canvas, {reducedMotion = false} = {}) {
  let renderer, world, disposed = false, lost = false, releaseDone = false, pending = null, request = 0;
  let treePending = null, treeRequest = 0;
  let riderPending = null, riderRequest = 0;
  const win = canvas.ownerDocument?.defaultView;
  function release() {
    if (releaseDone) return; releaseDone = true;
    canvas.removeEventListener('webglcontextlost', contextLost);
    world?.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
  }
  function contextLost(event) {
    event.preventDefault(); lost = true; pending?.abort(); treePending?.abort(); riderPending?.abort(); release();
  }
  function resize() {
    if (disposed || lost) return false;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return false;
    renderer.setPixelRatio(Math.min(win?.devicePixelRatio || 1, 1.75));
    renderer.setSize(bounds.width, bounds.height, false); world.resize(bounds.width, bounds.height); return true;
  }
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'high-performance'});
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.debug.onShaderError = () => {throw new Error('骑行场景着色器不可用');};
    world = createRideWorld({reducedMotion}); canvas.addEventListener('webglcontextlost', contextLost); resize();
  } catch (error) {release(); throw error;}
  return {
    resize,
    getPlayerLabelPosition: () => disposed || lost ? null : world.getPlayerLabelPosition(),
    render(state, options = {}, dt = 0) {
      if (disposed) return;
      if (lost) throw new Error('骑行场景 WebGL 上下文已丢失');
      try {if (world.render(state, options, dt)) renderer.render(world.scene, world.camera);}
      catch (error) {lost = true; release(); throw error;}
    },
    async setTripoVehicle(buffer, {name = 'Tripo motorcycle', yaw} = {}) {
      if (disposed || lost) return false;
      const current = ++request; pending?.abort(); const abort = new AbortController(); pending = abort;
      let asset;
      try {
        const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        asset = await loadMolesCharacter({name: 'motorcycle.glb', size: bytes.byteLength, arrayBuffer: async () => bytes}, {signal: abort.signal});
        if (disposed || lost || current !== request) {asset.dispose(); return false;}
        world.installTripoVehicle(asset, {name, yaw}); return true;
      } catch (error) {
        asset?.dispose();
        if (abort.signal.aborted || disposed || lost) return false;
        throw error;
      } finally {if (pending === abort) pending = null;}
    },
    async setTripoTree(buffer, {name = 'Tripo pine'} = {}) {
      if (disposed || lost) return false;
      const current = ++treeRequest; treePending?.abort(); const abort = new AbortController(); treePending = abort;
      let asset;
      try {
        const bytes = buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        asset = await loadMolesCharacter({name: 'pine.glb', size: bytes.byteLength, arrayBuffer: async () => bytes}, {signal: abort.signal});
        if (disposed || lost || current !== treeRequest) {asset.dispose(); return false;}
        world.installTripoTree(asset, {name}); return true;
      } catch (error) {
        asset?.dispose();
        if (abort.signal.aborted || disposed || lost) return false;
        throw error;
      } finally {if (treePending === abort) treePending = null;}
    },
    async setTripoRider(buffer, {name = 'Tripo 3'} = {}) {
      if (disposed || lost) return false;
      const current = ++riderRequest; riderPending?.abort(); const abort = new AbortController(); riderPending = abort;
      let asset;
      try {
        const {loadRideTripoRider} = await import('./ride-tripo-rider.js');
        if (disposed || lost || current !== riderRequest) return false;
        asset = await loadRideTripoRider(buffer, {name, signal: abort.signal});
        if (disposed || lost || current !== riderRequest) {asset.dispose(); return false;}
        const readyAsset = asset; asset = null;
        return world.installTripoRider(readyAsset);
      } catch (error) {
        asset?.dispose();
        if (abort.signal.aborted || disposed || lost) return false;
        throw error;
      } finally {if (riderPending === abort) riderPending = null;}
    },
    dispose() {
      if (disposed) return; disposed = true; request++; treeRequest++; riderRequest++;
      pending?.abort(); treePending?.abort(); riderPending?.abort(); pending = treePending = riderPending = null; release();
    },
  };
}
