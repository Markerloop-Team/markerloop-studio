"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Button } from "../button";
import { Input } from "../input";

export type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  /** Accessible name of the clear button. The host passes its catalogue string. */
  clearLabel?: string;
  maxWidth?: number;
  /**
   * Extra attributes for the `<input>` itself — a host's test hook
   * (`data-testid`), an `id` for a label. Value, type and change handling
   * stay owned by the field.
   */
  inputProps?: Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "placeholder" | "aria-label">;
};

export function SearchField({
  value,
  onChange,
  onClear,
  placeholder,
  ariaLabel,
  clearLabel,
  maxWidth,
  inputProps,
}: SearchFieldProps) {
  const canClear = value.length > 0;

  return (
    <div className="relative flex-1" style={typeof maxWidth === "number" ? { maxWidth } : undefined}>
      <Search
        size={16}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        {...inputProps}
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        leftInset="icon"
        suppressHydrationWarning
      />
      {canClear && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={onClear ?? (() => onChange(""))}
          aria-label={clearLabel ?? "Clear"}
          suppressHydrationWarning
        >
          <X size={14} />
        </Button>
      )}
    </div>
  );
}
