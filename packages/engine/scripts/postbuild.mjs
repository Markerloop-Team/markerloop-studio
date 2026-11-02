// Postbuild for @markerloop/engine (SDL-603).
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

// Boundary guard: these modules carry "use client" in the source; if the
// directive is not the first statement of the emitted file, a server
// component importing `@markerloop/engine/react` breaks at runtime, not at
// build time. Conversely the server entry must stay directive-free.
const MUST_BE_CLIENT = [
  "react/index.js",
  "react/sauna.client.js",
  "react/sauna-provider.js",
  "react/error-boundary.js",
];
const MUST_BE_SERVER = ["react/server.js", "react/sauna.server.js", "index.js"];
const problems = [];
for (const rel of MUST_BE_CLIENT) {
  const text = await readFile(path.join(DIST, rel), "utf8").catch(() => null);
  if (text === null) problems.push(`${rel}: missing`);
  else if (!/^["']use client["'];/.test(text)) problems.push(`${rel}: "use client" is not the first statement`);
}
for (const rel of MUST_BE_SERVER) {
  const text = await readFile(path.join(DIST, rel), "utf8").catch(() => null);
  if (text === null) problems.push(`${rel}: missing`);
  else if (/^["']use client["'];/.test(text)) problems.push(`${rel}: server entry must not be a client module`);
}
if (problems.length) {
  console.error(`postbuild: server/client boundary broken:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`postbuild: ${files.length} files, specifiers fully specified, boundary intact`);
