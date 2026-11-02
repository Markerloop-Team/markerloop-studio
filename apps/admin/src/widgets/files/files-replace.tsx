"use client";

// «Replace file» (SDL-652, EP-139) — the dialog after the replacement has
// been picked in the shared FilesPickerDialog (the one picker the pages
// editor and the collections image field open; the page opens it, not this
// file).
//
// Two stages in one dialog:
//   confirm — «A → B» and the LIVE places that will change, drawn by the
//             same FileUsageList the delete dialog uses (SDL-650), with the
//             same links into the record panel / the page editor. Places
//             only in revision history are one line: history is not
//             rewritten (owner decision, SDL-651).
//   result  — per place: replaced / not replaced and why (the place owner's
//             code, in words). When the original has no live place left,
//             the offer to delete it — through the ordinary SDL-650 delete
//             dialog, which the page opens; nothing is deleted from here.
//
// Nothing here fetches: the page owns the queries and the replace mutation
// (POST /v1/files/:id/replace — files-service asks every place owner to swap
// the value under its own version check). The body is a component of its
// own so `smoke:files` can render it under react-dom/server — the kit's
// Dialog.Content is portalled and renders nothing there.

import * as React from "react";
import { ArrowDown, Check, RefreshCw, Trash2 } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { StatusIndicator } from "@markerloop/ui/ui/admin";

import { useTranslations } from "@/shared/hooks";
import type { FileLink, ReplaceFileResult, ReplaceUsage, StoredFile } from "@/entities/files";

import { FileName, FileUsageList, UsageHistoryLine, splitFileLinks, type DescribeFileLink } from "./files-parts";

/** The words for a place the replace did not change — one key per known code. */
export type ReplaceReasonKey =
  | "valueChanged"
  | "versionConflict"
  | "kindMismatch"
  | "uniqueConflict"
  | "fieldNotFile"
  | "publicationImmutable"
  | "deadline"
  | "unavailable"
  | "notFound"
  | "other";

/**
 * A place owner's refusal code → the reason key. The codes come as is from
 * collections-service / pages-service or from the files-service orchestrator
 * (`deadline_exceeded`, `upstream_*`); an unknown one keeps its code visible.
 */
export function replaceReasonKey(usage: Pick<ReplaceUsage, "status" | "code">): ReplaceReasonKey {
  const code = usage.code ?? "";
  if (code === "field_value_changed") return "valueChanged";
  if (code === "version_conflict" || code === "record_version_conflict") return "versionConflict";
  if (code === "replacement_kind_mismatch") return "kindMismatch";
  // collections-service: the field is unique and the new file already stands
  // in another record (409); the field is not a file field any more (422).
  if (code === "unique_value_conflict") return "uniqueConflict";
  if (code === "field_not_file") return "fieldNotFile";
  // files-service (SDL-676): the live publication snapshot is never rewritten
  // by a replace — it changes only when the page is published again.
  if (code === "publication_immutable") return "publicationImmutable";
  if (code === "deadline_exceeded" || usage.status === "skipped") return "deadline";
  if (code.startsWith("upstream_")) return "unavailable";
  if (code === "not_found" || code.endsWith("_not_found")) return "notFound";
  return "other";
}

/** A replace outcome row as a link, so the one `describe` names it. */
export function usageAsLink(u: ReplaceUsage, fileId: string): FileLink {
  return {
    file_id: fileId,
    record_id: u.record_id,
    collection: u.collection,
    field: u.field,
    created_at: "",
    source: u.source ?? "live",
  };
}

export type ReplaceStage = "confirm" | "result";

export function ReplaceFileBody({
  original,
  replacement,
  stage,
  links,
  linksLoading = false,
  linksError = false,
  onReloadLinks,
  describe,
  busy = false,
  error,
  result,
  remainingLive,
  onCancel,
  onConfirm,
  onRetry,
  onChooseOther,
  onDeleteOriginal,
}: {
  original: Pick<StoredFile, "id" | "filename">;
  replacement: Pick<StoredFile, "id" | "filename">;
  stage: ReplaceStage;
  /** The original's links as the usage read returned them (live and history). */
  links: FileLink[];
  linksLoading?: boolean;
  /** The usage re-read failed: say so and offer to read again — never «nothing to replace». */
  linksError?: boolean;
  onReloadLinks?: () => void;
  describe?: DescribeFileLink;
  busy?: boolean;
  error?: string | null;
  result?: ReplaceFileResult | null;
  /** Live places the original still has after the replace; null while it is re-read. */
  remainingLive?: number | null;
  onCancel?: () => void;
  onConfirm?: () => void;
  onRetry?: () => void;
  onChooseOther?: () => void;
  onDeleteOriginal?: () => void;
}) {
  const t = useTranslations("files");
  const { live, history } = splitFileLinks(links);

  const pair = (
    <UI.Box direction="column" gap={1} className="min-w-0" data-testid="replace-pair">
      <UI.Box direction="row" align="center" gap={2} className="min-w-0">
        <UI.Text as="span" size="xs" variant="muted" className="w-16 shrink-0">
          {t("replace.from")}
        </UI.Text>
        <FileName file={original} className="min-w-0" />
      </UI.Box>
      <ArrowDown size={14} aria-hidden="true" className="ml-16 opacity-50" />
      <UI.Box direction="row" align="center" gap={2} className="min-w-0" data-testid="replace-target">
        <UI.Text as="span" size="xs" variant="muted" className="w-16 shrink-0">
          {t("replace.to")}
        </UI.Text>
        <FileName file={replacement} className="min-w-0" />
      </UI.Box>
    </UI.Box>
  );

  if (stage === "result" && result) {
    const total = result.usages.length;
    const allDone = result.failed === 0 && result.skipped === 0;
    // A published version skipped as immutable will be skipped again: retry
    // only when something failed or some skip is not publication_immutable.
    const retryable =
      result.failed > 0 ||
      result.usages.some((u) => u.status === "skipped" && replaceReasonKey(u) !== "publicationImmutable");
    return (
      <UI.Box direction="column" gap={4} className="min-w-0" data-testid="replace-result" data-all-done={allDone ? "true" : "false"}>
        {pair}
        <UI.Text size="sm" weight="medium" data-testid="replace-summary">
          {total === 0
            ? t("replace.resultNone")
            : t("replace.resultSummary", { replaced: result.replaced, total })}
        </UI.Text>
        {total > 0 ? (
          <div className="max-h-56 overflow-y-auto">
            <UI.Box direction="column" gap={0} data-testid="replace-outcome-list">
              {result.usages.map((u, index) => {
                const link = usageAsLink(u, result.file_id);
                const ok = u.status === "replaced";
                const reason = ok ? null : replaceReasonKey(u);
                return (
                  <UI.Box
                    key={`${u.collection}-${u.record_id}-${u.field}`}
                    direction="column"
                    gap={1}
                    className={`min-w-0 py-2 ${index > 0 ? "border-t border-border" : ""}`}
                    data-testid="replace-outcome"
                    data-status={u.status}
                  >
                    <FileUsageList links={[link]} describe={describe} testIdPrefix="replace-outcome" bare />
                    {ok ? (
                      <StatusIndicator tone="success">{t("replace.replaced")}</StatusIndicator>
                    ) : (
                      <UI.Box direction="column" gap={1} className="min-w-0">
                        <StatusIndicator tone={u.status === "skipped" ? "warning" : "error"}>
                          {t("replace.notReplaced")}
                        </StatusIndicator>
                        <UI.Text as="span" size="xs" variant="muted" data-testid="replace-reason" data-reason={reason ?? ""}>
                          {t(`replace.reason.${reason}`, { code: u.code ?? "" })}
                        </UI.Text>
                      </UI.Box>
                    )}
                  </UI.Box>
                );
              })}
            </UI.Box>
          </div>
        ) : null}

        {history.pages + history.blocks + history.records > 0 ? (
          <UI.Text size="xs" variant="muted" data-testid="replace-history-note">
            {t("replace.historyKept")}
          </UI.Text>
        ) : null}

        {remainingLive === 0 ? (
          <UI.Alert data-testid="replace-offer-delete">
            <UI.Box direction="column" gap={2} className="min-w-0">
              <UI.Text as="span" size="sm">
                {t("replace.offerDelete", { name: original.filename ?? t("untitledFile") })}
              </UI.Text>
            </UI.Box>
          </UI.Alert>
        ) : remainingLive && remainingLive > 0 ? (
          <UI.Text size="sm" variant="muted" data-testid="replace-still-used">
            {t("replace.stillUsed", { count: remainingLive })}
          </UI.Text>
        ) : null}

        {error ? (
          <UI.Alert variant="destructive" data-testid="replace-error">
            <UI.Text as="span" size="sm">
              {error}
            </UI.Text>
          </UI.Alert>
        ) : null}

        <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
          {retryable ? (
            <UI.Button variant="outline" onClick={onRetry} disabled={busy} data-testid="replace-retry">
              <RefreshCw size={16} aria-hidden="true" />
              {t("replace.retry")}
            </UI.Button>
          ) : null}
          {remainingLive === 0 ? (
            <UI.Button variant="outline" onClick={onDeleteOriginal} disabled={busy} data-testid="replace-delete-original">
              <Trash2 size={16} aria-hidden="true" />
              {t("replace.deleteOriginal")}
            </UI.Button>
          ) : null}
          <UI.Button onClick={onCancel} disabled={busy} data-testid="replace-done">
            {t("replace.done")}
          </UI.Button>
        </UI.Box>
      </UI.Box>
    );
  }

  const linksFailed = !linksLoading && linksError;
  const nothing = !linksLoading && !linksFailed && live.length === 0;
  return (
    <UI.Box direction="column" gap={4} className="min-w-0" data-testid="replace-body" data-live={String(live.length)}>
      {pair}

      {linksLoading ? (
        <UI.Text size="sm" variant="muted" data-testid="replace-usage-loading">
          {t("usage.loading")}
        </UI.Text>
      ) : null}

      {live.length > 0 ? (
        <UI.Box direction="column" gap={1}>
          <UI.Text as="h3" size="sm" weight="medium">
            {t("replace.title", { count: live.length })}
          </UI.Text>
          <div className="max-h-56 overflow-y-auto">
            <FileUsageList links={live} describe={describe} testIdPrefix="replace-usage" />
          </div>
        </UI.Box>
      ) : null}
      <UsageHistoryLine history={history} testId="replace-usage-history" />
      {history.pages + history.blocks + history.records > 0 ? (
        <UI.Text size="xs" variant="muted" data-testid="replace-history-note">
          {t("replace.historyKept")}
        </UI.Text>
      ) : null}

      {linksFailed ? (
        <UI.Alert variant="destructive" data-testid="replace-links-error">
          <UI.Box direction="column" gap={2} className="min-w-0">
            <UI.Text as="span" size="sm">
              {t("replace.linksError")}
            </UI.Text>
            <UI.Box direction="row" justify="start">
              <UI.Button variant="outline" size="sm" onClick={onReloadLinks} data-testid="replace-links-retry">
                <RefreshCw size={14} aria-hidden="true" />
                {t("replace.retry")}
              </UI.Button>
            </UI.Box>
          </UI.Box>
        </UI.Alert>
      ) : null}

      {nothing ? (
        <UI.Alert data-testid="replace-nothing">
          <UI.Text as="span" size="sm">
            {t("replace.nothing")}
          </UI.Text>
        </UI.Alert>
      ) : null}

      {error ? (
        <UI.Alert variant="destructive" data-testid="replace-error">
          <UI.Text as="span" size="sm">
            {error}
          </UI.Text>
        </UI.Alert>
      ) : null}

      <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
        <UI.Button variant="ghost" onClick={onCancel} disabled={busy} data-testid="replace-cancel">
          {t("cancel")}
        </UI.Button>
        <UI.Button variant="outline" onClick={onChooseOther} disabled={busy} data-testid="replace-choose-other">
          {t("replace.chooseOther")}
        </UI.Button>
        <UI.Button
          onClick={onConfirm}
          disabled={busy || linksLoading || linksFailed || live.length === 0}
          data-testid="replace-confirm"
        >
          {busy ? <RefreshCw size={16} aria-hidden="true" className="animate-spin" /> : <Check size={16} aria-hidden="true" />}
          {busy ? t("replace.running") : t("replace.confirm", { count: live.length })}
        </UI.Button>
      </UI.Box>
    </UI.Box>
  );
}

export function ReplaceFileDialog({
  open,
  onOpenChange,
  ...body
}: React.ComponentProps<typeof ReplaceFileBody> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("files");
  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      {/* 100dvh, not vh: on a phone the browser bar would push the buttons
          under the fold; the body scrolls inside the dialog instead. */}
      <UI.Dialog.Content
        maxWidth={560}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        data-testid="replace-dialog"
        // Focus on Cancel / Done, never on the first place link: Enter must
        // neither leave the page nor start the replace.
        onOpenAutoFocus={(e) => {
          const root = e.currentTarget as HTMLElement | null;
          const target = root?.querySelector<HTMLElement>('[data-testid="replace-cancel"], [data-testid="replace-done"]');
          if (!target) return;
          e.preventDefault();
          target.focus();
        }}
      >
        <UI.Dialog.Header>
          <UI.Dialog.Title>{body.stage === "result" ? t("replace.resultTitle") : t("replace.dialogTitle")}</UI.Dialog.Title>
          <UI.Dialog.Description>{t("replace.description")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        {open ? <ReplaceFileBody {...body} /> : null}
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}
