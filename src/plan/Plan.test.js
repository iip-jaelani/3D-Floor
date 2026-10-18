import { describe, expect, it } from 'vitest';
import { Plan } from './Plan.js';
import { wallLength } from './geometry.js';

const emptyPlan = () => new Plan({ floors: [{ id: 'floor-1', name: 'Lantai 1', level: 0 }] });

describe('Plan.addRoom', () => {
  it('membuat ruangan dan empat tembok', () => {
    const plan = emptyPlan();
    const room = plan.addRoom('floor-1', [0, 0], [4, 3]);
    expect(room.polygon).toHaveLength(4);
    expect(plan.floor('floor-1').walls).toHaveLength(4);
  });

  it('menolak ruangan terlalu kecil', () => {
    expect(emptyPlan().addRoom('floor-1', [0, 0], [0.2, 3])).toBeNull();
  });

  it('ruangan bersebelahan memakai tembok bersama tanpa duplikat', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.addRoom('floor-1', [4, 0], [7, 3]);
    expect(plan.floor('floor-1').walls).toHaveLength(7);
  });

  it('tembok bersama yang hanya sebagian tidak diduplikasi', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 4]);
    plan.addRoom('floor-1', [4, 0], [7, 2]);
    expect(plan.floor('floor-1').walls).toHaveLength(7);
  });
});

describe('Plan openings', () => {
  const setup = () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [5, 4]);
    const wall = plan.floor('floor-1').walls[0];
    return { plan, wall };
  };

  it('menempatkan dan meng-clamp pintu di dalam tembok', () => {
    const { plan, wall } = setup();
    const door = plan.addOpening('floor-1', { wallId: wall.id, type: 'door', offset: 0 });
    expect(door.offset).toBeCloseTo(0.5);
  });

  it('menolak bukaan yang bertabrakan', () => {
    const { plan, wall } = setup();
    plan.addOpening('floor-1', { wallId: wall.id, type: 'door', offset: 2.5 });
    expect(plan.addOpening('floor-1', { wallId: wall.id, type: 'window', offset: 2.8 })).toBeNull();
  });

  it('menghapus tembok ikut menghapus bukaannya', () => {
    const { plan, wall } = setup();
    plan.addOpening('floor-1', { wallId: wall.id, type: 'door', offset: 2.5 });
    plan.removeWall('floor-1', wall.id);
    expect(plan.floor('floor-1').openings).toHaveLength(0);
  });
});

describe('Plan.moveVertex', () => {
  it('menggeser ujung tembok dan sudut ruangan yang berimpit', () => {
    const plan = emptyPlan();
    const room = plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.moveVertex('floor-1', [4, 3], [5, 4]);
    expect(room.polygon[2]).toEqual([5, 4]);
    const walls = plan.floor('floor-1').walls;
    expect(walls.filter((w) => w.a[0] === 5 || w.b[0] === 5)).toHaveLength(2);
  });
});

describe('Plan history & floors', () => {
  it('undo dan redo mengembalikan data', () => {
    const plan = emptyPlan();
    plan.checkpoint();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    expect(plan.floor('floor-1').rooms).toHaveLength(1);
    plan.undo();
    expect(plan.floor('floor-1').rooms).toHaveLength(0);
    plan.redo();
    expect(plan.floor('floor-1').rooms).toHaveLength(1);
  });

  it('elevasi lantai naik per level', () => {
    const plan = emptyPlan();
    const upper = plan.addFloor();
    expect(plan.elevationOf('floor-1')).toBe(0);
    expect(plan.elevationOf(upper)).toBeCloseTo(plan.wallHeight + 0.16);
  });

  it('tidak menghapus lantai terakhir', () => {
    const plan = emptyPlan();
    expect(plan.removeFloor('floor-1')).toBe(false);
  });

  it('roomAt menemukan ruangan di titik', () => {
    const plan = emptyPlan();
    const room = plan.addRoom('floor-1', [0, 0], [4, 3]);
    expect(plan.roomAt('floor-1', 1, 1)).toBe(room);
    expect(plan.roomAt('floor-1', 9, 9)).toBeNull();
  });
});

describe('Plan.setWallLength', () => {
  const setup = () => {
    const plan = emptyPlan();
    const room = plan.addRoom('floor-1', [0, 0], [4, 3]);
    const top = plan.floor('floor-1').walls[0];
    return { plan, room, top };
  };
  const length = (w) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);

  it('memendekkan dengan titik awal tetap, termasuk nilai pecahan 1,25 m', () => {
    const { plan, top } = setup();
    plan.setWallLength('floor-1', top.id, 1.25, 'a');
    expect(top.a).toEqual([0, 0]);
    expect(length(top)).toBeCloseTo(1.25);
  });

  it('titik akhir tetap menggeser titik awal', () => {
    const { plan, top } = setup();
    plan.setWallLength('floor-1', top.id, 1.25, 'b');
    expect(top.b).toEqual([4, 0]);
    expect(top.a[0]).toBeCloseTo(2.75);
  });

  it('dari tengah memendek ke dua arah', () => {
    const { plan, top } = setup();
    plan.setWallLength('floor-1', top.id, 2, 'center');
    expect(top.a[0]).toBeCloseTo(1);
    expect(top.b[0]).toBeCloseTo(3);
  });

  it('sudut ruangan yang berimpit ikut bergeser', () => {
    const { plan, room, top } = setup();
    plan.setWallLength('floor-1', top.id, 1.25, 'a');
    expect(room.polygon[1][0]).toBeCloseTo(1.25);
  });

  it('bukaan menyesuaikan lebarnya saat tembok memendek', () => {
    const { plan, top } = setup();
    const door = plan.addOpening('floor-1', { wallId: top.id, type: 'door', offset: 3.5 });
    const result = plan.setWallLength('floor-1', top.id, 0.6, 'a');
    expect(result.removedOpenings).toBe(0);
    expect(door.width).toBeCloseTo(0.5);
  });

  it('melaporkan bukaan yang benar-benar tidak muat lagi', () => {
    const { plan, top } = setup();
    plan.addOpening('floor-1', { wallId: top.id, type: 'door', offset: 3.5 });
    const result = plan.setWallLength('floor-1', top.id, 0.3, 'a');
    expect(result.removedOpenings).toBe(1);
  });
});

describe('Plan.tidy & fillMissingFloors', () => {
  it('tidy membuang noise floating-point tanpa mengubah bentuk', () => {
    const plan = new Plan({
      floors: [
        {
          id: 'floor-1',
          walls: [{ id: 'wall-1', a: [0, 1.4000000000000001], b: [3.900000000000001, 1.4000000000000001] }],
          rooms: [],
          openings: [],
        },
      ],
    });
    const changed = plan.tidy();
    expect(changed).toBe(3);
    expect(plan.floor('floor-1').walls[0].a).toEqual([0, 1.4]);
    expect(plan.floor('floor-1').walls[0].b).toEqual([3.9, 1.4]);
  });

  it('fillMissingFloors membuat ruangan pada area tertutup tanpa lantai', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.addRoom('floor-1', [4, 0], [7, 3]);
    plan.removeRoom('floor-1', plan.floor('floor-1').rooms[1].id);

    const created = plan.fillMissingFloors('floor-1');
    expect(created).toHaveLength(1);
    expect(plan.floor('floor-1').rooms).toHaveLength(2);
    expect(plan.fillMissingFloors('floor-1')).toHaveLength(0);
  });
});

describe('Plan.dropCheckpoint', () => {
  it('membuang checkpoint terakhir sehingga undo tidak "kosong"', () => {
    const plan = emptyPlan();
    plan.checkpoint();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.checkpoint();
    plan.dropCheckpoint();
    plan.undo();
    expect(plan.floor('floor-1').rooms).toHaveLength(0);
  });
});

describe('Plan room elevation', () => {
  it('menyimpan tinggi lantai ruangan dan membacanya per titik', () => {
    const plan = emptyPlan();
    const a = plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.addRoom('floor-1', [4, 0], [8, 3]);
    plan.updateRoom('floor-1', a.id, { elevation: 0.25 });

    expect(plan.elevationAt('floor-1', 1, 1)).toBe(0.25);
    expect(plan.elevationAt('floor-1', 6, 1)).toBe(0);
    expect(plan.elevationAt('floor-1', 20, 20)).toBe(0);
  });

  it('membatasi tinggi dan menghapus properti saat 0', () => {
    const plan = emptyPlan();
    const room = plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.updateRoom('floor-1', room.id, { elevation: 9 });
    expect(room.elevation).toBe(1.5);
    plan.updateRoom('floor-1', room.id, { elevation: 0 });
    expect('elevation' in room).toBe(false);
  });

  it('ikut tersimpan dalam undo/redo', () => {
    const plan = emptyPlan();
    const room = plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.checkpoint();
    plan.updateRoom('floor-1', room.id, { elevation: 0.5 });
    plan.undo();
    expect(plan.floor('floor-1').rooms[0].elevation).toBeUndefined();
    plan.redo();
    expect(plan.floor('floor-1').rooms[0].elevation).toBe(0.5);
  });
});

describe('tembok profesional', () => {
  const make = () => {
    const plan = new Plan({ floors: [{ id: 'floor-1', name: 'L1', level: 0 }] });
    return plan;
  };
  const near = (x, y, eps = 1e-3) => expect(Math.abs(x - y)).toBeLessThan(eps);

  it('melengkungkan tembok: panjang busur > tali busur, dibatasi setengah lingkaran', () => {
    const plan = make();
    const [wall] = plan.addWall('floor-1', [0, 0], [4, 0]);
    plan.setWallBulge('floor-1', wall.id, 1);
    const arc = plan.floor('floor-1').walls[0];
    expect(wallLength(arc)).toBeGreaterThan(4);
    plan.setWallBulge('floor-1', wall.id, 99);
    near(plan.floor('floor-1').walls[0].bulge, 2);
    plan.setWallBulge('floor-1', wall.id, 0);
    expect(plan.floor('floor-1').walls[0].bulge).toBeUndefined();
  });

  it('mengubah panjang tembok lengkung mengubah panjang busurnya, bukan tali busurnya', () => {
    const plan = make();
    const [wall] = plan.addWall('floor-1', [0, 0], [4, 0]);
    plan.setWallBulge('floor-1', wall.id, 1);
    plan.setWallLength('floor-1', wall.id, 6, 'a');
    near(wallLength(plan.floor('floor-1').walls[0]), 6, 0.01);
  });

  it('menggeser ujung mempertahankan proporsi lengkung', () => {
    const plan = make();
    const [wall] = plan.addWall('floor-1', [0, 0], [4, 0]);
    plan.setWallBulge('floor-1', wall.id, 1);
    plan.moveVertex('floor-1', [4, 0], [8, 0]);
    near(plan.floor('floor-1').walls[0].bulge, 2);
  });

  it('membagi tembok: bukaan dipindah, yang tepat di titik potong dihapus', () => {
    const plan = make();
    const [wall] = plan.addWall('floor-1', [0, 0], [6, 0]);
    plan.addOpening('floor-1', { wallId: wall.id, type: 'window', offset: 1 });
    plan.addOpening('floor-1', { wallId: wall.id, type: 'door', offset: 5 });
    plan.addOpening('floor-1', { wallId: wall.id, type: 'window', offset: 3 });
    const result = plan.splitWall('floor-1', wall.id, 3);
    expect(result.removedOpenings).toBe(1);
    expect(plan.floor('floor-1').walls).toHaveLength(2);
    const second = plan.floor('floor-1').walls[1];
    expect(second.a).toEqual([3, 0]);
    near(plan.floor('floor-1').openings.find((o) => o.wallId === second.id).offset, 2);
  });

  it('membuat tembok sejajar', () => {
    const plan = make();
    const [wall] = plan.addWall('floor-1', [0, 0], [4, 0]);
    const copy = plan.offsetWall('floor-1', wall.id, 0.5);
    expect(copy.a).toEqual([0, 0.5]);
    expect(copy.b).toEqual([4, 0.5]);
  });

  it('membulatkan sudut ruangan: tembok dipendekkan, busur dibuat, polygon ikut', () => {
    const plan = make();
    const room = plan.addRoom('floor-1', [0, 0], [4, 3]);
    const result = plan.roundCorner('floor-1', [0, 0], 0.5, 'round');
    expect(result.ok).toBe(true);
    const walls = plan.floor('floor-1').walls;
    expect(walls).toHaveLength(5);
    const arc = walls.find((w) => w.bulge);
    near(Math.hypot(arc.b[0] - arc.a[0], arc.b[1] - arc.a[1]), 0.5 * Math.SQRT2);
    expect(plan.floor('floor-1').rooms[0].polygon.length).toBeGreaterThan(5);
    expect(plan.floor('floor-1').rooms[0].polygon.some((p) => p[0] === 0 && p[1] === 0)).toBe(false);
    expect(room.id).toBeTruthy();
  });

  it('memahat sudut menghasilkan tembok lurus diagonal', () => {
    const plan = make();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    const result = plan.roundCorner('floor-1', [4, 3], 0.6, 'chamfer');
    expect(result.ok).toBe(true);
    expect(result.wall.bulge).toBeUndefined();
    near(wallLength(result.wall), 0.6 * Math.SQRT2);
  });

  it('menolak radius yang terlalu besar dan sudut yang bukan pertemuan dua tembok', () => {
    const plan = make();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    expect(plan.roundCorner('floor-1', [0, 0], 5, 'round').ok).toBe(false);
    expect(plan.roundCorner('floor-1', [2, 2], 0.5, 'round').ok).toBe(false);
  });

  it('cekungan: kedalaman dibatasi tebal tembok dan bisa pindah sisi', () => {
    const plan = make();
    const [wall] = plan.addWall('floor-1', [0, 0], [4, 0]);
    const niche = plan.addOpening('floor-1', { wallId: wall.id, type: 'niche', offset: 2 });
    expect(niche.depth).toBeCloseTo(0.08, 2);
    plan.updateOpening('floor-1', niche.id, { depth: 1, side: -1 });
    const updated = plan.floor('floor-1').openings[0];
    expect(updated.depth).toBeLessThanOrEqual(0.08 + 1e-9);
    expect(updated.side).toBe(-1);
  });

  it('tinggi & warna per tembok', () => {
    const plan = make();
    const [wall] = plan.addWall('floor-1', [0, 0], [4, 0]);
    plan.updateWall('floor-1', wall.id, { height: 1.2, color: '#AABBCC' });
    expect(plan.floor('floor-1').walls[0].height).toBe(1.2);
    expect(plan.floor('floor-1').walls[0].color).toBe('#aabbcc');
    plan.updateWall('floor-1', wall.id, { height: null, color: null });
    expect(plan.floor('floor-1').walls[0].height).toBeUndefined();
    expect(plan.floor('floor-1').walls[0].color).toBeUndefined();
  });
});

describe('ruangan mengikuti tembok lengkung', () => {
  it('polygon ruangan diperluas dengan titik busur, dan kembali lurus saat diluruskan', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    const bottom = plan.floor('floor-1').walls.find((w) => w.a[1] === 3 && w.b[1] === 3);
    plan.setWallBulge('floor-1', bottom.id, 1);
    const room = plan.floor('floor-1').rooms[0];
    expect(room.polygon.length).toBeGreaterThan(8);
    expect(room.corners).toHaveLength(4);

    plan.setWallBulge('floor-1', bottom.id, 0);
    expect(plan.floor('floor-1').rooms[0].polygon).toHaveLength(4);
    expect(plan.floor('floor-1').rooms[0].corners).toBeUndefined();
  });

  it('undo mengembalikan polygon & JSON tetap konsisten', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    const bottom = plan.floor('floor-1').walls.find((w) => w.a[1] === 3 && w.b[1] === 3);
    plan.checkpoint();
    plan.setWallBulge('floor-1', bottom.id, 1);
    const saved = JSON.parse(JSON.stringify(plan.toJSON()));
    const reloaded = new Plan(saved);
    expect(reloaded.floor('floor-1').rooms[0].polygon).toEqual(plan.floor('floor-1').rooms[0].polygon);
    plan.undo();
    expect(plan.floor('floor-1').rooms[0].polygon).toHaveLength(4);
  });
});

import { measureSnapAt } from '../editor/hit.js';

describe('titik tangkap alat ukur', () => {
  it('memprioritaskan sudut, lalu tengah tembok, lalu titik di tembok', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    const floor = plan.floor('floor-1');
    expect(measureSnapAt(floor, [0.05, 0.05], 0.2).kind).toBe('corner');
    expect(measureSnapAt(floor, [2.05, 0.05], 0.2)).toMatchObject({ kind: 'mid', point: [2, 0] });
    expect(measureSnapAt(floor, [1.2, 0.05], 0.2)).toMatchObject({ kind: 'edge' });
    expect(measureSnapAt(floor, [2, 1.5], 0.2)).toBeNull();
  });
});

import { measureAt } from '../editor/hit.js';

describe('hasil ukur yang bisa digeser', () => {
  const measures = [{ id: 1, a: [0, 0], b: [4, 0] }];
  it('mengenali ujung A/B dan badan', () => {
    expect(measureAt(measures, [0.02, 0.03], 0.1)).toEqual({ id: 1, part: 'a' });
    expect(measureAt(measures, [3.97, 0.02], 0.1)).toEqual({ id: 1, part: 'b' });
    expect(measureAt(measures, [2, 0.05], 0.1)).toEqual({ id: 1, part: 'body' });
    expect(measureAt(measures, [2, 1], 0.1)).toBeNull();
  });
});

describe('titik sudut ruangan', () => {
  it('menambah titik di sisi ruangan membagi tembok dan menambah sudut', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    const result = plan.addRoomVertex('floor-1', [2, 0]);
    expect(result.ok).toBe(true);
    const floor = plan.floor('floor-1');
    expect(floor.walls).toHaveLength(5);
    expect(floor.rooms[0].polygon).toHaveLength(5);
    expect(floor.rooms[0].polygon.some((p) => p[0] === 2 && p[1] === 0)).toBe(true);
  });

  it('titik baru bisa digeser: ruangan jadi berbelok (L/tonjolan)', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.addRoomVertex('floor-1', [2, 0]);
    plan.moveVertex('floor-1', [2, 0], [2, -1]);
    const floor = plan.floor('floor-1');
    expect(floor.rooms[0].polygon.some((p) => p[0] === 2 && p[1] === -1)).toBe(true);
    expect(floor.walls.filter((w) => w.a[1] === -1 || w.b[1] === -1)).toHaveLength(2);
  });

  it('bukaan tetap berada di bagian tembok yang benar setelah dibagi', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [6, 3]);
    const top = plan.floor('floor-1').walls.find((w) => w.a[1] === 0 && w.b[1] === 0);
    plan.addOpening('floor-1', { wallId: top.id, type: 'window', offset: 4.5 });
    plan.addRoomVertex('floor-1', [3, 0]);
    const opening = plan.floor('floor-1').openings[0];
    const wall = plan.floor('floor-1').walls.find((w) => w.id === opening.wallId);
    expect(wall.a).toEqual([3, 0]);
    expect(opening.offset).toBeCloseTo(1.5, 3);
  });

  it('menolak titik yang tidak berada di tembok/sisi', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    expect(plan.addRoomVertex('floor-1', [2, 1.5]).ok).toBe(false);
  });

  it('menghapus titik menggabungkan dua tembok dan mengembalikan bentuk', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.addRoomVertex('floor-1', [2, 0]);
    const result = plan.removeRoomVertex('floor-1', [2, 0]);
    expect(result.ok).toBe(true);
    expect(plan.floor('floor-1').walls).toHaveLength(4);
    expect(plan.floor('floor-1').rooms[0].polygon).toHaveLength(4);
  });

  it('menolak menghapus titik jika ruangan akan kurang dari 3 titik', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.addRoomVertex('floor-1', [2, 0]);
    plan.removeRoomVertex('floor-1', [2, 0]);
    plan.removeRoomVertex('floor-1', [4, 0]);
    expect(plan.removeRoomVertex('floor-1', [4, 3]).ok).toBe(false);
  });
});

describe('arah buka pintu', () => {
  it('menyimpan swing/hinge hanya untuk pintu', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [5, 4]);
    const wall = plan.floor('floor-1').walls[0];
    const door = plan.addOpening('floor-1', { wallId: wall.id, type: 'door', offset: 2.5, props: { swing: -1, hinge: -1 } });
    expect(door.swing).toBe(-1);
    expect(door.hinge).toBe(-1);
    plan.updateOpening('floor-1', door.id, { swing: 1 });
    expect(plan.floor('floor-1').openings[0].swing).toBe(1);
    plan.updateOpening('floor-1', door.id, { type: 'window' });
    expect(plan.floor('floor-1').openings[0].swing).toBeUndefined();
  });
});

describe('pintu dua daun', () => {
  it('menyimpan leaves hanya untuk pintu', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [5, 4]);
    const wall = plan.floor('floor-1').walls[0];
    const door = plan.addOpening('floor-1', { wallId: wall.id, type: 'door', offset: 2.5, props: { width: 1.6, leaves: 2 } });
    expect(door.leaves).toBe(2);
    expect(door.width).toBe(1.6);
    plan.updateOpening('floor-1', door.id, { type: 'window' });
    expect(plan.floor('floor-1').openings[0].leaves).toBeUndefined();
  });
});

describe('lubang angin di atas bukaan', () => {
  it('aktif bila muat dan tersalin lewat props', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [5, 4]);
    const wall = plan.floor('floor-1').walls[0];
    const win = plan.addOpening('floor-1', { wallId: wall.id, type: 'window', offset: 2.5, props: { vent: true, ventHeight: 0.3 } });
    expect(win.vent).toBe(true);
    expect(plan.updateOpening('floor-1', win.id, { ventHeight: 0.5 })).toBe(true);
    expect(plan.floor('floor-1').openings[0].ventHeight).toBe(0.5);
    plan.updateOpening('floor-1', win.id, { sill: 2.4 });
    expect(plan.floor('floor-1').openings[0].vent).toBeUndefined();
    plan.updateOpening('floor-1', win.id, { type: 'niche' });
    expect(plan.floor('floor-1').openings[0].ventHeight).toBeUndefined();
  });
});

describe('grup bukaan', () => {
  const setup = () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [10, 4]);
    const wall = plan.floor('floor-1').walls.find((w) => wallLength(w) === 10);
    const a = plan.addOpening('floor-1', { wallId: wall.id, type: 'window', offset: 1.5, props: { width: 1 } });
    const b = plan.addOpening('floor-1', { wallId: wall.id, type: 'window', offset: 3, props: { width: 1 } });
    return { plan, a, b };
  };

  it('menggeser grup bersama dan menolak keluar tembok', () => {
    const { plan, a, b } = setup();
    expect(plan.moveOpenings('floor-1', [a.id, b.id], 2)).toBe(true);
    expect(plan.floor('floor-1').openings.map((o) => o.offset)).toEqual([3.5, 5]);
    expect(plan.moveOpenings('floor-1', [a.id, b.id], 50)).toBe(false);
  });

  it('meratakan jarak kiri = antar = kanan', () => {
    const { plan, a, b } = setup();
    expect(plan.distributeOpenings('floor-1', [a.id, b.id], 'even')).toBe(true);
    const [x, y] = plan.floor('floor-1').openings;
    const left = x.offset - x.width / 2;
    const between = y.offset - y.width / 2 - (x.offset + x.width / 2);
    const right = 10 - (y.offset + y.width / 2);
    expect(left).toBeCloseTo(between);
    expect(right).toBeCloseTo(between);
  });

  it('menengahkan grup', () => {
    const { plan, a, b } = setup();
    plan.distributeOpenings('floor-1', [a.id, b.id], 'center');
    const [x, y] = plan.floor('floor-1').openings;
    expect(x.offset - x.width / 2).toBeCloseTo(10 - (y.offset + y.width / 2));
  });
});

describe('atap, kanopi, halaman', () => {
  it('menambah, mengubah, menyimpan, dan memuat ulang', () => {
    const plan = emptyPlan();
    const roof = plan.addRoof('floor-1', [4, 0], [0, 3]);
    expect(roof).toMatchObject({ minX: 0, maxX: 4, type: 'gable', pitch: 30 });
    expect(plan.addRoof('floor-1', [0, 0], [0.2, 0.2])).toBeNull();

    plan.updateRoof('floor-1', roof.id, { type: 'canopy' });
    expect(plan.floor('floor-1').roofs[0]).toMatchObject({ type: 'canopy', height: 2.5, overhang: 0 });
    plan.updateRoof('floor-1', roof.id, { type: 'hip', maxX: 0.1 });
    expect(plan.floor('floor-1').roofs[0].height).toBeUndefined();
    expect(plan.floor('floor-1').roofs[0].maxX - plan.floor('floor-1').roofs[0].minX).toBeGreaterThanOrEqual(0.5);

    const yard = plan.addYard('floor-1', [5, 0], [9, 4], { ground: 'paving' });
    plan.moveRect('floor-1', 'yard', yard.id, 1, 1);
    expect(plan.floor('floor-1').yards[0]).toMatchObject({ minX: 6, minZ: 1, ground: 'paving' });

    const copy = new Plan(JSON.parse(JSON.stringify(plan.toJSON())));
    expect(copy.floor('floor-1').roofs).toHaveLength(1);
    expect(copy.floor('floor-1').yards).toHaveLength(1);
    expect(plan.bounds().maxX).toBeGreaterThanOrEqual(10);
  });
});

describe('atap berpoligon & pin', () => {
  it('mengikuti ruangan, pin bisa ditambah/dipindah/dihapus, tinggi dasar ikut lantai ruangan', () => {
    const plan = emptyPlan();
    const room = plan.addRoom('floor-1', [0, 0], [6, 4]);
    plan.updateRoom('floor-1', room.id, { elevation: 0.3 });
    const roof = plan.roofForRoom('floor-1', room.id);
    expect(roof.points).toHaveLength(4);
    expect(roof.base).toBeCloseTo(0.3);

    const idx = plan.addRectPoint('floor-1', 'roof', roof.id, 0);
    expect(idx).toBe(1);
    expect(plan.floor('floor-1').roofs[0].points).toHaveLength(5);
    plan.moveRectPoint('floor-1', 'roof', roof.id, 1, [3, -1]);
    expect(plan.floor('floor-1').roofs[0].minZ).toBe(-1);
    expect(plan.removeRectPoint('floor-1', 'roof', roof.id, 1)).toBe(true);
    expect(plan.removeRectPoint('floor-1', 'roof', roof.id, 0)).toBe(true);
    expect(plan.removeRectPoint('floor-1', 'roof', roof.id, 0)).toBe(false);
  });

  it('selubung seluruh denah dan halaman berketinggian', () => {
    const plan = emptyPlan();
    plan.addRoom('floor-1', [0, 0], [4, 3]);
    plan.addRoom('floor-1', [4, 0], [8, 6]);
    const hull = plan.roofForFloor('floor-1');
    expect(hull.points.length).toBeGreaterThanOrEqual(4);
    const yard = plan.addYard('floor-1', [9, 0], [12, 3], { elevation: -0.2 });
    expect(yard.elevation).toBe(-0.2);
    plan.updateYard('floor-1', yard.id, { elevation: 0.4 });
    expect(plan.floor('floor-1').yards[0].elevation).toBe(0.4);
  });
});

describe('teras', () => {
  it('teras punya bawaan ditinggikan, tanpa tanaman, bisa berpagar', () => {
    const plan = emptyPlan();
    const t = plan.addYard('floor-1', [0, 0], [4, 2.5], { ground: 'teras' });
    expect(t).toMatchObject({ name: 'Teras', plants: 'none', elevation: 0.15 });
    plan.updateYard('floor-1', t.id, { railing: true });
    expect(plan.floor('floor-1').yards[0].railing).toBe(true);
    const wall = plan.addRoom('floor-1', [0, 3], [4, 6]);
    const w = plan.floor('floor-1').walls[0];
    plan.updateWall('floor-1', w.id, { texture: 'brick' });
    expect(plan.floor('floor-1').walls[0].texture).toBe('brick');
    plan.updateWall('floor-1', w.id, { texture: null });
    expect(plan.floor('floor-1').walls[0].texture).toBeUndefined();
    expect(wall).toBeTruthy();
  });
});
