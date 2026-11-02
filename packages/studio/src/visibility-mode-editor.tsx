"use client";

// The «Visibility» section of a block (SDL-632, slice S6), after the
// design-system canvas `/design-system/studio/properties?case=visibility`:
// a Public / Hybrid / Private switch, the contract printed verbatim under it
// (`visibility: "hybrid"` — the author and the client-site developer read the
// same field), and what a guest and a signed-in visitor each get.
//
// The switch writes the mode STRING, never an object. Leaving hybrid drops
// every `member` branch in the subtree that no longer means anything — in the
// same op, so one Undo brings the mode and the signed-in values back together.
//
// A node that still carries the legacy CONDITION object is not offered a
// condition editor here: a condition is evaluated at render time and says
// nothing about who may receive the block, so it is not access control. The
// section says exactly that and offers «Replace with mode», which REMOVES the
// field — the block inherits the mode of the block around it.
//
// The switch shows the mode IN FORCE (own or inherited). Picking the mode the
// node would inherit anyway removes the field instead of pinning a copy, so
// «Public» on a node that was only made Private goes back to inheriting, and
// a node under a Hybrid block reads «Hybrid» — picking «Public» there is a
// visible decision to leave it, with the clear-values warning above the fold.
//
// The root is not offered the switch: pages-service accepts only a public
// (or absent) root and refuses the page with 422 `invalid_visibility`.

import { useStore } from "zustand";
import type { ReactNode } from "react";

import { saunaEffectiveVisibilityMode, type SaunaVisibilityMode } from "@markerloop/engine";
import { Button, Code, Text, ToggleGroup } from "@markerloop/ui/ui";

import type { StudioStore } from "./store";
import {
  STUDIO_VISIBILITY_MODES,
  hasLegacyVisibilityRule,
  memberBranchCount,
  privateRevealCount,
} from "./visibility-modes";

export type SaunaVisibilityModeEditorProps = {
  store: StudioStore;
  disabled?: boolean;
};

/**
 * Writes `mode` on `nodeId` (`null` removes the field) — the one door every
 * caller goes through.
 */
export function setNodeVisibilityMode(
  store: StudioStore,
  nodeId: string,
  mode: SaunaVisibilityMode | null
): void {
  store.getState().applyOp({ kind: "setVisibilityMode", nodeId, mode });
}

export function SaunaVisibilityModeEditor({
  store,
  disabled,
}: SaunaVisibilityModeEditorProps): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  const node = selectedId ? schema.nodes[selectedId] : undefined;
  if (!node || !selectedId) return null;

  if (hasLegacyVisibilityRule(node)) {
    return (
      <div className="flex flex-col gap-2" data-sauna-visibility-mode="" data-sauna-visibility-legacy="">
        <Text size="sm" data-sauna-visibility-legacy-note="">
          This block is shown by a condition, not access control. A condition
          is checked while the page draws, so it cannot keep the block out of
          what a guest receives.
        </Text>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setNodeVisibilityMode(store, selectedId, null)}
            data-sauna-visibility-replace=""
          >
            Replace with mode
          </Button>
        </div>
      </div>
    );
  }

  if (selectedId === schema.rootId) {
    return (
      <div className="flex flex-col gap-2" data-sauna-visibility-mode="public" data-sauna-visibility-root="">
        <Text size="sm" variant="muted">
          The page itself is always public. Set Hybrid or Private on a block
          inside it.
        </Text>
      </div>
    );
  }

  const mode = saunaEffectiveVisibilityMode(schema, selectedId);
  const current = STUDIO_VISIBILITY_MODES.find((m) => m.id === mode) ?? STUDIO_VISIBILITY_MODES[0]!;
  // The node declares nothing, but an enclosing block does: that mode is
  // what applies here, and the panel says where it comes from.
  const inherited = node.visibility === undefined && mode !== "public";
  // Only the branches leaving hybrid here would actually clear — an own or
  // an inherited hybrid alike.
  const branches = memberBranchCount(schema, selectedId);
  // Leaving Private here shows guests every block inside that is private
  // only through this one.
  const revealed = privateRevealCount(schema, selectedId);

  return (
    <div className="flex flex-col gap-2" data-sauna-visibility-mode={mode}>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={mode}
        // Radix hands back "" on a second press of the pressed item; a block
        // always has SOME mode, so that press is ignored.
        onValueChange={(next: string) => {
          if (next) setNodeVisibilityMode(store, selectedId, next as SaunaVisibilityMode);
        }}
        aria-label="Visibility mode"
        className="w-full"
        disabled={disabled}
      >
        {STUDIO_VISIBILITY_MODES.map((m) => (
          <ToggleGroup.Item
            key={m.id}
            value={m.id}
            className="flex-1"
            data-sauna-visibility-option={m.id}
          >
            {m.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup>
      <div className="flex flex-col gap-1">
        <Text as="span" size="xs" variant="muted">
          Block contract
        </Text>
        <Code className="self-start text-xs" data-sauna-visibility-contract="">
          {node.visibility === undefined ? "visibility: absent" : `visibility: "${mode}"`}
        </Code>
      </div>
      {inherited ? (
        <Text size="sm" variant="muted" data-sauna-visibility-inherited={mode}>
          Inherited: an enclosing block is {mode === "hybrid" ? "Hybrid" : "Private"},
          and that applies here too.
        </Text>
      ) : null}
      <div className="flex flex-col gap-1" data-sauna-visibility-audience="">
        <Text size="sm">
          <Text as="span" size="sm" weight="medium">
            Guest:{" "}
          </Text>
          {current.guest}
        </Text>
        <Text size="sm">
          <Text as="span" size="sm" weight="medium">
            Signed in:{" "}
          </Text>
          {current.member}
        </Text>
      </div>
      {revealed > 0 ? (
        <Text size="sm" variant="muted" data-sauna-visibility-reveal-note={revealed}>
          Leaving Private makes {revealed === 1 ? "1 block" : `${revealed} blocks`} inside
          visible to guests too. Set Private on a block to keep it closed.
        </Text>
      ) : null}
            {branches > 0 ? (
        <Text size="sm" variant="muted" data-sauna-visibility-member-note={branches}>
          Switching to another mode clears the signed-in values
          {branches === 1 ? "" : ` of ${branches} blocks`}. Undo brings them back.
        </Text>
      ) : null}
    </div>
  );
}
