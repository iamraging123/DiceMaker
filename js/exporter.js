/**
 * exporter.js
 * -----------
 * PNG screenshot + GLTF/OBJ/STL model export + JSON config save/load + share-link utilities.
 *
 * STL export assumes the dice group is already in its target print mode — engrave
 * mode CSG runs in the preview path (printable.js), so export just grabs the
 * current geometry and scales it to millimeters.
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

/**
 * Force a file download in the browser.
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPNG(renderer, filename = 'dice.png') {
  // renderer was created with preserveDrawingBuffer: true so this is safe.
  renderer.domElement.toBlob((blob) => {
    if (blob) downloadBlob(blob, filename);
  }, 'image/png');
}

export function exportGLTF(group, filename = 'dice.gltf') {
  const exporter = new GLTFExporter();
  exporter.parse(
    group,
    (result) => {
      if (result instanceof ArrayBuffer) {
        downloadBlob(new Blob([result], { type: 'model/gltf-binary' }), filename.replace('.gltf', '.glb'));
      } else {
        const json = JSON.stringify(result, null, 2);
        downloadBlob(new Blob([json], { type: 'model/gltf+json' }), filename);
      }
    },
    (err) => console.error('GLTF export failed', err),
    { binary: false, embedImages: true }
  );
}

export function exportOBJ(group, filename = 'dice.obj') {
  const exporter = new OBJExporter();
  const objStr = exporter.parse(group);
  downloadBlob(new Blob([objStr], { type: 'text/plain' }), filename);
}

/**
 * Build a printable group from the current dice group. The caller is expected
 * to have `applyPrintMode` run the preview in the desired mode first, so:
 *   - engrave mode: `dieMesh.geometry` already has labels subtracted (CSG ran in preview).
 *   - emboss mode:  `dieMesh.geometry` is the plain body and child `text3D` meshes
 *                   are added as separate shells.
 *   - flat mode:    caller should switch to emboss first.
 *
 * Output geometry is scaled so the largest axis equals `opts.printSizeMM` millimeters.
 */
export async function buildPrintableGroup(diceGroup, opts) {
  const dieMesh = diceGroup.userData.dieMesh;
  const textMeshes = diceGroup.children.filter((c) => c.userData.isText3D);

  dieMesh.geometry.computeBoundingBox();
  const bb = dieMesh.geometry.boundingBox;
  const maxExtent = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
  const scaleMM = (opts.printSizeMM ?? 20) / Math.max(maxExtent, 1e-4);

  const out = new THREE.Group();

  // Die body (already engraved if engrave mode).
  const dieGeom = dieMesh.geometry.clone();
  dieGeom.applyMatrix4(dieMesh.matrixWorld);
  const dieOut = new THREE.Mesh(dieGeom);
  dieOut.scale.setScalar(scaleMM);
  dieOut.updateMatrixWorld();
  out.add(dieOut);

  // Emboss text meshes ride along as separate shells.
  for (const tMesh of textMeshes) {
    const g = tMesh.geometry.clone();
    g.applyMatrix4(tMesh.matrixWorld);
    const m = new THREE.Mesh(g);
    m.scale.setScalar(scaleMM);
    m.updateMatrixWorld();
    out.add(m);
  }
  return out;
}

/**
 * Export the dice as STL, ready to slice for 3D printing.
 * Applies the current print mode (flat / emboss / engrave) and rescales
 * the geometry to the requested print size in millimeters.
 */
export async function exportSTL(diceGroup, opts = {}) {
  const { mode = 'emboss', printSizeMM = 20, binary = true, filename = 'dice.stl' } = opts;
  const printable = await buildPrintableGroup(diceGroup, { mode, printSizeMM });
  const exporter = new STLExporter();
  const data = exporter.parse(printable, { binary });
  const blob = binary
    ? new Blob([data], { type: 'model/stl' })
    : new Blob([data], { type: 'model/stl' });
  downloadBlob(blob, filename);
  // Free temp geometries
  printable.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => m.dispose?.());
  });
}

export function exportConfigJSON(state, filename = 'dice-config.json') {
  const json = JSON.stringify(state, null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), filename);
}

export function readConfigFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Encode state into a base64 URL hash so configs can be shared via link.
 */
export function encodeShareLink(state) {
  const json = JSON.stringify(state);
  // Use URL-safe base64 (btoa handles bytes; JSON is ASCII-safe here).
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const url = new URL(window.location.href);
  url.hash = `share=${b64}`;
  return url.toString();
}

export function decodeShareHash() {
  const m = window.location.hash.match(/share=([^&]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json = decodeURIComponent(escape(atob(padded)));
    return JSON.parse(json);
  } catch (e) {
    console.warn('Failed to decode share hash', e);
    return null;
  }
}
