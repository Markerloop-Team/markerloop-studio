// Records the parity snapshot from the FROZEN reference engine (SDL-603).
//
//   pnpm --filter @markerloop/engine snapshots:record
//
// Reads the reference sources in place — `<reference checkout>` is
// read-only until EP-116, this script copies it and writes only to
// `test/__snapshots__/reference.json` in this package. Run it by hand, never
// in CI (CI has no reference checkout); the committed JSON is what CI
// compares against. Override the location with SAUNA_REFERENCE_ENGINE.
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { renderAll } from "./render";
import type { EngineUnderTest } from "./fixtures";

const REF =
  process.env.SAUNA_REFERENCE_ENGINE ??
  path.join(os.homedir(), "reference/apps/studio/src/engine");

// The reference tree is copied byte for byte into this package
// test/_reference (gitignored) before it is imported, for two reasons: tsx applies
// this package's tsconfig (automatic JSX runtime) only to files under it, and
// imports of `react` then resolve to this package's copy — one React
// instance, the one the dist is rendered with, so only the engine differs.
const COPY = path.join(import.meta.dirname, "_reference");
await rm(COPY, { recursive: true, force: true });
await cp(REF, COPY, { recursive: true });

const [root, renderer, server, client, refs] = await Promise.all([
  import(path.join(COPY, "index.ts")),
  import(path.join(COPY, "react/renderer.tsx")),
  import(path.join(COPY, "react/server.ts")),
  import(path.join(COPY, "react/index.ts")),
  import(path.join(COPY, "core/refs.ts")),
]);

const engine: EngineUnderTest = {
  SaunaRenderer: renderer.SaunaRenderer,
  SaunaServer: server.Sauna,
  SaunaClient: client.Sauna,
  SaunaProvider: client.SaunaProvider,
  validateSaunaSchema: root.validateSaunaSchema,
  migrateSaunaSchema: root.migrateSaunaSchema,
  loadBlockRefs: refs.loadBlockRefs,
};

let commit = "unknown";
try {
  commit = execFileSync("git", ["-C", REF, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  // not a git checkout — keep "unknown"
}

// The `divergences` block is OURS, not the reference's (SDL-608): it lists the
// cases where this engine is meant to differ and carries the output the suite
// asserts instead. Re-recording must carry it over verbatim — dropping it here
// would silently re-adopt the reference's behaviour as expected, which is the
// one thing the block exists to prevent. Retiring a divergence is a hand edit
// of the JSON; the suite fails on an entry that no longer diverges.
const target = path.join(import.meta.dirname, "__snapshots__/reference.json");
let divergences: unknown = undefined;
try {
  divergences = JSON.parse(await readFile(target, "utf8")).divergences;
} catch {
  // no snapshot yet — first recording
}

const snapshot = {
  source: "sunday-sauna apps/studio/src/engine",
  commit,
  ...(divergences ? { divergences } : {}),
  cases: await renderAll(engine),
};
await writeFile(target, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
const kept = divergences ? Object.keys(divergences as object).length : 0;
console.log(`recorded ${Object.keys(snapshot.cases).length} cases from reference @ ${commit} → ${target}` + (kept ? ` (kept ${kept} divergence entries)` : ""));
