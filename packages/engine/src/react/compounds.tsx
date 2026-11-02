// The React half of the compound Elements (SDL-633); definitions live in
// `../core/compounds`. No hooks, no browser APIs — the same on the server and
// in the canvas.
//
// Why through the REGISTRY and not a renderer branch like `Ref`: the registry
// is the one object every `SaunaRenderer` call already receives, so there is
// no second prop to forget. `findUnrenderableTypes`, the mark probes and SSR
// work unchanged.
//
// What a compound component does with the props the node stores:
//   - splits them into settings (the keys of its schema) and pass-through
//     (`data-sauna-node-id`, `className`, …) — the pass-through goes on the
//     ROOT of the expanded tree, so the canvas selects the compound as one
//     node and nothing inside it carries a mark (as with a `Ref`);
//   - parses the settings; invalid settings draw a frame the author can click
//     (`data-pages-compound-invalid`) and never throw;
//   - puts the node's own children into the tree's slots, and draws a visible
//     plate for the children that have none (`data-pages-compound-lost`);
//   - a part the parts registry cannot render is a visible plate too.

import * as React from "react";

import {
  SAUNA_COMPOUND_SLOT,
  SAUNA_COMPOUND_TEXT,
  type CompoundDefinition,
} from "../core/compounds";
import type { SaunaSchema } from "../schema/types";
import type { SaunaAnyComponent, SaunaRegistry } from "./types";

export const PAGES_COMPOUND_INVALID_ATTR = "data-pages-compound-invalid";
export const PAGES_COMPOUND_LOST_ATTR = "data-pages-compound-lost";

const FRAME: React.CSSProperties = { border: "1px dashed #d33", padding: "0.5rem", fontSize: 12, color: "#a00" };

type Slots = { all: React.ReactNode[] };

function draw(tree: SaunaSchema, id: string, parts: SaunaRegistry, slots: Slots, rootProps: Record<string, unknown>): React.ReactNode {
  const node = tree.nodes[id];
  if (!node) return null;
  if (node.type === SAUNA_COMPOUND_TEXT) return typeof node.props?.text === "string" ? node.props.text : null;
  if (node.type === SAUNA_COMPOUND_SLOT) {
    const index = node.props?.index;
    if (typeof index === "number") return slots.all[index] ?? null;
    return slots.all.length > 0 ? slots.all : null;
  }
  const kids = (node.children ?? []).map((c) => (
    <React.Fragment key={c}>{draw(tree, c, parts, slots, rootProps)}</React.Fragment>
  ));
  const Comp: SaunaAnyComponent | undefined = parts[node.type];
  if (!Comp) {
    return (
      <div key={id} data-sauna-unknown-type={node.type} style={FRAME}>
        Missing component: {node.type}
      </div>
    );
  }
  const props = id === tree.rootId ? { ...node.props, ...rootProps } : { ...node.props };
  return (
    <Comp key={id} {...props}>
      {kids.length > 0 ? kids : undefined}
    </Comp>
  );
}

function createCompoundComponent(def: CompoundDefinition, parts: SaunaRegistry): SaunaAnyComponent {
  const settingsKeys = new Set(Object.keys(def.schema.shape));
  function Compound(all: Record<string, unknown> & { children?: React.ReactNode }) {
    const { children, ...rest } = all;
    const settings: Record<string, unknown> = {};
    const pass: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) (settingsKeys.has(k) ? settings : pass)[k] = v;

    const parsed = def.schema.safeParse(settings);
    // NOT React.Children.toArray: it drops the `null` the renderer returns for
    // a node hidden from this viewer, and every later child would move up one
    // slot (a guest would see tab 1's content under tab 0). Position = slot.
    const own: React.ReactNode[] = Array.isArray(children) ? children : children == null ? [] : [children];
    if (!parsed.success) {
      return (
        <div {...pass} {...{ [PAGES_COMPOUND_INVALID_ATTR]: def.block.type }} style={FRAME}>
          {def.block.displayName ?? def.block.type}: settings need fixing — {parsed.error.issues[0]?.path.join(".") || "props"}
          {own}
        </div>
      );
    }
    const slotCount = def.slots(parsed.data);
    const fitted = Number.isFinite(slotCount) ? own.slice(0, slotCount) : own;
    // Only children that would have drawn something are "lost"; a hidden one is not.
    const lost = own.slice(fitted.length).filter((c) => c != null && c !== false).length;
    const tree = def.expand(parsed.data);
    const body = draw(tree, tree.rootId, parts, { all: fitted }, pass);
    if (lost <= 0) return body;
    return (
      <>
        {body}
        <div {...{ [PAGES_COMPOUND_LOST_ATTR]: lost }} style={FRAME}>
          {lost} block(s) inside {def.block.displayName ?? def.block.type} have no place and are not shown
        </div>
      </>
    );
  }
  Compound.displayName = def.block.type;
  return Compound;
}

/**
 * `type` → component for the compound Elements. `parts` renders the kit
 * types their trees are made of — pass the kit registry.
 */
export function createCompoundRegistry(
  elements: readonly CompoundDefinition[],
  parts: SaunaRegistry
): SaunaRegistry {
  const out: SaunaRegistry = {};
  for (const e of elements) out[e.block.type] = createCompoundComponent(e, parts);
  return out;
}
