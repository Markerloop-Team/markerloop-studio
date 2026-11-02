import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const USE_CLIENT = `"use client";\n`;

async function prependIfMissing(filePath) {
  const abs = path.resolve(filePath);
  // A missing file is not fatal here — the guard below reports every
  // problem at once instead of dying on the first one.
  const content = await readFile(abs, "utf8").catch(() => null);
  if (content === null || content.startsWith(USE_CLIENT)) return;
  await writeFile(abs, USE_CLIENT + content, "utf8");
}

const clientEntryFiles = [
  // UI kit (EP-14 P1): the Radix wrappers use hooks and context, so the
  // whole `./ui` subpath is a client boundary. Without the directive a
  // consumer importing from a server component gets an RSC error — and
  // that failure lands on them, not on our build. tsup config #1 bundles
  // `src/ui/index.tsx` into one file per format, so these two entries
  // cover the subpath completely.
  "dist/ui/index.js",
  "dist/ui/index.cjs",
  // Admin primitives (SDL-110): same client boundary as ./ui — hooks,
  // Radix popover, cmdk. Bundled entry, so two files cover the subpath.
  "dist/ui/admin/index.js",
  "dist/ui/admin/index.cjs",
];

// The react/editor tree files are gone from dist (SDL-186): the engine moved
// into the constructor, which compiles its sources — with their own
// `"use client"` directives — directly.
const allClientFiles = [...clientEntryFiles];

await Promise.all(allClientFiles.map((p) => prependIfMissing(p)));

// Build-time guard (EP-14 P1).
//
// `prependIfMissing` silently no-ops on a file that tsup stopped emitting
// (renamed entry, dropped export), so the list above can rot without anyone
// noticing until a consumer hits an RSC error. Re-read every file and fail
// the build if the directive is not there.
const missing = [];
for (const p of allClientFiles) {
  const content = await readFile(path.resolve(p), "utf8").catch(() => null);
  if (content === null) {
    missing.push(`${p} — file not emitted by tsup`);
    continue;
  }
  if (!content.startsWith(USE_CLIENT)) missing.push(`${p} — directive missing`);
}

if (missing.length > 0) {
  console.error(
    `postbuild: "use client" guard failed for ${missing.length} file(s):\n` +
      missing.map((m) => `  - ${m}`).join("\n")
  );
  process.exit(1);
}

