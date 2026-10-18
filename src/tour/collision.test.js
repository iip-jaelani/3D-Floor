import { describe, expect, it } from 'vitest';
import { pushOutOfBox, pushOutOfSegment, resolveCollisions, wallBlockers } from './collision.js';

describe('wallBlockers', () => {
  const floor = {
    walls: [{ id: 'w', a: [0, 0], b: [10, 0] }],
    openings: [
      { wallId: 'w', type: 'door', offset: 5, width: 1 },
      { wallId: 'w', type: 'window', offset: 8, width: 1 },
    ],
  };

  it('memberi lubang pada pintu, bukan pada jendela', () => {
    const blockers = wallBlockers(floor, 0.12);
    expect(blockers).toHaveLength(2);
    expect(blockers[0].b[0]).toBeCloseTo(4.5);
    expect(blockers[1].a[0]).toBeCloseTo(5.5);
    expect(blockers[1].b[0]).toBeCloseTo(10);
    expect(blockers[0].r).toBeCloseTo(0.06);
  });
});

describe('pushOutOfSegment', () => {
  const wall = { a: [0, 0], b: [10, 0], r: 0.06 };

  it('mendorong ke sisi yang sama', () => {
    const [x, z] = pushOutOfSegment([5, 0.1], 0.25, wall);
    expect(x).toBeCloseTo(5);
    expect(z).toBeCloseTo(0.31);

    const [, z2] = pushOutOfSegment([5, -0.1], 0.25, wall);
    expect(z2).toBeCloseTo(-0.31);
  });

  it('tidak mengubah posisi yang bebas', () => {
    expect(pushOutOfSegment([5, 1], 0.25, wall)).toEqual([5, 1]);
  });

  it('titik tepat di garis tembok tetap didorong keluar', () => {
    const [, z] = pushOutOfSegment([5, 0], 0.25, wall);
    expect(Math.abs(z)).toBeCloseTo(0.31);
  });
});

describe('pushOutOfBox', () => {
  const box = { minX: 0, maxX: 2, minZ: 0, maxZ: 1 };

  it('mendorong dari luar mendekati sisi', () => {
    const [x] = pushOutOfBox([2.1, 0.5], 0.25, box);
    expect(x).toBeCloseTo(2.25);
  });

  it('mengeluarkan titik yang berada di dalam kotak lewat sisi terdekat', () => {
    const [x, z] = pushOutOfBox([1.9, 0.5], 0.25, box);
    expect(x).toBeCloseTo(2.25);
    expect(z).toBeCloseTo(0.5);
  });
});

describe('resolveCollisions', () => {
  it('pemain bisa lewat celah pintu 0,9 m tetapi tidak menembus tembok', () => {
    const floor = {
      walls: [{ id: 'w', a: [0, 0], b: [10, 0] }],
      openings: [{ wallId: 'w', type: 'door', offset: 5, width: 0.9 }],
    };
    const blockers = wallBlockers(floor, 0.12);

    const throughDoor = resolveCollisions([5, 0], 0.22, blockers, []);
    expect(throughDoor[1]).toBeCloseTo(0);

    const intoWall = resolveCollisions([2, 0.02], 0.22, blockers, []);
    expect(Math.abs(intoWall[1])).toBeGreaterThan(0.27);
  });
});
