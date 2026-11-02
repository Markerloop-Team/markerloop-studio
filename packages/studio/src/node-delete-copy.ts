import type { SaunaNodeId, SaunaSchema } from "@markerloop/engine";
import { saunaNodeDisplayName } from "@markerloop/engine";

/**
 * Everything BELOW a node, depth-first in tree order — the nodes that a
 * delete takes with it (SDL-303).
 *
 * Descendants, not direct children: `removeSubtree` drops the whole subtree,
 * so counting one level would under-report exactly when the warning matters
 * most — a section holding a card holding six fields reads as "1 node".
 */
export function saunaDescendantIds(
  schema: SaunaSchema,
  nodeId: SaunaNodeId
): SaunaNodeId[] {
  const out: SaunaNodeId[] = [];
  const walk = (id: SaunaNodeId) => {
    for (const child of schema.nodes[id]?.children ?? []) {
      out.push(child);
      walk(child);
    }
  };
  walk(nodeId);
  return out;
}

/**
 * English plural for the count of nodes going with the parent.
 *
 * Rewritten, not translated (SDL-468). The Russian version carried a
 * three-form rule with a teens exception — 1/21 singular, 2–4/22–24 the
 * second form, 11–14 back to the third. English has two forms and no
 * modular arithmetic behind them: only an exact 1 is singular, and 11, 21
 * and 111 are all plural. Keeping the `% 10` shape here would have been
 * dead branching that reads as if a rule existed.
 */
export function saunaNestedNodesPhrase(count: number): string {
  return count === 1 ? "1 nested node" : `${count} nested nodes`;
}

/** How many names the sentence lists before it switches to a tail count. */
const NAMES_SHOWN = 4;

function joinNames(names: readonly string[]): string {
  if (names.length <= NAMES_SHOWN) {
    if (names.length === 1) return names[0]!;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
  }
  // A page section can hold dozens of nodes, and a dialog that lists all of
  // them stops being readable at exactly the moment the author most needs to
  // read it. The count above already carries the magnitude, so the tail only
  // has to say that the list was cut.
  const shown = names.slice(0, NAMES_SHOWN).join(", ");
  return `${shown} and ${names.length - NAMES_SHOWN} more`;
}

export type SaunaDeleteCopy = { title: string; body: string };

/**
 * The confirmation's words, built from the schema rather than written per
 * call site — both entry points (the row menu and Delete/Backspace) show the
 * SAME sentence, and a test can read it without mounting a dialog.
 *
 * LANGUAGE: English (SDL-468, EP-86). The owner settled it on 28 Aug 2026 —
 * Studio's interface goes to English throughout — and SDL-431 already moved
 * the page-delete dialog. The approved canvas board «13 · Удаление узла с
 * детьми» stays the authority on STRUCTURE and disclosure: the title names
 * the node, the body counts the subtree, lists what goes with it and says
 * the step is undoable. It is no longer the authority on the language of
 * the labels, even though it is written in Russian.
 *
 * The board's own departure survives the move and gets simpler in English:
 * the board reads «Вместе с секцией удалятся …», an instrumental-case noun
 * per node type, and we hold no such vocabulary — the schema knows
 * `Section`, not «секция». English needs no declension table at all, so
 * "Deleting it also removes …" is grammatical for every type there is.
 */
export function saunaDeleteConfirmCopy(
  schema: SaunaSchema,
  nodeId: SaunaNodeId
): SaunaDeleteCopy {
  const node = schema.nodes[nodeId];
  const label = node ? saunaNodeDisplayName(node) : nodeId;
  const title = `Delete “${label}”?`;
  const undo = "This can be undone (⌘Z).";

  const descendants = saunaDescendantIds(schema, nodeId);
  if (descendants.length === 0) return { title, body: undo };

  const names = descendants.map((id) => {
    const child = schema.nodes[id];
    return child ? saunaNodeDisplayName(child) : id;
  });
  return {
    title,
    body: `Deleting it also removes ${saunaNestedNodesPhrase(
      descendants.length
    )}: ${joinNames(names)}. ${undo}`,
  };
}
