"use client";

// How an outline drag starts and how it ends (SDL-757).
//
// Start: the pointer has to travel 8px before dnd-kit takes the gesture. At
// 4px an ordinary click with a slightly shaky hand (or a trackpad tap) crossed
// the line and turned "select this row" into a drag that went nowhere; 8px is
// the usual threshold of desktop editors and still short enough that a real
// drag never feels sticky. Touch is not governed by this — its long-press
// constraint lives next to the sensors in the shell.
//
// End: the chip in `DragOverlay` flies to where the row now sits instead of
// vanishing under the pointer. 220ms with a decelerating curve — long enough
// to read where the row landed, short enough not to hold up the next action.
// dnd-kit's default drop animation otherwise, side effects included (it hides
// the row left behind while the chip lands on it, then restores its style).
//
// Reduced motion: when the person asked the system for less motion, the chip
// is removed at once (`dropAnimation={null}`). The answer comes from
// `matchMedia` through `useSyncExternalStore`, so the server and the
// hydration pass render "reduce" (no animation) and the first client render
// flips to the real answer without a mismatch warning — same recipe as
// `use-mobile.ts`.

import { useSyncExternalStore } from "react";
import { defaultDropAnimation, type DropAnimation } from "@dnd-kit/core";

/** Pointer travel, in px, before an outline row press becomes a drag. */
export const OUTLINE_DRAG_ACTIVATION_DISTANCE = 8;

/** The drop animation of the outline's drag chip when motion is allowed. */
export const OUTLINE_DROP_ANIMATION: DropAnimation = {
  ...defaultDropAnimation,
  duration: 220,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
};

/** `DragOverlay`'s `dropAnimation` for the given reduced-motion answer. */
export function outlineDropAnimation(
  prefersReducedMotion: boolean
): DropAnimation | null {
  return prefersReducedMotion ? null : OUTLINE_DROP_ANIMATION;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true;
}

/** True when the system asks for reduced motion; true on the server. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
