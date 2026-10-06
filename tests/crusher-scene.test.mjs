import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCrusherWorld} from '../src/crusher-scene.js';
import {createCrusherState, feedCrusher, stepCrusher, beginCrusherPressure, releaseCrusherPressure} from '../src/crusher-state.js';

function pressing(target = 'car', pressure = .69) {
  const armed = stepCrusher(feedCrusher(createCrusherState({target})), 1.3);
  return releaseCrusherPressure(stepCrusher(beginCrusherPressure(armed), pressure / .38));
}

// Measure rendered vertices, rather than local scales or transformed AABBs:
// cylinders and tilted toy parts must be checked in the machine's world axes.
function vertexBounds(object) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const vertex = new THREE.Vector3();
  object.traverse(part => {
    const positions = part.geometry?.attributes.position;
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
      minX = Math.min(minX, vertex.x); maxX = Math.max(maxX, vertex.x);
      minY = Math.min(minY, vertex.y); maxY = Math.max(maxY, vertex.y);
    }
  });
  return {minX, minY, maxX, maxY, height: maxY - minY};
}

test('recognizable models contain real wheels, cushions and screen; the hydraulic ram is physical geometry', () => {
  const world = createCrusherWorld();
  for (const target of ['car', 'sofa', 'tv']) {
    world.render(createCrusherState({target}));
    const model = world.scene.getObjectByName(`crusher-${target}`);
    assert.ok(model.visible);
    assert.ok(model.children.filter(item => item.isMesh).length >= 12);
    assert.ok(model.children.every(item => item.geometry?.attributes.position.count >= 3));
  }
  assert.equal(world.scene.getObjectByName('car-wheel-front-left').geometry.type, 'LatheGeometry');
  assert.ok(world.scene.getObjectByName('sofa-cushion-middle'));
  assert.ok(world.scene.getObjectByName('tv-screen'));
  assert.ok(world.scene.getObjectByName('crusher-ram').isMesh);
  assert.ok(world.scene.getObjectByName('crusher-plate').children.length > 3);
  world.dispose();
});

test('workshop uses deterministic textured PBR surfaces, window reflections and physical roller/column details', () => {
  const world = createCrusherWorld(), second = createCrusherWorld();
  const floor = world.scene.getObjectByName('workshop-floor');
  assert.ok(floor?.material.map?.isDataTexture, 'concrete must have an actual surface texture');
  assert.ok(floor.material.bumpMap && floor.material.roughnessMap);
  assert.ok(new Set(floor.material.map.image.data).size > 30);
  assert.deepEqual(floor.material.map.image.data, second.scene.getObjectByName('workshop-floor').material.map.image.data);
  assert.ok(world.scene.environment?.isDataTexture, 'metal and glass need a workshop reflection environment');
  assert.ok(world.scene.getObjectByName('guide-column').material.metalness > .8);
  assert.ok(world.scene.getObjectByName('platen-stiffener'));
  assert.ok(world.scene.getObjectByName('hydraulic-fitting'));
  world.scene.updateMatrixWorld(true);
  assert.ok(vertexBounds(world.scene.getObjectByName('roller-0')).maxY >= .90);
  for (const light of world.scene.children.filter(object => object.isDirectionalLight && object.castShadow)) {
    assert.ok(light.shadow.radius >= 2);
  }
  world.dispose(); second.dispose();
});

test('fallback sedan has vehicle proportions, open wheel arches, tires, rims, brake discs and sloped glass', () => {
  const world = createCrusherWorld();
  const car = world.scene.getObjectByName('crusher-car');
  world.scene.updateMatrixWorld(true);
  const bounds = vertexBounds(car);
  assert.ok((bounds.maxX - bounds.minX) / bounds.height > 2.7, 'car silhouette must be a sedan, not a tall block');
  const flank = car.getObjectByName('car-body-left');
  assert.ok(flank?.geometry.type === 'ExtrudeGeometry');
  const ray = new THREE.Raycaster(new THREE.Vector3(.82, .24, 2), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(flank).length, 0, 'wheel arch must be physically open');
  ray.ray.origin.set(0, .4, 2);
  assert.ok(ray.intersectObject(flank).length > 0, 'door skin should still be solid between wheel arches');
  assert.ok(car.getObjectByName('car-brake-disc'));
  assert.ok(car.getObjectByName('car-alloy-rim'));
  assert.ok(car.getObjectByName('car-wheel-front-left').material.bumpMap);
  const glass = car.getObjectByName('car-windshield');
  assert.ok(glass.material.roughness < .2);
  assert.ok(glass.geometry.attributes.position.count > 12);
  assert.ok(car.getObjectByName('car-grille'));
  world.dispose();
});

test('conveyor feeds the same model, pressure deforms it, original parts fracture and travel to the output', () => {
  const world = createCrusherWorld();
  let state = createCrusherState();
  world.render(state);
  const car = world.scene.getObjectByName('crusher-car');
  const part = car.getObjectByName('car-roof');
  const geometry = part.geometry;
  const initialX = car.position.x;
  const initialHeight = vertexBounds(part).height;
  const plate = world.scene.getObjectByName('crusher-plate');
  const initialPlate = plate.position.y;
  state = stepCrusher(feedCrusher(state), .65);
  world.render(state);
  assert.ok(car.position.x > initialX && car.position.x < 0);
  state = stepCrusher(pressing(), .65);
  world.render(state);
  assert.ok(vertexBounds(part).height < initialHeight * .6, 'the visible car must squash before breaking');
  assert.ok(plate.position.y < initialPlate - .6);
  const compressed = part.position.clone();
  world.render(stepCrusher(pressing(), 1.45));
  assert.ok(part.position.distanceTo(compressed) > .1, 'actual roof separates into the debris');
  assert.equal(part.geometry, geometry);
  assert.ok(part.visible && car.visible);
  assert.ok(world.scene.getObjectByName('crusher-particles').count > 0);
  world.render(stepCrusher(pressing(), 3.2));
  assert.ok(car.position.x > 2);
  assert.ok(car.children.every(item => item.visible), 'scrap remains visible in the result');
  world.dispose();
});

test('retry preserves dents; identical paused poses do not move motors, fragments or pressure', () => {
  const world = createCrusherWorld();
  world.render(createCrusherState());
  const roof = world.scene.getObjectByName('car-roof');
  const originalHeight = vertexBounds(roof).height;
  const missed = stepCrusher(pressing('car', .1), 1.1);
  world.render(missed);
  assert.ok(vertexBounds(roof).height < originalHeight);
  const snapshot = [];
  world.scene.traverse(part => snapshot.push(part.matrixWorld.toArray()));
  world.render({...missed, paused: true});
  let index = 0;
  world.scene.traverse(part => assert.deepEqual(part.matrixWorld.toArray(), snapshot[index++]));
  world.dispose();
});

test('rotated wheels flatten vertically in world space and remain between the belt and press shoe', () => {
  const world = createCrusherWorld({reducedMotion: true});
  world.render(createCrusherState());
  const wheel = world.scene.getObjectByName('car-wheel-front-left');
  const original = vertexBounds(wheel);
  world.render(stepCrusher(pressing(), .65));
  const compressed = vertexBounds(wheel);
  assert.ok(compressed.height < original.height * .30,
    `wheel stayed round in world Y: ${original.height} → ${compressed.height}`);
  assert.ok(compressed.minY >= .90 - 1e-6, `wheel penetrates the belt: ${compressed.minY}`);
  assert.ok(compressed.maxY <= vertexBounds(world.scene.getObjectByName('press-shoe')).minY,
    'wheel intersects the lowered press shoe');
  world.dispose();
});

test('all actual object vertices clear the belt, raised output tray and press throughout crushing and fracture', () => {
  const world = createCrusherWorld();
  for (const [target, pressure] of [['car', .69], ['sofa', .44], ['tv', .57]]) {
    const shot = pressing(target, pressure);
    for (let frame = 0; frame <= 64; frame++) {
      const state = stepCrusher(shot, frame / 20);
      world.render(state);
      const bounds = vertexBounds(world.scene.getObjectByName(`crusher-${target}`));
      assert.ok(bounds.minY >= .90 - 1e-6,
        `${target} at ${frame / 20}s penetrates belt: ${bounds.minY}`);
      if (['pressing', 'breaking'].includes(state.phase)) {
        const underside = vertexBounds(world.scene.getObjectByName('press-shoe')).minY;
        assert.ok(bounds.maxY <= underside + 1e-6,
          `${target} at ${frame / 20}s intersects head: ${bounds.maxY} > ${underside}`);
      }
      if (bounds.maxX >= 2.95) {
        assert.ok(bounds.minY >= .96 - 1e-6,
          `${target} at ${frame / 20}s penetrates output tray: ${bounds.minY}`);
      }
    }
  }
  world.dispose();
});

test('orthographic camera keeps the machine and in/out trays in frame at desktop and 320px', () => {
  const world = createCrusherWorld();
  for (const [width, height] of [[1100, 470], [560, 390], [288, 300]]) {
    world.resize(width, height);
    for (const x of [-4.7, 4.7]) for (const y of [0, 4.0]) for (const z of [-1.55, 1.55]) {
      const point = new THREE.Vector3(x, y, z).project(world.camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, `clipped at ${width}: ${point.toArray()}`);
    }
    for (const target of ['car', 'sofa', 'tv']) {
      const shot = pressing(target, target === 'car' ? .69 : target === 'sofa' ? .44 : .57);
      for (const pose of [createCrusherState({target}), stepCrusher(shot, .65), stepCrusher(shot, 3.2)]) {
        world.render(pose);
        world.scene.getObjectByName(`crusher-${target}`).traverse(part => {
          const position = part.geometry?.attributes.position;
          if (!position) return;
          const point = new THREE.Vector3();
          for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(part.matrixWorld).project(world.camera);
            assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, `${target} clips at ${width}`);
          }
        });
      }
    }
    const tray = world.scene.getObjectByName('output-tray');
    const position = tray.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(tray.matrixWorld).project(world.camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, `new tray clips at ${width}`);
    }
  }
  world.dispose();
});

test('objects and effect resources stay bounded across replay, and disposal releases shared resources once', () => {
  const world = createCrusherWorld();
  let meshes = 0;
  world.scene.traverse(part => {if (part.isMesh) meshes++;});
  for (let index = 0; index < 50; index++) world.render(stepCrusher(pressing(['car', 'sofa', 'tv'][index % 3]), 1.45));
  let after = 0;
  world.scene.traverse(part => {if (part.isMesh) after++;});
  assert.equal(after, meshes);
  assert.ok(world.scene.getObjectByName('crusher-particles').count <= 44);
  const counts = new Map();
  const collect = resource => {
    if (!resource || counts.has(resource)) return;
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  };
  world.scene.traverse(object => {
    collect(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) {
      collect(material);
      Object.values(material).filter(value => value?.isTexture).forEach(collect);
    }
  });
  collect(world.scene.environment);
  world.dispose();
  world.dispose();
  for (const count of counts.values()) assert.equal(count, 1);
  assert.equal(world.scene.children.length, 0);
  assert.equal(world.render(createCrusherState()), false);
});
