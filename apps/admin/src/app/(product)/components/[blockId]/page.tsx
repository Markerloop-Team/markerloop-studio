"use client";

// /components/[blockId] — one Component opened in its own editor (SDL-721,
// EP-145; canvas /design-system/blocks/editor). Was /pages/blocks/[blockId]
// until the Components section became its own (EP-157); the old address
// redirects here (next.config.ts). Resolves the
// workspace (?ws=) and reads the Block through the same provider the editor
// saves with, so the first read goes through the engine's validate/migrate
// path. Full-screen like the page editor (app/(product)/product-shell.tsx).

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import * as UI from "@markerloop/ui/ui";
import { isSaunaAccessDeniedError, isSaunaNotFoundError } from "@markerloop/engine";

import { useTranslations } from "@/shared/hooks";
import { useCollectionsScope } from "@/features/collections-switchers";
import { selectionFileScope } from "@/features/pages-media";
import { useBlockDetail } from "@/entities/pages";
import { BlockEditor, createAdminBlocksProvider } from "@/widgets/pages/block-editor";
import { componentsListHref } from "@/widgets/pages/page-hrefs";

export const dynamic = "force-dynamic";

function status(error: unknown): number | undefined {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

function Screen({ title, hint, backHref, back }: { title: string; hint?: string; backHref: string; back: string }) {
  return (
    <UI.Box variant="center" className="h-dvh p-6" data-testid="block-editor-message">
      <UI.Card className="w-full max-w-md">
        <UI.Card.Header>
          <UI.Card.Title>{title}</UI.Card.Title>
          {hint ? <UI.Card.Description className="break-words">{hint}</UI.Card.Description> : null}
        </UI.Card.Header>
        <UI.Card.Footer>
          <UI.Button asChild variant="outline">
            <Link href={backHref}>{back}</Link>
          </UI.Button>
        </UI.Card.Footer>
      </UI.Card>
    </UI.Box>
  );
}

function EditorSkeleton() {
  return (
    <UI.Box direction="column" gap={3} className="h-dvh p-3" data-testid="block-editor-loading">
      <UI.Skeleton height={48} />
      <UI.Box direction="row" gap={3} grow>
        <UI.Skeleton width={260} className="h-full max-md:hidden" />
        <UI.Box grow>
          <UI.Skeleton className="h-full" />
        </UI.Box>
        <UI.Skeleton width={360} className="h-full max-md:hidden" />
      </UI.Box>
    </UI.Box>
  );
}

export default function BlockEditorRoute() {
  const t = useTranslations("pages.blockEditor");
  const params = useParams<{ blockId: string }>();
  const blockId = params.blockId;
  const scope = useCollectionsScope();
  const { workspacesQuery, selectedWorkspace } = scope;
  const fileScopeKey = JSON.stringify(selectionFileScope(scope));
  const fileScope = React.useMemo(() => selectionFileScope(scope), [fileScopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wsId = selectedWorkspace?.id ?? null;
  const backHref = componentsListHref(wsId);

  // The name for the header; the tree itself is read by the provider below.
  const detailQuery = useBlockDetail(wsId, blockId);
  const docQuery = useQuery({
    // NOT under pagesBlockKeys.all: the editor's own save invalidates that
    // prefix, and a refetch here would hand the editor a new version and
    // remount it under the author (selection, undo, pending edits gone).
    queryKey: ["pages", "block-document", wsId ?? "", blockId] as const,
    queryFn: () => createAdminBlocksProvider(wsId!).get(blockId),
    enabled: !!wsId && !!blockId,
    retry: false,
    // The editor owns the document once open; every mount reads it again.
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  if (workspacesQuery.isLoading || docQuery.isLoading) return <EditorSkeleton />;
  if (!wsId) return <Screen title={t("errors.noWorkspace")} backHref={backHref} back={t("back")} />;

  const error = docQuery.error;
  if (error) {
    const s = status(error);
    if (isSaunaAccessDeniedError(error) || s === 401 || s === 403) {
      return <Screen title={t("errors.access")} hint={t("errors.accessHint")} backHref={backHref} back={t("back")} />;
    }
    if (isSaunaNotFoundError(error) || s === 404) {
      return <Screen title={t("errors.notFound")} hint={t("errors.notFoundHint")} backHref={backHref} back={t("back")} />;
    }
    return <Screen title={t("errors.load")} hint={(error as Error).message} backHref={backHref} back={t("back")} />;
  }
  if (!docQuery.data || !docQuery.isFetchedAfterMount) return <EditorSkeleton />;

  return (
    <BlockEditor
      key={`${blockId}:${docQuery.data.version}`}
      workspaceId={wsId}
      blockId={blockId}
      name={detailQuery.data?.name ?? ""}
      group={detailQuery.data?.group ?? null}
      // «Used on N pages» (EP-187): the pages of the Block's usage; not drawn until it is read.
      usageCount={detailQuery.data?.usage ? detailQuery.data.usage.pages.length : undefined}
      fileScope={fileScope}
      initialSchema={docQuery.data.schema}
      initialVersion={docQuery.data.version}
      backHref={backHref}
      onReload={() => void docQuery.refetch()}
    />
  );
}
