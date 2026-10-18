import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  clampOpeningOffset,
  openingsOverlap,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  projectOnSegment,
  rectPolygon,
  segmentCovers,
  segmentIntersectsRect,
  splitSegment,
} from './geometry.js';

describe('projectOnSegment', () => {
  it('memproyeksikan titik ke tengah segmen', () => {
    const r = projectOnSegment([2, 3], [0, 0], [4, 0]);
    expect(r.t).toBeCloseTo(2);
    expect(r.distance).toBeCloseTo(3);
    expect(r.point).toEqual([2, 0]);
  });

  it('di-clamp ke ujung segmen', () => {
    const r = projectOnSegment([10, 0], [0, 0], [4, 0]);
    expect(r.t).toBeCloseTo(4);
    expect(r.distance).toBeCloseTo(6);
  });
});

describe('segmentCovers', () => {
  const outer = { a: [0, 0], b: [10, 0] };
  it('menerima segmen yang terkandung', () => {
    expect(segmentCovers(outer, { a: [2, 0], b: [5, 0] })).toBe(true);
    expect(segmentCovers(outer, { a: [5, 0], b: [2, 0] })).toBe(true);
  });
  it('menolak yang keluar jangkauan atau tidak sejajar', () => {
    expect(segmentCovers(outer, { a: [8, 0], b: [12, 0] })).toBe(false);
    expect(segmentCovers(outer, { a: [2, 0], b: [5, 1] })).toBe(false);
  });
});

describe('splitSegment', () => {
  it('memecah di titik yang jatuh di tengah segmen saja', () => {
    const pieces = splitSegment([0, 0], [10, 0], [[4, 0], [0, 0], [10, 0], [5, 3]]);
    expect(pieces).toEqual([
      { a: [0, 0], b: [4, 0] },
      { a: [4, 0], b: [10, 0] },
    ]);
  });
  it('tanpa titik potong mengembalikan segmen utuh', () => {
    expect(splitSegment([0, 0], [3, 0], [])).toEqual([{ a: [0, 0], b: [3, 0] }]);
  });
});

describe('polygon', () => {
  const square = rectPolygon([4, 3], [0, 0]);
  it('rectPolygon menormalkan sudut', () => {
    expect(square).toEqual([[0, 0], [4, 0], [4, 3], [0, 3]]);
  });
  it('luas, centroid, dan bounds', () => {
    expect(polygonArea(square)).toBeCloseTo(12);
    expect(polygonCentroid(square)[0]).toBeCloseTo(2);
    expect(polygonCentroid(square)[1]).toBeCloseTo(1.5);
    expect(boundsOf(square)).toEqual({ minX: 0, maxX: 4, minZ: 0, maxZ: 3 });
  });
  it('pointInPolygon', () => {
    expect(pointInPolygon([1, 1], square)).toBe(true);
    expect(pointInPolygon([5, 1], square)).toBe(false);
  });
});

describe('opening helpers', () => {
  it('clampOpeningOffset menjaga bukaan tetap di dalam tembok', () => {
    expect(clampOpeningOffset(0, 1, 5)).toBeCloseTo(0.55);
    expect(clampOpeningOffset(9, 1, 5)).toBeCloseTo(4.45);
    expect(clampOpeningOffset(2, 1, 5)).toBeCloseTo(2);
  });
  it('clampOpeningOffset null jika tembok terlalu pendek', () => {
    expect(clampOpeningOffset(0.5, 1, 1)).toBeNull();
  });
  it('openingsOverlap', () => {
    expect(openingsOverlap(1, 0.9, 1.5, 0.9)).toBe(true);
    expect(openingsOverlap(1, 0.9, 3, 0.9)).toBe(false);
  });
});

describe('segmentIntersectsRect', () => {
  const rect = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };
  it('segmen di dalam atau memotong persegi', () => {
    expect(segmentIntersectsRect([1, 1], [2, 2], rect)).toBe(true);
    expect(segmentIntersectsRect([-2, 2], [6, 2], rect)).toBe(true);
    expect(segmentIntersectsRect([3, 3], [8, 8], rect)).toBe(true);
  });
  it('segmen di luar persegi', () => {
    expect(segmentIntersectsRect([5, 0], [5, 4], rect)).toBe(false);
    expect(segmentIntersectsRect([-3, -1], [-1, 6], rect)).toBe(false);
    expect(segmentIntersectsRect([0, 5], [4, 5], rect)).toBe(false);
  });
});

import {
  arcOf as _arcOf,
  arcToChordRatio,
  pointOnWall,
  projectOnWall,
  sagittaForRadius,
  tangentOnWall,
  wallLength as _wallLength,
  wallPolyline,
} from './geometry.js';

describe('tembok lengkung', () => {
  const half = { a: [0, 0], b: [4, 0], bulge: 2 };
  const near = (x, y, eps = 1e-6) => expect(Math.abs(x - y)).toBeLessThan(eps);

  it('tembok lurus tidak punya busur dan panjangnya = jarak', () => {
    expect(_arcOf({ a: [0, 0], b: [3, 4] })).toBeNull();
    expect(_wallLength({ a: [0, 0], b: [3, 4] })).toBe(5);
  });

  it('setengah lingkaran: radius, panjang busur, titik tengah', () => {
    const arc = _arcOf(half);
    near(arc.radius, 2);
    near(_wallLength(half), Math.PI * 2);
    const mid = pointOnWall(half, _wallLength(half) / 2);
    near(mid[0], 2);
    near(Math.abs(mid[1]), 2);
    expect(arc.apex[1]).toBeGreaterThan(0);
  });

  it('bulge negatif melengkung ke sisi sebaliknya', () => {
    const mid = pointOnWall({ ...half, bulge: -2 }, Math.PI);
    near(mid[1], -2);
  });

  it('ujung busur tepat di a dan b', () => {
    const end = pointOnWall(half, _wallLength(half));
    near(end[0], 4);
    near(end[1], 0, 1e-6);
    const start = pointOnWall(half, 0);
    near(start[0], 0);
  });

  it('proyeksi titik ke busur: t dan jarak', () => {
    const hit = projectOnWall([2, 3], half);
    near(hit.distance, 1);
    near(hit.t, _wallLength(half) / 2);
    const tangent = tangentOnWall(half, _wallLength(half) / 2);
    near(Math.abs(tangent[0]), 1);
  });

  it('di luar rentang busur: memilih ujung terdekat', () => {
    const flat = { a: [0, 0], b: [4, 0], bulge: 0.5 };
    const hit = projectOnWall([-3, 0], flat);
    near(hit.t, 0);
  });

  it('polyline lengkung punya banyak titik dan berawal/berakhir di a/b', () => {
    const points = wallPolyline(half);
    expect(points.length).toBeGreaterThan(8);
    expect(points[0]).toEqual([0, 0]);
    expect(points.at(-1)).toEqual([4, 0]);
  });

  it('sagitta untuk radius & rasio panjang busur', () => {
    near(sagittaForRadius(4, 2), 2);
    expect(sagittaForRadius(4, 1)).toBeNull();
    near(arcToChordRatio(0.5), Math.PI / 2);
    near(arcToChordRatio(0), 1);
  });
});
