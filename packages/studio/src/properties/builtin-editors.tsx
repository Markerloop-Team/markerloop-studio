"use client";

// Built-in editors covering the four primitive Zod kinds. Each editor is
// assembled from the package's own controls (`Label` + `Input` / `Textarea`
// / `NativeSelect` + `Text`) rather than bare HTML. Custom polished versions
// can be registered via `registerPropEditor` to override these for specific
// fields without changing the auto-form itself.
//
// Deliberately NOT built on `UI.Field.*`: those require a `FormProvider`
// (hard rule 8), and this form pushes every keystroke straight into the
// Studio store instead of holding react-hook-form state.

import { type ChangeEvent, type ReactNode } from "react";

import { FormControl, Switch, Text, ToggleGroup, ToggleGroupItem, cn } from "@markerloop/ui/ui";
import { isSafeUrl } from "@markerloop/engine";
import {
  acceptAnyJson,
  StudioFieldRow,
  StudioJsonField,
} from "../panel-parts";
import type { PropDescriptor } from "./descriptors";
import { enumValues } from "./zod-introspect";
import type { PropEditor, PropEditorContext } from "./types";

const { Input, Label, NativeCheckbox, NativeSelect } = FormControl;

/** Dense control sizing — the properties pane is a 320px column. */
const controlCls = "h-8 max-md:text-xs md:text-xs";

/**
 * Caption of a field: the manifest's label when the kit gave it one, the
 * prop name otherwise. The name stays the test hook either way.
 */
function fieldLabel(fieldName: string, descriptor?: PropDescriptor): string {
  return descriptor?.label ?? fieldName;
}

/** Component default as placeholder text — never written into the node. */
function placeholderOf(descriptor?: PropDescriptor): string | undefined {
  return descriptor?.default === undefined ? undefined : String(descriptor.default);
}

function fieldCaption(fieldName: string, descriptor?: PropDescriptor): ReactNode {
  return (
    <>
      {fieldLabel(fieldName, descriptor)}
      {descriptor?.unknown ? (
        // SDL-293 / decision 2 of the props analysis: the node carries a prop
        // the manifest no longer describes. Surfaced, not swept away.
        <Text
          as="span"
          size="xs"
          variant="muted"
          className="ml-1 rounded-sm bg-muted px-1 py-px uppercase"
          data-sauna-prop-unknown={fieldName}
        >
          unknown
        </Text>
      ) : null}
    </>
  );
}

function FieldShell(props: {
  fieldName: string;
  descriptor?: PropDescriptor;
  children: ReactNode;
}) {
  // `data-sauna-prop` stays on the row wrapper: callers (and the safety net)
  // address a field by name and then reach for the control inside it.
  return (
    <StudioFieldRow
      label={fieldCaption(props.fieldName, props.descriptor)}
      data-sauna-prop={props.fieldName}
      title={props.descriptor?.description}
    >
      {props.children}
    </StudioFieldRow>
  );
}

/**
 * The same row for a control that is a GROUP of buttons rather than one
 * input. Deliberately not `StudioFieldRow`: that one is a real `<label>`,
 * and a label wrapping several buttons hands its click to the first of them —
 * the caption would silently press "left" every time someone aimed at the
 * word. The accessible name comes from `aria-label` on the group instead.
 */
function FieldGroupShell(props: {
  fieldName: string;
  descriptor?: PropDescriptor;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-start gap-1 text-xs"
      data-sauna-prop={props.fieldName}
      title={props.descriptor?.description}
    >
      <Text as="span" size="xs" variant="muted">
        {fieldCaption(props.fieldName, props.descriptor)}
      </Text>
      {props.children}
    </div>
  );
}

export const TextEditor: PropEditor = ({ fieldName, descriptor, value, onChange, disabled }) => (
  <FieldShell fieldName={fieldName} descriptor={descriptor}>
    <Input
      type="text"
      className={controlCls}
      placeholder={placeholderOf(descriptor)}
      value={typeof value === "string" ? value : ""}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const next = e.target.value;
        onChange(next === "" ? undefined : next);
      }}
    />
  </FieldShell>
);

export const NumberEditor: PropEditor = ({ fieldName, descriptor, value, onChange, disabled }) => (
  <FieldShell fieldName={fieldName} descriptor={descriptor}>
    <Input
      type="number"
      className={controlCls}
      placeholder={placeholderOf(descriptor)}
      value={typeof value === "number" ? value : ""}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(undefined);
          return;
        }
        const n = Number(raw);
        onChange(Number.isFinite(n) ? n : undefined);
      }}
    />
  </FieldShell>
);

export const BooleanEditor: PropEditor = ({
  fieldName,
  descriptor,
  value,
  onChange,
  disabled,
}) =>
  // Neither form goes through StudioFieldRow — both are one-line rows, and
  // the test hook still sits on the <label>, as everywhere else.
  descriptor ? (
    // Manifest path: the approved canvas (board FinalRichProps) puts the
    // caption left and a switch right, one row. The checkbox form below is
    // kept for the zod path so the six hand-written blocks — and the specs
    // that address their checkboxes — do not change shape under SDL-329.
    <Label
      className="flex-row items-center justify-between gap-2 text-xs font-normal"
      data-sauna-prop={fieldName}
      title={descriptor.description}
    >
      <Text as="span" size="xs" variant="muted">
        {fieldLabel(fieldName, descriptor)}
      </Text>
      <Switch
        checked={value === true || (value === undefined && descriptor.default === true)}
        disabled={disabled}
        onCheckedChange={(checked: boolean) => onChange(checked)}
      />
    </Label>
  ) : (
    <Label
      className="gap-2 text-xs font-normal"
      data-sauna-prop={fieldName}
    >
      <NativeCheckbox
        checked={value === true}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
      />
      <Text as="span" size="xs" variant="muted">
        {fieldLabel(fieldName, descriptor)}
      </Text>
    </Label>
  );

export const EnumEditor: PropEditor = (ctx: PropEditorContext) => {
  // The descriptor wins when present — on the manifest path there is no zod
  // schema to read the literals from.
  const values = ctx.descriptor?.enumValues ?? (ctx.zodSchema ? enumValues(ctx.zodSchema) : []);
  const fallbackLabel =
    ctx.descriptor?.default === undefined
      ? "— unset —"
      : `— ${String(ctx.descriptor.default)} (default) —`;
  return (
    <FieldShell fieldName={ctx.fieldName} descriptor={ctx.descriptor}>
      <NativeSelect
        className={controlCls}
        value={typeof ctx.value === "string" ? ctx.value : ""}
        disabled={ctx.disabled}
        onChange={(e) => {
          const v = e.target.value;
          ctx.onChange(v === "" ? undefined : v);
        }}
      >
        <option value="">{fallbackLabel}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  );
};

/**
 * Enum of a few values as a segmented control (SDL-294).
 *
 * The manifest already says which enums deserve this — the classification
 * rule in the kit marks an enum of four values or fewer as `segmented`
 * (EP-48 analysis §4). Until now the descriptor named the control and the
 * panel drew a dropdown anyway; this is that control.
 *
 * Two behaviours are load-bearing, and both come from decision 1 of the
 * analysis — a component default is never written into the page:
 *
 *   - nothing is pressed while the prop is unset. The item that WOULD apply
 *     is marked `data-sauna-prop-default` and dimmed, so "unset" is legible
 *     without lying about what is stored;
 *   - pressing the pressed item clears the prop back to unset. Radix single
 *     toggle-groups already report that as an empty value, so the author
 *     gets an undo for "I set this by accident" that a dropdown cannot give
 *     without an extra "— unset —" row.
 *
 * An enum wider than the rule allows (a manifest is data from a package
 * that versions on its own) falls back to the dropdown rather than growing
 * a row of buttons past the 320px column.
 */
const SEGMENTED_MAX_ITEMS = 4;

export const SegmentedEditor: PropEditor = (ctx: PropEditorContext) => {
  const values = ctx.descriptor?.enumValues ?? (ctx.zodSchema ? enumValues(ctx.zodSchema) : []);
  if (values.length === 0 || values.length > SEGMENTED_MAX_ITEMS) return EnumEditor(ctx);

  const current = typeof ctx.value === "string" ? ctx.value : "";
  const fallback = ctx.descriptor?.default === undefined ? undefined : String(ctx.descriptor.default);

  return (
    <FieldGroupShell fieldName={ctx.fieldName} descriptor={ctx.descriptor}>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline" /* kit-compat: "segmented" is not in 0.2.0-alpha.2 */
        className="w-full"
        aria-label={fieldLabel(ctx.fieldName, ctx.descriptor)}
        value={current}
        disabled={ctx.disabled}
        onValueChange={(next: string) => ctx.onChange(next === "" ? undefined : next)}
      >
        {values.map((v) => (
          <ToggleGroupItem
            key={v}
            value={v}
            // The segments fill the 320px column, so they lose the horizontal
            // padding the kit's hug-width default carries (board: `flex: 1 1 0;
            // padding: 5px 0`). Everything else — height, type scale, the
            // white thumb — belongs to the kit's `segmented` variant.
            className={cn("flex-1 px-0", current === "" && v === fallback && "text-muted-foreground")}
            {...(current === "" && v === fallback ? { "data-sauna-prop-default": "" } : {})}
            title={current === "" && v === fallback ? `${v} — default` : v}
          >
            {v}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldGroupShell>
  );
};

/**
 * A link prop (SDL-294) — `href`, `src` and their kin, which the manifest
 * marks `link`.
 *
 * It is a text input on purpose: `type="url"` rejects `/about`, and a
 * root-relative path is the most common thing an author types on a site
 * engine where the page tree lives next door. What the plain text editor
 * could not do is tell the author when a value will not go where they
 * think — `about` (no leading slash) resolves against the CURRENT page, so
 * it works on `/` and breaks on `/blog/post`. That class of bug is invisible
 * in the editor and shows up on the live site.
 *
 * So the value is stored exactly as typed — an author is never edited behind
 * their back — and an ambiguous one gets a warning under the field.
 */
const ABSOLUTE_SCHEMES = ["http://", "https://", "mailto:", "tel:", "//"];

/** True for a value whose target does not depend on the current page. */
export function isUnambiguousHref(href: string): boolean {
  const v = href.trim();
  if (v === "") return true;
  if (v.startsWith("/") || v.startsWith("#") || v.startsWith("?")) return true;
  return ABSOLUTE_SCHEMES.some((scheme) => v.toLowerCase().startsWith(scheme));
}

export const LinkEditor: PropEditor = ({ fieldName, descriptor, value, onChange, disabled }) => {
  const text = typeof value === "string" ? value : "";
  // SDL-681: javascript:, data:text/html and the like are refused on save
  // (the provider validates on write) — say so here, where it is typed.
  const unsafe = text !== "" && !isSafeUrl(text, descriptor?.name ?? fieldName);
  const ambiguous = !unsafe && !isUnambiguousHref(text);
  return (
    <FieldShell fieldName={fieldName} descriptor={descriptor}>
      <Input
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        // Monospace, per the approved board (`FinalRichProps`: the href row
        // is `font-family: ui-monospace`). A path is read character by
        // character — a leading slash, a typo'd segment, a trailing one —
        // and that is exactly what a proportional face blurs.
        className={cn(controlCls, "font-mono")}
        placeholder={placeholderOf(descriptor) ?? "/page, https://…, #anchor"}
        value={text}
        disabled={disabled}
        aria-invalid={unsafe || ambiguous || undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const next = e.target.value;
          onChange(next === "" ? undefined : next);
        }}
      />
      {unsafe ? (
        <Text as="span" size="xs" role="alert" className="text-destructive" data-sauna-prop-error={fieldName}>
          Not allowed: only http(s), mailto, tel or a site path — this link will not be saved.
        </Text>
      ) : null}
      {ambiguous ? (
        <Text as="span" size="xs" variant="muted" data-sauna-prop-hint={fieldName}>
          Relative to the current page — use a leading “/” for a site path.
        </Text>
      ) : null}
    </FieldShell>
  );
};

/** Last-resort editor: shows the JSON of the value, read-only. */
export const ReadonlyJsonEditor: PropEditor = ({ fieldName, descriptor, value }) => (
  <FieldShell fieldName={fieldName} descriptor={descriptor}>
    <pre className="w-full whitespace-pre-wrap break-all rounded-sm bg-muted p-2 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  </FieldShell>
);

/**
 * Fallback editor for fields the auto-form can't introspect (objects,
 * arrays, anything not eq/neq/exists/truthy). Renders a JSON textarea
 * with parse-on-blur: invalid JSON leaves the upstream value
 * untouched and shows an inline error so authors don't lose state by
 * mistype.
 *
 * Used as the default fallback (replacing the read-only variant) so
 * Studio is editable end-to-end even for component types that don't
 * yet have a `defineBlock` registration.
 */
export const JsonEditor: PropEditor = ({ fieldName, descriptor, value, onChange, disabled }) => (
  <FieldShell fieldName={fieldName} descriptor={descriptor}>
    <StudioJsonField
      value={value}
      validate={acceptAnyJson}
      disabled={disabled}
      onChange={onChange}
      maxRows={8}
    />
  </FieldShell>
);
