import * as THREE from 'three';
import { decorGroups } from '../plan/decor.js';
import { pointInPolygon, polygonCentroid } from '../plan/geometry.js';
import { SLAB_THICKNESS } from '../plan/Plan.js';
import { getFloorTexture } from './floorTextures.js';
import { applyTextureSet, getTextureSet } from './proceduralMaterials.js';
import { createCurtain, createRod } from './curtain.js';
import { createRugTexture } from './rugTexture.js';
import { buildWall, wallFacets } from './wallBuilder.js';
import { buildRoof, buildYard } from './outdoor.js';
import { buildStairs } from './stairs3d.js';

export const VIEW_MODES = ['cutaway', 'full', 'low'];

const PROBE_DISTANCE = 0.2;
const HYSTERESIS = 0.12;

export class House3D {
  #dirty = true;
  #entries = [];
  #floorGroups = [];
  #mode = 'cutaway';
  #slabMaterials = new Map();
  #rugMaterials = new Map();
  #wallMaterialSets = new Map();
  #decorRoots = [];
  #highlight = null;
  #highlightBox = null;
  #ceilings = [];
  #ceilingsVisible = false;
  #roofs = [];
  #roofsVisible = true;

  constructor(scene, plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.materials = {
      wall: new THREE.MeshStandardMaterial({ color: plan.wallColor, roughness: 0.85 }),
      cap: new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.5 }),
      trim: new THREE.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.6 }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#f5f2ec', roughness: 0.95, emissive: '#f5f2ec', emissiveIntensity: 0.45 }),
      frame: new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.4 }),
      door: new THREE.MeshStandardMaterial({ color: '#6b4f3a', roughness: 0.55 }),
      brass: new THREE.MeshStandardMaterial({ color: '#b8923a', roughness: 0.3, metalness: 0.85 }),
      glass: new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        transmission: 0.6,
      }),
    };

    plan.on('change', () => this.markDirty());
    plan.on('floor', () => this.markDirty());
  }

  get viewMode() {
    return this.#mode;
  }

  setCeilingsVisible(visible) {
    this.#ceilingsVisible = visible;
    this.#ceilings.forEach((mesh) => (mesh.visible = visible));
  }

  setRoofsVisible(visible) {
    this.#roofsVisible = visible;
  }

  get roofsVisible() {
    return this.#roofsVisible;
  }

  setViewMode(mode) {
    if (VIEW_MODES.includes(mode)) this.#mode = mode;
  }

  markDirty() {
    this.#dirty = true;
  }

  pickDecor(raycaster, floorId) {
    const roots = this.#decorRoots.filter((root) => root.userData.decor.floorId === floorId);
    const [hit] = raycaster.intersectObjects(roots, true);
    if (!hit) return null;

    let object = hit.object;
    while (object && !object.userData.decor) object = object.parent;
    if (!object) return null;

    const { floorId: floor, group } = object.userData.decor;
    const label = this.plan.decorGroups(floor).find((g) => g.id === group)?.label ?? 'Dekor';
    return { floorId: floor, groupId: group, label, distance: hit.distance };
  }

  setDecorHighlight(floorId, groupId, on) {
    this.#highlight = on ? { floorId, groupId } : null;
    this.#refreshHighlight();
  }

  #refreshHighlight() {
    if (this.#highlightBox) {
      this.group.remove(this.#highlightBox);
      this.#highlightBox.geometry.dispose();
      this.#highlightBox = null;
    }
    if (!this.#highlight) return;

    const { floorId, groupId } = this.#highlight;
    const roots = this.#decorRoots.filter(
      (r) => r.userData.decor.floorId === floorId && r.userData.decor.group === groupId,
    );
    if (!roots.length) return;

    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    roots.forEach((root) => box.expandByObject(root));
    box.expandByScalar(0.04);

    this.#highlightBox = new THREE.Box3Helper(box, 0x38bdf8);
    this.group.add(this.#highlightBox);
  }

  update(camera) {
    if (this.#dirty) this.#rebuild();

    const activeLevel = this.plan.activeFloor.level;
    this.#floorGroups.forEach(({ group, level }) => (group.visible = level <= activeLevel));
    this.#roofs.forEach(({ object, level, canopy }) => {
      object.visible = canopy || (this.#roofsVisible && level >= activeLevel);
    });

    this.#entries.forEach((entry) => {
      const lowered = entry.floorId === this.plan.activeFloorId ? this.#shouldLower(entry, camera) : false;
      entry.lowered = lowered;
      entry.full.visible = !lowered;
      entry.low.visible = lowered;
    });
  }

  #shouldLower(entry, camera) {
    if (this.#mode === 'full') return false;
    if (this.#mode === 'low') return true;
    if (!entry.exterior) return false;

    const dx = camera.position.x - entry.mid[0];
    const dz = camera.position.z - entry.mid[1];
    const facing = (entry.outward[0] * dx + entry.outward[1] * dz) / (Math.hypot(dx, dz) || 1);
    if (facing > HYSTERESIS) return true;
    if (facing < -HYSTERESIS) return false;
    return entry.lowered;
  }

  #rebuild() {
    this.#dirty = false;
    this.#disposeChildren();
    this.#entries = [];
    this.#floorGroups = [];
    this.#decorRoots = [];
    this.#ceilings = [];
    this.#roofs = [];
    this.#highlightBox = null;
    this.materials.wall.color.set(this.plan.wallColor);
    this.#wallMaterialSets.forEach((set) => set.wall.dispose());
    this.#wallMaterialSets.clear();

    this.plan.floors.forEach((floor) => {
      const group = new THREE.Group();
      group.position.y = this.plan.elevationOf(floor);
      this.group.add(group);
      this.#floorGroups.push({ group, level: floor.level });

      floor.rooms.forEach((room) => {
        group.add(this.#buildSlab(room));
        group.add(this.#buildCeiling(room));
      });
      this.#buildWalls(floor, group);
      this.#buildDecor(floor, group);

      floor.yards.forEach((yard) => group.add(buildYard(yard)));
      floor.stairs.forEach((stairs) => group.add(buildStairs(stairs)));
      floor.roofs.forEach((roof) => {
        const canopy = roof.type === 'canopy';
        const object = buildRoof(roof, canopy ? null : this.materials.wall);
        object.position.y = (canopy ? (roof.height ?? 2.5) : this.plan.wallHeight) + (roof.base ?? 0);
        group.add(object);
        this.#roofs.push({ object, level: floor.level, canopy });
      });
    });

    this.#refreshHighlight();
  }

  #buildSlab(room) {
    const shape = new THREE.Shape(room.polygon.map(([x, z]) => new THREE.Vector2(x, z)));
    const elevation = room.elevation ?? 0;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: SLAB_THICKNESS + elevation, bevelEnabled: false });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, elevation, 0);

    const mesh = new THREE.Mesh(geometry, this.#slabMaterial(room.floor));
    mesh.receiveShadow = true;
    return mesh;
  }

  #buildCeiling(room) {
    const shape = new THREE.Shape(room.polygon.map(([x, z]) => new THREE.Vector2(x, z)));
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, (room.elevation ?? 0) + this.plan.wallHeight, 0);

    const mesh = new THREE.Mesh(geometry, this.materials.ceiling);
    mesh.visible = this.#ceilingsVisible;
    this.#ceilings.push(mesh);
    return mesh;
  }

  #slabMaterial(type) {
    if (!this.#slabMaterials.has(type)) {
      const material = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 });
      if (getTextureSet(type)) applyTextureSet(material, type);
      else material.map = getFloorTexture(type);
      this.#slabMaterials.set(type, material);
    }
    return this.#slabMaterials.get(type);
  }

  #rugMaterial(color) {
    if (!this.#rugMaterials.has(color)) {
      this.#rugMaterials.set(
        color,
        new THREE.MeshStandardMaterial({ map: createRugTexture(color), roughness: 0.95 }),
      );
    }
    return this.#rugMaterials.get(color);
  }

  #wallMaterials(color, texture = null) {
    if (!color && !texture) return this.materials;
    const key = `${color ?? ''}|${texture ?? ''}`;
    if (!this.#wallMaterialSets.has(key)) {
      const wall = new THREE.MeshStandardMaterial({ color: color ?? this.plan.wallColor, roughness: 0.85 });
      if (texture && getTextureSet(texture)) applyTextureSet(wall, texture);
      this.#wallMaterialSets.set(key, { ...this.materials, wall });
    }
    return this.#wallMaterialSets.get(key);
  }

  #buildWalls(floor, parent) {
    const { rooms } = floor;
    const centroid = this.#floorCentroid(floor);
    const elevationAt = (x, z) => {
      const room = [...rooms].reverse().find((r) => pointInPolygon([x, z], r.polygon));
      return room ? (room.elevation ?? 0) : null;
    };

    floor.walls.forEach((wall) => {
      const thickness = wall.thickness ?? this.plan.wallThickness;
      const openings = floor.openings.filter((o) => o.wallId === wall.id);
      const height = wall.height ?? this.plan.wallHeight;
      const materials = this.#wallMaterials(wall.color, wall.texture);

      wallFacets(wall, openings).forEach((facet) => {
        const { full, low } = buildWall({
          wall: facet.wall,
          openings: facet.openings,
          height,
          thickness,
          materials,
          elevationAt,
        });
        parent.add(full, low);
        low.visible = false;

        const piece = facet.wall;
        const mid = [(piece.a[0] + piece.b[0]) / 2, (piece.a[1] + piece.b[1]) / 2];
        const { exterior, outward } = this.#classifyWall(piece, mid, thickness, rooms, centroid);
        this.#entries.push({ floorId: floor.id, full, low, mid, exterior, outward, lowered: false });
      });
    });
  }

  #classifyWall(wall, mid, thickness, rooms, centroid) {
    const dx = wall.b[0] - wall.a[0];
    const dz = wall.b[1] - wall.a[1];
    const length = Math.hypot(dx, dz) || 1;
    const normal = [-dz / length, dx / length];
    const reach = thickness / 2 + PROBE_DISTANCE;

    const inside = (sign) => {
      const probe = [mid[0] + normal[0] * reach * sign, mid[1] + normal[1] * reach * sign];
      return rooms.some((room) => pointInPolygon(probe, room.polygon));
    };
    const positive = inside(1);
    const negative = inside(-1);

    if (positive && negative) return { exterior: false, outward: normal };
    if (positive !== negative) {
      const sign = positive ? -1 : 1;
      return { exterior: true, outward: [normal[0] * sign, normal[1] * sign] };
    }

    const away = Math.sign(normal[0] * (mid[0] - centroid[0]) + normal[1] * (mid[1] - centroid[1])) || 1;
    return { exterior: true, outward: [normal[0] * away, normal[1] * away] };
  }

  #floorCentroid(floor) {
    const points = floor.rooms.length ? floor.rooms.flatMap((r) => r.polygon) : floor.walls.flatMap((w) => [w.a, w.b]);
    return points.length ? polygonCentroid(points) : [0, 0];
  }

  #buildDecor(floor, parent) {
    const { curtains = [], rods = [], rugs = [] } = floor.decor;

    const lift = (position) => this.plan.elevationAt(floor.id, position[0], position[2]);

    const register = (object, entry) => {
      object.userData.decor = { floorId: floor.id, group: entry.group ?? entry.id };
      parent.add(object);
      this.#decorRoots.push(object);
    };

    curtains.forEach((entry) => {
      const { position, rotation = 0, id, group, ...options } = entry;
      const curtain = createCurtain(options);
      curtain.position.set(position[0], position[1] + lift(position), position[2]);
      curtain.rotation.y = THREE.MathUtils.degToRad(rotation);
      register(curtain, entry);
    });

    rods.forEach((entry) => {
      const rod = createRod({ length: entry.length });
      rod.position.set(entry.position[0], entry.position[1] + lift(entry.position), entry.position[2]);
      rod.rotation.y = THREE.MathUtils.degToRad(entry.rotation ?? 0);
      register(rod, entry);
    });

    rugs.forEach((entry) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...entry.size), this.#rugMaterial(entry.color));
      mesh.position.set(entry.position[0], entry.position[1] + lift(entry.position), entry.position[2]);
      mesh.receiveShadow = true;
      register(mesh, entry);
    });
  }

  #disposeChildren() {
    this.group.traverse((object) => {
      if (object.isLineSegments) object.geometry.dispose();
      if (!object.isMesh) return;
      object.geometry.dispose();
      if (object.material.userData.disposable) object.material.dispose();
    });
    this.group.clear();
  }
}
