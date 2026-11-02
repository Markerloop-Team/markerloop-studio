"use client";

// The live DataView of the admin (SDL-640, EP-130): the engine's widget
// Element (`@markerloop/engine` `DataViewBlock`, SDL-639) filled with the
// records of its collection, laid out after canvas A
// (`/design-system/feed`, `_canvas/feed-parts.tsx` `DataViewWidget`).
//
// Who decides what is visible: the COLLECTION, not the Element. Records are
// read as the signed-in person through the gateway (`GET /v1/records` with
// the query `dataViewQuery` produces — the engine pins its form), so a
// collection the person may not read answers 403/404 and the widget shows
// the "collection unavailable" stub — never an empty list, which would read
// as "nothing arrived".
//
// On the editor canvas (the renderer passes `data-sauna-node-id` only in
// editable mode) the widget still READS — the author sees real rows — but
// every control is inert, so a click selects the node and nothing else, and
// the widget never writes. Off the canvas it writes exactly one thing: the
// declared field `read_at` (SDL-641, `data-view-write.ts`), one click in the
// row and in the panel, and only when the collection declares that field.
// Freshness is a re-read on return to the tab and every 45 seconds; the
// open record is in the address (`?record=<id>`), so a link opens it.
//
// The canvas frame drops the admin's stylesheet (`--sauna-sheet-role`), so
// layout is inline style over the kit's tokens and the kit's components;
// admin-only utility classes would render unstyled there. On a phone-width
// frame the record REPLACES the list in the flow (review of 03ac19be): the
// canvas iframe grows to the page's height and scrolls from outside, so a
// fixed layer spanned the whole page and started at its top; the kit's
// Sheet portals into the admin's document, outside the frame.

import * as React from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { AlertTriangle, ArrowLeft, Database, Inbox, Mail, MailOpen, RefreshCw, X } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { RichTextView } from "@markerloop/ui/ui/admin";
import { DataViewPropsSchema, dataViewQuery, type DataViewProps } from "@markerloop/engine";

import { useTranslations } from "@/shared/hooks";
import { collectionsApi, collectionsRecordsApi, type Paged } from "@/shared/lib/api/collections-client";
import { isGatewayRouteMissing, requestIdOf } from "@/shared/lib/api/client";
import { collectionKeys } from "@/entities/collections/collection";
import { useCollectionFields } from "@/entities/collections/collection-field";
import { isRichTextEnvelope, type CollectionRecord } from "@/widgets/collections";

import { DATA_VIEW_READ_FIELD, declaresReadField, isRecordRead, writeDeclaredField } from "./data-view-write";

type PassThrough = Omit<React.HTMLAttributes<HTMLElement>, "color">;

/** The node's props as stored — parsing is this component's job, like the engine's frame. */
export type LiveDataViewProps = PassThrough & {
  source?: unknown;
  fields?: unknown;
  sort?: unknown;
  filter?: unknown;
  presets?: unknown;
  limit?: unknown;
  children?: React.ReactNode;
};

export type DataViewState = "unbound" | "loading" | "error" | "unavailable" | "empty" | "list";

/**
 * 403 and the service's own 404 mean the collection is not there FOR THIS
 * PERSON (removed, or no access) — a retry cannot help, so no retry button.
 * The gateway's bare-text 404 is a different fact (the route is not
 * proxied) and stays an ordinary load error.
 */
export function isCollectionUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  if (status === 403) return true;
  return status === 404 && !isGatewayRouteMissing(error);
}

export function dataViewStateOf(input: {
  bound: boolean;
  isPending: boolean;
  error: unknown;
  total: number;
}): DataViewState {
  if (!input.bound) return "unbound";
  if (input.error) return isCollectionUnavailable(input.error) ? "unavailable" : "error";
  if (input.isPending) return "loading";
  return input.total === 0 ? "empty" : "list";
}

/* ------------------------------------------------------------------ labels */

export type DataViewLabels = {
  unbound: string;
  newestFirst: string;
  sortedBy: (field: string, direction: "asc" | "desc") => string;
  loading: string;
  errorText: string;
  requestId: (id: string) => string;
  retry: string;
  unavailableTitle: string;
  unavailableTitleNamed: (name: string) => string;
  unavailableText: string;
  openInStudio: string;
  emptyTitle: string;
  emptyText: string;
  list: string;
  record: string;
  closeRecord: string;
  backToList: string;
  created: string;
  untitled: string;
  yes: string;
  markRead: string;
  markUnread: string;
  readLabel: string;
  notRead: string;
  writeError: string;
  date: (iso: string) => string;
};

function useDataViewLabels(): DataViewLabels {
  const t = useTranslations("pages.dataView");
  const locale = useLocale();
  return React.useMemo(
    () => ({
      unbound: t("unbound"),
      newestFirst: t("newestFirst"),
      sortedBy: (field, direction) =>
        direction === "asc" ? t("sortedByAsc", { field }) : t("sortedByDesc", { field }),
      loading: t("loading"),
      errorText: t("errorText"),
      requestId: (id) => t("requestId", { id }),
      retry: t("retry"),
      unavailableTitle: t("unavailableTitle"),
      unavailableTitleNamed: (name) => t("unavailableTitleNamed", { name }),
      unavailableText: t("unavailableText"),
      openInStudio: t("openInStudio"),
      emptyTitle: t("emptyTitle"),
      emptyText: t("emptyText"),
      list: t("list"),
      record: t("record"),
      closeRecord: t("closeRecord"),
      backToList: t("backToList"),
      created: t("created"),
      untitled: t("untitled"),
      yes: t("yes"),
      markRead: t("markRead"),
      markUnread: t("markUnread"),
      readLabel: t("readLabel"),
      notRead: t("notRead"),
      writeError: t("writeError"),
      date: (iso) => formatRecordDate(iso, locale),
    }),
    [t, locale]
  );
}

/* ---------------------------------------------------------- record → text */

/** A cell as one line of text, or null when there is nothing to draw. */
export function cellText(value: unknown, yes: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? yes : null;
  if (isRichTextEnvelope(value)) return value.text || null;
  if (Array.isArray(value)) {
    const parts = value.map((v) => cellText(v, yes)).filter((v): v is string => v !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return null;
}

/** In the interface locale and the viewer's own time zone. */
export function formatRecordDate(iso: string, locale: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

/* --------------------------------------------------------------- styles */

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.75rem",
  padding: "0.75rem",
  borderBottom: "1px solid var(--border)",
};

const CARD: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--background)",
  color: "var(--foreground)",
};

/** Room left above the card when a phone-width record scrolls it to the top. */
export const CARD_SCROLL_MARGIN = "0.75rem";

const CLAMP_2: React.CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  minWidth: 0,
  flex: 1,
};

/* ----------------------------------------------------------------- parts */

/**
 * The read mark — one click (canvas A `ReadToggle`): an icon in the row, a
 * worded button in the panel. `aria-pressed` says the state to a reader.
 * Disabled only while its own write is in flight.
 */
function ReadToggle({
  read,
  pending,
  labelled = false,
  labels,
  onToggle,
  testid,
}: {
  read: boolean;
  pending: boolean;
  labelled?: boolean;
  labels: DataViewLabels;
  onToggle: () => void;
  testid: string;
}) {
  const label = read ? labels.markUnread : labels.markRead;
  const Icon = read ? Mail : MailOpen;
  return (
    <UI.Button
      size={labelled ? "sm" : "icon"}
      variant={labelled ? (read ? "outline" : "default") : "ghost"}
      aria-label={labelled ? undefined : label}
      aria-pressed={read}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={onToggle}
      data-testid={testid}
      data-read={read ? "true" : "false"}
      style={{ flexShrink: 0, gap: "0.5rem" }}
    >
      <Icon size={labelled ? 16 : 18} aria-hidden="true" />
      {labelled ? label : null}
    </UI.Button>
  );
}

/** What the frame needs to draw and fire the read mark; null = the collection declares no `read_at`. */
export type DataViewReadMark = {
  field: string;
  pendingId: string | null;
  onToggle: (id: string, read: boolean) => void;
};

function RecordRow({
  record,
  fields,
  selected,
  labels,
  onOpen,
  readMark,
}: {
  record: CollectionRecord;
  fields: readonly string[];
  selected: boolean;
  labels: DataViewLabels;
  onOpen: () => void;
  readMark: DataViewReadMark | null;
}) {
  const read = readMark ? isRecordRead(record, readMark.field) : false;
  const [titleKey, subtitleKey, ...badgeKeys] = fields;
  const title = (titleKey && cellText(record.data[titleKey], labels.yes)) || labels.untitled;
  const subtitle = subtitleKey ? cellText(record.data[subtitleKey], labels.yes) : null;
  const badges = badgeKeys
    .filter((key) => !isRichTextEnvelope(record.data[key]))
    .map((key) => ({ key, text: cellText(record.data[key], labels.yes) }))
    .filter((b): b is { key: string; text: string } => b.text !== null);
  return (
    <div
      role="listitem"
      data-testid="feed-row"
      data-record-id={record.id}
      data-selected={selected ? "true" : "false"}
      data-read={readMark ? (read ? "true" : "false") : undefined}
      style={{ ...ROW, background: selected ? "var(--muted)" : undefined }}
    >
      {readMark ? (
        // Canvas A: the unread dot column, empty once read.
        <span aria-hidden="true" style={{ display: "flex", justifyContent: "center", width: "1.25rem", flexShrink: 0, paddingTop: "0.4rem" }}>
          {read ? null : (
            <span data-testid="feed-unread-dot" style={{ width: "0.5rem", height: "0.5rem", borderRadius: "9999px", background: "var(--primary)" }} />
          )}
        </span>
      ) : null}
      {/* Only inline content inside the button: its accessible name is the row. */}
      <button
        type="button"
        onClick={onOpen}
        data-testid="feed-row-open"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          minWidth: 0,
          flex: 1,
          textAlign: "left",
          background: "none",
          border: 0,
          padding: 0,
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        <span style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", minWidth: 0 }}>
          <UI.Text
            as="span"
            size="sm"
            weight={read ? "normal" : "semibold"}
            style={read ? { ...CLAMP_2, opacity: 0.7 } : CLAMP_2}
            data-testid="feed-row-title"
          >
            {title}
          </UI.Text>
          <UI.Text as="span" size="xs" variant="muted" style={{ flexShrink: 0 }} data-testid="feed-row-date">
            {labels.date(record.created_at)}
          </UI.Text>
        </span>
        {subtitle ? (
          <UI.Text
            as="span"
            size="xs"
            variant="muted"
            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {subtitle}
          </UI.Text>
        ) : null}
        {badges.length > 0 ? (
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.375rem" }}>
            {badges.map((b) => (
              <UI.Badge key={b.key} variant="outline">
                {b.text}
              </UI.Badge>
            ))}
          </span>
        ) : null}
      </button>
      {readMark ? (
        <ReadToggle
          read={read}
          pending={readMark.pendingId === record.id}
          labels={labels}
          onToggle={() => readMark.onToggle(record.id, read)}
          testid="feed-row-read"
        />
      ) : null}
    </div>
  );
}

export function RecordPanel({
  record,
  fields,
  fieldNames,
  labels,
  narrow,
  onClose,
  readMark = null,
}: {
  record: CollectionRecord;
  fields: readonly string[];
  fieldNames: Readonly<Record<string, string>>;
  labels: DataViewLabels;
  narrow: boolean;
  onClose: () => void;
  readMark?: DataViewReadMark | null;
}) {
  const read = readMark ? isRecordRead(record, readMark.field) : false;
  const readValue = readMark ? record.data[readMark.field] : undefined;
  const [titleKey, ...rest] = fields;
  const title = (titleKey && cellText(record.data[titleKey], labels.yes)) || labels.untitled;
  const plain = rest.filter((key) => !isRichTextEnvelope(record.data[key]));
  const rich = rest.filter((key) => isRichTextEnvelope(record.data[key]));
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  // Opening a record moves focus to its close/back button. Bringing it into
  // view on a phone is the frame's job (it scrolls the whole card, border
  // included — see DataViewFrame).
  React.useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>('[data-testid="feed-record-close"]')?.focus({ preventScroll: true });
  }, [record.id, narrow]);
  return (
    <div
      ref={rootRef}
      data-testid="feed-record"
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <UI.Button
          size="icon"
          variant="ghost"
          aria-label={narrow ? labels.backToList : labels.closeRecord}
          onClick={onClose}
          data-testid="feed-record-close"
        >
          {narrow ? <ArrowLeft size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
        </UI.Button>
        {readMark ? (
          <>
            <span style={{ flex: 1 }} />
            <ReadToggle
              read={read}
              pending={readMark.pendingId === record.id}
              labelled
              labels={labels}
              onToggle={() => readMark.onToggle(record.id, read)}
              testid="feed-record-read"
            />
          </>
        ) : null}
      </div>
      <UI.Text as="h2" size="lg" weight="semibold" data-testid="feed-record-title">
        {title}
      </UI.Text>
      <div
        data-testid="feed-record-meta"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          border: "1px solid var(--border)",
          borderRadius: "0.375rem",
          padding: "0.75rem",
        }}
      >
        {[
          ...plain
            .filter((key) => key !== readMark?.field)
            .map((key) => [key, fieldNames[key] ?? key, cellText(record.data[key], labels.yes) ?? "—"] as const),
          ["$created_at", labels.created, labels.date(record.created_at)] as const,
          // Canvas A: the panel says when it was read, or "not yet".
          ...(readMark
            ? [["$read", labels.readLabel, read && typeof readValue === "string" ? labels.date(readValue) : labels.notRead] as const]
            : []),
        ].map(([key, label, value]) => (
          <div key={key} style={{ display: "flex", gap: "0.75rem" }}>
            <UI.Text as="span" size="sm" variant="muted" style={{ width: "6rem", flexShrink: 0 }}>
              {label}
            </UI.Text>
            <UI.Text as="span" size="sm" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              {value}
            </UI.Text>
          </div>
        ))}
      </div>
      {rich.map((key) => (
        <div key={key} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          {rich.length > 1 ? (
            <UI.Text as="span" size="xs" weight="medium">
              {fieldNames[key] ?? key}
            </UI.Text>
          ) : null}
          <RichTextView value={record.data[key]} data-testid="feed-record-body" />
        </div>
      ))}
    </div>
  );
}

function StateLoading({ labels }: { labels: DataViewLabels }) {
  return (
    <div data-testid="feed-loading" aria-busy="true" aria-label={labels.loading}>
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} style={ROW}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
            <UI.Skeleton height={14} style={{ width: "75%" }} />
            <UI.Skeleton height={12} style={{ width: "33%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StateMessage({
  testid,
  icon,
  title,
  text,
  action,
}: {
  testid: string;
  icon: React.ReactNode;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      data-testid={testid}
      role={testid === "feed-unavailable" ? "status" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
        padding: "2.5rem 1rem",
        textAlign: "center",
      }}
    >
      <span style={{ opacity: 0.4 }}>{icon}</span>
      <UI.Text as="h3" size="md" weight="semibold">
        {title}
      </UI.Text>
      <UI.Text size="sm" variant="muted" style={{ maxWidth: "28rem" }}>
        {text}
      </UI.Text>
      {action}
    </div>
  );
}

function StateError({
  labels,
  requestId,
  onRetry,
}: {
  labels: DataViewLabels;
  requestId: string | null;
  onRetry: () => void;
}) {
  return (
    <div style={{ padding: "0.75rem" }}>
      <UI.Alert variant="destructive" role="alert" data-testid="feed-error">
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
            <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            {/* Canvas A: the id for support closes the sentence — only the gateway's own, never a made-up one. */}
            <UI.Text as="span" size="sm" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
              {labels.errorText}
              {requestId ? (
                <>
                  {" "}
                  <span data-testid="feed-error-request-id">{labels.requestId(requestId)}</span>
                </>
              ) : null}
            </UI.Text>
          </div>
          <UI.Button size="sm" variant="outline" onClick={onRetry} data-testid="feed-error-retry" style={{ alignSelf: "flex-start", gap: "0.5rem" }}>
            <RefreshCw size={14} aria-hidden="true" />
            {labels.retry}
          </UI.Button>
        </div>
      </UI.Alert>
    </div>
  );
}

/* ------------------------------------------------------- the frame itself */

/**
 * The count on the FIRST preset's tab (canvas A: "Unread 4"), whichever tab
 * is active — the default preset is the one the counter speaks for, so it
 * does not wander to "All" and vanish from "Unread". `"loading"` draws "…";
 * null (unknown, failed) and 0 draw nothing — a number we do not know is not
 * drawn, and zero is not a signal.
 */
export type DataViewCounter = number | "loading" | null;

export type DataViewFrameProps = PassThrough & {
  state: DataViewState;
  props: DataViewProps | null;
  records: readonly CollectionRecord[];
  counter: DataViewCounter;
  presetId: string | undefined;
  onPresetChange: (id: string) => void;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
  onRetry: () => void;
  /** The bound collection's name, when it could still be read — the stub names it (canvas A). */
  collectionName?: string | null;
  /** The gateway's X-Request-Id of the failed read; the error line shows it, or nothing. */
  requestId?: string | null;
  /** "Open in Studio" on the unavailable stub; absent = no host to send the author to, no button. */
  onOpenInStudio?: () => void;
  fieldNames: Readonly<Record<string, string>>;
  narrow: boolean;
  labels: DataViewLabels;
  /** The read mark; absent/null = the collection declares no `read_at`, no toggle is drawn. */
  readMark?: DataViewReadMark | null;
  /**
   * The open record when it is NOT on the current list — a `?record=` link to
   * a record the preset filters out (read, on "Unread"), or one a re-read
   * just dropped from the list. The list's own copy wins when it has one.
   */
  selectedRecord?: CollectionRecord | null;
  /** The last read-mark write failed (not a conflict — those are retried). */
  writeError?: boolean;
  /** On the editable canvas the widget's controls do nothing: the stub's button says so (aria-disabled). */
  inert?: boolean;
  children?: React.ReactNode;
};

/**
 * Pure presentation — every state of canvas A from its inputs, no data
 * fetching. `smoke:pages` renders it through react-dom/server.
 */
export const DataViewFrame = React.forwardRef<HTMLElement, DataViewFrameProps>(function DataViewFrame(
  {
    state,
    props,
    records,
    counter,
    presetId,
    onPresetChange,
    selectedId,
    onOpen,
    onClose,
    onRetry,
    collectionName,
    requestId,
    onOpenInStudio,
    fieldNames,
    narrow,
    labels,
    readMark = null,
    selectedRecord = null,
    writeError = false,
    inert = false,
    style,
    children,
    ...rest
  },
  ref
) {
  const presets = props?.presets ?? [];
  const fields = props?.fields ?? [];
  // Canvas A draws the counter only over a list or while it loads: next to
  // "collection unavailable" or a load error a stale number would lie, and
  // over an empty opened preset it reads as that preset's count (SDL-642).
  const showCounter =
    (state === "list" || state === "loading") && counter !== null && counter !== 0;
  // Closing the record returns focus to the row it was opened from (by id):
  // on a phone the list was unmounted while the panel stood in its place.
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const lastOpen = React.useRef<string | null>(null);
  // Only a CLOSE returns focus — a preset switch also clears the selection,
  // and must leave focus on the tab the person just pressed.
  const closing = React.useRef(false);
  const closePanel = React.useCallback(() => {
    closing.current = true;
    onClose();
  }, [onClose]);
  React.useEffect(() => {
    const previous = lastOpen.current;
    lastOpen.current = selectedId;
    const closed = closing.current;
    closing.current = false;
    if (closed && previous && selectedId === null) {
      cardRef.current
        ?.querySelector<HTMLElement>(`[data-record-id="${CSS.escape(previous)}"] [data-testid="feed-row-open"]`)
        ?.focus();
    }
  }, [selectedId]);
  const selected =
    state === "list" || state === "empty"
      ? (records.find((r) => r.id === selectedId) ??
        (selectedRecord && selectedRecord.id === selectedId ? selectedRecord : null))
      : null;
  // On a phone-width frame the record replaces the list in place, and the
  // row tapped may be screens below the widget's top — so the CARD is
  // brought into view, not the record inside it: aligning the record's own
  // top with the scroller's edge left the card's top border and the tabs
  // under the editor's header at 390 (acceptance of SDL-640). The card's
  // scroll-margin keeps its border clear of whatever bounds the scroller.
  const inlineRecordId = narrow && selected ? selected.id : null;
  React.useEffect(() => {
    if (inlineRecordId === null) return;
    cardRef.current?.scrollIntoView?.({ block: "start" });
  }, [inlineRecordId]);
  const panel = selected ? (
    <RecordPanel
      record={selected}
      fields={fields}
      fieldNames={fieldNames}
      labels={labels}
      narrow={narrow}
      onClose={closePanel}
      readMark={readMark}
    />
  ) : null;
  const sortNote = props
    ? props.sort.field === "created_at" && props.sort.direction === "desc"
      ? labels.newestFirst
      : labels.sortedBy(fieldNames[props.sort.field] ?? props.sort.field, props.sort.direction)
    : null;

  return (
    <section
      ref={ref}
      data-pages-element="data-view"
      data-pages-data-view={state === "unbound" ? "unbound" : "bound"}
      data-testid="dataview"
      data-state={state}
      data-preset={presetId ?? ""}
      style={{ display: "flex", gap: "1rem", alignItems: "flex-start", minWidth: 0, ...style }}
      {...rest}
    >
      <div ref={cardRef} data-testid="feed-card" style={{ ...CARD, flex: 1, scrollMarginTop: CARD_SCROLL_MARGIN }}>
        {presets.length > 0 || sortNote ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 0.75rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {presets.length > 0 ? (
              <UI.Tabs value={presetId} onValueChange={onPresetChange} data-testid="feed-presets">
                <UI.Tabs.List>
                  {presets.map((p) => (
                    <UI.Tabs.Trigger key={p.id} value={p.id} data-testid={`feed-preset-${p.id}`} style={{ gap: "0.5rem" }}>
                      {p.label}
                      {p.id === presets[0]?.id && showCounter ? (
                        <UI.Badge variant="secondary" data-testid="feed-total">
                          {counter === "loading" ? "…" : counter}
                        </UI.Badge>
                      ) : null}
                    </UI.Tabs.Trigger>
                  ))}
                </UI.Tabs.List>
              </UI.Tabs>
            ) : null}
            {sortNote ? (
              <UI.Text as="span" size="xs" variant="muted" style={{ marginLeft: "auto" }} data-testid="feed-sort-note">
                {sortNote}
              </UI.Text>
            ) : null}
          </div>
        ) : null}

        {writeError ? (
          <div style={{ padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
            <UI.Text as="p" size="sm" role="alert" data-testid="feed-write-error" style={{ color: "var(--destructive)" }}>
              {labels.writeError}
            </UI.Text>
          </div>
        ) : null}
        {state === "unbound" ? (
          <StateMessage testid="feed-unbound" icon={<Database size={36} aria-hidden="true" />} title={labels.unbound} text="" />
        ) : null}
        {state === "loading" ? <StateLoading labels={labels} /> : null}
        {state === "error" ? <StateError labels={labels} requestId={requestId ?? null} onRetry={onRetry} /> : null}
        {state === "unavailable" ? (
          <StateMessage
            testid="feed-unavailable"
            icon={<Database size={36} aria-hidden="true" />}
            title={collectionName ? labels.unavailableTitleNamed(collectionName) : labels.unavailableTitle}
            text={labels.unavailableText}
            action={
              onOpenInStudio ? (
                <UI.Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenInStudio}
                  aria-disabled={inert ? true : undefined}
                  data-testid="feed-unavailable-studio"
                >
                  {labels.openInStudio}
                </UI.Button>
              ) : null
            }
          />
        ) : null}
        {state === "empty" && !(panel && narrow) ? (
          <StateMessage
            testid="feed-empty"
            icon={<Inbox size={36} aria-hidden="true" />}
            title={labels.emptyTitle}
            text={labels.emptyText}
          />
        ) : null}
        {panel && narrow ? (
          <div role="region" aria-label={labels.record} data-testid="feed-record-inline" style={{ padding: "1rem" }}>
            {panel}
          </div>
        ) : null}
        {state === "list" && !(panel && narrow) ? (
          <div role="list" aria-label={labels.list} data-testid="feed-list">
            {records.map((record) => (
              <RecordRow
                key={record.id}
                record={record}
                fields={fields}
                selected={record.id === selectedId}
                labels={labels}
                onOpen={() => onOpen(record.id)}
                readMark={readMark}
              />
            ))}
          </div>
        ) : null}
      </div>

      {panel && !narrow ? (
        <aside
          role="region"
          aria-label={labels.record}
          data-testid="feed-record-aside"
          style={{ ...CARD, width: "420px", maxWidth: "45%", flexShrink: 0, padding: "1rem" }}
        >
          {panel}
        </aside>
      ) : null}
      {children}
    </section>
  );
});

/* ------------------------------------------------------ the live component */

/**
 * What the page's host offers the widget. The unavailable stub says "the
 * page author fixes the binding in Studio" and carries a button there
 * (canvas A); where the button leads is the host's business — the pages
 * editor (`widgets/pages/page-editor.tsx`) takes a preview back to editing,
 * where the author selects the DataView and rebinds it. The canvas renders
 * the page through a portal, so the context reaches into the frame. No
 * host, no button.
 */
export type DataViewHost = {
  /**
   * `collectionId` is the widget's own binding (null when unbound): the
   * editor uses it to select THIS DataView node after leaving preview
   * (SDL-642) — in preview the canvas carries no node ids to point at.
   */
  openInStudio?: (collectionId: string | null) => void;
};

const DataViewHostContext = React.createContext<DataViewHost>({});

export function DataViewHostProvider({ value, children }: { value: DataViewHost; children: React.ReactNode }) {
  return <DataViewHostContext.Provider value={value}>{children}</DataViewHostContext.Provider>;
}

/** Below md the record replaces the list in place — measured in the widget's OWN window (the canvas is an iframe). */
function useNarrow(ref: React.RefObject<HTMLElement | null>): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const view = ref.current?.ownerDocument.defaultView;
    if (!view) return;
    const query = view.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [ref]);
  return narrow;
}

/** A 4xx is an answer, not a hiccup: asking again only delays what it says (403/404 → the stub). */
function retryUnlessAnswered(count: number, error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  return count < 2;
}

const EMPTY_PAGE: Paged<CollectionRecord> = {
  data: [],
  meta: { page: 1, limit: 0, total: 0, total_pages: 0 },
};

export const dataViewRecordKeys = {
  all: ["pages", "data-view", "records"] as const,
  lists: () => [...dataViewRecordKeys.all, "list"] as const,
  query: (query: Readonly<Record<string, string>>) => [...dataViewRecordKeys.lists(), query] as const,
  /**
   * The first preset's count, a key of its own (limit 1, only `meta.total` is
   * read): after a read mark it is re-read at once while the list keeps the
   * row in place until its own re-read (canvas A: the row fades, it does not
   * run from under the cursor).
   */
  counters: () => [...dataViewRecordKeys.all, "counter"] as const,
  counter: (query: Readonly<Record<string, string>>) => [...dataViewRecordKeys.counters(), query] as const,
  detail: (id: string) => [...dataViewRecordKeys.all, "record", id] as const,
};

/** Freshness (SDL-641): a re-read this often while the tab is visible, and on every return to it. */
export const DATA_VIEW_REFRESH_MS = 45 * 1000;

/** `?record=<id>` — the open record is part of the page's address, so a link opens it. */
export const DATA_VIEW_RECORD_PARAM = "record";

export function readRecordParam(search: string): string | null {
  const id = new URLSearchParams(search).get(DATA_VIEW_RECORD_PARAM);
  return id && id.trim() !== "" ? id : null;
}

/**
 * Writes the open record into the address without a navigation: Next's app
 * router takes `history.replaceState` as its own (useSearchParams follows),
 * and the page is not re-rendered from the server for it. Live location,
 * never a render-time snapshot (SDL-229 №2).
 */
export function writeRecordParam(id: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id === null) {
    if (!url.searchParams.has(DATA_VIEW_RECORD_PARAM)) return;
    url.searchParams.delete(DATA_VIEW_RECORD_PARAM);
  } else {
    if (url.searchParams.get(DATA_VIEW_RECORD_PARAM) === id) return;
    url.searchParams.set(DATA_VIEW_RECORD_PARAM, id);
  }
  window.history.replaceState(null, "", url.toString());
}

/**
 * A written record replaces its copy in every cached list and its detail —
 * IN PLACE: on "Unread" the row just marked stays, dimmed, until the next
 * re-read drops it.
 */
export function patchCachedRecord(qc: QueryClient, record: CollectionRecord): void {
  qc.setQueriesData<Paged<CollectionRecord>>({ queryKey: dataViewRecordKeys.lists() }, (old) =>
    old ? { ...old, data: old.data.map((r) => (r.id === record.id ? record : r)) } : old
  );
  qc.setQueryData(dataViewRecordKeys.detail(record.id), record);
}

/** The registry's `DataView` in the admin: the engine's contract, filled with records. */
export function LiveDataView({
  source,
  fields,
  sort,
  filter,
  presets,
  limit,
  children,
  ...rest
}: LiveDataViewProps): React.ReactElement {
  const labels = useDataViewLabels();
  const host = React.useContext(DataViewHostContext);
  const ref = React.useRef<HTMLElement | null>(null);
  const narrow = useNarrow(ref);
  // The renderer hands the node id over only on the editor canvas.
  const onCanvas = "data-sauna-node-id" in rest;

  const parsed = DataViewPropsSchema.safeParse({ source, fields, sort, filter, presets, limit });
  const props = parsed.success ? parsed.data : null;
  const firstPreset = props?.presets[0]?.id;
  const [chosenPreset, setChosenPreset] = React.useState<string | undefined>(undefined);
  const presetId = props?.presets.some((p) => p.id === chosenPreset) ? chosenPreset : firstPreset;
  const qc = useQueryClient();
  // The open record lives in the address (`?record=<id>`). Read once the
  // widget is live — on the editable canvas it opens nothing, and the editor
  // itself enters preview when the address carries a record.
  const [openId, setOpenId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (onCanvas) return;
    const fromUrl = readRecordParam(window.location.search);
    if (fromUrl) setOpenId(fromUrl);
  }, [onCanvas]);
  const selectedId = onCanvas ? null : openId;
  const setSelectedId = (id: string | null) => {
    setOpenId(id);
    writeRecordParam(id);
  };

  const query = props ? dataViewQuery(props, presetId) : null;
  const records = useQuery({
    queryKey: query ? dataViewRecordKeys.query(query) : dataViewRecordKeys.lists(),
    queryFn: () => collectionsRecordsApi.query(query as Record<string, string>),
    enabled: query !== null,
    staleTime: 30 * 1000,
    retry: retryUnlessAnswered,
    // Freshness: the mirror and the routines write while the page is open.
    refetchInterval: DATA_VIEW_REFRESH_MS,
    refetchOnWindowFocus: "always",
  });
  // The counter speaks for the first preset whichever tab is open — one
  // read of its total (limit 1), re-read right after a read mark.
  const counterQuery = props && firstPreset ? { ...dataViewQuery(props, firstPreset), limit: "1" } : null;
  const counterRecords = useQuery({
    queryKey: counterQuery ? dataViewRecordKeys.counter(counterQuery) : dataViewRecordKeys.counters(),
    queryFn: () => collectionsRecordsApi.query(counterQuery as Record<string, string>),
    enabled: counterQuery !== null,
    staleTime: 30 * 1000,
    retry: retryUnlessAnswered,
    refetchInterval: DATA_VIEW_REFRESH_MS,
    refetchOnWindowFocus: "always",
  });
  const counter: DataViewCounter =
    counterQuery === null
      ? null
      : counterRecords.data
        ? counterRecords.data.meta.total
        : counterRecords.error
          ? null
          : "loading";
  const fieldsQuery = useCollectionFields(props?.source.collection_id ?? null);
  const fieldNames = React.useMemo(() => {
    const names: Record<string, string> = {};
    for (const f of fieldsQuery.data ?? []) names[f.key] = f.name;
    return names;
  }, [fieldsQuery.data]);

  const page = records.data ?? EMPTY_PAGE;

  // The open record when the list does not hold it: a `?record=` link to a
  // record this preset filters out, or one a re-read dropped after its read
  // mark. Honoured only for THIS widget's collection (SDL-229 №3).
  const inList = selectedId !== null && page.data.some((r) => r.id === selectedId);
  const detail = useQuery({
    queryKey: selectedId ? dataViewRecordKeys.detail(selectedId) : [...dataViewRecordKeys.all, "record"],
    queryFn: () => collectionsRecordsApi.get(selectedId as string),
    enabled: selectedId !== null && props !== null && records.data !== undefined && !inList,
    staleTime: 30 * 1000,
    retry: retryUnlessAnswered,
    // A bad or deleted `?record=` answers 4xx once — no polling it forever.
    refetchInterval: (q) => (q.state.status === "error" ? false : DATA_VIEW_REFRESH_MS),
    refetchOnWindowFocus: "always",
  });
  const selectedRecord =
    detail.data && props && detail.data.collection_id === props.source.collection_id ? detail.data : null;

  // The one write: the declared `read_at`, read → change → write with
  // version, the whole round again on 409 (data-view-write.ts).
  const [writeError, setWriteError] = React.useState(false);
  const declaredKeys = React.useMemo(() => new Set((fieldsQuery.data ?? []).map((f) => f.key)), [fieldsQuery.data]);
  const mark = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      writeDeclaredField({
        api: collectionsRecordsApi,
        id,
        field: DATA_VIEW_READ_FIELD,
        value: read ? new Date().toISOString() : null,
        declaredKeys,
      }),
    onMutate: () => setWriteError(false),
    onSuccess: async (record) => {
      // A scheduled re-read already in flight carries the record as it was
      // BEFORE this write; landing after the patch it would flip the row
      // back. Cancel it first — the next re-read brings the truth.
      await qc.cancelQueries({ queryKey: dataViewRecordKeys.lists() });
      await qc.cancelQueries({ queryKey: dataViewRecordKeys.detail(record.id) });
      patchCachedRecord(qc, record);
      void qc.invalidateQueries({ queryKey: dataViewRecordKeys.counters() });
    },
    onError: () => setWriteError(true),
  });
  const declaresRead = declaresReadField(fieldsQuery.data ?? []);
  const readMark: DataViewReadMark | null = declaresRead
    ? {
        field: DATA_VIEW_READ_FIELD,
        pendingId: mark.isPending ? (mark.variables?.id ?? null) : null,
        onToggle: (id, read) => {
          if (onCanvas) return;
          mark.mutate({ id, read: !read });
        },
      }
    : null;
  const state = dataViewStateOf({
    bound: props !== null,
    // "Try again" shows loading while it asks; a background refetch that
    // fails over data already on screen keeps the list (the error is only
    // the screen when there is nothing else to show).
    isPending: records.isPending || (records.isFetching && records.error !== null),
    // …except "no access": the collection's rights beat rows already cached.
    error: isCollectionUnavailable(records.error)
      ? records.error
      : records.isFetching || records.data !== undefined
        ? null
        : records.error,
    total: page.data.length,
  });

  // The stub names the collection when its card can still be read (a 403 on
  // records with the collection itself visible); a removed one has no name
  // left to show, and the title says "the collection" instead.
  const collectionId = props?.source.collection_id ?? null;
  const collection = useQuery({
    queryKey: collectionId ? collectionKeys.detail(collectionId) : collectionKeys.details(),
    queryFn: () => collectionsApi.get(collectionId as string),
    enabled: state === "unavailable" && collectionId !== null,
    staleTime: 5 * 60 * 1000,
    retry: retryUnlessAnswered,
  });

  return (
    <DataViewFrame
      ref={ref}
      state={state}
      props={props}
      records={page.data}
      counter={counter}
      presetId={presetId}
      onPresetChange={(id) => {
        if (onCanvas) return;
        setChosenPreset(id);
        setSelectedId(null);
      }}
      selectedId={selectedId}
      onOpen={(id) => {
        if (onCanvas) return;
        // The list's copy seeds the detail, so a re-read that drops the
        // row (read, on "Unread") does not blink the panel shut.
        const opened = page.data.find((r) => r.id === id);
        if (opened) qc.setQueryData(dataViewRecordKeys.detail(id), opened);
        setSelectedId(id);
      }}
      onClose={() => setSelectedId(null)}
      onRetry={() => {
        if (!onCanvas) void records.refetch();
      }}
      collectionName={collection.data?.name ?? null}
      requestId={requestIdOf(records.error) ?? null}
      onOpenInStudio={
        host.openInStudio
          ? () => {
              if (!onCanvas) host.openInStudio?.(props?.source.collection_id ?? null);
            }
          : undefined
      }
      fieldNames={fieldNames}
      narrow={narrow}
      labels={labels}
      readMark={readMark}
      selectedRecord={selectedRecord}
      writeError={writeError}
      inert={onCanvas}
      data-pages-data-view-canvas={onCanvas ? "true" : undefined}
      {...rest}
    >
      {children}
    </DataViewFrame>
  );
}
