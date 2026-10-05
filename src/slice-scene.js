import * as THREE from 'three';
import {loadMolesCharacter} from './moles-character.js';

// Local materials deliberately do not depend on the simulation module.
const PALETTE = {peach: '#efa396', mint: '#92c9b4', gold: '#e8bb6e'};
const LIMIT = {objects: 64, fragments: 128, particles: 256, trail: 32};
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const validPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
const lifeOf = item => item.life == null ? 1 : clamp(item.life / (item.maxLife > 0 ? item.maxLife : .2), 0, 1);

function roundedBox(width, height, depth, bevel) {
  const geometry = new THREE.BoxGeometry(width, height, depth, 8, 8, 6);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3(), core = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index);
    core.set(clamp(point.x, -width / 2 + bevel, width / 2 - bevel),
      clamp(point.y, -height / 2 + bevel, height / 2 - bevel),
      clamp(point.z, -depth / 2 + bevel, depth / 2 - bevel));
    point.sub(core).normalize().multiplyScalar(bevel).add(core);
    position.setXYZ(index, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Trace the actual intersection edges. A convex hull would fill the air beside
// a fruit stem, dents, or separate parts of an imported model.
function sectionTriangles(boundary, edges) {
  const links = new Map(), visited = new Set(), loops = [];
  const edgeKey = (a, b) => a < b ? `${a}/${b}` : `${b}/${a}`;
  for (const [a, b] of edges.values()) {
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a).add(b); links.get(b).add(a);
  }
  for (const [start, neighbors] of links) for (const first of neighbors) {
    if (visited.has(edgeKey(start, first))) continue;
    const points = [boundary.get(start)];
    let previous = start, current = first, closed = false;
    visited.add(edgeKey(start, first));
    for (let step = 0; step <= edges.size; step++) {
      if (current === start) {closed = true; break;}
      points.push(boundary.get(current));
      const choices = [...links.get(current)].filter(next => !visited.has(edgeKey(current, next)));
      // At touching contours, continue the incoming edge as smoothly as possible.
      const incoming = boundary.get(current).clone().sub(boundary.get(previous)).normalize();
      choices.sort((a, b) => incoming.dot(boundary.get(b).clone().sub(boundary.get(current)).normalize())
        - incoming.dot(boundary.get(a).clone().sub(boundary.get(current)).normalize()));
      const next = choices[0];
      if (next == null) break;
      visited.add(edgeKey(current, next));
      previous = current; current = next;
    }
    const contour = points.map(point => new THREE.Vector2(point.y, point.z));
    const area = Math.abs(THREE.ShapeUtils.area(contour));
    if (closed && points.length >= 3 && area > 1e-10) loops.push({points, contour, area, depth: 0, parent: null});
  }
  const contains = (polygon, point) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  };
  loops.sort((a, b) => b.area - a.area);
  loops.forEach((loop, index) => {
    for (let outer = 0; outer < index; outer++) {
      if (contains(loops[outer].contour, loop.contour[0])) loop.parent = loops[outer];
    }
    loop.depth = loop.parent ? loop.parent.depth + 1 : 0;
  });
  const triangles = [];
  for (const loop of loops) {
    if (loop.depth % 2) continue;
    const holes = loops.filter(candidate => candidate.parent === loop);
    const points = [loop, ...holes].flatMap(value => value.points);
    const faces = THREE.ShapeUtils.triangulateShape(loop.contour, holes.map(hole => hole.contour));
    for (const face of faces) triangles.push(face.map(index => points[index]));
  }
  return triangles;
}

/** Clip the actual peel triangles, interpolate their UVs and other attributes,
 * then seal the original intersection contours with a separate flesh material.
 */
export function cappedHalf(source, side, {materialCount = 1} = {}) {
  const position = source.attributes.position;
  const attributes = Object.fromEntries(Object.entries(source.attributes)
    .filter(([name, attribute]) => name !== 'position' && !['skinIndex', 'skinWeight'].includes(name) && attribute.itemSize <= 4));
  attributes.normal ||= {itemSize: 3};
  attributes.uv ||= {itemSize: 2};
  const vertices = [], data = Object.fromEntries(Object.keys(attributes).map(name => [name, []]));
  const boundary = new Map(), edges = new Map(), groups = [], read = ['getX', 'getY', 'getZ', 'getW'];
  const pointKey = point => `${Math.round(point.y * 1e5)},${Math.round(point.z * 1e5)}`;
  const count = source.index?.count ?? position.count;
  const vertex = index => {
    index = source.index ? source.index.getX(index) : index;
    return {point: new THREE.Vector3().fromBufferAttribute(position, index),
      attrs: Object.fromEntries(Object.entries(attributes).map(([name, attribute]) =>
        [name, Array.from({length: attribute.itemSize}, (_, component) => attribute[read[component]]?.(index) || 0)]))};
  };
  function emit(value) {
    vertices.push(...value.point.toArray());
    for (const name of Object.keys(attributes)) data[name].push(...value.attrs[name]);
  }
  for (let index = 0; index < count; index += 3) {
    const triangle = [vertex(index), vertex(index + 1), vertex(index + 2)];
    if (!source.attributes.normal) {
      const normal = triangle[1].point.clone().sub(triangle[0].point)
        .cross(triangle[2].point.clone().sub(triangle[0].point)).normalize().toArray();
      triangle.forEach(value => {value.attrs.normal = normal;});
    }
    const polygon = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      const insideA = a.point.x * side >= -1e-7, insideB = b.point.x * side >= -1e-7;
      if (insideA) polygon.push(a);
      if (insideA !== insideB) {
        const t = -a.point.x / (b.point.x - a.point.x);
        const point = a.point.clone().lerp(b.point, t); point.x = 0;
        const attrs = Object.fromEntries(Object.keys(attributes).map(name =>
          [name, a.attrs[name].map((value, i) => THREE.MathUtils.lerp(value, b.attrs[name][i], t))]));
        attrs.normal = new THREE.Vector3(...attrs.normal).normalize().toArray();
        if (attrs.tangent) {
          const tangent = new THREE.Vector3(...attrs.tangent).normalize().toArray();
          attrs.tangent = [...tangent, attrs.tangent[3] < 0 ? -1 : 1];
        }
        polygon.push({point, attrs});
      }
    }
    const start = vertices.length / 3;
    for (let corner = 1; corner + 1 < polygon.length; corner++) {
      emit(polygon[0]); emit(polygon[corner]); emit(polygon[corner + 1]);
    }
    if (!triangle.every(value => Math.abs(value.point.x) < 1e-7)) {
      const section = new Map(polygon.filter(value => Math.abs(value.point.x) < 1e-7)
        .map(value => [pointKey(value.point), value.point]));
      if (section.size === 2) {
        const [a, b] = [...section.keys()];
        for (const [key, point] of section) boundary.set(key, point);
        edges.set(a < b ? `${a}/${b}` : `${b}/${a}`, [a, b]);
      }
    }
    const added = vertices.length / 3 - start;
    if (added) {
      const materialIndex = materialCount > 1
        ? clamp(source.groups.find(group => index >= group.start && index < group.start + group.count)?.materialIndex || 0, 0, materialCount - 1)
        : 0;
      const previous = groups.at(-1);
      if (previous?.materialIndex === materialIndex) previous.count += added;
      else groups.push({start, count: added, materialIndex});
    }
  }
  const shellCount = vertices.length / 3;
  const faces = sectionTriangles(boundary, edges);
  const bounds = new THREE.Box3().setFromPoints([...boundary.values()]);
  const uvCenter = faces.length ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3();
  const uvRadius = faces.length ? Math.max(bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z) / 2 : 1;
  const outward = new THREE.Vector3(-side, 0, 0);
  for (const [a, b, c] of faces) {
    const winding = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
    for (const point of winding * -side > 0 ? [a, b, c] : [a, c, b]) {
      vertices.push(0, point.y, point.z);
      for (const [name, attribute] of Object.entries(attributes)) {
        if (name === 'normal') data[name].push(...outward.toArray());
        else if (name.startsWith('uv')) data[name].push(.5 + (point.z - uvCenter.z) / (2 * uvRadius || 1),
          .5 + (point.y - uvCenter.y) / (2 * uvRadius || 1));
        else if (name === 'tangent') data[name].push(0, 0, 1, side);
        else data[name].push(...Array(attribute.itemSize).fill(name === 'color' ? 1 : 0));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  for (const [name, attribute] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(data[name], attribute.itemSize));
  }
  groups.forEach(group => geometry.addGroup(group.start, group.count, group.materialIndex));
  if (vertices.length / 3 > shellCount) geometry.addGroup(shellCount, vertices.length / 3 - shellCount, materialCount);
  geometry.computeBoundingSphere();
  return geometry;
}

function orangeFlesh(own) {
  const size = 256, color = new Uint8Array(size * size * 4), detail = color.slice();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const radius = Math.hypot(u, v), angle = Math.atan2(v, u) + Math.PI;
    const random = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const grain = random - Math.floor(random);
    const sector = angle / (Math.PI * 2) * 10 + .09 * Math.sin(radius * 6);
    const edge = Math.min(sector % 1, 1 - sector % 1);
    const membrane = Math.sin(edge * Math.PI * 2 / 10) * radius < .007 + grain * .003;
    const innerRind = .87 + Math.sin(angle * 10) * .008 + Math.sin(angle * 29) * .003;
    const pith = radius < .115 + Math.sin(angle * 10) * .008 || radius > innerRind && radius < .96 || membrane;
    const vesicle = Math.sin(radius * 140 + Math.sin(angle * 70) * 1.4) * .5 + .5;
    let rgb, height, roughness;
    if (radius >= .96) {rgb = [230 + grain * 20, 114 + grain * 24, 12]; height = 170 + grain * 40; roughness = 190;}
    else if (pith) {rgb = [251, 227 + grain * 12, 177 + grain * 24]; height = 190 + grain * 18; roughness = 180;}
    else {
      rgb = [235 + grain * 20, 122 + vesicle * 25 + grain * 21, 17 + vesicle * 14];
      height = 95 + vesicle * 55 + grain * 35; roughness = 88 + grain * 32;
    }
    color.set([...rgb, 255], (y * size + x) * 4);
    detail.set([height, roughness, 0, 255], (y * size + x) * 4);
  }
  const texture = data => {
    const map = own(new THREE.DataTexture(data, size, size));
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.needsUpdate = true; return map;
  };
  const map = texture(color), surface = texture(detail);
  map.colorSpace = THREE.SRGBColorSpace;
  return own(new THREE.MeshPhysicalMaterial({name: 'fresh orange cross-section', map, bumpMap: surface,
    roughnessMap: surface, roughness: .75, bumpScale: .015, clearcoat: .35, clearcoatRoughness: .22}));
}

/** Private, pre-cut templates. Each visible fruit shares these immutable
 * geometries/maps, while the source asset retains ownership of its atlases.
 * The projected peel fits the engine's unit collision circle.
 */
export function createSliceFruitAsset(sourceAsset) {
  const resources = new Set(), models = new Map(), copies = new Map();
  const own = value => (resources.add(value), value);
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    models.clear();
    resources.forEach(resource => resource.dispose()); resources.clear();
    sourceAsset.dispose();
  }
  try {
    const instance = sourceAsset.createInstance();
    instance.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(instance, true);
    const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
    if (!size.toArray().every(value => Number.isFinite(value) && value > 1e-5)) throw new Error('水果需要完整的立体模型。');
    const meshes = [];
    instance.traverse(object => {if (object.isMesh && object.geometry?.attributes.position) meshes.push(object);});
    if (!meshes.length || meshes.length > 128) throw new Error('水果网格数量不适合切切乐。');
    const point = new THREE.Vector3();
    let radius = 0, depth = 0;
    const parts = meshes.map(object => {
      const geometry = own(object.geometry.clone());
      if (object.isSkinnedMesh || object.morphTargetInfluences?.some(value => value !== 0)) {
        object.skeleton?.update();
        for (let i = 0; i < geometry.attributes.position.count; i++) {
          object.getVertexPosition(i, point);
          geometry.attributes.position.setXYZ(i, point.x, point.y, point.z);
        }
        geometry.computeVertexNormals();
      }
      geometry.morphAttributes = {};
      geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
      geometry.applyMatrix4(object.matrixWorld).translate(-center.x, -center.y, -center.z);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        radius = Math.max(radius, Math.hypot(position.getX(i), position.getY(i)));
        depth = Math.max(depth, Math.abs(position.getZ(i)));
      }
      const materials = [object.material].flat().map(material => {
        if (material.map && !geometry.attributes.uv) throw new Error('水果贴图缺少 UV 坐标。');
        if (!copies.has(material)) copies.set(material, own(material.clone()));
        return copies.get(material);
      });
      return {geometry, materials};
    });
    if (!Number.isFinite(radius + depth) || radius < 1e-5) throw new Error('水果尺寸无法读取。');
    const scale = Math.min(1 / radius, 1.15 / depth);
    const flesh = orangeFlesh(own);
    for (const part of parts) {
      part.geometry.scale(scale, scale, scale);
      part.halves = [-1, 1].map(side => own(cappedHalf(part.geometry, side, {materialCount: part.materials.length})));
    }
    if (!parts.some(part => part.halves.some(geometry => geometry.groups.some(group => group.materialIndex === part.materials.length)))) {
      throw new Error('模型中心没有可切开的果肉。');
    }
    const auraGeometries = new Map([0, -1, 1].map(side => [side, own(new THREE.RingGeometry(1.06, 1.135, 64, 1,
      side < 0 ? Math.PI / 2 : -Math.PI / 2, side ? Math.PI : Math.PI * 2))]));
    const marker = own(new THREE.CircleGeometry(.054, 14));
    for (const [colorIndex, [color, tint]] of Object.entries({peach: '#fda5ba', mint: '#83e2c7', gold: '#ffda69'}).entries()) {
      const auraMaterial = own(new THREE.MeshBasicMaterial({color: tint, transparent: true, opacity: .95, depthWrite: false}));
      for (const side of [0, -1, 1]) {
        const group = new THREE.Group(), body = new THREE.Group();
        group.userData = {source: 'tripo', assetName: sourceAsset.name, color, side};
        if (side) body.rotation.y = side * .5;
        group.add(body);
        parts.forEach((part, index) => {
          const geometry = side ? part.halves[side < 0 ? 0 : 1] : part.geometry;
          if (!geometry.attributes.position.count) return;
          const materials = side ? [...part.materials, flesh] : part.materials.length === 1 ? part.materials[0] : part.materials;
          const mesh = new THREE.Mesh(geometry, materials);
          mesh.name = index ? `slice-peel-${index}` : 'slice-body'; body.add(mesh);
        });
        const aura = new THREE.Mesh(auraGeometries.get(side), auraMaterial);
        aura.name = 'slice-color-aura'; aura.position.z = -1.16; group.add(aura);
        // One / two / three pips supplement color without hiding photographed peel.
        if (!side) for (let i = 0; i <= colorIndex; i++) {
          const pip = new THREE.Mesh(marker, auraMaterial);
          pip.name = 'slice-color-pip'; pip.position.set((i - colorIndex / 2) * .15, -1.22, 0);
          group.add(pip);
        }
        models.set(`${color}/${side}`, group);
      }
    }
    return {name: sourceAsset.name, models, dispose};
  } catch (error) {dispose(); throw error;}
}

function createBlade(own) {
  const rings = LIMIT.trail * 2, sides = 6;
  const makeGeometry = () => {
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rings * sides * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(rings * sides * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array((rings - 1) * sides * 6), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    return geometry;
  };
  const core = new THREE.Mesh(makeGeometry(), own(new THREE.MeshBasicMaterial({
    color: '#fff5df', vertexColors: true, transparent: true, opacity: .95,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  })));
  core.name = 'slice-blade'; core.frustumCulled = false; core.renderOrder = 4;
  const glow = new THREE.Mesh(makeGeometry(), own(new THREE.MeshBasicMaterial({
    color: '#f5ad99', vertexColors: true, transparent: true, opacity: .16,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  })));
  glow.name = 'slice-blade-glow'; glow.frustumCulled = false; glow.renderOrder = 3;
  const point = new THREE.Vector3(), tangent = new THREE.Vector3();
  return {
    core, glow,
    update(trail) {
      const strokes = [];
      let stroke = [];
      for (const value of trail.slice(-LIMIT.trail)) {
        if (!validPoint(value) || lifeOf(value) <= 0 || value.break) {
          if (stroke.length > 1) strokes.push(stroke);
          stroke = [];
        }
        if (validPoint(value) && lifeOf(value) > 0) stroke.push(value);
      }
      if (stroke.length > 1) strokes.push(stroke);
      let ring = 0, indices = 0;
      for (const values of strokes) {
        const curve = new THREE.CatmullRomCurve3(values.map(value => new THREE.Vector3(value.x, -value.y, 180)));
        const samples = (values.length - 1) * 2 + 1;
        for (let sample = 0; sample < samples; sample++, ring++) {
          const t = sample / (samples - 1);
          curve.getPoint(t, point); curve.getTangent(t, tangent);
          if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0);
          const along = t * (values.length - 1), index = Math.min(values.length - 2, Math.floor(along));
          const fade = THREE.MathUtils.lerp(lifeOf(values[index]), lifeOf(values[index + 1]), along - index);
          for (const [layer, width] of [[core, 1], [glow, 3.4]]) {
            const geometry = layer.geometry, position = geometry.attributes.position, color = geometry.attributes.color;
            const radius = (1.2 + fade * 1.5) * width;
            for (let side = 0; side < sides; side++) {
              const angle = side / sides * Math.PI * 2, across = Math.cos(angle) * radius;
              position.setXYZ(ring * sides + side, point.x - tangent.y * across, point.y + tangent.x * across, point.z + Math.sin(angle) * radius);
              color.setXYZ(ring * sides + side, fade, fade, fade);
            }
          }
          if (!sample) continue; // Never bridge separate strokes.
          for (let side = 0; side < sides; side++) {
            const a = (ring - 1) * sides + side, b = (ring - 1) * sides + (side + 1) % sides;
            for (const value of [a, b, a + sides, b, b + sides, a + sides]) {
              core.geometry.index.setX(indices, value); glow.geometry.index.setX(indices++, value);
            }
          }
        }
      }
      for (const layer of [core, glow]) {
        layer.visible = indices > 0;
        layer.geometry.setDrawRange(0, indices);
        layer.geometry.attributes.position.needsUpdate = true;
        layer.geometry.attributes.color.needsUpdate = true;
        layer.geometry.index.needsUpdate = true;
      }
    },
  };
}

/** DOM-free scene graph used by the renderer; all geometry/materials are shared. */
export function createSliceWorld({reducedMotion = false} = {}) {
  const resources = new Set();
  const own = resource => (resources.add(resource), resource);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#102529');
  const camera = new THREE.OrthographicCamera(0, 960, 0, -600, .1, 2400);
  camera.position.z = 1200;
  const objects = new THREE.Group(), fragments = new THREE.Group();
  objects.name = 'slice-objects'; fragments.name = 'slice-fragments';
  scene.add(objects, fragments);
  const models = new Map(), liveObjects = new Map(), liveFragments = new Map();
  let disposed = false, imported = null, loadAbort = null, loadRequest = 0, assetVersion = 0;
  const material = (color, extra = {}) => own(new THREE.MeshStandardMaterial({color, roughness: .48, metalness: .04, ...extra}));
  function mesh(parent, geometry, surface, name = '') {
    const object = new THREE.Mesh(geometry, surface);
    object.name = name; parent.add(object); return object;
  }
  function buildModels() {
    const cream = material('#ffebce'), pit = material('#b75c53'), leaf = material('#668f73');
    const skin = {
      peach: material(PALETTE.peach, {roughness: .56}),
      mint: material(PALETTE.mint),
      gold: material(PALETTE.gold, {roughness: .26, metalness: .38, flatShading: true}),
      hazard: material('#687c83', {metalness: .72, roughness: .32, flatShading: true}),
    };
    const inside = {peach: material('#ffd6b2'), mint: material('#d3eed6'), gold: material('#fff0bc', {metalness: .24}), hazard: material('#a6b6b8')};
    const sphere = own(new THREE.SphereGeometry(1, 32, 24));
    const cube = own(roundedBox(1.4, 1.4, 1.15, .16));
    const jewel = own(new THREE.OctahedronGeometry(1).scale(.78, 1, .7));
    const metal = own(new THREE.CylinderGeometry(.92, .92, .42, 12).rotateX(Math.PI / 2));
    const bodies = {peach: sphere, mint: cube, gold: jewel, hazard: metal};
    const seamGeometry = own(new THREE.TorusGeometry(.991, .009, 6, 64).rotateY(Math.PI / 2));
    const dotGeometry = own(new THREE.SphereGeometry(1, 12, 8));
    const panelGeometry = own(roundedBox(.86, .86, .035, .016));
    const xGeometry = own(new THREE.BoxGeometry(.17, 1.12, .1));
    const screwGeometry = own(new THREE.CylinderGeometry(.055, .055, .035, 8).rotateX(Math.PI / 2));
    for (const kind of Object.keys(bodies)) {
      for (const side of [0, -1, 1]) {
        const group = new THREE.Group(), model = new THREE.Group(); group.add(model);
        if (side) model.rotation.y = side * .5;
        const geometry = side ? own(cappedHalf(bodies[kind], side)) : bodies[kind];
        mesh(model, geometry, side ? [skin[kind], inside[kind]] : skin[kind], 'slice-body');
        if (kind === 'peach') {
          if (side) {
            const seed = mesh(model, dotGeometry, pit, 'peach-stone');
            seed.position.x = -side * .014; seed.scale.set(.035, .29, .22);
          } else {
            mesh(model, seamGeometry, pit, 'peach-seam');
            const stem = mesh(model, dotGeometry, pit); stem.position.set(.03, .89, .1); stem.scale.set(.035, .09, .04);
            const sprout = mesh(model, dotGeometry, leaf); sprout.position.set(-.16, .84, .1); sprout.scale.set(.20, .075, .045); sprout.rotation.z = .3;
          }
        } else if (kind === 'mint') {
          if (side) {
            for (const y of [-.27, .27]) for (const z of [-.22, .22]) {
              const pore = mesh(model, dotGeometry, skin.mint);
              pore.position.set(-side * .012, y, z); pore.scale.set(.025, .075, .075);
            }
          } else {
            mesh(model, panelGeometry, inside.mint).position.z = .588;
            const stamp = mesh(model, own(new THREE.TorusGeometry(.16, .023, 6, 24)), skin.mint);
            stamp.position.z = .612;
          }
        } else if (kind === 'gold') {
          const edges = new THREE.LineSegments(own(new THREE.EdgesGeometry(geometry, 22)), own(new THREE.LineBasicMaterial({color: '#ffe7a7', transparent: true, opacity: .42})));
          model.add(edges);
          if (side) {
            const heart = mesh(model, jewel, skin.gold);
            heart.position.x = -side * .015; heart.scale.set(.03, .35, .35);
          }
        } else if (!side) {
          const mark = new THREE.Group(); mark.name = 'hazard-x'; model.add(mark);
          for (const angle of [-Math.PI / 4, Math.PI / 4]) {
            const bar = mesh(mark, xGeometry, cream); bar.position.z = .275; bar.rotation.z = angle;
          }
          for (let index = 0; index < 4; index++) {
            const angle = Math.PI / 4 + index * Math.PI / 2;
            mesh(model, screwGeometry, inside.hazard).position.set(Math.cos(angle) * .73, Math.sin(angle) * .73, .235);
          }
        }
        models.set(`${kind}/${side}`, group);
      }
    }
  }

  async function setTripoAsset({buffer, name = 'tripo-orange.glb'} = {}) {
    const cancelled = () => Object.assign(new Error('水果读取已取消。'), {name: 'AbortError'});
    if (disposed) throw cancelled();
    loadAbort?.abort();
    const controller = new AbortController(), request = ++loadRequest;
    loadAbort = controller;
    const bytes = ArrayBuffer.isView(buffer)
      ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;
    const filename = /\.glb$/i.test(name) ? name : `${name}.glb`;
    const source = await loadMolesCharacter({
      name: filename, size: bytes?.byteLength, arrayBuffer: async () => bytes,
    }, {signal: controller.signal});
    const asset = createSliceFruitAsset(source);
    if (disposed || request !== loadRequest) {asset.dispose(); throw cancelled();}
    for (const [key, model] of asset.models) models.set(key, model);
    imported?.dispose();
    imported = asset;
    assetVersion++;
    return asset.name;
  }

  function destroy() {
    if (disposed) return;
    disposed = true;
    loadAbort?.abort();
    imported?.dispose(); imported = null;
    for (const resource of resources) resource.dispose();
    resources.clear(); liveObjects.clear(); liveFragments.clear(); models.clear(); scene.clear();
  }
  try {
    buildModels();
    scene.add(new THREE.HemisphereLight('#fff0dd', '#244b4b', 2.6));
    const key = new THREE.DirectionalLight('#ffd2bc', 3.2); key.position.set(-400, 650, 1000); scene.add(key);
    const fill = new THREE.DirectionalLight('#b8f3e4', 1.5); fill.position.set(600, -150, 650); scene.add(fill);
    const background = new THREE.Group(); background.name = 'slice-background'; scene.add(background);
    const ringGeometry = own(new THREE.TorusGeometry(1, .018, 8, 80));
    const rings = ['#67454a', '#275c59'].map(color => mesh(background, ringGeometry, material(color, {roughness: .72, metalness: .1})));
    const shadowMaterial = own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main() { vUv=uv; vec4 p=vec4(position,1.0);
        #ifdef USE_INSTANCING
        p=instanceMatrix*p;
        #endif
        gl_Position=projectionMatrix*modelViewMatrix*p; }`,
      fragmentShader: `varying vec2 vUv; void main() { float d=length(vUv*2.0-1.0);
        gl_FragColor=vec4(0.012,0.026,0.028,0.26*(1.0-smoothstep(0.1,1.0,d))); }`,
    }));
    const shadows = new THREE.InstancedMesh(own(new THREE.PlaneGeometry(2, 2)), shadowMaterial, LIMIT.objects + LIMIT.fragments);
    shadows.name = 'slice-shadows'; shadows.frustumCulled = false; shadows.count = 0;
    shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); own(shadows); scene.add(shadows);
    const particles = new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(1, 0)),
      material('#ffffff', {metalness: .16, roughness: .35}), LIMIT.particles);
    particles.name = 'slice-particles'; particles.frustumCulled = false; particles.count = 0;
    particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); own(particles); scene.add(particles);
    const blade = createBlade(own); scene.add(blade.glow, blade.core);
    const transform = new THREE.Object3D(), color = new THREE.Color();
    function reconcile(values, map, parent, isFragment) {
      const selected = values.filter(value => validPoint(value) && Number.isFinite(value.r) && value.r > 0 && (!isFragment || lifeOf(value) > 0))
        .slice(-(isFragment ? LIMIT.fragments : LIMIT.objects));
      const seen = new Set();
      for (const value of selected) {
        const side = isFragment ? value.side < 0 ? -1 : 1 : 0;
        const kind = value.kind === 'hazard' ? 'hazard' : PALETTE[value.color] ? value.color : 'peach';
        const modelKey = `${kind}/${side}`, signature = `${modelKey}/${kind === 'hazard' ? 0 : assetVersion}`, id = `${value.id}/${side}`;
        seen.add(id);
        let object = map.get(id);
        if (object?.userData.signature !== signature) {
          object?.removeFromParent();
          object = models.get(modelKey).clone(true);
          object.userData = {...object.userData, id: value.id, signature};
          parent.add(object); map.set(id, object);
        }
        object.position.set(value.x, -value.y, clamp(finite(value.z), -40, 40));
        object.rotation.z = -finite(value.rotation);
        object.scale.setScalar(value.r * (isFragment ? .82 + .18 * lifeOf(value) : 1));
      }
      for (const [id, object] of map) if (!seen.has(id)) { object.removeFromParent(); map.delete(id); }
      return selected;
    }
    return {
      scene, camera, destroy, setTripoAsset,
      update(state) {
        if (disposed || !(state.width > 0) || !(state.height > 0) || !Number.isFinite(state.width + state.height)) return false;
        const width = state.width, height = state.height, time = reducedMotion ? 0 : finite(state.time);
        camera.right = width; camera.bottom = -height; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        rings[0].position.set(width * .15, -height * .73, -175);
        rings[1].position.set(width * .91, -height * .21, -190);
        rings[0].scale.setScalar(Math.min(width, height) * .52);
        rings[1].scale.setScalar(Math.min(width, height) * .41);
        rings[0].rotation.set(.45, .28, .2 + Math.sin(time * .12) * .035);
        rings[1].rotation.set(-.35, .34, -.4 + Math.sin(time * .1) * .025);
        const bodies = reconcile(state.objects || [], liveObjects, objects, false);
        const pieces = reconcile(state.fragments || [], liveFragments, fragments, true);
        let shadowCount = 0;
        for (const value of [...bodies, ...pieces]) {
          transform.position.set(value.x + value.r * .12, -value.y - value.r * .6, -125);
          transform.rotation.set(0, 0, 0); transform.scale.set(value.r * .94, value.r * .46, 1);
          transform.updateMatrix(); shadows.setMatrixAt(shadowCount++, transform.matrix);
        }
        shadows.count = shadowCount; shadows.instanceMatrix.needsUpdate = true;
        const specks = (state.particles || []).filter(value => validPoint(value) && Number.isFinite(value.r) && value.r > 0 && lifeOf(value) > 0).slice(-LIMIT.particles);
        particles.count = specks.length;
        for (const [index, value] of specks.entries()) {
          transform.position.set(value.x, -value.y, 35 + clamp(finite(value.z), -20, 20));
          transform.rotation.set(index * .7 + time, index * .3, time * .7);
          transform.scale.setScalar(value.r * (.25 + .75 * lifeOf(value))); transform.updateMatrix();
          particles.setMatrixAt(index, transform.matrix);
          color.set(PALETTE[value.color] || (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.color) ? value.color : '#ffe0c1'));
          particles.setColorAt(index, color);
        }
        particles.instanceMatrix.needsUpdate = true;
        if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
        blade.update(state.trail || []);
        scene.updateMatrixWorld(true);
        return true;
      },
    };
  } catch (error) { destroy(); throw error; }
}

export function createSliceScene(canvas, {onUnavailable = () => {}, reducedMotion = false} = {}) {
  let renderer, world, disposed = false, announced = false;
  let width = 0, height = 0, ratio = 0, lastState = null;
  const unavailable = error => {
    if (announced) return;
    announced = true;
    destroy();
    onUnavailable(error);
  };
  const contextLost = event => {
    event.preventDefault();
    if (!disposed) unavailable(new Error('切切乐 WebGL 上下文已丢失'));
  };
  function destroy() {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('webglcontextlost', contextLost);
    world?.destroy();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false, powerPreference: 'low-power'});
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.debug.onShaderError = () => { throw new Error('切切乐着色器无法在当前设备编译'); };
    world = createSliceWorld({reducedMotion});
    canvas.addEventListener('webglcontextlost', contextLost);
  } catch (error) {
    // Construction failure is handled synchronously by the controller's catch.
    destroy();
    throw error;
  }
  function render(state) {
    if (disposed) return;
    lastState = state;
    try {
      if (!world.update(state)) return;
      const dpr = Math.min(finite(globalThis.devicePixelRatio, 1) || 1, 2);
      if (ratio !== dpr || width !== state.width || height !== state.height ||
          canvas.width !== Math.floor(state.width * dpr) || canvas.height !== Math.floor(state.height * dpr)) {
        width = state.width; height = state.height; ratio = dpr;
        renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
      }
      renderer.render(world.scene, world.camera);
    } catch (error) { unavailable(error); }
  }
  return {
    render, destroy,
    async setTripoAsset(data) {
      const name = await world.setTripoAsset(data);
      if (!disposed && lastState) render(lastState);
      if (disposed) throw Object.assign(new Error('切切乐已关闭。'), {name: 'AbortError'});
      return name;
    },
  };
}
