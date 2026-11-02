// Kit catalog + props manifest → block definitions (SDL-295, EP-48 task L).
//
// Until this task the Studio knew exactly six block types: the hand-written
// `defineBlock` calls in `src/lib/blocks.ts`, matching the six local
// primitives in `src/lib/primitives.tsx`. Everything else the kit ships was
// invisible — not offered for insertion, and not renderable, because the
// registry did not contain it either (SDL-293's spec says so out loud: the
// seeded `Image` node drew nothing).
//
// The kit already publishes both halves of what a block definition needs:
//
//   - `createSaunaCatalog(UI).catalog` — type, group, title, `initialProps`,
//     `allowedParents`;
//   - `props-manifest.json` (SDL-290/291/292) — one descriptor per authorable
//     prop, with editor, group, caption, default and enum literals.
//
// So the definitions are derived, not written. `blocksFromCatalog` is that
// derivation, and `staticPropsFromDescriptors` is the descriptor → zod bridge
// the analysis asks for (`docs/tasks/EP-48-editor-and-components/02-props-from-package.md`
// §5): validation in the engine stays zod-shaped for every kit component
// instead of only for the six.
//
// Two things this bridge deliberately does NOT do:
//
//   - **It does not become the form.** The zod schema is a projection of the
//     descriptors and loses everything the panel gained in SDL-293/329 —
//     group, order, caption, unknown-prop badge. A block built here is marked
//     `meta.propsForm: "manifest"`, and `resolvePropsForm` keeps such a node
//     on the descriptor path. Without the marker the panel would silently
//     regress to a flat form for all 107 kit components.
//   - **It does not apply defaults.** `z.…default()` materializes a value on
//     parse, and decision 1 of the analysis is that a default never gets
//     written into the page — otherwise a kit upgrade stops reaching pages
//     that were authored earlier. Optional in, optional out.

import { defineBlock, type BlockDefinition } from "@markerloop/engine";
import type { SaunaComponentCatalog } from "@markerloop/engine/react/server";
import { z, type ZodTypeAny } from "zod";

import { descriptorsForType, type PropDescriptor, type SaunaPropsManifest } from "./descriptors";

/**
 * One descriptor as a zod field. Enums keep their literals (that is what
 * makes the schema worth anything for validation); everything else lands on
 * its primitive. A required descriptor stays required, the rest are optional
 * — an unset prop means "whatever the component does by default".
 */
function fieldFor(descriptor: PropDescriptor): ZodTypeAny {
  const base: ZodTypeAny =
    descriptor.type === "enum" && descriptor.enumValues && descriptor.enumValues.length > 0
      ? z.enum([...descriptor.enumValues] as [string, ...string[]])
      : descriptor.type === "number"
        ? z.number()
        : descriptor.type === "boolean"
          ? z.boolean()
          : z.string();
  return descriptor.required ? base : base.optional();
}

/**
 * The zod face of a component's descriptors.
 *
 * Unknown props (the ones a page carries and the manifest does not describe)
 * are not part of it — they are a panel concern, and a schema that accepted
 * them would validate nothing. The object is not `.strict()` for the same
 * reason: an author's older page must not fail validation because the kit
 * dropped a prop.
 */
export function staticPropsFromDescriptors(
  descriptors: readonly PropDescriptor[]
): ZodTypeAny {
  return z.object(
    Object.fromEntries(descriptors.map((d) => [d.name, fieldFor(d)]))
  );
}

/**
 * Block definitions for every INSERTABLE component in the kit's catalog.
 *
 * A catalog item the manifest describes gets a zod `staticProps` and the
 * `propsForm: "manifest"` marker. An item it does not describe gets a
 * definition without a schema — still insertable, still rendered, and its
 * props still land in the JSON textarea, exactly as an unknown type did
 * before. The alternative (skipping it) would hide a component the registry
 * can actually render.
 *
 * The one item that IS skipped is `insertable: false` (SDL-337): a provider
 * (`ThemeProvider`, `TooltipProvider`), a global mount point (`Toast`) or a
 * second name for a component already listed (`TableKit` is `Table`). Those
 * are not blocks of a page, and until the flag existed they sat in the Insert
 * modal next to `Button`. Skipping them here and not in the catalog is
 * deliberate: the catalog stays the full description of the kit — the
 * renderer registry keeps resolving those types, and a node of such a type
 * that a schema already carries still finds its entry.
 */
/**
 * What the Insert panel needs from the catalog that `BlockMeta` has no field
 * for (SDL-631): the adapter group's `order` and the item's search keywords.
 * `BlockMeta` is the engine's contract and stays closed; the hints ride next
 * to the definition object instead — `mergeBlockCatalogs` and
 * `defineElementSet` pass the same objects through.
 */
export type SaunaBlockInsertHints = {
  groupOrder?: number;
  keywords?: readonly string[];
};

const INSERT_HINTS = new WeakMap<BlockDefinition, SaunaBlockInsertHints>();

/** Hints recorded by `blocksFromCatalog`; absent for hand-written blocks. */
export function saunaBlockInsertHints(block: BlockDefinition): SaunaBlockInsertHints | undefined {
  return INSERT_HINTS.get(block);
}

export function blocksFromCatalog(args: {
  catalog: SaunaComponentCatalog;
  manifest?: SaunaPropsManifest;
}): BlockDefinition[] {
  const groupTitle = new Map(args.catalog.groups.map((g) => [g.id, g.title]));
  const groupOrder = new Map(args.catalog.groups.map((g) => [g.id, g.order]));

  return args.catalog.items
    .filter((item) => item.insertable !== false)
    .map((item) => {
      const descriptors = descriptorsForType(args.manifest, item.type);
      const meta = {
        category: groupTitle.get(item.groupId) ?? item.groupId,
        ...(item.description ? { description: item.description } : {}),
        // Both fields exist only to be drawn on the Insert card (SDL-339).
        // They are carried on the definition rather than looked up from the
        // catalog at render time because `BLOCKS` is what the modal is
        // handed — the shell has no catalog, and giving it one would mean
        // two sources for "what can be inserted".
        ...(item.previewSchema ? { previewSchema: item.previewSchema } : {}),
        ...(item.initialProps ? { initialProps: item.initialProps } : {}),
        ...(item.allowedParents ? { allowedParents: item.allowedParents } : {}),
        // A compound part (SDL-633): offered only under its allowedParents.
        ...(item.partOf ? { partOf: item.partOf } : {}),
        // The parent-side half of the nesting rule (SDL-352). Until this
        // line `BlockMeta.allowedChildren` existed, was documented, and was
        // never populated — which is why the modal and the drag could not
        // see it even in principle.
        ...(item.allowedChildren ? { allowedChildren: item.allowedChildren } : {}),
        ...(descriptors ? { propsForm: "manifest" as const } : {}),
      };
      const block = defineBlock({
        type: item.type,
        displayName: item.title ?? item.type,
        ...(descriptors ? { staticProps: staticPropsFromDescriptors(descriptors) } : {}),
        meta,
      });
      const order = groupOrder.get(item.groupId);
      INSERT_HINTS.set(block, {
        ...(typeof order === "number" ? { groupOrder: order } : {}),
        ...(item.keywords?.length ? { keywords: item.keywords } : {}),
      });
      return block;
    });
}

/**
 * Hand-written definitions win over derived ones, by type.
 *
 * The host's own primitives share names with kit components of a different
 * shape — the local `Button` takes `label`/`href`, the kit's takes
 * `children`/`size` — and the registry resolves those names to the local
 * component. A derived definition for such a type would describe a component
 * that is not the one on the canvas. Overrides also come first in the list,
 * so the Insert modal opens on the primitives.
 */
export function mergeBlockCatalogs(
  overrides: readonly BlockDefinition[],
  derived: readonly BlockDefinition[]
): readonly BlockDefinition[] {
  const taken = new Set(overrides.map((b) => b.type));
  return [...overrides, ...derived.filter((b) => !taken.has(b.type))];
}
