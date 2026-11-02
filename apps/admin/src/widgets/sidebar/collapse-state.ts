"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Whether the desktop sidebar is hidden (EP-157, owner 29 Oct 2026: the
 * canvas model — collapse hides the menu ENTIRELY, there is no icon rail).
 * The choice outlives a reload, per browser.
 */
export const SIDEBAR_COLLAPSED_KEY = "markerloop:shell:sidebar-collapsed";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Storage that throws (private mode, blocked site data) reads as expanded. */
export function readSidebarCollapsed(storage: StorageLike | null | undefined): boolean {
  try {
    return storage?.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Expanded is the default, so it is stored as the key's absence. */
export function writeSidebarCollapsed(storage: StorageLike | null | undefined, collapsed: boolean): void {
  try {
    if (collapsed) storage?.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    else storage?.removeItem(SIDEBAR_COLLAPSED_KEY);
  } catch {
    // The choice lasts this page view only.
  }
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Starts expanded on the server AND on the first client render — the stored
 * value is read after mount, so hydration never sees a different tree.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(readSidebarCollapsed(browserStorage()));
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeSidebarCollapsed(browserStorage(), next);
      return next;
    });
  }, []);
  return [collapsed, toggle];
}
