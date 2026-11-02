"use client";

// The editor frame's header (EP-187, layer 5; owner's header variant B, 30 Oct
// 2026): ONE header for the three full-screen editors — page, component and
// site theme. A flat 48px row across the whole width with a bottom border
// only: no card, no shadow, no uppercase type label.
//
//   left   — back to the section · what it is (kind icon) · the name with its
//            ▾ menu · the save status
//   centre — what belongs to the canvas: devices, Undo / Redo
//   right  — what this editor has of its own: a status line, History,
//            Preview, the primary action
//
// The editors put their own testids on the slots (`testId`, `back.testId`,
// `nameTestId`): e2e, flow shots and smokes address the old headers by them.
// Below 768px the row may wrap in two; the centre is not drawn — the phone
// canvas is already the phone, and the device switch is not offered there.

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, Component, FileText, Palette } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

export type EditorFrameKind = "page" | "component" | "theme";

/** The kind's glyph: a page, the purple component mark, a palette. */
export function EditorKindIcon({ kind }: { kind: EditorFrameKind }) {
  const Glyph = kind === "page" ? FileText : kind === "component" ? Component : Palette;
  return (
    <span
      aria-hidden="true"
      data-editor-kind-icon={kind}
      className={UI.cn("inline-flex shrink-0 items-center", kind === "component" ? "text-component" : "text-muted-foreground")}
    >
      <Glyph size={16} />
    </span>
  );
}

/**
 * The ▾ next to the name. A plain button so a host can wrap it in its own
 * menu (`UI.Menu.Trigger asChild`) — the page's address menu, the
 * component's rename.
 */
export const EditorNameMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }
>(function EditorNameMenuButton({ label, className, ...rest }, ref) {
  return (
    <UI.Button
      ref={ref}
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      className={UI.cn("-ml-1 shrink-0 text-muted-foreground", className)}
      {...rest}
    >
      <ChevronDown size={14} aria-hidden="true" />
    </UI.Button>
  );
});

export type EditorFrameProps = {
  kind: EditorFrameKind;
  /** The header's own testid (`studio-doc-header`, `block-editor-header`, `theme-editor-header`). */
  testId: string;
  back: {
    href: string;
    /** Accessible name of the back button: the section it leads to. */
    label: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    testId: string;
  };
  /** The document's name. A node, so the component editor can put its inline rename field here. */
  name: React.ReactNode;
  /** The full name, for the tooltip of a name cut by the ellipsis. */
  fullName?: string;
  nameTestId: string;
  /** The ▾ menu (trigger and content), drawn right after the name. */
  nameMenu?: React.ReactNode;
  /** The save status (the one EditorSaveStatus of the editors). */
  saveStatus?: React.ReactNode;
  /** The canvas controls: devices · Undo / Redo. Not drawn below 768px. */
  center?: React.ReactNode;
  /** A status line of the right side: publication, usage, «Live». */
  status?: React.ReactNode;
  /** History, Preview, the primary action — in that order. */
  actions?: React.ReactNode;
};

export function EditorFrame({
  kind,
  testId,
  back,
  name,
  fullName,
  nameTestId,
  nameMenu,
  saveStatus,
  center,
  status,
  actions,
}: EditorFrameProps) {
  return (
    <header
      data-testid={testId}
      data-editor-frame={kind}
      className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-background px-2 py-1.5 text-foreground md:flex-nowrap md:py-0"
    >
      {/* Below 768px the left side is a row of its own (the header wraps in
          two), so the name keeps its room and the right side's status never
          lands on the save status. From 768px it may shrink — the name
          truncates — instead of overflowing into the centre. */}
      <div className="flex min-w-0 items-center gap-1.5 max-md:basis-full md:flex-initial" data-editor-frame-slot="left">
        <UI.Button asChild variant="ghost" size="icon-sm" className="shrink-0">
          <Link href={back.href} onClick={back.onClick} aria-label={back.label} title={back.label} data-testid={back.testId}>
            <ChevronLeft size={18} aria-hidden="true" />
          </Link>
        </UI.Button>
        <EditorKindIcon kind={kind} />
        <span
          className="min-w-12 max-w-[220px] shrink truncate text-sm font-semibold"
          title={fullName}
          data-testid={nameTestId}
        >
          {name}
        </span>
        {nameMenu}
        {saveStatus ? <span className="flex shrink-0 items-center">{saveStatus}</span> : null}
      </div>

      {center ? (
        // Never narrower than its controls: the left side gives way (the
        // name truncates), the canvas controls do not slide under the status.
        <div className="hidden flex-1 items-center justify-center md:flex" data-editor-frame-slot="center">
          {center}
        </div>
      ) : (
        <div className="hidden flex-1 md:block" aria-hidden="true" />
      )}

      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5 md:shrink-0 md:flex-nowrap" data-editor-frame-slot="right">
        {status}
        {actions}
      </div>
    </header>
  );
}

/** An icon button of the header's right side (History, Preview). */
export const EditorIconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean }
>(function EditorIconButton({ label, pressed, className, children, ...rest }, ref) {
  return (
    <UI.Button
      ref={ref}
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={UI.cn("shrink-0", className)}
      {...rest}
    >
      {children}
    </UI.Button>
  );
});
