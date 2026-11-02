"use client";

// /files — the files section (SDL-623, EP-124). Files stop being a tab of
// collections and become a surface of their own.
//
// Layout is the canvas /design-system/files (SDL-598) case by case:
//   library    — search + type filter, storage bar, preview grid
//   empty      — the drop zone alone, no header action
//   upload     — per-file queue with progress + compact drop zone
//   details    — one file: type, size, visibility, public link, actions —
//                a side panel over the library (EP-186, pattern 3b), so the
//                library stays visible
//   visibility — public vs private, shown before the flip is confirmed, in
//                the same panel
//   delete     — a dialog before EVERY delete (SDL-650): the live links
//                from the usage read (or a 409) and a checkbox when used
//   replace    — SDL-652: «Replace» in the details picks the new file in
//                the shared FilesPickerDialog (library or upload), lists the
//                live places (same list as delete), replaces through
//                files-service and shows the outcome per place; when the
//                original has no live place left, offers the delete dialog
//   quota      — the same storage bar + destructive alert near the limit
//
// The library itself (list, search, filter, previews, upload queue, storage
// bar) is widgets/files/files-library.tsx since SDL-624 — the pages image
// picker renders the same component. This page keeps the header, the upload
// button, the file panel (details / visibility) and the delete dialog.
//
// Scope: files-service is scoped by the workspace (gateway G2, SDL-617), so
// the section reads the collections scope (?ws=). A collection's «Files»
// button lands here with its own workspace, and its image field picks from
// this same library (SDL-625). There is no project level in the UI (SDL-621).

import { takeQueryParam } from "@/shared/lib/query-param";
import * as React from "react";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import * as UI from "@markerloop/ui/ui";
import { SectionHeader } from "@/shared/components/section-header";
import { ItemPanel, ItemPanelFrame } from "@/shared/components/item-panel";

import { useLocale, useTranslations } from "@/shared/hooks";
import { NoWorkspaceState, useCollectionsScope } from "@/features/collections-switchers";
import { useFileLinkLabels } from "@/features/pages-media";
import {
  fileInUseLinks,
  fileKeys,
  fileScope,
  fileUrlQuery,
  isDeliverableFileUrl,
  useDeleteFile,
  useReplaceFile,
  useFile,
  useFileURL,
  useFileLinks,
  useFilesDeliveryBase,
  usePatchFile,
  type FileLink,
  type FileScope,
  type StoredFile,
} from "@/entities/files";
import {
  DeleteFileDialog,
  FileDetails,
  FileName,
  FilePickerInput,
  FilesGridSkeleton,
  FilesLibrary,
  FilesMessage,
  FilesPickerDialog,
  ReplaceFileDialog,
  VisibilityCompare,
  fileKind,
  usageAsLink,
  filesErrorMessage,
  useFileUploads,
  type FilesLibrarySummary,
  type ReplaceStage,
} from "@/widgets/files";
import { recordKeys } from "@/entities/collections/record";
import { pagesKeys } from "@/entities/pages";
import type { ReplaceFileResult } from "@/entities/files";

export const dynamic = "force-dynamic";

type Mode =
  | { kind: "library" }
  | { kind: "details"; file: StoredFile }
  | { kind: "visibility"; file: StoredFile };

const NO_SUMMARY: FilesLibrarySummary = { loaded: false, empty: false, nearQuota: false };

export default function FilesPage() {
  const t = useTranslations("files");
  const { locale } = useLocale();
  const qc = useQueryClient();
  const { workspacesQuery, selectedWorkspace } = useCollectionsScope();
  const workspaceId = selectedWorkspace?.id ?? null;
  const scope = React.useMemo<FileScope | null>(
    () => fileScope(workspaceId),
    [workspaceId]
  );

  const [mode, setMode] = React.useState<Mode>({ kind: "library" });
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<FilesLibrarySummary>(NO_SUMMARY);
  const pickerRef = React.useRef<HTMLInputElement>(null);
  const uploads = useFileUploads(scope, () => {
    setActionError(null);
    setMode({ kind: "library" });
  });
  const resetUploads = uploads.reset;

  // A new workspace is a new library; an open file from the old one is stale.
  React.useEffect(() => {
    setMode({ kind: "library" });
    setDeleteOpen(false);
    resetUploads();
    setSummary(NO_SUMMARY);
  }, [workspaceId, resetUploads]);

  // A file found in the search palette (EP-157) lands as ?file=<id>: read it
  // once, open its details when it loads, drop it from the address.
  const [fileParam, setFileParam] = React.useState<string | null>(null);
  React.useEffect(() => {
    const id = takeQueryParam("file");
    if (id) setFileParam(id);
  }, []);
  const fromSearch = useFile(fileParam, scope);
  const openedFromSearch = React.useRef(false);
  React.useEffect(() => {
    if (openedFromSearch.current || !fromSearch.data) return;
    openedFromSearch.current = true;
    setMode({ kind: "details", file: fromSearch.data });
  }, [fromSearch.data]);

  const openFile = mode.kind === "library" ? null : mode.file;
  const openUrl = useFileURL(openFile?.id ?? null, scope);
  // «Where used» (SDL-649) — also what the delete dialog lists. A 409 on
  // delete wins over it: the index syncs after a record is saved and may lag.
  const linksQuery = useFileLinks(openFile?.id ?? null, scope);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [conflictLinks, setConflictLinks] = React.useState<FileLink[] | null>(null);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  // Replace (SDL-652): the picker, then the dialog with its two stages.
  const [replacePickOpen, setReplacePickOpen] = React.useState(false);
  const [replaceOpen, setReplaceOpen] = React.useState(false);
  const [replacement, setReplacement] = React.useState<StoredFile | null>(null);
  const [replaceResult, setReplaceResult] = React.useState<ReplaceFileResult | null>(null);
  const [replaceError, setReplaceError] = React.useState<string | null>(null);
  const knownLinks = conflictLinks ?? linksQuery.data?.links ?? null;
  // The replace outcome names its places too, and by then the original's own
  // links no longer hold them (they moved to the new file) — so the names
  // are looked up over both.
  const describedLinks = React.useMemo(
    () =>
      replaceResult
        ? [...(knownLinks ?? []), ...replaceResult.usages.map((u) => usageAsLink(u, replaceResult.file_id))]
        : knownLinks,
    [knownLinks, replaceResult]
  );
  const describeLink = useFileLinkLabels(describedLinks, workspaceId);
  // Another file or workspace: the previous file's 409 links and an open
  // dialog belong to it, not to this one.
  const openFileId = openFile?.id ?? null;
  React.useEffect(() => {
    setConflictLinks(null);
    setDeleteOpen(false);
    setDeleteError(null);
    setReplacePickOpen(false);
    setReplaceOpen(false);
    setReplacement(null);
    setReplaceResult(null);
    setReplaceError(null);
  }, [openFileId, workspaceId]);
  // Absolute or nothing: the same query every other screen reads, resolved
  // against the delivery host the product shell provides (SDL-624).
  const openRaw = openUrl.data?.url;
  const openHref = isDeliverableFileUrl(openRaw) ? openRaw : undefined;
  const deliveryBase = useFilesDeliveryBase();
  const patch = usePatchFile(scope);
  const remove = useDeleteFile(scope);
  const replace = useReplaceFile(scope);

  const dateFmt = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale]
  );

  /* ---------------------------------------------------------- upload */

  /* --------------------------------------------------------- actions */

  // A fresh URL through the shared query (a private file's signature must not
  // be a cached one). A public file answers the relative /files/<id>, which
  // fileUrlQuery puts on the delivery host; without the host it stays
  // relative and would land in the protected /files section of this very
  // admin, so nothing is opened — the details card then disables the button
  // and says why.
  const download = async (file: StoredFile) => {
    if (!scope) return;
    try {
      const { url } = await qc.fetchQuery({ ...fileUrlQuery(file.id, scope, deliveryBase), staleTime: 0 });
      if (!isDeliverableFileUrl(url)) return;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setActionError(filesErrorMessage(e));
    }
  };

  const confirmVisibility = async (file: StoredFile) => {
    setActionError(null);
    try {
      const next = await patch.mutateAsync({ id: file.id, payload: { is_public: !file.is_public } });
      void qc.invalidateQueries({ queryKey: fileKeys.url(file.id) });
      setMode({ kind: "details", file: next ?? { ...file, is_public: !file.is_public } });
    } catch (e) {
      setActionError(filesErrorMessage(e));
    }
  };

  // The dialog re-reads the usages on every open and waits for the answer:
  // force must never go out over links the person has not seen.
  const askDelete = () => {
    setConflictLinks(null);
    setDeleteError(null);
    void linksQuery.refetch();
    setDeleteOpen(true);
  };

  const closeDelete = () => {
    setDeleteOpen(false);
    setConflictLinks(null);
    setDeleteError(null);
  };

  // `force` only after the dialog: it is sent whenever a link is known, the
  // same flag the old «delete anyway» sent. Without it files-service answers
  // 409 when the index knows more than the read did — the dialog then lists
  // those links and asks for the checkbox; nothing is deleted meanwhile.
  const tryDelete = async (file: StoredFile, force: boolean) => {
    setDeleteError(null);
    try {
      await remove.mutateAsync({ id: file.id, force });
      setDeleteOpen(false);
      setMode({ kind: "library" });
    } catch (e) {
      const links = fileInUseLinks(e);
      if (links) {
        setConflictLinks(links);
        return;
      }
      setDeleteError(filesErrorMessage(e));
    }
  };

  // Replace, step 1: the one picker (library or upload). The file being
  // replaced is ringed and cannot be its own replacement.
  const askReplace = () => {
    setReplaceError(null);
    setReplaceResult(null);
    setReplacePickOpen(true);
  };

  // Step 2: the places. The usages are re-read on every open, as for delete —
  // the confirm button waits for the answer.
  const pickReplacement = (file: StoredFile, original: StoredFile) => {
    // The picker refuses the original itself (rejectId) — a click on it or
    // an upload deduplicated to it; this guard only backs that up.
    if (file.id === original.id) return;
    setReplacement(file);
    setReplacePickOpen(false);
    setReplaceResult(null);
    setReplaceError(null);
    void linksQuery.refetch();
    setReplaceOpen(true);
  };

  // Only closes: the dialog stays mounted with its replacement so it leaves
  // with its animation, as the delete dialog does. The next pick resets the
  // result and the error (pickReplacement), a new file resets everything.
  const closeReplace = () => {
    setReplaceOpen(false);
  };

  // Step 3: one call; files-service walks the live places. Record and page
  // caches are dropped wholesale so the record panel and the editor read the
  // new value, not a cached body from before the replace.
  const runReplace = async (original: StoredFile, withFile: StoredFile) => {
    setReplaceError(null);
    try {
      const res = await replace.mutateAsync({ id: original.id, withId: withFile.id });
      setReplaceResult(res);
      void qc.invalidateQueries({ queryKey: recordKeys.all });
      void qc.invalidateQueries({ queryKey: pagesKeys.all });
    } catch (e) {
      setReplaceError(filesErrorMessage(e));
    }
  };

  // The offer after the replace: the ordinary SDL-650 delete dialog.
  const deleteAfterReplace = () => {
    closeReplace();
    askDelete();
  };

  const replaceStage: ReplaceStage = replaceResult ? "result" : "confirm";
  const remainingLive = replaceResult
    ? linksQuery.isFetching || !linksQuery.data
      ? null
      : linksQuery.data.links.filter((l) => l.source !== "history").length
    : null;

  /* ------------------------------------------------------------ body */

  const busy = patch.isPending || remove.isPending || replace.isPending;
  const empty = summary.empty;

  const body = (() => {
    if (workspacesQuery.isLoading) {
      return <FilesGridSkeleton />;
    }
    if (workspacesQuery.error instanceof Error) {
      return <FilesMessage title={t("errors.load")}>{workspacesQuery.error.message}</FilesMessage>;
    }
    if (!workspaceId || !scope) {
      return <NoWorkspaceState />;
    }

    return null;
  })();

  // The open file is a side panel over the library (EP-186, pattern 3b): the
  // library stays on screen and keeps its search and type filter through
  // details → visibility → delete and back. While the panel slides out, it
  // keeps drawing the file it was showing.
  const lastPanelMode = React.useRef<Exclude<Mode, { kind: "library" }> | null>(null);
  if (mode.kind !== "library") lastPanelMode.current = mode;
  const panelMode = mode.kind !== "library" ? mode : lastPanelMode.current;
  const closePanel = () => setMode({ kind: "library" });

  const panel = panelMode ? (
    panelMode.kind === "details" ? (
      <FileDetails
        file={panelMode.file}
        previewSrc={openHref}
        publicUrl={panelMode.file.is_public ? openUrl.data?.url : undefined}
        addedLabel={dateFmt.format(new Date(panelMode.file.created_at))}
        onClose={closePanel}
        onDownload={() => void download(panelMode.file)}
        onToggleVisibility={() => setMode({ kind: "visibility", file: panelMode.file })}
        onDelete={askDelete}
        onReplace={askReplace}
        busy={busy}
        usage={
          linksQuery.data
            ? { status: "ready", links: linksQuery.data.links }
            : linksQuery.isError
              ? { status: "error" }
              : { status: "loading" }
        }
        describe={describeLink}
      />
    ) : (
      <ItemPanelFrame
        title={<FileName file={panelMode.file} className="block text-base" />}
        titleAttr={panelMode.file.filename ?? undefined}
        description={t("intro.visibility")}
        onClose={() => setMode({ kind: "details", file: panelMode.file })}
        closeLabel={t("details.close")}
        closeTestId="details-close"
      >
        <VisibilityCompare
          stacked
          fileId={panelMode.file.id}
          target={panelMode.file.is_public ? "private" : "public"}
          onCancel={() => setMode({ kind: "details", file: panelMode.file })}
          onConfirm={() => void confirmVisibility(panelMode.file)}
          busy={busy}
        />
      </ItemPanelFrame>
    )
  ) : null;

  const libraryReady = !!scope && !workspacesQuery.isLoading && !(workspacesQuery.error instanceof Error);

  const intro =
    mode.kind === "details"
      ? t("intro.details")
      : mode.kind === "visibility"
        ? t("intro.visibility")
        : empty
            ? t("intro.empty")
            : uploads.rows.length > 0
              ? t("intro.upload")
              : summary.nearQuota
                ? t("intro.quota")
                : t("intro.library");

  return (
    <UI.Box direction="column" gap={5} data-testid="files-section">
      <SectionHeader
        title={t("title")}
        description={intro}
        actions={
          workspaceId && !empty && summary.loaded ? (
            <UI.Button data-testid="files-upload" onClick={() => pickerRef.current?.click()}>
              <Upload size={16} aria-hidden="true" />
              {t("upload.action")}
            </UI.Button>
          ) : undefined
        }
      />
      <FilePickerInput ref={pickerRef} onFiles={(f) => void uploads.run(f)} testId="files-upload-input" />
      {actionError ? (
        <UI.Alert variant="destructive" data-testid="files-action-error">
          <UI.Text as="span" size="sm">
            {actionError}
          </UI.Text>
        </UI.Alert>
      ) : null}
      {body}
      {mode.kind === "details" ? (
        <DeleteFileDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            if (remove.isPending) return;
            if (open) setDeleteOpen(true);
            else closeDelete();
          }}
          file={mode.file}
          links={knownLinks ?? []}
          linksLoading={!conflictLinks && (linksQuery.isPending || linksQuery.isFetching)}
          describe={describeLink}
          busy={remove.isPending}
          error={deleteError}
          onCancel={closeDelete}
          onConfirm={(force) => void tryDelete(mode.file, force)}
        />
      ) : null}
      {mode.kind === "details" ? (
        <FilesPickerDialog
          scope={scope}
          open={replacePickOpen}
          onOpenChange={setReplacePickOpen}
          onPick={(file) => pickReplacement(file, mode.file)}
          selectedId={mode.file.id}
          pickUploaded
          accept={fileKind(mode.file) === "image" ? "image" : "any"}
          rejectId={mode.file.id}
          rejectMessage={t("replace.sameFile")}
          title={t("replace.pickTitle")}
          description={t("replace.pickDescription", { name: mode.file.filename ?? t("untitledFile") })}
        />
      ) : null}
      {mode.kind === "details" && replacement ? (
        <ReplaceFileDialog
          open={replaceOpen}
          onOpenChange={(open) => {
            if (replace.isPending) return;
            if (open) setReplaceOpen(true);
            else closeReplace();
          }}
          original={mode.file}
          replacement={replacement}
          stage={replaceStage}
          links={linksQuery.data?.links ?? []}
          linksLoading={replaceStage === "confirm" && (linksQuery.isPending || linksQuery.isFetching)}
          linksError={replaceStage === "confirm" && linksQuery.isError}
          onReloadLinks={() => void linksQuery.refetch()}
          describe={describeLink}
          busy={replace.isPending}
          error={replaceError}
          result={replaceResult}
          remainingLive={remainingLive}
          onCancel={closeReplace}
          onConfirm={() => void runReplace(mode.file, replacement)}
          onRetry={() => void runReplace(mode.file, replacement)}
          onChooseOther={() => {
            setReplaceOpen(false);
            setReplacePickOpen(true);
          }}
          onDeleteOriginal={deleteAfterReplace}
        />
      ) : null}
      <ItemPanel
        open={mode.kind !== "library"}
        onClose={closePanel}
        ariaLabel={panelMode?.file.filename ?? t("untitledFile")}
        width="lg"
        testId="file-panel"
      >
        {panel}
      </ItemPanel>
      {libraryReady && scope ? (
        <div data-testid="files-library-host">
          <FilesLibrary
            scope={scope}
            uploads={uploads}
            variant="section"
            onOpen={(file) => setMode({ kind: "details", file })}
            onSummary={setSummary}
          />
        </div>
      ) : null}
    </UI.Box>
  );
}
