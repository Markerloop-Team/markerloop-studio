// The «Свои компоненты» half of the Insert modal (SDL-340).
//
// The kit tab inserts a component; this one inserts a REFERENCE to a
// project block — `{ type: "Ref", props: { blockId } }`, the node
// SDL-338 taught the renderer to expand. The owner picked the
// reference over a copy on 21 Aug 2026: a copy is a template, and the
// template's price is paid later, when half the site is out of sync.
//
// Everything here is pure or I/O-only, with no React: the modal is
// already a long component, and the two things this feature can get
// wrong — which components the search shows, and which of them would
// close a cycle — are exactly the two that deserve unit tests rather
// than an eyeball inside a dialog.

import {
  SAUNA_COMPONENT_MAX_DEPTH,
  blockRefWouldCycle,
  loadBlockRefs,
  saunaComponentChainDepth,
  saunaComponentDepth,
  saunaComponentDepthAbove,
  type LoadBlockSchema,
  type SaunaSchema,
} from "@markerloop/engine";

/**
 * One Component as the modal lists it. `name` is what storage calls it,
 * `id` (the UUID pages-service issued) is what ends up in `props.blockId`.
 */
export type SaunaComponentSummary = {
  id: string;
  name: string;
  /** The Component's key in pages-service (SDL-718); searched like the name. */
  key?: string;
  /** The Component's group, when the service has one (layer 6); groups the Insert modal's Components tab. */
  group?: string;
};

/**
 * Search over the author's own components.
 *
 * Matches the id as well as the name because the two differ: a block
 * saved as «Хиро» lives under `hero-section`, and an author who
 * remembers one of the two must not be told there are no matches. The
 * comparison is the kit tab's — trimmed, case-folded, substring.
 */
export function saunaFilterComponents(
  items: readonly SaunaComponentSummary[],
  query: string,
): SaunaComponentSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.key?.toLowerCase().includes(q) ?? false),
  );
}

/**
 * A loader that fetches each block at most once.
 *
 * The cycle check walks the reference graph once PER CANDIDATE, and a
 * library where several components share a nested block would fetch
 * that block once per walk. Caching is not an optimisation here so
 * much as the difference between one request and a dozen for the same
 * bytes, on a dialog the author expects to open instantly.
 *
 * Negative answers are cached too: "no such block" is a normal, stable
 * answer (SDL-338), not a transient failure worth retrying inside one
 * pass. A throw is NOT cached — the promise rejects and the entry is
 * dropped, so a flaky request does not poison the rest of the session.
 */
export function saunaCachingBlockLoader(load: LoadBlockSchema): LoadBlockSchema {
  const cache = new Map<string, Promise<SaunaSchema | null>>();
  return (blockId: string) => {
    const hit = cache.get(blockId);
    if (hit) return hit;
    const pending = load(blockId).catch((e: unknown) => {
      cache.delete(blockId);
      throw e;
    });
    cache.set(blockId, pending);
    return pending;
  };
}

/**
 * Which of these components cannot be inserted into the document being
 * edited, because doing so would make a block contain itself.
 *
 * Only a BLOCK can be a host: a page is not referenceable, so nothing
 * can point back at it and no insertion into a page can close a loop.
 * `hostBlockId === null` therefore short-circuits to "none of them",
 * without a single request — the common case (the author is editing a
 * page) must not pay for a check that cannot fail.
 *
 * A candidate whose walk throws is treated as CYCLIC — refusing an
 * insertion we could not clear is the safe direction, and the modal
 * says so on the card. The opposite default would let a transport
 * hiccup write the one schema shape the renderer has to defend
 * against.
 */
export async function saunaCyclicComponentIds({
  hostBlockId,
  ids,
  load,
}: {
  hostBlockId: string | null;
  ids: readonly string[];
  load: LoadBlockSchema;
}): Promise<ReadonlySet<string>> {
  if (!hostBlockId) return new Set<string>();
  const cached = saunaCachingBlockLoader(load);
  const verdicts = await Promise.all(
    ids.map(async (candidateBlockId) => {
      try {
        return [
          candidateBlockId,
          await blockRefWouldCycle({ hostBlockId, candidateBlockId, load: cached }),
        ] as const;
      } catch {
        return [candidateBlockId, true] as const;
      }
    }),
  );
  return new Set(verdicts.filter(([, cyclic]) => cyclic).map(([id]) => id));
}

/**
 * Which of these components cannot be inserted because the document would
 * nest Components deeper than `component_max_depth` (SDL-723).
 *
 * The engine's write rule, asked per candidate: inserting a `Ref` to it
 * leaves the document at `max(current, (host ? 1 : 0) + candidate's chain)`;
 * the card is dimmed when that is above the limit AND above the current
 * depth — a document already deeper (stored before the limit) is not
 * locked, it just may not get deeper. For a page this is exactly «the
 * candidate's own depth breaks the limit»; a Component host counts itself
 * AND the Components above it (Up + Down, as pages-service measures).
 *
 * `ids` is the whole library the modal lists, so "above" is counted from
 * those Components' schemas — the same cached reads the modal makes for its
 * cards anyway, no extra requests. A library read that fails, or a
 * Component missing from the list, makes "above" short: the dimming is then
 * incomplete, and pages-service has the last word on save (422
 * `component_depth_exceeded` → `ComponentDepthError` with a readable
 * message, shown as the save error).
 *
 * A candidate whose graph cannot be read is NOT dimmed: unlike a cycle,
 * depth is enforced again on write by pages-service, and dimming every card
 * on a flaky request would read as "all your components are too deep".
 */
export async function saunaTooDeepComponentIds({
  hostBlockId,
  schema,
  ids,
  load,
  limit = SAUNA_COMPONENT_MAX_DEPTH,
}: {
  hostBlockId: string | null;
  schema: SaunaSchema;
  ids: readonly string[];
  load: LoadBlockSchema;
  limit?: number;
}): Promise<ReadonlySet<string>> {
  const cached = saunaCachingBlockLoader(load);
  let above = 0;
  if (hostBlockId) {
    const library: Record<string, SaunaSchema> = {};
    await Promise.all(
      ids.map(async (id) => {
        try {
          const s = id === hostBlockId ? schema : await cached(id);
          if (s) library[id] = s;
        } catch {
          // An unreadable Component only makes "above" short — see above.
        }
      }),
    );
    library[hostBlockId] = schema;
    above = saunaComponentDepthAbove(hostBlockId, library);
  }
  let current = above;
  try {
    current = above + saunaComponentDepth(schema, await loadBlockRefs(schema, cached), hostBlockId);
  } catch {
    current = above;
  }
  const self = hostBlockId ? above + 1 : 0;
  const verdicts = await Promise.all(
    ids.map(async (id) => {
      try {
        const own = await cached(id);
        if (!own) return [id, false] as const;
        const blocks = await loadBlockRefs(own, cached, { [id]: own });
        const after = Math.max(current, self + saunaComponentChainDepth(id, blocks));
        return [id, after > limit && after > current] as const;
      } catch {
        return [id, false] as const;
      }
    }),
  );
  return new Set(verdicts.filter(([, deep]) => deep).map(([id]) => id));
}
