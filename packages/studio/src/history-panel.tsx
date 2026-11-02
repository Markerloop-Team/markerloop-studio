"use client";

// SaunaHistoryPanel — Studio sidebar showing the current page's edit
// history with one-click Restore (M2 versioning, M2-PR10 admin
// integration).
//
// Decoupled from the rest of the Studio store: history is loaded
// fresh from a host-provided async fetcher and reapplied via a
// host-provided restore callback. That keeps the panel reusable
// across embedding contexts (Studio editor, public renderer preview,
// host admin surfaces), and it sidesteps cache-coherence headaches — every
// re-render re-fetches the latest list.
//
// MVP scope:
//   - List up to 50 revisions, newest first
//   - Highlight current revision (highest number) and any selected
//   - Inline note + relative timestamp
//   - Restore button with a confirmation modal
//   - Loading + error states (network failure shouldn't blank the
//     Studio)
//
// MVP-out: paginate beyond 50, side-by-side diff, author lookup
// against /v1/users (needs gw route for cross-context user lookup;
// row carries `author_user_id` so we *can* paint a name later
// without storage migration), restore-while-someone-else-edits
// surfacing.

import * as React from "react";
import type { ReactNode } from "react";

import { Alert, Badge, Button, Dialog, Text } from "@markerloop/ui/ui";
import { StudioIconButton, StudioPanel } from "./panel-parts";

export type RevisionRow = {
  id: string;
  revision_number: number;
  note?: string;
  created_at: string;
  author_user_id?: string | null;
};

export type SaunaHistoryPanelProps = {
  /**
   * Called every time the panel mounts or the user clicks "Refresh".
   * Returns the page's revision rows newest-first plus a total count
   * for the "showing N of M" badge.
   *
   * Embedders typically wrap a `fetch('/api/sauna-pages/<id>/revisions')`
   * call; the panel deliberately stays HTTP-free so it ports to
   * places where revisions come from a different transport (RSC,
   * websocket, in-memory test fixture).
   */
  fetchRevisions: () => Promise<{ items: RevisionRow[]; total: number }>;
  /**
   * Called when the user confirms a Restore. Resolves on success
   * (Studio refreshes the editor schema). Reject with an Error to
   * surface the message inline; the panel doesn't auto-retry.
   */
  onRestore: (revisionNumber: number) => Promise<void>;
  /**
   * Optional label for the source page — purely cosmetic, used in
   * the confirm-modal copy.
   */
  pageLabel?: string;
  disabled?: boolean;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; items: RevisionRow[]; total: number }
  | { kind: "error"; message: string };

export function SaunaHistoryPanel({
  fetchRevisions,
  onRestore,
  pageLabel,
  disabled,
}: SaunaHistoryPanelProps): ReactNode {
  const [state, setState] = React.useState<LoadState>({ kind: "idle" });
  const [pendingRestore, setPendingRestore] = React.useState<number | null>(null);
  const [restoreError, setRestoreError] = React.useState<string | null>(null);
  const [restoring, setRestoring] = React.useState(false);

  // Track the latest call so a slow first request can't overwrite a
  // fast second one (e.g. user clicks Refresh while initial fetch
  // is still in flight).
  const reqId = React.useRef(0);

  const load = React.useCallback(async () => {
    const myReq = ++reqId.current;
    setState({ kind: "loading" });
    try {
      const result = await fetchRevisions();
      if (myReq !== reqId.current) return;
      setState({ kind: "ready", items: result.items, total: result.total });
    } catch (e: unknown) {
      if (myReq !== reqId.current) return;
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [fetchRevisions]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const confirmRestore = (revisionNumber: number) => {
    setPendingRestore(revisionNumber);
    setRestoreError(null);
  };

  const doRestore = async () => {
    if (pendingRestore == null) return;
    setRestoring(true);
    try {
      await onRestore(pendingRestore);
      setPendingRestore(null);
      setRestoreError(null);
      // Refresh the list so the new "restored from N" revision shows.
      await load();
    } catch (e: unknown) {
      setRestoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <StudioPanel
      title="History"
      data-sauna-history
      actions={
        <StudioIconButton
          label="Refresh"
          onClick={load}
          disabled={disabled || state.kind === "loading"}
        >
          ⟳
        </StudioIconButton>
      }
    >
      <Body state={state} disabled={disabled} onRestoreClick={confirmRestore} />

      {pendingRestore != null ? (
        <ConfirmRestoreModal
          revisionNumber={pendingRestore}
          pageLabel={pageLabel}
          error={restoreError}
          busy={restoring}
          onConfirm={doRestore}
          onCancel={() => {
            if (!restoring) {
              setPendingRestore(null);
              setRestoreError(null);
            }
          }}
        />
      ) : null}
    </StudioPanel>
  );
}

// ---- Body sub-component (separated for readability) -----------------

function Body({
  state,
  disabled,
  onRestoreClick,
}: {
  state: LoadState;
  disabled?: boolean;
  onRestoreClick: (n: number) => void;
}) {
  if (state.kind === "loading" || state.kind === "idle") {
    return (
      <Text size="xs" variant="muted">
        Loading history…
      </Text>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex flex-col gap-1">
        <Text size="xs" variant="destructive">
          {state.message}
        </Text>
        <Text size="xs" variant="muted">
          Click ⟳ to retry.
        </Text>
      </div>
    );
  }
  if (state.items.length === 0) {
    return (
      <Text size="xs" variant="muted">
        No revisions yet. Save the page to record its first revision.
      </Text>
    );
  }

  const latest = state.items[0]?.revision_number;

  return (
    <div className="flex flex-col gap-2">
      <Text size="xs" variant="muted">
        Showing {state.items.length} of {state.total} revisions
      </Text>
      {state.items.map((row) => (
        <RevisionRowView
          key={row.id}
          row={row}
          isCurrent={row.revision_number === latest}
          disabled={disabled}
          onRestore={() => onRestoreClick(row.revision_number)}
        />
      ))}
    </div>
  );
}

function RevisionRowView({
  row,
  isCurrent,
  disabled,
  onRestore,
}: {
  row: RevisionRow;
  isCurrent: boolean;
  disabled?: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Text as="span" size="xs" weight="medium" className="font-mono tabular-nums">
            #{row.revision_number}
          </Text>
          {isCurrent ? (
            <Badge variant="secondary" className="px-1.5">
              current
            </Badge>
          ) : null}
        </div>
        <Text as="div" size="xs" variant="muted">
          {formatRelative(row.created_at)}
          {row.note ? <span className="ml-1">— {row.note}</span> : null}
        </Text>
      </div>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={onRestore}
        disabled={disabled || isCurrent}
        title={isCurrent ? "This is the current revision" : "Restore"}
      >
        Restore
      </Button>
    </div>
  );
}

// ---- Confirm modal ---------------------------------------------------

function ConfirmRestoreModal({
  revisionNumber,
  pageLabel,
  error,
  busy,
  onConfirm,
  onCancel,
}: {
  revisionNumber: number;
  pageLabel?: string;
  error: string | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // The hand-rolled backdrop this replaced trapped neither focus nor Escape:
  // the dialog from the kit brings both, and the panel already depends on the
  // package's own UI entry after S2.1.
  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Content maxWidth={360}>
        <Dialog.Header>
          <Dialog.Title>Restore revision #{revisionNumber}?</Dialog.Title>
          <Dialog.Description asChild>
            <div className="space-y-2 text-xs">
              <p>
                History is append-only: restoring creates a{" "}
                <strong>new revision</strong> (the next number) containing the body
                from #{revisionNumber}. Nothing is rewound or lost — every prior
                revision remains visible.
              </p>
              <p>
                {pageLabel
                  ? `Effect: "${pageLabel}" starts editing from the body of #${revisionNumber}.`
                  : `Effect: editing continues from the body of #${revisionNumber}.`}
              </p>
            </div>
          </Dialog.Description>
        </Dialog.Header>
        {error ? (
          <Alert variant="destructive" className="p-2 text-xs">
            {error}
          </Alert>
        ) : null}
        <Dialog.Footer>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onConfirm} disabled={busy}>
            {busy ? "Restoring…" : "Restore"}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}

// ---- Helpers --------------------------------------------------------

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const now = Date.now();
  const diff = Math.round((now - then) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
