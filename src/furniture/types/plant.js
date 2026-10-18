import * as THREE from 'three';
import { cylinder, part, sphere, standard } from '../part.js';

const LEAF_COUNT = 34;
const GOLDEN_ANGLE = 2.399963;

export default {
  type: 'plant',
  name: 'Tanaman Indoor Hias',
  size: [0.7, 1.55, 0.7],
  catalog: { label: 'Tanaman', icon: 'fa-solid fa-seedling', iconClass: 'text-emerald-400' },

  build() {
    const object = new THREE.Group();
    const potMat = standard('#78716c', { roughness: 0.7 });
    const soilMat = standard('#2b1d14', { roughness: 1 });
    const stemMat = standard('#3f6b3a', { roughness: 0.7 });
    const leafMats = [standard('#2e6f40', { roughness: 0.55 }), standard('#3d8a4f', { roughness: 0.55 })];

    const pot = part(cylinder(0.24, 0.18, 0.4, 28), potMat, { position: [0, 0.2, 0] });
    object.add(pot);
    object.add(part(cylinder(0.26, 0.24, 0.05, 28), potMat, { position: [0, 0.405, 0] }));
    object.add(part(cylinder(0.225, 0.225, 0.02, 24), soilMat, { position: [0, 0.4, 0], cast: false }));

    object.add(part(cylinder(0.018, 0.026, 1.0, 8), stemMat, { position: [0, 0.9, 0], cast: false }));

    const leafGeometry = sphere(1, 10, 8);
    for (let i = 0; i < LEAF_COUNT; i++) {
      const t = i / (LEAF_COUNT - 1);
      const angle = i * GOLDEN_ANGLE;
      const radius = 0.1 + 0.2 * Math.sin(Math.min(t * 1.15, 1) * Math.PI) ** 0.8;
      const leaf = part(leafGeometry, leafMats[i % 2], {
        position: [Math.cos(angle) * radius, 0.55 + t * 0.95, Math.sin(angle) * radius],
      });
      leaf.scale.set(0.17 - t * 0.05, 0.022, 0.07 - t * 0.02);
      leaf.rotation.set(0, -angle, 0.55 - t * 0.5, 'YZX');
      object.add(leaf);
    }

    return { object, colorTargets: [pot] };
  },
};
