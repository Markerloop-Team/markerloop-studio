"use client";

// /pages/[routeId]/view — the page at one address, as a workspace member
// sees it inside Markerloop (SDL-643, EP-130). Not the editor: a screen of its
// own inside the address, next to /revisions, with the product chrome
// (app/(product)/product-shell.tsx drops the chrome only for the editor, and
// its matcher is exact). Laid out after canvas A (/design-system/feed): rail
// and header of the product, the page in the editor canvas's frame.
//
// Always the draft: the document is read exactly as the editor reads it
// (readEditorPage — the current body). The published version on the
// workspace subdomain is a separate delivery, not this screen.
//
// `?record=<id>` is honoured by the page's DataView itself (it is live here),
// and the address survives a login round trip whole (SDL-643: the proxy and
// the shell keep the query in `?redirect=`).

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import * as UI from "@markerloop/ui/ui";
import { isSaunaAccessDeniedError, isSaunaNotFoundError } from "@markerloop/engine";

import { useTranslations } from "@/shared/hooks";
import { useCollectionsScope } from "@/features/collections-switchers";
import { selectionFileScope } from "@/features/pages-media";
import { pagesKeys, usePageOfRoute, useRoute } from "@/entities/pages";
import { readEditorPage } from "@/widgets/pages/page-editor";
import { PageView } from "@/widgets/pages/page-view";
import { pageEditorHref } from "@/widgets/pages/page-hrefs";

export const dynamic = "force-dynamic";

function status(error: unknown): number | undefined {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

function Message({ title, hint, backHref, back }: { title: string; hint?: string; backHref: string; back: string }) {
  return (
    <UI.Card fullWidth data-testid="page-view-message">
      <UI.EmptyState paddingY={10}>
        <UI.Box direction="column" align="center" gap={3} textAlign="center">
          <UI.Text as="h2" size="lg" weight="semibold">
            {title}
          </UI.Text>
          {hint ? (
            <UI.Text variant="muted" size="sm">
              {hint}
            </UI.Text>
          ) : null}
          <UI.Button asChild variant="outline">
            <Link href={backHref}>{back}</Link>
          </UI.Button>
        </UI.Box>
      </UI.EmptyState>
    </UI.Card>
  );
}

function ViewSkeleton() {
  return (
    <UI.Box direction="column" gap={6} data-testid="page-view-loading">
      <UI.Skeleton width={240} height={32} />
      <UI.Skeleton height={420} />
    </UI.Box>
  );
}

export default function PageViewRoute() {
  const t = useTranslations("pages.editor");
  const tView = useTranslations("pages.view");
  const router = useRouter();
  const params = useParams<{ routeId: string }>();
  const routeId = params.routeId;
  const scope = useCollectionsScope();
  const { workspacesQuery, selectedWorkspace } = scope;
  const fileScopeKey = JSON.stringify(selectionFileScope(scope));
  const fileScope = React.useMemo(() => selectionFileScope(scope), [fileScopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wsId = selectedWorkspace?.id ?? null;
  const backHref = `/pages${wsId ? `?ws=${wsId}` : ""}`;
  const editHref = pageEditorHref(routeId, wsId);

  const routeQuery = useRoute(wsId, routeId);
  const pageQuery = usePageOfRoute(wsId, routeId);
  const pageId = pageQuery.data?.id ?? null;

  // The same key as the editor's read: one cache entry per document. A view
  // never writes, so a background re-read is welcome here (the editor turns
  // it off because it owns the document once open).
  const docQuery = useQuery({
    queryKey: pagesKeys.document(wsId ?? "", pageId ?? ""),
    queryFn: () => readEditorPage(wsId!, pageId!),
    enabled: !!wsId && !!pageId,
    retry: false,
    refetchOnMount: "always",
  });

  const onOpenInStudio = React.useCallback(() => router.push(editHref), [router, editHref]);

  const message = (title: string, hint?: string) => (
    <Message title={title} hint={hint} backHref={backHref} back={tView("back")} />
  );

  if (workspacesQuery.isLoading || routeQuery.isLoading || pageQuery.isLoading || docQuery.isLoading) {
    return <ViewSkeleton />;
  }
  if (!wsId) return message(t("errors.noWorkspace"));

  const firstError: Error | null = routeQuery.error ?? pageQuery.error ?? docQuery.error;
  if (firstError) {
    const detail = firstError.message;
    const s = status(firstError);
    if (isSaunaAccessDeniedError(firstError) || s === 401 || s === 403) {
      return message(t("errors.access"), t("errors.accessHint"));
    }
    if (isSaunaNotFoundError(firstError) || s === 404) return message(t("errors.notFound"), t("errors.notFoundHint"));
    return message(t("errors.invalid"), detail);
  }
  if (!routeQuery.data) return message(t("errors.notFound"), t("errors.notFoundHint"));
  if (!pageId) return message(t("errors.noPage"), t("errors.noPageHint"));
  // Mirrors the editor: the cache may still hold the document of an earlier
  // visit, and drawing it until the fresh read lands would flash a stale draft.
  if (!docQuery.data || !docQuery.isFetchedAfterMount) return <ViewSkeleton />;

  return (
    <PageView
      route={routeQuery.data}
      schema={docQuery.data.schema}
      fileScope={fileScope}
      backHref={backHref}
      editHref={editHref}
      onOpenInStudio={onOpenInStudio}
    />
  );
}
