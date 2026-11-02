"use client";

// The `src` row of the properties panel (SDL-624 §6.2): an image comes from
// the workspace's files library, not from a path typed by hand.
//
//   - «Choose from library» opens the SAME <FilesPickerDialog> the
//     collections image field opens — <FilesLibrary variant="picker"> of the
//     /files section (images first, upload right there; SDL-625); a card
//     click writes `mlfile:<uuid>` — the reference pages-service registers as
//     a file link and the engine resolves through `context.file`.
//   - an `https://…` address can still be typed; anything else (`/x.png`,
//     `data:`, `http://`) is not saved and the row says why — pages-service
//     would answer 422 on it anyway (isAllowedMediaSrc is the same rule).
//
// `makeImageSrcEditor(scope)` returns the PropEditor the studio calls as a
// plain function; hooks live only inside <ImageSrcField>, which it renders.
// No UI.Field.* here: the picker is a dialog, and Field.* inside a dialog
// needs a FormProvider (the known trap) that a single input does not.

import * as React from "react";
import { ImageIcon, X } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { isAllowedMediaSrc, parseFileRef, toFileRef } from "@markerloop/engine";
import type { PropEditor, PropEditorContext } from "@markerloop/studio";

import { useTranslations } from "@/shared/hooks";
import { useFile, useFileURL, type FileScope, type StoredFile } from "@/entities/files";
import { FilePreview, FilesPickerDialog } from "@/widgets/files";

/** What a picked library file is written as — never the bare id. */
export function refForPickedFile(file: Pick<StoredFile, "id">): string {
  return toFileRef(file.id);
}

export function ImageSrcField({ ctx, scope }: { ctx: PropEditorContext; scope: FileScope | null }) {
  const t = useTranslations("pages.media");
  const value = typeof ctx.value === "string" ? ctx.value : "";
  const fileId = parseFileRef(value);
  const [open, setOpen] = React.useState(false);
  // The typed text is kept together with the stored value it was typed
  // against: the panel is reused across nodes, and a draft typed for one
  // node must never show up on another (or survive an outside change). When
  // the stored value moves on, the draft falls back to that value.
  const [typed, setTyped] = React.useState<{ text: string; forValue: string } | null>(null);
  const draft = typed && typed.forValue === value ? typed.text : fileId ? "" : value;
  const setDraft = (text: string, forValue: string) => setTyped({ text, forValue });

  const file = useFile(fileId, scope);
  const url = useFileURL(fileId, scope);
  // useFileURL answers an absolute URL already (entities/files fileUrlQuery).
  const previewSrc = fileId
    ? url.data?.url
    : value && isAllowedMediaSrc(value)
      ? value
      : undefined;

  const invalid = draft.trim() !== "" && !isAllowedMediaSrc(draft.trim());
  const inputId = `prop-${ctx.fieldName}`;

  return (
    <UI.Box direction="column" gap={2} data-testid="media-src-field" data-sauna-prop={ctx.fieldName}>
      <UI.Text as="label" htmlFor={inputId} size="sm" weight="medium">
        {t("label")}
      </UI.Text>

      {value ? (
        <UI.Box direction="column" gap={1}>
          <FilePreview kind="image" src={previewSrc} alt={file.data?.filename ?? ""} />
          <UI.Text size="xs" variant="muted" className="truncate" data-testid="media-src-name">
            {fileId
              ? (file.data?.filename ??
                (file.isLoading ? t("loading") : file.isError ? t("fileMissing") : t("fromLibrary")))
              : value}
          </UI.Text>
        </UI.Box>
      ) : null}

      <UI.Box direction="row" gap={2} wrap>
        <UI.Button
          type="button"
          size="sm"
          variant="outline"
          disabled={ctx.disabled}
          onClick={() => setOpen(true)}
          data-testid="media-choose"
        >
          <ImageIcon size={14} aria-hidden="true" />
          {value ? t("replace") : t("choose")}
        </UI.Button>
        {value ? (
          <UI.Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={ctx.disabled}
            onClick={() => {
              setDraft("", "");
              ctx.onChange(undefined);
            }}
            data-testid="media-clear"
          >
            <X size={14} aria-hidden="true" />
            {t("clear")}
          </UI.Button>
        ) : null}
      </UI.Box>

      <UI.FormControl.Input
        id={inputId}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
        placeholder={t("urlPlaceholder")}
        value={draft}
        disabled={ctx.disabled}
        aria-invalid={invalid || undefined}
        data-testid="media-src-input"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const next = e.target.value;
          const trimmed = next.trim();
          // An invalid address is never written: the service would refuse
          // the whole save with 422. The draft is tied to the value it will
          // leave stored, so the next render still shows what was typed.
          if (trimmed === "") {
            setDraft(next, "");
            ctx.onChange(undefined);
          } else if (isAllowedMediaSrc(trimmed)) {
            setDraft(next, trimmed);
            ctx.onChange(trimmed);
          } else {
            setDraft(next, value);
          }
        }}
      />
      {invalid ? (
        <UI.Text as="span" size="xs" variant="muted" data-testid="media-src-invalid">
          {t("invalid")}
        </UI.Text>
      ) : null}

      <FilesPickerDialog
        scope={scope}
        open={open}
        onOpenChange={setOpen}
        onPick={(picked) => {
          ctx.onChange(refForPickedFile(picked));
          setOpen(false);
        }}
      />
    </UI.Box>
  );
}

/** The `src` PropEditor for one files scope. */
export function makeImageSrcEditor(scope: FileScope | null): PropEditor {
  const ImageSrcEditor: PropEditor = (ctx) => <ImageSrcField ctx={ctx} scope={scope} />;
  return ImageSrcEditor;
}
