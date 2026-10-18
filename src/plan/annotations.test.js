import { describe, expect, it } from 'vitest';
import { Plan } from './Plan.js';
import { dimensionGeometry, planAnnotations } from './annotations.js';

describe('anotasi gambar kerja', () => {
  const plan = new Plan({ wallHeight: 3, wallThickness: 0.15, floors: [{ id: 'floor-1', name: 'Lantai 1', level: 0 }] });
  plan.addRoom('floor-1', [0, 0], [5, 4]);
  const top = plan.floor('floor-1').walls.find((w) => w.a[1] === 0 && w.b[1] === 0);
  plan.addOpening('floor-1', { wallId: top.id, type: 'door', offset: 1 });
  plan.addOpening('floor-1', { wallId: top.id, type: 'window', offset: 3.5 });

  it('ukuran total ujung ke ujung dan kode kusen', () => {
    const ann = planAnnotations(plan, plan.floor('floor-1'));
    const overall = ann.dims.filter((d) => d.at < 0 && !d.vertical).map((d) => dimensionGeometry(d, ann.bounds).label);
    expect(overall).toContain('500');
    expect(ann.dims.filter((d) => d.vertical).map((d) => dimensionGeometry(d, ann.bounds).label)).toContain('400');
    expect(ann.tags.map((t) => t.code).sort()).toEqual(['J1', 'P1']);
    expect(ann.schedule).toHaveLength(2);
  });

  it('lantai kosong tidak punya anotasi', () => {
    plan.addFloor('Kosong');
    expect(planAnnotations(plan, plan.floors.at(-1))).toBeNull();
  });
});
