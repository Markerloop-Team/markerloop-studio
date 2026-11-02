"use client";

// The Group field of a Component (EP-175, layer 6). A group is only a label
// on a Component — there is no list of groups to manage: the field offers
// the groups the workspace's Components already carry, and typing a name
// that none of them has offers «Create group "X"». The same field sits in
// "Save as component" (this package), the admin's "Move to group" dialog and
// the component editor's name menu, so the behaviour is one piece of code.

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FormControl } from "@markerloop/ui/ui";
import { saunaGroupOptions, type SaunaGroupOption } from "./group-options";

export { saunaComponentGroups, saunaGroupOptions, type SaunaGroupOption } from "./group-options";

export type SaunaGroupFieldProps = {
  /** The groups the workspace already has. */
  groups: readonly string[];
  /** The group being set; "" — no group. */
  value: string;
  onChange: (group: string) => void;
  /** Accessible name of the input. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Opens the list at mount (a dialog whose only job is this field). */
  defaultOpen?: boolean;
  /** Test hooks: the input, and the «Create group» option. */
  inputTestId?: string;
  createTestId?: string;
  /** Copy, for a host that translates (defaults are the product's English). */
  texts?: { noGroup?: string; create?: (group: string) => string; hint?: string; empty?: string };
};

/**
 * A combobox over the workspace's groups. The text in the input IS the value:
 * typing a new name and confirming the dialog creates the group, picking an
 * option fills the input with it and closes the list.
 */
export function SaunaGroupField({
  groups,
  value,
  onChange,
  label = "Group",
  placeholder = "No group",
  disabled = false,
  id,
  defaultOpen = false,
  inputTestId,
  createTestId,
  texts,
}: SaunaGroupFieldProps): ReactNode {
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState(-1);
  // Until the person types, the list offers every group — the field may open
  // holding the current one, and filtering by it would hide the others.
  const [typed, setTyped] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const options = useMemo(() => saunaGroupOptions(groups, typed ? value : ""), [groups, value, typed]);
  const noGroup = texts?.noGroup ?? "No group";
  const createLabel = texts?.create ?? ((group: string) => `Create group “${group}”`);

  const pick = (option: SaunaGroupOption) => {
    onChange(option.kind === "none" ? "" : option.group);
    setTyped(false);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      pick(options[active]);
    } else if (e.key === "Escape" && open) {
      // The list closes first; a second Escape reaches the dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative min-w-0" data-sauna-group-field="">
      <FormControl.Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={200}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        data-sauna-group-input=""
        data-testid={inputTestId}
      />
      {open && !disabled ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          data-sauna-group-list=""
        >
          {options.map((option, index) => {
            const text =
              option.kind === "none" ? noGroup : option.kind === "create" ? createLabel(option.group) : option.group;
            const selected =
              option.kind === "group"
                ? option.group.toLowerCase() === value.trim().toLowerCase()
                : option.kind === "none" && !value.trim();
            return (
              <button
                key={`${option.kind}:${option.kind === "none" ? "" : option.group}`}
                type="button"
                role="option"
                aria-selected={selected}
                // mousedown, not click: the input keeps focus, so the list
                // does not close on blur before the pick lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent ${index === active ? "bg-accent" : ""} ${option.kind === "create" ? "text-primary" : ""}`}
                data-sauna-group-option={option.kind}
                data-testid={option.kind === "create" ? createTestId : undefined}
              >
                <span aria-hidden="true" className="w-3.5 shrink-0 text-center">
                  {option.kind === "create" ? "+" : selected ? "✓" : ""}
                </span>
                <span className="min-w-0 truncate">{text}</span>
              </button>
            );
          })}
          {!typed || !value.trim() ? (
            <p className="px-2 pb-1 pt-1.5 text-xs text-muted-foreground">
              {groups.length === 0
                ? (texts?.empty ?? "No groups yet — type a name to create one.")
                : (texts?.hint ?? "Type a new name to create a group.")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
