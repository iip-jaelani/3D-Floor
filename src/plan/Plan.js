import { Emitter } from '../core/Emitter.js';
import { findUnroomedAreas } from './autoFloor.js';
import { DECOR_LISTS, decorGroups, normalizeDecor } from './decor.js';
import {
  MAX_BULGE_RATIO,
  arcOf,
  arcToChordRatio,
  boundsOf,
  clampOpeningOffset,
  expandPolygon,
  distance,
  openingsOverlap,
  pointInPolygon,
  pointOnWall,
  projectOnSegment,
  projectOnWall,
  rectPolygon,
  sagittaForRadius,
  samePoint,
  segmentCovers,
  splitSegment,
  wallChord,
  wallLength,
  wallPolyline,
  convexHull,
  polygonArea,
} from './geometry.js';

export const SLAB_THICKNESS = 0.16;

export const OPENING_DEFAULTS = {
  door: { width: 0.9, height: 2.1, sill: 0 },
  window: { width: 1.2, height: 1.2, sill: 0.9 },
  niche: { width: 0.8, height: 1.2, sill: 0.9, depth: 0.15, side: 1 },
  vent: { width: 0.6, height: 0.25, sill: 2.3 },
};

export const ROOF_TYPES = {
  gable: { label: 'Pelana', pitch: 30 },
  hip: { label: 'Perisai', pitch: 25 },
  shed: { label: 'Miring satu sisi', pitch: 15 },
  flat: { label: 'Datar / dak beton', pitch: 0 },
  canopy: { label: 'Kanopi (tiang)', pitch: 6 },
};

export const ROOF_MATERIALS = {
  genteng: { label: 'Genteng tanah liat', color: '#a8502f' },
  hitam: { label: 'Genteng hitam', color: '#3f3f46' },
  seng: { label: 'Seng / spandek', color: '#9ca3af' },
  beton: { label: 'Dak beton', color: '#d6d3d1' },
  kaca: { label: 'Kaca (polikarbonat)', color: '#93c5fd' },
};

export const YARD_GROUNDS = {
  teras: { label: 'Teras (keramik)', color: '#cbbba0' },
  grass: { label: 'Rumput', color: '#4d8f3a' },
  paving: { label: 'Paving', color: '#a8a29e' },
  gravel: { label: 'Kerikil', color: '#cfc7b6' },
  soil: { label: 'Tanah / bedeng', color: '#7a5a3a' },
  wood: { label: 'Dek kayu', color: '#a87c4f' },
  water: { label: 'Kolam', color: '#38bdf8' },
};

export const YARD_PLANTS = { none: 'Tanpa tanaman', sparse: 'Beberapa pohon', dense: 'Rimbun' };

const MIN_RECT = 0.5;
export const STAIR_DIRS = ['+x', '-x', '+z', '-z'];
const RECT_LISTS = { roof: 'roofs', yard: 'yards', stairs: 'stairs' };
const clampRise = (v) => Math.min(Math.max(v, 0.3), 6);
const rectPoints = (r) => [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]];
const clonePoints = (points) => points.map((p) => [p[0], p[1]]);

export const VENT_GAP = 0.08;

const COPYABLE = ['width', 'height', 'sill', 'depth'];

export const WALL_PRESETS = {
  bata: { label: 'Bata 15 cm', thickness: 0.15, height: null },
  beton: { label: 'Beton 20 cm', thickness: 0.2, height: null },
  partisi: { label: 'Partisi 10 cm', thickness: 0.1, height: null },
  pagar: { label: 'Pagar 15 cm × 1,2 m', thickness: 0.15, height: 1.2 },
  setengah: { label: 'Tembok setengah (1 m)', thickness: 0.12, height: 1.0 },
};

const MIN_WALL_HEIGHT = 0.3;
const MAX_WALL_HEIGHT = 6;
const MIN_NICHE_BACK = 0.04;

const MIN_ROOM_SIZE = 0.5;
const MIN_WALL_LENGTH = 0.05;
const MIN_EDITED_LENGTH = 0.1;
const MAX_EDITED_LENGTH = 100;
const MAX_HISTORY = 100;
const MAX_ROOM_ELEVATION = 1.5;

function pickTransom(props) {
  const out = {};
  if (props?.vent === true) out.vent = true;
  if (Number.isFinite(props?.ventHeight)) out.ventHeight = props.ventHeight;
  return out;
}

function pickDoor(props) {
  const out = {};
  if (props?.swing === 1 || props?.swing === -1) out.swing = props.swing;
  if (props?.hinge === 1 || props?.hinge === -1) out.hinge = props.hinge;
  if (props?.leaves === 1 || props?.leaves === 2) out.leaves = props.leaves;
  return out;
}

function pickProps(props) {
  const out = {};
  COPYABLE.forEach((key) => {
    if (Number.isFinite(props?.[key])) out[key] = props[key];
  });
  return out;
}

const OPPOSITE = { minX: 'maxX', maxX: 'minX', minZ: 'maxZ', maxZ: 'minZ' };
const opposite = (key) => OPPOSITE[key];

export class Plan extends Emitter {
  #past = [];
  #future = [];
  #counter = 0;

  north = 0;

  constructor(data = {}) {
    super();
    this.#apply(data);
    this.activeFloorId = this.floors[0].id;
  }

  floor(id) {
    return this.floors.find((f) => f.id === id) ?? null;
  }

  get activeFloor() {
    return this.floor(this.activeFloorId);
  }

  setActiveFloor(id) {
    if (!this.floor(id) || id === this.activeFloorId) return;
    this.activeFloorId = id;
    this.emit('floor', id);
  }

  elevationOf(floorOrId) {
    const floor = typeof floorOrId === 'string' ? this.floor(floorOrId) : floorOrId;
    return (floor?.level ?? 0) * (this.wallHeight + SLAB_THICKNESS);
  }

  addFloor(name) {
    const level = Math.max(...this.floors.map((f) => f.level)) + 1;
    const floor = { id: this.#nextId('floor'), name: name ?? `Lantai ${level + 1}`, level, walls: [], rooms: [], openings: [], decor: {}, roofs: [], yards: [], stairs: [] };
    this.floors.push(floor);
    this.#changed();
    return floor;
  }

  removeFloor(id) {
    if (this.floors.length <= 1 || !this.floor(id)) return false;
    this.floors = this.floors.filter((f) => f.id !== id);
    if (this.activeFloorId === id) this.activeFloorId = this.floors[0].id;
    this.emit('floorRemoved', id);
    this.emit('floor', this.activeFloorId);
    this.#changed();
    return true;
  }

  duplicateFloor(id) {
    const source = this.floor(id);
    if (!source) return null;
    const level = Math.max(...this.floors.map((f) => f.level)) + 1;
    const wallIds = new Map();
    const copy = structuredClone(source);
    copy.id = this.#nextId('floor');
    copy.name = `${source.name} (salinan)`;
    copy.level = level;
    copy.walls.forEach((w) => {
      const next = this.#nextId('wall');
      wallIds.set(w.id, next);
      w.id = next;
    });
    copy.openings.forEach((o) => {
      o.id = this.#nextId('opening');
      o.wallId = wallIds.get(o.wallId) ?? o.wallId;
    });
    copy.rooms.forEach((r) => (r.id = this.#nextId('room')));
    (copy.roofs ?? []).forEach((r) => (r.id = this.#nextId('roof')));
    (copy.yards ?? []).forEach((y) => (y.id = this.#nextId('yard')));
    (copy.stairs ?? []).forEach((st) => (st.id = this.#nextId('stairs')));
    this.floors.push(copy);
    this.#changed();
    return copy;
  }

  copyItems(fromId, items, toId) {
    const from = this.floor(fromId);
    const to = this.floor(toId);
    if (!from || !to || from === to) return 0;
    const wallIds = new Map();
    let count = 0;

    items.filter((i) => i.kind === 'wall').forEach(({ id }) => {
      const wall = from.walls.find((w) => w.id === id);
      if (!wall) return;
      const copy = { ...structuredClone(wall), id: this.#nextId('wall') };
      wallIds.set(id, copy.id);
      to.walls.push(copy);
      count++;
    });
    items.forEach(({ kind, id }) => {
      if (kind === 'room') {
        const room = from.rooms.find((r) => r.id === id);
        if (room) to.rooms.push({ ...structuredClone(room), id: this.#nextId('room') });
        count += room ? 1 : 0;
      } else if (kind === 'roof' || kind === 'yard' || kind === 'stairs') {
        const key = RECT_LISTS[kind];
        const item = from[key].find((r) => r.id === id);
        if (item) to[key].push({ ...structuredClone(item), id: this.#nextId(kind) });
        count += item ? 1 : 0;
      }
    });
    const openingIds = new Set(items.filter((i) => i.kind === 'opening').map((i) => i.id));
    from.openings.forEach((o) => {
      const wallCopy = wallIds.get(o.wallId);
      if (!wallCopy) return;
      const wholeWall = items.some((i) => i.kind === 'wall' && i.id === o.wallId);
      if (!wholeWall && !openingIds.has(o.id)) return;
      to.openings.push({ ...structuredClone(o), id: this.#nextId('opening'), wallId: wallCopy });
      count++;
    });
    if (count) this.#changed();
    return count;
  }

  setLot(patch) {
    if (patch === null) {
      this.lot = null;
    } else {
      const lot = this.lot ?? {
        minX: -10, maxX: 10, minZ: -8, maxZ: 8,
        front: 'maxX', setbackFront: 3, setbackSide: 1, setbackRear: 1.5, kdbMax: 60,
      };
      ['minX', 'maxX', 'minZ', 'maxZ'].forEach((k) => Number.isFinite(patch[k]) && (lot[k] = patch[k]));
      ['setbackFront', 'setbackSide', 'setbackRear'].forEach((k) => {
        if (Number.isFinite(patch[k])) lot[k] = Math.max(patch[k], 0);
      });
      if (Number.isFinite(patch.kdbMax)) lot.kdbMax = Math.min(Math.max(patch.kdbMax, 1), 100);
      if (['minX', 'maxX', 'minZ', 'maxZ'].includes(patch.front)) lot.front = patch.front;
      if (lot.maxX - lot.minX < 1) lot.maxX = lot.minX + 1;
      if (lot.maxZ - lot.minZ < 1) lot.maxZ = lot.minZ + 1;
      this.lot = lot;
    }
    this.#changed();
  }

  setbackRect() {
    const lot = this.lot;
    if (!lot) return null;
    const side = (key) => (key === lot.front ? lot.setbackFront : key === opposite(lot.front) ? lot.setbackRear : lot.setbackSide);
    return {
      minX: lot.minX + side('minX'),
      maxX: lot.maxX - side('maxX'),
      minZ: lot.minZ + side('minZ'),
      maxZ: lot.maxZ - side('maxZ'),
    };
  }

  lotReport() {
    const lot = this.lot;
    if (!lot) return null;
    const inner = this.setbackRect();
    const ground = this.floors.find((f) => f.level === 0) ?? this.floors[0];
    const area = (lot.maxX - lot.minX) * (lot.maxZ - lot.minZ);
    const footprint = ground.rooms.reduce((sum, r) => sum + polygonArea(r.polygon), 0);
    const outside = ground.rooms
      .filter((r) => r.polygon.some(([x, z]) => x < inner.minX - 1e-6 || x > inner.maxX + 1e-6 || z < inner.minZ - 1e-6 || z > inner.maxZ + 1e-6))
      .map((r) => r.name);
    const kdb = area > 0 ? (footprint / area) * 100 : 0;
    const totalFloor = this.floors.reduce((sum, f) => sum + f.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0), 0);
    return {
      area,
      footprint,
      kdb,
      kdbMax: lot.kdbMax,
      kdbOk: kdb <= lot.kdbMax + 1e-9,
      klb: area > 0 ? totalFloor / area : 0,
      outside,
      inner,
    };
  }

  renameFloor(id, name) {
    const floor = this.floor(id);
    if (!floor || !name.trim()) return;
    floor.name = name.trim();
    this.#changed();
  }

  addWall(floorId, a, b) {
    const floor = this.floor(floorId);
    if (!floor) return [];
    const created = this.#insertWall(floor, a, b);
    if (created.length) this.#changed();
    return created;
  }

  updateWall(floorId, id, patch) {
    const wall = this.floor(floorId)?.walls.find((w) => w.id === id);
    if (!wall) return;
    if ('thickness' in patch) {
      wall.thickness = Math.min(Math.max(patch.thickness, 0.05), 0.5);
      this.floor(floorId).openings
        .filter((o) => o.wallId === id && o.type === 'niche')
        .forEach((o) => (o.depth = Math.min(o.depth, Math.max(wall.thickness - MIN_NICHE_BACK, 0.02))));
    }
    if ('height' in patch) {
      if (patch.height === null) delete wall.height;
      else if (Number.isFinite(patch.height)) wall.height = Math.min(Math.max(patch.height, MIN_WALL_HEIGHT), MAX_WALL_HEIGHT);
    }
    if ('texture' in patch) {
      if (typeof patch.texture === 'string' && /^[a-z0-9_-]{1,24}$/i.test(patch.texture)) wall.texture = patch.texture;
      else delete wall.texture;
    }
    if ('color' in patch) {
      if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) wall.color = patch.color.toLowerCase();
      else delete wall.color;
    }
    this.#changed();
  }

  setWallAngle(floorId, id, degrees) {
    const floor = this.floor(floorId);
    const wall = floor?.walls.find((w) => w.id === id);
    if (!wall) return false;
    const chord = wallChord(wall);
    if (chord === 0) return false;

    const rad = (degrees * Math.PI) / 180;
    const target = [
      Math.round((wall.a[0] + Math.cos(rad) * chord) * 1000) / 1000,
      Math.round((wall.a[1] - Math.sin(rad) * chord) * 1000) / 1000,
    ];
    this.moveVertex(floorId, [...wall.b], target);
    return true;
  }

  applyWallPreset(floorId, id, presetId) {
    const preset = WALL_PRESETS[presetId];
    if (!preset) return;
    this.updateWall(floorId, id, { thickness: preset.thickness, height: preset.height });
  }

  setWallBulge(floorId, id, sagitta) {
    const floor = this.floor(floorId);
    const wall = floor?.walls.find((w) => w.id === id);
    if (!wall || !Number.isFinite(sagitta)) return false;

    const limit = wallChord(wall) * MAX_BULGE_RATIO;
    const next = Math.min(Math.max(sagitta, -limit), limit);
    if (Math.abs(next) < 0.005) delete wall.bulge;
    else wall.bulge = Math.round(next * 10000) / 10000;
    this.#fitOpenings(floor, id);
    this.#changed();
    return true;
  }

  addArcWall(floorId, a, b, sagitta) {
    const floor = this.floor(floorId);
    if (!floor || distance(a, b) < MIN_WALL_LENGTH) return null;
    const exists = floor.walls.some((w) => samePoint(w.a, a) && samePoint(w.b, b) && !w.bulge);
    if (exists) return null;

    const wall = { id: this.#nextId('wall'), a: [a[0], a[1]], b: [b[0], b[1]] };
    floor.walls.push(wall);
    this.setWallBulge(floorId, wall.id, sagitta);
    return wall;
  }

  splitWall(floorId, id, t) {
    const floor = this.floor(floorId);
    const wall = floor?.walls.find((w) => w.id === id);
    if (!wall) return null;

    const length = wallLength(wall);
    if (t < 0.1 || t > length - 0.1) return null;

    const point = pointOnWall(wall, t).map((v) => Math.round(v * 1000) / 1000);
    const arc = arcOf(wall);
    const sign = Math.sign(wall.bulge ?? 0);
    const sub = (angle) => (arc ? sign * arc.radius * (1 - Math.cos(angle / 2)) : 0);

    const second = { ...structuredClone(wall), id: this.#nextId('wall'), a: point, b: [...wall.b] };
    const firstAngle = arc ? t / arc.radius : 0;
    const secondAngle = arc ? (length - t) / arc.radius : 0;
    wall.b = point;
    if (arc) {
      wall.bulge = Math.round(sub(firstAngle) * 10000) / 10000;
      second.bulge = Math.round(sub(secondAngle) * 10000) / 10000;
    }
    floor.walls.push(second);

    let removed = 0;
    floor.openings = floor.openings.filter((o) => {
      if (o.wallId !== id) return true;
      const lo = o.offset - o.width / 2;
      const hi = o.offset + o.width / 2;
      if (hi <= t) return true;
      if (lo >= t) {
        o.wallId = second.id;
        o.offset -= t;
        return true;
      }
      removed++;
      return false;
    });

    this.#changed();
    return { walls: [wall, second], removedOpenings: removed };
  }

  offsetWall(floorId, id, distanceM) {
    const floor = this.floor(floorId);
    const wall = floor?.walls.find((w) => w.id === id);
    if (!wall || Math.abs(distanceM) < 0.01) return null;

    const arc = arcOf(wall);
    const normalAt = (t) => {
      const point = pointOnWall(wall, t);
      if (!arc) {
        const c = wallChord(wall) || 1;
        return [point, [-(wall.b[1] - wall.a[1]) / c, (wall.b[0] - wall.a[0]) / c]];
      }
      const dx = point[0] - arc.center[0];
      const dz = point[1] - arc.center[1];
      const r = Math.hypot(dx, dz) || 1;
      const away = Math.sign(arc.sagitta);
      return [point, [(dx / r) * away, (dz / r) * away]];
    };

    const [p0, n0] = normalAt(0);
    const [p1, n1] = normalAt(wallLength(wall));
    const a = [p0[0] + n0[0] * distanceM, p0[1] + n0[1] * distanceM].map((v) => Math.round(v * 1000) / 1000);
    const b = [p1[0] + n1[0] * distanceM, p1[1] + n1[1] * distanceM].map((v) => Math.round(v * 1000) / 1000);

    const copy = { ...structuredClone(wall), id: this.#nextId('wall'), a, b };
    delete copy.bulge;
    if (arc) {
      const radius = arc.radius + Math.sign(arc.sagitta) * distanceM;
      const chord = distance(a, b);
      const sag = radius > 0 ? sagittaForRadius(chord, radius) : null;
      if (sag === null) return null;
      copy.bulge = Math.round(Math.sign(arc.sagitta) * sag * 10000) / 10000;
    }
    if (distance(a, b) < MIN_WALL_LENGTH) return null;
    floor.walls.push(copy);
    this.#changed();
    return copy;
  }

  addRoomVertex(floorId, point, { walls = true } = {}) {
    const floor = this.floor(floorId);
    if (!floor) return { ok: false, reason: 'Lantai tidak ditemukan.' };

    const MARGIN = 0.1;
    let best = null;
    (walls ? floor.walls : []).forEach((wall) => {
      const hit = projectOnWall(point, wall);
      const length = wallLength(wall);
      if (hit.distance <= 0.03 && hit.t >= MARGIN && hit.t <= length - MARGIN && (!best || hit.distance < best.distance)) {
        best = { wall, hit, distance: hit.distance };
      }
    });

    const target = best
      ? best.hit.point.map((v) => Math.round(v * 1000) / 1000)
      : [Math.round(point[0] * 1000) / 1000, Math.round(point[1] * 1000) / 1000];

    let inserted = false;
    floor.rooms.forEach((room) => {
      const corners = room.corners ?? room.polygon;
      for (let i = 0; i < corners.length; i++) {
        const p = corners[i];
        const q = corners[(i + 1) % corners.length];
        if (samePoint(target, p, 0.02) || samePoint(target, q, 0.02)) return;
        const onChord = projectOnSegment(target, p, q).distance <= 0.03;
        const onArc =
          best?.wall.bulge &&
          ((samePoint(best.wall.a, p) && samePoint(best.wall.b, q)) || (samePoint(best.wall.a, q) && samePoint(best.wall.b, p)));
        if (onChord || onArc) {
          room.corners = [...corners.slice(0, i + 1), target, ...corners.slice(i + 1)];
          inserted = true;
          return;
        }
      }
    });

    if (!best && !inserted) return { ok: false, reason: 'Titik harus berada di tembok atau di sisi ruangan.' };
    if (!walls && !inserted) return { ok: false, reason: 'Titik harus berada di sisi ruangan.' };
    if (best && !this.splitWall(floorId, best.wall.id, best.hit.t) && !inserted) {
      return { ok: false, reason: 'Terlalu dekat dengan ujung tembok.' };
    }
    this.#changed();
    return { ok: true, point: target };
  }

  moveRoomCorner(floorId, roomId, index, to) {
    const room = this.floor(floorId)?.rooms.find((r) => r.id === roomId);
    if (!room) return false;
    const corners = room.corners ?? room.polygon;
    if (!corners[index]) return false;
    room.corners = corners.map((c, i) => (i === index ? [to[0], to[1]] : c));
    this.#changed();
    return true;
  }

  removeRoomVertex(floorId, point, { walls = true } = {}) {
    const floor = this.floor(floorId);
    if (!floor) return { ok: false, reason: 'Lantai tidak ditemukan.' };

    if (!walls) {
      const owners = floor.rooms.filter((r) => (r.corners ?? r.polygon).some((c) => samePoint(c, point)));
      if (!owners.length) return { ok: false, reason: 'Titik tidak ditemukan.' };
      if (owners.some((r) => (r.corners ?? r.polygon).length <= 3)) return { ok: false, reason: 'Ruangan minimal punya 3 titik.' };
      owners.forEach((r) => (r.corners = (r.corners ?? r.polygon).filter((c) => !samePoint(c, point))));
      this.#changed();
      return { ok: true };
    }

    const touching = floor.walls.filter((w) => samePoint(w.a, point) || samePoint(w.b, point));
    if (touching.length !== 2) {
      return { ok: false, reason: `Titik ini menyambung ${touching.length} tembok; hanya titik dengan dua tembok yang bisa dihapus.` };
    }
    if (touching.some((w) => w.bulge)) return { ok: false, reason: 'Luruskan tembok lengkung terlebih dulu.' };

    const rooms = floor.rooms.filter((r) => (r.corners ?? r.polygon).some((c) => samePoint(c, point)));
    if (rooms.some((r) => (r.corners ?? r.polygon).length <= 3)) {
      return { ok: false, reason: 'Ruangan minimal punya 3 titik.' };
    }

    const [w1, w2] = touching;
    const far = (w) => (samePoint(w.a, point) ? w.b : w.a);
    const len1 = wallLength(w1);
    const len2 = wallLength(w2);
    const merged = { ...structuredClone(w1), id: this.#nextId('wall'), a: [...far(w1)], b: [...far(w2)] };
    delete merged.bulge;

    floor.openings.forEach((o) => {
      if (o.wallId === w1.id) {
        o.offset = samePoint(w1.b, point) ? o.offset : len1 - o.offset;
        o.wallId = merged.id;
      } else if (o.wallId === w2.id) {
        o.offset = len1 + (samePoint(w2.a, point) ? o.offset : len2 - o.offset);
        o.wallId = merged.id;
      }
    });
    floor.walls = floor.walls.filter((w) => w !== w1 && w !== w2);
    floor.walls.push(merged);

    rooms.forEach((room) => {
      room.corners = (room.corners ?? room.polygon).filter((c) => !samePoint(c, point));
    });

    this.#fitOpenings(floor, merged.id);
    this.#changed();
    return { ok: true };
  }

  roundCorner(floorId, corner, size, mode = 'round') {
    const floor = this.floor(floorId);
    if (!floor) return { ok: false, reason: 'Lantai tidak ditemukan.' };

    const touching = floor.walls.filter((w) => samePoint(w.a, corner) || samePoint(w.b, corner));
    if (touching.length !== 2) return { ok: false, reason: 'Sudut harus pertemuan tepat dua tembok.' };
    if (touching.some((w) => w.bulge)) return { ok: false, reason: 'Tembok lengkung tidak bisa dibulatkan lagi.' };

    const [w1, w2] = touching;
    const far = (w) => (samePoint(w.a, corner) ? w.b : w.a);
    const dir = (w) => {
      const f = far(w);
      const l = distance(f, corner);
      return { u: [(f[0] - corner[0]) / l, (f[1] - corner[1]) / l], length: l };
    };
    const d1 = dir(w1);
    const d2 = dir(w2);

    const cos = d1.u[0] * d2.u[0] + d1.u[1] * d2.u[1];
    const theta = Math.acos(Math.min(Math.max(cos, -1), 1));
    if (theta < 0.05 || theta > Math.PI - 0.05) return { ok: false, reason: 'Kedua tembok hampir lurus/berimpit.' };

    const cut = mode === 'chamfer' ? size : size / Math.tan(theta / 2);
    const margin = 0.1;
    if (cut > d1.length - margin || cut > d2.length - margin) {
      return { ok: false, reason: `Terlalu besar: tembok hanya ${Math.min(d1.length, d2.length).toFixed(2)} m dari sudut.` };
    }
    if (cut < 0.02) return { ok: false, reason: 'Ukuran terlalu kecil.' };

    const round3 = (p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000];
    const t1 = round3([corner[0] + d1.u[0] * cut, corner[1] + d1.u[1] * cut]);
    const t2 = round3([corner[0] + d2.u[0] * cut, corner[1] + d2.u[1] * cut]);

    const trim = (wall, target) => {
      if (samePoint(wall.a, corner)) {
        wall.a = target;
        floor.openings
          .filter((o) => o.wallId === wall.id)
          .forEach((o) => (o.offset -= cut));
      } else {
        wall.b = target;
      }
      const length = wallLength(wall);
      floor.openings = floor.openings.filter(
        (o) => o.wallId !== wall.id || (o.offset - o.width / 2 >= 0.02 && o.offset + o.width / 2 <= length - 0.02),
      );
    };
    trim(w1, t1);
    trim(w2, t2);

    const wall = { id: this.#nextId('wall'), a: t1, b: t2 };
    const props = ['thickness', 'height', 'color'];
    props.forEach((k) => w1[k] !== undefined && (wall[k] = w1[k]));
    if (mode === 'round') {
      const chord = distance(t1, t2);
      const sag = size * (1 - Math.sin(theta / 2));
      const mid = [(t1[0] + t2[0]) / 2, (t1[1] + t2[1]) / 2];
      const normal = [-(t2[1] - t1[1]) / chord, (t2[0] - t1[0]) / chord];
      const towardCorner = (corner[0] - mid[0]) * normal[0] + (corner[1] - mid[1]) * normal[1];
      const bulge = Math.sign(towardCorner || 1) * sag;
      if (Math.abs(bulge) >= 0.005) wall.bulge = Math.round(bulge * 10000) / 10000;
    }
    floor.walls.push(wall);

    floor.rooms.forEach((room) => {
      const corners = room.corners ?? room.polygon;
      const index = corners.findIndex((p) => samePoint(p, corner));
      if (index === -1) return;
      const prev = corners[(index - 1 + corners.length) % corners.length];
      const toward = (t) => (t[0] - corner[0]) * (prev[0] - corner[0]) + (t[1] - corner[1]) * (prev[1] - corner[1]);
      const chain = toward(t1) >= toward(t2) ? [t1, t2] : [t2, t1];
      room.corners = [...corners.slice(0, index), ...chain, ...corners.slice(index + 1)];
    });

    this.#changed();
    return { ok: true, wall };
  }

  removeWall(floorId, id) {
    const floor = this.floor(floorId);
    if (!floor) return;
    floor.walls = floor.walls.filter((w) => w.id !== id);
    floor.openings = floor.openings.filter((o) => o.wallId !== id);
    this.#changed();
  }

  setWallLength(floorId, wallId, length, anchor = 'a') {
    const floor = this.floor(floorId);
    const wall = floor?.walls.find((w) => w.id === wallId);
    if (!wall) return null;

    const arcLength = wallLength(wall);
    const target = Math.min(Math.max(length, MIN_EDITED_LENGTH), MAX_EDITED_LENGTH);
    if (arcLength === 0 || Math.abs(target - arcLength) < 1e-6) return { removedOpenings: 0 };

    const chordNow = wallChord(wall);
    const k = (wall.bulge ?? 0) / chordNow;
    const chordTarget = target / arcToChordRatio(k);
    const current = chordNow;
    const u = [(wall.b[0] - wall.a[0]) / current, (wall.b[1] - wall.a[1]) / current];
    const a = [...wall.a];
    const b = [...wall.b];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const at = (origin, t) => [origin[0] + u[0] * t, origin[1] + u[1] * t];

    const before = floor.openings.length;
    if (anchor === 'b') {
      this.moveVertex(floorId, a, at(b, -chordTarget));
    } else if (anchor === 'center') {
      this.moveVertex(floorId, a, at(mid, -chordTarget / 2));
      this.moveVertex(floorId, b, at(mid, chordTarget / 2));
    } else {
      this.moveVertex(floorId, b, at(a, chordTarget));
    }
    return { removedOpenings: before - floor.openings.length };
  }

  moveVertex(floorId, from, to) {
    const floor = this.floor(floorId);
    if (!floor) return;
    const source = [from[0], from[1]];
    const touched = new Set();
    const ratios = new Map();
    floor.walls.forEach((wall) => {
      const chord = wallChord(wall);
      if (wall.bulge && chord > 0 && (samePoint(wall.a, source) || samePoint(wall.b, source))) {
        ratios.set(wall.id, wall.bulge / chord);
      }
    });

    floor.walls.forEach((wall) => {
      if (samePoint(wall.a, source)) {
        wall.a = [to[0], to[1]];
        touched.add(wall.id);
      }
      if (samePoint(wall.b, source)) {
        wall.b = [to[0], to[1]];
        touched.add(wall.id);
      }
    });
    floor.rooms.forEach((room) => {
      room.corners = (room.corners ?? room.polygon).map((p) => (samePoint(p, source) ? [to[0], to[1]] : p));
    });
    ratios.forEach((ratio, id) => {
      const wall = floor.walls.find((w) => w.id === id);
      if (!wall) return;
      const bulge = ratio * wallChord(wall);
      if (Math.abs(bulge) < 0.005) delete wall.bulge;
      else wall.bulge = Math.round(bulge * 10000) / 10000;
    });

    floor.walls
      .filter((w) => touched.has(w.id) && wallLength(w) < MIN_WALL_LENGTH)
      .forEach((w) => this.removeWall(floorId, w.id));

    touched.forEach((wallId) => this.#fitOpenings(floor, wallId));
    this.#changed();
  }

  addRoom(floorId, p1, p2) {
    const floor = this.floor(floorId);
    if (!floor) return null;

    const polygon = rectPolygon(p1, p2);
    const width = polygon[1][0] - polygon[0][0];
    const depth = polygon[2][1] - polygon[1][1];
    if (width < MIN_ROOM_SIZE || depth < MIN_ROOM_SIZE) return null;

    polygon.forEach((point, i) => this.#insertWall(floor, point, polygon[(i + 1) % polygon.length]));

    const room = {
      id: this.#nextId('room'),
      name: `Ruang ${floor.rooms.length + 1}`,
      polygon,
      floor: floor.rooms.at(-1)?.floor ?? 'oak',
    };
    floor.rooms.push(room);
    this.#changed();
    return room;
  }

  updateRoom(floorId, id, patch) {
    const room = this.floor(floorId)?.rooms.find((r) => r.id === id);
    if (!room) return;
    if (typeof patch.name === 'string' && patch.name.trim()) room.name = patch.name.trim();
    if (typeof patch.floor === 'string') room.floor = patch.floor;
    if ('color' in patch) {
      if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) room.color = patch.color.toLowerCase();
      else delete room.color;
    }
    if (Number.isFinite(patch.elevation)) {
      const elevation = Math.min(Math.max(patch.elevation, 0), MAX_ROOM_ELEVATION);
      if (elevation > 0) room.elevation = Math.round(elevation * 1000) / 1000;
      else delete room.elevation;
    }
    this.#changed();
  }

  removeRoom(floorId, id) {
    const floor = this.floor(floorId);
    if (!floor) return;
    floor.rooms = floor.rooms.filter((r) => r.id !== id);
    this.#changed();
  }

  setFloorMaterial(floorId, material) {
    this.floor(floorId)?.rooms.forEach((room) => (room.floor = material));
    this.#changed();
  }

  elevationAt(floorId, x, z) {
    return this.roomAt(floorId, x, z)?.elevation ?? 0;
  }

  roomAt(floorId, x, z) {
    const rooms = this.floor(floorId)?.rooms ?? [];
    return [...rooms].reverse().find((room) => pointInPolygon([x, z], room.polygon)) ?? null;
  }

  addOpening(floorId, { wallId, type, offset, side, props }) {
    const floor = this.floor(floorId);
    const wall = floor?.walls.find((w) => w.id === wallId);
    if (!wall || !OPENING_DEFAULTS[type]) return null;

    const opening = { id: this.#nextId('opening'), wallId, type, offset, ...OPENING_DEFAULTS[type], ...pickProps(props) };
    if (type === 'niche' && (side === 1 || side === -1)) opening.side = side;
    if (type === 'door') Object.assign(opening, pickDoor(props));
    if (type === 'door' || type === 'window') Object.assign(opening, pickTransom(props));
    const placed = this.#placeOpening(floor, wall, opening);
    if (!placed) return null;

    floor.openings.push(placed);
    this.#changed();
    return placed;
  }

  placementFor(floorId, { wallId, type, offset, side, props }) {
    const floor = this.floor(floorId);
    const wall = floor?.walls.find((w) => w.id === wallId);
    if (!wall || !OPENING_DEFAULTS[type]) return null;
    const candidate = { id: '', wallId, type, offset, ...OPENING_DEFAULTS[type], ...pickProps(props) };
    if (type === 'niche' && (side === 1 || side === -1)) candidate.side = side;
    if (type === 'door') Object.assign(candidate, pickDoor(props));
    if (type === 'door' || type === 'window') Object.assign(candidate, pickTransom(props));
    return this.#placeOpening(floor, wall, candidate);
  }

  updateOpening(floorId, id, patch) {
    const floor = this.floor(floorId);
    const current = floor?.openings.find((o) => o.id === id);
    const wall = floor?.walls.find((w) => w.id === current?.wallId);
    if (!current || !wall) return false;

    const candidate = { ...current };
    if (patch.type in OPENING_DEFAULTS) candidate.type = patch.type;
    ['width', 'height', 'sill', 'offset', 'depth'].forEach((key) => {
      if (Number.isFinite(patch[key])) candidate[key] = patch[key];
    });
    if (patch.side === 1 || patch.side === -1) candidate.side = patch.side;
    if (patch.swing === 1 || patch.swing === -1) candidate.swing = patch.swing;
    if (patch.hinge === 1 || patch.hinge === -1) candidate.hinge = patch.hinge;
    if (patch.leaves === 1 || patch.leaves === 2) candidate.leaves = patch.leaves;
    if (typeof patch.vent === 'boolean') candidate.vent = patch.vent;
    if (Number.isFinite(patch.ventHeight)) candidate.ventHeight = patch.ventHeight;
    if (candidate.type === 'niche') {
      const maxDepth = Math.max((wall.thickness ?? this.wallThickness) - MIN_NICHE_BACK, 0.02);
      candidate.depth = Math.min(Math.max(candidate.depth ?? OPENING_DEFAULTS.niche.depth, 0.02), maxDepth);
      candidate.side ??= 1;
    } else {
      delete candidate.depth;
      delete candidate.side;
    }
    if (candidate.type !== 'door' && candidate.type !== 'window') {
      delete candidate.vent;
      delete candidate.ventHeight;
    }
    if (candidate.vent) {
      const room = this.wallHeight - (candidate.sill + candidate.height + VENT_GAP);
      candidate.ventHeight = Math.min(Math.max(candidate.ventHeight ?? 0.3, 0.1), 0.6, room);
      if (candidate.ventHeight < 0.1) {
        delete candidate.vent;
        delete candidate.ventHeight;
      }
    } else {
      delete candidate.ventHeight;
    }
    if (candidate.type !== 'door') {
      delete candidate.swing;
      delete candidate.hinge;
      delete candidate.leaves;
    }
    candidate.width = Math.max(candidate.width, 0.3);
    candidate.height = Math.max(candidate.height, 0.3);
    candidate.sill = Math.max(candidate.sill, 0);
    if (candidate.sill + candidate.height > this.wallHeight) candidate.height = this.wallHeight - candidate.sill;

    const placed = this.#placeOpening(floor, wall, candidate, id);
    if (!placed) return false;

    Object.keys(current).forEach((key) => {
      if (!(key in placed)) delete current[key];
    });
    Object.assign(current, placed);
    this.#changed();
    return true;
  }

  moveOpenings(floorId, ids, delta) {
    const group = this.#openingGroup(floorId, ids);
    if (!group || !Number.isFinite(delta)) return false;
    return this.#placeGroup(group, group.items.map((o) => o.offset + delta));
  }

  distributeOpenings(floorId, ids, mode = 'even') {
    const group = this.#openingGroup(floorId, ids);
    if (!group) return false;
    const { items, from, to } = group;
    const widths = items.reduce((sum, o) => sum + o.width, 0);
    let offsets;

    if (mode === 'center') {
      const start = items[0].offset - items[0].width / 2;
      const end = items.at(-1).offset + items.at(-1).width / 2;
      const shift = (from + to) / 2 - (start + end) / 2;
      offsets = items.map((o) => o.offset + shift);
    } else {
      const gap = (to - from - widths) / (items.length + 1);
      if (gap < 0.05) return false;
      let cursor = from + gap;
      offsets = items.map((o) => {
        const center = cursor + o.width / 2;
        cursor += o.width + gap;
        return center;
      });
    }
    return this.#placeGroup(group, offsets);
  }

  #openingGroup(floorId, ids) {
    const floor = this.floor(floorId);
    const items = floor?.openings.filter((o) => ids.includes(o.id)).sort((p, q) => p.offset - q.offset) ?? [];
    if (items.length === 0 || items.length !== ids.length) return null;
    const wall = floor.walls.find((w) => w.id === items[0].wallId);
    if (!wall || items.some((o) => o.wallId !== wall.id)) return null;

    const start = items[0].offset - items[0].width / 2;
    const end = items.at(-1).offset + items.at(-1).width / 2;
    let from = 0;
    let to = wallLength(wall);
    floor.openings.forEach((o) => {
      if (o.wallId !== wall.id || ids.includes(o.id)) return;
      const l = o.offset - o.width / 2;
      const r = o.offset + o.width / 2;
      if (o.offset < (start + end) / 2) from = Math.max(from, r);
      else to = Math.min(to, l);
    });
    return { floor, wall, items, from, to };
  }

  #placeGroup({ floor, wall, items }, offsets) {
    const length = wallLength(wall);
    const ids = items.map((o) => o.id);
    const ok = items.every((o, i) => {
      const clamped = clampOpeningOffset(offsets[i], o.width, length);
      if (clamped === null || Math.abs(clamped - offsets[i]) > 1e-6) return false;
      return !floor.openings.some(
        (other) => other.wallId === wall.id && !ids.includes(other.id) && openingsOverlap(offsets[i], o.width, other.offset, other.width),
      );
    });
    if (!ok) return false;
    items.forEach((o, i) => (o.offset = Math.round(offsets[i] * 10000) / 10000));
    this.#changed();
    return true;
  }

  removeOpening(floorId, id) {
    const floor = this.floor(floorId);
    if (!floor) return;
    floor.openings = floor.openings.filter((o) => o.id !== id);
    this.#changed();
  }

  #rectFrom(a, b) {
    const rect = {
      minX: Math.min(a[0], b[0]),
      maxX: Math.max(a[0], b[0]),
      minZ: Math.min(a[1], b[1]),
      maxZ: Math.max(a[1], b[1]),
    };
    return rect.maxX - rect.minX >= MIN_RECT && rect.maxZ - rect.minZ >= MIN_RECT ? rect : null;
  }

  addRoof(floorId, a, b, props = {}) {
    const floor = this.floor(floorId);
    const rect = this.#rectFrom(a, b);
    if (!floor || !rect) return null;

    const type = ROOF_TYPES[props.type] ? props.type : 'gable';
    const roof = {
      id: this.#nextId('roof'),
      ...rect,
      type,
      pitch: props.pitch ?? ROOF_TYPES[type].pitch,
      points: rectPoints(rect),
      base: 0,
      overhang: type === 'canopy' ? 0 : 0.5,
      ridge: 'auto',
      flip: 1,
      material: type === 'canopy' ? 'seng' : 'genteng',
      color: null,
      thickness: 0.12,
      ...(type === 'canopy' ? { height: 2.5, posts: true } : {}),
    };
    floor.roofs.push(roof);
    this.#changed();
    return roof;
  }

  updateRoof(floorId, id, patch) {
    const roof = this.floor(floorId)?.roofs.find((r) => r.id === id);
    if (!roof) return false;
    this.#patchRect(roof, patch);

    if (ROOF_TYPES[patch.type]) {
      roof.type = patch.type;
      if (patch.pitch === undefined) roof.pitch = ROOF_TYPES[patch.type].pitch;
      if (patch.type === 'canopy') {
        roof.height ??= 2.5;
        roof.posts ??= true;
        roof.overhang = 0;
      } else {
        delete roof.height;
        delete roof.posts;
      }
    }
    if (Number.isFinite(patch.pitch)) roof.pitch = Math.min(Math.max(patch.pitch, 0), 60);
    if (Number.isFinite(patch.overhang)) roof.overhang = Math.min(Math.max(patch.overhang, 0), 2);
    if (Number.isFinite(patch.thickness)) roof.thickness = Math.min(Math.max(patch.thickness, 0.04), 0.4);
    if (Number.isFinite(patch.height) && roof.type === 'canopy') roof.height = Math.min(Math.max(patch.height, 1.8), 6);
    if (Number.isFinite(patch.base)) roof.base = Math.min(Math.max(patch.base, -3), 6);
    if (['auto', 'x', 'z'].includes(patch.ridge)) roof.ridge = patch.ridge;
    if (patch.flip === 1 || patch.flip === -1) roof.flip = patch.flip;
    if (ROOF_MATERIALS[patch.material]) roof.material = patch.material;
    if (patch.color === null || typeof patch.color === 'string') roof.color = patch.color;
    if (typeof patch.posts === 'boolean' && roof.type === 'canopy') roof.posts = patch.posts;
    this.#changed();
    return true;
  }

  fitRoofToFloor(floorId, id) {
    const floor = this.floor(floorId);
    const roof = floor?.roofs.find((r) => r.id === id);
    const pts = [...(floor?.rooms.flatMap((r) => r.polygon) ?? [])];
    if (!pts.length) pts.push(...(floor?.walls.flatMap((w) => [w.a, w.b]) ?? []));
    const hull = convexHull(pts);
    if (!roof || hull.length < 3) return false;
    roof.points = hull;
    this.#changed();
    return true;
  }

  fitRoofToRoom(floorId, id, roomId) {
    const floor = this.floor(floorId);
    const roof = floor?.roofs.find((r) => r.id === id);
    const room = floor?.rooms.find((r) => r.id === roomId);
    if (!roof || !room) return false;
    roof.points = clonePoints(room.corners ?? room.polygon);
    roof.base = room.elevation ?? 0;
    this.#changed();
    return true;
  }

  removeRoof(floorId, id) {
    const floor = this.floor(floorId);
    if (!floor) return;
    floor.roofs = floor.roofs.filter((r) => r.id !== id);
    this.#changed();
  }

  addYard(floorId, a, b, props = {}) {
    const floor = this.floor(floorId);
    const rect = this.#rectFrom(a, b);
    if (!floor || !rect) return null;
    const yard = {
      id: this.#nextId('yard'),
      name: props.name ?? 'Halaman',
      ...rect,
      ground: YARD_GROUNDS[props.ground] ? props.ground : 'grass',
      color: null,
      plants: YARD_PLANTS[props.plants] ? props.plants : 'sparse',
      points: rectPoints(rect),
      elevation: Number.isFinite(props.elevation) ? props.elevation : 0,
    };
    if (yard.ground === 'teras') {
      yard.plants = props.plants ?? 'none';
      yard.name = props.name ?? 'Teras';
      if (!Number.isFinite(props.elevation)) yard.elevation = 0.15;
    }
    floor.yards.push(yard);
    this.#changed();
    return yard;
  }

  updateYard(floorId, id, patch) {
    const yard = this.floor(floorId)?.yards.find((y) => y.id === id);
    if (!yard) return false;
    this.#patchRect(yard, patch);
    if (typeof patch.name === 'string') yard.name = patch.name.trim() || yard.name;
    if (YARD_GROUNDS[patch.ground]) yard.ground = patch.ground;
    if (YARD_PLANTS[patch.plants]) yard.plants = patch.plants;
    if (typeof patch.railing === 'boolean') yard.railing = patch.railing;
    if (Number.isFinite(patch.elevation)) yard.elevation = Math.min(Math.max(patch.elevation, -3), 6);
    if (patch.color === null || typeof patch.color === 'string') yard.color = patch.color;
    this.#changed();
    return true;
  }

  removeYard(floorId, id) {
    const floor = this.floor(floorId);
    if (!floor) return;
    floor.yards = floor.yards.filter((y) => y.id !== id);
    this.#changed();
  }

  addStairs(floorId, a, b, props = {}) {
    const floor = this.floor(floorId);
    const rect = this.#rectFrom(a, b);
    if (!floor || !rect) return null;
    const stairs = {
      id: this.#nextId('stairs'),
      name: props.name ?? 'Tangga',
      ...rect,
      points: rectPoints(rect),
      dir: STAIR_DIRS.includes(props.dir) ? props.dir : rect.maxX - rect.minX >= rect.maxZ - rect.minZ ? '+x' : '+z',
      rise: Number.isFinite(props.rise) ? clampRise(props.rise) : this.wallHeight + SLAB_THICKNESS,
      railing: props.railing ?? true,
      color: null,
    };
    floor.stairs.push(stairs);
    this.#changed();
    return stairs;
  }

  updateStairs(floorId, id, patch) {
    const stairs = this.floor(floorId)?.stairs.find((st) => st.id === id);
    if (!stairs) return false;
    if (STAIR_DIRS.includes(patch.dir)) stairs.dir = patch.dir;
    const alongX = stairs.dir.endsWith('x');
    const [runMin, runMax, widMin, widMax] = alongX ? ['minX', 'maxX', 'minZ', 'maxZ'] : ['minZ', 'maxZ', 'minX', 'maxX'];
    const rect = {};
    if (Number.isFinite(patch.run)) {
      const run = Math.max(patch.run, MIN_RECT);
      if (stairs.dir[0] === '-') rect[runMin] = stairs[runMax] - run;
      else rect[runMax] = stairs[runMin] + run;
    }
    if (Number.isFinite(patch.width)) rect[widMax] = stairs[widMin] + Math.max(patch.width, MIN_RECT);
    this.#patchRect(stairs, { ...patch, ...rect });
    if (Number.isFinite(patch.x) || Number.isFinite(patch.z)) {
      const dx = Number.isFinite(patch.x) ? patch.x - stairs.minX : 0;
      const dz = Number.isFinite(patch.z) ? patch.z - stairs.minZ : 0;
      stairs.points = stairs.points.map(([x, z]) => [x + dx, z + dz]);
    }
    if (typeof patch.name === 'string') stairs.name = patch.name.trim() || stairs.name;
    if (patch.steps === null) delete stairs.steps;
    else if (Number.isFinite(patch.steps)) stairs.steps = Math.min(Math.max(Math.round(patch.steps), 2), 60);
    if (Number.isFinite(patch.rise)) stairs.rise = clampRise(patch.rise);
    if (typeof patch.railing === 'boolean') stairs.railing = patch.railing;
    if (patch.color === null || typeof patch.color === 'string') stairs.color = patch.color;
    this.#changed();
    return true;
  }

  removeStairs(floorId, id) {
    const floor = this.floor(floorId);
    if (!floor) return;
    floor.stairs = floor.stairs.filter((st) => st.id !== id);
    this.#changed();
  }

  addRoofPolygon(floorId, points, props = {}) {
    const floor = this.floor(floorId);
    if (!floor || !points || points.length < 3) return null;
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    const roof = this.addRoof(floorId, [Math.min(...xs), Math.min(...zs)], [Math.max(...xs), Math.max(...zs)], props);
    if (!roof) return null;
    roof.points = clonePoints(points);
    if (Number.isFinite(props.base)) roof.base = props.base;
    this.#changed();
    return roof;
  }

  addYardPolygon(floorId, points, props = {}) {
    const floor = this.floor(floorId);
    if (!floor || !points || points.length < 3) return null;
    const xs = points.map((p) => p[0]);
    const zs = points.map((p) => p[1]);
    const yard = this.addYard(floorId, [Math.min(...xs), Math.min(...zs)], [Math.max(...xs), Math.max(...zs)], props);
    if (!yard) return null;
    yard.points = clonePoints(points);
    this.#changed();
    return yard;
  }

  roofForRoom(floorId, roomId, props = {}) {
    const room = this.floor(floorId)?.rooms.find((r) => r.id === roomId);
    if (!room) return null;
    return this.addRoofPolygon(floorId, room.corners ?? room.polygon, { type: 'hip', base: room.elevation ?? 0, ...props });
  }

  roofForFloor(floorId, props = {}) {
    const floor = this.floor(floorId);
    const points = floor?.rooms.flatMap((r) => r.polygon) ?? [];
    if (!points.length) points.push(...(floor?.walls.flatMap((w) => [w.a, w.b]) ?? []));
    const hull = convexHull(points);
    return hull.length >= 3 ? this.addRoofPolygon(floorId, hull, props) : null;
  }

  #rects(floorId, kind) {
    const floor = this.floor(floorId);
    return floor?.[RECT_LISTS[kind]];
  }

  moveRectPoint(floorId, kind, id, index, point) {
    const item = this.#rects(floorId, kind)?.find((r) => r.id === id);
    if (!item?.points[index]) return false;
    item.points[index] = [point[0], point[1]];
    this.#changed();
    return true;
  }

  addRectPoint(floorId, kind, id, index, point = null) {
    const item = this.#rects(floorId, kind)?.find((r) => r.id === id);
    if (!item || !item.points[index]) return -1;
    const a = item.points[index];
    const b = item.points[(index + 1) % item.points.length];
    const at = point ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    item.points.splice(index + 1, 0, [at[0], at[1]]);
    this.#changed();
    return index + 1;
  }

  removeRectPoint(floorId, kind, id, index) {
    const item = this.#rects(floorId, kind)?.find((r) => r.id === id);
    if (!item || item.points.length <= 3 || !item.points[index]) return false;
    item.points.splice(index, 1);
    this.#changed();
    return true;
  }

  #patchRect(target, patch) {
    const old = { minX: target.minX, maxX: target.maxX, minZ: target.minZ, maxZ: target.maxZ };
    ['minX', 'maxX', 'minZ', 'maxZ'].forEach((key) => {
      if (Number.isFinite(patch[key])) target[key] = patch[key];
    });
    if (target.maxX - target.minX < MIN_RECT) {
      if (Number.isFinite(patch.maxX) && !Number.isFinite(patch.minX)) target.maxX = target.minX + MIN_RECT;
      else target.minX = target.maxX - MIN_RECT;
    }
    if (target.maxZ - target.minZ < MIN_RECT) {
      if (Number.isFinite(patch.maxZ) && !Number.isFinite(patch.minZ)) target.maxZ = target.minZ + MIN_RECT;
      else target.minZ = target.maxZ - MIN_RECT;
    }
    const sx = (target.maxX - target.minX) / (old.maxX - old.minX || 1);
    const sz = (target.maxZ - target.minZ) / (old.maxZ - old.minZ || 1);
    if (target.points) {
      target.points = target.points.map(([x, z]) => [
        target.minX + (x - old.minX) * sx,
        target.minZ + (z - old.minZ) * sz,
      ]);
    }
  }

  moveRect(floorId, kind, id, dx, dz) {
    const item = this.floor(floorId)?.[RECT_LISTS[kind]]?.find((r) => r.id === id);
    if (!item) return false;
    item.points = item.points.map(([x, z]) => [x + dx, z + dz]);
    this.#changed();
    return true;
  }

  decorGroups(floorId) {
    const floor = this.floor(floorId);
    return floor ? decorGroups(floor) : [];
  }

  hasDecor(floorId, groupId) {
    return this.decorGroups(floorId).some((g) => g.id === groupId);
  }

  removeDecor(floorId, groupId) {
    const floor = this.floor(floorId);
    if (!floor) return;
    Object.values(DECOR_LISTS).forEach((list) => {
      floor.decor[list] = floor.decor[list].filter((entry) => (entry.group ?? entry.id) !== groupId);
    });
    this.#changed();
  }

  tidy(step = 0.001) {
    const round = (v) => Math.round(v / step) * step;
    const clean = (v) => Number(round(v).toFixed(6));
    let changed = 0;
    const fix = (value) => {
      const next = clean(value);
      if (next !== value) changed++;
      return next;
    };

    this.floors.forEach((floor) => {
      floor.walls.forEach((w) => {
        w.a = w.a.map(fix);
        w.b = w.b.map(fix);
        if (w.bulge !== undefined) w.bulge = fix(w.bulge);
      });
      floor.rooms.forEach((r) => {
        r.polygon = r.polygon.map((p) => p.map(fix));
        if (r.corners) r.corners = r.corners.map((p) => p.map(fix));
      });
      floor.openings.forEach((o) => {
        ['offset', 'width', 'height', 'sill'].forEach((key) => (o[key] = fix(o[key])));
      });
    });
    if (changed) this.#changed();
    return changed;
  }

  fillMissingFloors(floorId) {
    const floor = this.floor(floorId);
    if (!floor) return [];

    const counts = new Map();
    floor.rooms.forEach((r) => counts.set(r.floor, (counts.get(r.floor) ?? 0) + 1));
    const material = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'oak';

    const created = findUnroomedAreas(floor, this.wallThickness).map(({ polygon }) => ({
      id: this.#nextId('room'),
      name: `Ruang ${floor.rooms.length + 1}`,
      polygon,
      floor: material,
    }));

    created.forEach((room, i) => (room.name = `Ruang ${floor.rooms.length + i + 1}`));
    floor.rooms.push(...created);
    if (created.length) this.#changed();
    return created;
  }

  setNorth(degrees) {
    if (!Number.isFinite(degrees)) return;
    this.north = ((Math.round(degrees * 10) / 10) % 360 + 360) % 360;
    this.#changed();
  }

  setWallColor(hex) {
    this.wallColor = hex;
    this.#changed();
  }

  setWallHeight(height) {
    this.wallHeight = Math.min(Math.max(height, 2), 5);
    this.floors.forEach((floor) => {
      floor.openings.forEach((o) => {
        if (o.sill + o.height > this.wallHeight) o.height = Math.max(0.3, this.wallHeight - o.sill);
      });
    });
    this.#changed();
  }

  bounds() {
    const rectCorners = (r) => [[r.minX, r.minZ], [r.maxX, r.maxZ]];
    const points = this.floors.flatMap((f) => [
      ...f.walls.flatMap((w) => [w.a, w.b]),
      ...f.rooms.flatMap((r) => r.polygon),
      ...f.yards.flatMap(rectCorners),
      ...f.roofs.flatMap(rectCorners),
      ...f.stairs.flatMap(rectCorners),
    ]);
    if (this.lot) points.push(...rectCorners(this.lot));
    return boundsOf(points);
  }

  get canUndo() {
    return this.#past.length > 0;
  }

  get canRedo() {
    return this.#future.length > 0;
  }

  checkpoint() {
    this.#past.push(this.#snapshot());
    if (this.#past.length > MAX_HISTORY) this.#past.shift();
    this.#future = [];
    this.emit('history');
  }

  dropCheckpoint() {
    this.#past.pop();
    this.emit('history');
  }

  undo() {
    if (!this.#past.length) return false;
    this.#future.push(this.#snapshot());
    this.#restore(this.#past.pop());
    return true;
  }

  redo() {
    if (!this.#future.length) return false;
    this.#past.push(this.#snapshot());
    this.#restore(this.#future.pop());
    return true;
  }

  toJSON() {
    return {
      name: this.name,
      wallHeight: this.wallHeight,
      wallThickness: this.wallThickness,
      wallColor: this.wallColor,
      ...(this.north ? { north: this.north } : {}),
      ...(this.lot ? { lot: this.lot } : {}),
      floors: this.floors.map((floor) => ({
        ...floor,
        rooms: floor.rooms.map(({ corners, ...room }) =>
          corners && corners.length !== room.polygon.length ? { ...room, corners } : room,
        ),
      })),
    };
  }

  #apply(data) {
    const copy = structuredClone({
      name: data.name,
      wallHeight: data.wallHeight,
      wallThickness: data.wallThickness,
      wallColor: data.wallColor,
      north: data.north,
      lot: data.lot ?? null,
      floors: data.floors,
    });

    this.name = copy.name ?? 'Rumah';
    this.lot = copy.lot ?? null;
    this.wallHeight = copy.wallHeight ?? 2.8;
    this.wallThickness = copy.wallThickness ?? 0.12;
    this.wallColor = copy.wallColor ?? '#e5e0d8';
    this.north = Number.isFinite(copy.north) ? ((copy.north % 360) + 360) % 360 : 0;
    this.floors = (copy.floors ?? []).map((f, i) => ({
      id: f.id ?? `floor-${i + 1}`,
      name: f.name ?? `Lantai ${i + 1}`,
      level: f.level ?? i,
      walls: f.walls ?? [],
      rooms: f.rooms ?? [],
      openings: f.openings ?? [],
      decor: normalizeDecor(f.decor ?? {}),
      roofs: f.roofs ?? [],
      yards: f.yards ?? [],
      stairs: f.stairs ?? [],
    }));
    if (!this.floors.length) {
      this.floors.push({ id: 'floor-1', name: 'Lantai 1', level: 0, walls: [], rooms: [], openings: [], decor: {}, roofs: [], yards: [], stairs: [] });
    }

    this.#syncRooms();

    const ids = this.floors.flatMap((f) => [f.id, ...f.walls.map((w) => w.id), ...f.rooms.map((r) => r.id), ...f.openings.map((o) => o.id), ...(f.roofs ?? []).map((r) => r.id), ...(f.yards ?? []).map((y) => y.id), ...(f.stairs ?? []).map((st) => st.id)]);
    this.#counter = Math.max(0, ...ids.map((id) => Number(/-(\d+)$/.exec(id)?.[1] ?? 0)));
  }

  #snapshot() {
    return JSON.stringify(this.toJSON());
  }

  #restore(snapshot) {
    this.#apply(JSON.parse(snapshot));
    if (!this.floor(this.activeFloorId)) {
      this.activeFloorId = this.floors[0].id;
      this.emit('floor', this.activeFloorId);
    }
    this.emit('history');
    this.#changed();
  }

  #changed() {
    this.#syncRooms();
    this.emit('change');
  }

  #syncRooms() {
    this.floors.forEach((floor) => {
      [...floor.roofs, ...floor.yards, ...floor.stairs].forEach((item) => {
        if (!item.points || item.points.length < 3) item.points = rectPoints(item);
        const xs = item.points.map((p) => p[0]);
        const zs = item.points.map((p) => p[1]);
        Object.assign(item, { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
      });
      const curved = floor.walls.some((w) => w.bulge);
      floor.rooms.forEach((room) => {
        if (!room.corners) {
          if (!curved) return;
          room.corners = room.polygon.map((p) => [p[0], p[1]]);
        }
        room.polygon = expandPolygon(room.corners, floor.walls);
        if (!curved && room.corners.length === room.polygon.length) delete room.corners;
      });
    });
  }

  #nextId(kind) {
    return `${kind}-${++this.#counter}`;
  }

  #insertWall(floor, a, b) {
    const endpoints = floor.walls.flatMap((w) => [w.a, w.b]);
    const created = [];

    splitSegment(a, b, endpoints).forEach((piece) => {
      const covered = floor.walls.some((w) => !w.bulge && segmentCovers(w, piece));
      if (covered || wallLength(piece) < MIN_WALL_LENGTH) return;
      const wall = { id: this.#nextId('wall'), a: piece.a, b: piece.b };
      floor.walls.push(wall);
      created.push(wall);
    });
    return created;
  }

  #placeOpening(floor, wall, opening, ignoreId = null) {
    const length = wallLength(wall);
    const width = Math.min(opening.width, length - 0.1);
    const offset = clampOpeningOffset(opening.offset, width, length);
    if (offset === null || width < 0.3) return null;

    const clash = floor.openings.some(
      (o) => o.wallId === wall.id && o.id !== ignoreId && openingsOverlap(offset, width, o.offset, o.width),
    );
    if (clash) return null;

    const placed = { ...opening, width, offset };
    if (placed.type === 'niche') {
      const maxDepth = Math.max((wall.thickness ?? this.wallThickness) - MIN_NICHE_BACK, 0.02);
      placed.depth = Math.min(placed.depth ?? OPENING_DEFAULTS.niche.depth, maxDepth);
    }
    return placed;
  }

  #fitOpenings(floor, wallId) {
    const wall = floor.walls.find((w) => w.id === wallId);
    if (!wall) return;
    const length = wallLength(wall);

    floor.openings
      .filter((o) => o.wallId === wallId)
      .forEach((opening) => {
        opening.width = Math.max(0.3, Math.min(opening.width, length - 0.1));
        const offset = clampOpeningOffset(opening.offset, opening.width, length);
        if (offset === null) floor.openings = floor.openings.filter((o) => o.id !== opening.id);
        else opening.offset = offset;
      });
  }
}
