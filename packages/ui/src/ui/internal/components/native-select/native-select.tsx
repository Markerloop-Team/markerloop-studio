"use client";

import * as React from "react";

import { cn } from "../../utils/cn";

export type NativeSelectProps = Omit<React.ComponentProps<"select">, "className"> & {
  className?: string;
};

/**
 * Themed native `<select>` — the sibling of `NativeCheckbox`.
 *
 * `Select` (Radix) is the default for product surfaces, but it renders a
 * button plus a portalled listbox: it is not an `HTMLSelectElement`, so the
 * platform form APIs do not reach it — no `.value` assignment, no OS picker
 * on mobile, and no Playwright `selectOption()`. Editor panels are driven by
 * exactly those APIs (the S0.4 safety net selects options this way), so they
 * need the real element rather than an ARIA re-implementation of it.
 *
 * Styling mirrors `Input` so a dropdown and a text field line up in the same
 * form row; the native chevron is kept on purpose (no `appearance-none`) —
 * without a portal there is nothing to draw a custom one over.
 */
export function NativeSelect({ className, ...props }: NativeSelectProps) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-2 py-1 max-md:text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm",
        "dark:bg-input/30 hover:border-border-strong",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
