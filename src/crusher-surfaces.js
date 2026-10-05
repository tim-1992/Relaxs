import * as THREE from 'three';

const grain = (x, y, salt = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 71.3) * 43758.5453;
  return n - Math.floor(n);
};

/** Small deterministic PBR maps, generated without canvas, assets or requests.
 * Every texture/material belongs to the world's resource pool.
 */
export function createCrusherSurfaces(own) {
  function surface(kind, repeats = 1) {
    const side = 128, color = new Uint8Array(side * side * 4), relief = color.slice();
    for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
      const fine = grain(x, y), patch = grain(Math.floor(x / 9), Math.floor(y / 9), 2);
      let value = 205, height = 125, rough = 205;
      if (kind === 'concrete') {
        const pore = fine > .965 ? 60 : 0;
        value = 184 + fine * 44 + Math.sin(x * .09) * Math.cos(y * .08) * 13 - pore;
        height = value - patch * 15; rough = 210 + fine * 30;
      } else if (kind === 'steel') {
        value = 180 + grain(0, y) * 40 + fine * 12;
        height = 95 + grain(0, y) * 60; rough = 100 + fine * 35;
      } else if (kind === 'paint') {
        const chip = fine > .991 && patch > .6;
        value = chip ? 80 : 224 + fine * 18;
        height = chip ? 40 : 115 + fine * 20; rough = chip ? 205 : 130 + fine * 30;
      } else if (kind === 'rubber') {
        const groove = (y + Math.floor(Math.abs(x - 64) * .55)) % 24 < 4 || Math.abs(x - 64) < 2;
        value = groove ? 90 : 180 + fine * 20; height = groove ? 35 : 185 + fine * 18;
        rough = 225;
      } else if (kind === 'fabric') {
        const weave = ((x % 4 < 2) !== (y % 4 < 2)) ? 24 : 0;
        value = 188 + weave + fine * 14; height = 80 + weave * 3 + fine * 10; rough = 242;
      } else if (kind === 'wood') {
        const ring = Math.sin(x * .23 + Math.sin(y * .035) * 3);
        value = 180 + ring * 26 + fine * 18; height = 110 + ring * 12; rough = 180;
      }
      const i = (y * side + x) * 4;
      color.set([value, value, value, 255], i);
      // Bump uses red; roughness uses green. Sharing one packed texture saves memory.
      relief.set([height, rough, 0, 255], i);
    }
    const texture = data => {
      const map = own(new THREE.DataTexture(data, side, side));
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(repeats, repeats);
      map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
      map.generateMipmaps = true; map.needsUpdate = true;
      return map;
    };
    const map = texture(color), detail = texture(relief);
    map.colorSpace = THREE.SRGBColorSpace;
    return {map, bumpMap: detail, roughnessMap: detail};
  }
  const concrete = surface('concrete', 7), steel = surface('steel', 2);
  const coated = surface('paint', 2), fabric = surface('fabric', 3);
  const rubber = surface('rubber', 2), wood = surface('wood', 2);
  const material = (color, options = {}) => own(new THREE.MeshStandardMaterial({
    color, roughness: .65, metalness: 0, ...options,
  }));
  const paint = {
    floor: material('#92948b', {...concrete, bumpScale: .035, roughness: 1}),
    wall: material('#aaa99d', {...concrete, bumpScale: .012, roughness: 1}),
    teal: material('#49695f', {...coated, metalness: .55, roughness: .83, bumpScale: .005}),
    dark: material('#293635', {...coated, metalness: .65, bumpScale: .003}),
    black: material('#171b1b', {roughness: .82}),
    steel: material('#aeb6b8', {...steel, metalness: .91, roughness: .65, bumpScale: .001}),
    chrome: material('#bdc6cc', {metalness: .98, roughness: .16}),
    cream: material('#c4c0ac', {metalness: .12}),
    amber: material('#d4a02c', {...coated, metalness: .38, bumpScale: .003}),
    rubber: material('#282b2c', {...rubber, bumpScale: .01, roughness: .96}),
    belt: material('#414441', {...steel, metalness: .78, roughness: .9}),
    bolt: material('#858f90', {...steel, metalness: .86, roughness: .7}),
    coral: own(new THREE.MeshPhysicalMaterial({color: '#435e68', metalness: .68, roughness: .3,
      clearcoat: .85, clearcoatRoughness: .24, envMapIntensity: 1.3})),
    coralDark: material('#273d44', {metalness: .67, roughness: .35}),
    glass: own(new THREE.MeshPhysicalMaterial({color: '#17262c', metalness: .18, roughness: .095,
      clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: 1.6, side: THREE.DoubleSide})),
    mint: material('#756950', {...fabric, bumpScale: .01, roughness: 1}),
    mintDark: material('#625b48', {...fabric, bumpScale: .008, roughness: 1}),
    wood: material('#6c4b30', {...wood, bumpScale: .005}),
    violet: material('#4c4940', {roughness: .7}),
    violetDark: material('#282b29', {roughness: .84}),
    screen: own(new THREE.MeshPhysicalMaterial({color: '#142220', roughness: .16, metalness: .15,
      clearcoat: 1, clearcoatRoughness: .1})),
    lamp: material('#bea036', {emissive: '#f4a527', emissiveIntensity: .5, roughness: .22}),
    red: material('#681e16', {roughness: .32}),
    lightLens: own(new THREE.MeshPhysicalMaterial({color: '#d8d8cb', roughness: .22, metalness: .3, clearcoat: .8})),
  };

  // A neutral workshop dome with broad window panels provides the highlights
  // that distinguish polished piston rods, paint, rubber and glass.
  const width = 256, height = 128, data = new Uint16Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / width, v = y / height;
    const upper = v > .5;
    const window = v > .53 && v < .82 && ((u > .13 && u < .27) || (u > .63 && u < .74));
    const mullion = (Math.floor(u * 120) % 7 === 0) || (Math.floor(v * 100) % 11 === 0);
    const value = window ? (mullion ? 1.1 : 4.5) : upper ? .46 : .15;
    const i = (y * width + x) * 4;
    data.set([value * .94, value, value * (upper ? 1.08 : .88), 1].map(THREE.DataUtils.toHalfFloat), i);
  }
  const environment = own(new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.HalfFloatType));
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.minFilter = environment.magFilter = THREE.LinearFilter;
  environment.needsUpdate = true;
  return {paint, environment};
}
