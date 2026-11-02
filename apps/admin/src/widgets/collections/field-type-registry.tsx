"use client";

// Field-type registry — the single extension point for field rendering.
//
// Ships sensible defaults for the nine
// built-in field types (string / number / boolean / date / rich_text
// / image / relation / select / json), but every field of those
// types is rendered through the registry, so a feature can:
//
//   - replace a default with a richer renderer (`image` is registered
//     over with the asset picker — features/collections-assets)
//   - add a brand-new type (e.g. "geo_point")
//   - tweak a single aspect (e.g. plug a custom CellRender without
//     touching the FormInput)
//
// API
// ----
//
//   registerFieldType({ type, FormInput?, CellRender?, defaultValue? })
//   getFieldTypeRenderers(type) -> resolved renderers (with defaults)
//   listRegisteredFieldTypes() -> readonly string[]
//
// The registry is a process-global singleton. RecordForm and
// RecordsTable read from it when rendering each field; nothing else
// needs to know it exists.
//
// Stays presentation-only and theme-aware. Defaults are exported so
// custom renderers can call back into the built-in implementation.

import { useState, type CSSProperties, type ReactNode } from "react";

import { Alert, Box, FormControl, Text } from "@markerloop/ui/ui";
import { RichTextView, richTextHasFormatting } from "@markerloop/ui/ui/admin";

import {
  isRichTextEnvelope,
  type CollectionField,
  type FieldType,
  type RichTextEnvelope,
} from "./types";

export interface FieldFormInputProps {
  field: CollectionField;
  /** Current value (RHF-controlled). */
  value: unknown;
  /** Setter — pass any JSON-serialisable value. */
  onChange: (value: unknown) => void;
  /** Stable id for `<label htmlFor>` association. */
  inputId: string;
  /** Whether the input should refuse interaction. */
  disabled?: boolean;
  /** Optional copy override (i18n) — RecordForm forwards its labels. */
  labels?: {
    booleanTrue?: string;
    booleanFalse?: string;
    /** rich_text: caption over the read-only view of the saved document. */
    richTextSaved?: string;
    /** rich_text: warning that the plain-text input drops formatting. */
    richTextFormattingLoss?: string;
  };
}

export interface FieldCellRenderProps {
  field: CollectionField;
  value: unknown;
}

export interface FieldTypeRenderers {
  type: FieldType;
  FormInput: (props: FieldFormInputProps) => ReactNode;
  CellRender: (props: FieldCellRenderProps) => ReactNode;
  /**
   * Default value used when the user opens an empty form. Falls back
   * to `""` if not provided.
   */
  defaultValue?: unknown;
}

const REGISTRY = new Map<string, FieldTypeRenderers>();

/**
 * Register or override the renderers for a field type. Idempotent
 * for re-registration of the same type — last write wins.
 */
export function registerFieldType(entry: FieldTypeRenderers): void {
  REGISTRY.set(String(entry.type), entry);
}

/**
 * Look up the renderers for a type. Falls back to the `string`
 * defaults when the type is unknown so the table never crashes on
 * an unexpected field type from the wire.
 */
export function getFieldTypeRenderers(type: FieldType): FieldTypeRenderers {
  return (
    REGISTRY.get(String(type)) ??
    REGISTRY.get("string") ?? {
      type: "string",
      FormInput: defaultStringInput,
      CellRender: defaultStringCell,
    }
  );
}

/** Snapshot of registered type ids — stable for storybook / debug. */
export function listRegisteredFieldTypes(): readonly string[] {
  return Array.from(REGISTRY.keys()).sort();
}

/**
 * Mono 12px for id-ish inputs — the kit Input carries no mono
 * variant, so the typography stays inline on that one control.
 */
const monoInputStyle: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 12,
};

function emptyCell(): ReactNode {
  return (
    <Text as="span" variant="muted" size="sm">
      —
    </Text>
  );
}

// ---- string ---------------------------------------------------

export function defaultStringInput(props: FieldFormInputProps): ReactNode {
  return (
    <FormControl.Input
      id={props.inputId}
      type="text"
      disabled={props.disabled}
      value={typeof props.value === "string" ? props.value : ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

export function defaultStringCell({ value }: FieldCellRenderProps): ReactNode {
  if (value === null || value === undefined || value === "") return emptyCell();
  return typeof value === "string" ? value : JSON.stringify(value);
}

// ---- number ---------------------------------------------------

function defaultNumberInput(props: FieldFormInputProps): ReactNode {
  return (
    <FormControl.Input
      id={props.inputId}
      type="number"
      inputMode="decimal"
      disabled={props.disabled}
      value={
        props.value === null || props.value === undefined
          ? ""
          : typeof props.value === "string"
            ? props.value
            : String(props.value)
      }
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          props.onChange(null);
          return;
        }
        const n = Number(raw);
        props.onChange(Number.isNaN(n) ? raw : n);
      }}
    />
  );
}

function defaultNumberCell({ value }: FieldCellRenderProps): ReactNode {
  if (value === null || value === undefined || value === "") return emptyCell();
  return typeof value === "number"
    ? value.toLocaleString()
    : String(value);
}

// ---- boolean --------------------------------------------------

function defaultBooleanInput(props: FieldFormInputProps): ReactNode {
  const checked = !!props.value;
  return (
    <Box as="label" direction="row" align="center" gap={2} htmlFor={props.inputId}>
      <FormControl.Checkbox
        id={props.inputId}
        disabled={props.disabled}
        checked={checked}
        onCheckedChange={(next) => props.onChange(next === true)}
      />
      <Text as="span" variant="muted" size="sm">
        {checked
          ? props.labels?.booleanTrue ?? "true"
          : props.labels?.booleanFalse ?? "false"}
      </Text>
    </Box>
  );
}

function defaultBooleanCell({ value }: FieldCellRenderProps): ReactNode {
  if (value === null || value === undefined) return emptyCell();
  return value ? "✓" : "✗";
}

// ---- date -----------------------------------------------------

function defaultDateInput(props: FieldFormInputProps): ReactNode {
  return (
    <FormControl.Input
      id={props.inputId}
      type="datetime-local"
      disabled={props.disabled}
      value={typeof props.value === "string" ? props.value : ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

function defaultDateCell({ value }: FieldCellRenderProps): ReactNode {
  if (value === null || value === undefined || value === "") return emptyCell();
  if (typeof value !== "string") return String(value);
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return value;
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

// ---- rich_text ------------------------------------------------
// Wire format is the {format:"pm/1", doc, text} envelope (see
// RichTextEnvelope in ./types). The input stays plain text: the form
// edits `text` and wraps it into a minimal one-paragraph ProseMirror
// doc on change — the server re-validates the doc and re-derives
// `text` itself. A real tiptap editor is a follow-up; the deps are
// installed but intentionally not imported here.
//
// SDL-638: because that round trip collapses headings, lists, links
// and marks into one paragraph, a record whose saved document carries
// any of them shows the saved document read-only (RichTextView from
// the kit) above the input, with a warning that editing the field
// here drops the formatting. Untouched, the field submits the
// original envelope as is (coerceForSubmit passes objects through),
// so saving other fields of the record keeps it intact.

/** Best-effort plain text from an envelope or legacy string value. */
function richTextToPlainText(value: unknown): string {
  if (isRichTextEnvelope(value)) return value.text;
  return typeof value === "string" ? value : "";
}

/**
 * Wrap plain text into the minimal valid pm/1 envelope. Empty text
 * produces a paragraph without `content` — the shape the server
 * emits for an empty document.
 */
export function makeRichTextEnvelope(text: string): RichTextEnvelope {
  const paragraph: Record<string, unknown> = text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
  return {
    format: "pm/1",
    doc: { type: "doc", content: [paragraph] },
    text,
  };
}

/**
 * The value a rich_text textarea edit produces. Typing the saved text
 * back (type-then-delete, paste the same words) must hand back the
 * ORIGINAL envelope, not a plain rebuild of it: otherwise a no-op edit
 * silently flattens the formatting on save.
 */
export function richTextValueFromInput(initial: unknown, text: string): unknown {
  if (isRichTextEnvelope(initial) && text === initial.text) return initial;
  return makeRichTextEnvelope(text);
}

function RichTextFieldInput(props: FieldFormInputProps): ReactNode {
  // The value the form opened with. Typing replaces the envelope with a
  // plain one, so the formatting check and the saved view must look at
  // the first value, not the live one — otherwise the warning would
  // vanish at the first keystroke, exactly when the loss happens.
  const [initial] = useState<unknown>(() => props.value);
  const formatted = isRichTextEnvelope(initial) && richTextHasFormatting(initial.doc);
  return (
    <Box direction="column" gap={2} data-rich-text-field="">
      {formatted ? (
        <>
          <Box
            direction="column"
            gap={1}
            className="rounded-md border border-border bg-card p-3"
            data-rich-text-saved=""
          >
            <Text as="span" variant="meta">
              {props.labels?.richTextSaved ?? "Saved formatting (read-only)"}
            </Text>
            <RichTextView value={initial} />
          </Box>
          <Alert role="note" data-rich-text-formatting-warning="">
            {props.labels?.richTextFormattingLoss ??
              "This field is edited as plain text here: any change to it turns headings, lists, links and bold/italic into one plain paragraph. Leave the field untouched to keep the formatting."}
          </Alert>
        </>
      ) : null}
      <FormControl.Textarea
        id={props.inputId}
        className="min-h-20 resize-y"
        rows={4}
        disabled={props.disabled}
        value={richTextToPlainText(props.value)}
        onChange={(e) => props.onChange(richTextValueFromInput(initial, e.target.value))}
      />
    </Box>
  );
}

function defaultRichTextInput(props: FieldFormInputProps): ReactNode {
  return <RichTextFieldInput {...props} />;
}

const RICH_TEXT_CELL_MAX = 120;

function defaultRichTextCell({ value }: FieldCellRenderProps): ReactNode {
  const text = richTextToPlainText(value);
  if (text === "") return emptyCell();
  return text.length > RICH_TEXT_CELL_MAX
    ? `${text.slice(0, RICH_TEXT_CELL_MAX)}…`
    : text;
}

// ---- image ----------------------------------------------------
// The default is a plain URL field, which keeps the type usable with
// no file backend at all. The asset picker
// (features/collections-assets) registers over it and falls back to
// this input when it has no project scope to browse.

export function defaultImageInput(props: FieldFormInputProps): ReactNode {
  return (
    <FormControl.Input
      id={props.inputId}
      type="text"
      placeholder="https://… or asset URL"
      disabled={props.disabled}
      value={typeof props.value === "string" ? props.value : ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

export function defaultImageCell({ value }: FieldCellRenderProps): ReactNode {
  if (typeof value !== "string" || value === "") return emptyCell();
  return (
    <Text as="span" variant="mono" size="xs" title={value}>
      {value.split("/").pop() ?? value}
    </Text>
  );
}

// ---- relation -------------------------------------------------
// Wire format (SDL-170): the value is an array of record UUIDs of the
// target collection; the target is named by the field config
// {"collection_key": "<key>"} — the template-catalog contract the
// backend validates against. Markerloop registers a record picker on
// top of this type (features/collections-relations); the defaults
// below keep the module usable standalone: a comma-separated id input
// and a compact id-chip cell.

/** Target collection key from a relation field config, if configured. */
export function readRelationTargetKey(
  config: Record<string, unknown> | undefined
): string | null {
  if (!config) return null;
  const raw = (config as { collection_key?: unknown }).collection_key;
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/** Narrow an unknown relation value to the id array the wire carries. */
export function relationIdsFromValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v !== "");
}

function defaultRelationInput(props: FieldFormInputProps): ReactNode {
  const ids = relationIdsFromValue(props.value);
  return (
    <FormControl.Input
      id={props.inputId}
      type="text"
      placeholder="id, id, …"
      style={monoInputStyle}
      disabled={props.disabled}
      value={ids.join(", ")}
      onChange={(e) => {
        const next = e.target.value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== "");
        props.onChange(next.length > 0 ? next : null);
      }}
    />
  );
}

export function defaultRelationCell({
  value,
}: FieldCellRenderProps): ReactNode {
  // Legacy scalar values (pre-SDL-170 string input) still render.
  if (typeof value === "string" && value !== "") {
    return (
      <Text as="span" variant="mono" size="xs">
        {value.slice(0, 8)}
      </Text>
    );
  }
  const ids = relationIdsFromValue(value);
  if (ids.length === 0) return emptyCell();
  const shown = ids.slice(0, 3).map((id) => id.slice(0, 8));
  const rest = ids.length - shown.length;
  return (
    <Text as="span" variant="mono" size="xs">
      {shown.join(", ")}
      {rest > 0 ? ` +${rest}` : ""}
    </Text>
  );
}

// ---- select ---------------------------------------------------

/**
 * The "no value" item. Radix Select refuses an Item with value "" (it is
 * reserved for "show the placeholder"), and here "no value" is a choice the
 * person can make, so it gets a sentinel that maps back to "" on change.
 */
const SELECT_NONE = "__none__";

function defaultSelectInput(props: FieldFormInputProps): ReactNode {
  const opts = readSelectOptions(props.field.config);
  return (
    <FormControl.Select.Root
      disabled={props.disabled}
      value={
        typeof props.value === "string" && props.value !== ""
          ? props.value
          : SELECT_NONE
      }
      onValueChange={(value) =>
        props.onChange(value === SELECT_NONE ? "" : value)
      }
    >
      <FormControl.Select.Trigger id={props.inputId} fullWidth>
        <FormControl.Select.Value />
      </FormControl.Select.Trigger>
      <FormControl.Select.Content>
        <FormControl.Select.Item value={SELECT_NONE}>—</FormControl.Select.Item>
        {opts
          .filter((o) => o.value !== "" && o.value !== SELECT_NONE)
          .map((o) => (
            <FormControl.Select.Item key={o.value} value={o.value}>
              {o.label ?? o.value}
            </FormControl.Select.Item>
          ))}
      </FormControl.Select.Content>
    </FormControl.Select.Root>
  );
}

function readSelectOptions(
  config: Record<string, unknown> | undefined
): { value: string; label?: string }[] {
  if (!config) return [];
  const raw = (config as { options?: unknown }).options;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      if (typeof o === "string") return { value: o };
      if (o && typeof o === "object" && "value" in o) {
        const obj = o as { value: unknown; label?: unknown };
        return {
          value: String(obj.value),
          label: obj.label === undefined ? undefined : String(obj.label),
        };
      }
      return null;
    })
    .filter((o): o is { value: string; label?: string } => o !== null);
}

// ---- json -----------------------------------------------------

function defaultJsonInput(props: FieldFormInputProps): ReactNode {
  return (
    <FormControl.Textarea
      id={props.inputId}
      className="min-h-20 resize-y"
      rows={6}
      disabled={props.disabled}
      value={typeof props.value === "string" ? props.value : ""}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}

function defaultJsonCell({ value }: FieldCellRenderProps): ReactNode {
  if (value === null || value === undefined) return emptyCell();
  return (
    <Text as="code" variant="mono" size="xs">
      {JSON.stringify(value)}
    </Text>
  );
}

// ---- bootstrap default registrations --------------------------

registerFieldType({
  type: "string",
  FormInput: defaultStringInput,
  CellRender: defaultStringCell,
  defaultValue: "",
});
registerFieldType({
  type: "number",
  FormInput: defaultNumberInput,
  CellRender: defaultNumberCell,
  defaultValue: "",
});
registerFieldType({
  type: "boolean",
  FormInput: defaultBooleanInput,
  CellRender: defaultBooleanCell,
  defaultValue: false,
});
registerFieldType({
  type: "date",
  FormInput: defaultDateInput,
  CellRender: defaultDateCell,
  defaultValue: "",
});
registerFieldType({
  type: "rich_text",
  FormInput: defaultRichTextInput,
  CellRender: defaultRichTextCell,
  defaultValue: makeRichTextEnvelope(""),
});
registerFieldType({
  type: "image",
  FormInput: defaultImageInput,
  CellRender: defaultImageCell,
  defaultValue: "",
});
registerFieldType({
  type: "relation",
  FormInput: defaultRelationInput,
  CellRender: defaultRelationCell,
  defaultValue: null,
});
registerFieldType({
  type: "select",
  FormInput: defaultSelectInput,
  CellRender: defaultStringCell,
  defaultValue: "",
});
registerFieldType({
  type: "json",
  FormInput: defaultJsonInput,
  CellRender: defaultJsonCell,
  defaultValue: "",
});
