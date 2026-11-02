"use client";

// The Block (Component) editor (SDL-721, EP-145): one Block opened on its own,
// laid out after the canvas /design-system/blocks/editor — the same three
// tracks as the page editor (outline / canvas / panel). The difference is the
// panel: the Block's parameters — what it hands outwards to every page — are
// a section that is always shown, and «Make a parameter» sits under every
// field of the selected element (SaunaStudio `onParamsChange`).
//
// Data path: the engine's pages-service provider with `kind: "blocks"` —
// GET/PATCH /v1/pages/blocks/{id}?workspace_id=… with `version`; a 409
// `block_version_conflict` becomes SaunaConflictError, the auto-saver freezes
// and the header offers a reload. Nothing is overwritten silently.

import { componentsListHref } from "./page-hrefs";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, FolderInput, History, Pencil } from "lucide-react";
import { useForm } from "react-hook-form";
import { useStore } from "zustand";
import * as UI from "@markerloop/ui/ui";
import { saunaNodeDisplayName, type SaunaParamSpec, type SaunaSchema, type SaunaVersion } from "@markerloop/engine";
import { createPagesServiceProvider } from "@markerloop/engine/providers/pages";
import {
  SaunaHistoryPanel,
  SaunaStudio,
  StudioCanvasControls,
  removeParam,
  updateParam,
  type SaunaComponentLibraryApi,
  type SaunaStudioSection,
  type StudioStore,
} from "@markerloop/studio";

import { useTranslations } from "@/shared/hooks";
import { workspaceTokens } from "@/shared/lib/api/client";
import { getApiBaseUrl } from "@/shared/lib/api/base-url";
import { COMPONENT_STALE_MS, pagesBlockKeys, pagesComponentKeys, useBlocks, usePagesComponentBlocks } from "@/entities/pages";
import { saunaComponentGroups } from "@markerloop/studio";
import { MoveToGroupDialog } from "./component-dialogs";
import type { FileScope } from "@/entities/files";
import { makeImageSrcEditor } from "@/features/pages-media";

import { EditorSaveStatus } from "@/shared/components/save-status";
import { EditorFrame, EditorIconButton, EditorNameMenuButton } from "@/shared/components/editor-frame";
import { ItemPanel } from "@/shared/components/item-panel";
import { pagesApi } from "@/shared/lib/api/pages-client";

import { PAGES_BLOCKS, PAGES_PROPS_MANIFEST } from "./catalog";
import { useEditorAutoSave } from "./editor-autosave";
import { PagesCanvas, createAdminPagesComponentsApi, createPagesEditorStore, useThemeDraftColors } from "./page-editor";

/** The pages-service provider for Blocks of one workspace (workspace token, like the page provider). */
export function createAdminBlocksProvider(workspaceId: string) {
  return createPagesServiceProvider({
    apiBaseUrl: getApiBaseUrl(),
    workspaceId,
    kind: "blocks",
    headers: async () => ({ Authorization: `Bearer ${await workspaceTokens.get(workspaceId)}` }),
  });
}


type Translate = ReturnType<typeof useTranslations>;

/**
 * The confirmation before a parameter goes (canvas `?case=remove`): pages that
 * filled it in keep the value in their Ref, but it stops being shown. Its own
 * component so the body can be rendered without the portal.
 */
export function RemoveParamBody({
  param,
  t,
  onCancel,
  onConfirm,
}: {
  param: SaunaParamSpec;
  t: Translate;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <UI.Box direction="column" gap={4} className="min-w-0" data-testid="block-param-remove-body">
      <UI.Text size="sm">{t("params.remove.body", { name: param.name })}</UI.Text>
      <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
        <UI.Button variant="ghost" onClick={onCancel} data-testid="block-param-remove-cancel">
          {t("params.remove.cancel")}
        </UI.Button>
        <UI.Button variant="destructive" onClick={onConfirm} data-testid="block-param-remove-confirm">
          {t("params.remove.confirm")}
        </UI.Button>
      </UI.Box>
    </UI.Box>
  );
}

/**
 * A typed default from what was typed (SDL-721, canvas `?case=edit`): the
 * spec's `default` follows its `type` (SDL-718). Empty = no default.
 * `null` = the text does not fit the type.
 */
export function parseParamDefault(param: SaunaParamSpec, text: string): SaunaParamSpec["default"] | undefined | null {
  const raw = text.trim();
  if (raw === "") return undefined;
  if (param.type === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (param.type === "boolean") return raw === "true" ? true : raw === "false" ? false : null;
  if (param.type === "select") return (param.options ?? []).includes(raw) ? raw : null;
  return text;
}

type EditValues = { label: string; defaultValue: string };

/** Edit an existing parameter: label and default only — name and type are fixed (pages store values by name). */
function EditParamDialog({
  param,
  t,
  onClose,
  onSave,
  onRemove,
}: {
  param: SaunaParamSpec;
  t: Translate;
  onClose: () => void;
  onSave: (patch: { label?: string; default?: SaunaParamSpec["default"] }) => void;
  onRemove: () => void;
}) {
  const form = useForm<EditValues>({
    defaultValues: { label: param.label ?? "", defaultValue: param.default === undefined ? "" : String(param.default) },
  });
  return (
    <UI.Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <UI.Dialog.Content className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[480px]" data-testid="block-param-edit-dialog">
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title>{t("params.edit.title")}</UI.Dialog.Title>
          <UI.Dialog.Description>{t("params.edit.description")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <UI.Field.Root {...form}>
          <UI.Box
            as="form"
            direction="column"
            gap={4}
            onSubmit={form.handleSubmit((values) => {
              const parsed = parseParamDefault(param, values.defaultValue);
              if (parsed === null) {
                form.setError("defaultValue", { message: t("params.edit.badDefault", { type: param.type ?? "string" }) });
                return;
              }
              const label = values.label.trim();
              onSave({ label: label === "" ? undefined : label, default: parsed });
            })}
            data-testid="block-param-edit-form"
          >
            <UI.Box direction="column" gap={1.5} data-testid="block-param-edit-fixed">
              <UI.Text as="span" size="sm" weight="medium">
                {t("params.edit.name")}
              </UI.Text>
              <UI.Text as="span" size="sm" variant="mono">
                {param.name} · {param.type ?? "string"}
              </UI.Text>
              <UI.Text size="xs" variant="muted">
                {t("params.edit.nameFixed")}
              </UI.Text>
            </UI.Box>
            <UI.Field.Field<EditValues, "label">
              control={form.control}
              name="label"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{t("params.edit.label")}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input {...field} autoComplete="off" data-testid="block-param-edit-label" />
                  </UI.Field.Control>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Field.Field<EditValues, "defaultValue">
              control={form.control}
              name="defaultValue"
              render={({ field }) => (
                <UI.Field.Item>
                  <UI.Field.Label>{t("params.edit.default")}</UI.Field.Label>
                  <UI.Field.Control>
                    <UI.FormControl.Input {...field} autoComplete="off" data-testid="block-param-edit-default" />
                  </UI.Field.Control>
                  <UI.Field.Description>{t("params.edit.defaultHint")}</UI.Field.Description>
                  <UI.Field.Message />
                </UI.Field.Item>
              )}
            />
            <UI.Box direction="row" gap={2} wrap justify="between" fullWidth>
              <UI.Button type="button" variant="ghost-destructive" onClick={onRemove} data-testid="block-param-edit-remove">
                {t("params.remove.action")}
              </UI.Button>
              <UI.Box direction="row" gap={2} wrap justify="end">
                <UI.Button type="button" variant="ghost" onClick={onClose} data-testid="block-param-edit-cancel">
                  {t("params.remove.cancel")}
                </UI.Button>
                <UI.Button type="submit" data-testid="block-param-edit-save">
                  {t("params.edit.save")}
                </UI.Button>
              </UI.Box>
            </UI.Box>
          </UI.Box>
        </UI.Field.Root>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

/** The confirmation dialog before a parameter goes. */
function RemoveParamDialog({
  param,
  t,
  onClose,
  onConfirm,
}: {
  param: SaunaParamSpec;
  t: Translate;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <UI.Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <UI.Dialog.Content className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[480px]" data-testid="block-param-remove-dialog">
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title>
            <UI.Box direction="row" align="center" gap={2}>
              <AlertTriangle size={16} aria-hidden="true" />
              {t("params.remove.title")}
            </UI.Box>
          </UI.Dialog.Title>
          <UI.Dialog.Description>{t("params.remove.description")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <RemoveParamBody param={param} t={t} onCancel={onClose} onConfirm={onConfirm} />
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

/** The Block's parameters, at the top of the panel, shown with or without a selection. */
function BlockParamsList({
  store,
  t,
  onEdit,
  onRemove,
}: {
  store: StudioStore;
  t: Translate;
  onEdit: (param: SaunaParamSpec) => void;
  onRemove: (param: SaunaParamSpec) => void;
}) {
  const schema = useStore(store, (s) => s.schema);
  const params = schema.params ?? [];

  if (params.length === 0) {
    return (
      <UI.Text size="xs" variant="muted" data-testid="block-params-empty">
        {t("params.empty")}
      </UI.Text>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="block-params-list">
      {params.map((param) => {
        const node = schema.nodes[param.nodeId];
        const where = node ? `${saunaNodeDisplayName(node)} · ${param.prop}` : t("params.missingNode", { prop: param.prop });
        return (
          <li key={param.name} className="flex items-start justify-between gap-2" data-testid="block-param-row" data-param={param.name}>
            <button
              type="button"
              className="flex min-w-0 flex-col items-start text-left"
              onClick={() => store.getState().selectNode(param.nodeId)}
              data-testid="block-param-select"
            >
              <UI.Text as="span" size="xs" weight="medium">
                {param.label ? `${param.label} · ` : ""}
                {param.name}
                {param.type ? <span className="text-muted-foreground"> · {param.type}</span> : null}
              </UI.Text>
              <UI.Text as="span" size="xs" variant={node ? "muted" : "destructive"} className="truncate">
                {where}
              </UI.Text>
            </button>
            <UI.Box direction="row" gap={1} className="shrink-0">
              <UI.Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onEdit(param)}
                aria-label={t("params.edit.aria", { name: param.name })}
                data-testid="block-param-edit"
              >
                {t("params.edit.action")}
              </UI.Button>
              <UI.Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onRemove(param)}
                aria-label={t("params.remove.aria", { name: param.name })}
                data-testid="block-param-remove"
              >
                {t("params.remove.action")}
              </UI.Button>
            </UI.Box>
          </li>
        );
      })}
    </ul>
  );
}

export function BlockEditor({
  workspaceId,
  blockId,
  name,
  group = null,
  usageCount,
  fileScope,
  initialSchema,
  initialVersion,
  backHref,
  onReload,
}: {
  workspaceId: string;
  blockId: string;
  name: string;
  /** The Component's group (EP-175); null — no group. */
  group?: string | null;
  /** How many pages place this Component (GET /v1/pages/blocks/{id} `usage`); absent = not known yet. */
  usageCount?: number;
  fileScope: FileScope | null;
  initialSchema: SaunaSchema;
  initialVersion: SaunaVersion;
  backHref: string;
  /** Re-read the Block from the service (conflict recovery, a restored revision). */
  onReload: () => void;
}) {
  const t = useTranslations("pages.blockEditor");
  const tSave = useTranslations("pages.editor");
  const queryClient = useQueryClient();
  const provider = React.useMemo(() => createAdminBlocksProvider(workspaceId), [workspaceId]);
  const [store] = React.useState(() => createPagesEditorStore(initialSchema));
  const propEditors = React.useMemo(() => ({ src: makeImageSrcEditor(fileScope) }), [fileScope]);
  const schema = useStore(store, (s) => s.schema);
  const componentsApi = React.useMemo(() => createAdminPagesComponentsApi(workspaceId), [workspaceId]);
  const refBlocks = usePagesComponentBlocks(workspaceId, componentsApi, schema);

  // The Block's version as this editor knows it. A rename is a PATCH of its
  // own and moves the version; the auto-saver is handed the new one, or its
  // next save would be a 409 against our own rename.
  const [knownVersion, setKnownVersion] = React.useState<SaunaVersion>(initialVersion);

  // The same auto-save, save status and leave-guard as the page editor
  // (./editor-autosave.ts, EP-186 pattern 6): Back waits for a pending save,
  // a tab close while unsaved asks first.
  const tSaveStatus = useTranslations("common.saveStatus");
  const { autoSave, saveState, retry, leaveTo, flushPendingSave } = useEditorAutoSave({
    store,
    provider,
    id: blockId,
    externalVersion: knownVersion,
    leaveUnsavedMessage: tSaveStatus("leaveUnsaved"),
    onSaveSuccess: () => {
      // The Block's schema changed: every page drawing it re-reads it, and the
      // Blocks tab re-reads its list (usage may change with a nested Ref).
      void queryClient.invalidateQueries({ queryKey: pagesComponentKeys.schema(workspaceId, blockId) });
      void queryClient.invalidateQueries({ queryKey: pagesBlockKeys.all(workspaceId) });
    },
  });
  const currentVersion = () => Number(autoSave.version ?? knownVersion);

  /* --------------------------------------------- name, rename (EP-187) */

  const [displayName, setDisplayName] = React.useState(name);
  React.useEffect(() => setDisplayName(name), [name]);
  const [renaming, setRenaming] = React.useState(false);
  const [renameBusy, setRenameBusy] = React.useState(false);
  const [renameError, setRenameError] = React.useState<string | null>(null);
  const commitRename = async (raw: string) => {
    const next = raw.trim();
    if (renameBusy) return;
    if (!next || next === displayName) {
      setRenaming(false);
      return;
    }
    setRenameBusy(true);
    setRenameError(null);
    try {
      // The rename moves the version: whatever is pending is saved first,
      // under the version it was edited against.
      if (!(await flushPendingSave())) throw new Error("unsaved");
      const updated = await pagesApi.renameBlock(workspaceId, blockId, next, currentVersion());
      setDisplayName(updated.name ?? next);
      if (typeof updated.version === "number") setKnownVersion(String(updated.version));
      setRenaming(false);
      void queryClient.invalidateQueries({ queryKey: pagesBlockKeys.all(workspaceId) });
    } catch {
      setRenameError(t("renameError"));
    } finally {
      setRenameBusy(false);
    }
  };

  /* ------------------------------------------------- group (EP-175) */

  // The same Group field as «Move to group…» on the Components tiles: the
  // groups the workspace's Components carry, a new name creates one.
  const blocksList = useBlocks(workspaceId);
  const groups = React.useMemo(() => saunaComponentGroups(blocksList.data ?? []), [blocksList.data]);
  const [currentGroup, setCurrentGroup] = React.useState<string | null>(group);
  React.useEffect(() => setCurrentGroup(group), [group]);
  const [moving, setMoving] = React.useState(false);
  const [moveBusy, setMoveBusy] = React.useState(false);
  const [moveError, setMoveError] = React.useState<string | null>(null);
  const commitGroup = async (next: string) => {
    if (moveBusy) return;
    setMoveBusy(true);
    setMoveError(null);
    try {
      // Moves the version, like a rename: the pending save goes first.
      if (!(await flushPendingSave())) throw new Error("unsaved");
      const updated = await pagesApi.updateBlockMeta(workspaceId, blockId, { group: next || null }, currentVersion());
      setCurrentGroup(typeof updated.group === "string" && updated.group ? updated.group : null);
      if (typeof updated.version === "number") setKnownVersion(String(updated.version));
      setMoving(false);
      void queryClient.invalidateQueries({ queryKey: pagesBlockKeys.all(workspaceId) });
    } catch {
      setMoveError(t("renameError"));
    } finally {
      setMoveBusy(false);
    }
  };

  /* ------------------------------------------- preview, history (EP-187) */

  // Preview = the canvas without the editor's identifiers, as on a page.
  const [preview, setPreview] = React.useState(false);
  const togglePreview = (next: boolean) => {
    if (next) store.getState().selectNode(null);
    setPreview(next);
  };
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const fetchRevisions = React.useCallback(async () => {
    const list = await pagesApi.listBlockRevisions(workspaceId, blockId);
    return {
      items: list.items.map((r) => ({
        id: r.id,
        revision_number: r.revision_number,
        note: r.note,
        created_at: r.created_at,
        author_user_id: r.author_user_id ?? null,
      })),
      total: list.total,
    };
  }, [workspaceId, blockId]);
  const restoreRevision = async (n: number) => {
    // Restore writes a new revision under the Block's version: a pending
    // edit is saved first, and the editor then re-reads the restored body.
    if (!(await flushPendingSave())) throw new Error(t("restoreError"));
    try {
      await pagesApi.restoreBlockRevision(workspaceId, blockId, n, currentVersion());
    } catch {
      throw new Error(t("restoreError"));
    }
    void queryClient.invalidateQueries({ queryKey: pagesComponentKeys.schema(workspaceId, blockId) });
    void queryClient.invalidateQueries({ queryKey: pagesBlockKeys.all(workspaceId) });
    setHistoryOpen(false);
    onReload();
  };

  // A parameter never disappears without the confirmation (canvas
  // `?case=remove`): the studio's own Remove under a field commits the
  // shorter list at once, so a list that drops a name is held here and the
  // same dialog as the Parameters section's Remove asks first.
  const [removing, setRemoving] = React.useState<SaunaParamSpec | null>(null);
  const [editing, setEditing] = React.useState<SaunaParamSpec | null>(null);
  const onParamsChange = React.useCallback(
    (next: SaunaParamSpec[] | null) => {
      const current = store.getState().schema.params ?? [];
      const kept = new Set((next ?? []).map((p) => p.name));
      const dropped = current.find((p) => !kept.has(p.name));
      if (dropped) {
        setRemoving(dropped);
        return;
      }
      store.getState().applyOp({ kind: "setBlockParams", params: next });
    },
    [store]
  );
  const confirmRemove = (param: SaunaParamSpec) => {
    const next = removeParam(store.getState().schema.params ?? [], param.name);
    store.getState().applyOp({ kind: "setBlockParams", params: next.length > 0 ? next : null });
    setRemoving(null);
  };

  const componentLibrary = React.useMemo<SaunaComponentLibraryApi>(
    () => ({
      // The Block being edited is the host: the Insert modal refuses a
      // Component that would close a Ref cycle through it.
      hostBlockId: blockId,
      list: () =>
        queryClient.fetchQuery({
          queryKey: pagesComponentKeys.list(workspaceId),
          queryFn: componentsApi.list,
          staleTime: 0,
        }),
      load: (id) =>
        queryClient.fetchQuery({
          queryKey: pagesComponentKeys.schema(workspaceId, id),
          queryFn: () => componentsApi.load(id),
          staleTime: COMPONENT_STALE_MS,
        }),
      libraryHref: componentsListHref(workspaceId),
    }),
    [blockId, componentsApi, queryClient, workspaceId]
  );

  const paramsCount = (schema.params ?? []).length;
  const themeColors = useThemeDraftColors(workspaceId);
  const sections = React.useMemo<SaunaStudioSection[]>(
    () => [
      {
        id: "block-params",
        title: t("params.title"),
        badge: paramsCount > 0 ? String(paramsCount) : undefined,
        applicable: () => true,
        editsDocument: true,
        // The Block's contract with every page comes first (canvas).
        placement: "top",
        render: (s) => <BlockParamsList store={s} t={t} onEdit={setEditing} onRemove={setRemoving} />,
      },
    ],
    [t, paramsCount]
  );

  return (
    <UI.Box direction="column" data-testid="block-editor" className="h-dvh overflow-hidden bg-background">
      {/* The editor frame's one header (EP-187, layer 5, variant B). */}
      <EditorFrame
        kind="component"
        testId="block-editor-header"
        back={{ href: backHref, label: t("back"), onClick: leaveTo(backHref), testId: "block-editor-back" }}
        name={
          renaming ? (
            <input
              autoFocus
              defaultValue={displayName}
              aria-label={t("renameLabel")}
              maxLength={200}
              disabled={renameBusy}
              data-testid="block-editor-rename-input"
              className="h-7 w-[200px] rounded-md border border-input bg-background px-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void commitRename(e.currentTarget.value);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setRenameError(null);
                  setRenaming(false);
                }
              }}
              onBlur={(e) => void commitRename(e.currentTarget.value)}
            />
          ) : (
            displayName
          )
        }
        fullName={displayName}
        nameTestId="block-editor-title"
        nameMenu={
          renaming ? null : (
            <UI.Menu.Root>
              <UI.Menu.Trigger asChild>
                <EditorNameMenuButton label={t("menu")} data-testid="block-editor-name-menu" />
              </UI.Menu.Trigger>
              <UI.Menu.Content align="start">
                <UI.Menu.Label className="max-w-72 break-words" data-testid="block-editor-full-name">
                  {displayName}
                  {currentGroup ? (
                    <span className="block text-xs font-normal text-muted-foreground" data-testid="block-editor-group">
                      {t("groupLabel", { group: currentGroup })}
                    </span>
                  ) : null}
                </UI.Menu.Label>
                <UI.Menu.Separator />
                <UI.Menu.Item
                  disabled={preview}
                  onSelect={() => {
                    setRenameError(null);
                    setRenaming(true);
                  }}
                  data-testid="block-editor-rename"
                >
                  <Pencil size={14} aria-hidden="true" />
                  {t("rename")}
                </UI.Menu.Item>
                <UI.Menu.Item
                  disabled={preview}
                  onSelect={() => {
                    setMoveError(null);
                    setMoving(true);
                  }}
                  data-testid="block-editor-move"
                >
                  <FolderInput size={14} aria-hidden="true" />
                  {t("moveToGroup")}
                </UI.Menu.Item>
              </UI.Menu.Content>
            </UI.Menu.Root>
          )
        }
        saveStatus={
          <EditorSaveStatus
            state={saveState}
            detail={autoSave.error?.message}
            onRetry={retry}
            testId="block-editor-save"
            retryTestId="block-editor-save-retry"
            data={{ "data-save-status": autoSave.status }}
          />
        }
        center={<StudioCanvasControls store={store} readOnly={preview} />}
        status={
          typeof usageCount === "number" ? (
            <UI.Text as="span" size="xs" variant="muted" className="truncate max-md:hidden" data-testid="block-editor-usage">
              {t("usedOn", { count: usageCount })}
            </UI.Text>
          ) : null
        }
        actions={
          <>
            <EditorIconButton
              label={t("history")}
              pressed={historyOpen}
              onClick={() => setHistoryOpen(true)}
              data-testid="block-editor-history"
            >
              <History size={16} aria-hidden="true" />
            </EditorIconButton>
            <EditorIconButton
              label={t("preview")}
              pressed={preview}
              onClick={() => togglePreview(!preview)}
              data-testid="block-editor-preview-toggle"
            >
              <Eye size={16} aria-hidden="true" />
            </EditorIconButton>
          </>
        }
      />

      {renameError ? (
        <UI.Box className="shrink-0 px-4 pt-3">
          <UI.Alert variant="destructive" data-testid="block-editor-rename-error">
            <UI.Text as="span" size="sm">
              {renameError}
            </UI.Text>
          </UI.Alert>
        </UI.Box>
      ) : null}

      {moving ? (
        <MoveToGroupDialog
          name={displayName}
          current={currentGroup}
          groups={groups}
          pending={moveBusy}
          error={moveError}
          onClose={() => setMoving(false)}
          onMove={(next) => void commitGroup(next)}
        />
      ) : null}

      <ItemPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        ariaLabel={t("historyTitle")}
        testId="block-editor-history-panel"
      >
        {historyOpen ? (
          <SaunaHistoryPanel fetchRevisions={fetchRevisions} onRestore={restoreRevision} pageLabel={displayName} />
        ) : null}
      </ItemPanel>

      {autoSave.status === "conflict" ? (
        <UI.Box className="shrink-0 px-4 pt-3">
          <UI.Alert variant="destructive" data-testid="block-editor-conflict">
            <UI.Box direction="row" align="center" gap={3} wrap>
              <UI.Text as="span" size="sm">
                {t("conflict")}
              </UI.Text>
              <UI.Button size="sm" variant="outline" onClick={onReload} data-testid="block-editor-reload">
                {tSave("reload")}
              </UI.Button>
            </UI.Box>
          </UI.Alert>
        </UI.Box>
      ) : null}

      <UI.Box grow className="min-h-0">
        <SaunaStudio
          store={store}
          blocks={PAGES_BLOCKS}
          propsManifest={PAGES_PROPS_MANIFEST}
          // The theme draft's custom colours (SDL-950), as in the page editor.
          themeColors={themeColors}
          outlineStateKey={`blocks:${blockId}`}
          rootLabel={t("rootLabel")}
          // A Block saved from a Text roots AT that Text: draw it, not «empty».
          rootIsContent
          propEditors={propEditors}
          onParamsChange={preview ? undefined : onParamsChange}
          sections={sections}
          componentLibrary={componentLibrary}
          // Preview (EP-187): the Component as a page shows it, no selection chrome.
          preview={preview}
          onExitPreview={() => togglePreview(false)}
          disableHotkeys={preview}
          // The devices and Undo / Redo are in the frame's header (EP-187).
          canvasToolbar={false}
          renderPreview={(doc, { screen, audience }) => (
            <PagesCanvas editable={!preview} schema={doc} fileScope={fileScope} screen={screen} audience={audience} blocks={refBlocks} />
          )}
        />
      </UI.Box>
      {removing ? (
        <RemoveParamDialog key={removing.name} param={removing} t={t} onClose={() => setRemoving(null)} onConfirm={() => confirmRemove(removing)} />
      ) : null}
      {editing ? (
        <EditParamDialog
          key={editing.name}
          param={editing}
          t={t}
          onClose={() => setEditing(null)}
          onRemove={() => {
            setRemoving(editing);
            setEditing(null);
          }}
          onSave={(patch) => {
            const next = updateParam(store.getState().schema.params ?? [], editing.name, patch);
            store.getState().applyOp({ kind: "setBlockParams", params: next });
            setEditing(null);
          }}
        />
      ) : null}
    </UI.Box>
  );
}
