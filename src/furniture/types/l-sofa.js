import * as THREE from 'three';
import { cylinder, part, roundedBox, standard } from '../part.js';
import { fabricMaterial } from '../textures.js';

const BASE_COLOR = '#9c8f84';
const CENTER_SHIFT_X = -0.1125;

const LEG_POSITIONS = [
  [-0.93, -1.33],
  [-0.15, -1.33],
  [-0.93, 1.33],
  [1.17, 1.33],
  [1.17, 0.52],
  [-0.09, 0.52],
];

const PILLOWS = [
  { size: [0.13, 0.38, 0.38], position: [-0.66, 0.68, -0.78], rotation: [0.1, 0, 0.28], color: '#c9a24a' },
  { size: [0.13, 0.34, 0.34], position: [-0.68, 0.66, 0.42], rotation: [-0.12, 0, 0.22], color: '#b5654a' },
  { size: [0.38, 0.34, 0.13], position: [0.55, 0.66, 1.04], rotation: [0.25, 0.1, -0.05], color: '#6f8f8c' },
];

export default {
  type: 'l-sofa',
  name: 'Sofa L-Shape Modular',
  size: [2.3, 0.95, 2.8],

  build() {
    const object = new THREE.Group();
    const body = new THREE.Group();
    body.position.x = CENTER_SHIFT_X;
    object.add(body);

    const frameMat = fabricMaterial(BASE_COLOR);
    const seatMat = fabricMaterial(BASE_COLOR);
    const backMat = fabricMaterial(BASE_COLOR);
    const woodMat = standard('#5b3a29', { roughness: 0.5 });

    const add = (geometry, material, options) => {
      const mesh = part(geometry, material, { receive: true, ...options });
      body.add(mesh);
      return mesh;
    };

    const frame = add(roundedBox(0.95, 0.2, 2.8, 0.04), frameMat, { position: [-0.55, 0.2, 0] });
    add(roundedBox(1.3, 0.2, 0.95, 0.04), frameMat, { position: [0.55, 0.2, 0.925] });
    add(roundedBox(0.16, 0.62, 2.8, 0.05), frameMat, { position: [-0.945, 0.51, 0] });
    add(roundedBox(2.3, 0.62, 0.16, 0.05), frameMat, { position: [0.125, 0.51, 1.32] });

    add(roundedBox(0.74, 0.36, 0.2, 0.07), frameMat, { position: [-0.445, 0.48, -1.3] });
    add(roundedBox(0.2, 0.36, 0.73, 0.07), frameMat, { position: [1.15, 0.48, 0.815] });

    const seat = add(roundedBox(0.72, 0.19, 1.15, 0.06), seatMat, { position: [-0.445, 0.395, -0.625] });
    add(roundedBox(0.72, 0.19, 1.18, 0.06), seatMat, { position: [-0.445, 0.395, 0.59] });
    add(roundedBox(1.12, 0.19, 0.73, 0.06), seatMat, { position: [0.485, 0.395, 0.815] });

    const back = add(roundedBox(0.2, 0.42, 1.12, 0.07), backMat, {
      position: [-0.78, 0.71, -0.62],
      rotation: [0, 0, 0.12],
    });
    add(roundedBox(0.2, 0.42, 1.12, 0.07), backMat, { position: [-0.78, 0.71, 0.6], rotation: [0, 0, 0.12] });
    add(roundedBox(0.86, 0.42, 0.2, 0.07), backMat, { position: [-0.27, 0.71, 1.12], rotation: [0.12, 0, 0] });
    add(roundedBox(0.86, 0.42, 0.2, 0.07), backMat, { position: [0.6, 0.71, 1.12], rotation: [0.12, 0, 0] });

    LEG_POSITIONS.forEach(([x, z]) => {
      add(cylinder(0.035, 0.022, 0.1, 12), woodMat, { position: [x, 0.05, z], cast: false });
    });

    PILLOWS.forEach(({ size, position, rotation, color }) => {
      add(roundedBox(...size, 0.06), fabricMaterial(color, { roughness: 0.85 }), { position, rotation });
    });

    add(roundedBox(0.52, 0.05, 0.36, 0.02), fabricMaterial('#d9cfc1'), {
      position: [0.62, 0.515, 0.8],
      rotation: [0, 0.35, 0],
      cast: false,
    });

    return {
      object,
      colorTargets: [frame, { mesh: seat, lightness: 0.04 }, { mesh: back, lightness: 0.02 }],
    };
  },
};
