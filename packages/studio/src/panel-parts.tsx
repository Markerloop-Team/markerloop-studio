"use client";

// Shared chrome for the Studio's editor panels (S2.1).
//
// Before this slice every panel carried its own copy of the same four
// pieces: the panel shell (`Section` ×3), the label+control row (`Row` ×3),
// the JSON textarea with parse-on-blur (×3) and the condition builder (×2).
// The copies had already drifted: of the three JSON textareas, two committed
// `undefined` on empty input and the third committed `{}`, and only the one
// in the properties pane drew a focus ring at all. They live here once now
// and are assembled from `../ui` + `../ui/admin`.
//
// Everything below is internal to `src/studio`; none of it is re-exported
// from the package. Panels are a private layout concern, and the admin
// primitives they build on are already public via `sunday-sauna/ui/admin`.

import * as React from "react";
import type { ReactNode } from "react";

import type { VisibilityCondition } from "@markerloop/engine";
import { Button, FormControl, Text, cn } from "@markerloop/ui/ui";
import { PanelColumn, PanelColumnHeader } from "@markerloop/ui/ui/admin";
import {
  contextFieldFor,
  defaultLiteralText,
  literalKindOf,
  viewToWhen,
  whenToView,
  type ConditionView,
  type EditorOp,
  type LiteralKind,
} from "./condition-view";
import type { PreviewContextSchema } from "./preview-context-editor";

const { Input, Label, NativeSelect, Textarea } = FormControl;

/* ------------------------------------------------------------------ */
/* Panel shell                                                        */
/* ------------------------------------------------------------------ */

export type StudioPanelProps = Omit<React.ComponentProps<typeof PanelColumn>, "title"> & {
  /** Zone title, rendered by PanelColumnHeader. */
  title: ReactNode;
  /** Right-aligned header slot (icon buttons). */
  actions?: ReactNode;
  /** Classes for the panel body; the default padding is usually enough. */
  bodyClassName?: string;
};

/**
 * One editor panel: header + body. A thin composition of PanelColumn /
 * PanelColumnHeader with the two defaults every Studio panel needs — panels
 * stack vertically inside a single scrolling column, so they size to their
 * content (`h-auto`) and never draw the column's own right border.
 *
 * The body is a plain div rather than `PanelColumnBody`, which is a Radix
 * ScrollArea: the column the panels stack in is already one, and nesting a
 * scroller per panel is what the shell explicitly avoids — it would give the
 * author several tiny viewports instead of one column, on top of a
 * ResizeObserver per panel.
 *
 * `overflow-auto` is the escape hatch for the one case the column cannot
 * absorb, and it stayed load-bearing after `PanelColumnBody` grew a
 * horizontal pan wrapper of its own. The column pins the panels to its own
 * width, so anything that can shrink, wrap or ellipsize does; content that
 * can do none of those — an unbroken 120-char variant id — measures 319px
 * client / 904px scroll here. Forcing this body to `visible` leaves 585px of
 * that id (66%) unreachable at every scroll position, because `PanelColumn`
 * around it is `overflow-hidden` and the overflow never reaches the column's
 * pan wrapper. That clip is also what keeps panning panel-local: the hosting
 * column's pan wrapper measures 319px client / 319px scroll in every
 * configuration, so a wide value in one panel never drags its siblings
 * sideways.
 */
export function StudioPanel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  ...props
}: StudioPanelProps) {
  return (
    <PanelColumn className={cn("h-auto border-r-0", className)} {...props}>
      <PanelColumnHeader title={title} actions={actions} />
      <div className={cn("min-h-0 flex-1 overflow-auto p-3", bodyClassName)}>{children}</div>
    </PanelColumn>
  );
}

/* ------------------------------------------------------------------ */
/* Label + control row                                                */
/* ------------------------------------------------------------------ */

export type StudioFieldRowProps = React.ComponentProps<typeof Label> & {
  label: ReactNode;
};

/**
 * A labelled control. Renders a real `<label>` wrapping its control, so the
 * accessible name comes from the DOM rather than a hand-maintained `id`
 * pairing — that is what `getByLabel()` in the safety net binds to.
 *
 * Rest props land on the `<label>` itself: callers that need a test hook on
 * the row (`data-sauna-context-field`, `data-sauna-prop`) pass it here and
 * it stays at exactly the DOM level it had before S2.1.
 */
export function StudioFieldRow({
  label,
  children,
  className,
  ...props
}: StudioFieldRowProps) {
  return (
    <Label
      className={cn("flex-col items-start gap-1 text-xs font-normal", className)}
      {...props}
    >
      <Text as="span" size="xs" variant="muted">
        {label}
      </Text>
      {children}
    </Label>
  );
}

/* ------------------------------------------------------------------ */
/* JSON field with parse-on-blur                                      */
/* ------------------------------------------------------------------ */

export type JsonParseResult<T> =
  | { ok: true; value: T | undefined }
  | { ok: false; error: string };

/** Type guard, so the object-only callers narrow without a cast. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `validate` for fields whose value must stay a JSON object (prop maps). */
export function acceptJsonObject(
  parsed: unknown
): JsonParseResult<Record<string, unknown>> {
  return isJsonObject(parsed)
    ? { ok: true, value: parsed }
    : { ok: false, error: "must be a JSON object" };
}

/** `validate` for fields that accept any JSON (arrays, scalars, objects). */
export function acceptAnyJson(parsed: unknown): JsonParseResult<unknown> {
  return { ok: true, value: parsed };
}

export type StudioJsonFieldProps<TValue> = {
  value: TValue | undefined;
  onChange: (value: TValue | undefined) => void;
  /**
   * Turns the parsed JSON into the value to store, or rejects it with a
   * message. A rejected edit leaves the upstream value untouched and shows
   * the message inline — mistyping must never drop the author's state.
   */
  validate: (parsed: unknown) => JsonParseResult<TValue>;
  disabled?: boolean;
  placeholder?: string;
  /** Fixed row count. Ignored when `maxRows` is set. */
  rows?: number;
  /** Grow with the content up to this many rows. */
  maxRows?: number;
  /**
   * Render an explicit save button under the textarea with this label
   * (SDL-377). Blur still commits — the button does not replace it, it makes
   * the commit visible: on the raw-JSON panel the only feedback for a silent
   * blur-save is that nothing happens, and the board draws a button there.
   * Fields that live inside a form with its own save affordance omit it.
   */
  saveLabel?: string;
};

/**
 * JSON textarea that commits on blur. Empty input commits `undefined`;
 * callers that need a different empty value map it in their own handler.
 */
export function StudioJsonField<TValue>({
  value,
  onChange,
  validate,
  disabled,
  placeholder,
  rows = 3,
  maxRows,
  saveLabel,
}: StudioJsonFieldProps<TValue>) {
  const initial = value === undefined ? "" : JSON.stringify(value, null, 2);
  const [text, setText] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  // Re-seed local text when the upstream value reference changes — the user
  // picked a different node/variant, or another save replaced the field.
  React.useEffect(() => {
    setText(initial);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    if (trimmed === "") {
      setError(null);
      onChange(undefined);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "invalid JSON");
      return;
    }
    const result = validate(parsed);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onChange(result.value);
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <Textarea
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        spellCheck={false}
        rows={maxRows ? Math.min(maxRows, text.split("\n").length + 1) : rows}
        // The kit Textarea is `field-sizing-content`, and under content
        // sizing the `rows` attribute is ignored — but only in the engines
        // that ship `field-sizing`. Chromium/Safari collapsed this box to a
        // single line while Firefox still honoured `rows`, so one field had
        // two heights. Opting back into fixed sizing makes `rows`/`maxRows`
        // the only source of height everywhere, and `min-h-0` drops the kit's
        // 4rem floor so `rows={3}` really is three rows.
        className="field-sizing-fixed min-h-0 px-2 py-1 font-mono text-xs"
      />
      {error ? (
        <Text as="span" size="xs" variant="destructive">
          {error}
        </Text>
      ) : null}
      {saveLabel ? (
        <div>
          {/* `onMouseDown`-free on purpose: the click blurs the textarea
              first, so `commit` has already run by the time the handler
              fires. Running it a second time is harmless (same text, same
              parse) and keeps the button honest for keyboard users, who
              reach it by Tab — which also blurs. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={commit}
            data-sauna-json-save=""
          >
            {saveLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Condition builder                                                  */
/* ------------------------------------------------------------------ */

export type StudioConditionFieldsProps = {
  when: VisibilityCondition | undefined;
  onChange: (next: VisibilityCondition) => void;
  disabled?: boolean;
  /**
   * `rows` — one labelled row per control (visibility panel, which has room).
   * `compact` — two inline lines (variant rows, already nested in a row).
   * Both layouts carry the same aria-labels, so tests and screen readers see
   * one widget with one vocabulary.
   */
  layout?: "rows" | "compact";
  /**
   * The host's declared context fields (SDL-193). Present → the field is a
   * select over them and the literal's kind comes from the declaration,
   * which is why the approved canvas draws no "Type" control. Absent → the
   * free-text path + kind pair, unchanged.
   */
  contextSchema?: PreviewContextSchema;
};

/**
 * Field + Op (+ Value for the comparison ops) over a `VisibilityCondition`,
 * laid out as the approved canvas draws it (SDL-377): the field on its own
 * line, then op and value side by side. The flattening lives in
 * `./condition-view`; this is only its form.
 *
 * "Type" survives only for an undeclared path — see `contextSchema`.
 *
 * Dropdowns are native (`NativeSelect`, not the Radix `Select`) on purpose:
 * the panel is a narrow scrolling column where a portalled listbox fights
 * the scroll container, and the safety-net specs drive these controls with
 * `selectOption()`, which only speaks to a real select element.
 */
export function StudioConditionFields({
  when,
  onChange,
  disabled,
  layout = "rows",
  contextSchema,
}: StudioConditionFieldsProps) {
  const view = whenToView(when);
  const fields = contextSchema?.fields ?? [];
  const declared = fields.length > 0;
  const field = contextFieldFor(view.path, contextSchema);
  // A declared field settles the literal's kind; `whenToView` only guessed it
  // from whatever happens to be stored. Editing the rule therefore also
  // corrects a literal that was saved as the wrong type — the control the
  // author is looking at is the one that gets committed.
  const literalKind = field ? literalKindOf(field) : view.literalKind;
  const update = (patch: Partial<ConditionView>) => {
    const merged: ConditionView = { ...view, literalKind, ...patch };
    onChange(viewToWhen(merged));
  };
  const selectField = (path: string) => {
    if (path === view.path) return;
    const next = contextFieldFor(path, contextSchema);
    if (!next) {
      update({ path });
      return;
    }
    update({
      path,
      literalKind: literalKindOf(next),
      literalText: defaultLiteralText(next),
    });
  };
  const hasLiteral = view.op === "eq" || view.op === "neq";

  const opField = (
    <NativeSelect
      aria-label="Op"
      value={view.op}
      disabled={disabled}
      onChange={(e) => update({ op: e.target.value as EditorOp })}
      className="h-8 text-xs"
    >
      <option value="eq">equals</option>
      <option value="neq">not equals</option>
      <option value="exists">exists</option>
      <option value="truthy">truthy</option>
    </NativeSelect>
  );

  const fieldField = declared ? (
    <NativeSelect
      aria-label="Field"
      value={view.path}
      disabled={disabled}
      onChange={(e) => selectField(e.target.value)}
      className="h-8 text-xs"
    >
      {/* A rule can point at a path the host no longer declares (renamed,
          unpinned, hand-authored). Listing it keeps the select honest about
          what is stored instead of silently showing the first declared
          field and rewriting the rule on the next edit. */}
      {view.path === "" ? <option value="">—</option> : null}
      {view.path !== "" && !field ? (
        <option value={view.path}>{view.path}</option>
      ) : null}
      {fields.map((f) => (
        <option key={f.path} value={f.path}>
          {f.label ?? f.path}
        </option>
      ))}
    </NativeSelect>
  ) : (
    <Input
      aria-label="Field"
      type="text"
      value={view.path}
      disabled={disabled}
      onChange={(e) => update({ path: e.target.value })}
      placeholder="user.role"
      className="h-8 max-md:text-xs md:text-xs"
    />
  );

  const kindField = (
    <NativeSelect
      aria-label="Type"
      value={literalKind}
      disabled={disabled}
      onChange={(e) => update({ literalKind: e.target.value as LiteralKind })}
      className="h-8 text-xs"
    >
      <option value="string">string</option>
      <option value="number">number</option>
      <option value="boolean">boolean</option>
    </NativeSelect>
  );

  const valueField =
    field?.kind === "enum" ? (
      <NativeSelect
        aria-label="Value"
        value={view.literalText}
        disabled={disabled}
        onChange={(e) => update({ literalText: e.target.value })}
        className="h-8 text-xs"
      >
        {/* Same reason as the field select: a literal outside the declared
            options is shown rather than swallowed. */}
        {!field.options.includes(view.literalText) ? (
          <option value={view.literalText}>{view.literalText || "—"}</option>
        ) : null}
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    ) : literalKind === "boolean" ? (
      <NativeSelect
        aria-label="Value"
        value={String(view.literalText)}
        disabled={disabled}
        onChange={(e) => update({ literalText: e.target.value })}
        className="h-8 text-xs"
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </NativeSelect>
    ) : (
      <Input
        aria-label="Value"
        type={literalKind === "number" ? "number" : "text"}
        value={view.literalText}
        disabled={disabled}
        onChange={(e) => update({ literalText: e.target.value })}
        className="h-8 max-md:text-xs md:text-xs"
      />
    );

  // The kind control only has a job when nothing declares the field: with a
  // declaration the value control is already the right one, and offering
  // "string / number / boolean" next to it would let the author contradict
  // the host.
  const showKind = hasLiteral && !field;

  if (layout === "compact") {
    return (
      <div className="flex w-full flex-col gap-1.5">
        {fieldField}
        {hasLiteral ? (
          <div className="flex gap-1.5">
            <div className="w-28 shrink-0">{opField}</div>
            <div className="min-w-0 flex-1">{valueField}</div>
          </div>
        ) : (
          <div className="w-28">{opField}</div>
        )}
        {showKind ? <div className="w-28">{kindField}</div> : null}
      </div>
    );
  }

  return (
    <>
      <StudioFieldRow label="Field">{fieldField}</StudioFieldRow>
      {hasLiteral ? (
        <div className="grid grid-cols-2 gap-2">
          <StudioFieldRow label="Op">{opField}</StudioFieldRow>
          <StudioFieldRow label="Value">{valueField}</StudioFieldRow>
        </div>
      ) : (
        <StudioFieldRow label="Op">{opField}</StudioFieldRow>
      )}
      {showKind ? <StudioFieldRow label="Type">{kindField}</StudioFieldRow> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Icon button                                                        */
/* ------------------------------------------------------------------ */

export type StudioIconButtonProps = React.ComponentProps<typeof Button> & {
  /** Becomes both the tooltip and the accessible name. */
  label: string;
};

/**
 * Square glyph button (↑ / ↓ / × / ⟳). The visible content is a bare glyph,
 * which would otherwise BE the accessible name — `label` restores a real one
 * for assistive tech and for `getByRole("button", { name })`.
 */
export function StudioIconButton({
  label,
  variant = "outline",
  size = "icon-xs",
  ...props
}: StudioIconButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      title={label}
      aria-label={label}
      {...props}
    />
  );
}
