"use client";

// The node sections of a page editor's Properties column (SDL-632, S6), in the
// order the design-system canvas draws them: Properties (the shell's own,
// always first) → Visibility → Variants.
//
// A helper rather than a hard-wired part of the shell: sections are host data
// (SDL-285), and a host that does not want them — the component editor, a
// test — simply does not pass them. When the Variants section IS passed, the
// width switch lives there and the Properties form does not draw a second one
// (the shell reads `SAUNA_VARIANTS_SECTION_ID`).

import { useStore } from "zustand";
import type { ReactNode } from "react";

import { ScreenVariantSection } from "./properties/screen-variant-section";
import type { SaunaStudioSection } from "./shell";
import type { StudioStore } from "./store";
import { SaunaVisibilityModeEditor } from "./visibility-mode-editor";

export const SAUNA_VISIBILITY_SECTION_ID = "visibility";
export const SAUNA_VARIANTS_SECTION_ID = "variants";

function VariantsBody({ store }: { store: StudioStore }): ReactNode {
  const schema = useStore(store, (s) => s.schema);
  const selectedId = useStore(store, (s) => s.selection.nodeId);
  const node = selectedId ? schema.nodes[selectedId] : undefined;
  if (!node) return null;
  return <ScreenVariantSection store={store} node={node} />;
}

/** Visibility and Variants, for `SaunaStudio`'s `sections`. */
export function saunaBlockSections(opts: { disabled?: boolean } = {}): SaunaStudioSection[] {
  return [
    {
      id: SAUNA_VISIBILITY_SECTION_ID,
      title: "Visibility",
      editsDocument: true,
      render: (store) => <SaunaVisibilityModeEditor store={store} disabled={opts.disabled} />,
    },
    {
      id: SAUNA_VARIANTS_SECTION_ID,
      title: "Variants",
      editsDocument: true,
      render: (store) => <VariantsBody store={store} />,
    },
  ];
}
