import { boundsOf, pointInPolygon, polygonArea, projectOnSegment, projectOnWall, wallPolyline } from './geometry.js';

const CELL = 0.03;
const MIN_AREA = 1.0;
const SIMPLIFY_TOLERANCE = 0.05;
const SNAP_TO_VERTEX = 0.1;
const SNAP_TO_LINE = 0.08;
const MARGIN = 1;

const WALL = 1;
const ROOM = 2;
const OUTSIDE = 4;

export function findUnroomedAreas(floor, wallThickness) {
  if (!floor.walls.length) return [];

  const bounds = boundsOf([...floor.walls.flatMap((w) => wallPolyline(w)), ...floor.rooms.flatMap((r) => r.polygon)]);
  const minX = bounds.minX - MARGIN;
  const minZ = bounds.minZ - MARGIN;
  const width = Math.ceil((bounds.maxX + MARGIN - minX) / CELL) + 1;
  const height = Math.ceil((bounds.maxZ + MARGIN - minZ) / CELL) + 1;
  const flags = new Uint8Array(width * height);

  const centerOf = (x, z) => [minX + (x + 0.5) * CELL, minZ + (z + 0.5) * CELL];
  const cellRange = (lo, hi, origin, limit) => [
    Math.max(0, Math.floor((lo - origin) / CELL)),
    Math.min(limit - 1, Math.ceil((hi - origin) / CELL)),
  ];

  floor.walls.forEach((wall) => {
    const half = (wall.thickness ?? wallThickness) / 2 + CELL / 2;
    const outline = wallPolyline(wall);
    const xs = outline.map((q) => q[0]);
    const zs = outline.map((q) => q[1]);
    const [x0, x1] = cellRange(Math.min(...xs) - half, Math.max(...xs) + half, minX, width);
    const [z0, z1] = cellRange(Math.min(...zs) - half, Math.max(...zs) + half, minZ, height);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (projectOnWall(centerOf(x, z), wall).distance <= half) flags[z * width + x] |= WALL;
      }
    }
  });

  floor.rooms.forEach((room) => {
    const b = boundsOf(room.polygon);
    const [x0, x1] = cellRange(b.minX, b.maxX, minX, width);
    const [z0, z1] = cellRange(b.minZ, b.maxZ, minZ, height);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        if (pointInPolygon(centerOf(x, z), room.polygon)) flags[z * width + x] |= ROOM;
      }
    }
  });

  fill(flags, width, height, 0, (f) => !(f & WALL), OUTSIDE);

  const k = Math.ceil((wallThickness / 2) / CELL);
  const areas = [];
  const seen = new Uint8Array(width * height);

  for (let start = 0; start < flags.length; start++) {
    if (seen[start] || flags[start] !== 0) continue;

    const cells = [];
    fill(seen, width, height, start, (_, i) => flags[i] === 0, 1, cells);
    if (cells.length * CELL * CELL < MIN_AREA) continue;

    const mask = new Uint8Array(width * height);
    cells.forEach((i) => {
      const cx = i % width;
      const cz = (i - cx) / width;
      for (let dz = -k; dz <= k; dz++) {
        for (let dx = -k; dx <= k; dx++) {
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= width || z >= height) continue;
          if (!(flags[z * width + x] & ROOM)) mask[z * width + x] = 1;
        }
      }
    });

    const ring = traceOuterRing(mask, width, height);
    if (!ring) continue;

    const world = ring.map(([x, z]) => [minX + x * CELL, minZ + z * CELL]);
    const polygon = tidyRing(world, floor.walls);
    if (polygon.length >= 3 && polygonArea(polygon) >= MIN_AREA) {
      areas.push({ polygon, area: polygonArea(polygon) });
    }
  }

  return areas.sort((a, b) => b.area - a.area);
}

function fill(target, width, height, start, canEnter, mark, collect = null) {
  if (!canEnter(target[start], start) || target[start] === mark) return;
  const stack = [start];
  target[start] |= mark;

  while (stack.length) {
    const i = stack.pop();
    collect?.push(i);
    const x = i % width;
    const z = (i - x) / width;
    const neighbors = [x > 0 && i - 1, x < width - 1 && i + 1, z > 0 && i - width, z < height - 1 && i + width];

    neighbors.forEach((n) => {
      if (n === false || (target[n] & mark) || !canEnter(target[n], n)) return;
      target[n] |= mark;
      stack.push(n);
    });
  }
}

function traceOuterRing(mask, width, height) {
  const on = (x, z) => x >= 0 && z >= 0 && x < width && z < height && mask[z * width + x] === 1;
  const stride = width + 1;
  const outgoing = new Map();
  const add = (x0, z0, x1, z1) => {
    const key = z0 * stride + x0;
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(z1 * stride + x1);
  };

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (!on(x, z)) continue;
      if (!on(x, z - 1)) add(x, z, x + 1, z);
      if (!on(x + 1, z)) add(x + 1, z, x + 1, z + 1);
      if (!on(x, z + 1)) add(x + 1, z + 1, x, z + 1);
      if (!on(x - 1, z)) add(x, z + 1, x, z);
    }
  }

  let best = null;
  let bestArea = 0;
  while (outgoing.size) {
    const [startKey] = outgoing.keys();
    const ring = [];
    let key = startKey;

    do {
      ring.push(key);
      const next = outgoing.get(key);
      const target = next.pop();
      if (!next.length) outgoing.delete(key);
      key = target;
    } while (key !== startKey && outgoing.has(key));

    const points = ring.map((k) => [k % stride, Math.floor(k / stride)]);
    const area = polygonArea(points);
    if (area > bestArea) {
      best = points;
      bestArea = area;
    }
  }
  return best;
}

function tidyRing(points, walls) {
  const simplified = simplifyRing(dropCollinear(points, 1e-9), SIMPLIFY_TOLERANCE);
  const snapped = simplified.map((p) => snapToWalls(p, walls));
  return dropCollinear(dropDuplicates(removeSpikes(snapped)), 0.01);
}

function snapToWalls(p, walls) {
  let vertex = null;
  let vertexDistance = SNAP_TO_VERTEX;
  let line = null;
  let lineDistance = SNAP_TO_LINE;

  walls.forEach((wall) => {
    [wall.a, wall.b].forEach((e) => {
      const d = Math.hypot(e[0] - p[0], e[1] - p[1]);
      if (d <= vertexDistance) {
        vertex = e;
        vertexDistance = d;
      }
    });
    const hit = projectOnWall(p, wall);
    if (hit.distance <= lineDistance) {
      line = hit.point;
      lineDistance = hit.distance;
    }
  });

  if (vertex) return [vertex[0], vertex[1]];
  if (line) return [Math.round(line[0] * 1000) / 1000, Math.round(line[1] * 1000) / 1000];
  return [Math.round(p[0] * 200) / 200, Math.round(p[1] * 200) / 200];
}

function removeSpikes(points) {
  const out = [];
  points.forEach((p) => {
    const i = out.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6);
    if (i < 0) {
      out.push(p);
      return;
    }
    const loop = out.splice(i + 1);
    if (polygonArea([out[i], ...loop]) > 1e-6) out.push(...loop, p);
  });
  return out;
}

function dropDuplicates(points) {
  return points.filter((p, i) => {
    const prev = points[(i + points.length - 1) % points.length];
    return Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6;
  });
}

function dropCollinear(points, tolerance) {
  if (points.length < 4) return points;
  return points.filter((p, i) => {
    const prev = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    return projectOnSegment(p, prev, next).distance > tolerance;
  });
}

function simplifyRing(points, tolerance) {
  let a = 0;
  let b = 0;
  let far = -1;
  points.forEach((p, i) => {
    points.forEach((q, j) => {
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
      if (d > far) {
        far = d;
        a = i;
        b = j;
      }
    });
  });
  if (a > b) [a, b] = [b, a];

  const first = points.slice(a, b + 1);
  const second = [...points.slice(b), ...points.slice(0, a + 1)];
  return [...douglasPeucker(first, tolerance).slice(0, -1), ...douglasPeucker(second, tolerance).slice(0, -1)];
}

function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;
  const [start, end] = [points[0], points[points.length - 1]];

  let index = 0;
  let max = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = projectOnSegment(points[i], start, end).distance;
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max <= tolerance) return [start, end];

  const left = douglasPeucker(points.slice(0, index + 1), tolerance);
  const right = douglasPeucker(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}
