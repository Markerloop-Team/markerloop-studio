// Block definition factory.
//
// A "block" in Sunday-Sauna is a renderable unit that the Studio places
// in the schema tree. A block declares two prop surfaces:
//
//   - staticProps   — values authored in the Studio (text, colour, link, …)
//   - upcomingProps — values supplied by the page at render time, derived
//                     from a collection binding (e.g. `record.title`).
//
// Each surface is described by a Zod schema. The renderer uses the Zod
// schemas to (1) produce a properties auto-form in the Studio (Phase 1A,
// `./studio`), (2) validate inbound props before render, and (3) compute
// the page's data dependencies for the page-level resolver (Phase 3,
// `./data`).
//
// This file is server-safe (no React, no DOM). It is loaded by both the
// Studio in the browser and by the Next.js renderer on the server.

import type { ZodTypeAny, z } from "zod";

import type { SaunaSchema } from "../schema/types";
import { checkElementMigrations, type ElementMigration } from "./element-migrations";

/**
 * A block definition. Generic parameters are inferred from the Zod
 * schemas — consumers do not pass them explicitly.
 */
export type BlockDefinition<
  TStatic extends ZodTypeAny = ZodTypeAny,
  TUpcoming extends ZodTypeAny = ZodTypeAny,
  TType extends string = string,
> = {
  /**
   * Stable identifier — what `SaunaNodeConfig.type` references. Kept literal
   * by `defineBlock` (SDL-629), so `defineElementSet` can refuse a block
   * whose type has no registry pair at compile time.
   */
  type: TType;
  /** Display name used by the Studio's library + outline. */
  displayName?: string;
  /**
   * Version of this Element's props contract (EP-128, SDL-639): the number a
   * node of this type stores in `SaunaNodeConfig.propsVersion`. Absent
   * means 1 — the four primitives never declared one and are at 1. Bump it
   * when `staticProps` changes in a way an existing node's `props` would no
   * longer satisfy; a look-only change of the component is not a bump.
   * `blockPropsVersion` is the one reader.
   */
  propsVersion?: number;
  /**
   * Declarative props migrations (SDL-670): exactly `propsVersion - 1` of
   * them, `migrations[k-1]` turns vk props into v(k+1). `defineBlock` and
   * the catalog generator refuse any other count, so a bump without a
   * migration cannot ship. Steps and their rules: `./element-migrations`.
   */
  migrations?: readonly ElementMigration[];
  /** Schema for props authored in the Studio. */
  staticProps?: TStatic;
  /** Schema for props supplied by the page at render time. */
  upcomingProps?: TUpcoming;
  /** Catalog hints for the Studio (allowed parents/children, icon, etc). */
  meta?: BlockMeta;
};

/**
 * Catalog metadata. Extend cautiously — every field has to be honoured
 * by the Studio or the renderer.
 */
export type BlockMeta = {
  icon?: string;
  category?: string;
  /**
   * One sentence describing what the block is for. The Insert modal prints
   * it under the block's name (SDL-339, board `FinalInsertModal`), which is
   * the only place it is read — the kit fills it for its whole surface
   * (`saunaCatalogMeta`, 79 of 79 since SDL-337).
   */
  description?: string;
  /**
   * A schema that draws this block AS A CARD PREVIEW (SDL-339).
   *
   * Not the same thing as "a node of this type": a part of a compound
   * (`CardHeader`, `SheetTitle`, `AvatarFallback`) mounted on its own does
   * not render an empty box — it THROWS, because Radix asserts its context.
   * So the kit ships a path from the root down (`["Card","CardHeader",
   * "$self"]`) and the catalog turns it into this schema; a block that needs
   * no parent gets `["$self"]`. Absent → the caller falls back to a
   * single node of the type, which is what a hand-written block gets.
   */
  previewSchema?: SaunaSchema;
  /**
   * If set, a node of this type may only go under a parent whose `type` is
   * in this list. Enforced when the node goes in — insert, replace, move,
   * duplicate — by the Studio store (`canParent`), never at render time:
   * the renderer draws whatever tree it is given (SDL-634).
   */
  allowedParents?: string[];
  /**
   * The compound this block is a part of (SDL-633), e.g. `TabsTrigger` →
   * `Tabs`. The Insert modal lists a part ONLY where `allowedParents` lets it
   * go — never at a page root, in a Section, or behind "show hidden": Radix
   * throws for a part outside its root.
   */
  partOf?: string;
  /**
   * `false`: never offered in the Insert modal, but kept in the block list so
   * nodes of this type already stored keep their nesting rule and their form
   * (SDL-633: the kit roots a compound Element replaces). Absent = offered.
   */
  insertable?: boolean;
  /**
   * If set, only nodes whose `type` is in this list may go under a node of
   * this type. Enforced at the same points as `allowedParents`.
   */
  allowedChildren?: string[];
  /**
   * Initial props applied when a fresh node of this type is created.
   * Component-specific defaults belong here, not in `schema-ops`.
   */
  initialProps?: Record<string, unknown>;
  /**
   * Where the properties panel takes this block's form from (SDL-295).
   *
   * `"manifest"` marks a definition derived from a props manifest: its
   * `staticProps` is a projection of the same descriptors the panel can read
   * directly, and the descriptors carry group, order, caption and default,
   * which a zod schema has nowhere to put. The panel therefore keeps such a
   * block on the descriptor path and uses `staticProps` only as the
   * validation face of the type.
   *
   * Absent — the block's own zod schema IS the form, as it was before.
   */
  propsForm?: "manifest";
};

/**
 * Inferred TS types for a block's two prop surfaces. Useful in render
 * functions that want strict typing without re-declaring shapes.
 *
 * @example
 *   const def = defineBlock({ type: "Detail", staticProps: z.object({ heading: z.string() }) });
 *   type Static = StaticPropsOf<typeof def>; // { heading: string }
 */
export type StaticPropsOf<D> = D extends BlockDefinition<infer S, ZodTypeAny>
  ? S extends ZodTypeAny
    ? z.infer<S>
    : never
  : never;

export type UpcomingPropsOf<D> = D extends BlockDefinition<ZodTypeAny, infer U>
  ? U extends ZodTypeAny
    ? z.infer<U>
    : never
  : never;

/**
 * Identity factory. The work it does today is type-narrowing — every
 * inference flows through this single call site, so tooling that walks
 * a block registry can rely on the canonical shape. One runtime check
 * (SDL-670): the definition carries exactly `propsVersion - 1` well-formed
 * migrations, else `ElementMigrationError` is thrown at definition time.
 */
export function defineBlock<
  TStatic extends ZodTypeAny,
  TUpcoming extends ZodTypeAny,
  const TType extends string = string,
>(def: BlockDefinition<TStatic, TUpcoming, TType>): BlockDefinition<TStatic, TUpcoming, TType> {
  checkElementMigrations(def);
  return def;
}
