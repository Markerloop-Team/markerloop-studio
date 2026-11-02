import { fileScope, type FileScope } from "@/entities/files";

/**
 * The files scope of the collections selection — the ONE place the pages
 * editor derives it (SDL-624 §6.4), exactly as /files does: the selected
 * workspace (gateway G2, SDL-617; the UI has no project level since
 * SDL-621).
 */
export function selectionFileScope(selection: {
  // Required: a caller that still hands a project cannot compile here.
  selectedWorkspace: { id: string } | null;
}): FileScope | null {
  return fileScope(selection.selectedWorkspace?.id);
}
