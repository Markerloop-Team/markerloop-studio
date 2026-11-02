"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "../../internal/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../internal/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../internal/components/popover";
import { cn } from "../../internal/utils/cn";

export type ComboboxOption = {
  value: string;
  label: string;
  /** Kept out of the filter and the trigger; rendered dimmed after the label. */
  hint?: string;
  disabled?: boolean;
};

export type ComboboxProps = {
  options: ComboboxOption[];
  value?: string;
  onValueChange?: (value: string) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  /** Placeholder of the search input inside the popover. */
  searchPlaceholder?: string;
  /** Text shown when the search matches nothing. */
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
};

/**
 * Searchable single-select: Popover + Command, hand-assembled (the shadcn
 * registry combobox is Base-UI-only — S1.5 skipped it on purpose). Replaces
 * the three ad-hoc filter-select copies in the editor panels. Selecting the
 * current value clears the selection (deselect toggle).
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "Nothing found.",
  disabled,
  className,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-slot="combobox-trigger"
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            className
          )}
          {...props}
        >
          <span className="truncate">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-40 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    onValueChange?.(
                      option.value === value ? "" : option.value
                    );
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      option.value === value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="text-muted-foreground ml-auto truncate text-xs">
                      {option.hint}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
