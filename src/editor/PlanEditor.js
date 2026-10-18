import { Emitter } from '../core/Emitter.js';
import { snapToGrid, samePoint } from '../plan/geometry.js';
import { Viewport } from './Viewport.js';
import { compassBox, drawPlan } from './render.js';
import { decorGroups } from '../plan/decor.js';
import { canPick, vertexAt } from './hit.js';
import { RULER_SIZE } from './rulers.js';
import { freeSpotBeside } from './openingSnap.js';
import { ArcWallTool, CornerTool, OpeningTool, PointTool, RectTool, RoomTool, RulerTool, SelectTool, WallTool } from './tools.js';

const GRID_STEP = 0.1;
const FINE_GRID_STEP = 0.05;
const FINE_GRID_MIN_SCALE = 160;
const MAGNET_PX = 10;
const ZOOM_STEP = 1.0015;
const TOOL_KEYS = {
  v: 'select',
  w: 'wall',
  a: 'arc',
  r: 'room',
  d: 'door',
  n: 'window',
  e: 'niche',
  f: 'vent',
  g: 'door-double',
  t: 'roof',
  k: 'canopy',
  h: 'yard',
  y: 'terrace',
  u: 'stairs',
  c: 'corner-round',
  x: 'corner-chamfer',
  m: 'ruler',
  p: 'vertex',
};
const VIEW_KEYS = { l: 'line' };
const DEFAULT_BOUNDS = { minX: -4, maxX: 4, minZ: -3, maxZ: 3 };
const FIT_PADDING = { left: RULER_SIZE + 60, right: 60, top: RULER_SIZE + 60, bottom: 60 };
const VIEW_PREFS_KEY = 'floor-studio:view';

export class PlanEditor extends Emitter {
  viewport = new Viewport();
  selection = [];
  hover = null;
  showDims = true;
  showGrid = false;
  showRulers = true;
  showCrosshair = true;
  showTechnical = false;
  showRoomColors = true;
  lineMode = false;
  cursor = null;
  active = false;
  options = { cornerSize: 0.5, cornersFollowWalls: false };
  layers = {
    walls: { visible: true, locked: false },
    rooms: { visible: true, locked: false },
    openings: { visible: true, locked: false },
    decor: { visible: true, locked: false },
    furniture: { visible: true, locked: false },
    yards: { visible: true, locked: false },
    roofs: { visible: true, locked: false },
    stairs: { visible: true, locked: false },
  };
  measures = [];
  #measureCounter = 0;
  #cursorName = 'default';
  #compassDrag = false;
  activeCorner = null;
  hoverCorner = null;
  activePin = null;
  guides = [];
  #guideDrag = null;
  #guideCounter = 0;
  clipboard = null;

  #tools = {
    select: new SelectTool(),
    wall: new WallTool(),
    room: new RoomTool(),
    arc: new ArcWallTool(),
    door: new OpeningTool('door'),
    window: new OpeningTool('window'),
    niche: new OpeningTool('niche'),
    vent: new OpeningTool('vent'),
    'door-double': new OpeningTool('door', { width: 1.6, leaves: 2 }, 'door-double'),
    paste: new OpeningTool(),
    roof: new RectTool('roof'),
    canopy: new RectTool('canopy'),
    yard: new RectTool('yard'),
    terrace: new RectTool('terrace'),
    stairs: new RectTool('stairs'),
    'corner-round': new CornerTool('round'),
    'corner-chamfer': new CornerTool('chamfer'),
    ruler: new RulerTool(),
    vertex: new PointTool(),
  };
  #tool = this.#tools.select;
  #pan = null;
  #spaceDown = false;
  #fitted = false;
  #frame = 0;

  constructor({ canvas, plan, getFurniture }) {
    super();
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.plan = plan;
    this.getFurniture = getFurniture;

    canvas.addEventListener('pointerdown', (e) => this.#onDown(e));
    canvas.addEventListener('pointermove', (e) => this.#onMove(e));
    canvas.addEventListener('pointerup', (e) => this.#onUp(e));
    canvas.addEventListener('dblclick', (e) => this.#tool.onDoubleClick?.(this, this.#world(e), e));
    canvas.addEventListener('wheel', (e) => this.#onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.#onKey(e));
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.#spaceDown = false;
    });
    canvas.addEventListener('pointerleave', () => {
      this.cursor = null;
      this.requestRedraw();
    });
    new ResizeObserver(() => this.#resize()).observe(canvas);

    try {
      const prefs = JSON.parse(localStorage.getItem(VIEW_PREFS_KEY) ?? '{}');
      if (typeof prefs.showGrid === 'boolean') this.showGrid = prefs.showGrid;
      if (typeof prefs.showRulers === 'boolean') this.showRulers = prefs.showRulers;
      if (typeof prefs.lineMode === 'boolean') this.lineMode = prefs.lineMode;
      if (typeof prefs.showCrosshair === 'boolean') this.showCrosshair = prefs.showCrosshair;
      if (typeof prefs.showTechnical === 'boolean') this.showTechnical = prefs.showTechnical;
      if (typeof prefs.showRoomColors === 'boolean') this.showRoomColors = prefs.showRoomColors;
      Object.keys(this.layers).forEach((name) => {
        const saved = prefs.layers?.[name];
        if (saved) this.layers[name] = { visible: saved.visible !== false, locked: Boolean(saved.locked) };
      });
      if (typeof prefs.cornersFollowWalls === 'boolean') this.options.cornersFollowWalls = prefs.cornersFollowWalls;
      if (Array.isArray(prefs.guides)) {
        this.guides = prefs.guides
          .filter((g) => (g.axis === 'x' || g.axis === 'z') && Number.isFinite(g.value))
          .map((g, i) => ({ id: i + 1, axis: g.axis, value: g.value }));
        this.#guideCounter = this.guides.length;
      }
    } catch {
    }

    plan.on('change', () => {
      this.#dropStaleSelection();
      this.requestRedraw();
    });
    plan.on('floor', () => {
      this.select(null);
      this.#tool.cancel?.();
      this.requestRedraw();
    });
  }

  get floor() {
    return this.plan.activeFloor;
  }

  get floorId() {
    return this.plan.activeFloorId;
  }

  get tool() {
    return this.#tool.name;
  }

  activate() {
    this.active = true;
    this.#resize();
    if (!this.#fitted) this.fit();
    this.requestRedraw();
  }

  deactivate() {
    this.active = false;
    this.#tool.cancel?.();
  }

  #selectedOpening() {
    if (this.selection.length !== 1 || this.selection[0].kind !== 'opening') return null;
    return this.floor.openings.find((o) => o.id === this.selection[0].id) ?? null;
  }

  copySelection() {
    const o = this.#selectedOpening();
    if (!o) return false;
    this.clipboard = { type: o.type, width: o.width, height: o.height, sill: o.sill };
    if (o.type === 'door') Object.assign(this.clipboard, { swing: o.swing, hinge: o.hinge, leaves: o.leaves });
    if (o.vent) Object.assign(this.clipboard, { vent: true, ventHeight: o.ventHeight });
    if (o.type === 'niche') {
      this.clipboard.depth = o.depth;
      this.clipboard.side = o.side;
    }
    this.notify(`Disalin: ${o.type} ${o.width.toFixed(2)} m — tempel dengan Ctrl+V atau klik tembok`, 'info');
    return true;
  }

  pasteClipboard() {
    if (!this.clipboard) {
      this.notify('Belum ada yang disalin. Pilih pintu/jendela lalu Ctrl+C.');
      return false;
    }
    this.setTool('paste');
    return true;
  }

  duplicateSelection() {
    const o = this.#selectedOpening();
    if (!o) return false;
    const wall = this.floor.walls.find((w) => w.id === o.wallId);
    const offset = wall && freeSpotBeside(this.floor, wall, o);
    if (offset == null) {
      this.notify('Tidak ada ruang di tembok ini — pakai Ctrl+C lalu tempel di tembok lain.');
      return false;
    }
    this.plan.checkpoint();
    const copy = this.plan.addOpening(this.floorId, {
      wallId: o.wallId,
      type: o.type,
      offset,
      side: o.side,
      props: { width: o.width, height: o.height, sill: o.sill, depth: o.depth, swing: o.swing, hinge: o.hinge, leaves: o.leaves, vent: o.vent, ventHeight: o.ventHeight },
    });
    if (copy) this.select({ kind: 'opening', id: copy.id });
    return Boolean(copy);
  }

  setTool(name) {
    const tool = this.#tools[name];
    if (!tool) return;
    this.#tool.cancel?.();
    this.#tool = tool;
    this.hover = null;
    this.setCursor(name === 'select' ? 'default' : 'crosshair');
    this.emit('tool', name);
    this.emit('hint', tool.hint);
    this.requestRedraw();
  }

  setActivePin(pin) {
    this.activePin = pin;
    this.emit('pin', pin);
    this.requestRedraw();
  }

  select(selection) {
    const next = selection ? (Array.isArray(selection) ? selection : [selection]) : [];
    const key = (list) => list.map((s) => `${s.kind}:${s.id}`).sort().join('|');
    if (key(next) === key(this.selection)) return;

    this.selection = next;
    this.activeCorner = null;
    this.hoverCorner = null;
    this.activePin = null;
    this.emit('selection', next);
    this.requestRedraw();
  }

  isSelected(item) {
    return this.selection.some((s) => s.kind === item.kind && s.id === item.id);
  }

  toggle(item) {
    this.select(
      this.isSelected(item)
        ? this.selection.filter((s) => !(s.kind === item.kind && s.id === item.id))
        : [...this.selection, item],
    );
  }

  selectAll() {
    const { walls, rooms, openings } = this.floor;
    const pick = (layer, items) => (canPick(this.layers, layer) ? items : []);
    this.select([
      ...pick('walls', walls).map((w) => ({ kind: 'wall', id: w.id })),
      ...pick('openings', openings).map((o) => ({ kind: 'opening', id: o.id })),
      ...pick('rooms', rooms).map((r) => ({ kind: 'room', id: r.id })),
      ...pick('decor', decorGroups(this.floor)).map((g) => ({ kind: 'decor', id: g.id })),
    ]);
  }

  deleteSelection() {
    const items = this.selection;
    if (!items.length) return;

    this.plan.checkpoint();
    const remove = {
      wall: 'removeWall',
      room: 'removeRoom',
      opening: 'removeOpening',
      decor: 'removeDecor',
      roof: 'removeRoof',
      yard: 'removeYard',
      stairs: 'removeStairs',
    };
    const order = { wall: 0, opening: 1, room: 2, decor: 3, roof: 4, yard: 5, stairs: 6 };
    [...items]
      .sort((a, b) => order[a.kind] - order[b.kind])
      .forEach(({ kind, id }) => this.plan[remove[kind]](this.floorId, id));
    this.select(null);
  }

  addMeasure(a, b) {
    const measure = { id: ++this.#measureCounter, floorId: this.floorId, a: [a[0], a[1]], b: [b[0], b[1]] };
    this.measures.push(measure);
    this.emit('measures', this.measures);
    this.requestRedraw();
    return measure;
  }

  updateMeasure(id, patch) {
    const measure = this.measures.find((m) => m.id === id);
    if (!measure) return;
    if (patch.a) measure.a = [patch.a[0], patch.a[1]];
    if (patch.b) measure.b = [patch.b[0], patch.b[1]];
    this.emit('measures', this.measures);
    this.requestRedraw();
  }

  removeMeasure(id) {
    this.measures = this.measures.filter((m) => m.id !== id);
    this.emit('measures', this.measures);
    this.requestRedraw();
  }

  clearMeasures() {
    if (!this.measures.length) return;
    this.measures = [];
    this.emit('measures', this.measures);
    this.requestRedraw();
  }

  setActiveCorner(corner) {
    const same = (a, b) => a?.roomId === b?.roomId && a?.index === b?.index;
    if (same(corner, this.activeCorner)) return;
    this.activeCorner = corner;
    this.emit('cornerActive', corner);
    this.requestRedraw();
  }

  setHoverCorner(corner) {
    const same = (a, b) => a?.roomId === b?.roomId && a?.index === b?.index;
    if (same(corner, this.hoverCorner)) return;
    this.hoverCorner = corner;
    this.emit('cornerHover', corner);
    this.requestRedraw();
  }

  setOption(name, value) {
    this.options[name] = value;
    this.emit('options', this.options);
  }

  setShowGrid(value) {
    this.showGrid = value;
    this.#viewChanged();
  }

  setShowRulers(value) {
    this.showRulers = value;
    this.#viewChanged();
  }

  setLayer(name, patch) {
    if (!this.layers[name]) return;
    this.layers[name] = { ...this.layers[name], ...patch };

    const kindLayer = { wall: 'walls', room: 'rooms', opening: 'openings', decor: 'decor' };
    const alive = this.selection.filter((item) => canPick(this.layers, kindLayer[item.kind]));
    if (alive.length !== this.selection.length) this.select(alive);

    this.#viewChanged();
    this.emit('layers', this.layers);
  }

  setShowRoomColors(value) {
    this.showRoomColors = value;
    this.#viewChanged();
  }

  setShowCrosshair(value) {
    this.showCrosshair = value;
    this.#applyCursor();
    this.#viewChanged();
  }

  setShowTechnical(value) {
    this.showTechnical = value;
    this.#viewChanged();
  }

  setLineMode(value) {
    this.lineMode = value;
    this.#viewChanged();
  }

  #viewChanged() {
    this.#savePrefs();
    this.emit('view', { showGrid: this.showGrid, showRulers: this.showRulers, lineMode: this.lineMode, showTechnical: this.showTechnical, showCrosshair: this.showCrosshair });
    this.requestRedraw();
  }

  #savePrefs() {
    try {
      localStorage.setItem(
        VIEW_PREFS_KEY,
        JSON.stringify({
          showGrid: this.showGrid,
          showRulers: this.showRulers,
          lineMode: this.lineMode,
          showRoomColors: this.showRoomColors,
          showTechnical: this.showTechnical,
          showCrosshair: this.showCrosshair,
          layers: this.layers,
          guides: this.guides.map(({ axis, value }) => ({ axis, value })),
          cornersFollowWalls: this.options.cornersFollowWalls,
        }),
      );
    } catch {
    }
  }

  setShowDims(value) {
    this.showDims = value;
    this.requestRedraw();
  }

  fit() {
    this.viewport.fit(this.plan.bounds() ?? DEFAULT_BOUNDS, FIT_PADDING);
    this.#fitted = true;
    this.requestRedraw();
  }

  notify(message, kind = 'error') {
    this.emit('toast', { message, kind });
  }

  tidy() {
    this.plan.checkpoint();
    const rounded = this.plan.tidy();
    const rooms = this.plan.floors.flatMap((floor) => this.plan.fillMissingFloors(floor.id));

    if (!rounded && !rooms.length) this.plan.dropCheckpoint();

    const parts = [];
    if (rooms.length) parts.push(`${rooms.length} lantai baru diisi`);
    if (rounded) parts.push(`${rounded} angka dibulatkan`);
    this.notify(parts.length ? `Dirapikan: ${parts.join(', ')}.` : 'Sudah rapi, tidak ada yang perlu diubah.', 'info');
    return { rounded, rooms };
  }

  setCursor(cursor) {
    this.#cursorName = cursor;
    this.#applyCursor();
  }

  #applyCursor() {
    const hide = this.showCrosshair && ['default', 'crosshair'].includes(this.#cursorName);
    this.canvas.style.cursor = hide ? 'none' : this.#cursorName;
  }

  tol(pixels) {
    return pixels / this.viewport.scale;
  }

  snap(p, { ignore = null, free = false } = {}) {
    if (free) return [p[0], p[1]];

    const corner = vertexAt(this.floor, p, this.tol(MAGNET_PX));
    if (corner && !(ignore && samePoint(corner, ignore))) return corner;
    const step = this.viewport.scale >= FINE_GRID_MIN_SCALE ? FINE_GRID_STEP : GRID_STEP;
    let x = snapToGrid(p[0], step);
    let z = snapToGrid(p[1], step);
    const tol = this.tol(MAGNET_PX);
    this.guides.forEach((g) => {
      if (g.axis === 'x' && Math.abs(p[0] - g.value) <= tol) x = g.value;
      if (g.axis === 'z' && Math.abs(p[1] - g.value) <= tol) z = g.value;
    });
    return [x, z];
  }

  requestRedraw() {
    if (this.#frame || !this.active) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#draw();
    });
  }

  #world(event) {
    const rect = this.canvas.getBoundingClientRect();
    return this.viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top);
  }

  #northFrom(event, alt) {
    const rect = this.canvas.getBoundingClientRect();
    const { cx, cy } = compassBox(this.viewport);
    const deg = (Math.atan2(event.clientX - rect.left - cx, -(event.clientY - rect.top - cy)) * 180) / Math.PI;
    return alt ? deg : Math.round(deg / 5) * 5;
  }

  #onDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    const wantsPan = event.button === 1 || event.button === 2 || this.#spaceDown;

    if (event.button === 0 && !wantsPan) {
      const rect = this.canvas.getBoundingClientRect();
      const { cx, cy, r } = compassBox(this.viewport);
      if (Math.hypot(event.clientX - rect.left - cx, event.clientY - rect.top - cy) <= r + 14) {
        this.plan.checkpoint();
        this.#compassDrag = true;
        this.plan.setNorth(this.#northFrom(event, event.altKey));
        return;
      }
    }

    if (this.showRulers && !wantsPan) {
      const rect = this.canvas.getBoundingClientRect();
      const lx = event.clientX - rect.left;
      const ly = event.clientY - rect.top;
      if (event.button === 0 && ly < RULER_SIZE && lx >= RULER_SIZE) {
        this.#startGuide('z', this.viewport.toWorld(lx, Math.max(ly, RULER_SIZE))[1]);
        return;
      }
      if (event.button === 0 && lx < RULER_SIZE && ly >= RULER_SIZE) {
        this.#startGuide('x', this.viewport.toWorld(Math.max(lx, RULER_SIZE), ly)[0]);
        return;
      }
      if (lx < RULER_SIZE || ly < RULER_SIZE) return;
    }

    if (!wantsPan && event.button === 0 && this.#tool.name === 'select') {
      const p = this.#world(event);
      const tol = this.tol(5);
      const hit = this.guides.find((g) => Math.abs((g.axis === 'x' ? p[0] : p[1]) - g.value) <= tol);
      if (hit && !event.shiftKey) {
        this.#guideDrag = hit;
        this.setCursor(hit.axis === 'x' ? 'ew-resize' : 'ns-resize');
        return;
      }
    }

    if (!wantsPan && event.button === 0) {
      const consumed = this.#tool.onDown?.(this, this.#world(event), event);
      if (consumed) {
        this.requestRedraw();
        return;
      }
    }
    this.#pan = { x: event.clientX, y: event.clientY };
    this.setCursor('grabbing');
  }

  #startGuide(axis, value) {
    const guide = { id: ++this.#guideCounter, axis, value };
    this.guides.push(guide);
    this.#guideDrag = guide;
    this.setCursor(axis === 'x' ? 'ew-resize' : 'ns-resize');
    this.requestRedraw();
  }

  clearGuides() {
    this.guides = [];
    this.#viewChanged();
  }

  #onMove(event) {
    if (this.#compassDrag) {
      this.plan.setNorth(this.#northFrom(event, event.altKey));
      return;
    }
    if (this.#guideDrag) {
      const p = this.#world(event);
      const g = this.#guideDrag;
      const raw = g.axis === 'x' ? p[0] : p[1];
      g.value = event.altKey ? raw : Math.round(raw / 0.05) * 0.05;
      this.cursor = p;
      this.emit('cursor', p);
      this.requestRedraw();
      return;
    }
    if (this.#pan) {
      this.viewport.panBy(event.clientX - this.#pan.x, event.clientY - this.#pan.y);
      this.#pan = { x: event.clientX, y: event.clientY };
    } else {
      this.#tool.onMove?.(this, this.#world(event), event);
    }
    this.cursor = this.#world(event);
    this.emit('cursor', this.cursor);
    this.requestRedraw();
  }

  #onUp(event) {
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.#compassDrag) {
      this.#compassDrag = false;
      return;
    }
    if (this.#guideDrag) {
      const rect = this.canvas.getBoundingClientRect();
      const lx = event.clientX - rect.left;
      const ly = event.clientY - rect.top;
      const drop =
        (this.#guideDrag.axis === 'z' && ly < RULER_SIZE) || (this.#guideDrag.axis === 'x' && lx < RULER_SIZE);
      if (drop || lx < 0 || ly < 0 || lx > rect.width || ly > rect.height) {
        this.guides = this.guides.filter((g) => g !== this.#guideDrag);
      }
      this.#guideDrag = null;
      this.setCursor('default');
      this.#viewChanged();
      return;
    }
    if (this.#pan) {
      this.#pan = null;
      this.setCursor(this.#tool.name === 'select' ? 'default' : 'crosshair');
    } else {
      this.#tool.onUp?.(this, this.#world(event), event);
    }
    this.requestRedraw();
  }

  #onWheel(event) {
    event.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    this.viewport.zoomAt(event.clientX - rect.left, event.clientY - rect.top, ZOOM_STEP ** -event.deltaY);
    this.requestRedraw();
  }

  #onKey(event) {
    if (!this.active) return;
    const target = event.target;
    if (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

    if (event.code === 'Space') {
      this.#spaceDown = true;
      event.preventDefault();
      return;
    }

    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.plan.redo();
      else this.plan.undo();
      return;
    }
    if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.plan.redo();
      return;
    }
    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectAll();
      return;
    }
    if (mod && event.key.toLowerCase() === 'c' && this.copySelection()) {
      event.preventDefault();
      return;
    }
    if (mod && event.key.toLowerCase() === 'v' && this.clipboard) {
      event.preventDefault();
      this.pasteClipboard();
      return;
    }
    if (mod && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (mod) return;

    if (this.#tool.onKey?.(this, event)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Escape') {
      this.select(null);
      this.setTool('select');
      return;
    }
    if (VIEW_KEYS[event.key.toLowerCase()] === 'line') {
      this.setLineMode(!this.lineMode);
      return;
    }
    const tool = TOOL_KEYS[event.key.toLowerCase()];
    if (tool) this.setTool(tool);
  }

  #dropStaleSelection() {
    const lists = {
      wall: this.floor.walls,
      room: this.floor.rooms,
      opening: this.floor.openings,
      decor: decorGroups(this.floor),
      roof: this.floor.roofs,
      yard: this.floor.yards,
      stairs: this.floor.stairs,
    };
    const alive = this.selection.filter(({ kind, id }) => lists[kind].some((item) => item.id === id));
    if (alive.length !== this.selection.length) this.select(alive);
  }

  #resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth, clientHeight } = this.canvas;
    if (!clientWidth || !clientHeight) return;

    this.canvas.width = Math.round(clientWidth * dpr);
    this.canvas.height = Math.round(clientHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.viewport.resize(clientWidth, clientHeight);
    this.requestRedraw();
  }

  #draw() {
    const { plan } = this;
    const floor = this.floor;
    const below = plan.floors.filter((f) => f.level < floor.level).sort((a, b) => b.level - a.level)[0] ?? null;

    drawPlan(this.ctx, {
      viewport: this.viewport,
      plan,
      floor,
      below,
      furniture: this.getFurniture(floor.id),
      selection: this.selection,
      hover: this.hover,
      showDims: this.showDims,
      showGrid: this.showGrid,
      showRulers: this.showRulers,
      lineMode: this.lineMode,
      roomColors: this.showRoomColors,
      technical: this.showTechnical,
      crosshair: this.showCrosshair,
      pin: this.activePin,
      layers: this.layers,
      cursor: this.cursor,
      corner: { active: this.activeCorner, hover: this.hoverCorner },
      measures: this.measures.filter((m) => m.floorId === floor.id),
      guides: this.guides,
      tool: this.#tool,
    });
  }
}
