export const TARGET_RISER = 0.18;

const AXES = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

export function stairMetrics(stairs) {
  const [ux, uz] = AXES[stairs.dir] ?? AXES['+x'];
  const alongX = ux !== 0;
  const run = alongX ? stairs.maxX - stairs.minX : stairs.maxZ - stairs.minZ;
  const width = alongX ? stairs.maxZ - stairs.minZ : stairs.maxX - stairs.minX;
  const steps = Number.isInteger(stairs.steps) ? stairs.steps : Math.max(2, Math.round(stairs.rise / TARGET_RISER));
  const riser = stairs.rise / steps;
  const tread = run / (steps - 1);
  const comfort = 2 * riser + tread;
  return { ux, uz, run, width, steps, riser, tread, comfort, ok: comfort >= 0.55 && comfort <= 0.7 };
}

export function stairOrigin(stairs) {
  const { ux, uz } = stairMetrics(stairs);
  return [ux > 0 ? stairs.minX : ux < 0 ? stairs.maxX : stairs.minX, uz > 0 ? stairs.minZ : uz < 0 ? stairs.maxZ : stairs.minZ];
}

export function stairTreads(stairs) {
  const m = stairMetrics(stairs);
  const [ox, oz] = stairOrigin(stairs);
  const treads = [];
  for (let i = 0; i < m.steps; i++) {
    const a = i * m.tread;
    const b = i === m.steps - 1 ? m.run : (i + 1) * m.tread;
    const front = m.ux !== 0 ? [ox + m.ux * a, ox + m.ux * b] : null;
    const corners = m.ux !== 0
      ? [[front[0], stairs.minZ], [front[1], stairs.minZ], [front[1], stairs.maxZ], [front[0], stairs.maxZ]]
      : [[stairs.minX, oz + m.uz * a], [stairs.minX, oz + m.uz * b], [stairs.maxX, oz + m.uz * b], [stairs.maxX, oz + m.uz * a]];
    treads.push({ corners, top: (i + 1) * m.riser });
  }
  return treads;
}

export function stairHandles(stairs) {
  const cx = (stairs.minX + stairs.maxX) / 2;
  const cz = (stairs.minZ + stairs.maxZ) / 2;
  const at = { min: { x: stairs.minX, z: stairs.minZ }, max: { x: stairs.maxX, z: stairs.maxZ } };
  return [
    ['min', 'min'], ['max', 'min'], ['max', 'max'], ['min', 'max'],
    [null, 'min'], ['max', null], [null, 'max'], ['min', null],
  ].map(([x, z]) => ({ x, z, point: [x ? at[x].x : cx, z ? at[z].z : cz] }));
}
