import * as THREE from 'three';
import {ConvexHull} from 'three/addons/math/ConvexHull.js';
import {BLAST_TYPES} from './blast-state.js';
import {loadMolesCharacter} from './moles-character.js';

const CAMERAS = {left: [-12, 9, 14], front: [0, 9, 18], right: [12, 9, 14]};
const CARGO = {sofa: {size: [2.05, .95, 1.12]}, tv: {size: [1.08, .88, .38]}, car: {size: [2.3, 1, 1.16]}};

// Bake a private static snapshot, keeping the original UV/PBR atlases. Reusing
// one immutable template avoids retaining a loader instance on every retry.
function prepareCargo(asset, kind) {
  const resources = new Set(), materials = new Map(), template = new THREE.Group(), points = [];
  const own = value => {resources.add(value); return value;};
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true; template.clear(); resources.forEach(resource => resource.dispose()); resources.clear(); asset.dispose();
  };
  try {
    const source = asset.createInstance(); source.updateMatrixWorld(true);
    let count = 0;
    source.traverse(object => {
      if (!object.isMesh || !object.geometry?.attributes.position) return;
      count += object.geometry.attributes.position.count;
      if (count > 300000 || template.children.length >= 128) throw new Error('实物网格过大，请使用轻量 GLB。');
      const geometry = own(object.geometry.clone()), vertex = new THREE.Vector3();
      if (object.isSkinnedMesh || object.morphTargetInfluences?.some(value => value)) {
        object.skeleton?.update();
        for (let i = 0; i < geometry.attributes.position.count; i++) {
          object.getVertexPosition(i, vertex); geometry.attributes.position.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        geometry.computeVertexNormals();
      }
      geometry.morphAttributes = {}; geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
      geometry.applyMatrix4(object.matrixWorld);
      const surfaces = [object.material].flat().map(material => {
        if (material.map && !geometry.attributes.uv) throw new Error('实物贴图缺少 UV。');
        if (!materials.has(material)) materials.set(material, own(material.clone()));
        return materials.get(material);
      });
      const mesh = new THREE.Mesh(geometry, surfaces.length === 1 ? surfaces[0] : surfaces);
      mesh.name = 'blast-tripo-mesh'; mesh.castShadow = mesh.receiveShadow = true; template.add(mesh);
    });
    if (!template.children.length) throw new Error('GLB 中没有实物网格。');
    // Align the longest horizontal axis: sofa/TV width and car length. Tripo can
    // bake a presentation yaw into vertices instead of the root transform.
    let n = 0, x = 0, z = 0, xx = 0, zz = 0, xz = 0;
    for (const mesh of template.children) {
      const position = mesh.geometry.attributes.position, step = Math.max(1, Math.ceil(count / 8192));
      for (let i = 0; i < position.count; i += step) {
        const a = position.getX(i), b = position.getZ(i);
        n++; x += a; z += b; xx += a * a; zz += b * b; xz += a * b;
      }
    }
    const yaw = .5 * Math.atan2(2 * (xz / n - x * z / n ** 2), xx / n - (x / n) ** 2 - zz / n + (z / n) ** 2);
    template.children.forEach(mesh => mesh.geometry.rotateY(yaw));
    let bounds = new THREE.Box3().setFromObject(template, true), center = bounds.getCenter(new THREE.Vector3());
    if (kind === 'sofa') {
      let upperZ = 0, upperCount = 0;
      for (const mesh of template.children) {
        const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i++) if (position.getY(i) > bounds.max.y - (bounds.max.y - bounds.min.y) * .22) {
          upperZ += position.getZ(i); upperCount++;
        }
      }
      if (upperCount && upperZ / upperCount > center.z) template.children.forEach(mesh => mesh.geometry.rotateY(Math.PI));
    }
    bounds = new THREE.Box3().setFromObject(template, true);
    center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    if (!size.toArray().every(value => Number.isFinite(value) && value > 1e-5)) throw new Error('实物尺寸无效。');
    const scale = 1 / Math.max(size.x, size.y, size.z); size.multiplyScalar(scale);
    for (const mesh of template.children) {
      mesh.geometry.translate(-center.x, -center.y, -center.z).scale(scale, scale, scale);
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(position, i));
    }
    // Only hull vertices can be the lowest transformed point. Compute once,
    // then ground a tumbling model exactly without scanning its dense mesh.
    const hull = new ConvexHull().setFromPoints(points), contact = new Set();
    for (const face of hull.faces) {
      let edge = face.edge;
      do {contact.add(edge.head().point); edge = edge.next;} while (edge !== face.edge);
    }
    if (!contact.size) throw new Error('实物缺少立体边界。');
    return {template, size, contact: [...contact], name: asset.name, dispose};
  } catch (error) {dispose(); throw error;}
}

/** GPU-independent world for raycast/projection tests. The caller owns all time. */
export function createBlastWorld({reducedMotion = false} = {}) {
  let disposed = false, layout = null, width = 960, height = 550, view = 'right';
  const resources = new Set(), materials = new Map(), groups = new Map(), windowInfills = new Map();
  const cargoAssets = new Map(), pendingCargo = new Map(), cargo = new Map();
  let lastState = null;
  const own = resource => {resources.add(resource); return resource;};
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15383b);
  const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, .1, 100);
  const target = new THREE.Vector3(0, 2.7, 0);
  const ray = new THREE.Raycaster();
  const box = own(new THREE.BoxGeometry(1, 1, 1, 3, 3, 3));
  // A small bevel catches soft light without loading meshes or texture maps.
  const position = box.attributes.position;
  const vertex = new THREE.Vector3(), core = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    core.set(...vertex.toArray().map(value => THREE.MathUtils.clamp(value, -.455, .455)));
    vertex.sub(core).normalize().multiplyScalar(.045).add(core);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  box.computeVertexNormals();
  const sphere = own(new THREE.IcosahedronGeometry(1, 1));
  const cone = own(new THREE.ConeGeometry(1, 1, 8));
  const ring = own(new THREE.TorusGeometry(1, .055, 6, 40));
  const material = color => {
    if (!materials.has(color)) materials.set(color, own(new THREE.MeshStandardMaterial({color, roughness: .82, metalness: .04})));
    return materials.get(color);
  };
  const basic = (color, opacity = 1) => own(new THREE.MeshBasicMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: opacity === 1, toneMapped: false,
  }));
  const mint = material(0x8db8a4), cream = material(0xf5dfb7), orange = material(0xe89a5c);
  const dark = material(0x325851), steel = material(0x56766d);
  const glass = own(new THREE.MeshStandardMaterial({color: 0x355a5c, emissive: 0x21403d, emissiveIntensity: .25, roughness: .27}));
  const glow = basic(0xffb66b), white = basic(0xffe8b9);
  glow.depthTest = white.depthTest = false;
  const pulseMaterial = basic(0xffbf80, .28), dustMaterial = basic(0xe5d9b9, .18);
  const guideMaterial = basic(0xffb66b, .19);
  const outlineMaterial = own(new THREE.MeshBasicMaterial({color: 0xffd39b, wireframe: true, transparent: true, opacity: .8, depthWrite: false}));

  const group = name => {const value = new THREE.Group(); value.name = name; scene.add(value); return value;};
  const site = group('blast-worksite'), piecesGroup = group('blast-pieces');
  const cargoGroup = group('blast-tripo-props');
  const markerGroup = group('blast-markers'), effectsGroup = group('blast-effects');
  const burstGroup = group('blast-bursts');
  const make = (parent, geometry, mat, xyz, size) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(...xyz);
    if (size) mesh.scale.set(...size);
    mesh.castShadow = mat.isMeshStandardMaterial;
    mesh.receiveShadow = mat.isMeshStandardMaterial;
    parent.add(mesh);
    return mesh;
  };
  const block = (parent, mat, xyz, size) => make(parent, box, mat, xyz, size);
  const hemi = new THREE.HemisphereLight(0xf7efd5, 0x466c67, 2.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffddb3, 3.4);
  sun.position.set(-6, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -12, right: 12, top: 12, bottom: -12, near: .5, far: 42});
  sun.shadow.normalBias = .04;
  sun.shadow.bias = -.0003;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x85bbba, 1.3);
  fill.position.set(7, 6, -8);
  scene.add(fill);

  block(site, material(0x24474a), [0, -.6, 0], [12.5, .65, 8.6]);
  block(site, material(0xb6b795), [0, -.2, 0], [12.1, .25, 8.2]);
  block(site, material(0xc8c5a3), [0, -.065, 0], [9.6, .06, 5.8]);
  for (let x = -4; x <= 4; x++) block(site, material(0xb7b797), [x, -.026, 0], [.025, .006, 5.65]);
  for (let z = -2; z <= 2; z++) block(site, material(0xb7b797), [0, -.025, z], [9.5, .006, .025]);
  // Fence, cones and a low barricade frame the little worksite, outside the playable model.
  for (let x = -5.5; x <= 5.5; x += 1.1) block(site, steel, [x, .48, -3.8], [.055, 1, .055]);
  for (const y of [.32, .82]) block(site, steel, [0, y, -3.8], [11.2, .05, .06]);
  for (const [x, z] of [[-5.3, 2.8], [-4.5, 3.15], [5.25, 2.8], [4.45, 3.15]]) {
    block(site, dark, [x, .025, z], [.4, .1, .4]);
    make(site, cone, orange, [x, .3, z], [.19, .52, .19]);
    make(site, cone, cream, [x, .34, z], [.12, .19, .12]);
  }
  for (const x of [-4.4, -2.6]) block(site, steel, [x, .43, 3.52], [.08, .88, .1]);
  block(site, cream, [-3.5, .73, 3.52], [2.3, .3, .14]);
  for (let x = -4.4; x < -2.6; x += .38) {
    const stripe = block(site, orange, [x, .73, 3.61], [.18, .3, .02]); stripe.rotation.z = -.25;
  }
  for (const [x, z] of [[-5.2, -2.7], [5.2, -2.7]]) {
    block(site, dark, [x, .03, z], [1.15, .17, 1.05]);
    for (let i = 0; i < 3; i++) make(site, sphere, mint, [x + (i - 1) * .25, .27 + i % 2 * .13, z], [.38, .38, .38]);
  }
  // A few cream pavement dashes make the floating site read as a designed diorama.
  for (let x = -.5; x < 4; x += .7) block(site, cream, [x, -.032, 3.6], [.35, .016, .06]);

  const selection = new THREE.Group(); selection.name = 'blast-selection'; scene.add(selection);
  const outline = make(selection, box, outlineMaterial, [0, 0, 0]);
  const crosshair = make(scene, sphere, glow, [0, 0, 0], [.105, .105, .105]);
  const guide = make(scene, ring, guideMaterial, [0, 0, 0]);
  guide.rotation.x = -Math.PI / 2;

  function cargoStatus() {
    const status = {loaded: [...cargoAssets.keys()].sort(), total: cargo.size, supported: 0, falling: 0, salvaged: 0};
    for (const record of cargo.values()) status[record.root.userData.status]++;
    return status;
  }
  async function setTripoAssets(inputs = {}) {
    if (disposed || !inputs || typeof inputs !== 'object') return {loaded: [], failed: []};
    const entries = Object.keys(CARGO).filter(kind => inputs[kind] || kind === 'tv' && inputs.screen);
    const failures = await Promise.all(entries.map(async kind => {
      pendingCargo.get(kind)?.abort();
      const controller = new AbortController(); pendingCargo.set(kind, controller);
      const stale = () => disposed || controller.signal.aborted || pendingCargo.get(kind) !== controller;
      let source = null, asset = null;
      try {
        const input = inputs[kind] || inputs.screen;
        const bytes = ArrayBuffer.isView(input.buffer)
          ? input.buffer.buffer.slice(input.buffer.byteOffset, input.buffer.byteOffset + input.buffer.byteLength) : input.buffer;
        if (!(bytes instanceof ArrayBuffer)) throw new Error('实物需要内嵌的 GLB 字节。');
        const name = String(input.name || `${kind}.glb`);
        source = await loadMolesCharacter({name: /\.glb$/i.test(name) ? name : `${name}.glb`,
          size: bytes.byteLength, arrayBuffer: async () => bytes}, {signal: controller.signal});
        if (stale()) {source.dispose(); return null;}
        asset = prepareCargo(source, kind);
        if (stale()) {asset.dispose(); return null;}
        const old = cargoAssets.get(kind);
        cargo.get(kind)?.root.removeFromParent(); cargo.delete(kind);
        cargoAssets.set(kind, asset); old?.dispose();
        if (lastState) update(lastState);
        return null;
      } catch (error) {
        if (asset) asset.dispose(); else source?.dispose();
        return stale() ? null : {kind, message: error.message || '实物读取失败。'};
      } finally {if (pendingCargo.get(kind) === controller) pendingCargo.delete(kind);}
    }));
    return {loaded: cargoStatus().loaded, failed: failures.filter(Boolean)};
  }
  function updateCargo(state) {
    const floors = state.pieces.filter(piece => piece.kind === 'floor' && piece.id.endsWith('-1'))
      .sort((a, b) => a.origin.y - b.origin.y || a.origin.x - b.origin.x);
    const indices = state.layout === 'house' ? {sofa: 0, tv: 3, car: 1} : {sofa: 0, tv: 1, car: 2};
    for (const [kind, asset] of cargoAssets) {
      const support = floors[Math.min(indices[kind], floors.length - 1)];
      if (!support) {cargo.get(kind)?.root.removeFromParent(); cargo.delete(kind); continue;}
      let record = cargo.get(kind);
      if (!record || record.supportId !== support.id) {
        record?.root.removeFromParent();
        const root = asset.template.clone(true), desired = CARGO[kind].size;
        const scale = Math.min(...desired.map((value, i) => value / asset.size.getComponent(i)),
          support.size.x * .88 / asset.size.x, support.size.z * .88 / asset.size.z);
        root.scale.setScalar(scale);
        root.name = `blast-tripo-${kind}`;
        root.userData = {source: 'tripo', kind, assetName: asset.name, supportId: support.id, status: 'supported'};
        root.traverse(object => {if (object.isMesh) object.userData.cargoKind = kind;});
        cargoGroup.add(root);
        record = {root, scale, supportId: support.id, support}; cargo.set(kind, record);
      }
      record.support = support;
      const root = record.root, height = asset.size.y * record.scale;
      const unstable = support.status !== 'stable';
      // Motion is driven by the exact structural pose, not a second timer.
      // A sliding load tips off its slab and stays visible as salvage. Slow
      // frames, pause, retry and imports during collapse give identical poses.
      const distance = Math.hypot(support.position.x - support.origin.x,
        support.position.y - support.origin.y, support.position.z - support.origin.z);
      const tilt = Math.hypot(support.rotation.x, support.rotation.z);
      const slide = unstable ? THREE.MathUtils.smoothstep(distance + tilt * .7, 0, 1.35) : 0;
      const direction = support.origin.x < 0 ? -1 : 1;
      root.position.set(support.position.x + slide * direction * .62,
        support.position.y + support.size.y / 2 + height / 2 + .02 - slide * (height / 2 + 1.8),
        support.position.z + slide * .88);
      root.rotation.set(unstable ? support.rotation.x * .7 + slide * .8 : 0,
        unstable ? support.rotation.y + slide * direction * .35 : 0,
        unstable ? support.rotation.z * .7 + slide * direction * .48 : 0);
      root.updateMatrix();
      if (unstable) {
        const e = root.matrix.elements;
        let lowest = Infinity;
        for (const point of asset.contact) lowest = Math.min(lowest, point.x * e[1] + point.y * e[5] + point.z * e[9] + e[13]);
        root.position.y += Math.max(0, .02 - lowest);
        root.updateMatrix();
      }
      root.userData.status = unstable ? support.status === 'settled' ? 'salvaged' : 'falling' : 'supported';
    }
    // Open the occupied bay above each slab. The upper lintel and side posts
    // remain destructible geometry; low sills cannot hide the actual cargo.
    const occupied = new Set([...cargo.values()].map(record =>
      record.supportId.replace(/floor-(\d+)-/, (_, level) => `wall-${Number(level) + 1}-`)));
    for (const [id, infill] of windowInfills) infill.visible = !occupied.has(id);
  }

  function addPiece(piece) {
    const result = new THREE.Group();
    result.userData.pieceId = piece.id;
    const mat = material(piece.color), {x: w, y: h, z: d} = piece.size;
    if (piece.kind === 'wall') {
      const wall = new THREE.Group(); result.add(wall);
      const infill = new THREE.Group(); infill.name = 'blast-window-infill'; wall.add(infill);
      windowInfills.set(piece.id, infill);
      const width = piece.sideWall ? d : w, depth = piece.sideWall ? w : d;
      if (piece.sideWall) wall.rotation.y = Math.PI / 2;
      block(infill, mat, [0, -h * .35, 0], [width, h * .3, depth]);
      block(wall, mat, [0, h * .4, 0], [width, h * .2, depth]);
      for (const side of [-1, 1]) block(wall, mat, [side * width * .42, 0, 0], [width * .16, h * .7, depth]);
      const window = block(infill, glass, [0, h * .02, 0], [width * .68, h * .56, depth * .5]);
      window.name = 'blast-window';
      for (const side of [-1, 1]) {
        block(infill, cream, [0, -h * .21, side * depth * .53], [width * .75, .06, .045]);
        block(infill, cream, [0, h * .04, side * depth * .53], [.035, h * .5, .035]);
        block(infill, cream, [0, h * .04, side * depth * .53], [width * .65, .035, .035]);
      }
    } else if (piece.kind === 'rail') {
      for (const x of [-w / 2 + .06, 0, w / 2 - .06]) block(result, mat, [x, 0, 0], [.09, h, d]);
      for (const y of [-h * .2, h / 2 - .05]) block(result, mat, [0, y, 0], [w, .09, d]);
    } else {
      block(result, mat, [0, 0, 0], [w, h, d]);
      if (piece.kind === 'column') {
        for (const y of [-h / 2 + .1, h / 2 - .1]) block(result, mat, [0, y, 0], [w * 1.1, .16, d * 1.1]);
      } else if (piece.kind === 'floor' || piece.kind === 'roof') {
        const count = piece.kind === 'roof' ? 7 : 4;
        for (let i = 1; i < count; i++) block(result, piece.kind === 'roof' ? orange : cream,
          [-w / 2 + w * i / count, h / 2 + .006, 0], [.024, .018, d * .96]);
      } else if (piece.kind === 'chimney') {
        block(result, dark, [0, h / 2 - .05, 0], [w * 1.06, .08, d * 1.06]);
      } else if (piece.kind === 'beam') {
        block(result, cream, [0, .03, d / 2 + .008], [w * .9, .03, .016]);
      }
    }
    result.traverse(object => {if (object.isMesh) object.userData.pieceId = piece.id;});
    piecesGroup.add(result);
    groups.set(piece.id, result);
    return result;
  }

  function fitCamera() {
    camera.position.set(...CAMERAS[view]);
    target.y = layout === 'tower' ? 3.7 : layout === 'bridge' ? 1.6 : 2.7;
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    // Fit the full building and site; portrait changes the frustum, never the model.
    const bounds = new THREE.Box3(new THREE.Vector3(-6.35, -.9, -4.35),
      new THREE.Vector3(6.35, layout === 'tower' ? 8.7 : layout === 'bridge' ? 3.9 : 6.7, 4.35));
    let extentX = 0, extentY = 0;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      extentX = Math.max(extentX, Math.abs(p.x));
      extentY = Math.max(extentY, Math.abs(p.y));
    }
    const aspect = width / height, halfY = Math.max(extentY, extentX / aspect) * 1.04;
    camera.left = -halfY * aspect; camera.right = halfY * aspect;
    camera.top = halfY; camera.bottom = -halfY;
    camera.updateProjectionMatrix();
  }

  function resize(w, h) {
    if (disposed || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
    width = w; height = h; fitCamera(); return true;
  }
  function setView(next) {
    if (disposed || !Object.hasOwn(CAMERAS, next)) return false;
    view = next; fitCamera(); return true;
  }
  function update(state) {
    if (disposed) return false;
    lastState = state;
    if (layout !== state.layout) {
      layout = state.layout;
      piecesGroup.clear(); groups.clear(); windowInfills.clear();
      cargoGroup.clear(); cargo.clear();
      fitCamera();
    }
    const ids = new Set();
    for (const piece of state.pieces.slice(0, 160)) {
      ids.add(piece.id);
      const object = groups.get(piece.id) || addPiece(piece);
      object.position.set(piece.position.x, piece.position.y, piece.position.z);
      object.rotation.set(piece.rotation.x, piece.rotation.y, piece.rotation.z);
      object.userData.stable = piece.status === 'stable';
      object.visible = true;
    }
    for (const [id, object] of groups) if (!ids.has(id)) {object.removeFromParent(); groups.delete(id); windowInfills.delete(id);}
    updateCargo(state);
    const selected = state.pieces.find(piece => piece.id === state.selectedId && piece.status === 'stable');
    selection.visible = crosshair.visible = guide.visible = Boolean(selected && state.phase === 'planning');
    if (selection.visible) {
      selection.position.copy(groups.get(selected.id).position);
      selection.rotation.copy(groups.get(selected.id).rotation);
      outline.scale.set(selected.size.x + .08, selected.size.y + .08, selected.size.z + .08);
      crosshair.position.set(state.selectedPoint.x, state.selectedPoint.y, state.selectedPoint.z);
      guide.position.copy(crosshair.position);
      guide.scale.setScalar(BLAST_TYPES.find(type => type.id === state.blastType)?.radius || 1.12);
    }
    // Small, capped pools reuse shared geometry/materials on every render.
    while (markerGroup.children.length > state.markers.length) markerGroup.children.at(-1).removeFromParent();
    state.markers.slice(0, 6).forEach((marker, i) => {
      let pin = markerGroup.children[i];
      if (!pin) {
        pin = new THREE.Group(); markerGroup.add(pin);
        make(pin, ring, glow, [0, 0, .04], [.19, .19, .19]);
        make(pin, sphere, white, [0, 0, .04], [.08, .08, .08]);
      }
      pin.position.set(marker.point.x, marker.point.y, marker.point.z);
      pin.quaternion.copy(camera.quaternion);
      pin.scale.setScalar(marker.type === 'wide' ? 1.3 : 1);
      pin.traverse(object => {object.renderOrder = 10;});
    });
    const bursts = reducedMotion ? [] : state.bursts.slice(0, 6);
    while (burstGroup.children.length > bursts.length) burstGroup.children.at(-1).removeFromParent();
    bursts.forEach((burst, i) => {
      const object = burstGroup.children[i] || make(burstGroup, ring, pulseMaterial, [0, 0, 0]);
      object.position.set(burst.point.x, Math.max(.13, burst.point.y), burst.point.z);
      object.rotation.x = -Math.PI / 2;
      object.scale.setScalar(.15 + burst.radius * burst.age * 2.8);
    });
    const effects = reducedMotion ? [] : state.effects.slice(0, 48);
    while (effectsGroup.children.length > effects.length) effectsGroup.children.at(-1).removeFromParent();
    effects.forEach((effect, i) => {
      const object = effectsGroup.children[i] || make(effectsGroup, sphere, dustMaterial, [0, 0, 0]);
      object.position.set(effect.point.x, .15 + effect.age * .4, effect.point.z);
      const size = .18 + effect.age * .85;
      object.scale.set(size, size * .42, size);
    });
    scene.updateMatrixWorld(true);
    return true;
  }
  function pick(x, y) {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1) return null;
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    const intactCargo = [...cargo.values()].filter(record => record.support.status === 'stable');
    const hits = ray.intersectObjects([...groups.values()].filter(object => object.userData.stable)
      .concat(intactCargo.map(record => record.root)), true);
    // Raycaster does not inherit rendering visibility through the parent tree.
    const hit = hits.find(hit => {
      for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
      return true;
    });
    if (hit?.object.userData.cargoKind) {
      const record = cargo.get(hit.object.userData.cargoKind), support = record.support;
      return {id: support.id, source: 'tripo', kind: record.root.userData.kind, assetName: record.root.userData.assetName,
        point: {x: THREE.MathUtils.clamp(hit.point.x, support.position.x - support.size.x / 2, support.position.x + support.size.x / 2),
          y: support.position.y + support.size.y / 2,
          z: THREE.MathUtils.clamp(hit.point.z, support.position.z - support.size.z / 2, support.position.z + support.size.z / 2)}};
    }
    return hit ? {id: hit.object.userData.pieceId, point: {x: hit.point.x, y: hit.point.y, z: hit.point.z}} : null;
  }
  function project(point) {
    if (disposed || !point || !['x', 'y', 'z'].every(axis => Number.isFinite(point[axis]))) return null;
    const p = new THREE.Vector3(point.x, point.y, point.z).project(camera);
    return {x: (p.x + 1) / 2, y: (1 - p.y) / 2};
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    pendingCargo.forEach(controller => controller.abort()); pendingCargo.clear();
    cargoGroup.clear(); cargo.clear(); lastState = null;
    cargoAssets.forEach(asset => asset.dispose()); cargoAssets.clear();
    sun.shadow.dispose();
    for (const resource of resources) resource.dispose();
    resources.clear(); materials.clear(); groups.clear(); windowInfills.clear(); scene.clear();
  }
  fitCamera();
  return {scene, camera, update, resize, setView, pick, project, destroy, setTripoAssets, getTripoStatus: cargoStatus};
}

/** No animation loop here: mountBlast supplies one RAF only while debris moves. */
export function createBlastScene(canvas, {reducedMotion = false, onUnavailable = () => {}} = {}) {
  let renderer = null, world = null, disposed = false, width = 0, height = 0, ratio = 0;
  let lastState = null;
  function destroy() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', contextLost);
    world?.destroy();
    lastState = null;
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  function unavailable(error) {
    if (disposed) return;
    destroy();
    onUnavailable(error);
  }
  function contextLost(event) {
    event.preventDefault();
    unavailable(new Error('WebGL context lost'));
  }
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'low-power'});
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.debug.onShaderError = () => {throw new Error('Building scene shader unavailable');};
    world = createBlastWorld({reducedMotion});
    canvas.addEventListener('webglcontextlost', contextLost);
  } catch (error) {destroy(); throw error;}
  function resize() {
    if (disposed) return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const dpr = Math.min(canvas.ownerDocument?.defaultView?.devicePixelRatio || 1, 1.75);
    if (width !== rect.width || height !== rect.height || ratio !== dpr) {
      width = rect.width; height = rect.height; ratio = dpr;
      renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
      world.resize(width, height);
    }
    return true;
  }
  function render(state) {
    if (disposed) return false;
    lastState = state;
    try {
      resize();
      world.update(state);
      renderer.render(world.scene, world.camera);
      return true;
    } catch (error) {unavailable(error); return false;}
  }
  return {
    render,
    async setTripoAssets(assets) {
      if (disposed) return {loaded: [], failed: []};
      const result = await world.setTripoAssets(assets);
      if (!disposed && lastState) render(lastState);
      return disposed ? {loaded: [], failed: []} : result;
    },
    getTripoStatus: () => world?.getTripoStatus() ?? {loaded: [], total: 0, supported: 0, falling: 0, salvaged: 0},
    pick(clientX, clientY) {
      if (disposed) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return world.pick((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2);
    },
    setView: value => world?.setView(value) ?? false,
    project: point => world?.project(point) ?? null,
    resize, destroy, dispose: destroy,
  };
}
