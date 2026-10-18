import * as THREE from 'three';

export class PointerController {
  #raycaster = new THREE.Raycaster();
  #pointer = new THREE.Vector2();
  #floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  #hit = new THREE.Vector3();
  #grabOffset = new THREE.Vector2();
  #dragging = null;
  enabled = true;

  constructor({ engine, manager, selection, canPlace, pickOther = () => null }) {
    this.engine = engine;
    this.manager = manager;
    this.selection = selection;
    this.canPlace = canPlace;
    this.pickOther = pickOther;

    const canvas = engine.domElement;
    canvas.addEventListener('pointerdown', (e) => this.#onDown(e));
    window.addEventListener('pointermove', (e) => this.#onMove(e));
    window.addEventListener('pointerup', () => this.#onUp());
  }

  #aim(event) {
    this.#floorPlane.constant = -this.manager.activeElevation;
    const rect = this.engine.domElement.getBoundingClientRect();
    this.#pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.#raycaster.setFromCamera(this.#pointer, this.engine.camera);
  }

  #pick() {
    const furniture = this.manager.pickHit(this.#raycaster);
    const other = this.pickOther(this.#raycaster);
    if (furniture && other) return furniture.distance <= other.distance ? { furniture } : { other };
    return { furniture, other };
  }

  #onDown(event) {
    if (!this.enabled || event.button !== 0) return;
    this.#aim(event);

    const { furniture, other } = this.#pick();
    if (!furniture) {
      if (other) this.selection.select(other.item);
      else this.selection.clear();
      return;
    }

    const item = furniture.item;
    this.selection.select(item);
    this.#dragging = item;
    this.engine.controls.enabled = false;

    if (this.#raycaster.ray.intersectPlane(this.#floorPlane, this.#hit)) {
      this.#grabOffset.set(this.#hit.x - item.x, this.#hit.z - item.z);
    }
    this.engine.domElement.style.cursor = 'grabbing';
  }

  #onMove(event) {
    if (!this.enabled) return;
    this.#aim(event);

    if (this.#dragging) {
      if (this.#raycaster.ray.intersectPlane(this.#floorPlane, this.#hit)) {
        const x = this.#hit.x - this.#grabOffset.x;
        const z = this.#hit.z - this.#grabOffset.y;
        if (this.canPlace(x, z)) this.#dragging.setPosition(x, z);
      }
      return;
    }

    const { furniture, other } = this.#pick();
    this.engine.domElement.style.cursor = furniture ? 'grab' : other ? 'pointer' : 'default';
  }

  #onUp() {
    if (!this.#dragging) return;
    this.#dragging = null;
    this.engine.controls.enabled = true;
    this.engine.domElement.style.cursor = 'grab';
  }
}
