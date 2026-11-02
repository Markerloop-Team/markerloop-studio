"use client";

// SaunaPreviewContextEditor — sidebar control that builds a
// `SaunaContext` overlay for the live preview.
//
// Sunday-Sauna has no opinion on what context variables exist (it
// doesn't know what `user.role` means, or whether any custom flag
// matters). The host application *declares* its context shape
// via a `PreviewContextSchema` and the editor renders the matching
// inputs. When no schema is provided, only the free-form "extras"
// rows are shown — useful for ad-hoc poking.
//
// The editor owns its own form state; the embedding shell is
// expected to pass the constructed context into the preview's
// `<SaunaProvider context>`.

import type { ReactNode } from "react";

import type { SaunaContext } from "@markerloop/engine/react";
import { Button, FormControl, Text } from "@markerloop/ui/ui";
import { StudioFieldRow, StudioIconButton, StudioPanel } from "./panel-parts";

const { Input, NativeSelect } = FormControl;

// ---- Schema types ---------------------------------------------------
//
// A tiny declarative shape so the host can describe its preview
// variables without pulling zod into Studio. Sufficient for the M1
// scope (string / number / boolean / enum). Anything richer is
// reachable through the "extras" rows.

export type PreviewContextField =
  | {
      path: string;
      label?: string;
      kind: "string";
      placeholder?: string;
    }
  | {
      path: string;
      label?: string;
      kind: "number";
      placeholder?: string;
    }
  | { path: string; label?: string; kind: "boolean" }
  | { path: string; label?: string; kind: "enum"; options: readonly string[] };

export type PreviewContextSchema = {
  fields: readonly PreviewContextField[];
};

/**
 * Form view — what the user actually types.
 *
 * `values` is keyed by the field's dot-path (same as the visibility
 * editor's `path` prop) so the renderer can fan it out into a real
 * `SaunaContext` via `viewToContext()`. Stored as the literal text
 * the user typed; we coerce on `viewToContext()`.
 *
 * `extras` is for ad-hoc paths that aren't declared in the schema.
 */
export type PreviewContextView = {
  values: Record<string, string>;
  extras: { key: string; value: string }[];
};

export const emptyPreviewContextView: PreviewContextView = {
  values: {},
  extras: [],
};

/**
 * Build a SaunaContext from the form view. Each schema field and
 * each extras row is applied by dot-path; nested objects are created
 * as needed. String values that parse as JSON ("true", "42", "\"x\"")
 * are interpreted accordingly so authors can poke booleans/numbers
 * without a kind dropdown for extras.
 */
export function viewToContext(
  view: PreviewContextView,
  schema?: PreviewContextSchema,
): SaunaContext {
  const ctx: Record<string, unknown> = {};
  if (schema) {
    for (const field of schema.fields) {
      const raw = view.values[field.path];
      if (raw === undefined || raw === "") continue;
      const value = coerceTyped(field, raw);
      if (value === undefined) continue;
      setDeep(ctx, field.path.split("."), value);
    }
  }
  for (const { key, value } of view.extras) {
    if (!key) continue;
    setDeep(ctx, key.split("."), coerce(value));
  }
  return ctx as SaunaContext;
}

/**
 * One-line summary of what the context currently holds — the label of the
 * toolbar chip that opens this editor (SDL-287, approved canvas board
 * FinalEditor: `Context: ru · admin`).
 *
 * Values only, no field names: the chip has room for the *state*, and a
 * `locale=ru · user.role=admin` chip is unreadable at 12px. Declared fields
 * come first, in schema order, so the summary is stable while the author
 * types; ad-hoc extras follow as `key=value`, because there the key IS the
 * information. Empty → `undefined`, which is how the chip knows to show its
 * bare label instead of an empty colon.
 */
export function previewContextSummary(
  view: PreviewContextView,
  schema?: PreviewContextSchema,
): string | undefined {
  const parts: string[] = [];
  for (const field of schema?.fields ?? []) {
    const raw = view.values[field.path];
    if (raw === undefined || raw === "") continue;
    parts.push(raw);
  }
  for (const { key, value } of view.extras) {
    if (!key) continue;
    parts.push(value === "" ? key : `${key}=${value}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function coerceTyped(field: PreviewContextField, text: string): unknown {
  switch (field.kind) {
    case "string":
      return text;
    case "number": {
      const n = Number(text);
      return Number.isFinite(n) ? n : undefined;
    }
    case "boolean":
      if (text === "true") return true;
      if (text === "false") return false;
      return undefined;
    case "enum":
      return field.options.includes(text) ? text : undefined;
  }
}

function setDeep(target: Record<string, unknown>, path: string[], value: unknown) {
  let cursor = target;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    if (typeof cursor[k] !== "object" || cursor[k] === null) {
      cursor[k] = {};
    }
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]!] = value;
}

function coerce(text: string): unknown {
  const t = text.trim();
  if (t === "") return "";
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  // Number round-trip guard avoids accidental "007" => 7 collapses for
  // path params like slug "007".
  const n = Number(t);
  if (!Number.isNaN(n) && String(n) === t) return n;
  if (t.startsWith("\"") || t.startsWith("{") || t.startsWith("[")) {
    try {
      return JSON.parse(t);
    } catch {
      return text;
    }
  }
  return text;
}

// ---- React component ------------------------------------------------

export type SaunaPreviewContextEditorProps = {
  value: PreviewContextView;
  onChange: (next: PreviewContextView) => void;
  /**
   * Host-declared context shape. When omitted, only the free-form
   * extras rows render. Pass the same schema you wire into your
   * documentation / shared preview-context constants.
   */
  schema?: PreviewContextSchema;
  disabled?: boolean;
  /**
   * Body only, no StudioPanel shell of its own — for a host-owned surface
   * that already draws a header. Since SDL-287 that surface is the popover
   * behind the toolbar's context chip; the `data-sauna-preview-context`
   * hook moves onto the bare wrapper.
   */
  bare?: boolean;
};

export function SaunaPreviewContextEditor({
  value,
  onChange,
  schema,
  disabled,
  bare,
}: SaunaPreviewContextEditorProps): ReactNode {
  const setValue = (path: string, raw: string) => {
    const nextValues = { ...value.values, [path]: raw };
    if (raw === "") delete nextValues[path];
    onChange({ ...value, values: nextValues });
  };

  const updateExtra = (idx: number, patch: Partial<{ key: string; value: string }>) => {
    onChange({
      ...value,
      extras: value.extras.map((row, i) => (i === idx ? { ...row, ...patch } : row)),
    });
  };

  const addExtra = () => {
    onChange({ ...value, extras: [...value.extras, { key: "", value: "" }] });
  };

  const removeExtra = (idx: number) => {
    onChange({ ...value, extras: value.extras.filter((_, i) => i !== idx) });
  };

  const body = (
      <div className="flex flex-col gap-2">
        {schema?.fields.map((field) => (
          // The row carries `data-sauna-context-field` because the safety net
          // scopes a field lookup by path and then reaches for the control
          // inside it — the hook must stay on the wrapper, not on the input.
          <StudioFieldRow
            key={field.path}
            label={field.label ?? field.path}
            data-sauna-context-field={field.path}
          >
            <FieldInput
              field={field}
              value={value.values[field.path] ?? ""}
              disabled={disabled}
              onChange={(raw) => setValue(field.path, raw)}
            />
          </StudioFieldRow>
        ))}

        <div className="mt-1 flex flex-col gap-1.5">
          <Text as="span" size="xs" variant="muted">
            {schema ? "Extra paths" : "Context paths"}
          </Text>
          {value.extras.map((row, idx) => (
            <div key={idx} className="flex gap-1.5">
              <Input
                aria-label="Context path"
                type="text"
                value={row.key}
                disabled={disabled}
                onChange={(e) => updateExtra(idx, { key: e.target.value })}
                placeholder="route.params.slug"
                className="h-8 min-w-0 flex-1 font-mono max-md:text-xs md:text-xs"
              />
              <Input
                aria-label="Context value"
                type="text"
                value={row.value}
                disabled={disabled}
                onChange={(e) => updateExtra(idx, { value: e.target.value })}
                placeholder="value (true/42/text)"
                className="h-8 min-w-0 flex-1 max-md:text-xs md:text-xs"
              />
              <StudioIconButton
                label="Remove"
                onClick={() => removeExtra(idx)}
                disabled={disabled}
                className="mt-0.5"
              >
                ×
              </StudioIconButton>
            </div>
          ))}
          {/* Full width, not a compact button hugging the left edge (SDL-376):
              on the canvas this control closes the column of path rows above
              it, and a short button there reads as an afterthought instead of
              as "one more row". `sm` is the kit's 32px step — the height the
              board draws. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addExtra}
            disabled={disabled}
            className="w-full"
          >
            + Add path
          </Button>
        </div>
      </div>
  );

  if (bare) {
    return <div data-sauna-preview-context>{body}</div>;
  }

  return (
    <StudioPanel title="Preview context" data-sauna-preview-context>
      {body}
    </StudioPanel>
  );
}

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: PreviewContextField;
  value: string;
  disabled?: boolean;
  onChange: (raw: string) => void;
}): ReactNode {
  // Dense variant of the shared field styling: the panel is a 320px column,
  // so controls run one size below the form default.
  const cls = "h-8 max-md:text-xs md:text-xs";
  switch (field.kind) {
    case "string":
      return (
        <Input
          type="text"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />
      );
    case "number":
      return (
        <Input
          type="number"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />
      );
    // Declared dropdowns stay native: the host drives them from its own
    // tests, and a real select element is the only control the platform form
    // APIs (and Playwright's selectOption) can set directly.
    case "boolean":
      return (
        <NativeSelect
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        >
          <option value="">(unset)</option>
          <option value="false">false</option>
          <option value="true">true</option>
        </NativeSelect>
      );
    case "enum":
      return (
        <NativeSelect
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        >
          <option value="">(unset)</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </NativeSelect>
      );
  }
}
