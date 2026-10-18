import { dimensionGeometry, GRID_OFFSET, netArea, planAnnotations, TYPE_LABEL } from './annotations.js';
import { boundsOf, normalOnWall, offsetPolygon, pointOnWall, polygonCentroid, tangentOnWall, wallPolyline } from './geometry.js';
import { stairMetrics, stairTreads } from './stairs.js';

export const PAPERS = { A3: [420, 297], A4: [297, 210] };
export const SCALES = [20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 500];

const FONT = 'Arial, Helvetica, sans-serif';
const INK = '#111';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const el = (v) => `${v < -1e-9 ? '-' : '+'}${Math.abs(v).toFixed(2)}`;

export function buildSheet(plan, floorId, options = {}) {
  const floor = plan.floor(floorId) ?? plan.floors[0];
  const ann = planAnnotations(plan, floor);
  if (!ann) return null;

  const paper = PAPERS[options.paper] ? options.paper : 'A3';
  const [W, H] = PAPERS[paper];
  const margin = 10;
  const left = 20;
  const tbW = paper === 'A3' ? 78 : 66;
  const frame = { x0: left, y0: margin, x1: W - margin, y1: H - margin };
  const area = { x0: left + 3, y0: margin + 3, x1: frame.x1 - tbW - 3, y1: frame.y1 - 3 };
  const areaW = area.x1 - area.x0;
  const areaH = area.y1 - area.y0 - 12;

  const { minX, maxX, minZ, maxZ } = ann.bounds;
  const pad = GRID_OFFSET + 0.6;
  const needW = maxX - minX + 2 * pad;
  const needH = maxZ - minZ + 2 * pad;
  const fitsAt = (n) => (needW * 1000) / n <= areaW && (needH * 1000) / n <= areaH;
  const auto = SCALES.find(fitsAt) ?? SCALES.at(-1);
  const scale = options.scale && options.scale !== 'auto' ? Number(options.scale) : auto;
  const fits = fitsAt(scale);
  const k = 1000 / scale;

  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const ox = (area.x0 + area.x1) / 2;
  const oy = (area.y0 + area.y1 - 12) / 2;
  const P = (p) => [ox + (p[0] - cx) * k, oy + (p[1] - cz) * k];
  const pt = (p) => P(p).map(n2).join(',');

  const out = [];
  const add = (s) => out.push(s);
  const line = (a, b, w = 0.18, extra = '') => {
    add(`<line x1="${n2(a[0])}" y1="${n2(a[1])}" x2="${n2(b[0])}" y2="${n2(b[1])}" stroke="${INK}" stroke-width="${w}" ${extra}/>`);
  };
  const text = (x, y, value, { size = 2.4, anchor = 'middle', weight = 400, rotate = 0, fill = INK, halo = true, italic = false } = {}) => {
    const tr = rotate ? ` transform="rotate(${rotate} ${n2(x)} ${n2(y)})"` : '';
    const h = halo ? ` stroke="#fff" stroke-width="${n2(size * 0.35)}" paint-order="stroke" stroke-linejoin="round"` : '';
    add(`<text x="${n2(x)}" y="${n2(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" dominant-baseline="central" fill="${fill}"${italic ? ' font-style="italic"' : ''}${h}${tr}>${esc(value)}</text>`);
  };
  const polyPath = (points) => `M${points.map(pt).join('L')}Z`;

  add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`);
  add(`<defs><clipPath id="drawing-area"><rect x="${area.x0}" y="${area.y0}" width="${area.x1 - area.x0}" height="${area.y1 - area.y0}"/></clipPath></defs>`);
  add(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  add(`<rect x="${frame.x0}" y="${frame.y0}" width="${frame.x1 - frame.x0}" height="${frame.y1 - frame.y0}" fill="none" stroke="${INK}" stroke-width="0.7"/>`);

  add('<g clip-path="url(#drawing-area)">');

  floor.roofs.forEach((roof) => {
    const pts = roof.overhang ? offsetPolygon(roof.points, roof.overhang) : roof.points;
    add(`<path d="${polyPath(pts)}" fill="none" stroke="#777" stroke-width="0.12" stroke-dasharray="4 1 1 1"/>`);
  });
  floor.yards.forEach((yard) => {
    add(`<path d="${polyPath(yard.points)}" fill="none" stroke="#888" stroke-width="0.15" stroke-dasharray="2 1"/>`);
    const [x, y] = P(polygonCentroid(yard.points));
    text(x, y, yard.name, { size: 2, fill: '#666', italic: true });
  });

  const quads = [];
  floor.walls.forEach((wall) => {
    const half = (wall.thickness ?? plan.wallThickness) / 2;
    const pts = wallPolyline(wall);
    for (let i = 1; i < pts.length; i++) {
      let a = pts[i - 1];
      let b = pts[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      const u = [dx / l, dz / l];
      const nrm = [-u[1] * half, u[0] * half];
      if (i === 1) a = [a[0] - u[0] * half, a[1] - u[1] * half];
      if (i === pts.length - 1) b = [b[0] + u[0] * half, b[1] + u[1] * half];
      quads.push(polyPath([[a[0] + nrm[0], a[1] + nrm[1]], [b[0] + nrm[0], b[1] + nrm[1]], [b[0] - nrm[0], b[1] - nrm[1]], [a[0] - nrm[0], a[1] - nrm[1]]]));
    }
  });
  add(`<path d="${quads.join('')}" fill="#2b2b2b" stroke="#2b2b2b" stroke-width="0.1"/>`);

  floor.openings.forEach((o) => {
    if (o.type === 'niche') return;
    const wall = floor.walls.find((w) => w.id === o.wallId);
    if (!wall) return;
    const half = (wall.thickness ?? plan.wallThickness) / 2;
    const u = tangentOnWall(wall, o.offset);
    const nrm = normalOnWall(wall, o.offset);
    const p1 = pointOnWall(wall, o.offset - o.width / 2);
    const p2 = pointOnWall(wall, o.offset + o.width / 2);
    const off = (p, s) => [p[0] + nrm[0] * s, p[1] + nrm[1] * s];
    add(`<path d="${polyPath([off(p1, half + 0.02), off(p2, half + 0.02), off(p2, -half - 0.02), off(p1, -half - 0.02)])}" fill="#fff"/>`);
    const seg = (a, b, w = 0.2, extra = '') => line(P(a), P(b), w, extra);
    seg(off(p1, half), off(p1, -half));
    seg(off(p2, half), off(p2, -half));

    if (o.type === 'door') {
      const swing = o.swing === -1 ? -1 : 1;
      const double = o.leaves === 2;
      const r = o.width / (double ? 2 : 1);
      const leaf = (hinge, dir) => {
        const free = [hinge[0] + u[0] * dir * r, hinge[1] + u[1] * dir * r];
        const open = [hinge[0] + nrm[0] * swing * r, hinge[1] + nrm[1] * swing * r];
        seg(hinge, open, 0.35);
        const [hx, hy] = P(hinge);
        const [fx, fy] = P(free);
        const [ex, ey] = P(open);
        const cross = (fx - hx) * (ey - hy) - (fy - hy) * (ex - hx);
        add(`<path d="M${n2(fx)},${n2(fy)}A${n2(r * k)},${n2(r * k)} 0 0 ${cross > 0 ? 1 : 0} ${n2(ex)},${n2(ey)}" fill="none" stroke="${INK}" stroke-width="0.13"/>`);
      };
      if (double) {
        leaf(p1, 1);
        leaf(p2, -1);
      } else if (o.hinge === -1) leaf(p2, -1);
      else leaf(p1, 1);
    } else {
      const dash = o.type === 'vent' ? 'stroke-dasharray="1.2 0.8"' : '';
      [half, half / 3, -half / 3, -half].forEach((s) => seg(off(p1, s), off(p2, s), s === half || s === -half ? 0.2 : 0.12, dash));
    }
  });

  floor.stairs.forEach((st) => {
    const m = stairMetrics(st);
    add(`<path d="${polyPath(st.points)}" fill="none" stroke="${INK}" stroke-width="0.25"/>`);
    stairTreads(st).forEach(({ corners }) => line(P(corners[1]), P(corners[2]), 0.12));
    const sx = (st.minX + st.maxX) / 2;
    const sz = (st.minZ + st.maxZ) / 2;
    const tail = P([sx - m.ux * m.run * 0.4, sz - m.uz * m.run * 0.4]);
    const head = P([sx + m.ux * m.run * 0.4, sz + m.uz * m.run * 0.4]);
    line(tail, head, 0.25);
    const ang = Math.atan2(head[1] - tail[1], head[0] - tail[0]);
    const wing = (a) => [head[0] - 2.2 * Math.cos(ang + a), head[1] - 2.2 * Math.sin(ang + a)];
    add(`<path d="M${n2(head[0])},${n2(head[1])}L${wing(0.4).map(n2).join(',')}L${wing(-0.4).map(n2).join(',')}Z" fill="${INK}"/>`);
    text(tail[0], tail[1] + (m.ux ? 3 : 0), 'NAIK', { size: 2.2, weight: 700 });
  });

  const gridStyle = 'stroke-dasharray="6 1.5 1 1.5"';
  ann.grid.x.forEach((x, i) => {
    const a = P([x, minZ - GRID_OFFSET]);
    const b = P([x, maxZ + 0.3]);
    line([a[0], a[1] + 3.5], b, 0.13, gridStyle);
    add(`<circle cx="${n2(a[0])}" cy="${n2(a[1])}" r="3.5" fill="#fff" stroke="${INK}" stroke-width="0.2"/>`);
    text(a[0], a[1], String(i + 1), { size: 3.2, weight: 700, halo: false });
  });
  ann.grid.z.forEach((z, i) => {
    const a = P([minX - GRID_OFFSET, z]);
    const b = P([maxX + 0.3, z]);
    line([a[0] + 3.5, a[1]], b, 0.13, gridStyle);
    add(`<circle cx="${n2(a[0])}" cy="${n2(a[1])}" r="3.5" fill="#fff" stroke="${INK}" stroke-width="0.2"/>`);
    text(a[0], a[1], String.fromCharCode(65 + (i % 26)), { size: 3.2, weight: 700, halo: false });
  });

  ann.dims.forEach((dim) => {
    const g = dimensionGeometry(dim, ann.bounds);
    g.extensions.forEach(([from, to]) => {
      const a = P(from);
      const b = P(to);
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const ux = (b[0] - a[0]) / d;
      const uy = (b[1] - a[1]) / d;
      line([a[0] + ux * 1.2, a[1] + uy * 1.2], [b[0] + ux * 1, b[1] + uy * 1], 0.1);
    });
    const [a, b] = g.line.map(P);
    line(a, b, 0.13);
    [a, b].forEach((p) => line([p[0] - 1.2, p[1] + 1.2], [p[0] + 1.2, p[1] - 1.2], 0.3));
    const len = Math.abs(dim.b - dim.a) * k;
    if (!g.labelled || len < 6) return;
    const [mx, my] = P(g.mid);
    if (dim.vertical) text(mx - 1.1, my, g.label, { size: 2.3, rotate: -90 });
    else text(mx, my - 1.1, g.label, { size: 2.3 });
  });

  let netTotal = 0;
  floor.rooms.forEach((room) => {
    const [x, y] = P(polygonCentroid(room.polygon));
    const b = boundsOf(room.polygon);
    const net = netArea(plan, room);
    netTotal += net;
    const widthMm = (b.maxX - b.minX) * k - 2;
    const size = Math.max(1.8, Math.min(3, widthMm / (room.name.length * 0.58)));
    text(x, y - 1.8, room.name, { size, weight: 700 });
    text(x, y + 1.6, `${net.toFixed(1)} m²`, { size: 2.3 });
    const base = plan.elevationOf(floor) + (room.elevation ?? 0);
    text(x, y + 4.6, `EL ${Math.abs(base) < 1e-9 ? '±0.00' : el(base)}`, { size: 2, fill: '#444' });
  });

  ann.tags.forEach(({ p, code }) => {
    const [x, y] = P(p);
    text(x, y, code, { size: 2.3, weight: 700 });
  });
  add('</g>');

  const barM = [1, 2, 5, 10, 20, 50].find((m) => m * k >= 40) ?? 50;
  const bx = area.x0 + 4;
  const by = area.y1 - 4;
  for (let i = 0; i < 4; i++) {
    const w = (barM * k) / 4;
    add(`<rect x="${n2(bx + i * w)}" y="${by - 1.5}" width="${n2(w)}" height="1.5" fill="${i % 2 ? '#fff' : INK}" stroke="${INK}" stroke-width="0.15"/>`);
  }
  text(bx, by - 4, '0', { size: 2, halo: false });
  text(bx + barM * k, by - 4, `${barM} m`, { size: 2, halo: false });
  text(bx + barM * k + 6, by - 0.8, `SKALA 1:${scale}`, { size: 2.6, weight: 700, anchor: 'start', halo: false });

  const tx = frame.x1 - tbW;
  line([tx, frame.y0], [tx, frame.y1], 0.7);
  const inner = tbW - 8;

  const ncx = tx + tbW / 2;
  const ncy = frame.y0 + 20;
  const deg = Number.isFinite(options.northDeg) ? options.northDeg : plan.north ?? 0;
  add(`<circle cx="${n2(ncx)}" cy="${n2(ncy)}" r="10" fill="none" stroke="${INK}" stroke-width="0.25"/>`);
  add(`<g transform="rotate(${deg} ${n2(ncx)} ${n2(ncy)})"><path d="M${n2(ncx)},${n2(ncy - 10)}L${n2(ncx + 4.5)},${n2(ncy + 6)}L${n2(ncx)},${n2(ncy + 3)}L${n2(ncx - 4.5)},${n2(ncy + 6)}Z" fill="${INK}"/></g>`);
  const rad = (deg * Math.PI) / 180;
  text(ncx + Math.sin(rad) * 14, ncy - Math.cos(rad) * 14, 'U', { size: 4, weight: 700, halo: false });

  let y = frame.y0 + 40;
  line([tx, y], [frame.x1, y], 0.4);
  y += 5;
  text(tx + 4, y, 'KETERANGAN', { size: 2.6, weight: 700, anchor: 'start', halo: false });
  const notes = [
    'Ukuran dalam cm; elevasi (EL) dalam m.',
    'EL ±0.00 = permukaan lantai dasar.',
    'Luas ruang = luas bersih (setelah dikurangi tebal dinding).',
    `Total luas ruang bersih: ${netTotal.toFixed(1)} m².`,
    'Periksa ukuran di lapangan sebelum pelaksanaan.',
  ];
  const wrapAt = Math.floor(inner / 1.2);
  notes.forEach((note, i) => {
    const words = note.split(' ');
    const lines = [];
    let cur = `${i + 1}. `;
    words.forEach((w) => {
      if ((cur + w).length > wrapAt) {
        lines.push(cur.trimEnd());
        cur = '    ';
      }
      cur += `${w} `;
    });
    lines.push(cur.trimEnd());
    lines.forEach((l) => {
      y += 4.2;
      text(tx + 4, y, l, { size: 2.1, anchor: 'start', halo: false });
    });
  });

  y += 6;
  line([tx, y], [frame.x1, y], 0.4);
  y += 5;
  text(tx + 4, y, 'TABEL PINTU / JENDELA', { size: 2.6, weight: 700, anchor: 'start', halo: false });
  y += 3;
  const cols = [0, 0.15, 0.4, 0.74, 0.9].map((f) => tx + 4 + f * inner);
  const rows = [['Kode', 'Jenis', 'L x T (cm)', 'Ambang', 'Jml'], ...ann.schedule.map((s) => [s.code, TYPE_LABEL[s.type] ?? s.type, `${Math.round(s.width * 100)} x ${Math.round(s.height * 100)}`, String(Math.round(s.sill * 100)), String(s.count)])];
  const rowH = 4.6;
  add(`<rect x="${tx + 4}" y="${n2(y)}" width="${inner}" height="${n2(rowH * rows.length)}" fill="none" stroke="${INK}" stroke-width="0.2"/>`);
  rows.forEach((row, r) => {
    if (r) line([tx + 4, y + r * rowH], [tx + 4 + inner, y + r * rowH], 0.1);
    row.forEach((cell, c) => text(cols[c] + 1, y + r * rowH + rowH / 2, cell, { size: 2, anchor: 'start', weight: r ? 400 : 700, halo: false }));
  });

  const blockH = 70;
  const by0 = frame.y1 - blockH;
  line([tx, by0], [frame.x1, by0], 0.7);
  const cell = (x, yy, w, h, label, value, size = 3) => {
    add(`<rect x="${n2(x)}" y="${n2(yy)}" width="${n2(w)}" height="${n2(h)}" fill="none" stroke="${INK}" stroke-width="0.2"/>`);
    text(x + 1.5, yy + 2.2, label, { size: 1.7, anchor: 'start', fill: '#555', halo: false });
    const wrap = Math.max(8, Math.floor((w - 3) / (size * 0.55)));
    const shown = String(value).length > wrap ? `${String(value).slice(0, wrap - 1)}…` : String(value);
    text(x + 1.5, yy + h - 3.4, shown, { size, weight: 700, anchor: 'start', halo: false });
  };
  const bw = tbW;
  cell(tx, by0, bw, 14, 'PROYEK', options.project || plan.name || 'Rumah', 3.6);
  cell(tx, by0 + 14, bw, 14, 'NAMA GAMBAR', `DENAH ${(floor.name ?? '').toUpperCase()}`, 3.6);
  cell(tx, by0 + 28, bw / 2, 10, 'SKALA', `1:${scale}`);
  cell(tx + bw / 2, by0 + 28, bw / 2, 10, 'KERTAS', paper);
  cell(tx, by0 + 38, bw / 2, 10, 'NO. GAMBAR', options.drawingNo || 'A-01');
  cell(tx + bw / 2, by0 + 38, bw / 2, 10, 'TANGGAL', options.date || new Date().toLocaleDateString('id-ID'));
  cell(tx, by0 + 48, bw / 2, 11, 'DIGAMBAR', options.drafter || '-');
  cell(tx + bw / 2, by0 + 48, bw / 2, 11, 'DIPERIKSA', '');
  add(`<rect x="${tx}" y="${by0 + 59}" width="${bw}" height="11" fill="none" stroke="${INK}" stroke-width="0.2"/>`);
  text(tx + 1.5, by0 + 64.5, 'Dibuat dengan 3D Floor Studio', { size: 1.8, anchor: 'start', fill: '#555', halo: false });

  add('</svg>');
  return { svg: out.join('\n'), scale, fits, paper };
}
