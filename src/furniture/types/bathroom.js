import * as THREE from 'three';
import { cylinder, part, roundedBox, sphere, standard } from '../part.js';

const toilet = {
  type: 'toilet',
  name: 'Toilet Duduk',
  size: [0.4, 0.78, 0.7],
  catalog: { label: 'Toilet', icon: 'fa-solid fa-toilet', iconClass: 'text-sky-200' },

  build() {
    const object = new THREE.Group();
    const ceramic = standard('#f7f7f5', { roughness: 0.18 });

    const body = part(roundedBox(0.36, 0.38, 0.45, 0.12), ceramic, { position: [0, 0.2, 0.1], receive: true });
    object.add(body);
    object.add(part(roundedBox(0.4, 0.04, 0.5, 0.02), standard('#ecece8', { roughness: 0.25 }), { position: [0, 0.42, 0.1], cast: false }));
    object.add(part(roundedBox(0.38, 0.4, 0.17, 0.03), ceramic, { position: [0, 0.58, -0.25] }));
    object.add(part(cylinder(0.025, 0.025, 0.03, 12), standard('#c9ced3', { metalness: 0.8 }), { position: [0.1, 0.8, -0.25], cast: false }));
    return { object, colorTargets: [body] };
  },
};

const washbasin = {
  type: 'washbasin',
  name: 'Wastafel',
  size: [0.6, 0.95, 0.45],
  catalog: { label: 'Wastafel', icon: 'fa-solid fa-sink', iconClass: 'text-sky-300' },

  build() {
    const object = new THREE.Group();
    const ceramic = standard('#f7f7f5', { roughness: 0.18 });
    const steel = standard('#c7c9cc', { roughness: 0.25, metalness: 0.9 });

    object.add(part(cylinder(0.07, 0.09, 0.62, 14), ceramic, { position: [0, 0.31, -0.05], receive: true }));
    const basin = part(roundedBox(0.6, 0.16, 0.45, 0.06), ceramic, { position: [0, 0.78, 0], receive: true });
    object.add(basin);
    object.add(part(cylinder(0.012, 0.012, 0.15, 8), steel, { position: [0, 0.92, -0.17], cast: false }));
    object.add(part(sphere(0.02), steel, { position: [0, 0.99, -0.17], cast: false }));
    return { object, colorTargets: [basin] };
  },
};

export default [toilet, washbasin];
