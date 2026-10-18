import { describe, expect, it } from 'vitest';
import { findUnroomedAreas } from './autoFloor.js';
import { boundsOf } from './geometry.js';

const T = 0.12;
const wall = (id, a, b) => ({ id, a, b });
const box = (x0, z0, x1, z1, prefix = 'w') => [
  wall(`${prefix}1`, [x0, z0], [x1, z0]),
  wall(`${prefix}2`, [x1, z0], [x1, z1]),
  wall(`${prefix}3`, [x1, z1], [x0, z1]),
  wall(`${prefix}4`, [x0, z1], [x0, z0]),
];

describe('findUnroomedAreas', () => {
  it('mengisi ruang tertutup yang belum punya lantai', () => {
    const [area, ...rest] = findUnroomedAreas({ walls: box(0, 0, 4, 3), rooms: [] }, T);
    expect(rest).toHaveLength(0);

    const b = boundsOf(area.polygon);
    expect(b.minX).toBeCloseTo(0, 1);
    expect(b.maxX).toBeCloseTo(4, 1);
    expect(b.minZ).toBeCloseTo(0, 1);
    expect(b.maxZ).toBeCloseTo(3, 1);
    expect(area.area).toBeCloseTo(12, 0);
  });

  it('hanya mengisi bagian yang belum punya ruangan', () => {
    const walls = [...box(0, 0, 4, 3), wall('mid', [2, 0], [2, 3])];
    const left = { id: 'r1', name: 'Kiri', floor: 'oak', polygon: [[0, 0], [2, 0], [2, 3], [0, 3]] };
    const areas = findUnroomedAreas({ walls, rooms: [left] }, T);

    expect(areas).toHaveLength(1);
    const b = boundsOf(areas[0].polygon);
    expect(b.minX).toBeCloseTo(2, 1);
    expect(b.maxX).toBeCloseTo(4, 1);
  });

  it('tidak membuat apa pun jika semua area sudah punya lantai', () => {
    const room = { id: 'r1', name: 'A', floor: 'oak', polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] };
    expect(findUnroomedAreas({ walls: box(0, 0, 4, 3), rooms: [room] }, T)).toHaveLength(0);
  });

  it('tidak mengisi ruang luar yang tidak tertutup', () => {
    const walls = box(0, 0, 4, 3).slice(0, 3);
    expect(findUnroomedAreas({ walls, rooms: [] }, T)).toHaveLength(0);
  });

  it('tidak menyisakan titik kembar/paku di sekitar tembok yang menjorok ke dalam', () => {
    const walls = [...box(0, 0, 6, 4), wall('stub', [3, 0], [3, 2.5])];
    const [area] = findUnroomedAreas({ walls, rooms: [] }, T);

    const keys = area.polygon.map((p) => p.join(','));
    expect(new Set(keys).size).toBe(keys.length);
    expect(area.polygon).toHaveLength(4);
  });

  it('menempelkan titik ke garis tembok miring', () => {
    const walls = [wall('h', [0, 0], [4, 0]), wall('v', [4, 0], [4, 3]), wall('d', [4, 3], [0, 0])];
    const [area] = findUnroomedAreas({ walls, rooms: [] }, T);
    const onDiagonal = (p) => Math.abs(p[1] - (p[0] * 3) / 4) < 0.03;
    const interior = area.polygon.filter((p) => !(p[0] > 3.9 || p[1] < 0.1));
    expect(interior.every(onDiagonal)).toBe(true);
  });

  it('memisahkan dua ruang tertutup', () => {
    const walls = [...box(0, 0, 3, 3, 'a'), ...box(3, 0, 6, 3, 'b').filter((w) => w.id !== 'b4')];
    const areas = findUnroomedAreas({ walls, rooms: [] }, T);
    expect(areas).toHaveLength(2);
  });
});
