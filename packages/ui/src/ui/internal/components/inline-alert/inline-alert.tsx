"use client";

import * as React from "react";

import { cn } from "../../utils/cn";

export type InlineAlertProps = React.ComponentProps<"div"> & {
  variant?: "default" | "destructive";
};

export function InlineAlert({
  variant = "default",
  className,
  ...props
}: InlineAlertProps) {
  return (
    <div
      className={cn(
        "rounded-md p-3 text-sm",
        variant === "destructive"
          ? "bg-destructive/15 text-destructive"
          : "bg-accent text-accent-foreground",
        className
      )}
      {...props}
    />
  );
}

