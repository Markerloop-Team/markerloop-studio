"use client";

// The canvas controls of the editor frame (EP-187, layer 5, header variant B):
// the device switcher as a compact segmented control and Undo / Redo. They
// used to be a toolbar row of their own above the canvas; the frame's header
// now carries them in its centre, so the host draws them there and passes
// `canvasToolbar={false}` to SaunaStudio.
//
// The device is the store's width variant (`view.screen`, SDL-632): picking
// Tablet or Phone here is the same act as picking that variant in the
// Properties form, exactly like the old toolbar. Undo / Redo are the store's
// history — the same calls ⌘Z / ⇧⌘Z make (hotkeys.ts).

import type { ReactNode } from "react";
import { useStore } from "zustand";
import { cn } from "@markerloop/ui/ui";

import {
  SAUNA_CANVAS_DEVICES,
  saunaCanvasDevice,
  type SaunaCanvasDeviceId,
} from "./canvas-frame";
import { canRedo, canUndo } from "./history";
import { Redo2, Undo2 } from "./icons";
import { deviceToScreen, screenToDevice } from "./screen-variants";
import type { StudioStore } from "./store";

/** A device of the canvas: desktop 1280, tablet 768, phone 375 (the id stays `mobile`). */
export type StudioDeviceId = SaunaCanvasDeviceId;

/** The viewport width of a device — what a host frame (the site theme's canvas) is given. */
export function studioDeviceWidth(id: StudioDeviceId): number {
  return saunaCanvasDevice(id).width;
}

const SEGMENT =
  "inline-flex h-6 items-center justify-center gap-1 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring";
const SEGMENT_ON = "bg-background text-foreground shadow-sm";
const ICON_BUTTON =
  "inline-flex size-7 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-35";

/**
 * Desktop / Tablet / Phone as one segmented control, icons only (the label is
 * the button's accessible name, with the width). `data-sauna-canvas-device`
 * stays on each segment — the e2e locators of the old toolbar address it.
 */
export function StudioDeviceSwitch({
  value,
  onChange,
  className,
}: {
  value: StudioDeviceId;
  onChange: (device: StudioDeviceId) => void;
  className?: string;
}): ReactNode {
  return (
    <div
      role="radiogroup"
      aria-label="Canvas device"
      data-sauna-device-switch=""
      className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5", className)}
    >
      {SAUNA_CANVAS_DEVICES.map((d) => {
        const Glyph = d.icon;
        const on = d.id === value;
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${d.label} — ${d.width}px`}
            title={`${d.label} · ${d.width}px`}
            data-sauna-canvas-device={d.id}
            data-state={on ? "on" : "off"}
            className={cn(SEGMENT, on && SEGMENT_ON)}
            onClick={() => onChange(d.id)}
          >
            <Glyph className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

/** Undo / Redo over the store's history; disabled when there is nothing to undo or redo. */
export function StudioUndoRedo({ store, disabled = false }: { store: StudioStore; disabled?: boolean }): ReactNode {
  const history = useStore(store, (s) => s.history);
  const undoable = !disabled && canUndo(history);
  const redoable = !disabled && canRedo(history);
  return (
    <div className="inline-flex shrink-0 items-center" data-sauna-undo-redo="">
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label="Undo"
        title="Undo (⌘Z)"
        disabled={!undoable}
        onClick={() => store.getState().undo()}
        data-testid="studio-undo"
      >
        <Undo2 className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className={ICON_BUTTON}
        aria-label="Redo"
        title="Redo (⇧⌘Z)"
        disabled={!redoable}
        onClick={() => store.getState().redo()}
        data-testid="studio-redo"
      >
        <Redo2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * The centre of the editor header: devices · divider · Undo / Redo, bound to
 * one Studio store. `readOnly` (preview) keeps the devices and turns the
 * history off — preview is a visitor's view, nothing is undone there.
 */
export function StudioCanvasControls({
  store,
  readOnly = false,
}: {
  store: StudioStore;
  readOnly?: boolean;
}): ReactNode {
  const screen = useStore(store, (s) => s.view.screen);
  const device: SaunaCanvasDeviceId = screen === "base" ? "desktop" : screenToDevice(screen);
  return (
    <div className="inline-flex items-center gap-2" data-sauna-canvas-controls="">
      <StudioDeviceSwitch
        value={saunaCanvasDevice(device).id}
        onChange={(next) => store.getState().setScreen(deviceToScreen(next))}
      />
      <span aria-hidden className="h-4 w-px bg-border" />
      <StudioUndoRedo store={store} disabled={readOnly} />
    </div>
  );
}
