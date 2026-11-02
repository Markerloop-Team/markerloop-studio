import type * as React from "react";

import type { SaunaScreen } from "../schema/types";

/**
 * Who is looking at a page (SDL-632). A `"member"` sees `"private"` nodes and
 * the `member` branch of `"hybrid"` ones; a `"guest"` sees neither.
 */
export type SaunaAudience = "guest" | "member";

/**
 * A component of unknown props.
 *
 * The one place `any` is allowed in the engine, and it is load-bearing: the
 * registry is heterogeneous by construction — every entry has different
 * props, and the renderer resolves them from JSON at runtime.
 * `ComponentType<unknown>` does not work, because props are contravariant:
 * a `Button` taking `{variant}` is not assignable to a component accepting
 * `unknown`. Named once so the exception is visible instead of scattered.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
export type SaunaAnyComponent = React.ComponentType<any>;

export type SaunaRegistry = Record<string, SaunaAnyComponent>;

export type SaunaUser = {
  id?: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  [key: string]: unknown;
};

export type SaunaRoute = {
  pathname?: string;
  params?: Record<string, string>;
  query?: Record<string, string | string[] | undefined>;
};

/**
 * Runtime context available to every block during render.
 *
 * Two groups of fields live here:
 *
 *  - Render helpers (`icons`, `can`, `link`, `file`) — used by the renderer
 *    to resolve string icon names, gate nodes by permission, rewrite hrefs
 *    and turn `mlfile:` references into URLs. Legacy; preserved as-is.
 *
 *  - Data fields (`user`, `route`, `locale`, plus any custom payload) —
 *    used by visibility rules and variants in the block JSON config to
 *    decide which branch to render. New in M1.
 *
 * The type is open (`[key: string]: unknown`) so consumers can pass
 * arbitrary custom payloads without extending this type globally.
 */
export type SaunaContext = {
  icons?: Record<string, React.ComponentType<unknown>>;
  can?: (permission: string) => boolean;
  link?: (href: string) => string;
  /**
   * Resolves a file id from an `mlfile:<uuid>` reference (SDL-624) to the
   * URL a visitor can load. A pure function, never a hook: the renderer is
   * shared by the server entry, and server components read no context.
   * `undefined` means "unknown file" — the prop is dropped and `Image` draws
   * its empty frame; the reference itself never reaches `<img src>`.
   */
  file?: (id: string) => { url: string } | undefined;

  user?: SaunaUser | null;
  route?: SaunaRoute;
  locale?: string;

  /**
   * Who is looking (SDL-632). Absent: a context with a `user` is a
   * `"member"`, one without is a `"guest"` — read it through `saunaAudience`,
   * never directly. Set it explicitly where the two differ, e.g. the editor's
   * "view as guest" preview.
   */
  audience?: SaunaAudience;
  /**
   * Width being rendered (SDL-632): lays `screens[screen].props` over the
   * node's props. Absent or `"base"` renders the base values.
   */
  screen?: SaunaScreen | "base";

  [key: string]: unknown;
};
