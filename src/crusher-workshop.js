import * as THREE from 'three';

/** Fixed workshop geometry. Motion is owned by crusher-scene's deterministic pose. */
export function createCrusherWorkshop(scene, {own, mesh, box, group, paint, cylinder, sphere}) {
  const workshop = group(scene, 'crusher-workshop');
  box(workshop, 'workshop-floor', paint.floor, [0, -.07, 0], [28, .12, 24]);
  box(workshop, 'workshop-wall', paint.wall, [0, 3, -5.1], [26, 6, .20]);
  box(workshop, 'wall-kickplate', paint.dark, [0, .36, -4.975], [26, .72, .04]);
  const daylight = own(new THREE.MeshBasicMaterial({color: '#cdd9dc', toneMapped: false}));
  for (const x of [-5, .8, 6.6]) {
    box(workshop, 'workshop-window-frame', paint.dark, [x, 3.50, -4.94], [4.4, 2.7, .10]);
    box(workshop, 'workshop-window', daylight, [x, 3.50, -4.875], [4.20, 2.50, .025]);
    for (let i = -2; i <= 2; i++) box(workshop, 'window-mullion', paint.dark,
      [x + i * .70, 3.50, -4.85], [.036, 2.50, .06]);
    for (const y of [3.06, 3.94]) box(workshop, 'window-mullion', paint.dark,
      [x, y, -4.85], [4.20, .036, .06]);
    box(workshop, 'window-sill', paint.bolt, [x, 2.12, -4.81], [4.55, .12, .26]);
  }
  for (const x of [-9, -4.5, 0, 4.5, 9]) box(workshop, 'concrete-joint', paint.belt,
    [x, -.004, 0], [.018, .004, 24]);
  for (const z of [-6, -2, 2, 6]) box(workshop, 'concrete-joint', paint.belt,
    [0, -.004, z], [28, .004, .018]);
  for (const z of [-1.65, 1.65]) box(workshop, 'work-area-line', paint.amber,
    [0, -.001, z], [9.5, .005, .055]);
  const oilData = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const radius = Math.hypot((x - 32) / 32, (y - 32) / 32);
    const grain = ((x * 17 + y * 31) % 23) / 23;
    oilData.set([38, 37, 29, Math.max(0, 1 - radius) ** 2 * (50 + grain * 90)], (y * 64 + x) * 4);
  }
  const oilMap = own(new THREE.DataTexture(oilData, 64, 64));
  oilMap.magFilter = THREE.LinearFilter; oilMap.needsUpdate = true;
  const oil = own(new THREE.MeshStandardMaterial({map: oilMap, transparent: true, depthWrite: false, roughness: .47}));
  const stain = mesh(workshop, 'concrete-oil-stain', own(new THREE.PlaneGeometry(3, 2)), oil,
    [-2.5, .004, .25], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  stain.castShadow = false;

  const machine = group(scene, 'crusher-machine');
  const rollerGroup = group(machine, 'crusher-rollers');
  // Exposed shafts carry the object; the frame sits below their tangent plane.
  box(machine, 'conveyor-belt', paint.dark, [0, .58, 0], [8.6, .10, 1.50]);
  for (const z of [-.90, .90]) {
    box(machine, 'conveyor-frame', paint.teal, [0, .685, z], [8.8, .28, .13]);
    box(machine, 'conveyor-frame-lip', paint.bolt, [0, .842, z], [8.8, .025, .18]);
  }
  for (const x of [-3.8, -1.35, 1.35, 3.8]) for (const z of [-.71, .71]) {
    box(machine, 'conveyor-foot', paint.dark, [x, .32, z], [.10, .64, .10]);
    box(machine, 'conveyor-footplate', paint.bolt, [x, .025, z], [.28, .04, .24]);
  }
  for (let i = 0; i < 35; i++) {
    const x = -4.15 + i * .244;
    const roller = mesh(rollerGroup, `roller-${i}`, cylinder, paint.steel,
      [x, .815, 0], [.22, 1.64, .22], [Math.PI / 2, 0, 0]);
    box(roller, 'roller-index-mark', paint.dark, [.49, 0, 0], [.02, .035, .06]);
    for (const z of [-.92, .92]) mesh(machine, 'roller-bearing', cylinder, paint.dark,
      [x, .808, z], [.083, .08, .083], [Math.PI / 2, 0, 0]);
  }
  box(machine, 'press-anvil', paint.steel, [0, .866, 0], [2.73, .124, 1.64]);
  for (const x of [-1.50, 1.50]) {
    box(machine, 'gantry-foot', paint.dark, [x, .055, -.22], [.64, .10, 2.48]);
    for (const z of [-1.04, .89]) {
      box(machine, 'gantry-column-web', paint.teal, [x, 1.83, z], [.09, 3.55, .29]);
      for (const dz of [-.17, .17]) box(machine, 'gantry-column-flange', paint.teal,
        [x, 1.83, z + dz], [.29, 3.55, .075]);
      for (const dx of [-.20, .20]) mesh(machine, 'anchor-bolt', cylinder, paint.bolt,
        [x + dx, .125, z], [.08, .07, .08]);
    }
  }
  box(machine, 'top-beam', paint.teal, [0, 3.59, -.10], [3.56, .44, 2.18]);
  for (const y of [3.335, 3.845]) box(machine, 'beam-flange', paint.dark,
    [0, y, -.10], [3.64, .07, 2.23]);
  for (const x of [-1.2, -.65, .65, 1.2]) box(machine, 'beam-stiffener', paint.teal,
    [x, 3.59, 1.015], [.04, .42, .09]);
  box(machine, 'machine-id-plate', paint.bolt, [-.5, 3.60, 1.055], [.54, .18, .012]);
  for (let i = 0; i < 5; i++) box(machine, 'machine-id-engraving', paint.dark,
    [-.68 + i * .085, 3.60, 1.064], [.035, .052, .004]);
  for (const x of [-1.35, 1.35]) for (const z of [-.89, .89]) {
    mesh(machine, 'guide-column', cylinder, paint.chrome, [x, 2.13, z], [.085, 2.37, .085]);
    for (const y of [.98, 3.27]) mesh(machine, 'guide-bushing', cylinder, paint.bolt,
      [x, y, z], [.18, .14, .18]);
  }
  mesh(machine, 'hydraulic-cylinder', cylinder, paint.dark, [0, 3.55, -.12], [.60, .89, .60]);
  for (const y of [3.14, 3.94]) mesh(machine, 'cylinder-flange', cylinder, paint.bolt,
    [0, y, -.12], [.77, .11, .77]);
  for (const x of [-.245, .245]) for (const z of [-.365, .125]) mesh(machine, 'cylinder-tie-rod', cylinder,
    paint.chrome, [x, 3.55, z], [.038, .96, .038]);
  mesh(machine, 'rod-wiper-seal', cylinder, paint.black, [0, 3.10, -.12], [.42, .08, .42]);
  const ram = mesh(machine, 'crusher-ram', cylinder, paint.chrome, [0, 2.95, -.12], [.29, .55, .29]);
  const plate = group(machine, 'crusher-plate');
  plate.position.set(0, 2.76, -.03);
  box(plate, 'press-shoe', paint.steel, [0, 0, 0], [2.62, .23, 1.65]);
  box(plate, 'press-face', paint.amber, [0, .04, .845], [2.62, .18, .045]);
  for (const z of [-.55, .55]) box(plate, 'platen-stiffener', paint.dark, [0, .20, z], [2.54, .21, .095]);
  mesh(plate, 'ram-socket', cylinder, paint.bolt, [0, .22, -.09], [.54, .22, .54]);
  for (let i = -4; i <= 4; i++) box(plate, 'press-stripe', paint.dark,
    [i * .28, .04, .872], [.13, .175, .008], [0, 0, -.32]);
  for (const x of [-1.35, 1.35]) for (const z of [-.86, .92]) {
    mesh(plate, 'moving-guide-collar', cylinder, paint.bolt, [x, .13, z], [.17, .24, .17]);
  }
  for (const offset of [0, .13]) {
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-.32, 3.48 + offset, -.12), new THREE.Vector3(-.83, 3.25, -.62 - offset),
      new THREE.Vector3(-1.85, 1.78, -1.12 - offset), new THREE.Vector3(-2.13, .69, -1.12 - offset),
    ]);
    mesh(machine, 'hydraulic-hose', own(new THREE.TubeGeometry(hose, 28, .028, 8, false)),
      paint.black, [0, 0, 0], [1, 1, 1]);
    mesh(machine, 'hydraulic-fitting', cylinder, paint.bolt, [-.33, 3.48 + offset, -.12],
      [.09, .14, .09], [0, 0, Math.PI / 2]);
  }
  box(machine, 'hydraulic-reservoir', paint.dark, [-2.37, .25, -1.13], [1.1, .47, .60]);
  box(machine, 'reservoir-lid', paint.bolt, [-2.37, .51, -1.13], [1.13, .055, .64]);
  mesh(machine, 'reservoir-cap', cylinder, paint.black, [-2.67, .56, -1.13], [.11, .07, .11]);
  mesh(machine, 'motor-body', cylinder, paint.teal, [-2.29, .73, -1.14], [.33, .62, .33], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 7; i++) mesh(machine, 'motor-fin', cylinder, paint.bolt,
    [-2.57 + i * .08, .73, -1.14], [.36, .018, .36], [0, 0, Math.PI / 2]);
  const fan = group(machine, 'crusher-motor');
  fan.position.set(-2.65, .73, -1.14);
  for (let i = 0; i < 4; i++) box(fan, 'fan-blade', paint.black,
    [0, 0, 0], [.028, .30, .035], [i * Math.PI / 4, 0, 0]);
  box(machine, 'control-post', paint.dark, [-2.03, .56, .95], [.06, 1.05, .08]);
  box(machine, 'control-box', paint.teal, [-2.03, 1.25, .95], [.45, .57, .25]);
  box(machine, 'control-face', paint.bolt, [-2.03, 1.25, 1.081], [.415, .52, .016]);
  mesh(machine, 'pressure-dial', cylinder, paint.cream, [-2.03, 1.37, 1.10], [.255, .025, .255], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const angle = -.9 + i * .30;
    box(machine, 'gauge-tick', paint.black, [-2.03 + Math.sin(angle) * .092, 1.37 + Math.cos(angle) * .092, 1.119],
      [.01, .025, .003], [0, 0, -angle]);
  }
  const needle = box(machine, 'pressure-needle', paint.red, [-2.03, 1.37, 1.124], [.009, .16, .008]);
  mesh(machine, 'power-button', sphere, paint.lamp, [-2.12, 1.11, 1.105], [.07, .07, .045]);
  mesh(machine, 'stop-button', cylinder, paint.red, [-1.93, 1.11, 1.11], [.10, .065, .10], [Math.PI / 2, 0, 0]);
  mesh(machine, 'beacon-base', cylinder, paint.black, [1.42, 3.90, -.15], [.13, .12, .13]);
  mesh(machine, 'beacon', cylinder, paint.lamp, [1.42, 4.02, -.15], [.13, .13, .13]);
  // The full-size car spreads as it crushes. The receiving table must support
  // that entire pile; its leading edge remains x=2.95 for the grounding ramp.
  box(machine, 'output-tray', paint.steel, [4.16, .92, 0], [2.42, .08, 2.02]);
  for (const z of [-1.03, 1.03]) {
    box(machine, 'tray-rail', paint.bolt, [4.16, 1.02, z], [2.42, .24, .055]);
    box(machine, 'tray-support', paint.dark, [5.12, .46, z * .75], [.09, .90, .09]);
    box(machine, 'tray-footplate', paint.bolt, [5.12, .025, z * .75], [.24, .04, .22]);
  }
  return {ram, plate, fan, needle, rollerGroup};
}
