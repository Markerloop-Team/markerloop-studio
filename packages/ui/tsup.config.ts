import { defineConfig, type Options } from "tsup";

/**
 * The builds, keyed by the name `SAUNA_TSUP_CONFIG` selects (SDL-147).
 *
 * Only the UI build is left (SDL-187): the engine (core, schema, react,
 * providers, next) moved into the constructor (apps/studio/src/engine,
 * SDL-186), which compiles those sources with Next directly — no bundling
 * on the package side.
 *
 * The named-config indirection stays even with a single entry. It is the
 * publish gate's guarantee that exactly one `dts: true` rollup-plugin-dts
 * worker runs at a time — handing tsup an array starts every config
 * concurrently, and parallel declaration passes over shared sources made
 * `pnpm smoke:tarball` flake (2 failures out of 8 runs, phantom DTS errors
 * that `tsc --noEmit` accepts).
 */
const CONFIGS: Record<string, Options> = {
  // UI kit entries. Bundled (one file per format per entry).
  ui: {
    name: "ui",
    // Object form pins the output layout: with `src/index.ts` gone (SDL-186)
    // the entries' common parent is `src/ui`, and the array form would emit
    // `dist/index.js` + `dist/admin/index.js`, breaking the exports map.
    entry: {
      "ui/index": "src/ui/index.tsx",
      // Admin primitives (D1, SDL-110): separate entry so createSaunaCatalog
      // never sees them — they must not become schema block types.
      "ui/admin/index": "src/ui/admin/index.tsx",
    },
    format: ["cjs", "esm"],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false,
    external: ["react", "react-dom", "next"],
    treeshake: true,
    minify: false,
    outDir: "dist",
  },
};

/** Build order used by `pnpm build:bundles`; also the accepted env values. */
export const TSUP_CONFIG_NAMES = Object.keys(CONFIGS);

export default defineConfig((overrideOptions) => {
  const requested = process.env.SAUNA_TSUP_CONFIG;

  if (requested === undefined) {
    // `--watch` is the one caller that legitimately wants every config at
    // once: it is a dev loop, not the publish gate.
    if (overrideOptions.watch) return Object.values(CONFIGS);

    // A bare `tsup` would silently restore the parallel declaration pass this
    // config exists to avoid, and the damage only shows up as a flaky publish
    // gate weeks later. Refuse instead.
    throw new Error(
      "tsup was invoked without SAUNA_TSUP_CONFIG. Run `pnpm build` (which " +
        `runs the configs one at a time), or pick one of: ${TSUP_CONFIG_NAMES.join(", ")}. ` +
        "See packages/ui/README.md.",
    );
  }

  const picked = CONFIGS[requested];
  if (picked === undefined) {
    throw new Error(
      `Unknown SAUNA_TSUP_CONFIG=${requested}. Known: ${TSUP_CONFIG_NAMES.join(", ")}.`,
    );
  }

  return [picked];
});
