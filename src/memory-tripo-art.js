import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {loadMolesCharacter} from './moles-character.js';
import {TRIPO_ASSETS, loadTripoAsset} from './tripo-assets.js';

const SUBJECTS = {
  coral: '珊瑚', vase: '花瓶', turtle: '海龟', motorcycle: '摩托', sofa: '沙发',
  car: '跑车', orange: '甜橙', pine: '松树', tv: '电视', athlete: '球员',
  rider: '骑手', monster: '小怪兽', robot: '机器人', fruit: '水果', player: '球员',
};
const ALTERNATE_IDS = ['car', 'motorcycle', 'coral', 'turtle', 'pine', 'sofa'];
const alternateView = face => ({...face, view: 'top', yaw: -.65, elevation: 1.1,
  name: `${face.subject} · 俯视`});
function labelViews(faces) {
  for (const face of faces) if (face) {
    const repeated = faces.filter(other => other?.identity === face.identity).length > 1;
    face.name = face.view === 'top' ? `${face.subject} · 俯视`
      : repeated ? `${face.subject} · 斜视` : face.subject;
  }
  return faces;
}

// Prefer different sculpts. A rigged copy is the same visual identity as its
// source athlete, even if it has another registry id and another GLB file.
export function memoryTripoFaces(count = 6, registry = TRIPO_ASSETS) {
  const seen = new Set();
  const ids = ['coral', 'vase', 'turtle', 'motorcycle', 'sofa', 'car', 'orange',
    'pine', 'tv', 'robot', 'fruit', 'athlete', 'rider', 'monster', 'player'].filter(id => {
    const asset = registry[id];
    if (!asset || (id === 'player' && registry.athlete)) return false;
    const identity = asset.task || asset.file || id;
    if (seen.has(identity)) return false;
    seen.add(identity); return true;
  });
  const faces = ids.map(id => ({
    id, identity: registry[id].task || registry[id].file || id, view: 'main',
    subject: SUBJECTS[id] || registry[id].name, name: SUBJECTS[id] || registry[id].name,
    yaw: ['car', 'motorcycle'].includes(id) ? .95 : .45,
    elevation: id === 'turtle' ? .65 : .3,
  }));
  for (const id of ALTERNATE_IDS) {
    const face = faces.find(item => item.id === id);
    if (face) faces.push(alternateView(face));
  }
  return labelViews(faces.slice(0, Math.max(0, Math.min(12, Number.isFinite(count) ? Math.floor(count) : 6))));
}

function roomLighting(renderer) {
  const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer);
  try {return generator.fromScene(room, .04);}
  finally {room.dispose(); generator.dispose();}
}

// One small, unattached canvas for the entire deck; no per-card WebGL contexts.
export function createMemoryThumbnailStudio({
  rendererFactory = options => new THREE.WebGLRenderer(options),
  environmentFactory = roomLighting,
} = {}) {
  let renderer, environment, disposed = false, lost = false;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 30);
  const key = new THREE.DirectionalLight(0xfff4e5, 2.5);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.HemisphereLight(0xe8f3ff, 0xb9a896, 1.2));
  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
    scene.environment = null; scene.clear();
    environment?.dispose(); renderer?.dispose(); renderer?.forceContextLoss();
  }
  function contextLost(event) {event.preventDefault(); lost = true; dispose();}
  try {
    renderer = rendererFactory({alpha: true, antialias: true, preserveDrawingBuffer: true});
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.setPixelRatio(1); renderer.setSize(256, 256, false); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.debug.onShaderError = () => {throw new Error('卡面材质未能渲染');};
    environment = environmentFactory(renderer); scene.environment = environment.texture;
  } catch (error) {dispose(); throw error;}
  return {
    render(instance, face) {
      if (disposed || lost) throw new Error('缩略图渲染器不可用');
      const subject = new THREE.Group();
      subject.name = 'memory-tripo-subject'; subject.add(instance); scene.add(subject);
      try {
        subject.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(subject, true);
        const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
        if (bounds.isEmpty() || ![...center.toArray(), ...size.toArray()].every(Number.isFinite)) {
          throw new Error('卡面模型尺寸无效');
        }
        const scale = 1.8 / Math.max(size.x, size.y, size.z, .00001);
        subject.scale.setScalar(scale); subject.position.copy(center).multiplyScalar(-scale);
        subject.updateMatrixWorld(true);
        const elevation = face.elevation, yaw = face.yaw;
        camera.position.set(5 * Math.sin(yaw) * Math.cos(elevation), 5 * Math.sin(elevation),
          5 * Math.cos(yaw) * Math.cos(elevation));
        camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(subject, true);
        let extent = .01;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
            extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
          }
        }
        const half = extent * 1.12;
        camera.left = camera.bottom = -half; camera.right = camera.top = half;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        if (lost || disposed) throw new Error('缩略图渲染中断');
        const src = renderer.domElement.toDataURL('image/png');
        if (!src.startsWith('data:image/png;base64,')) throw new Error('缩略图未能导出');
        return src;
      } finally {instance.removeFromParent(); subject.removeFromParent();}
    },
    dispose,
  };
}

export async function loadMemoryTripoArt({
  count = 6, signal, registry = TRIPO_ASSETS,
  loadAsset = loadTripoAsset, createStudio = createMemoryThumbnailStudio,
} = {}) {
  const specifications = memoryTripoFaces(count, registry);
  const faces = Array.from({length: Math.max(0, Math.min(12, Number.isFinite(count) ? Math.floor(count) : 6))}, () => null);
  const gallery = {faces, dispose() {faces.length = 0;}};
  if (signal?.aborted) return gallery;
  let studio;
  try {studio = createStudio();}
  catch {return gallery;}
  let released = false;
  const binaries = new Map();
  const release = () => {if (!released) {released = true; studio.dispose();}};
  signal?.addEventListener('abort', release, {once: true});
  async function capture(binary, requests) {
    let asset;
    try {
      asset = await loadMolesCharacter({
        name: binary.name, size: binary.buffer.byteLength, arrayBuffer: async () => binary.buffer,
      }, {signal});
      if (signal?.aborted) return;
      const instance = asset.createInstance();
      for (const {face, index} of requests) {
        if (signal?.aborted) break;
        faces[index] = {...face, src: studio.render(instance, face), source: 'Tripo'};
      }
    } finally {asset?.dispose();}
  }
  try {
    // Sequential decoding bounds peak texture/GPU memory. A model's alternative
    // views are captured together, then all of its GLB resources are released.
    for (const id of new Set(specifications.map(face => face.id))) {
      if (signal?.aborted) break;
      try {
        const binary = await loadAsset(id);
        if (signal?.aborted) break;
        binaries.set(id, binary);
        await capture(binary, specifications.flatMap((face, index) => face.id === id ? [{face, index}] : []));
      } catch {
        // Each failed model keeps its original, playable illustrated card.
      }
    }
    // Larger decks can fill an unavailable new model with a clearly different
    // view of an already successful model. No extra request or renderer needed.
    if (faces.length > 6) for (const id of ALTERNATE_IDS) {
      const index = faces.indexOf(null);
      if (index < 0 || signal?.aborted) break;
      const original = faces.find(face => face?.id === id && face.view === 'main');
      if (!original || faces.some(face => face?.id === id && face.view === 'top')) continue;
      try {await capture(binaries.get(id), [{index, face: alternateView(original)}]);}
      catch { /* Preserve the illustrated slot if this extra view also fails. */ }
    }
    labelViews(faces);
  } finally {
    binaries.clear();
    signal?.removeEventListener('abort', release); release();
    if (signal?.aborted) faces.fill(null);
  }
  return gallery;
}
