import * as THREE from 'three';
import { applyTextureSet, getTextureSet } from './proceduralMaterials.js';
import { ROOF_MATERIALS, YARD_GROUNDS } from '../plan/Plan.js';
import { offsetPolygon, pointInPolygon, projectOnSegment, signedArea } from '../plan/geometry.js';

const POST_SIZE = 0.1;
const BEAM = 0.08;

export function roofShape(roof) {
  const w = roof.maxX - roof.minX;
  const d = roof.maxZ - roof.minZ;
  const axis = roof.ridge === 'x' || roof.ridge === 'z' ? roof.ridge : w >= d ? 'x' : 'z';
  const span = axis === 'x' ? d : w;
  const length = axis === 'x' ? w : d;
  const tan = Math.tan(((roof.pitch ?? 0) * Math.PI) / 180);

  const type = roof.type === 'canopy' ? (roof.pitch > 0 ? 'shed' : 'flat') : roof.type;
  const rise = type === 'gable' || type === 'hip' ? (span / 2) * tan : type === 'shed' ? span * tan : 0;
  const ridgeLength = type === 'hip' ? Math.max(length - span, 0) : length;
  return { type, axis, span, length, rise, ridgeLength, tan };
}

const materialCache = new Map();
const ROOF_TEXTURES = { genteng: 'tiles', hitam: 'tiles', seng: 'metal', beton: 'concrete' };
function roofMaterial(roof) {
  const base = ROOF_MATERIALS[roof.material] ?? ROOF_MATERIALS.genteng;
  const color = roof.color ?? base.color;
  const glass = roof.material === 'kaca';
  const texture = ROOF_TEXTURES[roof.material] ?? null;
  const key = `${color}|${glass}|${texture}`;
  if (!materialCache.has(key)) {
    const made = new THREE.MeshStandardMaterial({
        color,
        roughness: glass ? 0.15 : 0.75,
        metalness: roof.material === 'seng' ? 0.45 : 0.05,
        transparent: glass,
        opacity: glass ? 0.5 : 1,
        side: THREE.DoubleSide,
    });
    if (texture && getTextureSet(texture)) applyTextureSet(made, texture);
    materialCache.set(key, made);
  }
  return materialCache.get(key);
}

function polyMesh(polys, material) {
  const positions = [];
  polys.forEach((poly) => {
    for (let i = 1; i + 1 < poly.length; i++) positions.push(...poly[0], ...poly[i], ...poly[i + 1]);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  addProjectedUV(geometry);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addProjectedUV(geometry) {
  const pos = geometry.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i);
    uv[i * 2 + 1] = pos.getZ(i);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

function buildRectRoof(roof, wallMaterial = null) {
  const group = new THREE.Group();
  const o = roof.overhang ?? 0;
  const x0 = roof.minX - o;
  const x1 = roof.maxX + o;
  const z0 = roof.minZ - o;
  const z1 = roof.maxZ + o;
  const shape = roofShape(roof);
  const { tan } = shape;
  const material = roofMaterial(roof);
  const polys = [];

  const alongX = shape.axis === 'x';
  const cx = (roof.minX + roof.maxX) / 2;
  const cz = (roof.minZ + roof.maxZ) / 2;
  const flip = roof.flip === -1 ? -1 : 1;

  if (shape.type === 'flat') {
    polys.push([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]]);
  } else if (shape.type === 'shed') {
    const height = (u, min, max) => (flip === 1 ? (u - min) : (max - u)) * tan;
    if (alongX) {
      const h = (z) => height(z, roof.minZ, roof.maxZ);
      polys.push([[x0, h(z0), z0], [x1, h(z0), z0], [x1, h(z1), z1], [x0, h(z1), z1]]);
    } else {
      const h = (x) => height(x, roof.minX, roof.maxX);
      polys.push([[x0, h(x0), z0], [x1, h(x1), z0], [x1, h(x1), z1], [x0, h(x0), z1]]);
    }
  } else if (alongX) {
    const half = (roof.maxZ - roof.minZ) / 2;
    const rise = half * tan;
    const hz = (z) => (half - Math.abs(z - cz)) * tan;
    const rl = shape.type === 'hip' ? shape.ridgeLength / 2 : (roof.maxX - roof.minX) / 2 + o;
    const ra = cx - rl;
    const rb = cx + rl;
    [[z0, -1], [z1, 1]].forEach(([z]) => {
      polys.push([[x0, hz(z), z], [x1, hz(z), z], [rb, rise, cz], [ra, rise, cz]]);
    });
    if (shape.type === 'hip') {
      polys.push([[x0, hz(z0), z0], [x0, hz(z1), z1], [ra, rise, cz]]);
      polys.push([[x1, hz(z0), z0], [x1, hz(z1), z1], [rb, rise, cz]]);
    }
  } else {
    const half = (roof.maxX - roof.minX) / 2;
    const rise = half * tan;
    const hx = (x) => (half - Math.abs(x - cx)) * tan;
    const rl = shape.type === 'hip' ? shape.ridgeLength / 2 : (roof.maxZ - roof.minZ) / 2 + o;
    const ra = cz - rl;
    const rb = cz + rl;
    [x0, x1].forEach((x) => {
      polys.push([[x, hx(x), z0], [x, hx(x), z1], [cx, rise, rb], [cx, rise, ra]]);
    });
    if (shape.type === 'hip') {
      polys.push([[x0, hx(x0), z0], [x1, hx(x1), z0], [cx, rise, ra]]);
      polys.push([[x0, hx(x0), z1], [x1, hx(x1), z1], [cx, rise, rb]]);
    }
  }
  group.add(polyMesh(polys, material));

  if (shape.type === 'gable' && wallMaterial) {
    const tris = [];
    if (alongX) {
      const rise = ((roof.maxZ - roof.minZ) / 2) * tan;
      [roof.minX, roof.maxX].forEach((x) => tris.push([[x, 0, roof.minZ], [x, 0, roof.maxZ], [x, rise, cz]]));
    } else {
      const rise = ((roof.maxX - roof.minX) / 2) * tan;
      [roof.minZ, roof.maxZ].forEach((z) => tris.push([[roof.minX, 0, z], [roof.maxX, 0, z], [cx, rise, z]]));
    }
    group.add(polyMesh(tris, wallMaterial));
  }

  if (roof.type === 'canopy' || shape.type === 'flat') {
    const t = roof.thickness ?? 0.12;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(x1 - x0, t, z1 - z0),
      shape.type === 'flat' ? roofMaterial({ ...roof, material: roof.material === 'kaca' ? 'kaca' : 'beton', color: null }) : material,
    );
    if (shape.type === 'flat') {
      slab.position.set((x0 + x1) / 2, -t / 2, (z0 + z1) / 2);
      slab.castShadow = true;
      group.add(slab);
    }
  }

  if (roof.type === 'canopy' && roof.posts !== false) {
    const height = roof.height ?? 2.5;
    const frame = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.5, metalness: 0.4 });
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    corners.forEach(([x, z]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(POST_SIZE, height, POST_SIZE), frame);
      post.position.set(x + (x === x0 ? POST_SIZE / 2 : -POST_SIZE / 2), -height / 2, z + (z === z0 ? POST_SIZE / 2 : -POST_SIZE / 2));
      post.castShadow = true;
      group.add(post);
    });
    const beam = (w, d, x, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, BEAM, d), frame);
      b.position.set(x, -BEAM / 2 - 0.01, z);
      group.add(b);
    };
    beam(x1 - x0, BEAM, (x0 + x1) / 2, z0 + BEAM / 2);
    beam(x1 - x0, BEAM, (x0 + x1) / 2, z1 - BEAM / 2);
    beam(BEAM, z1 - z0, x0 + BEAM / 2, (z0 + z1) / 2);
    beam(BEAM, z1 - z0, x1 - BEAM / 2, (z0 + z1) / 2);
  }
  return group;
}

export function isAxisRect(points) {
  if (!points || points.length !== 4) return false;
  const xs = [...new Set(points.map((p) => Math.round(p[0] * 1000)))];
  const zs = [...new Set(points.map((p) => Math.round(p[1] * 1000)))];
  return xs.length === 2 && zs.length === 2;
}

const distToPolygon = (p, polygon) => {
  let best = Infinity;
  polygon.forEach((a, i) => {
    best = Math.min(best, projectOnSegment(p, a, polygon[(i + 1) % polygon.length]).distance);
  });
  return best;
};

function polygonRoofHeight(roof, shape, p) {
  const { tan, type } = shape;
  if (type === 'flat' || tan === 0) return 0;
  if (type === 'hip') {
    const d = distToPolygon(p, roof.points);
    return (pointInPolygon(p, roof.points) ? d : -d) * tan;
  }
  const cx = (roof.minX + roof.maxX) / 2;
  const cz = (roof.minZ + roof.maxZ) / 2;
  if (type === 'shed') {
    const u = shape.axis === 'x' ? p[1] - roof.minZ : p[0] - roof.minX;
    const span = shape.span;
    return (roof.flip === -1 ? span - u : u) * tan;
  }
  const across = shape.axis === 'x' ? p[1] - cz : p[0] - cx;
  return (shape.span / 2 - Math.abs(across)) * tan;
}

function refine(tri, max, out) {
  const [a, b, c] = tri;
  const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const edges = [len(a, b), len(b, c), len(c, a)];
  const longest = Math.max(...edges);
  if (longest <= max) return out.push(tri);
  const k = edges.indexOf(longest);
  const [p, q, r] = k === 0 ? [a, b, c] : k === 1 ? [b, c, a] : [c, a, b];
  const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  refine([p, m, r], max, out);
  refine([m, q, r], max, out);
}

function buildPolygonRoof(roof) {
  const group = new THREE.Group();
  const o = roof.overhang ?? 0;
  const shape = roofShape(roof);
  const material = roofMaterial(roof);
  const outline = o ? offsetPolygon(roof.points, o) : roof.points;
  const flat = shape.type === 'flat';

  const contour = outline.map(([x, z]) => new THREE.Vector2(x, z));
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const refined = [];
  const step = flat ? Infinity : 0.35;
  tris.forEach(([i, j, k]) => refine([outline[i], outline[j], outline[k]], step, refined));

  const positions = [];
  refined.forEach((tri) => {
    tri.forEach((p) => positions.push(p[0], polygonRoofHeight(roof, shape, p), p[1]));
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  addProjectedUV(geometry);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  if (flat && roof.type !== 'canopy') {
    const t = roof.thickness ?? 0.12;
    const slab = new THREE.ExtrudeGeometry(new THREE.Shape(contour), { depth: t, bevelEnabled: false });
    slab.rotateX(Math.PI / 2);
    slab.translate(0, 0, 0);
    const body = new THREE.Mesh(slab, roofMaterial({ ...roof, material: roof.material === 'kaca' ? 'kaca' : 'beton', color: null }));
    body.castShadow = true;
    group.add(body);
  }
  return group;
}

function addCanopyFrame(group, roof) {
  const height = roof.height ?? 2.5;
  const frame = new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.5, metalness: 0.4 });
  const pts = roof.points;
  pts.forEach(([x, z]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(POST_SIZE, height, POST_SIZE), frame);
    post.position.set(x, -height / 2 + 0.0, z);
    post.castShadow = true;
    group.add(post);
  });
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 0.05) return;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(length, BEAM, BEAM), frame);
    beam.position.set((a[0] + b[0]) / 2, -BEAM / 2 - 0.01, (a[1] + b[1]) / 2);
    beam.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    group.add(beam);
  });
}

export function buildRoof(roof, wallMaterial = null) {
  if (isAxisRect(roof.points) || !roof.points) return buildRectRoof(roof, wallMaterial);
  const group = buildPolygonRoof(roof);
  if (roof.type === 'canopy' && roof.posts !== false) addCanopyFrame(group, roof);
  return group;
}

export function roofRise(roof) {
  const shape = roofShape(roof);
  if (shape.type === 'flat') return 0;
  if (isAxisRect(roof.points) || !roof.points) return shape.rise;
  if (shape.type === 'hip') {
    let best = 0;
    for (let i = 0; i <= 12; i++) {
      for (let j = 0; j <= 12; j++) {
        const p = [roof.minX + ((roof.maxX - roof.minX) * i) / 12, roof.minZ + ((roof.maxZ - roof.minZ) * j) / 12];
        if (pointInPolygon(p, roof.points)) best = Math.max(best, distToPolygon(p, roof.points));
      }
    }
    return best * shape.tan;
  }
  return shape.type === 'shed' ? shape.span * shape.tan : (shape.span / 2) * shape.tan;
}

function seeded(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function treePositions(yard) {
  if (yard.plants === 'none' || yard.ground === 'water' || yard.ground === 'paving') return [];
  const polygon = yard.points ?? [[yard.minX, yard.minZ], [yard.maxX, yard.minZ], [yard.maxX, yard.maxZ], [yard.minX, yard.maxZ]];
  const w = yard.maxX - yard.minX;
  const d = yard.maxZ - yard.minZ;
  const area = Math.abs(signedArea(polygon));
  const count = Math.min(Math.round(area * (yard.plants === 'dense' ? 0.18 : 0.06)), 40);
  const rand = seeded(yard.id);
  const out = [];
  for (let tries = 0; out.length < count && tries < count * 40; tries++) {
    const x = yard.minX + rand() * w;
    const z = yard.minZ + rand() * d;
    const scale = 0.7 + rand() * 0.8;
    if (!pointInPolygon([x, z], polygon) || distToPolygon([x, z], polygon) < 0.4) continue;
    if (out.every(([ox, oz]) => Math.hypot(ox - x, oz - z) > 1.1)) out.push([x, z, scale]);
  }
  return out;
}

const trunk = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 });
const foliage = [0x3f8a3a, 0x4c9a45, 0x2f7a3a].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
const groundMaterials = new Map();

const GROUND_TEXTURES = { teras: 'ceramic', paving: 'concrete', wood: 'oak' };

function groundMaterial(yard) {
  const textured = GROUND_TEXTURES[yard.ground];
  const color = yard.color ?? (textured ? '#ffffff' : YARD_GROUNDS[yard.ground]?.color ?? '#4d8f3a');
  const key = `${yard.ground}|${color}`;
  if (!groundMaterials.has(key)) {
    const water = yard.ground === 'water';
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: water ? 0.1 : 0.95,
      metalness: water ? 0.2 : 0,
      transparent: water,
      opacity: water ? 0.8 : 1,
    });
    if (textured && getTextureSet(textured)) applyTextureSet(material, textured);
    groundMaterials.set(key, material);
  }
  return groundMaterials.get(key);
}

const railingMaterial = new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.6 });

export function buildYard(yard) {
  const group = new THREE.Group();
  const polygon = yard.points ?? [[yard.minX, yard.minZ], [yard.maxX, yard.minZ], [yard.maxX, yard.maxZ], [yard.minX, yard.maxZ]];
  const top = (yard.elevation ?? 0) + (yard.ground === 'water' ? -0.05 : 0);
  const depth = Math.max(0.12, top + 0.12);

  const shape = new THREE.Shape(polygon.map(([x, z]) => new THREE.Vector2(x, z)));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, top, 0);
  const slab = new THREE.Mesh(geometry, groundMaterial(yard));
  slab.receiveShadow = true;
  group.add(slab);

  if (yard.railing) {
    const ring = polygon;
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.05) return;
      const rail = new THREE.Mesh(new THREE.BoxGeometry(length, 0.9, 0.08), railingMaterial);
      rail.position.set((a[0] + b[0]) / 2, (yard.elevation ?? 0) + 0.45, (a[1] + b[1]) / 2);
      rail.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      rail.castShadow = true;
      group.add(rail);
    });
  }

  treePositions(yard).forEach(([x, z, s], i) => {
    const tree = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 1.1 * s, 8), trunk);
    stem.position.y = 0.55 * s;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6 * s, 1), foliage[i % foliage.length]);
    crown.position.y = 1.5 * s;
    crown.castShadow = true;
    stem.castShadow = true;
    tree.add(stem, crown);
    tree.position.set(x, yard.elevation ?? 0, z);
    group.add(tree);
  });
  return group;
}
