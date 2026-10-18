import { decorPieces } from '../plan/decor.js';
import { boundsOf, wallPolyline } from '../plan/geometry.js';
import { openingSpan } from './hit.js';

export const RULER_SIZE = 22;

const PALETTES = {
  dark: { band: '#1f2228', line: '#3a3f49', tick: '#7b8494', text: '#aab2c0', accent: '#38bdf8', range: 'rgba(56,189,248,0.28)' },
  light: { band: '#eceef1', line: '#cbd0d8', tick: '#6b7280', text: '#4b5563', accent: '#0284c7', range: 'rgba(2,132,199,0.22)' },
};
const C = { ...PALETTES.dark };

export function setRulerTheme(name) {
  Object.assign(C, PALETTES[name] ?? PALETTES.dark);
}

const STEPS = [
  [0.05, 5],
  [0.1, 10],
  [0.2, 4],
  [0.5, 5],
  [1, 10],
  [2, 4],
  [5, 5],
  [10, 10],
  [20, 4],
  [50, 5],
  [100, 10],
];
const MIN_LABEL_PX = 56;

const format = (value, step) => {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  const text = value.toFixed(decimals);
  return text === '-0' || text === '-0.0' || text === '-0.00' ? text.slice(1) : text;
};

export function selectionExtent(floor, selection) {
  const points = [];
  selection.forEach(({ kind, id }) => {
    if (kind === 'wall') {
      const wall = floor.walls.find((w) => w.id === id);
      if (wall) points.push(...wallPolyline(wall));
    } else if (kind === 'room') {
      const room = floor.rooms.find((r) => r.id === id);
      if (room) points.push(...room.polygon);
    } else if (kind === 'opening') {
      const opening = floor.openings.find((o) => o.id === id);
      const span = opening && openingSpan(floor, opening);
      if (span) points.push(span.p1, span.p2);
    } else if (kind === 'decor') {
      decorPieces(floor)
        .filter((p) => p.group === id)
        .forEach(({ shape }) => {
          if (shape.kind === 'rect') points.push([shape.minX, shape.minZ], [shape.maxX, shape.maxZ]);
          else points.push(shape.a, shape.b);
        });
    }
  });
  return boundsOf(points);
}

export function drawRulers(ctx, viewport, { cursor, extent }) {
  const { width, height, scale } = viewport;
  const [major, divisions] = STEPS.find(([step]) => step * scale >= MIN_LABEL_PX) ?? STEPS.at(-1);
  const minor = major / divisions;
  const showMinor = minor * scale >= 5;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, monospace';

  ctx.fillStyle = C.band;
  ctx.fillRect(0, 0, width, RULER_SIZE);
  ctx.fillRect(0, 0, RULER_SIZE, height);
  ctx.strokeStyle = C.line;
  ctx.beginPath();
  ctx.moveTo(0, RULER_SIZE + 0.5);
  ctx.lineTo(width, RULER_SIZE + 0.5);
  ctx.moveTo(RULER_SIZE + 0.5, 0);
  ctx.lineTo(RULER_SIZE + 0.5, height);
  ctx.stroke();

  const axes = [
    { horizontal: true, size: width, toPx: (v) => viewport.toScreen([v, 0])[0] },
    { horizontal: false, size: height, toPx: (v) => viewport.toScreen([0, v])[1] },
  ];

  axes.forEach(({ horizontal, size, toPx }) => {
    const toWorld = (px) => (horizontal ? viewport.toWorld(px, 0)[0] : viewport.toWorld(0, px)[1]);
    const start = toWorld(RULER_SIZE);
    const end = toWorld(size);
    const edge = (a, b) => (horizontal ? [a, 0, b, 0] : [0, a, 0, b]);

    if (extent) {
      const lo = toPx(horizontal ? extent.minX : extent.minZ);
      const hi = toPx(horizontal ? extent.maxX : extent.maxZ);
      ctx.fillStyle = C.range;
      if (horizontal) ctx.fillRect(Math.max(lo, RULER_SIZE), 0, Math.max(hi - lo, 1), RULER_SIZE);
      else ctx.fillRect(0, Math.max(lo, RULER_SIZE), RULER_SIZE, Math.max(hi - lo, 1));
    }

    ctx.strokeStyle = C.tick;
    ctx.fillStyle = C.text;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const first = Math.floor(start / minor);
    const last = Math.ceil(end / minor);
    ctx.beginPath();
    for (let i = first; i <= last; i++) {
      const isMajor = i % divisions === 0;
      const isHalf = divisions % 2 === 0 && i % (divisions / 2) === 0;
      if (!isMajor && !showMinor) continue;
      const px = Math.round(toPx(i * minor)) + 0.5;
      if (px < RULER_SIZE) continue;
      const length = isMajor ? RULER_SIZE * 0.65 : isHalf ? RULER_SIZE * 0.42 : RULER_SIZE * 0.22;
      if (horizontal) {
        ctx.moveTo(px, RULER_SIZE);
        ctx.lineTo(px, RULER_SIZE - length);
      } else {
        ctx.moveTo(RULER_SIZE, px);
        ctx.lineTo(RULER_SIZE - length, px);
      }
    }
    ctx.stroke();

    for (let i = first; i <= last; i++) {
      if (i % divisions !== 0) continue;
      const px = toPx(i * minor);
      if (px < RULER_SIZE + 2) continue;
      const text = format(i * minor, major);
      if (horizontal) {
        ctx.fillText(text, px + 3, 8);
      } else {
        ctx.save();
        ctx.translate(8, px - 3);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'left';
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }

    if (cursor) {
      const px = Math.round(toPx(horizontal ? cursor[0] : cursor[1])) + 0.5;
      if (px > RULER_SIZE) {
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(...edge(px, RULER_SIZE).slice(0, 2));
        ctx.lineTo(...edge(px, RULER_SIZE).slice(2));
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
  });

  ctx.fillStyle = C.band;
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
  ctx.fillStyle = C.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('m', RULER_SIZE / 2, RULER_SIZE / 2 + 0.5);
  ctx.restore();
}
