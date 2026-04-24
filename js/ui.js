/**
 * ui.js
 * -----
 * Binds DOM controls to a state object and notifies a callback whenever state
 * changes. Also renders the face-label input list when the shape or face
 * count changes.
 */

const SHAPE_LABELS = {
  d3: 'd3', d4: 'd4', d6: 'd6', d8: 'd8',
  d10: 'd10', d12: 'd12', d20: 'd20', custom: 'dN',
};

export class UI {
  /**
   * @param {object} options
   *   state:    mutable state object
   *   onChange: (what) => void  — called with 'shape' | 'colors' | 'label:N' | 'edges' | 'metallic' | 'bg' | 'customShape'
   *   onRoll, onReset, onExportPNG, onExportGLTF, onExportOBJ, onSaveJSON, onLoadJSON, onShare
   */
  constructor(options) {
    this.state = options.state;
    this.onChange = options.onChange || (() => {});
    this.options = options;

    this.els = {
      shapeSelect: document.getElementById('shape-select'),
      shapeBadge:  document.getElementById('shape-badge'),
      faceList:    document.getElementById('face-list'),
      faceCount:   document.getElementById('face-count'),
      faceColor:   document.getElementById('face-color'),
      edgeColor:   document.getElementById('edge-color'),
      textColor:   document.getElementById('text-color'),
      bgColor:     document.getElementById('bg-color'),
      showEdges:   document.getElementById('show-edges'),
      metallic:    document.getElementById('metallic'),
      rollBtn:     document.getElementById('roll-btn'),
      resetBtn:    document.getElementById('reset-btn'),
      pngBtn:      document.getElementById('export-png'),
      saveBtn:     document.getElementById('save-config'),
      loadBtn:     document.getElementById('load-config'),
      loadFile:    document.getElementById('load-file'),
      shareBtn:    document.getElementById('share-link'),
      customPanel: document.getElementById('custom-panel'),
      customVerts: document.getElementById('custom-vertices'),
      customFaces: document.getElementById('custom-faces'),
      applyCustom: document.getElementById('apply-custom'),
      resultPill:  document.getElementById('result-pill'),
      rolledValue: document.getElementById('rolled-value'),
      toast:       document.getElementById('toast'),
      sidebar:     document.getElementById('sidebar'),
      sidebarToggle: document.getElementById('sidebar-toggle'),
      openSidebar: document.getElementById('open-sidebar'),

      // 3D print controls
      printMode:        document.getElementById('print-mode'),
      textDepth:        document.getElementById('text-depth'),
      textDepthVal:     document.getElementById('text-depth-val'),
      textSize:         document.getElementById('text-size'),
      textSizeVal:      document.getElementById('text-size-val'),
      charSpacing:      document.getElementById('char-spacing'),
      charSpacingVal:   document.getElementById('char-spacing-val'),
      printSize:        document.getElementById('print-size'),
      printSizeVal:     document.getElementById('print-size-val'),
      exportSTL:        document.getElementById('export-stl'),
      exportSTLAscii:   document.getElementById('export-stl-ascii'),
    };

    this._bind();
  }

  _bind() {
    const { els, state } = this;

    els.shapeSelect.addEventListener('change', () => {
      state.type = els.shapeSelect.value;
      els.customPanel.classList.toggle('hidden', state.type !== 'custom');
      this.onChange('shape');
    });

    const colorInputs = [
      [els.faceColor, 'faceColor', 'colors'],
      [els.edgeColor, 'edgeColor', 'colors'],
      [els.textColor, 'textColor', 'colors'],
      [els.bgColor,   'bgColor',   'bg'],
    ];
    for (const [el, key, evt] of colorInputs) {
      if (!el) continue;
      el.addEventListener('input', () => {
        state[key] = el.value;
        this.onChange(evt);
      });
    }

    if (els.showEdges) {
      els.showEdges.addEventListener('change', () => {
        state.showEdges = els.showEdges.checked;
        this.onChange('edges');
      });
    }
    if (els.metallic) {
      els.metallic.addEventListener('change', () => {
        state.metallic = els.metallic.checked;
        this.onChange('metallic');
      });
    }

    els.rollBtn.addEventListener('click', () => this.options.onRoll && this.options.onRoll());
    els.resetBtn.addEventListener('click', () => this.options.onReset && this.options.onReset());
    els.pngBtn.addEventListener('click', () => this.options.onExportPNG && this.options.onExportPNG());
    els.saveBtn.addEventListener('click', () => this.options.onSaveJSON && this.options.onSaveJSON());
    els.loadBtn.addEventListener('click', () => els.loadFile.click());
    els.loadFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && this.options.onLoadJSON) this.options.onLoadJSON(file);
      els.loadFile.value = '';
    });
    els.shareBtn.addEventListener('click', () => this.options.onShare && this.options.onShare());

    els.applyCustom.addEventListener('click', () => {
      try {
        const verts = parseCSVMatrix(els.customVerts.value, 3);
        const faces = parseFaceList(els.customFaces.value);
        state.custom = { vertices: verts, faces };
        this.onChange('customShape');
      } catch (err) {
        this.toast('Invalid custom shape: ' + err.message, 3000);
      }
    });

    // Sidebar toggle (mobile)
    const toggleSidebar = () => els.sidebar.classList.toggle('open');
    els.sidebarToggle.addEventListener('click', toggleSidebar);
    els.openSidebar.addEventListener('click', toggleSidebar);

    // ---------- 3D Print controls ----------
    if (els.printMode) {
      els.printMode.addEventListener('change', () => {
        state.printMode = els.printMode.value;
        this.onChange('printMode');
      });
    }

    const bindSlider = (input, valEl, key, format, evtName) => {
      if (!input) return;
      const apply = () => {
        const v = parseFloat(input.value);
        state[key] = v;
        if (valEl) valEl.textContent = format(v);
        this.onChange(evtName);
      };
      input.addEventListener('input', apply);
    };
    bindSlider(els.textDepth, els.textDepthVal, 'textDepth',
      (v) => v.toFixed(2), 'printOpts');
    bindSlider(els.textSize, els.textSizeVal, 'textSize',
      (v) => v.toFixed(2) + '×', 'printOpts');
    bindSlider(els.charSpacing, els.charSpacingVal, 'charSpacing',
      (v) => v.toFixed(2), 'printOpts');
    bindSlider(els.printSize, els.printSizeVal, 'printSizeMM',
      (v) => String(Math.round(v)), 'printSize');

    // (print-size-badge removed — slider's own value label is enough)

    els.exportSTL.addEventListener('click', () =>
      this.options.onExportSTL && this.options.onExportSTL({ binary: true }));
    els.exportSTLAscii.addEventListener('click', () =>
      this.options.onExportSTL && this.options.onExportSTL({ binary: false }));
  }

  setPrintStatus(_msg) {
    // Status element was removed from the UI; this is a no-op now so the rest
    // of the code that calls it keeps working.
  }

  /**
   * Sync all DOM inputs from the current state (used on initial load / after
   * importing JSON or loading a shared link).
   */
  syncFromState() {
    const { els, state } = this;
    els.shapeSelect.value = state.type;
    els.customPanel.classList.toggle('hidden', state.type !== 'custom');
    if (els.faceColor)  els.faceColor.value  = state.faceColor;
    if (els.edgeColor)  els.edgeColor.value  = state.edgeColor;
    if (els.textColor)  els.textColor.value  = state.textColor;
    if (els.bgColor)    els.bgColor.value    = state.bgColor;
    if (els.showEdges)  els.showEdges.checked = state.showEdges !== false;
    if (els.metallic)   els.metallic.checked  = !!state.metallic;
    els.shapeBadge.textContent = SHAPE_LABELS[state.type] || 'dN';

    // Print controls
    if (els.printMode) els.printMode.value = state.printMode ?? 'engrave';
    els.textDepth.value    = state.textDepth ?? 0.08;
    els.textSize.value     = state.textSize ?? 1.0;
    if (els.charSpacing) els.charSpacing.value = state.charSpacing ?? 0;
    els.printSize.value    = state.printSizeMM ?? 20;
    els.textDepthVal.textContent  = (+els.textDepth.value).toFixed(2);
    els.textSizeVal.textContent   = (+els.textSize.value).toFixed(2) + '×';
    if (els.charSpacingVal && els.charSpacing) {
      els.charSpacingVal.textContent = (+els.charSpacing.value).toFixed(2);
    }
    els.printSizeVal.textContent  = String(Math.round(+els.printSize.value));
  }

  /**
   * Rebuild the face-label input list to match the given count.
   */
  rebuildFaceList(labels) {
    const { els } = this;
    els.faceList.innerHTML = '';
    els.faceCount.textContent = `${labels.length} face${labels.length === 1 ? '' : 's'}`;
    labels.forEach((label, i) => {
      const row = document.createElement('div');
      row.className = 'face-input-row';
      row.innerHTML = `
        <div class="face-num">${i + 1}</div>
        <input type="text" value="${escapeHTML(label)}" maxlength="24" data-face="${i}" />
      `;
      els.faceList.appendChild(row);
      const input = row.querySelector('input');
      input.addEventListener('input', () => {
        this.state.labels[i] = input.value;
        this.onChange('label:' + i);
      });
    });
    els.shapeBadge.textContent = SHAPE_LABELS[this.state.type] || 'dN';
  }

  showResult(value) {
    this.els.rolledValue.textContent = value ?? '—';
    this.els.resultPill.hidden = false;
    clearTimeout(this._resultTimer);
    this._resultTimer = setTimeout(() => {
      this.els.resultPill.hidden = true;
    }, 2800);
  }

  toast(message, duration = 1800) {
    const t = this.els.toast;
    t.textContent = message;
    t.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.hidden = true; }, duration);
  }
}

/* ---------------- small parsing helpers for custom shapes ---------------- */

function parseCSVMatrix(text, expectedCols) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const nums = trimmed.split(/[,\s]+/).map(Number);
    if (nums.some(isNaN)) throw new Error(`cannot parse line: ${line}`);
    if (expectedCols && nums.length !== expectedCols) {
      throw new Error(`expected ${expectedCols} values per line, got ${nums.length}`);
    }
    rows.push(nums);
  }
  return rows;
}

function parseFaceList(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const nums = trimmed.split(/[,\s]+/).map((s) => parseInt(s, 10));
    if (nums.some(isNaN) || nums.length < 3) throw new Error(`bad face: ${line}`);
    rows.push(nums);
  }
  return rows;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
