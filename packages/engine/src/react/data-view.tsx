// The DataView component (EP-117, SDL-639); its catalog half is
// `../core/data-view`. No hooks, no fetching, no browser APIs: this is the
// FRAME of the widget — the tabs the presets declare and an empty list —
// rendered the same on the server and in the canvas. Fetching records and
// drawing them is the admin wiring task (D1), which fills this frame from
// `dataViewQuery`; until then a visitor sees the frame's empty state.
//
// Like the primitives it spreads the props it does not consume onto its
// ROOT element, so the canvas can select it (`data-sauna-node-id`). It reads
// its props defensively — the renderer hands over whatever the node stores,
// and a node whose props do not parse (unbound, or a foreign version) must
// still draw a frame the author can click, not throw.

import * as React from "react";

import type { SaunaRegistry } from "./types";
import { DataViewPropsSchema, publicDataViewKey, publicDataViewRequest, type DataViewProps } from "../core/data-view";
import { loadPublicDataViewPage, type PublicDataViewPage, type PublicDataViewRecord } from "../providers/data";

type PassThrough = Omit<React.HTMLAttributes<HTMLElement>, "color">;

/** The component takes the node's props as stored — parsing is its own job. */
export type DataViewComponentProps = PassThrough & {
  source?: unknown;
  fields?: unknown;
  sort?: unknown;
  filter?: unknown;
  presets?: unknown;
  limit?: unknown;
  children?: React.ReactNode;
};

const FRAME: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.75rem",
  border: "1px dashed var(--border)",
  borderRadius: "0.5rem",
  color: "var(--foreground)",
};

const TAB: React.CSSProperties = {
  padding: "0.25rem 0.75rem",
  borderRadius: "999px",
  border: "1px solid var(--border)",
  fontSize: "0.875rem",
};

const EMPTY: React.CSSProperties = { fontSize: "0.875rem", color: "var(--muted-foreground)", margin: 0 };

export function DataView({ source, fields, sort, filter, presets, limit, style, children, ...rest }: DataViewComponentProps): React.ReactElement {
  const parsed = DataViewPropsSchema.safeParse({ source, fields, sort, filter, presets, limit });
  const bound = parsed.success;
  const tabs = parsed.success ? parsed.data.presets : [];
  return (
    <section
      data-pages-element="data-view"
      data-pages-data-view={bound ? "bound" : "unbound"}
      style={{ ...FRAME, ...style }}
      {...rest}
    >
      {tabs.length > 0 ? (
        <div role="tablist" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {tabs.map((t, i) => (
            <span key={t.id} role="tab" aria-selected={i === 0} data-pages-data-view-tab={t.id} style={TAB}>
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
      <p style={EMPTY}>{bound ? "No records yet" : "Choose a collection to show its records"}</p>
      {children}
    </section>
  );
}

/* ------------------------------------------------- the public DataView */

/**
 * What a published page hands its DataViews (SDL-679): the first page of
 * every list, loaded on the server (`publicDataViewKey` → page), and the
 * gateway origin the browser re-reads from on a tab switch. Plain data — it
 * crosses the server → client boundary as props.
 */
export type PublicDataViewSource = {
  apiBase?: string;
  pages: Readonly<Record<string, PublicDataViewPage>>;
};

const PublicDataViewContext = React.createContext<PublicDataViewSource | null>(null);

export function PublicDataViewProvider({ value, children }: { value: PublicDataViewSource; children?: React.ReactNode }): React.ReactElement {
  return <PublicDataViewContext.Provider value={value}>{children}</PublicDataViewContext.Provider>;
}

function cellText(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : null;
  if (Array.isArray(value)) {
    const parts = value.map(cellText).filter((v): v is string => v !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  // Rich text keeps its plain-text twin in `text`; any other object stays out of the row.
  if (typeof value === "object" && typeof (value as { text?: unknown }).text === "string") return (value as { text: string }).text || null;
  return null;
}

function keyOf(props: DataViewProps, presetId: string | undefined): string | null {
  try {
    const request = publicDataViewRequest(props, presetId);
    return request ? publicDataViewKey(request) : null;
  } catch {
    return null;
  }
}

function PublicRecordRow({ record, fields }: { record: PublicDataViewRecord; fields: readonly string[] }): React.ReactElement {
  const cells = fields.map((f) => [f, cellText(record.data[f])] as const).filter(([, v]) => v !== null);
  return (
    <li data-pages-data-view-record={record.id} style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border)" }}>
      {cells.map(([f, v]) => (
        <span key={f} data-pages-data-view-field={f}>
          {v}
        </span>
      ))}
    </li>
  );
}

/**
 * The DataView of a published page: the records an anonymous visitor may
 * see, first page from the server (`PublicDataViewProvider`), tabs re-read in
 * the browser through `loadPublicDataViewPage` — never with a token. A
 * collection the visitor may not read, or any failure, is the one
 * "unavailable" stub: no field, no upstream error reaches the HTML.
 */
export function PublicDataView({ source, fields, sort, filter, presets, limit, style, children, ...rest }: DataViewComponentProps): React.ReactElement {
  const ctx = React.useContext(PublicDataViewContext);
  const parsed = DataViewPropsSchema.safeParse({ source, fields, sort, filter, presets, limit });
  const props = parsed.success ? parsed.data : null;
  const tabs = props ? props.presets : [];
  const [tab, setTab] = React.useState<string | undefined>(tabs[0]?.id);
  const key = props ? keyOf(props, tab) : null;
  const [loaded, setLoaded] = React.useState<Readonly<Record<string, PublicDataViewPage>>>({});
  const page: PublicDataViewPage | undefined = key === null ? undefined : (loaded[key] ?? ctx?.pages[key]);
  const apiBase = ctx?.apiBase;

  React.useEffect(() => {
    if (!props || key === null || page !== undefined || !apiBase) return;
    const ac = new AbortController();
    void loadPublicDataViewPage(props, { apiBase, presetId: tab, signal: ac.signal }).then((next) => {
      if (!ac.signal.aborted) setLoaded((prev) => ({ ...prev, [key]: next }));
    });
    return () => ac.abort();
    // `props` is re-parsed every render; the key is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, apiBase, tab]);

  const state = !props ? "unbound" : key === null || page?.status === "unavailable" || (page === undefined && !apiBase) ? "unavailable" : page === undefined ? "loading" : page.records.length === 0 ? "empty" : "list";
  return (
    <section data-pages-element="data-view" data-pages-data-view={props ? "bound" : "unbound"} data-pages-data-view-state={state} style={{ ...FRAME, ...style }} {...rest}>
      {tabs.length > 0 ? (
        <div role="tablist" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              data-pages-data-view-tab={t.id}
              onClick={() => setTab(t.id)}
              style={{ ...TAB, background: "transparent", color: "inherit", cursor: "pointer" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      {state === "list" && page?.status === "list" ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {page.records.map((r) => (
            <PublicRecordRow key={r.id} record={r} fields={props?.fields ?? []} />
          ))}
        </ul>
      ) : (
        <p style={EMPTY}>
          {state === "unbound"
            ? "Choose a collection to show its records"
            : state === "unavailable"
              ? "This collection is unavailable"
              : state === "loading"
                ? "Loading…"
                : "No records yet"}
        </p>
      )}
      {children}
    </section>
  );
}

/** `type` → component for the widget Elements; pair with `WIDGET_BLOCKS`. */
export const WIDGET_REGISTRY = { DataView } satisfies SaunaRegistry;
