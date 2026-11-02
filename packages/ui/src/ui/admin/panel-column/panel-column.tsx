"use client";

import * as React from "react";

import { ScrollArea } from "../../internal/components/scroll-area";
import { cn } from "../../internal/utils/cn";
import { PanelHeader, type PanelHeaderProps } from "../panel-header/panel-header";

export type PanelColumnProps = React.ComponentProps<"div">;

/**
 * Vertical editor column: fixed header + scrollable body + optional fixed
 * footer. Replaces the six hand-rolled `Section` copies. Sizing is owned by
 * the parent (flex/grid or a ResizablePanel) — the column just fills it.
 */
export function PanelColumn({ className, ...props }: PanelColumnProps) {
  return (
    <div
      data-slot="panel-column"
      className={cn(
        "bg-background flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r last:border-r-0",
        className
      )}
      {...props}
    />
  );
}

export type PanelColumnHeaderProps = PanelHeaderProps;

/** Column header — a thin alias over PanelHeader for compound readability. */
export function PanelColumnHeader(props: PanelColumnHeaderProps) {
  return <PanelHeader data-slot="panel-column-header" {...props} />;
}

export type PanelColumnBodyProps = React.ComponentProps<typeof ScrollArea>;

/**
 * Vertically scrollable body; the only part of the column that scrolls
 * vertically. Horizontal reach is the `-pan` wrapper's job, see below.
 *
 * The arbitrary variant re-declares the wrapper Radix puts between its
 * viewport and our children. Radix hard-codes `display: table` on that div
 * (an inline style, hence `block!`), which is shrink-to-fit: the wrapper —
 * and every panel in it — grows to the widest line instead of stopping at
 * the column. Restoring `table` inline still measures as a loss even with
 * the pan wrapper below in place: the aside column's three stacked panels go
 * 3197px wide inside a 319px viewport and 585px of a 120-char variant id
 * (66%) go unreachable; the outline column goes 259px client / 943px scroll
 * and its tree label — which as `block` ellipsises inside a 197px box —
 * stretches to 881px with 672 of them unreachable. As `block` every panel is
 * 319px and absorbs its own overflow.
 *
 * The `-pan` wrapper is what stops the primitive from losing content
 * depending on who mounts it. ScrollArea declares no horizontal ScrollBar,
 * so Radix sets `overflow-x: hidden` on the viewport: any child too wide to
 * shrink, wrap or ellipsize was clipped with no way to reach it. Measured in
 * the properties column, which mounts this component directly: 295px client
 * / 844px scroll on the viewport, `maxScrollLeft` 549 sitting behind
 * `overflow-x: hidden`, and 541 of the 832px type pill (65%) unreachable at
 * any user-driven scroll position. With the wrapper the same pill measures 0
 * unreachable px. Consumers that already wrap their own scroller (the
 * StudioPanel stack in the aside column) keep panning locally: the wrapper
 * there measures 319px client / 319px scroll, `maxScrollLeft` 0, so a wide
 * value in one panel never drags the whole stack sideways.
 */
export function PanelColumnBody({
  className,
  children,
  ...props
}: PanelColumnBodyProps) {
  return (
    <ScrollArea
      data-slot="panel-column-body"
      className={cn(
        "min-h-0 flex-1 [&>[data-radix-scroll-area-viewport]>*]:block!",
        className
      )}
      {...props}
    >
      <div data-slot="panel-column-body-pan" className="overflow-x-auto">
        {children}
      </div>
    </ScrollArea>
  );
}

export type PanelColumnFooterProps = React.ComponentProps<"div">;

/** Fixed footer under the scroll body (apply/cancel rows, hints). */
export function PanelColumnFooter({
  className,
  ...props
}: PanelColumnFooterProps) {
  return (
    <div
      data-slot="panel-column-footer"
      className={cn("shrink-0 border-t px-3 py-2", className)}
      {...props}
    />
  );
}
