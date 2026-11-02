// Generator and freshness check of the Element catalog manifest (SDL-668).
//
//   pnpm --filter admin catalog:manifest          # write src/widgets/pages/element-catalog.json
//   pnpm --filter admin catalog:manifest:check    # exit 1 when the file is stale (runs in smoke:pages)
//
// Reads the live PAGES_BLOCKS through the admin's own resolution (workspace
// packages -> dist), so after a change in packages/engine or packages/studio
// rebuild them (pnpm install / their `build`) before regenerating. Format and
// hash: scripts/element-catalog.ts.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PAGES_BLOCKS } from "@/widgets/pages/catalog";

import { buildElementCatalog, checkElementCatalog, serializeElementCatalog } from "./element-catalog";

const file = path.resolve(__dirname, "../src/widgets/pages/element-catalog.json");
const rel = path.relative(process.cwd(), file) || file;
const regen = "pnpm --filter admin catalog:manifest";

function main(): number {
  const check = process.argv.includes("--check");
  let fresh;
  try {
    fresh = buildElementCatalog(PAGES_BLOCKS);
  } catch (error) {
    console.error(`catalog:manifest${check ? ":check" : ""} FAILED — ${(error as Error).message}`);
    return 1;
  }
  const count = Object.keys(fresh.elements).length;

  if (!check) {
    writeFileSync(file, serializeElementCatalog(fresh));
    console.log(`catalog:manifest — wrote ${rel} (${count} elements, catalogVersion ${fresh.catalogVersion})`);
    return 0;
  }

  const committedText = existsSync(file) ? readFileSync(file, "utf8") : null;
  const result = checkElementCatalog(committedText, fresh, rel, regen);
  if (!result.ok) {
    console.error(`catalog:manifest:check FAILED — ${result.message}`);
    return 1;
  }
  console.log(`catalog:manifest:check OK — ${rel} is up to date (${count} elements, catalogVersion ${fresh.catalogVersion})`);
  return 0;
}

process.exit(main());
