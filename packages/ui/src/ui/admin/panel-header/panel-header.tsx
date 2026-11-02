"use client";

import * as React from "react";

import { cn } from "../../internal/utils/cn";

export type PanelHeaderProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** Zone title, rendered as a small uppercase heading. */
  title: React.ReactNode;
  /** Right-aligned actions slot (icon buttons, menus). */
  actions?: React.ReactNode;
};

/**
 * Header of an admin panel zone. Replaces the ad-hoc header row that was
 * copy-pasted across six editor files. Children (when given) render as a
 * subtitle line under the title.
 */
export function PanelHeader({
  title,
  actions,
  className,
  children,
  ...props
}: PanelHeaderProps) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex shrink-0 items-center gap-2 border-b px-3 py-2",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <div
          data-slot="panel-header-title"
          className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </div>
        {children ? (
          <div
            data-slot="panel-header-subtitle"
            className="truncate text-xs text-muted-foreground/70"
          >
            {children}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div
          data-slot="panel-header-actions"
          className="flex shrink-0 items-center gap-1"
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
