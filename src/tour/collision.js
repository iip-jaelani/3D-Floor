import { projectOnSegment, wallLength, wallSlice } from '../plan/geometry.js';

export function wallBlockers(floor, defaultThickness) {
  const blockers = [];

  floor.walls.forEach((wall) => {
    const length = wallLength(wall);
    if (!length) return;

    const r = (wall.thickness ?? defaultThickness) / 2;
    const add = (t0, t1) => {
      if (t1 - t0 <= 1e-3) return;
      const points = wallSlice(wall, t0, t1);
      for (let i = 1; i < points.length; i++) blockers.push({ a: points[i - 1], b: points[i], r });
    };

    const doors = floor.openings
      .filter((o) => o.wallId === wall.id && o.type === 'door')
      .sort((p, q) => p.offset - q.offset);

    let cursor = 0;
    doors.forEach((door) => {
      add(cursor, door.offset - door.width / 2);
      cursor = door.offset + door.width / 2;
    });
    add(cursor, length);
  });

  return blockers;
}

export function pushOutOfSegment(p, radius, segment) {
  const hit = projectOnSegment(p, segment.a, segment.b);
  const clearance = segment.r + radius;
  if (hit.distance >= clearance) return p;

  let nx;
  let nz;
  if (hit.distance < 1e-6) {
    const dx = segment.b[0] - segment.a[0];
    const dz = segment.b[1] - segment.a[1];
    const l = Math.hypot(dx, dz) || 1;
    nx = -dz / l;
    nz = dx / l;
  } else {
    nx = (p[0] - hit.point[0]) / hit.distance;
    nz = (p[1] - hit.point[1]) / hit.distance;
  }
  return [hit.point[0] + nx * clearance, hit.point[1] + nz * clearance];
}

export function pushOutOfBox(p, radius, box) {
  const cx = Math.min(Math.max(p[0], box.minX), box.maxX);
  const cz = Math.min(Math.max(p[1], box.minZ), box.maxZ);
  const dx = p[0] - cx;
  const dz = p[1] - cz;
  const distance = Math.hypot(dx, dz);

  if (distance >= radius) return p;

  if (distance > 1e-6) {
    return [cx + (dx / distance) * radius, cz + (dz / distance) * radius];
  }

  const exits = [
    [box.minX - radius, p[1], p[0] - box.minX],
    [box.maxX + radius, p[1], box.maxX - p[0]],
    [p[0], box.minZ - radius, p[1] - box.minZ],
    [p[0], box.maxZ + radius, box.maxZ - p[1]],
  ].sort((a, b) => a[2] - b[2]);
  return [exits[0][0], exits[0][1]];
}

export function resolveCollisions(p, radius, blockers, boxes, iterations = 3) {
  let position = p;
  for (let i = 0; i < iterations; i++) {
    blockers.forEach((segment) => (position = pushOutOfSegment(position, radius, segment)));
    boxes.forEach((box) => (position = pushOutOfBox(position, radius, box)));
  }
  return position;
}
