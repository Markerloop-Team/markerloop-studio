/** @type {import("eslint").Linter.FlatConfig[]} */
//
// Workspace-wide ESLint config.
//
// Why a thin shared root: apps/admin owns its Next-specific rules
// inside its own config; this root config exists to give workspace
// packages outside it a baseline that (a) understands TypeScript
// syntax and (b) recognises the `react-hooks/exhaustive-deps` rule
// referenced by `// eslint-disable-next-line` comments. Without the
// react-hooks plugin loaded those disable comments target an unknown
// rule and ESLint hard-errors.
module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/storybook-static/**",
      "**/.turbo/**",
      "**/tsup.config.bundled_*.*",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": require("eslint-plugin-react-hooks"),
    },
    rules: {
      // We don't want the root config to fight Next-level configs;
      // the rules are registered as `warn` so existing
      // disable-next-line comments resolve to a real rule but the
      // rule itself doesn't break the build.
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // SDL-616: the interface language is strictly English (owner decision,
  // 21 Sep 2026). The design-system canvases are the reference every real
  // screen is copied from, so a Russian label that slips back into them is
  // a Russian label on the next shipped screen. This is a source-level
  // guard: ESLint walks the AST, so comments (which may stay Russian) are
  // never inspected, while every string literal, template chunk and piece
  // of JSX text is — and each offender is reported as file:line:col.
  // Severity is `error` because `pnpm --filter admin lint` in the CI
  // `verify:static` job fails only on errors.
  {
    files: ["apps/admin/src/app/design-system/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/[\\u0400-\\u04FF]/]",
          message:
            "Cyrillic in a design-system canvas string: the interface is English-only (SDL-616).",
        },
        {
          selector: "TemplateElement[value.raw=/[\\u0400-\\u04FF]/]",
          message:
            "Cyrillic in a design-system canvas template string: the interface is English-only (SDL-616).",
        },
        {
          selector: "JSXText[value=/[\\u0400-\\u04FF]/]",
          message:
            "Cyrillic in design-system canvas JSX text: the interface is English-only (SDL-616).",
        },
      ],
    },
  },
];
