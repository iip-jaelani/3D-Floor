import * as THREE from 'three';
import { cylinder, part, roundedBox, standard } from '../part.js';
import { createScreenTexture } from '../textures.js';

const DOOR_X = [-0.75, -0.25, 0.25, 0.75];

export default {
  type: 'tv-console',
  name: 'TV & Meja Konsol',
  size: [2.1, 1.55, 0.5],

  build() {
    const object = new THREE.Group();
    const cabinetMat = standard('#6b635b', { roughness: 0.5 });
    const doorMat = standard('#6b635b', { roughness: 0.45 });
    const woodMat = standard('#4a3a2e', { roughness: 0.5 });
    const brassMat = standard('#b8923a', { roughness: 0.3, metalness: 0.85 });
    const blackMat = standard('#09090b', { roughness: 0.2, metalness: 0.6 });

    [-0.95, 0.95].forEach((x) => {
      [-0.17, 0.17].forEach((z) => {
        object.add(part(cylinder(0.025, 0.017, 0.1, 10), woodMat, { position: [x, 0.05, z], cast: false }));
      });
    });

    const cabinet = part(roundedBox(2.1, 0.4, 0.48, 0.02), cabinetMat, { position: [0, 0.3, 0], receive: true });
    object.add(cabinet);
    const door = part(roundedBox(0.48, 0.34, 0.012, 0.006), doorMat, { position: [DOOR_X[0], 0.3, 0.246] });
    object.add(door);
    DOOR_X.slice(1).forEach((x) => {
      object.add(part(roundedBox(0.48, 0.34, 0.012, 0.006), doorMat, { position: [x, 0.3, 0.246], cast: false }));
    });
    DOOR_X.forEach((x) => {
      object.add(part(roundedBox(0.09, 0.014, 0.014, 0.005), brassMat, { position: [x, 0.42, 0.262], cast: false }));
    });

    object.add(part(roundedBox(2.14, 0.03, 0.5, 0.012), woodMat, { position: [0, 0.515, 0], receive: true }));

    object.add(part(roundedBox(0.45, 0.015, 0.2, 0.005), blackMat, { position: [0, 0.538, -0.05], cast: false }));
    object.add(part(cylinder(0.03, 0.04, 0.2, 12), blackMat, { position: [0, 0.64, -0.05], cast: false }));
    object.add(part(roundedBox(1.5, 0.88, 0.04, 0.012), blackMat, { position: [0, 1.08, -0.05] }));

    const screenTexture = createScreenTexture();
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.44, 0.82),
      new THREE.MeshStandardMaterial({
        map: screenTexture,
        emissive: '#ffffff',
        emissiveMap: screenTexture,
        emissiveIntensity: 0.35,
        roughness: 0.1,
      }),
    );
    screen.position.set(0, 1.08, -0.029);
    object.add(screen);

    object.add(part(roundedBox(0.9, 0.06, 0.1, 0.02), standard('#18181b', { roughness: 0.5 }), { position: [0, 0.575, 0.1] }));
    object.add(part(cylinder(0.05, 0.07, 0.2, 20), standard('#a8a29e', { roughness: 0.3 }), { position: [0.85, 0.63, 0.02] }));
    object.add(part(roundedBox(0.26, 0.05, 0.19, 0.01), standard('#e7e5e4', { roughness: 0.8 }), { position: [-0.85, 0.555, 0.05], rotation: [0, 0.2, 0] }));

    return { object, colorTargets: [cabinet, { mesh: door, lightness: 0.02 }] };
  },
};
