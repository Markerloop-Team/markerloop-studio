// Unit tests of the site theme model (SDL-776): the colour rule must be the
// one pages-service applies (`NormalizeHex`, internal/models/theme.go) — the
// screen may never reject a value the service accepts, and what it sends is
// what the service would store. Run: `pnpm --filter admin test:site-theme`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SITE_THEME_PRESETS } from "@markerloop/studio";

import {
  DEFAULT_THEME,
  PRESETS,
  addCustomColor,
  addScaleStep,
  applyPresetTheme,
  customColorError,
  customColorLabelValid,
  customColorKey,
  isNewColor,
  removeCustomColor,
  themeVars,
  cloneTheme,
  contrastChecks,
  formatRatio,
  isBuiltinStep,
  isHex,
  isNewStep,
  matchesPreset,
  normalizeHex,
  normalizeTheme,
  presetById,
  removeScaleStep,
  scaleStepError,
  scaleSteps,
  stepsBySize,
  themeChangeList,
  themeChanges,
  themeHexValid,
  themeSendable,
  type SiteTheme,
} from "./model";

test("normalizeHex: #RGB → #rrggbb, case and surrounding spaces as the service", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("#abc"), "#aabbcc");
  assert.equal(normalizeHex("  #AbCdEf  "), "#abcdef");
  assert.equal(normalizeHex("\t#0B62A8\n"), "#0b62a8");
  assert.equal(normalizeHex("#123456"), "#123456");
  assert.equal(normalizeHex(" #FFF"), "#ffffff");
});

test("normalizeHex: refuses exactly what the service refuses", () => {
  for (const bad of ["", "#", "abc", "aabbcc", "#ab", "#abcd", "#abcde", "#abcdeff", "#ggg", "# abc", "#12 345", "rgb(0,0,0)"]) {
    assert.equal(normalizeHex(bad), null, `"${bad}" must be refused`);
    assert.equal(isHex(bad), false, `"${bad}" must not pass the field rule`);
  }
});

test("isHex accepts every form normalizeHex accepts (the field is never stricter)", () => {
  for (const ok of ["#ABC", "#abc", " #abc ", "#A1B2C3", "  #a1b2c3"]) {
    assert.equal(isHex(ok), true, ok);
    assert.notEqual(normalizeHex(ok), null, ok);
  }
});

test("normalizeTheme: every colour stored form, an unparsable one left as typed", () => {
  const theme = cloneTheme(DEFAULT_THEME);
  theme.colors.primary.light = " #0B6 ";
  theme.colors.border.dark = "#zzz";
  const out = normalizeTheme(theme);
  assert.equal(out.colors.primary.light, "#00bb66");
  assert.equal(out.colors.border.dark, "#zzz");
  // The source is not mutated (drafts are edited in place).
  assert.equal(theme.colors.primary.light, " #0B6 ");
  assert.equal(themeHexValid(theme), false);
  theme.colors.border.dark = "#292929";
  assert.equal(themeHexValid(theme), true);
});

test("a typed short form is not a change against its stored long form", () => {
  const theme = cloneTheme(DEFAULT_THEME);
  theme.colors.background.light = "#FFF";
  assert.deepEqual(themeChangeList(DEFAULT_THEME, theme), []);
  theme.fonts.heading = "Lora";
  assert.deepEqual(themeChangeList(DEFAULT_THEME, theme), [{ kind: "headingFont" }]);
});

test("contrast: the service's pairs and its floor-to-two-decimals ratio", () => {
  // The default passes its own check (textMuted.light #767676 = 4.54:1 on white).
  assert.equal(contrastChecks(DEFAULT_THEME).every((c) => c.pass), true);
  assert.equal(contrastChecks(DEFAULT_THEME).length, 12);
  const faint = cloneTheme(DEFAULT_THEME);
  faint.colors.textMuted.light = "#8F8F8F";
  const fails = contrastChecks(faint).filter((c) => !c.pass);
  assert.deepEqual(
    fails.map((c) => `${c.fg}/${c.bg}/${c.mode}`),
    ["textMuted/background/light", "textMuted/surface/light"]
  );
  assert.equal(formatRatio(fails[0].ratio), "3.23:1");
  // A short form is checked like its long form.
  faint.colors.textMuted.light = " #666 ";
  assert.equal(contrastChecks(faint).every((c) => c.pass), true);
});

test("presets: exactly studio's SITE_THEME_PRESETS (SDL-777), ids and order untouched", () => {
  assert.deepEqual(
    PRESETS.map((p) => p.id),
    SITE_THEME_PRESETS.map((p) => p.id)
  );
  for (const p of PRESETS) {
    assert.equal(p.theme.preset, p.id, `${p.id}: the theme names its own preset`);
    assert.equal(presetById(p.id), p);
    assert.equal(matchesPreset(cloneTheme(p.theme)), true, `${p.id}: untouched = no «Edited»`);
    assert.equal(contrastChecks(p.theme).every((c) => c.pass), true, `${p.id}: AA in both sets`);
  }
});

test("presets: \"\" is the default look, not a preset; an unknown id is none", () => {
  assert.equal(presetById(""), undefined);
  assert.equal(presetById("warm"), undefined);
  assert.equal(matchesPreset(DEFAULT_THEME), false);
  const edited = cloneTheme(PRESETS[0].theme);
  edited.radius = edited.radius === "full" ? "none" : "full";
  assert.equal(matchesPreset(edited), false);
});

test("presets: every card has a name and a note in ru/en/kk; en is studio's label", () => {
  type Items = Record<string, { name?: string; note?: string }>;
  const items = (locale: string): Items =>
    (JSON.parse(readFileSync(new URL(`../../messages/${locale}/common.json`, import.meta.url), "utf8")) as {
      siteTheme: { presets: { items: Items } };
    }).siteTheme.presets.items;
  for (const locale of ["ru", "en", "kk"]) {
    const catalog = items(locale);
    assert.deepEqual(Object.keys(catalog).sort(), PRESETS.map((p) => p.id).sort(), `${locale}: no stale or missing preset`);
    for (const p of PRESETS) {
      assert.ok(catalog[p.id]?.name?.trim(), `${locale}: ${p.id}.name`);
      assert.ok(catalog[p.id]?.note?.trim(), `${locale}: ${p.id}.note`);
    }
  }
  const en = items("en");
  for (const p of PRESETS) {
    assert.deepEqual(en[p.id], { name: p.name, note: p.note }, `en: ${p.id}`);
  }
});

/* SDL-949: the scales go through the tab untouched. The tab PATCHes the whole
 * theme (`normalizeTheme(form.getValues())`), and an array in `spacing` /
 * `iconSize` REPLACES that scale on pages-service — so the steps from GET,
 * added ones included, must be in the body exactly as they came. */
const GET_THEME = {
  ...DEFAULT_THEME,
  preset: "",
  spacing: [
    { name: "0", value: 0 }, { name: "XS", value: 4 }, { name: "S", value: 8 }, { name: "M", value: 16 },
    { name: "L", value: 24 }, { name: "XL", value: 40 }, { name: "2XL", value: 64 }, { name: "3XL", value: 96 },
  ],
  iconSize: [
    { name: "XS", value: 16 }, { name: "S", value: 20 }, { name: "M", value: 24 }, { name: "L", value: 32 },
    { name: "XL", value: 48 }, { name: "hero", value: 128 },
  ],
};

test("SDL-949: the save body carries the scales from GET, through the form", async () => {
  const { createFormControl } = await import("react-hook-form");
  // The tab: useForm({ defaultValues: cloneTheme(draft.theme) }) → getValues() → normalizeTheme.
  const form = createFormControl<SiteTheme>({ defaultValues: cloneTheme(GET_THEME) });
  const body = normalizeTheme(form.getValues());
  assert.deepEqual(body.spacing, GET_THEME.spacing);
  assert.deepEqual(body.iconSize, GET_THEME.iconSize);
  // The tab skips the PATCH when the body equals the saved draft as JSON: the
  // scales must not make an untouched draft look edited.
  assert.equal(JSON.stringify(body), JSON.stringify(normalizeTheme(GET_THEME)));
  // A theme whose JSON keys come in another order still serialises alike.
  const { spacing, iconSize, ...rest } = GET_THEME;
  assert.equal(JSON.stringify(normalizeTheme({ spacing, iconSize, ...rest })), JSON.stringify(normalizeTheme(GET_THEME)));
});

test("SDL-949: cloneTheme shares no scale step; a theme without scales stays without", () => {
  const copy = cloneTheme(GET_THEME);
  copy.spacing![3].value = 99;
  copy.iconSize!.push({ name: "x", value: 8 });
  assert.equal(GET_THEME.spacing[3].value, 16);
  assert.equal(GET_THEME.iconSize.length, 6);
  assert.equal("spacing" in cloneTheme(DEFAULT_THEME), false, "no scales invented — an absent scale leaves the service's as is");
});

test("SDL-949: a preset applied to a draft keeps the draft's scales", () => {
  const preset = PRESETS[0].theme;
  assert.equal("spacing" in preset, false, "presets carry no scales");
  const next = applyPresetTheme(preset, cloneTheme(GET_THEME));
  assert.deepEqual(next.spacing, GET_THEME.spacing);
  assert.deepEqual(next.iconSize, GET_THEME.iconSize);
  assert.equal(next.preset, preset.preset);
  assert.deepEqual(next.colors, preset.colors);
  assert.equal(matchesPreset(next), true, "the scales do not make it «Edited»");
});

test("SDL-949: a scale edit is a change — the draft is dirty and Publish is live", () => {
  // Published without scales (older than SDL-949) vs a draft with the built-ins: the same scale.
  const builtinsOnly = { ...GET_THEME, spacing: GET_THEME.spacing.slice(0, 7), iconSize: GET_THEME.iconSize.slice(0, 5) };
  assert.deepEqual(themeChangeList(DEFAULT_THEME, cloneTheme(builtinsOnly)), [], "absent = the built-in steps");
  assert.deepEqual(themeChangeList(GET_THEME, cloneTheme(GET_THEME)), []);
  // An added step.
  assert.deepEqual(themeChangeList(builtinsOnly, GET_THEME), [{ kind: "spacing" }, { kind: "iconSize" }]);
  // A value.
  const edited = cloneTheme(GET_THEME);
  edited.spacing![3].value = 18;
  assert.deepEqual(themeChangeList(GET_THEME, edited), [{ kind: "spacing" }]);
  // A removed added step.
  const removed = cloneTheme(GET_THEME);
  removed.iconSize = removed.iconSize!.filter((s) => s.name !== "hero");
  assert.deepEqual(themeChangeList(GET_THEME, removed), [{ kind: "iconSize" }]);
  // A renamed step: the name is a CSS variable name, case counts.
  const renamed = cloneTheme(GET_THEME);
  renamed.iconSize![5].name = "Hero";
  assert.deepEqual(themeChangeList(GET_THEME, renamed), [{ kind: "iconSize" }]);
  assert.deepEqual(themeChanges(GET_THEME, edited), ["Spacing scale"]);
  assert.deepEqual(themeChanges(GET_THEME, removed), ["Icon sizes"]);
});

/* SDL-949 (UI): the Theme screen adds and removes scale steps. */

const withSpacing = (theme: SiteTheme, spacing: SiteTheme["spacing"]): SiteTheme => ({ ...cloneTheme(theme), spacing });

test("SDL-949 UI: scaleSteps — absent or empty scale reads as the built-ins", () => {
  assert.deepEqual(
    scaleSteps(DEFAULT_THEME, "spacing").map((s) => `${s.name}=${s.value}`),
    ["0=0", "XS=4", "S=8", "M=16", "L=24", "XL=40", "2XL=64"]
  );
  assert.deepEqual(
    scaleSteps({ ...DEFAULT_THEME, iconSize: [] }, "iconSize").map((s) => `${s.name}=${s.value}`),
    ["XS=16", "S=20", "M=24", "L=32", "XL=48"]
  );
});

test("SDL-949 UI: adding a step puts it after the others and changes the draft", () => {
  const before = scaleSteps(DEFAULT_THEME, "spacing");
  const after = addScaleStep(before, { name: " Mplus ", value: 18 });
  assert.equal(after.length, before.length + 1);
  assert.deepEqual(after[after.length - 1], { name: "Mplus", value: 18 });
  assert.equal(before.length, 7, "the source scale is not mutated");
  const draft = withSpacing(DEFAULT_THEME, after);
  assert.deepEqual(themeChanges(DEFAULT_THEME, draft), ["Spacing scale"]);
  // On screen by size: Mplus 18 between M 16 and L 24.
  assert.deepEqual(
    stepsBySize(after).map((s) => s.name),
    ["0", "XS", "S", "M", "Mplus", "L", "XL", "2XL"]
  );
});

test("SDL-949 UI: «New» = in the draft and not in the published theme", () => {
  const published = withSpacing(DEFAULT_THEME, addScaleStep(scaleSteps(DEFAULT_THEME, "spacing"), { name: "card", value: 20 }));
  const draft = withSpacing(published, addScaleStep(scaleSteps(published, "spacing"), { name: "hero", value: 96 }));
  assert.equal(isNewStep(draft, published, "spacing", "hero"), true);
  assert.equal(isNewStep(draft, published, "spacing", "card"), false, "already published");
  assert.equal(isNewStep(draft, published, "spacing", "M"), false, "built-in");
  assert.equal(isNewStep(draft, published, "spacing", "nope"), false, "not in the draft");
  // Nothing published yet: the published scale is the built-ins.
  assert.equal(isNewStep(draft, null, "spacing", "card"), true);
  assert.equal(isNewStep(draft, null, "spacing", "XS"), false);
  // After publishing the draft, nothing is new.
  assert.equal(isNewStep(draft, draft, "spacing", "hero"), false);
});

test("SDL-949 UI: «New» — a published name with another value in the draft is new too", () => {
  const published = withSpacing(DEFAULT_THEME, addScaleStep(scaleSteps(DEFAULT_THEME, "spacing"), { name: "card", value: 20 }));
  const draft = withSpacing(
    published,
    scaleSteps(published, "spacing").map((s) => (s.name === "card" ? { ...s, value: 28 } : s.name === "M" ? { ...s, value: 18 } : s))
  );
  assert.equal(isNewStep(draft, published, "spacing", "card"), true, "own step revalued");
  assert.equal(isNewStep(draft, published, "spacing", "M"), true, "built-in revalued");
  assert.equal(isNewStep(draft, published, "spacing", "S"), false, "same name and value");
  assert.equal(isNewStep(published, published, "spacing", "card"), false);
});

test("SDL-949 UI: an own step is removed, a built-in is not", () => {
  const steps = addScaleStep(scaleSteps(DEFAULT_THEME, "iconSize"), { name: "huge", value: 96 });
  assert.equal(isBuiltinStep("iconSize", "huge"), false);
  assert.equal(isBuiltinStep("iconSize", "m"), true, "case-insensitive, as the service");
  assert.deepEqual(removeScaleStep(steps, "iconSize", "huge").map((s) => s.name), ["XS", "S", "M", "L", "XL"]);
  assert.deepEqual(removeScaleStep(steps, "iconSize", "M").map((s) => s.name), ["XS", "S", "M", "L", "XL", "huge"]);
});

test("SDL-949 UI: scaleStepError — the service's rules for a new step", () => {
  const spacing = scaleSteps(DEFAULT_THEME, "spacing");
  const icons = scaleSteps(DEFAULT_THEME, "iconSize");
  assert.equal(scaleStepError(spacing, "spacing", "M+", "18"), "nameInvalid", "+ is not allowed in a CSS name");
  assert.equal(scaleStepError(spacing, "spacing", "M-plus", "18"), null);
  assert.equal(scaleStepError(spacing, "spacing", "", "18"), "nameInvalid");
  assert.equal(scaleStepError(spacing, "spacing", "-a", "18"), "nameInvalid");
  assert.equal(scaleStepError(spacing, "spacing", "a".repeat(17), "18"), "nameInvalid");
  assert.equal(scaleStepError(spacing, "spacing", "xl", "18"), "nameTaken", "case-insensitive");
  assert.equal(scaleStepError(spacing, "spacing", "gap", "513"), "valueInvalid");
  assert.equal(scaleStepError(spacing, "spacing", "gap", "512"), null);
  assert.equal(scaleStepError(spacing, "spacing", "gap", "0"), null);
  assert.equal(scaleStepError(spacing, "spacing", "gap", "1.5"), "valueInvalid");
  assert.equal(scaleStepError(spacing, "spacing", "gap", ""), "valueInvalid");
  assert.equal(scaleStepError(spacing, "spacing", "gap", "-4"), "valueInvalid");
  assert.equal(scaleStepError(icons, "iconSize", "tiny", "7"), "valueInvalid");
  assert.equal(scaleStepError(icons, "iconSize", "tiny", "8"), null);
  assert.equal(scaleStepError(icons, "iconSize", "big", "257"), "valueInvalid");
  let full = spacing;
  for (let i = full.length; i < 32; i++) full = addScaleStep(full, { name: `s${i}`, value: i });
  assert.equal(full.length, 32);
  assert.equal(scaleStepError(full, "spacing", "one-more", "10"), "tooMany");
});

/* ------------------------------------------------------------ SDL-950 */

const brand = { key: "brandBlue", label: "Brand blue", light: "#1d4ed8", dark: "#60a5fa" };

test("SDL-950: customColorKey — camelCase Latin from the label, colorN for Cyrillic, reserved or taken", () => {
  assert.equal(customColorKey("Brand blue", []), "brandBlue");
  assert.equal(customColorKey("  sea-foam 2 ", []), "seaFoam2");
  assert.equal(customColorKey("Фирменный синий", []), "color1");
  assert.equal(customColorKey("Primary", []), "color1", "a role is reserved");
  assert.equal(customColorKey("Transparent", [brand]), "color2");
  assert.equal(customColorKey("Brand Blue", [brand]), "color2", "taken without case");
  assert.equal(customColorKey("123", []), "color1");
});

test("SDL-950: add / remove / error — the service's rules before anything is sent", () => {
  const added = addCustomColor([], { label: " Brand blue ", light: "#1D4ED8", dark: "#60A5FA" });
  assert.deepEqual(added, [brand], "key from the label, label trimmed, hexes normalised");
  assert.deepEqual(removeCustomColor(added, "brandBlue"), []);
  assert.equal(customColorError([], "A", "#fff", "#000"), null);
  assert.equal(customColorError([], " ", "#fff", "#000"), "labelInvalid");
  // A rename is checked by the same rule as «Add colour» (SDL-950 review): no control characters.
  assert.equal(customColorLabelValid("Brand\u0007"), false);
  assert.equal(customColorLabelValid("Brand blue"), true);
  assert.equal(customColorLabelValid("x".repeat(65)), false);
  // The autosave sends only a draft whose names pass too (SDL-950 review, round 2).
  const base: SiteTheme = { ...cloneTheme(DEFAULT_THEME), customColors: [{ key: "sea", label: "Sea", light: "#00aaaa", dark: "#007777" }] };
  assert.equal(themeSendable(base), true);
  assert.equal(themeSendable({ ...base, customColors: [{ ...base.customColors![0]!, label: "  " }] }), false, "empty name");
  assert.equal(themeSendable({ ...base, customColors: [{ ...base.customColors![0]!, label: "Sea\u0001" }] }), false, "control character");
  assert.equal(themeSendable({ ...base, customColors: [{ ...base.customColors![0]!, light: "#zz" }] }), false, "bad hex");
  assert.equal(customColorError([], "x".repeat(65), "#fff", "#000"), "labelInvalid");
  assert.equal(customColorError([], "A", "blue", "#000"), "hexInvalid");
  const full = Array.from({ length: 24 }, (_, i) => ({ ...brand, key: `c${i}` }));
  assert.equal(customColorError(full, "A", "#fff", "#000"), "tooMany");
});

test("SDL-950: «New» until published; a changed value is New too; the change list names it", () => {
  const draft: SiteTheme = { ...cloneTheme(DEFAULT_THEME), customColors: [brand] };
  assert.equal(isNewColor(draft, null, "brandBlue"), true, "nothing published");
  assert.equal(isNewColor(draft, { ...DEFAULT_THEME, customColors: [] }, "brandBlue"), true);
  assert.equal(isNewColor(draft, { ...DEFAULT_THEME, customColors: [{ ...brand, light: "#1D4ED8" }] }, "brandBlue"), false, "hex compared normalised");
  assert.equal(isNewColor(draft, { ...DEFAULT_THEME, customColors: [{ ...brand, dark: "#000000" }] }, "brandBlue"), true);
  assert.deepEqual(themeChangeList(DEFAULT_THEME, draft), [{ kind: "customColors" }]);
  assert.deepEqual(themeChangeList({ ...DEFAULT_THEME, customColors: [] }, DEFAULT_THEME), [], "absent = []");
  assert.deepEqual(themeChanges(DEFAULT_THEME, draft), ["Custom colours"]);
});

test("SDL-950: clone, presets and the preview keep custom colours", () => {
  const draft: SiteTheme = { ...cloneTheme(DEFAULT_THEME), customColors: [brand] };
  const copy = cloneTheme(draft);
  copy.customColors![0].label = "x";
  assert.equal(draft.customColors![0].label, "Brand blue", "a deep copy");
  assert.deepEqual(applyPresetTheme(PRESETS[0].theme, draft).customColors, [brand], "a preset keeps the site's colours");
  assert.equal(matchesPreset({ ...cloneTheme(PRESETS[0].theme), customColors: [brand] }), true);
  assert.equal(themeVars(draft, "light")["--pages-color-brandBlue"], "#1d4ed8");
  assert.equal(themeVars(draft, "dark")["--pages-color-brandBlue"], "#60a5fa");
  assert.equal(themeHexValid({ ...draft, customColors: [{ ...brand, dark: "nope" }] }), false);
  assert.equal(normalizeTheme({ ...draft, customColors: [{ ...brand, light: "#ABC" }] }).customColors![0].light, "#aabbcc");
});
