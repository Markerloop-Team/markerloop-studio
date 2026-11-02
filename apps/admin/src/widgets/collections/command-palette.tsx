"use client";

// CommandPalette — minimal ⌘K palette for the admin shell.
//
// Plain HTML overlay (no Radix Dialog, no fuzzy search library) keyed
// off the host page's open state. Caller passes a flat list of commands;
// we filter by case-insensitive substring against title + hint. ↑/↓
// navigate, Enter runs.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { Text } from "@markerloop/ui/ui";

export interface CommandPaletteCommand {
  id: string;
  title: string;
  /** Secondary line shown under the title — collection name, type, etc. */
  hint?: string;
  /** Optional grouping label so related commands cluster visually. */
  group?: string;
  /** Run the command. The palette closes itself via onClose. */
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: readonly CommandPaletteCommand[];
  labels?: {
    placeholder?: string;
    empty?: string;
    open?: string;
  };
}

/** 15px sits between the kit's sm/md text steps — kept inline. */
const paletteInputFontStyle: CSSProperties = {
  fontSize: 15,
};

const itemClass =
  "flex w-full cursor-pointer flex-col border-b border-border/50 px-4 py-2.5 text-left";

export function CommandPalette({
  open,
  onClose,
  commands,
  labels,
}: CommandPaletteProps): ReactNode {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return commands;
    return commands.filter((c) =>
      `${c.title} ${c.hint ?? ""}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Reset position whenever the open state flips, and refocus input.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Defer to next tick so the input is in the DOM.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Esc closes from anywhere in the palette.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) {
        cmd.run();
        onClose();
      }
    }
  };

  // Group commands while preserving the caller's ordering.
  const groups = new Map<string, CommandPaletteCommand[]>();
  filtered.forEach((c) => {
    const key = c.group ?? "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  });

  let renderIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels?.open ?? "Command palette"}
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/45 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[70vh] w-[560px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[0_24px_64px_-12px_rgba(0,0,0,0.35)]"
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder={labels?.placeholder ?? "Type a command…"}
          className="w-full border-b border-border px-4 py-3.5 outline-none"
          style={paletteInputFontStyle}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <Text variant="muted" size="sm" className="p-5 text-center">
              {labels?.empty ?? "No matches."}
            </Text>
          ) : (
            Array.from(groups.entries()).map(([groupKey, items]) => (
              <div key={groupKey || "default"}>
                {groupKey ? (
                  <Text as="div" variant="label" className="px-4 pb-1 pt-2">
                    {groupKey}
                  </Text>
                ) : null}
                {items.map((c) => {
                  renderIndex++;
                  const idx = renderIndex;
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        c.run();
                        onClose();
                      }}
                      className={`${itemClass}${active ? " bg-accent text-accent-foreground" : ""}`}
                    >
                      <Text as="span" size="sm" weight="medium">
                        {c.title}
                      </Text>
                      {c.hint ? (
                        <Text
                          as="span"
                          size="xs"
                          variant={active ? "default" : "muted"}
                        >
                          {c.hint}
                        </Text>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
