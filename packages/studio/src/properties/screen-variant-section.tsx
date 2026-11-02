"use client";

// The width-variant strip of the Properties form (SDL-632, slice S5), after
// the design-system canvas `/design-system/studio/properties` («Variants»):
// a Base / Tablet / Phone switch, one sentence saying what the chosen variant
// means, and the list of fields the variant overrides — each with the
// «Overridden» badge and a Reset that brings the field back to the base.
//
// Kept out of `auto-form.tsx` and `shell.tsx` on purpose: both are already
// long, and the form only needs two seams from here — the strip on top and
// the per-field mark.
//
// S6: the strip is also the body of the «Variants» section
// (`saunaBlockSections`), below Visibility, as the canvas orders them. It
// names HOW MANY fields the width overrides and never draws a Reset of its
// own: the «Overridden» + Reset pair lives next to the field it resets, once.
// The first cut listed every overridden key here with a second pair, under
// the prop's internal name (`children`) — two Resets for one field.

import { useStore } from "zustand";
import type { ReactNode } from "react";

import type { SaunaNodeConfig, SaunaNodeId } from "@markerloop/engine";
import { Badge, Button, Text, ToggleGroup } from "@markerloop/ui/ui";

import {
  STUDIO_SCREENS,
  screenOverriddenKeys,
  studioScreenLabel,
  type StudioScreen,
} from "../screen-variants";
import { resetOverrideOp, type StudioStore } from "../store";
import { studioEditTarget } from "../visibility-modes";

/**
 * Resets one overridden field for the edit target in force — the width being
 * edited, or the member branch of a hybrid node (S6). Deletes the key.
 */
export function resetOverrideField(store: StudioStore, nodeId: SaunaNodeId, key: string): void {
  const state = store.getState();
  const op = resetOverrideOp(studioEditTarget(state.schema, nodeId, state.view), nodeId, key);
  if (op) state.applyOp(op);
}

/** S5 name of {@link resetOverrideField}, kept for callers. */
export const resetScreenField = resetOverrideField;

export function ScreenVariantSection({
  store,
  node,
}: {
  store: StudioStore;
  node: SaunaNodeConfig;
}): ReactNode {
  const screen = useStore(store, (s) => s.view.screen);
  const overridden = screenOverriddenKeys(node, screen);
  const label = studioScreenLabel(screen);

  return (
    <div className="flex flex-col gap-2" data-sauna-screen-variants="" data-sauna-screen={screen}>
      <Text as="span" size="xs" variant="muted">
        Variant
      </Text>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={screen}
        // Radix clears the value on a second press of the pressed item; a
        // form always edits SOME variant, so the empty payload is ignored.
        onValueChange={(next: string) => {
          if (next) store.getState().setScreen(next as StudioScreen);
        }}
        aria-label="Variant"
        className="w-full"
      >
        {STUDIO_SCREENS.map((s) => (
          <ToggleGroup.Item
            key={s.id}
            value={s.id}
            className="flex-1"
            data-sauna-screen-option={s.id}
          >
            {s.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup>
      {screen === "base" ? (
        <Text size="sm" variant="muted">
          The base variant is the source of values. An edit here reaches every
          variant where the field is not overridden.
        </Text>
      ) : overridden.length === 0 ? (
        <Text size="sm" variant="muted" data-sauna-screen-note="">
          Nothing is overridden on {label}. An edit here overrides the field
          at this width only.
        </Text>
      ) : (
        <Text
          size="sm"
          variant="muted"
          data-sauna-screen-overrides=""
          data-count={overridden.length}
        >
          {overridden.length === 1 ? "1 field is" : `${overridden.length} fields are`} overridden
          on {label}. Each is marked «Overridden» in Properties, with the Reset
          that brings it back to the base.
        </Text>
      )}
    </div>
  );
}

/**
 * The per-field mark: the field holds its own value at this width. Reset
 * deletes the override — the field inherits the base again.
 */
export function ScreenOverrideMark({
  onReset,
  disabled,
}: {
  onReset: () => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <span className="inline-flex items-center gap-1" data-sauna-override-mark="">
      <Badge variant="outline">Overridden</Badge>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onReset}
        data-sauna-override-reset=""
      >
        Reset
      </Button>
    </span>
  );
}
