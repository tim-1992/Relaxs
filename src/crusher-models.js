import * as THREE from 'three';

/** A compact sedan built from panels and mechanical parts, not stacked cubes.
 * Keep each mesh flat under the model so the same world-Y compression and
 * fracture transform applies to body panels, glass, brake discs and tires.
 */
export function createCrusherSedan(parent, {own, mesh, box, paint, cylinder}) {
  const car = new THREE.Group();
  car.name = 'crusher-car'; parent.add(car);
  function panel(name, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    const pivot = center.applyEuler(new THREE.Euler(...rotation)).add(new THREE.Vector3(...position));
    return mesh(car, name, own(geometry), material, pivot.toArray(), [1, 1, 1], rotation);
  }
  function outline(points, depth = .018) {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    points.slice(1).forEach(point => shape.lineTo(...point));
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelThickness: .004,
      bevelSize: .004, bevelSegments: 1, steps: 1, curveSegments: 12});
  }
  function rod(name, a, b, radius, material) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const direction = end.clone().sub(start);
    const object = mesh(car, name, cylinder, material, start.add(end).multiplyScalar(.5).toArray(),
      [radius * 2, direction.length(), radius * 2]);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return object;
  }
  // Crown each cross section slightly to avoid planar toy-like hood/roof/glass.
  function shell(name, sections, material, crown = .025) {
    const vertices = [], uvs = [], indices = [], across = 10;
    for (let row = 0; row < sections.length; row++) {
      const [x, y, halfWidth] = sections[row];
      for (let i = 0; i <= across; i++) {
        const u = i / across, z = (u * 2 - 1) * halfWidth;
        vertices.push(x, y + (1 - (u * 2 - 1) ** 2) * crown, z);
        uvs.push(u, row / (sections.length - 1));
        if (row < sections.length - 1 && i < across) {
          const a = row * (across + 1) + i, b = a + across + 1;
          indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return panel(name, geometry, material);
  }

  box(car, 'car-chassis', paint.dark, [0, .27, 0], [2.30, .07, .76]);
  box(car, 'car-transmission', paint.bolt, [.45, .255, 0], [.29, .11, .25]);
  box(car, 'car-engine', paint.bolt, [.85, .39, 0], [.36, .24, .50]);
  for (const z of [-.44, .44]) {
    const side = new THREE.Shape();
    side.moveTo(-1.28, .24); side.lineTo(-1.08, .24);
    side.absarc(-.82, .24, .26, Math.PI, 0, true);
    side.lineTo(.56, .24); side.absarc(.82, .24, .26, Math.PI, 0, true);
    side.lineTo(1.28, .24); side.lineTo(1.28, .43);
    side.quadraticCurveTo(1.20, .54, 1.07, .55);
    side.lineTo(.59, .585); side.lineTo(-.67, .585); side.lineTo(-1.18, .52);
    side.lineTo(-1.28, .43); side.closePath();
    panel(`car-body-${z > 0 ? 'left' : 'right'}`, new THREE.ExtrudeGeometry(side, {
      depth: .04, bevelEnabled: true, bevelThickness: .008, bevelSize: .006, bevelSegments: 2,
      steps: 1, curveSegments: 20,
    }), paint.coral, [0, 0, z]);
    // Window silhouettes and slim body-color A/C pillars.
    panel('car-side-window-rear', outline([[-.72, .602], [-.49, .80], [-.18, .802], [-.18, .603]]),
      paint.glass, [0, 0, z > 0 ? .393 : -.411]);
    panel('car-side-window-front', outline([[-.13, .603], [-.13, .802], [.19, .802], [.53, .602]]),
      paint.glass, [0, 0, z > 0 ? .393 : -.411]);
    rod('car-a-pillar', [.21, .82, z * .85], [.60, .577, z], .022, paint.coral);
    rod('car-c-pillar', [-.51, .82, z * .85], [-.80, .577, z], .025, paint.coral);
    rod('car-window-pillar', [-.157, .60, z * .93], [-.157, .811, z * .85], .018, paint.black);
    rod('car-window-trim', [-.76, .595, z * 1.07], [.57, .595, z * 1.07], .008, paint.chrome);
    // Thin door shut lines stay flush with the skin.
    for (const x of [-.19, .5]) {
      rod('car-door-seam', [x, .57, z * 1.10], [x - .045, .30, z * 1.10], .003, paint.black);
    }
    box(car, 'car-door-handle', paint.chrome, [.02, .537, z * 1.105], [.105, .015, .013]);
    box(car, 'car-door-handle', paint.chrome, [-.47, .537, z * 1.105], [.105, .015, .013]);
    box(car, 'car-sill', paint.coralDark, [0, .27, z * 1.08], [1.02, .055, .047]);
    box(car, 'car-mirror-arm', paint.black, [.43, .61, z * 1.13], [.045, .025, .08]);
    box(car, 'car-mirror', paint.coral, [.41, .643, z * 1.23], [.13, .063, .09]);
    box(car, 'car-mirror-glass', paint.chrome, [.349, .646, z * 1.23], [.005, .041, .064]);
  }
  shell('car-hood', [[.60, .582, .44], [.94, .56, .458], [1.25, .49, .43]], paint.coral);
  shell('car-roof', [[-.53, .817, .353], [-.40, .837, .364], [.08, .838, .364], [.23, .815, .355]], paint.coral, .022);
  shell('car-windshield', [[.23, .805, .349], [.41, .695, .393], [.59, .585, .425]], paint.glass, .013);
  shell('car-rear-window', [[-.80, .579, .432], [-.65, .696, .395], [-.53, .809, .35]], paint.glass, .016);
  shell('car-trunk', [[-1.25, .485, .425], [-1.04, .537, .45], [-.80, .573, .441]], paint.coral);
  for (const z of [-.17, .17]) {
    rod('car-wiper', [.60, .603, z], [.43, .712, z + .14], .007, paint.black);
  }
  box(car, 'car-grille', paint.black, [1.27, .38, 0], [.043, .142, .48]);
  for (let i = 0; i < 5; i++) {
    box(car, 'car-grille-slat', paint.bolt, [1.296, .337 + i * .023, 0], [.008, .006, .43]);
  }
  for (const end of [-1, 1]) {
    box(car, 'car-bumper', paint.coralDark, [end * 1.263, .276, 0], [.06, .075, .91]);
    box(car, 'car-license-plate', paint.cream, [end * 1.302, .313, 0], [.007, .065, .22]);
    for (const z of [-.337, .337]) {
      box(car, end > 0 ? 'car-headlight' : 'car-taillight', end > 0 ? paint.lightLens : paint.red,
        [end * 1.272, .476, z], [.033, .077, .195]);
      for (let i = -1; i <= 1; i++) box(car, 'car-lens-flute', paint.bolt,
        [end * 1.29, .476, z + i * .046], [.008, .066, .004]);
    }
  }
  rod('car-exhaust', [-1.29, .218, -.26], [.37, .218, -.26], .023, paint.bolt);
  box(car, 'car-muffler', paint.steel, [-.95, .237, -.26], [.24, .075, .15]);
  const tireProfile = [
    [.136, -.077], [.18, -.084], [.219, -.070], [.232, -.050], [.236, -.023],
    [.236, .023], [.232, .050], [.219, .070], [.18, .084], [.136, .077], [.136, -.077],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  const tire = own(new THREE.LatheGeometry(tireProfile, 40));
  const rim = new THREE.Shape();
  rim.absarc(0, 0, .134, 0, Math.PI * 2, false);
  // Five actual openings between spokes, rather than a solid wheel hub.
  for (let spoke = 0; spoke < 5; spoke++) {
    const hole = new THREE.Path(), angle = spoke * Math.PI * 2 / 5;
    hole.moveTo(Math.cos(angle + .10) * .046, Math.sin(angle + .10) * .046);
    hole.lineTo(Math.cos(angle + .16) * .113, Math.sin(angle + .16) * .113);
    hole.absarc(0, 0, .113, angle + .16, angle + .91, false);
    hole.lineTo(Math.cos(angle + 1.01) * .046, Math.sin(angle + 1.01) * .046);
    hole.closePath(); rim.holes.push(hole);
  }
  const rimGeometry = own(new THREE.ExtrudeGeometry(rim, {
    depth: .013, bevelEnabled: true, bevelSize: .003, bevelThickness: .003, bevelSegments: 1, curveSegments: 12,
  }));
  for (const x of [-.82, .82]) {
    rod('car-axle', [x, .238, -.5], [x, .238, .5], .028, paint.dark);
    for (const z of [-.489, .489]) {
      const side = z > 0 ? 'left' : 'right', end = x > 0 ? 'front' : 'back', sign = Math.sign(z);
      mesh(car, `car-wheel-${end}-${side}`, tire, paint.rubber, [x, .238, z], [1, 1, 1], [Math.PI / 2, 0, 0]);
      mesh(car, 'car-brake-disc', cylinder, paint.steel, [x, .238, z + sign * .063],
        [.23, .014, .23], [Math.PI / 2, 0, 0]);
      box(car, 'car-brake-caliper', paint.dark, [x + .082, .255, z + sign * .072], [.036, .084, .026]);
      mesh(car, 'car-alloy-rim', rimGeometry, paint.chrome, [x, .238, z + sign * .078],
        [1, 1, 1], [0, sign < 0 ? Math.PI : 0, 0]);
      mesh(car, 'car-hub', cylinder, paint.chrome, [x, .238, z + sign * .09],
        [.066, .024, .066], [Math.PI / 2, 0, 0]);
    }
  }
  return car;
}
