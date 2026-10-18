import * as THREE from 'three';
import { polygonArea, polygonCentroid } from '../plan/geometry.js';
import { resolveCollisions, wallBlockers } from '../tour/collision.js';

const EYE_HEIGHT = 1.55;
const PLAYER_RADIUS = 0.22;
const WALK_SPEED = 1.7;
const RUN_SPEED = 3.4;
const TURN_SPEED = 1.8;
const LOOK_SENSITIVITY = 0.0035;
const MAX_PITCH = 1.25;
const HEIGHT_SMOOTHING = 9;
const TOUR_FOV = 70;
const MAX_FRAME = 0.1;

const MOVE_KEYS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
};
const TURN_KEYS = { ArrowLeft: 1, ArrowRight: -1 };

export class TourController {
  active = false;

  #keys = new Set();
  #look = null;
  #saved = null;
  #position = [0, 0];
  #yaw = 0;
  #pitch = 0;
  #height = 0;
  #lastTime = 0;
  #blockers = [];
  #currentRoomId = null;

  constructor({ engine, plan, manager, house, selection, pointer, onChange = () => {} }) {
    this.engine = engine;
    this.plan = plan;
    this.manager = manager;
    this.house = house;
    this.selection = selection;
    this.pointer = pointer;
    this.onChange = onChange;

    const canvas = engine.domElement;
    canvas.addEventListener('pointerdown', (e) => this.#onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.#onPointerMove(e));
    window.addEventListener('pointerup', () => this.#onPointerUp());
    window.addEventListener('keydown', (e) => this.#onKeyDown(e));
    window.addEventListener('keyup', (e) => this.#keys.delete(e.code));
    window.addEventListener('blur', () => this.#keys.clear());

    engine.onFrame(() => this.#update());
  }

  get roomName() {
    return this.plan.roomAt(this.plan.activeFloorId, this.#position[0], this.#position[1])?.name ?? '';
  }

  start() {
    if (this.active) return;
    const floor = this.plan.activeFloor;
    if (!floor.rooms.length) return;

    const { camera, controls } = this.engine;
    this.#saved = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      fov: camera.fov,
      viewMode: this.house.viewMode,
    };

    this.selection.clear();
    this.pointer.enabled = false;
    this.house.setViewMode('full');
    this.house.setCeilingsVisible(true);

    this.engine.setManualCamera(true);
    controls.enabled = false;
    camera.fov = TOUR_FOV;
    camera.updateProjectionMatrix();

    this.#blockers = wallBlockers(floor, this.plan.wallThickness);
    this.#position = this.#findStart(floor);
    this.#yaw = 0;
    this.#pitch = 0;
    this.#height = this.#groundAt(...this.#position) + EYE_HEIGHT;
    this.#lastTime = performance.now();
    this.#currentRoomId = null;
    this.active = true;
    this.#applyCamera();
    this.onChange(true);
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.#keys.clear();
    this.#look = null;

    const { camera, controls } = this.engine;
    camera.position.copy(this.#saved.position);
    camera.fov = this.#saved.fov;
    camera.updateProjectionMatrix();
    controls.target.copy(this.#saved.target);

    this.house.setViewMode(this.#saved.viewMode);
    this.house.setCeilingsVisible(false);
    this.pointer.enabled = true;
    controls.enabled = true;
    this.engine.setManualCamera(false);
    controls.update();
    this.onChange(false);
  }

  toggle() {
    if (this.active) this.stop();
    else this.start();
  }

  #onKeyDown(event) {
    if (!this.active) return;
    if (event.code === 'Escape') {
      this.stop();
      return;
    }
    if (event.code in MOVE_KEYS || event.code in TURN_KEYS || event.code.startsWith('Shift')) {
      this.#keys.add(event.code);
      event.preventDefault();
    }
  }

  #onPointerDown(event) {
    if (!this.active || event.button !== 0) return;
    this.#look = { x: event.clientX, y: event.clientY };
    this.engine.domElement.style.cursor = 'grabbing';
  }

  #onPointerMove(event) {
    if (!this.active || !this.#look) return;
    this.#yaw -= (event.clientX - this.#look.x) * LOOK_SENSITIVITY;
    this.#pitch = THREE.MathUtils.clamp(this.#pitch - (event.clientY - this.#look.y) * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
    this.#look = { x: event.clientX, y: event.clientY };
  }

  #onPointerUp() {
    if (!this.active) return;
    this.#look = null;
    this.engine.domElement.style.cursor = 'grab';
  }

  #update() {
    if (!this.active) return;

    const now = performance.now();
    const dt = Math.min((now - this.#lastTime) / 1000, MAX_FRAME);
    this.#lastTime = now;

    let turn = 0;
    this.#keys.forEach((code) => (turn += TURN_KEYS[code] ?? 0));
    this.#yaw += turn * TURN_SPEED * dt;

    let forward = 0;
    let strafe = 0;
    this.#keys.forEach((code) => {
      const move = MOVE_KEYS[code];
      if (move === 'forward') forward += 1;
      if (move === 'back') forward -= 1;
      if (move === 'right') strafe += 1;
      if (move === 'left') strafe -= 1;
    });

    if (forward || strafe) {
      const run = this.#keys.has('ShiftLeft') || this.#keys.has('ShiftRight');
      const length = Math.hypot(forward, strafe);
      const speed = (run ? RUN_SPEED : WALK_SPEED) * dt;
      const sin = Math.sin(this.#yaw);
      const cos = Math.cos(this.#yaw);
      const dx = ((-sin * forward + cos * strafe) / length) * speed;
      const dz = ((-cos * forward - sin * strafe) / length) * speed;
      this.#moveBy(dx, dz);
    }

    const target = this.#groundAt(...this.#position) + EYE_HEIGHT;
    this.#height += (target - this.#height) * Math.min(1, HEIGHT_SMOOTHING * dt);

    this.#applyCamera();
    this.#syncRoom();
  }

  #moveBy(dx, dz) {
    const boxes = this.#furnitureBoxes();
    const attempts = [
      [dx, dz],
      [dx, 0],
      [0, dz],
    ];

    for (const [ax, az] of attempts) {
      if (!ax && !az) continue;
      const next = resolveCollisions(
        [this.#position[0] + ax, this.#position[1] + az],
        PLAYER_RADIUS,
        this.#blockers,
        boxes,
      );
      if (this.plan.roomAt(this.plan.activeFloorId, next[0], next[1])) {
        this.#position = next;
        return;
      }
    }
  }

  #groundAt(x, z) {
    const floorId = this.plan.activeFloorId;
    return this.plan.elevationOf(floorId) + this.plan.elevationAt(floorId, x, z);
  }

  #furnitureBoxes() {
    return this.manager
      .all()
      .filter((item) => item.floorId === this.plan.activeFloorId && item.object.visible)
      .map((item) => item.getBounds());
  }

  #applyCamera() {
    const { camera } = this.engine;
    camera.position.set(this.#position[0], this.#height, this.#position[1]);
    camera.quaternion.setFromEuler(new THREE.Euler(this.#pitch, this.#yaw, 0, 'YXZ'));
  }

  #findStart(floor) {
    const largest = floor.rooms.reduce((a, b) => (polygonArea(b.polygon) > polygonArea(a.polygon) ? b : a));
    const [cx, cz] = polygonCentroid(largest.polygon);
    const boxes = this.#furnitureBoxes();

    const free = ([x, z]) =>
      this.plan.roomAt(this.plan.activeFloorId, x, z) &&
      resolveCollisions([x, z], PLAYER_RADIUS, this.#blockers, boxes)[0] === x &&
      resolveCollisions([x, z], PLAYER_RADIUS, this.#blockers, boxes)[1] === z;

    for (let ring = 0; ring <= 12; ring++) {
      const radius = ring * 0.3;
      const steps = Math.max(1, ring * 6);
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const candidate = [cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius];
        if (free(candidate)) return candidate;
      }
    }
    return [cx, cz];
  }

  #syncRoom() {
    const room = this.plan.roomAt(this.plan.activeFloorId, this.#position[0], this.#position[1]);
    const id = room?.id ?? null;
    if (id === this.#currentRoomId) return;
    this.#currentRoomId = id;
    this.onChange(true, room);
  }
}
