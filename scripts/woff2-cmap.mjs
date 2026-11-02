// The code points a woff2 file maps (its `cmap`), with nothing but node:zlib
// (SDL-774). Used by scripts/fetch-site-fonts.mjs to measure Kazakh coverage
// and by the studio tests to check the committed files against that claim.
//
// WOFF2 (W3C, §4–5): a 48-byte header, a table directory of variable-length
// entries, then ONE Brotli stream with the tables back to back (no padding),
// each `transformLength` long when transformed, else `origLength`. `cmap` is
// never transformed. Only `glyf`/`loca` (known-tag indexes 10/11) are
// transformed at version 0; every other table is transformed at a non-zero version.

import { brotliDecompressSync } from "node:zlib";

function base128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const b = buf[pos.at++];
    value = value * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) return value;
  }
  throw new Error("woff2: bad UIntBase128");
}

/** The decompressed `cmap` table of a woff2 buffer. */
function cmapTable(buf) {
  if (buf.toString("latin1", 0, 4) !== "wOF2") throw new Error("not a woff2 file");
  const numTables = buf.readUInt16BE(12);
  const pos = { at: 48 };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos.at++];
    const tagIndex = flags & 0x3f;
    let tag = null;
    if (tagIndex === 63) {
      tag = buf.toString("latin1", pos.at, pos.at + 4);
      pos.at += 4;
    }
    const version = flags >> 6;
    const origLength = base128(buf, pos);
    const glyfLoca = tagIndex === 10 || tagIndex === 11;
    const transformed = glyfLoca ? version === 0 : version !== 0;
    const length = transformed ? base128(buf, pos) : origLength;
    tables.push({ isCmap: tagIndex === 0 || tag === "cmap", length });
  }
  const data = brotliDecompressSync(buf.subarray(pos.at));
  let offset = 0;
  for (const t of tables) {
    if (t.isCmap) return data.subarray(offset, offset + t.length);
    offset += t.length;
  }
  throw new Error("woff2: no cmap");
}

/** Every code point the font maps to a glyph (formats 4 and 12 of the Unicode subtables). */
export function woff2CodePoints(buf) {
  const cmap = cmapTable(buf);
  const out = new Set();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    const off = cmap.readUInt32BE(8 + i * 8);
    if (!(platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10)))) continue;
    const format = cmap.readUInt16BE(off);
    if (format === 4) {
      const segX2 = cmap.readUInt16BE(off + 6);
      const ends = off + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = cmap.readUInt16BE(ends + s * 2);
        const start = cmap.readUInt16BE(starts + s * 2);
        const delta = cmap.readInt16BE(deltas + s * 2);
        const ro = cmap.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph;
          if (ro === 0) glyph = (c + delta) & 0xffff;
          else {
            const g = cmap.readUInt16BE(ranges + s * 2 + ro + (c - start) * 2);
            glyph = g === 0 ? 0 : (g + delta) & 0xffff;
          }
          if (glyph !== 0) out.add(c);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(off + 12);
      for (let g = 0; g < groups; g++) {
        const start = cmap.readUInt32BE(off + 16 + g * 12);
        const end = cmap.readUInt32BE(off + 20 + g * 12);
        const glyph = cmap.readUInt32BE(off + 24 + g * 12);
        for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) out.add(c);
      }
    }
  }
  return out;
}

/** The nine letters of the Kazakh alphabet beyond Russian, upper and lower case. */
export const KAZAKH_LETTERS = "ӘәҒғҚқҢңӨөҰұҮүҺһІі";
