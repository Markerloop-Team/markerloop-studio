"use client";

// The dialogs of the Components section (EP-175, layer 6; approved mock
// docs/redesign-layer-6-components-final-2026-10-30, screens 05 and 06):
// Move to group, Rename, Where used, and «Save from a page»'s page picker.
// Each body is a component of its own — the kit's Dialog.Content is
// portalled and renders nothing under react-dom/server, so the bodies are
// what a smoke executes.

import * as React from "react";
import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { SaunaGroupField } from "@markerloop/studio";

import { useTranslations } from "@/shared/hooks";
import type { PagesBlockUsage, PagesRoute } from "@/entities/pages";
import { pageEditorHref } from "./page-hrefs";

type Translate = ReturnType<typeof useTranslations>;

/* ------------------------------------------------------------ group field */

/** The Group field with the section's copy — one behaviour everywhere (studio's SaunaGroupField). */
export function ComponentGroupField({
  groups,
  value,
  onChange,
  disabled,
  defaultOpen,
  id,
}: {
  groups: readonly string[];
  value: string;
  onChange: (group: string) => void;
  disabled?: boolean;
  defaultOpen?: boolean;
  id?: string;
}) {
  const t = useTranslations("pages.blocks");
  return (
    <SaunaGroupField
      id={id}
      groups={groups}
      value={value}
      onChange={onChange}
      disabled={disabled}
      defaultOpen={defaultOpen}
      label={t("group.label")}
      placeholder={t("noGroup")}
      inputTestId="group-picker-input"
      createTestId="group-picker-create"
      texts={{
        noGroup: t("noGroup"),
        create: (group) => t("group.create", { group }),
        hint: t("group.hint"),
        empty: t("group.empty"),
      }}
    />
  );
}

/* ------------------------------------------------------------ move */

export function MoveToGroupBody({
  name,
  current,
  groups,
  pending = false,
  error,
  initialValue,
  defaultOpen = true,
  onCancel,
  onMove,
}: {
  name: string;
  /** The Component's group now; null — no group. */
  current: string | null;
  groups: readonly string[];
  pending?: boolean;
  error?: string | null;
  /** What the field starts with (default: the current group). */
  initialValue?: string;
  defaultOpen?: boolean;
  onCancel: () => void;
  /** The group to set; "" — no group. */
  onMove: (group: string) => void;
}) {
  const t = useTranslations("pages.blocks");
  const [value, setValue] = React.useState(initialValue ?? current ?? "");
  const unchanged = value.trim() === (current ?? "");
  return (
    <UI.Box direction="column" gap={4} className="min-w-0" data-testid="move-body">
      <UI.Text size="sm" variant="muted">
        {t("move.now", { group: current ?? t("noGroup") })}
      </UI.Text>
      <UI.Box direction="column" gap={1.5} className="min-w-0">
        <label className="text-sm font-medium" htmlFor="move-group">
          {t("move.label")}
        </label>
        <ComponentGroupField id="move-group" groups={groups} value={value} onChange={setValue} disabled={pending} defaultOpen={defaultOpen} />
      </UI.Box>
      {error ? (
        <UI.Alert variant="destructive" data-testid="move-error">
          <UI.Text as="span" size="sm">
            {error}
          </UI.Text>
        </UI.Alert>
      ) : null}
      <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
        <UI.Button variant="ghost" onClick={onCancel} disabled={pending} data-testid="move-cancel">
          {t("move.cancel")}
        </UI.Button>
        <UI.Button onClick={() => onMove(value.trim())} disabled={pending || unchanged} data-testid="move-confirm">
          {pending ? t("move.moving") : t("move.confirm")}
        </UI.Button>
      </UI.Box>
      <span className="sr-only">{name}</span>
    </UI.Box>
  );
}

export function MoveToGroupDialog({
  name,
  current,
  groups,
  pending,
  error,
  onClose,
  onMove,
}: {
  name: string;
  current: string | null;
  groups: readonly string[];
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onMove: (group: string) => void;
}) {
  const t = useTranslations("pages.blocks");
  return (
    <UI.Dialog.Root open onOpenChange={(open) => (open || pending ? undefined : onClose())}>
      <UI.Dialog.Content
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[460px]"
        data-testid="move-dialog"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title className="break-words">{t("move.title", { name })}</UI.Dialog.Title>
          <UI.Dialog.Description className="sr-only">{t("group.hint")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <MoveToGroupBody name={name} current={current} groups={groups} pending={pending} error={error} onCancel={onClose} onMove={onMove} />
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

/* ------------------------------------------------------------ rename */

export function RenameComponentDialog({
  name,
  pending,
  error,
  onClose,
  onRename,
}: {
  name: string;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onRename: (name: string) => void;
}) {
  const t = useTranslations("pages.blocks");
  const [value, setValue] = React.useState(name);
  const next = value.trim();
  const submit = () => {
    if (next && next !== name && !pending) onRename(next);
  };
  return (
    <UI.Dialog.Root open onOpenChange={(open) => (open || pending ? undefined : onClose())}>
      <UI.Dialog.Content className="sm:max-w-[420px]" data-testid="rename-dialog">
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title>{t("rename.title")}</UI.Dialog.Title>
          <UI.Dialog.Description className="sr-only">{name}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <UI.Box direction="column" gap={1.5} className="min-w-0">
          <label className="text-sm font-medium" htmlFor="rename-component">
            {t("rename.label")}
          </label>
          <UI.FormControl.Input
            id="rename-component"
            value={value}
            maxLength={200}
            disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            data-testid="rename-input"
          />
        </UI.Box>
        {error ? (
          <UI.Alert variant="destructive" data-testid="rename-error">
            <UI.Text as="span" size="sm">
              {error}
            </UI.Text>
          </UI.Alert>
        ) : null}
        <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
          <UI.Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("move.cancel")}
          </UI.Button>
          <UI.Button onClick={submit} disabled={pending || !next || next === name} data-testid="rename-confirm">
            {pending ? t("rename.saving") : t("rename.confirm")}
          </UI.Button>
        </UI.Box>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

/* ------------------------------------------------------------ where used */

/** Published / Draft by the address the page sits at. */
function PageStatus({ published, t }: { published: boolean | null; t: Translate }) {
  if (published === null) return <span />;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" data-testid="usage-status" data-published={published ? "true" : "false"}>
      <span className={`size-2 rounded-full ${published ? "bg-success" : "bg-muted-foreground/40"}`} aria-hidden="true" />
      {published ? t("where.published") : t("where.draft")}
    </span>
  );
}

/**
 * The places of a Component, one row per page: title and address, the
 * page's publish status (its address in the routes list) and the open icon
 * into the page editor; then the other Components that place it. Shared by
 * «Where used» and the delete question (testIdPrefix keeps their hooks apart).
 */
export function ComponentUsageRows({
  usage,
  workspaceId,
  routes,
  testIdPrefix = "usage",
}: {
  usage: PagesBlockUsage;
  workspaceId: string;
  /** The workspace's addresses, for the status column; absent — no status. */
  routes?: readonly PagesRoute[];
  testIdPrefix?: "usage" | "delete-usage";
}) {
  const t = useTranslations("pages.blocks");
  const statusOf = (routeId: string): boolean | null => {
    const route = routes?.find((r) => r.id === routeId);
    return route ? route.status === "published" : null;
  };
  return (
    <UI.Box direction="column" gap={0} className="min-w-0" data-testid={`${testIdPrefix}s`}>
      {usage.pages.map((p, index) => {
        const href = pageEditorHref(p.route_id, workspaceId);
        return (
          <div
            key={p.id}
            className={`grid min-w-0 grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-3 py-2.5 ${index > 0 ? "border-t border-border" : ""}`}
            data-testid={`${testIdPrefix}-page`}
            data-page={p.id}
          >
            <UI.Box direction="column" gap={0.5} className="min-w-0">
              <UI.Text as="span" size="sm" weight="medium" className="truncate">
                {p.title || p.path}
              </UI.Text>
              <Link
                href={href}
                className="truncate font-mono text-xs text-muted-foreground underline-offset-4 hover:underline"
                data-testid={`${testIdPrefix}-link`}
              >
                {p.path}
              </Link>
            </UI.Box>
            <PageStatus published={statusOf(p.route_id)} t={t} />
            <UI.Button asChild variant="ghost" size="icon" className="size-8">
              <Link href={href} aria-label={t("where.openPage", { title: p.title || p.path })} title={t("where.openPage", { title: p.title || p.path })} data-testid={`${testIdPrefix}-open`}>
                <ExternalLink size={14} aria-hidden="true" />
              </Link>
            </UI.Button>
          </div>
        );
      })}
      {usage.blocks.map((b, index) => (
        <div
          key={b.id}
          className={`flex min-w-0 items-center gap-2 py-2.5 ${index > 0 || usage.pages.length > 0 ? "border-t border-border" : ""}`}
          data-testid={`${testIdPrefix}-block`}
        >
          <UI.Text as="span" size="sm" className="truncate">
            {b.name}
          </UI.Text>
        </div>
      ))}
    </UI.Box>
  );
}

export function WhereUsedBody({
  usage,
  loading,
  failed,
  workspaceId,
  routes,
}: {
  usage: PagesBlockUsage | null;
  loading: boolean;
  failed: boolean;
  workspaceId: string;
  routes?: readonly PagesRoute[];
}) {
  const t = useTranslations("pages.blocks");
  return (
    <UI.Box direction="column" gap={3} className="min-w-0">
      <div className="flex flex-wrap items-center gap-2" data-testid="usage-summary">
        {loading ? (
          <UI.Text size="sm" variant="muted">
            {t("usage.loading")}
          </UI.Text>
        ) : failed ? (
          <UI.Text size="sm" variant="muted">
            {t("errors.usage")}
          </UI.Text>
        ) : usage && usage.count > 0 ? (
          <>
            <UI.Badge variant="secondary" data-testid="usage-pages">
              {t("where.pages", { count: usage.pages.length })}
            </UI.Badge>
            {usage.blocks.length > 0 ? (
              <UI.Badge variant="secondary" data-testid="usage-components">
                {t("where.components", { count: usage.blocks.length })}
              </UI.Badge>
            ) : null}
          </>
        ) : (
          <UI.Text size="sm" variant="muted">
            {t("where.none")}
          </UI.Text>
        )}
      </div>
      {usage && usage.count > 0 ? <ComponentUsageRows usage={usage} workspaceId={workspaceId} routes={routes} /> : null}
    </UI.Box>
  );
}

export function WhereUsedDialog({
  name,
  onClose,
  children,
}: {
  name: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("pages.blocks");
  // «Where used» is for looking: no Edit or Delete in it (mock screen 06).
  // The testid stays `usage-sheet` — the specs that open it predate the dialog.
  return (
    <UI.Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <UI.Dialog.Content
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[560px]"
        data-testid="usage-sheet"
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
      >
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title className="break-words">{t("where.title", { name })}</UI.Dialog.Title>
          <UI.Dialog.Description className="sr-only">{t("usage.pages")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        {children}
        <UI.Box direction="row" justify="end" fullWidth>
          <UI.Button variant="outline" onClick={onClose} data-testid="usage-close">
            {t("where.close")}
          </UI.Button>
        </UI.Box>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

/* ------------------------------------------------------------ pick a page */

/** Addresses whose path or title holds the query. */
export function filterRoutes(routes: readonly PagesRoute[], query: string): PagesRoute[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...routes];
  return routes.filter((r) => r.path.toLowerCase().includes(q) || (r.title ?? "").toLowerCase().includes(q));
}

export function PickPageBody({
  routes,
  loading,
  hrefFor,
}: {
  routes: readonly PagesRoute[];
  loading: boolean;
  hrefFor: (route: PagesRoute) => string;
}) {
  const t = useTranslations("pages.blocks");
  const [query, setQuery] = React.useState("");
  const shown = filterRoutes(routes, query);
  return (
    <UI.Box direction="column" gap={3} className="min-w-0" data-testid="pick-page-body">
      <UI.FormControl.SearchField value={query} onChange={setQuery} placeholder={t("pick.search")} ariaLabel={t("pick.search")} clearLabel={t("nothing.clear")} />
      <UI.Box direction="column" gap={0} className="max-h-[50dvh] min-w-0 overflow-y-auto">
        {loading ? (
          <UI.Text size="sm" variant="muted">
            {t("pick.loading")}
          </UI.Text>
        ) : routes.length === 0 ? (
          <UI.Text size="sm" variant="muted">
            {t("pick.none")}
          </UI.Text>
        ) : shown.length === 0 ? (
          <UI.Text size="sm" variant="muted">
            {t("pick.nothing", { query: query.trim() })}
          </UI.Text>
        ) : (
          shown.map((route, index) => (
            <Link
              key={route.id}
              href={hrefFor(route)}
              className={`flex min-w-0 items-center gap-3 rounded-md px-2 py-2.5 hover:bg-accent ${index > 0 ? "border-t border-border" : ""}`}
              data-testid="pick-page"
              data-route={route.id}
            >
              <FileText size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{route.title || route.path}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{route.path}</span>
              </span>
            </Link>
          ))
        )}
      </UI.Box>
    </UI.Box>
  );
}

export function PickPageDialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const t = useTranslations("pages.blocks");
  return (
    <UI.Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <UI.Dialog.Content className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[520px]" data-testid="pick-page-dialog">
        <UI.Dialog.Header className="pr-8 max-sm:text-left">
          <UI.Dialog.Title>{t("pick.title")}</UI.Dialog.Title>
          <UI.Dialog.Description>{t("pick.description")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        {children}
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}
