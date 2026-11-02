"use client";

// /pages/[routeId]/revisions — the revision journal of the page at one
// address (SDL-605, slice 2). Layout = the SDL-596 canvas
// /design-system/pages/revisions: a screen of its own inside the address,
// with the admin chrome (app/(product)/product-shell.tsx drops it only for the editor).
//
// Cases: journal (default), `?compare=N[&with=M]` (N before, M after — the
// top row when omitted), empty journal; restore confirmation and the 409
// conflict are local state shown above the journal.
//
// The version a restore is sent under is the page's version read together
// with the journal (usePageHistory), refreshed only by the person — see the
// hook for why.

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useNow } from "next-intl";
import { GitCompare, Pencil } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { SectionHeader } from "@/shared/components/section-header";

import { useTranslations } from "@/shared/hooks";
import { useCollectionsScope } from "@/features/collections-switchers";
import {
  diffSchemas,
  isRevisionOpen,
  pagesConflictPage,
  revisionKind,
  summarizeRevision,
  toSchema,
  usePageHistory,
  usePageRevision,
  useRestorePageRevision,
  useRevisionAuthors,
  useRoute,
  type PagesRevision,
} from "@/entities/pages";
import {
  JournalFootnote,
  RestoreConfirm,
  RestoreConflict,
  RevisionCompare,
  RevisionJournal,
  RevisionsEmpty,
  UnsavedStrip,
  type RevisionRowView,
} from "@/widgets/pages/page-revisions";

export const dynamic = "force-dynamic";

function status(error: unknown): number | undefined {
  const s = (error as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}

function positiveInt(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n > 0 ? n : null;
}

function Message({ title, hint }: { title: string; hint?: string }) {
  return (
    <UI.Card fullWidth data-testid="revisions-message">
      <UI.EmptyState paddingY={10}>
        <UI.Box direction="column" align="center" gap={1} textAlign="center">
          <UI.Text as="h2" size="lg" weight="semibold">
            {title}
          </UI.Text>
          {hint ? (
            <UI.Text variant="muted" size="sm">
              {hint}
            </UI.Text>
          ) : null}
        </UI.Box>
      </UI.EmptyState>
    </UI.Card>
  );
}

type Conflict = { target: number; seenVersion: number; actualVersion: number | null };

export default function PageRevisionsRoute() {
  const t = useTranslations("pages.revisions");
  const tNav = useTranslations("navigation");
  const tEditor = useTranslations("pages.editor");
  const params = useParams<{ routeId: string }>();
  const routeId = params.routeId;
  const search = useSearchParams();
  const { workspacesQuery, selectedWorkspace } = useCollectionsScope();
  const wsId = selectedWorkspace?.id ?? null;
  const wsQuery = wsId ? `?ws=${wsId}` : "";
  const editorHref = `/pages/${routeId}${wsQuery}`;
  const journalHref = `/pages/${routeId}/revisions${wsQuery}`;
  const compareHref = (n: number, withN?: number) => {
    const usp = new URLSearchParams();
    if (wsId) usp.set("ws", wsId);
    usp.set("compare", String(n));
    if (withN !== undefined) usp.set("with", String(withN));
    return `/pages/${routeId}/revisions?${usp.toString()}`;
  };

  const routeQuery = useRoute(wsId, routeId);
  const historyQuery = usePageHistory(wsId, routeId);
  const restore = useRestorePageRevision();
  // Ticks so "still open" lets go of the top row when the window closes.
  const now = useNow({ updateInterval: 15_000 }).getTime();

  const page = historyQuery.data?.page ?? null;
  const journal = historyQuery.data?.journal ?? null;
  const items: PagesRevision[] = React.useMemo(() => journal?.items ?? [], [journal]);
  const current = items[0]?.revision_number ?? null;

  const [restoreTarget, setRestoreTarget] = React.useState<number | null>(null);
  const [restoreError, setRestoreError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<Conflict | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);

  const author = useRevisionAuthors(items.map((r) => r.author_user_id));

  const compareN = positiveInt(search.get("compare"));
  const withN = positiveInt(search.get("with")) ?? current;
  const byNumber = React.useMemo(() => new Map(items.map((r) => [r.revision_number, r])), [items]);
  const leftLoaded = compareN !== null ? byNumber.get(compareN) : undefined;
  const rightLoaded = withN !== null ? byNumber.get(withN) : undefined;
  const leftQuery = usePageRevision(wsId, page?.id ?? null, compareN, compareN !== null && !leftLoaded && !!journal);
  const rightQuery = usePageRevision(wsId, page?.id ?? null, withN, compareN !== null && !rightLoaded && !!journal);

  // The restore dialog and the conflict card belong to the journal they were
  // opened on; navigating to a comparison drops them.
  React.useEffect(() => {
    setRestoreTarget(null);
    setRestoreError(null);
  }, [compareN]);

  const loadedThrough = (journal?.offset ?? 0) + items.length;
  const moreBehind = (journal?.total ?? loadedThrough) > loadedThrough;
  const overlay = restoreTarget !== null || conflict !== null;

  const rows: RevisionRowView[] = items.map((rev, i) => {
    const kind = revisionKind(rev.note);
    const previous = items[i + 1];
    return {
      n: rev.revision_number,
      kind: kind.kind,
      from: kind.from,
      note: rev.note,
      author: author(rev.author_user_id),
      createdAt: rev.created_at,
      summary: !previous && moreBehind ? { type: "notLoaded" } : summarizeRevision(rev, previous),
      open: isRevisionOpen(rev, i === 0 && (journal?.offset ?? 0) === 0, now),
      // The link shows exactly the change the summary names: previous → this.
      compareHref:
        i === 0 || !previous || overlay ? undefined : compareHref(previous.revision_number, rev.revision_number),
    };
  });

  const onRestore = (n: number) => {
    setRestoreError(null);
    setRestoreTarget(n);
  };

  const onConfirm = () => {
    if (!wsId || !page || restoreTarget === null || historyQuery.isFetching) return;
    const target = restoreTarget;
    const seenVersion = page.version;
    setRestoreError(null);
    restore.mutate(
      { workspaceId: wsId, routeId, pageId: page.id, n: target, version: seenVersion },
      {
        onSuccess: () => setRestoreTarget(null),
        onError: (error) => {
          const code = status(error);
          if (code === 409) {
            setRestoreTarget(null);
            setConflict({ target, seenVersion, actualVersion: pagesConflictPage(error)?.version ?? null });
            return;
          }
          setRestoreError(code === 404 ? t("errors.revisionNotFound") : `${t("errors.restore")}: ${error.message}`);
        },
      }
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await historyQuery.refetch();
      if (!result.isError) setConflict(null);
    } finally {
      setRefreshing(false);
    }
  };

  const loading = workspacesQuery.isLoading || routeQuery.isLoading || historyQuery.isLoading;
  const firstError: Error | null = routeQuery.error ?? historyQuery.error;
  const compareMode = compareN !== null && items.length > 0;
  const empty = !loading && !firstError && !!page && items.length === 0;

  const caseKey = conflict
    ? "conflict"
    : restoreTarget !== null
      ? "restore"
      : compareMode
        ? "compare"
        : empty
          ? "empty"
          : "log";

  const body = (() => {
    if (loading) {
      return (
        <UI.Card fullWidth data-testid="revisions-loading">
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
    if (!wsId) return <Message title={tEditor("errors.noWorkspace")} />;
    if (firstError) {
      const s = status(firstError);
      if (s === 401 || s === 403) return <Message title={tEditor("errors.access")} hint={tEditor("errors.accessHint")} />;
      if (s === 404) return <Message title={tEditor("errors.notFound")} hint={tEditor("errors.notFoundHint")} />;
      return <Message title={t("errors.load")} hint={firstError.message} />;
    }
    if (!routeQuery.data) return <Message title={tEditor("errors.notFound")} hint={tEditor("errors.notFoundHint")} />;
    if (!page) return <Message title={tEditor("errors.noPage")} hint={tEditor("errors.noPageHint")} />;
    if (empty) {
      return (
        <UI.Box direction="column" gap={4}>
          <UnsavedStrip />
          <RevisionsEmpty />
        </UI.Box>
      );
    }

    if (compareMode && compareN !== null && withN !== null) {
      const left = leftLoaded ?? leftQuery.data;
      const right = rightLoaded ?? rightQuery.data;
      const lookupFailed = (!leftLoaded && leftQuery.isError) || (!rightLoaded && rightQuery.isError);
      if (lookupFailed) {
        return (
          <UI.Box direction="column" gap={4}>
            <Message title={t("errors.revisionNotFound")} />
            <UI.Button asChild variant="outline" className="self-start">
              <Link href={journalHref}>{t("compare.close")}</Link>
            </UI.Button>
          </UI.Box>
        );
      }
      const a = left ? toSchema(left.body_snapshot) : null;
      const b = right ? toSchema(right.body_snapshot) : null;
      return (
        <RevisionCompare
          left={compareN}
          right={withN}
          loading={!left || !right}
          changes={a && b ? diffSchemas(a, b) : null}
          closeHref={journalHref}
        />
      );
    }

    const journalView = (
      <RevisionJournal
        rows={rows}
        current={current ?? 0}
        now={now}
        onRestore={onRestore}
        restoreDisabled={!!conflict || restore.isPending || historyQuery.isFetching}
      />
    );
    if (conflict) {
      return (
        <UI.Box direction="column" gap={4}>
          <RestoreConflict
            target={conflict.target}
            seenVersion={conflict.seenVersion}
            actualVersion={conflict.actualVersion}
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
          />
          {journalView}
        </UI.Box>
      );
    }
    // Restore asks in a MODAL over the journal (EP-186 pattern 5): the list
    // stays where it was, and the dialog says what exactly will change.
    const restoreDialog = (
      <RestoreConfirm
        target={restoreTarget}
        current={current ?? 0}
        path={routeQuery.data.path}
        published={routeQuery.data.status === "published"}
        pending={restore.isPending}
        busy={historyQuery.isFetching}
        error={restoreError}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={onConfirm}
      />
    );
    return (
      <UI.Box direction="column" gap={4}>
        <UnsavedStrip />
        {journalView}
        <JournalFootnote shown={items.length} total={journal?.total ?? items.length} />
        {restoreDialog}
      </UI.Box>
    );
  })();

  const canCompare = !loading && !firstError && items.length >= 2 && (caseKey === "log" || caseKey === "compare");

  return (
    <UI.Box direction="column" gap={5} data-testid="revisions-screen" data-version={page?.version ?? ""}>
      {/*
        EP-157: the section header; the old kicker («Pages · /path») is the
        breadcrumb trail now — Pages › the address › Revisions.
      */}
      <SectionHeader
        crumbs={[
          { label: tNav("pages") as string, href: `/pages${wsQuery}` },
          { label: routeQuery.data?.path ?? "…", href: editorHref },
          { label: t("title") },
        ]}
        title={t("title")}
        description={t(`intro.${caseKey}`)}
        actions={
          <UI.Box direction="row" align="center" gap={2} wrap>
            <UI.Button asChild variant="outline" data-testid="revisions-to-editor">
              <Link href={editorHref}>
                <Pencil size={16} aria-hidden="true" />
                {t("toEditor")}
              </Link>
            </UI.Button>
            {canCompare ? (
              <UI.Button asChild variant="outline" data-testid="compare-open">
                <Link href={compareHref(items[1].revision_number, items[0].revision_number)}>
                  <GitCompare size={16} aria-hidden="true" />
                  {t("compare.open")}
                </Link>
              </UI.Button>
            ) : null}
          </UI.Box>
        }
      />
      {body}
    </UI.Box>
  );
}
