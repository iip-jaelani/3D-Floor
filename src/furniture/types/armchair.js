import * as THREE from 'three';
import { cylinder, part, roundedBox, standard } from '../part.js';
import { fabricMaterial } from '../textures.js';

export default {
  type: 'armchair',
  name: 'Kursi Armchair Kayu',
  size: [0.82, 0.97, 0.82],
  catalog: { label: 'Armchair', icon: 'fa-solid fa-chair', iconClass: 'text-amber-300' },

  build() {
    const object = new THREE.Group();
    const seatMat = fabricMaterial('#b8afa6');
    const backMat = fabricMaterial('#b8afa6');
    const woodMat = standard('#3e2723', { roughness: 0.5 });

    const seat = part(roundedBox(0.66, 0.12, 0.62, 0.05), seatMat, { position: [0, 0.46, 0.03], receive: true });
    const back = part(roundedBox(0.7, 0.5, 0.14, 0.06), backMat, {
      position: [0, 0.74, -0.3],
      rotation: [-0.14, 0, 0],
      receive: true,
    });
    object.add(seat, back);

    object.add(part(roundedBox(0.74, 0.12, 0.72, 0.03), seatMat, { position: [0, 0.34, 0], receive: true }));

    [-0.38, 0.38].forEach((side) => {
      object.add(part(roundedBox(0.07, 0.06, 0.74, 0.025), woodMat, { position: [side, 0.62, 0] }));
      [0.3, -0.3].forEach((z) => {
        object.add(part(cylinder(0.022, 0.02, 0.28, 8), woodMat, { position: [side, 0.48, z], cast: false }));
        object.add(part(cylinder(0.032, 0.018, 0.28, 10), woodMat, { position: [side * 0.82, 0.14, z * 0.93], cast: false }));
      });
    });

    object.add(
      part(roundedBox(0.3, 0.22, 0.09, 0.04), fabricMaterial('#c9a24a', { roughness: 0.85 }), {
        position: [0.12, 0.66, -0.17],
        rotation: [-0.2, 0.25, 0.05],
      }),
    );

    return { object, colorTargets: [seat, { mesh: back, lightness: 0.02 }] };
  },
};
