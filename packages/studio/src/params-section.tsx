"use client";

// The «Parameters» section of the component editor (SDL-503, EP-61).
//
// The manifest read back as a list, so an author can see what the component
// hands outwards without selecting every node in the outline and reading its
// fields one at a time. That is the whole reason the epic asked for a
// section: a parameter is invisible from anywhere except the field it was
// named on, and a component with four of them was four clicks away from
// being understood.
//
// DOCUMENT-level, unlike Visibility and Variants beside it: it applies with
// nothing selected, because a manifest belongs to the block and not to a
// node. Selecting a row selects the node the parameter points at — the
// shortest route from «what does this expose» back to «where does it live».

import { useStore } from "zustand";
import type { ReactNode } from "react";

import { saunaNodeDisplayName, type SaunaParamSpec } from "@markerloop/engine";
import { Button, Text } from "@markerloop/ui/ui";

import { removeParam } from "./properties/params";
import type { StudioStore } from "./store";

export type SaunaParamsSectionProps = {
  store: StudioStore;
  /** Commits a new manifest. `null` clears it. */
  onParamsChange: (params: SaunaParamSpec[] | null) => void;
};

export function SaunaParamsSection({
  store,
  onParamsChange,
}: SaunaParamsSectionProps): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const params = schema.params ?? [];

  if (params.length === 0) {
    return (
      <Text size="xs" variant="muted" data-sauna-params-empty="">
        No parameters yet. Select a node, then use «Make a parameter» under the
        field you want pages to be able to set.
      </Text>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-sauna-params-list="">
      {params.map((param) => {
        const node = schema.nodes[param.nodeId];
        // An orphan — the node it pointed at is gone. Shown, never hidden:
        // hard rule 7 is about a value that disappears without a word, and
        // a manifest row nobody can see is the same failure one level up.
        // `refParamOrphans()` (SDL-501) reports it on the page side; this is
        // the block side of the same fact.
        const where = node
          ? `${saunaNodeDisplayName(node)} · ${param.prop}`
          : `missing node ${param.nodeId} · ${param.prop}`;
        return (
          <li
            key={param.name}
            className="flex items-start justify-between gap-2"
            data-sauna-param-row={param.name}
          >
            <button
              type="button"
              className="flex min-w-0 flex-col items-start text-left"
              data-sauna-param-select={param.name}
              onClick={() => store.getState().selectNode(param.nodeId)}
            >
              <Text as="span" size="xs" className="font-medium">
                {param.name}
              </Text>
              <Text
                as="span"
                size="xs"
                variant={node ? "muted" : "destructive"}
                className="truncate"
              >
                {where}
              </Text>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-auto px-1 py-0 text-xs font-normal"
              data-sauna-param-row-remove={param.name}
              onClick={() => {
                const next = removeParam(params, param.name);
                onParamsChange(next.length > 0 ? next : null);
              }}
            >
              Remove
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
