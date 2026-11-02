/**
 * A one-shot instruction in the address (`?create=1`, `?file=<id>`) that the
 * shell's search palette sends a screen (EP-157): read once, then removed with
 * `history.replaceState`, so a reload or a shared link does not repeat it.
 * Reads the live location, not a render-time snapshot.
 */
export function takeQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const value = url.searchParams.get(name);
  if (value === null) return null;
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url.toString());
  return value;
}
