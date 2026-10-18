export function measureGap(a, b) {
  const gapX = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
  const gapZ = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ, 0);
  if (gapX === 0 && gapZ === 0) return null;

  if (gapX >= gapZ) {
    const [near, far] = a.maxX <= b.minX ? [a, b] : [b, a];
    const z = (Math.max(a.minZ, b.minZ) + Math.min(a.maxZ, b.maxZ)) / 2;
    return { distance: gapX, start: { x: near.maxX, z }, end: { x: far.minX, z } };
  }

  const [near, far] = a.maxZ <= b.minZ ? [a, b] : [b, a];
  const x = (Math.max(a.minX, b.minX) + Math.min(a.maxX, b.maxX)) / 2;
  return { distance: gapZ, start: { x, z: near.maxZ }, end: { x, z: far.minZ } };
}
