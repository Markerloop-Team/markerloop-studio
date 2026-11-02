"use client";

// ItemPanel — the admin's ONE side panel for a single item of a list
// (EP-186, layer 3, pattern 3b): a record, a file, a Block's "Where used".
// Editors (page, block, theme) keep the studio's right column instead; this
// is for "open one thing from a list, look at it, change it, delete it".
//
//   header — the item's name (+ an optional close button)
//   body   — groups: a small uppercase muted heading over its fields
//   footer — Delete on the LEFT (ghost-destructive), the actions on the RIGHT
//            (secondary ones first, the primary — Save — last)
//
// Built on the kit's Sheet (side="right"), so Esc, an outside click, the
// focus trap and stacking under a dialog opened from inside it (the files
// picker of an image field, the delete question) are Radix's: Esc closes only
// the topmost layer.
//
// Two halves, for the same reason as every dialog body in the admin: the
// kit's Sheet content is portalled and renders nothing under
// react-dom/server. ItemPanel is the shell (Sheet + accessible name);
// ItemPanelFrame is the header/body/footer layout the smokes render. It is
// presentational and takes its strings as props — it also renders inside
// widgets/collections, which runs in smoke:collections without next-intl.

import * as React from "react";
import { X } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

/**
 * Whether a keydown should close the panel. An Escape that a layer opened ON
 * TOP of the panel already handled (a Radix dialog dismisses itself and calls
 * preventDefault without stopping the event) belongs to that layer: closing
 * the panel as well would throw away what is being typed (SDL-625 review).
 */
export function isItemPanelDismissKey(e: Pick<KeyboardEvent, "key" | "defaultPrevented">): boolean {
  return e.key === "Escape" && !e.defaultPrevented;
}

export type ItemPanelWidth = "md" | "lg";

// Full width on a phone; 480px (md) or 560px (lg) from `sm`. The kit's
// side=right default is w-3/4 + sm:max-w-sm, overridden on the same variant.
const WIDTH_CLASS: Record<ItemPanelWidth, string> = {
  md: "data-[side=right]:w-full data-[side=right]:sm:max-w-[480px]",
  lg: "data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]",
};

export interface ItemPanelProps {
  open: boolean;
  onClose: () => void;
  /** The panel's accessible name — the item's name or what the panel is for. */
  ariaLabel: string;
  /** Usually an ItemPanelFrame (or a component that renders one). */
  children: React.ReactNode;
  width?: ItemPanelWidth;
  testId?: string;
}

export function ItemPanel({ open, onClose, ariaLabel, children, width = "md", testId }: ItemPanelProps) {
  return (
    <UI.Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <UI.Sheet.Content
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        data-testid={testId}
        data-item-panel=""
        className={`gap-0 p-0 ${WIDTH_CLASS[width]} max-w-[100vw]`}
        onEscapeKeyDown={(e) => {
          if (!isItemPanelDismissKey(e)) e.preventDefault();
        }}
        // A click on a toast is not a click "outside the record": closing the
        // panel there would throw away what is being typed.
        onInteractOutside={(e) => {
          const target = e.target as Element | null;
          if (target?.closest?.("[data-sonner-toaster]")) e.preventDefault();
        }}
      >
        {/* The name Radix requires; the visible heading lives in the frame. */}
        <UI.Sheet.Title className="sr-only">{ariaLabel}</UI.Sheet.Title>
        {children}
      </UI.Sheet.Content>
    </UI.Sheet>
  );
}

export interface ItemPanelFrameProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title" | "onSubmit"> {
  /** The item's name, as the list shows it. */
  title: React.ReactNode;
  /** A muted line under the name (type · size, the record key). */
  description?: React.ReactNode;
  /** A close button in the header — only when both are given. */
  onClose?: () => void;
  closeLabel?: string;
  closeTestId?: string;
  /** The body: ItemPanelGroup sections or any content. */
  children: React.ReactNode;
  /** Footer, left: the Delete button (ghost-destructive). */
  deleteAction?: React.ReactNode;
  /** Footer, right: secondary actions, then the primary one. */
  actions?: React.ReactNode;
  /** `form` makes the whole panel the form, so Enter in a field submits. */
  as?: "div" | "form";
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  titleAttr?: string;
  /**
   * `follow`: the footer comes right after a short body instead of at the
   * bottom of the panel — a three-field form must not read as fields at the
   * top and buttons 600px below (SDL-460). Body and footer then scroll as one.
   */
  footerPlacement?: "pinned" | "follow";
  /** Extra attributes for the footer row (an e2e geometry marker). */
  footerProps?: Record<`data-${string}`, string>;
}

export function ItemPanelFrame({
  title,
  description,
  onClose,
  closeLabel,
  closeTestId = "item-panel-close",
  children,
  deleteAction,
  actions,
  as = "div",
  onSubmit,
  titleAttr,
  footerPlacement = "pinned",
  footerProps,
  className,
  ...rest
}: ItemPanelFrameProps) {
  const hasFooter = !!deleteAction || !!actions;
  const follow = footerPlacement === "follow";
  const body = (
    <div
      className={`flex min-w-0 flex-col gap-5 px-5 py-4 ${follow ? "" : "min-h-0 flex-1 overflow-y-auto"}`}
      data-slot="item-panel-body"
    >
      {children}
    </div>
  );
  const footer = hasFooter ? (
    <div
      {...footerProps}
      className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3"
      data-slot="item-panel-footer"
    >
      <div className="flex min-w-0 items-center gap-2" data-slot="item-panel-footer-start">
        {deleteAction}
      </div>
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2" data-slot="item-panel-footer-end">
        {actions}
      </div>
    </div>
  ) : null;
  const rootClass = `flex h-full min-h-0 min-w-0 flex-col ${className ?? ""}`;
  const content = (
    <>
      <div className="flex min-w-0 items-start gap-3 border-b border-border px-5 py-4" data-slot="item-panel-header">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* min-w-0 + truncate: a long unbroken name must not push the close
              button out of the panel (SDL-652); the full name is its title. */}
          <UI.Text
            as="h2"
            size="md"
            weight="semibold"
            className="min-w-0 truncate"
            title={titleAttr}
            data-slot="item-panel-title"
          >
            {title}
          </UI.Text>
          {description ? (
            <UI.Text as="div" size="sm" variant="muted" className="min-w-0 break-words" data-slot="item-panel-description">
              {description}
            </UI.Text>
          ) : null}
        </div>
        {onClose && closeLabel ? (
          <UI.Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={closeLabel}
            onClick={onClose}
            data-testid={closeTestId}
          >
            <X size={16} aria-hidden="true" />
          </UI.Button>
        ) : null}
      </div>

      {footerPlacement === "follow" ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" data-slot="item-panel-scroll">
          {body}
          {footer}
        </div>
      ) : (
        <>
          {body}
          {footer}
        </>
      )}
    </>
  );
  if (as === "form") {
    return (
      <form {...(rest as React.HTMLAttributes<HTMLFormElement>)} onSubmit={onSubmit} className={rootClass} data-item-panel-frame="">
        {content}
      </form>
    );
  }
  return (
    <div {...(rest as React.HTMLAttributes<HTMLDivElement>)} className={rootClass} data-item-panel-frame="">
      {content}
    </div>
  );
}

/** A group of the panel's body: a small uppercase muted heading over its fields. */
export function ItemPanelGroup({
  title,
  children,
  testId,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid={testId} data-slot="item-panel-group">
      {title ? (
        <UI.Text as="h3" variant="kicker" data-slot="item-panel-group-title">
          {title}
        </UI.Text>
      ) : null}
      {children}
    </section>
  );
}

/** A note in the body when there is nothing to frame yet (loading, not found). */
export function ItemPanelMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6">
      <UI.Text variant="muted" size="sm">
        {children}
      </UI.Text>
    </div>
  );
}

ItemPanel.Frame = ItemPanelFrame;
ItemPanel.Group = ItemPanelGroup;
ItemPanel.Message = ItemPanelMessage;
