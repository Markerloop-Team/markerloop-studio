"use client";

// CollectionCreateForm — minimal form to create a new collection.
//
// Opens from the "+ New collection" button next to the CollectionsList
// header. Once created, the page selects the new collection so the user
// lands in SchemaEditor straight away.

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Alert, Button, FormControl } from "@markerloop/ui/ui";

import { ItemPanelFrame } from "@/shared/components/item-panel";

// Auto-derive the immutable `key` from the human name. Anything outside
// `[a-z0-9_]` becomes `_`, runs of `_` collapse, leading non-letter
// chars get prefixed with `_` so the regex `^[a-z][a-z0-9_]*$` we
// validate against still passes. Empty/short names produce empty strings
// so the user is forced to type a real name first.
function deriveKey(name: string): string {
  const lower = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const cleaned = lower
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!cleaned) return "";
  return /^[a-z]/.test(cleaned) ? cleaned : "_" + cleaned;
}

export interface CollectionCreateFormSubmit {
  key: string;
  name: string;
  icon?: string;
}

export interface CollectionCreateFormProps {
  onSubmit: (payload: CollectionCreateFormSubmit) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  /** More under the fields — the limit refusal with its /rules link. */
  extra?: ReactNode;
  labels?: {
    title?: string;
    name?: string;
    key?: string;
    icon?: string;
    create?: string;
    creating?: string;
    cancel?: string;
    keyHint?: string;
  };
}

export function CollectionCreateForm(
  props: CollectionCreateFormProps
): ReactNode {
  const {
    onSubmit,
    onCancel,
    isSubmitting = false,
    error = null,
    extra = null,
    labels = {},
  } = props;
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const keyDirtyRef = useRef(false);

  // Auto-derive key from name until the user explicitly edits the key
  // field. This is the difference between "form silently disabled and
  // I don't know why" and "form just works"; the original UX assumed
  // the user knows the key invariant up-front.
  useEffect(() => {
    if (keyDirtyRef.current) return;
    setKey(deriveKey(name));
  }, [name]);

  const valid =
    key.trim() !== "" &&
    name.trim() !== "" &&
    /^[a-z][a-z0-9_]*$/.test(key.trim());

  // The admin's one item panel (EP-186, pattern 3b). SDL-460: a three-field
  // form; the footer follows the fields (`follow`) instead of sitting at the
  // bottom of a full-height panel with ~600px of nothing in between.
  return (
    <ItemPanelFrame
      as="form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        await onSubmit({
          key: key.trim(),
          name: name.trim(),
          icon: icon.trim() || undefined,
        });
      }}
      title={labels.title ?? "New collection"}
      footerPlacement="follow"
      footerProps={{ "data-collection-create-actions": "" }}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {labels.cancel ?? "Cancel"}
          </Button>
          <Button type="submit" disabled={isSubmitting || !valid}>
            {isSubmitting
              ? labels.creating ?? "Creating…"
              : labels.create ?? "Create"}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3.5">
        <FormControl.Field label={labels.name ?? "Name"}>
          <FormControl.Input
            type="text"
            value={name}
            disabled={isSubmitting}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </FormControl.Field>
        <FormControl.Field
          label={labels.key ?? "Key"}
          hint={
            labels.keyHint ?? "Lower snake_case. Immutable after creation."
          }
        >
          <FormControl.Input
            type="text"
            value={key}
            disabled={isSubmitting}
            onChange={(e) => {
              keyDirtyRef.current = true;
              setKey(e.target.value);
            }}
            placeholder="lower_snake_case"
          />
        </FormControl.Field>
        <FormControl.Field label={labels.icon ?? "Icon (optional)"}>
          <FormControl.Input
            type="text"
            value={icon}
            disabled={isSubmitting}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="📁 / lucide name / URL"
          />
        </FormControl.Field>

        {error ? (
          <Alert variant="destructive" className="whitespace-pre-wrap">
            {error}
          </Alert>
        ) : null}
        {extra}
      </div>
    </ItemPanelFrame>
  );
}
