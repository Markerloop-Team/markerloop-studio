"use client";

// /pages/[routeId] — the editor of the page living at one address
// (SDL-605). Resolves the workspace (?ws=), the route and its page, then
// loads the document through the same provider the editor saves with, so
// the initial read goes through the engine's validate/migrate path.
//
// Rendered full-screen: app/(product)/product-shell.tsx drops the admin chrome for
// this route (canvas /design-system/studio is a full-screen editor).

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import * as UI from "@markerloop/ui/ui";
import { isSaunaAccessDeniedError, isSaunaNotFoundError } from "@markerloop/engine";

import { useTranslations } from "@/shared/hooks";
import { useCollectionsScope } from "@/features/collections-switchers";
import { selectionFileScope } from "@/features/pages-media";
import { pagesKeys, usePageOfRoute, useRoute, type PagesRoute } from "@/entities/pages";
import { AddressActions } from "@/widgets/pages/address-dialogs";
import { PageEditor, readEditorPage } from "@/widgets/pages/page-editor";

export const dynamic = "force-dynamic";

function status(error: unknown): number | undefined {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

/**
 * The editor could not be shown. `actions` is the address menu, and it is
 * here for a reason that is easy to miss: these screens render INSTEAD of
 * the editor, so on an address whose page is missing (a create whose second
 * request failed and whose rollback failed too) the header with the delete
 * dialog never mounts. A broken address is exactly the one that has to be
 * deletable, and the list row leads only here.
 */
function Screen({
  title,
  hint,
  backHref,
  back,
  actions,
}: {
  title: string;
  hint?: string;
  backHref: string;
  back: string;
  actions?: React.ReactNode;
}) {
  return (
    <UI.Box variant="center" className="h-dvh p-6" data-testid="pages-editor-message">
      <UI.Card className="w-full max-w-md">
        <UI.Card.Header>
          <UI.Card.Title>{title}</UI.Card.Title>
          {hint ? <UI.Card.Description>{hint}</UI.Card.Description> : null}
        </UI.Card.Header>
        <UI.Card.Footer>
          <UI.Box direction="row" align="center" gap={2} wrap fullWidth>
            <UI.Button asChild variant="outline">
              <Link href={backHref}>{back}</Link>
            </UI.Button>
            {actions}
          </UI.Box>
        </UI.Card.Footer>
      </UI.Card>
    </UI.Box>
  );
}

function EditorSkeleton() {
  return (
    <UI.Box direction="column" gap={3} className="h-dvh p-3" data-testid="pages-editor-loading">
      <UI.Skeleton height={48} />
      <UI.Box direction="row" gap={3} grow>
        <UI.Skeleton width={260} className="h-full" />
        <UI.Box grow>
          <UI.Skeleton className="h-full" />
        </UI.Box>
        <UI.Skeleton width={360} className="h-full" />
      </UI.Box>
    </UI.Box>
  );
}

export default function PageEditorRoute() {
  const t = useTranslations("pages.editor");
  const router = useRouter();
  const params = useParams<{ routeId: string }>();
  const routeId = params.routeId;
  const scope = useCollectionsScope();
  const { workspacesQuery, selectedWorkspace } = scope;
  // Stable identity: the studio's prop editors are keyed on it.
  const fileScopeKey = JSON.stringify(selectionFileScope(scope));
  const fileScope = React.useMemo(() => selectionFileScope(scope), [fileScopeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const wsId = selectedWorkspace?.id ?? null;
  const backHref = `/pages${wsId ? `?ws=${wsId}` : ""}`;
  const historyHref = `/pages/${routeId}/revisions${wsId ? `?ws=${wsId}` : ""}`;

  const routeQuery = useRoute(wsId, routeId);
  const pageQuery = usePageOfRoute(wsId, routeId);
  const pageId = pageQuery.data?.id ?? null;

  const docQuery = useQuery({
    queryKey: pagesKeys.document(wsId ?? "", pageId ?? ""),
    queryFn: () => readEditorPage(wsId!, pageId!),
    enabled: !!wsId && !!pageId,
    retry: false,
    // The editor owns the document once it is open: a background refetch
    // must not swap the store under the author. Every new mount reads the
    // server again, though — the cached snapshot predates the autosaves of the
    // last visit, and opening it would show stale content and 409 on the
    // first edit with its old version.
    staleTime: Infinity,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const addressActions = (route: PagesRoute) =>
    wsId ? (
      <AddressActions workspaceId={wsId} route={route} pageId={pageId} onGone={() => router.push(backHref)} />
    ) : null;
  const screen = (title: string, hint?: string, route?: PagesRoute | null) => (
    <Screen
      title={title}
      hint={hint}
      backHref={backHref}
      back={t("back")}
      actions={route ? addressActions(route) : undefined}
    />
  );

  if (workspacesQuery.isLoading || routeQuery.isLoading || pageQuery.isLoading || docQuery.isLoading) {
    return <EditorSkeleton />;
  }
  if (!wsId) return screen(t("errors.noWorkspace"));

  const firstError: Error | null = routeQuery.error ?? pageQuery.error ?? docQuery.error;
  if (firstError) {
    const message = firstError.message;
    const s = status(firstError);
    if (isSaunaAccessDeniedError(firstError) || s === 401 || s === 403) {
      return screen(t("errors.access"), t("errors.accessHint"));
    }
    if (isSaunaNotFoundError(firstError) || s === 404) return screen(t("errors.notFound"), t("errors.notFoundHint"));
    // The address itself may be perfectly readable here — only its document
    // is not, so the menu that deletes it belongs on this screen too.
    return screen(t("errors.invalid"), message, routeQuery.data ?? null);
  }
  if (!routeQuery.data) return screen(t("errors.notFound"), t("errors.notFoundHint"));
  if (!pageId) return screen(t("errors.noPage"), t("errors.noPageHint"), routeQuery.data);
  // Coming back from the history, the cache still holds the document of the
  // last visit; mounting it would edit stale content under an old version.
  if (!docQuery.data || !docQuery.isFetchedAfterMount) return <EditorSkeleton />;

  return (
    <PageEditor
      // A reload hands the editor a new snapshot; remounting resets the
      // store and the auto-saver's version together.
      key={`${pageId}:${docQuery.data.version}`}
      workspaceId={wsId}
      workspaceSlug={selectedWorkspace?.slug ?? null}
      fileScope={fileScope}
      route={routeQuery.data}
      pageId={pageId}
      initialSchema={docQuery.data.schema}
      initialVersion={docQuery.data.version}
      publicShell={docQuery.data.publicShell}
      backHref={backHref}
      historyHref={historyHref}
      onReload={() => void docQuery.refetch()}
    />
  );
}
