import { decorPieces, shapeCenter } from '../plan/decor.js';
import {
  arcOf,
  boundsOf,
  distance,
  normalOnWall,
  pointInPolygon,
  pointOnWall,
  projectOnSegment,
  projectOnWall,
  segmentIntersectsRect,
  tangentOnWall,
  wallPolyline,
} from '../plan/geometry.js';

export const canPick = (layers, kind) => !layers || (layers[kind]?.visible !== false && !layers[kind]?.locked);

export function vertexAt(floor, p, tol, layers = null) {
  const candidates = [
    ...(canPick(layers, 'walls') ? floor.walls.flatMap((w) => [w.a, w.b]) : []),
    ...(canPick(layers, 'rooms') ? floor.rooms.flatMap((r) => r.corners ?? r.polygon) : []),
  ];
  let best = null;
  let bestDistance = tol;
  candidates.forEach((c) => {
    const d = distance(p, c);
    if (d <= bestDistance) {
      best = c;
      bestDistance = d;
    }
  });
  return best ? [best[0], best[1]] : null;
}

export function nearestWall(floor, p, maxDistance) {
  let best = null;
  floor.walls.forEach((wall) => {
    const hit = projectOnWall(p, wall);
    if (hit.distance <= maxDistance && (!best || hit.distance < best.distance)) {
      best = { wall, t: hit.t, distance: hit.distance };
    }
  });
  return best;
}

export function openingSpan(floor, opening) {
  const wall = floor.walls.find((w) => w.id === opening.wallId);
  if (!wall) return null;

  const at = (t) => pointOnWall(wall, t);
  const u = tangentOnWall(wall, opening.offset);

  return {
    wall,
    u,
    n: normalOnWall(wall, opening.offset),
    p1: at(opening.offset - opening.width / 2),
    p2: at(opening.offset + opening.width / 2),
    center: at(opening.offset),
  };
}

export function pickAt(floor, p, tol, defaultThickness, layers = null) {
  for (const opening of canPick(layers, 'openings') ? floor.openings : []) {
    const span = openingSpan(floor, opening);
    if (!span) continue;
    const hit = projectOnSegment(p, span.p1, span.p2);
    const half = (span.wall.thickness ?? defaultThickness) / 2;
    if (hit.distance <= Math.max(half, tol)) return { kind: 'opening', id: opening.id };
  }

  let bestWall = null;
  let bestDistance = Infinity;
  (canPick(layers, 'walls') ? floor.walls : []).forEach((wall) => {
    const hit = projectOnWall(p, wall);
    const reach = Math.max((wall.thickness ?? defaultThickness) / 2, tol);
    if (hit.distance <= reach && hit.distance < bestDistance) {
      bestWall = wall;
      bestDistance = hit.distance;
    }
  });
  if (bestWall) return { kind: 'wall', id: bestWall.id };

  if (canPick(layers, 'roofs')) {
    const roof = [...floor.roofs].reverse().find((r) => polygonEdgeDistance(r, p) <= Math.max(tol, 0.12));
    if (roof) return { kind: 'roof', id: roof.id };
  }

  const decor = canPick(layers, 'decor') ? decorAt(floor, p, tol) : null;
  if (decor) return { kind: 'decor', id: decor };

  if (canPick(layers, 'stairs')) {
    const stairs = [...floor.stairs].reverse().find((st) => pointInPolygon(p, st.points));
    if (stairs) return { kind: 'stairs', id: stairs.id };
  }

  if (canPick(layers, 'rooms')) {
    const room = [...floor.rooms].reverse().find((r) => pointInPolygon(p, r.polygon));
    if (room) return { kind: 'room', id: room.id };
  }

  if (canPick(layers, 'yards')) {
    const yard = [...floor.yards].reverse().find((y) => pointInPolygon(p, y.points));
    if (yard) return { kind: 'yard', id: yard.id };
  }
  return null;
}

function polygonEdgeDistance(item, p) {
  const pts = item.points;
  let best = Infinity;
  pts.forEach((a, i) => {
    best = Math.min(best, projectOnSegment(p, a, pts[(i + 1) % pts.length]).distance);
  });
  const inside = pointInPolygon(p, pts);
  const o = item.overhang ?? 0;
  return o ? Math.abs((inside ? -best : best) - o) : best;
}

function decorAt(floor, p, tol) {
  const hits = decorPieces(floor).filter(({ shape }) => {
    if (shape.kind === 'rect') {
      return p[0] >= shape.minX && p[0] <= shape.maxX && p[1] >= shape.minZ && p[1] <= shape.maxZ;
    }
    return projectOnSegment(p, shape.a, shape.b).distance <= Math.max(0.1, tol);
  });
  const best = hits.find((h) => h.shape.kind === 'segment') ?? hits[0];
  return best?.group ?? null;
}

export function itemsInRect(floor, rect, layers = null) {
  const inside = ([x, z]) => x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
  const items = [];

  (canPick(layers, 'walls') ? floor.walls : []).forEach((wall) => {
    const points = wallPolyline(wall);
    const touches = points.slice(1).some((q, i) => segmentIntersectsRect(points[i], q, rect));
    if (touches) items.push({ kind: 'wall', id: wall.id });
  });
  (canPick(layers, 'openings') ? floor.openings : []).forEach((opening) => {
    const span = openingSpan(floor, opening);
    if (span && inside(span.center)) items.push({ kind: 'opening', id: opening.id });
  });
  (canPick(layers, 'rooms') ? floor.rooms : []).forEach((room) => {
    const b = boundsOf(room.polygon);
    if (b && inside([b.minX, b.minZ]) && inside([b.maxX, b.maxZ])) items.push({ kind: 'room', id: room.id });
  });
  const fully = (r) => inside([r.minX, r.minZ]) && inside([r.maxX, r.maxZ]);
  (canPick(layers, 'roofs') ? floor.roofs : []).forEach((r) => fully(r) && items.push({ kind: 'roof', id: r.id }));
  (canPick(layers, 'yards') ? floor.yards : []).forEach((y) => fully(y) && items.push({ kind: 'yard', id: y.id }));
  (canPick(layers, 'stairs') ? floor.stairs : []).forEach((st) => fully(st) && items.push({ kind: 'stairs', id: st.id }));
  const seen = new Set();
  (canPick(layers, 'decor') ? decorPieces(floor) : []).forEach(({ group, shape }) => {
    const [cx, cz] = shapeCenter(shape);
    if (!seen.has(group) && inside([cx, cz])) {
      seen.add(group);
      items.push({ kind: 'decor', id: group });
    }
  });
  return items;
}

export function bulgeHandleAt(wall, p, tol) {
  if (!wall) return null;
  const arc = arcOf(wall);
  const mid = arc ? arc.apex : [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  return distance(p, mid) <= tol ? mid : null;
}

export function measureSnapAt(floor, p, tol) {
  const corner = vertexAt(floor, p, tol);
  if (corner) return { point: corner, kind: 'corner' };

  let best = null;
  floor.walls.forEach((wall) => {
    const arc = arcOf(wall);
    const mid = arc ? arc.apex : [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
    const d = distance(p, mid);
    if (d <= tol && (!best || d < best.d)) best = { point: mid, kind: 'mid', d };
  });
  if (best) return { point: best.point, kind: 'mid' };

  floor.walls.forEach((wall) => {
    const hit = projectOnWall(p, wall);
    if (hit.distance <= tol && (!best || hit.distance < best.d)) best = { point: hit.point, kind: 'edge', d: hit.distance };
  });
  return best ? { point: best.point, kind: 'edge' } : null;
}

export function measureAt(measures, p, tol) {
  let best = null;
  measures.forEach((m) => {
    const da = distance(p, m.a);
    const db = distance(p, m.b);
    if (da <= tol * 1.4 && (!best || da < best.d)) best = { id: m.id, part: 'a', d: da - tol };
    if (db <= tol * 1.4 && (!best || db < best.d)) best = { id: m.id, part: 'b', d: db - tol };
    const body = projectOnSegment(p, m.a, m.b).distance;
    if (body <= tol && (!best || body < best.d)) best = { id: m.id, part: 'body', d: body };
  });
  return best ? { id: best.id, part: best.part } : null;
}

export function roomEdgeMidpoints(floor, room) {
  const corners = room.corners ?? room.polygon;
  const result = [];
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % corners.length];
    const curved = floor.walls.some(
      (w) => w.bulge && ((distance(w.a, p) < 1e-3 && distance(w.b, q) < 1e-3) || (distance(w.a, q) < 1e-3 && distance(w.b, p) < 1e-3)),
    );
    if (curved || distance(p, q) < 0.4) return;
    result.push({ point: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], index: i });
  });
  return result;
}

export function edgePointAt(floor, p, tol) {
  const near = nearestWall(floor, p, tol);
  if (near) {
    const point = projectOnWall(p, near.wall).point;
    return { point, wall: near.wall, a: near.wall.a, b: near.wall.b, distance: near.distance };
  }

  let best = null;
  floor.rooms.forEach((room) => {
    const corners = room.corners ?? room.polygon;
    corners.forEach((c, i) => {
      const q = corners[(i + 1) % corners.length];
      const hit = projectOnSegment(p, c, q);
      if (hit.distance <= tol && (!best || hit.distance < best.distance)) {
        best = { point: hit.point, wall: null, a: c, b: q, distance: hit.distance };
      }
    });
  });
  return best;
}

export function rectPinAt(item, p, tol) {
  const pts = item?.points;
  if (!pts) return null;
  for (let i = 0; i < pts.length; i++) {
    if (distance(p, pts[i]) <= tol) return { type: 'pin', index: i };
  }
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length];
    const mid = [(pts[i][0] + q[0]) / 2, (pts[i][1] + q[1]) / 2];
    if (distance(p, mid) <= tol && distance(pts[i], q) > tol * 2.2) return { type: 'mid', index: i };
  }
  return null;
}
