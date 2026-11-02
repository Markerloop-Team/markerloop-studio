// DataView settings — the pure half (SDL-642, EP-130).
//
// The properties panel of the `DataView` Element (canvas A,
// `/design-system/feed?case=settings`) edits the node's props through these
// functions and nothing else, so the tests can pin the serialization without
// a DOM: bind a collection → the source and a starter set of fields; a sort
// is one option string; a condition is a `DataViewFilterClause` typed by the
// field it names; a preset gets an id derived from its label.
//
// The collection list is NOT fetched here: `@markerloop/studio` cannot import
// the admin's data client, so the host hands the list in (`StudioDataSources`).

import {
  DATA_VIEW_INITIAL_PROPS,
  DATA_VIEW_FILTER_OPS,
  type DataViewFilterClause,
  type DataViewFilterOp,
  type DataViewPreset,
} from "@markerloop/engine";

/** One field of a collection, as the host knows it. `type` is collections-service's field type. */
export type StudioCollectionField = { key: string; name: string; type: string };

/** One collection the page's workspace offers. */
export type StudioCollection = { id: string; name: string; key?: string };

/**
 * What the host tells the panel about the workspace's collections. The
 * panel draws every state of it (loading, error with retry, empty, ready).
 */
export type StudioDataSources = {
  /** The page's workspace — becomes `source.workspace_id` on bind. `null` = not known yet. */
  workspaceId: string | null;
  status: "loading" | "error" | "ready";
  collections: readonly StudioCollection[];
  /** Asks again after an error. */
  onRetry?: () => void;
  /** Fields of one collection (the host caches). Rejects → the panel shows the error. */
  loadFields: (collectionId: string) => Promise<readonly StudioCollectionField[]>;
};

/** The props shape the panel reads — loose on purpose: an unbound node has no `source`. */
export type DataViewDraft = {
  source?: { kind: "collection"; workspace_id: string; collection_id: string; collection_key?: string };
  fields: string[];
  sort: { field: string; direction: "asc" | "desc" };
  filter: DataViewFilterClause[];
  presets: DataViewPreset[];
  limit: number;
};

const TIMESTAMPS = ["created_at", "updated_at"] as const;
/** Types a list row can show as text; the rest (rich text, images, json) stay in the record panel. */
const LIST_TYPES = new Set(["string", "number", "boolean", "date", "select"]);
/** How many fields a fresh binding shows in the list — the row has a title, a subtitle and badges. */
const STARTER_FIELDS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads whatever the node holds into a full draft, filling the gaps with the initial props. */
export function readDataViewDraft(props: Record<string, unknown>): DataViewDraft {
  const init = DATA_VIEW_INITIAL_PROPS;
  const source = isRecord(props.source) &&
    typeof props.source.collection_id === "string" &&
    typeof props.source.workspace_id === "string"
    ? {
        kind: "collection" as const,
        workspace_id: props.source.workspace_id,
        collection_id: props.source.collection_id,
        ...(typeof props.source.collection_key === "string" ? { collection_key: props.source.collection_key } : {}),
      }
    : undefined;
  const rawSort = isRecord(props.sort) ? props.sort : {};
  const direction = rawSort.direction === "asc" || rawSort.direction === "desc" ? rawSort.direction : null;
  const sort: DataViewDraft["sort"] =
    typeof rawSort.field === "string" && direction ? { field: rawSort.field, direction } : { ...init.sort };
  return {
    source,
    fields: Array.isArray(props.fields) ? props.fields.filter((f): f is string => typeof f === "string") : [...init.fields],
    sort,
    filter: Array.isArray(props.filter) ? (props.filter as DataViewFilterClause[]) : [...init.filter],
    presets: Array.isArray(props.presets) ? (props.presets as DataViewPreset[]) : [...init.presets],
    limit: typeof props.limit === "number" ? props.limit : init.limit,
  };
}

/**
 * Binding a collection: the source, and the first few list-friendly fields
 * shown. Sort, filter and presets go back to the initial ones — conditions
 * written against another collection's fields would 400 on this one.
 * Re-picking the collection already bound changes nothing.
 */
export function bindCollection(
  draft: DataViewDraft,
  collectionId: string,
  workspaceId: string,
  fields: readonly StudioCollectionField[],
  /**
   * The collection's key (SDL-679): the published page reads the anonymous
   * plane, which addresses a collection by key. Re-picking the bound
   * collection adds it to a node bound before it was written.
   */
  collectionKey?: string
): DataViewDraft {
  if (draft.source?.collection_id === collectionId && draft.source.workspace_id === workspaceId) {
    if (collectionKey === undefined || draft.source.collection_key === collectionKey) return draft;
    return { ...draft, source: { ...draft.source, collection_key: collectionKey } };
  }
  return {
    ...DATA_VIEW_INITIAL_PROPS,
    sort: { ...DATA_VIEW_INITIAL_PROPS.sort },
    filter: [],
    presets: [],
    source: {
      kind: "collection",
      workspace_id: workspaceId,
      collection_id: collectionId,
      ...(collectionKey !== undefined ? { collection_key: collectionKey } : {}),
    },
    fields: fields.filter((f) => LIST_TYPES.has(f.type)).slice(0, STARTER_FIELDS).map((f) => f.key),
  };
}

/**
 * The bound collection's key written into a node that lacks it (SDL-679):
 * a node bound before the key existed reads nothing on the published page.
 * Only the source changes — fields, sort, filter and presets stay as the
 * author left them. The same draft back when there is nothing to add (no
 * binding, the collection is not in the list, it has no key, or the key is
 * already there), so the caller can tell "write" from "leave alone".
 */
export function withCollectionKey(draft: DataViewDraft, collections: readonly StudioCollection[]): DataViewDraft {
  const source = draft.source;
  if (!source) return draft;
  const key = collections.find((c) => c.id === source.collection_id)?.key;
  if (key === undefined || key === "" || source.collection_key === key) return draft;
  return { ...draft, source: { ...source, collection_key: key } };
}

/** Shows or hides one field in the list, keeping the collection's order. */
export function toggleField(
  draft: DataViewDraft,
  key: string,
  shown: boolean,
  order: readonly StudioCollectionField[]
): DataViewDraft {
  const next = new Set(draft.fields);
  if (shown) next.add(key);
  else next.delete(key);
  const known = order.map((f) => f.key).filter((k) => next.has(k));
  // A key the collection no longer declares keeps its place at the end rather than vanishing silently.
  const orphans = draft.fields.filter((k) => next.has(k) && !known.includes(k));
  return { ...draft, fields: [...known, ...orphans] };
}

/** One sort option: `<field>:<direction>`. */
export function sortValue(sort: DataViewDraft["sort"]): string {
  return `${sort.field}:${sort.direction}`;
}

export function parseSortValue(value: string): DataViewDraft["sort"] | null {
  const at = value.lastIndexOf(":");
  if (at <= 0) return null;
  const field = value.slice(0, at);
  const direction = value.slice(at + 1);
  if (direction !== "asc" && direction !== "desc") return null;
  return { field, direction };
}

/** Fields a list can be sorted by: the two timestamps and every scalar field. */
export function sortOptions(fields: readonly StudioCollectionField[]): { value: string; field: string; direction: "asc" | "desc" }[] {
  const keys = [...TIMESTAMPS, ...fields.filter((f) => LIST_TYPES.has(f.type)).map((f) => f.key)];
  return keys.flatMap((field) => [
    { value: `${field}:desc`, field, direction: "desc" as const },
    { value: `${field}:asc`, field, direction: "asc" as const },
  ]);
}

/** The operators offered for a field type — a subset of `DATA_VIEW_FILTER_OPS`, never beyond it. */
export function opsForType(type: string): readonly DataViewFilterOp[] {
  switch (type) {
    case "boolean":
      return ["eq", "ne", "null"];
    case "number":
    case "date":
      return ["eq", "ne", "gt", "gte", "lt", "lte", "null"];
    case "string":
    case "select":
      return ["eq", "ne", "like", "in", "null"];
    default:
      return ["null"];
  }
}

/**
 * The typed wire value of a condition. `null` takes a boolean ("is empty" =
 * true); a boolean field takes true/false; a number field a finite number;
 * the rest the text as typed (`in` stays one comma-joined string).
 * `null` result = the text does not fit, the condition is not written.
 */
export function coerceClauseValue(type: string, op: DataViewFilterOp, raw: string): string | number | boolean | null {
  const text = raw.trim();
  if (op === "null" || type === "boolean") {
    if (text === "true") return true;
    if (text === "false") return false;
    return null;
  }
  if (op === "in") {
    // One comma-joined string on the wire; the parts are trimmed and empty
    // ones dropped here, so "a, b," reaches the service as "a,b".
    const parts = text.split(",").map((p) => p.trim()).filter((p) => p !== "");
    if (parts.length === 0) return null;
    if (type === "number" && !parts.every((p) => Number.isFinite(Number(p)))) return null;
    if (type === "date" && !parts.every(isIsoDate)) return null;
    return parts.join(",");
  }
  if (type === "number") {
    if (text === "") return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  // A date compared with gt/lt/eq must be one the service can parse — any
  // other text is a 400 `invalid_filter_value` on every read of the feed.
  if (type === "date") return isIsoDate(text) ? text : null;
  return text === "" ? null : text;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2}))?$/;

/** `2026-09-28` or a full RFC 3339 timestamp with a zone — and a real calendar day. */
export function isIsoDate(text: string): boolean {
  const m = ISO_DATE.exec(text);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return false;
  if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] ?? 0) > 59)) return false;
  // A time without a zone is ambiguous on the server: refused, not guessed.
  if (m[4] !== undefined && !/(Z|[+-]\d{2}:\d{2})$/.test(text)) return false;
  return true;
}

/** A clause as the service will read it, or `null` when it cannot be written. */
export function makeClause(
  field: StudioCollectionField | undefined,
  op: DataViewFilterOp,
  raw: string
): DataViewFilterClause | null {
  if (!field || !(DATA_VIEW_FILTER_OPS as readonly string[]).includes(op)) return null;
  const value = coerceClauseValue(field.type, op, raw);
  return value === null ? null : { field: field.key, op, value };
}

const wireKey = (c: DataViewFilterClause) => `filter[${c.field}][${c.op}]`;

/**
 * Adds a condition to the base filter. Refused (`null`) when the same field
 * and operator are already there — the gateway keeps one value per
 * `filter[field][op]`, and the engine's schema refuses the pair.
 */
export function addFilterClause(draft: DataViewDraft, clause: DataViewFilterClause): DataViewDraft | null {
  const taken = new Set(draft.filter.map(wireKey));
  const inPresets = draft.presets.some((p) => p.filter.some((c) => wireKey(c) === wireKey(clause)));
  if (taken.has(wireKey(clause)) || inPresets) return null;
  return { ...draft, filter: [...draft.filter, clause] };
}

export function removeFilterClause(draft: DataViewDraft, index: number): DataViewDraft {
  return { ...draft, filter: draft.filter.filter((_, i) => i !== index) };
}

/** Russian and Kazakh Cyrillic → Latin, for preset ids (a practical scheme, not a standard). */
const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  // Kazakh letters beyond the Russian alphabet.
  ә: "a", ғ: "g", қ: "q", ң: "ng", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i",
};

export function transliterate(text: string): string {
  return [...text.toLowerCase()].map((ch) => TRANSLIT[ch] ?? ch).join("");
}

/** `needs_answer` from "Needs answer", `nuzhen_otvet` from «Нужен ответ»; `tab` when nothing is left. */
export function presetIdFor(label: string, taken: readonly string[]): string {
  const base =
    transliterate(label)
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "tab";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return id;
}

/**
 * Adds a tab. `clause` null = a tab with no condition of its own ("All").
 * Refused when the label is blank or the condition repeats one of the base
 * filter's `filter[field][op]`.
 */
export function addPreset(draft: DataViewDraft, label: string, clause: DataViewFilterClause | null): DataViewDraft | null {
  const name = label.trim();
  if (name === "") return null;
  if (clause && draft.filter.some((c) => wireKey(c) === wireKey(clause))) return null;
  const id = presetIdFor(name, draft.presets.map((p) => p.id));
  return { ...draft, presets: [...draft.presets, { id, label: name, filter: clause ? [clause] : [] }] };
}

export function removePreset(draft: DataViewDraft, id: string): DataViewDraft {
  return { ...draft, presets: draft.presets.filter((p) => p.id !== id) };
}

/** Moves a preset to the front — the first tab is the one that opens, and the one the counter speaks for. */
export function makeDefaultPreset(draft: DataViewDraft, id: string): DataViewDraft {
  const preset = draft.presets.find((p) => p.id === id);
  if (!preset) return draft;
  return { ...draft, presets: [preset, ...draft.presets.filter((p) => p.id !== id)] };
}

const OP_TEXT: Record<DataViewFilterOp, string> = {
  eq: "is",
  ne: "is not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  in: "is one of",
  like: "contains",
  null: "is empty",
};

export function opLabel(op: DataViewFilterOp): string {
  return OP_TEXT[op];
}

/** "read_at is empty", "needs_answer is true", "no condition" — the rule line under a preset (canvas A). */
export function clauseText(clauses: readonly DataViewFilterClause[]): string {
  if (clauses.length === 0) return "no condition";
  return clauses
    .map((c) =>
      c.op === "null" ? `${c.field} ${c.value === true ? "is empty" : "is not empty"}` : `${c.field} ${OP_TEXT[c.op]} ${String(c.value)}`
    )
    .join(" and ");
}

/**
 * What the panel writes back: the props the engine's contract takes. An
 * unbound draft yields no `source` key at all (the node stays unbound, the
 * canvas draws its unbound frame), never a placeholder.
 */
export function draftToProps(draft: DataViewDraft): Record<string, unknown> {
  const { source, ...rest } = draft;
  return source ? { source, ...rest } : { ...rest };
}
