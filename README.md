# Dice Maker — 3D Polyhedral Dice Designer

An interactive web app for designing and customizing 3D polyhedral dice. Built with vanilla JavaScript, HTML, CSS and [Three.js](https://threejs.org/). No build step required.

## Features

- **7 built-in dice shapes** + arbitrary custom polyhedra:
  - `d3`  Triangular prism
  - `d4`  Tetrahedron
  - `d6`  Cube
  - `d8`  Octahedron
  - `d10` Pentagonal trapezohedron
  - `d12` Dodecahedron
  - `d20` Icosahedron
  - `custom` Paste any vertex/face list
- **Live 3D preview** — orbit, zoom, pan (OrbitControls)
- **Per-face text labels** with instant update as you type
- **Color customization** for faces, edges, text, and background
- **Metallic finish toggle** and optional edge wireframe
- **Kinematic roll animation** — click *Roll* to tumble the die and land on a random face
- **3D-print-ready geometry** with real extruded text (not textures):
  - **Embossed** (raised) or **Engraved** (sunken — cut via boolean CSG) labels
  - Adjustable **text depth**, **text size**, and **text bevel**
  - Configurable **print size in millimeters** — STL exports slicer-ready
- **Export**:
  - `STL` — binary or ASCII, sized in mm for 3D printing
  - `PNG` screenshot of the current view
  - `GLTF` 3D model
  - `OBJ` 3D model
  - `JSON` configuration save/load
- **Share link** — copies a self-contained URL encoding your design into the hash fragment
- **Responsive layout** — collapsible sidebar on mobile

## Running locally

The app uses ES modules with an import map, so it must be served over HTTP (opening `index.html` directly from disk will not work).

Any static file server will do. For example:

```bash
# Python 3
python -m http.server 8000

# Node.js (one-liner, no install needed)
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Then open http://localhost:8000 in a modern browser (Chrome, Firefox, Edge, Safari).

> Three.js is loaded from the `unpkg` CDN via the import map in `index.html`. A network connection is required on first load; browsers then cache it.

## Project layout

```
DiceMakerWeb/
├── index.html              # App shell + importmap
├── css/
│   └── styles.css          # Card-based UI styling
└── js/
    ├── main.js             # Entry point, orchestrates everything
    ├── scene.js            # Three.js scene, camera, renderer, controls, lighting
    ├── diceData.js         # Vertex/face data for each polyhedron (dynamic)
    ├── diceMesh.js         # Builds the THREE.Group from dice data + config
    ├── faceTexture.js      # Generates canvas-backed label textures
    ├── printable.js        # Font loader + extruded TextGeometry per face
    ├── animator.js         # Rolling animation (no physics engine needed)
    ├── ui.js               # Sidebar/controls DOM bindings
    └── exporter.js         # PNG/GLTF/OBJ/STL/JSON + CSG + share link helpers
```

## Custom polyhedra

Select **Custom Polyhedron** from the shape dropdown to paste vertex/face data:

```
Vertices (one per line):
1, 1, 1
-1, -1, 1
-1, 1, -1
1, -1, -1

Faces (vertex indices per line, >= 3 indices):
0, 1, 2
0, 2, 3
0, 3, 1
1, 3, 2
```

Each face may be any convex polygon. Face winding is auto-corrected so normals point outward (assuming the shape is roughly centered at the origin).

## 3D printing

Use the **3D Print** sidebar card to configure real geometry (not textures) for each face label, then click **Export STL**.

- **Text Style**
  - `Flat` — screen preview only, no 3D text. STL export auto-switches to *Embossed* so the printed die has labels.
  - `Embossed` — labels become raised `TextGeometry` meshes sitting on each face (real 3D geometry, visible in the preview).
  - `Engraved` — labels are boolean-subtracted from the die body in the **live preview** (via [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg)), so you see real sunken indentations as you edit. STL export uses the same engraved geometry. Slider drags are debounced so CSG doesn't re-run on every pixel of motion.
- **Text depth** — how far the text extrudes outward (emboss) or into the face (engrave), in dice units.
- **Text size** — multiplier on the auto-fit size (fills the face's inscribed circle by default).
- **Text bevel** — adds a small chamfer to the edges of the text for cleaner slicing.
- **Print size (mm)** — target extent of the largest axis. The exporter scales the mesh so the output is exactly that size in millimeters (slicer default units).

Export produces a binary STL by default; use **STL (ASCII)** if your tool chain needs text-encoded STL.

### Print tips

- Start with `0.6–1.0 mm` text depth in real units (e.g. `0.03–0.05` in dice units for a 20 mm die).
- For FDM printing, a small bevel (`~0.005`) helps avoid stringy transitions between body and text.
- For resin printing, engraved text prints cleaner than very fine embossing.

## Tech notes

- **Dynamic geometry** — regular polyhedra reuse `THREE.TetrahedronGeometry`, `BoxGeometry`, etc., and faces are extracted by grouping coplanar triangles. The d3 prism and d10 trapezohedron are constructed by hand.
- **Labels** use two parallel representations: a canvas texture on a plane for *Flat* mode, and an extruded `TextGeometry` mesh per face for *Embossed* / *Engraved* modes. The texture plane is hidden automatically when 3D text is active.
- **CSG engraving** runs in the preview (debounced during slider drags); the original un-engraved die geometry is stashed in `userData` so switching modes restores it cheaply.
- **Rolling** is a quaternion slerp toward the target "face up" orientation plus a decaying tumble around a random axis. No physics engine needed.
- **Share links** encode the full state (shape, colors, labels, print options, custom geometry) as URL-safe base64 in the `#share=…` hash.

## Browser support

Requires a browser with ES module, import map, and WebGL 2 support. Tested on current Chrome, Firefox, Safari, and Edge.

## License

MIT — do whatever you like with the code.
