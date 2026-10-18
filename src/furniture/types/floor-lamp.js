import * as THREE from 'three';
import { cylinder, part, sphere, standard } from '../part.js';

export default {
  type: 'floor-lamp',
  name: 'Standing Floor Lamp',
  size: [0.55, 1.65, 0.55],
  catalog: { label: 'Standing Lamp', icon: 'fa-regular fa-lightbulb', iconClass: 'text-yellow-300' },

  build() {
    const object = new THREE.Group();
    const metalMat = standard('#d4af37', { metalness: 0.8, roughness: 0.2 });
    const marbleMat = standard('#e7e5e4', { roughness: 0.25 });
    const shadeMat = new THREE.MeshStandardMaterial({
      color: '#fef3c7',
      emissive: '#fde68a',
      emissiveIntensity: 0.4,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });

    object.add(part(cylinder(0.2, 0.22, 0.04, 32), marbleMat, { position: [0, 0.02, 0] }));
    object.add(part(cylinder(0.02, 0.02, 1.45, 12), metalMat, { position: [0, 0.76, 0] }));
    object.add(part(cylinder(0.035, 0.035, 0.05, 12), metalMat, { position: [0, 1.44, 0], cast: false }));

    const shadeGeometry = new THREE.CylinderGeometry(0.17, 0.26, 0.32, 32, 1, true);
    const shade = part(shadeGeometry, shadeMat, { position: [0, 1.5, 0], cast: false });
    object.add(shade);
    object.add(
      part(sphere(0.045), new THREE.MeshBasicMaterial({ color: '#fff3c4' }), { position: [0, 1.46, 0], cast: false }),
    );

    const bulb = new THREE.PointLight(0xffb74d, 0.8, 4);
    bulb.position.y = 1.4;
    object.add(bulb);

    return { object, colorTargets: [shade] };
  },
};
