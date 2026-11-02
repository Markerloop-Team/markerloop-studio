"use client";

// The Components section (EP-175, layer 6; owner-approved mock
// docs/redesign-layer-6-components-final-2026-10-30, 30 Oct 2026).
//
// Built on the admin's one list — DataView in `view="tiles"` with group
// sections and tile actions (both DataView capabilities, EP-175):
//
// - tiles grouped by the Component's `group` (a label on the Block; «No
//   group» last), recently edited first inside each group;
// - a tile is a live preview (./component-preview.tsx — the engine in an
//   iframe, the site theme), the purple component icon and the name, «Edited
//   by <name> · <when>» and «Used in N places»; the machine key is no longer
//   on the tile (it is one click away: «Copy key»);
// - «⋯» on a tile: Open, Where used, Rename, Duplicate, Move to group…, Copy
//   key, Delete…;
// - tabs All / In use / Not used with counts and the search by name or group
//   ride in DataView's toolbar; «N components» / «N of M».
//
// Owner's simplifications over the mock (30 Oct 2026): no «Group ▾» filter,
// no «Sort ▾», no Tiles/List switch.
//
// Delete (EP-186, pattern 4) still reads «Where used» up front, and with
// places asks for the checkbox before the DELETE with force=true; a 409
// `block_in_use` that arrives anyway lists the places it returns.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight,
  Component as ComponentIcon,
  Copy,
  Ellipsis,
  FileText,
  FolderInput,
  KeyRound,
  MousePointerClick,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { createEmptySaunaSchema, type SaunaBlockMap, type SaunaSchema } from "@markerloop/engine";
import { saunaComponentGroups } from "@markerloop/studio";

import { useTranslations } from "@/shared/hooks";
import { DataView, type DataViewField, type DataViewGroup } from "@/shared/components/data-view";
import { DeleteDialogBody, DeleteDialogShell } from "@/shared/components/delete-dialog";
import { ListPage } from "@/shared/components/list-page";
import {
  SECTION_TABS_LIST_CLASS,
  SECTION_TABS_SCROLL_CLASS,
  SECTION_TABS_TRIGGER_CLASS,
} from "@/shared/components/section-header";
import {
  duplicateName,
  pagesBlockKeys,
  pagesBlockUsageOf,
  pagesHttpStatus,
  useBlockDetail,
  useBlocks,
  useDeleteBlock,
  useRevisionAuthors,
  useRoutes,
  useUpdateBlockMeta,
  type PagesBlock,
  type PagesBlockUsage,
  type PagesRoute,
} from "@/entities/pages";
import { pagesApi } from "@/shared/lib/api/pages-client";
import { useSiteThemeDraft } from "@/entities/site-theme";
import { useCollections } from "@/entities/collections/collection";
import { useWorkspaceMembers } from "@/entities/collections/member";
import type { WorkspaceMemberProfile } from "@/shared/lib/api/collections-client";
import type { FileScope } from "@/entities/files";

import { componentEditorHref, pageEditorHref } from "./page-hrefs";
import { collectionsListParams } from "./data-sources";
import { ComponentPreview, componentDataSources, readComponentSchema } from "./component-preview";
import {
  ComponentUsageRows,
  MoveToGroupDialog,
  PickPageBody,
  PickPageDialog,
  RenameComponentDialog,
  WhereUsedBody,
  WhereUsedDialog,
} from "./component-dialogs";
import { SAVE_COMPONENT_HINT, createAdminPagesComponentsApi } from "./page-editor";

type Translate = ReturnType<typeof useTranslations>;

/* ------------------------------------------------------------ rules */

export type ComponentsTab = "all" | "inUse" | "notUsed";

/** Components whose name or group holds the query (case-insensitive); an empty query keeps all. */
export function filterBlocks(rows: PagesBlock[], query: string): PagesBlock[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => row.name.toLowerCase().includes(q) || (row.group ?? "").toLowerCase().includes(q));
}

/** The rows of a tab: all, used on some page, used nowhere. */
export function tabBlocks(rows: PagesBlock[], tab: ComponentsTab): PagesBlock[] {
  if (tab === "inUse") return rows.filter((r) => (r.usage_count ?? 0) > 0);
  if (tab === "notUsed") return rows.filter((r) => (r.usage_count ?? 0) === 0);
  return rows;
}

const editedAt = (row: PagesBlock) => {
  const t = Date.parse(row.updated_at ?? row.created_at ?? "");
  return Number.isNaN(t) ? 0 : t;
};

/** Recently edited first — the one order of the section (owner, 30 Oct 2026). */
export function sortRecentFirst(rows: PagesBlock[]): PagesBlock[] {
  return [...rows].sort((a, b) => editedAt(b) - editedAt(a));
}

/** A Component's section: its group, or none («No group»). */
export function blockGroupOf(row: PagesBlock): DataViewGroup | null {
  const group = typeof row.group === "string" ? row.group.trim() : "";
  return group ? { key: group.toLowerCase(), label: group } : null;
}

/** «just now», «5m ago», «3h ago», then «Oct 26» (with the year when not this year). */
export function formatEditedWhen(iso: string | undefined, locale: string, t: Translate, now = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { count: minutes });
  if (minutes < 24 * 60) return t("hoursAgo", { count: Math.floor(minutes / 60) });
  const d = new Date(at);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(locale, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
}

/**
 * What «Edited by …» calls a member: the first name, else the display name,
 * else the full name, else the username; undefined when the profile has none.
 */
export function memberDisplayName(member: Pick<WorkspaceMemberProfile, "first_name" | "last_name" | "display_name" | "username">): string | undefined {
  const first = member.first_name?.trim();
  if (first) return first;
  const display = member.display_name?.trim();
  if (display) return display;
  const full = [member.first_name, member.last_name].map((p) => p?.trim()).filter(Boolean).join(" ");
  if (full) return full;
  return member.username?.trim() || undefined;
}

/* ------------------------------------------------------------ tile parts */

function NotUsedBadge({ t, className = "" }: { t: Translate; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md bg-muted px-1.5 py-px text-xs text-muted-foreground ${className}`}
      data-testid="block-not-used"
    >
      {t("notUsed")}
    </span>
  );
}

export type ComponentActions = {
  onOpen?: (row: PagesBlock) => void;
  onUsage: (row: PagesBlock) => void;
  onRename?: (row: PagesBlock) => void;
  onDuplicate?: (row: PagesBlock) => void;
  onMove?: (row: PagesBlock) => void;
  onCopyKey?: (row: PagesBlock) => void;
  onDelete: (row: PagesBlock) => void;
};

function TileMenu({ block, actions, editHref, t }: { block: PagesBlock; actions: ComponentActions; editHref?: string; t: Translate }) {
  const item = (testId: string, icon: React.ReactNode, label: string, onSelect?: () => void) =>
    onSelect ? (
      <UI.Menu.Item className="gap-2" onSelect={onSelect} data-testid={testId}>
        {icon}
        {label}
      </UI.Menu.Item>
    ) : null;
  return (
    <UI.Menu.Root>
      <UI.Menu.Trigger asChild>
        <UI.Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          aria-label={t("rowActions", { name: block.name })}
          data-testid="block-row-actions"
        >
          <Ellipsis size={16} aria-hidden="true" />
        </UI.Button>
      </UI.Menu.Trigger>
      <UI.Menu.Content align="end">
        {editHref ? (
          <UI.Menu.Item asChild className="gap-2" data-testid="block-action-open">
            <Link href={editHref}>
              <ArrowRight size={14} aria-hidden="true" />
              {t("menu.open")}
            </Link>
          </UI.Menu.Item>
        ) : (
          item("block-action-open", <ArrowRight size={14} aria-hidden="true" />, t("menu.open"), actions.onOpen ? () => actions.onOpen?.(block) : undefined)
        )}
        {item("block-action-usage", <FileText size={14} aria-hidden="true" />, t("whereUsed"), () => actions.onUsage(block))}
        {item("block-action-rename", <Pencil size={14} aria-hidden="true" />, t("menu.rename"), actions.onRename ? () => actions.onRename?.(block) : undefined)}
        {item("block-action-duplicate", <Copy size={14} aria-hidden="true" />, t("menu.duplicate"), actions.onDuplicate ? () => actions.onDuplicate?.(block) : undefined)}
        {item("block-action-move", <FolderInput size={14} aria-hidden="true" />, t("menu.move"), actions.onMove ? () => actions.onMove?.(block) : undefined)}
        {item("block-action-copy-key", <KeyRound size={14} aria-hidden="true" />, t("menu.copyKey"), actions.onCopyKey ? () => actions.onCopyKey?.(block) : undefined)}
        <UI.Menu.Separator />
        <UI.Menu.Item variant="destructive" className="gap-2" onSelect={() => actions.onDelete(block)} data-testid="block-action-delete">
          <Trash2 size={14} aria-hidden="true" />
          {t("deleteMenu")}
        </UI.Menu.Item>
      </UI.Menu.Content>
    </UI.Menu.Root>
  );
}

/* ------------------------------------------------------------ the list */

export function BlocksList({
  rows,
  editHrefFor,
  onUsage,
  onDelete,
  onRename,
  onDuplicate,
  onMove,
  onCopyKey,
  query,
  onQueryChange,
  total,
  tabs,
  editorName,
  preview,
  body,
}: {
  rows: PagesBlock[];
  /** The Component's own editor (SDL-721): /components/<id>?ws=… Absent → the tile is not a link. */
  editHrefFor?: (block: PagesBlock) => string;
  onUsage: (block: PagesBlock) => void;
  onDelete: (block: PagesBlock) => void;
  onRename?: (block: PagesBlock) => void;
  onDuplicate?: (block: PagesBlock) => void;
  onMove?: (block: PagesBlock) => void;
  onCopyKey?: (block: PagesBlock) => void;
  /** Search by name or group; absent → no search field. */
  query?: string;
  onQueryChange?: (query: string) => void;
  /** Rows of the tab before the search — the M of «N of M». */
  total?: number;
  /** The All / In use / Not used tabs (DataView's filters slot). */
  tabs?: React.ReactNode;
  /** Who edited the Component last, by `updated_by`; undefined → only the date. */
  editorName?: (block: PagesBlock) => string | undefined;
  /** The tile's media (the live preview); absent → the component icon. */
  preview?: (block: PagesBlock) => React.ReactNode;
  /** Replaces the tiles under the toolbar (nothing found). */
  body?: React.ReactNode;
}) {
  const t = useTranslations("pages.blocks");
  const locale = useLocale();
  const actions: ComponentActions = { onUsage, onDelete, onRename, onDuplicate, onMove, onCopyKey };
  const fields = React.useMemo<DataViewField<PagesBlock>[]>(
    () => [
      {
        id: "media",
        render: (block) => (
          <span className="relative block">
            {preview ? (
              preview(block)
            ) : (
              <span className="flex aspect-[16/10] w-full items-center justify-center rounded-lg bg-muted text-component">
                <ComponentIcon size={32} aria-hidden="true" />
              </span>
            )}
          </span>
        ),
        tile: "media",
      },
      {
        id: "name",
        value: (block) => block.name,
        render: (block) => (
          <span className="block truncate" data-testid="block-name">
            {block.name}
          </span>
        ),
        tile: "title",
      },
      {
        // One quiet line under the name (variant B): where it is used and when
        // it was edited. Who edited it is the date's tooltip, not a third line.
        id: "summary",
        render: (block) => {
          const count = block.usage_count ?? 0;
          const when = formatEditedWhen(block.updated_at, locale, t);
          const who = editorName?.(block);
          const edited = when ? (who ? t("editedBy", { name: who, when }) : t("edited", { when })) : null;
          return (
            <span className="flex w-full min-w-0 items-center gap-1.5">
              <span className="shrink-0" data-testid="block-used-on" data-count={count} title={count === 0 ? undefined : t("usedOn", { count })}>
                {count === 0 ? <NotUsedBadge t={t} /> : t("places", { count })}
              </span>
              {edited ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate" data-testid="block-edited" title={edited} aria-label={edited}>
                    {when}
                  </span>
                </>
              ) : null}
            </span>
          );
        },
        tile: "meta",
      },
    ],
    [t, locale, editorName, preview]
  );
  const searchable = typeof query === "string" && !!onQueryChange;
  const count = typeof total === "number" ? { shown: rows.length, total } : undefined;
  return (
    <UI.Box direction="column" className="min-w-0" data-testid="blocks-list">
      <DataView
        view="tiles"
        fields={fields}
        data={rows}
        getRowId={(block) => block.id}
        groupBy={blockGroupOf}
        ungroupedLabel={t("noGroup")}
        groupTestId="components-group"
        rowActions={(block) => <TileMenu block={block} actions={actions} editHref={editHrefFor?.(block)} t={t} />}
        rowActionsLabel={t("table.actions")}
        rowActionsPlacement="title"
        rowHref={editHrefFor}
        tileControlAttributes={(row) => ({ "data-testid": "block-open", "aria-label": row.name })}
        rowAttributes={(row) => ({
          "data-testid": "block-row",
          "data-block": row.id,
          "data-unused": (row.usage_count ?? 0) === 0 ? "true" : undefined,
        })}
        filters={tabs}
        searchValue={query ?? ""}
        onSearchChange={searchable ? onQueryChange : undefined}
        searchPlaceholder={searchable ? t("search.placeholder") : undefined}
        searchTestId="blocks-search-input"
        toolbarTestId="blocks-toolbar"
        tilesTestId="blocks-tiles"
        emptyMessage={searchable ? t("search.nothingFound", { query: query ?? "" }) : undefined}
        count={count}
        countTestId="blocks-count"
        texts={{
          listCount: ({ shown, total: all }) => (shown === all ? t("count", { count: all }) : t("countOf", { shown, total: all })),
        }}
        body={body}
      />
    </UI.Box>
  );
}

/* ------------------------------------------------------------ empty / nothing */

function CreateButtons({ t, onNew, onFromPage, layout }: { t: Translate; onNew: () => void; onFromPage: () => void; layout: "header" | "phone" }) {
  if (layout === "phone") {
    return (
      <UI.Menu.Root>
        <UI.Menu.Trigger asChild>
          <UI.Button size="icon" aria-label={t("actions.create")} data-testid="components-create-menu">
            <Plus size={16} aria-hidden="true" />
          </UI.Button>
        </UI.Menu.Trigger>
        <UI.Menu.Content align="end">
          <UI.Menu.Item className="gap-2" onSelect={onNew} data-testid="components-new-phone">
            <Plus size={14} aria-hidden="true" />
            {t("actions.new")}
          </UI.Menu.Item>
          <UI.Menu.Item className="gap-2" onSelect={onFromPage} data-testid="components-from-page-phone">
            <MousePointerClick size={14} aria-hidden="true" />
            {t("actions.saveFromPage")}
          </UI.Menu.Item>
        </UI.Menu.Content>
      </UI.Menu.Root>
    );
  }
  return (
    <>
      <UI.Button variant="outline" onClick={onFromPage} data-testid="components-from-page">
        <MousePointerClick size={15} aria-hidden="true" />
        {t("actions.saveFromPage")}
      </UI.Button>
      <UI.Button onClick={onNew} data-testid="components-new">
        <Plus size={15} aria-hidden="true" />
        {t("actions.new")}
      </UI.Button>
    </>
  );
}

export function ComponentsEmpty({ onNew, onFromPage }: { onNew: () => void; onFromPage: () => void }) {
  const t = useTranslations("pages.blocks");
  return (
    <UI.Box direction="column" align="center" gap={5} className="py-10 text-center" data-testid="blocks-empty">
      <ComponentIcon size={44} aria-hidden="true" className="text-component" />
      <UI.Box direction="column" gap={1} align="center" className="max-w-xl">
        <UI.Text as="h2" size="lg" weight="semibold">
          {t("emptyNew.title")}
        </UI.Text>
        <UI.Text variant="muted" size="sm">
          {t("emptyNew.body")}
        </UI.Text>
      </UI.Box>
      <div className="grid w-full max-w-2xl gap-4 text-left sm:grid-cols-2">
        <div className="flex flex-col items-start gap-2 rounded-xl border border-border p-4" data-testid="blocks-empty-scratch">
          <UI.Text weight="semibold">{t("emptyNew.scratchTitle")}</UI.Text>
          <UI.Text size="sm" variant="muted" className="flex-1">
            {t("emptyNew.scratchBody")}
          </UI.Text>
          <UI.Button onClick={onNew} data-testid="blocks-empty-new">
            <Plus size={15} aria-hidden="true" />
            {t("actions.new")}
          </UI.Button>
        </div>
        <div className="flex flex-col items-start gap-2 rounded-xl border border-border p-4" data-testid="blocks-empty-page">
          <UI.Text weight="semibold">{t("emptyNew.pageTitle")}</UI.Text>
          <UI.Text size="sm" variant="muted" className="flex-1">
            {t("emptyNew.pageBody")}
          </UI.Text>
          <UI.Button variant="outline" onClick={onFromPage} data-testid="blocks-empty-from-page">
            <MousePointerClick size={15} aria-hidden="true" />
            {t("emptyNew.choosePage")}
          </UI.Button>
        </div>
      </div>
    </UI.Box>
  );
}

export function ComponentsNothingFound({ query, onClear, onNew }: { query: string; onClear: () => void; onNew: (name: string) => void }) {
  const t = useTranslations("pages.blocks");
  const q = query.trim();
  return (
    <UI.Box direction="column" align="center" gap={3} className="py-10 text-center" data-testid="blocks-nothing">
      <Search size={36} aria-hidden="true" className="text-muted-foreground" />
      <UI.Text as="h2" size="lg" weight="semibold" className="break-words">
        {t("nothing.title", { query: q })}
      </UI.Text>
      <UI.Text variant="muted" size="sm">
        {t("nothing.body")}
      </UI.Text>
      <UI.Box direction="row" gap={2} wrap justify="center">
        <UI.Button variant="outline" onClick={onClear} data-testid="blocks-nothing-clear">
          {t("nothing.clear")}
        </UI.Button>
        <UI.Button onClick={() => onNew(q)} data-testid="blocks-nothing-new">
          <Plus size={15} aria-hidden="true" />
          {t("actions.newNamed", { name: q })}
        </UI.Button>
      </UI.Box>
    </UI.Box>
  );
}

/* ------------------------------------------------------------ delete */

/**
 * What the delete question knows about the places (EP-186, pattern 4): the
 * places come from the "Where used" read BEFORE the first DELETE; a 409
 * `block_in_use` that arrives anyway (the read was stale) replaces them. With
 * any place known, Delete waits for the checkbox and goes out with
 * `force=true`; with none it is a plain DELETE, and pages-service still has
 * the last word through its 409. The places are never guessed from the
 * list's counter — it may be stale.
 */
export function planBlockDelete({
  read,
  conflict,
  loading,
}: {
  /** The usage of GET /v1/pages/blocks/{id}, null until (or unless) it answered. */
  read: PagesBlockUsage | null;
  /** The places of a 409 `block_in_use`, null before one. */
  conflict: PagesBlockUsage | null;
  loading: boolean;
}): { places: PagesBlockUsage | null; loading: boolean; force: boolean; step: "confirm" | "in-use" } {
  const places = conflict ?? read;
  const inUse = (places?.count ?? 0) > 0;
  return {
    places,
    loading: !conflict && loading,
    force: inUse,
    step: inUse ? "in-use" : "confirm",
  };
}

/**
 * The delete question's body (mock screen 07) — a component of its own so
 * the smoke renders it (the dialog is portalled). Used: the pages it leaves,
 * the history note, «Remove it from N pages» gating the button; not used:
 * one sentence and the button.
 */
export function DeleteBlockBody({
  workspaceId,
  places,
  routes,
  loading = false,
  readFailed = false,
  pending = false,
  error,
  onCancel,
  onConfirm,
}: {
  name: string;
  workspaceId: string;
  places: PagesBlockUsage | null;
  routes?: readonly PagesRoute[];
  loading?: boolean;
  /** "Where used" could not be read: the delete is a plain one, the 409 decides. */
  readFailed?: boolean;
  pending?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("pages.blocks");
  const count = places?.count ?? 0;
  const listed = places ? places.pages.length + places.blocks.length : 0;
  const pagesCount = places && places.pages.length > 0 ? places.pages.length : count;
  const resetKey = places
    ? [...places.pages.map((p) => `p:${p.id}`), ...places.blocks.map((b) => `b:${b.id}`)].join("|")
    : "";
  return (
    <DeleteDialogBody
      consequence={
        <UI.Text size="sm" variant="muted" className="break-words" data-testid="delete-consequence">
          {count > 0 ? t("deleteNew.used", { count: pagesCount }) : loading ? t("usage.loading") : t("deleteNew.unused")}
        </UI.Text>
      }
      usage={{
        count,
        loading,
        resetKey,
        title: t("delete.inUse", { count }),
        list:
          places && listed > 0 ? (
            <ComponentUsageRows usage={places} workspaceId={workspaceId} routes={routes} testIdPrefix="delete-usage" />
          ) : (
            <UI.Text size="sm" variant="muted">
              {t("delete.inUseUnlisted")}
            </UI.Text>
          ),
        note:
          readFailed && !places ? (
            <UI.Text size="sm" variant="muted" data-testid="delete-usage-error">
              {t("delete.usageError")}
            </UI.Text>
          ) : null,
      }}
      ackLabel={t("deleteNew.ack", { count: pagesCount })}
      pending={pending}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmLabel={
        <>
          <Trash2 size={15} aria-hidden="true" />
          {t("deleteNew.confirm")}
        </>
      }
      pendingLabel={t("delete.deleting")}
      testIds={{ confirm: count > 0 ? "delete-force" : "delete-confirm" }}
    />
  );
}

/**
 * Delete with the places up front: "Where used" is read when the dialog
 * opens (the same query as the dialog) and listed before the first DELETE;
 * with places the checkbox gates the button (force=true). A 409 that
 * arrives anyway shows the places it returns and asks for the checkbox.
 */
export function DeleteBlockDialog({
  block,
  workspaceId,
  routes,
  onClose,
}: {
  block: PagesBlock;
  workspaceId: string;
  routes?: readonly PagesRoute[];
  onClose: () => void;
}) {
  const t = useTranslations("pages.blocks");
  const detail = useBlockDetail(workspaceId, block.id);
  const del = useDeleteBlock();
  const [conflict, setConflict] = React.useState<PagesBlockUsage | null>(null);
  const plan = planBlockDelete({
    read: detail.data ? pagesBlockUsageOf(detail.data) : null,
    conflict,
    loading: detail.isLoading,
  });

  const run = () => {
    del.mutate(
      { workspaceId, blockId: block.id, force: plan.force },
      {
        onSuccess: (result) => {
          if (result.deleted) onClose();
          else setConflict(result.usage);
        },
      }
    );
  };

  return (
    <DeleteDialogShell
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      pending={del.isPending}
      title={t("deleteNew.title", { name: block.name })}
      description={t("delete.description")}
      contentProps={{ "data-state-step": plan.step }}
    >
      <DeleteBlockBody
        name={block.name}
        workspaceId={workspaceId}
        places={plan.places}
        routes={routes}
        loading={plan.loading}
        readFailed={!!detail.error}
        pending={del.isPending}
        error={
          del.isError
            ? `${t("delete.error")}: ${del.error instanceof Error ? del.error.message : ""}`
            : null
        }
        onCancel={onClose}
        onConfirm={run}
      />
    </DeleteDialogShell>
  );
}

function WhereUsed({ block, workspaceId, routes, onClose }: { block: PagesBlock; workspaceId: string; routes?: readonly PagesRoute[]; onClose: () => void }) {
  const detail = useBlockDetail(workspaceId, block.id);
  return (
    <WhereUsedDialog name={block.name} onClose={onClose}>
      <WhereUsedBody
        usage={detail.data ? pagesBlockUsageOf(detail.data) : null}
        loading={detail.isLoading}
        failed={!!detail.error}
        workspaceId={workspaceId}
        routes={routes}
      />
    </WhereUsedDialog>
  );
}

/* ------------------------------------------------------------ the section */

function useComponentPreviews(
  workspaceId: string,
  rows: PagesBlock[],
  fileScope: FileScope | null,
  load: (blockId: string) => Promise<SaunaSchema | null>
) {
  const t = useTranslations("pages.blocks");
  const theme = useSiteThemeDraft(workspaceId);
  // Every Component's tree from the list itself: a tile — and a Ref inside
  // it — draws without a request of its own.
  const parsed = React.useMemo(() => {
    const map: Record<string, SaunaSchema> = {};
    const byId = new Map<string, SaunaSchema | null>();
    for (const row of rows) {
      const schema = readComponentSchema(row.schema);
      byId.set(row.id, schema);
      if (schema) map[row.id] = schema;
    }
    return { blocks: map as SaunaBlockMap, byId };
  }, [rows]);
  // Collection names only when some Component reads a collection.
  const anyBound = React.useMemo(
    () => [...parsed.byId.values()].some((s) => componentDataSources(s, parsed.blocks).bound),
    [parsed]
  );
  const collections = useCollections(anyBound ? collectionsListParams(workspaceId) : null);
  const collectionName = React.useCallback(
    (id: string) => collections.data?.data?.find((c) => c.id === id)?.name,
    [collections.data]
  );
  const texts = React.useMemo(
    () => ({
      data: (name: string) => t("preview.data", { name }),
      dataUnnamed: t("preview.dataUnnamed"),
      empty: t("preview.empty"),
      unavailable: t("preview.unavailable"),
    }),
    [t]
  );
  const siteTheme = theme.data?.theme;
  return React.useCallback(
    (row: PagesBlock) => (
      <ComponentPreview
        source={{ workspaceId, blockId: row.id, raw: row.schema, load }}
        blocks={parsed.blocks}
        theme={siteTheme}
        fileScope={fileScope}
        title={row.name}
        collectionName={collectionName}
        texts={texts}
        dim={(row.usage_count ?? 0) === 0}
      />
    ),
    [parsed, siteTheme, fileScope, collectionName, texts, workspaceId, load]
  );
}

/** The whole section: header, tabs, search, tiles, and every dialog. */
export function BlocksTab({
  workspaceId,
  fileScope = null,
  title,
  loadComponent,
}: {
  workspaceId: string;
  fileScope?: FileScope | null;
  /** Reads one Component's tree when the list carries none; default: pages-service through the gateway. */
  loadComponent?: (blockId: string) => Promise<SaunaSchema | null>;
  /** The section title (the page passes the navigation's word). */
  title: string;
}) {
  const t = useTranslations("pages.blocks");
  const tPages = useTranslations("pages");
  const router = useRouter();
  const queryClient = useQueryClient();
  const blocksQuery = useBlocks(workspaceId);
  const routesQuery = useRoutes(workspaceId);
  const all = React.useMemo(() => sortRecentFirst(blocksQuery.data ?? []), [blocksQuery.data]);
  const groups = React.useMemo(() => saunaComponentGroups(all), [all]);
  // Names from the workspace's members (one read); a former member falls back
  // to the user lookup by id, which knows only the username.
  const members = useWorkspaceMembers(workspaceId, "profiles");
  const memberNames = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members.data ?? []) {
      const name = memberDisplayName(m);
      if (name) map.set(m.user_id, name);
    }
    return map;
  }, [members.data]);
  const authors = useRevisionAuthors(all.map((r) => (r.updated_by && !memberNames.has(r.updated_by) ? r.updated_by : null)));
  const componentsApi = React.useMemo(() => createAdminPagesComponentsApi(workspaceId), [workspaceId]);
  const preview = useComponentPreviews(workspaceId, all, fileScope, loadComponent ?? componentsApi.load);
  const meta = useUpdateBlockMeta();

  const [tab, setTab] = React.useState<ComponentsTab>("all");
  const [query, setQuery] = React.useState("");
  const [usageOf, setUsageOf] = React.useState<PagesBlock | null>(null);
  const [deleting, setDeleting] = React.useState<PagesBlock | null>(null);
  const [moving, setMoving] = React.useState<PagesBlock | null>(null);
  const [renaming, setRenaming] = React.useState<PagesBlock | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const editorName = React.useCallback(
    (row: PagesBlock) => {
      if (!row.updated_by) return undefined;
      const member = memberNames.get(row.updated_by);
      if (member) return member;
      const author = authors(row.updated_by);
      return author.state === "known" ? author.name : undefined;
    },
    [authors, memberNames]
  );

  const createComponent = async (name?: string) => {
    if (creating) return;
    setCreating(true);
    try {
      const created = await componentsApi.saveAsComponent.create({
        name: name?.trim() || t("actions.untitled"),
        schema: createEmptySaunaSchema("Box"),
      });
      void queryClient.invalidateQueries({ queryKey: pagesBlockKeys.all(workspaceId) });
      router.push(componentEditorHref(created.id, workspaceId));
    } catch {
      toast.error(t("actions.createError"));
      setCreating(false);
    }
  };

  const duplicate = async (row: PagesBlock) => {
    try {
      const detail = await pagesApi.getBlock(workspaceId, row.id);
      const schema = readComponentSchema(detail.schema ?? row.schema);
      if (!schema) throw new Error("unreadable component");
      const name = duplicateName(row.name, all.map((r) => r.name));
      await componentsApi.saveAsComponent.create({ name, schema, group: row.group ?? null });
      void queryClient.invalidateQueries({ queryKey: pagesBlockKeys.all(workspaceId) });
      toast.success(t("toast.duplicated", { name }));
    } catch {
      toast.error(t("toast.error"));
    }
  };

  const copyKey = async (row: PagesBlock) => {
    try {
      await navigator.clipboard.writeText(row.key);
      toast.success(t("toast.keyCopied"));
    } catch {
      toast.error(t("toast.error"));
    }
  };

  const tabbed = (key: ComponentsTab) => tabBlocks(all, key);
  const inTab = tabbed(tab);
  const shown = filterBlocks(inTab, query);

  const tabs = (
    <UI.Tabs value={tab} onValueChange={(v: string) => setTab(v as ComponentsTab)} className="order-first w-full basis-full" data-testid="components-tabs">
      <div className={SECTION_TABS_SCROLL_CLASS}>
        <UI.TabsList variant="line" className={SECTION_TABS_LIST_CLASS}>
          {(["all", "inUse", "notUsed"] as const).map((key) => (
            <UI.TabsTrigger key={key} value={key} className={SECTION_TABS_TRIGGER_CLASS} data-testid={`components-tab-${key}`}>
              {key === "all" ? (
                <>
                  <span className="max-sm:hidden">{t("tabs.all")}</span>
                  <span className="sm:hidden">{t("tabs.allShort")}</span>
                </>
              ) : (
                t(`tabs.${key}`)
              )}
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground" data-testid={`components-tab-count-${key}`}>
                {tabbed(key).length}
              </span>
            </UI.TabsTrigger>
          ))}
        </UI.TabsList>
      </div>
    </UI.Tabs>
  );

  let content: React.ReactNode;
  if (blocksQuery.isLoading) {
    content = (
      <UI.Box direction="column" gap={3} data-testid="blocks-loading">
        {[0, 1, 2].map((i) => (
          <UI.Skeleton key={i} height={36} />
        ))}
      </UI.Box>
    );
  } else if (blocksQuery.error) {
    // An error is a message, never an empty list: "no components" and "could
    // not read them" lead the person to opposite conclusions.
    const status = pagesHttpStatus(blocksQuery.error);
    const denied = status === 401 || status === 403;
    content = (
      <UI.Card fullWidth data-testid="blocks-error" data-denied={denied ? "true" : "false"}>
        <UI.EmptyState paddingY={10}>
          <UI.Box direction="column" align="center" gap={1} textAlign="center">
            <UI.Text as="h2" size="lg" weight="semibold">
              {denied ? tPages("errors.access") : t("errors.load")}
            </UI.Text>
            <UI.Text variant="muted" size="sm" className="break-words">
              {denied ? tPages("errors.accessHint") : blocksQuery.error.message}
            </UI.Text>
          </UI.Box>
        </UI.EmptyState>
      </UI.Card>
    );
  } else if (all.length === 0) {
    content = <ComponentsEmpty onNew={() => void createComponent()} onFromPage={() => setPicking(true)} />;
  } else {
    const nothing =
      shown.length === 0 && query.trim() ? (
        <ComponentsNothingFound query={query} onClear={() => setQuery("")} onNew={(name) => void createComponent(name)} />
      ) : shown.length === 0 ? (
        <UI.Text size="sm" variant="muted" className="py-6" data-testid="blocks-tab-empty">
          {tab === "inUse" ? t("tabEmpty.inUse") : t("tabEmpty.notUsed")}
        </UI.Text>
      ) : undefined;
    content = (
      <BlocksList
        rows={shown}
        editHrefFor={(block) => componentEditorHref(block.id, workspaceId)}
        onUsage={setUsageOf}
        onDelete={setDeleting}
        onRename={setRenaming}
        onDuplicate={(row) => void duplicate(row)}
        onMove={setMoving}
        onCopyKey={(row) => void copyKey(row)}
        query={query}
        onQueryChange={setQuery}
        total={inTab.length}
        tabs={tabs}
        editorName={editorName}
        preview={preview}
        body={nothing}
      />
    );
  }

  const hasAny = all.length > 0;
  const actions = hasAny ? (
    <>
      <div className="flex gap-2 max-sm:hidden">
        <CreateButtons t={t} layout="header" onNew={() => void createComponent()} onFromPage={() => setPicking(true)} />
      </div>
      <div className="sm:hidden">
        <CreateButtons t={t} layout="phone" onNew={() => void createComponent()} onFromPage={() => setPicking(true)} />
      </div>
    </>
  ) : null;

  const routes = routesQuery.data;
  return (
    <UI.Box direction="column" data-testid="components-section">
      <ListPage title={title} description={t("intro")} actions={actions}>
        <UI.Box direction="column" gap={4} className="min-w-0" data-testid="blocks-tab" data-creating={creating ? "true" : undefined}>
          {content}
        </UI.Box>
      </ListPage>
      {usageOf ? <WhereUsed key={usageOf.id} block={usageOf} workspaceId={workspaceId} routes={routes} onClose={() => setUsageOf(null)} /> : null}
      {deleting ? (
        <DeleteBlockDialog key={deleting.id} block={deleting} workspaceId={workspaceId} routes={routes} onClose={() => setDeleting(null)} />
      ) : null}
      {moving ? (
        <MoveToGroupDialog
          key={moving.id}
          name={moving.name}
          current={blockGroupOf(moving)?.label ?? null}
          groups={groups}
          pending={meta.isPending}
          error={meta.isError ? t("toast.error") : null}
          onClose={() => {
            meta.reset();
            setMoving(null);
          }}
          onMove={(group) =>
            meta.mutate(
              { workspaceId, blockId: moving.id, version: moving.version ?? 1, patch: { group: group || null } },
              {
                onSuccess: () => {
                  toast.success(group ? t("toast.moved", { name: moving.name, group }) : t("toast.movedOut", { name: moving.name }));
                  setMoving(null);
                },
              }
            )
          }
        />
      ) : null}
      {renaming ? (
        <RenameComponentDialog
          key={renaming.id}
          name={renaming.name}
          pending={meta.isPending}
          error={meta.isError ? t("toast.error") : null}
          onClose={() => {
            meta.reset();
            setRenaming(null);
          }}
          onRename={(name) =>
            meta.mutate(
              { workspaceId, blockId: renaming.id, version: renaming.version ?? 1, patch: { name } },
              {
                onSuccess: () => {
                  toast.success(t("toast.renamed"));
                  setRenaming(null);
                },
              }
            )
          }
        />
      ) : null}
      {picking ? (
        <PickPageDialog onClose={() => setPicking(false)}>
          <PickPageBody
            routes={routes ?? []}
            loading={routesQuery.isLoading}
            hrefFor={(route) => `${pageEditorHref(route.id, workspaceId)}${workspaceId ? "&" : "?"}hint=${SAVE_COMPONENT_HINT}`}
          />
        </PickPageDialog>
      ) : null}
    </UI.Box>
  );
}
