"use client";

import * as React from "react";

import { cn } from "../../utils/cn";

export type CodePillProps = React.ComponentProps<"span">;

export function CodePill({ className, ...props }: CodePillProps) {
  return (
    <span
      className={cn("font-mono bg-muted px-2 py-1 rounded mx-1", className)}
      {...props}
    />
  );
}

