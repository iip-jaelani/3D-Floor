import * as THREE from 'three';
import { cylinder, part, roundedBox, sphere, standard } from '../part.js';
import { fabricMaterial } from '../textures.js';

const WOOD = '#6b4f3a';
const STONE = '#d4d0c8';

function makeCounter({ type, name, label, variant, icon }) {
  return {
    type,
    name,
    size: [1.2, 0.95, 0.6],
    catalog: { label, icon, iconClass: 'text-orange-300' },

    build() {
      const object = new THREE.Group();
      const cabinetMat = standard('#e8e4dc', { roughness: 0.55 });
      const topMat = standard(STONE, { roughness: 0.35 });
      const dark = standard('#27272a', { roughness: 0.4, metalness: 0.5 });
      const steel = standard('#c7c9cc', { roughness: 0.25, metalness: 0.9 });

      const body = part(roundedBox(1.2, 0.78, 0.58, 0.015), cabinetMat, { position: [0, 0.43, 0], receive: true });
      object.add(body);
      object.add(part(roundedBox(1.14, 0.08, 0.5, 0.01), dark, { position: [0, 0.04, -0.01], cast: false }));
      object.add(part(roundedBox(1.22, 0.04, 0.62, 0.01), topMat, { position: [0, 0.89, 0.01], receive: true }));

      [-1, 1].forEach((side) => {
        object.add(part(roundedBox(0.57, 0.68, 0.02, 0.008), standard('#f2efe8', { roughness: 0.5 }), { position: [side * 0.295, 0.45, 0.295], cast: false }));
        object.add(part(cylinder(0.01, 0.01, 0.12, 8), steel, { position: [side * 0.08, 0.72, 0.325], cast: false }));
      });

      if (variant === 'sink') {
        object.add(part(roundedBox(0.55, 0.012, 0.38, 0.01), steel, { position: [-0.15, 0.915, 0.02], cast: false }));
        object.add(part(cylinder(0.012, 0.012, 0.3, 8), steel, { position: [-0.15, 1.05, -0.2], cast: false }));
        object.add(part(cylinder(0.01, 0.01, 0.16, 8), steel, { position: [-0.15, 1.19, -0.12], rotation: [Math.PI / 2, 0, 0], cast: false }));
      }

      if (variant === 'stove') {
        [-0.25, 0.25].forEach((x) => {
          [-0.12, 0.12].forEach((z) => {
            object.add(part(cylinder(0.075, 0.075, 0.02, 20), dark, { position: [x, 0.92, z + 0.01], cast: false }));
            object.add(part(cylinder(0.04, 0.04, 0.022, 16), steel, { position: [x, 0.925, z + 0.01], cast: false }));
          });
        });
        [-0.35, -0.12, 0.12, 0.35].forEach((x) => {
          object.add(part(cylinder(0.018, 0.018, 0.02, 10), dark, { position: [x, 0.8, 0.31], rotation: [Math.PI / 2, 0, 0], cast: false }));
        });
      }
      return { object, colorTargets: [body] };
    },
  };
}

const fridge = {
  type: 'fridge',
  name: 'Kulkas',
  size: [0.7, 1.7, 0.7],
  catalog: { label: 'Kulkas', icon: 'fa-solid fa-snowflake', iconClass: 'text-sky-200' },

  build() {
    const object = new THREE.Group();
    const bodyMat = standard('#d9dce0', { roughness: 0.3, metalness: 0.45 });
    const handle = standard('#8b8f94', { metalness: 0.8, roughness: 0.3 });
    const body = part(roundedBox(0.7, 1.7, 0.7, 0.03), bodyMat, { position: [0, 0.85, 0], receive: true });
    object.add(body);
    object.add(part(roundedBox(0.66, 0.012, 0.02, 0.004), standard('#6b6f75'), { position: [0, 1.15, 0.352], cast: false }));
    object.add(part(cylinder(0.012, 0.012, 0.5, 8), handle, { position: [0.27, 1.4, 0.4], cast: false }));
    object.add(part(cylinder(0.012, 0.012, 0.3, 8), handle, { position: [0.27, 0.75, 0.4], cast: false }));
    return { object, colorTargets: [body] };
  },
};

const diningTable = {
  type: 'dining-table',
  name: 'Meja Makan',
  size: [1.4, 0.75, 0.8],
  catalog: { label: 'Meja Makan', icon: 'fa-solid fa-utensils', iconClass: 'text-amber-200' },

  build() {
    const object = new THREE.Group();
    const wood = standard('#8a6a4d', { roughness: 0.5 });
    const top = part(roundedBox(1.4, 0.05, 0.8, 0.02), wood, { position: [0, 0.725, 0], receive: true });
    object.add(top);
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        object.add(part(cylinder(0.035, 0.028, 0.7, 10), wood, { position: [sx * 0.62, 0.35, sz * 0.32], cast: false }));
      });
    });
    [-0.35, 0.35].forEach((x) => {
      object.add(part(cylinder(0.11, 0.1, 0.015, 20), standard('#f5f5f4', { roughness: 0.2 }), { position: [x, 0.76, 0.18], cast: false }));
    });
    return { object, colorTargets: [top] };
  },
};

const chair = {
  type: 'chair',
  name: 'Kursi',
  size: [0.45, 0.9, 0.45],
  catalog: { label: 'Kursi', icon: 'fa-solid fa-chair', iconClass: 'text-amber-300' },

  build() {
    const object = new THREE.Group();
    const wood = standard('#6b4f3a', { roughness: 0.55 });
    const seatMat = fabricMaterial('#b8afa6');
    const seat = part(roundedBox(0.43, 0.06, 0.43, 0.02), seatMat, { position: [0, 0.45, 0], receive: true });
    object.add(seat);
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        object.add(part(cylinder(0.02, 0.016, 0.44, 8), wood, { position: [sx * 0.185, 0.22, sz * 0.185], cast: false }));
      });
      object.add(part(cylinder(0.018, 0.018, 0.42, 8), wood, { position: [sx * 0.185, 0.66, -0.185], cast: false }));
    });
    object.add(part(roundedBox(0.4, 0.14, 0.03, 0.01), wood, { position: [0, 0.8, -0.185], cast: false }));
    object.add(part(roundedBox(0.4, 0.1, 0.03, 0.01), wood, { position: [0, 0.62, -0.185], cast: false }));
    return { object, colorTargets: [seat] };
  },
};

export default [
  makeCounter({ type: 'kitchen-counter', name: 'Kabinet Dapur', label: 'Kabinet', variant: 'plain', icon: 'fa-solid fa-kitchen-set' }),
  makeCounter({ type: 'kitchen-sink', name: 'Bak Cuci Piring', label: 'Cuci Piring', variant: 'sink', icon: 'fa-solid fa-sink' }),
  makeCounter({ type: 'stove', name: 'Kompor', label: 'Kompor', variant: 'stove', icon: 'fa-solid fa-fire-burner' }),
  fridge,
  diningTable,
  chair,
];
