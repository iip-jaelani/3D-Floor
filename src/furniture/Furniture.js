import * as THREE from 'three';
import { Emitter } from '../core/Emitter.js';

const OUTLINE_PADDING = 0.08;
const OUTLINE_COLOR = 0x38bdf8;

export class Furniture extends Emitter {
  #colorTargets;
  #outline;
  #box = new THREE.Box3();
  #meshBox = new THREE.Box3();

  constructor(id, definition, { object, colorTargets = [] }, floorId = null) {
    super();
    this.id = id;
    this.floorId = floorId;
    this.type = definition.type;
    this.name = definition.name;
    this.size = definition.size;
    this.object = object;
    this.#colorTargets = colorTargets.map((t) => (t.isMesh ? { mesh: t, lightness: 0 } : t));
    const first = this.#colorTargets[0]?.mesh.material.color;
    this.color = first ? `#${first.getHexString()}` : undefined;

    this.#outline = this.#createOutline();
    object.add(this.#outline);
  }

  get x() {
    return this.object.position.x;
  }

  get z() {
    return this.object.position.z;
  }

  get rotationDeg() {
    const deg = Math.round(THREE.MathUtils.radToDeg(this.object.rotation.y)) % 360;
    return deg < 0 ? deg + 360 : deg;
  }

  toJSON() {
    const round = (v) => Math.round(v * 1000) / 1000;
    return {
      id: this.id,
      type: this.type,
      floor: this.floorId,
      position: [round(this.x), round(this.z)],
      rotation: round(THREE.MathUtils.radToDeg(this.object.rotation.y)),
      ...(this.color && { color: this.color }),
    };
  }

  setPosition(x, z) {
    this.object.position.set(x, this.object.position.y, z);
    this.emit('transform', this);
  }

  setRotationDeg(deg) {
    this.object.rotation.y = THREE.MathUtils.degToRad(deg);
    this.emit('transform', this);
  }

  rotateByDeg(deg) {
    this.setRotationDeg(THREE.MathUtils.radToDeg(this.object.rotation.y) + deg);
  }

  setColor(hex) {
    this.#colorTargets.forEach(({ mesh, lightness }) => {
      mesh.material.color.set(hex);
      if (lightness) mesh.material.color.offsetHSL(0, 0, lightness);
    });
    this.color = hex;
    this.emit('transform', this);
  }

  setSelected(selected) {
    this.#outline.visible = selected;
  }

  getBounds() {
    this.object.updateWorldMatrix(true, true);
    this.#box.makeEmpty();
    this.object.traverse((child) => {
      if (!child.isMesh) return;
      this.#meshBox.setFromObject(child);
      this.#box.union(this.#meshBox);
    });
    return { minX: this.#box.min.x, maxX: this.#box.max.x, minZ: this.#box.min.z, maxZ: this.#box.max.z };
  }

  #createOutline() {
    const [w, h, d] = this.size;
    const edges = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(w + OUTLINE_PADDING, h + OUTLINE_PADDING, d + OUTLINE_PADDING),
    );
    const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: OUTLINE_COLOR }));
    outline.position.y = h / 2;
    outline.visible = false;
    outline.raycast = () => {};
    return outline;
  }
}
