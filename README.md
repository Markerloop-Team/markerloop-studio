# Markerloop Studio — frontend showcase

**Live demo:** https://showroom.markerloop.com/markerloop-studio/ — sign in with any name and password.

This is the production frontend of [Markerloop](https://markerloop.com), packaged so it runs with **no
backend at all**: every API call is answered by a mock of the Markerloop gateway that runs inside the
same Next.js process. The UI, the client logic, the page engine and the visual editor are the product
code. Only the data is invented.

> Source snapshot for review. Secrets, infrastructure manifests, CI, end-to-end suites against live
> environments and internal process documents are not part of it, and the repository has no history.

## What Markerloop is

Markerloop is a shared backend and site builder for small businesses and communities. One workspace
gives a team three products that can be used together or apart:

- **Pages** — a site builder: addresses (routes), page documents, reusable components, a site theme,
  revision history and publishing. Pages are edited in **Studio**, a visual editor.
- **Collections** — a hosted database: typed fields, records, roles and per-field grants, and a public
  REST data plane with access tokens. Pages read collections through data views.
- **Files** — a file library with direct-to-storage uploads, public/private delivery and usage links
  back to the records that reference a file.

Behind it is a set of Go microservices (gateway, auth, users, collections, files, pages, notification,
dictionary). They are **not** in this repository; the mock stands in for them.

## A tour of the demo

The demo workspace is *Ember & Oak Coffee Roasters*, a fictional small roastery:

| Where | What to try |
| --- | --- |
| **Home** | The pinned "Wholesale inbox" with its unread count — an internal page built from a collection. |
| **Pages** | Seven addresses: published, draft, one with unpublished changes. Pin, unpin, publish, rename. |
| **Studio** (open any page) | Layers tree, canvas, properties panel. Select the headline, change the text — it autosaves. Insert elements, move them, switch tablet/phone variants, undo/redo. |
| **Revision history** | Every save is a row; compare two revisions or restore one. |
| **Components** | Site header, footer and a parameterised newsletter block used on several pages. Edit one, every page follows. |
| **Theme** | Presets, colour roles with contrast checks, fonts, radius, density, custom colours; publish and roll back. |
| **Collections** | Coffees, brew guides, wholesale enquiries, events. Edit a record (select, number, image, relation, rich-text fields), change the schema, look at the API and Access tabs. |
| **Files** | The image library; upload your own file (kept in memory for your session). |
| **Workspace** | Members, pending invite, plan. |

Edits are private to the visitor: each sign-in gets its own copy of the workspace, kept in server
memory for six idle hours.

## Repository layout

```
apps/admin          The product app (Next.js 16, App Router): Studio, Pages, Collections, Files, Theme,
                    workspace settings, auth screens. This is what the showroom serves.
  src/demo/         Showcase only: base-path config and the in-process mock backend.
apps/site           The public site renderer: server-renders a workspace's published pages by Host.
                    Included for reference; not mounted in the showroom.
packages/engine     @markerloop/engine — the page document format and everything that reads it.
packages/studio     @markerloop/studio — the visual editor.
packages/ui         @markerloop/ui — the design system (Radix + Tailwind v4, with Storybook).
packages/policy     @markerloop/policy — product rules texts and limits, built into typed content.
scripts/            Font fetch, showroom check and a local prefix-preserving proxy.
```

## Frontend architecture

**Monorepo.** pnpm workspaces + Turborepo, one React 19 / Next 16 version pinned for every package via
the pnpm catalog. Packages ship compiled `dist/` (built on install by `prepare`) and are consumed by the
apps like any npm dependency, with explicit server/client entry points.

**`apps/admin`** follows a Feature-Sliced layout: `app/` (routes) → `widgets/` → `features/` →
`entities/` → `shared/`. TanStack Query owns server state, Zustand the little client state there is,
react-hook-form + zod the forms, next-intl the three interface languages (English, Russian, Kazakh;
a script keeps the catalogues in sync at build). The edge `proxy.ts` is a chain of small layers —
locale, root redirect, section gates driven by runtime flags, public routes, auth check, CSRF origin
guard. Sessions are httpOnly `__Host-` cookies written by the app's own route handlers (a BFF):
the browser never sees the refresh token, a single cross-tab Web Lock serialises refreshes, and every
workspace-scoped call carries a short-lived token for exactly that workspace.

**`@markerloop/engine`** — the document model. A page is a normalised tree
(`{version, rootId, nodes, parents}`) of *elements*; each element has a versioned props schema, so the
UI kit can evolve without migrating stored pages. The engine validates and migrates documents, builds
the element registry and insert catalog from the UI kit, renders on the server or the client, and
implements visibility modes (public / members / hybrid), per-screen overrides, conditional variants,
component references with typed parameters, file references and data views over collections. Storage
is behind a provider interface with optimistic concurrency (`version` / 409 conflict).

**`@markerloop/studio`** — the editor. The canvas renders the real page inside an isolated iframe that
receives only the visitor-facing stylesheets, so editor styles can never leak into content. Around it:
the layers tree with drag-and-drop, contextual insert, a properties inspector generated from the element
props schemas (with dedicated panels for images, links, colours from the theme), screen variants,
visibility editors, undo/redo history, debounced autosave with conflict handling, "save as component",
and the site-theme CSS generator (colour roles, type scale, radius, density, shadows, scales, fonts).

**`@markerloop/ui`** — the Radix-based kit with a prebuilt Tailwind v4 stylesheet and admin primitives;
the same components render the admin and the customer sites.

## How the mock backend works

The product admin calls the gateway at `<origin>/api/v1/*`. In the showcase that prefix is served by a
Next.js catch-all route handler, `apps/admin/src/app/api/v1/[...path]/route.ts`, which hands the request
to `apps/admin/src/demo/server/router.ts`:

- **Same contract as the services.** The `{success, data, meta}` envelope, paging meta, status codes and
  the domain error codes the UI branches on (`route_version_conflict`, `page_route_taken`,
  `block_in_use`, `file_in_use`, `theme_version_conflict`, …). Optimistic versions are enforced, revisions
  are appended (and squashed within a minute, as pages-service does), component usage and file links are
  computed from the data.
- **Sign-in.** Any name and password. Login mints a session id that travels inside unsigned demo JWTs;
  refresh, workspace-token exchange and logout follow the real flow through the app's cookie BFF.
- **Per-visitor state.** `demo/server/store.ts` keeps a deep copy of the seed per session (LRU-capped at
  500 sessions, six idle hours, reset on restart). Server-side calls of the app (session refresh,
  the "no workspace" check) reach the mock over loopback.
- **Seed.** `demo/server/seed.ts` builds the workspace: pages written as element trees and normalised by
  `demo/server/tree.ts`, components with parameters, the theme from the "Warm café" preset, four
  collections with 23 records, 15 files. `pnpm --filter admin demo:check` validates every seeded
  document with the engine's write validator.
- **Files.** The library's images are SVG illustrations drawn by `demo/server/art.ts`. Uploads use the
  real three-step flow (upload URL → direct PUT → complete) against a mock storage endpoint
  (4 MB per file, 40 files per session).
- **Switch.** `NEXT_PUBLIC_DEMO_MODE=false` turns the mock off; the app then talks to a real gateway
  exactly as the product does (`NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`).

Everything showcase-specific lives in `apps/admin/src/demo/` plus a handful of marked call sites: the
base path in `next.config.ts` and on hard navigations, the cookie names, English as the default locale,
the login hint and the files delivery host.

## Run locally

Requirements: Node 20+ (tested on 24), pnpm 10.

```bash
pnpm install
pnpm dev:showroom           # http://localhost:3000/markerloop-studio
```

`pnpm dev` runs the same app at the root (`http://localhost:3000`). Note that the Studio canvas is fully
styled only in a production build: under `next dev` the kit's stylesheet is bundled into the admin chunk,
which the canvas deliberately does not copy.

## Build and run for the showroom

One process, no separate mock server, no environment beyond the two variables below:

```bash
pnpm install --frozen-lockfile
pnpm build:showroom                  # = NEXT_PUBLIC_BASE_PATH=/markerloop-studio pnpm --filter admin build
PORT=3320 pnpm start:showroom        # = NEXT_PUBLIC_BASE_PATH=/markerloop-studio PORT=3320 next start
```

- The app listens on `PORT` (default 3320 in `start:showroom`) on all interfaces and serves everything
  under `/markerloop-studio`: pages, `_next` assets, its own route handlers and the mock API.
- `NEXT_PUBLIC_BASE_PATH` must be the same at build and at start (Next.js reads the base path from the
  config at run time too).
- The reverse proxy must forward `/markerloop-studio/*` **without stripping the prefix**, and should set
  `X-Forwarded-Host` and `X-Forwarded-Proto` (used to build absolute file URLs; without them the request
  `Host` and `https` are assumed).
- The process keeps visitor state in memory: run a single instance (or pin sessions).
- A Docker image is also possible: `apps/admin/Dockerfile` (build from the repository root with
  `--build-arg NEXT_PUBLIC_BASE_PATH=/markerloop-studio`) produces a standalone server on port 3000.

### Checking a showroom build

```bash
node scripts/prefix-proxy.mjs 3321 3320                # forwards only /markerloop-studio/*, logs anything else
node scripts/showroom-check.mjs http://127.0.0.1:3321 ./shots 1440
node scripts/showroom-check.mjs http://127.0.0.1:3321 ./shots 390
```

The check signs in, edits a page headline in Studio and verifies it after a reload, edits a record,
applies and publishes a theme preset, uploads a file and visits components, the inbox and workspace
settings. It fails on any request outside the prefix, any request to another host, any HTTP error and
any console error, and saves a screenshot of every step.

## Other checks

```bash
pnpm --filter admin type-check
pnpm --filter admin validate:i18n                 # en / ru / kk catalogues have identical keys
pnpm --filter admin catalog:check                 # element catalog manifest and API schema are in sync
pnpm --filter admin test:site-theme
pnpm --filter @markerloop/engine test
pnpm --filter @markerloop/studio test
```

## Known limitations of the showcase

- Google and Telegram sign-in, payments, sending invitation emails and deleting the account are switched
  off; their screens explain this.
- Platform administration (users, roles, permissions, dictionaries, policy journal) is outside the demo
  account's permissions and is not shown.
- The public site renderer (`apps/site`) is not mounted; "View" and the editor preview show pages inside
  the admin. Published sites in the product are served on the workspace's own subdomain.
- The Studio canvas does not apply the site theme (by product design); the Theme screen previews it.

Source published for review. © Markerloop. All rights reserved.
