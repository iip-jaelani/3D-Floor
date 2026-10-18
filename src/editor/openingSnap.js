import { clampOpeningOffset, pointOnWall, projectOnWall, wallLength } from '../plan/geometry.js';

const ROUND_STEP = 0.05;
const ROUND_PENALTY = 1;

const LABELS = {
  center: 'tengah tembok',
  equal: 'jarak kiri = kanan',
  align: 'sejajar tengah',
  cross: 'sejajar bukaan di seberang',
  gap: 'jarak sama',
  round: '',
};

function neighbours(floor, wallId, ignoreId) {
  const ignored = Array.isArray(ignoreId) ? ignoreId : [ignoreId];
  return floor.openings
    .filter((o) => o.wallId === wallId && !ignored.includes(o.id) && o.type !== 'ghost')
    .sort((p, q) => p.offset - q.offset);
}

export function openingGaps(floor, wall, { offset, width, ignoreId = null }) {
  const length = wallLength(wall);
  const l = offset - width / 2;
  const r = offset + width / 2;
  const others = neighbours(floor, wall.id, ignoreId);

  let from = 0;
  let leftKind = 'end';
  let to = length;
  let rightKind = 'end';
  others.forEach((o) => {
    const oRight = o.offset + o.width / 2;
    const oLeft = o.offset - o.width / 2;
    if (o.offset <= offset && oRight <= l + 1e-6 && oRight >= from) {
      from = oRight;
      leftKind = 'opening';
    }
    if (o.offset > offset && oLeft >= r - 1e-6 && oLeft <= to) {
      to = oLeft;
      rightKind = 'opening';
    }
  });

  return {
    left: { from, to: l, len: Math.max(l - from, 0), kind: leftKind },
    right: { from: r, to, len: Math.max(to - r, 0), kind: rightKind },
  };
}

export function snapOpening(floor, wall, { offset, width, ignoreId = null }, tolerance) {
  const length = wallLength(wall);
  const others = neighbours(floor, wall.id, ignoreId);
  const raw = clampOpeningOffset(offset, width, length) ?? offset;
  const half = width / 2;

  const gaps = openingGaps(floor, wall, { offset: raw, width, ignoreId });
  const leftEdge = gaps.left.from;
  const rightEdge = gaps.right.to;

  const candidates = [];
  const add = (center, kind, penalty = 0) => {
    if (Number.isFinite(center)) candidates.push({ center, kind, penalty });
  };

  add(length / 2, 'center');
  add((leftEdge + rightEdge) / 2, 'equal');
  others.forEach((o) => add(o.offset, 'align'));

  const dir = [wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]];
  const dl = Math.hypot(dir[0], dir[1]) || 1;
  floor.openings.forEach((o) => {
    if (o.wallId === wall.id || o.type === 'niche') return;
    const other = floor.walls.find((w) => w.id === o.wallId);
    if (!other) return;
    const od = [other.b[0] - other.a[0], other.b[1] - other.a[1]];
    const ol = Math.hypot(od[0], od[1]) || 1;
    const parallel = Math.abs((dir[0] * od[0] + dir[1] * od[1]) / (dl * ol)) > 0.995;
    if (!parallel) return;
    add(projectOnWall(pointOnWall(other, o.offset), wall).t, 'cross');
  });

  const spans = [0, ...others.flatMap((o) => [o.offset - o.width / 2, o.offset + o.width / 2]), length];
  for (let i = 1; i + 1 < spans.length; i += 2) {
    const gap = spans[i + 1] - spans[i];
    if (gap < 0.05) continue;
    add(leftEdge + gap + half, 'gap');
    add(rightEdge - gap - half, 'gap');
  }

  const roundTo = (value) => Math.round(value / ROUND_STEP) * ROUND_STEP;
  add(leftEdge + roundTo(raw - half - leftEdge) + half, 'round', ROUND_PENALTY);
  add(rightEdge - roundTo(rightEdge - (raw + half)) - half, 'round', ROUND_PENALTY);

  let best = null;
  candidates.forEach((c) => {
    const clamped = clampOpeningOffset(c.center, width, length);
    if (clamped === null || Math.abs(clamped - c.center) > 1e-6) return;
    const d = Math.abs(c.center - raw);
    if (d > tolerance) return;
    const score = d + (c.penalty ? tolerance * 10 : 0);
    if (!best || score < best.score) best = { ...c, score };
  });

  const final = best ? best.center : raw;
  return {
    offset: final,
    kind: best?.kind ?? null,
    label: best ? LABELS[best.kind] : '',
    gaps: openingGaps(floor, wall, { offset: final, width, ignoreId }),
  };
}

export function freeSpotBeside(floor, wall, opening, gap = 0.3) {
  const length = wallLength(wall);
  const others = neighbours(floor, wall.id, opening.id);
  const fits = (center) => {
    const clamped = clampOpeningOffset(center, opening.width, length);
    if (clamped === null || Math.abs(clamped - center) > 1e-6) return false;
    return others.every((o) => Math.abs(o.offset - center) >= (o.width + opening.width) / 2 + 0.05);
  };

  const step = opening.width + gap;
  for (let i = 1; i <= 20; i++) {
    for (const dir of [1, -1]) {
      const center = opening.offset + dir * step * i;
      if (fits(center)) return Math.round(center * 1000) / 1000;
    }
  }
  return null;
}
