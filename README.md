# Dice Maker — 3D Polyhedral Dice Designer

An interactive web app for designing and customizing 3D polyhedral dice JavaScript, HTML, CSS and [Three.js](https://threejs.org/).

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
- **Per-face text labels** add text with sub and superscript
- **Color customization** for faces, edges, text, and background
- **Metallic finish toggle** and optional edge wireframe
- **Kinematic roll animation** — click *Roll* to tumble the die and land on a random face
- **3D-print-ready geometry** with real extruded text (not textures):
  - **Embossed** (raised) or **Engraved** (sunken — cut via boolean CSG) labels
  - Adjustable **text depth**, **text size**, and **text bevel**
  - Configurable **print size in millimeters** — STL exports slicer-ready
- **Export**:
  - `STL` — binary or ASCII, sized in mm for 3D printing
  - `JSON` configuration save/load (usefullf for sharin/saving!)
- **Share link** — copies a self-contained URL encoding your design into the hash fragment

## License

dont take my code or use it without my permission or do anything commercial pls!
