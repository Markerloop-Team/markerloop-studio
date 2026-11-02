"use client";

// /pages — the list of addresses of a workspace (SDL-605, EP-124).
// Layout follows the canvas /design-system/pages?case=list|empty|search, on
// the admin's one list pattern since EP-186 (layer 3): ListPage header (title,
// intro, "New address"), then the address list — DataView with the
// search, the status chips and the count in its toolbar — or the empty state.
//
// Scope: the workspace comes from the collections scope (?ws=, else the
// first workspace). The gateway checks pages-service membership against
// collections-service workspaces, so the same ids are the right scope.

import * as React from "react";
import { Plus } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { takeQueryParam } from "@/shared/lib/query-param";
import { ListPage } from "@/shared/components/list-page";
import { NoWorkspaceState, useCollectionsScope } from "@/features/collections-switchers";
import { usePages, useRoutes, useSetRoutePinned, type PagesRoute } from "@/entities/pages";
import {
  AddressTable,
  PinErrorNotice,
  PagesEmpty,
  filterAddresses,
  type AddressFilter,
  type AddressRow,
} from "@/widgets/pages/address-table";
import { CreateAddressDialog } from "@/widgets/pages/create-address-dialog";
import { pageViewHref } from "@/widgets/pages/page-hrefs";
import { siteAddress } from "@/shared/config/site-address";
import { useSitesBaseDomain } from "@/shared/config/site-address-context";

export const dynamic = "force-dynamic";

// The Blocks tab that lived here (SDL-721) is the Components section since
// EP-157 (/components, owner 29 Oct 2026); /pages keeps only the addresses,
// and /pages?tab=blocks redirects there (next.config.ts).

function Message({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <UI.Card fullWidth data-testid="pages-message">
      <UI.EmptyState paddingY={10}>
        <UI.Box direction="column" align="center" gap={1} textAlign="center">
          {title ? (
            <UI.Text as="h2" size="lg" weight="semibold">
              {title}
            </UI.Text>
          ) : null}
          {children ? (
            <UI.Text variant="muted" size="sm">
              {children}
            </UI.Text>
          ) : null}
        </UI.Box>
      </UI.EmptyState>
    </UI.Card>
  );
}

function ListSkeleton() {
  return (
    <UI.Card fullWidth data-testid="pages-loading">
      <UI.Card.Content>
        <UI.Box direction="column" gap={3}>
          {[0, 1, 2].map((i) => (
            <UI.Skeleton key={i} height={36} />
          ))}
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}

export default function PagesListPage() {
  const t = useTranslations("pages");
  const { workspacesQuery, selectedWorkspace } = useCollectionsScope();
  const wsId = selectedWorkspace?.id ?? null;
  const sitesBase = useSitesBaseDomain();
  const routesQuery = useRoutes(wsId);
  const pagesQuery = usePages(wsId);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<AddressFilter>("all");
  const [createOpen, setCreateOpen] = React.useState(false);
  // «New page» from the search palette (EP-157) lands as ?create=1.
  React.useEffect(() => {
    if (wsId && takeQueryParam("create") === "1") setCreateOpen(true);
  }, [wsId]);
  const pin = useSetRoutePinned();
  const togglePin = (route: PagesRoute) => {
    if (!wsId) return;
    pin.mutate({ workspaceId: wsId, routeId: route.id, version: route.version, pinned: !route.pinned });
  };
  const pinError = pin.isError ? <PinErrorNotice error={pin.error} onDismiss={() => pin.reset()} /> : null;

  const rows: AddressRow[] = React.useMemo(() => {
    const routes = routesQuery.data ?? [];
    const pages = pagesQuery.data ?? [];
    return routes.map((route) => {
      const own = pages.filter((p) => p.route_id === route.id);
      const updatedAt = [route.updated_at, ...own.map((p) => p.updated_at)].reduce((a, b) =>
        new Date(b).getTime() > new Date(a).getTime() ? b : a
      );
      return { route, pages: own.length, updatedAt };
    });
  }, [routesQuery.data, pagesQuery.data]);

  const visible = filterAddresses(rows, query, filter);

  const editorHref = (routeId: string) => `/pages/${routeId}${wsId ? `?ws=${wsId}` : ""}`;
  const hrefFor = (route: PagesRoute) => editorHref(route.id);

  const body = (() => {
    if (workspacesQuery.isLoading || (wsId && routesQuery.isLoading)) return <ListSkeleton />;
    if (workspacesQuery.error instanceof Error) return <Message title={t("errors.load")}>{workspacesQuery.error.message}</Message>;
    if (!wsId) return <NoWorkspaceState />;
    if (routesQuery.error) {
      const status = (routesQuery.error as { status?: number }).status;
      if (status === 401 || status === 403) return <Message title={t("errors.access")}>{t("errors.accessHint")}</Message>;
      return <Message title={t("errors.load")}>{routesQuery.error.message}</Message>;
    }
    if (rows.length === 0) return <PagesEmpty onCreate={() => setCreateOpen(true)} />;
    return (
      <UI.Box direction="column" gap={4}>
        {pinError}
        <AddressTable
          rows={visible}
          hrefFor={hrefFor}
          viewHrefFor={(route) => pageViewHref(route.id, wsId)}
          siteAddressFor={(route) =>
            route.status === "published" ? siteAddress(selectedWorkspace?.slug, sitesBase, route.path) : null
          }
          onTogglePin={togglePin}
          pinBusyId={pin.isPending ? (pin.variables?.routeId ?? null) : null}
          toolbar={{ query, onQueryChange: setQuery, filter, onFilterChange: setFilter, total: rows.length }}
        />
      </UI.Box>
    );
  })();

  return (
    <UI.Box direction="column" data-testid="pages-section">
      <ListPage
        title={t("title")}
        description={rows.length === 0 && routesQuery.isSuccess ? t("introEmpty") : t("intro")}
        actions={
          wsId && rows.length > 0 ? (
            <UI.Button data-testid="pages-create" onClick={() => setCreateOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              {t("newAddress")}
            </UI.Button>
          ) : undefined
        }
      >
      {body}
      </ListPage>
      {wsId ? (
        <CreateAddressDialog open={createOpen} onOpenChange={setCreateOpen} workspaceId={wsId} editorHref={editorHref} />
      ) : null}
    </UI.Box>
  );
}
