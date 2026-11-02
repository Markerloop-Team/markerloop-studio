"use client";

// Relation record picker (SDL-170) — Markerloop's renderer for the
// `relation` field type, registered over the module default (a bare
// comma-separated id input) via the field-type registry extension
// point (widgets/collections/field-type-registry).
//
// The wire value stays an array of record UUIDs; the picker renders it
// as removable chips with a human-readable label and appends via a
// select over the target collection's records. The target collection
// comes from the field config ({"collection_key"}, the same contract
// the backend validates); its records are fetched with TanStack Query
// through the existing /api/v1/records client — no new dependencies.
//
// Labels: the first `string`-type field of the target schema with a
// non-empty value, else the record slug, else a short id — records
// rarely have a universal "title", so the first string field is the
// best cheap proxy and matches what the records table shows first.

import { useTranslations } from "@/shared/hooks";
import {
  useCollection,
  useCollections,
} from "@/entities/collections/collection";
import { useCollectionFields } from "@/entities/collections/collection-field";
import { useCurrentWorkspace } from "@/entities/collections/workspace";
import { useRecords, type Record as CollectionRecordEntity } from "@/entities/collections/record";
import {
  relationIdsFromValue,
  type CollectionField,
  type FieldFormInputProps,
} from "@/widgets/collections";
import { Badge, Box, FormControl, Text } from "@markerloop/ui/ui";
import type { ReactNode } from "react";

// The picker loads one page of the target collection. Beyond that a
// search box is the right tool — deferred until a real collection
// outgrows this (same trade-off as the collections sidebar limit).
const TARGET_PAGE_LIMIT = 100;

/** Target collection key from a relation field config. */
function targetKeyOf(field: CollectionField): string | null {
  const raw = field.config?.collection_key;
  return typeof raw === "string" && raw !== "" ? raw : null;
}

/** Human-readable label for a target record. */
function recordLabel(
  record: CollectionRecordEntity,
  targetFields: readonly CollectionField[]
): string {
  for (const f of targetFields) {
    if (f.type !== "string") continue;
    const v = record.data?.[f.key];
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  if (typeof record.slug === "string" && record.slug !== "") {
    return record.slug;
  }
  return record.id.slice(0, 8);
}

export function RelationPickerInput(props: FieldFormInputProps): ReactNode {
  const t = useTranslations("collections");
  const ids = relationIdsFromValue(props.value);
  const targetKey = targetKeyOf(props.field);

  // The field only names the target by key; resolving it to an id
  // walks source collection → its workspace's collections (the workspace
  // is published by the host page, SDL-621). Both queries are cached by
  // TanStack, so a form with several relation fields costs one
  // round-trip each, not one per field.
  // While the host is still finding the workspace, this is a loading
  // state, not a missing target (a ?record= deep link would flash one).
  const { workspaceId, isResolving: workspaceResolving } =
    useCurrentWorkspace();
  const sourceQuery = useCollection(props.field.collection_id);
  const collectionsQuery = useCollections(
    sourceQuery.data && workspaceId
      ? { workspace_id: workspaceId, limit: TARGET_PAGE_LIMIT }
      : null
  );
  const target =
    collectionsQuery.data?.data.find((c) => c.key === targetKey) ?? null;

  const targetFieldsQuery = useCollectionFields(target?.id ?? null);
  const recordsQuery = useRecords(
    target ? { collection_id: target.id, limit: TARGET_PAGE_LIMIT } : null
  );

  if (!targetKey) {
    return (
      <Text
        as="span"
        variant="muted"
        size="xs"
        data-relation-picker-state="no-target"
      >
        {t("relationPicker.noTarget") as string}
      </Text>
    );
  }
  if (
    (sourceQuery.isSuccess && collectionsQuery.isSuccess && !target) ||
    (sourceQuery.isSuccess && !workspaceId && !workspaceResolving) ||
    sourceQuery.isError ||
    collectionsQuery.isError
  ) {
    return (
      <Text
        as="span"
        variant="muted"
        size="xs"
        data-relation-picker-state="missing-target"
      >
        {t("relationPicker.missingTarget") as string} {targetKey}
      </Text>
    );
  }

  const targetFields = targetFieldsQuery.data ?? [];
  const records = recordsQuery.data?.data ?? [];
  const byId = new Map(records.map((r) => [r.id, r]));
  const remaining = records.filter((r) => !ids.includes(r.id));
  const loading =
    !target || targetFieldsQuery.isLoading || recordsQuery.isLoading;

  return (
    <Box direction="column" gap={1.5} data-relation-picker="">
      {ids.length > 0 ? (
        <Box direction="row" wrap gap={1.5}>
          {ids.map((id) => {
            const rec = byId.get(id);
            return (
              <Badge
                key={id}
                variant="secondary"
                className="gap-1.5 rounded-md font-normal"
                data-relation-chip={id}
              >
                {rec ? recordLabel(rec, targetFields) : id.slice(0, 8)}
                <button
                  type="button"
                  className="cursor-pointer leading-none"
                  disabled={props.disabled}
                  aria-label={`${t("relationPicker.remove") as string} ${id}`}
                  onClick={() => {
                    const next = ids.filter((v) => v !== id);
                    props.onChange(next.length > 0 ? next : null);
                  }}
                >
                  ×
                </button>
              </Badge>
            );
          })}
        </Box>
      ) : null}
      {/* Appending resets the select back to the placeholder, so its
          value is always "" — a plain "add one more" control, not the
          canonical value (that lives in the chips above). Radix shows the
          placeholder for "", and no Item may carry "". */}
      <FormControl.Select.Root
        value=""
        disabled={props.disabled || loading || remaining.length === 0}
        onValueChange={(id) => {
          if (id) props.onChange([...ids, id]);
        }}
      >
        <FormControl.Select.Trigger
          id={props.inputId}
          fullWidth
          data-relation-picker-add=""
        >
          <FormControl.Select.Value
            placeholder={
              loading
                ? (t("loading") as string)
                : remaining.length === 0
                  ? records.length === 0
                    ? (t("relationPicker.emptyTarget") as string)
                    : (t("relationPicker.allLinked") as string)
                  : (t("relationPicker.addPlaceholder") as string)
            }
          />
        </FormControl.Select.Trigger>
        <FormControl.Select.Content>
          {remaining.map((r) => (
            <FormControl.Select.Item key={r.id} value={r.id}>
              {recordLabel(r, targetFields)}
            </FormControl.Select.Item>
          ))}
        </FormControl.Select.Content>
      </FormControl.Select.Root>
    </Box>
  );
}
