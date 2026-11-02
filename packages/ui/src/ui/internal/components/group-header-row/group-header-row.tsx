"use client";

import * as React from "react";

import { cn } from "../../utils/cn";

export type GroupHeaderRowProps = React.ComponentProps<"div">;

export function GroupHeaderRow({ className, ...props }: GroupHeaderRowProps) {
  return (
    <div
      className={cn("flex items-center gap-3 border-b pb-2 mb-2", className)}
      {...props}
    />
  );
}

