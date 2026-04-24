/**
 * printable.js
 * ------------
 * 3D-print-friendly geometry generation.
 *
 * The canvas-texture approach used for live preview labels cannot be 3D
 * printed — it's just a color image. For printable output, each face label
 * becomes an extruded TextGeometry that sits on or inside the face.
 *
 * Modes:
 *   - flat:    no 3D text (for screen viewing only)
 *   - emboss:  raised text (TextGeometry on top of the face, extruding outward)
 *   - engrave: sunken text (visual preview only; a proper engraving is produced
 *              at export time via CSG subtraction).
 *
 * Print scaling: geometry is authored in "dice units" (~2 units across) and
 * scaled to millimeters at export time via `printSizeMM / modelExtent`.
 */

import * as THREE from 'three';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { parseChem } from './chem.js';
import { EDGE_LINEWIDTH } from './diceMesh.js';

const FONT_URL =
  'https://unpkg.com/three@0.165.0/examples/fonts/helvetiker_regular.typeface.json';

let cachedFont = null;
let fontPromise = null;

/** Preload the default font (helvetiker regular). Returns the cached font. */
export function loadFont() {
  if (cachedFont) return Promise.resolve(cachedFont);
  if (fontPromise) return fontPromise;
  const loader = new FontLoader();
  fontPromise = new Promise((resolve, reject) => {
    loader.load(
      FONT_URL,
      (font) => { cachedFont = font; resolve(font); },
      undefined,
      (err) => reject(err),
    );
  });
  return fontPromise;
}

export function getFont() { return cachedFont; }

/**
 * Build a single extruded glyph-run from a plain string (no markup).
 * Returns geometry normalized so its left edge sits at x=0 and baseline at y=0,
 * plus the measured width.
 */
function buildSegmentGeometry(text, font, size, depth, bevel) {
  const geom = new TextGeometry(text, {
    font,
    size,
    depth,                  // r163+ uses `depth`
    height: depth,          // kept for older builds
    curveSegments: 8,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.6,
    bevelOffset: 0,
    bevelSegments: 2,
  });
  geom.computeBoundingBox();
  const bb = geom.boundingBox;
  const w = bb ? bb.max.x - bb.min.x : 0;
  const minX = bb ? bb.min.x : 0;
  if (minX !== 0) geom.translate(-minX, 0, 0);
  return { geom, width: w };
}

/**
 * Build an extruded TextGeometry that supports TeX-style sub/superscripts
 * via chem.js. Segments are laid out left-to-right; sub/sup are ~60% size
 * with a vertical offset. Every glyph within a segment is built separately
 * so `spacing` can insert a fixed gap between characters.
 * The final geometry is centered at the origin.
 */
function buildTextGeometry(label, font, opts) {
  const { size, depth, bevel, spacing = 0 } = opts;
  const segments = parseChem(label).filter((s) => s.text.length > 0);
  if (segments.length === 0) return null;

  const smallSize = size * 0.6;
  const subOffsetY = -size * 0.25;
  const supOffsetY =  size * 0.35;

  const placed = [];
  let cursor = 0;
  for (const seg of segments) {
    const fs = seg.style === 'normal' ? size : smallSize;
    const yOff =
      seg.style === 'sub' ? subOffsetY :
      seg.style === 'sup' ? supOffsetY : 0;
    // Split into characters so inter-glyph spacing is uniform.
    const chars = [...seg.text];
    for (let i = 0; i < chars.length; i++) {
      const { geom, width } = buildSegmentGeometry(chars[i], font, fs, depth, bevel);
      geom.translate(cursor, yOff, 0);
      placed.push(geom);
      cursor += width + (i === chars.length - 1 ? 0 : spacing);
    }
    // Also apply spacing between segments (between base → sub, sub → base, etc.).
    cursor += spacing;
  }
  // The last segment added a trailing spacing — drop it.
  if (segments.length > 0) cursor -= spacing;

  // Fast path for a single segment — avoid the merge overhead.
  let merged;
  if (placed.length === 1) {
    merged = placed[0];
  } else {
    merged = BufferGeometryUtils.mergeGeometries(placed, false);
    // mergeGeometries copies buffers — safe to free the source geometries.
    placed.forEach((g) => g.dispose());
    if (!merged) return null;
  }

  // Re-center at origin.
  merged.computeBoundingBox();
  const bb = merged.boundingBox;
  if (bb) {
    merged.translate(
      -(bb.max.x + bb.min.x) / 2,
      -(bb.max.y + bb.min.y) / 2,
      0
    );
  }
  return merged;
}

/**
 * Build a 3D text mesh oriented to sit on (or inside) the given face.
 *
 * @param {object} faceMeta  - { centroid, normal, label, inradius }
 * @param {THREE.Font} font
 * @param {object} config    - { printMode, textDepth, textSize, textBevel, textColor }
 */
export function buildFaceTextMesh(faceMeta, font, config) {
  const { label, centroid, normal, inradius } = faceMeta;
  if (!label) return null;

  // Base size scaled to fit the face's inscribed circle, then user-scaled.
  const baseSize = Math.max(inradius * 0.7, 0.15);
  const size = baseSize * (config.textSize ?? 1.0);

  const depth = config.textDepth ?? 0.08;
  const bevel = Math.min(config.textBevel ?? 0, depth * 0.4);

  const spacing = config.charSpacing ?? 0;
  const geom = buildTextGeometry(label, font, { size, depth, bevel, spacing });
  if (!geom) return null;

  // Auto-fit: if the rendered text is wider than the face can hold, scale it
  // down uniformly in-plane so chem strings like "SO_4^{2-}" still fit on a
  // d20 triangle face. Depth (+Z) is preserved so engraving depth stays fixed.
  geom.computeBoundingBox();
  const gb = geom.boundingBox;
  if (gb) {
    const w = gb.max.x - gb.min.x;
    const h = gb.max.y - gb.min.y;
    const maxW = inradius * 1.65;
    const maxH = inradius * 1.65;
    const k = Math.min(1, maxW / Math.max(w, 1e-6), maxH / Math.max(h, 1e-6));
    if (k < 1) geom.scale(k, k, 1);
  }

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.textColor),
    roughness: 0.55,
    metalness: config.metallic ? 0.6 : 0.05,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Orient mesh's local +Z to match the face normal (outward).
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal.clone().normalize()
  );
  mesh.quaternion.copy(q);

  // Position depends on mode:
  //  - emboss: base (z=0) at the face surface, so text extrudes outward.
  //  - engrave: the text body must clearly pass through the face surface so
  //             CSG has a clean non-coplanar intersection (coplanar caps
  //             routinely produce empty results). We push the text a bit
  //             further in so the front cap pokes just outside the die.
  const pos = centroid.clone();
  if (config.printMode === 'engrave') {
    const overshoot = Math.max(depth * 0.15, 0.01);
    pos.addScaledVector(normal, -(depth - overshoot));
  } else {
    // tiny offset to avoid z-fighting with the face itself
    pos.addScaledVector(normal, 0.002);
  }
  mesh.position.copy(pos);

  mesh.userData.isText3D = true;
  mesh.userData.faceIndex = faceMeta.faceIndex;
  mesh.userData.depth = depth;
  return mesh;
}

/* -------------------------- CSG for engraving -------------------------- */

let cachedCSG = null;
let csgLoadAttempted = false;
async function loadCSG() {
  if (cachedCSG) return cachedCSG;
  if (csgLoadAttempted) return null; // don't hammer the network if it failed once
  csgLoadAttempted = true;
  try {
    const mod = await import('three-bvh-csg');
    if (!mod || !mod.Brush || !mod.Evaluator || !mod.SUBTRACTION) {
      console.warn('[dice] three-bvh-csg loaded but missing expected exports:', Object.keys(mod || {}));
      return null;
    }
    cachedCSG = mod;
    console.log('[dice] three-bvh-csg loaded.');
    return cachedCSG;
  } catch (e) {
    console.warn('[dice] three-bvh-csg failed to load:', e);
    return null;
  }
}

/**
 * Subtract each label's TextGeometry from the die body and replace the die
 * mesh's geometry with the result. Returns true on success, false on any
 * failure — caller should show texture labels as a fallback.
 */
async function applyEngravingCSG(diceGroup, font, config) {
  const csg = await loadCSG();
  if (!csg) {
    console.warn('[dice] engrave skipped: three-bvh-csg unavailable');
    return false;
  }
  const { Brush, Evaluator, SUBTRACTION } = csg;

  const dieMesh = diceGroup.userData.dieMesh;
  if (!diceGroup.userData.originalDieGeometry) {
    diceGroup.userData.originalDieGeometry = dieMesh.geometry.clone();
  }

  // Build temp text meshes (not added to scene) to harvest geometry + transform.
  const textSubtractors = [];
  for (const meta of diceGroup.userData.faces) {
    const mesh = buildFaceTextMesh(meta, font, config);
    if (!mesh) continue;
    mesh.updateMatrixWorld(true);
    textSubtractors.push(mesh);
  }
  if (textSubtractors.length === 0) {
    console.warn('[dice] engrave skipped: no labels to engrave');
    return false;
  }

  try {
    const evaluator = new Evaluator();
    // Only track position + normal. Without this the evaluator walks every
    // attribute the brushes declare, and mismatched attributes (die has no UV,
    // TextGeometry does) throw `Cannot read properties of undefined (reading 'array')`.
    evaluator.attributes = ['position', 'normal'];
    evaluator.useGroups = false;

    // Strip any attribute beyond position/normal and re-derive normals if needed.
    // Both brushes must have exactly the same attribute set.
    const prepGeom = (g) => {
      const out = g.clone();
      for (const attr of Object.keys(out.attributes)) {
        if (attr !== 'position' && attr !== 'normal') out.deleteAttribute(attr);
      }
      if (!out.attributes.normal) out.computeVertexNormals();
      return out;
    };

    // Feed the die body at identity transform — its mesh has no rotation/scale
    // and sits at the origin. Each text brush carries its own transform rather
    // than having it baked into the geometry (more robust for Brush's BVH).
    let resultBrush = new Brush(prepGeom(diceGroup.userData.originalDieGeometry));
    resultBrush.updateMatrixWorld();

    for (const t of textSubtractors) {
      const textBrush = new Brush(prepGeom(t.geometry));
      textBrush.position.copy(t.position);
      textBrush.quaternion.copy(t.quaternion);
      textBrush.scale.copy(t.scale);
      textBrush.updateMatrixWorld();
      resultBrush = evaluator.evaluate(resultBrush, textBrush, SUBTRACTION);
    }

    const outGeom = resultBrush.geometry;
    // Empty output = CSG rejected all subtractions (often coplanar boundary bug).
    if (!outGeom || !outGeom.attributes.position || outGeom.attributes.position.count === 0) {
      console.warn('[dice] engrave produced empty geometry');
      return false;
    }
    outGeom.computeVertexNormals();
    dieMesh.geometry.dispose();
    dieMesh.geometry = outGeom;
    return true;
  } catch (err) {
    console.error('[dice] engrave CSG threw:', err);
    return false;
  } finally {
    for (const t of textSubtractors) {
      t.geometry.dispose();
      t.material.dispose();
    }
  }
}

/**
 * Build a flat LineSegments mesh that traces the outline of each labeled
 * character — exactly the silhouette where an engraving would meet the face
 * surface. This is driven by the font's `Shape` / hole data, not from the
 * CSG output, so we avoid tessellation artifacts entirely.
 */
function buildFaceOutlineMesh(faceMeta, font, config) {
  const { label, centroid, normal, inradius } = faceMeta;
  if (!label) return null;

  const segments = parseChem(label).filter((s) => s.text.length > 0);
  if (segments.length === 0) return null;

  const baseSize  = Math.max(inradius * 0.7, 0.15);
  const size      = baseSize * (config.textSize ?? 1.0);
  const smallSize = size * 0.6;
  const subY = -size * 0.25;
  const supY =  size * 0.35;
  const DIV = 12; // curve subdivision count per path
  const spacing = config.charSpacing ?? 0;

  // Accumulate line-segment endpoints for every contour. Each shape's outer
  // ring + holes are emitted as boundary line segments only — no triangulation,
  // so there is literally no way for an interior edge to slip in.
  const positions = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  const pushRing = (pts, xOffset, yOffset) => {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const ax = a.x + xOffset, ay = a.y + yOffset;
      const bx = b.x + xOffset, by = b.y + yOffset;
      positions.push(ax, ay, 0, bx, by, 0);
      if (ax < minX) minX = ax; if (ax > maxX) maxX = ax;
      if (ay < minY) minY = ay; if (ay > maxY) maxY = ay;
    }
  };

  let cursor = 0;
  for (const seg of segments) {
    const fs = seg.style === 'normal' ? size : smallSize;
    const yOff = seg.style === 'sub' ? subY : seg.style === 'sup' ? supY : 0;
    const chars = [...seg.text];

    // Each glyph of the segment is laid out individually so inter-glyph
    // spacing matches the 3D text exactly.
    for (let i = 0; i < chars.length; i++) {
      const shapes = font.generateShapes(chars[i], fs);
      if (!shapes || shapes.length === 0) continue;

      let cMinX = Infinity, cMaxX = -Infinity;
      for (const shape of shapes) {
        const pts = shape.getPoints(DIV);
        for (const p of pts) {
          if (p.x < cMinX) cMinX = p.x;
          if (p.x > cMaxX) cMaxX = p.x;
        }
      }
      const charWidth = isFinite(cMaxX - cMinX) ? cMaxX - cMinX : 0;
      const xOff = cursor - cMinX;

      for (const shape of shapes) {
        pushRing(shape.getPoints(DIV), xOff, yOff);
        for (const hole of shape.holes) {
          pushRing(hole.getPoints(DIV), xOff, yOff);
        }
      }
      cursor += charWidth + (i === chars.length - 1 ? 0 : spacing);
    }
    cursor += spacing;
  }
  if (segments.length > 0) cursor -= spacing;

  if (positions.length === 0) return null;

  // Center the label at (0, 0), then auto-fit uniformly if it overflows the
  // face's inscribed circle (same rules as the 3D text geom).
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w  = maxX - minX;
  const h  = maxY - minY;
  const maxW = inradius * 1.65;
  const maxH = inradius * 1.65;
  const k = Math.min(1, maxW / Math.max(w, 1e-6), maxH / Math.max(h, 1e-6));

  for (let i = 0; i < positions.length; i += 3) {
    positions[i]     = (positions[i]     - cx) * k;
    positions[i + 1] = (positions[i + 1] - cy) * k;
    // positions[i + 2] stays 0 — outline is flat in XY.
  }

  const geom = new LineSegmentsGeometry();
  geom.setPositions(positions);

  const mat = new LineMaterial({
    color: new THREE.Color(config.edgeColor ?? '#1a1a1a'),
    linewidth: EDGE_LINEWIDTH,
    worldUnits: false,
    dashed: false,
    alphaToCoverage: true,
    resolution: new THREE.Vector2(1024, 1024),
  });
  const mesh = new LineSegments2(geom, mat);
  mesh.userData.isTextOutline = true;
  mesh.userData.faceIndex = faceMeta.faceIndex;

  // Lie in the face plane (+Z = face normal) just above the surface.
  mesh.quaternion.copy(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      normal.clone().normalize()
    )
  );
  mesh.position.copy(centroid).addScaledVector(normal, 0.004);
  return mesh;
}

/**
 * Remove any existing text-outline line meshes from the group.
 */
function removeTextOutlines(diceGroup) {
  const toRemove = diceGroup.children.filter((c) => c.userData.isTextOutline);
  for (const m of toRemove) {
    diceGroup.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
}

/**
 * Restore the die to its un-engraved geometry (if it was previously engraved).
 * The edge overlay (die corners) is built once in buildDiceMesh from the plain
 * polyhedron and never regenerated, so it stays clean through mode changes.
 */
function restoreOriginalDie(diceGroup) {
  const orig = diceGroup.userData.originalDieGeometry;
  if (!orig) return;
  const dieMesh = diceGroup.userData.dieMesh;
  dieMesh.geometry.dispose();
  dieMesh.geometry = orig.clone();
}

/**
 * Attach or refresh 3D text on a dice group based on the print mode.
 *
 *   flat    → texture labels visible, no 3D text.
 *   emboss  → raised TextGeometry meshes on top of each face (texture labels hidden).
 *   engrave → CSG-subtract each text shape from the die body so faces have real
 *             sunken indentations (texture labels hidden). Falls back gracefully
 *             to plain texture labels if the CSG library can't be loaded.
 *
 * `forceBuild` keeps 3D text meshes around (without CSG) for downstream export
 * code in emboss fallback paths.
 */
export async function applyPrintMode(diceGroup, font, config, forceBuild = false) {
  // Remove any existing 3D text meshes (for emboss mode).
  const toRemove = diceGroup.children.filter((c) => c.userData.isText3D);
  for (const m of toRemove) {
    diceGroup.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  // Also clear any prior text-outline line meshes.
  removeTextOutlines(diceGroup);

  // Undo any prior engraving by restoring the original die geometry.
  restoreOriginalDie(diceGroup);

  const hasFont = !!font;
  const mode = hasFont ? (config.printMode ?? 'flat') : 'flat';

  // Texture labels are visible only when the die has no 3D text features.
  const showTextureLabels = mode === 'flat';
  for (const meta of diceGroup.userData.faces) {
    if (meta.labelMesh) meta.labelMesh.visible = showTextureLabels && !!meta.label;
  }

  if (mode === 'emboss' || forceBuild) {
    // Build raised 3D text meshes sitting on each face.
    for (const meta of diceGroup.userData.faces) {
      const mesh = buildFaceTextMesh(meta, font, { ...config, printMode: 'emboss' });
      if (mesh) {
        diceGroup.add(mesh);
        meta.textMesh = mesh;
      }
    }
    return;
  }

  if (mode === 'engrave') {
    // Subtract label geometry from the die body so the preview shows real
    // sunken indentations. This can take a few hundred ms on complex dice.
    const ok = await applyEngravingCSG(diceGroup, font, config);
    if (!ok) {
      // CSG unavailable or failed → fall back to showing texture labels.
      for (const meta of diceGroup.userData.faces) {
        if (meta.labelMesh) meta.labelMesh.visible = !!meta.label;
      }
      return 'engrave-fallback';
    }
    // Trace the character outline on top of each engraved face so you see the
    // silhouette of the engraving — only the character edge, not the tessellation.
    const showEdges = config.showEdges !== false;
    for (const meta of diceGroup.userData.faces) {
      const outline = buildFaceOutlineMesh(meta, font, config);
      if (outline) {
        outline.visible = showEdges;
        diceGroup.add(outline);
      }
    }
    return 'engrave-ok';
  }

  // mode === 'flat' — nothing more to do; texture labels are already shown.
  return mode;
}

/**
 * Compute the largest axis-aligned extent of a mesh's geometry in "dice units".
 * Used to convert the user's print-size (mm) into an output scale factor.
 */
export function getMeshExtent(mesh) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  return Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
}
