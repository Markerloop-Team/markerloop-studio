// Readers of pages-service's theme refusals (SDL-776). Pure — no client
// import — so the unit test runs them on the real go-sdk envelope.
//
// apiClient throws an error carrying `status` and `data` = the parsed body,
// which go-sdk `response.ErrorWithData` writes as
// `{success: false, message, error: <code>, data: <payload>}`.

import { COLOR_ROLES, type ColorRole, type SiteTheme } from "./model";

/** `models.SiteThemeDraft`. */
export type SiteThemeDraft = {
  theme: SiteTheme;
  /** Optimistic lock token; 0 — nothing saved yet (the default theme). */
  version: number;
  /** The live revision; null — nothing published, visitors see the default look. */
  published_revision: number | null;
  has_unpublished_changes: boolean;
  updated_at?: string;
};


/** `models.ThemeFieldError`: a path in the theme JSON and the service's reason. */
export type ThemeFieldError = { field: string; message: string };

function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function codeOf(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const body = (error as { data?: unknown }).data;
  if (!body || typeof body !== "object") return null;
  const code = (body as { error?: unknown }).error;
  return typeof code === "string" ? code : null;
}

function errorPayload(error: unknown): unknown {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const body = (error as { data?: unknown }).data;
  if (!body || typeof body !== "object") return null;
  // The envelope `{error, message, data}`; tolerate a bare payload too.
  return "data" in body ? (body as { data?: unknown }).data : body;
}

/** The field errors of a 422 invalid_theme; null for any other failure. */
export function themeFieldErrors(error: unknown): ThemeFieldError[] | null {
  if (statusOf(error) !== 422 && codeOf(error) !== "invalid_theme") return null;
  const payload = errorPayload(error);
  const list =
    payload && typeof payload === "object" && "errors" in payload
      ? (payload as { errors?: unknown }).errors
      : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((e): ThemeFieldError[] =>
    e && typeof e === "object" && typeof (e as ThemeFieldError).field === "string"
      ? [{ field: (e as ThemeFieldError).field, message: String((e as ThemeFieldError).message ?? "") }]
      : []
  );
}

/**
 * What a field error means, read from pages-service's reason (models/theme.go
 * `Validate`) so the screen can say it in the user's words — the reason itself
 * names fields by their JSON path ("… с colors.background.light …").
 * `contrast`: the ratio as the service printed it (already floored to two
 * decimals) and the background role and mode it was measured against.
 */
export type ThemeErrorReason =
  | { kind: "contrast"; ratio: string; bg: ColorRole; mode: "light" | "dark" }
  | { kind: "hex" }
  | { kind: "font" }
  | { kind: "enum" }
  | { kind: "other" };

const CONTRAST_REASON = /(\d+(?:\.\d+)?):1\b.*?\bcolors\.([A-Za-z]+)\.(light|dark)\b/;
const ENUM_FIELDS = ["typeScale", "radius", "density", "shadow"];

export function themeErrorReason(error: ThemeFieldError): ThemeErrorReason {
  // Only pages-service's contrast reason ("контраст N.NN:1 с colors.<role>.<mode> …")
  // is read for a ratio; any other text that happens to hold both is not.
  const contrast = error.message.startsWith("контраст ") ? CONTRAST_REASON.exec(error.message) : null;
  if (contrast && (COLOR_ROLES as readonly string[]).includes(contrast[2])) {
    return { kind: "contrast", ratio: contrast[1], bg: contrast[2] as ColorRole, mode: contrast[3] as "light" | "dark" };
  }
  if (/^colors\.[A-Za-z]+\.(light|dark)$/.test(error.field) && /HEX/i.test(error.message)) return { kind: "hex" };
  if (error.field === "fonts.heading" || error.field === "fonts.body") return { kind: "font" };
  if (ENUM_FIELDS.includes(error.field)) return { kind: "enum" };
  return { kind: "other" };
}

/** The current draft a 409 theme_version_conflict carries; null otherwise. */
export function themeConflictDraft(error: unknown): SiteThemeDraft | null {
  if (codeOf(error) !== "theme_version_conflict") return null;
  const payload = errorPayload(error);
  if (!payload || typeof payload !== "object" || !("theme" in payload)) return null;
  return payload as SiteThemeDraft;
}
