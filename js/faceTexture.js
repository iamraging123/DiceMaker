/**
 * faceTexture.js
 * --------------
 * Generates a transparent CanvasTexture containing a single face label.
 * Supports TeX-style sub/superscripts (via chem.js) so chemistry
 * notation like H_2O, CO_2, SO_4^{2-} renders correctly.
 */

import * as THREE from 'three';
import { parseChem } from './chem.js';

const TEX_SIZE = 256;
const FONT_STACK = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MAX_WIDTH = TEX_SIZE * 0.82;

function measureSegments(ctx, segments, baseSize) {
  let total = 0;
  for (const seg of segments) {
    const fs = seg.style === 'normal' ? baseSize : baseSize * 0.6;
    ctx.font = `600 ${fs}px ${FONT_STACK}`;
    total += ctx.measureText(seg.text).width;
  }
  return total;
}

export function createFaceTexture(text, textColor = '#1a1a1a') {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);

  const segments = parseChem(String(text ?? '').trim());
  if (segments.length === 0) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }

  // Start from a size based on total character count, then shrink to fit.
  const totalChars = segments.reduce((n, s) => n + s.text.length, 0);
  let size = totalChars <= 2 ? 150 : totalChars <= 4 ? 110 : 78;
  while (measureSegments(ctx, segments, size) > MAX_WIDTH && size > 24) size -= 4;

  const smallSize = size * 0.6;
  const totalWidth = measureSegments(ctx, segments, size);
  const cx = TEX_SIZE / 2;
  const cy = TEX_SIZE / 2;

  ctx.fillStyle = textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  let cursor = cx - totalWidth / 2;
  for (const seg of segments) {
    const fs = seg.style === 'normal' ? size : smallSize;
    const yOffset =
      seg.style === 'sub' ? size * 0.28 :
      seg.style === 'sup' ? -size * 0.32 : 0;
    ctx.font = `600 ${fs}px ${FONT_STACK}`;
    ctx.fillText(seg.text, cursor, cy + yOffset);
    cursor += ctx.measureText(seg.text).width;
  }

  // 6/9 disambiguator only for a single-normal-digit label.
  const plain = segments.length === 1 && segments[0].style === 'normal' ? segments[0].text : null;
  if (plain === '6' || plain === '9') {
    ctx.fillRect(cx - 24, cy + size * 0.42, 48, 6);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}
