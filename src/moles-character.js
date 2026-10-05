import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';

export const MOLES_MAX_MODEL_BYTES = 20 * 1024 * 1024;
const embeddedURI = value => /^data:(?:image\/(?:png|jpeg|webp)|application\/(?:octet-stream|gltf-buffer));base64,/i.test(value);
const abortError = () => Object.assign(new Error('已取消角色读取。'), {name:'AbortError'});

export function inspectMolesGLB(buffer) {
  if (buffer.byteLength > MOLES_MAX_MODEL_BYTES) throw new Error('GLB 文件不能超过 20 MB。');
  if (buffer.byteLength < 20) throw new Error('这不是完整的 GLB 文件。');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== buffer.byteLength) throw new Error('请选择有效的 GLB 2.0 文件。');
  let json = null, binaryLength = 0;
  for (let offset = 12; offset < buffer.byteLength;) {
    if (offset + 8 > buffer.byteLength) throw new Error('GLB 数据不完整。');
    const size = view.getUint32(offset, true), kind = view.getUint32(offset + 4, true);
    if (size % 4 || offset + 8 + size > buffer.byteLength) throw new Error('GLB 数据块无效。');
    if (offset === 12 && kind !== 0x4e4f534a) throw new Error('GLB 缺少模型说明。');
    if (kind === 0x4e4f534a) {
      if (json) throw new Error('GLB 模型说明重复。');
      try {json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, offset + 8, size)).replace(/\0+$/, ''));}
      catch {throw new Error('GLB 模型说明无法读取。');}
    } else if (kind === 0x004e4942) {
      if (binaryLength) throw new Error('GLB 包含重复的二进制资源。');
      binaryLength = size;
    }
    offset += 8 + size;
  }
  if (json?.asset?.version !== '2.0') throw new Error('请选择 GLB 2.0 格式导出的角色。');
  function check(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'uri' && (typeof item !== 'string' || !embeddedURI(item))) {
        throw new Error('模型引用了外部资源。请导出将贴图和模型全部嵌入的单个 GLB 文件。');
      }
      if (item && typeof item === 'object') check(item);
    }
  }
  check(json);
  for (const extension of [...json.extensionsUsed || [], ...json.extensionsRequired || []]) {
    if (['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(extension)) {
      throw new Error('这个 GLB 使用了额外压缩，请关闭 Draco / Meshopt / KTX2 压缩后重新导出。');
    }
  }
  for (const [index, bufferInfo] of (json.buffers || []).entries()) {
    if (!bufferInfo.uri && (index !== 0 || !binaryLength || bufferInfo.byteLength > binaryLength)) {
      throw new Error('GLB 的嵌入资源不完整。');
    }
  }
  for (const image of json.images || []) {
    if (image.bufferView !== undefined && !['image/png','image/jpeg','image/webp'].includes(image.mimeType)) {
      throw new Error('请使用 PNG、JPEG 或 WebP 贴图导出 GLB。');
    }
  }
  return json;
}

function resourcePool() {
  const resources = new Set(), released = new Set(), closedImages = new Set();
  let disposed = false;
  function release(resource) {
    if (released.has(resource)) return;
    released.add(resource);
    resource.dispose();
    if (resource.isTexture) {
      for (const image of [resource.source?.data].flat()) {
        if (image && typeof image.close === 'function' && !closedImages.has(image)) {
          closedImages.add(image); image.close();
        }
      }
    }
  }
  function own(resource) {
    if (!resource || resources.has(resource)) return;
    resources.add(resource);
    if (disposed) release(resource);
  }
  function collect(value) {
    if (!value) return;
    if (Array.isArray(value)) {value.forEach(collect); return;}
    if (value.isTexture || value.isBufferGeometry) own(value);
    else if (value.isMaterial) {
      own(value);
      Object.values(value).forEach(item => {if (item?.isTexture) own(item);});
      Object.values(value.uniforms || {}).forEach(uniform => {if (uniform.value?.isTexture) own(uniform.value);});
    } else if (value.isObject3D) {
      value.traverse(object => {
        collect(object.geometry); collect(object.material); collect(object.skeleton?.boneTexture);
      });
    }
  }
  return {collect, dispose() {if (!disposed) {disposed = true; resources.forEach(release);}}};
}

export function createMolesCharacterAsset(gltf, name, pool = resourcePool()) {
  pool.collect(gltf.scenes || gltf.scene);
  const source = gltf.scene;
  const instances = new Set();
  let disposed = false;
  try {
    if (!source) throw new Error('GLB 中没有可显示的角色。');
    source.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(source, true);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    if (box.isEmpty() || ![...size.toArray(), ...center.toArray()].every(Number.isFinite) || size.y < .00001) {
      throw new Error('角色尺寸无效，请导出完整的站立模型。');
    }
    const scale = Math.min(1.4 / size.y, 1.3 / Math.max(.00001, size.x), .85 / Math.max(.00001, size.z));
    return {
      name: String(name || '导入的小怪兽.glb').split(/[\\/]/).at(-1).slice(0, 120),
      createInstance() {
        if (disposed) throw new Error('角色资源已释放。');
        const instance = new THREE.Group();
        instance.name = 'moles-imported-character';
        const fitted = new THREE.Group();
        fitted.scale.setScalar(scale);
        fitted.position.set(-center.x * scale, -.3 - box.min.y * scale, .08 - center.z * scale);
        fitted.add(cloneSkeleton(source));
        instance.add(fitted); // Y-up, default yaw 0: the exported front faces the camera.
        instances.add(instance);
        return instance;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const instance of instances) {pool.collect(instance); instance.removeFromParent(); instance.clear();}
        instances.clear(); pool.dispose();
      },
    };
  } catch (error) {pool.dispose(); throw error;}
}

export async function loadMolesCharacter(file, {signal} = {}) {
  if (signal?.aborted) throw abortError();
  if (!file || !/\.glb$/i.test(file.name || '')) throw new Error('请选择从 Tripo Studio 导出的 .glb 文件。');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MOLES_MAX_MODEL_BYTES) {
    throw new Error('请选择不超过 20 MB 的 GLB 文件。');
  }
  const bytes = await file.arrayBuffer();
  if (signal?.aborted) throw abortError();
  inspectMolesGLB(bytes);
  const urls = new Set(), pool = resourcePool();
  let settled = false;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    // Only loader-created blobs or preflight-checked embedded data can be decoded.
    if (url.startsWith('blob:')) {
      if (settled || signal?.aborted) {URL.revokeObjectURL(url); throw abortError();}
      urls.add(url); return url;
    }
    if (embeddedURI(url)) return url;
    throw new Error('角色包含外部资源，已阻止联网读取。');
  });
  const loader = new GLTFLoader(manager);
  loader.register(parser => {
    const dependency = parser.getDependency.bind(parser);
    parser.getDependency = (type, index) => dependency(type, index).then(value => {
      pool.collect(value); return value;
    });
    return {name:'MOLES_RESOURCE_OWNER'};
  });
  try {
    const gltf = await loader.parseAsync(bytes, '');
    pool.collect(gltf.scenes);
    if (signal?.aborted) throw abortError();
    return createMolesCharacterAsset(gltf, file.name, pool);
  } catch (error) {
    pool.dispose();
    if (signal?.aborted) throw abortError();
    throw error;
  } finally {
    settled = true;
    // GLTFLoader normally revokes texture URLs on success; also cover decode errors.
    urls.forEach(url => URL.revokeObjectURL(url));
  }
}
