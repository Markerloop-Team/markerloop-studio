// The two screens of one address (SDL-643): the view a member uses and the
// editor. Plain functions in a module of their own, so the address list can
// link to the view without pulling the editor (studio, engine) into its bundle.

function withWorkspace(href: string, workspaceId: string | null): string {
  return workspaceId ? `${href}?ws=${encodeURIComponent(workspaceId)}` : href;
}

/** The view screen of the page at one address. */
export function pageViewHref(routeId: string, workspaceId: string | null): string {
  return withWorkspace(`/pages/${routeId}/view`, workspaceId);
}

/** The editor of the same address. */
export function pageEditorHref(routeId: string, workspaceId: string | null): string {
  return withWorkspace(`/pages/${routeId}`, workspaceId);
}

/**
 * The Components section (EP-157): the list at /components and one
 * Component's full-screen editor at /components/<id>. Until EP-157 they were
 * the Blocks tab of /pages (`?tab=blocks`) and /pages/blocks/<id>; those
 * addresses redirect here (next.config.ts), keeping ?ws=.
 */
export const COMPONENTS_PATH = "/components";

export function componentsListHref(workspaceId: string | null): string {
  return withWorkspace(COMPONENTS_PATH, workspaceId);
}

export function componentEditorHref(blockId: string, workspaceId: string | null): string {
  return withWorkspace(`${COMPONENTS_PATH}/${encodeURIComponent(blockId)}`, workspaceId);
}
