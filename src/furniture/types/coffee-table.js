import * as THREE from 'three';
import { cylinder, part, roundedBox, sphere, standard } from '../part.js';

const LEG_OFFSETS = [
  [-0.54, -0.28],
  [0.54, -0.28],
  [-0.54, 0.28],
  [0.54, 0.28],
];

const TOP_SURFACE_Y = 0.4425;

export default {
  type: 'coffee-table',
  name: 'Meja Kopi Minimalis',
  size: [1.2, 0.62, 0.7],
  catalog: { label: 'Meja Kopi', icon: 'fa-solid fa-table', iconClass: 'text-sky-300' },

  build() {
    const object = new THREE.Group();
    const topMat = standard('#57534e', { roughness: 0.3, metalness: 0.2 });
    const woodMat = standard('#6b4f3a', { roughness: 0.55 });
    const brassMat = standard('#b8923a', { roughness: 0.3, metalness: 0.85 });

    const top = part(roundedBox(1.2, 0.045, 0.7, 0.02), topMat, { position: [0, 0.42, 0], receive: true });
    object.add(top);
    object.add(part(roundedBox(1.1, 0.03, 0.6, 0.01), woodMat, { position: [0, 0.14, 0], receive: true }));
    LEG_OFFSETS.forEach(([x, z]) => {
      object.add(part(cylinder(0.016, 0.011, 0.4, 12), brassMat, { position: [x, 0.2, z] }));
    });

    object.add(
      part(roundedBox(0.28, 0.035, 0.2, 0.008), standard('#e7e5e4', { roughness: 0.8 }), {
        position: [-0.28, TOP_SURFACE_Y + 0.0175, 0.08],
        rotation: [0, 0.15, 0],
      }),
    );
    object.add(
      part(roundedBox(0.23, 0.03, 0.17, 0.008), standard('#475569', { roughness: 0.8 }), {
        position: [-0.28, TOP_SURFACE_Y + 0.05, 0.08],
        rotation: [0, -0.2, 0],
      }),
    );

    const vaseMat = standard('#d6d3d1', { roughness: 0.25 });
    const vaseX = 0.28;
    const vaseZ = -0.08;
    object.add(part(cylinder(0.035, 0.06, 0.18, 20), vaseMat, { position: [vaseX, TOP_SURFACE_Y + 0.09, vaseZ] }));
    const leafMat = standard('#4d7c4a', { roughness: 0.6 });
    [-0.12, 0, 0.14].forEach((tilt, i) => {
      const stem = part(cylinder(0.004, 0.004, 0.3, 6), leafMat, {
        position: [vaseX + tilt * 0.9, TOP_SURFACE_Y + 0.31, vaseZ],
        rotation: [0, 0, -tilt * 1.1],
        cast: false,
      });
      object.add(stem);
      const leaf = part(sphere(0.035, 10, 8), leafMat, {
        position: [vaseX + tilt * 1.9, TOP_SURFACE_Y + 0.44 + i * 0.01, vaseZ],
        cast: false,
      });
      leaf.scale.set(1, 0.6, 1);
      object.add(leaf);
    });

    return { object, colorTargets: [top] };
  },
};
