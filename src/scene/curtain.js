import * as THREE from 'three';

const PLEATS_PER_METER = 9;
const SEGMENTS_PER_PLEAT = 8;
const HEIGHT_SEGMENTS = 24;
const TIEBACK_HEIGHT = 0.4;
const RING_SPACING = 0.09;

const metalMaterial = new THREE.MeshStandardMaterial({ color: '#2b2b2f', metalness: 0.6, roughness: 0.35 });
const tiebackMaterial = new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.5, roughness: 0.4 });

function createPleatedGeometry({ width, height, tieback, amplitude }) {
  const pleats = Math.max(3, Math.round(width * PLEATS_PER_METER));
  const geometry = new THREE.PlaneGeometry(width, height, pleats * SEGMENTS_PER_PLEAT, HEIGHT_SEGMENTS);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const v = (position.getY(i) + height / 2) / height;
    const pinch = tieback ? Math.exp(-(((v - TIEBACK_HEIGHT) / 0.11) ** 2)) : 0;

    const phase = (x / width + 0.5) * pleats * Math.PI * 2;
    const fullness = 0.75 + 0.5 * (1 - v);
    const z = Math.sin(phase) * amplitude * fullness + pinch * 0.05;

    position.setXYZ(i, x * (1 - 0.45 * pinch), v * height, z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

function createRings(width, height) {
  const group = new THREE.Group();
  const geometry = new THREE.TorusGeometry(0.026, 0.005, 8, 16);
  geometry.rotateY(Math.PI / 2);
  const count = Math.max(2, Math.round(width / RING_SPACING));

  for (let i = 0; i < count; i++) {
    const ring = new THREE.Mesh(geometry, metalMaterial);
    ring.position.set(-width / 2 + (width * (i + 0.5)) / count, height + 0.03, 0);
    group.add(ring);
  }
  return group;
}

function createTieback(width, height) {
  const radiusX = width * 0.55 * 0.5 + 0.015;
  const radiusZ = 0.085;
  const points = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radiusX, 0, Math.sin(a) * radiusZ + 0.025);
  });
  const curve = new THREE.CatmullRomCurve3(points, true);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, 0.014, 8, true),
    tiebackMaterial,
  );
  mesh.position.y = height * TIEBACK_HEIGHT;
  mesh.castShadow = true;
  return mesh;
}

export function createCurtain({ width, height, color, sheer = false, tieback = false }) {
  const group = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    side: THREE.DoubleSide,
    transparent: sheer,
    opacity: sheer ? 0.4 : 1,
    depthWrite: !sheer,
  });
  material.userData.disposable = true;

  const mesh = new THREE.Mesh(
    createPleatedGeometry({ width, height, tieback, amplitude: sheer ? 0.022 : 0.045 }),
    material,
  );
  mesh.castShadow = !sheer;
  mesh.receiveShadow = !sheer;
  group.add(mesh);

  if (!sheer) group.add(createRings(width, height));
  if (tieback) group.add(createTieback(width, height));
  return group;
}

export function createRod({ length }) {
  const group = new THREE.Group();

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, length, 12), metalMaterial);
  rod.rotation.z = Math.PI / 2;
  group.add(rod);

  [-1, 1].forEach((side) => {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), metalMaterial);
    finial.position.x = (side * length) / 2;
    group.add(finial);

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.1), metalMaterial);
    bracket.position.set(side * (length / 2 - 0.12), 0, -0.05);
    group.add(bracket);
  });

  return group;
}
