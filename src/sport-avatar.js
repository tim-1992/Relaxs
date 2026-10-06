import * as THREE from 'three';

// Original, locally generated characters. These meshes are not Tripo assets.
export const SPORT_CHARACTERS = Object.freeze([
  {id: 'moss', name: '小森', color: '#9caf78', detail: '森林球手'},
  {id: 'peach', name: '桃桃', color: '#dc9c93', detail: '桃子小熊'},
  {id: 'robot', name: '阿方', color: '#8eafb6', detail: '方块机器人'},
]);

const clamp = (value, low, high) => Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));

/**
 * Feet rest at y=0; height ~1.8; character faces -z.
 * Position/scale the root from the scene. action is one action's normalized
 * progress (0 and 1 are ready); animation does not advance its own clock.
 */
export function createSportAvatar({sport = 'tennis', character = 'moss'} = {}) {
  const group = new THREE.Group();
  group.name = `${sport}-avatar`;
  let rig, head, leftArm, rightArm, leftLeg, rightLeg, leftKnee, rightKnee, leftHand, rightHand;
  let disposed = false;
  const resources = new Set();
  const keep = value => (resources.add(value), value);
  function clear() {
    resources.forEach(resource => resource.dispose());
    resources.clear();
    group.clear();
  }
  function material(color, extra = {}) {
    return keep(new THREE.MeshStandardMaterial({color, roughness: .74, ...extra}));
  }
  function mesh(geometry, surface, parent, x, y, z, name = '') {
    const object = new THREE.Mesh(keep(geometry), surface);
    object.position.set(x, y, z); object.name = name;
    object.castShadow = true; object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function pivot(parent, x, y, z) {
    const object = new THREE.Group(); object.position.set(x, y, z); parent.add(object); return object;
  }
  function build(id) {
    clear();
    const definition = SPORT_CHARACTERS.find(item => item.id === id) || SPORT_CHARACTERS[0];
    const robot = definition.id === 'robot', bear = definition.id === 'peach';
    group.userData.character = definition.id;
    const kit = material(definition.color);
    const skin = material(robot ? '#c4d1cd' : bear ? '#e6c19c' : '#efcfa9');
    const cream = material('#efeed6');
    const dark = material('#334b48');
    const trim = material(robot ? '#d6e8c4' : '#d2dab2');
    rig = pivot(group, 0, 0, 0);
    mesh(robot ? new THREE.BoxGeometry(.6, .6, .35) : new THREE.CapsuleGeometry(.29, .28, 5, 12), kit, rig, 0, 1.01, 0, 'avatar-shirt');
    mesh(new THREE.BoxGeometry(.48, .22, .3), dark, rig, 0, .66, 0);
    // A small jersey mark makes facing and chest rotation visible.
    mesh(new THREE.BoxGeometry(.09, .2, .017), cream, rig, 0, 1.09, -.3);
    head = pivot(rig, 0, 1.53, 0);
    mesh(robot ? new THREE.BoxGeometry(.51, .47, .43) : new THREE.SphereGeometry(.275, 16, 12), skin, head, 0, 0, 0, 'avatar-head');
    if (robot) {
      mesh(new THREE.BoxGeometry(.39, .17, .025), dark, head, 0, .015, -.224);
      for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(.055, .06, .025), trim, head, side * .1, .02, -.244);
      mesh(new THREE.CylinderGeometry(.025, .025, .12, 6), dark, head, 0, .29, 0);
      mesh(new THREE.SphereGeometry(.065, 10, 8), kit, head, 0, .37, 0);
    } else {
      for (const side of [-1, 1]) {
        mesh(new THREE.SphereGeometry(.028, 8, 6), dark, head, side * .09, .035, -.252);
        mesh(new THREE.SphereGeometry(bear ? .105 : .06, 10, 8), skin, head, side * (bear ? .21 : .267), bear ? .21 : -.005, 0);
      }
      if (bear) {
        const muzzle = mesh(new THREE.SphereGeometry(.105, 12, 8), cream, head, 0, -.085, -.237);
        muzzle.scale.set(1, .72, .5);
        mesh(new THREE.SphereGeometry(.036, 8, 6), dark, head, 0, -.055, -.299);
      } else {
        mesh(new THREE.SphereGeometry(.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), kit, head, 0, .035, .025);
        const brim = mesh(new THREE.SphereGeometry(.2, 12, 6), kit, head, 0, .045, -.24);
        brim.scale.set(1.1, .12, .75);
      }
    }
    function arm(side) {
      const shoulder = pivot(rig, side * .36, 1.23, 0);
      mesh(new THREE.CapsuleGeometry(.095, .17, 4, 8), kit, shoulder, 0, -.12, 0);
      mesh(robot ? new THREE.BoxGeometry(.12, .31, .12) : new THREE.CapsuleGeometry(.065, .23, 4, 8), skin, shoulder, 0, -.37, 0);
      const hand = mesh(new THREE.SphereGeometry(.085, 10, 8), skin, shoulder, 0, -.57, 0, side > 0 ? 'right-hand' : 'left-hand');
      return [shoulder, hand];
    }
    [leftArm, leftHand] = arm(-1);
    [rightArm, rightHand] = arm(1);
    function leg(side) {
      const hip = pivot(rig, side * .16, .63, 0);
      mesh(robot ? new THREE.BoxGeometry(.14, .25, .14) : new THREE.CapsuleGeometry(.083, .13, 4, 8), skin, hip, 0, -.13, 0);
      const knee = pivot(hip, 0, -.265, 0);
      knee.name = side < 0 ? 'left-knee' : 'right-knee';
      mesh(robot ? new THREE.BoxGeometry(.13, .22, .13) : new THREE.CapsuleGeometry(.077, .1, 4, 8), skin, knee, 0, -.115, 0);
      mesh(new THREE.CylinderGeometry(.09, .09, .14, 8), cream, knee, 0, -.19, 0);
      const shoe = mesh(new THREE.SphereGeometry(.12, 12, 8), cream, knee, 0, -.265, -.055);
      shoe.scale.set(1, .65, 1.6);
      return [hip, knee];
    }
    [leftLeg, leftKnee] = leg(-1); [rightLeg, rightKnee] = leg(1);
    if (sport === 'tennis') {
      const racket = pivot(rightHand, 0, -.02, -.02);
      racket.name = 'avatar-racket';
      mesh(new THREE.CylinderGeometry(.028, .035, .31, 8), dark, racket, 0, -.16, 0);
      const hoop = mesh(new THREE.TorusGeometry(.22, .022, 6, 32), cream, racket, 0, -.49, 0, 'racket-head');
      hoop.scale.y = 1.22;
      const stringMaterial = material('#d6dcc3', {transparent: true, opacity: .75});
      for (let offset = -.15; offset <= .151; offset += .05) {
        const chord = Math.sqrt(.21 ** 2 - offset ** 2);
        mesh(new THREE.BoxGeometry(chord * 2, .005, .005), stringMaterial, racket, 0, -.49 + offset * 1.22, 0);
        mesh(new THREE.BoxGeometry(.005, chord * 2 * 1.22, .005), stringMaterial, racket, offset, -.49, 0);
      }
    }
    update({});
  }
  function update({time = 0, move = 0, action = 0} = {}) {
    if (disposed || !rig) return;
    const movement = clamp(move, -1, 1);
    const gait = Math.sin((Number.isFinite(time) ? time : 0) * 13) * Math.abs(movement);
    const progress = clamp(action, 0, 1);
    const swing = Math.sin(progress * Math.PI);
    const kneeBend = sport === 'basketball' ? Math.sin(Math.PI * Math.min(1, progress / .45)) * .55 : 0;
    rig.position.y = Math.abs(gait) * .035 - .53 * (1 - Math.cos(kneeBend));
    rig.rotation.y = sport === 'tennis' ? -.55 * swing : .06 * swing;
    head.rotation.y = -rig.rotation.y * .55;
    head.rotation.x = sport === 'basketball' ? -.12 * swing : 0;
    leftLeg.rotation.x = gait * .38 + kneeBend;
    rightLeg.rotation.x = -gait * .38 + kneeBend;
    leftKnee.rotation.x = rightKnee.rotation.x = -2 * kneeBend;
    leftLeg.rotation.z = .08; rightLeg.rotation.z = -.08;
    if (sport === 'basketball') {
      leftArm.rotation.set(1.02 + 1.48 * swing, 0, -.28 + .1 * swing);
      rightArm.rotation.set(1.02 + 1.48 * swing, 0, .28 - .1 * swing);
    } else {
      leftArm.rotation.set(.34 - gait * .2, 0, -.15 - .3 * swing);
      rightArm.rotation.set(.83 + .6 * swing, -.9 * swing, .26 + 1.5 * swing);
    }
    group.updateMatrixWorld(true);
  }
  function getGripPosition(target = new THREE.Vector3()) {
    group.updateMatrixWorld(true);
    rightHand.getWorldPosition(target);
    if (sport === 'basketball') target.add(leftHand.getWorldPosition(new THREE.Vector3())).multiplyScalar(.5);
    return target;
  }
  build(character);
  return {
    group, update, getGripPosition,
    setCharacter(id) { if (!disposed) build(id); },
    dispose() {
      if (disposed) return;
      disposed = true; clear(); group.removeFromParent();
    },
  };
}
