import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function part(geometry, material, { position = [0, 0, 0], rotation, cast = true, receive = false } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export const roundedBox = (w, h, d, radius = 0.03) =>
  new RoundedBoxGeometry(w, h, d, 4, Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

export const cylinder = (rTop, rBottom, h, segments = 16) => new THREE.CylinderGeometry(rTop, rBottom, h, segments);
export const sphere = (r, widthSegments = 20, heightSegments = 14) =>
  new THREE.SphereGeometry(r, widthSegments, heightSegments);

export const standard = (color, options = {}) => new THREE.MeshStandardMaterial({ color, ...options });
