import * as THREE from 'three';
import { box, cylinder, part, roundedBox, standard } from '../part.js';
import { fabricMaterial } from '../textures.js';

const WOOD = '#8a6a4d';

const desk = {
  type: 'desk',
  name: 'Meja Kerja',
  size: [1.2, 0.76, 0.6],
  catalog: { label: 'Meja Kerja', icon: 'fa-solid fa-computer', iconClass: 'text-violet-300' },

  build() {
    const object = new THREE.Group();
    const wood = standard(WOOD, { roughness: 0.5 });
    const top = part(roundedBox(1.2, 0.04, 0.6, 0.015), wood, { position: [0, 0.74, 0], receive: true });
    object.add(top);
    [-1, 1].forEach((sx) => {
      object.add(part(roundedBox(0.04, 0.72, 0.56, 0.01), wood, { position: [sx * 0.57, 0.36, 0], cast: false }));
    });
    object.add(part(roundedBox(1.1, 0.3, 0.02, 0.01), standard('#7d5f48'), { position: [0, 0.55, -0.27], cast: false }));
    object.add(part(roundedBox(0.34, 0.16, 0.5, 0.015), standard('#7d5f48'), { position: [0.38, 0.62, 0], cast: false }));
    return { object, colorTargets: [top] };
  },
};

const sewingTable = {
  type: 'sewing-table',
  name: 'Meja Mesin Jahit',
  size: [1.3, 0.95, 0.65],
  catalog: { label: 'Mesin Jahit', icon: 'fa-solid fa-scissors', iconClass: 'text-rose-300' },

  build() {
    const object = new THREE.Group();
    const wood = standard('#9b7b5c', { roughness: 0.5 });
    const metal = standard('#27272a', { metalness: 0.7, roughness: 0.35 });
    const machineMat = standard('#e5e7eb', { roughness: 0.3 });

    const top = part(roundedBox(1.3, 0.05, 0.65, 0.015), wood, { position: [0, 0.76, 0], receive: true });
    object.add(top);
    [-1, 1].forEach((sx) => {
      [-1, 1].forEach((sz) => {
        object.add(part(cylinder(0.025, 0.02, 0.74, 8), metal, { position: [sx * 0.58, 0.37, sz * 0.27], cast: false }));
      });
    });
    object.add(part(roundedBox(1.16, 0.03, 0.04, 0.008), metal, { position: [0, 0.16, 0.27], cast: false }));

    object.add(part(roundedBox(0.42, 0.04, 0.2, 0.012), machineMat, { position: [0, 0.82, 0], receive: true }));
    object.add(part(roundedBox(0.4, 0.2, 0.1, 0.03), machineMat, { position: [0, 0.94, -0.04] }));
    object.add(part(roundedBox(0.12, 0.16, 0.1, 0.03), machineMat, { position: [-0.17, 1.02, -0.04] }));
    object.add(part(cylinder(0.012, 0.012, 0.1, 8), metal, { position: [0.16, 0.9, -0.04], cast: false }));
    object.add(part(cylinder(0.05, 0.05, 0.03, 18), metal, { position: [-0.24, 0.96, 0.02], rotation: [0, 0, Math.PI / 2], cast: false }));

    object.add(part(roundedBox(0.34, 0.012, 0.25, 0.004), fabricMaterial('#c26a54'), { position: [0.4, 0.795, 0.12], rotation: [0, 0.2, 0], cast: false }));
    return { object, colorTargets: [top] };
  },
};

const bookshelf = {
  type: 'bookshelf',
  name: 'Rak Buku',
  size: [0.9, 1.8, 0.3],
  catalog: { label: 'Rak Buku', icon: 'fa-solid fa-book', iconClass: 'text-amber-200' },

  build() {
    const object = new THREE.Group();
    const wood = standard('#8f7355', { roughness: 0.55 });
    const colors = ['#b45309', '#1e40af', '#047857', '#9f1239', '#6b7280', '#ca8a04'];

    const frame = part(roundedBox(0.9, 1.8, 0.3, 0.012), wood, { position: [0, 0.9, 0], receive: true });
    object.add(frame);
    object.add(part(box(0.84, 1.7, 0.02), standard('#5c4630'), { position: [0, 0.9, -0.13], cast: false }));

    for (let shelf = 0; shelf < 5; shelf++) {
      const y = 0.06 + shelf * 0.4;
      object.add(part(box(0.84, 0.025, 0.28), wood, { position: [0, y, 0.01], cast: false }));
      if (shelf === 4) continue;
      let x = -0.4;
      for (let i = 0; i < 9 && x < 0.38; i++) {
        const w = 0.035 + ((i * 7 + shelf * 3) % 4) * 0.012;
        const h = 0.22 + ((i * 5 + shelf) % 4) * 0.035;
        object.add(
          part(box(w, h, 0.2), standard(colors[(i + shelf) % colors.length], { roughness: 0.7 }), {
            position: [x + w / 2, y + 0.0125 + h / 2, 0.02],
            cast: false,
          }),
        );
        x += w + 0.006;
      }
    }
    return { object, colorTargets: [frame] };
  },
};

export default [desk, sewingTable, bookshelf];
