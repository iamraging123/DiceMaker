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

    // Lighting — no shadow casting; the brand is shadow-free.
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(5, 7, 5);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-4, 3, -2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(0, -2, -5);
    this.scene.add(ambient, key, fill, rim);

    this.diceGroup = null;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setDice(group) {
    if (this.diceGroup) this.scene.remove(this.diceGroup);
    this.diceGroup = group;
    if (group) this.scene.add(group);
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
