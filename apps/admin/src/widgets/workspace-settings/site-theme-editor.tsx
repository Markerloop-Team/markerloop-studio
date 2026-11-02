"use client";

import * as React from "react";
import { type UseFormReturn } from "react-hook-form";
import { History, Plus, RotateCcw, Upload, X } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { StatusIndicator, Tile, TileGrid } from "@markerloop/ui/ui/admin";

import { useTranslations } from "@/shared/hooks";
import { EditorSaveStatus, type SaveStatusState } from "@/shared/components/save-status";
import { PublishMark, type PublishMarkState } from "@/shared/components/publish-mark";
import { ConfirmDialogBody, ConfirmDialogShell } from "@/shared/components/confirm-dialog";
import {
  COLOR_ROLES,
  DEFAULT_THEME,
  DENSITIES,
  FONTS,
  FONT_GROUPS,
  PRESETS,
  RADII,
  SCALE_KEYS,
  SHADOWS,
  TYPE_SCALES,
  MAX_CUSTOM_COLORS,
  MAX_CUSTOM_COLOR_LABEL,
  addCustomColor,
  addScaleStep,
  contrastChecks,
  customColorError,
  customColorLabelValid,
  customColors,
  isNewColor,
  formatRatio,
  fontStack,
  isBuiltinStep,
  isHex,
  isNewStep,
  levelSize,
  matchesPreset,
  normalizeHex,
  presetById,
  removeScaleStep,
  roleColor,
  scaleLimits,
  scaleStepError,
  scaleSteps,
  stepsBySize,
  themeChangeList,
  themeErrorReason,
  type ColorRole,
  type ContrastCheck,
  type CustomColor,
  type CustomColorError,
  type Mode,
  type Preset,
  type ScaleKey,
  type ScaleStep,
  type ScaleStepError,
  type SiteTheme,
  type ThemeChange,
  type ThemeFieldError,
} from "@/entities/site-theme";

import { SettingsCard, SettingsRow } from "./settings-card";
import { removeCustomColorFromForm } from "./custom-colors-form";
import {
  SiteBox,
  SiteButton,
  SiteSection,
  SiteText,
  ThemeScope,
} from "./site-preview-parts";

/**
 * Settings → Workspace → Site theme — the editor of the canvas
 * /design-system/site-theme (SDL-771, approved), made live by SDL-776.
 *
 * ONE editor for both: the canvas renders it with mock data under an English
 * next-intl provider (so its copy stays the approved English one), the live
 * tab (`site-theme-tab.tsx`) with pages-service's draft, revisions and save
 * state. This file holds no data and calls nothing — every change goes out
 * through the props.
 *
 * The form lives under `UI.Field.Root` (FormProvider): kit fields without
 * the provider stay silent (admin mobile invariant).
 */

/** A published revision as the editor shows it. */
export type ThemeRevisionView = {
  n: number;
  theme: SiteTheme;
  /** Already formatted for the screen's locale. */
  at: string;
  /** The history row's line; default `at`. */
  meta?: string;
};

/** The live tab's save state; the canvas passes none. */
export type ThemeSaveView =
  | { state: "idle" | "saving" | "saved" }
  | { state: "invalid" }
  | { state: "refused"; errors: ThemeFieldError[] }
  | { state: "error"; onRetry: () => void }
  | { state: "conflict" };

type T = (key: string, values?: Record<string, string | number | Date>) => string;

/* --------------------------------------------------------------- helpers */

function presetName(t: T, id: string): string {
  const preset = presetById(id);
  return preset ? t(`presets.items.${preset.id}.name`) : t("presets.none");
}

function listWords(t: T, items: string[], max = 4): string {
  if (items.length <= max) return items.join(", ");
  return t("listMore", { items: items.slice(0, max).join(", "), count: items.length - max });
}

function roleLabel(t: T, role: ColorRole): string {
  return t(`roles.${role}.label`);
}

function changeLabel(t: T, change: ThemeChange): string {
  return change.kind === "color"
    ? t("change.color", { role: roleLabel(t, change.role), mode: t(`mode.${change.mode}`) })
    : t(`change.${change.kind}`);
}

function checkLabel(t: T, check: ContrastCheck): string {
  return t("colors.checkLabel", {
    fg: roleLabel(t, check.fg),
    bg: roleLabel(t, check.bg).toLowerCase(),
    mode: t(`mode.${check.mode}`),
  });
}

/** A service field path (colors.textMuted.light, fonts.heading, radius…) in words. */
export function themeFieldLabel(t: T, field: string): string {
  const parts = field.split(".");
  if (parts[0] === "colors" && parts[1] && (COLOR_ROLES as readonly string[]).includes(parts[1])) {
    const role = parts[1] as ColorRole;
    return parts[2] === "light" || parts[2] === "dark"
      ? t("change.color", { role: roleLabel(t, role), mode: t(`mode.${parts[2]}`) })
      : roleLabel(t, role);
  }
  if (field === "fonts.heading") return t("change.headingFont");
  if (field === "fonts.body") return t("change.bodyFont");
  if (field === "preset") return t("presets.title");
  if (["typeScale", "radius", "density", "shadow"].includes(field)) return t(`change.${field}`);
  // Scale paths: `spacing`, `spacing[3].value`, `iconSize[0].name` (SDL-949).
  const scale = /^(spacing|iconSize)(\[|$)/.exec(field)?.[1];
  if (scale) return t(`change.${scale}`);
  // Custom colours: `customColors`, `customColors[2].light` (SDL-950).
  if (/^customColors(\[|\.|$)/.test(field)) return t("change.customColors");
  // A field this screen does not know: never put the JSON path on screen.
  return t("serverError.field");
}

/**
 * The service's reason in words: a contrast refusal says what the field's own
 * line says (`colors.tooFaint`), the rest by kind — never the JSON paths the
 * raw reason carries.
 */
export function themeErrorText(t: T, error: ThemeFieldError): string {
  const reason = themeErrorReason(error);
  switch (reason.kind) {
    case "contrast":
      return t("colors.tooFaint", {
        bg: roleLabel(t, reason.bg).toLowerCase(),
        mode: t(`mode.${reason.mode}`),
        ratio: `${reason.ratio}:1`,
      });
    case "hex":
      return t("colors.hexInvalid");
    case "font":
      return t("serverError.font");
    case "enum":
      return t("serverError.enum");
    default:
      return t("serverError.other");
  }
}

/**
 * One-of choice as the Studio draws an enum of a few values (`SegmentedEditor`
 * in packages/studio): a joined row of toggles. Shared with the inspector canvas.
 */
export function Segmented<V extends string>({
  value,
  values,
  onChange,
  label,
  testid,
}: {
  value: V;
  values: readonly V[];
  onChange: (next: V) => void;
  label: string;
  testid: string;
}) {
  return (
    <UI.ToggleGroup
      type="single"
      size="sm"
      variant="outline"
      spacing={0}
      className="w-full"
      aria-label={label}
      value={value}
      onValueChange={(next: string) => {
        // Radix reports a click on the pressed item as "": a theme value
        // cannot be unset, so the click is ignored.
        if (next) onChange(next as V);
      }}
      data-testid={testid}
    >
      {values.map((v) => (
        <UI.ToggleGroupItem
          key={v}
          value={v}
          className="min-w-0 flex-1 px-0"
          data-testid={`${testid}-${v}`}
        >
          {v}
        </UI.ToggleGroupItem>
      ))}
    </UI.ToggleGroup>
  );
}

/* ------------------------------------------------------------ publish bar */

/** What the bar decides — exported so the tab and the dialog agree with it. */
export function publishState(draft: SiteTheme, published: ThemeRevisionView | null) {
  const fails = contrastChecks(draft).filter((c) => !c.pass);
  const badHex = COLOR_ROLES.some(
    (role) => !isHex(draft.colors[role].light) || !isHex(draft.colors[role].dark)
  );
  const changes = themeChangeList(published?.theme ?? DEFAULT_THEME, draft);
  const dirty = changes.length > 0;
  const blocked = fails.length > 0 || badHex;
  return { fails, badHex, changes, dirty, blocked };
}

/**
 * What the publish status says and whether «Publish theme» is live — one
 * answer for the settings-style bar and the editor frame's header (EP-187).
 */
export function usePublishBarModel({
  draft,
  published,
  save,
  busy,
}: {
  draft: SiteTheme;
  published: ThemeRevisionView | null;
  save?: ThemeSaveView;
  busy?: boolean;
}) {
  const t = useTranslations("siteTheme");
  const { fails, badHex, changes, dirty, blocked: localBlocked } = publishState(draft, published);
  const refused = save?.state === "refused" ? save.errors : null;
  const blocked = localBlocked || !!refused;
  // Colors, not checks: one faint value usually fails on two backgrounds.
  const faint = new Set(fails.map((f) => `${f.fg}.${f.mode}`)).size;
  // A whole preset reads as one change, not as twenty color values.
  const what =
    matchesPreset(draft) && draft.preset !== (published?.theme.preset ?? "")
      ? t("whatPreset", { name: presetName(t, draft.preset) })
      : listWords(t, changes.map((c) => changeLabel(t, c)));

  // The mark speaks the words every publication uses (EP-186 pattern 7):
  // Published / Not published / Unpublished changes — the revision and the
  // reason go to the line under it. Only "Can’t publish yet" is the theme's
  // own: a page has no state like it.
  let mark: PublishMarkState | "blocked";
  let description: string;
  if (blocked) {
    mark = "blocked";
    description = badHex
      ? t("status.badHex")
      : faint > 0
        ? t("status.faint", { count: faint })
        : t("status.refused");
  } else if (dirty && published) {
    mark = "unpublishedChanges";
    description = t("status.unpublishedDetail", { n: published.n, what });
  } else if (dirty) {
    mark = "notPublished";
    description = changes.length
      ? t("status.notPublishedChanged", { what })
      : t("status.notPublishedDetail");
  } else if (published) {
    mark = "published";
    description = t("status.publishedDetail", { n: published.n });
  } else {
    mark = "notPublished";
    description = t("status.defaultDetail");
  }

  // The live tab publishes the SAVED draft: an edit still on its way (or one
  // the service refused) would publish something other than the screen.
  // A conflict already put the service's draft on screen: nothing is unsaved.
  const unsaved = save
    ? save.state !== "idle" && save.state !== "saved" && save.state !== "conflict"
    : false;
  const canPublish = dirty && !blocked && !unsaved && !busy;
  return { mark, description, canPublish, refused, blocked };
}

function PublishBar({
  draft,
  published,
  revisions,
  restoredFrom,
  save,
  busy,
  onPublish,
  onOpenHistory,
}: {
  draft: SiteTheme;
  published: ThemeRevisionView | null;
  revisions: ThemeRevisionView[];
  restoredFrom?: number;
  save?: ThemeSaveView;
  busy?: boolean;
  onPublish: () => void;
  onOpenHistory: () => void;
}) {
  const t = useTranslations("siteTheme");
  const { mark, description, canPublish, refused, blocked } = usePublishBarModel({ draft, published, save, busy });
  const dirty = publishState(draft, published).dirty;
  return (
    <UI.Box direction="column" gap={3}>
      {restoredFrom ? (
        <UI.Alert data-testid="theme-restored-note">
          {t("restoredNote", { from: restoredFrom, live: published?.n ?? "—" })}
        </UI.Alert>
      ) : null}
      <UI.Card
        fullWidth
        data-testid="theme-publish-bar"
        data-state={blocked ? "blocked" : dirty ? "dirty" : "clean"}
        data-save={save?.state}
      >
        <UI.Card.Content>
          <UI.Box direction="row" align="center" gap={4} wrap>
            <UI.Box direction="column" gap={1} grow className="min-w-[14rem]">
              {mark === "blocked" ? (
                <StatusIndicator tone="error" data-testid="theme-status" data-state="blocked">
                  {t("status.blockedTitle")}
                </StatusIndicator>
              ) : (
                <PublishMark state={mark} data-testid="theme-status" />
              )}
              <UI.Text as="p" size="sm" variant="muted" data-testid="theme-status-detail">
                {description}
              </UI.Text>
              {save ? <ThemeSaveStatus save={save} /> : null}
            </UI.Box>
            <UI.Box direction="row" align="center" gap={2} wrap>
              {/* The way into the history (EP-186 pattern 5): a "History"
                  button in the bar, like the editors' header. */}
              <UI.Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpenHistory}
                aria-label={t("history.open", { count: revisions.length })}
                data-testid="theme-history-open"
              >
                <History size={16} aria-hidden="true" />
                {t("history.title")}
                <UI.Text as="span" size="sm" variant="muted">
                  {t("revisionsCount", { count: revisions.length })}
                </UI.Text>
              </UI.Button>
              <UI.Button
                type="button"
                disabled={!canPublish}
                onClick={onPublish}
                data-testid="theme-publish"
              >
                <Upload size={16} aria-hidden="true" />
                {t("publish")}
              </UI.Button>
            </UI.Box>
          </UI.Box>
          {refused && refused.length ? (
            <ul className="mt-3 flex list-none flex-col gap-1 p-0" data-testid="theme-server-errors">
              {refused.map((e) => (
                <li key={`${e.field}:${e.message}`} data-field={e.field}>
                  <UI.Text as="span" size="xs" variant="destructive">
                    {`${themeFieldLabel(t, e.field)} — ${themeErrorText(t, e)}`}
                  </UI.Text>
                </li>
              ))}
            </ul>
          ) : null}
        </UI.Card.Content>
      </UI.Card>
    </UI.Box>
  );
}

/** The theme's save states → the kit's SaveStatus (EP-186 pattern 6). */
export function themeSaveState(save: ThemeSaveView): SaveStatusState {
  switch (save.state) {
    case "idle":
    case "saved":
      return "saved";
    case "saving":
      return "saving";
    case "invalid":
      return "unsaved";
    case "refused":
    case "error":
      return "error";
    case "conflict":
      return "conflict";
  }
}

/**
 * The kit's SaveStatus with the editors' words. The chip keeps the theme's
 * own state in `data-state` (invalid / refused are what the e2e read), and
 * the reason a draft was not saved is its tooltip — the bar's line and the
 * fields already say it in full.
 */
export function ThemeSaveStatus({ save }: { save: ThemeSaveView }) {
  const t = useTranslations("siteTheme");
  if (save.state === "idle") return null;
  const detail =
    save.state === "invalid"
      ? t("save.invalid")
      : save.state === "refused"
        ? t("save.refused")
        : save.state === "conflict"
          ? t("save.conflict")
          : undefined;
  return (
    <EditorSaveStatus
      state={themeSaveState(save)}
      detail={detail}
      onRetry={save.state === "error" ? save.onRetry : undefined}
      testId="theme-save"
      retryTestId="theme-save-retry"
      data={{ "data-state": save.state }}
    />
  );
}

/* ---------------------------------------------------------------- presets */

function PresetSample({ preset }: { preset: Preset }) {
  const theme = preset.theme;
  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-full items-center justify-between gap-2 rounded-md border px-3"
      style={{
        background: roleColor(theme, "background", "light"),
        borderColor: roleColor(theme, "border", "light"),
      }}
    >
      <span
        style={{
          fontFamily: fontStack(theme.fonts.heading),
          color: roleColor(theme, "text", "light"),
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        Aa
      </span>
      <span className="flex items-center gap-1">
        {(["muted", "primary"] as const).map((role) => (
          <span
            key={role}
            className="size-4 rounded-full border"
            style={{
              background: roleColor(theme, role, "light"),
              borderColor: roleColor(theme, "border", "light"),
            }}
          />
        ))}
        <span
          className="size-4 rounded-full"
          style={{ background: roleColor(theme, "background", "dark") }}
        />
      </span>
    </span>
  );
}

export function PresetsCard({
  draft,
  onApply,
}: {
  draft: SiteTheme;
  onApply: (preset: Preset) => void;
}) {
  const t = useTranslations("siteTheme");
  const current = presetById(draft.preset)?.id;
  const edited = !matchesPreset(draft);
  return (
    <UI.Card fullWidth data-testid="theme-presets">
      <UI.Card.Header>
        <UI.Card.Title>{t("presets.title")}</UI.Card.Title>
        <UI.Card.Description>{t("presets.description")}</UI.Card.Description>
      </UI.Card.Header>
      <UI.Card.Content>
        {/* The admin's one tile grid (EP-186, pattern 2); the chosen preset
            is ringed and aria-pressed. */}
        <TileGrid>
          {PRESETS.map((p) => {
            const selected = p.id === current;
            return (
              <Tile
                key={p.id}
                aria-pressed={selected}
                onClick={() => onApply(p)}
                data-testid={`preset-${p.id}`}
                data-selected={selected ? "true" : "false"}
                selected={selected}
                media={<PresetSample preset={p} />}
                title={t(`presets.items.${p.id}.name`)}
                badge={
                  selected && edited ? (
                    <UI.Badge variant="secondary" data-testid="preset-edited">
                      {t("presets.edited")}
                    </UI.Badge>
                  ) : undefined
                }
                meta={[t(`presets.items.${p.id}.note`)]}
              />
            );
          })}
        </TileGrid>
      </UI.Card.Content>
    </UI.Card>
  );
}

/* ----------------------------------------------------------------- colors */

function HexField({
  form,
  role,
  mode,
}: {
  form: UseFormReturn<SiteTheme>;
  role: ColorRole;
  mode: Mode;
}) {
  const t = useTranslations("siteTheme");
  return (
    <UI.Field.Field
      control={form.control}
      name={`colors.${role}.${mode}` as const}
      rules={{
        // The service's rule exactly (`NormalizeHex`): #rgb or #rrggbb, any
        // case, surrounding spaces ignored — never stricter than the service.
        validate: (value: unknown) =>
          (typeof value === "string" && isHex(value)) || t("colors.hexInvalid"),
      }}
      render={({ field }) => (
        <UI.Field.Item gap={1} className="min-w-0">
          <UI.Field.Label className="text-xs text-muted-foreground">
            {mode === "light" ? t("colors.light") : t("colors.dark")}
          </UI.Field.Label>
          <UI.Box direction="row" align="center" gap={2} className="min-w-0">
            <span
              aria-hidden="true"
              data-testid={`swatch-${role}-${mode}`}
              className="size-8 shrink-0 rounded-md border border-border"
              style={{
                background: normalizeHex(String(field.value)) ?? "transparent",
              }}
            />
            <UI.Field.Control>
              <UI.FormControl.Input
                {...field}
                value={String(field.value ?? "")}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  field.onChange(e.target.value)
                }
                onBlur={() => {
                  // Shown as it will be stored: #ABC → #aabbcc.
                  const n = normalizeHex(String(field.value ?? ""));
                  if (n && n !== field.value) field.onChange(n);
                  field.onBlur();
                }}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 font-mono"
                aria-label={`${roleLabel(t, role)}, ${t(`mode.${mode}`)}`}
                data-testid={`hex-${role}-${mode}`}
              />
            </UI.Field.Control>
          </UI.Box>
          <UI.Field.Message className="text-xs" />
        </UI.Field.Item>
      )}
    />
  );
}

export function ColorsCard({
  form,
  draft,
}: {
  form: UseFormReturn<SiteTheme>;
  draft: SiteTheme;
}) {
  const t = useTranslations("siteTheme");
  const checks = contrastChecks(draft);
  const fails = checks.filter((c) => !c.pass);
  return (
    <UI.Card padding="none" fullWidth data-testid="theme-colors" className="gap-4 py-4">
      <UI.Card.Header className="px-4">
        <UI.Card.Title>{t("colors.title")}</UI.Card.Title>
        <UI.Card.Description>{t("colors.description")}</UI.Card.Description>
      </UI.Card.Header>
      <UI.Card.Content className="p-0">
        {COLOR_ROLES.map((role, index) => {
          const roleFails = fails.filter((c) => c.fg === role);
          return (
            <div
              key={role}
              data-testid={`role-${role}`}
              data-contrast={roleFails.length ? "fail" : "pass"}
              className={[
                "grid grid-cols-2 gap-x-3 gap-y-2 px-6 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,10rem)] md:items-start",
                index > 0 ? "border-t border-border" : "",
              ].join(" ")}
            >
              <UI.Box direction="column" gap={0.5} className="col-span-2 min-w-0 md:col-span-1 md:pt-5">
                <UI.Text as="span" size="sm" weight="medium">
                  {roleLabel(t, role)}
                </UI.Text>
                <UI.Text as="span" size="xs" variant="muted">
                  {t(`roles.${role}.hint`)}
                </UI.Text>
              </UI.Box>
              <HexField form={form} role={role} mode="light" />
              <HexField form={form} role={role} mode="dark" />
              {roleFails.map((check) => (
                <UI.Text
                  key={`${check.bg}-${check.mode}`}
                  as="p"
                  size="xs"
                  variant="destructive"
                  className="col-span-2 md:col-span-3"
                  data-testid={`contrast-fail-${role}-${check.bg}-${check.mode}`}
                >
                  {t("colors.tooFaint", {
                    bg: roleLabel(t, check.bg).toLowerCase(),
                    mode: t(`mode.${check.mode}`),
                    ratio: formatRatio(check.ratio),
                  })}
                </UI.Text>
              ))}
            </div>
          );
        })}
        <UI.Box
          direction="row"
          align="center"
          gap={2}
          wrap
          className="border-t border-border px-6 py-3"
          data-testid="contrast-summary"
        >
          <StatusIndicator tone={fails.length ? "error" : "success"}>
            {fails.length
              ? t("colors.contrastFail", { fails: fails.length, total: checks.length })
              : t("colors.contrastPass", { total: checks.length })}
          </StatusIndicator>
          <UI.Text as="span" size="xs" variant="muted">
            {fails.length
              ? t("colors.contrastFailDetail", {
                  list: listWords(t, fails.map((f) => checkLabel(t, f)), 2),
                })
              : t("colors.contrastPassDetail")}
          </UI.Text>
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}

/* ------------------------------------------------------------- typography */

function FontField({
  form,
  name,
  label,
  description,
}: {
  form: UseFormReturn<SiteTheme>;
  name: "fonts.heading" | "fonts.body";
  label: string;
  description: string;
}) {
  const t = useTranslations("siteTheme");
  return (
    <UI.Field.Field
      control={form.control}
      name={name}
      render={({ field }) => (
        <UI.Field.Item className="min-w-0">
          <UI.Field.Label>{label}</UI.Field.Label>
          <UI.FormControl.Select.Root
            value={String(field.value)}
            onValueChange={(v: string) => field.onChange(v)}
          >
            <UI.Field.Control>
              <UI.FormControl.Select.Trigger
                fullWidth
                data-testid={`font-${name === "fonts.heading" ? "heading" : "body"}`}
              >
                <UI.FormControl.Select.Value />
              </UI.FormControl.Select.Trigger>
            </UI.Field.Control>
            <UI.FormControl.Select.Content className="max-h-80">
              {FONT_GROUPS.map((group) => (
                <UI.FormControl.Select.Group key={group.category}>
                  <UI.FormControl.Select.Label>{t(`fontGroups.${group.category}`)}</UI.FormControl.Select.Label>
                  {FONTS.filter((f) => f.category === group.category).map((f) => (
                    <UI.FormControl.Select.Item key={f.family} value={f.family}>
                      {f.family}
                    </UI.FormControl.Select.Item>
                  ))}
                </UI.FormControl.Select.Group>
              ))}
            </UI.FormControl.Select.Content>
          </UI.FormControl.Select.Root>
          <UI.Field.Description className="text-xs">{description}</UI.Field.Description>
        </UI.Field.Item>
      )}
    />
  );
}

function EnumField<K extends "typeScale" | "radius" | "density" | "shadow">({
  form,
  name,
  label,
  values,
  description,
}: {
  form: UseFormReturn<SiteTheme>;
  name: K;
  label: string;
  values: readonly SiteTheme[K][];
  description: React.ReactNode;
}) {
  return (
    <UI.Field.Field
      control={form.control}
      name={name}
      render={({ field }) => (
        <UI.Field.Item className="min-w-0">
          <UI.Field.Label>{label}</UI.Field.Label>
          <UI.Field.Control>
            <Segmented<SiteTheme[K]>
              value={field.value as SiteTheme[K]}
              values={values}
              onChange={(v) => field.onChange(v)}
              label={label}
              testid={`enum-${name}`}
            />
          </UI.Field.Control>
          <UI.Field.Description className="text-xs">{description}</UI.Field.Description>
        </UI.Field.Item>
      )}
    />
  );
}

export function TypographyCard({
  form,
  draft,
}: {
  form: UseFormReturn<SiteTheme>;
  draft: SiteTheme;
}) {
  const t = useTranslations("siteTheme");
  const s = draft.typeScale;
  return (
    <UI.Card fullWidth data-testid="theme-typography">
      <UI.Card.Header>
        <UI.Card.Title>{t("typography.title")}</UI.Card.Title>
        <UI.Card.Description>{t("typography.description")}</UI.Card.Description>
      </UI.Card.Header>
      <UI.Card.Content>
        <UI.Box direction="column" gap={5}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FontField
              form={form}
              name="fonts.heading"
              label={t("change.headingFont")}
              description={t("typography.headingHint")}
            />
            <FontField
              form={form}
              name="fonts.body"
              label={t("change.bodyFont")}
              description={t("typography.bodyHint")}
            />
          </div>
          <EnumField
            form={form}
            name="typeScale"
            label={t("change.typeScale")}
            values={TYPE_SCALES}
            description={t("typography.scaleHint", {
              display: levelSize(s, "display"),
              h1: levelSize(s, "h1"),
              h2: levelSize(s, "h2"),
              body: levelSize(s, "body"),
            })}
          />
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}

export function ShapeCard({ form }: { form: UseFormReturn<SiteTheme> }) {
  const t = useTranslations("siteTheme");
  return (
    <UI.Card fullWidth data-testid="theme-shape">
      <UI.Card.Header>
        <UI.Card.Title>{t("shape.title")}</UI.Card.Title>
        <UI.Card.Description>{t("shape.description")}</UI.Card.Description>
      </UI.Card.Header>
      <UI.Card.Content>
        <UI.Box direction="column" gap={5}>
          <EnumField form={form} name="radius" label={t("change.radius")} values={RADII} description={t("shape.radiusHint")} />
          <EnumField form={form} name="density" label={t("change.density")} values={DENSITIES} description={t("shape.densityHint")} />
          <EnumField form={form} name="shadow" label={t("change.shadow")} values={SHADOWS} description={t("shape.shadowHint")} />
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}

/* ---------------------------------------------------------------- scales */

/**
 * One add-step form of a scale: name + px, checked by the service's own rules
 * before anything is sent (`scaleStepError`), so a bad step never reaches the
 * PATCH. Not a `<form>`: it sits inside the theme's form.
 */
function AddStepForm({
  scaleKey,
  steps,
  onAdd,
  onCancel,
}: {
  scaleKey: ScaleKey;
  steps: ScaleStep[];
  onAdd: (name: string, value: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("siteTheme");
  const { min, max } = scaleLimits(scaleKey);
  const [name, setName] = React.useState("");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<ScaleStepError | null>(null);
  const submit = () => {
    const err = scaleStepError(steps, scaleKey, name, value);
    setError(err);
    if (!err) onAdd(name.trim(), Number(value.trim()));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };
  const nameError = error === "nameInvalid" || error === "nameTaken" ? t(`scales.error.${error}`) : null;
  const valueError = error === "valueInvalid" ? t("scales.error.valueInvalid", { min, max }) : null;
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      role="group"
      aria-label={t(`scales.${scaleKey}.addTitle`)}
      data-testid={`scale-${scaleKey}-add-form`}
    >
      <UI.Text as="p" size="sm" weight="medium">
        {t(`scales.${scaleKey}.addTitle`)}
      </UI.Text>
      <div className="grid grid-cols-2 gap-2">
        <UI.FormControl.Field label={t("scales.name")} error={nameError}>
          <UI.FormControl.Input
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="card"
            maxLength={16}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            data-testid={`scale-${scaleKey}-name`}
          />
        </UI.FormControl.Field>
        <UI.FormControl.Field label={t("scales.value")} error={valueError}>
          <UI.FormControl.Input
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            placeholder={String(min)}
            data-testid={`scale-${scaleKey}-value`}
          />
        </UI.FormControl.Field>
      </div>
      <UI.Text as="p" size="xs" variant="muted">
        {t("scales.addHint")}
      </UI.Text>
      {error === "tooMany" ? (
        <UI.Text as="p" size="xs" variant="destructive" data-testid={`scale-${scaleKey}-error`}>
          {t("scales.error.tooMany", { max: scaleLimits(scaleKey).maxSteps })}
        </UI.Text>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <UI.Button type="button" size="sm" onClick={submit} data-testid={`scale-${scaleKey}-save`}>
          {t("scales.save")}
        </UI.Button>
        <UI.Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("scales.cancel")}
        </UI.Button>
      </div>
    </div>
  );
}

/**
 * A scale as the approved Theme panel draws it (component studio, 1 Nov
 * 2026, shot 15): steps as chips «name px» by size, a step of the draft the
 * published theme lacks filled blue with «New», «+ Add step» under them. Only
 * the theme's own steps can be removed.
 */
function ScaleSection({
  scaleKey,
  draft,
  published,
  onChange,
}: {
  scaleKey: ScaleKey;
  draft: SiteTheme;
  published: SiteTheme | null;
  onChange: (steps: ScaleStep[]) => void;
}) {
  const t = useTranslations("siteTheme");
  const [adding, setAdding] = React.useState(false);
  const steps = scaleSteps(draft, scaleKey);
  const full = steps.length >= scaleLimits(scaleKey).maxSteps;
  return (
    <section className="flex flex-col gap-2" data-testid={`scale-${scaleKey}`} aria-labelledby={`scale-${scaleKey}-title`}>
      <h3
        id={`scale-${scaleKey}-title`}
        className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
      >
        {t(`scales.${scaleKey}.title`)}
      </h3>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {stepsBySize(steps).map((step) => {
          const builtin = isBuiltinStep(scaleKey, step.name);
          const fresh = isNewStep(draft, published, scaleKey, step.name);
          return (
            <li
              key={step.name}
              data-testid={`scale-${scaleKey}-step`}
              data-name={step.name}
              data-builtin={builtin ? "true" : "false"}
              data-new={fresh ? "true" : "false"}
              className={
                "flex items-baseline gap-1 rounded-[7px] py-[5px] text-[12.5px] " +
                (builtin ? "px-[9px] " : "pl-[9px] pr-1 ") +
                (fresh ? "bg-selection text-white" : "bg-muted text-foreground")
              }
            >
              <span>{step.name}</span>
              <small className={"text-[11px] " + (fresh ? "text-white/85" : "text-muted-foreground")}>{step.value}</small>
              {fresh ? (
                <UI.Badge
                  variant="outline"
                  className="ml-0.5 self-center rounded-[5px] border-white/70 px-1 py-0 text-[10px] font-semibold leading-4 text-white"
                  data-testid={`scale-${scaleKey}-new`}
                >
                  {t("scales.new")}
                </UI.Badge>
              ) : null}
              {builtin ? null : (
                <UI.Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={
                    "ml-0.5 size-4 self-center rounded-sm active:scale-100 " +
                    (fresh
                      ? "text-white hover:bg-white/20 hover:text-white dark:hover:bg-white/20"
                      : "text-muted-foreground hover:text-foreground")
                  }
                  aria-label={t("scales.remove", { name: step.name })}
                  onClick={() => onChange(removeScaleStep(steps, scaleKey, step.name))}
                  data-testid={`scale-${scaleKey}-remove`}
                >
                  <X className="size-3" aria-hidden="true" />
                </UI.Button>
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <AddStepForm
          scaleKey={scaleKey}
          steps={steps}
          onCancel={() => setAdding(false)}
          onAdd={(name, value) => {
            onChange(addScaleStep(steps, { name, value }));
            setAdding(false);
          }}
        />
      ) : (
        <UI.Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => setAdding(true)}
          className="mt-1.5 h-[30px] gap-1.5 self-start rounded-[7px] border-dashed border-border bg-transparent px-2.5 text-[13px] font-normal text-muted-foreground shadow-none has-[>svg]:px-2.5 hover:bg-transparent hover:text-foreground dark:border-border dark:bg-transparent dark:hover:bg-transparent"
          data-testid={`scale-${scaleKey}-add`}
          title={full ? t("scales.error.tooMany", { max: scaleLimits(scaleKey).maxSteps }) : undefined}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t("scales.addStep")}
        </UI.Button>
      )}
    </section>
  );
}

/**
 * The theme's named scales (SDL-949): spacing and icon sizes. A step added
 * here goes into the DRAFT like any other edit (the host's watcher PATCHes the
 * whole theme), is applied at once, and reaches the site on «Publish theme».
 */
export function ScalesCard({
  form,
  draft,
  published,
}: {
  form: UseFormReturn<SiteTheme>;
  draft: SiteTheme;
  published: SiteTheme | null;
}) {
  const t = useTranslations("siteTheme");
  return (
    <UI.Card fullWidth data-testid="theme-scales">
      <UI.Card.Header>
        <UI.Card.Title>{t("scales.title")}</UI.Card.Title>
        <UI.Card.Description>{t("scales.description")}</UI.Card.Description>
      </UI.Card.Header>
      <UI.Card.Content>
        <UI.Box direction="column" gap={5}>
          {SCALE_KEYS.map((key) => (
            <ScaleSection
              key={key}
              scaleKey={key}
              draft={draft}
              published={published}
              onChange={(steps) => form.setValue(key, steps, { shouldDirty: true })}
            />
          ))}
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}

/* --------------------------------------------------------- custom colours */

/** A hex input of the add form: swatch + text, shown as it will be stored on blur. */
function ColorInput({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <UI.FormControl.Field label={label}>
      <UI.Box direction="row" align="center" gap={2} className="min-w-0">
        <span
          aria-hidden="true"
          className="size-[26px] shrink-0 rounded-[7px] border border-border"
          style={{ background: normalizeHex(value) ?? "transparent" }}
        />
        <UI.FormControl.Input
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          onBlur={() => {
            const n = normalizeHex(value);
            if (n && n !== value) onChange(n);
          }}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 font-mono"
          data-testid={testId}
        />
      </UI.Box>
    </UI.FormControl.Field>
  );
}

/** Name + light + dark, checked by the service's rules (`customColorError`) before it joins the draft. */
function AddColorForm({
  colors,
  onAdd,
  onCancel,
}: {
  colors: CustomColor[];
  onAdd: (c: Omit<CustomColor, "key">) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("siteTheme");
  const [label, setLabel] = React.useState("");
  const [light, setLight] = React.useState("#d97706");
  const [dark, setDark] = React.useState("#fbbf24");
  const [error, setError] = React.useState<CustomColorError | null>(null);
  const submit = () => {
    const err = customColorError(colors, label, light, dark);
    setError(err);
    if (!err) onAdd({ label: label.trim(), light, dark });
  };
  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      role="group"
      aria-label={t("customColors.addTitle")}
      data-testid="custom-color-add-form"
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <UI.Text as="p" size="sm" weight="medium">
        {t("customColors.addTitle")}
      </UI.Text>
      <UI.FormControl.Field
        label={t("customColors.name")}
        error={error === "labelInvalid" ? t("customColors.error.labelInvalid", { max: MAX_CUSTOM_COLOR_LABEL }) : null}
      >
        <UI.FormControl.Input
          value={label}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabel(e.target.value)}
          placeholder={t("customColors.namePlaceholder")}
          maxLength={MAX_CUSTOM_COLOR_LABEL}
          autoComplete="off"
          autoFocus
          data-testid="custom-color-name"
        />
      </UI.FormControl.Field>
      <div className="grid grid-cols-2 gap-2">
        <ColorInput label={t("customColors.light")} value={light} onChange={setLight} testId="custom-color-light" />
        <ColorInput label={t("customColors.dark")} value={dark} onChange={setDark} testId="custom-color-dark" />
      </div>
      <UI.Text as="p" size="xs" variant="muted">
        {t("customColors.addHint")}
      </UI.Text>
      {error === "hexInvalid" || error === "tooMany" ? (
        <UI.Text as="p" size="xs" variant="destructive" data-testid="custom-color-error">
          {error === "tooMany" ? t("customColors.error.tooMany", { max: MAX_CUSTOM_COLORS }) : t("customColors.error.hexInvalid")}
        </UI.Text>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <UI.Button type="button" size="sm" onClick={submit} data-testid="custom-color-save">
          {t("customColors.save")}
        </UI.Button>
        <UI.Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("customColors.cancel")}
        </UI.Button>
      </div>
    </div>
  );
}

/**
 * The theme's custom colours (SDL-950), after the Theme panel of the
 * assembled studio (1 Nov 2026): a row per colour — swatch, name with «New»
 * until published, the key the elements store — and «+ Add colour» under
 * them. Name, light and dark are edited in place (rename / change); the key
 * stays, so every element that uses the colour follows. Edits go into the
 * DRAFT like any other (the host's watcher PATCHes the whole theme, the
 * array replaces the list) and reach the site on «Publish theme».
 */
export function CustomColorsCard({
  form,
  draft,
  published,
}: {
  form: UseFormReturn<SiteTheme>;
  draft: SiteTheme;
  published: SiteTheme | null;
}) {
  const t = useTranslations("siteTheme");
  const [adding, setAdding] = React.useState(false);
  const colors = customColors(draft);
  const full = colors.length >= MAX_CUSTOM_COLORS;
  const set = (next: CustomColor[]) => form.setValue("customColors", next, { shouldDirty: true });
  return (
    <UI.Card padding="none" fullWidth data-testid="theme-custom-colors" className="gap-4 py-4">
      <UI.Card.Header className="px-4">
        <UI.Card.Title>{t("customColors.title")}</UI.Card.Title>
        <UI.Card.Description>{t("customColors.description")}</UI.Card.Description>
      </UI.Card.Header>
      <UI.Card.Content className="p-0">
        {colors.length === 0 ? (
          <UI.Text as="p" size="sm" variant="muted" className="px-6 pb-1" data-testid="custom-colors-empty">
            {t("customColors.empty")}
          </UI.Text>
        ) : null}
        {colors.map((c, index) => {
          const fresh = isNewColor(draft, published, c.key);
          return (
            <div
              key={c.key}
              data-testid="custom-color"
              data-key={c.key}
              data-new={fresh ? "true" : "false"}
              className={[
                "grid grid-cols-2 gap-x-3 gap-y-2 px-6 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_minmax(0,10rem)_auto] md:items-start",
                index > 0 ? "border-t border-border" : "",
              ].join(" ")}
            >
              <UI.Box direction="column" gap={1} className="col-span-2 min-w-0 md:col-span-1">
                <UI.Field.Field
                  control={form.control}
                  name={`customColors.${index}.label` as const}
                  rules={{
                    // The same rule as «Add colour» (customColorLabelValid): a rename
                    // with a control character would be refused by the service.
                    validate: (v: unknown) =>
                      customColorLabelValid(v) || t("customColors.error.labelInvalid", { max: MAX_CUSTOM_COLOR_LABEL }),
                  }}
                  render={({ field }) => (
                    <UI.Field.Item gap={1} className="min-w-0">
                      <UI.Box direction="row" align="center" gap={2} className="min-w-0">
                        <UI.Field.Label className="text-xs text-muted-foreground">{t("customColors.name")}</UI.Field.Label>
                        {fresh ? (
                          <UI.Badge
                            className="rounded-[5px] border-transparent bg-selection px-1 py-0 text-[10px] font-semibold leading-4 text-white"
                            data-testid="custom-color-new"
                          >
                            {t("customColors.new")}
                          </UI.Badge>
                        ) : null}
                      </UI.Box>
                      <UI.Field.Control>
                        <UI.FormControl.Input
                          {...field}
                          value={String(field.value ?? "")}
                          maxLength={MAX_CUSTOM_COLOR_LABEL}
                          autoComplete="off"
                          className="min-w-0"
                          data-testid="custom-color-label"
                        />
                      </UI.Field.Control>
                      <UI.Field.Message className="text-xs" />
                    </UI.Field.Item>
                  )}
                />
                <UI.Text as="span" size="xs" variant="muted" className="font-mono">
                  {t("customColors.key", { key: c.key })}
                </UI.Text>
              </UI.Box>
              {(["light", "dark"] as const).map((mode) => (
                <UI.Field.Field
                  key={mode}
                  control={form.control}
                  name={`customColors.${index}.${mode}` as const}
                  rules={{
                    validate: (v: unknown) => (typeof v === "string" && isHex(v)) || t("colors.hexInvalid"),
                  }}
                  render={({ field }) => (
                    <UI.Field.Item gap={1} className="min-w-0">
                      <UI.Field.Label className="text-xs text-muted-foreground">
                        {mode === "light" ? t("colors.light") : t("colors.dark")}
                      </UI.Field.Label>
                      <UI.Box direction="row" align="center" gap={2} className="min-w-0">
                        <span
                          aria-hidden="true"
                          className="size-[26px] shrink-0 rounded-[7px] border border-border"
                          style={{ background: normalizeHex(String(field.value)) ?? "transparent" }}
                        />
                        <UI.Field.Control>
                          <UI.FormControl.Input
                            {...field}
                            value={String(field.value ?? "")}
                            onBlur={() => {
                              const n = normalizeHex(String(field.value ?? ""));
                              if (n && n !== field.value) field.onChange(n);
                              field.onBlur();
                            }}
                            autoComplete="off"
                            spellCheck={false}
                            className="min-w-0 font-mono"
                            aria-label={`${c.label}, ${t(`mode.${mode}`)}`}
                            data-testid={`custom-color-${mode}`}
                          />
                        </UI.Field.Control>
                      </UI.Box>
                      <UI.Field.Message className="text-xs" />
                    </UI.Field.Item>
                  )}
                />
              ))}
              <UI.Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="col-span-2 justify-self-end text-muted-foreground hover:text-foreground md:col-span-1 md:mt-5"
                aria-label={t("customColors.remove", { name: c.label })}
                onClick={() => removeCustomColorFromForm(form, colors, c.key)}
                data-testid="custom-color-remove"
              >
                <X className="size-4" aria-hidden="true" />
              </UI.Button>
            </div>
          );
        })}
        <div className="border-t border-border px-6 pt-3">
          {adding ? (
            <AddColorForm
              colors={colors}
              onCancel={() => setAdding(false)}
              onAdd={(c) => {
                set(addCustomColor(colors, c));
                setAdding(false);
              }}
            />
          ) : (
            <UI.Button
              type="button"
              variant="outline"
              size="sm"
              disabled={full}
              onClick={() => setAdding(true)}
              className="h-[30px] gap-1.5 rounded-[7px] border-dashed border-border bg-transparent px-2.5 text-[13px] font-normal text-muted-foreground shadow-none has-[>svg]:px-2.5 hover:bg-transparent hover:text-foreground dark:border-border dark:bg-transparent dark:hover:bg-transparent"
              data-testid="custom-color-add"
              title={full ? t("customColors.error.tooMany", { max: MAX_CUSTOM_COLORS }) : undefined}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {t("customColors.addColor")}
            </UI.Button>
          )}
        </div>
      </UI.Card.Content>
    </UI.Card>
  );
}

/* ---------------------------------------------------------------- history */

export function HistoryCard({
  revisions,
  published,
  busy,
  onRestore,
}: {
  revisions: ThemeRevisionView[];
  published: number | null;
  busy?: boolean;
  onRestore: (n: number) => void;
}) {
  const t = useTranslations("siteTheme");
  const tTheme = useTranslations("siteTheme");
  if (revisions.length === 0) {
    return (
      <UI.Card fullWidth data-testid="theme-history">
        <UI.Card.Header>
          <UI.Card.Title>{t("history.title")}</UI.Card.Title>
        </UI.Card.Header>
        <UI.Card.Content>
          <UI.EmptyState paddingY={6} data-testid="theme-history-empty">
            <UI.Box direction="column" align="center" gap={2} textAlign="center">
              <History size={20} aria-hidden="true" className="opacity-40" />
              <UI.Text size="sm" variant="muted">
                {t("history.empty")}
              </UI.Text>
            </UI.Box>
          </UI.EmptyState>
        </UI.Card.Content>
      </UI.Card>
    );
  }
  return (
    <SettingsCard testid="theme-history" title={t("history.title")} description={t("history.description")}>
      {revisions.map((rev) => {
        const live = rev.n === published;
        return (
          <SettingsRow
            key={rev.n}
            testid="theme-revision"
            data={{ "data-revision": String(rev.n), "data-live": String(live) }}
            title={t("history.revisionTitle", { n: rev.n, preset: presetName(tTheme, rev.theme.preset) })}
            description={
              <UI.Box direction="row" align="center" gap={2} wrap>
                {live ? (
                  <UI.Badge variant="secondary" data-testid="theme-revision-live">
                    {t("history.live")}
                  </UI.Badge>
                ) : null}
                <span>{rev.meta ?? rev.at}</span>
              </UI.Box>
            }
            action={
              live ? null : (
                <UI.Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => onRestore(rev.n)}
                  data-testid="theme-revision-restore"
                >
                  <RotateCcw size={14} aria-hidden="true" />
                  {t("history.restore")}
                </UI.Button>
              )
            }
          />
        );
      })}
    </SettingsCard>
  );
}

export function RestoreDialog({
  revision,
  draft,
  published,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  revision: ThemeRevisionView;
  draft: SiteTheme;
  published: number | null;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("siteTheme");
  const tTheme = useTranslations("siteTheme");
  const changes = themeChangeList(draft, revision.theme).map((c) => changeLabel(tTheme, c));
  // The same dialog as the page journal's restore (EP-186 pattern 5): what
  // exactly will change, then «Restore».
  return (
    <ConfirmDialogShell
      open
      onOpenChange={(open) => (open ? undefined : onCancel())}
      title={t("restoreDialog.title", { n: revision.n })}
      description={t("restoreDialog.description", { preset: presetName(tTheme, revision.theme.preset), at: revision.at })}
      pending={busy}
      testId="theme-restore-dialog"
    >
      <ConfirmDialogBody
        pending={busy}
        error={error}
        onCancel={() => (busy ? undefined : onCancel())}
        onConfirm={onConfirm}
        cancelLabel={t("restoreDialog.cancel")}
        confirmIcon={<RotateCcw size={16} aria-hidden="true" />}
        confirmLabel={t("restoreDialog.confirm")}
        testIds={{ cancel: "theme-restore-cancel", confirm: "theme-restore-confirm", error: "theme-restore-error" }}
      >
        <UI.Alert data-testid="theme-restore-consequence">
          {t("restoreDialog.consequence", { live: published ?? "—" })}
        </UI.Alert>
        <UI.Text size="sm" variant="muted" data-testid="theme-restore-changes">
          {changes.length ? t("restoreDialog.changes", { list: listWords(tTheme, changes, 5) }) : t("restoreDialog.same")}
        </UI.Text>
      </ConfirmDialogBody>
    </ConfirmDialogShell>
  );
}

export function PublishDialog({
  draft,
  published,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  draft: SiteTheme;
  published: ThemeRevisionView | null;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("siteTheme");
  const tTheme = useTranslations("siteTheme");
  const changes = themeChangeList(published?.theme ?? DEFAULT_THEME, draft).map((c) =>
    changeLabel(tTheme, c)
  );
  // The same dialog as the page editor's publish (EP-186 pattern 7): what
  // visitors will see, then the one button that does it.
  return (
    <ConfirmDialogShell
      open
      onOpenChange={(open) => (open ? undefined : onCancel())}
      title={t("publishDialog.title")}
      pending={busy}
      testId="theme-publish-dialog"
    >
      <ConfirmDialogBody
        pending={busy}
        error={error}
        onCancel={() => (busy ? undefined : onCancel())}
        onConfirm={onConfirm}
        cancelLabel={t("publishDialog.cancel")}
        confirmIcon={<Upload size={16} aria-hidden="true" />}
        confirmLabel={t("publishDialog.confirm")}
        testIds={{ cancel: "theme-publish-cancel", confirm: "theme-publish-confirm", error: "theme-publish-error" }}
      >
        <UI.Text size="sm" data-testid="theme-publish-visitors">
          {published ? t("publishDialog.descriptionLive", { n: published.n }) : t("publishDialog.description")}
        </UI.Text>
        <UI.Text size="sm" variant="muted" data-testid="theme-publish-changes">
          {t("publishDialog.changes", { list: listWords(tTheme, changes, 5) })}
        </UI.Text>
      </ConfirmDialogBody>
    </ConfirmDialogShell>
  );
}

/* ---------------------------------------------------------------- preview */

/**
 * The sample page in the DRAFT theme. Three bands — default, muted with a
 * three-column box, dark — because those are the three things one theme
 * change has to be seen repainting at once. The live tab shows it when the
 * workspace has no page of its own to preview.
 */
export function ThemePreview({
  theme,
  host,
  title,
  note,
}: {
  theme: SiteTheme;
  /** The address line in the frame's header. */
  host: string;
  title?: string;
  note?: string;
}) {
  const t = useTranslations("siteTheme");
  return (
    <UI.Card padding="none" fullWidth className="gap-0 overflow-hidden" data-testid="theme-preview">
      <UI.Box
        direction="row"
        align="center"
        justify="between"
        gap={2}
        className="border-b border-border px-4 py-3"
      >
        <UI.Text as="span" size="sm" weight="medium">
          {title ?? t("preview.title")}
        </UI.Text>
        <UI.Text as="span" size="xs" variant="muted" className="truncate">
          {host}
        </UI.Text>
      </UI.Box>
      <ThemeScope theme={theme} zoom={0.62} testid="theme-preview-page">
        <SiteSection background="default" testid="preview-section-default">
          <UI.Box direction="row" align="center" justify="between" gap={2} wrap>
            <SiteText level="h3">Lakeside Sauna</SiteText>
            <SiteText level="caption" color="muted">
              Prices · Booking · Contacts
            </SiteText>
          </UI.Box>
        </SiteSection>
        <SiteSection background="default" testid="preview-section-hero">
          <SiteText level="display" testid="preview-display">
            Saunas by the lake
          </SiteText>
          <SiteText level="lead" color="muted">
            Wood-fired, open every day from 8 to 22.
          </SiteText>
          <UI.Box direction="row" gap={2} wrap>
            <SiteButton testid="preview-primary-button">Book a slot</SiteButton>
            <SiteButton variant="outline">See prices</SiteButton>
          </UI.Box>
        </SiteSection>
        <SiteSection background="muted" testid="preview-section-muted">
          <SiteText level="h2">What’s inside</SiteText>
          <SiteBox columns={3} testid="preview-grid">
            {[
              ["Steam room", "Up to 8 guests, birch and oak brooms."],
              ["Cold plunge", "Lake water, 6 °C all year."],
              ["Tea lounge", "Herbal tea and quiet after."],
            ].map(([heading, text]) => (
              <SiteBox key={heading} background="surface" border testid="preview-card">
                {/* `lead` + bold, not `h3`: three cards in a ~414px preview
                    leave ~100px a card, and an h3 of the large scale broke
                    «Steam room» mid-word there. */}
                <SiteText level="lead" weight="bold">
                  {heading}
                </SiteText>
                <SiteText level="body" color="muted">
                  {text}
                </SiteText>
              </SiteBox>
            ))}
          </SiteBox>
        </SiteSection>
        <SiteSection background="dark" testid="preview-section-dark">
          <SiteText level="h2">Evening at the lake</SiteText>
          <SiteText level="body" color="muted">
            After 19:00 the light goes down and the stove goes up.
          </SiteText>
          <UI.Box direction="row" gap={2} wrap>
            <SiteButton testid="preview-dark-button">Book the evening</SiteButton>
          </UI.Box>
        </SiteSection>
      </ThemeScope>
      <UI.Text as="p" size="xs" variant="muted" className="border-t border-border px-4 py-3">
        {note ?? t("preview.mockNote")}
      </UI.Text>
    </UI.Card>
  );
}

/* ----------------------------------------------------------------- editor */

export type SiteThemeEditorViewProps = {
  form: UseFormReturn<SiteTheme>;
  /** `form.watch()` of the host — the values on screen. */
  draft: SiteTheme;
  published: ThemeRevisionView | null;
  revisions: ThemeRevisionView[];
  restoredFrom?: number;
  /** The preview column: the live tab passes a real page, the canvas the sample. */
  preview: React.ReactNode;
  onApplyPreset: (preset: Preset) => void;
  /** Publish (after the confirmation, when `confirmPublish`). */
  onPublish: () => void;
  /** Restore after the confirmation; the dialog closes when `restoreTarget` is cleared. */
  onRestore: (n: number) => void;
  /** Ask before publishing — the live tab does; the canvas publishes at once. */
  confirmPublish?: boolean;
  save?: ThemeSaveView;
  busy?: "publish" | "restore" | null;
  publishError?: string | null;
  restoreError?: string | null;
  /** Open the restore confirmation for this revision (the canvas case `history`). */
  initialRestoreTarget?: number;
  /** Bumped by the host after a publish/restore that succeeded: closes the dialogs. */
  settledAt?: number;
};

export function SiteThemeEditorView({
  form,
  draft,
  published,
  revisions,
  restoredFrom,
  preview,
  onApplyPreset,
  onPublish,
  onRestore,
  confirmPublish,
  save,
  busy,
  publishError,
  restoreError,
  initialRestoreTarget,
  settledAt,
}: SiteThemeEditorViewProps) {
  const t = useTranslations("siteTheme");
  const [restoreTarget, setRestoreTarget] = React.useState(initialRestoreTarget);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const historyRef = React.useRef<HTMLDivElement>(null);
  const target = revisions.find((r) => r.n === restoreTarget);

  React.useEffect(() => {
    if (settledAt === undefined) return;
    setRestoreTarget(undefined);
    setPublishOpen(false);
  }, [settledAt]);

  return (
    <UI.Box direction="column" gap={6} data-testid="site-theme">
      <UI.Alert data-testid="theme-scope-note">{t("scopeNote")}</UI.Alert>

      <PublishBar
        draft={draft}
        published={published}
        revisions={revisions}
        restoredFrom={restoredFrom}
        save={save}
        busy={busy === "publish"}
        onPublish={() => (confirmPublish ? setPublishOpen(true) : onPublish())}
        onOpenHistory={() => {
          const el = historyRef.current;
          if (!el) return;
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          el.focus({ preventScroll: true });
        }}
      />

      <UI.Field.Root {...form}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
          {/*
            On a phone the preview comes first: the page is what a person
            judges, the fields are how they get there. From lg it sticks in
            its own column while the fields scroll.
          */}
          <div className="order-first min-w-0 lg:sticky lg:top-0 lg:order-none lg:col-start-2 lg:row-start-1">
            {preview}
          </div>
          <form
            className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1"
            onSubmit={(e) => e.preventDefault()}
            data-testid="theme-form"
          >
            <PresetsCard draft={draft} onApply={onApplyPreset} />
            <ColorsCard form={form} draft={draft} />
            <CustomColorsCard form={form} draft={draft} published={published?.theme ?? null} />
            <TypographyCard form={form} draft={draft} />
            <ShapeCard form={form} />
            <ScalesCard form={form} draft={draft} published={published?.theme ?? null} />
            {/* The bar's "History" button scrolls here and moves focus in. */}
            <div ref={historyRef} tabIndex={-1} className="scroll-mt-4 outline-none" data-testid="theme-history-anchor">
              <HistoryCard
                revisions={revisions}
                published={published?.n ?? null}
                busy={!!busy}
                onRestore={setRestoreTarget}
              />
            </div>
          </form>
        </div>
      </UI.Field.Root>

      {target ? (
        <RestoreDialog
          revision={target}
          draft={draft}
          published={published?.n ?? null}
          busy={busy === "restore"}
          error={restoreError}
          onCancel={() => setRestoreTarget(undefined)}
          onConfirm={() => {
            onRestore(target.n);
            // The canvas restores synchronously; the live tab closes the
            // dialog through `settledAt` once the service answered.
            if (settledAt === undefined) setRestoreTarget(undefined);
          }}
        />
      ) : null}
      {publishOpen ? (
        <PublishDialog
          draft={draft}
          published={published}
          busy={busy === "publish"}
          error={publishError}
          onCancel={() => setPublishOpen(false)}
          onConfirm={onPublish}
        />
      ) : null}
    </UI.Box>
  );
}
