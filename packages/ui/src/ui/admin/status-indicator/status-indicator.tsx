"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../internal/utils/cn";

const statusDotVariants = cva("size-2 shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-muted-foreground/60",
      success: "bg-success",
      warning: "bg-warning",
      error: "bg-destructive",
      info: "bg-info",
    },
    pulse: {
      true: "animate-pulse",
      false: "",
    },
  },
  defaultVariants: {
    tone: "neutral",
    pulse: false,
  },
});

export type StatusIndicatorProps = React.ComponentProps<"span"> &
  VariantProps<typeof statusDotVariants>;

/**
 * Dot + label status readout (draft/published/error/…). Replaces the two
 * hand-rolled StatusPill copies. The label is the children; tone names are
 * semantic, mapped onto theme tokens — no hardcoded colors.
 */
export function StatusIndicator({
  tone,
  pulse,
  className,
  children,
  ...props
}: StatusIndicatorProps) {
  return (
    <span
      data-slot="status-indicator"
      data-tone={tone ?? "neutral"}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
      {...props}
    >
      <span aria-hidden className={statusDotVariants({ tone, pulse })} />
      {children}
    </span>
  );
}
