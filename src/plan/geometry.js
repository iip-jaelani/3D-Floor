export const EPS = 1e-4;

export const distance = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);

export const samePoint = (p, q, eps = EPS) => Math.abs(p[0] - q[0]) <= eps && Math.abs(p[1] - q[1]) <= eps;

export const MAX_BULGE_RATIO = 0.5;

export const wallChord = (wall) => distance(wall.a, wall.b);

export function arcOf(wall) {
  const raw = wall.bulge;
  if (!raw || Math.abs(raw) < 1e-4) return null;
  const chord = distance(wall.a, wall.b);
  if (chord < 1e-6) return null;

  const sagitta = Math.sign(raw) * Math.min(Math.abs(raw), chord * MAX_BULGE_RATIO);
  const radius = (chord * chord / 4 + sagitta * sagitta) / (2 * Math.abs(sagitta));
  const angle = 4 * Math.atan2(2 * Math.abs(sagitta), chord);

  const ux = (wall.b[0] - wall.a[0]) / chord;
  const uz = (wall.b[1] - wall.a[1]) / chord;
  const normal = [-uz, ux];
  const mid = [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
  const apex = [mid[0] + normal[0] * sagitta, mid[1] + normal[1] * sagitta];
  const offset = sagitta - Math.sign(sagitta) * radius;
  const center = [mid[0] + normal[0] * offset, mid[1] + normal[1] * offset];
  const start = Math.atan2(wall.a[1] - center[1], wall.a[0] - center[0]);

  const at = (dir) => {
    const a = start + (dir * angle) / 2;
    return [center[0] + Math.cos(a) * radius, center[1] + Math.sin(a) * radius];
  };
  const dir = distance(at(1), apex) <= distance(at(-1), apex) ? 1 : -1;

  return { center, radius, angle, start, dir, length: radius * angle, sagitta, apex, normal };
}

export function wallLength(wall) {
  const arc = arcOf(wall);
  return arc ? arc.length : distance(wall.a, wall.b);
}

export function pointOnWall(wall, t) {
  const arc = arcOf(wall);
  if (!arc) {
    const length = distance(wall.a, wall.b) || 1;
    const f = t / length;
    return [wall.a[0] + (wall.b[0] - wall.a[0]) * f, wall.a[1] + (wall.b[1] - wall.a[1]) * f];
  }
  const a = arc.start + arc.dir * (t / arc.radius);
  return [arc.center[0] + Math.cos(a) * arc.radius, arc.center[1] + Math.sin(a) * arc.radius];
}

export function tangentOnWall(wall, t) {
  const arc = arcOf(wall);
  if (!arc) {
    const length = distance(wall.a, wall.b) || 1;
    return [(wall.b[0] - wall.a[0]) / length, (wall.b[1] - wall.a[1]) / length];
  }
  const a = arc.start + arc.dir * (t / arc.radius);
  return [-Math.sin(a) * arc.dir, Math.cos(a) * arc.dir];
}

export function normalOnWall(wall, t) {
  const [tx, tz] = tangentOnWall(wall, t);
  return [-tz, tx];
}

export function projectOnWall(p, wall) {
  const arc = arcOf(wall);
  if (!arc) {
    const hit = projectOnSegment(p, wall.a, wall.b);
    return { ...hit, tangent: tangentOnWall(wall, 0) };
  }

  const TWO_PI = Math.PI * 2;
  const heading = Math.atan2(p[1] - arc.center[1], p[0] - arc.center[0]);
  let rel = (arc.dir * (heading - arc.start)) % TWO_PI;
  if (rel < 0) rel += TWO_PI;

  let t;
  if (rel <= arc.angle) {
    t = rel * arc.radius;
  } else {
    t = distance(p, wall.a) <= distance(p, wall.b) ? 0 : arc.length;
  }
  const point = pointOnWall(wall, t);
  return { t, length: arc.length, point, distance: distance(p, point), tangent: tangentOnWall(wall, t) };
}

export function wallPolyline(wall, maxStepAngle = Math.PI / 24) {
  const arc = arcOf(wall);
  if (!arc) return [[wall.a[0], wall.a[1]], [wall.b[0], wall.b[1]]];

  const steps = Math.max(2, Math.ceil(arc.angle / maxStepAngle));
  const points = [];
  for (let i = 0; i <= steps; i++) points.push(pointOnWall(wall, (arc.length * i) / steps));
  points[0] = [wall.a[0], wall.a[1]];
  points[steps] = [wall.b[0], wall.b[1]];
  return points;
}

export function wallSlice(wall, t0, t1, maxStepAngle = Math.PI / 24) {
  const arc = arcOf(wall);
  if (!arc) return [pointOnWall(wall, t0), pointOnWall(wall, t1)];
  const steps = Math.max(1, Math.ceil(((t1 - t0) / arc.radius) / maxStepAngle));
  const points = [];
  for (let i = 0; i <= steps; i++) points.push(pointOnWall(wall, t0 + ((t1 - t0) * i) / steps));
  return points;
}

export function expandPolygon(corners, walls) {
  const curved = walls.filter((w) => arcOf(w));
  if (!curved.length) return corners.map((p) => [p[0], p[1]]);

  const out = [];
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % corners.length];
    out.push([p[0], p[1]]);

    const edgeLength = distance(p, q);
    if (edgeLength < EPS) return;
    const along = (pt) => projectOnSegment(pt, p, q);
    const onEdge = curved
      .filter((w) => along(w.a).distance <= 1e-3 && along(w.b).distance <= 1e-3)
      .sort((w1, w2) => Math.min(along(w1.a).t, along(w1.b).t) - Math.min(along(w2.a).t, along(w2.b).t));

    onEdge.forEach((w) => {
      let points = wallPolyline(w);
      if (along(w.a).t > along(w.b).t) points = [...points].reverse();
      points.forEach((pt) => {
        const last = out[out.length - 1];
        if (!samePoint(last, pt, 1e-4) && !samePoint(pt, q, 1e-4)) out.push([pt[0], pt[1]]);
      });
    });
  });
  return out;
}

export function arcToChordRatio(k) {
  const m = Math.abs(k);
  if (m < 1e-6) return 1;
  return (4 * Math.atan2(2 * m, 1) * (0.25 + m * m)) / (2 * m);
}

export function sagittaForRadius(chord, radius) {
  if (radius < chord / 2 - 1e-9) return null;
  return radius - Math.sqrt(Math.max(radius * radius - (chord * chord) / 4, 0));
}

export const snapToGrid = (value, step = 0.1) => Math.round(value / step) * step;

export function projectOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length = Math.hypot(dx, dz);
  if (length === 0) return { t: 0, length: 0, point: [a[0], a[1]], distance: distance(p, a) };

  const raw = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length;
  const t = Math.min(Math.max(raw, 0), length);
  const point = [a[0] + (dx / length) * t, a[1] + (dz / length) * t];
  return { t, length, point, distance: distance(p, point) };
}

export function segmentCovers(outer, inner, eps = EPS) {
  return (
    projectOnSegment(inner.a, outer.a, outer.b).distance <= eps &&
    projectOnSegment(inner.b, outer.a, outer.b).distance <= eps
  );
}

export function splitSegment(a, b, points, eps = EPS) {
  const length = distance(a, b);
  if (length === 0) return [];

  const cuts = [0, length];
  points.forEach((point) => {
    const { t, distance: d } = projectOnSegment(point, a, b);
    if (d <= eps && t > eps && t < length - eps) cuts.push(t);
  });
  cuts.sort((x, y) => x - y);

  const unique = cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > eps);
  const at = (t) => [a[0] + ((b[0] - a[0]) * t) / length, a[1] + ((b[1] - a[1]) * t) / length];
  return unique.slice(1).map((t, i) => ({ a: at(unique[i]), b: at(t) }));
}

export function pointInPolygon(p, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const crosses = zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function polygonArea(polygon) {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(polygon) {
  const n = polygon.length;
  const mean = [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];

  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const cross = polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    area += cross;
    cx += (polygon[j][0] + polygon[i][0]) * cross;
    cz += (polygon[j][1] + polygon[i][1]) * cross;
  }
  if (Math.abs(area) < 1e-9) return mean;
  return [cx / (3 * area), cz / (3 * area)];
}

export function boundsOf(points) {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]);
  const zs = points.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

export function rectPolygon(p1, p2) {
  const minX = Math.min(p1[0], p2[0]);
  const maxX = Math.max(p1[0], p2[0]);
  const minZ = Math.min(p1[1], p2[1]);
  const maxZ = Math.max(p1[1], p2[1]);
  return [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ];
}

export function clampOpeningOffset(offset, width, wallLen, margin = 0.05) {
  const min = width / 2 + margin;
  const max = wallLen - width / 2 - margin;
  if (max < min) return null;
  return Math.min(Math.max(offset, min), max);
}

export function openingsOverlap(offsetA, widthA, offsetB, widthB, gap = 0.05) {
  return Math.abs(offsetA - offsetB) < (widthA + widthB) / 2 + gap;
}

export function segmentIntersectsRect(a, b, rect) {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];

  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };

  return (
    clip(-dx, a[0] - rect.minX) &&
    clip(dx, rect.maxX - a[0]) &&
    clip(-dz, a[1] - rect.minZ) &&
    clip(dz, rect.maxZ - a[1])
  );
}

export function signedArea(polygon) {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
  }
  return sum / 2;
}

export function convexHull(points) {
  const pts = [...points].map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (unique.length < 3) return unique;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list) => {
    const out = [];
    list.forEach((p) => {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 1e-9) out.pop();
      out.push(p);
    });
    out.pop();
    return out;
  };
  return [...build(unique), ...build([...unique].reverse())];
}

export function offsetPolygon(polygon, d) {
  if (!d || polygon.length < 3) return polygon.map((p) => [p[0], p[1]]);
  const ccw = signedArea(polygon) > 0;
  const n = polygon.length;
  return polygon.map((p, i) => {
    const prev = polygon[(i + n - 1) % n];
    const next = polygon[(i + 1) % n];
    const normal = (a, b) => {
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      return ccw ? [dz / l, -dx / l] : [-dz / l, dx / l];
    };
    const n1 = normal(prev, p);
    const n2 = normal(p, next);
    const bx = n1[0] + n2[0];
    const bz = n1[1] + n2[1];
    const dot = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    const scale = Math.min(d / Math.max(dot / 2, 0.25), d * 4);
    return [p[0] + (bx / 2) * (scale / (dot / 2 || 1)) * (dot / 2), p[1] + (bz / 2) * (scale / (dot / 2 || 1)) * (dot / 2)];
  });
}
