"use client";

import * as React from "react";

import { cn } from "../../internal/utils/cn";

export type ScreenHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  /** Screen title, rendered as the page `<h1>`. */
  title: React.ReactNode;
  /** Optional mono uppercase kicker line above the title. */
  kicker?: React.ReactNode;
  /** Right-aligned actions slot (buttons, links). */
  actions?: React.ReactNode;
};

/**
 * Admin screen head: title block on the left, actions on the right,
 * wrapping on narrow screens. Lifts the header row repeated across the
 * studio's list/editor screens (SDL-223). Children (when given) render as
 * a muted summary line under the title — same children-as-subtitle
 * convention as `PanelHeader`.
 */
export function ScreenHeader({
  title,
  kicker,
  actions,
  className,
  children,
  ...props
}: ScreenHeaderProps) {
  return (
    <header
      data-slot="screen-header"
      className={cn(
        "mb-[22px] flex flex-wrap items-start justify-between gap-4",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        {kicker ? (
          <div
            data-slot="screen-header-kicker"
            className="font-mono text-caption font-semibold tracking-[0.1em] text-muted-foreground uppercase"
          >
            {kicker}
          </div>
        ) : null}
        <h1
          data-slot="screen-header-title"
          className={cn("text-2xl font-bold tracking-[-0.01em]", kicker && "mt-1")}
        >
          {title}
        </h1>
        {children ? (
          <div
            data-slot="screen-header-summary"
            className="mt-1 text-sm text-muted-foreground"
          >
            {children}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div
          data-slot="screen-header-actions"
          className="flex shrink-0 items-center gap-2"
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}
