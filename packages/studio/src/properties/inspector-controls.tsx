"use client";

// The inspector's control set (SDL-952, EP-189): the rows and controls every
// element panel (Text, Box, Image, Button, Icon) is built from. Style A, owner
// 30 Oct 2026: a row is a label on the left (84 px) and a control on the right,
// at least 44 px tall; sections carry an upper-case heading.
//
// One colour rule, owner 1 Nov 2026: the inspector is black and white. A value
// left at the engine's default is drawn GREY; a value the person set is a FILL
// of the brand BLUE #008ed0 with white text (pressed segment, list trigger) —
// not blue text with a blue border on white. A switch is blue when on and has
// no grey "default" look; a swatch keeps its own colour and only its ring turns
// blue. No other hue. The colours live in INSPECTOR_COLORS and nowhere else.
// Sample: docs/component-studio-assembled-2026-11-01/studio.html (--sel,
// .seg button.set, .fld.set, .tg, .sw.set).
//
// Values from the theme: scales grow, so a pick from a scale is a list
// (ScaleSelect), not a row of buttons. A value the theme lacks goes through
// "Add to theme": a popover asks a name and a value and hands both to the
// host through `onAddToTheme` — saving into the theme is the host's job
// (SDL-949/950), not this module's.
//
// Measurements are the prototype's
// (docs/component-studio-step2-box-2026-10-30/prototype.html): .row, .vh,
// .seg, .tg, .sw, .sel, .pop. Load-bearing sizes and both colours are inline
// styles, so they hold without the host's Tailwind sheet and are readable in a
// test.

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { FormControl, Switch, ToggleGroup, ToggleGroupItem, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from "@markerloop/ui/ui";

// ---------------------------------------------------------------- the rule

/**
 * The colours of the inspector: default (grey), set (brand blue) and the text
 * drawn on a set fill (white; 3.6:1 on #008ed0).
 */
export const INSPECTOR_COLORS = {
  default: "var(--muted-foreground, #71717a)",
  set: "#008ed0",
  onSet: "#ffffff",
} as const;

/**
 * Focus ring in the set colour, 1 px off the control so it stays visible around
 * a blue fill. A literal class (Tailwind compiles the admin's sheet from this
 * package's dist, so the class must be a plain string); it is
 * INSPECTOR_COLORS.set — keep the two in step. `outline-solid` is load-bearing:
 * the kit's `outline-none` sets the outline style to none, and without it the
 * ring has a width and no line.
 */
const FOCUS = "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#008ed0]";

/** Row geometry of style A. */
export const INSPECTOR_ROW_LABEL_WIDTH = 84;
export const INSPECTOR_ROW_MIN_HEIGHT = 44;

export type InspectorValueState = "default" | "set";

/**
 * "default" when the value is absent or equal to the default, "set" otherwise.
 * Numbers and strings compare by their text, so `"3"` and `3` are one value
 * (the prototype's rule: String(v) !== String(D[name])).
 */
export function inspectorValueState(value: unknown, defaultValue: unknown): InspectorValueState {
  if (value === undefined || value === null) return "default";
  if (defaultValue === undefined || defaultValue === null) return "set";
  return String(value) === String(defaultValue) ? "default" : "set";
}

/**
 * The colour of a value's mark in this state — a swatch ring, a picked list
 * row. A control that SHOWS the value (segment, list trigger) uses
 * inspectorFill instead.
 */
export function inspectorColor(state: InspectorValueState): string {
  return state === "set" ? INSPECTOR_COLORS.set : INSPECTOR_COLORS.default;
}

/**
 * Paint of a control that shows a value: set — a #008ed0 fill, white text and
 * a border of the fill (the sample's .seg button.set / .fld.set); default —
 * nothing, the control keeps its grey look.
 */
export function inspectorFill(state: InspectorValueState): CSSProperties {
  return state === "set"
    ? { backgroundColor: INSPECTOR_COLORS.set, color: INSPECTOR_COLORS.onSet, borderColor: INSPECTOR_COLORS.set, boxShadow: "none" }
    : {};
}

/** The attribute every control carries, for tests and for the e2e harness. */
export const INSPECTOR_STATE_ATTR = "data-inspector-state";

const stateAttr = (state: InspectorValueState) => ({ [INSPECTOR_STATE_ATTR]: state });

// ---------------------------------------------------------- section and row

export type InspectorSectionProps = {
  title: string;
  /** Optional ⓘ or action drawn at the right of the heading. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A titled group of rows; consecutive sections are divided by a rule. */
export function InspectorSection({ title, aside, children, className }: InspectorSectionProps) {
  return (
    <section
      data-inspector-section=""
      className={cn("flex flex-col border-border [&+&]:border-t [&+&]:pt-3.5", className)}
      style={{ padding: "6px 20px 16px", gap: 2 }}
    >
      {title || aside ? (
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 6 }}>
        <h3
          data-inspector-section-title=""
          style={{
            margin: 0,
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: INSPECTOR_COLORS.default,
          }}
        >
          {title}
        </h3>
        {aside}
      </div>
      ) : null}
      {children}
    </section>
  );
}

export type InspectorRowProps = {
  label: string;
  /** id of the control the label names. */
  htmlFor?: string;
  /** ⓘ drawn after the label. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Style A row: the label 84 px on the left, the control on the right, ≥ 44 px tall. */
export function InspectorRow({ label, htmlFor, hint, children, className }: InspectorRowProps) {
  return (
    <div
      data-inspector-row=""
      className={cn("text-foreground", className)}
      style={{
        display: "grid",
        gridTemplateColumns: `${INSPECTOR_ROW_LABEL_WIDTH}px minmax(0, 1fr)`,
        alignItems: "center",
        gap: 12,
        minHeight: INSPECTOR_ROW_MIN_HEIGHT,
        fontSize: 13.5,
      }}
    >
      <span className="flex min-w-0 items-center gap-1">
        <label htmlFor={htmlFor} className="truncate" style={{ color: INSPECTOR_COLORS.default }}>
          {label}
        </label>
        {hint}
      </span>
      <div className="flex min-w-0 items-center">{children}</div>
    </div>
  );
}

// --------------------------------------------------------------- segmented

export type InspectorSegmentOption<V extends string> = {
  value: V;
  /** Text of the segment; with `icon` it becomes the accessible name only. */
  label: string;
  icon?: ReactNode;
};

export type InspectorSegmentedProps<V extends string> = {
  label: string;
  options: readonly InspectorSegmentOption<V>[];
  value?: V;
  defaultValue: V;
  onChange: (value: V) => void;
  id?: string;
};

/** Segments with text or icons; the pressed one is white with grey text at the default, a blue fill when set. */
export function InspectorSegmented<V extends string>({ label, options, value, defaultValue, onChange, id }: InspectorSegmentedProps<V>) {
  const current = value ?? defaultValue;
  const state = inspectorValueState(value, defaultValue);
  return (
    <ToggleGroup
      id={id}
      type="single"
      aria-label={label}
      value={current}
      onValueChange={(next: string) => {
        // Radix answers "" when the pressed segment is clicked again: a
        // segmented control always has one value, so that click is ignored.
        const hit = options.find((o) => o.value === next);
        if (hit) onChange(hit.value);
      }}
      spacing={0}
      {...stateAttr(state)}
      className="w-full bg-muted"
      style={{ display: "flex", gap: 2, padding: 3, borderRadius: 8 }}
      // The track: the prototype's --hv.
      data-inspector-control="segmented"
    >
      {options.map((o) => {
        const pressed = o.value === current;
        const style: CSSProperties = {
          flex: 1,
          height: 30,
          minWidth: 0,
          borderRadius: 6,
          fontSize: 13,
          color: INSPECTOR_COLORS.default,
          fontWeight: pressed ? 500 : 400,
          ...(pressed ? inspectorFill(state) : {}),
        };
        return (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            aria-label={o.icon ? o.label : undefined}
            title={o.icon ? o.label : undefined}
            {...stateAttr(pressed ? state : "default")}
            className={cn(
              "rounded-[6px] px-1 hover:bg-transparent data-[state=on]:bg-background data-[state=on]:shadow-[0_1px_2px_rgba(0,0,0,0.12)]",
              `${FOCUS} focus-visible:ring-0`,
            )}
            style={style}
          >
            {o.icon ?? o.label}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

// ------------------------------------------------------------------ toggle

export type InspectorToggleProps = {
  label: string;
  value?: boolean;
  defaultValue: boolean;
  onChange: (value: boolean) => void;
  id?: string;
};

/**
 * A switch: on — blue track, off — the border-grey track (the sample's .tg).
 * There is no grey "default" look: the switch shows on/off, not set/default;
 * the state still rides on data-inspector-state.
 */
export function InspectorToggle({ label, value, defaultValue, onChange, id }: InspectorToggleProps) {
  const checked = value ?? defaultValue;
  const state = inspectorValueState(value, defaultValue);
  const style: CSSProperties = { backgroundColor: checked ? INSPECTOR_COLORS.set : "var(--border, #e5e7eb)" };
  return (
    <Switch
      id={id}
      aria-label={label}
      checked={checked}
      onCheckedChange={(next: boolean) => onChange(next)}
      {...stateAttr(state)}
      data-inspector-control="toggle"
      className={`${FOCUS} focus-visible:ring-0`}
      style={style}
    />
  );
}

// ------------------------------------------------------------ add to theme

/** What "Add to theme" hands to the host: the new step's name and value. */
export type InspectorThemeEntry<V extends string | number = string | number> = { name: string; value: V };

type AddToThemeFormProps<V extends string | number> = {
  title: string;
  note: string;
  kind: "color" | "number";
  initialName: string;
  initialValue: V;
  unit?: string;
  onSubmit: (entry: InspectorThemeEntry<V>) => void;
};

function AddToThemeForm<V extends string | number>({ title, note, kind, initialName, initialValue, unit, onSubmit }: AddToThemeFormProps<V>) {
  const nameId = useId();
  const valueId = useId();
  const [name, setName] = useState(initialName);
  const [raw, setRaw] = useState(String(initialValue));
  const trimmed = name.trim();
  const value = (kind === "number" ? Number(raw) : raw) as V;
  const valid = trimmed !== "" && (kind === "number" ? raw.trim() !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0 : /^#[0-9a-fA-F]{6}$/.test(raw));
  const field = "h-8 w-full rounded-[7px] border border-border bg-background px-2.5 text-[13px] text-foreground outline-none focus-visible:border-foreground";
  return (
    <form
      data-inspector-add-form=""
      className="flex flex-col gap-2.5 text-[13px]"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ name: trimmed, value });
      }}
    >
      <h4 className="m-0 text-[13.5px] font-semibold text-foreground">{title}</h4>
      <div className="grid gap-2" style={{ gridTemplateColumns: kind === "color" ? "32px 1fr" : "1fr 76px" }}>
        {kind === "color" ? (
          <>
            <input
              id={valueId}
              type="color"
              aria-label="Colour"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className="h-8 w-8 rounded-[7px] border border-border bg-background p-0.5"
              data-inspector-add-value=""
            />
            <input id={nameId} aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} data-inspector-add-name="" />
          </>
        ) : (
          <>
            <input id={nameId} aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} data-inspector-add-name="" />
            <input
              id={valueId}
              type="number"
              min={0}
              aria-label={unit ? `Value, ${unit}` : "Value"}
              placeholder={unit}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              className={cn(field, "text-center")}
              data-inspector-add-value=""
            />
          </>
        )}
      </div>
      <p className="m-0 text-xs" style={{ color: INSPECTOR_COLORS.default }}>
        {note}
      </p>
      <button
        type="submit"
        disabled={!valid}
        className="h-8 rounded-[7px] bg-foreground text-[13px] font-medium text-background disabled:opacity-50"
        data-inspector-add-submit=""
      >
        Add to theme
      </button>
    </form>
  );
}

const POPOVER_CLASS =
  "z-50 rounded-[10px] bg-popover text-popover-foreground shadow-[0_12px_32px_rgba(0,0,0,0.16),0_0_0_1px_var(--border)] outline-none";

// ---------------------------------------------------------- theme colours

export type InspectorThemeColor = {
  /** Stored value (the theme role's id). */
  id: string;
  name: string;
  /** Any CSS colour to paint the swatch with. */
  color: string;
};

export type InspectorThemeColorRowProps = {
  label: string;
  colors: readonly InspectorThemeColor[];
  value?: string;
  defaultValue?: string;
  onChange: (id: string) => void;
  /** Without it there is no "+" (nothing to add to). */
  onAddToTheme?: (entry: InspectorThemeEntry<string>) => void;
};

/** Theme colours as swatches, the pick ringed (grey at the default, blue when set), "+" last. */
export function InspectorThemeColorRow({ label, colors, value, defaultValue, onChange, onAddToTheme }: InspectorThemeColorRowProps) {
  const current = value ?? defaultValue;
  const state = inspectorValueState(value, defaultValue);
  const [open, setOpen] = useState(false);
  const swatch: CSSProperties = { width: 26, height: 26, borderRadius: 7, padding: 0 };
  return (
    <div role="group" aria-label={label} className="flex flex-wrap" style={{ gap: 8 }} data-inspector-control="theme-colors" {...stateAttr(state)}>
      {colors.map((c) => {
        const pressed = c.id === current;
        return (
          <button
            key={c.id}
            type="button"
            title={c.name}
            aria-label={c.name}
            aria-pressed={pressed}
            onClick={() => onChange(c.id)}
            {...stateAttr(pressed ? state : "default")}
            className={`relative cursor-pointer border border-border ${FOCUS}`}
            style={{
              ...swatch,
              background: c.color,
              boxShadow: pressed ? `0 0 0 2px var(--background, #fff), 0 0 0 3.5px ${inspectorColor(state)}` : undefined,
            }}
          />
        );
      })}
      {onAddToTheme && (
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
          <PopoverPrimitive.Trigger asChild>
            <button
              type="button"
              title="Add to theme"
              aria-label="Add to theme"
              data-inspector-add=""
              className="flex cursor-pointer items-center justify-center border border-dashed border-border bg-background text-[15px] leading-none"
              style={{ ...swatch, color: INSPECTOR_COLORS.default }}
            >
              +
            </button>
          </PopoverPrimitive.Trigger>
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content align="start" sideOffset={6} className={POPOVER_CLASS} style={{ width: 250, padding: 14 }} data-inspector-popover="add">
              <AddToThemeForm<string>
                title="New theme colour"
                note="Every element can use it. Change it in the theme and it changes everywhere."
                kind="color"
                initialName="Accent"
                initialValue="#d97706"
                onSubmit={(entry) => {
                  onAddToTheme(entry);
                  setOpen(false);
                }}
              />
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
      )}
    </div>
  );
}

// ------------------------------------------------------------ scale select

export type InspectorScaleStep = {
  /** Stored value (the step's name in the theme: "M", "h2"). */
  id: string;
  /** Shown name; `id` when absent. */
  name?: string;
  /** Size of the step in `unit`. */
  size: number;
  /** Font weight for a text step. */
  weight?: number;
};

/** How a step shows its size: a bar of its width (spacing) or text of its size (type). */
export type InspectorScaleKind = "space" | "text";

export type InspectorScaleSelectProps = {
  label: string;
  kind: InspectorScaleKind;
  steps: readonly InspectorScaleStep[];
  value?: string;
  defaultValue?: string;
  onChange: (id: string) => void;
  unit?: string;
  /** Footer note in the list ("Sizes come from the theme"). */
  note?: string;
  /** Without it the list has no "Add to theme". */
  onAddToTheme?: (entry: InspectorThemeEntry<number>) => void;
  id?: string;
};

/** Bar width of a spacing step, as the prototype draws it: max(2, px × 1.9). */
export function inspectorScaleBarWidth(size: number): number {
  return Math.max(2, size * 1.9);
}

/**
 * Font size a text step is drawn at in the list: its own up to 24 px; above
 * that the excess is compressed to a quarter (48 → 30, 36 → 27, 30 → 25.5), so
 * the list stays compact yet every step keeps a distinct, ordered size.
 */
export function inspectorScaleTextSize(size: number): number {
  return size <= 24 ? size : 24 + (size - 24) * 0.25;
}

function suggestStepName(steps: readonly InspectorScaleStep[], size: number): string {
  const below = [...steps].reverse().find((s) => s.size < size);
  return below ? `${below.name ?? below.id}+` : "XXS";
}

/** A list of the theme's scale where every step is shown at its own size. */
export function InspectorScaleSelect({ label, kind, steps, value, defaultValue, onChange, unit = "px", note, onAddToTheme, id }: InspectorScaleSelectProps) {
  const current = value ?? defaultValue;
  const state = inspectorValueState(value, defaultValue);
  const color = inspectorColor(state);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // The trigger: the sample's .fld — grey text on the panel at the default, a blue fill when set.
  const picked = steps.find((s) => s.id === current);
  const largest = steps.reduce((m, s) => Math.max(m, s.size), 0);
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAdding(false);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          aria-label={label}
          aria-haspopup="listbox"
          {...stateAttr(state)}
          data-inspector-control="scale-select"
          className={`flex w-full cursor-pointer items-center justify-between gap-2 bg-background text-left ${FOCUS}`}
          style={{
            height: 34,
            borderRadius: 8,
            // Longhands only: inspectorFill sets borderColor, and a `border`
            // shorthand next to it lets React drop the colour on set → default.
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: "var(--border, #e5e7eb)",
            padding: "0 10px",
            fontSize: 13.5,
            color: INSPECTOR_COLORS.default,
            ...inspectorFill(state),
          }}
        >
          <span className="truncate">{picked ? (picked.name ?? picked.id) : (current ?? "—")}</span>
          <span className="flex items-center gap-1.5">
            {picked && (
              <small style={{ fontSize: 12, opacity: 0.8 }}>
                {picked.size}
              </small>
            )}
            <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className={POPOVER_CLASS}
          style={{ width: adding ? 250 : 236, padding: adding ? 14 : 4 }}
          data-inspector-popover="scale"
        >
          {adding && onAddToTheme ? (
            <AddToThemeForm<number>
              title={kind === "text" ? "New text size" : "New spacing step"}
              note={kind === "text" ? "The size joins the theme's type scale." : "The step joins the theme scale and shows up in every spacing list."}
              kind="number"
              unit={unit}
              initialName={suggestStepName(steps, largest + 1)}
              initialValue={largest + (kind === "text" ? 4 : 8)}
              onSubmit={(entry) => {
                onAddToTheme(entry);
                setOpen(false);
                setAdding(false);
              }}
            />
          ) : (
            <>
              <div role="listbox" aria-label={label} className="flex flex-col">
                {steps.map((s) => {
                  const on = s.id === current;
                  const name = s.name ?? s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-scale-step={s.id}
                      data-scale-size={s.size}
                      onClick={() => {
                        onChange(s.id);
                        setOpen(false);
                      }}
                      className={cn("w-full cursor-pointer rounded-[6px] border-0 bg-transparent text-left text-foreground hover:bg-muted", on && "bg-muted")}
                      style={
                        kind === "space"
                          ? { display: "grid", gridTemplateColumns: "36px 1fr 28px", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13 }
                          : { display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "7px 10px" }
                      }
                    >
                      {kind === "space" ? (
                        <>
                          <b style={{ fontWeight: 500, color: on ? color : undefined }}>{name}</b>
                          <span>
                            <i
                              data-scale-preview="bar"
                              style={{ display: "block", height: 9, width: inspectorScaleBarWidth(s.size), maxWidth: "100%", borderRadius: 2, background: INSPECTOR_COLORS.default, opacity: 0.5 }}
                            />
                          </span>
                        </>
                      ) : (
                        <span
                          data-scale-preview="text"
                          style={{ fontSize: inspectorScaleTextSize(s.size), fontWeight: s.weight ?? 400, lineHeight: 1.1, color: on ? color : undefined }}
                        >
                          {name}
                        </span>
                      )}
                      <small style={{ color: INSPECTOR_COLORS.default, fontSize: 11.5, textAlign: "right" }}>{s.size}</small>
                    </button>
                  );
                })}
              </div>
              {(note || onAddToTheme) && (
                <div className="mt-1 flex items-center justify-between gap-2 border-t border-border" style={{ padding: "6px 10px 4px", fontSize: 11.5, color: INSPECTOR_COLORS.default }}>
                  <span>{note}</span>
                  {onAddToTheme && (
                    <button
                      type="button"
                      data-inspector-add=""
                      onClick={() => setAdding(true)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-xs font-medium"
                      style={{ color: INSPECTOR_COLORS.set }}
                    >
                      + Add to theme
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// ------------------------------------------------------------------ select

export type InspectorSelectOption = { value: string; label: string };

export type InspectorSelectProps = {
  label: string;
  options: readonly InspectorSelectOption[];
  value?: string;
  defaultValue?: string;
  onChange: (value: string) => void;
  id?: string;
};

/** A plain list (the kit's Select); the trigger is grey at the default, a blue fill when set. */
export function InspectorSelect({ label, options, value, defaultValue, onChange, id }: InspectorSelectProps) {
  const current = value ?? defaultValue;
  const state = inspectorValueState(value, defaultValue);
  return (
    <FormControl.Select.Root value={current} onValueChange={(next: string) => onChange(next)}>
      <FormControl.Select.Trigger
        id={id}
        aria-label={label}
        {...stateAttr(state)}
        data-inspector-control="select"
        className={`w-full bg-background shadow-none [&_svg]:text-current! [&_svg]:opacity-100 ${FOCUS} focus-visible:ring-0`}
        style={{
          height: 34,
          borderRadius: 8,
          fontSize: 13.5,
          color: INSPECTOR_COLORS.default,
          ...inspectorFill(state),
        }}
      >
        <FormControl.Select.Value />
      </FormControl.Select.Trigger>
      <FormControl.Select.Content>
        {options.map((o) => (
          <FormControl.Select.Item key={o.value} value={o.value}>
            {o.label}
          </FormControl.Select.Item>
        ))}
      </FormControl.Select.Content>
    </FormControl.Select.Root>
  );
}

// --------------------------------------------------------------- info hint

export type InspectorInfoHintProps = {
  /** What the ⓘ explains; also its accessible description. */
  children: ReactNode;
  /** Accessible name of the ⓘ button. */
  label?: string;
};

/** ⓘ with a tooltip. Grey always: it is not a value. */
export function InspectorInfoHint({ children, label = "More info" }: InspectorInfoHintProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            data-inspector-info=""
            className={`inline-flex shrink-0 cursor-help items-center justify-center rounded-full border-0 bg-transparent p-0 ${FOCUS}`}
            style={{ color: INSPECTOR_COLORS.default, width: 16, height: 16 }}
          >
            <svg viewBox="0 0 24 24" width={14} height={14} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
