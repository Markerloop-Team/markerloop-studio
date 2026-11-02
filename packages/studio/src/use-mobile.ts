"use client";

// One breakpoint, one hook (SDL-202).
//
// The mobile editor is not the desktop editor squeezed into 390px — it is a
// different chrome (bottom tab bar, sheets, no side columns), so the split is
// made in JS, not CSS: rendering both layouts and toggling `display` would
// double-mount every properties form and outline tree, and two live
// react-hook-form instances editing the same node through one store is the
// kind of thing that only breaks in production.
//
// The query matches Tailwind's `md` boundary exactly — the same 768px line
// the admin shell's drawer styles are written against — so the JS switch and
// the remaining `max-md:`/`md:` utility pairs can never disagree about which
// side of the breakpoint they are on.
//
// `useSyncExternalStore` rather than a `useState` + effect: the server (and
// the hydration pass, via the third argument) renders desktop, and the first
// client render after hydration flips to the real answer without a mismatch
// warning.

import { useSyncExternalStore } from "react";

const MOBILE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/** True below Tailwind's `md` (768px) — the studio's single mobile boundary. */
export function useStudioIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
