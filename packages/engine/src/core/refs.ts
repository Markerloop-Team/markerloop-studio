// Project-block references (SDL-338).
//
// A page puts a project block on itself as a REFERENCE, not a copy:
// one node `{ type: "Ref", props: { blockId } }`. Editing the block in
// /studio/components reaches every page that references it, with no
// edit to the page. The owner picked this over detach-on-insert
// deliberately (21 Aug 2026): a copy is a template, and the price of
// the template is paid later, when half the site is out of sync.
//
// `SaunaNodeConfig` does not change — `node.type` stays a plain string
// (hard rule 3), so nothing about the schema, the validator or the
// storage format is special-cased for refs. Everything below is
// resolution ON TOP of an ordinary node.
//
// Pure and server-safe: no React, no DOM. The renderer consumes
// `SaunaBlockMap`; loading it is the caller's job (server routes await
// it before render, the Studio canvas fetches it into state), because
// the renderer itself is synchronous.

import type { SaunaNodeConfig, SaunaParamSpec, SaunaSchema } from "../schema/types";

/**
 * `node.type` of a reference node. A plain string like every other
 * type — it is NOT registered in the component registry, and the
 * renderer intercepts it before the registry lookup.
 */
export const SAUNA_REF_TYPE = "Ref";

/** Prop carrying the id of the referenced project block. */
export const SAUNA_REF_BLOCK_ID_PROP = "blockId";

/**
 * Prop carrying the page's values for the block's parameters (EP-61):
 * `{ [paramName]: value }`, addressed by NAME, never by node path.
 *
 * An ordinary prop on an ordinary node — the validator does not know it
 * exists and the storage format does not either, which is the same
 * arrangement `blockId` has had since SDL-338 and what keeps hard rule 3
 * true ("`node.type` is a plain string, nothing is special-cased for
 * refs"). Everything about params is resolution ON TOP of a node.
 */
export const SAUNA_REF_PARAMS_PROP = "params";

/**
 * Resolved block schemas, keyed by block id. What the renderer needs
 * to draw a `Ref`: absent key = the block could not be loaded, which
 * the renderer surfaces as a visible placeholder rather than nothing.
 */
export type SaunaBlockMap = Readonly<Record<string, SaunaSchema>>;

/**
 * Reads a block schema by id. `null` means "no such block" — a
 * deleted or mistyped id, which is a normal state, not a failure.
 * Transport errors should still throw.
 */
export type LoadBlockSchema = (blockId: string) => Promise<SaunaSchema | null>;

function blockIdFromProps(props: Record<string, unknown> | undefined): string | null {
  const raw = props?.[SAUNA_REF_BLOCK_ID_PROP];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when this node is a project-block reference. */
export function isRefNode(node: SaunaNodeConfig | undefined): boolean {
  return node?.type === SAUNA_REF_TYPE;
}

/**
 * The block id a ref node points at, or `null` when the node is not a
 * ref or carries no usable `blockId`.
 *
 * Reads the node's own props only. Variant-supplied ids are collected
 * by {@link collectRefBlockIds}, which has to consider every branch a
 * context could select; this one answers "what does this node say".
 */
export function refBlockId(node: SaunaNodeConfig | undefined): string | null {
  if (!isRefNode(node)) return null;
  return blockIdFromProps(node?.props);
}

/**
 * The parameter values a ref node passes down, or `null` when it passes
 * none — an absent prop, a non-object, or an array (arrays are objects
 * in JS and would otherwise read as an empty map).
 *
 * Reads the node's OWN props only, like {@link refBlockId}: a variant
 * supplies its own map when it is the branch that renders, and picking
 * between branches is the renderer's decision, not this reader's.
 *
 * Returns the stored map as-is. It is not filtered against the block's
 * manifest here — a value whose parameter no longer exists is an orphan,
 * and reporting orphans belongs to SDL-501 rather than to a reader that
 * would have to silently drop them to do it. Silent drop is precisely
 * the failure mode hard rule 7 names.
 */
export function refParamValues(
  node: SaunaNodeConfig | undefined,
): Readonly<Record<string, unknown>> | null {
  if (!isRefNode(node)) return null;
  const raw = node?.props?.[SAUNA_REF_PARAMS_PROP];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * The parameters a block declares, in declaration order. `[]` for every
 * document that declares none — a block nobody parameterised and a page
 * are the same shape here, and callers should not have to tell them
 * apart.
 */
export function blockParamSpecs(schema: SaunaSchema): readonly SaunaParamSpec[] {
  return schema.params ?? [];
}

/**
 * Every block id a schema can possibly reference, deduped.
 *
 * Deliberately context-blind and reachability-blind: it walks ALL
 * nodes and, per node, the default props AND every variant's props.
 * Prefetching is not the place to be clever — a variant that only
 * matches for logged-in visitors still has to have its block loaded
 * before the render decides, and the renderer is synchronous.
 */
export function collectRefBlockIds(schema: SaunaSchema): string[] {
  const found = new Set<string>();
  for (const node of Object.values(schema.nodes)) {
    if (!isRefNode(node)) continue;
    const own = blockIdFromProps(node.props);
    if (own) found.add(own);
    for (const variant of node.variants ?? []) {
      const fromVariant = blockIdFromProps(variant.props);
      if (fromVariant) found.add(fromVariant);
    }
  }
  return [...found];
}

/**
 * Loads every block a schema needs, following refs inside those blocks
 * transitively.
 *
 * Missing blocks are simply absent from the result — the renderer
 * draws a placeholder for them. A block already in `seed` is not
 * re-fetched, which is also what stops a cyclic graph from looping
 * here: the cycle is visited once and the second visit is a cache hit.
 * (Cycles are prevented at insert time — {@link blockRefWouldCycle} —
 * but stored data is not ours to trust.)
 */
export async function loadBlockRefs(
  schema: SaunaSchema,
  load: LoadBlockSchema,
  seed: SaunaBlockMap = {},
): Promise<SaunaBlockMap> {
  const blocks: Record<string, SaunaSchema> = { ...seed };
  const visited = new Set<string>(Object.keys(blocks));
  let frontier = collectRefBlockIds(schema).filter((id) => !visited.has(id));

  while (frontier.length > 0) {
    frontier.forEach((id) => visited.add(id));
    const loaded = await Promise.all(
      frontier.map(async (id) => [id, await load(id)] as const),
    );
    const next: string[] = [];
    for (const [id, blockSchema] of loaded) {
      if (!blockSchema) continue;
      blocks[id] = blockSchema;
      for (const nested of collectRefBlockIds(blockSchema)) {
        if (!visited.has(nested)) next.push(nested);
      }
    }
    // Dedupe within the batch too: two blocks referencing the same
    // third one must not produce two fetches of it.
    frontier = [...new Set(next)];
  }

  return blocks;
}

/**
 * Would inserting a ref to `candidateBlockId` into `hostBlockId`
 * create a cycle?
 *
 * The check that keeps a block from containing itself, directly or
 * through a chain. It runs at INSERT (the modal picking a card,
 * SDL-340), not at render: a cycle that never gets stored is a cycle
 * nobody has to render around.
 *
 * `hostBlockId` is `null` when the document being edited is a page —
 * pages are not referenceable, so nothing can point back at them and
 * no insertion into a page can ever close a loop.
 */
export async function blockRefWouldCycle({
  hostBlockId,
  candidateBlockId,
  load,
}: {
  hostBlockId: string | null;
  candidateBlockId: string;
  load: LoadBlockSchema;
}): Promise<boolean> {
  if (!hostBlockId) return false;
  if (hostBlockId === candidateBlockId) return true;

  // Reachability: can the host be reached FROM the candidate? If yes,
  // putting the candidate inside the host closes the loop.
  const visited = new Set<string>();
  const queue = [candidateBlockId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const schema = await load(id);
    if (!schema) continue;
    for (const next of collectRefBlockIds(schema)) {
      if (next === hostBlockId) return true;
      if (!visited.has(next)) queue.push(next);
    }
  }
  return false;
}
