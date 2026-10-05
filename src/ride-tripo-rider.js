import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {inspectMolesGLB} from './moles-character.js';

const clamp = THREE.MathUtils.clamp;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const ease = value => {const t = clamp(value, 0, 1); return t * t * (3 - 2 * t);};
const abortError = () => Object.assign(new Error('已取消车手读取。'), {name: 'AbortError'});
const HIP = new THREE.Vector3(0, 1.055, .29);

// The asset owns geometry/images; instances own only their cloned materials and
// skeletons. Dependency collection also releases resources arriving after abort.
function resourcePool() {
  const owned = new Set(), released = new Set(), images = new Set();
  let disposed = false;
  function release(resource) {
    if (released.has(resource)) return;
    released.add(resource); resource.dispose();
    if (resource.isTexture) for (const image of [resource.source?.data].flat()) {
      if (image?.close && !images.has(image)) {images.add(image); image.close();}
    }
  }
  function own(resource) {
    if (!resource || owned.has(resource)) return;
    owned.add(resource);
    if (disposed) release(resource);
  }
  function collect(value) {
    if (!value) return;
    if (Array.isArray(value)) {value.forEach(collect); return;}
    if (value.isTexture || value.isBufferGeometry) own(value);
    else if (value.isMaterial) {
      own(value);
      Object.values(value).forEach(item => {if (item?.isTexture) own(item);});
      Object.values(value.uniforms || {}).forEach(item => {if (item.value?.isTexture) own(item.value);});
    } else if (value.isObject3D) value.traverse(object => {
      collect(object.geometry); collect(object.material); own(object.skeleton);
    });
  }
  return {collect, dispose() {if (!disposed) {disposed = true; owned.forEach(release);}}};
}

function readRig(source) {
  const bones = [], used = new Set();
  source.traverse(object => {
    if (object.isBone) bones.push(object);
    if (object.isSkinnedMesh && object.geometry.attributes.skinIndex && object.geometry.attributes.skinWeight) {
      object.skeleton?.bones.forEach(bone => {if (bone?.isBone) used.add(bone);});
    }
  });
  const find = (side, parts) => bones.find(bone => {
    const key = bone.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return parts.some(part => side
      ? [side + part, part + side, part + side[0], side[0] + part].some(suffix => key.endsWith(suffix))
      : key.endsWith(part));
  });
  const hips = find('', ['hips', 'pelvis']), spine = find('', ['spine', 'spine0']);
  const chest = find('', ['spine2', 'chest', 'upperchest']) || find('', ['spine1']) || spine;
  const neck = find('', ['neck']), head = find('', ['head']);
  const arms = ['left', 'right'].map((side, index) => ({
    side: index ? 1 : -1,
    upper: find(side, ['arm', 'upperarm']), lower: find(side, ['forearm', 'lowerarm']),
    end: find(side, ['hand', 'wrist']), tip: find(side, ['handmiddle1', 'middle1']),
  }));
  const legs = ['left', 'right'].map((side, index) => ({
    side: index ? 1 : -1,
    upper: find(side, ['upleg', 'thigh', 'upperleg']), lower: find(side, ['leg', 'calf', 'lowerleg']),
    end: find(side, ['foot']), tip: find(side, ['toebase', 'toe']),
  }));
  const descendant = (child, ancestor) => {
    for (let current = child?.parent; current; current = current.parent) if (current === ancestor) return true;
    return false;
  };
  const usable = chain => chain.upper && chain.lower && chain.end && used.has(chain.upper) &&
    used.has(chain.lower) && used.has(chain.end) && descendant(chain.lower, chain.upper) && descendant(chain.end, chain.lower);
  const skinned = used.size > 0;
  const rigged = Boolean(skinned && hips && spine && head && used.has(hips) && used.has(head) &&
    descendant(spine, hips) && descendant(head, spine) && arms.every(usable) && legs.every(usable));
  return {bones, hips, spine, chest, neck, head, arms, legs, skinned, rigged};
}

// World-space joint rotation preserves authored Mixamo/Tripo bind axes.
function turnBone(bone, axis, angle) {
  if (!bone || !angle) return;
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
  bone.updateWorldMatrix(false, true);
}

function pointBone(bone, child, target, localTip) {
  const pivot = bone.getWorldPosition(new THREE.Vector3());
  const from = (child ? child.getWorldPosition(new THREE.Vector3()) : bone.localToWorld(localTip.clone())).sub(pivot);
  const to = target.clone().sub(pivot);
  if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  world.premultiply(new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world)).normalize();
  bone.updateWorldMatrix(false, true);
}

function reach(chain, target, bend) {
  const start = chain.upper.getWorldPosition(new THREE.Vector3());
  const middle = chain.lower.getWorldPosition(new THREE.Vector3());
  const end = chain.end.getWorldPosition(new THREE.Vector3());
  const a = start.distanceTo(middle), b = middle.distanceTo(end), direction = target.clone().sub(start);
  if (a < 1e-6 || b < 1e-6 || direction.lengthSq() < 1e-12) return;
  const distance = clamp(direction.length(), Math.abs(a - b) + 1e-6, a + b - 1e-6);
  direction.normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 1e-8) bend.set(direction.y, -direction.x, .1);
  bend.normalize();
  middle.copy(start).addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)));
  pointBone(chain.upper, chain.lower, middle);
  pointBone(chain.lower, chain.end, target);
}

function torsoPose(rig, axis, lean) {
  turnBone(rig.hips, axis, -lean);
  turnBone(rig.spine, axis, -.12);
  if (rig.chest !== rig.spine) turnBone(rig.chest, axis, -.06);
  turnBone(rig.neck, axis, .30);
  turnBone(rig.head, axis, .50);
}

function captureRest(rig) {
  return rig.bones.map(bone => ({position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone()}));
}

function restoreRest(rig, rest) {
  rig.bones.forEach((bone, i) => {
    bone.position.copy(rest[i].position); bone.quaternion.copy(rest[i].quaternion); bone.scale.copy(rest[i].scale);
  });
}

// Helmet centre from real head-weighted vertices, rather than a guessed marker
// above the neck. This remains attached to the animated head under parent falls.
function helmetOffset(source, rig) {
  const box = new THREE.Box3(), point = new THREE.Vector3();
  source.updateWorldMatrix(true, true);
  source.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const weights = mesh.geometry.attributes.skinWeight, joints = mesh.geometry.attributes.skinIndex;
    if (!weights || !joints) return;
    const headBones = mesh.skeleton.bones.map(bone => {
      for (let current = bone; current?.isBone; current = current.parent) if (current === rig.head) return true;
      return false;
    });
    mesh.skeleton.update();
    for (let i = 0; i < weights.count; i++) {
      let weight = 0;
      for (let j = 0; j < 4; j++) if (headBones[joints.getComponent(i, j)]) weight += weights.getComponent(i, j);
      if (weight > .5) box.expandByPoint(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld));
    }
  });
  if (box.isEmpty()) {
    const bounds = new THREE.Box3().setFromObject(source, true);
    rig.head.getWorldPosition(point); point.y = (point.y + bounds.max.y) / 2;
  } else box.getCenter(point);
  return rig.head.worldToLocal(point);
}

// Some Tripo rigs end at the wrist. Their actual glove geometry supplies an
// aim direction, allowing the hand joint to grip without inventing finger bones.
function gloveOffset(source, hand) {
  const center = new THREE.Vector3(), point = new THREE.Vector3();
  let count = 0;
  source.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.skeleton.bones.indexOf(hand);
    const {skinWeight: weights, skinIndex: joints} = mesh.geometry.attributes;
    if (index < 0 || !weights || !joints) return;
    for (let i = 0; i < weights.count; i++) {
      let weight = 0;
      for (let j = 0; j < 4; j++) if (joints.getComponent(i, j) === index) weight += weights.getComponent(i, j);
      if (weight > .6) {center.add(mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld)); count++;}
    }
  });
  if (!count) return null;
  hand.worldToLocal(center.divideScalar(count));
  return center.lengthSq() > 1e-8 ? center : null;
}

function numberTexture() {
  const size = 256, data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) data.set([255, 255, 255, 0], i * 4);
  const curve = (...points) => new THREE.CubicBezierCurve(...points.map(p => new THREE.Vector2(...p))).getPoints(32);
  const path = [
    ...curve([.29, .23], [.62, .08], [.88, .32], [.57, .47]),
    ...curve([.57, .47], [.50, .50], [.45, .50], [.42, .50]),
    ...curve([.42, .50], [.88, .42], [.91, .95], [.27, .79]),
  ];
  const radius = size * .052;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1].clone().multiplyScalar(size), b = path[i].clone().multiplyScalar(size);
    const d = b.clone().sub(a), length = d.lengthSq();
    for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius - 1)); y < Math.min(size, Math.ceil(Math.max(a.y, b.y) + radius + 1)); y++)
      for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius - 1)); x < Math.min(size, Math.ceil(Math.max(a.x, b.x) + radius + 1)); x++) {
        const t = length ? clamp(((x + .5 - a.x) * d.x + (y + .5 - a.y) * d.y) / length, 0, 1) : 0;
        const alpha = Math.round(clamp(radius + .5 - Math.hypot(x + .5 - a.x - d.x * t, y + .5 - a.y - d.y * t), 0, 1) * 255);
        const index = ((size - 1 - y) * size + x) * 4 + 3;
        data[index] = Math.max(data[index], alpha);
      }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
  return texture;
}

// Copy actual shirt triangles and skin weights, so the number follows the back.
// The selected surface is game +Z after source orientation has been normalized.
function addBackNumber(source, group, rig, pool) {
  group.updateWorldMatrix(true, true);
  const local = bone => group.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  const left = local(rig.arms[0].upper), right = local(rig.arms[1].upper), waist = local(rig.spine);
  const center = left.clone().add(right).multiplyScalar(.5);
  const width = Math.abs(right.x - left.x) * .82, bottom = waist.y, top = center.y - width * .1;
  if (width < 1e-6 || top <= bottom) return;
  const meshes = [];
  source.traverse(mesh => {if (mesh.isSkinnedMesh) meshes.push(mesh);});
  let material;
  for (const mesh of meshes) {
    const original = mesh.geometry, {position, normal, skinIndex: joints, skinWeight: weights} = original.attributes;
    if (!position || !normal || !joints || !weights) continue;
    const matrix = group.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    const torso = mesh.skeleton.bones.map(bone => /spine|chest|hips|torso/i.test(bone.name));
    const points = [], normals = [], torsoWeights = [];
    for (let i = 0; i < position.count; i++) {
      points.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(matrix));
      normals.push(new THREE.Vector3().fromBufferAttribute(normal, i).applyNormalMatrix(normalMatrix));
      let weight = 0;
      for (let j = 0; j < 4; j++) if (torso[joints.getComponent(i, j)]) weight += weights.getComponent(i, j);
      torsoWeights.push(weight);
    }
    const selected = [], index = original.index;
    for (let i = 0; i < (index?.count || position.count); i += 3) {
      const ids = [0, 1, 2].map(j => index ? index.getX(i + j) : i + j), p = ids.map(id => points[id]);
      if (ids.reduce((sum, id) => sum + torsoWeights[id], 0) < 1.2 ||
          ids.reduce((sum, id) => sum + normals[id].z, 0) < .3 ||
          p.reduce((sum, point) => sum + point.z - waist.z, 0) <= 0 ||
          Math.min(...p.map(point => point.x)) > center.x + width / 2 ||
          Math.max(...p.map(point => point.x)) < center.x - width / 2 ||
          Math.min(...p.map(point => point.y)) > top || Math.max(...p.map(point => point.y)) < bottom) continue;
      selected.push(...ids);
    }
    if (!selected.length) continue;
    const geometry = new THREE.BufferGeometry(), attributes = {position: [], normal: [], uv: [], skinIndex: [], skinWeight: []};
    // Separation is relative to model size, since GLB units vary between exports.
    const separation = width * .003 / Math.max(...mesh.getWorldScale(new THREE.Vector3()).toArray());
    for (const id of selected) {
      const point = new THREE.Vector3().fromBufferAttribute(position, id)
        .addScaledVector(new THREE.Vector3().fromBufferAttribute(normal, id), separation);
      attributes.position.push(...point.toArray()); attributes.normal.push(normal.getX(id), normal.getY(id), normal.getZ(id));
      attributes.uv.push(.5 + (points[id].x - center.x) / width, (points[id].y - bottom) / (top - bottom));
      for (let j = 0; j < 4; j++) {attributes.skinIndex.push(joints.getComponent(id, j)); attributes.skinWeight.push(weights.getComponent(id, j));}
    }
    for (const [name, values] of Object.entries(attributes))
      geometry.setAttribute(name, name === 'skinIndex' ? new THREE.Uint16BufferAttribute(values, 4)
        : new THREE.Float32BufferAttribute(values, name === 'uv' ? 2 : name === 'skinWeight' ? 4 : 3));
    geometry.userData.sourceVertices = selected;
    material ||= new THREE.MeshStandardMaterial({color: '#ffffff', map: numberTexture(), roughness: .85,
      alphaTest: .08, alphaToCoverage: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1});
    const ink = new THREE.SkinnedMesh(geometry, material);
    ink.name = 'ride-jersey-back'; ink.userData.jersey = {number: '3', side: 'back'};
    ink.frustumCulled = false; ink.receiveShadow = true;
    mesh.add(ink); ink.bindMode = mesh.bindMode; ink.bind(mesh.skeleton, mesh.bindMatrix);
    pool.collect(ink);
  }
}

/**
 * Takes ownership of a parsed GLB. The returned asset creates independent posed
 * riders, sharing geometry and images. Bike-local metres, Y-up, front = -Z.
 * An unskinned/incomplete export reports rigged=false and cannot be instantiated.
 */
export function createRideTripoRider(gltf, {name = 'Tripo 车手'} = {}, pool = resourcePool()) {
  const instances = new Set();
  let disposed = false;
  pool.collect(gltf?.scenes || gltf?.scene);
  try {
    const source = gltf?.scene;
    if (!source?.isObject3D) throw new Error('GLB 中没有车手。');
    source.updateMatrixWorld(true);
    const rig = readRig(source), rest = captureRest(rig);
    const template = new THREE.Group(), fitted = new THREE.Group(), oriented = new THREE.Group();
    template.name = 'ride-tripo-rider'; fitted.name = 'ride-rider-fit';
    let sourceYaw = Math.PI, headOffset, handOffsets, lean = .66;
    if (rig.rigged) {
      const right = rig.arms[1].upper.getWorldPosition(new THREE.Vector3()).sub(rig.arms[0].upper.getWorldPosition(new THREE.Vector3()));
      if (Math.hypot(right.x, right.z) < 1e-6) throw new Error('车手骨骼朝向无效。');
      sourceYaw = Math.atan2(right.z, right.x);
    }
    oriented.rotation.y = sourceYaw; oriented.add(source); fitted.add(oriented); template.add(fitted);
    template.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(template, true), size = bounds.getSize(new THREE.Vector3());
    if (bounds.isEmpty() || !size.toArray().every(Number.isFinite) || size.y < 1e-6) throw new Error('车手尺寸无效。');
    source.traverse(object => {
      if (object.isMesh) object.castShadow = object.receiveShadow = true;
      if (object.isSkinnedMesh) object.frustumCulled = false;
    });
    if (rig.rigged) {
      headOffset = helmetOffset(source, rig);
      handOffsets = rig.arms.map(arm => arm.tip ? null : gloveOffset(source, arm.end));
      addBackNumber(source, template, rig, pool);
      // Fit the helmet/seat first, then increase the riding lean only if these
      // particular arms need it. Bone lengths and bind matrices stay intact.
      for (let attempt = 0; attempt <= 14; attempt++) {
        lean = .66 + attempt * .02;
        fitted.scale.setScalar(1); fitted.position.set(0, 0, 0);
        restoreRest(rig, rest); template.updateMatrixWorld(true);
        torsoPose(rig, new THREE.Vector3(1, 0, 0), lean);
        const hips = rig.hips.getWorldPosition(new THREE.Vector3()), helmet = rig.head.localToWorld(headOffset.clone());
        const span = helmet.y - hips.y;
        if (!Number.isFinite(span) || span < 1e-6) throw new Error('车手骨骼比例无效。');
        const scale = (1.72 - HIP.y) / span;
        fitted.scale.setScalar(scale); fitted.position.copy(HIP).addScaledVector(hips, -scale);
        template.updateMatrixWorld(true);
        if (rig.arms.every(arm => {
          const shoulder = arm.upper.getWorldPosition(new THREE.Vector3()), elbow = arm.lower.getWorldPosition(new THREE.Vector3());
          const length = shoulder.distanceTo(elbow) + elbow.distanceTo(arm.end.getWorldPosition(new THREE.Vector3()));
          return shoulder.distanceTo(new THREE.Vector3(arm.side * .29, 1.105, -.535)) < length * .94;
        })) break;
      }
      restoreRest(rig, rest); template.updateMatrixWorld(true);
    }
    const asset = {
      name: String(name).split(/[\\/]/).at(-1).slice(0, 120),
      skinned: rig.skinned, rigged: rig.rigged, forward: '-Z', sourceYaw,
      createInstance() {
        if (disposed) throw new Error('车手资源已释放 (disposed)。');
        if (!rig.rigged) throw new Error('车手需要完整的 Humanoid 骨骼和真实蒙皮 (rig)。');
        const group = cloneSkeleton(template), materials = new Map(), skeletons = new Set();
        group.traverse(object => {
          if (!object.isMesh) return;
          const copyMaterial = material => {
            if (!materials.has(material)) materials.set(material, material.clone());
            return materials.get(material);
          };
          object.material = Array.isArray(object.material) ? object.material.map(copyMaterial) : copyMaterial(object.material);
          if (object.isSkinnedMesh) {
            if (object.name === 'ride-jersey-back' && object.parent.isSkinnedMesh) {
              object.skeleton.dispose(); object.skeleton = object.parent.skeleton;
            }
            if (!skeletons.has(object.skeleton)) {
              object.skeleton.boneInverses = object.skeleton.boneInverses.map(matrix => matrix.clone());
              skeletons.add(object.skeleton);
            }
          }
        });
        const joints = readRig(group), localRest = captureRest(joints);
        let removed = false;
        function update(options = {}) {
          if (removed) return;
          restoreRest(joints, localRest); group.updateWorldMatrix(true, true);
          const rotation = group.getWorldQuaternion(new THREE.Quaternion());
          const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rotation);
          torsoPose(joints, axis, lean);
          const time = finite(options.time), side = Math.sign(finite(options.attackSide));
          const attackTime = clamp(finite(options.attackTime), 0, .3);
          const push = Math.sin(Math.PI * attackTime / .3);
          const progress = clamp(finite(options.fallProgress, options.fallTime > 0 ? 1 - finite(options.fallTime) / 3 : 0), 0, 1);
          const fall = ease(progress / .16) * (1 - ease((progress - .78) / .22)), fallSide = Math.sign(finite(options.fallSide, 1)) || 1;
          for (const [index, arm] of joints.arms.entries()) {
            const hit = arm.side === side ? push * (1 - fall) : 0;
            const target = new THREE.Vector3(arm.side * (.29 + .62 * hit), 1.105 + .28 * hit, -.535 + .38 * hit);
            target.x += fall * arm.side * (.30 + .16 * Math.sin(time * 9 + arm.side));
            target.y += fall * (.40 + .18 * Math.cos(time * 11 + arm.side * fallSide));
            target.z += fall * (.37 + .22 * Math.sin(time * 8 + arm.side));
            reach(arm, group.localToWorld(target), new THREE.Vector3(arm.side * .9, -.2, .45).applyQuaternion(rotation));
            if (arm.tip || handOffsets[index]) {
              const hand = arm.end.getWorldPosition(new THREE.Vector3());
              const aim = new THREE.Vector3(arm.side * (.02 + .10 * hit), -.045, -.12 + .08 * hit).applyQuaternion(rotation);
              pointBone(arm.end, arm.tip, hand.add(aim), handOffsets[index]);
            }
          }
          for (const leg of joints.legs) {
            const target = new THREE.Vector3(leg.side * .27, .48, .14);
            target.x += fall * leg.side * (.18 + .12 * Math.sin(time * 7 + leg.side));
            target.y += fall * (.10 + .16 * Math.cos(time * 10 + leg.side));
            target.z += fall * (.18 + .20 * Math.sin(time * 9 + leg.side * fallSide));
            reach(leg, group.localToWorld(target), new THREE.Vector3(leg.side * .35, .1, -1).applyQuaternion(rotation));
            if (leg.tip) {
              const foot = leg.end.getWorldPosition(new THREE.Vector3());
              pointBone(leg.end, leg.tip, foot.add(new THREE.Vector3(0, -.01, -.18).applyQuaternion(rotation)));
            }
          }
          // SkinnedMesh updates its inverse attachment matrix in updateMatrixWorld,
          // not updateWorldMatrix. CPU picking and the first frame need it too.
          group.updateMatrixWorld(true); skeletons.forEach(skeleton => skeleton.update());
        }
        const instance = {
          group, skinned: true, rigged: true, forward: '-Z', update,
          getHeadPosition(out = new THREE.Vector3()) {
            group.updateWorldMatrix(true, true);
            return joints.head.localToWorld(out.copy(headOffset));
          },
          dispose() {
            if (removed) return;
            removed = true; instances.delete(instance);
            skeletons.forEach(skeleton => skeleton.dispose()); materials.forEach(material => material.dispose());
            group.removeFromParent(); group.clear();
          },
        };
        instances.add(instance); update();
        return instance;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const instance of instances) instance.dispose();
        instances.clear(); template.clear(); pool.dispose();
      },
    };
    return asset;
  } catch (error) {pool.dispose(); throw error;}
}

/** Parse an embedded, uncompressed GLB (<=20 MB); no downloads or private loop.
 * createInstance().update uses seconds: attackTime is remaining time in a .3s
 * push; fallProgress runs 0..1 (remaining fallTime/3 is also accepted).
 */
export async function loadRideTripoRider(buffer, {name, signal} = {}) {
  if (signal?.aborted) throw abortError();
  const bytes = ArrayBuffer.isView(buffer) ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;
  if (!(bytes instanceof ArrayBuffer)) throw new Error('请提供内嵌的 GLB 字节。');
  inspectMolesGLB(bytes);
  const pool = resourcePool(), urls = new Set(), manager = new THREE.LoadingManager();
  let settled = false, onAbort;
  manager.setURLModifier(url => {
    if (url.startsWith('blob:')) {
      if (settled || signal?.aborted) {URL.revokeObjectURL(url); throw abortError();}
      urls.add(url); return url;
    }
    if (/^data:/i.test(url)) return url; // Preflight already checked embedded URI types.
    throw new Error('GLB 外部资源已阻止。');
  });
  const loader = new GLTFLoader(manager);
  loader.register(parser => {
    const dependency = parser.getDependency.bind(parser);
    parser.getDependency = (type, index) => dependency(type, index).then(value => {pool.collect(value); return value;});
    return {name: 'RIDE_TRIPO_RESOURCES'};
  });
  try {
    const parsing = loader.parseAsync(bytes, '').then(gltf => {pool.collect(gltf.scenes); return gltf;});
    const cancelled = signal && new Promise((resolve, reject) => {
      onAbort = () => reject(abortError());
      signal.addEventListener('abort', onAbort, {once: true});
      if (signal.aborted) onAbort();
    });
    const gltf = await (cancelled ? Promise.race([parsing, cancelled]) : parsing);
    if (signal?.aborted) throw abortError();
    return createRideTripoRider(gltf, {name}, pool);
  } catch (error) {pool.dispose(); throw error;}
  finally {
    settled = true; urls.forEach(url => URL.revokeObjectURL(url));
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
}
