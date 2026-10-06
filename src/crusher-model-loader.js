import * as THREE from 'three';
import {loadMolesCharacter} from './moles-character.js';

// Reuse the embedded-only GLB loader and its abort/texture ownership rules.
// This adapter owns a private loaded asset; instances never edit its buffers.
export async function loadCrusherCar({buffer, name = 'tripo-car.glb'} = {}, {signal} = {}) {
  const bytes = ArrayBuffer.isView(buffer)
    ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;
  const filename = /\.glb$/i.test(name) ? name : `${name}.glb`;
  const source = await loadMolesCharacter({
    name: filename, size: bytes?.byteLength, arrayBuffer: async () => bytes,
  }, {signal});
  try {return createCrusherCarAsset(source);} catch (error) {source.dispose(); throw error;}
}

/** Bake a private static copy, fit the longest horizontal axis to the conveyor,
 * and partition actual source triangles so even a single-mesh GLB fractures.
 * UVs, normals, tangents, vertex colors, material groups and texture atlases survive.
 */
export function createCrusherCarAsset(sourceAsset) {
  const resources = new Set(), materials = new Map();
  const own = value => (resources.add(value), value);
  const model = new THREE.Group();
  model.name = 'crusher-car';
  model.userData.source = 'tripo';
  model.userData.assetName = sourceAsset.name;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    model.removeFromParent(); model.clear();
    resources.forEach(resource => resource.dispose()); resources.clear();
    // The source owns textures (including decoded image bitmaps). Keep these
    // alive until the last cloned material is gone; never dispose a shared map twice.
    sourceAsset.dispose();
  }
  try {
    const instance = sourceAsset.createInstance();
    instance.updateMatrixWorld(true);
    let bounds = new THREE.Box3().setFromObject(instance, true);
    let size = bounds.getSize(new THREE.Vector3());
    if (size.z > size.x) instance.rotation.y = Math.PI / 2;
    instance.updateMatrixWorld(true);
    bounds.setFromObject(instance, true);
    size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    if (Math.min(size.x, size.y, size.z) < 1e-5) throw new Error('汽车模型需要完整的三维几何。');
    const scale = Math.min(2.65 / size.x, 1.1 / size.z, 1.12 / size.y);
    const fit = new THREE.Matrix4().makeScale(scale, scale, scale);
    fit.setPosition(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    const meshes = [];
    instance.traverse(object => {if (object.isMesh && object.geometry?.attributes.position) meshes.push(object);});
    if (!meshes.length || meshes.length > 128) throw new Error('汽车模型的网格数量不适合这个工坊。');
    const fittedSize = size.clone().multiplyScalar(scale), point = new THREE.Vector3();
    const materialCopy = material => {
      if (!materials.has(material)) materials.set(material, own(material.clone()));
      return materials.get(material);
    };
    for (const object of meshes) {
      let baked = object.geometry.clone();
      if (object.isSkinnedMesh || object.morphTargetInfluences?.some(value => value !== 0)) {
        object.skeleton?.update();
        for (let i = 0; i < baked.attributes.position.count; i++) {
          object.getVertexPosition(i, point);
          baked.attributes.position.setXYZ(i, point.x, point.y, point.z);
        }
        baked.computeVertexNormals();
      }
      baked.applyMatrix4(object.matrixWorld).applyMatrix4(fit);
      if (baked.index) {const expanded = baked.toNonIndexed(); baked.dispose(); baked = expanded;}
      try {
        const sourceMaterials = (Array.isArray(object.material) ? object.material : [object.material]).map(materialCopy);
        const position = baked.attributes.position;
        const buckets = new Map();
        for (let triangle = 0; triangle < position.count; triangle += 3) {
          let key = 0;
          if (meshes.length <= 4) {
            point.set(0, 0, 0);
            for (let v = 0; v < 3; v++) {
              point.x += position.getX(triangle + v) / 3;
              point.y += position.getY(triangle + v) / 3;
              point.z += position.getZ(triangle + v) / 3;
            }
            const x = Math.min(3, Math.max(0, Math.floor((point.x / fittedSize.x + .5) * 4)));
            const y = Math.min(1, Math.max(0, Math.floor(point.y / fittedSize.y * 2)));
            const z = Math.min(1, Math.max(0, Math.floor((point.z / fittedSize.z + .5) * 2)));
            key = x + y * 4 + z * 8;
          }
          const group = baked.groups.find(group => triangle >= group.start && triangle < group.start + group.count);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push({triangle, material: group?.materialIndex || 0});
        }
        for (const triangles of buckets.values()) {
          const geometry = own(new THREE.BufferGeometry());
          for (const [name, attribute] of Object.entries(baked.attributes)) {
            if (['skinIndex', 'skinWeight'].includes(name) || attribute.itemSize > 4) continue;
            const data = new Float32Array(triangles.length * 3 * attribute.itemSize);
            const read = ['getX', 'getY', 'getZ', 'getW'];
            let cursor = 0;
            for (const {triangle} of triangles) for (let vertex = 0; vertex < 3; vertex++) {
              for (let component = 0; component < attribute.itemSize; component++) {
                data[cursor++] = attribute[read[component]](triangle + vertex);
              }
            }
            geometry.setAttribute(name, new THREE.BufferAttribute(data, attribute.itemSize));
          }
          triangles.forEach(({material}, index) => {
            const previous = geometry.groups.at(-1);
            if (previous?.materialIndex === material) previous.count += 3;
            else geometry.addGroup(index * 3, 3, material);
          });
          geometry.computeBoundingBox();
          const pivot = geometry.boundingBox.getCenter(new THREE.Vector3());
          geometry.translate(-pivot.x, -pivot.y, -pivot.z);
          if (!geometry.attributes.normal) geometry.computeVertexNormals();
          const part = new THREE.Mesh(geometry, sourceMaterials.length === 1 ? sourceMaterials[0] : sourceMaterials);
          part.name = `tripo-car-part-${model.children.length}`;
          part.position.copy(pivot);
          part.castShadow = part.receiveShadow = true;
          part.userData.homePosition = part.position.clone();
          part.userData.homeScale = part.scale.clone();
          part.userData.homeRotation = part.rotation.clone();
          part.userData.seed = model.children.length;
          model.add(part);
        }
      } finally {baked.dispose();}
    }
    return {name: sourceAsset.name, model, dispose};
  } catch (error) {dispose(); throw error;}
}
