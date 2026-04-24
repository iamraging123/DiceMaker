/**
 * scene.js
 * --------
 * Wraps Three.js scene/camera/renderer/controls/lighting into a small Scene class.
 * Exposes:
 *   .scene, .camera, .renderer, .controls
 *   .setBackground(color)
 *   .resize()
 *   .render()
 *   .start()
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ScaleBar } from './scaleBar.js';

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#f5f4f0');

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(3.6, 2.8, 4.2);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true, // needed so we can grab PNG screenshots
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.85;
    this.controls.minDistance = 1.6;
    this.controls.maxDistance = 14;

    // Lighting — no shadow casting. Contrasty 3-point setup: low ambient so
    // shadowed faces read dark, strong key for bright lit faces, minimal fill
    // and a small rim so silhouettes still separate from the background.
    const ambient = new THREE.AmbientLight(0xffffff, 0.18);
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(5, 7, 5);
    const fill = new THREE.DirectionalLight(0xffffff, 0.18);
    fill.position.set(-4, 3, -2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.25);
    rim.position.set(0, -2, -5);
    this.scene.add(ambient, key, fill, rim);

    // Print-size scale bar (below the die, always-visible).
    this.scaleBar = new ScaleBar();
    this.scene.add(this.scaleBar.group);

    this.diceGroup = null;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setDice(group) {
    if (this.diceGroup) this.scene.remove(this.diceGroup);
    this.diceGroup = group;
    if (group) this.scene.add(group);
    this._syncLineResolutions();
  }

  /** Fat-line material (LineMaterial) needs to know the render target size
   *  to compute pixel widths. Walk the scene and push the current size. */
  _syncLineResolutions() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    this.scene.traverse((o) => {
      if (o.material && o.material.isLineMaterial) {
        o.material.resolution.set(w, h);
      }
    });
  }

  setBackground(color) {
    this.scene.background = new THREE.Color(color);
  }

  resetCamera() {
    this.camera.position.set(3.6, 2.8, 4.2);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  resize() {
    const w = this.canvas.clientWidth || this.canvas.parentElement.clientWidth;
    const h = this.canvas.clientHeight || this.canvas.parentElement.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._syncLineResolutions();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  start(updateFn) {
    const loop = () => {
      requestAnimationFrame(loop);
      if (updateFn) updateFn();
      this.render();
    };
    loop();
  }
}
