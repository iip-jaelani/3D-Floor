import * as THREE from 'three';
import { cylinder, part, roundedBox, standard } from '../part.js';
import { fabricMaterial } from '../textures.js';

const WOOD = '#6b4f3a';

function makeBed({ type, name, width, length, label }) {
  return {
    type,
    name,
    size: [width, 0.95, length],
    catalog: { label, icon: 'fa-solid fa-bed', iconClass: 'text-indigo-300' },

    build() {
      const object = new THREE.Group();
      const wood = standard(WOOD, { roughness: 0.55 });
      const sheet = fabricMaterial('#ece8e1');
      const blanketMat = fabricMaterial('#64748b');
      const pillowMat = fabricMaterial('#f5f5f4');

      [-1, 1].forEach((sx) => {
        [-1, 1].forEach((sz) => {
          object.add(
            part(cylinder(0.035, 0.03, 0.12, 8), wood, {
              position: [(sx * (width - 0.12)) / 2, 0.06, (sz * (length - 0.12)) / 2],
              cast: false,
            }),
          );
        });
      });

      object.add(part(roundedBox(width, 0.22, length, 0.03), wood, { position: [0, 0.23, 0], receive: true }));
      object.add(part(roundedBox(width - 0.08, 0.2, length - 0.12, 0.07), sheet, { position: [0, 0.44, 0.03], receive: true }));
      object.add(part(roundedBox(width + 0.06, 0.9, 0.08, 0.03), wood, { position: [0, 0.5, -length / 2 + 0.04] }));

      const pillows = width > 1.2 ? 2 : 1;
      for (let i = 0; i < pillows; i++) {
        const w = (width - 0.2) / pillows - 0.06;
        const x = pillows === 1 ? 0 : (i === 0 ? -1 : 1) * (w / 2 + 0.04);
        object.add(
          part(roundedBox(w, 0.12, 0.38, 0.06), pillowMat, { position: [x, 0.6, -length / 2 + 0.38], rotation: [-0.12, 0, 0] }),
        );
      }

      const blanket = part(roundedBox(width - 0.02, 0.08, length * 0.58, 0.04), blanketMat, {
        position: [0, 0.56, length * 0.2],
        receive: true,
      });
      object.add(blanket);
      return { object, colorTargets: [blanket] };
    },
  };
}

const wardrobe = {
  type: 'wardrobe',
  name: 'Lemari Pakaian',
  size: [1.2, 2.0, 0.55],
  catalog: { label: 'Lemari', icon: 'fa-solid fa-door-closed', iconClass: 'text-amber-200' },

  build() {
    const object = new THREE.Group();
    const bodyMat = standard('#a98f74', { roughness: 0.6 });
    const doorMat = standard('#b79d82', { roughness: 0.55 });
    const metal = standard('#27272a', { metalness: 0.7, roughness: 0.35 });

    const body = part(roundedBox(1.2, 1.94, 0.55, 0.02), bodyMat, { position: [0, 1.0, 0], receive: true });
    object.add(body);
    object.add(part(roundedBox(1.14, 0.06, 0.5, 0.01), standard('#3f3a36'), { position: [0, 0.03, 0], cast: false }));

    [-1, 1].forEach((side) => {
      object.add(part(roundedBox(0.58, 1.8, 0.025, 0.01), doorMat, { position: [side * 0.296, 1.0, 0.285] }));
      object.add(part(cylinder(0.012, 0.012, 0.35, 8), metal, { position: [side * 0.07, 1.0, 0.315], cast: false }));
    });
    return { object, colorTargets: [body, { mesh: object.children[2], lightness: 0.03 }] };
  },
};

const nightstand = {
  type: 'nightstand',
  name: 'Nakas',
  size: [0.45, 0.5, 0.4],
  catalog: { label: 'Nakas', icon: 'fa-solid fa-box', iconClass: 'text-amber-300' },

  build() {
    const object = new THREE.Group();
    const wood = standard(WOOD, { roughness: 0.55 });
    const brass = standard('#b8923a', { metalness: 0.8, roughness: 0.3 });
    const body = part(roundedBox(0.45, 0.46, 0.4, 0.02), wood, { position: [0, 0.27, 0], receive: true });
    object.add(body);
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        object.add(part(cylinder(0.02, 0.016, 0.06, 8), wood, { position: [sx * 0.19, 0.03, sz * 0.16], cast: false }));
      });
    });
    object.add(part(roundedBox(0.4, 0.17, 0.02, 0.008), standard('#7d5f48'), { position: [0, 0.38, 0.205], cast: false }));
    object.add(part(roundedBox(0.4, 0.17, 0.02, 0.008), standard('#7d5f48'), { position: [0, 0.18, 0.205], cast: false }));
    object.add(part(cylinder(0.014, 0.014, 0.02, 8), brass, { position: [0, 0.38, 0.225], rotation: [Math.PI / 2, 0, 0], cast: false }));
    object.add(part(cylinder(0.014, 0.014, 0.02, 8), brass, { position: [0, 0.18, 0.225], rotation: [Math.PI / 2, 0, 0], cast: false }));
    return { object, colorTargets: [body] };
  },
};

export default [
  makeBed({ type: 'bed', name: 'Tempat Tidur Double', width: 1.6, length: 2.0, label: 'Kasur Double' }),
  makeBed({ type: 'bed-single', name: 'Tempat Tidur Single', width: 0.9, length: 1.9, label: 'Kasur Single' }),
  wardrobe,
  nightstand,
];
