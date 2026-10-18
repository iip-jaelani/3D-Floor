import { describe, expect, it } from 'vitest';
import { measureGap } from './measure.js';

const box = (minX, maxX, minZ, maxZ) => ({ minX, maxX, minZ, maxZ });

describe('measureGap', () => {
  it('mengukur celah horizontal (sumbu X) di tengah bagian yang sejajar', () => {
    const result = measureGap(box(0, 1, 0, 2), box(3, 4, 1, 3));
    expect(result.distance).toBeCloseTo(2);
    expect(result.start).toEqual({ x: 1, z: 1.5 });
    expect(result.end).toEqual({ x: 3, z: 1.5 });
  });

  it('mengukur celah sumbu Z, tidak peduli urutan argumen', () => {
    const result = measureGap(box(0, 2, 5, 6), box(0, 2, 0, 1));
    expect(result.distance).toBeCloseTo(4);
    expect(result.start).toEqual({ x: 1, z: 1 });
    expect(result.end).toEqual({ x: 1, z: 5 });
  });

  it('memilih sumbu dengan celah terbesar saat diagonal', () => {
    const result = measureGap(box(0, 1, 0, 1), box(2, 3, 5, 6));
    expect(result.distance).toBeCloseTo(4);
  });

  it('mengembalikan null jika saling menimpa', () => {
    expect(measureGap(box(0, 2, 0, 2), box(1, 3, 1, 3))).toBeNull();
  });
});
