import { describe, expect, it } from 'vitest';
import { isValidProject } from './projectStorage.js';

describe('isValidProject', () => {
  const floor = { id: 'floor-1', walls: [], rooms: [] };

  it('menerima proyek minimal', () => {
    expect(isValidProject({ floors: [floor] })).toBe(true);
    expect(isValidProject({ floors: [floor], furniture: [] })).toBe(true);
  });

  it('menolak bentuk yang salah', () => {
    expect(isValidProject(null)).toBe(false);
    expect(isValidProject({})).toBe(false);
    expect(isValidProject({ floors: [] })).toBe(false);
    expect(isValidProject({ floors: [{ walls: [] }] })).toBe(false);
    expect(isValidProject({ floors: [floor], furniture: 'x' })).toBe(false);
  });
});
