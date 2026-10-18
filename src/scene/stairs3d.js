import * as THREE from 'three';
import { stairMetrics, stairTreads } from '../plan/stairs.js';

const DEFAULT_COLOR = '#b8b2a7';
const RAIL_HEIGHT = 0.9;
const materials = new Map();

const material = (key, color) => {
  const id = `${key}|${color}`;
  if (!materials.has(id)) materials.set(id, new THREE.MeshStandardMaterial({ color, roughness: key === 'rail' ? 0.4 : 0.85 }));
  return materials.get(id);
};

export function buildStairs(stairs) {
  const group = new THREE.Group();
  const m = stairMetrics(stairs);
  const step = material('step', stairs.color ?? DEFAULT_COLOR);

  stairTreads(stairs).forEach(({ corners, top }) => {
    const [x0, z0] = corners[0];
    const [x1, z1] = corners[2];
    const box = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), top, Math.abs(z1 - z0)), step);
    box.position.set((x0 + x1) / 2, top / 2, (z0 + z1) / 2);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  });

  if (stairs.railing !== false) {
    const rail = material('rail', '#4b3b2a');
    const up = new THREE.Vector3(m.ux * m.run, stairs.rise, m.uz * m.run);
    const cx = (stairs.minX + stairs.maxX) / 2;
    const cz = (stairs.minZ + stairs.maxZ) / 2;
    const half = m.width / 2 - 0.03;

    [-1, 1].forEach((side) => {
      const lx = m.ux !== 0 ? 0 : half * side;
      const lz = m.ux !== 0 ? half * side : 0;

      const handrail = new THREE.Mesh(new THREE.BoxGeometry(up.length(), 0.05, 0.05), rail);
      handrail.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), up.clone().normalize());
      handrail.position.set(cx + lx, stairs.rise / 2 + RAIL_HEIGHT, cz + lz);
      handrail.castShadow = true;
      group.add(handrail);

      [-0.5, 0.5].forEach((end) => {
        const height = (end > 0 ? stairs.rise : 0) + RAIL_HEIGHT;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, height, 0.05), rail);
        post.position.set(cx + lx + m.ux * m.run * end, height / 2, cz + lz + m.uz * m.run * end);
        post.castShadow = true;
        group.add(post);
      });
    });
  }
  return group;
}
