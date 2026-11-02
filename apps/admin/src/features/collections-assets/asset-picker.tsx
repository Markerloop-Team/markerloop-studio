"use client";

// Asset picker (EP-25 Ф8) — Markerloop's renderer for the `image` field
// type, registered over the module default (a plain URL input) through
// the field-type registry, the same extension point the relation picker
// uses.
//
// Wire format. The stored value stays a **string**: either a file id
// (what the picker writes) or a URL (what the old input wrote and what
// hand-edited records still carry). Both must keep working — changing
// the field type's value shape would silently invalidate every record
// saved before this shipped, and collections-service resolves a stored
// id into a URL on read (Ф6) precisely so the record keeps holding the
// id rather than a link that expires.
//
// Library (SDL-625). There is no collections-owned file library any more:
// «Choose» opens the same <FilesPickerDialog> the pages editor opens — the
// workspace library of the /files section. The files scope is derived from
// the collection's workspace (CurrentWorkspaceProvider, the context the
// relation picker reads too) through the same fileScope() /files uses;
// outside that provider there is no workspace, so the picker degrades to
// the plain URL input rather than rendering a browser it cannot fill.

import { useMemo, useState, type ReactNode } from "react";

import { Box, Button, FormControl, Text } from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { fileScope, isDeliverableFileUrl, useFile, useFileURL } from "@/entities/files";
import { useCurrentWorkspace } from "@/entities/collections/workspace";
import {
  defaultImageInput,
  type FieldFormInputProps,
} from "@/widgets/collections";
import { FilesPickerDialog } from "@/widgets/files";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A stored value that is a file id rather than a URL typed by hand. */
export function isFileId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function AssetPickerInput(props: FieldFormInputProps): ReactNode {
  const t = useTranslations("collections");
  const { workspaceId } = useCurrentWorkspace();
  const scope = useMemo(() => fileScope(workspaceId), [workspaceId]);
  const [browsing, setBrowsing] = useState(false);

  const value = typeof props.value === "string" ? props.value : "";
  const fileId = isFileId(value) ? value : null;

  const fileQuery = useFile(fileId, scope);
  const urlQuery = useFileURL(fileId, scope);

  if (!scope) {
    // No scope, no library. The default keeps the field editable.
    return defaultImageInput(props);
  }

  // Absolute only: a public file's /files/<id> is put on the delivery host by
  // fileUrlQuery, with the host the product shell provides (SDL-624).
  const previewUrl = urlQuery.data?.url ?? null;
  const canRenderPreview = isDeliverableFileUrl(previewUrl);

  return (
    <Box direction="column" gap={2} data-collections-asset-picker="">
      {fileId ? (
        <Box
          direction="row"
          align="center"
          gap={3}
          className="rounded-md border border-border p-2"
          data-collections-asset-picker-value={fileId}
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
            {canRenderPreview ? (
              <img
                src={previewUrl}
                alt={fileQuery.data?.filename ?? fileId}
                className="h-full w-full object-contain"
              />
            ) : (
              <Text as="span" size="xs" variant="meta">
                {fileQuery.isLoading ? "…" : t("assetsNoPreview")}
              </Text>
            )}
          </div>
          <Box direction="column" gap={0} className="min-w-0">
            <Text as="span" size="xs" className="truncate">
              {fileQuery.data?.filename ?? fileId}
            </Text>
            <Text as="span" size="xs" variant="meta">
              {fileQuery.data?.mime ?? ""}
            </Text>
          </Box>
        </Box>
      ) : value !== "" ? (
        // A legacy URL value: keep it visible and editable exactly as
        // before, so records written by the old input stay workable.
        <FormControl.Input
          id={props.inputId}
          type="text"
          disabled={props.disabled}
          value={value}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : null}

      <Box direction="row" gap={2}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.disabled}
          onClick={() => setBrowsing(true)}
          data-collections-asset-picker-browse=""
        >
          {fileId || value ? t("assetsReplace") : t("assetsChoose")}
        </Button>
        {value !== "" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={props.disabled}
            onClick={() => props.onChange("")}
            data-collections-asset-picker-clear=""
          >
            {t("clear")}
          </Button>
        ) : null}
      </Box>

      <FilesPickerDialog
        scope={scope}
        open={browsing}
        onOpenChange={setBrowsing}
        selectedId={fileId}
        // Uploading from the record form is picking: the new file lands in
        // the field at once, as it did before SDL-625.
        pickUploaded
        onPick={(file) => {
          // The bare id, as before: collections-service resolves it into a
          // URL on read, so the record never holds an expiring link.
          props.onChange(file.id);
          setBrowsing(false);
        }}
      />
    </Box>
  );
}
