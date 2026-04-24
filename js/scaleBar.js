/**
 * scaleBar.js
 * -----------
 * A small ruler below the die showing the current print size in millimeters.
 * The bar itself is fixed at ~2 dice units wide (matching a typical die's
 * extent); only the numeric label changes as the print-size slider moves.
 */

import * as THREE from 'three';

const INK = 0x0a0a0a;

/** Draw (or redraw) the label text onto an existing CanvasTexture-backed canvas. */
function drawLabel(canvas, text) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a0a';
  ctx.font = '500 36px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function makeLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  drawLabel(canvas, text);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.9, 0.22, 1);
  return sprite;
}

export class ScaleBar {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'scale-bar';

    const length = 2.0;    // matches typical die extent (authored units)
    const y      = -1.45;  // below the die
    const tickH  = 0.1;
    const mat = new THREE.LineBasicMaterial({ color: INK });

    const seg = (p1, p2) =>
      new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), mat);

    // Main rule
    this.group.add(seg(
      new THREE.Vector3(-length / 2, y, 0),
      new THREE.Vector3( length / 2, y, 0)
    ));
    // End + middle ticks
    for (const x of [-length / 2, 0, length / 2]) {
      this.group.add(seg(
        new THREE.Vector3(x, y - tickH / 2, 0),
        new THREE.Vector3(x, y + tickH / 2, 0)
      ));
    }

    this.label = makeLabel('20 mm');
    this.label.position.set(0, y - 0.25, 0);
    this.group.add(this.label);
  }

  updateSize(mm) {
    drawLabel(this.label.material.map.image, `${Math.round(mm)} mm`);
    this.label.material.map.needsUpdate = true;
  }

  setVisible(v) { this.group.visible = v; }
}
