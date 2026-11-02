"use client";

import * as React from "react";

import { cn } from "../../utils/cn";

export type EmptyStateProps = React.ComponentProps<"div"> & {
  paddingY?: 4 | 6 | 8 | 10;
  align?: "center" | "start";
};

const PY_CLASS: Record<string, string> = {
  "4": "py-4",
  "6": "py-6",
  "8": "py-8",
  "10": "py-10",
};

export function EmptyState({
  paddingY = 8,
  align = "center",
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        // A flex column, not text-align alone: an icon (svg is display:block)
        // ignored text-center and sat at the left edge (EP-185).
        "flex flex-col gap-2",
        align === "center" ? "items-center text-center" : "items-start",
        PY_CLASS[String(paddingY)],
        "text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

