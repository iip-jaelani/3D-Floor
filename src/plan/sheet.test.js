import { describe, expect, it } from 'vitest';
import { Plan } from './Plan.js';
import { insetPolygon, netArea } from './annotations.js';
import { buildSheet } from './sheet.js';

const make = () => {
  const plan = new Plan({ name: 'Rumah Uji', wallHeight: 3, wallThickness: 0.15, floors: [{ id: 'floor-1', name: 'Lantai 1', level: 0 }] });
  plan.addRoom('floor-1', [0, 0], [5, 4]);
  const top = plan.floor('floor-1').walls.find((w) => w.a[1] === 0 && w.b[1] === 0);
  plan.addOpening('floor-1', { wallId: top.id, type: 'door', offset: 1 });
  plan.addOpening('floor-1', { wallId: top.id, type: 'window', offset: 3.5 });
  plan.addStairs('floor-1', [6, 0], [8, 1]);
  return plan;
};

describe('lembar gambar kerja', () => {
  it('luas bersih = ruang dikurangi setengah tebal dinding', () => {
    const plan = make();
    const room = plan.floor('floor-1').rooms[0];
    expect(netArea(plan, room)).toBeCloseTo((5 - 0.15) * (4 - 0.15), 3);
    const inset = insetPolygon([[0, 0], [2, 0], [2, 2], [0, 2]], 0.1);
    expect(inset.map((p) => p.map((v) => +v.toFixed(3)))).toEqual([[0.1, 0.1], [1.9, 0.1], [1.9, 1.9], [0.1, 1.9]]);
  });

  it('SVG A3 berskala, memuat kop gambar, ukuran, kode, dan tabel', () => {
    const sheet = buildSheet(make(), 'floor-1', { project: 'Proyek X', drafter: 'Budi', northDeg: 30 });
    expect(sheet.paper).toBe('A3');
    expect(sheet.fits).toBe(true);
    expect(sheet.svg).toContain('width="420mm"');
    expect(sheet.svg).toContain(`1:${sheet.scale}`);
    ['Proyek X', 'Budi', 'DENAH LANTAI 1', '>500<', '>400<', '>P1<', '>J1<', 'TABEL PINTU / JENDELA', 'NAIK', '18.7 m²'].forEach((s) => expect(sheet.svg).toContain(s));
    expect(sheet.svg).not.toContain('NaN');
  });

  it('skala dan kertas bisa dipilih; lantai kosong → null', () => {
    const plan = make();
    expect(buildSheet(plan, 'floor-1', { paper: 'A4', scale: 50 })).toMatchObject({ paper: 'A4', scale: 50 });
    expect(buildSheet(plan, 'floor-1', { scale: 500 }).fits).toBe(true);
    expect(buildSheet(plan, 'floor-1', { scale: 20 }).fits).toBe(false);
    plan.addFloor('Kosong');
    expect(buildSheet(plan, plan.floors.at(-1).id)).toBeNull();
  });
});
