"use client";

// The list of addresses — live port of the EP-124 canvas
// /design-system/pages (app/design-system/_canvas/pages-parts.tsx, SDL-592).
// Same kit components, same test ids, same layout; strings come from the
// `pages` i18n namespace and rows from pages-service.
//
// Not ported (see SDL-605 follow-ups): the "draft" mark and its filter —
// pages-service keeps no published snapshot apart from the working copy, so
// there is no fact behind "an edit visitors don't see yet".
//
// Since EP-186 (layer 3, pattern 1) the list is the admin's one list:
// DataView with the search, the status chips and the count in its
// toolbar, cards below 768px — the canvas's hand table scrolled sideways on a
// phone instead.
//
// The canvas's delete dialog is ported (slice 3) but it does NOT live here:
// the list stays three columns with no actions column, as the canvas
// draws it, and deleting an address — like renaming it — happens on the
// screen about that one address (widgets/pages/address-dialogs.tsx, opened
// from the editor's header and from its fallback screens).
// The canvas copies stay where they are: the canvases are the acceptance
// reference and must not change under a live screen.

import * as React from "react";
import Link from "next/link";
import { useFormatter, useNow } from "next-intl";
import { ExternalLink, Eye, FileText, Layers, Pin, PinOff, Plus } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { PublishMark, publishMarkState } from "@/shared/components/publish-mark";
import { DataView, type DataViewField } from "@/shared/components/data-view";
import type { PagesRoute } from "@/entities/pages";
import type { SiteAddress } from "@/shared/config/site-address";

export type AddressRow = {
  route: PagesRoute;
  /** How many pages live at the address. 1 is the normal case. */
  pages: number;
  /** Latest change of the address or of its page. */
  updatedAt: string;
};

export type AddressFilter = "all" | "published" | "unpublished";

export const ADDRESS_FILTERS: readonly AddressFilter[] = ["all", "published", "unpublished"];

export function filterAddresses(rows: AddressRow[], query: string, filter: AddressFilter): AddressRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === "published" && row.route.status !== "published") return false;
    if (filter === "unpublished" && row.route.status === "published") return false;
    if (!q) return true;
    return row.route.path.toLowerCase().includes(q) || row.route.title.toLowerCase().includes(q);
  });
}

/**
 * The publish mark of a row — the editor header's words (EP-186 pattern 7).
 * "Unpublished changes" is drawn only when the row itself says so: the list
 * answer of pages-service does not carry `has_unpublished_changes` (only the
 * single GET does), and asking every row separately is not worth a request
 * per address — so today a list row reads Published / Not published.
 */
export function AddressMarks({ route }: { route: PagesRoute }) {
  const published = route.status === "published";
  return (
    <UI.Box direction="row" align="center" gap={2} wrap>
      <PublishMark
        state={publishMarkState(published, route.has_unpublished_changes === true)}
        data-testid={published ? "address-mark-published" : "address-mark-unpublished"}
      />
    </UI.Box>
  );
}

export function PageCount({ count }: { count: number }) {
  const tTable = useTranslations("pages.table");
  if (count <= 1) return null;
  return (
    <UI.Badge variant="secondary" className="gap-1" data-testid="address-pages">
      <Layers size={14} aria-hidden="true" />
      {tTable("pageCount", { count })}
    </UI.Badge>
  );
}

function Updated({ at }: { at: string }) {
  const format = useFormatter();
  // An explicit `now` (ticking once a minute): without it next-intl falls
  // back to the current time AND reports ENVIRONMENT_FALLBACK on every row.
  const now = useNow({ updateInterval: 60_000 });
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <UI.Text size="sm" variant="muted" title={format.dateTime(date, { dateStyle: "medium", timeStyle: "short" })}>
      {format.relativeTime(date, now)}
    </UI.Text>
  );
}

/**
 * A pin that did not land (SDL-645): 403, 5xx, or a second 409 after the one
 * retry. Said out loud next to the list — a toggle that silently flips back
 * reads as "the button is broken".
 */
export function PinErrorNotice({ error, onDismiss }: { error: unknown; onDismiss: () => void }) {
  const tTable = useTranslations("pages.table");
  const status = (error as { status?: unknown } | null)?.status;
  const message = status === 401 || status === 403 ? tTable("pinErrorAccess") : tTable("pinError");
  return (
    <UI.Alert variant="destructive" data-testid="address-pin-error" role="alert">
      <UI.Box direction="row" align="center" justify="between" gap={3} wrap>
        <UI.Text as="span" size="sm">
          {message}
        </UI.Text>
        <UI.Button variant="ghost" size="sm" onClick={onDismiss} data-testid="address-pin-error-dismiss">
          {tTable("pinErrorDismiss")}
        </UI.Button>
      </UI.Box>
    </UI.Alert>
  );
}

/** The toolbar of the list: search, the status chips and the count. */
export interface AddressListToolbar {
  query: string;
  onQueryChange: (q: string) => void;
  filter: AddressFilter;
  onFilterChange: (f: AddressFilter) => void;
  /** Every address of the workspace — the M of «Shown N of M». */
  total: number;
}

function AddressCell({
  row,
  href,
  viewHref,
  site,
  onTogglePin,
  pinBusy,
}: {
  row: AddressRow;
  href: string;
  viewHref?: string;
  site: SiteAddress | null;
  onTogglePin?: (route: PagesRoute) => void;
  pinBusy: boolean;
}) {
  const tTable = useTranslations("pages.table");
  return (
    <UI.Box direction="column" className="min-w-0" gap={1}>
      <Link href={href} className="min-w-0 hover:underline" data-testid="address-link">
        <UI.Text as="span" size="sm" variant="mono" className="block truncate" data-testid="address-path">
          {row.route.path}
        </UI.Text>
      </Link>
      <UI.Box direction="row" align="center" gap={2} wrap>
        <UI.Text as="span" size="xs" variant="muted" className="truncate">
          {row.route.title}
        </UI.Text>
        <PageCount count={row.pages} />
        {viewHref ? (
          <UI.Button asChild variant="ghost" size="sm" className="h-6 gap-1 px-2" data-testid="address-view">
            <Link href={viewHref} aria-label={tTable("viewAria", { path: row.route.path })}>
              <Eye size={14} aria-hidden="true" />
              {tTable("view")}
            </Link>
          </UI.Button>
        ) : null}
        {site ? (
          <UI.Button asChild variant="ghost" size="sm" className="h-6 gap-1 px-2" data-testid="address-open-site">
            <a href={site.url} target="_blank" rel="noreferrer" aria-label={tTable("openSiteAria", { url: site.url })}>
              <ExternalLink size={14} aria-hidden="true" />
              {tTable("openSite")}
            </a>
          </UI.Button>
        ) : null}
        {onTogglePin ? (
          <UI.Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2"
            data-testid="address-pin"
            data-pinned={row.route.pinned ? "true" : "false"}
            aria-pressed={row.route.pinned === true}
            aria-label={
              row.route.pinned
                ? tTable("unpinAria", { path: row.route.path })
                : tTable("pinAria", { path: row.route.path })
            }
            disabled={pinBusy}
            onClick={() => onTogglePin(row.route)}
          >
            {row.route.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
            {row.route.pinned ? tTable("unpin") : tTable("pin")}
          </UI.Button>
        ) : null}
      </UI.Box>
    </UI.Box>
  );
}

function StatusCell({ route, site }: { route: PagesRoute; site: SiteAddress | null }) {
  return (
    <UI.Box direction="column" gap={1} className="min-w-0">
      <AddressMarks route={route} />
      {site ? (
        <UI.Text
          as="span"
          size="xs"
          variant="muted"
          className="block truncate font-mono"
          title={site.url}
          data-testid="address-site-url"
        >
          {site.label}
        </UI.Text>
      ) : null}
    </UI.Box>
  );
}

/**
 * The list of addresses on the admin's one list pattern (EP-186, pattern 1):
 * DataView — a table from 768px, cards below it — with the search,
 * the status chips and the count in its toolbar. Rows keep their test hooks
 * (`address-row` + `data-route-id` on the desktop row, `address-card` on the
 * card), so a locator scoped to a row still finds its own pin and View.
 */
export function AddressTable({
  rows,
  hrefFor,
  viewHrefFor,
  onTogglePin,
  pinBusyId = null,
  siteAddressFor,
  toolbar,
}: {
  rows: AddressRow[];
  /** The address itself leads to the editor. */
  hrefFor: (route: PagesRoute) => string;
  /**
   * "View": the page as a member uses it, inside the product (SDL-643,
   * widgets/pages/page-hrefs.ts `pageViewHref`). Without it the row has no
   * such action.
   */
  viewHrefFor?: (route: PagesRoute) => string;
  /**
   * Pin / unpin the address (SDL-645): a pinned page is an entry of the
   * sidebar. The flag lives on the address in pages-service (SDL-644), so it
   * is one for every device. Without it the row has no such action.
   */
  onTogglePin?: (route: PagesRoute) => void;
  /** The row whose pin write is in flight — its button waits. */
  pinBusyId?: string | null;
  /**
   * Where a published address lives on the workspace site (SDL-687,
   * `siteAddress`): its host+path under the status mark and "Open site" in
   * the row. `null` for a row = nothing to open (a draft, no slug, no base).
   */
  siteAddressFor?: (route: PagesRoute) => SiteAddress | null;
  /** Search, the status chips and the count. Absent → a bare list. */
  toolbar?: AddressListToolbar;
}) {
  const tTable = useTranslations("pages.table");
  const tSearch = useTranslations("pages.search");

  const fields = React.useMemo<DataViewField<AddressRow>[]>(
    () => [
      {
        id: "address",
        label: tTable("address"),
        render: (row) => (
          <AddressCell
            row={row}
            href={hrefFor(row.route)}
            viewHref={viewHrefFor?.(row.route)}
            site={siteAddressFor?.(row.route) ?? null}
            onTogglePin={onTogglePin}
            pinBusy={pinBusyId === row.route.id}
          />
        ),
        card: "title",
      },
      {
        id: "status",
        label: tTable("status"),
        render: (row) => <StatusCell route={row.route} site={siteAddressFor?.(row.route) ?? null} />,
        card: "field",
      },
      {
        id: "updated",
        label: tTable("updated"),
        render: (row) => <Updated at={row.updatedAt} />,
        card: "field",
      },
    ],
    [tTable, hrefFor, viewHrefFor, siteAddressFor, onTogglePin, pinBusyId]
  );

  return (
    <UI.Box direction="column" className="min-w-0" data-testid="address-list">
      <DataView
        fields={fields}
        data={rows}
        getRowId={(row) => row.route.id}
        emptyMessage={toolbar ? tSearch("nothingFound", { query: toolbar.query }) : undefined}
        searchValue={toolbar?.query ?? ""}
        onSearchChange={toolbar?.onQueryChange}
        searchPlaceholder={toolbar ? tSearch("placeholder") : undefined}
        searchTestId="pages-search-input"
        toolbarTestId="pages-search"
        filters={
          toolbar ? (
            <UI.ToggleGroup
              type="single"
              value={toolbar.filter}
              onValueChange={(v: string) => {
                if (v) toolbar.onFilterChange(v as AddressFilter);
              }}
              className="flex-wrap"
            >
              {ADDRESS_FILTERS.map((f) => (
                <UI.ToggleGroupItem key={f} value={f} size="sm">
                  {tSearch(`filters.${f}`)}
                </UI.ToggleGroupItem>
              ))}
            </UI.ToggleGroup>
          ) : undefined
        }
        count={toolbar ? { shown: rows.length, total: toolbar.total } : undefined}
        countTestId="pages-found"
        rowAttributes={(row) => ({ "data-testid": "address-row", "data-route-id": row.route.id })}
        cardAttributes={(row) => ({ "data-testid": "address-card", "data-route-id": row.route.id })}
      />
    </UI.Box>
  );
}

/** First visit: no addresses at all. */
export function PagesEmpty({ onCreate }: { onCreate?: () => void }) {
  const tEmpty = useTranslations("pages.empty");
  return (
    <UI.Card fullWidth data-testid="pages-empty">
      <UI.EmptyState paddingY={10}>
        <UI.Box direction="column" align="center" gap={4} textAlign="center">
          <FileText size={40} aria-hidden="true" className="opacity-40" />
          <UI.Box direction="column" gap={1} align="center">
            <UI.Text as="h2" size="lg" weight="semibold">
              {tEmpty("title")}
            </UI.Text>
            <UI.Text variant="muted" size="sm">
              {tEmpty("hint")}
            </UI.Text>
          </UI.Box>
          <UI.Button onClick={onCreate} data-testid="pages-create-empty">
            <Plus size={16} aria-hidden="true" />
            {tEmpty("create")}
          </UI.Button>
        </UI.Box>
      </UI.EmptyState>
    </UI.Card>
  );
}
