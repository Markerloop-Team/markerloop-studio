"use client";

// RecordForm — auto-generated form for one record in a collection.
//
// Every input is routed through the field-type registry, so a
// renderer can be replaced per field type without touching this file.
//
// Validation stays pragmatic — backend is source of truth, the form
// is permissive on edge cases. JSON fields keep an inline error path
// since malformed JSON cannot be reasonably recovered server-side.
//
// Optimistic concurrency: PATCH /records/:id requires `version`. The
// caller passes the active record; on submit we hand back
// `{data, version}` so the hook layer can include it. The form does
// not own the version — stays a dumb component.

import { Controller, useForm } from "react-hook-form";
import type { ReactNode } from "react";

import { Alert, Button, FormControl, Text } from "@markerloop/ui/ui";

import { ItemPanelFrame, ItemPanelGroup } from "@/shared/components/item-panel";

import {
  getFieldTypeRenderers,
  relationIdsFromValue,
} from "./field-type-registry";
import type {
  CollectionField,
  FieldType,
  CollectionRecord,
} from "./types";

export interface RecordFormSubmit {
  data: Record<string, unknown>;
  version?: number;
}

export interface RecordFormProps {
  fields: readonly CollectionField[];
  record?: CollectionRecord | null;
  onSubmit: (submit: RecordFormSubmit) => void;
  onCancel: () => void;
  onDelete?: () => void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
  error?: string | null;
  labels?: {
    titleCreate?: string;
    titleEdit?: string;
    /** The header's close button; absent = no button (Cancel still closes). */
    close?: string;
    /** Heading of the fields group. */
    fieldsGroup?: string;
    save?: string;
    cancel?: string;
    delete?: string;
    deleting?: string;
    saving?: string;
    required?: string;
    booleanTrue?: string;
    booleanFalse?: string;
    invalidJson?: string;
    richTextSaved?: string;
    richTextFormattingLoss?: string;
  };
}

function defaultForType(type: FieldType): unknown {
  const renderers = getFieldTypeRenderers(type);
  return renderers.defaultValue ?? "";
}

function buildDefaults(
  fields: readonly CollectionField[],
  record?: CollectionRecord | null
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = record?.data?.[f.key];
    if (v === undefined) {
      out[f.key] = defaultForType(f.type);
      continue;
    }
    if (f.type === "date" && typeof v === "string") {
      out[f.key] = v.replace(/Z$/, "").slice(0, 16);
      continue;
    }
    if (f.type === "json" && typeof v !== "string") {
      out[f.key] = JSON.stringify(v, null, 2);
      continue;
    }
    out[f.key] = v;
  }
  return out;
}

/** Exported for smoke:collections (SDL-638 round-trip checks). */
export function coerceForSubmit(
  fields: readonly CollectionField[],
  raw: Record<string, unknown>
): { data: Record<string, unknown> } | { jsonError: { key: string; name: string } } {
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    const v = raw[f.key];
    switch (f.type) {
      case "boolean":
        data[f.key] = !!v;
        break;
      case "number":
        if (v === "" || v === null || v === undefined) {
          data[f.key] = null;
        } else {
          const n = typeof v === "number" ? v : Number(v);
          data[f.key] = Number.isNaN(n) ? null : n;
        }
        break;
      case "date":
        if (typeof v === "string" && v) {
          data[f.key] = new Date(v).toISOString();
        } else {
          data[f.key] = null;
        }
        break;
      case "json":
        if (typeof v === "string" && v.trim() !== "") {
          try {
            data[f.key] = JSON.parse(v);
          } catch {
            return { jsonError: { key: f.key, name: f.name } };
          }
        } else {
          data[f.key] = null;
        }
        break;
      case "relation": {
        // Wire contract (SDL-170): array of record UUIDs or null. A
        // legacy scalar (pre-picker string input) is folded into a
        // one-element array so an untouched old record still saves.
        const ids =
          typeof v === "string" && v.trim() !== ""
            ? [v.trim()]
            : relationIdsFromValue(v);
        data[f.key] = ids.length > 0 ? ids : null;
        break;
      }
      default:
        data[f.key] = typeof v === "string" ? v : v ?? null;
    }
  }
  return { data };
}

export function RecordForm({
  fields,
  record = null,
  onSubmit,
  onCancel,
  onDelete,
  isSubmitting = false,
  isDeleting = false,
  error = null,
  labels,
}: RecordFormProps): ReactNode {
  const isEdit = !!record;
  const invalidJsonLabel = labels?.invalidJson ?? "Invalid JSON";

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Record<string, unknown>>({
    defaultValues: buildDefaults(fields, record),
    mode: "onSubmit",
  });

  const submit = handleSubmit((raw) => {
    const result = coerceForSubmit(fields, raw);
    if ("jsonError" in result) {
      setError(result.jsonError.key, {
        type: "manual",
        message: invalidJsonLabel,
      });
      return;
    }
    onSubmit({
      data: result.data,
      version: record?.version,
    });
  });

  // The admin's one item panel (EP-186, pattern 3b): the name in the header,
  // the fields as the body, Delete on the left of the footer and Save last on
  // the right. The page puts this frame in ItemPanel.
  return (
    <ItemPanelFrame
      as="form"
      onSubmit={submit}
      data-collections-record-form=""
      title={isEdit ? labels?.titleEdit ?? "Edit record" : labels?.titleCreate ?? "New record"}
      onClose={labels?.close ? onCancel : undefined}
      closeLabel={labels?.close}
      closeTestId="record-panel-close"
      deleteAction={
        isEdit && onDelete ? (
          <Button
            type="button"
            variant="ghost-destructive"
            onClick={onDelete}
            disabled={isDeleting || isSubmitting}
            data-testid="record-delete"
          >
            {isDeleting
              ? labels?.deleting ?? "Deleting…"
              : labels?.delete ?? "Delete"}
          </Button>
        ) : null
      }
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isDeleting}
          >
            {labels?.cancel ?? "Cancel"}
          </Button>
          <Button type="submit" disabled={isSubmitting || isDeleting}>
            {isSubmitting
              ? labels?.saving ?? "Saving…"
              : labels?.save ?? "Save"}
          </Button>
        </>
      }
    >
      <ItemPanelGroup title={labels?.fieldsGroup}>
        <div className="flex min-w-0 flex-col gap-3.5">
          {fields.map((f) => {
            const fieldError = errors[f.key];
            const renderers = getFieldTypeRenderers(f.type);
            return (
              // The control is drawn by the type's renderer inside a
              // Controller, so the wrapper cannot hand it `id`/aria: the id goes
              // to the renderer as `inputId`, and the label points at it.
              <FormControl.Field
                key={f.id}
                id={`collections-field-${f.id}`}
                label={
                  <>
                    {f.name}{" "}
                    <Text as="span" variant="meta">
                      ({f.key})
                    </Text>
                  </>
                }
                error={fieldError?.message ? String(fieldError.message) : null}
              >
                <Controller
                  control={control}
                  name={f.key}
                  render={({ field: rhf }) => (
                    <renderers.FormInput
                      field={f}
                      value={rhf.value}
                      onChange={rhf.onChange}
                      inputId={`collections-field-${f.id}`}
                      disabled={isSubmitting}
                      labels={{
                        booleanTrue: labels?.booleanTrue,
                        booleanFalse: labels?.booleanFalse,
                        richTextSaved: labels?.richTextSaved,
                        richTextFormattingLoss: labels?.richTextFormattingLoss,
                      }}
                    />
                  )}
                />
              </FormControl.Field>
            );
          })}
        </div>
      </ItemPanelGroup>

      {error ? (
        <Alert variant="destructive" className="whitespace-pre-wrap">
          {error}
        </Alert>
      ) : null}
    </ItemPanelFrame>
  );
}
