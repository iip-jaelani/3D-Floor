import { polygonArea, wallLength } from './geometry.js';
import { stairMetrics } from './stairs.js';

const slope = (roof) => 1 / Math.cos(((roof.pitch ?? 0) * Math.PI) / 180);

export function quantities(plan) {
  const t = {
    floorArea: 0,
    wallLength: 0,
    wallArea: 0,
    wallVolume: 0,
    doorSingle: 0,
    doorDouble: 0,
    windowArea: 0,
    windowCount: 0,
    ventCount: 0,
    roofArea: 0,
    canopyArea: 0,
    terraceArea: 0,
    yardGreen: 0,
    yardHard: 0,
    stairSteps: 0,
  };

  plan.floors.forEach((floor) => {
    floor.rooms.forEach((r) => (t.floorArea += polygonArea(r.polygon)));

    floor.walls.forEach((wall) => {
      const length = wallLength(wall);
      const height = wall.height ?? plan.wallHeight;
      const thick = wall.thickness ?? plan.wallThickness;
      t.wallLength += length;
      t.wallArea += length * height;
      t.wallVolume += length * height * thick;
    });

    floor.openings.forEach((o) => {
      const wall = floor.walls.find((w) => w.id === o.wallId);
      const thick = wall?.thickness ?? plan.wallThickness;
      const area = o.width * o.height;
      if (o.type === 'niche') return;
      t.wallArea -= area;
      t.wallVolume -= area * thick;
      if (o.type === 'door') {
        if (o.leaves === 2) t.doorDouble++;
        else t.doorSingle++;
      } else if (o.type === 'window') {
        t.windowCount++;
        t.windowArea += area;
      } else if (o.type === 'vent') {
        t.ventCount++;
      }
      if (o.vent) t.ventCount++;
    });

    floor.roofs.forEach((r) => {
      const area = polygonArea(r.points) * slope(r) +
        (r.overhang ? perimeter(r.points) * r.overhang * slope(r) + Math.PI * r.overhang * r.overhang : 0);
      if (r.type === 'canopy') t.canopyArea += area;
      else t.roofArea += area;
    });

    floor.stairs.forEach((st) => (t.stairSteps += stairMetrics(st).steps));

    floor.yards.forEach((y) => {
      const area = polygonArea(y.points);
      if (y.ground === 'teras') t.terraceArea += area;
      else if (y.ground === 'grass' || y.ground === 'soil') t.yardGreen += area;
      else t.yardHard += area;
    });
  });

  const rows = [
    ['floorArea', 'Lantai (ruangan) + plafon', 'm²', t.floorArea],
    ['wallArea', 'Dinding bata (satu sisi, dikurangi bukaan)', 'm²', Math.max(t.wallArea, 0)],
    ['wallVolume', 'Volume pasangan dinding', 'm³', Math.max(t.wallVolume, 0)],
    ['doorSingle', 'Pintu tunggal', 'unit', t.doorSingle],
    ['doorDouble', 'Pintu dua daun', 'unit', t.doorDouble],
    ['windowArea', 'Jendela', 'm²', t.windowArea],
    ['ventCount', 'Lubang angin / ventilasi', 'unit', t.ventCount],
    ['roofArea', 'Penutup atap (miring, termasuk jorokan)', 'm²', t.roofArea],
    ['canopyArea', 'Kanopi / carport', 'm²', t.canopyArea],
    ['terraceArea', 'Teras', 'm²', t.terraceArea],
    ['stairSteps', 'Anak tangga (beton + keramik)', 'unit', t.stairSteps],
    ['yardHard', 'Halaman keras (paving/kerikil/dek)', 'm²', t.yardHard],
    ['yardGreen', 'Halaman hijau (rumput/tanah)', 'm²', t.yardGreen],
  ];
  return rows.map(([key, label, unit, qty]) => ({ key, label, unit, qty: Math.round(qty * 100) / 100 }));
}

function perimeter(points) {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0);
}

export const DEFAULT_PRICES = {
  floorArea: 450000,
  wallArea: 180000,
  wallVolume: 0,
  doorSingle: 1800000,
  doorDouble: 4200000,
  windowArea: 1400000,
  ventCount: 150000,
  roofArea: 380000,
  canopyArea: 520000,
  terraceArea: 350000,
  stairSteps: 350000,
  yardHard: 220000,
  yardGreen: 60000,
};

export function estimate(plan, prices = {}) {
  const merged = { ...DEFAULT_PRICES, ...prices };
  const rows = quantities(plan).map((r) => {
    const price = Number.isFinite(merged[r.key]) ? merged[r.key] : 0;
    return { ...r, price, subtotal: Math.round(r.qty * price) };
  });
  return { rows, total: rows.reduce((sum, r) => sum + r.subtotal, 0) };
}
