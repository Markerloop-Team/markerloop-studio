// Product sections that a contour can switch off at RUNTIME (SDL-635).
//
// Why runtime and not a NEXT_PUBLIC_* build flag: prod receives the very image
// that passed the test contour (the `promote` job copies the tag), so anything
// inlined at build time is identical on both contours by construction. A
// section whose backend exists on one contour and not on the other can only be
// gated by the pod's own environment, read on the server per request.
//
// Read it ONLY on the server — a server component, route handler or the proxy.
// In a browser bundle `process.env.PAGES_SECTION_ENABLED` is undefined, which
// reads as "off": the fail-safe answer, never a leak of the section. Client
// components receive the result as a prop (see app/(product)/layout.tsx); the
// client shell hands it further down through ProductFeaturesProvider
// (product-features-context.tsx), so a screen deep inside a section reads it
// with useProductFeatures() and never from the environment.

/** Pod env var that turns the pages section (/pages, /pages/**) on. */
export const PAGES_SECTION_ENV = "PAGES_SECTION_ENABLED";

/** Pod env var that offers "publish" inside the pages section (SDL-636). */
export const PAGES_PUBLISH_ENV = "PAGES_PUBLISH_ENABLED";

export type ProductFeatures = {
  /**
   * The pages editor (SDL-605). Off by default: pages-service is deployed to
   * the test contour only (EP-113), and a prod gateway without it answers 500
   * on every pages route. The test overlay turns it on.
   */
  pages: boolean;
  /**
   * "Publish" in the pages editor (SDL-636). Off by default: the reference
   * (dev-infra/docs/pages-reference, 08d В.2.1) requires a publication
   * snapshot, and pages-service has none yet — the public read serves the
   * CURRENT saved body, so every later save would go live unreviewed. Until
   * the snapshot exists, prod keeps the section and hides publishing; the
   * test overlay turns it on so the contour keeps exercising it.
   *
   * Hides the way IN (draft → published) only. The way out, "unpublish",
   * stays wherever an address is already published: a retreat that takes a
   * page off the site must never be the button that disappears.
   */
  pagesPublish: boolean;
};

type Env = Record<string, string | undefined>;

/**
 * Only the literal `true` (any case, surrounding spaces ignored) enables a
 * section. Absent, empty, `false`, `0`, a typo — all read as off: an unknown
 * contour must not show a section whose backend may not exist there.
 */
function isOn(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function readProductFeatures(env: Env = process.env): ProductFeatures {
  return {
    pages: isOn(env[PAGES_SECTION_ENV]),
    pagesPublish: isOn(env[PAGES_PUBLISH_ENV]),
  };
}

// ---------------------------------------------------------------------------
// Product rules (SDL-658): which promises of packages/policy are in force on
// this contour. Same mechanism and same reasons as the section flags above —
// prod runs the image test passed, so only the pod env can say what is true
// where. A /rules section opens only when EVERY promise it carries is listed;
// otherwise it answers 404, unless the contour shows drafts (test), where it
// is shown with a «не действует на проде» banner.

/** Pod env var: comma-separated promise keys in force on this contour. */
export const POLICY_LIVE_PROMISES_ENV = "POLICY_LIVE_PROMISES";

/** Pod env var: only the literal `true` shows sections not in force (test). */
export const POLICY_SHOW_DRAFTS_ENV = "POLICY_SHOW_DRAFTS";

export type PolicyFlags = {
  livePromises: readonly string[];
  showDrafts: boolean;
};

/**
 * Absent or empty POLICY_LIVE_PROMISES = nothing in force (fail safe: an
 * unknown contour promises nothing). Keys are trimmed; empty items dropped.
 */
export function readPolicyFlags(env: Env = process.env): PolicyFlags {
  const livePromises = (env[POLICY_LIVE_PROMISES_ENV] ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
  return {
    livePromises,
    showDrafts: isOn(env[POLICY_SHOW_DRAFTS_ENV]),
  };
}

// ---------------------------------------------------------------------------
// Sign-in through Telegram (SDL-754): an ARCHIVED function. The owner took it
// out of the product on 8 Oct 2026 over a vulnerability of the bot sign-in;
// the code stays, and only the owner's decision turns it back on. Same
// mechanism and same reasons as the section flags above — one image on both
// contours, so only the pod env can say. auth-service answers 404 on its
// /telegram/* sign-in routes under its own flag of the same name; this one
// hides the ways IN on the admin's side: the Telegram button on /login and
// /register (features/auth/oauth-buttons.tsx) and the Mini App sign-in on
// /webapp, which says the sign-in is switched off instead of calling auth.
// Not a sign-in, therefore not gated here: the bot section (/telegram-bot),
// notifications, external accounts in /users. (The bot section and
// notifications are hidden from the shell by their own flags since SDL-768,
// see "Dormant sections" below.)
//
// Kept out of ProductFeatures on purpose: that type is the product shell's
// (sections, the sidebar's `features` prop), while this flag is read by the
// public auth screens, which live outside the shell — app/(auth)/layout.tsx
// and app/webapp/layout.tsx read it and hand it to TelegramLoginProvider
// (telegram-login-context.tsx).

/** Pod env var: only the literal `true` offers sign-in through Telegram. */
export const TELEGRAM_LOGIN_ENV = "TELEGRAM_LOGIN_ENABLED";

/** Absent, empty, `false`, a typo — all off: the archived sign-in stays hidden. */
export function readTelegramLoginEnabled(env: Env = process.env): boolean {
  return isOn(env[TELEGRAM_LOGIN_ENV]);
}

// ---------------------------------------------------------------------------
// Dormant sections (SDL-768): Notifications and the Telegram bot. The owner's
// milestone run-through (9 Oct 2026) found both useless today — the pages are
// "coming soon" stubs and the header bell had no handler — and asked to hide
// them until they are rethought. Hidden, not deleted: the code and the routes
// stay, /notifications and /telegram-bot still open by their address (no
// section-gate 404, unlike SDL-635), only the ways IN disappear — the header
// bell, the sidebar items and the dashboard cards. Same mechanism as the
// Telegram sign-in above: a pod env flag, read on the server per request,
// only the literal `true` turns a section back on; absent = hidden, so no
// overlay has to change for the hiding to take effect.
//
// Kept out of ProductFeatures on purpose: that type answers "can this contour
// serve the section" (a backend question — off means 404, SDL-635), these
// answer "should the shell lead anyone there" (a product question — off still
// serves the page). app/(product)/layout.tsx reads them and hands them to
// DormantSectionsProvider (dormant-sections-context.tsx) around the shell.

/** Pod env var: only the literal `true` brings back Notifications (bell, item, card). */
export const NOTIFICATIONS_SECTION_ENV = "NOTIFICATIONS_SECTION_ENABLED";

/** Pod env var: only the literal `true` brings back the Telegram bot section. */
export const TELEGRAM_BOT_SECTION_ENV = "TELEGRAM_BOT_SECTION_ENABLED";

export type DormantSections = {
  /** Header bell, sidebar item and dashboard card of /notifications. */
  notifications: boolean;
  /** Sidebar item and dashboard card of /telegram-bot. */
  telegramBot: boolean;
};

/** Absent, empty, `false`, a typo — all hidden. */
export function readDormantSections(env: Env = process.env): DormantSections {
  return {
    notifications: isOn(env[NOTIFICATIONS_SECTION_ENV]),
    telegramBot: isOn(env[TELEGRAM_BOT_SECTION_ENV]),
  };
}
