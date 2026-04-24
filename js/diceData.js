/**
 * diceData.js
 * ------------
 * Provides polyhedron data for each supported die. Each entry returns:
 *   {
 *     vertices: THREE.Vector3[],   // unique vertex positions
 *     faces:    number[][],        // each face is an ordered list of vertex indices (CCW from outside)
 *     defaultLabels: string[],     // initial label per face
 *     scale: number                // suggested rendered scale
 *   }
 *
 * Approach:
 *  - Non-regular polyhedra (d3 prism, d10 trapezohedron) are constructed by hand.
 *  - Regular polyhedra (d4, d6, d8, d12, d20) reuse Three.js geometries; faces are
 *    extracted by grouping triangles that share a normal (works for all convex polyhedra).
 */

import * as THREE from 'three';

// Tolerance used when matching shared vertices / parallel normals.
const EPS = 1e-4;

/* -----------------------------------------------------------
 * Generic helper: turn a triangulated THREE.BufferGeometry into
 * { vertices, faces } where each face is the ordered polygon of
 * vertex indices forming that flat face.
 * --------------------------------------------------------- */
function extractFacesFromBufferGeometry(geometry) {
  // Expand indexed geometries (e.g. BoxGeometry) so position iteration gives
  // actual triangles. Without this, every third position is treated as a
  // triangle corner regardless of the index buffer — which produces garbage.
  if (geometry.index !== null) {
    geometry = geometry.toNonIndexed();
  }
  const pos = geometry.attributes.position;
  const triangles = [];

  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    const normal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      )
      .normalize();
    triangles.push({ verts: [a, b, c], normal });
  }

  // Group triangles by parallel normals (cosine ~ 1)
  const used = new Array(triangles.length).fill(false);
  const groups = [];
  for (let i = 0; i < triangles.length; i++) {
    if (used[i]) continue;
    const group = [i];
    used[i] = true;
    for (let j = i + 1; j < triangles.length; j++) {
      if (!used[j] && triangles[i].normal.dot(triangles[j].normal) > 0.99) {
        group.push(j);
        used[j] = true;
      }
    }
    groups.push(group);
  }

  // Deduplicate vertices into a master list
  const vertices = [];
  const findOrAdd = (v) => {
    for (let k = 0; k < vertices.length; k++) {
      if (vertices[k].distanceToSquared(v) < EPS * EPS) return k;
    }
    vertices.push(v.clone());
    return vertices.length - 1;
  };

  // For each face group, collect unique vertex indices and order them
  // counter-clockwise around the face centroid (viewed from outside).
  const faces = [];
  for (const group of groups) {
    const idxSet = new Set();
    for (const ti of group) {
      for (const v of triangles[ti].verts) idxSet.add(findOrAdd(v));
    }
    const indices = [...idxSet];
    const normal = triangles[group[0]].normal;

    const centroid = new THREE.Vector3();
    indices.forEach((i) => centroid.add(vertices[i]));
    centroid.divideScalar(indices.length);

    // Build an in-plane orthonormal basis (right, up) so we can sort by angle
    const helper = Math.abs(normal.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const right = helper.clone().sub(normal.clone().multiplyScalar(helper.dot(normal))).normalize();
    const up = new THREE.Vector3().crossVectors(normal, right).normalize();

    indices.sort((a, b) => {
      const va = new THREE.Vector3().subVectors(vertices[a], centroid);
      const vb = new THREE.Vector3().subVectors(vertices[b], centroid);
      return Math.atan2(va.dot(up), va.dot(right)) - Math.atan2(vb.dot(up), vb.dot(right));
    });

    faces.push(indices);
  }

  return { vertices, faces };
}

/* -----------------------------------------------------------
 * Custom polyhedra
 * --------------------------------------------------------- */

function makeD3() {
  // Triangular prism: 3 rectangular sides (labeled) + 2 triangle caps (unlabeled).
  const r = 1;
  const h = 1.5;
  const verts = [];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    verts.push(new THREE.Vector3(r * Math.cos(a), -h, r * Math.sin(a)));
  }
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    verts.push(new THREE.Vector3(r * Math.cos(a), +h, r * Math.sin(a)));
  }
  // Faces: rectangles 0-1-4-3, 1-2-5-4, 2-0-3-5; bottom & top triangle caps.
  const faces = [
    [0, 1, 4, 3],
    [1, 2, 5, 4],
    [2, 0, 3, 5],
    [2, 1, 0], // bottom cap (normal -Y)
    [3, 4, 5], // top cap    (normal +Y)
  ];
  return {
    vertices: verts,
    faces,
    defaultLabels: ['1', '2', '3', '', ''],
    scale: 1.0,
  };
}

function makeD10() {
  // Pentagonal trapezohedron: 2 apex vertices + 10 zig-zag equator vertices,
  // 10 congruent kite faces. For the kites to be flat (coplanar quads), the
  // apex height H and zig-zag amplitude z must satisfy:
  //     H / z = (1 + cos36°) / (1 - cos36°)    (≈ 9.47)
  // Derived from coplanarity of {apex, high_i, low_i, high_{i+1}}.
  const r = 1;
  const cos36 = Math.cos(Math.PI / 5);
  const ratio = (1 + cos36) / (1 - cos36);
  const z = 0.105;          // zig-zag amplitude (picked for nice proportions)
  const apexY = z * ratio;  // ≈ 0.994 — die is about as tall as it is wide

  const verts = [
    new THREE.Vector3(0, +apexY, 0), // 0: top apex
    new THREE.Vector3(0, -apexY, 0), // 1: bottom apex
  ];
  // 10 equator vertices alternating high (+z) and low (-z) around the circle.
  for (let i = 0; i < 10; i++) {
    const a = (i * 36 * Math.PI) / 180;
    const y = i % 2 === 0 ? +z : -z;
    verts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
  }
  // Helper: equator index 0..9 -> master vertex index 2..11 (wraps mod 10).
  const eq = (i) => 2 + ((i % 10) + 10) % 10;

  const faces = [];
  // 5 top kites: apex_top, high_i, low_i, high_{i+1}
  for (let i = 0; i < 5; i++) {
    faces.push([0, eq(2 * i), eq(2 * i + 1), eq(2 * i + 2)]);
  }
  // 5 bottom kites: apex_bot, low_{i+1}, high_{i+1}, low_i
  // (winding is corrected downstream in diceMesh, but this order is already
  // CCW from outside with the bottom apex)
  for (let i = 0; i < 5; i++) {
    faces.push([1, eq(2 * i + 3), eq(2 * i + 2), eq(2 * i + 1)]);
  }
  return {
    vertices: verts,
    faces,
    defaultLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    scale: 1.0,
  };
}

/* -----------------------------------------------------------
 * Builders for the standard regular polyhedra (via Three.js)
 * --------------------------------------------------------- */

function fromGeometry(geom, defaultLabels, scale = 1.0) {
  const { vertices, faces } = extractFacesFromBufferGeometry(geom);
  // Sanity: ensure each face's stored winding gives an outward normal.
  for (const face of faces) {
    const a = vertices[face[0]];
    const b = vertices[face[1]];
    const c = vertices[face[2]];
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b, a),
      new THREE.Vector3().subVectors(c, a)
    );
    const centroid = new THREE.Vector3();
    face.forEach((i) => centroid.add(vertices[i]));
    centroid.divideScalar(face.length);
    if (n.dot(centroid) < 0) face.reverse();
  }
  return { vertices, faces, defaultLabels, scale };
}

function makeD4() {
  return fromGeometry(new THREE.TetrahedronGeometry(1.2, 0), ['1', '2', '3', '4']);
}
function makeD6() {
  return fromGeometry(new THREE.BoxGeometry(1.6, 1.6, 1.6), ['1', '2', '3', '4', '5', '6']);
}
function makeD8() {
  return fromGeometry(new THREE.OctahedronGeometry(1.1, 0), ['1', '2', '3', '4', '5', '6', '7', '8']);
}
function makeD12() {
  return fromGeometry(
    new THREE.DodecahedronGeometry(1.0, 0),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
  );
}
function makeD20() {
  return fromGeometry(
    new THREE.IcosahedronGeometry(1.05, 0),
    Array.from({ length: 20 }, (_, i) => String(i + 1))
  );
}

/* -----------------------------------------------------------
 * Public API
 * --------------------------------------------------------- */

const builders = {
  d3: makeD3,
  d4: makeD4,
  d6: makeD6,
  d8: makeD8,
  d10: makeD10,
  d12: makeD12,
  d20: makeD20,
};

export function getDiceData(type) {
  if (type in builders) return builders[type]();
  throw new Error(`Unknown dice type: ${type}`);
}

/**
 * Build a custom polyhedron from raw vertex/face arrays. Faces may be any convex
 * polygon (>= 3 vertices). Winding is auto-corrected to point outward (assuming
 * the polyhedron is roughly centered at the origin).
 */
export function buildCustomDice(vertexArrays, faceIndexArrays) {
  const vertices = vertexArrays.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const faces = faceIndexArrays.map((f) => [...f]);
  const center = new THREE.Vector3();
  vertices.forEach((v) => center.add(v));
  center.divideScalar(vertices.length);

  for (const face of faces) {
    const a = vertices[face[0]];
    const b = vertices[face[1]];
    const c = vertices[face[2]];
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(b, a),
      new THREE.Vector3().subVectors(c, a)
    );
    const fc = new THREE.Vector3();
    face.forEach((i) => fc.add(vertices[i]));
    fc.divideScalar(face.length);
    if (n.dot(new THREE.Vector3().subVectors(fc, center)) < 0) face.reverse();
  }
  return {
    vertices,
    faces,
    defaultLabels: faces.map((_, i) => String(i + 1)),
    scale: 1.0,
  };
}
