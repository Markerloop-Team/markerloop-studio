# @markerloop/ui

The Markerloop design system: a Radix-based UI kit for React 19, its admin
primitives (`./ui/admin`) and a prebuilt Tailwind v4 stylesheet
(`./ui/styles.css`). Private workspace package — it is not published.

## Origin

Started as the UI kit of an earlier standalone page-editor prototype and was
moved into this monorepo when the editor became part of Markerloop. Storybook
stories live next to the components.

## Build

| What | How | In git |
|---|---|---|
| `dist/` (JS + types) | `pnpm build` — tsup, then `scripts/postbuild.mjs` prepends `"use client"` to the entries. Runs automatically as `prepare` on `pnpm install`. | no |
| `ui/styles.css` | `pnpm css:build` from `src/ui/internal/styles/globals.css` | **yes**, prebuilt |

`ui/styles.css` is committed on purpose: the admin's own utility sheet
(`apps/admin/src/app/globals.css`) loads after it and wins by document order,
so any change to the kit sheet shifts the cascade. Regenerate it only when you
change kit styles, and diff the output.

⚠️ `globals.css` lists `@source "../../../../.storybook/**/*.{ts,tsx}"`, i.e.
`packages/ui/.storybook/`. The committed stylesheet was generated with that
directory present in the reference tree; since SDL-627 it exists here again, so
`css:build` scans the same inputs. Still diff before committing.

## Props manifest (`props-manifest.json`)

A generated, **committed** description of every author-facing prop of the kit:
type, editor control (`segmented`/`select`/`switch`/`number`/`text`/`link`),
group, enum values, default, caption. The pages editor (`@markerloop/studio`,
`properties/descriptors.ts`) turns it into a properties form; a type the
manifest does not describe falls back to the raw-JSON field. Exported as
`@markerloop/ui/props-manifest.json`. Added by SDL-632 (slice S1); the admin's
pages editor reads it since S2 (`apps/admin/src/widgets/pages/catalog.tsx`).
Every type the editor offers for insertion must have props here or a reviewed
`noProps: true` in the overlay — a component whose props come only from Radix
(`Tabs`, `Separator`) is extracted empty and needs its props declared by hand;
`smoke:pages` names any type that has neither. Providers and global mounts
(`ThemeProvider`, `TooltipProvider`, `Toast`) are `insertable: false` in
`src/ui/catalog-meta/sauna-catalog-meta.ts`: renderable, not offered.

| What | Command |
|---|---|
| Regenerate after changing a component's props or the overlay | `pnpm --filter @markerloop/ui props:manifest` |
| Check it is fresh (CI, `smoke:pages` job) | `pnpm --filter @markerloop/ui props:manifest:check` |
| Prove the check bites: plant 3 regressions, each must turn it red (CI, `smoke:pages`) | `pnpm -C packages/ui run props:manifest:planted` |

- **Layers 1–2** — `scripts/props-manifest.mjs` extracts props with
  `react-docgen-typescript` from `src/ui/internal/{components,layout,typography}`
  plus the barrel `src/ui/index.tsx`, and classifies them by rule. Ported from
  the frozen reference (`scripts/props-manifest.mjs` at its HEAD, i.e. newer
  than this `0.2.0-alpha.2` copy).
- **Layer 3** — the manual overlay `src/ui/catalog-meta/props-meta.json`
  (typed wrapper `props-meta.ts`, re-exported from `catalog-meta/index.ts`, not
  from the `./ui` barrel): captions, group/order overrides, hidden props,
  `children` as a content field, hand-declared props docgen cannot represent,
  `noProps: true` for reviewed pure-structure parts, `content` decisions. Taken
  from the reference with the two Accordion entries dropped — this copy has no
  Accordion.
- The overlay is strict: a component or prop the extraction does not know
  fails the generator and the check, naming the key. Its SHAPE is closed too
  (SDL-632): a section other than `children`, `props`, `noProps`, `hide`,
  `label`, `group`, `content`, `order` — or an unknown key inside `children` or
  a declared prop — fails by name, so a typo such as `"lable"` or `"hidden"` can
  no longer be skipped in silence. The check also self-tests that guard on a
  synthetic overlay before reading the real one. Never hand-edit
  `props-manifest.json`; the check fails on any difference.
- A removed component, prop or enum value, or a prop whose **type** changed
  (`Badge.tone type enum -> string`), prints
  `WARNING: props contract change, needs propsVersion, see EP-128` — from the
  generator (vs the file it replaces) and from the check (vs the committed file
  and `origin/master`; override with `PROPS_MANIFEST_BASE_REF`). In a shallow
  clone the check fetches a missing `origin/<branch>` first; when it still
  cannot compare (no git, no base ref, no manifest at the base yet) it prints
  `skipped base-branch contract comparison — <why>`, never nothing. A warning,
  not a failure: the real lock on the props contract is EP-128.
- **What that warning asks of you.** What is versioned is the **props schema
  of an Element** (EP-128: `BlockDefinition.propsVersion` and the node's
  `propsVersion`, see `packages/engine/README.md`), not this package's
  version — the kit may change look, spacing and markup freely. Changing a
  prop's type is the same contract change as removing it: a stored page still
  holds the old value (an enum string where a number is now expected), and
  only the props schema can tell an old node from a new one. So before regenerating
  over such a warning, prefer an additive change (a new prop or enum value
  next to the old one); if the old shape really goes, bump that Element's
  `propsVersion` and handle the old version (EP-128) in the same change, and
  say so in the MR.

## Component stand (Storybook)

The catalogue of the kit, read from the live sources of this package. Look
here before writing a component of your own.

| What | Command |
|---|---|
| Dev stand, http://localhost:6006 | `pnpm --filter @markerloop/ui storybook` |
| Static build → `storybook-static/` (gitignored) | `pnpm --filter @markerloop/ui storybook:build` |

- Stories live next to the component: `src/ui/**/<name>.stories.tsx`; config in
  `.storybook/`. Storybook 10 + Vite; Tailwind is compiled from
  `src/ui/internal/styles/globals.css` by `@tailwindcss/vite` — the committed
  `ui/styles.css` is not used by the stand. `next/link` is aliased to a plain
  `<a>` mock (`.storybook/next-link-mock.tsx`) for the stand only.
- Every story is wrapped in `data-surface`, so it shows the admin surface
  theme, the one the admin actually renders.
- Origin: the stories and config are the reference stand's at tag
  `v0.2.0-alpha.2` — the same tag the sources were copied from, so stories and
  components agree. Not copied: the welcome page and `public/`
  (`catalog.json`, `llms.txt`, `usage.md`), which documented the npm package.
- Stories are excluded from `pnpm type-check` (`tsconfig.json`), as they were
  in the reference: several use `render`-only stories on components with
  required props, which Storybook's `StoryObj` typing rejects. The stand build
  is their check.
- Adding a component: add a `*.stories.tsx` next to it; the glob in
  `.storybook/main.ts` picks it up, the sidebar order is `storySort` in
  `.storybook/preview.tsx`.

### Where it is published

Nowhere: the kit is a private workspace package. Build the Storybook locally
with `pnpm --filter @markerloop/ui storybook`.
