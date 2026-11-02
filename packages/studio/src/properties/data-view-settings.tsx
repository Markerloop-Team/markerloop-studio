"use client";

// DataView settings in the Studio's properties panel (SDL-642, EP-130),
// laid out after canvas A (`/design-system/feed?case=settings`): Data
// (collection), Fields, Sort, Filter, Presets — five sections, each edit one
// history frame through `onChange`. Every rule of what gets written is in
// `data-view-model.ts`; this file only draws it.
//
// The collections come from the host (`StudioDataSources`): the package
// cannot import the admin's data client.

import { useEffect, useRef, useState, type ReactNode } from "react";

import type { DataViewFilterClause, DataViewFilterOp } from "@markerloop/engine";
import { Alert, Badge, Button, FormControl, Text } from "@markerloop/ui/ui";

import {
  addFilterClause,
  addPreset,
  bindCollection,
  withCollectionKey,
  clauseText,
  makeClause,
  makeDefaultPreset,
  opLabel,
  opsForType,
  parseSortValue,
  readDataViewDraft,
  removeFilterClause,
  removePreset,
  sortOptions,
  sortValue,
  toggleField,
  type DataViewDraft,
  type StudioCollectionField,
  type StudioDataSources,
} from "./data-view-model";

const { Input, Label, NativeCheckbox, NativeSelect } = FormControl;
const controlCls = "h-8 max-md:text-xs md:text-xs";

type FieldsState =
  | { status: "idle" }
  | { status: "loading"; collectionId: string }
  | { status: "error"; collectionId: string }
  | { status: "ready"; collectionId: string; fields: readonly StudioCollectionField[] };

/** The field list of the bound collection, loaded through the host. */
function useCollectionFieldList(sources: StudioDataSources, collectionId: string | null) {
  const [state, setState] = useState<FieldsState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const { loadFields } = sources;
  useEffect(() => {
    if (!collectionId) {
      setState({ status: "idle" });
      return;
    }
    let live = true;
    setState({ status: "loading", collectionId });
    loadFields(collectionId).then(
      (fields) => live && setState({ status: "ready", collectionId, fields }),
      () => live && setState({ status: "error", collectionId })
    );
    return () => {
      live = false;
    };
  }, [collectionId, loadFields, attempt]);
  return { state, retry: () => setAttempt((n) => n + 1) };
}

export type DataViewSettingsProps = {
  props: Record<string, unknown>;
  sources: StudioDataSources;
  /** The whole next props object; the caller writes it as one operation. */
  onChange: (next: DataViewDraft) => void;
  disabled?: boolean;
};

export function DataViewSettings({ props, sources, onChange, disabled }: DataViewSettingsProps): ReactNode {
  const draft = readDataViewDraft(props);
  const collectionId = draft.source?.collection_id ?? null;
  const { state: fieldsState, retry: retryFields } = useCollectionFieldList(sources, collectionId);
  const fields = fieldsState.status === "ready" ? fieldsState.fields : [];
  const boundMissing =
    collectionId !== null && sources.status === "ready" && !sources.collections.some((c) => c.id === collectionId);

  // A node bound before SDL-679 has no `collection_key`, and re-picking the
  // same collection fires no change — so the panel writes the key itself once
  // the collections are loaded, touching nothing but the source.
  const keyed = sources.status === "ready" && !disabled ? withCollectionKey(draft, sources.collections) : draft;
  const missingKey = keyed !== draft ? keyed.source?.collection_key : undefined;
  useEffect(() => {
    if (missingKey !== undefined) onChange(keyed);
    // Fires once per missing key; `keyed` is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, collectionId]);

  // Picking a collection loads its fields FIRST and binds with them — never
  // with an empty set that a later retry would not fill (SDL-642 review).
  // While they load the select is disabled; a failure keeps the old binding
  // and offers a retry of the same pick. Only the latest pick may land: a
  // slow answer for an earlier choice is dropped.
  const [binding, setBinding] = useState<{ id: string; status: "loading" | "error" } | null>(null);
  const pickSeq = useRef(0);
  const pick = async (id: string) => {
    if (!id || !sources.workspaceId) return;
    const workspaceId = sources.workspaceId;
    const seq = ++pickSeq.current;
    setBinding({ id, status: "loading" });
    let list: readonly StudioCollectionField[];
    try {
      list = await sources.loadFields(id);
    } catch {
      if (seq === pickSeq.current) setBinding({ id, status: "error" });
      return;
    }
    if (seq !== pickSeq.current) return;
    setBinding(null);
    onChange(bindCollection(draft, id, workspaceId, list, sources.collections.find((c) => c.id === id)?.key));
  };
  const bindingName = binding ? (sources.collections.find((c) => c.id === binding.id)?.name ?? "the collection") : "";

  return (
    <div className="flex flex-col" data-testid="dv-panel" data-sauna-dataview-settings="">
      <Section id="source" title="Data">
        {sources.status === "loading" ? (
          <Text size="sm" variant="muted" role="status" data-testid="dv-collections-loading">
            Loading collections…
          </Text>
        ) : sources.status === "error" ? (
          <Alert variant="destructive" className="p-2 text-xs" data-testid="dv-collections-error">
            Could not load the workspace's collections.
            {sources.onRetry ? (
              <Button size="sm" variant="outline" className="mt-2 block" onClick={sources.onRetry} data-testid="dv-collections-retry">
                Try again
              </Button>
            ) : null}
          </Alert>
        ) : sources.collections.length === 0 ? (
          <div className="flex flex-col gap-1" data-testid="dv-collections-empty">
            <Text size="sm">This workspace has no collections yet.</Text>
            <Text size="xs" variant="muted">
              Create one in Collections, then come back and pick it here.
            </Text>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5" data-testid="dv-field-collection">
            <Label htmlFor="dv-input-collection" className="text-xs font-normal">
              Collection
            </Label>
            <NativeSelect
              id="dv-input-collection"
              className={controlCls}
              value={binding?.id ?? collectionId ?? ""}
              disabled={disabled || !sources.workspaceId || binding?.status === "loading"}
              aria-busy={binding?.status === "loading" ? true : undefined}
              onChange={(e) => void pick(e.target.value)}
            >
              {collectionId === null && !binding ? <option value="">— pick a collection —</option> : null}
              {boundMissing ? <option value={collectionId ?? ""}>Unavailable collection</option> : null}
              {sources.collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            {binding?.status === "loading" ? (
              <Text size="xs" variant="muted" role="status" data-testid="dv-binding-loading">
                Loading the fields of {bindingName}…
              </Text>
            ) : null}
            {binding?.status === "error" ? (
              <div className="flex flex-col gap-2" role="alert" data-testid="dv-binding-error">
                <Text size="xs">Could not load the fields of {bindingName}. The binding is unchanged.</Text>
                <Button size="sm" variant="outline" className="self-start" onClick={() => void pick(binding.id)} data-testid="dv-binding-retry">
                  Try again
                </Button>
              </div>
            ) : null}
            {boundMissing && !binding ? (
              <Text size="xs" variant="muted" data-testid="dv-collection-missing">
                The bound collection is gone or not yours to read. Pick another one.
              </Text>
            ) : null}
          </div>
        )}
        {fields.some((f) => f.key === "read_at") ? (
          <Text size="xs" variant="muted" data-testid="dv-write-note">
            The widget writes only one field — read_at, when a record is marked as read.
          </Text>
        ) : null}
      </Section>

      {collectionId === null ? null : (
        <>
          <Section id="fields" title="Fields">
            {fieldsState.status === "loading" ? (
              <Text size="sm" variant="muted" role="status" data-testid="dv-fields-loading">
                Loading fields…
              </Text>
            ) : fieldsState.status === "error" ? (
              <div className="flex flex-col gap-2" data-testid="dv-fields-error">
                <Text size="sm">Could not load the collection's fields.</Text>
                <Button size="sm" variant="outline" className="self-start" onClick={retryFields}>
                  Try again
                </Button>
              </div>
            ) : fields.length === 0 ? (
              <Text size="sm" variant="muted" data-testid="dv-fields-empty">
                The collection declares no fields yet.
              </Text>
            ) : (
              <div className="flex flex-col gap-1.5" data-testid="dv-fields">
                {fields.map((field) => {
                  const shown = draft.fields.includes(field.key);
                  return (
                    <label key={field.key} className="flex items-center gap-2 text-sm" htmlFor={`dv-field-${field.key}`}>
                      <NativeCheckbox
                        id={`dv-field-${field.key}`}
                        checked={shown}
                        disabled={disabled}
                        onChange={(e) => onChange(toggleField(draft, field.key, e.target.checked, fields))}
                      />
                      <span className="font-mono text-xs">{field.key}</span>
                      {shown ? null : (
                        <Text as="span" size="xs" variant="muted" className="ml-auto">
                          in record only
                        </Text>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </Section>

          <Section id="sort" title="Sort">
            <div className="flex flex-col gap-1.5" data-testid="dv-field-sort">
              <Label htmlFor="dv-input-sort" className="text-xs font-normal">
                Order
              </Label>
              <NativeSelect
                id="dv-input-sort"
                className={controlCls}
                value={sortValue(draft.sort)}
                disabled={disabled}
                onChange={(e) => {
                  const sort = parseSortValue(e.target.value);
                  if (sort) onChange({ ...draft, sort });
                }}
              >
                {withCurrent(sortOptions(fields), draft.sort).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.field} — {o.direction === "desc" ? "newest / largest first" : "oldest / smallest first"}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </Section>

          <Section id="filter" title="Filter">
            {draft.filter.map((clause, i) => (
              <div
                key={`${clause.field}-${clause.op}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
                data-testid="dv-filter-condition"
              >
                <Text as="span" size="sm" className="min-w-[8rem] flex-1 font-mono">
                  {clauseText([clause])}
                </Text>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  aria-label={`Remove condition ${clauseText([clause])}`}
                  onClick={() => onChange(removeFilterClause(draft, i))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Text size="xs" variant="muted">
              Applies to every preset below.
            </Text>
            <ConditionForm
              idPrefix="dv-filter"
              fields={fields}
              disabled={disabled}
              submitLabel="Add condition"
              onSubmit={(clause) => {
                if (!clause) return "Pick a field and a value it can take (a number, or a date as YYYY-MM-DD).";
                const next = addFilterClause(draft, clause);
                if (!next) return "This field already has a condition with that operator.";
                onChange(next);
                return null;
              }}
            />
          </Section>

          <Section id="presets" title="Presets">
            <div className="flex flex-col gap-2" data-testid="dv-presets">
              {draft.presets.map((preset, i) => (
                <div
                  key={preset.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
                  data-testid="dv-preset"
                  data-preset-id={preset.id}
                >
                  <div className="flex min-w-[6rem] flex-1 flex-col">
                    <Text as="span" size="sm" weight="medium">
                      {preset.label}
                    </Text>
                    <Text as="span" size="xs" variant="muted" className="font-mono">
                      {clauseText(preset.filter)}
                    </Text>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                  {i === 0 ? (
                    <Badge variant="secondary" data-testid="dv-preset-default">
                      Default
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={`Make ${preset.label} the default tab`}
                      onClick={() => onChange(makeDefaultPreset(draft, preset.id))}
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Remove preset ${preset.label}`}
                    onClick={() => onChange(removePreset(draft, preset.id))}
                  >
                    Remove
                  </Button>
                  </div>
                </div>
              ))}
              {draft.presets.length === 0 ? (
                <Text size="xs" variant="muted" data-testid="dv-presets-empty">
                  No presets: the widget shows one list without tabs.
                </Text>
              ) : null}
              <PresetForm
                fields={fields}
                disabled={disabled}
                onSubmit={(label, clause) => {
                  const next = addPreset(draft, label, clause);
                  if (!next) return label.trim() === "" ? "Name the tab." : "The base filter already has that condition.";
                  onChange(next);
                  return null;
                }}
              />
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

/** Keeps the stored sort selectable even when the field list does not offer it (not loaded, or a removed field). */
function withCurrent(options: ReturnType<typeof sortOptions>, sort: DataViewDraft["sort"]) {
  const value = sortValue(sort);
  return options.some((o) => o.value === value) ? options : [{ value, ...sort }, ...options];
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0" data-testid={`dv-section-${id}`}>
      <Text as="span" size="xs" weight="medium" className="uppercase tracking-wide">
        {title}
      </Text>
      {children}
    </div>
  );
}

/** Field + operator + value. `onSubmit` returns an error line or null (accepted → the form clears). */
function ConditionControls({
  idPrefix,
  fields,
  disabled,
  value,
  onValue,
  allowNone,
}: {
  idPrefix: string;
  fields: readonly StudioCollectionField[];
  disabled?: boolean;
  value: { field: string; op: DataViewFilterOp; raw: string };
  onValue: (next: { field: string; op: DataViewFilterOp; raw: string }) => void;
  allowNone?: boolean;
}): ReactNode {
  const field = fields.find((f) => f.key === value.field);
  const ops = field ? opsForType(field.type) : [];
  const needsChoice = value.op === "null" || field?.type === "boolean";
  return (
    <div className="flex flex-wrap gap-2">
      <NativeSelect
        aria-label="Field"
        id={`${idPrefix}-field`}
        className={`${controlCls} min-w-[7rem] flex-1`}
        value={value.field}
        disabled={disabled}
        onChange={(e) => {
          const next = fields.find((f) => f.key === e.target.value);
          const op = next ? (opsForType(next.type)[0] ?? "eq") : "eq";
          onValue({ field: e.target.value, op, raw: next?.type === "boolean" || op === "null" ? "true" : "" });
        }}
      >
        <option value="">{allowNone ? "no condition" : "— field —"}</option>
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.key}
          </option>
        ))}
      </NativeSelect>
      {field ? (
        <NativeSelect
          aria-label="Operator"
          id={`${idPrefix}-op`}
          className={`${controlCls} w-auto`}
          value={value.op}
          disabled={disabled}
          onChange={(e) => {
            const op = e.target.value as DataViewFilterOp;
            onValue({ ...value, op, raw: op === "null" || field.type === "boolean" ? "true" : "" });
          }}
        >
          {ops.map((op) => (
            <option key={op} value={op}>
              {op === "null" ? "is empty?" : opLabel(op)}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      {field ? (
        needsChoice ? (
          <NativeSelect
            aria-label="Value"
            id={`${idPrefix}-value`}
            className={`${controlCls} w-auto`}
            value={value.raw}
            disabled={disabled}
            onChange={(e) => onValue({ ...value, raw: e.target.value })}
          >
            <option value="true">{value.op === "null" ? "yes" : "true"}</option>
            <option value="false">{value.op === "null" ? "no" : "false"}</option>
          </NativeSelect>
        ) : (
          <Input
            aria-label="Value"
            id={`${idPrefix}-value`}
            className={`${controlCls} min-w-[6rem] flex-1`}
            value={value.raw}
            disabled={disabled}
            type={field.type === "date" && value.op !== "in" ? "date" : "text"}
            inputMode={field.type === "number" ? "decimal" : undefined}
            placeholder={value.op === "in" ? "a,b,c" : field.type === "date" ? "YYYY-MM-DD" : "value"}
            onChange={(e) => onValue({ ...value, raw: e.target.value })}
          />
        )
      ) : null}
    </div>
  );
}

const EMPTY_CONDITION = { field: "", op: "eq" as DataViewFilterOp, raw: "" };

function ConditionForm({
  idPrefix,
  fields,
  disabled,
  submitLabel,
  onSubmit,
}: {
  idPrefix: string;
  fields: readonly StudioCollectionField[];
  disabled?: boolean;
  submitLabel: string;
  onSubmit: (clause: DataViewFilterClause | null) => string | null;
}): ReactNode {
  const [value, setValue] = useState(EMPTY_CONDITION);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2" data-testid={`${idPrefix}-form`}>
      <ConditionControls idPrefix={idPrefix} fields={fields} disabled={disabled} value={value} onValue={(v) => { setValue(v); setError(null); }} />
      {error ? (
        <Text size="xs" role="alert" className="text-destructive">
          {error}
        </Text>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={disabled || fields.length === 0}
        data-testid={`${idPrefix}-add`}
        onClick={() => {
          const failure = onSubmit(makeClause(fields.find((f) => f.key === value.field), value.op, value.raw));
          setError(failure);
          if (!failure) setValue(EMPTY_CONDITION);
        }}
      >
        {submitLabel}
      </Button>
    </div>
  );
}

function PresetForm({
  fields,
  disabled,
  onSubmit,
}: {
  fields: readonly StudioCollectionField[];
  disabled?: boolean;
  onSubmit: (label: string, clause: DataViewFilterClause | null) => string | null;
}): ReactNode {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState(EMPTY_CONDITION);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border px-3 py-2" data-testid="dv-preset-form">
      <Label htmlFor="dv-preset-label" className="text-xs font-normal">
        New tab
      </Label>
      <Input
        id="dv-preset-label"
        className={controlCls}
        value={label}
        disabled={disabled}
        placeholder="Tab name"
        onChange={(e) => {
          setLabel(e.target.value);
          setError(null);
        }}
      />
      <ConditionControls
        idPrefix="dv-preset"
        fields={fields}
        disabled={disabled}
        value={value}
        allowNone
        onValue={(v) => {
          setValue(v);
          setError(null);
        }}
      />
      {error ? (
        <Text size="xs" role="alert" className="text-destructive">
          {error}
        </Text>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        disabled={disabled}
        data-testid="dv-preset-add"
        onClick={() => {
          const field = fields.find((f) => f.key === value.field);
          const clause = field ? makeClause(field, value.op, value.raw) : null;
          if (field && !clause) {
            setError("Give the condition a value it can take (a number, or a date as YYYY-MM-DD).");
            return;
          }
          const failure = onSubmit(label, clause);
          setError(failure);
          if (!failure) {
            setLabel("");
            setValue(EMPTY_CONDITION);
          }
        }}
      >
        Add preset
      </Button>
    </div>
  );
}
