#!/usr/bin/env node
//
// Build-time validator for next-intl message keys.
//
// History:
//   The `emailVerification` block sat at the top level of
//   messages/<lang>/common.json, while both of its consumers resolve it
//   through `useTranslations("common")`. next-intl then looked up
//   `common.emailVerification.message`, found nothing, and rendered the
//   key path itself — so the verification banner on the main screen read
//   "common.emailVerification.message" instead of a sentence. Nothing
//   failed: not the build, not tsc, not the request. The only signal was
//   a human reading the page — a silent lookup miss that renders as
//   plausible-looking output.
//
// What this guards:
//   1. Every literal key a component asks for exists in the reference
//      locale (ru). Namespace comes from the `useTranslations("<ns>")`
//      the variable was bound to.
//   2. Locales do not drift apart: ru/en/kk carry the same key set.
//
// What this does NOT guard (deliberately):
//   - Dynamic keys — `t(item.name)`, `t(code)`. The namespace is known
//     but the leaf is only known at runtime; listing them is the best we
//     can do, so they are reported, not failed on.
//   - Translation *quality*, or a value being identical across locales.
//     "Email" legitimately reads the same in all three.
//   - Unused keys. Harmless, and pruning them is a separate decision.
//
// Exit 1 on any missing or drifted key, printing file:line for each.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const MSG_DIR = path.join(SRC, "messages");
const REFERENCE_LOCALE = "ru";

const flatten = (obj, prefix = "") =>
  Object.entries(obj).reduce((acc, [k, v]) => {
    const key = `${prefix}${k}`;
    return v && typeof v === "object" && !Array.isArray(v)
      ? { ...acc, ...flatten(v, `${key}.`) }
      : { ...acc, [key]: v };
  }, {});

const locales = readdirSync(MSG_DIR).filter((d) =>
  statSync(path.join(MSG_DIR, d)).isDirectory()
);

const messages = Object.fromEntries(
  locales.map((l) => [
    l,
    flatten(JSON.parse(readFileSync(path.join(MSG_DIR, l, "common.json"), "utf8"))),
  ])
);

const reference = messages[REFERENCE_LOCALE];
if (!reference) {
  console.error(`validate-i18n: нет эталонной локали ${REFERENCE_LOCALE} в ${MSG_DIR}`);
  process.exit(1);
}

// --- walk the source tree ----------------------------------------------------
const sources = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== "node_modules" && !entry.startsWith(".")) walk(p);
    } else if (/\.tsx?$/.test(entry)) {
      sources.push(p);
    }
  }
};
walk(SRC);

const BIND = /(?:const|let)\s+(\w+)\s*=\s*useTranslations\(\s*(?:"([^"]*)")?\s*\)/g;

const missing = new Map(); // key -> [locations]
const dynamic = [];

for (const file of sources) {
  const text = readFileSync(file, "utf8");
  const boundTo = new Map();
  for (const m of text.matchAll(BIND)) boundTo.set(m[1], m[2] ?? "");
  if (boundTo.size === 0) continue;

  const names = [...boundTo.keys()].map((n) => n.replace(/[$]/g, "\\$")).join("|");
  const call = new RegExp(`\\b(${names})\\(\\s*(?:"([^"]+)"|([^)]+?))\\s*[,)]`, "g");

  for (const m of text.matchAll(call)) {
    const ns = boundTo.get(m[1]);
    const line = text.slice(0, m.index).split("\n").length;
    const where = `${path.relative(ROOT, file)}:${line}`;
    if (m[2] !== undefined) {
      const full = ns ? `${ns}.${m[2]}` : m[2];
      if (!(full in reference)) {
        if (!missing.has(full)) missing.set(full, []);
        missing.get(full).push(where);
      }
    } else {
      dynamic.push(`${where}  ${ns || "<root>"}.<${m[3].trim()}>`);
    }
  }
}

// --- locale drift ------------------------------------------------------------
const union = new Set(Object.values(messages).flatMap((m) => Object.keys(m)));
const drift = locales
  .map((l) => [l, [...union].filter((k) => !(k in messages[l])).sort()])
  .filter(([, miss]) => miss.length > 0);

// --- report ------------------------------------------------------------------
let failed = false;

if (missing.size > 0) {
  failed = true;
  console.error(`\nvalidate-i18n: ключей нет в ${REFERENCE_LOCALE} — ${missing.size}\n`);
  for (const [key, locs] of [...missing].sort()) {
    console.error(`  ${key}`);
    for (const l of locs) console.error(`      ${l}`);
    const tail = key.split(".").at(-1);
    const alt = Object.keys(reference).filter((c) => c === tail || c.endsWith(`.${tail}`));
    if (alt.length > 0) {
      console.error(`      ↳ существует под другим путём: ${alt.slice(0, 3).join(", ")}`);
      console.error(`        (namespace в useTranslations не совпадает с местом ключа в common.json)`);
    }
  }
}

if (drift.length > 0) {
  failed = true;
  console.error(`\nvalidate-i18n: локали разъехались\n`);
  for (const [l, miss] of drift) {
    console.error(`  нет в ${l} (${miss.length}): ${miss.join(", ")}`);
  }
}

if (failed) {
  console.error("");
  process.exit(1);
}

const counts = locales.map((l) => `${l}=${Object.keys(messages[l]).length}`).join(" ");
console.log(`validate-i18n: ок — ${sources.length} файлов, ключи ${counts}, расхождений нет.`);
if (dynamic.length > 0) {
  console.log(`validate-i18n: динамических ключей ${dynamic.length} (не проверяются):`);
  for (const d of dynamic) console.log(`  ${d}`);
}
