"use client";

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronRight } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  cn,
} from "@markerloop/ui/ui";

/**
 * The single item's value inside the per-section Accordion root. Each
 * PanelSection owns its own root (sections expand independently — the
 * EP-48 rule "several may be open at once" needs no shared state), so the
 * value never collides and never leaks into the host's API: the host
 * speaks `open`/`onOpenChange` booleans, not accordion values.
 */
const SECTION_VALUE = "section";

// `dir` is dropped along with the obvious clashes: the div's `dir?: string`
// does not satisfy the Radix root's `dir?: "ltr" | "rtl"` under the spread.
export type PanelSectionProps = Omit<
  React.ComponentProps<"div">,
  "title" | "defaultValue" | "dir"
> & {
  /** Section title, rendered as a small uppercase heading (36px header row). */
  title: React.ReactNode;
  /** Content badge shown next to the title (`1 rule`, `2`) — the collapsed
   * section's summary. */
  badge?: React.ReactNode;
  /** Right-aligned actions slot (icon buttons, menus). Lives OUTSIDE the
   * trigger — a button inside a button is invalid HTML. */
  actions?: React.ReactNode;
  /**
   * Empty-state action (`+ Add rule`), rendered in the header INSTEAD of the
   * expand toggle: an applicable-but-empty section has nothing to
   * open, so the header offers the first step instead of a chevron (EP-48,
   * "no empty placeholder panels").
   */
  emptyAction?: React.ReactNode;
  /** Non-collapsible variant (Properties): no chevron, body always shown. */
  alwaysOpen?: boolean;
  /**
   * Visual weight of the header row.
   *
   * `section` (default) — a top-level section of the panel: 36px header on
   * the panel's own surface.
   *
   * `group` — a band INSIDE a section, for the groups a section's body is
   * split into (the properties panel's Content / Appearance / Layout …).
   * 28px, tinted, dimmer title, full-bleed: a group must not read like
   * another section, and — the failure this variant exists for — it must
   * not read like one of the field labels underneath it either.
   */
  variant?: "section" | "group";
  /** Controlled expansion. Leave undefined for uncontrolled (`defaultOpen`). */
  open?: boolean;
  /** Uncontrolled initial expansion; sections start open by default. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * A section of the editor's right-hand panel (EP-48 / SDL-284): 36px header
 * (12px chevron, uppercase title, badge, actions) over a `p-3` body,
 * built on the kit's Accordion so Studio never assembles folding behavior
 * by hand. Pure chrome — expansion persistence and section applicability
 * live in the host. Not part of the schema catalog (D1).
 *
 * Composes the Radix Header/Trigger directly rather than the public
 * `AccordionTrigger`: that one is the public accordion's look (text-sm,
 * py-4, its own right-hand chevron) while this header is the admin 36px
 * row with a 12px chevron on the LEFT and an actions slot that must stay
 * outside the trigger button.
 */
export function PanelSection({
  title,
  badge,
  actions,
  emptyAction,
  alwaysOpen = false,
  variant = "section",
  open,
  defaultOpen = true,
  onOpenChange,
  className,
  children,
  ...props
}: PanelSectionProps) {
  const isEmpty = emptyAction != null;
  const isGroup = variant === "group";
  // A group band is shorter, tinted and bounded; a section header sits on
  // the panel surface and is separated by the section's own bottom border.
  const headerCls = isGroup
    ? "flex h-7 shrink-0 items-center gap-1.5 border-b bg-muted/50 pr-2 pl-3"
    : "flex h-9 shrink-0 items-center gap-1.5 pr-2 pl-3";
  const titleCls = isGroup
    ? "truncate text-caption font-semibold tracking-wider text-muted-foreground/80 uppercase"
    : "truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase";
  // Longhands only (SDL-420). A padding shorthand written next to a longhand
  // of the same property makes this element depend on stylesheet ORDER: the
  // longhand exists only in the kit's sheet, while the shorthand is also
  // emitted by any consuming app that happens to use it, and the later sheet
  // wins. Measured in Studio — padding-top became 12px where the source asked
  // for 0. Naming every side explicitly leaves nothing to override.
  //
  // Do not write the offending pair out even as an example: the guard in
  // src/__tests__/cascade-shorthand.test.ts scans raw source and reads
  // backtick-quoted text as a template literal, so a comment can trip it.
  const bodyCls = isGroup ? "p-3" : "pr-3 pb-3 pl-3";

  const heading = (
    <>
      <span
        data-slot="panel-section-title"
        className={titleCls}
        title={typeof title === "string" ? title : undefined}
      >
        {title}
      </span>
      {badge != null ? (
        <span
          data-slot="panel-section-badge"
          className="flex shrink-0 items-center"
        >
          {badge}
        </span>
      ) : null}
    </>
  );

  // Empty and always-open sections have no chevron, but their titles must
  // stay in one column with collapsible siblings — same placeholder trick
  // as TreeRow's non-expandable rows.
  if (alwaysOpen || isEmpty) {
    return (
      <div
        data-slot="panel-section"
        data-variant={isGroup ? "group" : undefined}
        data-always-open={alwaysOpen || undefined}
        data-empty={isEmpty || undefined}
        className={cn("border-b last:border-b-0", className)}
        {...props}
      >
        <div data-slot="panel-section-header" className={headerCls}>
          <span aria-hidden className="size-3 shrink-0" />
          {heading}
          {emptyAction != null || actions != null ? (
            <div
              data-slot="panel-section-actions"
              className="ml-auto flex shrink-0 items-center gap-1"
            >
              {emptyAction}
              {actions}
            </div>
          ) : null}
        </div>
        {alwaysOpen ? (
          <div data-slot="panel-section-body" className={cn(bodyCls, "text-sm")}>
            {children}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Accordion
      data-slot="panel-section"
      data-variant={isGroup ? "group" : undefined}
      {...props}
      className={cn("border-b last:border-b-0", className)}
      {...(open !== undefined
        ? { value: open ? [SECTION_VALUE] : [] }
        : { defaultValue: defaultOpen ? [SECTION_VALUE] : [] })}
      onValueChange={(value: string[]) =>
        onOpenChange?.(value.includes(SECTION_VALUE))
      }
    >
      <AccordionItem value={SECTION_VALUE} className="border-b-0">
        <AccordionPrimitive.Header
          data-slot="panel-section-header"
          className={headerCls}
        >
          <AccordionPrimitive.Trigger
            data-slot="panel-section-trigger"
            className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] [&[data-state=open]>svg]:rotate-90"
          >
            <ChevronRight className="size-3 shrink-0 text-muted-foreground transition-transform" />
            {heading}
          </AccordionPrimitive.Trigger>
          {actions != null ? (
            <div
              data-slot="panel-section-actions"
              className="flex shrink-0 items-center gap-1"
            >
              {actions}
            </div>
          ) : null}
        </AccordionPrimitive.Header>
        <AccordionContent data-slot="panel-section-body" className={bodyCls}>
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
