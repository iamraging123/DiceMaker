/**
 * main.js
 * -------
 * Entry point. Wires together:
 *   - Scene (Three.js camera/renderer/controls/lights)
 *   - Dice geometry + mesh builder
 *   - UI (sidebar inputs, buttons, face list)
 *   - Rolling animation
 *   - Export helpers (PNG, GLTF, OBJ, JSON, shared link)
 *
 * State lives in a single plain object, mirrored into the DOM via UI.syncFromState().
 */

import { Scene } from './scene.js';
import { getDiceData, buildCustomDice } from './diceData.js';
import { buildDiceMesh, updateDiceColors, updateFaceLabel, disposeDice } from './diceMesh.js';
import { rollDice } from './animator.js';
import { UI } from './ui.js';
import {
  exportPNG, exportSTL,
  exportConfigJSON, readConfigFile,
  encodeShareLink, decodeShareHash,
} from './exporter.js';
import { loadFont, getFont, applyPrintMode } from './printable.js';

const canvas = document.getElementById('canvas');
const scene = new Scene(canvas);

// ---------- Initial state ----------
const state = {
  type: 'd6',
  faceColor: '#f4f1ec',
  edgeColor: '#1a1a1a',
  textColor: '#1a1a1a',
  bgColor:   '#f5f4f0',
  showEdges: true,
  metallic:  false,
  labels:    ['1', '2', '3', '4', '5', '6'],
  custom:    null, // { vertices, faces }

  // 3D-print / text geometry — only engrave is exposed in the UI.
  printMode:    'engrave',
  textDepth:    0.08,       // in dice units (before mm scaling)
  textSize:     1.0,        // multiplier on auto-fit size
  textBevel:    0,          // bevel thickness applied to text geometry
  printSizeMM:  20,         // target largest extent in mm for STL export
};

// Apply shared config from URL hash (takes precedence over defaults)
const shared = decodeShareHash();
if (shared && typeof shared === 'object') {
  Object.assign(state, shared);
}

scene.setBackground(state.bgColor);

// ---------- UI wiring ----------
const ui = new UI({
  state,
  onChange: (what) => handleChange(what),
  onRoll: () => handleRoll(),
  onReset: () => scene.resetCamera(),
  onExportPNG: () => exportPNG(scene.renderer, `dice-${state.type}.png`),
  onSaveJSON: () => exportConfigJSON(state, `dice-${state.type}-config.json`),
  onLoadJSON: async (file) => {
    try {
      const loaded = await readConfigFile(file);
      Object.assign(state, loaded);
      ui.syncFromState();
      rebuildDice(true);
      ui.toast('Configuration loaded');
    } catch (e) {
      ui.toast('Failed to load config: ' + e.message, 2600);
    }
  },
  onShare: async () => {
    const link = encodeShareLink(state);
    try {
      await navigator.clipboard.writeText(link);
      ui.toast('Share link copied to clipboard');
    } catch {
      ui.toast('Share link: ' + link, 4000);
    }
  },
  onExportSTL: async ({ binary }) => {
    if (!scene.diceGroup) return;
    // Flat mode has no labels, so fall back to emboss for the export.
    const mode = state.printMode === 'flat' ? 'emboss' : state.printMode;

    // Make sure the font is loaded and the current die geometry matches the
    // export mode (engrave needs CSG applied to the die body).
    try {
      await loadFont();
    } catch {
      ui.toast('Font failed to load — cannot export STL with text.', 3000);
      return;
    }
    ui.setPrintStatus(
      mode === 'engrave' ? 'Engraving (CSG subtraction)…' : 'Generating STL…'
    );
    // Wait for any in-flight engrave preview to settle, then apply the export mode.
    if (engraveInFlight) await engraveInFlight;
    await applyPrintMode(scene.diceGroup, getFont(), { ...state, printMode: mode }, false);

    try {
      await exportSTL(scene.diceGroup, {
        mode,
        printSizeMM: state.printSizeMM,
        binary,
        filename: `dice-${state.type}-${state.printSizeMM}mm${binary ? '' : '-ascii'}.stl`,
      });
      ui.setPrintStatus(`STL saved (${state.printSizeMM} mm, ${mode}).`);
      ui.toast('STL exported');
    } catch (e) {
      console.error(e);
      ui.setPrintStatus('STL export failed: ' + e.message);
      ui.toast('STL export failed', 2600);
    } finally {
      // Restore the preview back to whatever the user had selected.
      await applyPrintMode(scene.diceGroup, getFont(), state);
    }
  },
});

// ---------- Build dice ----------
function getData() {
  if (state.type === 'custom' && state.custom) {
    return buildCustomDice(state.custom.vertices, state.custom.faces);
  }
  if (state.type === 'custom') {
    // Fallback to d6 until the user supplies custom data.
    return getDiceData('d6');
  }
  return getDiceData(state.type);
}

/**
 * Rebuild the dice group from scratch and install it into the scene.
 * Called on shape change or when loading a config.
 */
function rebuildDice(preserveLabelsIfMatching = false) {
  const data = getData();
  // Initialize labels from defaults when the face count changed or no existing labels.
  if (!preserveLabelsIfMatching || state.labels.length !== data.faces.length) {
    state.labels = [...data.defaultLabels];
  } else {
    // Pad/truncate stored labels to match face count.
    while (state.labels.length < data.faces.length) {
      state.labels.push(data.defaultLabels[state.labels.length] ?? '');
    }
    state.labels.length = data.faces.length;
  }

  if (scene.diceGroup) {
    disposeDice(scene.diceGroup);
    scene.setDice(null);
  }

  const group = buildDiceMesh(data, {
    faceColor: state.faceColor,
    edgeColor: state.edgeColor,
    textColor: state.textColor,
    showEdges: state.showEdges,
    metallic:  state.metallic,
    labels:    state.labels,
  });
  scene.setDice(group);
  ui.rebuildFaceList(state.labels);

  // Apply 3D print mode (emboss/engrave) if font is loaded.
  applyPrintMode(group, getFont(), state);
}

/**
 * Ensure the font is loaded, then refresh 3D text meshes using the given state.
 * Returns the promise that completes when CSG / text-mesh build is done.
 */
async function ensureFontThenApply(st = state) {
  try {
    await loadFont();
  } catch (e) {
    ui.setPrintStatus('Font failed to load — 3D text disabled.');
    return;
  }
  if (!scene.diceGroup) return;
  if (st.printMode === 'engrave') ui.setPrintStatus('Engraving preview…');
  const outcome = await applyPrintMode(scene.diceGroup, getFont(), st);
  if (outcome === 'engrave-ok') {
    ui.setPrintStatus(`Ready — engraved, ${st.printSizeMM} mm.`);
  } else if (outcome === 'engrave-fallback') {
    ui.setPrintStatus('Engrave CSG unavailable — showing flat labels. See console.');
    ui.toast('Engrave CSG failed — check browser console', 3500);
  } else {
    ui.setPrintStatus(`Ready — ${st.printMode} mode, ${st.printSizeMM} mm.`);
  }
}

// Debounce engraving refreshes triggered by slider drags so we don't rerun
// CSG on every pixel of motion. Also guards against overlapping runs.
let engraveTimer = null;
let engraveInFlight = null;
function scheduleRefresh(immediate = false) {
  clearTimeout(engraveTimer);
  const delay = (state.printMode === 'engrave' && !immediate) ? 220 : 0;
  engraveTimer = setTimeout(async () => {
    if (engraveInFlight) await engraveInFlight;
    engraveInFlight = ensureFontThenApply().finally(() => {
      engraveInFlight = null;
    });
  }, delay);
}

// ---------- Change dispatcher ----------
function handleChange(what) {
  if (what === 'shape' || what === 'customShape') {
    rebuildDice();
    return;
  }
  if (what === 'bg') {
    scene.setBackground(state.bgColor);
    return;
  }
  if (what === 'colors' || what === 'edges' || what === 'metallic') {
    if (scene.diceGroup) {
      updateDiceColors(scene.diceGroup, {
        faceColor: state.faceColor,
        edgeColor: state.edgeColor,
        textColor: state.textColor,
        showEdges: state.showEdges,
        metallic:  state.metallic,
      });
    }
    return;
  }
  if (what.startsWith('label:')) {
    const i = parseInt(what.slice(6), 10);
    if (scene.diceGroup) {
      updateFaceLabel(scene.diceGroup, i, state.labels[i], state.textColor);
    }
    // Also refresh the 3D text / engraving for that face, if applicable.
    if (state.printMode !== 'flat') scheduleRefresh();
    return;
  }
  if (what === 'printMode') {
    // Mode switches should feel instant.
    scheduleRefresh(true);
    return;
  }
  if (what === 'printOpts') {
    // Slider drags — debounced so engrave CSG doesn't thrash.
    scheduleRefresh();
    return;
  }
  if (what === 'printSize') {
    // Update the in-viewport scale bar; export scale comes from state.printSizeMM.
    scene.scaleBar.updateSize(state.printSizeMM);
    return;
  }
}

// ---------- Roll handler ----------
let rolling = false;
async function handleRoll() {
  if (rolling || !scene.diceGroup) return;
  rolling = true;
  const result = await rollDice(scene.diceGroup);
  rolling = false;
  if (result) ui.showResult(result.label || `Face ${result.faceIndex + 1}`);
}

// ---------- Startup ----------
ui.syncFromState();
rebuildDice(true);
scene.scaleBar.updateSize(state.printSizeMM);
scene.start();

// Kick off font load in the background; once done, add 3D text to the
// current dice group if the user's mode requires it.
ui.setPrintStatus('Loading font for 3D text…');
loadFont()
  .then(() => {
    if (scene.diceGroup) applyPrintMode(scene.diceGroup, getFont(), state);
    ui.setPrintStatus(`Ready — ${state.printMode} mode, ${state.printSizeMM} mm.`);
  })
  .catch((e) => {
    console.warn('Font failed to load:', e);
    ui.setPrintStatus('Font load failed; flat mode only.');
  });

// Expose for debugging in DevTools.
window.__dice = { scene, state, ui };
