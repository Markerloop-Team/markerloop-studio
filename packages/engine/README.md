# @markerloop/engine

The pages engine: the document schema and its versioning (v1 → v2 migration,
validation), the block catalog built from a UI kit, React tree rendering with
the server/client boundary, and the storage providers. Private workspace
package — it is not published.

## Origin

Started as the engine of an earlier standalone page-editor prototype and was
moved into this monorepo when the editor became part of Markerloop; the
storage provider over pages-service (`src/providers/pages/`) and the
access-denied error type were added on the move.

## Entry points

| Import | What | Boundary |
|---|---|---|
| `@markerloop/engine` | schema types, validate/migrate, schema ops, block refs, provider types and errors | server-safe, no React |
| `@markerloop/engine/react` | `Sauna` (client), `SaunaProvider`, `SaunaRenderer`, `createSaunaCatalog` | `"use client"` |
| `@markerloop/engine/react/server` | `Sauna` (async server component), `SaunaRenderer`, `createSaunaCatalog` | server |
| `@markerloop/engine/react/renderer` | `SaunaRenderer` + the `data-sauna-*` attribute constants | either |
| `@markerloop/engine/providers/pages` | `createPagesServiceProvider` — **the provider the admin uses** | either |
| `@markerloop/engine/providers/http` | generic ETag/If-Match provider (reference copy) | either |
| `@markerloop/engine/next` | `createSaunaRouteHandlers` for a Next route handler | server |

The editor modal under `src/react/editor` came along because the client
`Sauna` opens it in `editable` mode; the visual Studio itself is SDL-604.

## Registry, catalog, adapter (SDL-629)

Two objects, not one list:

| Object | Type | Answers |
|---|---|---|
| **Registry** | `SaunaRegistry` (`type` → component) | what do I render this node with |
| **Catalog** | `SaunaComponentCatalog` items, or the `BlockDefinition[]` the editor is handed | what do I offer for insertion |

`createSaunaCatalog(ui, { adapter })` yields both from one kit walk. A catalog
entry with no registry pair is a block that inserts and renders nothing, so the
pair is checked, not assumed:

- **compile time** — `defineElementSet({ registry, blocks })` (from
  `@markerloop/engine/react` and `/react/server`) refuses a block whose literal
  `type` is not a key of a literal registry. `defineBlock` keeps `type` literal
  for this. A string-keyed registry (the kit, walked at run time) accepts any
  name, which is what the next line is for;
- **run time** — `findUnrenderableTypes(blocksOrCatalog, registry)` returns the
  offered types with no component. The admin's `smoke:pages` requires it empty
  for `PAGES_BLOCKS`/`PAGES_REGISTRY` and for the kit's own pair.

**Terms.** A *Component* is a unit of `@markerloop/ui`, invisible to the page
document. An *Element* is the adapter's wrapper over one or more Components with
a designed props surface; the Element is what a page stores and what is
versioned.

**The adapter** (`SaunaElementAdapter = { groups, groupOf }`) is how the host
adapts Components for the editor instead of passing the design system through
one-to-one. Today it carries the group of each Component in the Insert modal.
When an adapter is given it is the only source of the group; without one the
kit's own `saunaCatalogMeta[type].groupId` is used. Anything neither names lands
in `SAUNA_UNGROUPED_ID`. **There is no name-based heuristic**: the engine used to
guess the group from the export prefix (`Form*` → Forms, `Box*` → Primitives);
that code is gone and the engine test pins it. The admin's adapter is
`apps/admin/src/widgets/pages/kit-adapter.ts`, and `smoke:pages` fails when a
renderable kit export has no row there.

## Elements: props-schema version, DataView (SDL-639)

A document node names its Element (`type`) and, optionally, the version of
that Element's **props contract** its `props` follow: `SaunaNodeConfig.propsVersion`
(EP-128). Absent means 1, and **there is no migration** writing `1` into old
nodes — "absent = 1" is the compatibility rule, read by `saunaNodePropsVersion`.
The definition side is `BlockDefinition.propsVersion` (absent = 1, read by
`blockPropsVersion`); the kit may change look, spacing and markup freely, only
a change of the props contract bumps it. `parseElementProps(def, node)` reads a
node through its definition: an older node is first brought up through the
definition's migrations (SDL-670, below), a newer one or one the migrations cannot
carry is refused by number before the shape is looked at, then `props` is parsed
against `staticProps` and zod issues come back as `{ path, message }` like
`validateSaunaSchema` reports.

**Since SDL-667 the version is written and checked**, through one rule,
`elementPropsVersionMismatch(def, node)` (the first step of `parseElementProps`):

- **Written at insertion.** `addChildNode` / `replaceSubtreeWithNode` take
  `child.propsVersion` (type SaunaNewNode) and `createInitialNodeConfig(type, v)`
  writes it **only when it is not 1** — a node of a v1 Element looks exactly like
  every node stored before the field existed. `addCompoundItem(…, { propsVersionOf })`
  stamps the content child it creates. `duplicateSubtree` copies the node whole,
  so a copy keeps its SOURCE's version (the same props at the same contract).
  `propsVersionsFromBlocks(blocks)` is the type → version lookup the editor's
  store takes (the studio package, `createStudioStore({ propsVersionOf })`).
- **Checked at render.** `SaunaRenderer` takes `elements` (the registry's
  `BlockDefinition`s): before the registry lookup a node whose version is not its
  definition's draws a plate — `data-sauna-unknown-props-version="<type>@v<N>"`,
  `data-sauna-unknown-children` with the count of direct children not drawn,
  marked with the node id when editable — shaped like the unknown-type plate.
  The version-only check, not a zod parse of every node on every render. Without
  `elements` nothing is checked, which is what the parity snapshot renders.
  The admin canvas and `renderPublishedPage` pass the pages catalog.
  `saunaPublicShell` does not look at versions.
- **Bump an Element's `propsVersion` only together with a migration (EP-128).** A node
  without the field reads as v1, so without one every stored node of that type becomes a
  plate on published pages. Update the admin's page seed (`seedPageSchema`) and
  `COMPOUND_ITEM_CONTENT` (`src/core/compounds.ts`) in the same change.

**Declarative props migrations (SDL-670, `packages/engine/src/core/element-migrations.ts`).**
`BlockDefinition.migrations` holds exactly `propsVersion - 1` migrations;
`migrations[k-1]` turns vk props into v(k+1) and is `{ steps: [...] }`, plain data
(builders: `migrationStep.rename / move / remove / setDefault / mapValue / custom`):

| Step | Effect |
| --- | --- |
| `rename { from: path, to: key }` | the key at `from` gets a new name in the same object |
| `move { from: path, to: path }` | the value moves; missing objects on the way are created |
| `remove { key: path }` | the key is deleted |
| `setDefault { key: path, value }` | written only where the key is absent (a present `null` stays) |
| `mapValue { key: path, map }` | a string value found in `map` is replaced by `map[value]` |
| `custom { id }` | the implementation registered under `id` gets a copy of the whole node |

Paths are dot-separated object keys (no array indices). rename / move / remove /
mapValue apply to every props layer (`props`, `member.props`, `screens[*].props`,
`variants[*].props`). Override layers lie over the base shallowly, by top-level key, so:
setDefault writes into the base `props` and, for a nested key, into every layer that holds
the key's top-level parent; a nested move seeds a layer that lacks the target's top-level
key with a copy of the base's value (siblings are not erased), and a layer that does not have
the move's source (and does not hide it) but holds the target's top-level object gets the
base's pre-step value in the target; a layer holding a non-object on a setDefault path is
skipped. Known limits of the shallow overlay, pinned by fixture cases: a seeded layer keeps a
COPY of the base's siblings (a later base edit does not reach that screen); a move out of a
nested object to the top level lets the base value show through a layer that hid it; a screen
layer gets the base's value, not the member branch's. An absent source makes
rename / move a no-op, a present target is replaced, reading through an array finds
nothing, writing through a non-object is `path_conflict`; a step field the op does not
take or a non-JSON value is `invalid_step`, a node `propsVersion` that is not a whole
number of at least 1 is `invalid_version`. Re-registering a custom id replaces it (hot reload).
`custom` is the escape hatch for what the five cannot say (nested
DataView props, say): its id needs a TS implementation (`registerElementMigration`)
and a Go one in pages-service (SDL-671) before an Element ships it.

- `defineBlock` throws `ElementMigrationError` (`code: migration_count | invalid_step`;
  guard `isElementMigrationError`) unless the count and the steps are right; the
  admin's catalog generator re-checks with `requireCustom: true` and writes the steps
  into `element-catalog.json`, so they move `catalogVersion`.
- `migrateElementProps(def, node)` — server-safe, no zod, no React: the same version
  returns the node itself; an older one returns a migrated COPY with `propsVersion`
  set; a newer node, a wrong count, an unregistered custom id or a path conflict
  throws (`newer_version`, `invalid_version`, `migration_count`, `unknown_custom`,
  `path_conflict`, `custom_failed`). `parseElementProps` migrates first and validates the result
  against `staticProps` — a step producing props outside the schema is reported.
- **Not wired into the read paths yet.** `SaunaRenderer` and the Properties form
  still compare versions only (`elementPropsVersionMismatch`), so a migrated Element's
  old nodes would still draw a plate. Until a read path migrates, a bump is still
  not safe to ship even with its migration.
- The shared fixture `test/fixtures/element-migrations.cases.json` (definition,
  input node, expected node or error code; test Elements only) is replayed by the
  engine test and is meant to be copied verbatim by the Go interpreter (SDL-671).

`DataView` (`core/data-view.ts`, component `react/data-view.tsx`,
`WIDGET_BLOCKS` / `WIDGET_REGISTRY`) is the first widget Element (EP-117). The
data source is part of its props — the binding lives on the node, not on the
page (`collection_binding` is untouched) and not as a `$bind` marker:

```ts
{
  source: { kind: "collection", workspace_id: uuid, collection_id: uuid },  // strict: a project_id is refused
  fields: string[],                                   // field keys drawn per record
  sort: { field: "created_at" | "updated_at" | fieldKey, direction: "asc" | "desc" },
  filter: { field, op, value }[],                     // op ∈ eq|ne|gt|gte|lt|lte|in|like|null — collections-service's set, nothing more
  presets: { id, label, filter: clause[] }[],         // tabs: "Unread" / "All"
  limit: 1..100,
}
```

Every part is what `GET /records` can serve (`record_filters.go`,
`record_query.go`): `dataViewQuery(props, presetId)` turns it into that exact
query (`collection_id`, `sort_by`, `sort_order`, `limit`, `filter[field][op]`),
and the tests pin the form. `workspace_id` is the scope the collection lives in,
not a records-list param. A node fresh from the catalog has no `source` — it
is **unbound**, `parseElementProps` reports `$.props.source`, the component
draws its unbound frame. Fetching and drawing records is the admin wiring task;
the component today is the frame (preset tabs + empty state), rendering the
same on the server and in the canvas.

## No author JavaScript, no raw HTML (SDL-681)

**The rule:** an Element takes no author JavaScript and no raw HTML. A page is JSON written by a
workspace member and rendered for anonymous visitors on the workspace subdomain, so every prop
that reaches the DOM is author input.

- **URLs** — `href`, `src`, `action`, `formAction`, `poster`, `xlinkHref` and any name ending in
  href / src (`imageSrc`, `logoHref`), compared case-insensitively, at any depth of the props (a
  nav item's `href` inside an array counts): only http:, https:, mailto:, tel:, a relative
  address (no scheme: a path, an anchor, a query, a protocol-relative host), and in a `src`-like
  prop also data:image/*. The engine's own mlfile: reference passes (the renderer resolves or
  drops it first). javascript:, vbscript:, data:text/html and every other scheme are refused.
  The scheme is read the way a browser reads it: leading control characters and spaces, tabs and
  newlines are stripped first, case is ignored. Only a string may stand under a URL name: an
  array, number, object or boolean is refused like an unsafe scheme (React joins an array into
  one string, so `src: ["data:text/html,x"]` would reach the DOM as data:text/html,x). `null`
  is an absent value and passes — React writes no attribute for it.
- **Props** — never accepted from a document, at any depth, in any case: `dangerouslySetInnerHTML`,
  `srcDoc`, every `on…` key, and a URL attribute in any spelling but React's (HREF,
  `formaction`, `xlink:href`) — React writes such a name into the DOM as is.
- **Strict on write, lenient on read** — one module, `src/core/safe-url.ts` (`isSafeUrl`,
  `isForbiddenPropName`, `findUnsafeProps`, `stripUnsafeProps`):
  - `validateSaunaSchema(schema, { mode: "write" })` refuses them by path
    (`$.nodes.<id>.props.href`) in `props`, `member.props`, `screens.*.props` and a variant's
    `props`, v1 documents too. The pages-service provider's `put` validates so before any PATCH,
    so a write through the editor never sends them. `createSaunaRouteHandlers`' PUT validates so
    too and answers 400 before the provider is called, with every refused path in the body:
    `{ "error": "Unsafe URL or raw-HTML prop", "issues": [{ "path": "$.nodes.<id>.props.href",
    "message": "…" }] }`. The editor's link field says so as it is typed.
  - **Where the write check ends** — it lives in these two clients, not in storage. pages-service
    checks some props on its own (a `src` that is not mlfile: or https:// is a 422, and it checks
    `visibility` and `propsVersion`), but not `href` and the other URL props: a PATCH straight
    to its API (through the gateway or not) stores `href: "javascript:alert(1)"`, a number or an
    array and answers 200. What protects the visitor then is the render rule below — when the
    page is rendered by this engine, such a link is dropped, never executed. The public read API
    serves the stored JSON as it is, so a third-party consumer of it gets the value unchanged. A
    server-side URL check in pages-service is not done.
  - The default mode is `read` (the provider's `get`, the published render, revision diffs): the
    same findings come back as `warnings` on an `ok` result. A stored document is never refused
    whole for an unsafe link — the page degrades by one attribute, not to a 500.
  - The renderer drops them before anything else reads the props, and checks the URL a host's
    `context.link` and `context.file` return.
  - `Link` writes no `href` at all for a refused one (and no longer falls back to `#` when it has
    none) — a refused link reads as text. Its own `href`, `target` and `rel` come after the rest
    props (and the REL / Target / HREF spellings are dropped), so a document cannot take
    `noopener noreferrer` off a new-tab link. Called directly, it also drops any other URL-like
    prop (SRC, logoHref — names compared case-insensitively) whose value is not safe.
- **What the renderer cannot know** — a component that *requires* `href` (the kit's
  `ActionCardLink` over Next's Link) throws once its refused `href` is dropped; on a page that is
  an isolated node error, not script. The admin's `smoke:pages` prints it as a `note`.
- **Not covered** — a Ref's `params` are checked by key name only: a parameter named otherwise
  whose value lands in an `href` of the block is dropped at render, not refused on write.
  Deliberately outside the URL check, as a known boundary: `srcSet` (a list of URLs, not one),
  `ping` and a `url(...)` inside a `style` value — none of them runs script in a current
  browser, and no Element in the catalog offers them as a field.
- **Guards** — engine tests (`safe urls: …`, provider put, route handlers PUT and its `issues`,
  Link `rel`, Link URL props in any case), plants `X1`–`X13`; `smoke:pages`
  § SDL-681 (element-guard.ts in the admin's smoke folder): no raw-HTML/handler prop in
  `props-manifest.json` or a block's `staticProps`; every registered type rendered as a visitor
  sees it with a script payload in its text props and the forbidden props planted, case variants
  included (no `<script`, `javascript:`, `srcdoc` or inline handler in the markup); no
  `dangerouslySetInnerHTML` / `srcDoc` in the workspace packages' built code (third-party code in
  node_modules is not scanned — only the render probe sees it); a published body with an unsafe
  link renders without it. Each leg is proven on a planted offender every run. The render probe is
  what found the kit's `ThemeProvider` (next-themes) writing its props into an inline `<script>`
  unescaped; in the pages registry it is now inert (draws only its children, in the studio
  package's catalog).

## Page behaviour slots: queries, state, bind, on (SDL-690)

The document format keeps room for page behaviour now, so that its arrival is not a migration
of stored documents (owner decision 29 Sep 2026, EP-128). Four optional keys:

| Where | Key | Meaning |
|---|---|---|
| document root | `queries` | what data the page takes (successor of `collection_binding`) |
| document root | `state` | the page's local state |
| node | `bind` | which props of the node come from the context |
| node | `on` | the node's reactions to events |

Nothing interprets them yet, so their type is SaunaPageBehaviorSlot (an alias of `unknown`) and the
validator checks no shape. The contract the engine and the editor hold: a slot present in a
document survives read, edit and write by value (validator, migration, public shell, every
schema op, the provider PATCH/GET, the studio store with undo/redo); a document without them
stays byte-identical, nothing invents an empty slot. The renderer never hands `bind`/`on` to a
component, and a node-level `on` is not an `on…` prop (those stay refused, SDL-681). Key lists:
`SAUNA_DOCUMENT_BEHAVIOR_KEYS`, `SAUNA_NODE_BEHAVIOR_KEYS`. pages-service holds the same line;
the shape and its checks arrive with the interpreter. Tests: `SDL-690: …` in `test/run.tsx`
here and in the studio package.

## Visibility modes, member branch, screens, public shell (SDL-632)

`SaunaNodeConfig.visibility` holds either a **mode** string or the legacy
condition object (`{ permission?, when? }`):

| Value | Guest | Member | Public shell |
|---|---|---|---|
| absent / `"public"` | shown | shown | kept |
| `"hybrid"` | shown, `props` | shown, `props` < `member.props` | kept, `member` stripped |
| `"private"` | hidden | shown | **cut with its subtree** |
| legacy object | evaluated as before | evaluated as before | kept (presentation, not access control) |
| any other string, number, array | hidden | hidden | cut (fail closed) |

There is no migration: an absent field means public. The audience is
`context.audience` when set, else `"member"` iff `context.user` is set — read it
with `saunaAudience(context)`. `validateSaunaSchema` accepts the three strings
or an object and refuses any other string by path. A `member` on a node that is
not (under) a hybrid one is inert and **not** refused: a document already in
storage must stay loadable so the author can fix it.

**Props layers** (`saunaLayerNodeProps`, used by `resolveNodeBody`):
`props` < `member.props` (member, and the mode in force — the node's own or its
nearest ancestor's — is hybrid) < `screens[context.screen].props` < the matched
legacy variant. Layering is by key; on a `Ref` node the `params` key merges by
parameter name, so an override that sets one parameter keeps the others. The
renderer hands the mode down through `children` and into a `Ref`'s block.

**Public shell** (`core/public-shell.ts`): `saunaPublicShell(schema)` removes
every private (or malformed-visibility) node with its subtree — reached through
`children`, `variants[].children` and, for hand-written documents, the
`parents` chain — from `nodes`, `parents` and every surviving `children` /
`variants[].children`; strips `member` from every node; drops `params` specs
that pointed into the cut. A private root is reduced to `{ type }`. Nothing else
changes and the input is never mutated. `saunaNodeCacheability(schema, id)`
answers `full` / `guest-branch` / `none`. pages-service runs the same cut in Go
before it signs file URLs and computes the ETag of the public plane (SDL-632
S4); both sides are held to `test/fixtures/visibility-shell.cases.json`, which
pages-service copies verbatim — edit here, copy there.

## Provider: pages-service through the gateway

```ts
import { createPagesServiceProvider } from "@markerloop/engine/providers/pages";
import { getApiBaseUrl } from "@/shared/lib/api/base-url";

const pages = createPagesServiceProvider({
  apiBaseUrl: getApiBaseUrl(),          // "/api" on the contours
  workspaceId,                          // every editor route is workspace-scoped
  headers: async () => ({ Authorization: `Bearer ${token}` }),
  // kind: "blocks" for project blocks
});
const { schema, version } = await pages.get(pageId);   // GET  /api/v1/pages/pages/{id}?workspace_id=…
await pages.put(pageId, schema, { ifMatch: version }); // PATCH {body, version}
```

| pages-service answer | Provider |
|---|---|
| 200 | `{ schema, version: String(doc.version) }`; a document whose `workspace_id` differs from the requested one is refused as 403 |
| 401 (no JWT / bypassed gateway), 403 (`workspace_scope_mismatch`) | `SaunaAccessDeniedError` (`status`, `code`) |
| 404 | `SaunaNotFoundError` |
| 409 `*_version_conflict` | `SaunaConflictError` with `latestVersion` from the returned document |

`SaunaId` is the document UUID, `SaunaVersion` the integer version as a
string. `put` without `ifMatch` reads the current version first.

Base URL: `/api` (or `https://staging.example.com/api`) through the admin
host, `https://api.staging.example.com` on the API host — it serves `/v1` at the
root, `https://api.staging.example.com/api/v1/…` is a 404. Live check 22 Sep 2026:
an anonymous `get` through both hosts came back `SaunaAccessDeniedError(401,
"unauthorized")` from the gateway.

## Build

`pnpm build` = `tsc -p tsconfig.build.json` (file-for-file, **not bundled**)
+ `scripts/postbuild.mjs`. Runs as `prepare` on `pnpm install`; `dist/` is
gitignored. Not bundled on purpose: bundling folds client and server modules
into one file and drops the `"use client"` directives. The postbuild rewrites
relative imports to fully specified `./x.js` (the package is `"type": "module"`,
webpack refuses extensionless specifiers there) and fails the build if
`react/index.js` loses its directive or `react/server.js` gains one.

React, React DOM and Next come from the workspace `catalog:` in
`pnpm-workspace.yaml` — the same versions the admin ships.

## Tests

```bash
pnpm --filter @markerloop/engine test              # parity snapshot + boundary + provider contract
pnpm -C packages/engine run test:planted           # plants known regressions; each must turn the suite red
pnpm --filter @markerloop/engine snapshots:record  # re-record from the reference (local only)
pnpm --filter admin smoke:engine                   # the admin imports and executes the package
```

- **Parity:** `test/fixtures.tsx` holds 11 documents (visibility, variants,
  links/icons from context, refs with params, nested refs, missing/cyclic
  refs, v1 migration, editable ids, server and client `Sauna`).
  `snapshots:record` renders them with the reference's source and commits
  `test/__snapshots__/reference.json`; `test` renders them with this package's
  **dist** (imported by package name) and requires byte-identical markup.
  Re-record only when the reference itself changes — it is frozen, so a
  red parity test means this package drifted.
- **Declared divergences:** where this engine is MEANT to differ from the
  reference, `divergences` in the same JSON declares the RULE of the
  difference, not its result — a `strip` regex removing exactly what we add,
  and the cases it applies to. The suite strips it from our output and
  requires the remainder to equal the reference **byte for byte**. Nothing
  stores a rendered blob on purpose: a stored "expected" is a lock file, and a
  lock file is cleared by rewriting it, so an unrelated regression could ride
  along inside the same string under a reason that no longer describes it.
  A rule has nothing to rewrite — any drift outside what `strip` removes fails,
  and widening `strip` to hide one case breaks the others that share it. An
  entry that strips nothing anywhere fails as a dead exemption. Today there is
  one, over six cases: an unknown node type draws a placeholder rather than
  rendering nothing (SDL-608).
- **Provider:** a fake gateway with the real contract (scope check → 403,
  missing token → 401, version check → 409) exercises every row of the table
  above.
- **Registry vs catalog (SDL-629):** `findUnrenderableTypes` reports an
  offered type with no component; the kit walk's two halves pair up; the group
  comes from the adapter and a `Form*`/`Box*` name earns nothing by itself
  (re-adding a prefix guess turns this red); a `@ts-expect-error` pins that
  `defineElementSet` does not compile a block without a registry pair, so
  `type-check` goes red if that check ever stops biting.
- **Selectable nodes (SDL-634):** the renderer marks a node through its
  component's props, so a component whose root drops the rest props renders
  fine and cannot be clicked on the canvas. `findUnmarkedTypes` renders every
  registry entry in editable mode (the caller passes `renderToStaticMarkup`)
  and names each one whose markup lacks the node id, or that throws. The test
  holds the primitives to it; `smoke:pages` runs it over the admin's whole
  registry.
- **Image width and `fit` (SDL-769):** `Image` is `max-width: 100%;
  min-width: 0`: pictures wider than a row share it instead of the first one
  taking the row and the page root (`Page`) clipping the rest. A row `Box`
  renders `BOX_ROW_RULE` — in a row that holds an `<img>`, text (`p`,
  `h1`–`h3`) and `Box` children get `flex-shrink: 1000`: they give up width to
  the picture first, so a 200px logo beside a long paragraph keeps its size
  (without it the paragraph's one-line width squeezed the logo to ~20px), and
  they never grow (`flex: 1 1 0%` stretched a column of buttons to the whole
  row). Buttons, links and kit components are untouched; a row without a
  picture is unchanged. The `<style>` is the row's first child.
  `aspect` (CSS `aspect-ratio`, `IMAGE_ASPECTS`; absent = `auto` = the
  picture's own shape) makes the `<img>` a full-width frame of that shape; only
  then do cover, contain and fill draw different pixels — in an `auto` frame
  they are the same (none and scale-down still differ when the picture is drawn
  smaller than it is). Plants SDL769, SDL769b, SDL769c, SDL769d.
- **Nesting rule at insert (SDL-634):** `addChildNode` and
  `replaceSubtreeWithNode` take the same `canParent` as `reparentNode` and
  refuse — schema unchanged — before anything is written.
- **File references (SDL-624):** a picture is `mlfile:<uuid>` in the schema
  (`core/file-refs.ts`), resolved to a URL by `context.file` inside
  `resolveProps` — a pure function, so the server entry renders it too. No
  resolver or an unknown id drops the prop and `Image` draws its empty frame;
  the reference never reaches `<img src>`. `collectFileRefs`,
  `findFilePathProps` and `isAllowedMediaSrc` are pinned to
  `test/fixtures/file-refs.cases.json`, the fixture pages-service copies
  verbatim for its Go twin. `pnpm --filter @markerloop/engine test:planted`
  plants the known regressions (the branch removed; an unresolved
  reference passed through; the nil UUID; a DataView source that drops
  `project_id` instead of refusing it; a foreign `propsVersion` ignored; and,
  since SDL-667, `PV1..PV4`: an insertion at v2 without the version, the
  renderer drawing a v2 node with its v1 definition, `1` written, a compound
  item's content child unstamped; since SDL-670, `M1..M5`: propsVersion 2 accepted
  without a migration, migrated props not checked against `staticProps`, an
  unregistered custom step skipped, a top-level setDefault writing into override
  layers, the input node mutated; `M6..M10` from the review: a nested setDefault not
  reaching a layer that holds the parent, a nested move leaving a partial parent in a
  layer, a node version 0/-1/1.5 accepted, an extra step field accepted, a non-JSON
  setDefault value accepted; `M11..M12` from the delta review: a layer with a non-object on a
  setDefault path failing the node, a nested move not reaching a layer that holds the target's
  parent) and requires the suite to go red.
- **Visibility modes and the public shell (SDL-632):** the shell and
  cacheability are pinned to `test/fixtures/visibility-shell.cases.json` case by
  case (plus: input not mutated, idempotent, and the shell renders for a guest
  exactly as the document does); layer order, member-only-under-hybrid, params
  merged by name through a real `Ref`, and the validator's three-strings rule
  have their own tests. `test:planted` adds six plants: private read as
  visible; the cut skipping `variants[].children`; `member` left in the shell;
  a Ref's `params` replaced whole; `member.props` applied outside hybrid; an
  unknown visibility string accepted. CI job `smoke:engine` runs `test`,
  `test:planted` and the admin's `smoke:engine`.
