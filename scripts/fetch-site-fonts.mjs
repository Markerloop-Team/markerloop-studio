#!/usr/bin/env node
// One-off fetch of the site theme's font whitelist (SDL-774, EP-160).
//
//   node scripts/fetch-site-fonts.mjs
//
// Downloads woff2 faces of every whitelisted family — weights 400 and 700,
// style normal, subsets latin + cyrillic + cyrillic-ext (where the family has
// them; cyrillic-ext carries the Kazakh letters Ә Ғ Қ Ң Ө Ү Һ — a family whose
// cyrillic-ext file has none of them does not ship it) — from
// Fontsource (the Google Fonts files, repackaged per subset) into
// apps/site/public/fonts/<id>/<subset>-<weight>.woff2, puts the family's
// license text next to them, and regenerates
// packages/studio/src/site-fonts-data.ts.
//
// Run by hand when the whitelist changes; the result is committed. Neither the
// build nor the running site ever touches the network for fonts.
//
// The list mirrors pages-service `models.ThemeFonts` (the validation source of
// `fonts.heading` / `fonts.body`): same family names, same order, same
// categories. A family here and not there can never be published; a family
// there and not here would render in the fallback stack.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { KAZAKH_LETTERS, woff2CodePoints } from "./woff2-cmap.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "apps/site/public/fonts");
const DATA = path.join(ROOT, "packages/studio/src/site-fonts-data.ts");

/** [family, category] — pages-service internal/models/theme.go `ThemeFonts`. */
const FAMILIES = [
  ["Geist", "sans"],
  ["Inter", "sans"],
  ["Roboto", "sans"],
  ["Open Sans", "sans"],
  ["Montserrat", "sans"],
  ["Raleway", "sans"],
  ["Nunito", "sans"],
  ["Nunito Sans", "sans"],
  ["Rubik", "sans"],
  ["Manrope", "sans"],
  ["Noto Sans", "sans"],
  ["PT Sans", "sans"],
  ["Fira Sans", "sans"],
  ["IBM Plex Sans", "sans"],
  ["Source Sans 3", "sans"],
  ["Work Sans", "sans"],
  ["DM Sans", "sans"],
  ["Plus Jakarta Sans", "sans"],
  ["Lato", "sans"],
  ["Poppins", "sans"],
  ["Merriweather", "serif"],
  ["Lora", "serif"],
  ["Playfair Display", "serif"],
  ["PT Serif", "serif"],
  ["Noto Serif", "serif"],
  ["Source Serif 4", "serif"],
  ["EB Garamond", "serif"],
  ["Cormorant Garamond", "serif"],
  ["Oswald", "display"],
  ["Unbounded", "display"],
  ["JetBrains Mono", "mono"],
];
const WEIGHTS = [400, 700];
const SUBSETS = ["latin", "cyrillic", "cyrillic-ext"];
/** Google's ranges; site-fonts.ts writes these into every @font-face — a family that differs fails the run. */
const RANGES = {
  latin: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  cyrillic: "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116",
  "cyrillic-ext": "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F",
};

const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function fetchOk(url, as = "buffer") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return as === "json" ? res.json() : as === "text" ? res.text() : Buffer.from(await res.arrayBuffer());
}

/** The license text from google/fonts (ofl/ or apache/ or ufl/), else a pointer. */
async function licenseText(family, license) {
  const dir = family.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [folder, file] of [["ofl", "OFL.txt"], ["apache", "LICENSE.txt"], ["ufl", "UFL.txt"]]) {
    const res = await fetch(`https://raw.githubusercontent.com/google/fonts/main/${folder}/${dir}/${file}`);
    if (res.ok) return { text: await res.text(), source: `https://github.com/google/fonts/tree/main/${folder}/${dir}` };
  }
  return { text: `${family} is licensed under ${license}.\n`, source: "https://fonts.google.com/specimen/" + family.replace(/ /g, "+") };
}

const rows = [];
let total = 0;
for (const [family, category] of FAMILIES) {
  const id = slug(family);
  const meta = await fetchOk(`https://api.fontsource.org/v1/fonts/${id}`, "json");
  if (meta.family !== family) throw new Error(`${id}: Fontsource names it "${meta.family}", expected "${family}"`);
  const subsets = SUBSETS.filter((s) => meta.subsets.includes(s));
  if (!subsets.includes("latin")) throw new Error(`${family}: no latin subset`);
  for (const s of subsets) if (meta.unicodeRange[s] !== RANGES[s]) throw new Error(`${family}: ${s} range ${meta.unicodeRange[s]} differs from site-fonts.ts`);
  for (const w of WEIGHTS) if (!meta.weights.includes(w)) throw new Error(`${family}: no weight ${w}`);
  await rm(path.join(OUT, id), { recursive: true, force: true });
  await mkdir(path.join(OUT, id), { recursive: true });
  const files = {};
  for (const subset of subsets) {
    for (const weight of WEIGHTS) {
      const url = meta.variants[String(weight)].normal[subset].url.woff2;
      files[`${subset}-${weight}`] = await fetchOk(url);
    }
  }
  // Kazakh coverage, by the files' own cmap (weight 400; 700 is the same cut).
  const kazakhIn = (subset) => [...KAZAKH_LETTERS].filter((ch) => woff2CodePoints(files[`${subset}-400`]).has(ch.codePointAt(0)));
  if (subsets.includes("cyrillic-ext") && kazakhIn("cyrillic-ext").length === 0) {
    console.log(`${family}: cyrillic-ext has no Kazakh letter — not shipped`);
    subsets.splice(subsets.indexOf("cyrillic-ext"), 1);
  }
  const covered = new Set(subsets.flatMap(kazakhIn));
  const kazakhMissing = [...KAZAKH_LETTERS].filter((ch) => !covered.has(ch)).join("");
  for (const subset of subsets) {
    for (const weight of WEIGHTS) {
      const buf = files[`${subset}-${weight}`];
      total += buf.length;
      await writeFile(path.join(OUT, id, `${subset}-${weight}.woff2`), buf);
    }
  }
  const lic = await licenseText(family, meta.license);
  await writeFile(
    path.join(OUT, id, "LICENSE.txt"),
    `${family} — ${meta.license}\nFiles: Fontsource ${id} ${meta.version} (${meta.source}), woff2, normal, weights ${WEIGHTS.join(", ")}, subsets ${subsets.join(", ")}.\nLicense source: ${lic.source}\n\n${lic.text}`
  );
  rows.push({ family, id, category, cyrillic: subsets.includes("cyrillic"), cyrillicExt: subsets.includes("cyrillic-ext"), kazakhMissing, license: meta.license, version: meta.version });
  console.log(`${family}: ${subsets.join("+")} ${meta.license} ${meta.version}${kazakhMissing ? ` — Kazakh missing ${kazakhMissing}` : ""}`);
}

const body = rows
  .map((r) => `  { family: ${JSON.stringify(r.family)}, id: ${JSON.stringify(r.id)}, category: ${JSON.stringify(r.category)}, cyrillic: ${r.cyrillic}, cyrillicExt: ${r.cyrillicExt}, kazakhMissing: ${JSON.stringify(r.kazakhMissing)}, license: ${JSON.stringify(r.license)} },`)
  .join("\n");
await writeFile(
  DATA,
  `// GENERATED by scripts/fetch-site-fonts.mjs — do not edit by hand (SDL-774).
// The whitelist of the site theme's fonts: pages-service \`models.ThemeFonts\`,
// with the files in apps/site/public/fonts/<id>/<subset>-<weight>.woff2
// (subset latin, cyrillic, cyrillic-ext).

export const SITE_FONT_WEIGHTS = ${JSON.stringify(WEIGHTS)} as const;

export const SITE_FONT_ROWS = [
${body}
] as const;
`
);
console.log(`\n${rows.length} families, ${(total / 1024).toFixed(0)} KiB of woff2`);
