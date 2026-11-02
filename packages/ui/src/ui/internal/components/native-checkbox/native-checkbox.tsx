"use client";

import * as React from "react";

import { cn } from "../../utils/cn";

export type NativeCheckboxProps = Omit<
  React.ComponentProps<"input">,
  "type" | "className"
> & {
  className?: string;
};

export function NativeCheckbox({ className, ...props }: NativeCheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 rounded-[4px] border-input accent-primary outline-none",
        "hover:border-border-strong",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

