import * as THREE from 'three';
import { cylinder, part, roundedBox, sphere, standard } from '../part.js';

const motorcycle = {
  type: 'motorcycle',
  name: 'Sepeda Motor',
  size: [0.7, 1.1, 1.9],
  catalog: { label: 'Motor', icon: 'fa-solid fa-motorcycle', iconClass: 'text-red-300' },

  build() {
    const object = new THREE.Group();
    const paint = standard('#b91c1c', { roughness: 0.3, metalness: 0.5 });
    const black = standard('#18181b', { roughness: 0.6 });
    const chrome = standard('#c7c9cc', { roughness: 0.2, metalness: 0.9 });
    const seatMat = standard('#111113', { roughness: 0.8 });

    const wheel = (z) => {
      const tire = new THREE.TorusGeometry(0.29, 0.07, 12, 28);
      tire.rotateY(Math.PI / 2);
      object.add(part(tire, black, { position: [0, 0.36, z] }));
      object.add(part(cylinder(0.04, 0.04, 0.12, 12), chrome, { position: [0, 0.36, z], rotation: [0, 0, Math.PI / 2], cast: false }));
      object.add(part(cylinder(0.2, 0.2, 0.02, 20), chrome, { position: [0.04, 0.36, z], rotation: [0, 0, Math.PI / 2], cast: false }));
    };
    wheel(0.68);
    wheel(-0.7);

    object.add(part(roundedBox(0.14, 0.03, 0.5, 0.012), paint, { position: [0, 0.74, 0.7], rotation: [0.15, 0, 0], cast: false }));
    object.add(part(roundedBox(0.16, 0.03, 0.45, 0.012), paint, { position: [0, 0.74, -0.78], rotation: [-0.1, 0, 0], cast: false }));

    object.add(part(roundedBox(0.2, 0.3, 0.5, 0.05), chrome, { position: [0, 0.4, 0], receive: true }));
    object.add(part(roundedBox(0.3, 0.24, 0.5, 0.04), black, { position: [0, 0.48, -0.08] }));

    const tank = part(roundedBox(0.28, 0.24, 0.55, 0.09), paint, { position: [0, 0.82, 0.14] });
    object.add(tank);
    object.add(part(roundedBox(0.28, 0.2, 0.5, 0.07), paint, { position: [0, 0.6, -0.48], rotation: [-0.15, 0, 0] }));

    object.add(part(roundedBox(0.3, 0.1, 0.62, 0.05), seatMat, { position: [0, 0.86, -0.38], rotation: [-0.04, 0, 0] }));

    object.add(part(cylinder(0.025, 0.025, 0.74, 8), chrome, { position: [0, 0.68, 0.58], rotation: [0.3, 0, 0], cast: false }));
    object.add(part(cylinder(0.014, 0.014, 0.7, 8), black, { position: [0, 1.04, 0.5], rotation: [0, 0, Math.PI / 2] }));
    object.add(part(sphere(0.07, 14, 10), chrome, { position: [0, 0.98, 0.62], cast: false }));
    [-1, 1].forEach((side) => {
      object.add(part(cylinder(0.008, 0.008, 0.2, 6), black, { position: [side * 0.3, 1.14, 0.48], rotation: [0, 0, side * 0.35], cast: false }));
    });

    object.add(part(cylinder(0.04, 0.05, 0.6, 12), chrome, { position: [0.14, 0.3, -0.6], rotation: [Math.PI / 2 - 0.08, 0, 0] }));

    return { object, colorTargets: [tank] };
  },
};

export default [motorcycle];
