import * as THREE from 'three';
import {DIVE_FOV, DIVE_ASSET_NAMES, DIVE_REEF_SITES, diveFloorAt, diveTargetAt, diveWildlifeAt} from './dive-state.js';

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


// This export has +Y up and +Z toward the nose. Deform only its outboard foreflippers;
// this is a bounded vertex animation, not a skeleton or an automatic rig.
export function createDiveTurtleMotion(root) {
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert(), bounds = new THREE.Box3(), candidates = [];
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || !mesh.geometry?.attributes.position ||
      Object.keys(mesh.geometry.morphAttributes).length) return;
    const original = mesh.geometry, toRoot = inverseRoot.clone().multiply(mesh.matrixWorld);
    original.computeBoundingBox();
    bounds.union(original.boundingBox.clone().applyMatrix4(toRoot));
    candidates.push({mesh, original, toRoot});
  });
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const halfWidth = Math.max(.0001, size.x / 2), halfLength = Math.max(.0001, size.z / 2);
  const tracks = [], point = new THREE.Vector3(), normal = new THREE.Vector3();
  let disposed = false;
  for (const {mesh, original, toRoot} of candidates) {
    const positions = original.attributes.position, normals = original.attributes.normal, vertices = [];
    const toLocal = toRoot.clone().invert();
    const normalToRoot = new THREE.Matrix3().getNormalMatrix(toRoot);
    const normalToLocal = new THREE.Matrix3().getNormalMatrix(toLocal);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(toRoot);
      const lateral = Math.abs(point.x - center.x) / halfWidth;
      const longitudinal = (point.z - center.z) / halfLength;
      const weight = THREE.MathUtils.smoothstep(lateral, .53, .9)
        * THREE.MathUtils.smoothstep(longitudinal, -.05, .2)
        * (1 - THREE.MathUtils.smoothstep(longitudinal, .78, .96));
      if (weight < .0001) continue;
      if (normals) normal.fromBufferAttribute(normals, i).applyMatrix3(normalToRoot).normalize();
      vertices.push({index:i, point:point.clone(), normal:normals ? normal.clone() : null,
        weight, side:Math.sign(point.x - center.x)});
    }
    if (!vertices.length) continue;
    const geometry = original.clone();
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geometry.attributes.normal?.setUsage(THREE.DynamicDrawUsage);
    geometry.computeBoundingSphere(); geometry.boundingSphere.radius += halfWidth * .3;
    mesh.geometry = geometry;
    tracks.push({mesh, original, geometry, vertices, toLocal, normalToLocal});
  }
  return {
    update(time) {
      if (disposed || !Number.isFinite(time)) return;
      for (const track of tracks) {
        for (const vertex of track.vertices) {
          const angle = vertex.side * Math.sin(time * 1.5) * .25 * vertex.weight;
          const c = Math.cos(angle), s = Math.sin(angle);
          const hinge = center.x + vertex.side * halfWidth * .44, baseY = center.y - size.y * .12;
          const x = vertex.point.x - hinge, y = vertex.point.y - baseY;
          point.set(hinge + x * c - y * s, baseY + x * s + y * c, vertex.point.z).applyMatrix4(track.toLocal);
          track.geometry.attributes.position.setXYZ(vertex.index, point.x, point.y, point.z);
          if (vertex.normal) {
            const n = vertex.normal;
            normal.set(n.x * c - n.y * s, n.x * s + n.y * c, n.z).applyMatrix3(track.normalToLocal).normalize();
            track.geometry.attributes.normal.setXYZ(vertex.index, normal.x, normal.y, normal.z);
          }
        }
        track.geometry.attributes.position.needsUpdate = true;
        if (track.geometry.attributes.normal) track.geometry.attributes.normal.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const {mesh, geometry, original} of tracks) {
        if (mesh.geometry === geometry) mesh.geometry = original;
        geometry.dispose();
      }
      tracks.length = 0;
    },
  };
}

export function createDiveScene(canvas, {reducedMotion = false} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
  canvas[RENDERER_OWNER]=renderer;
  const resources = new Set(), assets = new Map(), imported = new Map(), swimmers = new Map();
  const own = value => {resources.add(value); return value;};
  let disposed = false, seed = 9137, turtleMotion = null;
  const random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(DIVE_FOV, 1, .12, 160);
  const time = {value:0}, object = new THREE.Object3D(), color = new THREE.Color();
  const fishEyeOffset = new THREE.Vector3();
  const modelSizes = {
    turtle:[2.6,1.25,2.6], coral:[2.4,2.7,2.4], manta:[4.6,1.8,3.5],
    dolphin:[1.1,1.45,3.5], clownfish:[.36,.48,.75], angelfish:[.38,.9,.85],
    seafan:[2.6,2.6,1.5], tablecoral:[3.2,1.35,3], anemone:[1.65,1.25,1.65],
  };
  // Canonical animal nose is +Z here; the swim transform below turns it to -Z.
  // These bases were checked against the actual exported meshes, before uniform fitting.
  const modelBasis = {manta:Math.PI / 2, dolphin:-Math.PI / 2,
    clownfish:Math.PI, angelfish:Math.PI, seafan:Math.PI / 2};
  const seaColor = new THREE.Color('#087ca4'), deepColor = new THREE.Color('#033d6b');
  scene.background = seaColor.clone(); scene.fog = new THREE.FogExp2(seaColor.clone(), .033);
  camera.rotation.order = 'YXZ';
  try {
  renderer.setPixelRatio(Math.min(1.65, canvas.ownerDocument?.defaultView?.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

  function texture(kind) {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const index = (y * size + x) * 4;
      const ripple = Math.sin(y * .44 + 1.4 * Math.sin(x * .049));
      const noise = (random() - .5) * 11;
      const v = kind === 'sand' ? 226 + ripple * 4 + noise * .65
        : 191 + 5 * Math.sin(x * .049 + Math.sin(y * .034)) + noise;
      data[index] = v; data[index + 1] = v * (kind === 'sand' ? .96 : 1.03);
      data[index + 2] = v * .79; data[index + 3] = 255;
    }
    const map = own(new THREE.DataTexture(data, size, size));
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(kind === 'sand' ? 32 : 2, kind === 'sand' ? 32 : 2);
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.anisotropy = 4;
    map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true;
    return map;
  }
  function caustics(mat) {
    // Moving caustic light is evaluated in world coordinates, including instanced coral.
    mat.onBeforeCompile = shader => {
      shader.uniforms.diveTime = time;
      shader.vertexShader = 'varying vec3 vDiveWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `
        #include <worldpos_vertex>
        vec4 divePoint = vec4(transformed, 1.);
        #ifdef USE_INSTANCING
          divePoint = instanceMatrix * divePoint;
        #endif
        vDiveWorld = (modelMatrix * divePoint).xyz;
      `);
      shader.fragmentShader = 'uniform float diveTime; varying vec3 vDiveWorld;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec2 p = vDiveWorld.xz * 1.9 + vDiveWorld.y * .12;
        float a = sin(p.x + sin(p.y * 1.31 + diveTime * .19) * 1.6 + diveTime * .22);
        float b = sin(p.y * 1.13 + sin(p.x * .81 - diveTime * .16) * 1.3);
        float caustic = pow(max(0., 1. - abs(a + b) * .85), 14.);
        vec3 surfaceNormal = normalize(cross(dFdx(vDiveWorld), dFdy(vDiveWorld)));
        float upward = .18 + .82 * abs(surfaceNormal.y);
        outgoingLight += diffuseColor.rgb * vec3(.22, .29, .22) * caustic * upward
          * clamp(1. + vDiveWorld.y / 26., .05, 1.);
        #include <opaque_fragment>
      `);
    };
    mat.customProgramCacheKey = () => 'dive-caustics-v2';
    mat.needsUpdate = true;
    return mat;
  }
  function material(tint, options = {}) {
    return caustics(own(new THREE.MeshStandardMaterial({color:tint, roughness:.88, metalness:0, ...options})));
  }
  const sphere = () => own(new THREE.SphereGeometry(1, 24, 14));
  function mesh(geometry, mat, parent, position = [0,0,0], scale = [1,1,1], name = '') {
    const item = new THREE.Mesh(geometry, mat);
    item.position.set(...position); item.scale.set(...scale); item.name = name;
    parent.add(item); return item;
  }
  function group(name, parent = scene) {const value = new THREE.Group(); value.name = name; parent.add(value); return value;}
  function tube(points, radius, mat, parent) {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    return mesh(own(new THREE.TubeGeometry(curve, 16, radius, 6, false)), mat, parent);
  }
  function rockyGeometry() {
    const geometry = own(new THREE.SphereGeometry(1, 24, 16)), p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const scale = 1 + .08 * Math.sin(x * 2.7 + z) * Math.cos(y * 3.1 - z * 1.4);
      p.setXYZ(i, x * scale, y * scale, z * scale);
    }
    geometry.computeVertexNormals(); return geometry;
  }
    const sky = new THREE.HemisphereLight('#bde7e6', '#48615b', 1.6);
    const sun = new THREE.DirectionalLight('#ffefd1', 3); sun.position.set(-18, 30, 10);
    sun.castShadow = true; sun.shadow.mapSize.set(2048,2048);
    own(sun.shadow);
    Object.assign(sun.shadow.camera, {left:-28,right:28,top:26,bottom:-28,near:.5,far:90});
    sun.shadow.bias = -.0003; sun.shadow.normalBias = .04;
    sun.target.position.set(0,-8,-8); scene.add(sun.target);
    const fill = new THREE.DirectionalLight('#65a9bf', .75); fill.position.set(15, -3, -25);
    scene.add(sky, sun, fill);

    const sand = texture('sand'), reefTexture = texture('reef');
    const sandMaterial = material('#f2edde', {map:sand, bumpMap:sand, bumpScale:.03, vertexColors:true});
    const reefMaterial = material('#c1baa4', {map:reefTexture, bumpMap:reefTexture, bumpScale:.025});
    const terrain = own(new THREE.PlaneGeometry(320, 320, 200, 200));
    terrain.rotateX(-Math.PI / 2);
    const points = terrain.attributes.position, sandColors = new Float32Array(points.count * 3);
    const sandTint = new THREE.Color('#fffdf3'), bankTint = new THREE.Color('#b4bca0');
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), z = points.getZ(i);
      points.setY(i, diveFloorAt(x, z) + .026 * Math.sin(z * 6 + Math.sin(x * .8)));
      const channel = .65 * Math.sin((z + 4) * .12);
      const bank = Math.exp(-((Math.abs(x - channel) - 4.3) ** 2 / 5.8 + (z + 5) ** 2 / 280));
      color.copy(sandTint).lerp(bankTint, bank * .4).toArray(sandColors, i * 3);
    }
    terrain.setAttribute('color', new THREE.BufferAttribute(sandColors,3));
    terrain.computeVertexNormals();
    mesh(terrain, sandMaterial, scene, [0,0,0], [1,1,1], 'dive-seabed').receiveShadow = true;

    const rockGeometry = rockyGeometry();
    const rocks = own(new THREE.InstancedMesh(rockGeometry, reefMaterial, 36));
    rocks.name = 'dive-reef-rocks'; scene.add(rocks);
    for (let i = 0; i < rocks.count; i++) {
      const side = i % 2 ? 1 : -1, x = side * (3.8 + random() * 15), z = -32 + random() * 31;
      const scale = .45 + random() * .65;
      // Low limestone shelves are buried in the seabed; no tumbling boulders in open water.
      let base = Infinity;
      for (const dx of [-scale,0,scale]) for (const dz of [-scale,0,scale]) {
        base = Math.min(base,diveFloorAt(x + dx,z + dz));
      }
      object.position.set(x,base - .12,z);
      object.scale.set(scale * 1.2, scale * .3, scale * 1.1);
      object.rotation.set(0, random() * 6, 0); object.updateMatrix();
      rocks.setMatrixAt(i, object.matrix);
      rocks.setColorAt(i, color.setHSL(.12 + random() * .04, .07, .72 + random() * .17));
    }
    rocks.castShadow = rocks.receiveShadow = true;

    const coralDefault = group('dive-coral-procedural');
    const branchGeometry = own(new THREE.CylinderGeometry(.035, .095, 1, 6));
    const branchMaterial = material('#c0b397');
    const branches = own(new THREE.InstancedMesh(branchGeometry, branchMaterial, 576));
    coralDefault.add(branches);
    let branchIndex = 0;
    const up = new THREE.Vector3(0,1,0), start = new THREE.Vector3(), end = new THREE.Vector3();
    for (let cluster = 0; cluster < 24; cluster++) {
      const x = (cluster % 2 ? 1 : -1) * (3.5 + random() * 8), z = -3 - random() * 23, base = diveFloorAt(x,z);
      const tint = new THREE.Color().setHSL([.015,.06,.92,.53,.08][cluster % 5], .3 + random() * .16, .5 + random() * .12);
      const height = .45 + random() * .9;
      for (let stem = 0; stem < 8; stem++) {
        const direction = stem / 8 * Math.PI * 2;
        for (let section = 0; section < 3; section++) {
          const reach = (section + 1) * .19 * height;
          start.set(x + Math.sin(direction) * reach, base + section * height / 3, z + Math.cos(direction) * reach);
          end.set(x + Math.sin(direction + .2) * (reach + .2 * height), base + (section + 1) * height / 3, z + Math.cos(direction + .2) * (reach + .2 * height));
          object.position.copy(start).add(end).multiplyScalar(.5);
          object.quaternion.setFromUnitVectors(up, end.clone().sub(start).normalize());
          object.scale.set(height * (1 - section * .2), start.distanceTo(end), height * (1 - section * .2));
          object.updateMatrix(); branches.setMatrixAt(branchIndex, object.matrix); branches.setColorAt(branchIndex++, tint);
        }
      }
    }
    const plateGeometry = own(new THREE.SphereGeometry(1, 16, 8));
    const plates = own(new THREE.InstancedMesh(plateGeometry, material('#c4b79c'), 60));
    coralDefault.add(plates);
    for (let i = 0; i < plates.count; i++) {
      const x = (i % 2 ? 1 : -1) * (3.5 + random() * 12), z = -3 - random() * 29, r = .2 + random() * .65;
      object.position.set(x, diveFloorAt(x,z) + .3 + (i % 3) * .25, z);
      object.rotation.set(random() * .2, random() * 6, random() * .2);
      object.scale.set(r, .09 + random() * .08, r * .85); object.updateMatrix();
      plates.setMatrixAt(i, object.matrix);
      plates.setColorAt(i, color.setHSL(.10 + random() * .05, .23, .42 + random() * .13));
    }
    const grassGeometry = own(new THREE.PlaneGeometry(.07, .55, 1, 4));
    grassGeometry.translate(0,.275,0);
    const grassPoints = grassGeometry.attributes.position;
    for (let i = 0; i < grassPoints.count; i++) {
      const height = grassPoints.getY(i) / .55;
      grassPoints.setXYZ(i, grassPoints.getX(i) * (1 - height * .6),
        grassPoints.getY(i) * .72, height * height * .22);
    }
    grassGeometry.computeVertexNormals();
    const grassMaterial = material('#758673', {side:THREE.DoubleSide});
    const grass = own(new THREE.InstancedMesh(grassGeometry, grassMaterial, 180)); scene.add(grass);
    for (let i = 0; i < grass.count; i++) {
      const x = (i % 2 ? 1 : -1) * (5 + random() * 15), z = -2 - random() * 30;
      object.position.set(x, diveFloorAt(x,z), z); object.rotation.set(.14, random() * 6, (random() - .5) * .25);
      object.scale.setScalar(.35 + random() * .55); object.updateMatrix(); grass.setMatrixAt(i, object.matrix);
    }

    const arch = group('dive-arch'), archPoint = diveTargetAt('arch');
    arch.position.set(archPoint.x, archPoint.y, archPoint.z);
    const archMaterial = material('#c8c4af', {map:reefTexture, bumpMap:reefTexture, bumpScale:.045});
    const archGeometry = own(new THREE.TorusGeometry(3, 1, 14, 48, Math.PI));
    const archVertices = archGeometry.attributes.position;
    for (let i = 0; i < archVertices.count; i++) {
      const x = archVertices.getX(i), y = archVertices.getY(i), z = archVertices.getZ(i);
      const theta = Math.atan2(y,x), c = Math.cos(theta), s = Math.sin(theta);
      const radius = .48 + .18 * Math.sin(theta * 1.3 + .2) ** 2 + .1 * Math.cos(theta * 4.8 + .4);
      const erosion = 1 + .075 * Math.sin(x * 4.1 + y * 2.7 + z * 3);
      archVertices.setXYZ(i, c * 3 + (x - c * 3) * radius * erosion,
        s * 2.68 + (y - s * 3) * radius * erosion + .12 * Math.sin(theta * 3),
        z * radius * erosion + .12 * Math.sin(theta * 2));
    }
    archGeometry.computeVertexNormals();
    mesh(archGeometry, archMaterial, arch, [0,-.7,0]);
    rockGeometry.computeBoundingBox();
    for (const side of [-1,1]) {
      const x = archPoint.x + side * 3, z = archPoint.z;
      let ground = Infinity;
      for (const dx of [-1,0,1]) for (const dz of [-1,0,1]) ground = Math.min(ground,diveFloorAt(x + dx,z + dz));
      const height = archPoint.y - .7 - ground + .45;
      const support = mesh(rockGeometry, archMaterial, arch, [side * 3,0,0],
        [.62,height / (rockGeometry.boundingBox.max.y - rockGeometry.boundingBox.min.y),.74],
        `dive-arch-support-${side < 0 ? 'left' : 'right'}`);
      support.updateWorldMatrix(true,false);
      const bounds = new THREE.Box3().setFromObject(support,true);
      support.position.y += ground - bounds.min.y - .08;
    }

    const wreck = group('dive-wreck'), wreckPoint = diveTargetAt('wreck');
    wreck.position.set(wreckPoint.x, wreckPoint.y, wreckPoint.z); wreck.rotation.y = -.48;
    const wood = material('#655f45', {map:reefTexture, bumpMap:reefTexture, bumpScale:.13});
    const timber = own(new THREE.BoxGeometry(1,1,1));
    for (let z = -3; z <= 3; z += .6) {
      const width = Math.sqrt(Math.max(.1, 1 - (z / 3.9) ** 2)) * 1.4;
      mesh(timber, wood, wreck, [0,-1.36,z], [width * 1.9,.12,.48]);
      tube([[-width,.1,z],[-width * .78,-1,z],[0,-1.6,z],[width * .78,-1,z],[width,.1,z]], .065, wood, wreck);
    }
    for (const side of [-1,1]) for (let row = 0; row < 4; row++) {
      const plank = mesh(timber, wood, wreck, [side * (1.03 + row * .095), -.9 + row * .26, row % 2 ? -.5 : .3],
        [.1,.2,row === 3 && side > 0 ? 3.6 : 6]);
      plank.rotation.z = side * -.12;
    }
    tube([[0,-1.45,-2],[0,-.8,0],[2.4,1.2,2.6]], .1, wood, wreck);
    const rope = material('#6f8070');
    tube([[2.4,1.2,2.6],[2.1,-.25,.2],[1,-1,-2.5]], .017, rope, wreck);

    const turtle = group('dive-turtle'), turtleDefault = group('dive-turtle-procedural', turtle);
    const animalGeometry = sphere(), shell = material('#66794b', {map:reefTexture, bumpMap:reefTexture, bumpScale:.025});
    const skin = material('#8a986b'), belly = material('#c4c59b'), eye = material('#101e20', {roughness:.23});
    mesh(animalGeometry, belly, turtleDefault, [0,-.08,0], [.57,.18,.82]);
    mesh(animalGeometry, shell, turtleDefault, [0,.1,0], [.65,.32,.9]);
    mesh(animalGeometry, skin, turtleDefault, [0,.015,-.96], [.2,.19,.33]);
    mesh(animalGeometry, skin, turtleDefault, [0,.04,-1.2], [.22,.19,.26]);
    for (const side of [-1,1]) mesh(animalGeometry, eye, turtleDefault, [side * .17,.11,-1.32], [.032,.033,.04]);
    const flippers = [];
    for (const side of [-1,1]) {
      const pivot = group('', turtleDefault); pivot.position.set(side * .43,-.04,-.45);
      const fin = mesh(animalGeometry, skin, pivot, [side * .4,0,.05], [.63,.055,.2]); fin.rotation.y = side * .38;
      flippers.push(pivot);
      const back = mesh(animalGeometry, skin, turtleDefault, [side * .51,-.05,.64], [.3,.065,.16]);
      back.rotation.y = side * -.45;
    }
    for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
      mesh(animalGeometry, material(row === 0 ? '#536747' : '#7b8654'), turtleDefault,
        [col * .27,.375 - col * col * .052 - row * row * .047,row * .36], [.15,.016,.19]);
    }

    const ray = group('dive-ray'), rayDefault = group('dive-ray-procedural',ray);
    const rayMaterial = material('#6b8583', {side:THREE.DoubleSide, roughness:.65});
    const rayGeometry = own(new THREE.PlaneGeometry(3.6, 2, 24, 14)); rayGeometry.rotateX(-Math.PI / 2);
    const rayPoints = rayGeometry.attributes.position, rayBase = [];
    for (let i = 0; i < rayPoints.count; i++) {
      const x = rayPoints.getX(i), z = rayPoints.getZ(i);
      const width = .15 + .85 * Math.sqrt(Math.max(0, 1 - z * z));
      const px = x * width, py = .2 * Math.exp(-px * px * 3) * (1 - z * z);
      rayPoints.setXYZ(i, px, py, z); rayBase.push({x:px,y:py,z});
    }
    rayGeometry.computeVertexNormals(); mesh(rayGeometry, rayMaterial, rayDefault);
    tube([[0,0,.65],[0,-.025,1.4],[.1,-.05,2.4],[.17,0,3.1]], .024, rayMaterial, rayDefault);
    for (const side of [-1,1]) mesh(animalGeometry, eye, rayDefault, [side * .16,.19,-.45], [.045,.035,.055]);

    const fishDefault = group('dive-fish-procedural');
    const fishBody = own(new THREE.SphereGeometry(1, 14, 10)); fishBody.scale(.065,.125,.27);
    const fishMat = material('#d5dfd4', {metalness:.28, roughness:.38});
    const fish = own(new THREE.InstancedMesh(fishBody, fishMat, 36)); fish.name = 'dive-fish-school';
    const tailGeometry = own(new THREE.BufferGeometry());
    tailGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0,0,.22, 0,.16,.49, 0,.028,.38, 0,0,.22, 0,-.16,.49, 0,-.028,.38,
      0,.09,.1, 0,.22,.07, 0,.1,-.14,
      -.04,-.02,-.08, -.19,-.09,.08, -.045,-.07,.14,
      .04,-.02,-.08, .19,-.09,.08, .045,-.07,.14,
    ], 3));
    tailGeometry.computeVertexNormals();
    const tails = own(new THREE.InstancedMesh(tailGeometry, material('#c3d8c2', {side:THREE.DoubleSide, roughness:.5}), fish.count));
    const fishEyes = own(new THREE.InstancedMesh(own(new THREE.SphereGeometry(.014,6,4)), eye, fish.count * 2));
    fish.frustumCulled = tails.frustumCulled = fishEyes.frustumCulled = false;
    fishDefault.add(fish, tails, fishEyes);
    const fishLayout = [];
    for (let i = 0; i < fish.count; i++) {
      const school = i % 3;
      fishLayout.push({school, x:(random() - .5) * 6.8, y:(random() - .5) * 1.9,
        z:(random() - .5) * 3.6, scale:.65 + random() * .55, phase:random() * Math.PI * 2});
      color.setHSL([.13,.51,.57][school], [.4,.18,.26][school], .6 + random() * .17);
      fish.setColorAt(i, color); tails.setColorAt(i, color);
    }

    // Extend beyond every swimming boundary; the surface fades before its mesh edge or far clip.
    const waterGeometry = own(new THREE.PlaneGeometry(320, 320, 100, 100)); waterGeometry.rotateX(-Math.PI / 2);
    const water = own(new THREE.ShaderMaterial({
      uniforms:{diveTime:time, diveBackground:{value:scene.background},
        diveSurface:{value:new THREE.Color('#69aeb1')}, diveAbsorption:{value:.014}},
      side:THREE.DoubleSide, transparent:true, depthWrite:false, toneMapped:false,
      vertexShader:`uniform float diveTime; varying vec3 vWater;
        void main(){
          vec3 p=position;
          p.y+=sin(p.x*.19+diveTime*.22)*.035+cos(p.z*.13+diveTime*.17)*.03;
          vec4 world=modelMatrix*vec4(p,1.);
          vWater=world.xyz;
          gl_Position=projectionMatrix*viewMatrix*world;
        }`,
      fragmentShader:`uniform float diveTime, diveAbsorption;
        uniform vec3 diveBackground, diveSurface;
        varying vec3 vWater;
        float waterHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float waterNoise(vec2 p){
          vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(waterHash(i),waterHash(i+vec2(1.,0.)),f.x),
            mix(waterHash(i+vec2(0.,1.)),waterHash(i+vec2(1.,1.)),f.x),f.y);
        }
        void main(){
          vec2 p=vWater.xz*.32, flow=vec2(diveTime*.025,-diveTime*.017);
          vec2 warp=vec2(waterNoise(p*.43+flow),waterNoise(p*.53-flow+17.3));
          float swell=waterNoise(p*.65+warp*.85+flow)*.67
            +waterNoise(p*1.47-warp+flow)*.33;
          float glint=smoothstep(.72,.96,waterNoise(p*2.8+warp*1.6-flow))*.026;
          vec3 toEye=cameraPosition-vWater;
          float distanceToEye=length(toEye);
          float edgeFade=1.-smoothstep(42.,78.,distanceToEye);
          float absorption=exp(-distanceToEye*(.026+diveAbsorption*.45));
          float facing=abs(toEye.y)/max(.001,distanceToEye);
          vec3 surface=diveSurface*(.94+swell*.12)+vec3(.38,.48,.35)*glint;
          vec3 col=mix(diveBackground,surface,absorption*edgeFade*mix(.4,.82,facing));
          gl_FragColor=vec4(col,.9*edgeFade);
          #include <colorspace_fragment>
        }`,
    }));
    mesh(waterGeometry, water, scene, [0,0,0], [1,1,1], 'dive-water-surface');
    const shaftMat = own(new THREE.ShaderMaterial({
      uniforms:{diveTime:time}, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.DoubleSide,
      vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform float diveTime; varying vec2 vUv;
        void main(){float edge=pow(sin(vUv.x*3.14159265),2.);
        float fade=sin(vUv.y*3.14159265)*(.8+.2*sin(diveTime*.22+vUv.y*5.));
        gl_FragColor=vec4(.62,.79,.65,edge*fade*.018);}`,
    }));
    const shaftGeometry = own(new THREE.CylinderGeometry(.18, 3.4, 32, 12, 1, true));
    for (const [x,z] of [[-13,-14],[6,-7],[18,-31],[-25,5],[0,-38]]) {
      const beam = mesh(shaftGeometry, shaftMat, scene, [x,-14,z]); beam.rotation.z = -.23;
    }

    const particleGeometry = own(new THREE.BufferGeometry()), particlePositions = new Float32Array(800 * 3);
    for (let i = 0; i < 800; i++) {
      const x = (random() - .5) * 65, z = (random() - .65) * 70;
      particlePositions[i * 3] = x;
      particlePositions[i * 3 + 1] = i % 3 ? diveFloorAt(x,z) + .25 + random() * 2.2 : -random() * 19;
      particlePositions[i * 3 + 2] = z;
    }
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const spriteData = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const index = (y * 16 + x) * 4;
      spriteData.set([255,255,255,Math.max(0,1 - Math.hypot(x - 7.5,y - 7.5) / 7.5) ** 2 * 255], index);
    }
    const sprite = own(new THREE.DataTexture(spriteData,16,16));
    sprite.magFilter = sprite.minFilter = THREE.LinearFilter; sprite.needsUpdate = true;
    const particleMat = own(new THREE.PointsMaterial({color:'#d1e1cd', map:sprite, size:.055,
      transparent:true, opacity:.3, depthWrite:false}));
    const particles = new THREE.Points(particleGeometry, particleMat); scene.add(particles);
    const bubbleMat = material('#acd8d5', {transparent:true, opacity:.17, roughness:.08});
    const bubbles = own(new THREE.InstancedMesh(own(new THREE.SphereGeometry(1, 8, 6)), bubbleMat, 14));
    scene.add(bubbles);

    function resize(width, height) {
      if (disposed) return;
      const w = Math.max(1, Number.isFinite(width) ? width : 1), h = Math.max(1, Number.isFinite(height) ? height : 1);
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
    }
    function render(state) {
      if (disposed) return;
      const t = state.elapsed;
      time.value = reducedMotion ? t * .35 : t;
      camera.position.set(state.position.x, state.position.y, state.position.z);
      camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
      const deep = THREE.MathUtils.clamp((-state.position.y - 3) / 19, 0, 1);
      scene.background.copy(seaColor).lerp(deepColor, deep);
      scene.fog.color.copy(scene.background); scene.fog.density = .014 + deep * .017;
      water.uniforms.diveAbsorption.value = scene.fog.density;
      sky.intensity = 1.6 - deep * .35; sun.intensity = 3 - deep * 1.15;
      for (const [id, animal] of [['turtle',turtle], ['ray',ray]]) {
        const point = diveTargetAt(id, t), next = diveTargetAt(id, t + .1);
        animal.position.set(point.x, point.y, point.z);
        animal.rotation.y = Math.atan2(-(next.x - point.x), -(next.z - point.z));
        animal.rotation.z = Math.sin(t * .35) * .035;
      }
      flippers.forEach((fin, i) => {fin.rotation.z = (i ? 1 : -1) * Math.sin(t * 1.6) * .3;});
      turtleMotion?.update(reducedMotion ? t * .5 : t);
      for (const [kind, instances] of swimmers) {
        instances.forEach((fitted,index) => {
          const point = diveWildlifeAt(kind,index,t), next = diveWildlifeAt(kind,index,t + .1);
          fitted.position.set(point.x,point.y,point.z);
          fitted.rotation.set(0,Math.atan2(-(next.x - point.x),-(next.z - point.z)) + Math.PI,
            Math.sin(t * (kind === 'dolphin' ? .7 : 1.8) + index) * .025);
        });
      }
      for (let i = 0; i < rayPoints.count; i++) {
        const point = rayBase[i];
        rayPoints.setY(i, point.y + Math.sin(t * 1.8 - Math.abs(point.x) * 1.2) * Math.abs(point.x) * .17);
      }
      rayPoints.needsUpdate = true; rayGeometry.computeVertexNormals();
      for (let i = 0; i < fish.count; i++) {
        const layout = fishLayout[i], school = layout.school, phase = t * .075 + school * 1.7;
        const dx = 2.3 * Math.cos(phase), dz = .95 * Math.cos(phase * .7);
        object.position.set([-2,5,-4][school] + layout.x + 2.3 * Math.sin(phase),
          [-5.6,-6.9,-10][school] + layout.y + Math.sin(t * .65 + layout.phase) * .06,
          [-9,-14,-23][school] + layout.z + 1.35 * Math.sin(phase * .7));
        object.rotation.set(0, Math.atan2(-dx,-dz), Math.sin(t * 2 + layout.phase) * .035);
        object.scale.setScalar(layout.scale); object.updateMatrix(); fish.setMatrixAt(i, object.matrix);
        object.rotation.y += Math.sin(t * 7 + layout.phase) * .16;
        object.updateMatrix(); tails.setMatrixAt(i, object.matrix);
        object.rotation.y -= Math.sin(t * 7 + layout.phase) * .16;
        for (const side of [-1,1]) {
          fishEyeOffset.set(side * .052,.045,-.19).multiplyScalar(layout.scale).applyEuler(object.rotation);
          object.position.add(fishEyeOffset); object.updateMatrix();
          fishEyes.setMatrixAt(i * 2 + (side > 0 ? 1 : 0),object.matrix);
          object.position.sub(fishEyeOffset);
        }
      }
      fish.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = fishEyes.instanceMatrix.needsUpdate = true;
      particles.position.x = Math.sin(t * .05) * .35; particles.position.y = Math.sin(t * .07) * .13;
      for (let i = 0; i < 14; i++) {
        const age = (t * .65 + i * .31) % 5;
        object.position.set(state.position.x + .6 + Math.sin(i + t) * .08, state.position.y - .7 + age,
          state.position.z + .5 + Math.cos(i) * .15);
        object.rotation.set(0,0,0); object.scale.setScalar(.025 + age * .008); object.updateMatrix(); bubbles.setMatrixAt(i, object.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    }
    function setTripoAsset(kind, asset) {
      if (disposed || !Object.hasOwn(DIVE_ASSET_NAMES,kind)) {asset.dispose(); return false;}
      if (assets.get(kind) === asset) return true;
      const stationary = Object.hasOwn(DIVE_REEF_SITES,kind), sites = DIVE_REEF_SITES[kind];
      const parent = kind === 'turtle' ? turtle : kind === 'manta' ? ray : scene, holder = new THREE.Group();
      let nextMotion = null;
      holder.name = `dive-tripo-${kind}`;
      try {
        const count = stationary ? sites.length : kind === 'clownfish' ? 5 : kind === 'angelfish' ? 4 : 1;
        for (let i = 0; i < count; i++) {
          const clone = asset.createInstance(), basis = new THREE.Group(), fitted = new THREE.Group();
          basis.rotation.y = modelBasis[kind] || 0; basis.add(clone);
          basis.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(basis, true);
          const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
          if (box.isEmpty() || ![...size.toArray(),...center.toArray()].every(Number.isFinite)) throw new Error('模型尺寸无效');
          const limit = modelSizes[kind];
          // Uniform scale preserves the actual animal's proportions, including flat bodies.
          const scale = Math.min(...size.toArray().map((value, index) => limit[index] / Math.max(.0001,value)));
          basis.scale.setScalar(scale);
          basis.position.set(-center.x * scale, -(stationary ? box.min.y : center.y) * scale, -center.z * scale);
          fitted.add(basis);
          if (kind === 'turtle') nextMotion = createDiveTurtleMotion(clone);
          clone.traverse(item => {
            if (!item.isMesh) return;
            item.castShadow = stationary ? Math.hypot(sites[i][0],sites[i][1] - 3) < 16
              : kind === 'turtle' || kind === 'manta';
            item.receiveShadow = true;
            for (const mat of [item.material].flat()) {
              if (!mat.isMeshStandardMaterial) continue;
              if (kind === 'dolphin') {mat.metalness = Math.min(mat.metalness,.04); mat.roughness = Math.max(mat.roughness,.62);}
              caustics(mat);
              for (const value of Object.values(mat)) if (value?.isTexture) value.anisotropy = 4;
            }
          });
          fitted.rotation.y = stationary ? sites[i][3] : Math.PI;
          if (stationary) {
            const [x,z,variation] = sites[i];
            fitted.position.set(x,diveFloorAt(x,z),z);
            fitted.scale.setScalar(variation);
          } else if (kind !== 'turtle' && kind !== 'manta') {
            const point = diveWildlifeAt(kind,i,0);
            fitted.position.set(point.x,point.y,point.z);
            fitted.scale.setScalar(1 - (i % 3) * .08);
          }
          holder.add(fitted);
          if (stationary) {
            // A flat exported rock base needs to sink into the slope, not balance on its centre.
            fitted.updateMatrixWorld(true);
            const footprint = new THREE.Box3().setFromObject(fitted, true);
            let ground = Infinity;
            for (const x of [footprint.min.x, (footprint.min.x + footprint.max.x) / 2, footprint.max.x]) {
              for (const z of [footprint.min.z, (footprint.min.z + footprint.max.z) / 2, footprint.max.z]) {
                ground = Math.min(ground, diveFloorAt(x,z));
              }
            }
            fitted.position.y += ground - footprint.min.y - .04;
          }
        }
      } catch (error) {nextMotion?.dispose(); asset.dispose(); throw error;}
      if (kind === 'turtle') {turtleMotion?.dispose(); turtleMotion = nextMotion;}
      imported.get(kind)?.removeFromParent(); assets.get(kind)?.dispose();
      imported.set(kind, holder); assets.set(kind, asset); parent.add(holder);
      if (!stationary && kind !== 'turtle' && kind !== 'manta') swimmers.set(kind,holder.children);
      turtleDefault.visible = !assets.has('turtle');
      rayDefault.visible = !assets.has('manta');
      coralDefault.visible = !Object.keys(DIVE_REEF_SITES).some(key => assets.has(key));
      fishDefault.visible = !assets.has('clownfish') && !assets.has('angelfish');
      return true;
    }
    function capture(state) {
      if (disposed) return null;
      render(state);
      const image = canvas.ownerDocument.createElement('canvas');
      const scale = Math.min(1, 1200 / Math.max(canvas.width, canvas.height));
      image.width = Math.max(1, Math.round(canvas.width * scale)); image.height = Math.max(1, Math.round(canvas.height * scale));
      const context = image.getContext('2d');
      if (!context) return null;
      context.drawImage(canvas, 0, 0, image.width, image.height);
      return image.toDataURL('image/jpeg', .86);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      turtleMotion?.dispose(); turtleMotion = null;
      assets.forEach(asset => asset.dispose()); assets.clear(); imported.clear(); swimmers.clear(); scene.clear();
      resources.forEach(resource => resource.dispose()); resources.clear(); releaseRenderer(renderer,canvas);
    }
    return {resize, render, capture, setTripoAsset, dispose};
  } catch (error) {
    turtleMotion?.dispose();
    assets.forEach(asset => asset.dispose()); resources.forEach(resource => resource.dispose());
    scene.clear(); releaseRenderer(renderer,canvas); throw error;
  }
}
