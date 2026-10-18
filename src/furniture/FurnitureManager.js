import * as THREE from 'three';
import { Emitter } from '../core/Emitter.js';
import { DUPLICATE_OFFSET } from '../config.js';
import { Furniture } from './Furniture.js';
import { getType } from './registry.js';

export class FurnitureManager extends Emitter {
  #items = new Map();
  #byObjectId = new Map();
  #counter = 0;
  #elevations = new Map();
  #ground = () => 0;

  constructor(scene) {
    super();
    this.group = new THREE.Group();
    scene.add(this.group);
    this.activeFloorId = null;
  }

  get activeElevation() {
    return this.#elevations.get(this.activeFloorId) ?? 0;
  }

  setElevations(elevations) {
    this.#elevations = new Map(Object.entries(elevations));
    this.#items.forEach((item) => this.#settle(item));
  }

  setGroundResolver(resolver) {
    this.#ground = resolver;
    this.#items.forEach((item) => this.#settle(item));
  }

  setActiveFloor(floorId) {
    this.activeFloorId = floorId;
    this.#items.forEach((item) => (item.object.visible = item.floorId === floorId));
  }

  create(type, { id, floor = this.activeFloorId, position = [0, 0], rotation = 0, color } = {}) {
    const definition = getType(type);
    const itemId = id ?? this.#nextId(type);
    if (this.#items.has(itemId)) throw new Error(`ID furnitur sudah dipakai: ${itemId}`);

    const item = new Furniture(itemId, definition, definition.build(), floor);
    item.object.visible = floor === this.activeFloorId;
    item.setPosition(position[0], position[1]);
    item.setRotationDeg(rotation);
    if (color) item.setColor(color);
    this.#settle(item);

    this.group.add(item.object);
    this.#items.set(itemId, item);
    this.#byObjectId.set(item.object.uuid, item);
    item.on('transform', () => {
      this.#settle(item);
      this.emit('change');
    });
    this.emit('added', item);
    this.emit('change');
    return item;
  }

  remove(item) {
    if (!this.#items.delete(item.id)) return;
    this.#byObjectId.delete(item.object.uuid);
    this.group.remove(item.object);
    this.emit('removed', item);
    this.emit('change');
  }

  duplicate(item) {
    return this.create(item.type, {
      floor: item.floorId,
      position: [item.x + DUPLICATE_OFFSET, item.z + DUPLICATE_OFFSET],
      rotation: item.rotationDeg,
      color: item.color,
    });
  }

  toJSON() {
    return this.all().map((item) => item.toJSON());
  }

  get(id) {
    return this.#items.get(id) ?? null;
  }

  all() {
    return [...this.#items.values()];
  }

  pickHit(raycaster) {
    for (const hit of raycaster.intersectObjects(this.group.children, true)) {
      let object = hit.object;
      while (object.parent && object.parent !== this.group) object = object.parent;
      const item = this.#byObjectId.get(object.uuid);
      if (item?.object.visible) return { item, distance: hit.distance };
    }
    return null;
  }

  pick(raycaster) {
    return this.pickHit(raycaster)?.item ?? null;
  }

  #settle(item) {
    const base = this.#elevations.get(item.floorId) ?? 0;
    item.object.position.y = base + this.#ground(item.floorId, item.x, item.z);
  }

  #nextId(type) {
    let id;
    do id = `${type}-${++this.#counter}`;
    while (this.#items.has(id));
    return id;
  }
}
