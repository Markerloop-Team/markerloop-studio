"use client";

/**
 * Who owns the Escape key right now (SDL-349).
 *
 * The editor has two independent "Escape clears the selection" listeners —
 * the hotkey layer and the canvas selection layer — and Radix mounts its
 * popovers, dialogs and menus above both. Escape had been reaching all of
 * them: closing the preview-context popover also cleared the selection, and
 * the right column collapsed to Properties alone, losing the place the
 * author was working in.
 *
 * The naive guard ("is a layer in the DOM?") asked at the wrong moment.
 * Radix dismisses from its own capture-phase listener and React flushes that
 * discrete update synchronously, so a handler running later in the same
 * keystroke sees a document with no layer in it — indistinguishable from a
 * plain Escape. The fact therefore has to be recorded while the event is
 * still travelling, and shared between the listeners by the event itself.
 */

const FLOATING_LAYER_SELECTOR =
  '[data-slot="popover-content"],[role="dialog"],[role="alertdialog"],[role="menu"]';

function hasOpenFloatingLayer(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector(FLOATING_LAYER_SELECTOR) !== null;
}

let installs = 0;
let probedEvent: KeyboardEvent | null = null;
let probedHadLayer = false;

function probe(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  probedEvent = event;
  probedHadLayer = hasOpenFloatingLayer();
}

/**
 * Starts watching Escape in the capture phase; returns the uninstall.
 *
 * Registered when the editor mounts — before any layer can exist — so among
 * capture listeners it runs ahead of Radix's and still sees the truth.
 * Reference-counted: several editor layers install it, one listener serves
 * them all, and the last one out removes it.
 */
export function installFloatingLayerProbe(): () => void {
  if (typeof document !== "undefined" && installs === 0) {
    document.addEventListener("keydown", probe, { capture: true });
  }
  installs += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    installs -= 1;
    if (typeof document !== "undefined" && installs === 0) {
      document.removeEventListener("keydown", probe, { capture: true });
      probedEvent = null;
      probedHadLayer = false;
    }
  };
}

/**
 * Did THIS Escape land on a floating layer? Answer it before doing anything
 * the author did not ask for.
 *
 * Keyed by the event object, so every listener on the same keystroke gets the
 * same answer no matter which of them runs first. An event the probe never
 * saw — a key pressed inside the canvas iframe, or a caller that skipped the
 * install — falls back to reading the document, which is still right whenever
 * nothing dismissed a layer in between.
 */
export function escapeHitFloatingLayer(event?: KeyboardEvent | null): boolean {
  if (event && probedEvent === event) return probedHadLayer;
  return hasOpenFloatingLayer();
}
