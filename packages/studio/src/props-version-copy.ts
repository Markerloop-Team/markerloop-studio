// Wording of the Properties plate for a node whose props follow another
// version of its Element's schema (SDL-667, EP-128).
//
// Same convention as `insert-copy.ts` and `node-delete-copy.ts`: the interface
// speaks English since EP-86 (owner's decision, 28 Aug 2026), and the
// sentences live here, built from the two numbers, so the package tests pin
// them instead of eyeballing them inside the form.
//
// The board's sentence is «схема vN, редактор знает vM»: the version the node
// was written against first, the one this editor reads second.

/** The plate's heading: «Schema v2, the editor knows v1». */
export function saunaPropsVersionHeading(nodeVersion: number, knownVersion: number): string {
  return `Schema v${nodeVersion}, the editor knows v${knownVersion}`;
}

/**
 * What it means for the author. Which side is ahead decides the sentence: a
 * NEWER node was saved by an editor this one has not caught up with; an OLDER
 * one predates a change this editor has no migration for. Either way nothing
 * is lost — the plate only refuses to edit.
 */
export function saunaPropsVersionBody(nodeVersion: number, knownVersion: number): string {
  const why =
    nodeVersion > knownVersion
      ? "This block was saved by a newer version of the editor."
      : "This block was saved before its settings changed, and this editor cannot convert them yet.";
  return `${why} Its settings stay as they are, but they can't be edited here.`;
}
