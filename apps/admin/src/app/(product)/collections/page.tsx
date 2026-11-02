"use client";

// /collections — workspace overview (SDL-217 / EP-31, SDL-621).
//
// The section is split into nested routes: this page lists the
// collections of the selected workspace as cards; the
// per-collection workplace (Data/Schema tabs, records, side panels)
// lives at /collections/[collection]. Deep links carry
// ?ws= so shares land on the exact scope.
//
// Access policy is unchanged from SDL-168: every collections route is
// Required:false at the gateway; ownership is enforced by the service
// via the workspace→collection→record chain.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useTranslations } from "@/shared/hooks";
import { takeQueryParam } from "@/shared/lib/query-param";
import { isWorkspaceWithoutStorage } from "@/shared/lib/api/collections-client";
import {
  useCollections,
  useCreateCollection,
} from "@/entities/collections/collection";
import {
  NoWorkspaceState,
  useCollectionsScope,
} from "@/features/collections-switchers";
import { CollectionCreateForm } from "@/widgets/collections";
import { ItemPanel } from "@/shared/components/item-panel";
import { Badge, Box, Button, Text } from "@markerloop/ui/ui";
import { SectionHeader } from "@/shared/components/section-header";
import { DataView, type DataViewField } from "@/shared/components/data-view";
import { LimitRefusalNotice } from "@/entities/policy/ui/policy-line";
import { limitRefusalOf } from "@/shared/lib/api/limit-refusal";
import { UsagePanel } from "@/widgets/usage";

export const dynamic = "force-dynamic";

// The overview is not paginated UI-wise; fetch the server maximum in
// one page. A workspace with >100 collections gets a truncated grid —
// acceptable until a real need shows up.
const COLLECTIONS_PAGE_LIMIT = 100;

export default function CollectionsOverviewPage() {
  const t = useTranslations("collections");
  const router = useRouter();

  const {
    workspaces,
    workspacesQuery,
    selectedWorkspace,
    updateUrlParams,
  } = useCollectionsScope();

  const collectionsQuery = useCollections(
    selectedWorkspace
      ? { workspace_id: selectedWorkspace.id, limit: COLLECTIONS_PAGE_LIMIT }
      : null
  );
  const collections = collectionsQuery.data?.data ?? [];

  // One description of a collection as a tile (EP-186): icon, name, the
  // built-in mark and three meta values.
  const collectionTileFields: DataViewField<(typeof collections)[number]>[] = [
    {
      id: "icon",
      render: (c) =>
        c.icon ? (
          <Text as="span" size="lg" aria-hidden="true">
            {c.icon}
          </Text>
        ) : undefined,
      tile: "media",
    },
    { id: "name", value: (c) => c.name, tile: "title" },
    {
      id: "builtin",
      render: (c) => (c.is_builtin ? <Badge variant="secondary">{t("builtinBadge") as string}</Badge> : undefined),
      tile: "badge",
    },
    {
      id: "key",
      value: (c) => c.key,
      render: (c) => (
        <>
          <span className="sr-only">{`${t("keyLabel") as string}: `}</span>
          <span className="font-mono">{c.key}</span>
        </>
      ),
      tile: "meta",
    },
    {
      id: "records_count",
      value: (c) => c.records_count,
      // SDL-238: the count comes from the listing only, and `undefined`
      // means the server did not compute it — rendering that as 0 would
      // claim the collection is empty. An empty collection sends a real 0
      // and gets a real "0" here.
      render: (c) =>
        c.records_count !== undefined ? (
          <>
            <span className="sr-only">{`${t("recordsCountLabel") as string}: `}</span>
            {c.records_count}
          </>
        ) : null,
      tile: "meta",
    },
    {
      id: "updated_at",
      value: (c) => c.updated_at,
      render: (c) => (
        <>
          <span className="sr-only">{`${t("updatedAtColumn") as string}: `}</span>
          {new Date(c.updated_at).toLocaleDateString()}
        </>
      ),
      tile: "meta",
    },
  ];

  const createCollection = useCreateCollection();
  const [createOpen, setCreateOpen] = useState(false);
  // «New collection» from the search palette (EP-157) lands as ?create=1.
  const selectedWorkspaceId = selectedWorkspace?.id ?? null;
  useEffect(() => {
    if (selectedWorkspaceId && takeQueryParam("create") === "1") setCreateOpen(true);
  }, [selectedWorkspaceId]);
  const [formError, setFormError] = useState<string | null>(null);

  const scopeQuery = (extra?: Record<string, string>) => {
    const sp = new URLSearchParams();
    if (selectedWorkspace) sp.set("ws", selectedWorkspace.id);
    for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `?${qs}` : "";
  };

  const handleCollectionCreate = async (payload: {
    key: string;
    name: string;
    icon?: string;
  }) => {
    if (!selectedWorkspace) return;
    setFormError(null);
    try {
      const created = await createCollection.mutateAsync({
        workspace_id: selectedWorkspace.id,
        key: payload.key,
        name: payload.name,
        icon: payload.icon ?? null,
      });
      // Drop the user straight into the schema editor of the new
      // collection — same flow the monolith had, now via the route.
      router.push(
        `/collections/${created.id}${scopeQuery({ tab: "schema" })}`
      );
    } catch (e) {
      // The collections limit is shown below the form with its rule and
      // link (SDL-666), not as the form's bare error line.
      if (limitRefusalOf(e)) return;
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  // Empty-state shells when there is no workspace at all. The switcher
  // above stays rendered so the user has a single, consistent path to
  // creating one.
  const emptyMain = (() => {
    if (workspacesQuery.isLoading) {
      return <CenteredText>{t("loading") as string}</CenteredText>;
    }
    if (workspacesQuery.error instanceof Error) {
      return <CenteredText>{workspacesQuery.error.message}</CenteredText>;
    }
    if (!selectedWorkspace) {
      // In no workspace at all (SDL-759): the one empty state of every
      // workspace section, with «Create workspace».
      return (
        <Box className="p-6">
          <NoWorkspaceState />
        </Box>
      );
    }
    if (collectionsQuery.isLoading) {
      return <CenteredText>{t("loading") as string}</CenteredText>;
    }
    // A workspace without its storage answers 404 here. Every workspace
    // is seeded on creation and the service backfills stragglers
    // (SDL-617), so this is a named dead end, not something to repair
    // from the admin.
    if (isWorkspaceWithoutStorage(collectionsQuery.error)) {
      return (
        <CenteredText title={t("storageUnavailable") as string}>
          {t("storageUnavailableHint") as string}
        </CenteredText>
      );
    }
    if (collectionsQuery.error instanceof Error) {
      return <CenteredText>{collectionsQuery.error.message}</CenteredText>;
    }
    return null;
  })();

  return (
    <>
      <Box>
        <Box grow className="min-h-0">
          {emptyMain ?? (
            <Box gap={5}>
              <SectionHeader
                title={t("collectionsHeading") as string}
                description={t("subtitle") as string}
                actions={
                  <Button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      createCollection.reset();
                      setCreateOpen(true);
                    }}
                  >
                    {t("addCollection") as string}
                  </Button>
                }
              />

              {selectedWorkspace ? <UsagePanel workspaceId={selectedWorkspace.id} ownerUserId={selectedWorkspace.owner_user_id} /> : null}

              {collections.length === 0 ? (
                <CenteredText title={t("emptyCollections") as string}>
                  {t("emptyCollectionsHint") as string}
                </CenteredText>
              ) : (
                // The admin's one tile grid (EP-186, pattern 2): a DataView
                // in `view="tiles"` over the collection's field description.
                // The meta values keep their names for assistive technology
                // only (sr-only), so the tile reads «articles · 12 · 3 Oct»
                // and a screen reader still hears «Key: articles».
                <DataView
                  view="tiles"
                  fields={collectionTileFields}
                  data={collections}
                  getRowId={(c) => c.id}
                  rowHref={(c) => `/collections/${c.id}${scopeQuery()}`}
                  rowAttributes={(c) => ({ "data-collection-card": c.key })}
                  tilesTestId="collections-overview-grid"
                />
              )}
            </Box>
          )}
        </Box>
      </Box>

      <ItemPanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        ariaLabel={t("createCollectionTitle") as string}
        testId="collection-create-panel"
      >
        <CollectionCreateForm
          onSubmit={handleCollectionCreate}
          onCancel={() => setCreateOpen(false)}
          isSubmitting={createCollection.isPending}
          error={formError}
          labels={{
            title: t("createCollectionTitle") as string,
            name: t("schemaCollectionName") as string,
            key: t("keyLabel") as string,
            icon: t("collectionIcon") as string,
            create: t("create") as string,
            creating: t("creating") as string,
            cancel: t("cancel") as string,
            keyHint: t("keyImmutableHint") as string,
          }}
          extra={createCollection.error ? <LimitRefusalNotice error={createCollection.error} /> : null}
        />
      </ItemPanel>
    </>
  );
}

function CenteredText({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      align="center"
      justify="center"
      gap={2}
      fullHeight
      textAlign="center"
      className="min-h-[200px] p-6"
    >
      {title ? (
        <Text size="lg" weight="semibold">
          {title}
        </Text>
      ) : null}
      <Text variant="muted" size="sm">
        {children}
      </Text>
    </Box>
  );
}
