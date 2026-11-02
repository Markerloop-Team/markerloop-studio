// How deep Components nest into each other (SDL-723, EP-145).
//
// The limit is `component_max_depth` of the product rules
// (`@markerloop/policy`, limits.json) — never a literal here. The same rule
// is enforced by pages-service on write (the Go twin of SDL-723); this module
// is the engine's half: the measure, and the write-side verdict the editor
// asks before it stores a `Ref`.
//
// Depth = the number of Components on the longest chain of `Ref`s:
//   - a page does not count itself (page → Header → Nav → Button → Icon = 4);
//   - a Component opened on its own counts itself (Header → Nav = 2);
//   - `Ref`s in every variant branch count — context-blind, exactly like
//     `collectRefBlockIds` (a branch that renders for logged-in visitors only
//     is still a chain the renderer may have to walk);
//   - a `Ref` to a Component that is not in the map (deleted, mistyped, not
//     loaded) adds nothing;
//   - a cycle (stored data is not ours to trust) is cut where it closes: the
//     Component that would repeat adds nothing, so the walk always ends.
//
// Editing a Component (the host) the chain runs both ways: Components ABOVE
// the host (that reference it, directly or through others) plus the host and
// everything below it — pages-service measures it as Up + Down. The engine
// counts "above" only from the Components it is given
// ({@link saunaComponentDepthAbove}); a caller that cannot load the whole
// library gets an incomplete answer, and pages-service, which sees every
// Component, has the last word (422 `component_depth_exceeded`, mapped by
// the pages provider to `ComponentDepthError`).
//
// The write rule: a write is refused when the document's depth after it is
// above the limit AND above what it was before. A document that is already
// deeper (written before the limit existed) is kept and may be edited, as
// long as the edit does not make it deeper still.
//
// The renderer is NOT cut at this limit: its own cycle guard stays the only
// render-time protection.
//
// Pure and server-safe: no React, no DOM, no I/O.

import { policyLimits } from "@markerloop/policy";

import type { SaunaSchema } from "../schema/types";
import { collectRefBlockIds, type SaunaBlockMap } from "./refs";

/** The limits.json key of the nesting limit. */
export const SAUNA_COMPONENT_MAX_DEPTH_KEY = "component_max_depth";

function readLimit(): number {
  const raw = policyLimits[SAUNA_COMPONENT_MAX_DEPTH_KEY]?.value;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    throw new Error(`@markerloop/policy limits.json has no usable ${SAUNA_COMPONENT_MAX_DEPTH_KEY}`);
  }
  return raw;
}

/** How many Components may nest into each other — `component_max_depth` of limits.json. */
export const SAUNA_COMPONENT_MAX_DEPTH: number = readLimit();

/**
 * Depth of the chain that starts at Component `blockId`, the Component
 * itself included. 0 when the Component is not in `blocks`.
 *
 * `onPath` holds the Components already on the current chain (the cycle
 * cut); `memo` caches finished answers so a library where many Components
 * share a nested one is walked once, not once per path. On acyclic data the
 * memo is exact; on cyclic data the answer is finite but depends on where
 * the walk entered the cycle — which is fine for a document that should not
 * exist in the first place.
 */
function chainDepth(
  blockId: string,
  blocks: SaunaBlockMap,
  onPath: Set<string>,
  memo: Map<string, number>,
): number {
  const known = memo.get(blockId);
  if (known !== undefined) return known;
  const schema = blocks[blockId];
  if (!schema || onPath.has(blockId)) return 0;
  onPath.add(blockId);
  let inner = 0;
  for (const next of collectRefBlockIds(schema)) {
    inner = Math.max(inner, chainDepth(next, blocks, onPath, memo));
  }
  onPath.delete(blockId);
  const depth = 1 + inner;
  memo.set(blockId, depth);
  return depth;
}

/**
 * How many Components sit ABOVE `blockId` on the longest chain that leads to
 * it, among the Components in `blocks` (pages are not Components and do not
 * count). 0 when nothing in `blocks` references it. Cycle-safe like the
 * downward walk.
 */
export function saunaComponentDepthAbove(blockId: string, blocks: SaunaBlockMap): number {
  const parents = new Map<string, string[]>();
  for (const [id, schema] of Object.entries(blocks)) {
    for (const child of collectRefBlockIds(schema)) {
      const list = parents.get(child) ?? [];
      list.push(id);
      parents.set(child, list);
    }
  }
  const memo = new Map<string, number>();
  const onPath = new Set<string>();
  const up = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (onPath.has(id)) return 0;
    onPath.add(id);
    let best = 0;
    for (const p of parents.get(id) ?? []) {
      if (onPath.has(p)) continue;
      best = Math.max(best, 1 + up(p));
    }
    onPath.delete(id);
    memo.set(id, best);
    return best;
  };
  return up(blockId);
}

/**
 * Depth of the Component `blockId` opened on its own (it counts itself).
 * 0 when `blocks` does not hold it.
 */
export function saunaComponentChainDepth(blockId: string, blocks: SaunaBlockMap): number {
  return chainDepth(blockId, blocks, new Set(), new Map());
}

/**
 * Depth of a document: `selfBlockId === null` → a page (does not count
 * itself), a Component id → that Component being edited (counts itself; its
 * own id also cuts a cycle back into it). `blocks` must hold the Components
 * the document reaches — `loadBlockRefs` builds exactly that map.
 */
export function saunaComponentDepth(
  schema: SaunaSchema,
  blocks: SaunaBlockMap,
  selfBlockId: string | null,
): number {
  const onPath = new Set<string>();
  if (selfBlockId) onPath.add(selfBlockId);
  const memo = new Map<string, number>();
  let inner = 0;
  for (const next of collectRefBlockIds(schema)) {
    inner = Math.max(inner, chainDepth(next, blocks, onPath, memo));
  }
  return (selfBlockId ? 1 : 0) + inner;
}

/** Stable code — the one pages-service publishes in its swagger (422). */
export const SAUNA_COMPONENT_DEPTH_EXCEEDED = "component_depth_exceeded";

/** What the author reads when a write is refused for depth. */
export function saunaComponentDepthMessage(limit: number): string {
  return `Components can nest at most ${limit} deep — this change would go past that`;
}

export class ComponentDepthError extends Error {
  readonly code = SAUNA_COMPONENT_DEPTH_EXCEEDED;
  /** Depth the write would leave; `null` when pages-service refused it without saying. */
  readonly depth: number | null;
  /** Depth before the write; `null` when unknown. */
  readonly previous: number | null;
  readonly limit: number;
  constructor(depth: number | null, previous: number | null, limit: number, message?: string) {
    super(message ?? saunaComponentDepthMessage(limit));
    this.name = "ComponentDepthError";
    this.depth = depth;
    this.previous = previous;
    this.limit = limit;
  }
}

/** Name guard — `instanceof` does not hold across bundles. */
export function isComponentDepthError(e: unknown): e is ComponentDepthError {
  return e instanceof Error && e.name === "ComponentDepthError" && (e as { code?: unknown }).code === SAUNA_COMPONENT_DEPTH_EXCEEDED;
}

export type SaunaComponentDepthVerdict = {
  ok: boolean;
  depth: number;
  previous: number;
  limit: number;
};

/**
 * The write rule. `before` is the stored document (`null` for a new one),
 * `after` the one about to be stored, `hostBlockId` the Component being
 * edited (`null` for a page), `blocks` every Component either version
 * reaches, `above` the Components above the host
 * ({@link saunaComponentDepthAbove}; 0 for a page, and 0 = "unknown" when
 * the caller could not load the library — then pages-service decides).
 * Refused only when `after` is deeper than the limit AND deeper than
 * `before`.
 */
export function saunaCheckComponentDepth({
  before,
  after,
  hostBlockId,
  blocks,
  above = 0,
  limit = SAUNA_COMPONENT_MAX_DEPTH,
}: {
  before: SaunaSchema | null;
  after: SaunaSchema;
  hostBlockId: string | null;
  blocks: SaunaBlockMap;
  above?: number;
  limit?: number;
}): SaunaComponentDepthVerdict {
  const up = hostBlockId ? above : 0;
  const depth = up + saunaComponentDepth(after, blocks, hostBlockId);
  const previous = before ? up + saunaComponentDepth(before, blocks, hostBlockId) : 0;
  return { ok: !(depth > limit && depth > previous), depth, previous, limit };
}

/** {@link saunaCheckComponentDepth} that throws `ComponentDepthError` on a refusal. */
export function saunaAssertComponentDepth(args: Parameters<typeof saunaCheckComponentDepth>[0]): void {
  const v = saunaCheckComponentDepth(args);
  if (!v.ok) throw new ComponentDepthError(v.depth, v.previous, v.limit);
}
