// Generator and freshness check of the Element catalog document served by
// GET /api/element-catalog (SDL-696).
//
//   pnpm --filter admin catalog:api          # write src/widgets/pages/element-catalog-api.json
//   pnpm --filter admin catalog:api:check    # exit 1 when the file is stale (runs in smoke:pages)
//
// Reads PAGES_BLOCKS + PAGES_PROPS_MANIFEST from `@markerloop/studio/catalog`
// (workspace packages -> dist, so rebuild them after a change there) and the
// catalogVersion from element-catalog.json — regenerate that one first
// (`catalog:manifest`). Refuses to write a document with a problem, an
// Element without a props schema first of all. Format: src/widgets/pages/element-catalog-api.ts.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { PAGES_BLOCKS, PAGES_PROPS_MANIFEST } from "@markerloop/studio/catalog";

import elementCatalog from "../src/widgets/pages/element-catalog.json";
import {
  buildElementCatalogDocument,
  checkElementCatalogDocument,
  elementCatalogDocumentProblems,
  serializeElementCatalogDocument,
} from "../src/widgets/pages/element-catalog-api";

const file = path.resolve(__dirname, "../src/widgets/pages/element-catalog-api.json");
const rel = path.relative(process.cwd(), file) || file;
const regen = "pnpm --filter admin catalog:api";

function main(): number {
  const check = process.argv.includes("--check");
  const name = `catalog:api${check ? ":check" : ""}`;
  let fresh;
  try {
    fresh = buildElementCatalogDocument({
      blocks: PAGES_BLOCKS,
      propsManifest: PAGES_PROPS_MANIFEST,
      catalogVersion: elementCatalog.catalogVersion,
    });
  } catch (error) {
    console.error(`${name} FAILED — ${(error as Error).message}`);
    return 1;
  }
  const problems = elementCatalogDocumentProblems(fresh, elementCatalog);
  if (problems.length > 0) {
    console.error(`${name} FAILED — the Element catalog cannot be served:\n  - ${problems.join("\n  - ")}`);
    return 1;
  }
  const count = fresh.elements.length;

  if (!check) {
    writeFileSync(file, serializeElementCatalogDocument(fresh));
    console.log(`catalog:api — wrote ${rel} (${count} elements, catalogVersion ${fresh.catalogVersion})`);
    return 0;
  }

  const committedText = existsSync(file) ? readFileSync(file, "utf8") : null;
  const result = checkElementCatalogDocument(committedText, fresh, rel, regen);
  if (!result.ok) {
    console.error(`catalog:api:check FAILED — ${result.message}`);
    return 1;
  }
  console.log(`catalog:api:check OK — ${rel} is up to date (${count} elements, catalogVersion ${fresh.catalogVersion})`);
  return 0;
}

process.exit(main());
