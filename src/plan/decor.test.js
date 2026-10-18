import { describe, expect, it } from 'vitest';
import { decorGroups, decorShape, normalizeDecor } from './decor.js';

const sample = () => ({
  curtains: [
    { id: 'c1', position: [-2.71, 0.03, -1.55], rotation: 90, width: 0.95 },
    { id: 'c2', position: [-2.71, 0.03, 1.55], rotation: 90, width: 0.95 },
    { id: 'sheer', position: [-2.79, 0.03, 0], rotation: 90, width: 3 },
  ],
  rods: [{ id: 'rod', position: [-2.71, 2.48, 0], rotation: 90, length: 4.1 }],
  rugs: [{ id: 'rug', position: [-0.15, 0.01, 0.15], size: [3.4, 0.02, 2.7], color: '#999' }],
});

describe('normalizeDecor', () => {
  it('mengelompokkan gorden dan rel di dinding yang sama', () => {
    const decor = normalizeDecor(sample());
    const groups = new Set([...decor.curtains, ...decor.rods].map((e) => e.group));
    expect(groups.size).toBe(1);
    expect(decor.rugs[0].group).toBe('rug');
  });

  it('mempertahankan group yang sudah ada', () => {
    const decor = sample();
    decor.curtains[0].group = 'custom';
    normalizeDecor(decor);
    expect(decor.curtains[0].group).toBe('custom');
  });
});

describe('decorGroups', () => {
  it('satu set gorden = panel + rel, karpet terpisah', () => {
    const groups = decorGroups({ decor: normalizeDecor(sample()) });
    expect(groups).toHaveLength(2);
    const curtain = groups.find((g) => g.kind === 'curtain');
    expect(curtain.pieces).toHaveLength(4);
    expect(curtain.label).toBe('Gorden');
    expect(groups.find((g) => g.kind === 'rug').label).toBe('Karpet');
  });
});

describe('decorShape', () => {
  it('gorden di dinding kiri memanjang sepanjang Z', () => {
    const shape = decorShape('curtain', { position: [-2.7, 0, 0], rotation: 90, width: 2 });
    expect(shape.a[0]).toBeCloseTo(-2.7);
    expect(Math.abs(shape.a[1] - shape.b[1])).toBeCloseTo(2);
  });

  it('karpet menjadi persegi di sekitar pusatnya', () => {
    const shape = decorShape('rug', { position: [1, 0, 2], size: [2, 0.02, 4] });
    expect(shape).toEqual({ kind: 'rect', minX: 0, maxX: 2, minZ: 0, maxZ: 4 });
  });
});
