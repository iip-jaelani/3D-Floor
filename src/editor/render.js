import { FLOOR_OPTIONS } from '../config.js';
import { YARD_GROUNDS } from '../plan/Plan.js';
import { isAxisRect, roofShape, treePositions } from '../scene/outdoor.js';
import { offsetPolygon } from '../plan/geometry.js';
import { arcOf, boundsOf, polygonArea, polygonCentroid, wallLength, wallPolyline } from '../plan/geometry.js';
import { decorPieces } from '../plan/decor.js';
import { stairHandles, stairMetrics, stairTreads } from '../plan/stairs.js';
import { dimensionGeometry, GRID_OFFSET, planAnnotations, TYPE_LABEL } from '../plan/annotations.js';
import { openingSpan, roomEdgeMidpoints } from './hit.js';
import { RULER_SIZE, drawRulers, selectionExtent, setRulerTheme } from './rulers.js';

const PALETTES = {
  dark: {
    background: '#16181d',
    gridMinor: 'rgba(255,255,255,0.045)',
    gridMajor: 'rgba(255,255,255,0.1)',
    wall: '#e5e7eb',
    ghost: 'rgba(148,163,184,0.25)',
    accent: '#38bdf8',
    window: '#7dd3fc',
    door: '#fbbf24',
    furniture: 'rgba(148,163,184,0.55)',
    text: '#e2e8f0',
    muted: '#94a3b8',
    invalid: '#f43f5e',
    valid: '#34d399',
    ink: '#fcd34d',
    tag: '#7dd3fc',
    panel: 'rgba(15,23,42,0.85)',
    panelLine: '#64748b',
    yardText: '#d1fae5',
    stairText: '#bae6fd',
    crossFg: '#ffffff',
    crossBg: 'rgba(0,0,0,0.75)',
    crossLine: 'rgba(56,189,248,0.6)',
  },
  light: {
    background: '#f6f7f9',
    gridMinor: 'rgba(0,0,0,0.05)',
    gridMajor: 'rgba(0,0,0,0.11)',
    wall: '#374151',
    ghost: 'rgba(100,116,139,0.3)',
    accent: '#0284c7',
    window: '#0284c7',
    door: '#b45309',
    furniture: 'rgba(71,85,105,0.5)',
    text: '#1f2937',
    muted: '#64748b',
    invalid: '#e11d48',
    valid: '#059669',
    ink: '#b45309',
    tag: '#0369a1',
    panel: 'rgba(255,255,255,0.92)',
    panelLine: '#94a3b8',
    yardText: '#166534',
    stairText: '#075985',
    crossFg: '#111827',
    crossBg: 'rgba(255,255,255,0.9)',
    crossLine: 'rgba(2,132,199,0.55)',
  },
};
const COLORS = { ...PALETTES.dark };

export function compassBox(viewport) {
  return { cx: viewport.width - 54, cy: RULER_SIZE + 54, r: 34 };
}

function drawCompass(ctx, viewport, plan) {
  const { cx, cy, r } = compassBox(viewport);
  const a = ((plan.north ?? 0) * Math.PI) / 180;
  const at = (angle, d) => [cx + Math.sin(angle) * d, cy - Math.cos(angle) * d];
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.panel;
  ctx.fill();
  ctx.strokeStyle = COLORS.panelLine;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = COLORS.muted;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = at(a + (i * Math.PI) / 2, r - 11);
    const [x2, y2] = at(a + (i * Math.PI) / 2, r - 3);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  const tip = at(a, r - 12);
  const tail = at(a + Math.PI, r - 12);
  const side = (angle) => at(a + angle, 6);
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(...side(Math.PI / 2));
  ctx.lineTo(...side(-Math.PI / 2));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.muted;
  ctx.beginPath();
  ctx.moveTo(tail[0], tail[1]);
  ctx.lineTo(...side(Math.PI / 2));
  ctx.lineTo(...side(-Math.PI / 2));
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  [['U', 0, '#ef4444'], ['T', 1, COLORS.text], ['S', 2, COLORS.text], ['B', 3, COLORS.text]].forEach(([name, i, color]) => {
    const [x, y] = at(a + (i * Math.PI) / 2, r + 9);
    label(ctx, name, x, y, '700 11px system-ui, sans-serif', color);
  });
  ctx.restore();
}

export function setPlanTheme(name) {
  Object.assign(COLORS, PALETTES[name] ?? PALETTES.dark);
  setRulerTheme(name);
}

export const CORNER_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171'];
export const cornerColor = (index) => CORNER_COLORS[index % CORNER_COLORS.length];

export const ROOM_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#a3e635', '#e879f9'];
export const roomColor = (room, index) => room.color ?? ROOM_COLORS[index % ROOM_COLORS.length];

const FLOOR_TINT = Object.fromEntries(FLOOR_OPTIONS.map((o) => [o.id, o.base]));

export function drawPlan(ctx, { viewport, plan, floor, below, furniture, selection, hover, showDims, showGrid = false, showRulers = true, lineMode = false, technical = false, crosshair = true, cursor = null, measures = [], corner = {}, layers = null, roomColors = true, pin = null, guides = [], tool }) {
  const px = (meters) => meters * viewport.scale;
  const shown = (name) => !layers || layers[name]?.visible !== false;
  const KIND_LAYER = { wall: 'walls', room: 'rooms', opening: 'openings', decor: 'decor', roof: 'roofs', yard: 'yards', stairs: 'stairs' };
  selection = selection.filter((item) => shown(KIND_LAYER[item.kind]));
  const wallPx = (wall) => Math.max(px(wall.thickness ?? plan.wallThickness), 4);

  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  if (showGrid) drawGrid(ctx, viewport);

  if (below && !lineMode) drawWalls(ctx, viewport, below.walls, plan.wallThickness, COLORS.ghost);

  if (shown('rooms')) {
    floor.rooms.forEach((room, index) => {
      ctx.beginPath();
      room.polygon.forEach((point, i) => {
        const [sx, sy] = viewport.toScreen(point);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      const color = roomColors ? roomColor(room, index) : (FLOOR_TINT[room.floor] ?? '#8c6239');
      const selected = selection.some((t) => t.kind === 'room' && t.id === room.id);

      if (lineMode) {
        if (roomColors) {
          ctx.globalAlpha = selected ? 1 : 0.75;
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        return;
      }
      ctx.globalAlpha = selected ? 0.5 : roomColors ? 0.3 : 0.25;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  if (shown('decor')) drawDecor(ctx, viewport, floor, lineMode);

  (shown('furniture') ? furniture : []).forEach((item) => {
    const [sx, sy] = viewport.toScreen([item.x, item.z]);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(-(item.rotationDeg * Math.PI) / 180);
    ctx.strokeStyle = COLORS.furniture;
    ctx.fillStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = lineMode ? 1 : 1.5;
    const w = px(item.size[0]);
    const d = px(item.size[2]);
    if (!lineMode) ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.restore();
  });

  if (shown('yards')) drawYards(ctx, viewport, floor, selection, lineMode, pin);
  if (shown('stairs')) drawStairs(ctx, viewport, floor, selection);

  if (shown('walls')) {
    if (lineMode) drawWallOutlines(ctx, viewport, floor.walls, plan.wallThickness);
    else drawWalls(ctx, viewport, floor.walls, plan.wallThickness, COLORS.wall);
  }

  (shown('openings') && shown('walls') ? floor.openings : []).forEach((opening) => {
    const span = openingSpan(floor, opening);
    if (!span) return;
    const thickness = wallPx(span.wall);
    const [x1, y1] = viewport.toScreen(span.p1);
    const [x2, y2] = viewport.toScreen(span.p2);

    ctx.lineCap = 'butt';
    if (opening.type !== 'niche') {
      ctx.strokeStyle = COLORS.background;
      ctx.lineWidth = thickness + 2;
      line(ctx, x1, y1, x2, y2);
    }

    if (opening.type === 'niche') {
      const wpx = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / wpx;
      const uy = (y2 - y1) / wpx;
      const side = opening.side ?? 1;
      const nx = span.n[0] * side;
      const ny = span.n[1] * side;
      const depthPx = Math.min(Math.max(px(opening.depth ?? 0.15), 3), thickness - 1);
      const sx = x1 + nx * (thickness / 2);
      const sy = y1 + ny * (thickness / 2);

      ctx.fillStyle = COLORS.background;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ux * wpx, sy + uy * wpx);
      ctx.lineTo(sx + ux * wpx - nx * depthPx, sy + uy * wpx - ny * depthPx);
      ctx.lineTo(sx - nx * depthPx, sy - ny * depthPx);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      return;
    }

    if (opening.vent && opening.type !== 'vent') {
      ctx.save();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([2, 3]);
      line(ctx, x1 + span.n[0] * thickness * 0.5, y1 + span.n[1] * thickness * 0.5, x2 + span.n[0] * thickness * 0.5, y2 + span.n[1] * thickness * 0.5);
      line(ctx, x1 - span.n[0] * thickness * 0.5, y1 - span.n[1] * thickness * 0.5, x2 - span.n[0] * thickness * 0.5, y2 - span.n[1] * thickness * 0.5);
      ctx.restore();
    }

    if (opening.type === 'vent') {
      const wpx = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / wpx;
      const uy = (y2 - y1) / wpx;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      line(ctx, x1 + span.n[0] * thickness * 0.5, y1 + span.n[1] * thickness * 0.5, x2 + span.n[0] * thickness * 0.5, y2 + span.n[1] * thickness * 0.5);
      line(ctx, x1 - span.n[0] * thickness * 0.5, y1 - span.n[1] * thickness * 0.5, x2 - span.n[0] * thickness * 0.5, y2 - span.n[1] * thickness * 0.5);
      const slats = Math.max(2, Math.round(wpx / 7));
      for (let i = 0; i <= slats; i++) {
        const cx = x1 + ux * ((wpx * i) / slats);
        const cy = y1 + uy * ((wpx * i) / slats);
        line(ctx, cx + span.n[0] * thickness * 0.5, cy + span.n[1] * thickness * 0.5, cx - span.n[0] * thickness * 0.5, cy - span.n[1] * thickness * 0.5);
      }
    } else if (opening.type === 'window') {
      ctx.strokeStyle = COLORS.window;
      ctx.lineWidth = Math.max(2, thickness * 0.35);
      line(ctx, x1, y1, x2, y2);
    } else {
      const swing = opening.swing === -1 ? -1 : 1;
      const hinge = opening.hinge === -1 ? -1 : 1;
      const double = opening.leaves === 2;
      const r = px(opening.width) / (double ? 2 : 1);
      const nx = span.n[0] * swing;
      const ny = span.n[1] * swing;
      const open = Math.atan2(ny, nx);
      const leaf = (hx, hy, dirSign) => {
        ctx.strokeStyle = COLORS.door;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        line(ctx, hx, hy, hx + nx * r, hy + ny * r);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const free = Math.atan2(span.u[1] * dirSign, span.u[0] * dirSign);
        const diff = Math.atan2(Math.sin(open - free), Math.cos(open - free));
        ctx.arc(hx, hy, r, free, open, diff < 0);
        ctx.stroke();
      };
      if (double) {
        leaf(x1, y1, 1);
        leaf(x2, y2, -1);
      } else {
        leaf(hinge === 1 ? x1 : x2, hinge === 1 ? y1 : y2, hinge);
      }
      ctx.setLineDash([]);
    }
  });

  if (plan.lot) drawLot(ctx, viewport, plan);
  if (shown('roofs')) drawRoofs(ctx, viewport, floor, selection, pin);
  drawHighlights(ctx, { viewport, plan, floor, selection, hover, corner });
  drawLabels(ctx, { viewport, floor, showDims, showRooms: shown('rooms'), showWalls: shown('walls') });
  if (technical) drawTechnical(ctx, viewport, plan, floor);
  measures.forEach((m) => drawMeasure(ctx, viewport, m.a, m.b, { final: true }));
  tool?.draw?.(ctx, { viewport, COLORS, plan, floor });
  if (crosshair && cursor) drawCrosshair(ctx, viewport, cursor);
  drawCompass(ctx, viewport, plan);
  if (guides.length) drawGuides(ctx, viewport, guides);
  if (showRulers) drawRulers(ctx, viewport, { cursor, extent: selectionExtent(floor, selection) });
}

function drawCrosshair(ctx, viewport, cursor) {
  const [x, y] = viewport.toScreen(cursor);
  if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) return;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.crossLine;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, Math.round(y) + 0.5);
  ctx.lineTo(viewport.width, Math.round(y) + 0.5);
  ctx.moveTo(Math.round(x) + 0.5, 0);
  ctx.lineTo(Math.round(x) + 0.5, viewport.height);
  ctx.stroke();
  ctx.setLineDash([]);
  const arm = 9;
  [[COLORS.crossBg, 3.5], [COLORS.crossFg, 1.5]].forEach(([color, width]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
  });
  ctx.restore();
}

function drawTechnical(ctx, viewport, plan, floor) {
  const ann = planAnnotations(plan, floor);
  if (!ann) return;
  const { minX, maxX, minZ, maxZ } = ann.bounds;
  const ink = COLORS.ink;
  const S = (p) => viewport.toScreen(p);
  const seg = (p, q) => {
    const [x1, y1] = S(p);
    const [x2, y2] = S(q);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1;

  ctx.setLineDash([10, 4, 2, 4]);
  ctx.strokeStyle = 'rgba(148,163,184,0.55)';
  const bubble = (p, text) => {
    const [x, y] = S(p);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, 11, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.background;
    ctx.fill();
    ctx.stroke();
    label(ctx, text, x, y, '700 11px system-ui, sans-serif', COLORS.text);
  };
  ann.grid.x.forEach((x, i) => {
    seg([x, minZ - GRID_OFFSET], [x, maxZ + 0.3]);
    bubble([x, minZ - GRID_OFFSET], String(i + 1));
  });
  ann.grid.z.forEach((z, i) => {
    seg([minX - GRID_OFFSET, z], [maxX + 0.3, z]);
    bubble([minX - GRID_OFFSET, z], String.fromCharCode(65 + (i % 26)));
  });
  ctx.setLineDash([]);

  ctx.strokeStyle = ink;
  ann.dims.forEach((dim) => {
    const g = dimensionGeometry(dim, ann.bounds);
    g.extensions.forEach(([from, to]) => seg(from, to));
    seg(g.line[0], g.line[1]);
    g.line.forEach((p) => {
      const [x, y] = S(p);
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 4);
      ctx.lineTo(x + 4, y - 4);
      ctx.stroke();
    });
    if (!g.labelled || Math.abs(dim.b - dim.a) * viewport.scale < 26) return;
    const [mx, my] = S(g.mid);
    ctx.save();
    ctx.translate(mx, my);
    if (dim.vertical) ctx.rotate(-Math.PI / 2);
    label(ctx, g.label, 0, -8, '600 11px ui-monospace, monospace', ink);
    ctx.restore();
  });

  ann.tags.forEach(({ p, code }) => {
    const [x, y] = S(p);
    label(ctx, code, x, y, '700 11px system-ui, sans-serif', COLORS.tag);
  });

  const rows = [['Kode', 'Jenis', 'L x T (cm)', 'Ambang', 'Jml'], ...ann.schedule.map((k) => [k.code, TYPE_LABEL[k.type] ?? k.type, `${Math.round(k.width * 100)} x ${Math.round(k.height * 100)}`, `${Math.round(k.sill * 100)}`, String(k.count)])];
  const colW = [38, 70, 82, 52, 34];
  const [tx, ty] = S([maxX + 3.4, minZ]);
  const rowH = 20;
  const width = colW.reduce((a, b) => a + b, 0);
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(tx, ty, width, rowH * rows.length);
  ctx.strokeStyle = COLORS.panelLine;
  ctx.strokeRect(tx, ty, width, rowH * rows.length);
  ctx.textAlign = 'left';
  rows.forEach((row, r) => {
    let x = tx;
    if (r) {
      ctx.beginPath();
      ctx.moveTo(tx, ty + r * rowH);
      ctx.lineTo(tx + width, ty + r * rowH);
      ctx.stroke();
    }
    row.forEach((cell, c) => {
      ctx.font = `${r ? 400 : 700} 11px system-ui, sans-serif`;
      ctx.fillStyle = r ? COLORS.text : COLORS.ink;
      ctx.fillText(cell, x + 5, ty + r * rowH + rowH / 2);
      x += colW[c];
    });
  });
  ctx.fillStyle = COLORS.ink;
  ctx.font = '700 11px system-ui, sans-serif';
  ctx.fillText('TABEL PINTU / JENDELA', tx, ty - 10);
  ctx.restore();
}

function drawDecor(ctx, viewport, floor, lineMode = false) {
  decorPieces(floor).forEach(({ type, entry, shape }) => {
    if (shape.kind === 'rect') {
      const [x1, y1] = viewport.toScreen([shape.minX, shape.minZ]);
      const [x2, y2] = viewport.toScreen([shape.maxX, shape.maxZ]);
      ctx.fillStyle = 'rgba(156,163,175,0.2)';
      ctx.strokeStyle = 'rgba(156,163,175,0.55)';
      ctx.lineWidth = lineMode ? 1 : 1.5;
      if (!lineMode) ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      return;
    }

    const [x1, y1] = viewport.toScreen(shape.a);
    const [x2, y2] = viewport.toScreen(shape.b);
    ctx.lineCap = 'round';
    if (type === 'rod') {
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = entry.sheer ? 'rgba(226,232,240,0.45)' : '#a8a29e';
      ctx.lineWidth = entry.sheer ? 3 : 6;
    }
    line(ctx, x1, y1, x2, y2);
    ctx.lineCap = 'butt';
  });
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawGrid(ctx, viewport) {
  const { scale, width, height } = viewport;
  const steps = [
    { step: 0.5, color: COLORS.gridMinor, minScale: 50 },
    { step: 1, color: COLORS.gridMajor, minScale: 0 },
  ];
  const [x0, z0] = viewport.toWorld(0, 0);
  const [x1, z1] = viewport.toWorld(width, height);

  steps.forEach(({ step, color, minScale }) => {
    if (scale < minScale) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) {
      const [sx] = viewport.toScreen([x, 0]);
      ctx.moveTo(Math.round(sx) + 0.5, 0);
      ctx.lineTo(Math.round(sx) + 0.5, height);
    }
    for (let z = Math.floor(z0 / step) * step; z <= z1; z += step) {
      const [, sy] = viewport.toScreen([0, z]);
      ctx.moveTo(0, Math.round(sy) + 0.5);
      ctx.lineTo(width, Math.round(sy) + 0.5);
    }
    ctx.stroke();
  });
}

function drawWallOutlines(ctx, viewport, walls, defaultThickness) {
  const widthOf = (wall) => Math.max((wall.thickness ?? defaultThickness) * viewport.scale, 4);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = COLORS.wall;
  walls.forEach((wall) => {
    ctx.lineWidth = widthOf(wall) + 2;
    strokeWall(ctx, viewport, wall);
  });
  ctx.strokeStyle = COLORS.background;
  walls.forEach((wall) => {
    ctx.lineWidth = widthOf(wall);
    strokeWall(ctx, viewport, wall);
  });

  ctx.strokeStyle = 'rgba(56,189,248,0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  walls.forEach((wall) => strokeWall(ctx, viewport, wall));
  ctx.setLineDash([]);
}

function strokeWall(ctx, viewport, wall) {
  ctx.beginPath();
  wallPolyline(wall).forEach((point, i) => {
    const [sx, sy] = viewport.toScreen(point);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.stroke();
}

function drawWalls(ctx, viewport, walls, defaultThickness, color) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'round';
  walls.forEach((wall) => {
    ctx.lineWidth = Math.max((wall.thickness ?? defaultThickness) * viewport.scale, 4);
    ctx.globalAlpha = wall.height && wall.height < 2 ? 0.6 : 1;
    strokeWall(ctx, viewport, wall);
  });
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

function drawHighlights(ctx, { viewport, plan, floor, selection, hover, corner = {} }) {
  const outline = (target, color, extra) => {
    if (!target) return;
    ctx.strokeStyle = color;
    ctx.lineCap = 'butt';

    if (target.kind === 'wall') {
      const wall = floor.walls.find((w) => w.id === target.id);
      if (!wall) return;
      ctx.lineWidth = Math.max((wall.thickness ?? plan.wallThickness) * viewport.scale, 4) + extra;
      ctx.globalAlpha = 0.7;
      strokeWall(ctx, viewport, wall);
      ctx.globalAlpha = 1;
    } else if (target.kind === 'opening') {
      const opening = floor.openings.find((o) => o.id === target.id);
      const span = opening && openingSpan(floor, opening);
      if (!span) return;
      ctx.lineWidth = Math.max((span.wall.thickness ?? plan.wallThickness) * viewport.scale, 4) + extra + 2;
      const [x1, y1] = viewport.toScreen(span.p1);
      const [x2, y2] = viewport.toScreen(span.p2);
      ctx.globalAlpha = 0.7;
      line(ctx, x1, y1, x2, y2);
      ctx.globalAlpha = 1;
    } else if (target.kind === 'decor') {
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      decorPieces(floor)
        .filter((piece) => piece.group === target.id)
        .forEach(({ shape }) => {
          if (shape.kind === 'rect') {
            const [x1, y1] = viewport.toScreen([shape.minX, shape.minZ]);
            const [x2, y2] = viewport.toScreen([shape.maxX, shape.maxZ]);
            ctx.strokeRect(x1 - 3, y1 - 3, x2 - x1 + 6, y2 - y1 + 6);
          } else {
            const [x1, y1] = viewport.toScreen(shape.a);
            const [x2, y2] = viewport.toScreen(shape.b);
            ctx.lineWidth = 12;
            ctx.globalAlpha = 0.5;
            ctx.lineCap = 'round';
            line(ctx, x1, y1, x2, y2);
            ctx.lineCap = 'butt';
            ctx.globalAlpha = 1;
          }
        });
      ctx.setLineDash([]);
    } else if (target.kind === 'room') {
      const room = floor.rooms.find((r) => r.id === target.id);
      if (!room) return;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      room.polygon.forEach((point, i) => {
        const [sx, sy] = viewport.toScreen(point);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  };

  const isSelected = (t) => selection.some((s) => s.kind === t.kind && s.id === t.id);
  if (hover && !isSelected(hover)) outline(hover, 'rgba(255,255,255,0.8)', 4);
  selection.forEach((target) => outline(target, COLORS.accent, 6));

  const handles = [];
  const letters = [];
  const only = selection.length === 1 ? selection[0] : null;
  if (only?.kind === 'wall') {
    const wall = floor.walls.find((w) => w.id === only.id);
    if (wall) {
      handles.push(wall.a, wall.b);
      letters.push('A', 'B');
      const arc = arcOf(wall);
      const mid = arc ? arc.apex : [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
      const [mx, my] = viewport.toScreen(mid);
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = COLORS.accent;
      ctx.lineWidth = 2;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.strokeRect(-5, -5, 10, 10);
      ctx.restore();
    }
  } else if (only?.kind === 'room') {
    const room = floor.rooms.find((r) => r.id === only.id);
    if (room) drawRoomPoints(ctx, viewport, floor, room, corner);
  }
  handles.forEach((point, i) => {
    const [sx, sy] = viewport.toScreen(point);
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (letters[i]) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      label(ctx, letters[i], sx, sy - 18, '700 12px system-ui', COLORS.accent);
    }
  });
}

function drawRoomPoints(ctx, viewport, floor, room, { active = null, hover = null } = {}) {
  const corners = room.corners ?? room.polygon;
  const isActive = (i) => active?.roomId === room.id && active.index === i;
  const isHover = (i) => hover?.roomId === room.id && hover.index === i;

  roomEdgeMidpoints(floor, room).forEach(({ point, index }) => {
    const [mx, my] = viewport.toScreen(point);
    const next = (index + 1) % corners.length;
    ctx.beginPath();
    ctx.arc(mx, my, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#064e3b';
    ctx.fill();
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - 3.5, my);
    ctx.lineTo(mx + 3.5, my);
    ctx.moveTo(mx, my - 3.5);
    ctx.lineTo(mx, my + 3.5);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    label(ctx, `${index + 1}→${next + 1}`, mx, my + 16, '600 9px system-ui', '#6ee7b7');
  });

  corners.forEach((point, i) => {
    const [sx, sy] = viewport.toScreen(point);
    const color = cornerColor(i);
    const radius = isHover(i) || isActive(i) ? 12 : 10;

    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isActive(i) ? '#ffffff' : '#0f172a';
    ctx.lineWidth = isActive(i) ? 3 : 2;
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), sx, sy + 0.5);

    if (isActive(i)) {
      const bx = sx + 16;
      const by = sy - 16;
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#e11d48';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx - 3, by - 3);
      ctx.lineTo(bx + 3, by + 3);
      ctx.moveTo(bx + 3, by - 3);
      ctx.lineTo(bx - 3, by + 3);
      ctx.stroke();
    }
  });
}

function drawLabels(ctx, { viewport, floor, showDims, showRooms = true, showWalls = true }) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  (showRooms ? floor.rooms : []).forEach((room) => {
    const [sx, sy] = viewport.toScreen(polygonCentroid(room.polygon));
    const area = polygonArea(room.polygon);
    const b = boundsOf(room.polygon);
    const maxWidth = Math.max((b.maxX - b.minX) * viewport.scale - 16, 40);
    label(ctx, fitText(ctx, room.name, '600 13px system-ui', maxWidth), sx, sy - 8, '600 13px system-ui', COLORS.text);
    label(ctx, `${area.toFixed(1)} m²`, sx, sy + 9, '11px system-ui', COLORS.muted);
    if (room.elevation) {
      label(ctx, `▲ +${Math.round(room.elevation * 100)} cm`, sx, sy + 25, '600 11px system-ui', '#fbbf24');
    }
  });

  if (!showDims || !showWalls) return;
  floor.walls.forEach((wall) => {
    const length = wallLength(wall);
    if (length * viewport.scale < 50) return;
    const arc = arcOf(wall);
    const chord = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]) || 1;
    const mid = arc ? arc.apex : [(wall.a[0] + wall.b[0]) / 2, (wall.a[1] + wall.b[1]) / 2];
    const [sx, sy] = viewport.toScreen(mid);
    let nx = -(wall.b[1] - wall.a[1]) / chord;
    let nz = (wall.b[0] - wall.a[0]) / chord;
    if (arc && arc.sagitta < 0) {
      nx = -nx;
      nz = -nz;
    }
    const text = arc ? `${length.toFixed(2)}  R${arc.radius.toFixed(2)}` : `${length.toFixed(2)}`;
    label(ctx, text, sx + nx * 16, sy + nz * 16, '600 11px ui-monospace, monospace', COLORS.accent);
  });
}

export function drawMeasure(ctx, viewport, a, b, { final = false } = {}) {
  const color = final ? '#f472b6' : COLORS.accent;
  const [x1, y1] = viewport.toScreen(a);
  const [x2, y2] = viewport.toScreen(b);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(final ? [] : [6, 4]);
  line(ctx, x1, y1, x2, y2);
  ctx.setLineDash([]);
  [[x1, y1], [x2, y2]].forEach(([x, y]) => line(ctx, x - uy * 7, y + ux * 7, x + uy * 7, y - ux * 7));

  if (final) {
    ctx.fillStyle = color;
    [[x1, y1], [x2, y2]].forEach(([x, y]) => ctx.fillRect(x - 3.5, y - 3.5, 7, 7));
  }

  const angle = (Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  let nx = -uy;
  let ny = ux;
  if (ny > 1e-6 || (Math.abs(ny) <= 1e-6 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const GAP = 12;
  const tx = mx + nx * GAP;
  const ty = my + ny * GAP;
  const sideways = Math.abs(nx) > 0.6;
  ctx.textAlign = sideways ? (nx > 0 ? 'left' : 'right') : 'center';
  ctx.textBaseline = 'middle';

  const main = `${length.toFixed(3)} m`;
  const detail =
    length > 0.01
      ? `Δx ${Math.abs(b[0] - a[0]).toFixed(2)} · Δz ${Math.abs(b[1] - a[1]).toFixed(2)} · ${((angle + 360) % 360).toFixed(1)}°`
      : '';
  if (sideways) {
    label(ctx, main, tx, ty - 8, '700 12px ui-monospace, monospace', color);
    if (detail) label(ctx, detail, tx, ty + 8, '10px ui-monospace, monospace', COLORS.muted);
  } else {
    label(ctx, main, tx, ty, '700 12px ui-monospace, monospace', color);
    if (detail) label(ctx, detail, tx, ty - 15, '10px ui-monospace, monospace', COLORS.muted);
  }
}

function fitText(ctx, text, font, maxWidth) {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;

  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return `${text.slice(0, end).trimEnd()}…`;
}

export function label(ctx, text, x, y, font, color) {
  ctx.font = font;
  ctx.lineWidth = 4;
  ctx.strokeStyle = COLORS.background;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

const RECT_HANDLE = 5;

const PIN = 5;
const PIN_COLORS = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'];

function tracePolygon(ctx, viewport, points) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = viewport.toScreen(p);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
}

function drawPins(ctx, viewport, item, kind, activePin) {
  const pts = item.points;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const [mx, my] = viewport.toScreen([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    line(ctx, mx - 3, my, mx + 3, my);
    line(ctx, mx, my - 3, mx, my + 3);
  });
  pts.forEach((p, i) => {
    const [x, y] = viewport.toScreen(p);
    const active = activePin?.kind === kind && activePin.id === item.id && activePin.index === i;
    ctx.fillStyle = PIN_COLORS[i % PIN_COLORS.length];
    ctx.strokeStyle = active ? '#ffffff' : '#0f172a';
    ctx.lineWidth = active ? 3 : 1.5;
    ctx.beginPath();
    ctx.rect(x - PIN * (active ? 1.4 : 1), y - PIN * (active ? 1.4 : 1), PIN * 2 * (active ? 1.4 : 1), PIN * 2 * (active ? 1.4 : 1));
    ctx.fill();
    ctx.stroke();
    label(ctx, String(i + 1), x + 11, y - 9, '700 10px system-ui, sans-serif', PIN_COLORS[i % PIN_COLORS.length]);
  });
}

function drawYards(ctx, viewport, floor, selection, lineMode, activePin) {
  floor.yards.forEach((yard) => {
    const color = yard.color ?? YARD_GROUNDS[yard.ground]?.color ?? '#4d8f3a';
    const selected = selection.some((s) => s.kind === 'yard' && s.id === yard.id);

    tracePolygon(ctx, viewport, yard.points);
    if (!lineMode) {
      ctx.globalAlpha = selected ? 0.55 : 0.38;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = selected ? COLORS.accent : color;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const [cx, cy] = viewport.toScreen([(yard.minX + yard.maxX) / 2, (yard.minZ + yard.maxZ) / 2]);
    const elev = yard.elevation ? ` (${yard.elevation > 0 ? '+' : ''}${yard.elevation.toFixed(2)} m)` : '';
    label(ctx, `${yard.name}${elev}`, cx, cy, '600 12px system-ui, sans-serif', COLORS.yardText);
    treePositions(yard).forEach(([x, z, s]) => {
      const [tx, ty] = viewport.toScreen([x, z]);
      ctx.fillStyle = 'rgba(21,128,61,0.65)';
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(viewport.scale * 0.35 * s, 3), 0, Math.PI * 2);
      ctx.fill();
    });
    if (selected && selection.length === 1) drawPins(ctx, viewport, yard, 'yard', activePin);
  });
}

function drawStairs(ctx, viewport, floor, selection) {
  floor.stairs.forEach((stairs) => {
    const selected = selection.some((s) => s.kind === 'stairs' && s.id === stairs.id);
    const m = stairMetrics(stairs);
    const color = selected ? COLORS.accent : '#38bdf8';

    tracePolygon(ctx, viewport, stairs.points);
    ctx.globalAlpha = selected ? 0.3 : 0.16;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.stroke();

    ctx.lineWidth = 1;
    stairTreads(stairs).forEach(({ corners }) => {
      const [x1, y1] = viewport.toScreen(corners[1]);
      const [x2, y2] = viewport.toScreen(corners[2]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    const cx = (stairs.minX + stairs.maxX) / 2;
    const cz = (stairs.minZ + stairs.maxZ) / 2;
    const half = (m.run / 2) * 0.8;
    const from = viewport.toScreen([cx - m.ux * half, cz - m.uz * half]);
    const to = viewport.toScreen([cx + m.ux * half, cz + m.uz * half]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(to[0], to[1]);
    ctx.stroke();
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    ctx.beginPath();
    ctx.moveTo(to[0], to[1]);
    ctx.lineTo(to[0] - 10 * Math.cos(angle - 0.45), to[1] - 10 * Math.sin(angle - 0.45));
    ctx.lineTo(to[0] - 10 * Math.cos(angle + 0.45), to[1] - 10 * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    const [lx, ly] = viewport.toScreen([cx, cz]);
    if (selected && selection.length === 1) {
      stairHandles(stairs).forEach(({ point }) => {
        const [hx, hy] = viewport.toScreen(point);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = COLORS.accent;
        ctx.lineWidth = 2;
        ctx.fillRect(hx - 5, hy - 5, 10, 10);
        ctx.strokeRect(hx - 5, hy - 5, 10, 10);
      });
    }

    label(ctx, `${stairs.name} · NAIK (${m.steps} anak tangga)`, lx, ly - 12, '600 11px system-ui, sans-serif', COLORS.stairText);
  });
}

function drawRoofs(ctx, viewport, floor, selection, activePin) {
  floor.roofs.forEach((roof) => {
    const o = roof.overhang ?? 0;
    const selected = selection.some((s) => s.kind === 'roof' && s.id === roof.id);
    const color = selected ? COLORS.accent : '#f97316';
    const rect = isAxisRect(roof.points);
    const outline = o ? offsetPolygon(roof.points, o) : roof.points;

    if (o) {
      tracePolygon(ctx, viewport, roof.points);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    tracePolygon(ctx, viewport, outline);
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.setLineDash([10, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    const shape = roofShape(roof);
    const c = viewport.toScreen([(roof.minX + roof.maxX) / 2, (roof.minZ + roof.maxZ) / 2]);
    ctx.lineWidth = 1;
    if (rect && (shape.type === 'gable' || shape.type === 'hip')) {
      const cxw = (roof.minX + roof.maxX) / 2;
      const czw = (roof.minZ + roof.maxZ) / 2;
      const [x1, y1] = viewport.toScreen([roof.minX - o, roof.minZ - o]);
      const [x2, y2] = viewport.toScreen([roof.maxX + o, roof.maxZ + o]);
      if (shape.axis === 'x') {
        const half = shape.type === 'hip' ? shape.ridgeLength / 2 : (roof.maxX - roof.minX) / 2 + o;
        const [ra, rz] = viewport.toScreen([cxw - half, czw]);
        const [rb] = viewport.toScreen([cxw + half, 0]);
        line(ctx, ra, rz, rb, rz);
        if (shape.type === 'hip') {
          [[x1, y1], [x1, y2]].forEach(([x, y]) => line(ctx, x, y, ra, rz));
          [[x2, y1], [x2, y2]].forEach(([x, y]) => line(ctx, x, y, rb, rz));
        }
      } else {
        const half = shape.type === 'hip' ? shape.ridgeLength / 2 : (roof.maxZ - roof.minZ) / 2 + o;
        const [rx, ra] = viewport.toScreen([cxw, czw - half]);
        const [, rb] = viewport.toScreen([0, czw + half]);
        line(ctx, rx, ra, rx, rb);
        if (shape.type === 'hip') {
          [[x1, y1], [x2, y1]].forEach(([x, y]) => line(ctx, x, y, rx, ra));
          [[x1, y2], [x2, y2]].forEach(([x, y]) => line(ctx, x, y, rx, rb));
        }
      }
    } else if (!rect && shape.type === 'hip') {
      roof.points.forEach((p) => {
        const [x, y] = viewport.toScreen(p);
        ctx.globalAlpha = 0.4;
        line(ctx, x, y, c[0], c[1]);
        ctx.globalAlpha = 1;
      });
    } else if (shape.type === 'shed') {
      const down = roof.flip === -1 ? 1 : -1;
      const dx = shape.axis === 'x' ? 0 : down * 14;
      const dz = shape.axis === 'x' ? down * 14 : 0;
      line(ctx, c[0] - dx, c[1] - dz, c[0] + dx, c[1] + dz);
    }

    if (roof.type === 'canopy') {
      ctx.fillStyle = color;
      roof.points.forEach((p) => {
        const [x, y] = viewport.toScreen(p);
        ctx.fillRect(x - 3, y - 3, 6, 6);
      });
    }
    const lift = roof.base ? ` · dasar ${roof.base > 0 ? '+' : ''}${roof.base.toFixed(2)} m` : '';
    label(ctx, `${ROOF_TYPE_LABEL[roof.type] ?? 'Atap'}${lift}`, c[0], c[1] - 14, '600 11px system-ui, sans-serif', color);

    if (selected && selection.length === 1) drawPins(ctx, viewport, roof, 'roof', activePin);
  });
}

const ROOF_TYPE_LABEL = { gable: 'Atap pelana', hip: 'Atap perisai', shed: 'Atap miring', flat: 'Dak datar', canopy: 'Kanopi' };

function drawGuides(ctx, viewport, guides) {
  ctx.save();
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  guides.forEach((g) => {
    ctx.beginPath();
    if (g.axis === 'x') {
      const [x] = viewport.toScreen([g.value, 0]);
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, viewport.height);
    } else {
      const [, y] = viewport.toScreen([0, g.value]);
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(viewport.width, y + 0.5);
    }
    ctx.stroke();
  });
  ctx.setLineDash([]);
  guides.forEach((g) => {
    const text = `${g.value.toFixed(2)} m`;
    if (g.axis === 'x') {
      const [x] = viewport.toScreen([g.value, 0]);
      label(ctx, text, x + 4, viewport.height - 12, '600 10px ui-monospace, monospace', '#22d3ee');
    } else {
      const [, y] = viewport.toScreen([0, g.value]);
      label(ctx, text, viewport.width - 60, y - 5, '600 10px ui-monospace, monospace', '#22d3ee');
    }
  });
  ctx.restore();
}

function drawLot(ctx, viewport, plan) {
  const lot = plan.lot;
  const inner = plan.setbackRect();
  const rect = (r) => {
    const [x1, y1] = viewport.toScreen([r.minX, r.minZ]);
    const [x2, y2] = viewport.toScreen([r.maxX, r.maxZ]);
    return [x1, y1, x2 - x1, y2 - y1];
  };
  ctx.save();
  ctx.strokeStyle = '#d6a05a';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([14, 4, 2, 4]);
  ctx.strokeRect(...rect(lot));
  ctx.strokeStyle = '#f87171';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(...rect(inner));
  ctx.setLineDash([]);
  ctx.restore();

  const [x1, y1, w, h] = rect(lot);
  const marks = {
    minX: [x1 + 6, y1 + h / 2],
    maxX: [x1 + w - 44, y1 + h / 2],
    minZ: [x1 + w / 2 - 20, y1 + 14],
    maxZ: [x1 + w / 2 - 20, y1 + h - 6],
  };
  const [mx, my] = marks[lot.front];
  label(ctx, 'DEPAN', mx, my, '700 11px system-ui, sans-serif', '#d6a05a');
  label(ctx, 'Batas tanah', x1 + 6, y1 + h - 6 - (lot.front === 'maxZ' ? 14 : 0), '600 10px system-ui, sans-serif', '#d6a05a');
}
