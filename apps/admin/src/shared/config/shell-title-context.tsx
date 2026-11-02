"use client";

// What the phone top bar prints (EP-157, canvas «Classic sidebar»): the title
// of the screen and, on a page deeper than a section, the way back — the
// parent crumb. The section header of the screen writes it here; the shell's
// top bar reads it. Outside the provider nothing is written and the bar falls
// back to the active menu item.

import * as React from "react";

export type ShellTitle = {
  title: string;
  /** The parent crumb on a deep page: the phone shows a back arrow to it. */
  back: { href: string; label: string } | null;
};

type Store = { value: ShellTitle | null; set: (next: ShellTitle | null) => void };

const ShellTitleContext = React.createContext<Store | null>(null);

export function ShellTitleProvider({ children }: { children: React.ReactNode }) {
  const [value, set] = React.useState<ShellTitle | null>(null);
  const store = React.useMemo(() => ({ value, set }), [value]);
  return <ShellTitleContext.Provider value={store}>{children}</ShellTitleContext.Provider>;
}

/** The title written by the screen on display, or null. */
export function useShellTitle(): ShellTitle | null {
  return React.useContext(ShellTitleContext)?.value ?? null;
}

/**
 * Writes the screen's title for the top bar while it is mounted. Only plain
 * strings travel: a title drawn as markup (a link, a badge) is not passed.
 */
export function useRegisterShellTitle(title: string | null, back: ShellTitle["back"]): void {
  const set = React.useContext(ShellTitleContext)?.set;
  const backHref = back?.href ?? null;
  const backLabel = back?.label ?? null;
  React.useEffect(() => {
    if (!set || title === null) return;
    set({ title, back: backHref !== null && backLabel !== null ? { href: backHref, label: backLabel } : null });
    return () => set(null);
  }, [set, title, backHref, backLabel]);
}
