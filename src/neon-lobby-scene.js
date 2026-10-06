import * as THREE from 'three';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const COLOR = {
  lime: '#d7ff63',
  cyan: '#67e9ff',
  violet: '#a98bff',
  charcoal: '#242432',
};

function roundedRectangle(width, height, radius) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  shape.closePath();
  return shape;
}

function starShape(radius, inner = radius * 0.46) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i += 1) {
    const angle = Math.PI / 2 + i / 10 * TAU;
    const r = i % 2 ? inner : radius;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function roundedOutline(points, radius = 0.08) {
  const path = new THREE.CurvePath();
  const corners = points.map((point, i) => {
    const a = points[(i - 1 + points.length) % points.length].clone().sub(point);
    const b = points[(i + 1) % points.length].clone().sub(point);
    const distance = Math.min(radius, a.length() * 0.3, b.length() * 0.3);
    return {
      point,
      enter: a.normalize().multiplyScalar(distance).add(point),
      exit: b.normalize().multiplyScalar(distance).add(point),
    };
  });
  corners.forEach((corner, i) => {
    path.add(new THREE.QuadraticBezierCurve3(corner.enter, corner.point, corner.exit));
    path.add(new THREE.LineCurve3(corner.exit, corners[(i + 1) % corners.length].enter));
  });
  return path;
}

/**
 * Decorative, self-contained hero art. The host owns the canvas and its CSS.
 * Every texture and reflection is generated locally; no asset requests occur.
 */
export function mountNeonLobby(canvas) {
  if (!canvas?.getContext) return () => {};
  const document = canvas.ownerDocument;
  const view = document?.defaultView;
  const resources = new Set();
  const listeners = [];
  const keep = (resource) => { resources.add(resource); return resource; };
  let renderer;
  let scene;
  let keyLight;
  let resizeObserver;
  let intersectionObserver;
  let frame = 0;
  let disposed = false;
  let suspended = false;
  let inViewport = true;
  let hasSize = false;
  let reducedMotion = false;
  let lastTimestamp = null;
  let lastPaint = -Infinity;
  let elapsed = 0;
  let width = 0;
  let height = 0;
  canvas.setAttribute('aria-hidden', 'true');

  function listen(target, event, handler, options) {
    target?.addEventListener?.(event, handler, options);
    listeners.push(() => target?.removeEventListener?.(event, handler, options));
  }

  function stop() {
    if (frame) view?.cancelAnimationFrame?.(frame);
    frame = 0;
    lastTimestamp = null;
    lastPaint = -Infinity;
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    stop();
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    for (const remove of listeners.splice(0)) remove();
    if (scene) {
      scene.environment = null;
      scene.clear();
    }
    keyLight?.shadow.dispose();
    for (const resource of resources) resource.dispose();
    resources.clear();
    if (renderer) {
      // Clearing also makes cleanup safe if the host keeps the canvas mounted.
      try {
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
      } catch { /* The context may already have been lost. */ }
      renderer.renderLists.dispose();
      renderer.dispose();
    }
  }

  function unavailable() {
    canvas.setAttribute('data-unavailable', 'true');
    cleanup();
  }

  try {
    if (!view || !document) throw new Error('A browser canvas is required.');
    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true, powerPreference: 'low-power',
      premultipliedAlpha: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.debug.onShaderError = () => {
      throw new Error('Neon lobby shader compilation failed.');
    };
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    // The enclosure and platform are static. Moving ornaments use soft glows.
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 60);
    const cameraDirection = new THREE.Vector3(4.4, 3.1, 8.5).normalize();
    const cameraTarget = new THREE.Vector3(0, 1.48, 0.1);
    const cameraHome = new THREE.Vector3();
    const pointer = new THREE.Vector2();
    const pointerTarget = new THREE.Vector2();
    const artwork = new THREE.Group();
    scene.add(artwork);

    function physical(color, extra = {}) {
      return keep(new THREE.MeshPhysicalMaterial({
        color, roughness: 0.3, metalness: 0.38,
        clearcoat: 0.8, clearcoatRoughness: 0.2, ...extra,
      }));
    }

    function basic(color, extra = {}) {
      return keep(new THREE.MeshBasicMaterial({ color, ...extra }));
    }

    function mesh(parent, geometry, material, position = [0, 0, 0], shadow = false) {
      const object = new THREE.Mesh(geometry, material);
      object.position.set(...position);
      object.castShadow = shadow;
      object.receiveShadow = shadow;
      parent.add(object);
      return object;
    }

    const cube = keep(new THREE.BoxGeometry(1, 1, 1));
    const plane = keep(new THREE.PlaneGeometry(1, 1));
    const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 48));
    const sphere = keep(new THREE.SphereGeometry(1, 40, 28));
    function box(parent, size, material, position, shadow = false) {
      const object = mesh(parent, cube, material, position, shadow);
      object.scale.set(...size);
      return object;
    }
    function disc(parent, radius, depth, material, position, shadow = false) {
      const object = mesh(parent, cylinder, material, position, shadow);
      object.scale.set(radius, depth, radius);
      return object;
    }
    function extrude(shape, depth, bevel = 0.025) {
      const geometry = keep(new THREE.ExtrudeGeometry(shape, {
        depth, bevelEnabled: bevel > 0, bevelSegments: 3,
        steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 12,
      }));
      geometry.translate(0, 0, -depth / 2);
      return geometry;
    }
    function panel(parent, width, height, depth, radius, material, position, shadow = false) {
      return mesh(parent, extrude(roundedRectangle(width, height, radius), depth),
        material, position, shadow);
    }
    function torus(parent, radius, thickness, material, position = [0, 0, 0]) {
      return mesh(parent, keep(new THREE.TorusGeometry(radius, thickness, 8, 80)),
        material, position);
    }
    function canvasTexture(w, h, draw) {
      const image = document.createElement('canvas');
      image.width = w;
      image.height = h;
      const context = image.getContext('2d');
      if (!context) throw new Error('Canvas texture rendering is unavailable.');
      draw(context, w, h);
      const texture = keep(new THREE.CanvasTexture(image));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      return texture;
    }

    const glowTexture = canvasTexture(128, 128, (ctx, w, h) => {
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
      gradient.addColorStop(0.25, 'rgba(255,255,255,0.44)');
      gradient.addColorStop(0.6, 'rgba(255,255,255,0.1)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    });
    function glow(parent, color, opacity, size, position) {
      const object = new THREE.Sprite(keep(new THREE.SpriteMaterial({
        map: glowTexture, color, opacity, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
      })));
      // Three's default sprite geometry is global; dispose only our own copy.
      object.geometry = keep(object.geometry.clone());
      object.position.set(...position);
      object.scale.set(size, size, 1);
      parent.add(object);
      return object;
    }

    // A small studio light rig becomes the cabinet's real, roughness-aware IBL.
    // The generated environment is invisible; the hero background stays alpha.
    const studio = new THREE.Scene();
    mesh(studio, keep(new THREE.BoxGeometry(18, 18, 18)),
      basic('#161523', { side: THREE.BackSide }));
    const lightCards = [
      { position: [-4, 5, 4], scale: [3, 6], color: '#eee9ff', intensity: 3.5 },
      { position: [5, 2, 1], scale: [2, 6], color: '#ad95ff', intensity: 2.8 },
      { position: [-3, 1, -4], scale: [2, 5], color: '#74e8ff', intensity: 2.2 },
      { position: [0, 6, -1], scale: [5, 2], color: '#ffffff', intensity: 2 },
    ];
    for (const card of lightCards) {
      const object = mesh(studio, plane, basic(
        new THREE.Color(card.color).multiplyScalar(card.intensity),
        { side: THREE.DoubleSide, toneMapped: false },
      ), card.position);
      object.scale.set(card.scale[0], card.scale[1], 1);
      object.lookAt(0, 0, 0);
    }
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      const environment = keep(pmrem.fromScene(studio, 0.035, 0.1, 40, { size: 128 }));
      scene.environment = environment.texture;
      scene.environmentIntensity = 0.85;
    } finally {
      pmrem.dispose();
    }
    studio.clear();
    // PMREM temporarily renders an opaque studio; restore the hero's alpha clear.
    renderer.setClearColor(0x000000, 0);

    scene.add(new THREE.HemisphereLight('#cbd0ff', '#24202f', 1.1));
    keyLight = new THREE.DirectionalLight('#eee8ff', 3.1);
    keyLight.position.set(-3, 7, 5);
    keyLight.target.position.set(0, 1.5, 0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(keyLight.shadow.camera, {
      left: -4, right: 4, top: 5, bottom: -3, near: 1, far: 18,
    });
    keyLight.shadow.normalBias = 0.025;
    keyLight.shadow.bias = -0.0002;
    keyLight.shadow.radius = 4;
    scene.add(keyLight, keyLight.target);
    const rimLight = new THREE.DirectionalLight('#a78aff', 2.4);
    rimLight.position.set(4, 3, -4);
    scene.add(rimLight);
    const screenLight = new THREE.PointLight('#bdff87', 1.7, 3, 2);
    screenLight.position.set(-0.5, 2.3, 1.15);
    scene.add(screenLight);
    const blueLight = new THREE.PointLight('#66dcff', 2.5, 4, 2);
    blueLight.position.set(1, 1.5, 1.6);
    scene.add(blueLight);

    const charcoal = physical(COLOR.charcoal, { metalness: 0.58, roughness: 0.28 });
    const lavender = physical('#695b86', { metalness: 0.52, roughness: 0.26 });
    const black = physical('#101119', { metalness: 0.3, roughness: 0.42 });
    const steel = physical('#a5adbc', { metalness: 0.92, roughness: 0.2 });
    const violetMetal = physical('#9980d4', { metalness: 0.75, roughness: 0.24 });
    const limePlastic = physical(COLOR.lime, { metalness: 0.1, roughness: 0.24 });
    const cyanPlastic = physical(COLOR.cyan, { metalness: 0.15, roughness: 0.23 });
    const violetPlastic = physical(COLOR.violet, { metalness: 0.15, roughness: 0.23 });
    const neonLime = basic(COLOR.lime, { toneMapped: false });
    const neonCyan = basic(COLOR.cyan, { toneMapped: false });
    const neonViolet = basic(COLOR.violet, { toneMapped: false });

    const platform = new THREE.Group();
    artwork.add(platform);
    disc(platform, 1.97, 0.11, black, [0, 0.025, 0], true);
    disc(platform, 1.91, 0.17, charcoal, [0, 0.125, 0], true);
    const platformLip = torus(platform, 1.925, 0.012, neonViolet, [0, 0.08, 0]);
    platformLip.rotation.x = Math.PI / 2;
    const platformInlay = torus(platform, 1.76, 0.007,
      physical('#62647c', { metalness: 0.75 }), [0, 0.212, 0]);
    platformInlay.rotation.x = Math.PI / 2;

    function floorGlow(color, opacity, size, x, z) {
      const object = mesh(scene, plane, basic(color, {
        map: glowTexture, transparent: true, opacity, depthWrite: false,
        toneMapped: false,
      }), [x, -0.045, z]);
      object.rotation.x = -Math.PI / 2;
      object.scale.set(size, size, 1);
      return object;
    }
    floorGlow('#000000', 0.7, 6.1, 0.1, 0.2);
    floorGlow('#7157d9', 0.26, 5.7, 0.25, 0.1).position.y = -0.04;
    floorGlow('#44bace', 0.13, 3.2, 1.25, 0.2).position.y = -0.035;

    const cabinet = new THREE.Group();
    cabinet.position.set(-0.53, 0.14, 0);
    cabinet.rotation.set(0, -0.045, 0.022);
    artwork.add(cabinet);
    // Side silhouette in [depth, height]: the recessed screen and overhanging
    // control deck are part of a single beveled enclosure, not stacked boxes.
    const profile = [
      [0.58, 0.12], [-0.64, 0.12], [-0.66, 3.08], [-0.51, 3.42],
      [0.56, 3.42], [0.69, 3.1], [0.24, 2.98], [0.53, 1.96],
      [0.94, 1.78], [0.95, 1.52], [0.57, 1.39],
    ];
    function enclosure(width, depth) {
      const shape = new THREE.Shape();
      profile.forEach(([z, y], i) => {
        if (i === 0) shape.moveTo(-z, y);
        else shape.lineTo(-z, y);
      });
      shape.closePath();
      const geometry = keep(new THREE.ExtrudeGeometry(shape, {
        depth: width, bevelEnabled: true, bevelSegments: 3,
        bevelSize: depth, bevelThickness: depth, steps: 1, curveSegments: 8,
      }));
      geometry.rotateY(Math.PI / 2);
      geometry.translate(-width / 2, 0, 0);
      return geometry;
    }
    mesh(cabinet, enclosure(1.49, 0.045), charcoal, [0, 0, 0], true);
    const sideGeometry = enclosure(0.048, 0.025);
    for (const side of [-1, 1]) {
      mesh(cabinet, sideGeometry, lavender, [side * 0.79, 0, 0], true);
      const outline = roundedOutline(profile.map(([z, y]) =>
        new THREE.Vector3(side * 0.833, y, z)), 0.09);
      const core = side === 1 ? neonViolet : neonLime;
      mesh(cabinet, keep(new THREE.TubeGeometry(outline, 170, 0.011, 6, true)), core);
      mesh(cabinet, keep(new THREE.TubeGeometry(outline, 170, 0.028, 6, true)),
        basic(side === 1 ? COLOR.violet : COLOR.lime, {
          transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
          depthWrite: false, toneMapped: false,
        }));
    }
    for (const x of [-0.54, 0.54]) {
      box(cabinet, [0.26, 0.12, 0.65], black, [x, 0.06, -0.01], true);
    }

    const crtTexture = canvasTexture(1024, 768, (ctx, w, h) => {
      const field = ctx.createLinearGradient(0, 0, w, h);
      field.addColorStop(0, '#171a2e');
      field.addColorStop(0.55, '#101622');
      field.addColorStop(1, '#273345');
      ctx.fillStyle = field;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(142,170,216,.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 48) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.font = '700 24px monospace';
      ctx.fillStyle = '#8d9fb9';
      ctx.fillText('P/P — ARCADE SYSTEM', 72, 77);
      ctx.fillStyle = COLOR.lime;
      ctx.beginPath(); ctx.arc(913, 67, 9, 0, TAU); ctx.fill();
      ctx.font = '900 123px Arial, sans-serif';
      ctx.fillStyle = '#f2f1ff';
      ctx.fillText('PAUSE /', 67, 226);
      ctx.font = '900 162px Arial, sans-serif';
      ctx.fillStyle = COLOR.lime;
      ctx.fillText('PLAY', 63, 384);
      // A planet and interlocking rhythm orbits anchor the lower-right display.
      const planet = ctx.createRadialGradient(776, 463, 5, 790, 500, 125);
      planet.addColorStop(0, '#b8a2ff');
      planet.addColorStop(0.5, '#9475e6');
      planet.addColorStop(1, '#382961');
      ctx.fillStyle = planet;
      ctx.beginPath(); ctx.arc(787, 506, 107, 0, TAU); ctx.fill();
      for (const [angle, color] of [[-0.42, COLOR.cyan], [0.63, COLOR.violet]]) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.ellipse(787, 506, 178, 58, angle, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = COLOR.lime;
      ctx.beginPath(); ctx.arc(639, 571, 13, 0, TAU); ctx.fill();
      for (let i = 0; i < 17; i += 1) {
        const bar = 26 + (Math.sin(i * 0.85) + 1) * 43;
        ctx.fillStyle = i % 5 === 0 ? COLOR.cyan : COLOR.lime;
        ctx.fillRect(75 + i * 24, 563 - bar, 12, bar);
      }
      ctx.strokeStyle = '#526277';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(72, 620); ctx.lineTo(948, 620); ctx.stroke();
      ctx.font = '700 24px monospace';
      ctx.fillStyle = '#b3bbca';
      ctx.fillText('GOOD TIMES. NO TIMER.', 73, 672);
      ctx.fillStyle = COLOR.cyan;
      ctx.fillText('01', 910, 672);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < h; y += 5) ctx.fillRect(0, y, w, 1);
      const vignette = ctx.createRadialGradient(w / 2, h / 2, 230, w / 2, h / 2, 625);
      vignette.addColorStop(0, 'rgba(4,5,17,0)');
      vignette.addColorStop(1, 'rgba(4,5,17,.7)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, w, h);
    });
    const monitor = new THREE.Group();
    monitor.position.set(0, 2.47, 0.42);
    monitor.rotation.x = -0.26;
    cabinet.add(monitor);
    panel(monitor, 1.47, 1.23, 0.1, 0.14, black, [0, 0, -0.015], true);
    const frameShape = roundedRectangle(1.43, 1.18, 0.13);
    frameShape.holes.push(roundedRectangle(1.265, 0.995, 0.11));
    mesh(monitor, extrude(frameShape, 0.055, 0.018), steel, [0, 0, 0.06], true);
    const glassGeometry = keep(new THREE.PlaneGeometry(1.265, 0.995, 40, 32));
    const vertices = glassGeometry.attributes.position;
    for (let i = 0; i < vertices.count; i += 1) {
      let x = vertices.getX(i);
      let y = vertices.getY(i);
      const cornerX = 1.265 / 2 - 0.11;
      const cornerY = 0.995 / 2 - 0.11;
      if (Math.abs(x) > cornerX && Math.abs(y) > cornerY) {
        const dx = Math.abs(x) - cornerX;
        const dy = Math.abs(y) - cornerY;
        const length = Math.hypot(dx, dy);
        if (length > 0.11) {
          x = Math.sign(x) * (cornerX + dx / length * 0.11);
          y = Math.sign(y) * (cornerY + dy / length * 0.11);
        }
      }
      const bulge = 0.085 * (1 - (x / 0.633) ** 2) * (1 - (y / 0.498) ** 2);
      vertices.setXYZ(i, x, y, bulge);
    }
    glassGeometry.computeVertexNormals();
    mesh(monitor, glassGeometry, physical('#ffffff', {
      map: crtTexture, emissiveMap: crtTexture, emissive: '#ffffff',
      emissiveIntensity: 0.6, metalness: 0.05, roughness: 0.19,
      clearcoat: 1, clearcoatRoughness: 0.14, envMapIntensity: 0.3,
    }), [0, 0, 0.087]);
    for (const x of [-0.56, 0.56]) {
      const screw = disc(monitor, 0.018, 0.01, black, [x, -0.544, 0.101]);
      screw.rotation.x = Math.PI / 2;
    }
    glow(cabinet, COLOR.lime, 0.085, 1.7, [0, 2.44, 0.24]);

    const marqueeTexture = canvasTexture(1024, 192, (ctx, w, h) => {
      ctx.fillStyle = '#171823'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = COLOR.lime; ctx.fillRect(25, 25, 9, h - 50);
      ctx.font = '900 84px Arial, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('PLAYROOM', w / 2, 117);
      ctx.fillStyle = '#a8a2bb';
      ctx.font = '700 18px monospace'; ctx.fillText('EST. NOW     •     PLAYER 01', w / 2, 161);
    });
    const marquee = new THREE.Group();
    marquee.position.set(0, 3.235, 0.663);
    marquee.rotation.x = -0.38;
    cabinet.add(marquee);
    panel(marquee, 1.43, 0.305, 0.055, 0.05, black, [0, 0, 0], true);
    const marqueeFace = mesh(marquee, plane, basic('#ffffff', {
      map: marqueeTexture, toneMapped: false,
    }), [0, 0, 0.055]);
    marqueeFace.scale.set(1.33, 0.25, 1);
    box(marquee, [1.3, 0.012, 0.014], neonLime, [0, 0.157, 0.034]);

    const deck = new THREE.Group();
    deck.position.set(0, 1.824, 0.665);
    deck.rotation.x = 0.22;
    cabinet.add(deck);
    const deckBase = panel(deck, 1.48, 0.69, 0.14, 0.055, lavender, [0, 0, 0], true);
    deckBase.rotation.x = -Math.PI / 2;
    const deckTexture = canvasTexture(768, 384, (ctx, w, h) => {
      ctx.fillStyle = '#292638'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#726487'; ctx.lineWidth = 3;
      ctx.strokeRect(15, 14, w - 30, h - 28);
      ctx.strokeStyle = COLOR.lime; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(190, 208, 84, 0, TAU); ctx.stroke();
      ctx.font = '700 24px monospace'; ctx.fillStyle = '#b0a8c3';
      ctx.fillText('MOVE', 152, 72); ctx.fillText('GOOD VIBES', 466, 73);
      ctx.fillStyle = COLOR.cyan;
      ctx.fillRect(491, 300, 136, 4);
    });
    const deckFace = mesh(deck, plane, physical('#ffffff', {
      map: deckTexture, roughness: 0.48, metalness: 0.22,
    }), [0, 0.098, 0]);
    deckFace.rotation.x = -Math.PI / 2;
    deckFace.scale.set(1.46, 0.675, 1);
    box(deck, [1.42, 0.015, 0.017], neonCyan, [0, 0.021, 0.367]);
    const stick = new THREE.Group();
    stick.position.set(-0.39, 0.125, 0.035);
    deck.add(stick);
    disc(stick, 0.13, 0.065, black, [0, 0, 0]);
    const stickCollar = torus(stick, 0.116, 0.013, steel, [0, 0.029, 0]);
    stickCollar.rotation.x = Math.PI / 2;
    const shaft = new THREE.Group();
    shaft.rotation.z = -0.16;
    stick.add(shaft);
    disc(shaft, 0.03, 0.245, steel, [0, 0.132, 0]);
    const knob = mesh(shaft, sphere, limePlastic, [0, 0.295, 0], true);
    knob.scale.setScalar(0.105);
    for (const [x, z, surface] of [
      [0.23, 0.095, limePlastic], [0.48, -0.035, cyanPlastic], [0.18, -0.155, violetPlastic],
    ]) {
      disc(deck, 0.099, 0.036, black, [x, 0.119, z]);
      disc(deck, 0.08, 0.042, surface, [x, 0.153, z], true);
      const cap = mesh(deck, sphere, surface, [x, 0.17, z]);
      cap.scale.set(0.079, 0.02, 0.079);
    }

    panel(cabinet, 1.23, 1.03, 0.035, 0.055, black, [0, 0.8, 0.601], true);
    panel(cabinet, 0.89, 0.235, 0.035, 0.035, charcoal, [0, 1.105, 0.657]);
    panel(cabinet, 0.265, 0.031, 0.014, 0.012, black, [0.13, 1.105, 0.694]);
    const status = mesh(cabinet, sphere, neonLime, [-0.29, 1.11, 0.694]);
    status.scale.set(0.025, 0.025, 0.009);
    for (let i = 0; i < 5; i += 1) {
      box(cabinet, [0.62, 0.014, 0.012], charcoal, [0, 0.43 + i * 0.055, 0.648]);
    }
    const badge = mesh(cabinet, extrude(starShape(0.1), 0.014, 0.005),
      neonLime, [0, 0.86, 0.65]);
    badge.rotation.z = -0.12;
    // Inset side medallion and ribs make the visible side a designed surface.
    const sideBadge = new THREE.Group();
    sideBadge.position.set(0.845, 1.05, -0.07);
    sideBadge.rotation.y = Math.PI / 2;
    cabinet.add(sideBadge);
    const sideDisc = disc(sideBadge, 0.3, 0.014, charcoal, [0, 0, 0]);
    sideDisc.rotation.x = Math.PI / 2;
    torus(sideBadge, 0.225, 0.014, neonViolet, [0, 0, 0.021]);
    const slash = box(sideBadge, [0.055, 0.34, 0.02], neonLime, [0, 0, 0.022]);
    slash.rotation.z = -0.38;

    const ballGroup = new THREE.Group();
    ballGroup.position.set(1.25, 2.68, 0.45);
    artwork.add(ballGroup);
    const basketball = new THREE.Group();
    basketball.rotation.set(0.3, 0.2, -0.4);
    ballGroup.add(basketball);
    const ballTexture = canvasTexture(1024, 512, (ctx, w, h) => {
      ctx.fillStyle = '#f88635'; ctx.fillRect(0, 0, w, h);
      let seed = 91823;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let row = 0; row < 140; row += 1) {
        for (let col = 0; col < 240; col += 1) {
          const value = random();
          ctx.fillStyle = value > 0.5 ? 'rgba(72,27,8,.18)' : 'rgba(255,204,106,.2)';
          ctx.beginPath();
          ctx.arc((col + (row % 2) * 0.5) / 240 * w, row / 140 * h,
            0.8 + value * 0.7, 0, TAU);
          ctx.fill();
        }
      }
    });
    const rubber = physical('#ffffff', {
      map: ballTexture, bumpMap: ballTexture, bumpScale: 0.003,
      metalness: 0, roughness: 0.63, clearcoat: 0.12,
    });
    const ball = mesh(basketball, sphere, rubber);
    ball.scale.setScalar(0.425);
    const seamMaterial = physical('#3d241c', { roughness: 0.84, metalness: 0, clearcoat: 0 });
    for (const rotation of [[0, 0, 0], [Math.PI / 2, 0, 0], [0, Math.PI / 2, 0]]) {
      const seam = torus(basketball, 0.425, 0.006, seamMaterial);
      seam.rotation.set(...rotation);
    }
    const orbit = new THREE.Group();
    orbit.rotation.set(1.12, 0.28, -0.3);
    ballGroup.add(orbit);
    torus(orbit, 0.69, 0.018, neonViolet);
    torus(orbit, 0.69, 0.047, basic(COLOR.violet, {
      transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false,
    }));
    const orbitLight = mesh(orbit, sphere, neonCyan, [0.69, 0, 0]);
    orbitLight.scale.setScalar(0.036);
    glow(ballGroup, COLOR.violet, 0.1, 1.9, [0.05, 0, -0.2]);

    const gold = physical('#dbc888', { metalness: 0.88, roughness: 0.24 });
    const token = new THREE.Group();
    token.position.set(-1.62, 2.78, 0.82);
    token.rotation.set(-0.08, -0.4, -0.28);
    artwork.add(token);
    const tokenBody = disc(token, 0.255, 0.09, gold, [0, 0, 0]);
    tokenBody.rotation.x = Math.PI / 2;
    torus(token, 0.226, 0.013, gold, [0, 0, 0.053]);
    torus(token, 0.243, 0.008, steel, [0, 0, -0.022]);
    mesh(token, extrude(starShape(0.132), 0.025, 0.009), violetMetal, [0, 0, 0.056]);
    for (let i = 0; i < 24; i += 1) {
      const angle = i / 24 * TAU;
      const notch = box(token, [0.01, 0.02, 0.065], violetMetal,
        [Math.cos(angle) * 0.253, Math.sin(angle) * 0.253, 0]);
      notch.rotation.z = angle - Math.PI / 2;
    }
    const floatingStar = new THREE.Group();
    floatingStar.position.set(1.46, 1.09, 0.97);
    floatingStar.rotation.set(0.12, -0.28, 0.19);
    artwork.add(floatingStar);
    mesh(floatingStar, extrude(starShape(0.31), 0.105, 0.026), violetMetal);
    mesh(floatingStar, extrude(starShape(0.223), 0.01, 0.007), steel, [0, 0, 0.081]);
    mesh(floatingStar, extrude(starShape(0.15), 0.014, 0.006), violetMetal, [0, 0, 0.099]);

    // A fixed motion envelope prevents responsive fitting from breathing with
    // the floating ornaments. Glow planes can feather beyond this content box.
    artwork.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(artwork);
    bounds.expandByVector(new THREE.Vector3(0.08, 0.13, 0.04));
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    const contentCorners = [];
    artwork.traverse((object) => {
      if (!object.isMesh && !object.isSprite) return;
      const part = new THREE.Box3().setFromObject(object)
        .expandByVector(new THREE.Vector3(0.035, 0.09, 0.035));
      for (const x of [part.min.x, part.max.x]) {
        for (const y of [part.min.y, part.max.y]) {
          for (const z of [part.min.z, part.max.z]) {
            contentCorners.push(new THREE.Vector3(x, y, z));
          }
        }
      }
    });
    const cameraRight = new THREE.Vector3().crossVectors(UP, cameraDirection).normalize();
    const cameraUp = new THREE.Vector3().crossVectors(cameraDirection, cameraRight).normalize();
    const offset = new THREE.Vector3();
    const motionQuery = view.matchMedia?.('(prefers-reduced-motion: reduce)');
    reducedMotion = motionQuery?.matches ?? false;

    function visible() {
      return hasSize && inViewport && !document.hidden && !suspended && !disposed;
    }

    function pose(time, dt) {
      const t = reducedMotion ? 0 : time;
      ballGroup.position.y = 2.68 + Math.sin(t * 1.15) * 0.075;
      basketball.rotation.set(0.3 + t * 0.055, 0.2 + t * 0.08, -0.4);
      orbitLight.position.set(Math.cos(t * 0.45) * 0.69, Math.sin(t * 0.45) * 0.69, 0);
      token.position.y = 2.78 + Math.sin(t * 1.05 + 0.8) * 0.065;
      token.rotation.y = -0.4 + Math.sin(t * 0.7) * 0.13;
      floatingStar.position.y = 1.09 + Math.sin(t * 1.1 + 2) * 0.065;
      floatingStar.rotation.z = 0.19 + Math.sin(t * 0.6) * 0.12;
      if (reducedMotion) pointer.set(0, 0);
      else pointer.lerp(pointerTarget, 1 - Math.exp(-dt * 5));
      camera.position.copy(cameraHome);
      camera.position.x += pointer.x * 0.16;
      camera.position.y += pointer.y * 0.1;
      camera.lookAt(cameraTarget);
    }

    function paint(dt = 0) {
      if (!visible()) return;
      try {
        pose(elapsed, dt);
        renderer.render(scene, camera);
        canvas.removeAttribute('data-unavailable');
      } catch {
        unavailable();
      }
    }

    function tick(timestamp) {
      frame = 0;
      if (!visible() || reducedMotion) return;
      const dt = lastTimestamp === null ? 0 : Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;
      elapsed += Math.max(0, dt);
      // Decorative art needs only 30 paints/sec; the host UI keeps its own rate.
      if (timestamp - lastPaint >= 1000 / 30 - 1) {
        paint(Math.min(0.08, (timestamp - lastPaint) / 1000));
        lastPaint = timestamp;
      }
      if (visible() && !reducedMotion) frame = view.requestAnimationFrame(tick);
    }

    function resume() {
      stop();
      if (!visible()) return;
      paint(0);
      if (!disposed && !reducedMotion) frame = view.requestAnimationFrame(tick);
    }

    function checkViewport() {
      const rect = canvas.getBoundingClientRect();
      const previous = inViewport;
      inViewport = rect.bottom > 0 && rect.right > 0
        && rect.top < view.innerHeight && rect.left < view.innerWidth;
      if (previous !== inViewport) resume();
    }

    function resize() {
      // Resizing the drawing buffer clears its image. Defer it while a dialog
      // suspends the hero, then measure the current layout on explicit resume.
      if (disposed || suspended) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(0, rect.width);
      const h = Math.max(0, rect.height);
      hasSize = w > 1 && h > 1;
      if (!hasSize) { stop(); return; }
      const dpr = Math.min(view.devicePixelRatio || 1, w < 480 ? 1.5 : 2);
      if (w !== width || h !== height || dpr !== renderer.getPixelRatio()) {
        width = w;
        height = h;
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const verticalSlope = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const horizontalSlope = verticalSlope * camera.aspect;
        let distance = 0;
        for (const corner of corners) {
          offset.subVectors(corner, cameraTarget);
          const towardsCamera = offset.dot(cameraDirection);
          distance = Math.max(distance,
            Math.abs(offset.dot(cameraRight)) / (horizontalSlope * 0.91) + towardsCamera,
            Math.abs(offset.dot(cameraUp)) / (verticalSlope * 0.91) + towardsCamera);
        }
        // Bolder hero coverage, guarded by each actual part rather than empty
        // corners of the combined cabinet/platform box. Keep motion room, too.
        distance /= 1.16;
        for (const corner of contentCorners) {
          offset.subVectors(corner, cameraTarget);
          const towardsCamera = offset.dot(cameraDirection);
          distance = Math.max(distance,
            Math.abs(offset.dot(cameraRight)) / (horizontalSlope * 0.94) + towardsCamera,
            Math.abs(offset.dot(cameraUp)) / (verticalSlope * 0.94) + towardsCamera);
        }
        cameraHome.copy(cameraTarget).addScaledVector(cameraDirection, distance);
        camera.updateProjectionMatrix();
      }
      checkViewport();
      resume();
    }

    function onMotionChange(event) {
      reducedMotion = event.matches;
      if (reducedMotion) pointerTarget.set(0, 0);
      resume();
    }

    function onPointerMove(event) {
      if (reducedMotion || !visible() || event.pointerType === 'touch') return;
      const rect = canvas.getBoundingClientRect();
      pointerTarget.set(
        THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1),
        THREE.MathUtils.clamp(1 - (event.clientY - rect.top) / rect.height * 2, -1, 1),
      );
    }

    if (motionQuery?.addEventListener) listen(motionQuery, 'change', onMotionChange);
    else if (motionQuery?.addListener) {
      motionQuery.addListener(onMotionChange);
      listeners.push(() => motionQuery.removeListener(onMotionChange));
    }
    listen(document, 'visibilitychange', resume);
    listen(canvas, 'songjian:pause', () => {
      suspended = true;
      stop();
    });
    listen(canvas, 'songjian:resume', () => {
      suspended = false;
      resize();
    });
    listen(canvas, 'pointermove', onPointerMove, { passive: true });
    listen(canvas, 'pointerleave', () => pointerTarget.set(0, 0), { passive: true });
    listen(canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      unavailable();
    });
    // Window resize catches a DPR change even if the CSS content box is unchanged.
    listen(view, 'resize', resize, { passive: true });
    if (view.ResizeObserver) {
      resizeObserver = new view.ResizeObserver(resize);
      resizeObserver.observe(canvas);
    }
    if (view.IntersectionObserver) {
      intersectionObserver = new view.IntersectionObserver((entries) => {
        const entry = entries.find((value) => value.target === canvas);
        if (!entry || disposed) return;
        const next = entry.isIntersecting && entry.intersectionRatio > 0;
        if (next !== inViewport) {
          inViewport = next;
          resume();
        }
      }, { threshold: 0 });
      intersectionObserver.observe(canvas);
    } else {
      listen(view, 'scroll', checkViewport, { passive: true, capture: true });
    }
    resize();
  } catch {
    unavailable();
  }

  return cleanup;
}
