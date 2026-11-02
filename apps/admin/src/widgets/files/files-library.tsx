"use client";

// The one files library (SDL-624). /files renders it as its section, the
// pages editor renders it inside the image picker — the same list, search,
// filter, previews and upload queue, never a second copy of them.
//
//   variant="section" — the /files library: storage bar + quota warning.
//   variant="picker"  — starts filtered to images, no storage bar, and keeps
//                       a compact drop zone so a picture can be uploaded
//                       straight from the picker.
//
// What stays on the /files page: its header and upload button, and the
// details / visibility / delete modes a card opens into. The library only
// reports `onOpen(file)`.

import * as React from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import * as Sentry from "@sentry/nextjs";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { useFilesUsage } from "@/entities/usage";
import {
  fileKeys,
  fileUrlQuery,
  filesApi,
  putBytes,
  sha256Hex,
  uploadOne,
  finishUpload,
  withTimeout,
  COMPLETE_TIMEOUT_MS,
  useFiles,
  useFilesDeliveryBase,
  type FileScope,
  type StoredFile,
  type UploadDeps,
  type UploadEvent,
  type UploadOutcome,
  type UploadStep,
  type UploadTicket,
} from "@/entities/files";
import { requestIdOf } from "@/shared/lib/api/client";

import {
  DropZone,
  FileGrid,
  FilesSearch,
  QuotaBar,
  QuotaWarning,
  UploadQueue,
  fileKind,
  filterFiles,
  formatBytes,
  type TypeFilter,
  type UploadRow,
} from "./files-parts";

/** One page of the library — the service's own ceiling (maxLimit = 100). */
const PAGE_LIMIT = 100;
const SEARCH_DEBOUNCE_MS = 300;
/** Thumbnails resolved per render; each one is a signed-URL request. */
const PREVIEW_LIMIT = 48;
/** Where the canvas raises the destructive alert. */
export const QUOTA_WARN_PERCENT = 90;

export function filesErrorMessage(e: unknown): string {
  if (e && typeof e === "object") {
    const data = (e as { data?: { message?: unknown } }).data;
    if (data && typeof data.message === "string" && data.message) return data.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export function FilesMessage({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <UI.Card fullWidth data-testid="files-message">
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

export function FilesGridSkeleton() {
  return (
    <UI.Card fullWidth data-testid="files-loading">
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

/* ---------------------------------------------------------------- upload */

export interface FileUploads {
  rows: UploadRow[];
  run: (picked: File[]) => Promise<void>;
  /** Stalled row: complete again on the same pending id (SDL-780). */
  retry?: (key: string) => Promise<void>;
  /** Stalled row: drop its pending row and upload the same file from scratch. */
  restart?: (key: string) => Promise<void>;
  reset: () => void;
}

/** Rows that are still moving — leaving the page now loses the upload. */
const IN_FLIGHT: ReadonlySet<UploadRow["state"]> = new Set(["sending", "storing", "checking"]);

function reportUploadError(step: UploadStep, error: unknown, extra: Record<string, unknown>) {
  try {
    Sentry.captureException(error, {
      tags: { area: "files-upload", step },
      extra: { ...extra, requestId: requestIdOf(error) },
    });
  } catch {
    // Telemetry never decides the row's fate.
  }
}

/**
 * The three-step upload (upload-url → PUT → complete) for a batch, one file
 * after another: files fail independently, and one refusal does not cancel
 * the rest (the canvas promises exactly that). The steps and their retry
 * rules live in `uploadOne` (SDL-780); this hook only paints rows.
 */
export function useFileUploads(
  scope: FileScope | null,
  onStart?: () => void,
  /** Called with each file that ends up ready (uploaded or deduplicated). */
  onUploaded?: (file: StoredFile) => void
): FileUploads {
  const qc = useQueryClient();
  const [rows, setRows] = React.useState<UploadRow[]>([]);
  /** The bytes and the issued ticket of each row — what Retry needs. */
  const jobs = React.useRef(new Map<string, { file: File; ticket?: UploadTicket }>());

  const patchRow = React.useCallback(
    (key: string, next: Partial<UploadRow>) =>
      setRows((current) => current.map((r) => (r.key === key ? { ...r, ...next } : r))),
    []
  );

  const busy = rows.some((r) => IN_FLIGHT.has(r.state));
  React.useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy engines show the dialog only when returnValue is set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // The caller's reaction to a ready file is not part of the upload: a
  // throwing callback must not turn a stored file into a «rejected» row.
  const notify = (ready: StoredFile) => {
    try {
      onUploaded?.(ready);
    } catch (err) {
      console.error("files: onUploaded failed", err);
    }
  };

  const depsFor = (key: string, file: File, sc: FileScope): UploadDeps<StoredFile> => ({
    uploadUrl: async () => {
      const checksum = await sha256Hex(file);
      return filesApi.uploadUrl({
        ...sc,
        checksum,
        size_bytes: file.size,
        mime: file.type || "application/octet-stream",
        filename: file.name,
      });
    },
    put: (ticket, hooks) => {
      jobs.current.set(key, { file, ticket });
      return putBytes({
        url: ticket.url,
        method: ticket.method,
        headers: ticket.headers,
        body: file,
        onProgress: hooks.onProgress,
        onSent: hooks.onSent,
      });
    },
    complete: (fileId) => withTimeout(filesApi.complete(fileId, sc), COMPLETE_TIMEOUT_MS),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    report: reportUploadError,
  });

  const paint = (key: string) => (event: UploadEvent) => {
    if (event.state === "sending") {
      patchRow(key, { state: "sending", percent: event.percent, since: undefined, error: undefined });
    } else {
      patchRow(key, { state: event.state, percent: undefined, since: event.since, error: undefined });
    }
  };

  const settle = (key: string, outcome: UploadOutcome<StoredFile>) => {
    if (outcome.kind === "stalled" || outcome.kind === "rejected" || outcome.kind === "expired") {
      const job = jobs.current.get(key);
      if (job && outcome.ticket) jobs.current.set(key, { ...job, ticket: outcome.ticket });
    }
    if (outcome.kind === "done") {
      patchRow(key, { state: outcome.deduplicated ? "deduplicated" : "done", percent: undefined, since: undefined });
      if (outcome.file) notify(outcome.file);
      jobs.current.delete(key);
    } else if (outcome.kind === "expired") {
      patchRow(key, { state: "expired", percent: undefined, since: undefined });
    } else if (outcome.kind === "stalled") {
      patchRow(key, {
        state: "stalled",
        percent: undefined,
        since: undefined,
        requestId: requestIdOf(outcome.error),
      });
    } else {
      patchRow(key, {
        state: "rejected",
        percent: undefined,
        since: undefined,
        error: filesErrorMessage(outcome.error),
      });
    }
    void qc.invalidateQueries({ queryKey: fileKeys.lists() });
  };

  const drive = async (key: string, work: () => Promise<UploadOutcome<StoredFile>>) => {
    try {
      settle(key, await work());
    } catch (e) {
      // upload-url itself failed (or hashing): nothing pending to finish.
      patchRow(key, { state: "rejected", percent: undefined, since: undefined, error: filesErrorMessage(e) });
      void qc.invalidateQueries({ queryKey: fileKeys.lists() });
    }
  };

  const run = async (picked: File[]) => {
    if (!scope) return;
    onStart?.();
    const batch: UploadRow[] = picked.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      name: f.name,
      size: formatBytes(f.size),
      state: "sending",
      percent: 0,
    }));
    setRows((current) => [...batch, ...current]);

    for (let i = 0; i < picked.length; i += 1) {
      const file = picked[i];
      const key = batch[i].key;
      jobs.current.set(key, { file });
      await drive(key, () => uploadOne(depsFor(key, file, scope), paint(key)));
    }
  };

  const retry = async (key: string) => {
    const job = jobs.current.get(key);
    if (!scope || !job?.ticket) return;
    const ticket = job.ticket;
    await drive(key, () => finishUpload(depsFor(key, job.file, scope), ticket, paint(key), { put: false }));
  };

  const restart = async (key: string) => {
    const job = jobs.current.get(key);
    if (!scope || !job) return;
    patchRow(key, { state: "sending", percent: 0, since: undefined, requestId: undefined });
    if (job.ticket) {
      const id = job.ticket.fileId;
      // The row may have finished on the server after all (a complete that
      // answered too late): then it is done, and deleting it would destroy
      // a good file. Only an own pending row is dropped.
      let current: StoredFile | null = null;
      try {
        current = await filesApi.get(id, scope);
      } catch {
        current = null; // gone already (GC, a parallel tab) — nothing to drop
      }
      if (current?.status === "ready") {
        settle(key, { kind: "done", file: current, deduplicated: false });
        return;
      }
      if (current?.status === "pending") {
        try {
          await filesApi.remove(id, scope);
        } catch (e) {
          reportUploadError("discard", e, { fileId: id });
        }
      }
    }
    jobs.current.set(key, { file: job.file });
    await drive(key, () => uploadOne(depsFor(key, job.file, scope), paint(key)));
  };

  const reset = React.useCallback(() => {
    setRows([]);
    jobs.current.clear();
  }, []);
  return { rows, run, retry, restart, reset };
}

/* --------------------------------------------------------------- library */

export interface FilesLibrarySummary {
  /** The listing answered. */
  loaded: boolean;
  /** Nothing in the library, no search, no uploads — the bare drop zone. */
  empty: boolean;
  /** Storage use at or over QUOTA_WARN_PERCENT. */
  nearQuota: boolean;
}

export function FilesLibrary({
  scope,
  uploads,
  variant = "section",
  onOpen,
  onSummary,
  selectedId = null,
}: {
  scope: FileScope;
  uploads: FileUploads;
  variant?: "section" | "picker";
  onOpen?: (file: StoredFile) => void;
  /** Picker: the file the field currently points at, marked in the grid. */
  selectedId?: string | null;
  onSummary?: (summary: FilesLibrarySummary) => void;
}) {
  const t = useTranslations("files");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [filter, setFilter] = React.useState<TypeFilter>(variant === "picker" ? "images" : "all");

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const listQuery = useFiles({ ...scope, page: 1, limit: PAGE_LIMIT, search: debounced || undefined });
  // Only confirmed files. A `pending` row is an upload whose step 3 never
  // came (it lives up to 6 h): it has no bytes, answers 404 on link/delete
  // and would inflate the storage sum.
  const rawCount = listQuery.data?.data?.length ?? 0;
  const files = React.useMemo(
    () => (listQuery.data?.data ?? []).filter((f) => f.status === "ready"),
    [listQuery.data]
  );
  const meta = listQuery.data?.meta;
  const visible = filterFiles(files, filter);

  // Thumbnails: one URL query per visible image card, the same query (and
  // cache entry) the pages canvas uses — fileUrlQuery answers an absolute
  // URL or a relative one, never one or the other depending on who asked
  // first (SDL-624). A public file is previewed only where the delivery host
  // is known — every product section since 29 Sep 2026, the host comes from
  // the shell (app/(product)/layout.tsx): without it its /files/<id> would
  // resolve against the admin host, so the glyph is shown instead. The gate
  // covers the read too — a disabled query still returns cached data.
  const deliveryBase = useFilesDeliveryBase();
  const previewable = (f: StoredFile) => !f.is_public || deliveryBase.trim() !== "";
  const previewTargets = visible.filter((f) => fileKind(f) === "image").slice(0, PREVIEW_LIMIT);
  const previewQueries = useQueries({
    queries: previewTargets.map((f) => ({
      ...fileUrlQuery(f.id, scope, deliveryBase),
      enabled: previewable(f),
      staleTime: 5 * 60 * 1000,
    })),
  });
  const previews: Record<string, string | undefined> = {};
  previewTargets.forEach((f, i) => {
    previews[f.id] = previewable(f) ? previewQueries[i]?.data?.url : undefined;
  });

  // Storage: files-service's own usage handle (GET /v1/files/usage, SDL-666)
  // — the used bytes, the quota and the one-file ceiling are the service's
  // answer, never a constant here and never a sum over a listing page.
  const usageQuery = useFilesUsage(scope);
  // A body without the counters (an older service, a stub) draws no bar.
  const usage = usageQuery.data?.bytes ? usageQuery.data : undefined;
  const usedBytes = usage?.bytes.used ?? 0;
  const quotaBytes = usage?.bytes.quota ?? 0;
  const percent = quotaBytes > 0 ? Math.round((usedBytes / quotaBytes) * 100) : 0;
  const empty = listQuery.isSuccess && files.length === 0 && !debounced && uploads.rows.length === 0;
  const nearQuota = percent >= QUOTA_WARN_PERCENT;

  React.useEffect(() => {
    onSummary?.({ loaded: listQuery.isSuccess, empty, nearQuota });
  }, [onSummary, listQuery.isSuccess, empty, nearQuota]);

  const drop = (compact: boolean) => <DropZone compact={compact} onFiles={(f) => void uploads.run(f)} />;

  const body = (() => {
    if (listQuery.isLoading) return <FilesGridSkeleton />;
    if (listQuery.error) {
      const status = (listQuery.error as { status?: number }).status;
      if (status === 401 || status === 403) {
        return <FilesMessage title={t("errors.access")}>{t("errors.accessHint")}</FilesMessage>;
      }
      return <FilesMessage title={t("errors.load")}>{listQuery.error.message}</FilesMessage>;
    }
    if (empty) return drop(false);
    return (
      <UI.Box direction="column" gap={4}>
        {uploads.rows.length > 0 ? (
          <>
            <UploadQueue rows={uploads.rows} onRetry={uploads.retry} onRestart={uploads.restart} />
            {drop(true)}
          </>
        ) : variant === "picker" ? (
          drop(true)
        ) : null}
        <FilesSearch
          query={search}
          onQueryChange={setSearch}
          active={filter}
          onActiveChange={setFilter}
          count={{ shown: visible.length, total: files.length }}
        />
        {variant === "section" ? (
          <>
            {usage ? <QuotaBar usedBytes={usedBytes} totalBytes={quotaBytes} /> : null}
            {usage && nearQuota ? (
              <QuotaWarning freeBytes={quotaBytes - usedBytes} maxFileBytes={usage.max_file_bytes} />
            ) : null}
          </>
        ) : null}
        {visible.length > 0 ? (
          <FileGrid files={visible} previews={previews} onOpen={onOpen} selectedId={selectedId} />
        ) : (
          <FilesMessage>{t("nothingFound")}</FilesMessage>
        )}
        {meta && meta.total > rawCount ? (
          <UI.Text size="sm" variant="muted" data-testid="files-truncated">
            {t("truncated", { shown: files.length, total: meta.total })}
          </UI.Text>
        ) : null}
      </UI.Box>
    );
  })();

  return (
    <UI.Box direction="column" gap={4} data-testid="files-library" data-variant={variant}>
      {body}
    </UI.Box>
  );
}
