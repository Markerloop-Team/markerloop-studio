// Postbuild for @markerloop/studio (SDL-604) — same recipe as packages/engine.
//
// The engine is emitted by plain `tsc`, file for file, not bundled. That is
// what keeps the server/client boundary intact: every `"use client"` module
// of the reference (react/index, sauna.client, sauna-provider, error-boundary,
// the editor) stays a separate file with its directive on line 1, and the
// server entry (react/server) never inlines a client module. A bundler would
// fold them into one file and drop the directives.
//
// The reference compiled these sources inside a Next app, where extensionless
// relative imports are fine. From node_modules they are not: the package is
// `"type": "module"`, and webpack treats such packages as fully specified —
// `./renderer` must be `./renderer.js`. This script rewrites every relative
// specifier in dist/**/*.{js,d.ts} to the file that exists, then checks the
// boundary directives are where they must be.
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve("dist");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs)));
    else out.push(abs);
  }
  return out;
}

async function exists(p) {
  return stat(p).then((s) => s.isFile(), () => false);
}

async function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith("./") && !spec.startsWith("../")) return spec;
  if (/\.(m?js|json|css)$/.test(spec)) return spec;
  const base = path.resolve(path.dirname(fromFile), spec);
  if (await exists(`${base}.js`)) return `${spec}.js`;
  if (await exists(path.join(base, "index.js"))) return `${spec}/index.js`;
  throw new Error(`postbuild: cannot resolve "${spec}" from ${path.relative(DIST, fromFile)}`);
}

const SPEC_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"']*)\2/g;

async function rewrite(file) {
  const src = await readFile(file, "utf8");
  const jsTwin = file.endsWith(".d.ts") ? file.replace(/\.d\.ts$/, ".js") : file;
  let out = "";
  let last = 0;
  for (const m of src.matchAll(SPEC_RE)) {
    const fixed = await resolveSpecifier(jsTwin, m[3]);
    out += src.slice(last, m.index) + m[1] + m[2] + fixed + m[2];
    last = m.index + m[0].length;
  }
  out += src.slice(last);
  if (out !== src) await writeFile(file, out, "utf8");
}

const files = (await walk(DIST)).filter((f) => f.endsWith(".js") || f.endsWith(".d.ts"));
for (const f of files) await rewrite(f);

// Boundary guard, derived from the sources rather than listed by hand: every
// src module whose first statement is "use client" must keep it as the first
// statement of its emitted twin, or a server component importing the editor
// breaks at runtime, not at build time.
const SRC = path.resolve("src");
const problems = [];
let clientModules = 0;
for (const src of await walk(SRC)) {
  if (!/\.tsx?$/.test(src) || src.endsWith(".d.ts")) continue;
  const text = await readFile(src, "utf8");
  if (!/^["']use client["'];?/.test(text)) continue;
  clientModules += 1;
  const rel = path.relative(SRC, src).replace(/\.tsx?$/, ".js");
  const out = await readFile(path.join(DIST, rel), "utf8").catch(() => null);
  if (out === null) problems.push(`${rel}: missing`);
  else if (!/^["']use client["'];/.test(out)) problems.push(`${rel}: "use client" is not the first statement`);
}
if (problems.length) {
  console.error(`postbuild: client boundary broken:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`postbuild: ${files.length} files, specifiers fully specified, ${clientModules} client modules keep "use client"`);
