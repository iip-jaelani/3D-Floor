import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CAMERA } from '../config.js';

export class Engine {
  #frameCallbacks = [];
  #paused = false;
  #manualCamera = false;
  #composer = null;
  #realistic = false;

  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.userData.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.scene.userData.environment;
    pmrem.dispose();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = CAMERA.minDistance;
    this.controls.maxDistance = CAMERA.maxDistance;

    this.home = {
      target: new THREE.Vector3(...CAMERA.target),
      position: new THREE.Vector3(...CAMERA.position),
    };
    this.resetCamera();
    this.#resize();
    new ResizeObserver(() => this.#resize()).observe(this.container);
  }

  get domElement() {
    return this.renderer.domElement;
  }

  setManualCamera(manual) {
    this.#manualCamera = manual;
  }

  get realistic() {
    return this.#realistic;
  }

  setRealistic(on) {
    this.#realistic = on;
    if (on) this.#ensureComposer();
  }

  #ensureComposer() {
    if (this.#composer) return;
    const width = this.container.clientWidth || 1;
    const height = this.container.clientHeight || 1;
    const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, width, height);
    ao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1.2, samples: 16 });
    ao.blendIntensity = 0.9;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
    this.#composer = composer;
    this.#composer.setPixelRatio(this.renderer.getPixelRatio());
    this.#composer.setSize(width, height);
  }

  setPaused(paused) {
    this.#paused = paused;
    if (!paused) this.#resize();
  }

  frame({ center, radius }) {
    const direction = new THREE.Vector3(...CAMERA.position).sub(new THREE.Vector3(...CAMERA.target)).normalize();
    const distance = Math.max(CAMERA.minDistance + 4, radius * 2.9);

    this.home.target.set(center[0], CAMERA.target[1], center[1]);
    this.home.position.copy(this.home.target).addScaledVector(direction, distance);
    this.controls.maxDistance = Math.max(CAMERA.maxDistance, distance * 2);
    this.resetCamera();
  }

  resetCamera() {
    this.camera.position.copy(this.home.position);
    this.controls.target.copy(this.home.target);
    this.controls.update();
  }

  onFrame(callback) {
    this.#frameCallbacks.push(callback);
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      if (this.#paused) return;
      if (!this.#manualCamera) this.controls.update();
      this.#frameCallbacks.forEach((callback) => callback());
      if (this.#realistic && this.#composer) this.#composer.render();
      else this.renderer.render(this.scene, this.camera);
    });
  }

  #resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.#composer?.setSize(width, height);
  }
}
