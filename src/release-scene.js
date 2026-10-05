import * as THREE from 'three';
import {beginReleaseDrag, moveReleaseDrag, endReleaseDrag} from './release-state.js';
import {releaseLaunch, releaseTrajectory} from './release-challenges.js';

function roundedBox(width, height, depth, radius = .13) {
  const geometry = new THREE.BoxGeometry(width, height, depth, 6, 6, 6);
  const position = geometry.attributes.position;
  const point = new THREE.Vector3();
  const core = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    point.fromBufferAttribute(position, index);
    core.set(
      THREE.MathUtils.clamp(point.x, -width / 2 + radius, width / 2 - radius),
      THREE.MathUtils.clamp(point.y, -height / 2 + radius, height / 2 - radius),
      THREE.MathUtils.clamp(point.z, -depth / 2 + radius, depth / 2 - radius),
    );
    point.sub(core).normalize().multiplyScalar(radius).add(core);
    position.setXYZ(index, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createReleaseScene(canvas, {
  state, onImpact = () => {}, onAim = () => {}, onUnavailable = () => {}, onActivity = () => {}, reducedMotion = false,
  rendererFactory = options => new THREE.WebGLRenderer(options),
}) {
  let renderer;
  const scene = new THREE.Scene();
  const resources = new Set();
  const abort = new AbortController();
  let observer;
  let disposed = false;
  let drag = null;
  const meshes = new Map();
  const shadows = new Map();
  const signatures = new Map();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const target = new THREE.Vector3();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.6);
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 80);
  camera.position.set(state.challenge ? 9 : 0, 10.5, 13.5);
  camera.lookAt(0, state.challenge ? .8 : .5, 0);

  const own = resource => { resources.add(resource); return resource; };
  const material = (color, extra = {}) => own(new THREE.MeshStandardMaterial({
    color, roughness: .78, metalness: .025, ...extra,
  }));
  function mesh(geometry, paint, parent = scene) {
    const object = new THREE.Mesh(own(geometry), paint);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  function removeObject(object) {
    if (!object) return;
    const owned = new Set();
    object.traverse(item => {
      if (item.geometry) owned.add(item.geometry);
      if (item.material) {
        for (const paint of Array.isArray(item.material) ? item.material : [item.material]) owned.add(paint);
      }
    });
    for (const resource of owned) {
      resource.dispose();
      resources.delete(resource);
    }
    object.removeFromParent();
  }

  function cancelGesture() {
    if (!drag) return;
    const current = drag;
    drag = null;
    endReleaseDrag(state, current.id);
    if (canvas.hasPointerCapture?.(current.pointerId)) canvas.releasePointerCapture(current.pointerId);
    canvas.classList.remove('release-is-dragging');
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    observer?.disconnect();
    cancelGesture();
    for (const resource of resources) resource.dispose();
    resources.clear();
    renderer?.renderLists.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    scene.clear();
    meshes.clear();
    shadows.clear();
    signatures.clear();
  }

  try {
    renderer = rendererFactory({canvas, alpha: true, antialias: true, powerPreference: 'low-power'});
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.8));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    scene.add(new THREE.HemisphereLight(0xfff0d8, 0x42565c, 2.2));
    const sun = new THREE.DirectionalLight(0xffedd8, 3.5);
    sun.position.set(-4, 11, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -8;
    sun.shadow.camera.right = sun.shadow.camera.top = 8;
    sun.shadow.camera.near = .5;
    sun.shadow.camera.far = 30;
    sun.shadow.normalBias = .045;
    sun.shadow.bias = -.0003;
    scene.add(sun);
    // Light shadow targets are allocated on first render, so dispose via the light.
    resources.add(sun);
    const rim = new THREE.DirectionalLight(0xc8d4ef, 1.1);
    rim.position.set(5, 6, -6);
    scene.add(rim);

    const base = mesh(roundedBox(12, .52, 7.65, .24), material('#465654'));
    base.position.y = -.36;
    const edge = mesh(roundedBox(11.86, .16, 7.5, .07), material('#a0a98c'));
    edge.position.y = -.105;
    const surface = mesh(roundedBox(11.7, .1, 7.34, .048), material('#738278'));
    surface.position.y = -.05;
    const legMaterial = material('#354846');
    for (const x of [-4.75, 4.75]) {
      for (const z of [-2.5, 2.5]) {
        const leg = mesh(new THREE.CylinderGeometry(.2, .16, .7, 16), legMaterial);
        leg.position.set(x, -.87, z);
      }
    }

    const freeMarks = new THREE.Group();
    scene.add(freeMarks);
    const markMaterial = material('#e9dfc5', {transparent: true, opacity: .27, depthWrite: false});
    for (const [x, z, radius] of [[-3.45, .7, 1.12], [-.85, -.8, 1.15], [.75, 1.3, 1.17], [3.15, -.8, .95]]) {
      const mark = mesh(new THREE.TorusGeometry(radius, .014, 6, 72), markMaterial, freeMarks);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x, .009, z);
      mark.castShadow = mark.receiveShadow = false;
    }
    function addBody(body) {
      const group = new THREE.Group();
      group.userData.bodyId = body.id;
      scene.add(group);
      const clay = material(body.color);
      if (body.kind === 'ring') {
        const ring = mesh(new THREE.TorusGeometry(.65, .26, 20, 64), clay, group);
        ring.rotation.x = Math.PI / 2;
        const seam = mesh(new THREE.TorusGeometry(.65, .011, 6, 64), material('#e2d6ea'), group);
        seam.rotation.x = Math.PI / 2;
        seam.position.y = .257;
      } else if (body.kind === 'block') {
        mesh(roundedBox(body.half.x * 2, body.half.y * 2, body.half.z * 2,
          Math.min(.14, body.half.y * .55)), clay, group);
        const stamp = mesh(new THREE.TorusGeometry(Math.min(.145, body.half.y * .5), .018, 6, 24),
          material('#7a6b74', {transparent: true, opacity: .45}), group);
        stamp.position.z = body.half.z + .001;
        stamp.castShadow = false;
      } else {
        const toy = mesh(body.kind === 'puff'
          ? new THREE.SphereGeometry(1, 40, 28) : new THREE.IcosahedronGeometry(1, 3), clay, group);
        toy.scale.set(body.half.x, body.half.y, body.half.z);
        if (body.kind === 'puff') {
          const dimpleMaterial = material('#c78075');
          for (const x of [-.24, .24]) {
            const dimple = mesh(new THREE.SphereGeometry(.055, 12, 8), dimpleMaterial, group);
            dimple.scale.z = .26;
            dimple.position.set(x * body.half.x / .87, body.half.y * .26, body.half.z * .94);
          }
        }
      }
      const shadowMaterial = own(new THREE.MeshBasicMaterial({
        color: '#253d35', transparent: true, opacity: .14, depthWrite: false,
      }));
      const shadow = mesh(new THREE.CircleGeometry(Math.max(body.half.x, body.half.z) * .9, 40), shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.castShadow = shadow.receiveShadow = false;
      shadows.set(body.id, shadow);
      meshes.set(body.id, group);
    }

    function reconcileBodies() {
      const ids = new Set(state.bodies.map(body => body.id));
      for (const id of meshes.keys()) {
        if (!ids.has(id)) {
          removeObject(meshes.get(id)); removeObject(shadows.get(id));
          meshes.delete(id); shadows.delete(id); signatures.delete(id);
        }
      }
      for (const body of state.bodies) {
        const signature = `${body.kind}/${body.color}/${body.half.x}/${body.half.y}/${body.half.z}`;
        if (signatures.get(body.id) === signature) continue;
        removeObject(meshes.get(body.id)); removeObject(shadows.get(body.id));
        addBody(body);
        signatures.set(body.id, signature);
      }
    }

    const guide = new THREE.Group();
    scene.add(guide);
    const trajectoryGeometry = own(new THREE.BufferGeometry());
    trajectoryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(25 * 3), 3));
    trajectoryGeometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute(new Float32Array(25), 1));
    const trajectory = new THREE.Line(trajectoryGeometry,
      own(new THREE.LineDashedMaterial({color: '#ffdcaa', dashSize: .11, gapSize: .09, transparent: true, opacity: .9})));
    guide.add(trajectory);
    const previewMaterial = material('#edaa99', {transparent: true, opacity: .55, depthWrite: false});
    const preview = mesh(new THREE.SphereGeometry(1, 20, 14), previewMaterial, guide);
    preview.castShadow = preview.receiveShadow = false;
    const launchPad = mesh(new THREE.TorusGeometry(.76, .028, 6, 56), material('#f1b5a1'), guide);
    launchPad.rotation.x = -Math.PI / 2;
    launchPad.position.set(0, .025, 2.35);
    const footprintGeometry = own(new THREE.BufferGeometry());
    footprintGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(48 * 8 * 3), 3));
    const footprints = new THREE.LineSegments(footprintGeometry,
      own(new THREE.LineBasicMaterial({color: '#e9dfc5', transparent: true, opacity: .35})));
    scene.add(footprints);

    function renderGuide() {
      const challenge = state.challenge;
      guide.visible = Boolean(challenge && challenge.phase === 'aiming');
      footprints.visible = Boolean(challenge);
      freeMarks.visible = !challenge;
      if (!challenge) return;
      let count = 0;
      const footprintPoints = footprintGeometry.attributes.position;
      for (const body of state.bodies) {
        const home = challenge.homes[body.id];
        if (!home || home.y > body.half.y + .01) continue;
        const {x, z} = home, {x: hx, z: hz} = body.half;
        for (const [px, pz] of [[x-hx,z-hz], [x+hx,z-hz], [x+hx,z-hz], [x+hx,z+hz],
          [x+hx,z+hz], [x-hx,z+hz], [x-hx,z+hz], [x-hx,z-hz]]) {
          footprintPoints.setXYZ(count++, px, .026, pz);
        }
      }
      footprintPoints.needsUpdate = true;
      footprintGeometry.setDrawRange(0, count);
      footprintGeometry.computeBoundingSphere();
      if (!guide.visible) return;
      const points = releaseTrajectory(challenge);
      const attribute = trajectoryGeometry.attributes.position;
      const distances = trajectoryGeometry.attributes.lineDistance;
      let distance = 0;
      points.forEach((point, index) => {
        attribute.setXYZ(index, point.x, point.y, point.z);
        if (index) distance += Math.hypot(point.x - points[index-1].x, point.y - points[index-1].y, point.z - points[index-1].z);
        distances.setX(index, distance);
      });
      attribute.needsUpdate = true;
      distances.needsUpdate = true;
      trajectoryGeometry.setDrawRange(0, points.length);
      trajectoryGeometry.computeBoundingSphere();
      const {spec, position} = releaseLaunch(challenge);
      preview.position.set(position.x, position.y, position.z);
      preview.scale.setScalar(spec.half);
      previewMaterial.color.set(spec.color);
    }

    function resize() {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const aspect = width / height;
      const viewWidth = Math.max(12.8, 7.7 * aspect);
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewWidth / aspect / 2;
      camera.bottom = -camera.top;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    }

    function render() {
      if (disposed) return;
      reconcileBodies();
      renderGuide();
      for (const [index, body] of state.bodies.entries()) {
        const group = meshes.get(body.id);
        const idle = state.challenge || reducedMotion || !body.sleeping || state.paused ? 0 : Math.sin(state.elapsed * 1.3 + index) * .012;
        group.position.set(body.position.x, body.position.y + idle, body.position.z);
        group.rotation.set(body.rotation.x, body.rotation.y, body.rotation.z);
        const pulse = state.challenge ? body.pulse * .25 : body.pulse;
        group.scale.set(1 + pulse * .13, 1 - pulse * .24, 1 + pulse * .13);
        const shadow = shadows.get(body.id);
        const height = Math.max(0, body.position.y - body.half.y);
        shadow.position.set(body.position.x, .012, body.position.z);
        shadow.scale.setScalar(1 + height * .1);
        shadow.material.opacity = .14 / (1 + height * .8);
      }
      renderer.render(scene, camera);
    }

    function setView(view) {
      const x = {left: -9, front: 0, right: 9}[view];
      if (disposed || x === undefined) return false;
      cancelGesture();
      camera.position.set(x, 10.5, 13.5);
      camera.lookAt(0, .8, 0);
      camera.updateMatrixWorld();
      render();
      return true;
    }

    function setPointer(event) {
      const rect = canvas.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1,
        -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
    }

    canvas.addEventListener('pointerdown', event => {
      if (disposed || state.paused || drag || event.button !== 0 || event.isPrimary === false) return;
      if (state.mode === 'challenge') {
        if (state.challenge.phase !== 'aiming') return;
        setPointer(event);
        plane.constant = 0;
        if (raycaster.ray.intersectPlane(plane, target) &&
            Math.abs(target.x) <= 5.4 && Math.abs(target.z) <= 3.1 && target.z < 1.8) {
          onAim({x: target.x, y: 0, z: target.z});
          event.preventDefault();
        }
        return;
      }
      setPointer(event);
      const hit = raycaster.intersectObjects([...meshes.values()], true)[0];
      if (!hit) return;
      let object = hit.object;
      while (object && !object.userData.bodyId) object = object.parent;
      if (!object) return;
      const body = state.bodies.find(item => item.id === object.userData.bodyId);
      plane.constant = -Math.max(1.2, body.position.y + .65);
      if (!raycaster.ray.intersectPlane(plane, target)) return;
      drag = {
        id: body.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
        offsetX: body.position.x - target.x, offsetZ: body.position.z - target.z,
        moving: false, lastTime: event.timeStamp, last: {...body.position}, velocity: {x: 0, y: 0, z: 0},
      };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }, {signal: abort.signal});

    canvas.addEventListener('pointermove', event => {
      if (!drag || drag.pointerId !== event.pointerId || state.paused) return;
      if (!drag.moving && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
      if (!drag.moving) {
        drag.moving = beginReleaseDrag(state, drag.id);
        if (!drag.moving) { cancelGesture(); return; }
        canvas.classList.add('release-is-dragging');
      }
      setPointer(event);
      if (!raycaster.ray.intersectPlane(plane, target)) return;
      const position = {x: target.x + drag.offsetX, y: -plane.constant, z: target.z + drag.offsetZ};
      moveReleaseDrag(state, drag.id, position);
      const body = state.bodies.find(item => item.id === drag.id);
      const seconds = Math.max(.008, (event.timeStamp - drag.lastTime) / 1000);
      drag.velocity = {
        x: (body.position.x - drag.last.x) / seconds * .48,
        y: 3.5, z: (body.position.z - drag.last.z) / seconds * .48,
      };
      drag.last = {...body.position};
      drag.lastTime = event.timeStamp;
      onActivity();
      event.preventDefault();
    }, {signal: abort.signal});

    canvas.addEventListener('pointerup', event => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      const current = drag;
      drag = null;
      canvas.classList.remove('release-is-dragging');
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (state.paused) { endReleaseDrag(state, current.id); return; }
      if (current.moving) {
        const velocity = event.timeStamp - current.lastTime < 120 ? current.velocity : {x: 0, y: 1, z: 0};
        endReleaseDrag(state, current.id, velocity);
        onImpact(current.id, {thrown: true});
      } else onImpact(current.id);
    }, {signal: abort.signal});
    for (const type of ['pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, cancelGesture, {signal: abort.signal});
    }
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      if (disposed) return;
      dispose();
      onUnavailable();
    }, {signal: abort.signal});
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(canvas);
    } else globalThis.addEventListener('resize', resize, {signal: abort.signal});
    resize();
    return {
      render, cancelGesture, setView,
      setReducedMotion(value) { reducedMotion = value; render(); },
      destroy: dispose,
    };
  } catch {
    dispose();
    return null;
  }
}
