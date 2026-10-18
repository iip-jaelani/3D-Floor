import { pointOnWall, polygonArea, signedArea, tangentOnWall, wallLength } from './geometry.js';

export const CODE_PREFIX = { door: 'P', window: 'J', vent: 'BV', niche: 'N' };
export const TYPE_LABEL = { door: 'Pintu', window: 'Jendela', vent: 'Ventilasi', niche: 'Relung' };

export const GRID_OFFSET = 2.7;
const CHAIN_STEP = 0.6;
const EDGE_TOL = 0.08;

export function cluster(values, tol = 0.15) {
  const out = [];
  [...values].sort((a, b) => a - b).forEach((v) => {
    if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  });
  return out;
}

export function planAnnotations(plan, floor) {
  const ends = floor.walls.flatMap((w) => [w.a, w.b]);
  if (!ends.length) return null;
  const minX = Math.min(...ends.map((p) => p[0]));
  const maxX = Math.max(...ends.map((p) => p[0]));
  const minZ = Math.min(...ends.map((p) => p[1]));
  const maxZ = Math.max(...ends.map((p) => p[1]));

  const bounds = { minX, maxX, minZ, maxZ };
  const dims = chainDimensions(plan, floor, bounds);

  const long = floor.walls.filter((w) => wallLength(w) >= 3);
  const grid = {
    x: cluster(long.filter((w) => Math.abs(w.a[0] - w.b[0]) < 1e-3).map((w) => w.a[0]), 0.6),
    z: cluster(long.filter((w) => Math.abs(w.a[1] - w.b[1]) < 1e-3).map((w) => w.a[1]), 0.6),
  };

  const kindKey = (o) => [o.type, o.width, o.height, o.sill].join('|');
  const kinds = new Map();
  floor.openings.forEach((o) => {
    if (!kinds.has(kindKey(o))) kinds.set(kindKey(o), { type: o.type, width: o.width, height: o.height, sill: o.sill, count: 0 });
    kinds.get(kindKey(o)).count += 1;
  });
  const counters = {};
  const schedule = [...kinds.values()]
    .sort((a, b) => (CODE_PREFIX[a.type] ?? '').localeCompare(CODE_PREFIX[b.type] ?? '') || b.width - a.width)
    .map((k) => {
      const prefix = CODE_PREFIX[k.type] ?? 'X';
      counters[prefix] = (counters[prefix] ?? 0) + 1;
      return { ...k, code: `${prefix}${counters[prefix]}` };
    });
  const codeOf = new Map(schedule.map((k) => [kindKey(k), k.code]));

  const tags = [];
  floor.openings.forEach((o) => {
    const wall = floor.walls.find((w) => w.id === o.wallId);
    if (!wall || wallLength(wall) === 0) return;
    const t = (wall.thickness ?? plan.wallThickness) / 2;
    const c = pointOnWall(wall, o.offset);
    const u = tangentOnWall(wall, o.offset);
    const side = o.type === 'door' ? (o.swing === -1 ? 1 : -1) : 1;
    tags.push({ p: [c[0] - u[1] * (t + 0.18) * side, c[1] + u[0] * (t + 0.18) * side], code: codeOf.get(kindKey(o)) });
  });

  return { dims, grid, tags, schedule, bounds };
}

export function chainDimensions(plan, floor, bounds) {
  const { minX, maxX, minZ, maxZ } = bounds;
  const dims = [];
  const sides = [
    { vertical: false, edge: minZ, sign: -1, lo: minX, hi: maxX },
    { vertical: false, edge: maxZ, sign: 1, lo: minX, hi: maxX },
    { vertical: true, edge: minX, sign: -1, lo: minZ, hi: maxZ },
    { vertical: true, edge: maxX, sign: 1, lo: minZ, hi: maxZ },
  ];
  sides.forEach(({ vertical, edge, sign, lo, hi }) => {
    const along = (p) => (vertical ? p[1] : p[0]);
    const across = (p) => (vertical ? p[0] : p[1]);
    const onEdge = floor.walls.filter((w) => Math.abs(across(w.a) - edge) < EDGE_TOL && Math.abs(across(w.b) - edge) < EDGE_TOL);

    const stops = onEdge.flatMap((w) => [along(w.a), along(w.b)]);
    let hasOpenings = false;
    floor.openings.forEach((o) => {
      const wall = onEdge.find((w) => w.id === o.wallId);
      if (!wall || o.type === 'niche') return;
      const c = along(pointOnWall(wall, o.offset));
      stops.push(c - o.width / 2, c + o.width / 2);
      hasOpenings = true;
    });
    let level = 0;
    const push = (values, tol = 0.02) => {
      const pts = cluster(values, tol);
      for (let i = 1; i < pts.length; i++) {
        dims.push({ a: pts[i - 1], b: pts[i], at: edge + sign * (0.7 + CHAIN_STEP * level), vertical, anchor: edge });
      }
      level += 1;
    };
    if (hasOpenings) push(stops);
    push(floor.walls.flatMap((w) => [along(w.a), along(w.b)]), 0.05);
    dims.push({ a: lo, b: hi, at: edge + sign * (0.7 + CHAIN_STEP * level), vertical, anchor: edge });
  });
  return dims;
}

export function insetPolygon(polygon, d) {
  const n = polygon.length;
  const ccw = signedArea(polygon) > 0;
  const normal = (a, b) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return ccw ? [-dz / l, dx / l] : [dz / l, -dx / l];
  };
  return polygon.map((p, i) => {
    const n1 = normal(polygon[(i + n - 1) % n], p);
    const n2 = normal(p, polygon[(i + 1) % n]);
    const bx = n1[0] + n2[0];
    const bz = n1[1] + n2[1];
    const cos2 = (1 + n1[0] * n2[0] + n1[1] * n2[1]) / 2;
    const k = d / Math.max(cos2, 0.1);
    return [p[0] + (bx / 2) * k, p[1] + (bz / 2) * k];
  });
}

export function netArea(plan, room) {
  const inner = insetPolygon(room.polygon, plan.wallThickness / 2);
  return polygonArea(inner);
}

export function dimensionGeometry(dim, bounds) {
  const { a, b, at, vertical } = dim;
  const pa = vertical ? [at, a] : [a, at];
  const pb = vertical ? [at, b] : [b, at];
  const edge = dim.anchor ?? (vertical ? bounds.minX : bounds.minZ);
  const anchorA = vertical ? [edge, a] : [a, edge];
  const anchorB = vertical ? [edge, b] : [b, edge];
  const length = Math.abs(b - a);
  return {
    extensions: [[anchorA, pa], [anchorB, pb]],
    line: [pa, pb],
    label: String(Math.round(length * 100)),
    labelled: length >= 0.25,
    mid: [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2],
  };
}
