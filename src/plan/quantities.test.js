import { describe, expect, it } from 'vitest';
import { Plan } from './Plan.js';
import { estimate, quantities } from './quantities.js';
import { toDxf } from './dxf.js';

const make = () => {
  const plan = new Plan({ wallHeight: 3, wallThickness: 0.15, floors: [{ id: 'floor-1', name: 'Lantai 1', level: 0 }] });
  plan.addRoom('floor-1', [0, 0], [5, 4]);
  const top = plan.floor('floor-1').walls.find((w) => w.a[1] === 0 && w.b[1] === 0);
  plan.addOpening('floor-1', { wallId: top.id, type: 'door', offset: 1, props: { width: 1.6, leaves: 2 } });
  plan.addOpening('floor-1', { wallId: top.id, type: 'window', offset: 3.5 });
  return plan;
};

describe('quantities & estimate', () => {
  it('menghitung luas lantai, dinding bersih, dan jumlah bukaan', () => {
    const q = Object.fromEntries(quantities(make()).map((r) => [r.key, r.qty]));
    expect(q.floorArea).toBeCloseTo(20);
    expect(q.wallArea).toBeCloseTo(54 - 1.6 * 2.1 - 1.2 * 1.2, 1);
    expect(q.doorDouble).toBe(1);
    expect(q.windowArea).toBeCloseTo(1.44);
  });

  it('total = jumlah subtotal dan harga bisa ditimpa', () => {
    const e = estimate(make(), { floorArea: 1000 });
    expect(e.rows.find((r) => r.key === 'floorArea').subtotal).toBe(20000);
    expect(e.total).toBe(e.rows.reduce((s, r) => s + r.subtotal, 0));
  });
});

describe('lot, salin lantai, DXF', () => {
  it('KDB dan sempadan', () => {
    const plan = make();
    plan.setLot({ minX: -2, maxX: 12, minZ: -2, maxZ: 10, front: 'minX', setbackFront: 3, setbackSide: 1, setbackRear: 1.5, kdbMax: 60 });
    const r = plan.lotReport();
    expect(r.area).toBe(14 * 12);
    expect(r.kdb).toBeCloseTo((20 / 168) * 100);
    expect(r.outside).toContain('Ruang 1'.length ? plan.floor('floor-1').rooms[0].name : '');
  });

  it('gandakan lantai & salin elemen', () => {
    const plan = make();
    const copy = plan.duplicateFloor('floor-1');
    expect(copy.level).toBe(1);
    expect(copy.walls).toHaveLength(4);
    expect(copy.openings.every((o) => copy.walls.some((w) => w.id === o.wallId))).toBe(true);
    const f = plan.floor('floor-1');
    const other = plan.addFloor('Lantai 3');
    const n = plan.copyItems('floor-1', f.walls.map((w) => ({ kind: 'wall', id: w.id })), other.id);
    expect(n).toBe(4 + 2);
  });

  it('DXF memuat layer dasar', () => {
    const dxf = toDxf(make(), 'floor-1');
    expect(dxf).toContain('DINDING');
    expect(dxf).toContain('RUANGAN');
    expect(dxf.endsWith('EOF')).toBe(true);
  });

  it('DXF memuat garis ukur, kode kusen, luas ruang, dan bisa dimatikan', () => {
    const dxf = toDxf(make(), 'floor-1');
    const lines = dxf.split('\n');
    expect(dxf).toContain('TABEL PINTU');
    expect(lines).toContain('500');
    expect(lines).toContain('400');
    expect(lines).toContain('P1');
    expect(lines).toContain('J1');
    expect(lines).toContain('20.0 m2');
    expect(toDxf(make(), 'floor-1', { annotate: false })).not.toContain('TABEL PINTU');
  });
});
