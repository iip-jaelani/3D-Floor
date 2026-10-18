import { FLOOR_OPTIONS } from '../config.js';
import { decorGroups } from '../plan/decor.js';
import { roofRise } from '../scene/outdoor.js';
import { WALL_TEXTURES } from '../scene/proceduralMaterials.js';
import { ROOF_MATERIALS, ROOF_TYPES, SLAB_THICKNESS, WALL_PRESETS, YARD_GROUNDS, YARD_PLANTS } from '../plan/Plan.js';
import { cornerColor, roomColor } from '../editor/render.js';
import { arcOf, normalOnWall, pointOnWall, polygonArea, sagittaForRadius, wallChord, wallLength } from '../plan/geometry.js';
import { stairMetrics } from '../plan/stairs.js';
import { byId } from './dom.js';

const TITLES = { wall: 'Dinding', room: 'Ruangan', opening: 'Pintu / Jendela / Cekungan', decor: 'Dekor', roof: 'Atap / Kanopi', yard: 'Halaman / Taman', stairs: 'Tangga' };

const ANCHORS = [
  ['a', 'Titik A (awal)'],
  ['b', 'Titik B (akhir)'],
  ['center', 'Tengah'],
];

export class PlanInspector {
  #anchor = 'a';
  #offsetGap = 0.5;

  constructor({ editor, plan }) {
    this.editor = editor;
    this.plan = plan;
    this.el = byId('plan-inspector');

    editor.on('selection', () => this.render());
    editor.on('tool', () => this.render());
    editor.on('measures', () => this.render());
    editor.on('cornerActive', () => {
      if (!this.el.contains(document.activeElement)) this.render();
    });
    editor.on('cornerHover', (hover) => {
      this.el.querySelectorAll('[data-corner]').forEach((row) => {
        row.classList.toggle('corner-row-hover', hover && Number(row.dataset.corner) === hover.index);
      });
    });
    plan.on('change', () => {
      if (!this.el.contains(document.activeElement)) this.render();
    });
    plan.on('floor', () => this.render());
    this.render();
  }

  render() {
    const { selection: items } = this.editor;
    const floor = this.plan.activeFloor;
    this.el.replaceChildren();

    const tool = this.editor.tool;
    if (tool === 'corner-round' || tool === 'corner-chamfer') return this.#cornerOptions(tool === 'corner-round');

    if (tool === 'ruler') return this.#ruler();

    if (items.length === 0) return this.#overview(floor);
    if (items.length > 1) return this.#multiple(items);

    const selection = items[0];

    const target = {
      wall: floor.walls,
      room: floor.rooms,
      opening: floor.openings,
      decor: decorGroups(floor),
      roof: floor.roofs,
      yard: floor.yards,
      stairs: floor.stairs,
    }[selection.kind]?.find((item) => item.id === selection.id);
    if (!target) return this.#overview(floor);

    this.#header(selection.kind === 'decor' ? target.label : TITLES[selection.kind]);
    if (selection.kind === 'decor') this.#decor(target);
    if (selection.kind === 'wall') this.#wall(target);
    if (selection.kind === 'room') this.#room(target);
    if (selection.kind === 'opening') this.#opening(target);
    if (selection.kind === 'roof') this.#roof(target);
    if (selection.kind === 'yard') this.#yard(target);
    if (selection.kind === 'stairs') this.#stairs(target);
    this.#copyToFloor(items);
    this.#deleteButton();
  }

  #overview(floor) {
    this.#header(floor.name, 'Lantai aktif');

    const area = floor.rooms.reduce((sum, room) => sum + polygonArea(room.polygon), 0);
    this.#row('Ruangan', `${floor.rooms.length}`);
    this.#row('Dinding', `${floor.walls.length}`);
    this.#row('Pintu & jendela', `${floor.openings.length}`);
    this.#row('Total luas', `${area.toFixed(1)} m²`);
    if (floor.stairs.length) this.#row('Tangga', `${floor.stairs.length}`);
    if (floor.roofs.length || floor.yards.length) {
      this.#row('Atap & kanopi', `${floor.roofs.length}`);
      this.#row('Halaman', `${floor.yards.length}`);
    }
    this.#button('Atap mengikuti denah (selubung)', 'fa-solid fa-house-chimney', () => {
      if (!floor.rooms.length && !floor.walls.length) return this.editor.notify('Gambar ruangan atau tembok dulu sebelum membuat atap.');
      this.plan.checkpoint();
      const roof = this.plan.roofForFloor(floor.id, { type: 'hip' });
      if (roof) this.editor.select({ kind: 'roof', id: roof.id });
    });
    if (floor.rooms.length) {
      this.#button('Atap per ruangan (tinggi sesuai lantai)', 'fa-solid fa-layer-group', () => {
        this.plan.checkpoint();
        floor.rooms.forEach((room) => this.plan.roofForRoom(floor.id, room.id));
      });
    }

    this.#field('Nama lantai', this.#text(floor.name, (value) => this.plan.renameFloor(floor.id, value)));
    this.#field(
      'Arah utara (°, searah jarum jam dari atas; juga bisa memutar kompas di denah)',
      this.#number(this.plan.north ?? 0, { min: 0, max: 359, step: 5 }, (value) => this.plan.setNorth(value)),
    );
    this.#field(
      'Tinggi dinding (m, semua lantai)',
      this.#number(this.plan.wallHeight, { min: 2, max: 5, step: 0.1 }, (value) => this.plan.setWallHeight(value)),
    );

    this.#button('Gandakan lantai ini (jadi lantai baru di atas)', 'fa-regular fa-clone', () => {
      this.plan.checkpoint();
      const copy = this.plan.duplicateFloor(floor.id);
      if (copy) this.plan.setActiveFloor(copy.id);
    });
    this.#lot();

    const hint = document.createElement('p');
    hint.className = 'text-slate-400 leading-relaxed pt-3 mt-3 border-t border-white/10';
    hint.textContent = 'Pilih tool Ruangan untuk menggambar ruangan, lalu Pintu/Jendela untuk menaruhnya di tembok.';
    this.el.appendChild(hint);
  }

  #copyToFloor(items) {
    const others = this.plan.floors.filter((f) => f.id !== this.plan.activeFloorId);
    const copyable = items.filter((i) => ['wall', 'room', 'opening', 'roof', 'yard', 'stairs'].includes(i.kind));
    if (!others.length || !copyable.length) return;
    this.#section('Salin ke lantai lain');
    const select = this.#select(
      [['', 'Pilih lantai tujuan…'], ...others.map((f) => [f.id, f.name])],
      '',
      (target) => {
        if (!target) return;
        this.plan.checkpoint();
        const n = this.plan.copyItems(this.plan.activeFloorId, copyable, target);
        this.editor.notify(n ? `${n} elemen disalin ke ${this.plan.floor(target).name}.` : 'Tidak ada yang tersalin.', n ? 'info' : 'error');
      },
    );
    this.el.appendChild(select);
  }

  #lot() {
    this.#section('Batas tanah & sempadan');
    const lot = this.plan.lot;
    if (!lot) {
      this.#button('Buat batas tanah', 'fa-regular fa-square', () => {
        const b = this.plan.bounds() ?? { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
        this.plan.checkpoint();
        this.plan.setLot({ minX: b.minX - 4, maxX: b.maxX + 4, minZ: b.minZ - 3, maxZ: b.maxZ + 3 });
      });
      return;
    }
    const apply = (patch) => this.plan.setLot(patch);
    [
      ['X kiri (m)', 'minX'],
      ['X kanan (m)', 'maxX'],
      ['Z atas (m)', 'minZ'],
      ['Z bawah (m)', 'maxZ'],
    ].forEach(([title, key]) =>
      this.#field(title, this.#number(lot[key], { min: -500, max: 500, step: 0.1 }, (v) => apply({ [key]: v }))),
    );
    this.#field(
      'Sisi depan',
      this.#select(
        [['minX', 'Kiri (X min)'], ['maxX', 'Kanan (X maks)'], ['minZ', 'Atas (Z min)'], ['maxZ', 'Bawah (Z maks)']],
        lot.front,
        (v) => {
          this.plan.checkpoint();
          apply({ front: v });
        },
      ),
    );
    this.#field('Sempadan depan (m)', this.#number(lot.setbackFront, { min: 0, max: 30, step: 0.5 }, (v) => apply({ setbackFront: v })));
    this.#field('Sempadan samping (m)', this.#number(lot.setbackSide, { min: 0, max: 30, step: 0.5 }, (v) => apply({ setbackSide: v })));
    this.#field('Sempadan belakang (m)', this.#number(lot.setbackRear, { min: 0, max: 30, step: 0.5 }, (v) => apply({ setbackRear: v })));
    this.#field('KDB maksimum (%)', this.#number(lot.kdbMax, { min: 1, max: 100, step: 5 }, (v) => apply({ kdbMax: v })));

    const r = this.plan.lotReport();
    this.#row('Luas tanah', `${r.area.toFixed(0)} m²`);
    this.#row('Tapak bangunan', `${r.footprint.toFixed(1)} m²`);
    this.#row('KDB', `${r.kdb.toFixed(1)}% ${r.kdbOk ? '✓' : '✗ melebihi'}`);
    this.#row('KLB', r.klb.toFixed(2));
    const status = document.createElement('p');
    status.className = `text-[11px] leading-relaxed mt-1 ${r.outside.length ? 'text-rose-300' : 'text-emerald-300'}`;
    status.textContent = r.outside.length
      ? `Melewati sempadan: ${r.outside.join(', ')}`
      : 'Semua ruangan di dalam garis sempadan.';
    this.el.appendChild(status);
    this.#button('Hapus batas tanah', 'fa-regular fa-trash-can', () => {
      this.plan.checkpoint();
      this.plan.setLot(null);
    });
  }

  #ruler() {
    this.#header('Meteran', 'Alat aktif');
    const measures = this.editor.measures.filter((m) => m.floorId === this.plan.activeFloorId);

    if (!measures.length) {
      const hint = document.createElement('p');
      hint.className = 'text-slate-400 leading-relaxed';
      hint.textContent =
        'Klik dua titik untuk mengukur jarak. Penanda menangkap sudut (kotak) dan tengah tembok (segitiga). Seret garis ukur untuk menggeser, atau seret ujungnya untuk mengubah. Hasil ukur bersifat sementara dan tidak ikut tersimpan.';
      this.el.appendChild(hint);
      return;
    }

    measures.forEach((m, index) => {
      const dx = Math.abs(m.b[0] - m.a[0]);
      const dz = Math.abs(m.b[1] - m.a[1]);
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10';
      row.innerHTML = '<div class="font-mono"><div class="text-pink-300 text-sm"></div><div class="text-[10px] text-slate-400"></div></div>';
      row.querySelector('.text-pink-300').textContent = `#${index + 1}  ${Math.hypot(dx, dz).toFixed(3)} m`;
      row.querySelector('.text-slate-400').textContent = `Δx ${dx.toFixed(2)} · Δz ${dz.toFixed(2)}`;
      const length = Math.hypot(dx, dz);
      const input = document.createElement('input');
      input.className = 'field-input w-20 text-right font-mono';
      input.type = 'number';
      input.step = '0.01';
      input.min = '0.01';
      input.title = 'Ketik panjang tepat (titik B bergeser searah)';
      input.value = length.toFixed(3);
      input.addEventListener('focus', () => input.select());
      input.addEventListener('change', () => {
        const target = parseFloat(input.value);
        if (!(target > 0) || length < 1e-9) return this.render();
        const f = target / Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
        this.editor.updateMeasure(m.id, { b: [m.a[0] + (m.b[0] - m.a[0]) * f, m.a[1] + (m.b[1] - m.a[1]) * f] });
      });
      row.insertBefore(input, row.firstChild.nextSibling);

      const remove = document.createElement('button');
      remove.className = 'text-slate-400 hover:text-rose-300 p-1';
      remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      remove.title = 'Hapus ukuran ini';
      remove.addEventListener('click', () => this.editor.removeMeasure(m.id));
      row.appendChild(remove);
      this.el.appendChild(row);
    });

    this.#button('Hapus semua ukuran', 'fa-regular fa-trash-can', () => this.editor.clearMeasures());
  }

  #cornerOptions(round) {
    this.#header(round ? 'Sudut Bundar' : 'Sudut Pahat', 'Alat aktif');
    this.#field(
      round ? 'Radius sudut (m)' : 'Jarak potong (m)',
      this.#number(this.editor.options.cornerSize, { min: 0.05, max: 5, step: 0.05 }, (value) =>
        this.editor.setOption('cornerSize', value),
      ),
    );

    const presets = document.createElement('div');
    presets.className = 'flex gap-1.5 mb-3 flex-wrap';
    [0.2, 0.3, 0.5, 0.75, 1, 1.5].forEach((value) => {
      const button = document.createElement('button');
      button.className = 'tag-btn';
      button.textContent = `${value} m`;
      button.addEventListener('click', () => {
        this.editor.setOption('cornerSize', value);
        this.render();
      });
      presets.appendChild(button);
    });
    this.el.appendChild(presets);

    const hint = document.createElement('p');
    hint.className = 'text-slate-400 leading-relaxed';
    hint.textContent =
      'Klik sudut pertemuan dua tembok. Tembok dipendekkan otomatis dan lantai ruangan ikut mengikuti bentuk baru. Ctrl+Z membatalkan.';
    this.el.appendChild(hint);
  }

  #multiple(items) {
    this.#header(`${items.length} objek terpilih`, 'Seleksi jamak');

    const count = (kind) => items.filter((i) => i.kind === kind).length;
    this.#row('Dinding', `${count('wall')}`);
    this.#row('Ruangan', `${count('room')}`);
    this.#row('Pintu & jendela', `${count('opening')}`);
    this.#row('Gorden & karpet', `${count('decor')}`);

    const ids = items.filter((i) => i.kind === 'opening').map((i) => i.id);
    const openings = this.plan.floor(this.plan.activeFloorId).openings.filter((o) => ids.includes(o.id));
    if (ids.length >= 2 && ids.length === items.length && openings.every((o) => o.wallId === openings[0].wallId)) {
      const run = (label, fn) => () => {
        this.plan.checkpoint();
        if (!fn()) this.editor.notify(`${label}: tidak muat atau menabrak bukaan lain.`);
      };
      this.#section('Ratakan jarak');
      this.#button(
        'Jarak kiri = antar = kanan',
        'fa-solid fa-arrows-left-right-to-line',
        run('Ratakan', () => this.plan.distributeOpenings(this.plan.activeFloorId, ids, 'even')),
      );
      this.#button(
        'Tengahkan grup (jarak antar tetap)',
        'fa-solid fa-align-center',
        run('Tengahkan', () => this.plan.distributeOpenings(this.plan.activeFloorId, ids, 'center')),
      );
    }

    const hint = document.createElement('p');
    hint.className = 'text-slate-400 leading-relaxed mt-3';
    hint.textContent = 'Shift+klik untuk menambah/mengeluarkan, Esc untuk membatalkan pilihan. Bukaan terpilih bisa diseret bersama.';
    this.el.appendChild(hint);

    this.#copyToFloor(items);
    this.#deleteButton(`Hapus ${items.length} objek`);
  }

  #decor(group) {
    const count = (type) => group.pieces.filter((p) => p.type === type).length;

    if (group.kind === 'rug') {
      const [w, , d] = group.pieces[0].entry.size;
      this.#row('Ukuran', `${w.toFixed(1)} × ${d.toFixed(1)} m`);
    } else {
      this.#row('Panel gorden', `${count('curtain')}`);
      this.#row('Rel', `${count('rod')}`);
    }

    const hint = document.createElement('p');
    hint.className = 'text-slate-400 leading-relaxed mt-1';
    hint.textContent =
      group.kind === 'curtain'
        ? 'Satu set gorden (panel, sheer, dan rel) dihapus bersama.'
        : 'Karpet bisa dihapus dari denah.';
    this.el.appendChild(hint);
  }

  #wall(wall) {
    const id = this.plan.activeFloorId;
    const arc = arcOf(wall);
    const chord = wallChord(wall);
    const apply = (patch) => this.plan.updateWall(id, wall.id, patch);

    const preset = document.createElement('select');
    preset.className = 'field-input';
    preset.add(new Option('Kustom', '', false, true));
    Object.entries(WALL_PRESETS).forEach(([key, value]) => preset.add(new Option(value.label, key)));
    preset.addEventListener('change', () => {
      if (!preset.value) return;
      this.plan.checkpoint();
      this.plan.applyWallPreset(id, wall.id, preset.value);
    });
    this.#field('Jenis tembok', preset);

    this.#section('Ukuran');
    this.#field(
      arc ? 'Panjang busur (m)' : 'Panjang (m)',
      this.#number(wallLength(wall), { min: 0.1, max: 100, step: 0.01 }, (value) => {
        const result = this.plan.setWallLength(id, wall.id, value, this.#anchor);
        if (result?.removedOpenings) {
          this.editor.notify(`${result.removedOpenings} pintu/jendela dihapus karena tidak muat lagi.`);
        }
      }),
    );

    const anchor = document.createElement('select');
    anchor.className = 'field-input';
    ANCHORS.forEach(([key, label]) => anchor.add(new Option(label, key, false, key === this.#anchor)));
    anchor.addEventListener('change', () => (this.#anchor = anchor.value));
    this.#field('Titik yang dipertahankan', anchor);

    const angle = (Math.atan2(-(wall.b[1] - wall.a[1]), wall.b[0] - wall.a[0]) * 180) / Math.PI;
    this.#field(
      'Sudut (°, titik A tetap)',
      this.#number(((angle % 360) + 360) % 360, { min: 0, max: 360, step: 0.5 }, (value) =>
        this.plan.setWallAngle(id, wall.id, value),
      ),
    );

    this.#section('Lengkung');
    const limit = Number((chord / 2).toFixed(3));
    this.#field(
      'Lengkung / anak panah (m, − = sisi lain)',
      this.#number(arc ? arc.sagitta : 0, { min: -limit, max: limit, step: 0.05 }, (value) =>
        this.plan.setWallBulge(id, wall.id, value),
      ),
    );
    if (arc) {
      this.#field(
        'Radius (m)',
        this.#number(arc.radius, { min: Number((chord / 2).toFixed(3)), max: 500, step: 0.05 }, (value) => {
          const sag = sagittaForRadius(chord, value);
          if (sag !== null) this.plan.setWallBulge(id, wall.id, Math.sign(arc.sagitta) * sag);
        }),
      );
      this.#row('Sudut busur', `${((arc.angle * 180) / Math.PI).toFixed(1)}°`);
      this.#button('Luruskan', 'fa-solid fa-ruler-horizontal', () => {
        this.plan.checkpoint();
        this.plan.setWallBulge(id, wall.id, 0);
      });
    }

    this.#section('Penampilan');
    this.#field(
      'Tebal (m)',
      this.#number(wall.thickness ?? this.plan.wallThickness, { min: 0.05, max: 0.5, step: 0.01 }, (value) =>
        apply({ thickness: value }),
      ),
    );
    this.#field(
      `Tinggi (m)${wall.height ? '' : ' — ikut tinggi lantai'}`,
      this.#number(wall.height ?? this.plan.wallHeight, { min: 0.3, max: 6, step: 0.05 }, (value) =>
        apply({ height: value }),
      ),
    );
    if (wall.height) {
      this.#button('Ikuti tinggi lantai', 'fa-solid fa-up-down', () => {
        this.plan.checkpoint();
        apply({ height: null });
      });
    }

    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'field-input h-8 p-0.5 cursor-pointer';
    color.value = wall.color ?? this.plan.wallColor;
    color.addEventListener('change', () => {
      this.plan.checkpoint();
      apply({ color: color.value });
    });
    this.#field(`Warna${wall.color ? '' : ' — ikut warna rumah'}`, color);
    this.#field(
      'Tekstur permukaan',
      this.#select(WALL_TEXTURES, wall.texture ?? '', (v) => {
        this.plan.checkpoint();
        this.plan.updateWall(id, wall.id, { texture: v || null });
      }),
    );
    if (wall.texture) {
      this.#button('Terapkan tekstur ke semua tembok lantai ini', 'fa-solid fa-fill-drip', () => {
        this.plan.checkpoint();
        this.plan.activeFloor.walls.forEach((w) => this.plan.updateWall(id, w.id, { texture: wall.texture }));
      });
    }
    if (wall.color) {
      this.#button('Ikuti warna rumah', 'fa-solid fa-fill-drip', () => {
        this.plan.checkpoint();
        apply({ color: null });
      });
    }

    this.#section('Operasi');
    this.#button('Bagi di tengah', 'fa-solid fa-scissors', () => {
      this.plan.checkpoint();
      const result = this.plan.splitWall(id, wall.id, wallLength(wall) / 2);
      if (!result) {
        this.plan.dropCheckpoint();
        this.editor.notify('Tembok terlalu pendek untuk dibagi.');
      } else if (result.removedOpenings) {
        this.editor.notify(`${result.removedOpenings} pintu/jendela di titik potong dihapus.`);
      }
    });

    const gap = document.createElement('input');
    gap.className = 'field-input';
    gap.type = 'number';
    gap.step = '0.05';
    gap.value = String(this.#offsetGap);
    gap.addEventListener('change', () => {
      const parsed = parseFloat(gap.value);
      if (Number.isFinite(parsed) && Math.abs(parsed) >= 0.01) this.#offsetGap = parsed;
    });
    this.#field('Jarak salinan sejajar (m, − = sisi lain)', gap);
    this.#button('Salin sejajar', 'fa-regular fa-clone', () => {
      this.plan.checkpoint();
      const copy = this.plan.offsetWall(id, wall.id, this.#offsetGap);
      if (copy) this.editor.select({ kind: 'wall', id: copy.id });
      else {
        this.plan.dropCheckpoint();
        this.editor.notify('Salinan sejajar tidak valid (radius jadi terlalu kecil).');
      }
    });
  }

  #room(room) {
    this.#button('Buat atap untuk ruangan ini', 'fa-solid fa-house-chimney', () => {
      this.plan.checkpoint();
      const roof = this.plan.roofForRoom(this.plan.activeFloorId, room.id);
      if (roof) this.editor.select({ kind: 'roof', id: roof.id });
    });
    this.#row('Luas', `${polygonArea(room.polygon).toFixed(2)} m²`);
    this.#field('Nama', this.#text(room.name, (value) => this.plan.updateRoom(this.plan.activeFloorId, room.id, { name: value })));

    this.#field(
      'Tinggi lantai (cm, dari lantai dasar)',
      this.#number((room.elevation ?? 0) * 100, { min: 0, max: 150, step: 1 }, (cm) =>
        this.plan.updateRoom(this.plan.activeFloorId, room.id, { elevation: cm / 100 }),
      ),
    );

    const select = document.createElement('select');
    select.className = 'field-input';
    FLOOR_OPTIONS.forEach(({ id, label }) => select.add(new Option(label, id, false, id === room.floor)));
    select.addEventListener('change', () => {
      this.plan.checkpoint();
      this.plan.updateRoom(this.plan.activeFloorId, room.id, { floor: select.value });
    });
    this.#field('Material lantai', select);

    const index = this.plan.activeFloor.rooms.findIndex((r) => r.id === room.id);
    const color = document.createElement('input');
    color.type = 'color';
    color.className = 'field-input h-8 p-0.5 cursor-pointer';
    color.value = roomColor(room, index);
    color.addEventListener('change', () => {
      this.plan.checkpoint();
      this.plan.updateRoom(this.plan.activeFloorId, room.id, { color: color.value });
    });
    this.#field(`Warna sorotan${room.color ? '' : ' — otomatis'}`, color);
    if (room.color) {
      this.#button('Warna otomatis', 'fa-solid fa-wand-magic-sparkles', () => {
        this.plan.checkpoint();
        this.plan.updateRoom(this.plan.activeFloorId, room.id, { color: null });
      });
    }

    this.#corners(room);
  }

  #corners(room) {
    const id = this.plan.activeFloorId;
    const corners = room.corners ?? room.polygon;
    this.#section(`Titik sudut (${corners.length})`);

    const follow = this.editor.options.cornersFollowWalls;
    const toggle = document.createElement('label');
    toggle.className = 'flex items-start gap-2 mb-3 text-[11px] text-slate-300 cursor-pointer';
    toggle.innerHTML = '<input type="checkbox" class="mt-0.5 accent-sky-400" /><span></span>';
    const box = toggle.querySelector('input');
    box.checked = follow;
    toggle.querySelector('span').textContent = follow
      ? 'Titik ikut tembok: tembok ikut bergeser, terbagi, dan menyatu.'
      : 'Titik hanya mengubah lantai ruangan; tembok tidak tersentuh. Centang agar tembok ikut.';
    box.addEventListener('change', () => {
      this.editor.setOption('cornersFollowWalls', box.checked);
      this.editor.setLayer('rooms', {});
      this.render();
    });
    this.el.appendChild(toggle);

    const fieldClass = 'field-input font-mono text-right';
    corners.forEach((corner, index) => {
      const row = document.createElement('div');
      const isActive = this.editor.activeCorner?.roomId === room.id && this.editor.activeCorner.index === index;
      row.className = `corner-row flex items-center gap-1.5 mb-1.5 ${isActive ? 'corner-row-active' : ''}`;
      row.dataset.corner = String(index);
      row.addEventListener('mouseenter', () => this.editor.setHoverCorner({ roomId: room.id, index }));
      row.addEventListener('mouseleave', () => this.editor.setHoverCorner(null));

      const badge = document.createElement('button');
      badge.className = 'w-6 h-6 shrink-0 rounded-full text-[11px] font-bold text-slate-900 flex items-center justify-center';
      badge.style.background = cornerColor(index);
      badge.title = `Titik ${index + 1} — klik untuk memilih`;
      badge.textContent = String(index + 1);
      badge.addEventListener('click', () => this.editor.setActiveCorner({ roomId: room.id, index }));

      const axis = (value, which) => {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.className = fieldClass;
        input.title = which === 0 ? 'X (m)' : 'Z (m)';
        input.value = Number(value.toFixed(3));
        input.addEventListener('focus', () => input.select());
        input.addEventListener('change', () => {
          const parsed = parseFloat(input.value);
          if (!Number.isFinite(parsed)) return this.render();
          this.plan.checkpoint();
          const target = [...corner];
          target[which] = parsed;
          if (follow) this.plan.moveVertex(id, corner, target);
          else this.plan.moveRoomCorner(id, room.id, index, target);
        });
        return input;
      };

      const button = (icon, title, onClick, danger = false) => {
        const b = document.createElement('button');
        b.className = `shrink-0 w-6 h-7 flex items-center justify-center text-[11px] ${
          danger ? 'text-rose-300 hover:bg-rose-500/20' : 'text-slate-300 hover:bg-white/10'
        }`;
        b.title = title;
        b.innerHTML = `<i class="${icon}"></i>`;
        b.addEventListener('click', onClick);
        return b;
      };

      const next = corners[(index + 1) % corners.length];
      const add = button('fa-solid fa-plus', `Tambah titik di tengah sisi ${index + 1}→${((index + 1) % corners.length) + 1}`, () => {
        this.plan.checkpoint();
        const result = this.plan.addRoomVertex(id, [(corner[0] + next[0]) / 2, (corner[1] + next[1]) / 2], { walls: follow });
        if (!result.ok) {
          this.plan.dropCheckpoint();
          this.editor.notify(result.reason);
        }
      });
      const remove = button(
        'fa-solid fa-xmark',
        `Hapus titik ${index + 1}`,
        () => {
          this.plan.checkpoint();
          const result = this.plan.removeRoomVertex(id, corner, { walls: follow });
          if (!result.ok) {
            this.plan.dropCheckpoint();
            this.editor.notify(result.reason);
          }
        },
        true,
      );
      if (corners.length <= 3) remove.disabled = true;

      row.append(badge, axis(corner[0], 0), axis(corner[1], 1), add, remove);
      this.el.appendChild(row);
    });

    const hint = document.createElement('p');
    hint.className = 'text-slate-500 leading-relaxed text-[11px] mt-2';
    hint.textContent =
      'Nomor & warna sama dengan titik di denah. Klik titik untuk memilihnya, lalu tekan Delete atau klik × merah untuk menghapus. Tanda + hijau (berlabel 1→2) di tengah sisi menambah titik.';
    this.el.appendChild(hint);
  }

  #pinList(item, kind) {
    const id = this.plan.activeFloorId;
    this.#section('Pin sudut');
    item.points.forEach((point, index) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-1 mb-1';
      const badge = document.createElement('span');
      badge.className = 'w-5 text-center text-[10px] font-bold text-slate-900 py-0.5';
      badge.style.background = ['#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c'][index % 6];
      badge.textContent = index + 1;
      const axis = (value, which) =>
        this.#number(value, { min: -500, max: 500, step: 0.05 }, (v) => {
          const next = [...point];
          next[which] = v;
          this.plan.moveRectPoint(id, kind, item.id, index, next);
        });
      const add = document.createElement('button');
      add.className = 'layer-btn';
      add.title = 'Sisipkan pin setelah titik ini';
      add.innerHTML = '<i class="fa-solid fa-plus"></i>';
      add.addEventListener('click', () => {
        this.plan.checkpoint();
        this.plan.addRectPoint(id, kind, item.id, index);
      });
      const remove = document.createElement('button');
      remove.className = 'layer-btn';
      remove.title = 'Hapus pin';
      remove.innerHTML = '<i class="fa-solid fa-xmark text-rose-400"></i>';
      remove.addEventListener('click', () => {
        this.plan.checkpoint();
        if (!this.plan.removeRectPoint(id, kind, item.id, index)) this.editor.notify('Minimal 3 pin.');
      });
      row.append(badge, axis(point[0], 0), axis(point[1], 1), add, remove);
      this.el.appendChild(row);
    });
    this.#row('Batas', `${(item.maxX - item.minX).toFixed(2)} × ${(item.maxZ - item.minZ).toFixed(2)} m`);

    const hint = document.createElement('p');
    hint.className = 'text-slate-500 leading-relaxed text-[11px] mt-1';
    hint.textContent =
      'Seret kotak berwarna di denah untuk memindahkan pin (menempel ke sudut tembok). Klik tanda + hijau di tengah sisi untuk menambah pin, pilih pin lalu Delete untuk menghapus.';
    this.el.appendChild(hint);
  }

  #select(options, current, onChange) {
    const select = document.createElement('select');
    select.className = 'field-input';
    options.forEach(([value, label]) => select.add(new Option(label, value, false, value === current)));
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  #roof(roof) {
    const id = this.plan.activeFloorId;
    const apply = (patch) => {
      this.plan.checkpoint();
      this.plan.updateRoof(id, roof.id, patch);
    };

    this.#field('Jenis', this.#select(Object.entries(ROOF_TYPES).map(([k, v]) => [k, v.label]), roof.type, (v) => apply({ type: v })));
    this.#field('Bahan', this.#select(Object.entries(ROOF_MATERIALS).map(([k, v]) => [k, v.label]), roof.material, (v) => apply({ material: v })));

    if (roof.type !== 'flat') {
      this.#field('Kemiringan (°)', this.#number(roof.pitch, { min: 0, max: 60, step: 1 }, (v) => apply({ pitch: v })));
    }
    if (roof.type !== 'canopy') {
      this.#field('Jorokan / overhang (m)', this.#number(roof.overhang ?? 0, { min: 0, max: 2, step: 0.05 }, (v) => apply({ overhang: v })));
    }
    if (roof.type === 'canopy') {
      this.#field('Tinggi tiang (m)', this.#number(roof.height ?? 2.5, { min: 1.8, max: 6, step: 0.1 }, (v) => apply({ height: v })));
      const posts = document.createElement('input');
      posts.type = 'checkbox';
      posts.checked = roof.posts !== false;
      posts.addEventListener('change', () => apply({ posts: posts.checked }));
      this.#field('Tiang di sudut', posts);
    }
    if (roof.type === 'gable' || roof.type === 'hip') {
      this.#field('Arah bubungan', this.#select([['auto', 'Otomatis (sisi panjang)'], ['x', 'Sejajar sumbu X'], ['z', 'Sejajar sumbu Z']], roof.ridge ?? 'auto', (v) => apply({ ridge: v })));
    }
    if (roof.type === 'shed' || roof.type === 'canopy') {
      this.#field('Arah bubungan', this.#select([['auto', 'Otomatis'], ['x', 'Sejajar sumbu X'], ['z', 'Sejajar sumbu Z']], roof.ridge ?? 'auto', (v) => apply({ ridge: v })));
      this.#button('Balik sisi tinggi', 'fa-solid fa-right-left', () => apply({ flip: (roof.flip ?? 1) * -1 }));
    }

    const color = document.createElement('input');
    color.type = 'color';
    color.value = roof.color ?? ROOF_MATERIALS[roof.material]?.color ?? '#a8502f';
    color.addEventListener('change', () => apply({ color: color.value }));
    this.#field('Warna', color);
    if (roof.color) this.#button('Warna bahan bawaan', 'fa-solid fa-rotate-left', () => apply({ color: null }));

    this.#section('Ketinggian');
    this.#field(
      'Tinggi dasar atap (m)',
      this.#number(roof.base ?? 0, { min: -3, max: 6, step: 0.05 }, (v) => apply({ base: v })),
    );
    if (roof.type !== 'flat') {
      const rise = roofRise(roof);
      this.#field(
        'Tinggi puncak dari dasar (m)',
        this.#number(rise, { min: 0, max: 15, step: 0.05 }, (v) => {
          const tan = Math.tan((roof.pitch * Math.PI) / 180);
          const next = rise > 1e-6 ? (tan * v) / rise : 0;
          apply({ pitch: (Math.atan(next || v / Math.max(Math.min(roof.maxX - roof.minX, roof.maxZ - roof.minZ) / 2, 0.5)) * 180) / Math.PI });
        }),
      );
    }

    this.#pinList(roof, 'roof');

    this.#section('Ikuti denah');
    this.#button('Seluruh denah (selubung)', 'fa-solid fa-expand', () => {
      this.plan.checkpoint();
      this.plan.fitRoofToFloor(id, roof.id);
    });
    const rooms = this.plan.floor(id).rooms;
    if (rooms.length) {
      const pick = this.#select(
        [['', 'Ikuti ruangan…'], ...rooms.map((r) => [r.id, `${r.name}${r.elevation ? ` (+${r.elevation} m)` : ''}`])],
        '',
        (v) => {
          if (!v) return;
          this.plan.checkpoint();
          this.plan.fitRoofToRoom(id, roof.id, v);
        },
      );
      this.#field('Bentuk & tinggi dari ruangan', pick);
    }
  }

  #yard(yard) {
    const id = this.plan.activeFloorId;
    const apply = (patch) => {
      this.plan.checkpoint();
      this.plan.updateYard(id, yard.id, patch);
    };
    this.#field('Nama', this.#text(yard.name, (v) => apply({ name: v })));
    this.#field('Permukaan', this.#select(Object.entries(YARD_GROUNDS).map(([k, v]) => [k, v.label]), yard.ground, (v) => apply({ ground: v, color: null })));
    this.#field('Tanaman', this.#select(Object.entries(YARD_PLANTS), yard.plants, (v) => apply({ plants: v })));

    const color = document.createElement('input');
    color.type = 'color';
    color.value = yard.color ?? YARD_GROUNDS[yard.ground]?.color ?? '#4d8f3a';
    color.addEventListener('change', () => apply({ color: color.value }));
    this.#field('Warna', color);
    if (yard.color) this.#button('Warna bawaan', 'fa-solid fa-rotate-left', () => apply({ color: null }));

    if (yard.ground === 'teras') {
      const railing = document.createElement('input');
      railing.type = 'checkbox';
      railing.checked = Boolean(yard.railing);
      railing.addEventListener('change', () => apply({ railing: railing.checked }));
      this.#field('Pagar teras (0,9 m)', railing);
      this.#button('Beri kanopi di atas teras', 'fa-solid fa-umbrella', () => {
        this.plan.checkpoint();
        const roof = this.plan.addRoofPolygon(id, yard.points, {
          type: 'canopy',
          base: yard.elevation ?? 0,
        });
        if (roof) this.editor.select({ kind: 'roof', id: roof.id });
      });
    }

    this.#section('Ketinggian tanah');
    this.#field(
      'Tinggi permukaan (m)',
      this.#number(yard.elevation ?? 0, { min: -3, max: 6, step: 0.05 }, (v) => apply({ elevation: v })),
    );
    const hint = document.createElement('p');
    hint.className = 'text-slate-500 leading-relaxed text-[11px] mb-2';
    hint.textContent = 'Positif = lebih tinggi dari lantai (undakan/bedeng), negatif = lebih rendah (kolam, turun).';
    this.el.appendChild(hint);

    this.#pinList(yard, 'yard');
  }

  #stairs(stairs) {
    const id = this.plan.activeFloorId;
    const apply = (patch) => {
      this.plan.checkpoint();
      this.plan.updateStairs(id, stairs.id, patch);
    };
    this.#field('Nama', this.#text(stairs.name, (v) => apply({ name: v })));
    this.#field(
      'Arah naik',
      this.#select(
        [['+x', 'Ke kanan (→)'], ['-x', 'Ke kiri (←)'], ['-z', 'Ke atas (↑)'], ['+z', 'Ke bawah (↓)']],
        stairs.dir,
        (v) => apply({ dir: v }),
      ),
    );
    const m = stairMetrics(stairs);
    this.#section('Ukuran');
    this.#field('Lebar tangga (m)', this.#number(+m.width.toFixed(3), { min: 0.5, max: 6, step: 0.05 }, (v) => apply({ width: v })));
    this.#field('Panjang denah (m)', this.#number(+m.run.toFixed(3), { min: 0.5, max: 12, step: 0.05 }, (v) => apply({ run: v })));
    this.#field('Jumlah anak tangga', this.#number(m.steps, { min: 2, max: 60, step: 1 }, (v) => apply({ steps: v })));
    if (stairs.steps) this.#button('Jumlah otomatis', 'fa-solid fa-rotate-left', () => apply({ steps: null }));
    this.#field('Posisi X (m)', this.#number(+stairs.minX.toFixed(3), { min: -100, max: 100, step: 0.05 }, (v) => apply({ x: v })));
    this.#field('Posisi Z (m)', this.#number(+stairs.minZ.toFixed(3), { min: -100, max: 100, step: 0.05 }, (v) => apply({ z: v })));
    this.#field(
      'Tinggi naik (m)',
      this.#number(stairs.rise, { min: 0.3, max: 6, step: 0.01 }, (v) => apply({ rise: v })),
    );
    this.#button('Setinggi satu lantai', 'fa-solid fa-arrows-up-down', () => apply({ rise: this.plan.wallHeight + SLAB_THICKNESS }));

    const railing = document.createElement('input');
    railing.type = 'checkbox';
    railing.checked = stairs.railing !== false;
    railing.addEventListener('change', () => apply({ railing: railing.checked }));
    this.#field('Pegangan tangga', railing);

    const color = document.createElement('input');
    color.type = 'color';
    color.value = stairs.color ?? '#b8b2a7';
    color.addEventListener('change', () => apply({ color: color.value }));
    this.#field('Warna', color);
    if (stairs.color) this.#button('Warna bawaan', 'fa-solid fa-rotate-left', () => apply({ color: null }));

    this.#section('Hasil');
    this.#row('Tanjakan', `${Math.round(m.riser * 100)} cm`);
    this.#row('Injakan', `${Math.round(m.tread * 100)} cm`);
    const hint = document.createElement('p');
    hint.className = `leading-relaxed text-[11px] mb-2 ${m.ok ? 'text-slate-500' : 'text-amber-400'}`;
    hint.textContent = m.ok
      ? 'Nyaman: 2 × tanjakan + injakan ada di 55–70 cm.'
      : `Kurang nyaman (2 × tanjakan + injakan = ${Math.round(m.comfort * 100)} cm, idealnya 60–65). Panjangkan atau pendekkan tangga.`;
    this.el.appendChild(hint);
  }

  #opening(opening) {
    const apply = (patch) => {
      this.plan.checkpoint();
      if (!this.plan.updateOpening(this.plan.activeFloorId, opening.id, patch)) {
        this.editor.notify('Perubahan ditolak: tidak muat atau menabrak bukaan lain.');
        this.render();
      }
    };

    const type = document.createElement('select');
    type.className = 'field-input';
    type.add(new Option('Pintu', 'door', false, opening.type === 'door'));
    type.add(new Option('Jendela', 'window', false, opening.type === 'window'));
    type.add(new Option('Cekungan', 'niche', false, opening.type === 'niche'));
    type.add(new Option('Lubang angin', 'vent', false, opening.type === 'vent'));
    type.addEventListener('change', () => {
      const defaults = {
        door: { sill: 0, height: 2.1 },
        window: { sill: 0.9, height: 1.2 },
        niche: { sill: 0.9, height: 1.2, depth: 0.08 },
        vent: { sill: 2.3, height: 0.25, width: 0.6 },
      }[type.value];
      apply({ type: type.value, ...defaults });
    });
    this.#field('Tipe', type);

    this.#field('Lebar (m)', this.#number(opening.width, { min: 0.5, max: 6, step: 0.05 }, (v) => apply({ width: v })));
    this.#field('Tinggi (m)', this.#number(opening.height, { min: 0.3, max: 4, step: 0.05 }, (v) => apply({ height: v })));
    this.#field('Tinggi ambang (m)', this.#number(opening.sill, { min: 0, max: 3, step: 0.05 }, (v) => apply({ sill: v })));
    this.#field('Posisi dari ujung tembok (m)', this.#number(opening.offset, { min: 0, max: 99, step: 0.05 }, (v) => apply({ offset: v })));

    if (opening.type === 'door' || opening.type === 'window') {
      this.#section('Lubang angin di atas');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = Boolean(opening.vent);
      check.addEventListener('change', () => {
        apply({ vent: check.checked });
        if (check.checked && !this.plan.floor(this.plan.activeFloorId).openings.find((o) => o.id === opening.id)?.vent) {
          this.editor.notify('Tidak ada ruang di atas bukaan ini (dinding terlalu rendah).');
        }
      });
      this.#field('Tambah lubang angin', check);
      if (opening.vent) {
        this.#field('Tinggi lubang angin (m)', this.#number(opening.ventHeight ?? 0.3, { min: 0.1, max: 0.6, step: 0.05 }, (v) => apply({ ventHeight: v })));
      }
    }

    if (opening.type === 'door') {
      const wall = this.plan.floor(this.plan.activeFloorId).walls.find((w) => w.id === opening.wallId);
      const where = (swing) => {
        if (!wall) return '';
        const c = pointOnWall(wall, opening.offset);
        const n = normalOnWall(wall, opening.offset);
        const room = this.plan.roomAt(this.plan.activeFloorId, c[0] + n[0] * swing * 0.7, c[1] + n[1] * swing * 0.7);
        return room ? ` · ke dalam ${room.name}` : ' · ke luar / area terbuka';
      };
      this.#section('Arah buka pintu');
      const swing = document.createElement('select');
      swing.className = 'field-input';
      swing.add(new Option(`Sisi +${where(1)}`, '1', false, (opening.swing ?? 1) === 1));
      swing.add(new Option(`Sisi −${where(-1)}`, '-1', false, opening.swing === -1));
      swing.addEventListener('change', () => apply({ swing: Number(swing.value) }));
      this.#field('Pintu membuka', swing);

      const leaves = document.createElement('select');
      leaves.className = 'field-input';
      leaves.add(new Option('1 daun', '1', false, (opening.leaves ?? 1) === 1));
      leaves.add(new Option('2 daun (pintu ganda)', '2', false, opening.leaves === 2));
      leaves.addEventListener('change', () => {
        const double = leaves.value === '2';
        apply({ leaves: Number(leaves.value), ...(double && opening.width < 1.2 ? { width: 1.6 } : {}), ...(!double && opening.width > 1.2 ? { width: 0.9 } : {}) });
      });
      this.#field('Jumlah daun', leaves);

      const hinge = document.createElement('select');
      hinge.className = 'field-input';
      hinge.add(new Option('Ujung awal tembok', '1', false, (opening.hinge ?? 1) === 1));
      hinge.add(new Option('Ujung akhir tembok', '-1', false, opening.hinge === -1));
      hinge.addEventListener('change', () => apply({ hinge: Number(hinge.value) }));
      if (opening.leaves !== 2) this.#field('Engsel di', hinge);

      this.#button('Balik arah buka', 'fa-solid fa-right-left', () => apply({ swing: (opening.swing ?? 1) * -1 }));
      if (opening.leaves !== 2) this.#button('Balik engsel (kiri/kanan)', 'fa-solid fa-arrows-left-right', () => apply({ hinge: (opening.hinge ?? 1) * -1 }));
    }

    this.#section('Salin');
    this.#button('Salin & tempel di tembok lain (Ctrl+C / Alt+klik)', 'fa-regular fa-copy', () => {
      this.editor.copySelection();
      this.editor.pasteClipboard();
    });
    this.#button('Gandakan di sebelahnya (Ctrl+D)', 'fa-regular fa-clone', () => this.editor.duplicateSelection());

    if (opening.type === 'niche') {
      this.#field('Kedalaman (m)', this.#number(opening.depth ?? 0.15, { min: 0.02, max: 0.5, step: 0.01 }, (v) => apply({ depth: v })));
      const side = document.createElement('select');
      side.className = 'field-input';
      side.add(new Option('Sisi + (normal tembok)', '1', false, (opening.side ?? 1) === 1));
      side.add(new Option('Sisi − (sebaliknya)', '-1', false, opening.side === -1));
      side.addEventListener('change', () => apply({ side: Number(side.value) }));
      this.#field('Menghadap ke', side);
    }
  }

  #deleteButton(label = 'Hapus') {
    const button = document.createElement('button');
    button.className =
      'mt-4 w-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 py-2 rounded-lg font-medium transition flex items-center justify-center gap-1.5';
    button.innerHTML = '<i class="fa-regular fa-trash-can"></i> ';
    button.append(label);
    button.addEventListener('click', () => this.editor.deleteSelection());
    this.el.appendChild(button);
  }

  #header(title, kicker = 'Objek terpilih') {
    const wrap = document.createElement('div');
    wrap.className = 'border-b border-white/10 pb-3 mb-3';
    wrap.innerHTML = '<span class="text-[10px] uppercase tracking-wider text-sky-400 font-semibold"></span><h3 class="text-sm font-bold text-white"></h3>';
    wrap.children[0].textContent = kicker;
    wrap.children[1].textContent = title;
    this.el.appendChild(wrap);
  }

  #section(title) {
    const heading = document.createElement('div');
    heading.className = 'text-[10px] uppercase tracking-wider text-slate-500 font-semibold mt-4 mb-2 pb-1 border-b border-white/10';
    heading.textContent = title;
    this.el.appendChild(heading);
  }

  #button(label, icon, onClick) {
    const button = document.createElement('button');
    button.className =
      'w-full mb-3 bg-white/10 hover:bg-white/15 text-slate-100 py-1.5 px-2 font-medium transition flex items-center justify-center gap-1.5';
    button.innerHTML = `<i class="${icon}"></i> `;
    button.append(label);
    button.addEventListener('click', onClick);
    this.el.appendChild(button);
  }

  #row(label, value) {
    const row = document.createElement('div');
    row.className = 'flex justify-between items-center text-slate-300 mb-2';
    row.innerHTML = '<span></span><span class="font-mono text-sky-300"></span>';
    row.children[0].textContent = label;
    row.children[1].textContent = value;
    this.el.appendChild(row);
  }

  #field(label, input) {
    const wrap = document.createElement('label');
    wrap.className = 'block mb-3';
    const caption = document.createElement('span');
    caption.className = 'block text-[11px] text-slate-400 mb-1';
    caption.textContent = label;
    wrap.append(caption, input);
    this.el.appendChild(wrap);
  }

  #text(value, onCommit) {
    const input = document.createElement('input');
    input.className = 'field-input';
    input.value = value;
    input.addEventListener('change', () => {
      this.plan.checkpoint();
      onCommit(input.value);
    });
    return input;
  }

  #number(value, { min, max, step }, onCommit) {
    const input = document.createElement('input');
    input.className = 'field-input';
    input.type = 'number';
    Object.assign(input, { min, max, step });
    input.value = Number(value.toFixed(3));
    input.addEventListener('focus', () => input.select());
    input.addEventListener('change', () => {
      const parsed = parseFloat(input.value);
      if (!Number.isFinite(parsed)) return this.render();
      this.plan.checkpoint();
      onCommit(Math.min(Math.max(parsed, min), max));
    });
    return input;
  }
}
