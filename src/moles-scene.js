import * as THREE from 'three';

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


const centers = Array.from({length: 9}, (_, hole) => ({
  x: (hole % 3 - 1) * 2.8, y: (1 - Math.floor(hole / 3)) * 2.8,
}));

// The renderer and native button overlay share this orthographic layout.
export function molesLayout(width, height) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const worldWidth = Math.max(9.4, 9.8 * aspect), worldHeight = worldWidth / aspect;
  return {worldWidth, worldHeight, holes: centers.map(({x, y}) => ({
    x: .5 + x / worldWidth, y: .5 - (y + .5) / worldHeight,
    width: 2.45 / worldWidth, height: 2.65 / worldHeight,
  }))};
}

export function createMolesScene(canvas, {reducedMotion = false} = {}) {
  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
  canvas[RENDERER_OWNER]=renderer;
  const resources = new Set(), keep = value => (resources.add(value), value);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .1, 60);
  camera.position.set(0, 0, 20);
  let disposed = false, lastState = null, characterAsset = null, characterYaw = 0, previousRound;
  const critters = [], effects = [];
  try {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    scene.add(new THREE.HemisphereLight('#ffefc5', '#345b53', 2.6));
    const sun = new THREE.DirectionalLight('#fff1ce', 3.4);
    sun.position.set(-4, 9, 12); scene.add(sun);
    const fill = new THREE.DirectionalLight('#afd6c1', 1.3);
    fill.position.set(7, -3, 6); scene.add(fill);
    const sphere = keep(new THREE.SphereGeometry(1, 20, 14));
    const cube = keep(new THREE.BoxGeometry(1, 1, 1));
    const cylinder = keep(new THREE.CylinderGeometry(1, 1, 1, 24));
    const dome = keep(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
    const rim = keep(new THREE.TorusGeometry(.81, .13, 10, 32));
    const smile = keep(new THREE.TorusGeometry(.1, .014, 6, 16, Math.PI));
    const ring = keep(new THREE.RingGeometry(.43, .48, 32));
    const colors = new Map();
    const material = (color, extra = {}) => {
      const key = color + JSON.stringify(extra);
      if (!colors.has(key)) colors.set(key, keep(new THREE.MeshStandardMaterial({color, roughness: .8, ...extra})));
      return colors.get(key);
    };
    const shape = new THREE.Shape();
    for (let point = 0; point < 10; point++) {
      const angle = Math.PI / 2 + point * Math.PI / 5, radius = point % 2 ? .46 : 1;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
      if (point === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const starGeometry = keep(new THREE.ExtrudeGeometry(shape, {depth: .15, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .05, bevelThickness: .04}));
    const heart = new THREE.Shape();
    heart.moveTo(0, -.4);
    heart.bezierCurveTo(-.9, .1, -.5, .8, 0, .35);
    heart.bezierCurveTo(.5, .8, .9, .1, 0, -.4);
    const heartGeometry = keep(new THREE.ExtrudeGeometry(heart, {depth:.08, bevelEnabled:false}));
    const mesh = (parent, geometry, surface, position, scale = [1, 1, 1]) => {
      const object = new THREE.Mesh(geometry, surface);
      object.position.set(...position); object.scale.set(...scale); parent.add(object);
      return object;
    };
    const ball = (parent, color, position, scale) => mesh(parent, sphere, material(color), position, scale);

    centers.forEach(({x, y}, hole) => {
      const slot = new THREE.Group(); slot.position.set(x, y, 0); scene.add(slot);
      ball(slot, '#516c42', [0, -.51, -.05], [1.1, .28, .7]);
      ball(slot, '#a4b879', [0, -.45, .05], [1.09, .19, .62]);
      ball(slot, '#273e30', [0, -.36, .4], [.87, .23, .16]);
      mesh(slot, rim, material('#927153'), [0, -.35, .51], [1, .31, .5]);
      // A foreground berm gives the rising body an actual 3D edge to emerge behind.
      ball(slot, '#8da56b', [0, -.57, .9], [1.05, .16, .14]);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const blade = ball(slot, i % 2 ? '#c3c984' : '#7f995c',
            [side * (.8 + i * .11), -.32 + i * .025, .6], [.042, .24 + i * .04, .035]);
          blade.rotation.z = side * (.22 + i * .24);
        }
      }
      if (hole % 2 === 0) {
        ball(slot, '#eaca9b', [1, -.43, .88], [.085, .085, .07]);
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal * Math.PI * 2 / 5;
          ball(slot, '#f3e6cc', [1 + Math.cos(angle) * .12, -.43 + Math.sin(angle) * .12, .84], [.095, .095, .035]);
        }
      }
      const group = new THREE.Group(); group.name = `moles-critter-${hole}`; slot.add(group);
      const fur = [];
      fur.push(ball(group, '#b48662', [0, .22, .12], [.61, .62, .47]));
      fur.push(ball(group, '#b48662', [0, .78, .15], [.61, .56, .48]));
      for (const side of [-1, 1]) {
        fur.push(ball(group, '#b48662', [side * .47, 1.14, .05], [.2, .25, .12]));
        ball(group, '#dda494', [side * .47, 1.15, .17], [.115, .15, .035]);
        ball(group, '#edceb0', [side * .49, .02, .52], [.17, .12, .1]);
        ball(group, '#f5e7cf', [side * .205, .85, .56], [.125, .15, .06]);
        ball(group, '#263f37', [side * .205, .84, .619], [.055, .077, .035]);
        ball(group, '#fff8e3', [side * .205 - .018, .875, .65], [.018, .023, .012]);
        ball(group, '#e3bba0', [side * .29, .6, .57], [.115, .07, .025]);
        ball(group, '#f1d9b8', [side * .085, .64, .65], [.12, .09, .055]);
        mesh(group, cube, material('#fff3d8'), [side * .052, .5, .65], [.085, .14, .07]);
      }
      ball(group, '#865647', [0, .72, .71], [.125, .085, .08]);
      const mouth = mesh(group, smile, material('#6e5642'), [0, .55, .69]);
      mouth.rotation.z = Math.PI;
      const exampleParts = [...group.children];
      const helmet = new THREE.Group(); helmet.name = `moles-helmet-${hole}`; group.add(helmet);
      const hat = material('#86aeb2', {roughness:.38, metalness:.22});
      mesh(helmet, dome, hat, [0, 1.05, .13], [.7, .5, .6]);
      mesh(helmet, cylinder, hat, [0, 1.06, .13], [.76, .08, .67]);
      mesh(helmet, cube, material('#f2d7a6'), [0, 1.31, .61], [.22, .18, .03]);
      const star = mesh(group, starGeometry, material('#ffe39a', {emissive:'#7a441a', emissiveIntensity:.18}),
        [0, 1.48, .27], [.32, .32, .32]);
      star.name = `moles-star-${hole}`;
      const leaves = new THREE.Group(); leaves.name = `moles-leaves-${hole}`; group.add(leaves);
      mesh(leaves, cylinder, material('#658857'), [0, 1.37, .14], [.035, .49, .035]);
      for (const side of [-1, 1]) {
        const leaf = ball(leaves, side < 0 ? '#d5de99' : '#a9c882', [side * .2, 1.45, .16], [.16, .37, .06]);
        leaf.rotation.z = -side * .8;
      }
      const heartMark = mesh(group, heartGeometry, material('#fff0c9'), [0, .12, .61], [.28, .28, .28]);
      const adornments = [helmet, star, leaves, heartMark].map(object => ({
        object, position:object.position.clone(), scale:object.scale.clone(),
      }));
      const burstMaterial = keep(new THREE.MeshBasicMaterial({color:'#ffdf9a', transparent:true, opacity:0, depthWrite:false, side:THREE.DoubleSide}));
      const burst = mesh(slot, ring, burstMaterial, [0, .8, 1.1]);
      critters.push({group, fur, helmet, star, leaves, heartMark, adornments, exampleParts, imported:null, signature:''});
      effects.push({burst, at:-10, kind:'hit'});
    });

    function fitImportedCharacter() {
      critters.forEach(({adornments}) => adornments.forEach(({object, position, scale}) => {
        object.position.copy(position); object.scale.copy(scale);
      }));
      const model = critters[0].imported;
      if (!model) return;
      // Fit only these instances; the shared loader also serves other games.
      model.position.set(0, 0, 0); model.scale.setScalar(1); model.rotation.y = characterYaw;
      model.updateWorldMatrix(true, true);
      const inverse = model.parent.matrixWorld.clone().invert();
      // The slot/pop transforms have no rotation, so their inverse preserves this box.
      const body = new THREE.Box3().setFromObject(model, true).applyMatrix4(inverse);
      const size = body.getSize(new THREE.Vector3()), center = body.getCenter(new THREE.Vector3());
      const scale = Math.min(1.4 / size.y, 1.4 / Math.max(.00001, size.x), 1.05 / Math.max(.00001, size.z));
      const offset = new THREE.Vector3(-center.x * scale, -.3 - body.min.y * scale, .12 - center.z * scale);
      critters.forEach(({imported}) => {
        imported.position.copy(offset); imported.scale.setScalar(scale); imported.rotation.y = characterYaw;
      });
      body.min.multiplyScalar(scale).add(offset); body.max.multiplyScalar(scale).add(offset);
      model.updateWorldMatrix(true, true);
      const head = new THREE.Box3(), point = new THREE.Vector3(), toLocal = new THREE.Matrix4();
      const headBase = body.min.y + size.y * scale * .55;
      // Upper-body vertices exclude wide arms/feet when sizing the hat.
      model.traverse(object => {
        if (!object.isMesh || !object.geometry.attributes.position) return;
        toLocal.multiplyMatrices(inverse, object.matrixWorld);
        for (let i = 0; i < object.geometry.attributes.position.count; i++) {
          object.getVertexPosition(i, point).applyMatrix4(toLocal);
          if (point.y >= headBase) head.expandByPoint(point);
        }
      });
      if (head.isEmpty()) head.copy(body);
      const headSize = head.getSize(new THREE.Vector3()), headCenter = head.getCenter(new THREE.Vector3());
      const hatX = Math.max(.12, headSize.x) * 1.12 / 1.52;
      const hatZ = Math.max(.12, headSize.z) * 1.08 / 1.34;
      const hatY = Math.max(.35, Math.min(.9, (hatX + hatZ) / 2));
      const starScale = Math.min(.3, Math.max(.18, headSize.x * .26));
      const leafScale = Math.min(.75, Math.max(.5, headSize.x * .7));
      starGeometry.computeBoundingBox();
      critters.forEach(({helmet, star, leaves, heartMark}) => {
        helmet.scale.set(hatX, hatY, hatZ);
        // The brim intersects the crown; the dome encloses its top instead of hovering.
        helmet.position.set(headCenter.x, head.max.y - 1.31 * hatY, headCenter.z - .13 * hatZ);
        star.scale.setScalar(starScale);
        star.position.set(headCenter.x, head.max.y + .025 - starGeometry.boundingBox.min.y * starScale, head.max.z + .04);
        leaves.scale.setScalar(leafScale);
        leaves.position.set(headCenter.x, head.max.y - .035 - 1.125 * leafScale, headCenter.z - .14 * leafScale);
        heartMark.scale.setScalar(Math.min(.28, Math.max(.18, headSize.x * .24)));
        heartMark.position.set(center.x * scale + offset.x, body.min.y + size.y * scale * .32, body.max.z + .035);
      });
    }

    function resize(width, height) {
      if (disposed) return;
      const layout = molesLayout(width, height);
      camera.left = -layout.worldWidth / 2; camera.right = layout.worldWidth / 2;
      camera.top = layout.worldHeight / 2; camera.bottom = -layout.worldHeight / 2;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      renderer.setPixelRatio(Math.min(2, canvas.ownerDocument?.defaultView?.devicePixelRatio || 1));
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
      if (lastState) render(lastState);
    }
    function render(state) {
      if (disposed) return;
      if (state.roundId !== previousRound) {
        effects.forEach(effect => {effect.at = -10;});
        previousRound = state.roundId;
      }
      lastState = state;
      critters.forEach((critter, hole) => {
        const previewKind = ['normal','helmet','shiny','normal','friend','normal','helmet','shiny','friend'][hole];
        const preview = state.preview || state.phase === 'ready' && [0,2,4,8].includes(hole);
        const mole = preview ? {type:previewKind, hp:2, bornAt:state.elapsed - 1, expiresAt:Infinity} : state.holes[hole];
        critter.group.visible = Boolean(mole);
        if (mole) {
          const signature = `${mole.type}/${mole.hp}`;
          if (critter.signature !== signature) {
            critter.signature = signature;
            const color = mole.type === 'friend' ? '#99b77e' : mole.type === 'shiny' ? '#e8ba65' : '#b48662';
            critter.fur.forEach(object => {object.material = material(color);});
            critter.helmet.visible = mole.type === 'helmet' && mole.hp === 2;
            critter.star.visible = mole.type === 'shiny';
            critter.leaves.visible = critter.heartMark.visible = mole.type === 'friend';
          }
          const pop = reducedMotion ? 1 : Math.max(0, Math.min(1, (state.elapsed - mole.bornAt) / .12, (mole.expiresAt - state.elapsed) / .14));
          const ease = 1 - (1 - pop) ** 3;
          critter.group.scale.y = .06 + .94 * ease;
          critter.group.position.y = -.42 * (1 - ease);
          critter.star.rotation.y = reducedMotion ? 0 : Math.sin(state.elapsed * 2) * .2;
        }
        const fx = effects[hole], age = state.elapsed - fx.at;
        fx.burst.visible = age >= 0 && age < .42;
        if (fx.burst.visible) {
          fx.burst.material.color.set(fx.kind === 'friend' || fx.kind === 'empty' ? '#efb79f' : '#ffe2a0');
          fx.burst.material.opacity = .85 * (1 - age / .42);
          fx.burst.scale.setScalar(reducedMotion ? 1.2 : 1 + age * 3);
          fx.burst.position.y = .8 + (reducedMotion ? 0 : age);
        }
      });
      renderer.render(scene, camera);
    }
    function flash(hole, kind, at) {
      if (!disposed && effects[hole]) Object.assign(effects[hole], {kind, at});
    }
    function setCharacter(asset) {
      if (disposed) {asset?.dispose(); return false;}
      if (asset === characterAsset) return true;
      const copies = [];
      try {
        if (asset) for (let hole = 0; hole < 9; hole++) copies.push(asset.createInstance());
      } catch (error) {asset?.dispose(); throw error;}
      const previous = characterAsset;
      characterAsset = asset; characterYaw = 0;
      critters.forEach((critter, hole) => {
        critter.imported?.removeFromParent();
        critter.imported = copies[hole] || null;
        if (critter.imported) critter.group.add(critter.imported);
        critter.exampleParts.forEach(part => {part.visible = !asset;});
      });
      fitImportedCharacter();
      previous?.dispose();
      if (lastState) render(lastState);
      return true;
    }
    function setCharacterYaw(yaw) {
      if (disposed || !Number.isFinite(yaw)) return;
      characterYaw = yaw;
      fitImportedCharacter();
      if (lastState) render(lastState);
    }
    function dispose() {
      if (disposed) return;
      disposed = true; lastState = null; characterAsset?.dispose(); characterAsset = null; scene.clear();
      for (const resource of resources) resource.dispose();
      resources.clear(); releaseRenderer(renderer,canvas);
    }
    return {resize, render, flash, dispose, setCharacter, setCharacterYaw};
  } catch (error) {
    for (const resource of resources) resource.dispose();
    scene.clear(); releaseRenderer(renderer,canvas);
    throw error;
  }
}
