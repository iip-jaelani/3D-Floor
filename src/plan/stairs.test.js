import { describe, expect, it } from 'vitest';
import { Plan, SLAB_THICKNESS } from './Plan.js';
import { stairHandles, stairMetrics, stairTreads } from './stairs.js';
import { estimate } from './quantities.js';
import { toDxf } from './dxf.js';

const make = () => new Plan({ wallHeight: 2.8, wallThickness: 0.12, floors: [{ id: 'floor-1', name: 'Lantai 1', level: 0 }] });

describe('tangga', () => {
  it('dibuat setinggi satu lantai, arah naik mengikuti sisi panjang', () => {
    const plan = make();
    const st = plan.addStairs('floor-1', [0, 0], [4, 1]);
    expect(st.rise).toBeCloseTo(2.8 + SLAB_THICKNESS);
    expect(st.dir).toBe('+x');
    expect(plan.addStairs('floor-1', [0, 0], [1, 4]).dir).toBe('+z');
    expect(plan.addStairs('floor-1', [0, 0], [0.1, 0.1])).toBeNull();
  });

  it('menghitung anak tangga dan tanjakan', () => {
    const plan = make();
    const st = plan.addStairs('floor-1', [0, 0], [3.8, 1], { rise: 3 });
    const m = stairMetrics(st);
    expect(m.steps).toBe(17);
    expect(m.riser).toBeCloseTo(3 / 17);
    expect(m.tread).toBeCloseTo(3.8 / 16);
    expect(m.width).toBeCloseTo(1);
    const treads = stairTreads(st);
    expect(treads).toHaveLength(17);
    expect(treads.at(-1).top).toBeCloseTo(3);
    expect(treads.at(-1).corners[2][0]).toBeCloseTo(3.8);
  });

  it('arah negatif memulai dari sisi seberang', () => {
    const plan = make();
    const st = plan.addStairs('floor-1', [0, 0], [3, 1], { dir: '-x', rise: 1.8 });
    const treads = stairTreads(st);
    expect(treads[0].corners[0][0]).toBeCloseTo(3);
    expect(treads.at(-1).corners[2][0]).toBeCloseTo(0);
  });

  it('update, hapus, undo, simpan-muat, salin lantai, RAB, DXF', () => {
    const plan = make();
    const st = plan.addStairs('floor-1', [0, 0], [3, 1]);
    plan.updateStairs('floor-1', st.id, { dir: '-z', rise: 2, name: 'Tangga utama' });
    expect(plan.floor('floor-1').stairs[0]).toMatchObject({ dir: '-z', rise: 2, name: 'Tangga utama' });

    const loaded = new Plan(JSON.parse(JSON.stringify(plan.toJSON())));
    expect(loaded.floor('floor-1').stairs).toHaveLength(1);
    expect(loaded.addStairs('floor-1', [5, 0], [8, 1]).id).not.toBe(st.id);

    const copy = plan.duplicateFloor('floor-1');
    expect(copy.stairs[0].id).not.toBe(st.id);

    expect(estimate(plan).rows.find((r) => r.key === 'stairSteps').qty).toBeGreaterThan(0);
    expect(toDxf(plan, 'floor-1')).toContain('TANGGA');

    plan.removeStairs('floor-1', st.id);
    expect(plan.floor('floor-1').stairs).toHaveLength(0);
  });

  it('file lama tanpa tangga tetap terbaca', () => {
    const plan = new Plan({ floors: [{ id: 'floor-1', name: 'L', level: 0, walls: [], rooms: [], openings: [], roofs: [], yards: [] }] });
    expect(plan.floor('floor-1').stairs).toEqual([]);
  });
});

describe('ukuran tangga bisa diatur', () => {
  it('panjang diukur dari kaki tangga, lebar dari sisi atas, posisi menggeser', () => {
    const plan = make();
    const st = plan.addStairs('floor-1', [1, 1], [5, 2], { dir: '-x' });
    plan.updateStairs('floor-1', st.id, { run: 3, width: 1.2 });
    expect(st).toMatchObject({ minX: 2, maxX: 5, minZ: 1, maxZ: 2.2 });
    plan.updateStairs('floor-1', st.id, { dir: '+z' });
    plan.updateStairs('floor-1', st.id, { run: 4 });
    expect(st.maxZ - st.minZ).toBeCloseTo(4);
    plan.updateStairs('floor-1', st.id, { x: 10, z: 0 });
    expect(st).toMatchObject({ minX: 10, minZ: 0 });
    expect(st.points[0]).toEqual([10, 0]);
  });

  it('jumlah anak tangga manual lalu kembali otomatis', () => {
    const plan = make();
    const st = plan.addStairs('floor-1', [0, 0], [4, 1], { rise: 3 });
    plan.updateStairs('floor-1', st.id, { steps: 12 });
    expect(stairMetrics(st).steps).toBe(12);
    expect(stairTreads(st)).toHaveLength(12);
    plan.updateStairs('floor-1', st.id, { steps: null });
    expect(stairMetrics(st).steps).toBe(17);
  });
});

describe('pegangan ubah ukuran', () => {
  it('8 pegangan; seret sisi kanan mengubah maxX saja', () => {
    const plan = make();
    const st = plan.addStairs('floor-1', [0, 0], [4, 1]);
    const handles = stairHandles(st);
    expect(handles).toHaveLength(8);
    const right = handles.find((h) => h.x === 'max' && !h.z);
    expect(right.point).toEqual([4, 0.5]);
    plan.updateStairs('floor-1', st.id, { maxX: 5.5 });
    expect(st).toMatchObject({ minX: 0, maxX: 5.5, minZ: 0, maxZ: 1 });
  });
});

describe('arah utara', () => {
  it('disimpan, dinormalisasi 0–360, dan terbaca kembali', () => {
    const plan = make();
    expect(plan.north).toBe(0);
    expect(plan.toJSON()).not.toHaveProperty('north');
    plan.setNorth(-30);
    expect(plan.north).toBe(330);
    plan.setNorth(725);
    expect(plan.north).toBe(5);
    const loaded = new Plan(JSON.parse(JSON.stringify(plan.toJSON())));
    expect(loaded.north).toBe(5);
    expect(toDxf(plan, 'floor-1')).toContain('U');
  });
});
