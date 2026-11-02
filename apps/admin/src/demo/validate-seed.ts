// Dev check: every seeded page and component must pass the engine's write
// validation — the same gate the editor applies before it saves.
import { validateSaunaSchema } from "@markerloop/engine";
import { createSeedState } from "./server/seed";

const state = createSeedState();
let failed = 0;
for (const doc of [...state.pages.map((p) => ({ name: String(p.label), body: p.body })), ...state.blocks.map((b) => ({ name: String(b.name), body: b.schema }))]) {
  const res = validateSaunaSchema(doc.body, { mode: "write" });
  if (!res.ok) {
    failed += 1;
    console.error(`✗ ${doc.name}: ${res.error.message}`, res.error.issues);
  } else {
    console.log(`✓ ${doc.name}${res.warnings?.length ? ` (${res.warnings.length} warnings)` : ""}`);
  }
}
process.exit(failed ? 1 : 0);
