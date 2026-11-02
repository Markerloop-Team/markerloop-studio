import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  framework: { name: "@storybook/react-vite", options: {} },
  // Local + CI build check only: nothing should phone home from a CI runner.
  core: { disableTelemetry: true },
  // Only the stories that sit next to the kit sources. The reference stand's
  // welcome page, llms.txt/usage.md/catalog.json and staticDirs were not
  // moved in (SDL-627): they described the npm package `sunday-sauna`, whose
  // public delivery is cancelled by the architecture decision. The catalog is the sidebar.
  //
  // Sidebar order is decided by `options.storySort` in preview.tsx.
  stories: ["../src/ui/**/*.stories.@(ts|tsx|mdx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-themes",
    // Pseudo-state toggles (hover/focus/active) per story. Tailwind v4
    // conflict workaround lives in .storybook/preview.css ONLY — do not
    // move the @custom-variant overrides into the library globals.
    "storybook-addon-pseudo-states",
    // @storybook/addon-vitest is deliberately NOT here: it requires
    // vitest >= 3 and the repo pins 2.1.9 (EP-15 R8). Revisit with the
    // vitest upgrade task.
  ],
  typescript: {
    // react-docgen feeds the Controls/Docs prop tables.
    reactDocgen: "react-docgen-typescript",
  },
  viteFinal: async (cfg) => {
    // The package has no vite.config.ts of its own (vitest runs with
    // css:false), so the Tailwind plugin is wired here. It compiles
    // src/ui/internal/styles/globals.css on the fly with HMR — the
    // pnpm css:build artifact is not used by Storybook at all.
    cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()];
    // next/link needs the Next app-router runtime; in Vite Storybook the
    // stories for RowLink/ActionCardLink use a plain-<a> mock instead.
    // The alias is preview-only — the library build keeps the real import.
    const prevAlias = cfg.resolve?.alias;
    const aliasList = Array.isArray(prevAlias)
      ? prevAlias
      : Object.entries(prevAlias ?? {}).map(([find, replacement]) => ({
          find,
          replacement: replacement as string,
        }));
    cfg.resolve = {
      ...(cfg.resolve ?? {}),
      alias: [
        ...aliasList,
        {
          find: /^next\/link$/,
          replacement: new URL("./next-link-mock.tsx", import.meta.url)
            .pathname,
        },
      ],
    };
    return cfg;
  },
};

export default config;
