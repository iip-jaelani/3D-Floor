import { offsetPolygon } from './geometry.js';
import { dimensionGeometry, GRID_OFFSET, planAnnotations, TYPE_LABEL } from './annotations.js';
import { stairMetrics, stairTreads } from './stairs.js';
import { wallLength, wallPolyline, pointOnWall, tangentOnWall, polygonArea, polygonCentroid } from './geometry.js';

const LAYERS = {
  DINDING: 7, RUANGAN: 3, BUKAAN: 4, ATAP: 8, HALAMAN: 3, TANAH: 5, SEMPADAN: 1,
  TANGGA: 5, DIMENSI: 2, KODE: 6, SUMBU: 8, JUDUL: 7,
};
export function toDxf(plan, floorId, { annotate = true } = {}) {
  const floor = plan.floor(floorId) ?? plan.floors[0];
  const out = [];
  const pair = (code, value) => out.push(String(code), String(value));
  const y = (z) => -z;

  const line = (layer, a, b) => {
    pair(0, 'LINE');
    pair(8, layer);
    pair(10, a[0].toFixed(4));
    pair(20, y(a[1]).toFixed(4));
    pair(30, 0);
    pair(11, b[0].toFixed(4));
    pair(21, y(b[1]).toFixed(4));
    pair(31, 0);
  };
  const ring = (layer, points) => points.forEach((p, i) => line(layer, p, points[(i + 1) % points.length]));
  const text = (layer, p, height, value, { align = 'left', angle = 0 } = {}) => {
    pair(0, 'TEXT');
    pair(8, layer);
    pair(10, p[0].toFixed(4));
    pair(20, y(p[1]).toFixed(4));
    pair(30, 0);
    pair(40, height);
    pair(1, value);
    if (angle) pair(50, angle);
    if (align === 'center') {
      pair(72, 1);
      pair(73, 2);
      pair(11, p[0].toFixed(4));
      pair(21, y(p[1]).toFixed(4));
      pair(31, 0);
    }
  };
  const circle = (layer, c, r) => {
    pair(0, 'CIRCLE');
    pair(8, layer);
    pair(10, c[0].toFixed(4));
    pair(20, y(c[1]).toFixed(4));
    pair(30, 0);
    pair(40, r);
  };
  const box = (layer, x0, z0, x1, z1) => ring(layer, [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]);

  function annotations() {
    const ann = planAnnotations(plan, floor);
    if (!ann) return;
    const { minX, maxX, minZ, maxZ } = ann.bounds;
    const H = 0.14;

    ann.dims.forEach((dim) => {
      const g = dimensionGeometry(dim, ann.bounds);
      g.extensions.forEach(([from, to]) => {
        const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
        line('DIMENSI', from, [to[0] + ((to[0] - from[0]) / d) * 0.12, to[1] + ((to[1] - from[1]) / d) * 0.12]);
      });
      line('DIMENSI', g.line[0], g.line[1]);
      g.line.forEach((p) => line('DIMENSI', [p[0] - 0.06, p[1] + 0.06], [p[0] + 0.06, p[1] - 0.06]));
      if (!g.labelled) return;
      if (dim.vertical) text('DIMENSI', [g.mid[0] - 0.1, g.mid[1]], H, g.label, { align: 'center', angle: 90 });
      else text('DIMENSI', [g.mid[0], g.mid[1] - 0.1], H, g.label, { align: 'center' });
    });

    const R = 0.3;
    ann.grid.x.forEach((x, i) => {
      line('SUMBU', [x, minZ - GRID_OFFSET + R], [x, maxZ + 0.3]);
      circle('SUMBU', [x, minZ - GRID_OFFSET], R);
      text('SUMBU', [x, minZ - GRID_OFFSET], 0.22, String(i + 1), { align: 'center' });
    });
    ann.grid.z.forEach((z, i) => {
      line('SUMBU', [minX - GRID_OFFSET + R, z], [maxX + 0.3, z]);
      circle('SUMBU', [minX - GRID_OFFSET, z], R);
      text('SUMBU', [minX - GRID_OFFSET, z], 0.22, String.fromCharCode(65 + (i % 26)), { align: 'center' });
    });

    ann.tags.forEach(({ p, code }) => text('KODE', p, 0.12, code, { align: 'center' }));

    const tx = maxX + 3.4;
    const col = [0, 0.9, 1.7, 3.3, 4.3];
    const rowH = 0.3;
    const tw = col[col.length - 1] + 0.9;
    text('KODE', [tx, minZ - 0.4], 0.18, 'TABEL PINTU / JENDELA');
    box('KODE', tx, minZ, tx + tw, minZ + rowH * (ann.schedule.length + 1));
    ['Kode', 'Jenis', 'Lebar x Tinggi (cm)', 'Ambang', 'Jml'].forEach((h, i) => text('KODE', [tx + col[i] + 0.05, minZ + 0.2], 0.1, h));
    ann.schedule.forEach((k, r) => {
      const z = minZ + rowH * (r + 1);
      line('KODE', [tx, z], [tx + tw, z]);
      [k.code, TYPE_LABEL[k.type] ?? k.type, `${Math.round(k.width * 100)} x ${Math.round(k.height * 100)}`, `${Math.round(k.sill * 100)}`, String(k.count)]
        .forEach((v, i) => text('KODE', [tx + col[i] + 0.05, z + 0.2], 0.1, v));
    });

    const nx = maxX + 3.4 + 2.2;
    const nz = minZ - 1.6;
    const a = ((plan.north ?? 0) * Math.PI) / 180;
    const rot = (dx, dz) => [nx + dx * Math.cos(a) - dz * Math.sin(a), nz + dx * Math.sin(a) + dz * Math.cos(a)];
    circle('JUDUL', [nx, nz], 0.8);
    [[[0, -0.8], [0.3, 0.45]], [[0.3, 0.45], [0, 0.2]], [[0, 0.2], [-0.3, 0.45]], [[-0.3, 0.45], [0, -0.8]]].forEach(([p, q]) => line('JUDUL', rot(...p), rot(...q)));
    text('JUDUL', rot(0, -1.25), 0.3, 'U', { align: 'center' });

    const ty = maxZ + 3.6;
    text('JUDUL', [minX, ty], 0.3, `DENAH ${(floor.name ?? '').toUpperCase()}`);
    text('JUDUL', [minX, ty + 0.4], 0.15, `${plan.name ?? ''}   Skala 1:100   Ukuran dalam cm, elevasi dalam m`);
  }

  pair(0, 'SECTION');
  pair(2, 'TABLES');
  pair(0, 'TABLE');
  pair(2, 'LAYER');
  pair(70, Object.keys(LAYERS).length);
  Object.entries(LAYERS).forEach(([name, color]) => {
    pair(0, 'LAYER');
    pair(2, name);
    pair(70, 0);
    pair(62, color);
    pair(6, 'CONTINUOUS');
  });
  pair(0, 'ENDTAB');
  pair(0, 'ENDSEC');

  pair(0, 'SECTION');
  pair(2, 'ENTITIES');

  floor.walls.forEach((wall) => {
    const t = (wall.thickness ?? plan.wallThickness) / 2;
    const pts = wallPolyline(wall);
    for (let i = 1; i < pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i]];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      const n = [(-dz / l) * t, (dx / l) * t];
      [1, -1].forEach((s) => line('DINDING', [a[0] + n[0] * s, a[1] + n[1] * s], [b[0] + n[0] * s, b[1] + n[1] * s]));
    }
  });

  floor.openings.forEach((o) => {
    const wall = floor.walls.find((w) => w.id === o.wallId);
    if (!wall || wallLength(wall) === 0) return;
    const t = (wall.thickness ?? plan.wallThickness) / 2;
    const u = tangentOnWall(wall, o.offset);
    const n = [-u[1], u[0]];
    [o.offset - o.width / 2, o.offset + o.width / 2].forEach((s) => {
      const c = pointOnWall(wall, s);
      line('BUKAAN', [c[0] + n[0] * t, c[1] + n[1] * t], [c[0] - n[0] * t, c[1] - n[1] * t]);
    });
  });

  floor.rooms.forEach((room) => {
    ring('RUANGAN', room.polygon);
    const c = room.polygon.reduce((s, p) => [s[0] + p[0] / room.polygon.length, s[1] + p[1] / room.polygon.length], [0, 0]);
    if (!annotate) return text('RUANGAN', c, 0.25, room.name ?? 'Ruangan');
    const mid = polygonCentroid(room.polygon);
    text('RUANGAN', [mid[0], mid[1] - 0.05], 0.2, room.name ?? 'Ruangan', { align: 'center' });
    text('RUANGAN', [mid[0], mid[1] + 0.25], 0.15, `${polygonArea(room.polygon).toFixed(1)} m2`, { align: 'center' });
  });
  floor.roofs.forEach((r) => ring('ATAP', r.overhang ? offsetPolygon(r.points, r.overhang) : r.points));
  floor.yards.forEach((yd) => ring('HALAMAN', yd.points));
  floor.stairs.forEach((st) => {
    const m = stairMetrics(st);
    ring('TANGGA', st.points);
    stairTreads(st).forEach(({ corners }) => line('TANGGA', corners[1], corners[2]));
    const cx = (st.minX + st.maxX) / 2;
    const cz = (st.minZ + st.maxZ) / 2;
    const tail = [cx - m.ux * m.run * 0.4, cz - m.uz * m.run * 0.4];
    const head = [cx + m.ux * m.run * 0.4, cz + m.uz * m.run * 0.4];
    line('TANGGA', tail, head);
    [0.4, -0.4].forEach((a) => {
      const bx = -m.ux * Math.cos(a) + m.uz * Math.sin(a);
      const bz = -m.uz * Math.cos(a) - m.ux * Math.sin(a);
      line('TANGGA', head, [head[0] + bx * 0.25, head[1] + bz * 0.25]);
    });
    if (annotate) text('TANGGA', [cx, cz + 0.3], 0.15, `NAIK ${m.steps} x ${Math.round(m.riser * 100)}/${Math.round(m.tread * 100)}`, { align: 'center' });
  });
  if (plan.lot) {
    const l = plan.lot;
    ring('TANAH', [[l.minX, l.minZ], [l.maxX, l.minZ], [l.maxX, l.maxZ], [l.minX, l.maxZ]]);
    const s = plan.setbackRect();
    ring('SEMPADAN', [[s.minX, s.minZ], [s.maxX, s.minZ], [s.maxX, s.maxZ], [s.minX, s.maxZ]]);
  }

  if (annotate) annotations();

  pair(0, 'ENDSEC');
  pair(0, 'EOF');
  return out.join('\n');
}
