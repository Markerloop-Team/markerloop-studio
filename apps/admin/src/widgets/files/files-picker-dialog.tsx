"use client";

// The one image picker over the workspace files library (SDL-625). The
// pages `src` editor and the collections `image` field open this same
// dialog, which renders the same <FilesLibrary variant="picker"> the /files
// section renders — one answer to «where are the pictures», not three.
//
// The dialog only reports the picked file; how it is stored is the caller's
// wire format (pages write `mlfile:<uuid>`, collections the bare id).
//
// `pickUploaded`: an image uploaded from the picker IS the pick — the
// collections field has always behaved so (SDL-360); pages keep their
// click-to-pick. `selectedId` rings the file the field points at now.
//
// `accept`: the image fields take images only (the default); «Replace file»
// (SDL-652) takes any kind when the file it replaces is not an image — the
// orchestrator and the place owners refuse a kind the place cannot hold.
// `title`/`description` let that host say what the pick is for.
// `rejectId`: a file that may not be picked (the one being replaced) — a
// click on it, or an upload the workspace dedup resolves to it, shows a
// notice and keeps the dialog open for the next pick.

import * as React from "react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import type { FileScope, StoredFile } from "@/entities/files";

import { FilesLibrary, FilesMessage, useFileUploads } from "./files-library";
import { fileKind } from "./files-parts";

export function FilesPickerDialog({
  scope,
  open,
  onOpenChange,
  onPick,
  selectedId = null,
  pickUploaded = false,
  accept = "image",
  title,
  description,
  rejectId = null,
  rejectMessage,
}: {
  /** Null until the workspace is known: the dialog then says why it is empty. */
  scope: FileScope | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (file: StoredFile) => void;
  selectedId?: string | null;
  pickUploaded?: boolean;
  accept?: "image" | "any";
  title?: string;
  description?: string;
  rejectId?: string | null;
  rejectMessage?: string;
}) {
  const t = useTranslations("files.picker");
  const [notImage, setNotImage] = React.useState(false);
  const [rejected, setRejected] = React.useState(false);

  // One pick per visit: the first ready image of an upload batch is picked
  // and closes the dialog; later files of the batch only land in the library.
  const openRef = React.useRef(open);
  React.useEffect(() => {
    openRef.current = open;
  }, [open]);
  const choose = (file: StoredFile) => {
    if (rejectId && file.id === rejectId) {
      setNotImage(false);
      setRejected(true);
      return;
    }
    if (accept === "image" && fileKind(file) !== "image") {
      setRejected(false);
      setNotImage(true);
      return;
    }
    setNotImage(false);
    setRejected(false);
    onPick(file);
  };
  const uploads = useFileUploads(scope, undefined, (file) => {
    if (!pickUploaded || !openRef.current) return;
    if (accept === "image" && fileKind(file) !== "image") return;
    // The same bytes deduplicated back to the rejected file: say so and keep
    // the visit open — the next upload of the batch may still be the pick.
    if (rejectId && file.id === rejectId) {
      setRejected(true);
      return;
    }
    openRef.current = false;
    choose(file);
  });

  return (
    <UI.Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // A «not an image» / «same file» notice belongs to one visit of the picker.
        setNotImage(false);
        setRejected(false);
        onOpenChange(next);
      }}
    >
      <UI.Dialog.Content maxWidth={960} data-testid="media-picker">
        <UI.Dialog.Header>
          <UI.Dialog.Title>{title ?? t("title")}</UI.Dialog.Title>
          <UI.Dialog.Description>{description ?? t("description")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <UI.Box direction="column" gap={3} className="max-h-[70dvh] overflow-y-auto">
          {notImage ? (
            <UI.Alert data-testid="media-picker-not-image">
              <UI.Text as="span" size="sm">
                {t("notImage")}
              </UI.Text>
            </UI.Alert>
          ) : null}
          {rejected ? (
            <UI.Alert data-testid="media-picker-rejected">
              <UI.Text as="span" size="sm">
                {rejectMessage ?? t("notImage")}
              </UI.Text>
            </UI.Alert>
          ) : null}
          {scope ? (
            <FilesLibrary
              scope={scope}
              uploads={uploads}
              variant="picker"
              selectedId={selectedId}
              onOpen={choose}
            />
          ) : (
            <FilesMessage title={t("noLibrary")}>{t("noLibraryHint")}</FilesMessage>
          )}
        </UI.Box>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}
