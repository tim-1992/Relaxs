import * as THREE from 'three';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const number = value => Number.isFinite(value) ? value : 0;
const ROOM_BOUNDS = new THREE.Box3(new THREE.Vector3(-4.45, -.3, -3.45), new THREE.Vector3(4.45, 3.5, 3.45));
const ROOM_COLORS = {
  living: [0xf1eee6, 0xb7ada0, 0xffffff],
  study: [0xe4e2d9, 0x767e78, 0xe5d8c6],
  studio: [0xdcded9, 0x8a8981, 0xeee5d8],
};
const TRIPO_ORDER = ['vase', 'screen', 'sofa'];

function roundedBox(radius = .015) {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 6, 6, 6);
  const points = geometry.attributes.position, point = new THREE.Vector3(), core = new THREE.Vector3();
  for (let index = 0; index < points.count; index++) {
    point.fromBufferAttribute(points, index);
    const edge = .5 - radius;
    core.set(clamp(point.x, -edge, edge), clamp(point.y, -edge, edge), clamp(point.z, -edge, edge));
    point.sub(core).normalize().multiplyScalar(radius).add(core);
    points.setXYZ(index, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Small deterministic textures keep the room self-contained, including file://.
// Color and height use separate color spaces; all maps belong to the world.
function roomTexture(kind, own) {
  const width = kind === 'wood' ? 512 : 128, height = 128;
  const color = new Uint8Array(width * height * 4), bump = new Uint8Array(color.length);
  const base = {wood: [181, 146, 107], plaster: [244, 242, 237], fabric: [226, 222, 213]}[kind];
  const noise = (x, y) => {
    let seed = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
    seed = Math.imul(seed ^ seed >>> 13, 1274126177);
    return ((seed ^ seed >>> 16) >>> 0) / 4294967295;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height, grainNoise = noise(x, y);
    let detail, variation;
    if (kind === 'wood') {
      const flow = v * 37 + Math.sin(u * 9 + v * 5) * .42 + Math.sin(u * 19) * .13;
      const knot = Math.exp(-((u - .34) ** 2 * 90 + (v - .62) ** 2 * 40));
      detail = Math.sin(flow * Math.PI * 2 + knot * 7) * .28 + Math.sin(flow * 23) * .11 + grainNoise * .15;
      variation = detail * .12 + Math.sin(v * 19) * .035 - knot * .09;
    } else if (kind === 'fabric') {
      const warp = (x % 4 < 2 ? 1 : -1), weft = (y % 4 < 2 ? 1 : -1);
      detail = warp * weft * .22 + grainNoise * .28;
      variation = detail * .13;
    } else {
      detail = grainNoise * .42 + noise(x >> 2, y >> 2) * .28;
      variation = (detail - .35) * .045;
    }
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) {
      color[offset + channel] = clamp(base[channel] * (1 + variation), 0, 255);
      bump[offset + channel] = clamp(128 + detail * 90, 0, 255);
    }
    color[offset + 3] = bump[offset + 3] = 255;
  }
  const make = (data, colorSpace) => {
    const texture = own(new THREE.DataTexture(data, width, height));
    texture.name = `${kind}-${colorSpace === THREE.SRGBColorSpace ? 'albedo' : 'height'}`;
    texture.colorSpace = colorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
    if (kind === 'fabric') texture.repeat.set(18, 18);
    texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
    return texture;
  };
  return {map: make(color, THREE.SRGBColorSpace), bumpMap: make(bump, THREE.NoColorSpace)};
}

function daylightEnvironment(own) {
  const width = 256, height = 128, data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    const sky = .16 + .45 * Math.sin(v * Math.PI);
    const window = u > .58 && u < .73 && v > .44 && v < .77 ? 3.5 : 0;
    const bounce = u > .05 && u < .3 && v > .45 && v < .7 ? .65 : 0;
    const offset = (y * width + x) * 4;
    data[offset] = sky * 1.07 + window + bounce;
    data[offset + 1] = sky + window * .96 + bounce * .88;
    data[offset + 2] = sky * .9 + window * .87 + bounce * .73;
    data[offset + 3] = 1;
  }
  const texture = own(new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType));
  texture.name = 'room-daylight-reflections'; texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

function alignFurnitureHeading(template, kind) {
  if (!['screen', 'sofa'].includes(kind)) return;
  const meshes = [];
  let vertices = 0;
  template.traverse(object => {
    if (object.isMesh && !object.isInstancedMesh && object.geometry.attributes.position) {
      meshes.push(object); vertices += object.geometry.attributes.position.count;
    }
  });
  const step = Math.max(1, Math.ceil(vertices / 8192)), point = new THREE.Vector3();
  let count = 0, x = 0, z = 0, xx = 0, zz = 0, xz = 0;
  for (const mesh of meshes) for (let index = 0; index < mesh.geometry.attributes.position.count; index += step) {
    mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
    count++; x += point.x; z += point.z; xx += point.x ** 2; zz += point.z ** 2; xz += point.x * point.z;
  }
  if (count < 3) return;
  xx = xx / count - (x / count) ** 2; zz = zz / count - (z / count) ** 2;
  xz = xz / count - x * z / count ** 2;
  const spread = Math.hypot(xx - zz, 2 * xz), major = (xx + zz + spread) / 2, minor = (xx + zz - spread) / 2;
  // Tripo can bake a three-quarter presentation angle into the vertices.
  // Align clearly elongated furniture along room X, without deforming it.
  if (major > Math.max(1e-8, minor * 2.5)) template.rotation.y += .5 * Math.atan2(2 * xz, xx - zz);
  template.updateMatrixWorld(true);
  if (kind === 'sofa') {
    // The high back distinguishes the two PCA directions. Match the room's
    // +Z-facing seating convention instead of displaying the sofa's rear.
    const bounds = new THREE.Box3().setFromObject(template, true), size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    let upperZ = 0, upperCount = 0;
    for (const mesh of meshes) for (let index = 0; index < mesh.geometry.attributes.position.count; index += step) {
      mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld);
      if (point.y > bounds.max.y - size.y * .22) {upperZ += point.z; upperCount++;}
    }
    if (upperCount && upperZ / upperCount > center.z + size.z * .03) template.rotation.y += Math.PI;
    template.updateMatrixWorld(true);
  }
}

/** Real, DOM-free scene graph. The browser adapter below owns only WebGL sizing/lifecycle. */
export function createDemoWorld({reducedMotion = false} = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x292c2b);
  const camera = new THREE.PerspectiveCamera(36, 1.6, .1, 100);
  const resources = new Set(), surfaces = new Map(), records = new Map();
  const tripoAssets = new Map(), pendingAssets = new Map(), importedInstances = new Map();
  const own = resource => (resources.add(resource), resource);
  const paint = (color, options = {}) => own(new THREE.MeshStandardMaterial({color, roughness: .72, ...options}));
  const wood = roomTexture('wood', own), plaster = roomTexture('plaster', own), fabric = roomTexture('fabric', own);
  scene.environment = daylightEnvironment(own); scene.environmentIntensity = .48;
  let disposed = false, currentRoom = null, previousHits = 0, view = 'front', width = 960, height = 600;
  const furniture = new THREE.Group(); furniture.name = 'demo-furniture'; scene.add(furniture);
  const ray = new THREE.Raycaster();
  const supportRay = new THREE.Raycaster(), supportBounds = new THREE.Box3();
  const g = {
    box: own(roundedBox()), slab: own(new THREE.BoxGeometry(1, 1, 1, 4, 4, 4)),
    soft: own(roundedBox(.09)), plane: own(new THREE.PlaneGeometry(1, 1, 4, 4)),
    cylinder: own(new THREE.CylinderGeometry(.5, .5, 1, 32)),
    ball: own(new THREE.SphereGeometry(.5, 20, 14)),
    rim: own(new THREE.TorusGeometry(.46, .025, 6, 36)),
    shade: own(new THREE.CylinderGeometry(.29, .5, 1, 24, 1, true)),
    vase: own(new THREE.LatheGeometry([[0, -.5], [.25, -.5], [.40, -.40], [.5, -.13],
      [.44, .10], [.23, .31], [.19, .48], [.22, .5]].map(([x, y]) => new THREE.Vector2(x, y)), 28)),
    bottle: own(new THREE.LatheGeometry([[0, -.5], [.38, -.5], [.43, -.43], [.43, .12],
      [.22, .28], [.16, .32], [.16, .5]].map(([x, y]) => new THREE.Vector2(x, y)), 24)),
  };
  const colors = {
    cream: paint(0xece9e1), wood: paint(0xa2917e, {...wood, bumpScale: .012, roughness: .46}),
    dark: paint(0x282a29), pages: paint(0xe6dfcb), trim: paint(0xb6ac99),
    steel: paint(0x777570, {metalness: .85, roughness: .25}),
    screen: paint(0x121a1d, {metalness: .22, roughness: .12}),
    coral: paint(0x886b55), glow: paint(0xffe1ac, {emissive: 0xffce88, emissiveIntensity: .6}),
    linen: paint(0xd2ccc0, {...fabric, bumpScale: .002, roughness: .96, side: THREE.DoubleSide}),
  };
  const wallPaint = paint(ROOM_COLORS.living[0], {...plaster, bumpScale: .018, roughness: .96});
  const rugPaint = paint(ROOM_COLORS.living[1], {...fabric, bumpScale: .003, roughness: 1});
  function part(parent, geometry, material, size, position = [0, 0, 0], name = '', rotation = null) {
    const object = new THREE.Mesh(geometry, material);
    object.scale.set(...size); object.position.set(...position);
    if (rotation) object.rotation.set(...rotation);
    object.name = name; object.castShadow = true; object.receiveShadow = true; parent.add(object);
    return object;
  }
  const box = (parent, material, size, position, name) => part(parent, g.box, material, size, position, name);
  const slab = (parent, material, size, position, name) => part(parent, g.slab, material, size, position, name);
  const padded = (parent, material, size, position, name) => part(parent, g.soft, material, size, position, name);
  function surface(value) {
    const key = `${value.kind}/${value.material}/${value.color}`;
    if (!surfaces.has(key)) {
      const timber = ['table', 'cabinet', 'shelf'].includes(value.kind) || value.kind === 'chair' && value.material === 'wood';
      const cloth = value.material === 'fabric';
      const tint = new THREE.Color(value.color ?? 0xbca68b).lerp(new THREE.Color(0x8b8171), .62);
      if (timber) tint.setHex(value.kind === 'cabinet' ? 0xe3d8c7 : 0xbda98c);
      if (value.kind === 'sofa') tint.setHex(0xb5b0a4);
      if (value.kind === 'vase') tint.lerp(new THREE.Color(0xe5ded0), .7);
      surfaces.set(key, new THREE.MeshStandardMaterial({
        color: tint, ...(timber ? wood : cloth ? fabric : {}),
        bumpScale: cloth ? .002 : .008,
        roughness: timber ? .5 : {glass: .25, fabric: .95, metal: .32}[value.material] ?? .75,
        metalness: value.material === 'metal' ? .65 : 0, side: THREE.DoubleSide,
      }));
    }
    return surfaces.get(key);
  }
  function legs(parent, material, y, height, x = .38, z = .35, thickness = .085) {
    for (const a of [-1, 1]) for (const b of [-1, 1]) box(parent, material, [thickness, height, thickness], [a * x, y, b * z], 'furniture-leg');
  }
  const crackGeometry = own(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-.15, .37, .508), new THREE.Vector3(.03, .18, .51),
    new THREE.Vector3(.03, .18, .51), new THREE.Vector3(-.08, -.02, .51),
    new THREE.Vector3(-.08, -.02, .51), new THREE.Vector3(.16, -.22, .508),
    new THREE.Vector3(.03, .18, .51), new THREE.Vector3(.23, .26, .51),
    new THREE.Vector3(-.08, -.02, .51), new THREE.Vector3(-.29, -.13, .51),
    new THREE.Vector3(.16, -.22, .508), new THREE.Vector3(.11, -.4, .508),
  ]));
  const crackPaint = own(new THREE.LineBasicMaterial({color: 0x4b3832}));
  const colliderPaint = own(new THREE.MeshBasicMaterial({transparent: true, opacity: 0, depthWrite: false, colorWrite: false}));
  const contactData = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const distance = Math.hypot((x - 31.5) / 32, (y - 31.5) / 32);
    const alpha = Math.round(Math.exp(-distance * distance * 4.5) * clamp((1 - distance) * 5, 0, 1) * 255);
    contactData.fill(alpha, (y * 64 + x) * 4, (y * 64 + x) * 4 + 4);
  }
  const contactMap = own(new THREE.DataTexture(contactData, 64, 64));
  contactMap.magFilter = THREE.LinearFilter; contactMap.needsUpdate = true;
  const contactPaint = own(new THREE.MeshBasicMaterial({color: 0x30281c, alphaMap: contactMap,
    transparent: true, opacity: .28, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1}));
  const artData = new Uint8Array(256 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
    const u = x / 256, v = y / 128;
    const hill = .34 + Math.sin(u * 5.2) * .07 + Math.sin(u * 12) * .025;
    const front = .15 + Math.sin(u * 7 + 2) * .065;
    const color = v < front ? [73, 83, 76] : v < hill ? [123, 134, 125] : [213 + v * 24, 205 + v * 22, 184 + v * 26];
    const sun = Math.hypot((u - .72) * 2, v - .70) < .115;
    const index = (y * 256 + x) * 4;
    for (let channel = 0; channel < 3; channel++) artData[index + channel] = sun ? [225, 190, 133][channel] : color[channel];
    artData[index + 3] = 255;
  }
  const artMap = own(new THREE.DataTexture(artData, 256, 128));
  artMap.colorSpace = THREE.SRGBColorSpace; artMap.magFilter = THREE.LinearFilter; artMap.needsUpdate = true;
  const artPaint = paint(0xffffff, {map: artMap, roughness: .95});

  function disposeInstance(instance) {
    if (!instance || instance.disposed) return;
    instance.disposed = true;
    for (const material of instance.materials) material.dispose();
    const skeletons = new Set();
    instance.model.traverse(object => {
      if (object.isInstancedMesh) object.dispose();
      if (object.skeleton && !skeletons.has(object.skeleton)) {
        skeletons.add(object.skeleton); object.skeleton.dispose();
      }
    });
    instance.model.removeFromParent(); instance.model.clear();
  }
  function releaseImported(root) {
    disposeInstance(importedInstances.get(root));
    importedInstances.delete(root);
  }
  function prepareImported(value, slot) {
    const model = new THREE.Group(); model.name = 'demo-tripo-model';
    const materials = new Map(), instance = {model, materials: new Set(), disposed: false};
    try {
      const copy = slot.clone(slot.template);
      model.add(copy);
      copy.traverse(object => {
        if (!object.isMesh) return;
        object.userData.demoId = value.id;
        object.castShadow = object.receiveShadow = true;
        const uniqueMaterial = source => {
          if (!materials.has(source)) {
            const material = source.clone();
            materials.set(source, material); instance.materials.add(material);
          }
          return materials.get(source);
        };
        object.material = Array.isArray(object.material) ? object.material.map(uniqueMaterial) : uniqueMaterial(object.material);
      });
      const {size, center, minY} = slot.bounds;
      // The original screen envelope describes its thin panel. A complete GLB
      // also has a stand; allow realistic stand depth within a cabinet footprint.
      const envelope = {...value.size, z: value.kind === 'screen' ? Math.max(value.size.z, value.size.y * .38) : value.size.z};
      const fit = Math.min(...['x', 'y', 'z'].map(axis => size[axis] > 1e-8 ? envelope[axis] / size[axis] : Infinity));
      if (!(fit > 0) || !Number.isFinite(fit)) throw new Error('家具尺寸无效。');
      instance.dimensions = size.clone().multiplyScalar(fit);
      // Roots keep their original nonuniform collider scale. Cancel that scale
      // here, leaving the GLB uniformly scaled in world space and bottom aligned.
      model.scale.set(fit / value.size.x, fit / value.size.y, fit / value.size.z);
      model.position.set(-center.x * fit / value.size.x,
        -.5 - minY * fit / value.size.y, -center.z * fit / value.size.z);
      return instance;
    } catch (error) {disposeInstance(instance); throw error;}
  }
  function installImported(root, value, slot, instance = prepareImported(value, slot)) {
    releaseImported(root);
    const body = root.getObjectByName('demo-body');
    body.clear(); body.rotation.set(0, 0, 0); body.add(instance.model);
    // Thin or hollow imported models retain the original easy-to-hit footprint.
    const collider = new THREE.Mesh(g.box, colliderPaint);
    collider.name = 'demo-pick-collider'; collider.userData.demoId = value.id;
    collider.scale.z = Math.max(1, instance.dimensions.z / value.size.z);
    body.add(collider);
    importedInstances.set(root, instance);
    root.userData.tripoKind = value.kind; root.userData.tripoName = slot.asset.name;
  }
  function loadedKinds() {
    return disposed ? [] : [...tripoAssets.keys()].sort((a, b) => {
      const rank = kind => TRIPO_ORDER.includes(kind) ? TRIPO_ORDER.indexOf(kind) : TRIPO_ORDER.length;
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }
  async function setTripoAssets(assets = {}) {
    if (disposed || !assets || typeof assets !== 'object') return {loaded: loadedKinds(), failed: []};
    const updates = Object.keys(assets).map(async kind => {
      pendingAssets.get(kind)?.abort.abort();
      const request = {abort: new AbortController()};
      pendingAssets.set(kind, request);
      const stale = () => disposed || request.abort.signal.aborted || pendingAssets.get(kind) !== request;
      let asset = null;
      const staged = [];
      try {
        const input = assets[kind], bytes = input?.buffer;
        if (!(bytes instanceof ArrayBuffer)) throw new Error('家具需要嵌入的 GLB ArrayBuffer。');
        // Lazy imports keep the procedural room available even without assets.
        // The existing parser rejects external URIs and owns GLB textures/images.
        const [{loadMolesCharacter}, {clone}] = await Promise.all([
          import('./moles-character.js'), import('three/addons/utils/SkeletonUtils.js'),
        ]);
        if (stale()) return null;
        const name = String(input.name || `${kind}.glb`);
        asset = await loadMolesCharacter({
          name: /\.glb$/i.test(name) ? name : `${name}.glb`,
          size: bytes.byteLength, arrayBuffer: async () => bytes,
        }, {signal: request.abort.signal});
        if (stale()) {asset.dispose(); return null;}
        // One parser-owned template avoids accumulating tracked instances across
        // room resets. Per-object skeletons/materials have their own short lifetime.
        const template = asset.createInstance();
        template.updateMatrixWorld(true);
        alignFurnitureHeading(template, kind);
        const bounds = new THREE.Box3().setFromObject(template, true);
        const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
        if (bounds.isEmpty() || ![...size.toArray(), ...center.toArray()].every(Number.isFinite)) throw new Error('家具模型没有有效的边界。');
        const slot = {asset, template, clone, bounds: {size, center, minY: bounds.min.y}};
        for (const record of records.values()) if (record.value.kind === kind) {
          staged.push({record, instance: prepareImported(record.value, slot)});
        }
        const previous = tripoAssets.get(kind);
        tripoAssets.set(kind, slot);
        for (const {record, instance} of staged) installImported(record.root, record.value, slot, instance);
        previous?.asset.dispose();
        scene.updateMatrixWorld(true);
        return null;
      } catch (error) {
        for (const {instance} of staged) disposeInstance(instance);
        asset?.dispose();
        return stale() ? null : {kind, message: error instanceof Error ? error.message : '家具载入失败。'};
      } finally {
        if (pendingAssets.get(kind) === request) pendingAssets.delete(kind);
      }
    });
    const failures = await Promise.all(updates);
    return {loaded: loadedKinds(), failed: failures.filter(Boolean)};
  }

  function build(value) {
    const root = new THREE.Group(), skin = surface(value);
    const body = new THREE.Group(); body.name = 'demo-body'; root.add(body);
    root.userData.demoId = value.id;
    switch (value.kind) {
      case 'sofa':
        padded(body, skin, [.98, .24, .90], [0, -.23, .02], 'sofa-base');
        padded(body, skin, [.98, .54, .18], [0, .21, -.40], 'sofa-back');
        for (const side of [-1, 1]) {
          padded(body, skin, [.10, .43, .88], [side * .44, -.055, .02], 'sofa-arm');
          padded(body, skin, [.38, .18, .66], [side * .20, .015, .10], 'sofa-seat');
          const back = padded(body, skin, [.38, .34, .15], [side * .20, .27, -.27], 'sofa-back-cushion');
          back.rotation.x = -.10;
          box(body, colors.linen, [.37, .007, .012], [side * .2, .047, .431], 'sofa-seat-piping');
        }
        legs(body, colors.wood, -.425, .15, .39, .32, .045);
        break;
      case 'table':
        box(body, skin, [1, .065, 1], [0, .4675, 0], 'table-top');
        box(body, colors.wood, [.89, .09, .84], [0, .39, 0], 'table-apron');
        legs(body, skin, -.055, .89, .41, .37, .042);
        break;
      case 'cabinet':
        box(body, skin, [1, .88, .96], [0, .06, 0], 'cabinet-body');
        for (const side of [-1, 1]) {
          box(body, skin, [.47, .79, .045], [side * .245, .06, .496], 'cabinet-door');
          box(body, colors.steel, [.025, .15, .04], [side * .075, .08, .536], 'cabinet-handle');
        }
        legs(body, colors.wood, -.44, .12, .39, .34);
        break;
      case 'shelf':
        box(body, skin, [1, 1, .065], [0, 0, -.465], 'shelf-back');
        for (const side of [-1, 1]) box(body, skin, [.075, 1, 1], [side * .46, 0, 0], 'shelf-upright');
        // The existing 2.4m shelves support books at y=.52 and y=1.35.
        for (const y of [-.478, -.306, .04, .478]) box(body, skin, [.96, .044, 1], [0, y, 0], 'shelf-board');
        break;
      case 'chair':
        padded(body, colors.linen, [.88, .12, .8], [0, -.02, .06], 'chair-seat');
        padded(body, colors.linen, [.88, .46, .11], [0, .25, -.36], 'chair-back');
        for (const side of [-1, 1]) box(body, skin, [.035, .82, .04], [side * .34, -.06, -.36], 'chair-back-rail');
        legs(body, skin, -.29, .42, .34, .30, .042);
        break;
      case 'screen':
        box(body, colors.dark, [1, .76, .14], [0, .12, 0], 'screen-bezel');
        box(body, colors.screen, [.97, .715, .022], [0, .12, .082], 'screen-glass');
        part(body, g.ball, colors.glow, [.004, .004, .014], [.43, -.25, .105], 'screen-status-light');
        for (const side of [-1, 1]) {
          const foot = box(body, colors.dark, [.018, .23, .54], [side * .33, -.365, .05], 'screen-foot');
          foot.rotation.z = side * -.3;
        }
        break;
      case 'vase':
        part(body, g.vase, skin, [1, 1, 1], [0, 0, 0], 'vase-body');
        part(body, g.rim, colors.cream, [.47, .47, .47], [0, .493, 0], 'vase-lip', [Math.PI / 2, 0, 0]);
        part(body, g.cylinder, colors.dark, [.33, .012, .33], [0, .47, 0], 'vase-opening');
        break;
      case 'bottle':
        part(body, g.bottle, skin, [1, 1, 1], [0, 0, 0], 'bottle-body');
        part(body, g.cylinder, colors.cream, [.872, .25, .872], [0, -.09, 0], 'bottle-label');
        part(body, g.cylinder, colors.steel, [.36, .07, .36], [0, .47, 0], 'bottle-cap');
        break;
      case 'book':
        if (value.size.x < value.size.y) body.rotation.z = Math.PI / 2;
        box(body, colors.pages, [.88, .83, .91], [.02, 0, .025], 'book-pages');
        for (const side of [-1, 1]) box(body, skin, [1, .065, 1], [0, side * .466, 0], 'book-cover');
        box(body, skin, [.10, 1, 1], [-.45, 0, 0], 'book-spine');
        for (const y of [-.22, 0, .22]) box(body, colors.trim, [.79, .01, .012], [.04, y, .485], 'page-edge');
        break;
      case 'cushion':
        padded(body, skin, [1, .88, 1], [0, 0, 0], 'cushion-body');
        part(body, g.rim, colors.trim, [.92, .92, .30], [0, 0, 0], 'cushion-seam', [Math.PI / 2, 0, 0]);
        break;
      case 'lamp':
        part(body, g.cylinder, skin, [.47, .055, .47], [0, -.473, 0], 'lamp-foot');
        part(body, g.cylinder, skin, [.055, .72, .055], [0, -.1, 0], 'lamp-stem');
        part(body, g.shade, colors.linen, [1, .32, 1], [0, .34, 0], 'lamp-shade');
        part(body, g.ball, colors.glow, [.15, .12, .15], [0, .22, 0], 'lamp-bulb');
        part(body, g.rim, skin, [1, 1, 1], [0, .18, 0], 'lamp-rim', [Math.PI / 2, 0, 0]);
        break;
      case 'picture':
        box(body, colors.wood, [1, 1, .7], [0, 0, 0], 'picture-frame');
        box(body, colors.cream, [.94, .92, .12], [0, 0, .40], 'picture-paper');
        part(body, g.plane, artPaint, [.80, .76, 1], [0, 0, .468], 'picture-landscape');
        break;
      case 'speaker':
        box(body, skin, [.95, 1, .92], [0, 0, 0], 'speaker-body');
        box(body, colors.dark, [.81, .89, .045], [0, 0, .485], 'speaker-front');
        for (const [diameter, y] of [[.53, -.18], [.25, .29]]) {
          part(body, g.cylinder, colors.steel, [diameter, .035, diameter], [0, y, .522], 'speaker-rim', [Math.PI / 2, 0, 0]);
          part(body, g.ball, colors.dark, [diameter * .8, diameter * .8, .055], [0, y, .55], 'speaker-cone');
        }
        break;
      default:
        box(body, skin, [1, 1, 1], [0, 0, 0], 'unknown-prop');
    }
    root.traverse(child => { if (child.isMesh) child.userData.demoId = value.id; });
    const cracks = new THREE.LineSegments(crackGeometry, crackPaint);
    cracks.name = 'damage-cracks'; cracks.visible = false; root.add(cracks);
    if (value.position.y - value.size.y / 2 < .025) {
      const contact = part(root, g.plane, contactPaint, [1.08, 1.08, 1],
        [0, -.5 + .003 / value.size.y, 0], 'furniture-contact-shadow', [-Math.PI / 2, 0, 0]);
      contact.castShadow = contact.receiveShadow = false;
      contact.userData.demoId = value.id; contact.userData.demoPickIgnore = true;
    }
    if (tripoAssets.has(value.kind)) installImported(root, value, tripoAssets.get(value.kind));
    return root;
  }

  const shell = new THREE.Group(); shell.name = 'demo-room'; scene.add(shell);
  box(shell, colors.dark, [8.3, .12, 6.3], [0, -.10, 0], 'room-plinth');
  const floorMaterial = paint(0xffffff, {...wood, roughness: .43, bumpScale: .012});
  // Long, narrow boards with staggered joints. The top stays at the simulation's
  // floor height; furniture never hovers over a lowered decorative floor.
  const boardLayout = [];
  for (let row = 0; row < 30; row++) {
    const offset = (row % 3) * .57;
    for (let start = -4.1 - offset; start < 4.1; start += 1.9) {
      const left = Math.max(-4.1, start), right = Math.min(4.1, start + 1.9);
      if (right > left) boardLayout.push({x: (left + right) / 2, z: -3 + row * .207,
        length: right - left - .004, shade: .89 + ((row * 7 + Math.round(start * 10)) & 7) * .016});
    }
  }
  const boards = new THREE.InstancedMesh(g.box, floorMaterial, boardLayout.length); own(boards);
  boards.name = 'floorboards'; boards.receiveShadow = true; shell.add(boards);
  const transform = new THREE.Object3D(), instanceColor = new THREE.Color();
  boardLayout.forEach((board, index) => {
    transform.position.set(board.x, -.021, board.z);
    transform.scale.set(board.length, .04, .203); transform.updateMatrix();
    boards.setMatrixAt(index, transform.matrix);
    boards.setColorAt(index, instanceColor.setHex(ROOM_COLORS.living[2]).multiplyScalar(board.shade));
  });
  // Four plaster sections leave a real aperture; the window light can enter.
  const rearWall = new THREE.Group(); rearWall.name = 'rear-wall'; shell.add(rearWall);
  slab(rearWall, wallPaint, [8.3, 1.25, .16], [0, .625, -3.16], 'wall-below-window');
  slab(rearWall, wallPaint, [8.3, .35, .16], [0, 3.125, -3.16], 'wall-above-window');
  slab(rearWall, wallPaint, [5.40, 1.70, .16], [-1.45, 2.1, -3.16], 'wall-left-of-window');
  slab(rearWall, wallPaint, [.45, 1.70, .16], [3.925, 2.1, -3.16], 'wall-right-of-window');
  const leftWall = slab(shell, wallPaint, [.12, 2.8, 2.8], [-4.12, 1.33, -1.74], 'left-wall');
  const rightWall = slab(shell, wallPaint, [.12, 2.8, 2.8], [4.12, 1.33, -1.74], 'right-wall');
  box(shell, colors.cream, [8.2, .13, .045], [0, .065, -3.055], 'skirting');
  for (const side of [-1, 1]) box(side === -1 ? leftWall : rightWall, colors.cream,
    [.38, .047, .985], [-side * .4, -.45, 0], 'side-skirting');
  box(shell, rugPaint, [4.4, .018, 3.2], [-.35, .006, .8], 'room-rug');
  const binding = paint(0x958a78, {...fabric, bumpScale: .003, roughness: 1});
  for (const z of [-.755, 2.355]) box(shell, binding, [4.3, .004, .025], [-.35, .018, z], 'rug-binding');
  const window = new THREE.Group(); window.name = 'room-window'; window.position.set(2.475, 2.1, -3.08); shell.add(window);
  for (const x of [-1.225, 1.225]) box(window, colors.cream, [.065, 1.77, .14], [x, 0, 0], 'window-jamb');
  for (const y of [-.85, .85]) box(window, colors.cream, [2.5, .065, .14], [0, y, 0], 'window-frame');
  box(window, colors.cream, [.046, 1.7, .12], [0, 0, 0], 'window-mullion');
  box(window, colors.cream, [2.45, .04, .12], [0, .1, 0], 'window-crossbar');
  box(window, colors.cream, [2.64, .065, .30], [0, -.89, .045], 'window-sill');
  const skyData = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const horizon = clamp((y - 12 - Math.sin(x * .16) * 4) / 35, 0, 1), index = (y * 64 + x) * 4;
    skyData[index] = 143 + horizon * 94; skyData[index + 1] = 164 + horizon * 79;
    skyData[index + 2] = 136 + horizon * 111; skyData[index + 3] = 255;
  }
  const skyMap = own(new THREE.DataTexture(skyData, 64, 64));
  skyMap.colorSpace = THREE.SRGBColorSpace; skyMap.magFilter = THREE.LinearFilter; skyMap.needsUpdate = true;
  const outside = part(window, own(new THREE.PlaneGeometry(2.45, 1.7)),
    own(new THREE.MeshBasicMaterial({map: skyMap, toneMapped: false})), [1, 1, 1], [0, 0, -.14], 'window-outlook');
  outside.castShadow = outside.receiveShadow = false;
  const glazing = box(window, paint(0xe8eee8, {transparent: true, opacity: .10, metalness: .25, roughness: .12}),
    [2.39, 1.62, .012], [0, 0, -.035], 'window-glass');
  glazing.castShadow = glazing.receiveShadow = false;
  part(window, g.cylinder, colors.steel, [.026, 3, .026], [0, 1.0, .16], 'curtain-rod', [0, 0, Math.PI / 2]);
  const curtainGeometry = own(new THREE.PlaneGeometry(.4, 2.1, 32, 16));
  const curtainPoints = curtainGeometry.attributes.position;
  for (let index = 0; index < curtainPoints.count; index++) {
    const x = curtainPoints.getX(index), y = curtainPoints.getY(index);
    curtainPoints.setZ(index, Math.sin(x * 95) * .047 + Math.sin(y * 2.4) * .012);
  }
  curtainGeometry.computeVertexNormals();
  for (const side of [-1, 1]) part(window, curtainGeometry, colors.linen, [1, 1, 1],
    [side * 1.32, -.10, .18], 'linen-curtain');
  const sun = new THREE.DirectionalLight(0xffe3b7, 4.2);
  sun.name = 'window-sunlight'; sun.position.set(9.3, 6.3, -11.6);
  sun.target.position.set(-1, 0, 1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left: -7, right: 7, top: 6, bottom: -6, near: .5, far: 35});
  sun.shadow.bias = -.00012; sun.shadow.normalBias = .014; sun.shadow.radius = 2.5;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xe9eef3, 0x79654d, .85));
  const fill = new THREE.DirectionalLight(0xe9edf4, 1.0); fill.position.set(1, 5, 7); scene.add(fill);

  const selection = new THREE.Group(); selection.name = 'demo-selection'; scene.add(selection);
  const outline = new THREE.LineSegments(own(new THREE.EdgesGeometry(own(new THREE.BoxGeometry(1, 1, 1)))),
    own(new THREE.LineBasicMaterial({color: 0xffce98, depthTest: false, transparent: true, opacity: .92})));
  outline.renderOrder = 4; selection.add(outline);
  const health = new THREE.Group(); selection.add(health);
  const healthBack = box(health, colors.dark, [.74, .07, .012], [0, 0, 0]);
  const healthFill = box(health, colors.glow, [.68, .04, .018], [0, 0, .014], 'demo-health-fill');
  // Unit x scale exposes the health ratio while width stays baked in its geometry.
  healthFill.geometry = own(roundedBox().scale(.68, .04, .018)); healthFill.scale.set(1, 1, 1);
  healthBack.castShadow = healthFill.castShadow = false;
  const rings = [];
  for (let index = 0; index < 6; index++) {
    const material = own(new THREE.MeshBasicMaterial({color: 0xf6bd92, transparent: true, opacity: 0, depthWrite: false}));
    const ring = new THREE.Mesh(g.rim, material); ring.rotation.x = -Math.PI / 2; ring.visible = false;
    scene.add(ring); rings.push({mesh: ring, remaining: 0});
  }
  let ringIndex = 0;
  const fragmentGroup = new THREE.Group(); fragmentGroup.name = 'demo-fragments'; scene.add(fragmentGroup);
  const fragmentMeshes = {};
  for (const material of ['wood', 'glass', 'fabric', 'metal']) {
    const mesh = new THREE.InstancedMesh(material === 'fabric' ? g.ball : g.box,
      paint(0xffffff, {...(material === 'wood' ? wood : material === 'fabric' ? fabric : {}),
        bumpScale: .01, roughness: material === 'glass' ? .21 : .68, metalness: material === 'metal' ? .52 : .02}), 180);
    mesh.name = `demo-fragments-${material}`; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); own(mesh); fragmentGroup.add(mesh); fragmentMeshes[material] = mesh;
  }
  function fit() {
    const narrow = width / height < .85;
    camera.fov = narrow ? 24 : 36;
    const target = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3(view === 'left' ? -.72 : view === 'right' ? .72 : .10,
      narrow ? 1.15 : .56, 1).normalize();
    camera.aspect = width / height;
    camera.position.copy(target).add(direction); camera.lookAt(target);
    const inverse = camera.quaternion.clone().invert();
    const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), horizontal = vertical * camera.aspect;
    let distance = 0;
    for (const x of [ROOM_BOUNDS.min.x, ROOM_BOUNDS.max.x]) for (const y of [ROOM_BOUNDS.min.y, ROOM_BOUNDS.max.y]) for (const z of [ROOM_BOUNDS.min.z, ROOM_BOUNDS.max.z]) {
      const point = new THREE.Vector3(x, y, z).sub(target).applyQuaternion(inverse);
      distance = Math.max(distance, point.z + Math.abs(point.x) / (horizontal * .91),
        point.z + Math.abs(point.y) / (vertical * .91));
    }
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    leftWall.visible = view !== 'left'; rightWall.visible = view !== 'right';
  }
  function clearRoom() {
    for (const record of records.values()) releaseImported(record.root);
    furniture.clear(); records.clear();
    for (const material of surfaces.values()) material.dispose();
    surfaces.clear();
    rings.forEach(effect => { effect.remaining = 0; effect.mesh.visible = false; });
  }
  function impact(value) {
    const effect = rings[ringIndex++ % rings.length]; effect.remaining = .32;
    effect.mesh.position.set(value.position.x, .06, value.position.z);
  }
  function alignSupportedVisuals() {
    const visited = new Set();
    function align(record) {
      const {value, root} = record;
      if (visited.has(value.id)) return;
      visited.add(value.id);
      const parent = records.get(value.supportId);
      if (!parent) return;
      align(parent);
      const parentOffset = parent.root.position.y - parent.value.position.y;
      root.position.y += parentOffset;
      root.updateMatrixWorld(true);
      const support = importedInstances.get(parent.root);
      if (support) {
        const key = [support.model.uuid, importedInstances.get(root)?.model.uuid, record.signature,
          parent.signature, value.position.x, value.position.y, value.position.z,
          ...parent.root.position.toArray()].join('/');
        if (key !== record.attachmentKey) {
          // GLB triangle tests happen once per placement/replacement, not every
          // animation frame. Only presentation moves; physics/HP remain intact.
          supportRay.set(new THREE.Vector3(root.position.x, parent.root.position.y + parent.value.size.y / 2 + .01,
            root.position.z), new THREE.Vector3(0, -1, 0));
          supportRay.far = parent.value.size.y + .02;
          const hit = supportRay.intersectObject(support.model, true).find(item => item.object.isMesh && item.object.visible);
          supportBounds.setFromObject(root.getObjectByName('demo-body'), true);
          record.attachmentOffset = hit ? hit.point.y - supportBounds.min.y : 0;
          record.attachmentKey = key;
        }
        root.position.y += record.attachmentOffset;
        root.updateMatrixWorld(true);
      }
    }
    for (const record of records.values()) align(record);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const request of pendingAssets.values()) request.abort.abort();
    pendingAssets.clear();
    clearRoom();
    for (const slot of tripoAssets.values()) slot.asset.dispose();
    tripoAssets.clear();
    for (const resource of resources) resource.dispose();
    resources.clear();
    sun.shadow.map?.dispose(); sun.shadow.mapPass?.dispose(); scene.environment = null; scene.clear();
  }
  fit();
  return {
    scene, camera, dispose, setTripoAssets, getTripoKinds: loadedKinds,
    resize(nextWidth, nextHeight) {
      if (disposed || !(nextWidth > 0) || !(nextHeight > 0)) return;
      width = nextWidth; height = nextHeight; fit();
    },
    setView(next) { if (!disposed && ['left', 'front', 'right'].includes(next)) { view = next; fit(); } },
    pickNdc(x, y) {
      if (disposed || !Number.isFinite(x + y) || Math.abs(x) > 1 || Math.abs(y) > 1) return null;
      scene.updateMatrixWorld(true);
      ray.setFromCamera(new THREE.Vector2(x, y), camera);
      const hits = ray.intersectObjects(furniture.children, true).filter(item => item.object.isMesh && item.object.visible &&
        !item.object.userData.demoPickIgnore && item.object.userData.demoId != null);
      // A large original collider must not occlude props resting on a smaller
      // replacement. Visible surfaces win; proxies still cover holes/thin parts.
      const hit = hits.find(item => item.object.name !== 'demo-pick-collider') ?? hits[0];
      return hit?.object.userData.demoId ?? null;
    },
    render(state, {selectedId = null, charge = 0} = {}, dt = 0) {
      if (disposed) return false;
      const hits = state.stats?.hits ?? 0;
      if (state.room !== currentRoom || hits < previousHits) {
        clearRoom(); currentRoom = state.room;
        const palette = ROOM_COLORS[state.room] || ROOM_COLORS.living;
        wallPaint.color.setHex(palette[0]); rugPaint.color.setHex(palette[1]);
        boardLayout.forEach((board, index) => boards.setColorAt(index, instanceColor.setHex(palette[2]).multiplyScalar(board.shade)));
        boards.instanceColor.needsUpdate = true;
      }
      previousHits = hits;
      const delta = state.phase === 'paused' ? 0 : clamp(number(dt), 0, .1);
      const seen = new Set();
      for (const value of state.objects || []) {
        let record = records.get(value.id);
        if (value.destroyed) { if (record) impact(value); continue; }
        seen.add(value.id);
        const signature = `${value.kind}/${value.material}/${value.color}/${value.size.x}/${value.size.y}/${value.size.z}`;
        if (!record || record.signature !== signature) {
          if (record) {releaseImported(record.root); record.root.removeFromParent();}
          const root = build(value); furniture.add(root);
          record = {root, signature, hp: value.hp, remaining: 0, value}; records.set(value.id, record);
        }
        record.value = value;
        if (value.hp < record.hp) { record.remaining = .24; impact(value); }
        record.hp = value.hp; record.remaining = Math.max(0, record.remaining - delta);
        record.root.position.set(value.position.x, value.position.y, value.position.z);
        record.root.scale.set(value.size.x, value.size.y, value.size.z);
        record.root.rotation.z = reducedMotion ? 0 : Math.sin(record.remaining * 75) * record.remaining * .11;
        record.root.getObjectByName('damage-cracks').visible = value.hp < value.maxHp * .78;
      }
      for (const [id, record] of records) if (!seen.has(id)) {
        releaseImported(record.root); record.root.removeFromParent(); records.delete(id);
      }
      scene.updateMatrixWorld(true);
      alignSupportedVisuals();
      const counts = {wood: 0, glass: 0, fabric: 0, metal: 0};
      for (const fragment of (state.fragments || []).filter(value => value.life > 0).slice(-180)) {
        const material = fragmentMeshes[fragment.material] ? fragment.material : 'wood', mesh = fragmentMeshes[material];
        const index = counts[material]++;
        transform.position.set(fragment.position.x, fragment.position.y, fragment.position.z);
        transform.rotation.set(number(fragment.rotation?.x), number(fragment.rotation?.y), number(fragment.rotation?.z));
        const fade = clamp(fragment.life / .35, 0, 1);
        transform.scale.set(fragment.size.x * fade, fragment.size.y * fade, fragment.size.z * fade);
        transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
        mesh.setColorAt(index, instanceColor.setHex(fragment.color).lerp(new THREE.Color(0x8b8171), .45));
      }
      for (const [material, mesh] of Object.entries(fragmentMeshes)) {
        mesh.count = counts[material]; mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      rings.forEach(effect => {
        effect.remaining = Math.max(0, effect.remaining - delta);
        effect.mesh.visible = effect.remaining > 0;
        effect.mesh.scale.setScalar(reducedMotion ? .6 : .35 + (.32 - effect.remaining) * 4);
        effect.mesh.material.opacity = effect.remaining * 1.7;
      });
      const chosen = (state.objects || []).find(value => value.id === selectedId && !value.destroyed);
      selection.visible = Boolean(chosen);
      if (chosen) {
        const displayPosition = records.get(chosen.id)?.root.position || chosen.position;
        const visualSize = importedInstances.get(records.get(chosen.id)?.root)?.dimensions;
        outline.position.set(displayPosition.x, displayPosition.y, displayPosition.z);
        outline.scale.set(chosen.size.x + .07, chosen.size.y + .07, Math.max(chosen.size.z, visualSize?.z || 0) + .07);
        outline.material.color.setHex(charge > .55 ? 0xffebae : 0xffbf92);
        health.position.set(displayPosition.x, displayPosition.y + chosen.size.y / 2 + .15, displayPosition.z);
        health.quaternion.copy(camera.quaternion);
        const ratio = clamp(chosen.hp / Math.max(1, chosen.maxHp), 0, 1);
        healthFill.scale.x = ratio; healthFill.position.x = -.34 * (1 - ratio);
      }
      scene.updateMatrixWorld(true);
      return true;
    },
  };
}

export function createDemoScene(canvas, {reducedMotion = false} = {}) {
  let renderer, world, disposed = false, released = false, lost = false, width = 0, height = 0, ratio = 0;
  function release() {
    if (released) return;
    released = true; canvas.removeEventListener('webglcontextlost', contextLost);
    world?.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
  }
  function contextLost(event) { event.preventDefault(); if (!disposed) { lost = true; release(); } }
  function resize() {
    if (disposed || lost) return false;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    if (width !== rect.width || height !== rect.height || ratio !== dpr) {
      width = rect.width; height = rect.height; ratio = dpr;
      renderer.setPixelRatio(dpr); renderer.setSize(width, height, false); world.resize(width, height);
    }
    return true;
  }
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'low-power'});
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .94; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.debug.onShaderError = () => { throw new Error('拆家场景着色器不可用'); };
    world = createDemoWorld({reducedMotion}); canvas.addEventListener('webglcontextlost', contextLost); resize();
  } catch (error) { release(); throw error; }
  return {
    render(state, options = {}, dt = 0) {
      if (disposed) return;
      if (lost) throw new Error('拆家场景 WebGL 上下文已丢失');
      try { if (resize() && world.render(state, options, dt)) renderer.render(world.scene, world.camera); }
      catch (error) { lost = true; release(); throw error; }
    },
    pick(clientX, clientY) {
      if (disposed || lost) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      return world.pickNdc((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    },
    setView(view) { if (!disposed && !lost) world.setView(view); },
    async setTripoAssets(assets) {
      if (disposed || lost) return {loaded: [], failed: []};
      const result = await world.setTripoAssets(assets);
      return disposed || lost ? {loaded: [], failed: []} : result;
    },
    getTripoKinds() {return disposed || lost ? [] : world.getTripoKinds();},
    resize,
    dispose() { if (disposed) return; disposed = true; release(); },
  };
}
