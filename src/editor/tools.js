import { stairHandles } from '../plan/stairs.js';
import {
  arcOf,
  clampOpeningOffset,
  distance,
  normalOnWall,
  pointOnWall,
  projectOnWall,
  samePoint,
  wallLength,
  wallPolyline,
} from '../plan/geometry.js';
import { OPENING_DEFAULTS } from '../plan/Plan.js';
import { drawMeasure, label } from './render.js';
import { snapOpening } from './openingSnap.js';
import {
  bulgeHandleAt,
  edgePointAt,
  itemsInRect,
  measureAt,
  measureSnapAt,
  nearestWall,
  pickAt,
  rectPinAt,
  roomEdgeMidpoints,
  vertexAt,
} from './hit.js';

const ORTHO_RATIO = 0.12;
const OPENING_REACH = 0.6;
const MIN_DRAG_FOR_ROOM = 0.3;
const BULGE_STEP = 0.05;
const MONO = '600 12px ui-monospace, monospace';

function sagittaToward(a, b, p, free) {
  const chord = distance(a, b) || 1;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const normal = [-(b[1] - a[1]) / chord, (b[0] - a[0]) / chord];
  const raw = (p[0] - mid[0]) * normal[0] + (p[1] - mid[1]) * normal[1];
  if (free) return raw;
  const snapped = Math.round(raw / BULGE_STEP) * BULGE_STEP;
  return Math.abs(snapped) < BULGE_STEP / 2 ? 0 : snapped;
}

function resolveMeasurePoint(editor, p, event, anchor = null) {
  let point;
  let kind = 'grid';
  if (event.altKey) {
    point = [p[0], p[1]];
    kind = 'free';
  } else {
    const snapped = measureSnapAt(editor.floor, p, editor.tol(12));
    if (snapped) {
      point = snapped.point;
      kind = snapped.kind;
    } else {
      point = editor.snap(p);
    }
  }
  if (anchor && event.shiftKey) {
    const dx = point[0] - anchor[0];
    const dz = point[1] - anchor[1];
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dz, dx) / step) * step;
    const length = Math.hypot(dx, dz);
    point = [anchor[0] + Math.cos(angle) * length, anchor[1] + Math.sin(angle) * length];
    kind = 'lock';
  }
  return { point, kind };
}

function measureUnder(editor, p) {
  const here = editor.measures.filter((m) => m.floorId === editor.floorId);
  const hit = measureAt(here, p, editor.tol(7));
  return hit ? { ...hit, measure: here.find((m) => m.id === hit.id) } : null;
}

function startMeasureDrag(hit, p) {
  return { id: hit.id, part: hit.part, from: p, a0: [...hit.measure.a], b0: [...hit.measure.b] };
}

function applyMeasureDrag(editor, drag, p, event) {
  if (drag.part === 'a') {
    editor.updateMeasure(drag.id, { a: resolveMeasurePoint(editor, p, event, drag.b0).point });
  } else if (drag.part === 'b') {
    editor.updateMeasure(drag.id, { b: resolveMeasurePoint(editor, p, event, drag.a0).point });
  } else {
    const wanted = [drag.a0[0] + (p[0] - drag.from[0]), drag.a0[1] + (p[1] - drag.from[1])];
    const target = event.altKey ? wanted : resolveMeasurePoint(editor, wanted, event).point;
    const dx = target[0] - drag.a0[0];
    const dz = target[1] - drag.a0[1];
    editor.updateMeasure(drag.id, {
      a: [drag.a0[0] + dx, drag.a0[1] + dz],
      b: [drag.b0[0] + dx, drag.b0[1] + dz],
    });
  }
}

function strokePolyline(ctx, viewport, points) {
  ctx.beginPath();
  points.forEach((point, i) => {
    const [sx, sy] = viewport.toScreen(point);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.stroke();
}

const dashed = (ctx, [x1, y1], [x2, y2], color) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
};

const dot = (ctx, [x, y], color) => {
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
};

export class SelectTool {
  name = 'select';
  hint =
    'Klik untuk memilih · seret area kosong untuk memilih banyak (Shift = tambah) · seret sudut untuk memindahkan · Delete menghapus';
  #drag = null;

  onDown(editor, p, event) {
    const { floor, plan } = editor;

    const onMeasure = measureUnder(editor, p);
    if (onMeasure) {
      editor.select(null);
      this.#drag = { type: 'measure', ...startMeasureDrag(onMeasure, p) };
      return true;
    }

    const selected = editor.selection.length === 1 && editor.selection[0].kind === 'wall' ? editor.selection[0] : null;
    const selectedWall = selected && floor.walls.find((w) => w.id === selected.id);
    if (selectedWall && bulgeHandleAt(selectedWall, p, editor.tol(10))) {
      plan.checkpoint();
      this.#drag = { type: 'bulge', id: selectedWall.id };
      return true;
    }

    const selectedRoom =
      editor.selection.length === 1 && editor.selection[0].kind === 'room'
        ? floor.rooms.find((r) => r.id === editor.selection[0].id)
        : null;
    if (selectedRoom) {
      const corners = selectedRoom.corners ?? selectedRoom.polygon;

      const pin = editor.activePin;
      if (pin) {
        editor.plan.checkpoint();
        if (editor.plan.removeRectPoint(editor.floorId, pin.kind, pin.id, pin.index)) editor.setActivePin(null);
        else editor.notify('Minimal 3 pin.');
        return true;
      }
      const active = editor.activeCorner;
      if (active?.roomId === selectedRoom.id && corners[active.index]) {
        const c = corners[active.index];
        const badge = [c[0] + 16 / editor.viewport.scale, c[1] - 16 / editor.viewport.scale];
        if (distance(badge, p) <= editor.tol(9)) {
          this.#removeCorner(editor, selectedRoom, active.index);
          return true;
        }
      }
      const hitIndex = corners.findIndex((c) => distance(c, p) <= editor.tol(11));
      if (hitIndex >= 0) editor.setActiveCorner({ roomId: selectedRoom.id, index: hitIndex });

      const plus = roomEdgeMidpoints(floor, selectedRoom).find(({ point }) => distance(point, p) <= editor.tol(9));
      if (plus) {
        plan.checkpoint();
        const follow = editor.options.cornersFollowWalls;
        const added = plan.addRoomVertex(editor.floorId, plus.point, { walls: follow });
        if (added.ok) {
          const updated = floor.rooms.find((r) => r.id === selectedRoom.id);
          const corners = updated?.corners ?? updated?.polygon ?? [];
          const index = corners.findIndex((c) => distance(c, added.point) < 1e-6);
          this.#drag =
            follow || index < 0
              ? { type: 'vertex', current: added.point }
              : { type: 'roomCorner', roomId: selectedRoom.id, index };
        } else {
          plan.dropCheckpoint();
          editor.notify(added.reason);
        }
        return true;
      }
    }

    if (selectedRoom && !editor.options.cornersFollowWalls) {
      const corners = selectedRoom.corners ?? selectedRoom.polygon;
      const index = corners.findIndex((c) => distance(c, p) <= editor.tol(10));
      if (index >= 0) {
        plan.checkpoint();
        this.#drag = { type: 'roomCorner', roomId: selectedRoom.id, index };
        return true;
      }
    }

    if (editor.selection.length === 1 && editor.selection[0].kind === 'stairs') {
      const stairs = floor.stairs.find((st) => st.id === editor.selection[0].id);
      const handle = stairs && stairHandles(stairs).find((h) => distance(h.point, p) <= editor.tol(10));
      if (handle) {
        plan.checkpoint();
        this.#drag = { type: 'stairsHandle', id: stairs.id, x: handle.x, z: handle.z };
        return true;
      }
    }

    const rectItem = this.#selectedRect(editor);
    if (rectItem) {
      const pin = rectPinAt(rectItem.item, p, editor.tol(10));
      if (pin) {
        plan.checkpoint();
        let index = pin.index;
        if (pin.type === 'mid') index = plan.addRectPoint(editor.floorId, rectItem.kind, rectItem.item.id, pin.index);
        editor.setActivePin({ kind: rectItem.kind, id: rectItem.item.id, index });
        this.#drag = { type: 'rectPin', kind: rectItem.kind, id: rectItem.item.id, index };
        return true;
      }
    }

    const corner = vertexAt(floor, p, editor.tol(10), editor.layers);
    if (corner) {
      plan.checkpoint();
      this.#drag = { type: 'vertex', current: corner };
      return true;
    }

    const hit = pickAt(floor, p, editor.tol(8), plan.wallThickness, editor.layers);
    if (hit) {
      if (event.shiftKey) {
        editor.toggle(hit);
      } else if (hit.kind === 'opening' && editor.selection.length > 1 && editor.isSelected(hit) && this.#startGroupDrag(editor, p)) {
      } else {
        editor.select(hit);
        if (hit.kind === 'roof' || hit.kind === 'yard' || hit.kind === 'stairs') {
          plan.checkpoint();
          this.#drag = { type: 'rect', kind: hit.kind, id: hit.id, last: editor.snap(p, { free: event.altKey }) };
          return true;
        }
        if (hit.kind === 'opening' && event.altKey) {
          editor.copySelection();
          editor.pasteClipboard();
          return true;
        }
        if (hit.kind === 'opening') {
          plan.checkpoint();
          this.#drag = { type: 'opening', id: hit.id };
        }
      }
      return true;
    }

    const base = event.shiftKey ? [...editor.selection] : [];
    if (!event.shiftKey) editor.select(null);
    this.#drag = { type: 'marquee', start: p, current: p, base };
    return true;
  }

  #selectedRect(editor) {
    if (editor.selection.length !== 1) return null;
    const { kind, id } = editor.selection[0];
    const lists = { roof: editor.floor.roofs, yard: editor.floor.yards };
    if (!lists[kind]) return null;
    const item = lists[kind].find((r) => r.id === id);
    return item ? { kind, item } : null;
  }

  #startGroupDrag(editor, p) {
    const { floor, plan } = editor;
    const ids = editor.selection.filter((s) => s.kind === 'opening').map((s) => s.id);
    if (ids.length !== editor.selection.length) return false;
    const items = floor.openings.filter((o) => ids.includes(o.id));
    const wall = floor.walls.find((w) => w.id === items[0]?.wallId);
    if (!wall || items.some((o) => o.wallId !== wall.id)) return false;

    plan.checkpoint();
    this.#drag = { type: 'openingGroup', ids, wallId: wall.id, startT: projectOnWall(p, wall).t, applied: 0 };
    return true;
  }

  onMove(editor, p, event) {
    const { floor, plan } = editor;
    const drag = this.#drag;

    if (!drag) {
      const roomSel =
        editor.selection.length === 1 && editor.selection[0].kind === 'room'
          ? floor.rooms.find((r) => r.id === editor.selection[0].id)
          : null;
      if (roomSel) {
        const corners = roomSel.corners ?? roomSel.polygon;
        const index = corners.findIndex((c) => distance(c, p) <= editor.tol(11));
        editor.setHoverCorner(index >= 0 ? { roomId: roomSel.id, index } : null);
      } else if (editor.hoverCorner) {
        editor.setHoverCorner(null);
      }

      if (measureUnder(editor, p)) {
        editor.hover = null;
        editor.setCursor('move');
        return;
      }
      const selected = editor.selection.length === 1 && editor.selection[0].kind === 'wall' ? editor.selection[0] : null;
      const selectedWall = selected && floor.walls.find((w) => w.id === selected.id);
      if (selectedWall && bulgeHandleAt(selectedWall, p, editor.tol(10))) {
        editor.hover = null;
        editor.setCursor('ns-resize');
        return;
      }
      const corner = vertexAt(floor, p, editor.tol(10), editor.layers);
      editor.hover = corner ? null : pickAt(floor, p, editor.tol(8), plan.wallThickness, editor.layers);
      editor.setCursor(corner ? 'move' : editor.hover ? 'pointer' : 'default');
      return;
    }

    if (drag.type === 'marquee') {
      drag.current = p;
      const found = itemsInRect(floor, this.#rect(drag), editor.layers);
      const extra = found.filter((item) => !drag.base.some((b) => b.kind === item.kind && b.id === item.id));
      editor.select([...drag.base, ...extra]);
    } else if (drag.type === 'vertex') {
      const target = editor.snap(p, { ignore: drag.current, free: event.altKey });
      if (!samePoint(target, drag.current)) {
        plan.moveVertex(editor.floorId, drag.current, target);
        drag.current = target;
      }
    } else if (drag.type === 'roomCorner') {
      const target = editor.snap(p, { free: event.altKey });
      plan.moveRoomCorner(editor.floorId, drag.roomId, drag.index, target);
    } else if (drag.type === 'measure') {
      applyMeasureDrag(editor, drag, p, event);
    } else if (drag.type === 'bulge') {
      const wall = floor.walls.find((w) => w.id === drag.id);
      if (wall) plan.setWallBulge(editor.floorId, wall.id, sagittaToward(wall.a, wall.b, p, event.altKey));
    } else if (drag.type === 'stairsHandle') {
      const q = editor.snap(p, { free: event.altKey });
      const patch = {};
      if (drag.x) patch[drag.x === 'min' ? 'minX' : 'maxX'] = q[0];
      if (drag.z) patch[drag.z === 'min' ? 'minZ' : 'maxZ'] = q[1];
      plan.updateStairs(editor.floorId, drag.id, patch);
    } else if (drag.type === 'rectPin') {
      const target = editor.snap(p, { free: event.altKey });
      plan.moveRectPoint(editor.floorId, drag.kind, drag.id, drag.index, target);
    } else if (drag.type === 'rect') {
      const q = editor.snap(p, { free: event.altKey });
      const dx = q[0] - drag.last[0];
      const dz = q[1] - drag.last[1];
      if (dx || dz) {
        plan.moveRect(editor.floorId, drag.kind, drag.id, dx, dz);
        drag.last = q;
      }
    } else if (drag.type === 'openingGroup') {
      const wall = floor.walls.find((w) => w.id === drag.wallId);
      const items = floor.openings.filter((o) => drag.ids.includes(o.id));
      if (!wall || !items.length) return;
      const start = Math.min(...items.map((o) => o.offset - o.width / 2));
      const end = Math.max(...items.map((o) => o.offset + o.width / 2));
      const width = end - start;
      const wanted = (start + end) / 2 + (projectOnWall(p, wall).t - drag.startT - drag.applied);
      const snap = event.altKey
        ? { offset: wanted, kind: null, label: '' }
        : snapOpening(floor, wall, { offset: wanted, width, ignoreId: drag.ids }, editor.tol(9));
      const delta = snap.offset - (start + end) / 2;
      if (Math.abs(delta) > 1e-6 && plan.moveOpenings(editor.floorId, drag.ids, delta)) drag.applied += delta;

      const now = floor.openings.filter((o) => drag.ids.includes(o.id)).sort((a, b) => a.offset - b.offset);
      const s2 = Math.min(...now.map((o) => o.offset - o.width / 2));
      const e2 = Math.max(...now.map((o) => o.offset + o.width / 2));
      const outer = snapOpening(floor, wall, { offset: (s2 + e2) / 2, width: e2 - s2, ignoreId: drag.ids }, 0);
      const inner = now.slice(1).map((o, i) => {
        const from = now[i].offset + now[i].width / 2;
        const to = o.offset - o.width / 2;
        return { from, to, len: Math.max(to - from, 0), kind: 'opening' };
      });
      drag.guide = {
        wallId: wall.id,
        offset: (s2 + e2) / 2,
        width: e2 - s2,
        gaps: outer.gaps,
        inner,
        kind: snap.kind,
        label: snap.label,
      };
    } else if (drag.type === 'opening') {
      const opening = floor.openings.find((o) => o.id === drag.id);
      const wall = floor.walls.find((w) => w.id === opening?.wallId);
      if (wall) {
        const raw = projectOnWall(p, wall).t;
        const snap = event.altKey
          ? null
          : snapOpening(floor, wall, { offset: raw, width: opening.width, ignoreId: opening.id }, editor.tol(9));
        plan.updateOpening(editor.floorId, opening.id, { offset: snap?.offset ?? raw });
        const moved = floor.openings.find((o) => o.id === opening.id);
        drag.guide = moved
          ? { wallId: wall.id, ...snapOpening(floor, wall, { offset: moved.offset, width: moved.width, ignoreId: moved.id }, 0), kind: snap?.kind ?? null, label: snap?.label ?? '', width: moved.width }
          : null;
      }
    }
  }

  onUp() {
    this.#drag = null;
  }

  onKey(editor, event) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const active = editor.activeCorner;
      const room = active && editor.floor.rooms.find((r) => r.id === active.roomId);
      if (room) {
        this.#removeCorner(editor, room, active.index);
        return true;
      }
      editor.deleteSelection();
      return true;
    }
    return false;
  }

  #removeCorner(editor, room, index) {
    const corners = room.corners ?? room.polygon;
    editor.plan.checkpoint();
    const result = editor.plan.removeRoomVertex(editor.floorId, corners[index], {
      walls: editor.options.cornersFollowWalls,
    });
    if (!result.ok) {
      editor.plan.dropCheckpoint();
      editor.notify(result.reason);
    }
    editor.setActiveCorner(null);
  }

  cancel() {
    this.#drag = null;
  }

  #rect({ start, current }) {
    return {
      minX: Math.min(start[0], current[0]),
      maxX: Math.max(start[0], current[0]),
      minZ: Math.min(start[1], current[1]),
      maxZ: Math.max(start[1], current[1]),
    };
  }

  draw(ctx, { viewport, COLORS, floor, plan }) {
    const guide = ['opening', 'openingGroup'].includes(this.#drag?.type) ? this.#drag.guide : null;
    if (guide) drawOpeningGuides(ctx, { viewport, COLORS, floor, plan }, guide);
    if (this.#drag?.type !== 'marquee') return;
    const { minX, maxX, minZ, maxZ } = this.#rect(this.#drag);
    const [x1, y1] = viewport.toScreen([minX, minZ]);
    const [x2, y2] = viewport.toScreen([maxX, maxZ]);

    ctx.fillStyle = 'rgba(56,189,248,0.10)';
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1);
    ctx.setLineDash([]);
  }
}

export class WallTool {
  name = 'wall';
  hint =
    'Klik titik awal, lalu titik berikutnya · ketik angka + Enter untuk panjang tepat · Shift = bebas sudut · Esc/dobel-klik selesai';
  #start = null;
  #current = null;
  #typed = '';

  #constrain(editor, p, event) {
    const q = editor.snap(p, { free: event.altKey });
    if (!this.#start || event.shiftKey) return q;

    const dx = Math.abs(q[0] - this.#start[0]);
    const dz = Math.abs(q[1] - this.#start[1]);
    if (dz < dx * ORTHO_RATIO) return [q[0], this.#start[1]];
    if (dx < dz * ORTHO_RATIO) return [this.#start[0], q[1]];
    return q;
  }

  onDown(editor, p, event) {
    const q = this.#constrain(editor, p, event);
    if (!this.#start) {
      this.#start = q;
      this.#current = q;
      return true;
    }
    if (distance(this.#start, q) < 0.05) return true;

    editor.plan.checkpoint();
    editor.plan.addWall(editor.floorId, this.#start, q);
    this.#start = q;
    this.#typed = '';
    return true;
  }

  onMove(editor, p, event) {
    this.#current = this.#constrain(editor, p, event);
  }

  onDoubleClick() {
    this.cancel();
  }

  onKey(editor, event) {
    if (this.#start && /^[0-9.,]$/.test(event.key)) {
      this.#typed += event.key === ',' ? '.' : event.key;
      return true;
    }
    if (this.#start && event.key === 'Backspace' && this.#typed) {
      this.#typed = this.#typed.slice(0, -1);
      return true;
    }
    if (event.key === 'Enter' && this.#start && this.#typed) {
      const length = parseFloat(this.#typed);
      this.#typed = '';
      if (!(length >= 0.1) || !this.#current) return true;
      const dx = this.#current[0] - this.#start[0];
      const dz = this.#current[1] - this.#start[1];
      const span = Math.hypot(dx, dz);
      const [ux, uz] = span > 1e-6 ? [dx / span, dz / span] : [1, 0];
      const end = [
        Math.round((this.#start[0] + ux * length) * 1000) / 1000,
        Math.round((this.#start[1] + uz * length) * 1000) / 1000,
      ];
      editor.plan.checkpoint();
      editor.plan.addWall(editor.floorId, this.#start, end);
      this.#start = end;
      this.#current = end;
      return true;
    }
    if (event.key === 'Escape' || event.key === 'Enter') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel() {
    this.#start = null;
    this.#current = null;
    this.#typed = '';
  }

  draw(ctx, { viewport, COLORS }) {
    if (!this.#current) return;
    const cursor = viewport.toScreen(this.#current);
    dot(ctx, cursor, COLORS.accent);
    if (!this.#start) return;

    const start = viewport.toScreen(this.#start);
    dashed(ctx, start, cursor, COLORS.accent);
    dot(ctx, start, COLORS.accent);
    const mid = [(start[0] + cursor[0]) / 2, (start[1] + cursor[1]) / 2 - 14];
    const span = distance(this.#start, this.#current);
    const angle = (Math.atan2(-(this.#current[1] - this.#start[1]), this.#current[0] - this.#start[0]) * 180) / Math.PI;
    const text = this.#typed
      ? `${this.#typed}▌ m  (Enter)`
      : `${span.toFixed(2)} m · ${((angle + 360) % 360).toFixed(1)}°`;
    label(ctx, text, mid[0], mid[1], MONO, COLORS.accent);
  }
}

export class ArcWallTool {
  name = 'arc';
  hint = 'Klik titik awal → klik titik akhir → gerakkan ke samping untuk lengkungan, klik untuk selesai · Alt = bebas';
  #a = null;
  #b = null;
  #bulge = 0;
  #cursor = null;

  onDown(editor, p, event) {
    const q = editor.snap(p, { free: event.altKey });
    if (!this.#a) {
      this.#a = q;
      return true;
    }
    if (!this.#b) {
      if (distance(this.#a, q) < 0.1) return true;
      this.#b = q;
      this.#bulge = 0;
      return true;
    }
    editor.plan.checkpoint();
    const wall = editor.plan.addArcWall(editor.floorId, this.#a, this.#b, this.#bulge);
    if (wall) editor.select({ kind: 'wall', id: wall.id });
    else editor.plan.dropCheckpoint();
    this.cancel();
    return true;
  }

  onMove(editor, p, event) {
    this.#cursor = editor.snap(p, { free: event.altKey });
    if (this.#a && this.#b) this.#bulge = sagittaToward(this.#a, this.#b, p, event.altKey);
  }

  onKey(editor, event) {
    if (event.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel() {
    this.#a = null;
    this.#b = null;
    this.#bulge = 0;
    this.#cursor = null;
  }

  draw(ctx, { viewport, COLORS }) {
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;

    if (this.#a && this.#b) {
      const wall = { a: this.#a, b: this.#b, bulge: this.#bulge };
      strokePolyline(ctx, viewport, wallPolyline(wall));
      ctx.setLineDash([]);
      dot(ctx, viewport.toScreen(this.#a), COLORS.accent);
      dot(ctx, viewport.toScreen(this.#b), COLORS.accent);

      const arc = arcOf(wall);
      const at = viewport.toScreen(arc ? arc.apex : [(this.#a[0] + this.#b[0]) / 2, (this.#a[1] + this.#b[1]) / 2]);
      const text = arc
        ? `${wallLength(wall).toFixed(2)} m · R ${arc.radius.toFixed(2)} · ${((arc.angle * 180) / Math.PI).toFixed(0)}°`
        : `${distance(this.#a, this.#b).toFixed(2)} m (lurus)`;
      label(ctx, text, at[0], at[1] - 16, MONO, COLORS.accent);
    } else if (this.#a && this.#cursor) {
      dashed(ctx, viewport.toScreen(this.#a), viewport.toScreen(this.#cursor), COLORS.accent);
      dot(ctx, viewport.toScreen(this.#a), COLORS.accent);
    } else {
      ctx.setLineDash([]);
      if (this.#cursor) dot(ctx, viewport.toScreen(this.#cursor), COLORS.accent);
    }
    ctx.setLineDash([]);
  }
}

export class CornerTool {
  #hover = null;

  constructor(mode) {
    this.mode = mode;
    this.name = mode === 'round' ? 'corner-round' : 'corner-chamfer';
    this.hint =
      mode === 'round'
        ? 'Klik sudut pertemuan dua tembok untuk membulatkannya · atur radius di panel Properti'
        : 'Klik sudut pertemuan dua tembok untuk memahatnya (potong diagonal) · atur jarak di panel Properti';
  }

  #cornerAt(editor, p) {
    const corner = vertexAt(editor.floor, p, editor.tol(14));
    if (!corner) return null;
    const touching = editor.floor.walls.filter((w) => samePoint(w.a, corner) || samePoint(w.b, corner));
    return touching.length === 2 ? corner : null;
  }

  onMove(editor, p) {
    this.#hover = this.#cornerAt(editor, p);
  }

  onDown(editor, p) {
    const corner = this.#cornerAt(editor, p);
    if (!corner) {
      editor.notify('Klik tepat di sudut pertemuan dua tembok.');
      return true;
    }
    editor.plan.checkpoint();
    const result = editor.plan.roundCorner(editor.floorId, corner, editor.options.cornerSize, this.mode);
    if (!result.ok) {
      editor.plan.dropCheckpoint();
      editor.notify(result.reason);
    } else {
      editor.select({ kind: 'wall', id: result.wall.id });
      this.#hover = null;
    }
    return true;
  }

  cancel() {
    this.#hover = null;
  }

  draw(ctx, { viewport, COLORS }) {
    if (!this.#hover) return;
    const [sx, sy] = viewport.toScreen(this.#hover);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 11, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export class RoomTool {
  name = 'room';
  hint = 'Seret dari satu sudut ke sudut lain (atau klik dua sudut) · tembok dibuat otomatis';
  #a = null;
  #b = null;

  onDown(editor, p, event) {
    const q = editor.snap(p, { free: event.altKey });
    if (!this.#a) {
      this.#a = q;
      this.#b = q;
      return true;
    }
    this.#b = q;
    this.#finish(editor);
    return true;
  }

  onMove(editor, p, event) {
    if (this.#a) this.#b = editor.snap(p, { free: event.altKey });
  }

  onUp(editor, p, event) {
    if (!this.#a) return;
    const q = editor.snap(p, { free: event.altKey });
    if (distance(this.#a, q) >= MIN_DRAG_FOR_ROOM) {
      this.#b = q;
      this.#finish(editor);
    }
  }

  onKey(editor, event) {
    if (event.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  #finish(editor) {
    editor.plan.checkpoint();
    const room = editor.plan.addRoom(editor.floorId, this.#a, this.#b);
    if (room) editor.select({ kind: 'room', id: room.id });
    else editor.notify('Ruangan terlalu kecil (minimal 0,5 m).');
    this.cancel();
  }

  cancel() {
    this.#a = null;
    this.#b = null;
  }

  draw(ctx, { viewport, COLORS }) {
    if (!this.#a || !this.#b) return;
    const [x1, y1] = viewport.toScreen(this.#a);
    const [x2, y2] = viewport.toScreen(this.#b);
    ctx.fillStyle = 'rgba(56,189,248,0.12)';
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.setLineDash([]);

    const w = Math.abs(this.#b[0] - this.#a[0]);
    const d = Math.abs(this.#b[1] - this.#a[1]);
    label(ctx, `${w.toFixed(2)} × ${d.toFixed(2)} m`, (x1 + x2) / 2, (y1 + y2) / 2, '600 13px ui-monospace, monospace', COLORS.accent);
  }
}

const RECT_TOOLS = {
  roof: { hint: 'Seret persegi di atas bangunan untuk membuat atap (bisa diubah jenisnya di Properti)', props: { type: 'gable' }, kind: 'roof' },
  canopy: { hint: 'Seret persegi untuk kanopi / carport berdiri di atas tiang', props: { type: 'canopy' }, kind: 'roof' },
  yard: { hint: 'Seret persegi untuk halaman / taman (rumput, paving, kolam)', props: { ground: 'grass' }, kind: 'yard' },
  stairs: { hint: 'Seret persegi untuk tangga lurus (arah naik diatur di Properti, tinggi = satu lantai)', props: {}, kind: 'stairs' },
  terrace: { hint: 'Seret persegi untuk teras (lantai keramik sedikit ditinggikan, bisa diberi pagar & kanopi)', props: { ground: 'teras' }, kind: 'yard' },
};

export class RectTool {
  #a = null;
  #b = null;

  constructor(name) {
    this.name = name;
    this.hint = RECT_TOOLS[name].hint;
  }

  onDown(editor, p, event) {
    const q = editor.snap(p, { free: event.altKey });
    if (!this.#a) {
      this.#a = q;
      this.#b = q;
      return true;
    }
    this.#b = q;
    this.#finish(editor);
    return true;
  }

  onMove(editor, p, event) {
    if (this.#a) this.#b = editor.snap(p, { free: event.altKey });
  }

  onUp(editor, p, event) {
    if (!this.#a) return;
    const q = editor.snap(p, { free: event.altKey });
    if (distance(this.#a, q) >= 0.5) {
      this.#b = q;
      this.#finish(editor);
    }
  }

  onKey(editor, event) {
    if (event.key === 'Escape') {
      this.cancel();
      return true;
    }
    return false;
  }

  #finish(editor) {
    const { kind, props } = RECT_TOOLS[this.name];
    editor.plan.checkpoint();
    const add = { roof: 'addRoof', yard: 'addYard', stairs: 'addStairs' }[kind];
    const made = editor.plan[add](editor.floorId, this.#a, this.#b, props);
    if (made) {
      editor.select({ kind, id: made.id });
      editor.setTool('select');
    } else {
      editor.notify('Terlalu kecil (minimal 0,5 m).');
    }
    this.cancel();
  }

  cancel() {
    this.#a = null;
    this.#b = null;
  }

  draw(ctx, { viewport, COLORS }) {
    if (!this.#a || !this.#b) return;
    const [x1, y1] = viewport.toScreen(this.#a);
    const [x2, y2] = viewport.toScreen(this.#b);
    const color = this.name === 'yard' ? '#4ade80' : this.name === 'stairs' ? '#38bdf8' : '#f97316';
    ctx.fillStyle = `${color}22`;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.setLineDash([]);
    const w = Math.abs(this.#b[0] - this.#a[0]);
    const d = Math.abs(this.#b[1] - this.#a[1]);
    label(ctx, `${w.toFixed(2)} × ${d.toFixed(2)} m`, (x1 + x2) / 2, (y1 + y2) / 2, '600 13px ui-monospace, monospace', color);
  }
}

export class OpeningTool {
  #preview = null;

  constructor(type = null, preset = null, name = null) {
    this.type = type;
    this.preset = preset;
    this.name = name ?? type ?? 'paste';
    this.hint = {
      door: 'Arahkan ke tembok lalu klik untuk menaruh pintu · Alt = tanpa magnet',
      'door-double': 'Arahkan ke tembok lalu klik untuk menaruh pintu dua daun · Alt = tanpa magnet',
      window: 'Arahkan ke tembok lalu klik untuk menaruh jendela · Alt = tanpa magnet',
      niche: 'Arahkan ke tembok lalu klik untuk membuat cekungan · sisi kursor menentukan arah cekungan',
      vent: 'Arahkan ke tembok lalu klik untuk menaruh lubang angin · Alt = tanpa magnet',
    }[name ?? type] ?? 'Klik tembok untuk menaruh salinan (bisa berulang) · Alt = tanpa magnet · Esc selesai';
  }

  #template(editor) {
    if (this.type) return { type: this.type, ...OPENING_DEFAULTS[this.type], ...this.preset };
    return editor.clipboard ?? null;
  }

  onMove(editor, p, event) {
    const template = this.#template(editor);
    const near = template && nearestWall(editor.floor, p, OPENING_REACH);
    if (!near) {
      this.#preview = null;
      return;
    }

    const { floor } = editor;
    const type = template.type;
    const length = wallLength(near.wall);
    const width = template.width;
    const props = {
      width: template.width,
      height: template.height,
      sill: template.sill,
      depth: template.depth,
      swing: template.swing,
      hinge: template.hinge,
      leaves: template.leaves,
      vent: template.vent,
      ventHeight: template.ventHeight,
    };

    const [nx, nz] = normalOnWall(near.wall, near.t);
    const at = pointOnWall(near.wall, near.t);
    const cursorSide = (p[0] - at[0]) * nx + (p[1] - at[1]) * nz >= 0 ? 1 : -1;
    const side = type === 'niche' && !this.type ? template.side ?? cursorSide : cursorSide;

    const clamped = clampOpeningOffset(near.t, width, length) ?? near.t;
    const snap = event?.altKey
      ? { offset: clamped, kind: null, label: '' }
      : snapOpening(floor, near.wall, { offset: clamped, width }, editor.tol(9));

    const placed = editor.plan.placementFor(editor.floorId, {
      wallId: near.wall.id,
      type,
      offset: snap.offset,
      side,
      props,
    });
    const offset = placed?.offset ?? snap.offset;
    const finalWidth = placed?.width ?? width;
    const guide = snapOpening(floor, near.wall, { offset, width: finalWidth }, 0);

    this.#preview = {
      wallId: near.wall.id,
      type,
      props,
      offset,
      width: finalWidth,
      side,
      valid: Boolean(placed),
      kind: snap.kind,
      label: snap.label,
      gaps: guide.gaps,
    };
  }

  onDown(editor) {
    const preview = this.#preview;
    if (!preview?.valid) {
      if (preview) editor.notify('Tidak muat atau menabrak pintu/jendela lain.');
      return true;
    }

    editor.plan.checkpoint();
    const opening = editor.plan.addOpening(editor.floorId, {
      wallId: preview.wallId,
      type: preview.type,
      offset: preview.offset,
      side: preview.side,
      props: preview.props,
    });
    if (opening) editor.select({ kind: 'opening', id: opening.id });
    return true;
  }

  onKey(editor, event) {
    if (event.key === 'Escape' && !this.type) {
      editor.setTool('select');
      return true;
    }
    return false;
  }

  cancel() {
    this.#preview = null;
  }

  draw(ctx, { viewport, floor, COLORS, plan }) {
    const preview = this.#preview;
    const wall = preview && floor.walls.find((w) => w.id === preview.wallId);
    if (!wall) return;

    const at = (t) => viewport.toScreen(pointOnWall(wall, t));
    const [x1, y1] = at(preview.offset - preview.width / 2);
    const [x2, y2] = at(preview.offset + preview.width / 2);

    ctx.strokeStyle = preview.valid ? COLORS.valid : COLORS.invalid;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max((wall.thickness ?? plan.wallThickness) * viewport.scale, 4) + 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    drawOpeningGuides(ctx, { viewport, COLORS, floor, plan }, { ...preview, wallId: wall.id });
  }
}

function drawOpeningGuides(ctx, { viewport, COLORS, floor, plan }, guide) {
  const wall = floor.walls.find((w) => w.id === guide.wallId);
  if (!wall || !guide.gaps) return;

  const thickness = Math.max((wall.thickness ?? plan.wallThickness) * viewport.scale, 4);
  const point = (t) => viewport.toScreen(pointOnWall(wall, t));
  const [nx, nz] = normalOnWall(wall, guide.offset);
  const lift = thickness / 2 + 16;

  const { left, right } = guide.gaps;
  const equal = Math.abs(left.len - right.len) < 0.004 && left.len > 0.004;
  const color = guide.kind === 'equal' || equal ? COLORS.valid : COLORS.accent;

  const dimension = (g, mark) => {
    if (g.len < 0.004) return;
    const [ax, ay] = point(g.from);
    const [bx, by] = point(g.to);
    const x1 = ax + nx * lift;
    const y1 = ay + nz * lift;
    const x2 = bx + nx * lift;
    const y2 = by + nz * lift;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    [[ax, ay, x1, y1], [bx, by, x2, y2]].forEach(([sx, sy, ex, ey]) => {
      ctx.moveTo(sx + nx * (thickness / 2 + 2), sy + nz * (thickness / 2 + 2));
      ctx.lineTo(ex + nx * 4, ey + nz * 4);
    });
    ctx.stroke();

    const text = `${g.len.toFixed(2)} m${mark ? ' =' : ''}`;
    label(ctx, text, (x1 + x2) / 2 - 18, (y1 + y2) / 2 + nz * 8 - 4, '600 11px ui-monospace, monospace', color);
  };
  dimension(left, equal);
  dimension(right, equal);
  (guide.inner ?? []).forEach((g) => dimension(g, false));

  if (guide.kind === 'center' || guide.kind === 'align' || guide.kind === 'cross') {
    const [cx, cy] = point(guide.offset);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(cx - nx * (thickness / 2 + 22), cy - nz * (thickness / 2 + 22));
    ctx.lineTo(cx + nx * (thickness / 2 + 22), cy + nz * (thickness / 2 + 22));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (guide.label) {
    const [cx, cy] = point(guide.offset);
    label(ctx, guide.label, cx - nx * (thickness / 2 + 34) - 30, cy - nz * (thickness / 2 + 34), '600 11px system-ui, sans-serif', '#f59e0b');
  }
}

const SNAP_LABELS = { corner: 'sudut', mid: 'tengah', edge: 'di tembok', grid: '' };

export class RulerTool {
  name = 'ruler';
  hint =
    'Klik titik awal → klik titik akhir · seret garis ukur untuk menggeser, seret ujungnya untuk mengubah · Shift = kunci 45° · Delete hapus semua';
  #a = null;
  #cursor = null;
  #snapKind = null;
  #drag = null;

  onDown(editor, p, event) {
    if (!this.#a) {
      const hit = measureUnder(editor, p);
      if (hit) {
        this.#drag = startMeasureDrag(hit, p);
        return true;
      }
    }

    const { point } = resolveMeasurePoint(editor, p, event, this.#a);
    if (!this.#a) {
      this.#a = point;
      this.#cursor = point;
      return true;
    }
    if (distance(this.#a, point) >= 0.005) {
      editor.addMeasure(this.#a, point);
      this.#a = null;
    }
    return true;
  }

  onMove(editor, p, event) {
    if (this.#drag) {
      applyMeasureDrag(editor, this.#drag, p, event);
      return;
    }
    const { point, kind } = resolveMeasurePoint(editor, p, event, this.#a);
    this.#cursor = point;
    this.#snapKind = kind;
    if (!this.#a) editor.setCursor(measureUnder(editor, p) ? 'move' : 'crosshair');
  }

  onUp() {
    this.#drag = null;
  }

  onKey(editor, event) {
    if (event.key === 'Escape') {
      if (this.#a) {
        this.cancel();
        return true;
      }
      return false;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.cancel();
      editor.clearMeasures();
      return true;
    }
    return false;
  }

  cancel() {
    this.#a = null;
    this.#cursor = null;
    this.#snapKind = null;
  }

  draw(ctx, { viewport, COLORS }) {
    if (!this.#cursor) return;
    if (this.#a) drawMeasure(ctx, viewport, this.#a, this.#cursor);

    const [sx, sy] = viewport.toScreen(this.#cursor);
    ctx.strokeStyle = COLORS.accent;
    ctx.fillStyle = COLORS.accent;
    ctx.lineWidth = 2;
    if (this.#snapKind === 'corner') {
      ctx.strokeRect(sx - 6, sy - 6, 12, 12);
    } else if (this.#snapKind === 'mid') {
      ctx.beginPath();
      ctx.moveTo(sx, sy - 7);
      ctx.lineTo(sx + 7, sy + 6);
      ctx.lineTo(sx - 7, sy + 6);
      ctx.closePath();
      ctx.stroke();
    } else {
      dot(ctx, [sx, sy], COLORS.accent);
    }

    const text = SNAP_LABELS[this.#snapKind];
    if (text) label(ctx, text, sx + 14, sy - 12, '600 10px system-ui', COLORS.accent);
  }
}

export class PointTool {
  name = 'vertex';
  hint =
    'Klik di tembok/sisi ruangan untuk menambah titik · Shift+klik sudut untuk menghapus titik · lalu seret titik dengan alat Pilih';
  #hover = null;

  #resolve(editor, p, event) {
    const corner = vertexAt(editor.floor, p, editor.tol(10));
    if (corner) return { corner };

    const edge = edgePointAt(editor.floor, p, editor.tol(14));
    if (!edge) return {};
    let point = edge.point;
    if (!event.altKey) {
      const step = editor.viewport.scale >= 160 ? 0.05 : 0.1;
      const dx = edge.b[0] - edge.a[0];
      const dz = edge.b[1] - edge.a[1];
      if (!edge.wall?.bulge) {
        if (Math.abs(dz) < 1e-6) point = [Math.round(point[0] / step) * step, edge.a[1]];
        else if (Math.abs(dx) < 1e-6) point = [edge.a[0], Math.round(point[1] / step) * step];
        else {
          const len = Math.hypot(dx, dz);
          const t = Math.round(distance(edge.a, point) / step) * step;
          point = [edge.a[0] + (dx / len) * t, edge.a[1] + (dz / len) * t];
        }
      }
    }
    return { edge, point };
  }

  onMove(editor, p, event) {
    const found = this.#resolve(editor, p, event);
    this.#hover = found.corner ? { corner: found.corner } : found.edge ? { point: found.point, edge: found.edge } : null;
  }

  onDown(editor, p, event) {
    const found = this.#resolve(editor, p, event);
    if (found.corner) {
      if (!event.shiftKey) {
        editor.notify('Tekan Shift saat klik untuk menghapus titik ini, atau seret dengan alat Pilih.', 'info');
        return true;
      }
      editor.plan.checkpoint();
      const result = editor.plan.removeRoomVertex(editor.floorId, found.corner);
      if (!result.ok) {
        editor.plan.dropCheckpoint();
        editor.notify(result.reason);
      }
      this.#hover = null;
      return true;
    }
    if (!found.point) return true;

    editor.plan.checkpoint();
    const result = editor.plan.addRoomVertex(editor.floorId, found.point);
    if (!result.ok) {
      editor.plan.dropCheckpoint();
      editor.notify(result.reason);
    }
    return true;
  }

  cancel() {
    this.#hover = null;
  }

  draw(ctx, { viewport, COLORS }) {
    if (!this.#hover) return;

    if (this.#hover.corner) {
      const [sx, sy] = viewport.toScreen(this.#hover.corner);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 7, sy - 7, 14, 14);
      label(ctx, 'Shift+klik: hapus titik', sx + 12, sy - 14, '600 10px system-ui', '#f43f5e');
      return;
    }

    const { point, edge } = this.#hover;
    const [sx, sy] = viewport.toScreen(point);
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.stroke();

    const d1 = distance(edge.a, point);
    const d2 = distance(point, edge.b);
    label(ctx, `${d1.toFixed(2)} | ${d2.toFixed(2)} m`, sx + 14, sy - 14, MONO, COLORS.accent);
  }
}
