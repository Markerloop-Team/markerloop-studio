// Which form does a node get? (SDL-293, refined by SDL-329 and SDL-295)
//
// Two consumers need the same answer and must not drift apart: the auto-form
// renders the fields, and the Properties section header shows how many groups
// they fall into. Resolution lives here so that "block wins over manifest"
// is stated once.

import type { BlockDefinition } from "@markerloop/engine";
import type { SaunaNodeConfig } from "@markerloop/engine";

import {
  descriptorsForType,
  groupDescriptors,
  withUnknownProps,
  type PropDescriptorGroup,
  type SaunaPropsManifest,
} from "./descriptors";
import { objectShape } from "./zod-introspect";
import type { ZodTypeAny } from "zod";

export type PropsFormSpec =
  /** The host registered a block: its zod schema is the form, rendered flat. */
  | { kind: "zod"; shape: Record<string, ZodTypeAny> }
  /** The kit's manifest describes this type: grouped descriptors. */
  | { kind: "descriptors"; groups: readonly PropDescriptorGroup[] }
  /** Nobody describes this type: the editable JSON textarea. */
  | { kind: "raw" };

export function resolvePropsForm(args: {
  node: Pick<SaunaNodeConfig, "type" | "props">;
  blocks: readonly BlockDefinition[];
  manifest?: SaunaPropsManifest;
}): PropsFormSpec {
  const block = args.blocks.find((b) => b.type === args.node.type);
  // Hand-written block first, on purpose: its type name may collide with a
  // kit component of a different shape (the local `Button` takes `label`,
  // the kit's takes `children`), and the registry resolves the name to the
  // local one. See auto-form.tsx for the full reasoning.
  //
  // A block DERIVED from the manifest (SDL-295) is the opposite case: its
  // zod schema is a projection of the very descriptors below, minus group,
  // order, caption and the unknown-prop badge. Rendering it would regress
  // every kit component to a flat form, so it does not claim the type.
  const derived = block?.meta?.propsForm === "manifest";
  const shape = !derived && block?.staticProps ? objectShape(block.staticProps) : null;
  // A block whose `staticProps` is not an object schema (or is empty of
  // shape) is still the host's word on this type — fall through to the raw
  // editor rather than letting the manifest describe a node the host claimed.
  if (!derived && block?.staticProps) return shape ? { kind: "zod", shape } : { kind: "raw" };

  const descriptors = descriptorsForType(args.manifest, args.node.type);
  if (!descriptors) return { kind: "raw" };

  const props = (args.node.props ?? {}) as Record<string, unknown>;
  return { kind: "descriptors", groups: groupDescriptors(withUnknownProps(descriptors, props)) };
}
