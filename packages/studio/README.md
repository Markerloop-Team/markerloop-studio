# @markerloop/studio

The pages editor: the shell (structure tree / canvas / properties), a
per-instance zustand store with snapshot history in a bounded ring, the canvas
as a same-origin iframe whose body is a React portal target, the selection
overlay and inline text editing drawn inside that frame, the properties panel,
autosave through a `SaunaProvider`, and hotkeys. Private workspace package —
not published. **Mounted in the admin** as the pages section editor
(`apps/admin/src/app/(product)/pages/[routeId]`, served at `/pages/[routeId]`, `apps/admin/src/widgets/pages/page-editor.tsx`, SDL-605).

## Origin

Started as the visual editor of an earlier standalone page-editor prototype
and was moved into this monorepo when the editor became part of Markerloop.

## Entry point

`@markerloop/studio` → `dist/index.js` (types `dist/index.d.ts`): `SaunaStudio`,
`createStudioStore`, `useStudioHotkeys`, `useStudioAutoSave`,
`SaunaPropertiesAutoForm` and the editor registry, `SaunaEditableOverlay`,
`SaunaHistoryPanel`, the history ring (`pushHistory`, `applyUndo`, …) — the
reference's `index.ts` unchanged.

**DataView settings (SDL-642).** `SaunaStudio` takes `dataSources`
(`StudioDataSources`: the workspace id, the collections with a
loading/error/ready status and a retry, and `loadFields(collectionId)`). With
it a `DataView` node's Properties are `DataViewSettings` — collection, fields,
sort, base filter, presets, after canvas A `/design-system/feed?case=settings`
— instead of the generic zod form; each edit is one `propsPatchOp`, one
history frame. The package fetches nothing: the host supplies the list. The
rules of what is written are `src/properties/data-view-model.ts` (bind →
source + starter fields and a reset of conditions; a condition is typed by its
field; a repeated `filter[field][op]` is refused; a preset id is derived from
its label, Cyrillic transliterated; a date condition must be ISO, `in` parts
are trimmed). The panel always writes the BASE props — at Phone/Tablet or as
a member a binding never becomes a width or member override. A pick loads the
collection's fields first (select disabled meanwhile, the latest pick wins, a
failure binds nothing and offers a retry). Pinned by `test/run.tsx` §
DataView settings.

**Site theme (SDL-773).** `src/site-theme.ts` turns pages-service's site theme
(SDL-772: 8 colour roles as light/dark pairs, `typeScale`, `radius`, `density`,
`shadow`) into ONE stylesheet: `:root{…}` with the light set, radius, shadow,
`--pages-density` and `--pages-text-<display|h1|h2|h3|lead|body|caption>`, plus
`:root .dark, :root [data-background="dark"]{…}` with the dark set. Roles map to
the kit's variables: background → `--background`; surface → `--card`,
`--popover`; muted → `--muted`, `--secondary`, `--accent`; text →
`--foreground` and the surface foregrounds; textMuted → `--muted-foreground`;
primary / primaryForeground → `--primary` / `--primary-foreground`; border →
`--border`, `--input`. Radius `md`, shadow `soft`, density `default` and type
scale `default` write exactly the kit's / the primitives' own values. No author
CSS: an enumerated field outside its list or a colour that is not `#rrggbb`
falls back to that field's default, and a sheet with `<` or `\` throws.
`parseSiteTheme`, `siteThemeCss`, `siteThemeFontPreloads` and SiteThemeStyle are exported from the
package root and from the catalog server entry. Consumers: `renderPublishedPage(body,
files, data, blocks, theme)` puts `<style data-pages-theme>` ahead of the page
(no theme → no element, markup unchanged); the `siteTheme` prop of SaunaStudio
and `theme` of CanvasFrame draw it inside the canvas frame. A `Section` with
`background: "dark"` carries the kit's `.dark` class and paints itself from the
dark set (the catalog does not offer the value yet — SDL-775). The engine's
`Text` sizes and `Box` gap/padding and the Section's vertical padding read the
variables with their old values as fallbacks. Pinned by
`test/run.tsx` § SDL-773 and plants TH1–TH5.

**Site fonts (SDL-774).** The theme's `fonts: { heading, body }` name families
of the whitelist in `src/site-fonts.ts` — pages-service `models.ThemeFonts`, 31
Google Fonts families (`SITE_FONTS`: family, folder id, category, Cyrillic or
not, license). The files are committed in the site, not fetched:
apps/site/public/fonts/ID/SUBSET-WEIGHT.woff2 (subset latin, cyrillic or cyrillic-ext — the Kazakh letters, weight 400 or 700; per-family Kazakh gaps in `kazakhMissing`, measured on the files by scripts/woff2-cmap.mjs; faces in Google's order cyrillic-ext, cyrillic, latin) plus the family's
`LICENSE.txt`, written by the one-off `scripts/fetch-site-fonts.mjs` (Fontsource
copies of the Google Fonts files; it also regenerates `src/site-fonts-data.ts`).
With `fonts`, the sheet opens with the two families' `@font-face` rules (one per
subset × weight, `font-display: swap`, Google's `unicode-range`, `src` under
the site's fonts folder), sets `--pages-font-heading` / `--pages-font-body` (family + a
category fallback stack) and `--font-geist-sans` on `:root`, and ends with
`body{font-family:var(--pages-font-body)}` and `h1…h6{font-family:var(--pages-font-heading)}`.
A theme WITHOUT `fonts` writes no font rule (the sheet is the SDL-773 one, byte
for byte); a family outside the whitelist is Geist (pages-service's default);
`SITE_THEME_DEFAULT` carries no `fonts` (`SITE_THEME_DEFAULT_FONTS` is Geist/Geist).
`siteThemeFontPreloads(theme)` → the heading's latin-700 and the body's
latin-400 file, the site preloads exactly those. `siteThemeCss(theme, { fontsBase })`:
`null` = no font rules — CanvasFrame passes it, the admin's host does not serve
the site's fonts (font preview in the editor: SDL-776). Pinned by `test/run.tsx` § SDL-774.

Built like `packages/engine`: plain `tsc`, file for file (`prepare` on
`pnpm install`), then `scripts/postbuild.mjs` makes relative specifiers fully
specified and fails the build if any `"use client"` module lost its directive.

**Styling is the host's job.** The editor's own Tailwind classes live in these
sources; the admin's Tailwind scans them (`@source` of `packages/studio/dist` in
`apps/admin/src/app/globals.css`, SDL-605).
The canvas frame copies the parent's stylesheets and drops any sheet declaring
`--sauna-sheet-role: "admin"` on `:root` — the admin must label its own sheet
that way, or the editor chrome leaks into the author's page.

## Guarded behaviours and tests

```bash
pnpm --filter @markerloop/studio build
pnpm --filter @markerloop/studio test          # 120 tests, jsdom, against dist
pnpm --filter @markerloop/studio test:planted  # plants 81 regressions, each must turn the suite red
```

Five things that broke silently, each pinned:

1. **Canvas events are native listeners on the frame's document.** Clicks,
   hover, Esc and double-click inside the iframe are heard by
   `doc.addEventListener` on the frame document, not by React props across the
   portal; hit-testing is duck-typed, never `instanceof` across realms.
   Tests mount the real `SaunaCanvasFrame` + `SaunaCanvasSelection`, fire
   events built in the frame's realm, and click `<html>` of the frame — outside
   the portal container, where only a document listener hears it.
   **A click on a link is cancelled in the capture phase** (SDL-634): next/link
   hears the click through React's portal listener on the frame's `<body>`,
   below the document, and would push the ADMIN's router before the bubbling
   listener cancels anything — on the contour an ActionCardLink took the whole
   editor to its href. The capture cancel is scoped to `a[href]`, because a
   Radix trigger checks `defaultPrevented` the same way and must keep working.
2. **Overlay colours are literals.** The overlay paints inside the frame, where
   admin tokens do not resolve. The test reads every painted colour of the
   rendered overlay and requires a literal; a source guard forbids `var(--`
   in the frame-side modules.
   **The selection and hover frames are drawn whole** (SDL-770): the layer is
   the last child of the frame's `<body>`, outside every node, the size of the
   viewport, clipped and topmost; a frame's box is the node plus its stroke
   (`box-sizing: border-box` pinned — the kit's preflight shifted it up-left
   before), pulled inside the node on any side where outside is off the
   document (`frameBox`). Handles are kept inside the document on all four
   sides; the badge only at the top and the left (it starts at the frame's
   left edge and drops inside the frame when there is no room above).
   The sheet around the iframe (`overflow-hidden`, 1px border) pins
   `box-sizing: content-box`: its width/height are the scaled document's own,
   the border goes around them. Under the admin's `border-box` preflight the
   border ate the document's last 2px on the right and at the bottom, and the
   frame's right edge with them (acceptance on test, 9 Oct 2026). The
   fit-to-width scale leaves room for that border (`available - 2`), and the
   sheet is not rounded: `overflow-hidden` clips to the rounded padding box,
   so a radius shaved the document's corners and the corner handles of the
   first and the last block (review of !317).
3. **One operation = one history frame.** Store ops push one frame, no-ops
   none, the ring is bounded; an inline edit session under StrictMode with
   many keystrokes commits exactly one frame.

4. **Preview switches the editing surface off, not only the canvas.** The host
   renders the document without `editable`, which stops the canvas selecting —
   and that used to be all `preview` did, so the outline still selected a node
   and the Properties form behind that selection still wrote to the store.
   The shell now shuts every door itself (`readOnly`): the Properties pane
   renders a notice instead of a form, Insert is neither offered nor mounted,
   the outline's row actions are withheld, and rename and drag-reorder are off.
   The tests mount the whole shell twice — with `preview` and without — and
   assert the control is live in one and gone in the other, so a gate that does
   nothing cannot pass.

5. **The nesting rule is checked when a node goes in** (SDL-634).
   `allowedParents`/`allowedChildren` are enforced by `applyOp` for every op
   that puts a node under a parent — `addChild` (Insert modal), `replaceNode`,
   `reparent` (outline drag) and `duplicate` (row menu, hotkey; there is no
   paste) — not at render time, where a wrong tree draws without an error.
   A refusal leaves the tree and history untouched and returns
   `{ applied: false, reason }` («Button is not allowed in Box») for the
   caller to show. The Insert modal dims an own component with the target's
   reason where the target refuses a `Ref` node.

6. **The Insert panel is a catalogue of icon tiles** (SDL-631). Its
   acceptance reference is the SDL-594 canvas (`/design-system/studio/insert`).
   Every tile is a kit `Button` with an icon, a name and a sentence —
   `insert-catalog.ts` guarantees all three (adapter `meta.icon`, else a type
   table, else `Component`; adapter description, else a sentence from the
   group), so an empty card cannot be built. Groups are the adapter's
   `meta.category`, sorted by the adapter group's `order` (carried from the
   catalog by `blocksFromCatalog`, since the engine sorts blocks by name); the author's own components are the last
   group, «Your components» (no tabs). Search, group chips, the empty
   catalogue and a failed source each have their own state. Nothing is
   selected on open («Insert block», disabled); a click selects, the footer's
   button or Enter inserts, a double click inserts at once. The live
   showcase preview (`insert-preview.tsx`) is deleted.

7. **Width variants: Base / Tablet / Phone** (SDL-632, slice S5). The
   engine contract is `SaunaNodeConfig.screens` — `screens.tablet.props` /
   `screens.mobile.props` hold ONLY the keys that differ from `props`. The
   store keeps the width being edited in `view.screen` (not in history, not
   in the schema). The Properties form (`properties/screen-variant-section.tsx`
   draws the switch, after `/design-system/studio/properties` «Variants»)
   shows every field as override ?? base (the engine's `saunaLayerNodeProps`),
   writes to `screens[screen].props` (`setScreenProps`, routed by
   `propsPatchOp` — the canvas's in-place text edit uses the same router), and
   marks an overridden field «Overridden» with a Reset that DELETES the key
   (`resetScreenProp`), dropping an emptied width and an emptied `screens`.
   An EMPTIED text input at a width is an override like any other (S6): the
   editor hands back `undefined`, which does not survive the saved JSON, so
   it is stored as `""` — Reset is the only way back to the base. A cleared
   field of any other kind removes the override (`null` would fail the
   component's props schema, e.g. `z.number().optional()`). Keys are written
   with `defineProperty`, so a stored `"__proto__"` key stays data. A value equal to the base is dropped — only differences are stored,
   and a blur without an edit is no history frame. A `Ref`'s `params` keep
   only the parameters that differ from the base, by name (the engine merges
   them by name). The canvas's in-place text edit finds its prop in the layered
   props, the variant the canvas actually draws. The canvas device and the variant are one
   choice: picking Tablet/Phone on the canvas switches the form, picking a
   variant moves the canvas; `renderPreview(schema, { screen })` hands the
   width to the host, which passes it as the render context's `screen`.
   The member branch (`StudioEditTarget` `member`) is S6, below.

8. **Visibility modes and the hybrid member branch** (SDL-632, slice S6).
   `saunaBlockSections()` hands the host two node sections, in the canvas's
   order after the shell's Properties: **Visibility** and **Variants** (the
   width switch moves there; the form draws no second one when the host
   passes it). Visibility is a Public / Hybrid / Private switch that writes
   the mode STRING (`setVisibilityMode`), never an object. The switch shows
   the mode IN FORCE (own or inherited); picking Public or Hybrid when that
   is what the node inherits anyway REMOVES the field rather than pinning a
   copy. An explicit **Private is always stored**: collapsing it into an
   enclosing Private would open the block the moment that enclosing block
   left Private (fail-open). Leaving Private warns how many blocks inside
   become visible to guests (`privateRevealCount`). Leaving hybrid drops
   every `member` in the subtree that no longer sits under hybrid, in the
   same op — one undo step brings both back — and the panel warns with the
   count of branches that would actually clear. The root is not offered the
   switch and the store refuses a non-public root (pages-service answers 422
   `invalid_visibility`). A legacy condition object is called what it is — a
   condition, not access control — with «Replace with mode», which removes
   the field (the block inherits); there is no condition editor. Both
   sections are `editsDocument`, so preview does not draw them. On a node
   whose mode in force is hybrid the form shows **Guests / Signed in** tabs
   (`view.audience`, not in history): Signed in at the base width edits
   `member.props` through the same edit-target router as a width
   (`studioEditTarget` → `propsPatchOp`; the canvas in-place edit uses it
   too), a field shows member ?? base, and the same «Overridden» + Reset
   applies. The store refuses `member.props` outside hybrid. **At a width the
   tabs are off and the form and canvas show guest values**: a width
   override is what guests receive too (pages-service strips `member`, not
   `screens`), so a field that showed member values there leaked them into
   `screens` on the first blur. The Variants strip only counts the overridden fields —
   the one Reset of a field sits next to the field. The canvas renders for
   `renderPreview(schema, { screen, audience })`; **preview always renders
   for a guest** (`studioCanvasAudience`), so a private block is never drawn
   there, and a selected private block is drawn for a member while editing.

9. **The node carries its Element's props version** (SDL-667, EP-128).
   `createStudioStore({ propsVersionOf })` — the host passes
   `propsVersionsFromBlocks(BLOCKS)` from the engine package, the shell does it
   for the store it owns — stamps every node the store creates (`addChild`,
   `replaceNode`, the content child of a new compound item) with its Element's
   `propsVersion`, written only when it is not 1; an op's own
   `child.propsVersion` wins, and `duplicate` keeps the source's (a copy is the
   same props at the same contract). The Insert modal puts the version on the op
   itself, so a host store built without the lookup still gets it. When the
   selected node's version is not its definition's, `SaunaPropertiesAutoForm`
   draws a plate instead of the whole form, the width switch included
   (`data-testid="properties-props-version"`,
   `data-sauna-props-version-mismatch="<type>@v<N>"`, wording in
   `props-version-copy.ts`: «Schema vN, the editor knows vM»), and the column's
   group counter goes quiet. The canvas side is the engine renderer's plate
   (`elements`), which `renderPublishedPage` passes too. Plants `SPV1..SPV4`.

`test:planted` plants: click listener on the admin document; a link cancelled
only in the bubble phase; `instanceof
Element` hit-test; `SELECT_COLOR = "var(--info)"`; an op per keystroke; two
frames per op; preview leaving the Properties pane editable; preview still
offering Insert; preview still letting the outline rename a row; the store's
insert refusal switched off; the store and the op both switched off; the
Insert modal offering an own component the target refuses; a tile without a
sentence; the adapter's group ignored; a search that does not narrow; a tile click that inserts instead of
selecting; groups in arrival (alphabetical) order instead of the adapter's
`order`; Enter on any focused button inserting; the form reading the base at
Phone instead of the override; Reset writing `""` instead of deleting the key;
the canvas text edit matching the base props instead of the variant it draws;
an override equal to the base stored instead of dropped; the mode switch
writing a condition object instead of the mode string; preview rendering for
the author's audience (a private block shown); leaving hybrid leaving `member`
in the subtree; an emptied width field deleted like a Reset; the Signed in tab
editing the base; a `Ref`'s params stored whole at a width; member values
shown at a width; the Signed in tab live at a width; the canvas in-place edit
routed by width only; preview drawing the writing sections; the root offered
Hybrid/Private (store and editor, two plants); the inherited mode pinned as a
copy; `member.props` written outside hybrid; a cleared number stored; an
override key written by assignment; an explicit Private collapsed into the
enclosing Private; a selected private block drawn for a member at a width;
leaving Private without the reveal warning. All forty-one must be caught.
