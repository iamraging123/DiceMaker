/**
 * diceMesh.js
 * -----------
 * Builds a complete dice THREE.Group from polyhedron data and config.
 *
 * Composition of the returned Group:
 *   group.userData = { faces: FaceMeta[], dieMesh, edgeLines }
 *   group.children = [ dieMesh, edgeLines, ...labelMeshes ]
 *
 * Each FaceMeta contains:
 *   { centroid, normal, vertices, label, labelMesh, labelTexture, labelMaterial }
 *
 * The mesh is rebuilt when the shape changes; for color/label edits we
 * mutate materials/textures in place to avoid full rebuilds.
 */

import * as THREE from 'three';
import { createFaceTexture } from './faceTexture.js';

/**
 * Triangulate a convex polygon (vertex indices) using a fan from the first vertex.
 */
function triangulateFace(faceIndices) {
  const tris = [];
  for (let i = 1; i < faceIndices.length - 1; i++) {
    tris.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
  }
  return tris;
}

/**
 * Compute the in-plane "inradius" of a polygon: the smallest perpendicular
 * distance from the centroid to any edge. Used to size the label plane so
 * text stays within the face boundary.
 */
function polygonInradius(vertices, indices, centroid) {
  let minDist = Infinity;
  for (let i = 0; i < indices.length; i++) {
    const p1 = vertices[indices[i]];
    const p2 = vertices[indices[(i + 1) % indices.length]];
    const edge = new THREE.Vector3().subVectors(p2, p1);
    const toCentroid = new THREE.Vector3().subVectors(centroid, p1);
    const cross = new THREE.Vector3().crossVectors(edge, toCentroid);
    const d = cross.length() / Math.max(edge.length(), 1e-6);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Build the dice group.
 *
 * @param {object} data    - { vertices, faces, defaultLabels, scale }
 * @param {object} config  - { faceColor, edgeColor, textColor, labels, showEdges, metallic }
 * @returns {THREE.Group}
 */
export function buildDiceMesh(data, config) {
  const group = new THREE.Group();
  const scale = data.scale ?? 1.0;

  // ---------- Build the solid mesh ----------
  const positions = [];
  const normals = [];
  const faceMetas = [];

  for (let f = 0; f < data.faces.length; f++) {
    let face = data.faces[f];
    let a = data.vertices[face[0]];
    let b = data.vertices[face[1]];
    let c = data.vertices[face[2]];
    let normal = new THREE.Vector3()
      .crossVectors(
        new THREE.Vector3().subVectors(b, a),
        new THREE.Vector3().subVectors(c, a)
      )
      .normalize();

    const centroid = new THREE.Vector3();
    face.forEach((idx) => centroid.add(data.vertices[idx]));
    centroid.divideScalar(face.length);

    // Defensive winding correction: assume polyhedron is roughly centered at
    // the origin, so the face's outward normal should point in the same
    // general direction as the centroid. If not, reverse the winding.
    if (normal.dot(centroid) < 0) {
      face = [...face].reverse();
      data.faces[f] = face;
      a = data.vertices[face[0]];
      b = data.vertices[face[1]];
      c = data.vertices[face[2]];
      normal = new THREE.Vector3()
        .crossVectors(
          new THREE.Vector3().subVectors(b, a),
          new THREE.Vector3().subVectors(c, a)
        )
        .normalize();
    }

    // Triangulate this face into the buffer
    const triIdx = triangulateFace(face);
    for (const idx of triIdx) {
      const v = data.vertices[idx];
      positions.push(v.x * scale, v.y * scale, v.z * scale);
      normals.push(normal.x, normal.y, normal.z);
    }

    faceMetas.push({
      faceIndex: f,
      centroid: centroid.clone().multiplyScalar(scale),
      normal: normal.clone(),
      indices: face,
      worldVertices: face.map((i) => data.vertices[i].clone().multiplyScalar(scale)),
      inradius: polygonInradius(data.vertices, face, centroid) * scale,
      label: config.labels[f] ?? '',
      labelMesh: null,
      labelTexture: null,
      labelMaterial: null,
    });
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  const dieMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.faceColor),
    roughness: config.metallic ? 0.25 : 0.55,
    metalness: config.metallic ? 0.85 : 0.05,
    flatShading: true,
  });
  const dieMesh = new THREE.Mesh(geom, dieMaterial);
  dieMesh.castShadow = false;
  dieMesh.receiveShadow = false;
  dieMesh.name = 'dieMesh';
  group.add(dieMesh);

  // ---------- Build edge lines ----------
  const edgeGeom = new THREE.EdgesGeometry(geom, 1); // 1° threshold
  const edgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(config.edgeColor),
    linewidth: 1,
  });
  const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
  edgeLines.name = 'edges';
  edgeLines.visible = config.showEdges !== false;
  group.add(edgeLines);

  // ---------- Build per-face label planes ----------
  for (const meta of faceMetas) {
    if (!meta.label) continue; // skip unlabeled faces (e.g. d3 caps)
    const tex = createFaceTexture(meta.label, config.textColor);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const planeSize = Math.max(meta.inradius * 1.2, 0.2);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(planeSize, planeSize), mat);
    // Sit just above the face surface to avoid z-fighting
    plane.position.copy(meta.centroid).addScaledVector(meta.normal, 0.005 * scale);
    // Orient so the visible (+Z) side points outward along the face normal
    plane.lookAt(meta.centroid.clone().addScaledVector(meta.normal, -1));
    plane.name = `label-${meta.faceIndex}`;
    group.add(plane);

    meta.labelMesh = plane;
    meta.labelTexture = tex;
    meta.labelMaterial = mat;
  }

  group.userData = {
    faces: faceMetas,
    dieMesh,
    edgeLines,
  };
  return group;
}

/**
 * In-place updates that don't require a full rebuild.
 */
export function updateDiceColors(group, config) {
  const { dieMesh, edgeLines, faces } = group.userData;
  dieMesh.material.color.set(config.faceColor);
  dieMesh.material.roughness = config.metallic ? 0.25 : 0.55;
  dieMesh.material.metalness = config.metallic ? 0.85 : 0.05;
  edgeLines.material.color.set(config.edgeColor);
  edgeLines.visible = config.showEdges !== false;

  for (const meta of faces) {
    if (!meta.labelTexture) continue;
    // Re-render the label texture with the new text color.
    const newTex = createFaceTexture(meta.label, config.textColor);
    meta.labelMaterial.map.dispose();
    meta.labelMaterial.map = newTex;
    meta.labelTexture = newTex;
    meta.labelMaterial.needsUpdate = true;
  }
}

export function updateFaceLabel(group, faceIndex, newLabel, textColor) {
  const meta = group.userData.faces[faceIndex];
  if (!meta) return;
  meta.label = newLabel;

  if (!newLabel) {
    // Hide the plane if the label is empty.
    if (meta.labelMesh) meta.labelMesh.visible = false;
    return;
  }

  const newTex = createFaceTexture(newLabel, textColor);
  if (meta.labelMaterial) {
    meta.labelMaterial.map.dispose();
    meta.labelMaterial.map = newTex;
    meta.labelTexture = newTex;
    meta.labelMaterial.needsUpdate = true;
    meta.labelMesh.visible = true;
  }
}

/**
 * Free GPU resources held by a dice group.
 */
export function disposeDice(group) {
  // The un-engraved die geometry is stashed in userData by printable.js;
  // it isn't in the scene graph, so traverse() misses it.
  if (group.userData && group.userData.originalDieGeometry) {
    group.userData.originalDieGeometry.dispose();
    group.userData.originalDieGeometry = null;
  }
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    }
  });
}
