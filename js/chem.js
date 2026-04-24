/**
 * chem.js
 * -------
 * Parse TeX-style chemistry markup into a list of typeset segments.
 *
 *   "H_2O"       -> [H], [sub 2], [O]
 *   "CO_2"       -> [CO], [sub 2]
 *   "SO_4^{2-}"  -> [SO], [sub 4], [sup 2-]
 *   "Ca^{2+}"    -> [Ca], [sup 2+]
 *   "NO_3^-"     -> [NO], [sub 3], [sup -]
 *
 * Syntax:
 *   _x       single-character subscript
 *   _{xyz}   multi-character subscript
 *   ^x       single-character superscript
 *   ^{xyz}   multi-character superscript
 *
 * Escape a literal `_` or `^` with a backslash: `a\_b` → `a_b`.
 */

/** @returns {{text: string, style: 'normal'|'sub'|'sup'}[]} */
export function parseChem(text) {
  const s = String(text ?? '');
  const out = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, style: 'normal' });
    buf = '';
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      // escape next char — pass through literally
      buf += s[i + 1];
      i++;
      continue;
    }
    if (ch === '_' || ch === '^') {
      flush();
      const style = ch === '_' ? 'sub' : 'sup';
      let content;
      if (s[i + 1] === '{') {
        const end = s.indexOf('}', i + 2);
        if (end === -1) {
          content = s.slice(i + 2);
          i = s.length;
        } else {
          content = s.slice(i + 2, end);
          i = end;
        }
      } else {
        content = s[i + 1] ?? '';
        if (content) i++;
      }
      if (content) out.push({ text: content, style });
      continue;
    }
    buf += ch;
  }
  flush();
  return out;
}

/** True if the raw label contains sub/superscript markup. */
export function hasChemMarkup(text) {
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue; }
    if (s[i] === '_' || s[i] === '^') return true;
  }
  return false;
}
