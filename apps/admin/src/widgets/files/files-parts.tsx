"use client";

// Building blocks of the files section (SDL-623, EP-124).
//
// Layout is the canvas /design-system/files (SDL-598,
// app/design-system/_canvas/files-parts.tsx) — same kit components, same
// order of facts, same testids — fed with live files-service rows and with
// catalogue strings instead of the canvas's fixed English. Nothing here
// fetches: the page (app/(product)/files/page.tsx) owns queries and
// mutations, these pieces render what they are given, which is also what
// lets `smoke:files` render them under react-dom/server.
//
// The one hand-built element is the fill bar (QuotaBar, upload progress):
// the kit has no progress/meter component. It uses theme tokens only.

import * as React from "react";
import { PolicyLine } from "@/entities/policy/ui/policy-line";
import { DeleteDialogBody, DeleteDialogShell } from "@/shared/components/delete-dialog";
import { ItemPanelFrame, ItemPanelGroup } from "@/shared/components/item-panel";
import { formatBytes } from "@/shared/lib/format-bytes";
import NextLink from "next/link";
import {
  AlertTriangle,
  Check,
  FileText,
  Globe,
  Image as ImageIcon,
  Link2,
  Lock,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { Grid, SaveStatus, StatusIndicator } from "@markerloop/ui/ui/admin";
import { DataView, type DataViewField } from "@/shared/components/data-view";

import { useTranslations } from "@/shared/hooks";
import { isDeliverableFileUrl, type FileLink, type StoredFile } from "@/entities/files";

/* ------------------------------------------------------------ helpers */

export type FileKind = "image" | "doc";

export function fileKind(file: Pick<StoredFile, "mime">): FileKind {
  return file.mime.startsWith("image/") ? "image" : "doc";
}

/** Binary units, one decimal above KB — what the canvas prints ("2.4 MB"). */
export { formatBytes };

export function fileDimensions(file: Pick<StoredFile, "width" | "height">): string | null {
  return file.width && file.height ? `${file.width}×${file.height}` : null;
}

export type TypeFilter = "all" | "images" | "docs" | "public";

export function filterFiles(files: StoredFile[], filter: TypeFilter): StoredFile[] {
  switch (filter) {
    case "images":
      return files.filter((f) => fileKind(f) === "image");
    case "docs":
      return files.filter((f) => fileKind(f) === "doc");
    case "public":
      return files.filter((f) => f.is_public);
    default:
      return files;
  }
}

/* ------------------------------------------------------------ preview */

/**
 * Preview tile. A resolved `src` (signed link for a private image) shows the
 * real thumbnail; otherwise the canvas's type glyph — never a stand-in image.
 */
export function FilePreview({
  kind,
  size = "tile",
  src,
  alt,
}: {
  kind: FileKind;
  size?: "tile" | "large";
  src?: string | null;
  alt?: string;
}) {
  const Icon = kind === "image" ? ImageIcon : FileText;
  return (
    <UI.Box
      variant="center"
      className="aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-muted"
      data-testid="file-preview"
    >
      {kind === "image" && src ? (
        <img src={src} alt={alt ?? ""} className="h-full w-full object-contain" loading="lazy" />
      ) : (
        <Icon size={size === "large" ? 48 : 28} aria-hidden="true" className="opacity-40" />
      )}
    </UI.Box>
  );
}

/** File name; a missing one reads «untitled», never an empty line or an id. */
export function FileName({ file, className }: { file: Pick<StoredFile, "filename">; className?: string }) {
  const t = useTranslations("files");
  if (file.filename) {
    return (
      <UI.Text as="span" size="sm" weight="medium" className={`truncate ${className ?? ""}`} data-testid="file-name">
        {file.filename}
      </UI.Text>
    );
  }
  return (
    <UI.Text as="span" size="sm" variant="muted" className={`truncate italic ${className ?? ""}`} data-testid="file-name">
      {t("untitled")}
    </UI.Text>
  );
}

/** Public mark — only on public files; private is the default and unmarked. */
export function PublicMark({ file }: { file: Pick<StoredFile, "is_public"> }) {
  const t = useTranslations("files");
  if (!file.is_public) return null;
  return (
    <UI.Badge variant="secondary" className="gap-1" data-testid="file-public">
      <Globe size={14} aria-hidden="true" />
      {t("public")}
    </UI.Badge>
  );
}

/* ------------------------------------------------------------ library */

/**
 * The library grid on the admin's one tile pattern (EP-186, pattern 2): a
 * DataView in `view="tiles"` — kit TileGrid (auto-fill, 240px minimum) and
 * Tile, drawn from the file's field description. The whole tile is the
 * button that opens the file; the picker's chosen file is ringed and
 * aria-pressed.
 */
export function FileGrid({
  files,
  previews = {},
  onOpen,
  selectedId = null,
}: {
  files: StoredFile[];
  previews?: Record<string, string | undefined>;
  onOpen?: (file: StoredFile) => void;
  /** The currently chosen file (picker): ringed and aria-pressed. */
  selectedId?: string | null;
}) {
  const t = useTranslations("files");
  const fields = React.useMemo<DataViewField<StoredFile>[]>(
    () => [
      {
        id: "preview",
        render: (file) => <FilePreview kind={fileKind(file)} src={previews[file.id]} alt={file.filename ?? ""} />,
        tile: "media",
      },
      {
        id: "filename",
        value: (file) => file.filename,
        render: (file) => <FileName file={file} className="block" />,
        tile: "title",
      },
      { id: "public", render: (file) => <PublicMark file={file} />, tile: "badge" },
      { id: "size", value: (file) => file.size_bytes, render: (file) => formatBytes(file.size_bytes), tile: "meta" },
    ],
    [previews]
  );
  const selectedIds = React.useMemo(() => new Set(selectedId === null ? [] : [selectedId]), [selectedId]);
  return (
    <DataView
      view="tiles"
      fields={fields}
      data={files}
      getRowId={(file) => file.id}
      tilesTestId="file-grid"
      selection={{ mode: "single", selectedIds }}
      onRowClick={onOpen}
      rowAttributes={(file) => ({
        "data-testid": "file-card",
        "data-file-id": file.id,
        "aria-pressed": onOpen && selectedId !== null ? selectedId === file.id : undefined,
        "aria-label": onOpen ? t("openFile", { name: file.filename ?? t("untitled") }) : undefined,
      })}
    />
  );
}

/* ------------------------------------------------------------ quota */

/**
 * Storage fill bar. Until SDL-619 moves files to workspace scope the
 * service counts the quota PER PROJECT, so the label says «project» and a
 * note says why; `partial` marks a sum over the first page of a library
 * larger than one page («at least»), never an extrapolated number.
 */
export function QuotaBar({
  usedBytes,
  totalBytes,
  partial = false,
}: {
  usedBytes: number;
  totalBytes: number;
  partial?: boolean;
}) {
  const t = useTranslations("files");
  const percent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
  const clamped = Math.max(0, Math.min(100, percent));
  const used = formatBytes(usedBytes);
  const total = formatBytes(totalBytes);
  return (
    <UI.Box direction="column" gap={2} fullWidth data-testid="quota">
      <UI.Box direction="row" align="center" gap={3} wrap>
        <UI.Text as="span" size="sm" weight="medium">
          {t("quota.label")}
        </UI.Text>
        <UI.Text as="span" size="sm" variant="muted" data-testid="quota-numbers">
          {partial ? t("quota.numbersPartial", { used, total }) : t("quota.numbers", { used, total })}
        </UI.Text>
      </UI.Box>
      <UI.Box
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={t("quota.aria")}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <UI.Box className="h-full rounded-full bg-primary" style={{ width: `${clamped}%` }} />
      </UI.Box>
      <UI.Text as="span" size="xs" variant="muted" data-testid="quota-scope-note">
        {t("quota.scopeNote")}
      </UI.Text>
    </UI.Box>
  );
}

/**
 * «The next upload won't go through» is true only when less than one
 * maximum-size file fits; above that the alert says «running low». The
 * ceiling is files-service's own (`max_file_bytes` of /v1/files/usage).
 */
export function QuotaWarning({ freeBytes, maxFileBytes }: { freeBytes: number; maxFileBytes: number }) {
  const t = useTranslations("files");
  const blocking = freeBytes < maxFileBytes;
  return (
    <UI.Alert variant="destructive" data-testid="quota-warning" data-blocking={blocking ? "true" : "false"}>
      <UI.Box direction="column" gap={1}>
        <UI.Box direction="row" align="center" gap={2}>
          <AlertTriangle size={16} aria-hidden="true" />
          <UI.Text as="span" size="sm" weight="medium">
            {blocking ? t("quota.warningTitle") : t("quota.lowTitle")}
          </UI.Text>
        </UI.Box>
        <UI.Text as="span" size="sm">
          {t(blocking ? "quota.warningBody" : "quota.lowBody", {
            free: formatBytes(Math.max(0, freeBytes)),
            max: formatBytes(maxFileBytes),
          })}
        </UI.Text>
      </UI.Box>
    </UI.Alert>
  );
}

/* ------------------------------------------------------------ upload */

export type UploadRowState =
  | "sending"
  /** The body left whole; the storage has not answered the PUT yet (SDL-780). */
  | "storing"
  | "checking"
  /** Storage did not answer in time — the file is not lost, Retry finishes it. */
  | "stalled"
  /** The bytes never landed and the signed URL is dead — Start over only. */
  | "expired"
  | "deduplicated"
  | "done"
  | "rejected";

export type UploadRow = {
  key: string;
  name: string;
  size: string;
  state: UploadRowState;
  /** `sending` only — share of bytes sent, 0..100. */
  percent?: number;
  /** `storing` / `checking` — epoch ms the wait started, for the seconds counter. */
  since?: number;
  /** `rejected` only — the service's own sentence. */
  error?: string;
  /** `stalled` — the gateway's request id, for support. */
  requestId?: string;
};

/** Seconds since `since`, ticking once a second while mounted. */
function useElapsedSeconds(since: number | undefined): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (since === undefined) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [since]);
  return since === undefined ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

/** From here the checking row says how long it has been waiting. */
const SHOW_ELAPSED_AFTER_S = 5;
/** From here it adds «storage is slow, nothing to do». */
const SHOW_SLOW_AFTER_S = 10;

export function UploadQueue({
  rows,
  onRetry,
  onRestart,
}: {
  rows: UploadRow[];
  onRetry?: (key: string) => void;
  onRestart?: (key: string) => void;
}) {
  const t = useTranslations("files");
  return (
    <UI.Card padding="none" fullWidth data-testid="upload-queue" className="gap-4 py-4">
      <UI.Card.Header className="px-4">
        <UI.Card.Title>{t("upload.title", { count: rows.length })}</UI.Card.Title>
        <UI.Card.Description>{t("upload.description")}</UI.Card.Description>
      </UI.Card.Header>
      <UI.Card.Content className="p-0">
        {rows.map((row, index) => (
          <UploadQueueRow
            key={row.key}
            row={row}
            first={index === 0}
            onRetry={onRetry}
            onRestart={onRestart}
          />
        ))}
      </UI.Card.Content>
    </UI.Card>
  );
}

function UploadQueueRow({
  row,
  first,
  onRetry,
  onRestart,
}: {
  row: UploadRow;
  first: boolean;
  onRetry?: (key: string) => void;
  onRestart?: (key: string) => void;
}) {
  const t = useTranslations("files");
  const elapsed = useElapsedSeconds(
    row.state === "storing" || row.state === "checking" ? row.since : undefined
  );
  return (
    <UI.Box
      direction="column"
      gap={2}
      className={`px-4 py-3 ${first ? "" : "border-t border-border"}`}
      data-testid="upload-row"
      data-state={row.state}
    >
      <UI.Box direction="row" align="center" gap={3} wrap>
        <UI.Box direction="column" className="min-w-0" grow>
          <UI.Text as="span" size="sm" weight="medium" className="truncate">
            {row.name}
          </UI.Text>
          <UI.Text as="span" size="xs" variant="muted">
            {row.size}
          </UI.Text>
        </UI.Box>
        <UploadMark row={row} elapsed={elapsed} />
      </UI.Box>
      {row.state === "sending" || row.state === "storing" ? (
        <UI.Box
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={row.state === "storing" ? 100 : (row.percent ?? 0)}
          aria-label={t("upload.progressAria", { name: row.name })}
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          data-testid="upload-progress"
        >
          <UI.Box
            className={`h-full rounded-full bg-primary ${row.state === "storing" ? "animate-pulse" : ""}`}
            style={{ width: `${row.state === "storing" ? 100 : (row.percent ?? 0)}%` }}
          />
        </UI.Box>
      ) : null}
      <UploadExplain row={row} elapsed={elapsed} />
      {row.state === "stalled" || row.state === "expired" ? (
        <UI.Box direction="row" gap={2} align="center" wrap>
          {onRetry && row.state === "stalled" ? (
            <UI.Button size="sm" onClick={() => onRetry(row.key)} data-testid="upload-retry">
              {t("upload.retry")}
            </UI.Button>
          ) : null}
          {onRestart ? (
            <UI.Button
              size="sm"
              variant="outline"
              onClick={() => onRestart(row.key)}
              data-testid="upload-restart"
            >
              {t("upload.restart")}
            </UI.Button>
          ) : null}
          {row.requestId ? (
            <UI.Text as="span" size="xs" variant="muted" className="font-mono" data-testid="upload-request-id">
              {row.requestId}
            </UI.Text>
          ) : null}
        </UI.Box>
      ) : null}
    </UI.Box>
  );
}

function UploadMark({ row, elapsed }: { row: UploadRow; elapsed: number }) {
  const t = useTranslations("files");
  switch (row.state) {
    case "sending":
      return (
        <UI.Text as="span" size="sm" variant="muted" data-testid="upload-mark">
          {row.percent ?? 0}%
        </UI.Text>
      );
    case "storing":
      return (
        <SaveStatus
          state="saving"
          label={t("upload.storing", { seconds: elapsed })}
          data-testid="upload-mark"
        />
      );
    case "checking":
      return (
        <SaveStatus
          state="saving"
          label={
            elapsed >= SHOW_ELAPSED_AFTER_S
              ? t("upload.checkingElapsed", { seconds: elapsed })
              : t("upload.checking")
          }
          data-testid="upload-mark"
        />
      );
    case "stalled":
      return (
        <StatusIndicator tone="warning" data-testid="upload-mark">
          {t("upload.stalled")}
        </StatusIndicator>
      );
    case "expired":
      return (
        <StatusIndicator tone="warning" data-testid="upload-mark">
          {t("upload.expired")}
        </StatusIndicator>
      );
    case "deduplicated":
      return (
        <UI.Badge variant="secondary" className="gap-1" data-testid="upload-mark">
          <Check size={14} aria-hidden="true" />
          {t("upload.alreadyHere")}
        </UI.Badge>
      );
    case "done":
      return (
        <StatusIndicator tone="success" data-testid="upload-mark">
          {t("upload.done")}
        </StatusIndicator>
      );
    default:
      return <SaveStatus state="error" label={t("upload.rejected")} data-testid="upload-mark" />;
  }
}

function UploadExplain({ row, elapsed }: { row: UploadRow; elapsed: number }) {
  const t = useTranslations("files");
  const text =
    row.state === "storing"
      ? t("upload.explainStoring")
      : row.state === "checking"
        ? elapsed >= SHOW_SLOW_AFTER_S
          ? t("upload.explainSlow")
          : t("upload.explainChecking")
        : row.state === "stalled"
          ? t("upload.explainStalled")
          : row.state === "expired"
            ? t("upload.explainExpired")
          : row.state === "deduplicated"
            ? t("upload.explainDeduplicated")
            : row.state === "rejected"
              ? row.error || t("upload.explainRejected")
              : null;
  if (!text) return null;
  return (
    <UI.Text size="xs" variant="muted" data-testid="upload-explain">
      {text}
    </UI.Text>
  );
}

/** Drop zone — also the section's empty state. */
export function DropZone({
  compact = false,
  onFiles,
  disabled = false,
}: {
  compact?: boolean;
  onFiles?: (files: File[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("files");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  return (
    <UI.Card
      fullWidth
      data-testid="drop-zone"
      className={over ? "border-primary" : undefined}
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length && onFiles && !disabled) onFiles(files);
      }}
    >
      <UI.EmptyState paddingY={compact ? 6 : 10}>
        <UI.Box direction="column" align="center" gap={4} textAlign="center">
          <Upload size={compact ? 28 : 40} aria-hidden="true" className="opacity-40" />
          <UI.Box direction="column" gap={1} align="center">
            <UI.Text as="h2" size="lg" weight="semibold">
              {t("drop.title")}
            </UI.Text>
            <UI.Text variant="muted" size="sm">
              {t("drop.body")}
            </UI.Text>
          </UI.Box>
          <UI.Button
            data-testid="drop-zone-upload"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={16} aria-hidden="true" />
            {t("drop.choose")}
          </UI.Button>
          <FilePickerInput ref={inputRef} onFiles={onFiles} testId="drop-zone-input" />
        </UI.Box>
      </UI.EmptyState>
    </UI.Card>
  );
}

/** Hidden multi-file input shared by the header action and the drop zone. */
export const FilePickerInput = React.forwardRef<
  HTMLInputElement,
  { onFiles?: (files: File[]) => void; testId: string }
>(function FilePickerInput({ onFiles, testId }, ref) {
  return (
    <input
      ref={ref}
      type="file"
      multiple
      hidden
      accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
      data-testid={testId}
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length && onFiles) onFiles(files);
      }}
    />
  );
});

/* ------------------------------------------------------------ details */

export function FileDetails({
  file,
  previewSrc,
  publicUrl,
  addedLabel,
  onClose,
  onDownload,
  onToggleVisibility,
  onDelete,
  onReplace,
  busy = false,
  usage = { status: "loading" },
  describe,
}: {
  file: StoredFile;
  previewSrc?: string | null;
  /** Stable path of a public file, as the service reports it. */
  publicUrl?: string | null;
  addedLabel: string;
  onClose?: () => void;
  onDownload?: () => void;
  onToggleVisibility?: () => void;
  onDelete?: () => void;
  /** «Replace» (SDL-652): absent = no button. */
  onReplace?: () => void;
  busy?: boolean;
  usage?: FileUsageState;
  describe?: DescribeFileLink;
}) {
  const t = useTranslations("files");
  const dims = fileDimensions(file);
  // A public file is reachable only once its address is absolute — the
  // delivery host from the product shell (SDL-624). Without it the address
  // is the relative /files/<id>: shown as text, no download, and the note.
  const delivered = file.is_public && isDeliverableFileUrl(publicUrl);
  // The admin's one item panel (EP-186, pattern 3b): the page puts this frame
  // in ItemPanel, so the library stays on screen next to the open file.
  // Footer: Delete on the left, the file's other actions on the right.
  return (
    <ItemPanelFrame
      data-testid="file-details"
      data-file-id={file.id}
      title={<FileName file={file} className="block text-base" />}
      titleAttr={file.filename ?? undefined}
      description={
        <>
          {file.mime}
          {dims ? ` · ${dims}` : ""} · {formatBytes(file.size_bytes)}
        </>
      }
      onClose={onClose}
      closeLabel={t("details.close")}
      closeTestId="details-close"
      deleteAction={
        <UI.Button variant="ghost-destructive" onClick={onDelete} disabled={busy} data-testid="details-delete">
          <Trash2 size={16} aria-hidden="true" />
          {t("details.delete")}
        </UI.Button>
      }
      actions={
        <>
          <UI.Button variant="ghost" onClick={onDownload} disabled={busy || (file.is_public && !delivered)} data-testid="details-download">
            {t("details.download")}
          </UI.Button>
          <UI.Button
            variant="outline"
            onClick={onToggleVisibility}
            disabled={busy}
            data-testid="details-toggle-visibility"
          >
            {file.is_public ? <Lock size={16} /> : <Globe size={16} />}
            {file.is_public ? t("details.makePrivate") : t("details.makePublic")}
          </UI.Button>
          {onReplace ? (
            <UI.Button variant="outline" onClick={onReplace} disabled={busy} data-testid="details-replace">
              <RefreshCw size={16} aria-hidden="true" />
              {t("details.replace")}
            </UI.Button>
          ) : null}
        </>
      }
    >
      <FilePreview kind={fileKind(file)} size="large" src={previewSrc} alt={file.filename ?? ""} />

      <ItemPanelGroup title={t("details.accessTitle")} testId="details-access">
        <UI.Box direction="row" align="center" gap={2} wrap>
          {file.is_public ? (
            <StatusIndicator tone="info" data-testid="details-visibility">
              {t("public")}
            </StatusIndicator>
          ) : (
            <StatusIndicator tone="neutral" data-testid="details-visibility">
              {t("private")}
            </StatusIndicator>
          )}
          <UI.Text as="span" size="sm" variant="muted">
            {t("details.added", { when: addedLabel })}
          </UI.Text>
        </UI.Box>
        {file.is_public && publicUrl ? (
          <UI.Box direction="row" align="center" gap={2} className="min-w-0">
            <Link2 size={14} aria-hidden="true" className="shrink-0 opacity-60" />
            <UI.Text as="span" size="sm" variant="mono" className="min-w-0 truncate" data-testid="details-public-url">
              {publicUrl}
            </UI.Text>
          </UI.Box>
        ) : null}
        {file.is_public && !delivered ? (
          <UI.Text size="xs" variant="muted" data-testid="details-public-note">
            {t("details.publicPending")}
          </UI.Text>
        ) : null}
      </ItemPanelGroup>

      {/* «Where it's used» — the usage read of files-service (SDL-649). */}
      <ItemPanelGroup title={t("details.usedTitle")} testId="details-usage">
        <FileUsageBlock usage={usage} describe={describe} />
      </ItemPanelGroup>
    </ItemPanelFrame>
  );
}

/* --------------------------------------------------- public vs private */

/**
 * Shown before the visibility flips — the decision is about the link, and
 * that is not readable from the two words. `target` is the state the file
 * is about to get; its column carries the confirm button.
 */
export function VisibilityCompare({
  fileId,
  target,
  onConfirm,
  onCancel,
  busy = false,
  stacked = false,
}: {
  fileId: string;
  target?: "public" | "private";
  onConfirm?: () => void;
  onCancel?: () => void;
  busy?: boolean;
  /** One column at every width — inside the side panel the screen is narrow. */
  stacked?: boolean;
}) {
  const t = useTranslations("files");
  return (
    <UI.Box direction="column" gap={4} data-testid="visibility-screen">
      <Grid gap={4} columns={1} mdColumns={stacked ? 1 : 2} data-testid="visibility-compare">
        <UI.Card fullWidth data-testid="visibility-public">
          <UI.Card.Header>
            <UI.Card.Title>
              <UI.Box direction="row" align="center" gap={2}>
                <Globe size={16} aria-hidden="true" />
                {t("visibility.publicTitle")}
              </UI.Box>
            </UI.Card.Title>
            <UI.Card.Description>{t("visibility.publicDescription")}</UI.Card.Description>
          </UI.Card.Header>
          <UI.Card.Content>
            <UI.Box direction="column" gap={2}>
              <UI.Text size="sm" variant="mono" className="truncate">
                /files/{fileId}
              </UI.Text>
              <UI.Text size="sm" variant="muted">
                {t("visibility.publicBody")}
              </UI.Text>
            </UI.Box>
          </UI.Card.Content>
        </UI.Card>

        <UI.Card fullWidth data-testid="visibility-private">
          <UI.Card.Header>
            <UI.Card.Title>
              <UI.Box direction="row" align="center" gap={2}>
                <Lock size={16} aria-hidden="true" />
                {t("visibility.privateTitle")}
              </UI.Box>
            </UI.Card.Title>
            <UI.Card.Description>{t("visibility.privateDescription")}</UI.Card.Description>
          </UI.Card.Header>
          <UI.Card.Content>
            <UI.Box direction="column" gap={2}>
              <UI.Text size="sm" variant="mono" className="truncate">
                …/{fileId}?signature&expires=15 min
              </UI.Text>
              <UI.Text size="sm" variant="muted">
                {t("visibility.privateBody")}
              </UI.Text>
            </UI.Box>
          </UI.Card.Content>
        </UI.Card>
      </Grid>

      <UI.Alert data-testid="visibility-note">
        <UI.Box direction="column" gap={1}>
          <UI.Text as="span" size="sm" weight="medium">
            {t("visibility.noteTitle")}
          </UI.Text>
          <UI.Text as="span" size="sm">
            {t("visibility.noteBody")}
          </UI.Text>
        </UI.Box>
      </UI.Alert>

      {target ? (
        <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
          <UI.Button variant="ghost" onClick={onCancel} disabled={busy} data-testid="visibility-cancel">
            {t("cancel")}
          </UI.Button>
          <UI.Button onClick={onConfirm} disabled={busy} data-testid="visibility-confirm">
            {target === "public" ? <Globe size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
            {target === "public" ? t("details.makePublic") : t("details.makePrivate")}
          </UI.Button>
        </UI.Box>
      ) : null}
    </UI.Box>
  );
}

/* ------------------------------------------------------------ usage */

/**
 * A human name for one link (SDL-624): «Страница «About» (/about)» with a
 * way into the editor, a collection record with a way into its panel
 * (SDL-650), instead of a bare record id. `null` keeps the default row — the
 * record id over «collection · field».
 */
export type DescribeFileLink = (link: FileLink) => { title: string; detail?: string; href?: string } | null;

/** The collections pages-service registers its links under (features/pages-media). */
const PAGES_PAGE = "pages:page";
const PAGES_BLOCK = "pages:block";

export type FileHistoryCounts = { pages: number; blocks: number; records: number };

/**
 * Live links vs revision history (SDL-649 `source`). A history link means the
 * file sits only in an old version: summed per kind — pages, blocks, other
 * records — each its own line («in old versions of N pages»), never asking
 * for the checkbox. A row without `source` predates the column and counts as
 * live. A record that is also live is not counted again as history.
 */
export function splitFileLinks(links: FileLink[]): { live: FileLink[]; history: FileHistoryCounts } {
  const live = links.filter((l) => l.source !== "history");
  const liveIds = new Set(live.map((l) => `${l.collection}/${l.record_id}`));
  const distinct = (pick: (l: FileLink) => boolean) =>
    new Set(
      links
        .filter((l) => l.source === "history" && pick(l) && !liveIds.has(`${l.collection}/${l.record_id}`))
        .map((l) => l.record_id)
    ).size;
  return {
    live,
    history: {
      pages: distinct((l) => l.collection === PAGES_PAGE),
      blocks: distinct((l) => l.collection === PAGES_BLOCK),
      records: distinct((l) => l.collection !== PAGES_PAGE && l.collection !== PAGES_BLOCK),
    },
  };
}

function historyTotal(h: FileHistoryCounts): number {
  return h.pages + h.blocks + h.records;
}

/**
 * Rows of live links — the details «Where used», the delete dialog and the
 * replace dialog (SDL-652) share them. `bare` drops the row padding when the
 * caller frames the row itself (a replace outcome).
 */
export function FileUsageList({
  links,
  describe,
  testIdPrefix = "usage",
  bare = false,
}: {
  links: FileLink[];
  describe?: DescribeFileLink;
  testIdPrefix?: "usage" | "delete-usage" | "replace-usage" | "replace-outcome";
  bare?: boolean;
}) {
  const t = useTranslations("files");
  return (
    <UI.Box direction="column" gap={0} data-testid={`${testIdPrefix}s`}>
      {links.map((link, index) => {
        const described = describe?.(link) ?? null;
        return (
          <UI.Box
            key={`${link.collection}-${link.record_id}-${link.field}`}
            direction="column"
            className={`min-w-0 ${bare ? "" : "py-2"} ${index > 0 ? "border-t border-border" : ""}`}
            data-testid={`${testIdPrefix}-row`}
          >
            {!described ? (
              <>
                <UI.Text as="span" size="sm" variant="mono" className="truncate">
                  {link.record_id}
                </UI.Text>
                <UI.Text as="span" size="xs" variant="muted">
                  {t("delete.usageMeta", { collection: link.collection, field: link.field })}
                </UI.Text>
              </>
            ) : (
              <>
                {described.href ? (
                  <NextLink
                    href={described.href}
                    className="truncate text-sm font-medium underline underline-offset-4 hover:no-underline"
                    data-testid={`${testIdPrefix}-link`}
                  >
                    {described.title}
                  </NextLink>
                ) : (
                  <UI.Text as="span" size="sm" className="truncate">
                    {described.title}
                  </UI.Text>
                )}
                {described.detail ? (
                  <UI.Text as="span" size="xs" variant="muted" className="truncate">
                    {described.detail}
                  </UI.Text>
                ) : null}
              </>
            )}
          </UI.Box>
        );
      })}
    </UI.Box>
  );
}

export function UsageHistoryLine({ history, testId }: { history: FileHistoryCounts; testId: string }) {
  const t = useTranslations("files");
  const lines = [
    { kind: "pages", count: history.pages, text: t("usage.history", { count: history.pages }) },
    { kind: "blocks", count: history.blocks, text: t("usage.historyBlocks", { count: history.blocks }) },
    { kind: "records", count: history.records, text: t("usage.historyRecords", { count: history.records }) },
  ].filter((l) => l.count > 0);
  if (lines.length === 0) return null;
  return (
    <UI.Box direction="column" gap={0}>
      {lines.map((l) => (
        <UI.Text key={l.kind} size="sm" variant="muted" data-testid={testId} data-kind={l.kind}>
          {l.text}
        </UI.Text>
      ))}
    </UI.Box>
  );
}

/** The details «Where used» block, from GET /files/:id/links (SDL-649). */
export type FileUsageState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; links: FileLink[] };

function FileUsageBlock({ usage, describe }: { usage: FileUsageState; describe?: DescribeFileLink }) {
  const t = useTranslations("files");
  if (usage.status === "loading") {
    return (
      <UI.Text size="sm" variant="muted" data-testid="usage-loading">
        {t("usage.loading")}
      </UI.Text>
    );
  }
  if (usage.status === "error") {
    return (
      <UI.Text size="sm" variant="muted" data-testid="usage-error">
        {t("usage.error")}
      </UI.Text>
    );
  }
  const { live, history } = splitFileLinks(usage.links);
  if (live.length === 0 && historyTotal(history) === 0) {
    return (
      <UI.Text size="sm" variant="muted" data-testid="usage-empty">
        {t("usage.empty")}
      </UI.Text>
    );
  }
  return (
    <UI.Box direction="column" gap={1}>
      {live.length > 0 ? <FileUsageList links={live} describe={describe} /> : null}
      <UsageHistoryLine history={history} testId="usage-history" />
    </UI.Box>
  );
}

/* ------------------------------------------------------------ delete */

/**
 * The question asked before EVERY delete (SDL-650) — deletion is final.
 *
 * With live links the dialog lists them and the delete button waits for the
 * checkbox; links only in revision history are one line and ask for nothing.
 * There is no second «delete anyway» button: the one button sends `force`
 * whenever any link is known, because files-service refuses a delete with
 * links of either kind. It is a question, not a ban — the usage index syncs
 * after a record is saved and may lag, so the page may learn about links
 * only from a 409; it then feeds them back here and the checkbox appears.
 *
 * The texts are honest about what deletion does NOT do: records and pages
 * are not edited, they keep the id of the deleted file, and the image's
 * description (alt) is shown in its place.
 */
export function DeleteFileBody({
  file,
  links,
  linksLoading = false,
  describe,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: {
  file: Pick<StoredFile, "filename">;
  links: FileLink[];
  linksLoading?: boolean;
  describe?: DescribeFileLink;
  busy?: boolean;
  error?: string | null;
  onCancel?: () => void;
  onConfirm?: (force: boolean) => void;
}) {
  const t = useTranslations("files");
  const { live, history } = splitFileLinks(links);
  // A new list (the 409 brought links the read did not have) asks again.
  const liveKey = live.map((l) => `${l.collection}/${l.record_id}/${l.field}`).join("|");
  // The admin's one delete body (EP-186, pattern 4): the places up front, the
  // checkbox when any is live, the error inline, Cancel left of Delete.
  return (
    <DeleteDialogBody
      consequence={
        <>
          <UI.Text size="sm" className="break-words">
            {t("delete.final", { name: file.filename ?? t("untitledFile") })}
          </UI.Text>
          {/* The rule's own sentence and its link, in the SDL-650 window (SDL-666). */}
          <PolicyLine stringKey="item_delete_consequence" target="deletion" testId="delete-policy-line" />
        </>
      }
      usage={{
        count: live.length,
        loading: linksLoading,
        resetKey: liveKey,
        title: t("delete.title", { count: live.length }),
        list: <FileUsageList links={live} describe={describe} testIdPrefix="delete-usage" />,
        note: <UsageHistoryLine history={history} testId="delete-usage-history" />,
      }}
      pending={busy}
      error={error}
      onCancel={() => onCancel?.()}
      onConfirm={() => onConfirm?.(links.length > 0)}
      confirmLabel={t("delete.confirm")}
      pendingLabel={t("delete.confirm")}
    >
      {links.length > 0 ? (
        <UI.Alert data-testid="delete-consequence">
          <UI.Text as="span" size="sm">
            {t("delete.consequenceBody")}
          </UI.Text>
        </UI.Alert>
      ) : null}
    </DeleteDialogBody>
  );
}

export function DeleteFileDialog({
  open,
  onOpenChange,
  ...body
}: React.ComponentProps<typeof DeleteFileBody> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("files");
  return (
    <DeleteDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("delete.dialogTitle")}
      description={t("delete.description")}
      pending={body.busy}
    >
      <DeleteFileBody {...body} />
    </DeleteDialogShell>
  );
}

/* --------------------------------------------------------- search/filter */

export const TYPE_FILTERS: TypeFilter[] = ["all", "images", "docs", "public"];

/**
 * The library toolbar on the admin's one list pattern (EP-186, pattern 1):
 * the kit SearchField, the type chips and the count «Shown N of M» in the one
 * shape every list uses (`common.listCount`). The library stays a grid of
 * tiles, not a table.
 */
export function FilesSearch({
  query,
  onQueryChange,
  active,
  onActiveChange,
  count,
}: {
  query: string;
  onQueryChange?: (q: string) => void;
  active: TypeFilter;
  onActiveChange?: (f: TypeFilter) => void;
  /** Files on screen after the chip, of the files the listing answered. */
  count?: { shown: number; total: number };
}) {
  const t = useTranslations("files");
  const tc = useTranslations("common");
  return (
    <UI.Box direction="row" align="center" gap={3} wrap data-testid="files-search">
      <UI.Box className="min-w-[12rem] max-w-sm flex-1">
        <UI.FormControl.SearchField
          value={query}
          onChange={(value: string) => onQueryChange?.(value)}
          placeholder={t("search")}
          ariaLabel={t("search")}
          clearLabel={tc("clearSearch")}
          inputProps={{ "data-testid": "files-search-input" } as React.ComponentProps<"input">}
        />
      </UI.Box>
      <UI.ToggleGroup
        type="single"
        value={active}
        onValueChange={(v: string) => {
          if (v) onActiveChange?.(v as TypeFilter);
        }}
        className="flex-wrap"
      >
        {TYPE_FILTERS.map((f) => (
          <UI.ToggleGroupItem key={f} value={f} size="sm" data-testid={`files-filter-${f}`}>
            {t(`filters.${f}`)}
          </UI.ToggleGroupItem>
        ))}
      </UI.ToggleGroup>
      {count ? (
        <UI.Text as="span" size="sm" variant="muted" className="ml-auto tabular-nums" data-testid="files-count">
          {tc("listCount", { shown: count.shown, total: count.total })}
        </UI.Text>
      ) : null}
    </UI.Box>
  );
}
