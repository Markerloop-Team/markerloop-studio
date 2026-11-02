# apps/admin

The Markerloop product app: Studio (the page editor), Pages, Components, Theme, Collections, Files,
workspace and account settings, and the sign-in screens. Next.js 16 (App Router), React 19.

See the repository README for the architecture, the mock backend and how to run it.

## Layout

```
src/app/        routes; (product) = the signed-in shell, (auth) = sign-in screens,
                api/auth/* = session BFF, api/v1/[...path] = the showcase mock gateway
src/widgets/    screen-sized blocks: page editor, collections shell, files library, theme editor, …
src/features/   user actions: create address, pinned feed, record relations, asset picker, …
src/entities/   domain models and their queries: pages, collections, files, site theme, user, …
src/shared/     API clients, session cookies, config flags, hooks, shared components
src/proxy/      the edge proxy layers (locale, redirects, section gates, auth, CSRF guard)
src/messages/   interface strings: en, ru, kk
src/demo/       showcase only: base path and the in-process mock backend
scripts/        i18n and policy validators, element-catalog generators
```

## Scripts

- `pnpm dev`, `pnpm build`, `pnpm start` — the usual Next.js commands (`prebuild` validates the i18n
  catalogues and the policy texts).
- `pnpm type-check`, `pnpm lint`.
- `pnpm demo:check` — validates every seeded demo document with the engine's write validator.
- `pnpm catalog:check`, `pnpm test:site-theme` — unit checks.

Environment variables are listed in `env.example`.
