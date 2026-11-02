"use client";

// Fullscreen editing overlay for the Studio.
//
// Wraps Radix Dialog (already a sunday-sauna dependency) with three
// Studio-specific behaviours:
//
//   1. Dirty-state guarded close. Esc / backdrop click / external close
//      requests are intercepted and prompt for confirmation when
//      `isDirty` is true.
//   2. Fullscreen content sized to fill the viewport — the Studio's
//      3-column grid expects to own the screen.
//   3. Focus trap is delegated to Radix; we keep the API surface tight
//      so callers don't have to know about portals.
//
// The component receives Studio content as `children`, which lets the
// caller code-split it through `React.lazy` without the package
// having to take a dependency on a particular bundler.

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

export type SaunaEditableOverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * If true, close requests prompt confirmation before closing. Wire
   * this to the auto-save hook's `status` (e.g. `status === "dirty" ||
   * status === "saving"`).
   */
  isDirty?: boolean;
  /** Confirmation message. Defaults to a sensible English sentence. */
  confirmDiscardMessage?: string;
  /** Tailwind classes merged onto the overlay content. */
  className?: string;
  children: ReactNode;
};

export function SaunaEditableOverlay({
  open,
  onOpenChange,
  isDirty,
  confirmDiscardMessage = "Discard unsaved changes?",
  className,
  children,
}: SaunaEditableOverlayProps): ReactNode {
  // Capture Esc at the document layer so we can intercept *before*
  // Radix closes the dialog when there are unsaved changes.
  const guardedClose = useCallback(() => {
    if (!isDirty) {
      onOpenChange(false);
      return;
    }
    if (typeof window === "undefined" || window.confirm(confirmDiscardMessage)) {
      onOpenChange(false);
    }
  }, [isDirty, confirmDiscardMessage, onOpenChange]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
          return;
        }
        guardedClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
          data-sauna-editable-overlay-backdrop
        />
        <Dialog.Content
          aria-label="Sauna editable overlay"
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault();
              guardedClose();
            }
          }}
          onPointerDownOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              guardedClose();
            }
          }}
          className={
            "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background" +
            (className ? ` ${className}` : "")
          }
          data-sauna-editable-overlay
        >
          {/* Hidden but accessible title for screen readers. */}
          <Dialog.Title className="sr-only">Sauna editor</Dialog.Title>
          <Dialog.Description className="sr-only">
            Fullscreen editing surface for the current sauna document.
          </Dialog.Description>
          <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Convenience hook: tiny stateful wrapper for callers that just want
 * `[open, setOpen]` plumbing without writing it themselves.
 */
export function useEditableOverlay(initial = false) {
  const [open, setOpen] = useState(initial);
  return { open, setOpen, openOverlay: () => setOpen(true), closeOverlay: () => setOpen(false) };
}

