// Page revision journal: what the screen derives from rows the service hands
// back (SDL-605, slice 2). Pure functions, no React — the smoke runs them.
//
// The service does not compute differences: every row carries the whole
// `body_snapshot`, and the screen compares neighbouring snapshots itself
// (canvas SDL-596, RevisionCompare note). The unit of comparison is a BLOCK —
// a direct child of the root — matched by node id, and its content is named
// by the texts inside it, never by JSON keys.

import { migrateSaunaSchema, validateSaunaSchema, type SaunaSchema } from "@markerloop/engine";

import type { PagesRevision } from "@/shared/lib/api/pages-client";

export type RevisionKind = "edit" | "created" | "restored" | "other";

/**
 * Same classification as the service's `revisions.KindOf`: "" is an edit,
 * "created" the creation milestone, any note starting with "restored from"
 * a restore. `from` only when the note has the exact format the service
 * writes ("restored from revision N").
 */
export function revisionKind(note: string): { kind: RevisionKind; from?: number } {
  if (note === "") return { kind: "edit" };
  if (note === "created") return { kind: "created" };
  if (note.startsWith("restored from")) {
    const m = /^restored from revision (\d+)$/.exec(note);
    return m ? { kind: "restored", from: Number(m[1]) } : { kind: "restored" };
  }
  return { kind: "other" };
}

/** The service's squash window (`revisions.SquashWindow`). */
export const SQUASH_WINDOW_MS = 60_000;

/**
 * Whether the next save may land in this row instead of a new one. A UI
 * approximation of `ShouldSquash`: the top row, an edit, younger than the
 * window counted from its `created_at` (squashing does not move it). The
 * service also requires the same author — the screen cannot know who saves
 * next, so the label says "still open", not "your next save lands here".
 */
export function isRevisionOpen(rev: Pick<PagesRevision, "note" | "created_at">, isTop: boolean, now: number): boolean {
  if (!isTop || revisionKind(rev.note).kind !== "edit") return false;
  const at = new Date(rev.created_at).getTime();
  if (Number.isNaN(at)) return false;
  const age = now - at;
  return age >= 0 && age <= SQUASH_WINDOW_MS;
}

/** A snapshot as a schema, or `null` when it is not one (`{}`, legacy bodies). */
export function toSchema(snapshot: unknown): SaunaSchema | null {
  const validated = validateSaunaSchema(snapshot);
  if (!validated.ok) return null;
  try {
    return migrateSaunaSchema(validated.value);
  } catch {
    return null;
  }
}

export type ChangeKind = "added" | "removed" | "changed";

export type PageChange = {
  kind: ChangeKind;
  /** The block's name: its first text, else its type. */
  block: string;
  /** The block's texts in the older snapshot; `null` — the block was not there. */
  before: string | null;
  /** The block's texts in the newer snapshot; `null` — the block was removed. */
  after: string | null;
};

const NAME_MAX = 60;
const TEXT_MAX = 160;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function textsOf(schema: SaunaSchema, id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const node = schema.nodes[id];
  if (!node) return [];
  const own = node.props?.text;
  const out = typeof own === "string" && own.trim() !== "" ? [own.trim()] : [];
  for (const child of node.children ?? []) out.push(...textsOf(schema, child, seen));
  return out;
}

function subtree(schema: SaunaSchema, id: string, seen = new Set<string>()): unknown {
  if (seen.has(id)) return null;
  seen.add(id);
  const node = schema.nodes[id];
  if (!node) return null;
  return {
    type: node.type,
    props: node.props ?? null,
    visibility: node.visibility ?? null,
    // The hybrid member branch, the per-width overrides and the conditional
    // variants are content too (SDL-632): an edit that touches only them is
    // still an edit of the block.
    member: node.member ?? null,
    screens: node.screens ?? null,
    variants: node.variants ?? null,
    children: (node.children ?? []).map((c) => subtree(schema, c, seen)),
  };
}

function blockName(schema: SaunaSchema, id: string): string {
  const first = textsOf(schema, id)[0];
  return clip(first ?? schema.nodes[id]?.type ?? id, NAME_MAX);
}

function blockText(schema: SaunaSchema, id: string): string {
  return clip(textsOf(schema, id).join(" · "), TEXT_MAX);
}

function blocksOf(schema: SaunaSchema): string[] {
  return schema.nodes[schema.rootId]?.children ?? [];
}

/**
 * Block-level difference from `older` to `newer`: removed and changed blocks
 * in the older order, then added ones in the newer order. A change deep in a
 * block reports the whole block as changed — that is the unit people edit.
 */
export function diffSchemas(older: SaunaSchema, newer: SaunaSchema): PageChange[] {
  const before = blocksOf(older);
  const after = blocksOf(newer);
  const afterSet = new Set(after);
  const beforeSet = new Set(before);
  const changes: PageChange[] = [];
  for (const id of before) {
    if (!afterSet.has(id)) {
      changes.push({ kind: "removed", block: blockName(older, id), before: blockText(older, id), after: null });
      continue;
    }
    if (JSON.stringify(subtree(older, id)) !== JSON.stringify(subtree(newer, id))) {
      changes.push({
        kind: "changed",
        block: blockName(newer, id),
        before: blockText(older, id),
        after: blockText(newer, id),
      });
    }
  }
  for (const id of after) {
    if (!beforeSet.has(id)) {
      changes.push({ kind: "added", block: blockName(newer, id), before: null, after: blockText(newer, id) });
    }
  }
  return changes;
}

/**
 * What a row changed, as data — the words come from the screen's messages.
 *   - `initial`: the creation row, nothing older to compare with;
 *   - `unavailable`: the older row is not loaded, or a snapshot is not a schema;
 *   - `changes`: the block-level difference to the previous row (may be empty).
 */
export type RevisionSummary =
  | { type: "initial" }
  | { type: "unavailable" }
  /** The previous row exists but is past the loaded journal page. */
  | { type: "notLoaded" }
  | { type: "changes"; changes: PageChange[] };

export function summarizeRevision(row: PagesRevision, previous: PagesRevision | undefined): RevisionSummary {
  if (!previous) return revisionKind(row.note).kind === "created" ? { type: "initial" } : { type: "unavailable" };
  const a = toSchema(previous.body_snapshot);
  const b = toSchema(row.body_snapshot);
  if (!a || !b) return { type: "unavailable" };
  return { type: "changes", changes: diffSchemas(a, b) };
}
