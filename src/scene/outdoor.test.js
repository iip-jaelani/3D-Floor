import { describe, expect, it } from 'vitest';
import { roofShape, treePositions } from './outdoor.js';

const rect = { minX: 0, maxX: 8, minZ: 0, maxZ: 4 };

describe('roofShape', () => {
  it('pelana: bubungan sejajar sisi panjang, tinggi = setengah bentang × tan', () => {
    const s = roofShape({ ...rect, type: 'gable', pitch: 45, ridge: 'auto' });
    expect(s.axis).toBe('x');
    expect(s.rise).toBeCloseTo(2);
  });

  it('perisai: bubungan lebih pendek dari sisi panjang', () => {
    const s = roofShape({ ...rect, type: 'hip', pitch: 30, ridge: 'auto' });
    expect(s.ridgeLength).toBeCloseTo(4);
  });

  it('miring satu sisi naik penuh sebesar bentang × tan; kanopi datar bila pitch 0', () => {
    expect(roofShape({ ...rect, type: 'shed', pitch: 45, ridge: 'x' }).rise).toBeCloseTo(4);
    expect(roofShape({ ...rect, type: 'canopy', pitch: 0 }).type).toBe('flat');
  });
});

describe('treePositions', () => {
  it('deterministik dan tidak menempatkan pohon di paving/kolam', () => {
    const yard = { id: 'yard-1', ...rect, ground: 'grass', plants: 'dense' };
    expect(treePositions(yard)).toEqual(treePositions(yard));
    expect(treePositions(yard).length).toBeGreaterThan(0);
    expect(treePositions({ ...yard, ground: 'paving' })).toEqual([]);
  });
});
