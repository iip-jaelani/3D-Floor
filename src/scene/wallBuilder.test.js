import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildWall, wallProfile } from './wallBuilder.js';

const T = 0.12;
const H = 2.8;
const mat = (name) => Object.assign(new THREE.MeshBasicMaterial(), { name });
const materials = {
  wall: mat('wall'),
  cap: mat('cap'),
  trim: mat('trim'),
  frame: mat('frame'),
  door: mat('door'),
  brass: mat('brass'),
  glass: mat('glass'),
};

const wall = { id: 'w', a: [0, 0], b: [10, 0] };

const world = (north, south) => (x, z) => (z < 0 ? north(x) : south(x));
const bounds = (group) => new THREE.Box3().setFromObject(group);
const meshesWith = (group, material) => {
  const found = [];
  group.traverse((o) => o.isMesh && o.material === material && found.push(o));
  return found;
};

describe('wallProfile', () => {
  it('rata: satu potongan dengan base = ref = 0', () => {
    const runs = wallProfile(wall, T, () => 0);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ base: 0, ref: 0 });
  });

  it('tembok antar dua ruangan beda tinggi: base = terendah, ref = tertinggi', () => {
    const runs = wallProfile(wall, T, world(() => 0, () => 0.5));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ base: 0, ref: 0.5 });
  });

  it('tembok yang melewati dua ruangan terpecah menjadi dua potongan', () => {
    const runs = wallProfile(wall, T, world(() => null, (x) => (x < 5 ? 0 : 0.5)));
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ base: 0, ref: 0 });
    expect(runs[1]).toMatchObject({ base: 0.5, ref: 0.5 });
    expect(runs[0].t1).toBeCloseTo(5, 1);
  });
});

describe('buildWall mengikuti ketinggian lantai', () => {
  it('ruangan rata: tembok dari y=0 sampai tinggi dinding (+tutup)', () => {
    const { full } = buildWall({ wall, height: H, thickness: T, materials, elevationAt: () => 0 });
    const b = bounds(full);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.y).toBeCloseTo(H + 0.04, 2);
  });

  it('ruangan naik 50 cm di kedua sisi: seluruh tembok ikut naik', () => {
    const { full } = buildWall({ wall, height: H, thickness: T, materials, elevationAt: () => 0.5 });
    const b = bounds(full);
    expect(b.min.y).toBeCloseTo(0.5);
    expect(b.max.y).toBeCloseTo(0.5 + H + 0.04, 2);
  });

  it('jendela ikut naik: pusat kaca = lantai + ambang + setengah tinggi', () => {
    const opening = { id: 'o', wallId: 'w', type: 'window', offset: 5, width: 1.2, height: 1.2, sill: 0.9 };
    const { full } = buildWall({ wall, openings: [opening], height: H, thickness: T, materials, elevationAt: () => 0.5 });
    const [glass] = meshesWith(full, materials.glass);
    expect(glass.position.y).toBeCloseTo(0.5 + 0.9 + 0.6);
  });

  it('pintu ikut naik: bawah daun pintu setinggi lantai ruangan', () => {
    const opening = { id: 'o', wallId: 'w', type: 'door', offset: 5, width: 0.9, height: 2.1, sill: 0 };
    const { full } = buildWall({ wall, openings: [opening], height: H, thickness: T, materials, elevationAt: () => 0.5 });
    const [leaf] = meshesWith(full, materials.door);
    const box = new THREE.Box3().setFromObject(leaf);
    expect(box.min.y).toBeCloseTo(0.5);
  });

  it('pintu antar ruangan beda tinggi: ambang di lantai yang lebih tinggi, dasar tembok di yang rendah', () => {
    const opening = { id: 'o', wallId: 'w', type: 'door', offset: 5, width: 0.9, height: 2.1, sill: 0 };
    const { full } = buildWall({
      wall,
      openings: [opening],
      height: H,
      thickness: T,
      materials,
      elevationAt: world(() => 0, () => 0.5),
    });
    expect(bounds(full).min.y).toBeCloseTo(0);
    const [leaf] = meshesWith(full, materials.door);
    expect(new THREE.Box3().setFromObject(leaf).min.y).toBeCloseTo(0.5);
  });

  it('tembok berundak: bagian di ruangan lebih tinggi lebih tinggi pula puncaknya', () => {
    const { full } = buildWall({
      wall,
      height: H,
      thickness: T,
      materials,
      elevationAt: world(() => null, (x) => (x < 5 ? 0 : 0.5)),
    });
    const caps = meshesWith(full, materials.cap).map((m) => m.position.y);
    expect(Math.min(...caps)).toBeCloseTo(H + 0.02, 2);
    expect(Math.max(...caps)).toBeCloseTo(0.5 + H + 0.02, 2);
  });
});

import { wallFacets as _wallFacets } from './wallBuilder.js';

describe('wallFacets', () => {
  it('tembok lurus tidak dipecah', () => {
    const wall = { id: 'w', a: [0, 0], b: [4, 0] };
    const facets = _wallFacets(wall, []);
    expect(facets).toHaveLength(1);
    expect(facets[0].wall).toBe(wall);
  });

  it('tembok lengkung dipecah; ujungnya tepat di a dan b', () => {
    const wall = { id: 'w', a: [0, 0], b: [4, 0], bulge: 1 };
    const facets = _wallFacets(wall, []);
    expect(facets.length).toBeGreaterThan(4);
    expect(facets[0].wall.a).toEqual([0, 0]);
    expect(facets.at(-1).wall.b).toEqual([4, 0]);
    facets.slice(1).forEach((f, i) => expect(f.wall.a).toEqual(facets[i].wall.b));
  });

  it('bukaan hanya didekorasi di potongan yang memuat titik tengahnya', () => {
    const wall = { id: 'w', a: [0, 0], b: [6, 0], bulge: 1.5 };
    const opening = { id: 'o', wallId: 'w', type: 'door', offset: 3.5, width: 1.2, height: 2.1, sill: 0 };
    const facets = _wallFacets(wall, [opening]);
    const decorated = facets.flatMap((f) => f.openings).filter((o) => !o.ghost);
    const ghosts = facets.flatMap((f) => f.openings).filter((o) => o.ghost);
    expect(decorated).toHaveLength(1);
    expect(ghosts.length).toBeGreaterThanOrEqual(1);
  });
});
