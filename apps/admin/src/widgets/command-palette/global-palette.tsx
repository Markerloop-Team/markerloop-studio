"use client";

// Search ⌘K — one command palette for the whole product shell (EP-157, owner
// 29 Oct 2026; canvas «Classic sidebar», `classic-search`). Opened by the
// sidebar's «Search ⌘K» button, by ⌘K / Ctrl+K anywhere in the shell and by
// the phone top bar's search icon. It holds:
//   - sections (the menu items this person and this contour have),
//   - actions (New page, New collection, Upload files, Invite members),
//   - by name, in the current workspace: pages (a client filter of the
//     cached address list), components (the cached Components list),
//     collections and files (the services' `search` parameter).
// Enter navigates. Records and users are out of scope.
//
// One ⌘K meaning: this palette owns the shortcut everywhere in the shell. The
// collection workplace keeps its own palette (record commands) behind its
// «Commands» button only — it no longer listens to ⌘K.
//
// `paletteGroups` is the pure half: smoke:shell-layout runs it on fixed data.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Database, FileText, FolderOpen, Component as ComponentIcon, ArrowRight, Plus } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import type { ProductFeatures } from "@/shared/config/product-features";
import { useDormantSections } from "@/shared/config/dormant-sections-context";
import { useAuthStore } from "@/shared/store/auth-store";
import { useEntryWorkspaceId } from "@/features/pinned-feed";
import { useRoutes, useBlocks, type PagesRoute, type PagesBlock } from "@/entities/pages";
import { useCollections } from "@/entities/collections/collection";
import { useFiles } from "@/entities/files";
import { NAV_ITEMS, navHref, navItemName, visibleNavKeys } from "@/widgets/sidebar";
import { componentEditorHref, pageEditorHref } from "@/widgets/pages/page-hrefs";

/** How many hits of one kind the palette lists. */
export const PALETTE_GROUP_CAP = 5;

export type PaletteItem = { id: string; label: string; hint?: string; href: string };
export type PaletteGroupKey = "sections" | "actions" | "pages" | "components" | "collections" | "files";
export type PaletteGroup = { key: PaletteGroupKey; items: PaletteItem[] };

const withWs = (path: string, ws: string | null, extra?: Record<string, string>) => {
  const usp = new URLSearchParams(extra);
  if (ws) usp.set("ws", ws);
  const q = usp.toString();
  return q ? `${path}?${q}` : path;
};

const matches = (q: string, ...texts: Array<string | null | undefined>) => {
  const needle = q.trim().toLowerCase();
  return !needle || texts.some((t) => (t ?? "").toLowerCase().includes(needle));
};

/**
 * The palette's groups for a query. Sections and actions are always offered
 * (filtered by the query); pages, components, collections and files only
 * once something is typed. Empty groups are dropped.
 */
export function paletteGroups(input: {
  query: string;
  workspaceId: string | null;
  features: ProductFeatures;
  /** The menu items this person may open, with their labels. */
  sections: Array<{ key: string; label: string; href: string }>;
  labels: { newPage: string; newCollection: string; upload: string; members: string };
  routes?: readonly PagesRoute[];
  blocks?: readonly PagesBlock[];
  collections?: ReadonlyArray<{ id: string; name: string; key: string }>;
  files?: ReadonlyArray<{ id: string; filename?: string | null }>;
}): PaletteGroup[] {
  const { query, workspaceId: ws, features } = input;
  const typed = query.trim().length > 0;
  const actions: PaletteItem[] = [
    ...(features.pages ? [{ id: "new-page", label: input.labels.newPage, href: withWs("/pages", ws, { create: "1" }) }] : []),
    { id: "new-collection", label: input.labels.newCollection, href: withWs("/collections", ws, { create: "1" }) },
    { id: "upload", label: input.labels.upload, href: withWs("/files", ws) },
    { id: "members", label: input.labels.members, href: withWs("/settings/workspace", ws) },
  ];
  const groups: PaletteGroup[] = [
    { key: "sections", items: input.sections.filter((s) => matches(query, s.label)).map((s) => ({ id: s.key, label: s.label, href: s.href })) },
    { key: "actions", items: actions.filter((a) => matches(query, a.label)) },
  ];
  if (typed && ws) {
    if (features.pages) {
      groups.push({
        key: "pages",
        items: (input.routes ?? [])
          .filter((r) => matches(query, r.title, r.path))
          .slice(0, PALETTE_GROUP_CAP)
          .map((r) => ({ id: r.id, label: r.title?.trim() ? r.title : r.path, hint: r.path, href: pageEditorHref(r.id, ws) })),
      });
      groups.push({
        key: "components",
        items: (input.blocks ?? [])
          .filter((b) => matches(query, b.name, b.key))
          .slice(0, PALETTE_GROUP_CAP)
          .map((b) => ({ id: b.id, label: b.name || b.key, hint: b.key, href: componentEditorHref(b.id, ws) })),
      });
    }
    groups.push({
      key: "collections",
      items: (input.collections ?? [])
        .slice(0, PALETTE_GROUP_CAP)
        .map((c) => ({ id: c.id, label: c.name, hint: c.key, href: withWs(`/collections/${c.id}`, ws) })),
    });
    groups.push({
      key: "files",
      items: (input.files ?? [])
        .slice(0, PALETTE_GROUP_CAP)
        .map((f) => ({ id: f.id, label: f.filename || f.id, href: withWs("/files", ws, { file: f.id }) })),
    });
  }
  return groups.filter((g) => g.items.length > 0);
}

/** ⌘K / Ctrl+K toggles the palette while the shell is mounted. */
export function usePaletteHotkey(toggle: () => void): void {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const GROUP_ICON: Record<PaletteGroupKey, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  sections: ArrowRight,
  actions: Plus,
  pages: FileText,
  components: ComponentIcon,
  collections: Database,
  files: FolderOpen,
};

export function GlobalCommandPalette({
  open,
  onOpenChange,
  features,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  features: ProductFeatures;
}) {
  const t = useTranslations("shell.palette");
  const tNav = useTranslations("navigation");
  const router = useRouter();
  const dormant = useDormantSections();
  const roles = useAuthStore((s) => s.roles);
  const permissions = useAuthStore((s) => s.permissions);
  const ws = useEntryWorkspaceId();
  const [query, setQuery] = React.useState("");
  const typed = useDebounced(query.trim(), 250);
  const searching = open && typed.length > 0 && !!ws;

  // Lists the shell already caches; read only while the palette is open.
  const routes = useRoutes(open && features.pages ? ws : null).data;
  const blocks = useBlocks(open && features.pages && typed ? ws : null).data;
  const collections = useCollections(searching ? { workspace_id: ws as string, search: typed, limit: PALETTE_GROUP_CAP } : null).data?.data;
  const files = useFiles(searching ? { workspace_id: ws as string, search: typed, limit: PALETTE_GROUP_CAP } : null).data?.data;

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const visible = visibleNavKeys(features, dormant);
  const may = (permission: string | null) =>
    permission === null || roles.includes("superadmin") || permissions.includes(permission);
  const sections = NAV_ITEMS.filter((i) => visible.includes(i.key) && may(i.permission)).map((i) => ({
    key: i.key,
    label: tNav(navItemName(i.key) ?? i.key) as string,
    href: navHref(i, ws),
  }));

  const groups = paletteGroups({
    query,
    workspaceId: ws,
    features,
    sections,
    labels: { newPage: t("newPage"), newCollection: t("newCollection"), upload: t("upload"), members: t("members") },
    routes,
    blocks,
    // The service's answer is for the debounced query; shown only while it
    // still matches what is typed.
    collections: typed === query.trim() ? collections : undefined,
    files: typed === query.trim() ? files : undefined,
  });

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <UI.Command.Dialog open={open} onOpenChange={onOpenChange} title={t("title")} description={t("description")}>
      <UI.Command shouldFilter={false} data-testid="command-palette">
        <UI.Command.Input value={query} onValueChange={setQuery} placeholder={t("placeholder")} data-testid="command-palette-input" />
        <UI.Command.List>
          <UI.Command.Empty>{t("empty")}</UI.Command.Empty>
          {groups.map((group) => {
            const Icon = GROUP_ICON[group.key];
            return (
              <UI.Command.Group key={group.key} heading={t(`groups.${group.key}`)} data-palette-group={group.key}>
                {group.items.map((item) => (
                  <UI.Command.Item
                    key={`${group.key}:${item.id}`}
                    value={`${group.key}:${item.id}`}
                    onSelect={() => go(item.href)}
                    data-palette-item={`${group.key}:${item.id}`}
                  >
                    <Icon size={16} aria-hidden={true} />
                    <span className="min-w-0 truncate">{item.label}</span>
                    {item.hint && item.hint !== item.label ? (
                      <span className="ml-auto min-w-0 truncate font-mono text-xs text-muted-foreground">{item.hint}</span>
                    ) : null}
                  </UI.Command.Item>
                ))}
              </UI.Command.Group>
            );
          })}
        </UI.Command.List>
      </UI.Command>
    </UI.Command.Dialog>
  );
}
