import * as THREE from 'three';
import { THEMES } from '../config.js';

export class Lighting {
  #theme = 'day';

  constructor(scene) {
    this.scene = scene;
    scene.background = new THREE.Color(THEMES.day.background);

    this.ambient = new THREE.AmbientLight(0xffffff, THEMES.day.ambient);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(THEMES.day.sunColor, THEMES.day.sun);
    this.sun.position.set(-6, 9, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 25;
    const extent = 5;
    Object.assign(this.sun.shadow.camera, {
      left: -extent,
      right: extent,
      top: extent,
      bottom: -extent,
    });
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sun);

    this.warm = new THREE.PointLight(0xffaa55, THEMES.day.warm, 10);
    this.warm.position.set(0, 3, 0);
    scene.add(this.warm);
  }

  fit({ center, radius }) {
    const k = Math.max(1, radius / 4);
    const [cx, cz] = center;

    this.sun.position.set(cx - 6 * k, 9 * k, cz + 4 * k);
    this.sun.target.position.set(cx, 0, cz);
    this.scene.add(this.sun.target);

    const extent = radius + 1.5;
    Object.assign(this.sun.shadow.camera, {
      left: -extent,
      right: extent,
      top: extent,
      bottom: -extent,
      far: 40 * k,
    });
    this.sun.shadow.camera.updateProjectionMatrix();

    this.warm.position.set(cx, 3, cz);
    this.warm.distance = 10 * k;
  }

  get theme() {
    return this.#theme;
  }

  setTheme(name) {
    const theme = THEMES[name];
    if (!theme) throw new Error(`Tema tidak dikenal: ${name}`);
    this.#theme = name;
    this.scene.background.set(theme.background);
    this.scene.environment = name === 'day' ? (this.scene.userData.environment ?? null) : null;
    this.ambient.intensity = theme.ambient;
    this.sun.intensity = theme.sun;
    this.sun.color.set(theme.sunColor);
    this.warm.intensity = theme.warm;
  }

  toggle() {
    this.setTheme(this.#theme === 'day' ? 'night' : 'day');
    return this.#theme;
  }
}
