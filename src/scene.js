import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const CREAM = new THREE.Color('#fff2df');
const FAMILY_NAMES = {
  mochi: '薄荷麻薯小怪物',
  yarn: '毛线结结小怪物',
  spike: '软刺小怪物',
  cloud: '云朵小怪物',
};

function seededRandom(text) {
  let seed = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
  }
  return () => {
    seed += 0x6d2b79f5;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function resources() {
  const geometries = new Set();
  const materials = new Set();
  return {
    geometry(value) {
      geometries.add(value);
      return value;
    },
    material(value) {
      materials.add(value);
      return value;
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      geometries.clear();
      materials.clear();
    },
  };
}

function mesh(parent, geometry, material, position, scale = [1, 1, 1]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  object.scale.set(...scale);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function clayMaterial(bag, color, texture, extra = {}) {
  return bag.material(new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.74,
    metalness: 0,
    clearcoat: 0.08,
    clearcoatRoughness: 0.7,
    sheen: 0.16,
    sheenColor: '#fff4e5',
    sheenRoughness: 0.9,
    bumpMap: texture,
    bumpScale: 0.014,
    ...extra,
  }));
}

// Both textures are generated locally; no images, fonts, or network assets.
function makeClayTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const random = seededRandom('tiny handmade clay pores');
  for (let i = 0; i < size * size; i += 1) {
    const value = Math.round(124 + random() * 34);
    data.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function makeShadowTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      const alpha = Math.pow(Math.max(0, 1 - radius * radius), 3) * 135;
      data.set([104, 78, 60, Math.round(alpha)], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function organicSphere(bag, phase) {
  const geometry = new THREE.SphereGeometry(1, 56, 40);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const softness = 1
      + 0.018 * Math.sin(x * 5 + phase) * Math.sin(y * 4 - phase)
      + 0.012 * Math.sin(z * 6 + y * 3 + phase);
    positions.setXYZ(i, x * softness, y * softness, z * softness);
  }
  geometry.computeVertexNormals();
  return bag.geometry(geometry);
}

function softSpikeGeometry(bag) {
  return bag.geometry(new THREE.LatheGeometry([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.72, 0),
    new THREE.Vector2(1, 0.12),
    new THREE.Vector2(0.88, 0.32),
    new THREE.Vector2(0.52, 0.65),
    new THREE.Vector2(0.17, 0.9),
    new THREE.Vector2(0, 1),
  ], 16));
}

function tube(bag, parent, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return mesh(parent, bag.geometry(new THREE.TubeGeometry(curve, 28, radius, 8, false)),
    material, [0, 0, 0]);
}

function addSpikes(creature, parent, bag, count, size, phase = 0) {
  const geometry = softSpikeGeometry(bag);
  const [rx, ry, rz] = creature.bodyRadii;
  const [cx, cy, cz] = creature.bodyCenter;
  const direction = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i + 0.5) / count * 1.76;
    const angle = i * 2.399963229728653 + phase;
    const radius = Math.sqrt(1 - y * y);
    direction.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    // Keep the face and the underside clear of even the softest little spikes.
    if (direction.z > 0.42 && Math.abs(direction.x) < 0.74 && y < 0.65) continue;
    const length = size * (0.82 + 0.25 * Math.sin(i * 7.1 + phase));
    const spike = mesh(parent, geometry, creature.tones[i % 3].material, [
      cx + direction.x * rx * 0.96,
      cy + direction.y * ry * 0.96,
      cz + direction.z * rz * 0.96,
    ], [length * 0.42, length, length * 0.42]);
    spike.quaternion.setFromUnitVectors(UP, direction);
  }
}

function makeFace(creature, y, surface) {
  const { bag, sphere, texture } = creature;
  const face = creature.face;
  face.position.y = y;
  const white = clayMaterial(bag, '#fffbef', texture, {
    roughness: 0.33, clearcoat: 0.3, bumpScale: 0.003,
  });
  const dark = clayMaterial(bag, '#303534', null, {
    roughness: 0.2, clearcoat: 0.55, clearcoatRoughness: 0.2,
  });
  const glint = bag.material(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const blush = clayMaterial(bag, '#edac9f', texture, { roughness: 0.87 });
  creature.dark = dark;
  creature.white = white;
  creature.blush = blush;
  creature.faceSurface = (x, localY) => surface(x, y + localY);
  creature.eyes = [];

  for (const sign of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sign * 0.31, 0.16, surface(sign * 0.31, y + 0.16) + 0.038);
    eye.rotation.z = -sign * 0.06;
    face.add(eye);
    mesh(eye, sphere, white, [0, 0, 0], [0.215, 0.262, 0.112]);
    mesh(eye, sphere, dark, [sign * -0.013, -0.01, 0.101], [0.096, 0.134, 0.069]);
    mesh(eye, sphere, glint, [-0.027, 0.041, 0.164], [0.028, 0.035, 0.013]);
    mesh(eye, sphere, glint, [0.029, -0.046, 0.163], [0.012, 0.015, 0.007]);
    creature.eyes.push({
      object: eye,
      position: eye.position.clone(),
      rotation: eye.rotation.clone(),
      scale: eye.scale.clone(),
    });
    mesh(face, sphere, blush, [
      sign * 0.55, -0.075, surface(sign * 0.55, y - 0.075) + 0.012,
    ], [0.142, 0.075, 0.039]);
    for (let i = 0; i < 2; i += 1) {
      const x = sign * (0.53 + i * 0.065);
      mesh(face, sphere, creature.tones[2].material, [
        x, -0.072, surface(x, y - 0.072) + 0.048,
      ], [0.014, 0.018, 0.009]);
    }
  }
  tube(bag, face, [-0.13, -0.065, 0, 0.065, 0.13].map((x) => {
    const localY = -0.23 + Math.pow(x / 0.13, 2) * 0.07;
    return [x, localY, surface(x, y + localY) + 0.024];
  }), 0.022, dark);
}

function frontSurface(center, radii) {
  return (x, y) => center[2] + radii[2] * Math.sqrt(Math.max(0.08,
    1 - ((x - center[0]) / radii[0]) ** 2 - ((y - center[1]) / radii[1]) ** 2));
}

function buildCreature(words, texture) {
  const family = /毛线|混乱/.test(words) ? 'yarn'
    : /刺|烦躁/.test(words) ? 'spike'
      : /云|疲惫/.test(words) ? 'cloud' : 'mochi';
  const random = seededRandom(words || '薄荷麻薯');
  const bag = resources();
  const root = new THREE.Group();
  const body = new THREE.Group();
  const face = new THREE.Group();
  const decorations = new THREE.Group();
  const accessories = new THREE.Group();
  root.add(body, face, decorations, accessories);
  const baselineColor = new THREE.Color({
    mochi: '#a8d5be', yarn: '#c8b4dc', spike: '#e9b09a', cloud: '#d8e2e6',
  }[family]);
  if (words) baselineColor.offsetHSL((random() - 0.5) * 0.035, 0, (random() - 0.5) * 0.035);
  const tones = [0, 0.22, -0.15].map((tint) => ({
    tint,
    material: clayMaterial(bag, baselineColor, texture),
  }));
  const creature = {
    family, words, bag, root, body, face, decorations, accessories, texture, tones,
    baselineColor, color: baselineColor.clone(), styleMode: 'baseline', accessoryName: 'none',
    sphere: bag.geometry(new THREE.SphereGeometry(1, 32, 24)),
    styleBag: resources(), accessoryBag: resources(),
    bodyCenter: [0, 1.19, 0], bodyRadii: [1, 1.08, 0.85], top: 2.3,
  };
  const sphere = creature.sphere;
  const wobble = random() * TAU;
  const squish = 0.97 + random() * 0.06;
  const softBody = organicSphere(bag, wobble);
  const primary = tones[0].material;
  const light = tones[1].material;
  const secondary = tones[2].material;

  // Small feet make all four silhouettes feel grounded on the ceramic plinth.
  for (const sign of [-1, 1]) {
    const foot = mesh(body, sphere, light, [sign * 0.43, 0.15, 0.26], [0.31, 0.16, 0.36]);
    foot.rotation.y = sign * -0.16;
    const arm = mesh(body, sphere, primary, [sign * 0.94, 0.71, 0.03], [0.205, 0.34, 0.23]);
    arm.rotation.z = sign * 0.62;
  }

  let faceY = 1.29;
  let faceCenter;
  let faceRadii;
  if (family === 'mochi') {
    creature.bodyRadii = [squish, 1.08 / squish, 0.85];
    mesh(body, softBody, primary, creature.bodyCenter, creature.bodyRadii);
    for (const sign of [-1, 1]) {
      const ear = mesh(body, sphere, light, [sign * 0.54, 2.16, -0.01], [0.2, 0.31, 0.22]);
      ear.rotation.z = sign * -(0.19 + random() * 0.15);
    }
    creature.top = 2.43;
  } else if (family === 'yarn') {
    creature.bodyCenter = [0, 1.17, 0];
    creature.bodyRadii = [0.97, 1.03, 0.83];
    mesh(body, softBody, primary, [0, 1.17, -0.08], [0.82, 0.91, 0.7]);
    const loopGeometry = bag.geometry(new THREE.TorusGeometry(0.66, 0.19, 16, 88));
    for (let i = 0; i < 6; i += 1) {
      const angle = i / 6 * TAU + wobble * 0.12;
      const loop = mesh(body, loopGeometry, tones[i % 3].material,
        [Math.cos(angle) * 0.24, 1.27 + Math.sin(angle) * 0.31, -0.04],
        [0.91 + random() * 0.14, 1.04 + random() * 0.13, 1]);
      loop.rotation.set(0.22 + random() * 0.58, Math.sin(angle) * 0.72, angle);
    }
    const knot = mesh(body,
      bag.geometry(new THREE.TorusKnotGeometry(0.5, 0.15, 144, 12, 2, 3)),
      light, [-0.08, 1.29, -0.13], [0.98, 1.12, 0.85]);
    knot.rotation.set(0.38, 0.6, wobble * 0.15);
    faceCenter = [0, 1.18, 0.61];
    faceRadii = [0.73, 0.67, 0.32];
    mesh(body, softBody, primary, faceCenter, faceRadii);
    faceY = 1.21;
    creature.top = 2.39;
  } else if (family === 'spike') {
    creature.bodyCenter = [0, 1.13, 0];
    creature.bodyRadii = [1.01 * squish, 0.99, 0.85];
    mesh(body, softBody, primary, creature.bodyCenter, creature.bodyRadii);
    addSpikes(creature, body, bag, 38, 0.36, wobble);
    faceY = 1.22;
    creature.top = 2.42;
  } else {
    creature.bodyCenter = [0, 1.16, 0];
    creature.bodyRadii = [1.18, 1.04, 0.83];
    const lobes = [
      [-0.65, 0.85, -0.01, 0.65, 0.6, 0.65],
      [0.68, 0.89, -0.04, 0.65, 0.6, 0.62],
      [-0.47, 1.53, -0.12, 0.66, 0.66, 0.61],
      [0.29, 1.74, -0.1, 0.68, 0.64, 0.59],
      [0.81, 1.33, -0.03, 0.51, 0.55, 0.53],
      [-0.04, 1.17, -0.35, 0.93, 0.82, 0.61],
    ];
    lobes.forEach((lobe, i) => {
      mesh(body, sphere, i % 3 === 0 ? light : primary, lobe.slice(0, 3), lobe.slice(3));
    });
    faceCenter = [0, 0.99, 0.27];
    faceRadii = [0.9, 0.73, 0.7];
    mesh(body, softBody, light, faceCenter, faceRadii);
    faceY = 1.12;
    creature.top = 2.35;
  }
  makeFace(creature, faceY,
    frontSurface(faceCenter || creature.bodyCenter, faceRadii || creature.bodyRadii));

  // A few inset-looking dots read as handmade marks, even before styling.
  for (let i = 0; i < 3; i += 1) {
    const x = -0.13 + i * 0.1;
    const y = 0.5 + Math.sin(i * 1.7) * 0.02;
    mesh(face, sphere, secondary, [x, y, creature.faceSurface(x, y) + 0.005],
      [0.025, 0.019, 0.014]);
  }
  applyColors(creature);
  return creature;
}

function applyColors(creature) {
  for (const { material, tint } of creature.tones) {
    material.color.copy(creature.color);
    if (tint >= 0) material.color.lerp(CREAM, tint);
    else material.color.multiplyScalar(1 + tint);
    material.roughness = 0.74;
    material.clearcoat = 0.08;
    material.bumpScale = 0.014;
    if (creature.styleMode === 'pretty') {
      material.color.lerp(CREAM, 0.2);
      material.roughness = 0.5;
      material.clearcoat = 0.22;
      material.bumpScale = 0.009;
    } else if (creature.styleMode === 'ugly') {
      material.color.lerp(new THREE.Color('#a29670'), 0.38);
      material.roughness = 0.97;
      material.clearcoat = 0;
      material.bumpScale = 0.035;
    } else if (creature.styleMode === 'silly') {
      material.color.offsetHSL(tint > 0 ? 0.12 : -0.035, 0.13, 0.025);
      material.roughness = 0.64;
      material.clearcoat = 0.14;
    }
  }
}

function clearLayer(creature, key, bagKey) {
  creature[key].clear();
  creature[bagKey].dispose();
  creature[bagKey] = resources();
}

function restoreEyes(creature) {
  creature.eyes.forEach(({ object, position, rotation, scale }) => {
    object.position.copy(position);
    object.rotation.copy(rotation);
    object.scale.copy(scale);
  });
}

function starGeometry(bag) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const angle = Math.PI / 2 + i / 10 * TAU;
    const radius = i % 2 === 0 ? 1 : 0.49;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.17, bevelEnabled: true, bevelSegments: 3,
    steps: 1, bevelSize: 0.09, bevelThickness: 0.08,
  });
  geometry.center();
  return bag.geometry(geometry);
}

function setStyle(creature, mode) {
  clearLayer(creature, 'decorations', 'styleBag');
  restoreEyes(creature);
  creature.styleMode = mode;
  applyColors(creature);
  const { decorations, styleBag: bag, sphere, texture } = creature;
  if (mode === 'pretty') {
    const gold = clayMaterial(bag, '#efc877', texture, { roughness: 0.55 });
    const star = starGeometry(bag);
    for (const sign of [-1, 1]) {
      const x = sign * 0.55;
      const localY = -0.065;
      const decoration = mesh(decorations, star, gold,
        [x, creature.face.position.y + localY, creature.faceSurface(x, localY) + 0.067],
        [0.091, 0.091, 0.091]);
      decoration.rotation.z = sign * 0.18;
    }
    const pearl = clayMaterial(bag, '#fff2dd', texture, { roughness: 0.4 });
    for (let i = 0; i < 3; i += 1) {
      const x = -0.17 + i * 0.17;
      const y = 0.43 + (i === 1 ? 0.04 : 0);
      mesh(decorations, sphere, pearl, [
        x, creature.face.position.y + y, creature.faceSurface(x, y) + 0.045,
      ], [0.047, 0.047, 0.035]);
    }
  } else if (mode === 'ugly') {
    addSpikes(creature, decorations, bag, 24, 0.38, 0.6);
    creature.eyes[0].object.scale.set(1.1, 0.85, 1);
    creature.eyes[1].object.rotation.z += 0.22;
    const patch = clayMaterial(bag, '#be926f', texture, { roughness: 1, bumpScale: 0.035 });
    for (let i = 0; i < 4; i += 1) {
      const x = -0.44 + i * 0.25;
      const localY = -0.4 - Math.sin(i) * 0.05;
      mesh(decorations, sphere, patch, [
        x, creature.face.position.y + localY, creature.faceSurface(x, localY) + 0.008,
      ], [0.065 + i * 0.012, 0.06, 0.037]);
    }
  } else if (mode === 'silly') {
    creature.eyes[0].object.scale.set(1.22, 1.15, 1);
    creature.eyes[1].object.scale.set(0.83, 0.9, 1);
    creature.eyes[1].object.position.y += 0.085;
    const pink = clayMaterial(bag, '#e990ad', texture);
    const tongue = mesh(decorations, sphere, pink, [
      0.065, creature.face.position.y - 0.275, creature.faceSurface(0.065, -0.24) + 0.065,
    ], [0.087, 0.125, 0.051]);
    tongue.rotation.z = -0.25;
    const yellow = clayMaterial(bag, '#edcd77', texture);
    for (const sign of [-1, 1]) {
      const points = [
        [sign * 0.45, creature.top - 0.2, -0.08],
        [sign * 0.65, creature.top + 0.12, -0.08],
        [sign * 0.82, creature.top + 0.14, -0.03],
      ];
      tube(bag, decorations, points, 0.032, creature.tones[2].material);
      mesh(decorations, sphere, sign < 0 ? pink : yellow, points[2], [0.13, 0.13, 0.13]);
    }
  }
}

function setAccessory(creature, name) {
  clearLayer(creature, 'accessories', 'accessoryBag');
  creature.accessoryName = name;
  const { accessories, accessoryBag: bag, sphere, texture, top } = creature;
  if (name === 'flower') {
    const green = clayMaterial(bag, '#789e7b', texture);
    const petal = clayMaterial(bag, '#f6c4b5', texture, { roughness: 0.65 });
    const gold = clayMaterial(bag, '#e9ba65', texture);
    tube(bag, accessories, [
      [0.46, top - 0.16, 0],
      [0.6, top + 0.08, 0.02],
      [0.53, top + 0.3, 0.07],
    ], 0.028, green);
    const leaf = mesh(accessories, sphere, green,
      [0.68, top + 0.025, 0.03], [0.17, 0.055, 0.065]);
    leaf.rotation.z = 0.45;
    const flower = new THREE.Group();
    flower.position.set(0.53, top + 0.32, 0.08);
    flower.rotation.set(-0.13, 0.1, -0.2);
    accessories.add(flower);
    for (let i = 0; i < 6; i += 1) {
      const angle = i / 6 * TAU;
      const petalMesh = mesh(flower, sphere, petal,
        [Math.sin(angle) * 0.16, Math.cos(angle) * 0.16, 0],
        [0.11, 0.19, 0.07]);
      petalMesh.rotation.z = -angle;
    }
    mesh(flower, sphere, gold, [0, 0, 0.078], [0.118, 0.118, 0.068]);
    for (let i = 0; i < 7; i += 1) {
      const angle = i / 7 * TAU;
      mesh(flower, sphere, creature.white,
        [Math.cos(angle) * 0.064, Math.sin(angle) * 0.064, 0.137],
        [0.011, 0.011, 0.008]);
    }
  } else if (name === 'hat') {
    const hat = new THREE.Group();
    hat.position.set(-0.06, top - 0.12, 0);
    hat.rotation.set(-0.06, 0.07, -0.16);
    accessories.add(hat);
    const felt = clayMaterial(bag, '#c58c72', texture, { roughness: 0.92, bumpScale: 0.026 });
    const band = clayMaterial(bag, '#f9deac', texture);
    mesh(hat, sphere, felt, [0, 0, 0], [0.66, 0.08, 0.5]);
    const crown = bag.geometry(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.39, 0),
      new THREE.Vector2(0.4, 0.07),
      new THREE.Vector2(0.35, 0.39),
      new THREE.Vector2(0.3, 0.44),
      new THREE.Vector2(0, 0.44),
    ], 48));
    mesh(hat, crown, felt, [0, 0.015, 0], [1, 1, 0.9]);
    const ribbon = mesh(hat, bag.geometry(new THREE.TorusGeometry(0.384, 0.033, 12, 64)),
      band, [0, 0.115, 0]);
    ribbon.rotation.x = Math.PI / 2;
    ribbon.scale.y = 0.9;
    const badge = mesh(hat, sphere, band, [0.24, 0.19, 0.288], [0.071, 0.095, 0.03]);
    badge.rotation.z = -0.25;
  }
}

function releaseCreature(creature) {
  if (!creature) return;
  creature.root.removeFromParent();
  creature.styleBag.dispose();
  creature.accessoryBag.dispose();
  creature.bag.dispose();
  creature.root.clear();
}

/**
 * Create a fully local clay-creature canvas in a sized DOM container.
 * Returns generate, setColor, style, deform, accessory, reset, snapshot, dispose.
 * Mutators are chainable; unknown modes/colors are ignored. Requires WebGL.
 */
export function createCreatureScene(container) {
  const document = container?.ownerDocument;
  const view = document?.defaultView;
  if (!view || typeof container.appendChild !== 'function') {
    throw new TypeError('createCreatureScene 需要一个浏览器中的 DOM 容器。');
  }

  // Browser APIs are intentionally confined to this factory, never module import.
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, preserveDrawingBuffer: true,
    powerPreference: 'low-power',
  });
  renderer.setClearColor('#fff9ef', 0);
  renderer.setPixelRatio(Math.min(view.devicePixelRatio || 1, 2));
  renderer.setSize(1, 1, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight ArrowUp ArrowDown Home');
  canvas.textContent = '可旋转的本地 3D 黏土小怪物。';
  Object.assign(canvas.style, {
    display: 'block', width: '0px', height: '0px',
    touchAction: 'none', cursor: 'grab', borderRadius: 'inherit',
  });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const turntable = new THREE.Group();
  turntable.position.y = 0.095;
  scene.add(turntable);
  const stageBag = resources();
  const clayTexture = makeClayTexture();
  const shadowTexture = makeShadowTexture();
  const hemi = new THREE.HemisphereLight('#fff5df', '#bcafa0', 2.25);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff0d9', 3.25);
  key.position.set(-3.5, 6, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -3.2, right: 3.2, top: 4, bottom: -3, near: 0.5, far: 16 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 4;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#f4d8ce', 1.2);
  fill.position.set(4, 3, 4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight('#fff5e0', 2.1);
  rim.position.set(1.5, 4, -4);
  scene.add(rim);

  const baseGeometry = stageBag.geometry(new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.065),
    new THREE.Vector2(1.47, -0.065),
    new THREE.Vector2(1.59, -0.035),
    new THREE.Vector2(1.62, 0),
    new THREE.Vector2(1.59, 0.04),
    new THREE.Vector2(1.51, 0.075),
    new THREE.Vector2(0, 0.075),
  ], 96));
  mesh(scene, baseGeometry, clayMaterial(stageBag, '#ece0cd', clayTexture, {
    roughness: 0.88, bumpScale: 0.008,
  }), [0, 0, 0], [1.16, 1, 0.84]);

  const shadowGeometry = stageBag.geometry(new THREE.PlaneGeometry(1, 1));
  for (const [width, depth, y, opacity] of [[5.2, 3.7, -0.075, 0.45], [2.8, 1.85, 0.081, 0.48]]) {
    const material = stageBag.material(new THREE.MeshBasicMaterial({
      map: shadowTexture, transparent: true, depthWrite: false,
      opacity, toneMapped: false,
    }));
    const shadow = mesh(scene, shadowGeometry, material, [0, y, 0], [width, depth, 1]);
    shadow.rotation.x = -Math.PI / 2;
    shadow.castShadow = shadow.receiveShadow = false;
  }

  let creature = null;
  let disposed = false;
  let contextLost = false;
  let frameId = null;
  let previousTime = 0;
  let idleTime = 0;
  let width = 0;
  let height = 0;
  let drag = null;
  let deformation = null;
  let targetYaw = -0.2;
  let targetPitch = 0;
  const motionPreference = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionPreference?.matches ?? false;
  const listeners = [];
  const listen = (target, name, callback, options) => {
    target.addEventListener(name, callback, options);
    listeners.push(() => target.removeEventListener(name, callback, options));
  };

  function stopFrame() {
    if (frameId !== null) view.cancelAnimationFrame(frameId);
    frameId = null;
    previousTime = 0;
  }

  function scheduleFrame() {
    if (!disposed && !contextLost && width > 0 && height > 0 && !document.hidden && frameId === null) {
      frameId = view.requestAnimationFrame(animate);
    }
  }

  function fitCamera() {
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    // Reserve room for both accessories; selecting one never makes the body jump.
    const distance = Math.max(1.88, 2.08 / camera.aspect) / Math.tan(halfFov);
    const target = new THREE.Vector3(0, 1.43, 0);
    camera.position.set(0, target.y + distance * 0.24, distance * 0.971);
    camera.far = Math.max(80, distance + 20);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }

  function resize(rect) {
    if (disposed) return;
    const computed = rect ? null : view.getComputedStyle(container);
    const nextWidth = rect ? rect.width
      : container.clientWidth - (parseFloat(computed.paddingLeft) || 0) - (parseFloat(computed.paddingRight) || 0);
    const nextHeight = rect ? rect.height
      : container.clientHeight - (parseFloat(computed.paddingTop) || 0) - (parseFloat(computed.paddingBottom) || 0);
    width = Math.max(0, Number.isFinite(nextWidth) ? nextWidth : 0);
    height = Math.max(0, Number.isFinite(nextHeight) ? nextHeight : 0);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.visibility = width > 0 && height > 0 ? 'visible' : 'hidden';
    if (width <= 0 || height <= 0) {
      stopFrame();
      renderer.setSize(1, 1, false);
      return;
    }
    renderer.setPixelRatio(Math.min(view.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), false);
    camera.aspect = width / height;
    fitCamera();
    scheduleFrame();
  }

  function animate(time) {
    frameId = null;
    if (disposed || contextLost || document.hidden || width <= 0 || height <= 0) return;
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60;
    previousTime = time;
    if (!reducedMotion && !drag) idleTime += delta;
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-16 * delta);
    turntable.rotation.y += (targetYaw - turntable.rotation.y) * smoothing;
    turntable.rotation.x += (targetPitch - turntable.rotation.x) * smoothing;
    let scaleY = 1;
    if (deformation) {
      const progress = Math.min(1, Math.max(0, (time - deformation.start) / deformation.duration));
      const pulse = Math.sin(progress * Math.PI) ** 2;
      const amount = reducedMotion ? 0.035 : deformation.mode === 'squash' ? 0.3 : 0.37;
      scaleY += (deformation.mode === 'squash' ? -1 : 1) * amount * pulse;
      if (progress >= 1) deformation = null;
    }
    if (creature) {
      const idle = reducedMotion || drag ? 0 : 1;
      creature.root.rotation.z = Math.sin(idleTime * 0.75) * 0.009 * idle;
      creature.root.rotation.y = Math.sin(idleTime * 0.49) * 0.022 * idle;
      const sideScale = 1 / Math.sqrt(scaleY);
      creature.root.scale.set(sideScale, scaleY, sideScale);
    }
    renderer.render(scene, camera);
    const rotating = Math.abs(targetYaw - turntable.rotation.y) > 0.0001
      || Math.abs(targetPitch - turntable.rotation.x) > 0.0001;
    if (!reducedMotion || deformation || rotating) scheduleFrame();
  }

  function endDrag(event) {
    if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.id)) return;
    const pointerId = drag.id;
    drag = null;
    canvas.style.cursor = 'grab';
    if (canvas.hasPointerCapture?.(pointerId)) canvas.releasePointerCapture(pointerId);
    scheduleFrame();
  }

  listen(canvas, 'pointerdown', (event) => {
    if (disposed || drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.style.cursor = 'grabbing';
    canvas.focus({ preventScroll: true });
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners still complete a drag if capture is unavailable.
    }
    scheduleFrame();
  });
  listen(view, 'pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    targetYaw += (event.clientX - drag.x) * 0.009;
    targetPitch = THREE.MathUtils.clamp(targetPitch + (event.clientY - drag.y) * 0.005, -0.22, 0.28);
    drag.x = event.clientX;
    drag.y = event.clientY;
    scheduleFrame();
  });
  listen(view, 'pointerup', endDrag);
  listen(view, 'pointercancel', endDrag);
  listen(view, 'blur', endDrag);
  listen(canvas, 'lostpointercapture', endDrag);
  listen(canvas, 'keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const step = 0.16;
    if (event.key === 'ArrowLeft') targetYaw -= step;
    else if (event.key === 'ArrowRight') targetYaw += step;
    else if (event.key === 'ArrowUp') targetPitch = Math.max(-0.22, targetPitch - 0.08);
    else if (event.key === 'ArrowDown') targetPitch = Math.min(0.28, targetPitch + 0.08);
    else if (event.key === 'Home') {
      targetYaw = -0.2;
      targetPitch = 0;
    } else return;
    event.preventDefault();
    scheduleFrame();
  });
  listen(canvas, 'webglcontextlost', (event) => {
    event.preventDefault();
    contextLost = true;
    stopFrame();
  });
  listen(canvas, 'webglcontextrestored', () => {
    contextLost = false;
    resize();
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) {
      endDrag();
      stopFrame();
    } else resize();
  });
  listen(view, 'resize', () => resize());
  const onMotionPreference = (event) => {
    reducedMotion = event.matches;
    deformation = null;
    idleTime = 0;
    scheduleFrame();
  };
  if (motionPreference?.addEventListener) {
    listen(motionPreference, 'change', onMotionPreference);
  } else if (motionPreference?.addListener) {
    motionPreference.addListener(onMotionPreference);
    listeners.push(() => motionPreference.removeListener(onMotionPreference));
  }
  const observer = view.ResizeObserver ? new view.ResizeObserver((entries) => {
    const entry = entries.find((value) => value.target === container);
    if (entry) resize(entry.contentRect);
  }) : null;

  function resetPose() {
    endDrag();
    deformation = null;
    idleTime = 0;
    targetYaw = -0.2;
    targetPitch = 0;
    turntable.rotation.set(0, targetYaw, 0);
    creature.root.rotation.set(0, 0, 0);
    creature.root.scale.set(1, 1, 1);
  }

  const api = {
    /** Deterministically replace the sculpture using Chinese keyword families. */
    generate(words = '') {
      if (disposed) return api;
      const normalized = String(words ?? '').normalize('NFKC').trim();
      const next = buildCreature(normalized, clayTexture);
      releaseCreature(creature);
      creature = next;
      turntable.add(creature.root);
      resetPose();
      canvas.setAttribute('aria-label',
        `${FAMILY_NAMES[creature.family]}，本地生成的 3D 黏土作品。拖动旋转，方向键调整视角，Home 复位视角。`);
      scheduleFrame();
      return api;
    },
    /** Set the body color with #RGB, #RRGGBB, or a numeric RGB hex value. */
    setColor(hex) {
      if (disposed) return api;
      const validString = typeof hex === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex);
      const validNumber = Number.isInteger(hex) && hex >= 0 && hex <= 0xffffff;
      if (!validString && !validNumber) return api;
      creature.color.set(hex);
      applyColors(creature);
      scheduleFrame();
      return api;
    },
    /** Apply 'pretty', 'ugly', or 'silly' materials and removable decorations. */
    style(mode) {
      if (disposed || !['pretty', 'ugly', 'silly'].includes(mode)) return api;
      setStyle(creature, mode);
      scheduleFrame();
      return api;
    },
    /** Temporarily 'squash' or 'stretch', then restore the undeformed shape. */
    deform(mode) {
      if (disposed || !['squash', 'stretch'].includes(mode)) return api;
      deformation = { mode, start: view.performance.now(), duration: reducedMotion ? 160 : 820 };
      scheduleFrame();
      return api;
    },
    /** Set a crafted 'flower' or 'hat'; 'none' removes the accessory. */
    accessory(name) {
      if (disposed || !['flower', 'hat', 'none'].includes(name)) return api;
      setAccessory(creature, name);
      scheduleFrame();
      return api;
    },
    /** Restore this generation's original color, shape, face, and view. */
    reset() {
      if (disposed) return api;
      creature.color.copy(creature.baselineColor);
      setStyle(creature, 'baseline');
      setAccessory(creature, 'none');
      resetPose();
      scheduleFrame();
      return api;
    },
    /** Return a transparent PNG data URL; throw if disposed or context is lost. */
    snapshot() {
      if (disposed) throw new Error('此 3D 场景已释放，无法导出图片。');
      if (contextLost) throw new Error('3D 画布正在恢复，请稍后再导出图片。');
      // A hidden workshop still exports a useful image instead of a 1×1 pixel.
      if (width <= 0 || height <= 0) {
        const aspect = camera.aspect;
        const pixelRatio = renderer.getPixelRatio();
        try {
          renderer.setPixelRatio(1);
          renderer.setSize(800, 800, false);
          camera.aspect = 1;
          fitCamera();
          renderer.render(scene, camera);
          return canvas.toDataURL('image/png');
        } finally {
          renderer.setPixelRatio(pixelRatio);
          renderer.setSize(1, 1, false);
          camera.aspect = aspect;
          fitCamera();
        }
      }
      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    },
    /** Idempotently release all GPU resources, events, observers, and frames. */
    dispose() {
      if (disposed) return;
      disposed = true;
      stopFrame();
      observer?.disconnect();
      listeners.splice(0).forEach((remove) => remove());
      endDrag();
      deformation = null;
      releaseCreature(creature);
      creature = null;
      stageBag.dispose();
      clayTexture.dispose();
      shadowTexture.dispose();
      key.shadow.dispose();
      scene.clear();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };

  container.appendChild(canvas);
  api.generate('');
  observer?.observe(container);
  resize();
  return api;
}
