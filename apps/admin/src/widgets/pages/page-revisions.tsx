"use client";

// Page revision journal — the product copies of the SDL-596 canvas parts
// (app/design-system/_canvas/pages-revisions-parts.tsx), SDL-605 slice 2.
//
// Same kit markup, same data-testids, same rules the canvas argues for:
//   - the journal is a table, and below `md` the same rows as a stack of
//     cards — never a horizontal scroll (who/when would sit past the edge);
//   - milestones (created / restored) carry a mark, plain edits do not;
//   - an empty author is a state of the row, said in words, not a dash;
//   - restore is not a rollback: it appends a row, nothing is erased;
//   - a 409 has exactly one way out — refresh the history.
// No colours of its own: tone comes from StatusIndicator / SaveStatus / Badge.
// Words come from `pages.revisions.*`; handlers come in through props.

import * as React from "react";
import Link from "next/link";
import { useFormatter } from "next-intl";
import { AlertTriangle, History, Keyboard, RotateCcw, Server, X } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { SaveStatus, StatusIndicator } from "@markerloop/ui/ui/admin";

import { useTranslations } from "@/shared/hooks";
import { ConfirmDialogBody, ConfirmDialogLine, ConfirmDialogShell } from "@/shared/components/confirm-dialog";
import type { ChangeKind, PageChange, RevisionAuthor, RevisionKind, RevisionSummary } from "@/entities/pages";

/* ----------------------------------------------------------------- model */

export type RevisionRowView = {
  n: number;
  kind: RevisionKind;
  from?: number;
  /** The raw note — shown only for a note this service does not write. */
  note: string;
  author: RevisionAuthor;
  createdAt: string;
  summary: RevisionSummary;
  /** Younger than the squash window: the next save may land in this row. */
  open: boolean;
  /** Where the row's number and summary lead: this row compared to the one before it. */
  compareHref?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function useWhen(now: number) {
  const format = useFormatter();
  return (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return now - date.getTime() < DAY_MS
      ? format.relativeTime(date, now)
      : format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
  };
}

function shortId(id: string) {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function useAuthorLabel() {
  const t = useTranslations("pages.revisions");
  return (author: RevisionAuthor): { text: string; muted: boolean; title?: string } => {
    if (author.state === "none") return { text: t("table.unknownAuthor"), muted: true };
    if (author.state === "known") return { text: author.name, muted: false };
    // Being looked up is not an answer. Printing the raw id while the
    // request is in flight makes the wait look exactly like the failure
    // below it — same shortened id, same muted tone — so the cell says it is
    // loading and carries no id to be mistaken for the result.
    if (author.state === "loading") return { text: t("table.authorLoading"), muted: true };
    // Not readable (account gone, or invisible to this admin): the raw id, so
    // the row still says who.
    return { text: shortId(author.id), muted: true, title: author.id };
  };
}

/** A row's "what changed" in words. */
export function useRevisionSummaryText() {
  const t = useTranslations("pages.revisions");
  return (summary: RevisionSummary): string => {
    if (summary.type === "initial") return t("summary.initial");
    if (summary.type === "unavailable") return t("summary.unavailable");
    if (summary.type === "notLoaded") return t("summary.notLoaded");
    const [first, ...rest] = summary.changes;
    if (!first) return t("summary.none");
    const head = t("summary.change", { block: first.block, kind: first.kind });
    return rest.length > 0 ? `${head} ${t("summary.more", { count: rest.length })}` : head;
  };
}

/* ----------------------------------------------------------------- marks */

export function RevisionKindMark({ kind, from, note }: { kind: RevisionKind; from?: number; note: string }) {
  const t = useTranslations("pages.revisions");
  if (kind === "created") {
    return (
      <UI.Badge variant="secondary" data-testid="revision-kind">
        {t("kind.created")}
      </UI.Badge>
    );
  }
  if (kind === "restored") {
    return (
      <UI.Badge variant="outline" className="gap-1" data-testid="revision-kind">
        <RotateCcw size={14} aria-hidden="true" />
        {from !== undefined ? t("kind.restored", { from }) : t("kind.restoredUnknown")}
      </UI.Badge>
    );
  }
  if (kind === "other") {
    // A note this service never writes: shown as it is, not as a milestone.
    return (
      <UI.Text as="span" size="xs" variant="muted" data-testid="revision-note">
        {note}
      </UI.Text>
    );
  }
  return null;
}

/* ----------------------------------------------- the editor, not the history */

/**
 * "In the editor now" — keeps unsaved typing apart from the history: edits
 * that did not reach the server (a failed save, a conflict) are not in this
 * journal, and undo lives only in the editor tab. The strip never claims the
 * editor is saved — this screen cannot know that.
 */
export function UnsavedStrip() {
  const t = useTranslations("pages.revisions");
  return (
    <UI.Card fullWidth data-testid="revisions-unsaved">
      <UI.Card.Content>
        <UI.Box direction="row" align="center" gap={3} wrap>
          <UI.Box direction="row" align="center" gap={2} shrink={false}>
            <Keyboard size={16} aria-hidden="true" className="opacity-60" />
            <UI.Text as="span" size="sm" weight="medium">
              {t("unsaved.title")}
            </UI.Text>
          </UI.Box>
          <SaveStatus state="unsaved" label={t("unsaved.label")} />
          <UI.Box className="min-w-[14rem]" grow>
            <UI.Text as="div" size="sm" variant="muted">
              {t("unsaved.hint")}
            </UI.Text>
          </UI.Box>
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}

/* --------------------------------------------------------------- journal */

function RestoreButton({
  n,
  onRestore,
  disabled,
  variant,
  testId,
}: {
  n: number;
  onRestore: (n: number) => void;
  disabled: boolean;
  variant: "ghost" | "outline";
  testId: string;
}) {
  const t = useTranslations("pages.revisions");
  return (
    <UI.Button
      variant={variant}
      size="sm"
      disabled={disabled}
      onClick={() => onRestore(n)}
      data-testid={testId}
      data-revision={n}
    >
      <RotateCcw size={14} aria-hidden="true" />
      {t("restore")}
    </UI.Button>
  );
}

function MaybeLink({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <Link href={href} className="hover:underline">
      {children}
    </Link>
  );
}

export function RevisionJournal({
  rows,
  current,
  now,
  onRestore,
  restoreDisabled = false,
}: {
  rows: RevisionRowView[];
  /** The revision whose snapshot is the page body now — the top row. */
  current: number;
  now: number;
  onRestore: (n: number) => void;
  /** While a conflict is shown, refresh is the only way forward. */
  restoreDisabled?: boolean;
}) {
  const t = useTranslations("pages.revisions");
  const when = useWhen(now);
  const authorLabel = useAuthorLabel();
  const summaryText = useRevisionSummaryText();

  return (
    <UI.Card padding="none" fullWidth className="py-4">
      <UI.Card.Content className="p-0">
        <UI.Box direction="column" className="hidden md:flex">
          <UI.Table.Root layout="fixed" className="min-w-[640px]">
            <UI.Table.Header>
              <UI.Table.Row>
                <UI.Table.Head className="w-[10%]">{t("table.number")}</UI.Table.Head>
                <UI.Table.Head className="w-[38%]">{t("table.what")}</UI.Table.Head>
                <UI.Table.Head className="w-[18%]">{t("table.who")}</UI.Table.Head>
                <UI.Table.Head className="w-[18%]">{t("table.when")}</UI.Table.Head>
                <UI.Table.Head className="w-[16%]">
                  <span className="sr-only">{t("table.action")}</span>
                </UI.Table.Head>
              </UI.Table.Row>
            </UI.Table.Header>
            <UI.Table.Body data-testid="revisions-journal">
              {rows.map((row) => {
                const author = authorLabel(row.author);
                return (
                  <UI.Table.Row key={row.n} data-testid="revision-row" data-revision={row.n}>
                    <UI.Table.Cell className="align-top">
                      <MaybeLink href={row.compareHref}>
                        <UI.Text as="span" size="sm" variant="mono" data-testid="revision-number">
                          {row.n}
                        </UI.Text>
                      </MaybeLink>
                    </UI.Table.Cell>
                    <UI.Table.Cell className="align-top">
                      <UI.Box direction="column" gap={1} className="min-w-0">
                        <MaybeLink href={row.compareHref}>
                          <UI.Text as="span" size="sm" data-testid="revision-summary">
                            {summaryText(row.summary)}
                          </UI.Text>
                        </MaybeLink>
                        <UI.Box direction="row" align="center" gap={2} wrap>
                          <RevisionKindMark kind={row.kind} from={row.from} note={row.note} />
                          {row.open ? (
                            <StatusIndicator tone="info" pulse data-testid="revision-open">
                              {t("table.open")}
                            </StatusIndicator>
                          ) : null}
                        </UI.Box>
                      </UI.Box>
                    </UI.Table.Cell>
                    <UI.Table.Cell className="align-top">
                      <UI.Text
                        size="sm"
                        variant={author.muted ? "muted" : undefined}
                        title={author.title}
                        data-testid="revision-author"
                      >
                        {author.text}
                      </UI.Text>
                    </UI.Table.Cell>
                    <UI.Table.Cell className="align-top">
                      <UI.Text size="sm" variant="muted">
                        {when(row.createdAt)}
                      </UI.Text>
                    </UI.Table.Cell>
                    <UI.Table.Cell className="align-top">
                      {row.n === current ? (
                        <UI.Text size="sm" variant="muted" data-testid="revision-current">
                          {t("table.current")}
                        </UI.Text>
                      ) : (
                        <RestoreButton
                          n={row.n}
                          onRestore={onRestore}
                          disabled={restoreDisabled}
                          variant="ghost"
                          testId="revision-restore"
                        />
                      )}
                    </UI.Table.Cell>
                  </UI.Table.Row>
                );
              })}
            </UI.Table.Body>
          </UI.Table.Root>
        </UI.Box>

        <UI.Box direction="column" className="md:hidden">
          {rows.map((row, index) => {
            const author = authorLabel(row.author);
            return (
              <UI.Box
                key={row.n}
                direction="column"
                gap={2}
                className={`px-4 py-3 ${index > 0 ? "border-t border-border" : ""}`}
                data-testid="revision-card"
                data-revision={row.n}
              >
                <UI.Box direction="row" align="center" gap={2} wrap>
                  <MaybeLink href={row.compareHref}>
                    <UI.Text as="span" size="sm" variant="mono">
                      {row.n}
                    </UI.Text>
                  </MaybeLink>
                  <RevisionKindMark kind={row.kind} from={row.from} note={row.note} />
                  {row.open ? (
                    <StatusIndicator tone="info" pulse>
                      {t("table.open")}
                    </StatusIndicator>
                  ) : null}
                </UI.Box>
                <MaybeLink href={row.compareHref}>
                  <UI.Text as="div" size="sm">
                    {summaryText(row.summary)}
                  </UI.Text>
                </MaybeLink>
                <UI.Text as="div" size="sm" variant="muted" title={author.title}>
                  {author.text} · {when(row.createdAt)}
                </UI.Text>
                <UI.Box direction="row" justify="end" fullWidth>
                  {row.n === current ? (
                    <UI.Text size="sm" variant="muted">
                      {t("table.current")}
                    </UI.Text>
                  ) : (
                    <RestoreButton
                      n={row.n}
                      onRestore={onRestore}
                      disabled={restoreDisabled}
                      variant="outline"
                      testId="revision-card-restore"
                    />
                  )}
                </UI.Box>
              </UI.Box>
            );
          })}
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}

/** Under the journal: squashing and paging — why the rows are not what was expected. */
export function JournalFootnote({ shown, total }: { shown: number; total: number }) {
  const t = useTranslations("pages.revisions");
  return (
    <UI.Box direction="column" gap={2} data-testid="revisions-footnote">
      <UI.Text size="sm" variant="muted">
        {t("footnote.squash")}
      </UI.Text>
      <UI.Text size="sm" variant="muted">
        {t("footnote.appendOnly", { shown, total })}
      </UI.Text>
      {total > shown ? (
        <UI.Text size="sm" variant="muted" data-testid="revisions-not-loaded">
          {t("footnote.notLoaded", { shown })}
        </UI.Text>
      ) : null}
    </UI.Box>
  );
}

/* ----------------------------------------------------------------- empty */

/** Only pages created before the journal existed have none: creation writes a row. */
export function RevisionsEmpty() {
  const t = useTranslations("pages.revisions");
  return (
    <UI.Card fullWidth data-testid="revisions-empty">
      <UI.EmptyState paddingY={10}>
        <UI.Box direction="column" align="center" gap={4} textAlign="center">
          <History size={40} aria-hidden="true" className="opacity-40" />
          <UI.Box direction="column" gap={1} align="center">
            <UI.Text as="h2" size="lg" weight="semibold">
              {t("empty.title")}
            </UI.Text>
            <UI.Text variant="muted" size="sm">
              {t("empty.hint")}
            </UI.Text>
          </UI.Box>
        </UI.Box>
      </UI.EmptyState>
    </UI.Card>
  );
}

/* --------------------------------------------------------------- compare */

const CHANGE_TONE: Record<ChangeKind, "success" | "error" | "warning"> = {
  added: "success",
  removed: "error",
  changed: "warning",
};

/**
 * Two revisions, before and after, block by block. `changes === null` —
 * a snapshot is not a page document, so there is nothing to compare by block.
 */
export function RevisionCompare({
  left,
  right,
  changes,
  loading = false,
  closeHref,
}: {
  left: number;
  right: number;
  changes: PageChange[] | null;
  loading?: boolean;
  closeHref: string;
}) {
  const t = useTranslations("pages.revisions");
  return (
    <UI.Card padding="none" fullWidth data-testid="revisions-compare" className="gap-4 py-4">
      <UI.Card.Header className="px-4">
        <UI.Box direction="row" align="start" justify="between" gap={3} wrap>
          <UI.Box direction="column" gap={1} className="min-w-0" grow>
            <UI.Card.Title>{t("compare.title", { left, right })}</UI.Card.Title>
            <UI.Card.Description>{t("compare.description", { left, right })}</UI.Card.Description>
          </UI.Box>
          <UI.Button asChild variant="ghost" size="sm" data-testid="compare-close">
            <Link href={closeHref}>
              <X size={14} aria-hidden="true" />
              {t("compare.close")}
            </Link>
          </UI.Button>
        </UI.Box>
      </UI.Card.Header>
      <UI.Card.Content className="p-0">
        {loading ? (
          <UI.Box direction="column" gap={3} className="px-4 py-4">
            <UI.Skeleton height={48} />
          </UI.Box>
        ) : changes === null ? (
          <UI.Box className="px-4 py-4">
            <UI.Text size="sm" variant="muted" data-testid="compare-incomparable">
              {t("compare.incomparable")}
            </UI.Text>
          </UI.Box>
        ) : changes.length === 0 ? (
          <UI.Box className="px-4 py-4">
            <UI.Text size="sm" variant="muted" data-testid="compare-same">
              {t("compare.same")}
            </UI.Text>
          </UI.Box>
        ) : (
          changes.map((change, index) => (
            <UI.Box
              key={`${change.kind}:${change.block}:${index}`}
              direction="column"
              gap={3}
              className={`px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}
              data-testid="compare-change"
            >
              <UI.Box direction="row" align="center" gap={3} wrap>
                <UI.Text as="span" size="sm" weight="medium">
                  {change.block}
                </UI.Text>
                <StatusIndicator tone={CHANGE_TONE[change.kind]}>{t(`compare.kind.${change.kind}`)}</StatusIndicator>
              </UI.Box>
              <UI.Box direction="row" gap={4} wrap>
                <UI.Box direction="column" gap={1} grow className="min-w-[14rem]" data-testid="compare-before">
                  <UI.Text as="span" size="xs" variant="muted">
                    {t("compare.before", { n: left })}
                  </UI.Text>
                  <UI.Text as="div" size="sm" variant={change.before ? undefined : "muted"}>
                    {change.before ?? t("compare.notExisted")}
                  </UI.Text>
                </UI.Box>
                <UI.Box direction="column" gap={1} grow className="min-w-[14rem]" data-testid="compare-after">
                  <UI.Text as="span" size="xs" variant="muted">
                    {t("compare.after", { n: right })}
                  </UI.Text>
                  <UI.Text as="div" size="sm" variant={change.after ? undefined : "muted"}>
                    {change.after ?? t("compare.removed")}
                  </UI.Text>
                </UI.Box>
              </UI.Box>
            </UI.Box>
          ))
        )}
      </UI.Card.Content>
    </UI.Card>
  );
}

/* --------------------------------------------------------------- restore */

type RestoreConfirmProps = {
  target: number;
  current: number;
  path: string;
  published: boolean;
  pending: boolean;
  /** The journal is being re-read: the version a restore would carry may be stale. */
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * What restoring does, in both directions, and the two buttons — the body of
 * the restore dialog. A component of its own: the dialog is portalled and
 * renders nothing under react-dom/server, the smokes execute this.
 */
export function RestoreConfirmBody({
  target,
  current,
  path,
  published,
  pending,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: RestoreConfirmProps) {
  const t = useTranslations("pages.revisions");
  return (
    <ConfirmDialogBody
      pending={pending}
      confirmDisabled={busy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
      cancelLabel={t("restoreConfirm.cancel")}
      confirmIcon={<RotateCcw size={16} aria-hidden="true" />}
      confirmLabel={t("restoreConfirm.confirm", { target })}
      pendingLabel={t("restoreConfirm.restoring")}
      testIds={{ body: "restore-body", cancel: "restore-cancel", confirm: "restore-confirm", error: "restore-error" }}
    >
      <UI.Box direction="column" gap={2} data-testid="restore-consequences">
        <ConfirmDialogLine icon={<History aria-hidden="true" />} testId="restore-keeps-journal">
          {t("restoreConfirm.keeps", { target, current })}
        </ConfirmDialogLine>
        <ConfirmDialogLine icon={<Server aria-hidden="true" />}>
          {published ? t("restoreConfirm.published", { path }) : t("restoreConfirm.unpublished", { path })}
        </ConfirmDialogLine>
        <ConfirmDialogLine icon={<Keyboard aria-hidden="true" />}>{t("restoreConfirm.unsavedLost")}</ConfirmDialogLine>
      </UI.Box>
    </ConfirmDialogBody>
  );
}

/**
 * The restore question (EP-186 pattern 5): a MODAL over the journal — the
 * list stays where it was, the dialog says what exactly will change, and only
 * its «Restore» restores. `target === null` = closed.
 */
export function RestoreConfirm({ target, ...props }: Omit<RestoreConfirmProps, "target"> & { target: number | null }) {
  const t = useTranslations("pages.revisions");
  // The last target stays drawn while the card animates out.
  const [shown, setShown] = React.useState(target ?? 0);
  React.useEffect(() => {
    if (target !== null) setShown(target);
  }, [target]);
  const n = target ?? shown;
  return (
    <ConfirmDialogShell
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) props.onCancel();
      }}
      title={t("restoreConfirm.title", { target: n })}
      description={t("restoreConfirm.description", { target: n })}
      pending={props.pending}
      testId="restore-dialog"
    >
      <RestoreConfirmBody
        {...props}
        target={n}
        onCancel={() => {
          if (!props.pending) props.onCancel();
        }}
      />
    </ConfirmDialogShell>
  );
}

/* -------------------------------------------------------------- conflict */

/** 409 page_version_conflict: the page moved while the history was open. */
export function RestoreConflict({
  target,
  seenVersion,
  actualVersion,
  refreshing,
  onRefresh,
}: {
  target: number;
  seenVersion: number;
  actualVersion: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("pages.revisions");
  return (
    <UI.Card fullWidth data-testid="conflict-card">
      <UI.Card.Header>
        <UI.Card.Title>
          <UI.Box direction="row" align="center" gap={2}>
            <AlertTriangle size={16} aria-hidden="true" />
            {t("conflict.title")}
          </UI.Box>
        </UI.Card.Title>
        <UI.Card.Description>{t("conflict.description")}</UI.Card.Description>
      </UI.Card.Header>
      <UI.Card.Content>
        <UI.Box direction="column" gap={4}>
          <UI.Box direction="row" align="center" gap={3} wrap>
            <SaveStatus state="conflict" label={t("conflict.label")} detail="page_version_conflict" />
            <UI.Box className="min-w-[14rem]" grow>
              <UI.Text as="div" size="sm" data-testid="conflict-versions">
                {actualVersion !== null
                  ? t("conflict.versions", { seenVersion, actualVersion, target })
                  : t("conflict.versionsUnknown", { seenVersion, target })}
              </UI.Text>
            </UI.Box>
          </UI.Box>
          <UI.Alert data-testid="conflict-why">
            <UI.Box direction="column" gap={1}>
              <UI.Text as="span" size="sm" weight="medium">
                {t("conflict.whyTitle")}
              </UI.Text>
              <UI.Text as="span" size="sm">
                {t("conflict.why", { target })}
              </UI.Text>
            </UI.Box>
          </UI.Alert>
        </UI.Box>
      </UI.Card.Content>
      <UI.Card.Footer>
        <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
          <UI.Button onClick={onRefresh} disabled={refreshing} data-testid="conflict-refresh">
            <History size={16} aria-hidden="true" />
            {t("conflict.refresh")}
          </UI.Button>
        </UI.Box>
      </UI.Card.Footer>
    </UI.Card>
  );
}
