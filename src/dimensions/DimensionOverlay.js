import * as THREE from 'three';
import { measureGap } from './measure.js';

const LINE_Y = 0.05;

export class DimensionOverlay {
  #entries = [];
  #visible = true;
  #projected = new THREE.Vector3();

  constructor({ scene, engine, labelsContainer, manager, pairs = [] }) {
    this.engine = engine;
    this.manager = manager;
    this.labelsContainer = labelsContainer;

    this.group = new THREE.Group();
    scene.add(this.group);
    this.material = new THREE.LineDashedMaterial({ color: 0x38bdf8, dashSize: 0.1, gapSize: 0.06 });

    pairs.forEach(({ from, to }) => this.#entries.push({ ...this.#createLine(), from, to }));
  }

  get visible() {
    return this.#visible;
  }

  setVisible(visible) {
    this.#visible = visible;
  }

  update() {
    this.#entries.forEach((entry) => this.#updatePair(entry));
  }

  #updatePair(entry) {
    const a = this.manager.get(entry.from);
    const b = this.manager.get(entry.to);
    const shown = this.#visible && a?.object.visible && b?.object.visible;
    const gap = shown ? measureGap(a.getBounds(), b.getBounds()) : null;

    if (!gap) return this.#hide(entry);

    const y = a.object.position.y + LINE_Y;
    this.#show(
      entry,
      new THREE.Vector3(gap.start.x, y, gap.start.z),
      new THREE.Vector3(gap.end.x, y, gap.end.z),
      `${gap.distance.toFixed(2)}m`,
    );
  }

  #createLine() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, this.material);
    line.frustumCulled = false;
    this.group.add(line);

    const label = document.createElement('div');
    label.className = 'dim-label';
    this.labelsContainer.appendChild(label);

    return { line, label };
  }

  #hide({ line, label }) {
    line.visible = false;
    label.style.display = 'none';
  }

  #show({ line, label }, p1, p2, text) {
    const position = line.geometry.attributes.position;
    position.setXYZ(0, p1.x, p1.y, p1.z);
    position.setXYZ(1, p2.x, p2.y, p2.z);
    position.needsUpdate = true;
    line.computeLineDistances();
    line.visible = true;

    this.#projected.addVectors(p1, p2).multiplyScalar(0.5).project(this.engine.camera);
    if (this.#projected.z > 1) {
      label.style.display = 'none';
      return;
    }

    const { clientWidth, clientHeight } = this.engine.domElement;
    label.style.display = 'block';
    label.style.left = `${(this.#projected.x * 0.5 + 0.5) * clientWidth}px`;
    label.style.top = `${(-this.#projected.y * 0.5 + 0.5) * clientHeight}px`;
    label.textContent = text;
  }
}
