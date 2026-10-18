import { describe, expect, it } from 'vitest';
import { freeSpotBeside, openingGaps, snapOpening } from './openingSnap.js';

const wall = { id: 'w', a: [0, 0], b: [6, 0] };
const floor = (openings = []) => ({ walls: [wall], openings });
const win = (id, offset, width = 1) => ({ id, wallId: 'w', type: 'window', offset, width });

describe('snapOpening', () => {
  it('menempel ke tengah tembok', () => {
    const r = snapOpening(floor(), wall, { offset: 3.03, width: 1 }, 0.1);
    expect(r.offset).toBeCloseTo(3);
    expect(r.kind).toBe('center');
    expect(r.gaps.left.len).toBeCloseTo(2.5);
    expect(r.gaps.right.len).toBeCloseTo(2.5);
  });

  it('menempel ke tengah di antara dua bukaan (jarak kiri = kanan)', () => {
    const f = floor([win('a', 1), win('b', 5)]);
    const r = snapOpening(f, wall, { offset: 3.04, width: 1 }, 0.1);
    expect(r.offset).toBeCloseTo(3);
    expect(r.gaps.left.kind).toBe('opening');
    expect(r.gaps.left.len).toBeCloseTo(r.gaps.right.len);
  });

  it('sejajar tengah bukaan lain', () => {
    const f = floor([win('a', 1.2, 0.8)]);
    const r = snapOpening(f, wall, { offset: 1.25, width: 1 }, 0.1);
    expect(r.offset).toBeCloseTo(1.2);
    expect(r.kind).toBe('align');
  });

  it('jarak bulat 5 cm dan tanpa magnet di luar toleransi', () => {
    const r = snapOpening(floor(), wall, { offset: 1.62, width: 1 }, 0.05);
    expect(r.kind).toBe('round');
    expect(r.gaps.left.len).toBeCloseTo(1.1);
    expect(snapOpening(floor(), wall, { offset: 1.32, width: 1 }, 0.01).kind).toBeNull();
  });

  it('mengabaikan bukaan sendiri saat digeser', () => {
    const f = floor([win('a', 3)]);
    const r = snapOpening(f, wall, { offset: 3.02, width: 1, ignoreId: 'a' }, 0.1);
    expect(r.kind).toBe('center');
  });
});

describe('openingGaps & freeSpotBeside', () => {
  it('menghitung celah ke ujung tembok', () => {
    const g = openingGaps(floor(), wall, { offset: 1, width: 1 });
    expect(g.left.len).toBeCloseTo(0.5);
    expect(g.right.len).toBeCloseTo(4.5);
  });

  it('mencari tempat kosong di samping', () => {
    const a = win('a', 3);
    const spot = freeSpotBeside(floor([a]), wall, a);
    expect(spot).toBeCloseTo(4.3);
  });
});

describe('snap lintas tembok', () => {
  it('sejajar dengan jendela di tembok seberang', () => {
    const top = { id: 'w', a: [0, 0], b: [8, 0] };
    const bottom = { id: 'v', a: [0, 4], b: [8, 4] };
    const f = {
      walls: [top, bottom],
      openings: [{ id: 'o', wallId: 'v', type: 'window', offset: 2.2, width: 1 }],
    };
    const r = snapOpening(f, top, { offset: 2.3, width: 1 }, 0.15);
    expect(r.offset).toBeCloseTo(2.2);
    expect(r.kind).toBe('cross');
  });
});
