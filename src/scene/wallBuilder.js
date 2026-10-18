import * as THREE from 'three';
import { arcOf, distance, pointOnWall, wallLength } from '../plan/geometry.js';

const CAP_HEIGHT = 0.04;
const SKIRTING_HEIGHT = 0.1;
const SKIRTING_DEPTH = 0.02;
const FRAME_BAR = 0.05;
const VENT_GAP = 0.08;
const FRAME_OVERHANG = 0.02;
const PANE_TARGET_WIDTH = 1.1;
export const LOW_WALL_HEIGHT = 0.45;

const PROFILE_STEP = 0.05;
const PROBE_REACH = 0.15;
const MIN_RUN = 0.12;

const mm = (v) => Math.round(v * 1000);

const FACET_ANGLE = Math.PI / 24;

export function wallFacets(wall, openings) {
  const arc = arcOf(wall);
  if (!arc) return [{ wall, openings, t0: 0, t1: wallLength(wall) }];

  const steps = Math.max(2, Math.ceil(arc.angle / FACET_ANGLE));
  const step = arc.length / steps;
  const points = Array.from({ length: steps + 1 }, (_, i) => pointOnWall(wall, i * step));
  points[0] = [wall.a[0], wall.a[1]];
  points[steps] = [wall.b[0], wall.b[1]];

  return Array.from({ length: steps }, (_, i) => {
    const s0 = i * step;
    const s1 = (i + 1) * step;
    const a = points[i];
    const b = points[i + 1];
    const scale = distance(a, b) / step;
    const last = i === steps - 1;

    const local = openings
      .filter((o) => o.offset + o.width / 2 > s0 && o.offset - o.width / 2 < s1)
      .map((o) => {
        const centered = o.offset >= s0 && (o.offset < s1 || last);
        return {
          ...o,
          offset: (o.offset - s0) * scale,
          width: o.width * scale,
          ghost: !centered,
        };
      });

    return {
      wall: { ...wall, id: `${wall.id}#${i}`, a, b, bulge: 0 },
      openings: local,
      t0: s0,
      t1: s1,
    };
  });
}

export function wallProfile(wall, thickness, elevationAt) {
  const length = wallLength(wall);
  const ux = (wall.b[0] - wall.a[0]) / length;
  const uz = (wall.b[1] - wall.a[1]) / length;
  const nx = -uz;
  const nz = ux;
  const reach = thickness / 2 + PROBE_REACH;

  const count = Math.max(1, Math.ceil(length / PROFILE_STEP));
  const runs = [];

  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) * length) / count;
    const x = wall.a[0] + ux * t;
    const z = wall.a[1] + uz * t;
    const pos = elevationAt(x + nx * reach, z + nz * reach);
    const neg = elevationAt(x - nx * reach, z - nz * reach);
    const sample = { t0: (i * length) / count, t1: ((i + 1) * length) / count, pos, neg };

    const last = runs.at(-1);
    if (last && (last.pos === null ? null : mm(last.pos)) === (pos === null ? null : mm(pos)) && (last.neg === null ? null : mm(last.neg)) === (neg === null ? null : mm(neg))) {
      last.t1 = sample.t1;
    } else {
      runs.push(sample);
    }
  }

  for (let i = runs.length - 1; i >= 0 && runs.length > 1; i--) {
    if (runs[i].t1 - runs[i].t0 >= MIN_RUN) continue;
    if (i > 0) {
      runs[i - 1].t1 = runs[i].t1;
      runs.splice(i, 1);
    } else {
      runs[1].t0 = runs[0].t0;
      runs.splice(0, 1);
    }
  }

  let carry = 0;
  runs.forEach((run) => {
    const known = [run.pos, run.neg].filter((v) => v !== null);
    if (known.length) {
      run.base = Math.min(...known);
      run.ref = Math.max(...known);
      carry = run.base;
    } else {
      run.base = carry;
      run.ref = carry;
    }
    run.pos = run.pos ?? run.base;
    run.neg = run.neg ?? run.base;
  });
  return runs;
}

export function buildWall({ wall, openings = [], height, thickness, materials, elevationAt = () => 0 }) {
  const length = wallLength(wall);
  const runs = wallProfile(wall, thickness, elevationAt);

  const placeAt = (group) => {
    group.position.set((wall.a[0] + wall.b[0]) / 2, 0, (wall.a[1] + wall.b[1]) / 2);
    group.rotation.y = -Math.atan2(wall.b[1] - wall.a[1], wall.b[0] - wall.a[0]);
  };

  const full = new THREE.Group();
  placeAt(full);
  const low = new THREE.Group();
  placeAt(low);

  const addBox = (parent, material, [w, h, d], [x, y, z], { cast = true, receive = true } = {}) => {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (material.userData?.tile) metricUV(geometry, [x + length / 2, y, z]);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    return mesh;
  };

  const sorted = [...openings].sort((p, q) => p.offset - q.offset);

  runs.forEach((run, index) => {
    const x0 = -length / 2 + run.t0 - (index === 0 ? thickness / 2 : 0);
    const x1 = -length / 2 + run.t1 + (index === runs.length - 1 ? thickness / 2 : 0);
    const top = run.ref + height;

    const pieces = [];
    const solid = (px0, px1, y0, y1) => {
      if (px1 - px0 < 1e-3 || y1 - y0 < 1e-3) return;
      addBox(full, materials.wall, [px1 - px0, y1 - y0, thickness], [(px0 + px1) / 2, (y0 + y1) / 2, 0]);
      pieces.push({ x0: px0, x1: px1, y0, y1 });
    };

    const holes = sorted
      .map((o) => ({ o, l: o.offset - length / 2 - o.width / 2, r: o.offset - length / 2 + o.width / 2 }))
      .filter(({ l, r }) => r > x0 && l < x1)
      .map(({ o, l, r }) => ({ o, l: Math.max(l, x0), r: Math.min(r, x1) }));

    let cursor = x0;
    holes.forEach(({ o, l, r }) => {
      solid(cursor, l, run.base, top);
      solid(l, r, run.base, run.ref + o.sill);
      const ventBottom = run.ref + o.sill + o.height + VENT_GAP;
      const ventTop = ventBottom + (o.ventHeight ?? 0);
      if (o.vent && o.type !== 'vent' && ventTop <= top - 0.02) {
        solid(l, r, run.ref + o.sill + o.height, ventBottom);
        solid(l, r, ventTop, top);
      } else {
        solid(l, r, run.ref + o.sill + o.height, top);
      }

      if (o.type === 'niche' && r - l > 1e-3) {
        const depth = Math.min(o.depth ?? 0.15, thickness - 0.02);
        const back = thickness - depth;
        const side = o.side === -1 ? -1 : 1;
        const z = -side * (thickness / 2 - back / 2);
        addBox(full, materials.wall, [r - l, o.height, back], [(l + r) / 2, run.ref + o.sill + o.height / 2, z]);
      }
      cursor = r;
    });
    solid(cursor, x1, run.base, top);

    pieces
      .filter((p) => p.y1 >= top - 1e-6)
      .forEach((p) => {
        addBox(
          full,
          materials.cap,
          [p.x1 - p.x0 + 0.004, CAP_HEIGHT, thickness + 0.004],
          [(p.x0 + p.x1) / 2, top + CAP_HEIGHT / 2, 0],
          { cast: false },
        );
      });

    [
      { side: 1, floor: run.pos },
      { side: -1, floor: run.neg },
    ].forEach(({ side, floor }) => {
      pieces
        .filter((p) => p.y0 <= floor + 1e-6 && p.y1 >= floor + SKIRTING_HEIGHT)
        .forEach((p) => {
          addBox(
            full,
            materials.trim,
            [p.x1 - p.x0, SKIRTING_HEIGHT, SKIRTING_DEPTH],
            [(p.x0 + p.x1) / 2, floor + SKIRTING_HEIGHT / 2, side * (thickness / 2 + SKIRTING_DEPTH / 2)],
          );
        });
    });

    const lowHeight = Math.min(LOW_WALL_HEIGHT, height);
    addBox(low, materials.wall, [x1 - x0, lowHeight, thickness], [(x0 + x1) / 2, run.base + lowHeight / 2, 0]);
    addBox(
      low,
      materials.cap,
      [x1 - x0 + 0.004, CAP_HEIGHT, thickness + 0.004],
      [(x0 + x1) / 2, run.base + lowHeight + CAP_HEIGHT / 2, 0],
      { cast: false },
    );
  });

  sorted.forEach((opening) => {
    if (opening.ghost || opening.type === 'niche') return;
    const run = runs.find((r) => opening.offset >= r.t0 && opening.offset <= r.t1) ?? runs.at(-1);
    const center = opening.offset - length / 2;
    if (opening.type === 'door') addDoor(full, addBox, opening, center, run.ref, thickness, materials);
    else if (opening.type === 'vent') addVent(full, addBox, opening, center, run.ref, thickness, materials);
    else addWindow(full, addBox, opening, center, run.ref, thickness, materials);
    if (opening.vent && opening.type !== 'vent' && opening.type !== 'ghost') {
      const sill = opening.sill + opening.height + VENT_GAP;
      if (run.ref + sill + (opening.ventHeight ?? 0) <= run.ref + height - 0.02) {
        addVent(full, addBox, { width: opening.width, height: opening.ventHeight, sill }, center, run.ref, thickness, materials);
      }
    }
  });

  return { full, low, length };
}

function metricUV(geometry, origin) {
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i) + origin[0];
    const py = pos.getY(i) + origin[1];
    const pz = pos.getZ(i) + origin[2];
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    if (ny > 0.5) uv.setXY(i, px, pz);
    else if (nx > 0.5) uv.setXY(i, pz, py);
    else uv.setXY(i, px, py);
  }
  uv.needsUpdate = true;
}

function addFrame(parent, addBox, { width, height, y0, center, depth, material }) {
  const bar = (w, h, d, x, y) => addBox(parent, material, [w, h, d], [x, y, 0]);
  const yTop = y0 + height - FRAME_BAR / 2;

  bar(width, FRAME_BAR, depth, center, yTop);
  [-1, 1].forEach((side) => bar(FRAME_BAR, height, depth, center + (side * (width - FRAME_BAR)) / 2, y0 + height / 2));
  return { bar, yTop };
}

function addDoor(parent, addBox, { width, height, sill = 0, hinge = 1, leaves = 1 }, center, floor, thickness, materials) {
  const depth = thickness + FRAME_OVERHANG;
  const y0 = floor + sill;
  addFrame(parent, addBox, { width, height, y0, center, depth, material: materials.trim });

  const leafWidth = width - FRAME_BAR * 2;
  const leafHeight = height - FRAME_BAR;
  const knobs = [];
  if (leaves === 2) {
    const gap = 0.01;
    const each = (leafWidth - gap) / 2;
    [-1, 1].forEach((s) => {
      addBox(parent, materials.door, [each, leafHeight, 0.04], [center + s * (each / 2 + gap / 2), y0 + leafHeight / 2, 0]);
      knobs.push(center + s * (gap / 2 + 0.07));
    });
  } else {
    addBox(parent, materials.door, [leafWidth, leafHeight, 0.04], [center, y0 + leafHeight / 2, 0]);
    knobs.push(center + hinge * (leafWidth / 2 - 0.08));
  }

  knobs.forEach((x) => {
    [-1, 1].forEach((side) => {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), materials.brass);
      knob.position.set(x, y0 + 1.0, side * 0.04);
      parent.add(knob);
    });
  });
}

function addVent(parent, addBox, { width, height, sill }, center, floor, thickness, materials) {
  const depth = thickness + FRAME_OVERHANG;
  const y0 = floor + sill;
  addFrame(parent, addBox, { width, height, y0, center, depth, material: materials.frame });
  addBox(parent, materials.frame, [width, FRAME_BAR, depth], [center, y0 + FRAME_BAR / 2, 0]);

  const inner = height - FRAME_BAR * 2;
  const slats = Math.max(2, Math.round(inner / 0.05));
  for (let i = 0; i < slats; i++) {
    const y = y0 + FRAME_BAR + (inner * (i + 0.5)) / slats;
    const slat = addBox(parent, materials.frame, [width - FRAME_BAR * 2, 0.012, thickness * 0.8], [center, y, 0]);
    if (slat) slat.rotation.x = 0.45;
  }
}

function addWindow(parent, addBox, { width, height, sill }, center, floor, thickness, materials) {
  const depth = thickness + FRAME_OVERHANG;
  const y0 = floor + sill;
  const { bar } = addFrame(parent, addBox, { width, height, y0, center, depth, material: materials.frame });

  bar(width, FRAME_BAR, depth, center, y0 + FRAME_BAR / 2);
  addBox(parent, materials.glass, [width, height, 0.02], [center, y0 + height / 2, 0], { cast: false, receive: false });

  const panes = Math.max(1, Math.round(width / PANE_TARGET_WIDTH));
  for (let i = 1; i < panes; i++) {
    bar(0.035, height, depth * 0.7, center - width / 2 + (width * i) / panes, y0 + height / 2);
  }

  addBox(parent, materials.trim, [width + 0.12, 0.035, thickness + 0.12], [center, y0 - 0.0175, 0]);
}
