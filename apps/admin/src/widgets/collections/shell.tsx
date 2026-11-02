"use client";

// Two-column admin shell (made responsive in SDL-452).
//
// Layout by viewport:
//
//   ≥1024px (lg)        768–1023px (md)        <768px
//   ┌──────┬────────┐   ┌──┬──────────────┐   ┌──────────────┐
//   │ list │  main  │   │▮ │     main     │   │     main     │
//   │260px │        │   │56│              │   │  full width  │
//   └──────┴────────┘   └──┴──────────────┘   └──────────────┘
//
// The desktop model is untouched — the audit (21 Aug 2026) called it the
// good part. Below `lg` the 260px list is what makes the working pane
// unusable: the admin chrome already takes 64px of a 390px phone, so a
// fixed list column left the data/schema/API pane ~66px wide, i.e. off
// screen in practice. So below `lg` the list stops being a column:
//
//   - tablet keeps a 56px rail (icons only) so switching collections is
//     still one click away — that is what the `rail` slot is for;
//   - both tablet and mobile get a drawer with the full list, opened from
//     a button that sits above the working pane.
//
// The shell stays dumb about data: it owns layout and the drawer's
// open/closed flag, nothing else. It also does not know what a selection
// is — the drawer closes on any click inside its body, which covers both
// "picked a collection" and "pressed + New" (that one navigates away).
//
// Wiring (current workspace, selected collection, modals) lives in the
// page that renders it — keeps the shell free of routing or store
// coupling, so it can be embedded anywhere with its own data flow.

import { useState, type ReactNode } from "react";

import {
  Button,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@markerloop/ui/ui";

export interface CollectionsShellProps {
  /** Sidebar slot — the full list. Desktop column and drawer body. */
  sidebar: ReactNode;
  /**
   * Compact tablet rail (768–1023px). Typically the same list rendered
   * with `variant="rail"`. Falls back to `sidebar` when omitted, which
   * only degrades the tablet width — mobile never renders this slot.
   */
  rail?: ReactNode;
  /** Main pane slot — table, form, or editor depending on selection. */
  main: ReactNode;
  /** Copy for the responsive affordances (i18n). */
  labels?: {
    /** Button that opens the drawer, and the drawer's own title. */
    openList?: string;
  };
  /** Optional Tailwind classes merged onto the root grid. */
  className?: string;
}

export function CollectionsShell({
  sidebar,
  rail,
  main,
  labels,
  className,
}: CollectionsShellProps): ReactNode {
  const [listOpen, setListOpen] = useState(false);
  const openList = labels?.openList ?? "Collections";

  const root =
    "grid grid-cols-1 md:grid-cols-[56px_minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)] h-full min-h-0 w-full" +
    (className ? ` ${className}` : "");

  return (
    <div className={root} data-collections-admin="">
      <aside
        className="hidden md:block border-r border-border bg-surface overflow-y-auto min-h-0"
        data-collections-admin-sidebar=""
      >
        <div className="lg:hidden" data-collections-admin-rail="">
          {rail ?? sidebar}
        </div>
        <div className="hidden lg:block">{sidebar}</div>
      </aside>

      <section
        className="flex min-h-0 flex-col overflow-hidden"
        data-collections-admin-main=""
      >
        <div className="shrink-0 border-b border-border px-4 py-2 lg:hidden">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setListOpen(true)}
            data-collections-admin-list-trigger=""
          >
            {openList}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{main}</div>
      </section>

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent
          side="left"
          className="w-[280px] max-w-[85vw] overflow-y-auto p-0"
          data-collections-admin-list-drawer=""
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{openList}</SheetTitle>
          </SheetHeader>
          {/* The shell has no notion of selection; any click inside the
              list either picks a collection or navigates away, and both
              mean the drawer has done its job. */}
          <div onClick={() => setListOpen(false)}>{sidebar}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
