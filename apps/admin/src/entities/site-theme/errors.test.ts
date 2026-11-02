// Readers of pages-service's theme refusals on the real go-sdk envelope
// (`response.ErrorWithData`: {success, message, error, data}) as apiClient
// throws it: `status` + `data` = the parsed body (SDL-776).
import { test } from "node:test";
import assert from "node:assert/strict";

import { themeConflictDraft, themeErrorReason, themeFieldErrors } from "./errors";
import { DEFAULT_THEME } from "./model";

function thrown(status: number, body: unknown) {
  return Object.assign(new Error("refused"), { status, data: body });
}

test("422 invalid_theme: every field error, in the service's order", () => {
  const error = thrown(422, {
    success: false,
    message: "colors.textMuted.light: контраст 2.32:1 с colors.background.light ниже 4.5:1 (WCAG AA)",
    error: "invalid_theme",
    data: {
      errors: [
        { field: "colors.textMuted.light", message: "контраст 2.32:1 с colors.background.light ниже 4.5:1 (WCAG AA)" },
        { field: "colors.textMuted.light", message: "контраст 2.32:1 с colors.surface.light ниже 4.5:1 (WCAG AA)" },
        { field: "fonts.heading", message: "гарнитура \"Comic\" не из белого списка" },
      ],
    },
  });
  const errors = themeFieldErrors(error);
  assert.deepEqual(
    errors?.map((e) => e.field),
    ["colors.textMuted.light", "colors.textMuted.light", "fonts.heading"]
  );
  assert.match(errors?.[1].message ?? "", /surface/);
  assert.equal(themeConflictDraft(error), null);
});

test("422 without a readable list is still a refusal (empty list), never a crash", () => {
  assert.deepEqual(themeFieldErrors(thrown(422, { success: false, error: "invalid_theme", data: null })), []);
  assert.deepEqual(themeFieldErrors(thrown(422, "plain text")), []);
});

test("other failures are not field errors", () => {
  assert.equal(themeFieldErrors(thrown(500, { success: false, error: "internal_error" })), null);
  assert.equal(themeFieldErrors(thrown(400, { success: false, error: "validation_error", data: null })), null);
  assert.equal(themeFieldErrors(new Error("network")), null);
  assert.equal(themeFieldErrors(null), null);
});

test("409 theme_version_conflict: the current draft from data", () => {
  const current = { theme: DEFAULT_THEME, version: 7, published_revision: 2, has_unpublished_changes: true };
  const error = thrown(409, {
    success: false,
    message: "Черновик темы изменён с момента чтения",
    error: "theme_version_conflict",
    data: current,
  });
  assert.deepEqual(themeConflictDraft(error), current);
  assert.equal(themeFieldErrors(error), null);
  // Another 409 (or one without a draft) is not this conflict.
  assert.equal(themeConflictDraft(thrown(409, { success: false, error: "quota_exceeded", data: {} })), null);
  assert.equal(themeConflictDraft(thrown(409, { success: false, error: "theme_version_conflict", data: null })), null);
});

// The list over the form says the reason in words (SDL-776 acceptance): the
// reasons below are pages-service's exact formats (models/theme.go Validate).
test("reasons are read into kinds; a contrast one keeps the ratio, background and mode", () => {
  assert.deepEqual(
    themeErrorReason({
      field: "colors.textMuted.light",
      message: "контраст 2.32:1 с colors.background.light ниже 4.5:1 (WCAG AA)",
    }),
    { kind: "contrast", ratio: "2.32", bg: "background", mode: "light" }
  );
  assert.deepEqual(
    themeErrorReason({
      field: "colors.primaryForeground.dark",
      message: "контраст 1.00:1 с colors.primary.dark ниже 4.5:1 (WCAG AA)",
    }),
    { kind: "contrast", ratio: "1.00", bg: "primary", mode: "dark" }
  );
  assert.deepEqual(
    themeErrorReason({ field: "colors.text.light", message: 'ожидается HEX-цвет #rgb или #rrggbb, получено "red"' }),
    { kind: "hex" }
  );
  assert.deepEqual(
    themeErrorReason({
      field: "fonts.heading",
      message: 'гарнитура "Comic" не из белого списка (GET /pages/public/theme/fonts)',
    }),
    { kind: "font" }
  );
  assert.deepEqual(themeErrorReason({ field: "radius", message: 'значение "xl" не из none|sm|md|lg|full' }), {
    kind: "enum",
  });
  // A background that is not a role, or a reason of an unknown shape, is never guessed at.
  assert.deepEqual(
    themeErrorReason({ field: "colors.text.light", message: "контраст 2.00:1 с colors.nope.light ниже 4.5:1" }),
    { kind: "other" }
  );
  assert.deepEqual(themeErrorReason({ field: "preset", message: "идентификатор пресета: …" }), { kind: "other" });
  // A ratio and a colour path in a reason that is not the contrast one are not a contrast refusal.
  assert.deepEqual(
    themeErrorReason({ field: "colors.text.light", message: "значение 2.00:1 рядом с colors.background.light" }),
    { kind: "other" }
  );
  assert.deepEqual(
    themeErrorReason({ field: "colors.text.light", message: "contrast 2.00:1 against colors.background.light" }),
    { kind: "other" }
  );
  assert.deepEqual(themeErrorReason({ field: "colors.foo", message: "неизвестная роль цвета" }), { kind: "other" });
});
