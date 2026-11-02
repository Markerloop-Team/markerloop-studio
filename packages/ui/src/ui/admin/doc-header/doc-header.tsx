"use client";

import * as React from "react";

import { cn } from "../../internal/utils/cn";

export type DocHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  /** Leading slot before the identity block (back button/link). */
  back?: React.ReactNode;
  /** Mono uppercase kind label before the document name (Page/Component). */
  kicker?: React.ReactNode;
  /** Document name, mono, truncated. */
  title: React.ReactNode;
  /** Right-aligned slot pushed to the far edge (url chips, publish). */
  actions?: React.ReactNode;
};

/**
 * Editor document header: a floating card-toolbar above the editor grid —
 * back control, kind kicker + mono document name, then inline live state
 * (children: save chip, version tag) and a far-right actions slot. Lifts
 * the studio's desktop document toolbar (SDL-223) with the state wired by
 * the host: the header owns layout only, every slot is a ReactNode.
 */
export function DocHeader({
  back,
  kicker,
  title,
  actions,
  className,
  children,
  ...props
}: DocHeaderProps) {
  return (
    <header
      data-slot="doc-header"
      className={cn(
        "bg-card mx-3 mt-3 mb-1 flex items-center gap-[13px] rounded-xl border px-4 py-2 text-sm shadow-sm",
        className
      )}
      {...props}
    >
      {back}
      <div className="flex min-w-0 items-baseline gap-2">
        {kicker ? (
          <span
            data-slot="doc-header-kicker"
            className="text-muted-foreground font-mono text-caption tracking-[0.09em] uppercase"
          >
            {kicker}
          </span>
        ) : null}
        <span
          data-slot="doc-header-title"
          className="truncate font-mono text-sm font-semibold"
        >
          {title}
        </span>
      </div>
      {children}
      {actions ? (
        <span
          data-slot="doc-header-actions"
          className="ml-auto flex items-center gap-2"
        >
          {actions}
        </span>
      ) : null}
    </header>
  );
}
