"use client";

import * as React from "react";

import { cn } from "../../internal/utils/cn";

export type UrlChipProps = React.ComponentProps<"a">;

/**
 * Compact mono link chip for a document toolbar (public path, preview
 * link). Label is the children, truncated at 18ch; the external-link arrow
 * is decorative. Opens in a new tab by default — pass your own
 * `target`/`rel` to override.
 */
export function UrlChip({ className, children, ...props }: UrlChipProps) {
  return (
    <a
      data-slot="url-chip"
      target="_blank"
      rel="noreferrer"
      className={cn(
        "border-border bg-card text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex flex-none items-center gap-1 rounded-md border px-[9px] py-1 font-mono text-caption no-underline outline-none focus-visible:ring-[3px]",
        className
      )}
      {...props}
    >
      <span className="max-w-[18ch] truncate">{children}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
