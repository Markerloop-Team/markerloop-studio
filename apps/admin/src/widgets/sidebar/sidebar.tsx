"use client";

// The product shell's menu (EP-157, owner-approved 29 Oct 2026), laid out
// after the canvas «Classic sidebar» (design-system/_canvas/classic-shell.tsx):
// the workspace on top, then Home, the groups Site / Data / Workspace, the
// pinned pages, «Admin tools», and the account at the bottom. Collapsing hides
// it ENTIRELY on desktop (no icon rail — the canvas model); below `lg` the
// same body slides in from the left.

import { useHasPermission, useHasAnyPermission, useTranslations } from "@/shared/hooks";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useId } from "react";
import {
  BookOpen,
  Bell,
  Bot,
  Component,
  CreditCard,
  Database,
  FileSignature,
  FileText,
  FolderOpen,
  House,
  Inbox,
  Key,
  Palette,
  Search,
  Shield,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { Badge, Box, Button, Separator, Sheet, Text } from "@markerloop/ui/ui";
import type { LucideIcon } from "lucide-react";
import { PRODUCT_HOME } from "@/shared/config/product-routes";
import type { DormantSections, ProductFeatures } from "@/shared/config/product-features";
import { DORMANT_SECTIONS_HIDDEN, useDormantSections } from "@/shared/config/dormant-sections-context";
import { useEntryWorkspaceId, usePinnedEntries, type PinnedEntry } from "@/features/pinned-feed";
import { useWorkspaces } from "@/entities/collections/workspace";
import { useWorkspaceCounts, type WorkspaceCounts } from "@/entities/usage";
import { useAuthStore } from "@/shared/store/auth-store";
import { BrandMark } from "@/shared/components/brand-mark";
import { pageViewHref } from "@/widgets/pages/page-hrefs";
import { ShellWorkspaceSwitcher } from "./shell-workspace-switcher";
import { ShellUserMenu } from "./user-menu";

/**
 * Where an item sits: "home" on top, the three product groups of the canvas,
 * then «Admin tools» (SDL-768) after the pinned pages.
 */
export type NavGroup = "home" | "site" | "data" | "workspace" | "admin";

/** The product groups in menu order, each under its label. */
export const PRODUCT_GROUPS: ReadonlyArray<Exclude<NavGroup, "home" | "admin">> = ["site", "data", "workspace"];

const GROUP_LABEL: Record<(typeof PRODUCT_GROUPS)[number], string> = {
  site: "groupSite",
  data: "groupData",
  workspace: "groupWorkspace",
};

type NavItem = {
  key: string;
  name: string;
  /** May carry `?tab=` — the item then stands for that tab of its screen. */
  href: string;
  icon: LucideIcon;
  permission: string | null; // null = доступно всем авторизованным
  group: NavGroup;
  /**
   * Runtime section flag (SDL-635): the item is drawn only when this flag is
   * on for the contour. Absent = the section exists everywhere.
   */
  feature?: keyof ProductFeatures;
  /**
   * Dormant section (SDL-768): drawn only when the contour brings it back.
   * The route stays served either way — only the way in is hidden.
   */
  dormant?: keyof DormantSections;
  /** The number next to the item, from the cached usage reads. */
  count?: keyof WorkspaceCounts;
};

const navigation: NavItem[] = [
  // SDL-607: the product lives at the domain root; its home is /dashboard
  // because `/` belongs to the landing on prod. The key stays "dashboard":
  // e2e addresses the item by it.
  { key: "dashboard", name: "home", href: PRODUCT_HOME, icon: House, permission: null, group: "home" },
  // Site — pages-service, shown only where it is deployed (SDL-635).
  { key: "pages", name: "pages", href: "/pages", icon: FileText, permission: null, group: "site", feature: "pages", count: "pages" },
  // The workspace's Components (EP-157): their own section since the owner's
  // decision of 29 Oct 2026 (the Blocks tab of /pages before).
  { key: "components", name: "components", href: "/components", icon: Component, permission: null, group: "site", feature: "pages" },
  // The site theme editor (EP-187, layer 5): full-screen at /theme, in the
  // editor frame; live only where the pages section is.
  { key: "theme", name: "theme", href: "/theme", icon: Palette, permission: null, group: "site", feature: "pages" },
  // Data — collections and files are open to every signed-in person; the
  // services check membership (gateway Required:false).
  { key: "collections", name: "collections", href: "/collections", icon: Database, permission: null, group: "data", count: "collections" },
  { key: "files", name: "files", href: "/files", icon: FolderOpen, permission: null, group: "data", count: "files" },
  // Workspace — two tabs of the workspace settings. No «Settings» item: the
  // general tab is not live (owner, 29 Oct 2026).
  { key: "members", name: "members", href: "/settings/workspace", icon: UserRound, permission: null, group: "workspace" },
  { key: "plan", name: "plan", href: "/settings/workspace?tab=plan", icon: CreditCard, permission: null, group: "workspace" },
  { key: "users", name: "users", href: "/users", icon: Users, permission: "users:read:all", group: "admin" },
  { key: "roles", name: "roles", href: "/roles", icon: Shield, permission: "roles:read:all", group: "admin" },
  { key: "permissions", name: "permissions", href: "/permissions", icon: Key, permission: "permissions:read:all", group: "admin" },
  { key: "dictionary", name: "dictionary", href: "/dictionary", icon: BookOpen, permission: "users:read:all", group: "admin" },
  // SDL-752: the journal of rule acceptances. Its own right, held by the
  // gateway and absent from the seed — only superadmin sees the item today.
  { key: "policyAcceptances", name: "policyAcceptances", href: "/policy-acceptances", icon: FileSignature, permission: "users:read:policy_acceptances", group: "admin" },
  // SDL-768: hidden until rethought (owner's run-through, 9 Oct 2026) — the
  // pages are "coming soon" stubs. Kept, with their routes, behind flags.
  { key: "notifications", name: "notifications", href: "/notifications", icon: Bell, permission: "users:read:all", group: "admin", dormant: "notifications" },
  { key: "telegramBot", name: "telegramBot", href: "/telegram-bot", icon: Bot, permission: "users:read:all", group: "admin", dormant: "telegramBot" },
];

/** The menu as data: key, group, href — what smoke:shell-layout pins. */
export const NAV_ITEMS: ReadonlyArray<Pick<NavItem, "key" | "group" | "href" | "permission" | "feature" | "dormant">> =
  navigation.map(({ key, group, href, permission, feature, dormant }) => ({ key, group, href, permission, feature, dormant }));

/**
 * Пункты, которые этот контур вообще показывает (SDL-635): раздел за
 * выключенным флагом исчезает из меню целиком, а не рисуется ссылкой в 404.
 * Спящий раздел (SDL-768) — так же, пока контур его не вернул; по умолчанию
 * спящие скрыты. Права (`permission`) проверяются позже, в самом пункте, —
 * это другой слой.
 */
export function visibleNavKeys(
  features: ProductFeatures,
  dormant: DormantSections = DORMANT_SECTIONS_HIDDEN
): string[] {
  return navigation
    .filter((item) => !item.feature || features[item.feature])
    .filter((item) => !item.dormant || dormant[item.dormant])
    .map((item) => item.key);
}

/** The catalogue key (navigation.*) of an item's label. */
export function navItemName(key: string): string | null {
  return navigation.find((item) => item.key === key)?.name ?? null;
}

/** Ключи пунктов группы «Admin tools» (SDL-768), в порядке меню. */
export const ADMIN_TOOLS_KEYS: string[] = navigation.filter((item) => item.group === "admin").map((item) => item.key);

/** The path of an item's href, without its `?tab=`. */
export function hrefPath(href: string): string {
  return href.split("?")[0];
}

/** The tab an item stands for (`?tab=` of its href), null for a whole screen. */
export function hrefTab(href: string): string | null {
  const query = href.split("?")[1];
  return query ? new URLSearchParams(query).get("tab") : null;
}

/** Все пути навигации (без вкладок) — база для выбора активного пункта. */
export const NAV_HREFS: string[] = [...new Set(navigation.map((item) => hrefPath(item.href)))];

/** Маршрут покрывает страницу: он сам или её родитель. */
export function matchesHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Какой путь навигации подсвечивается на этом маршруте — ровно один.
 *
 * Правило — самое длинное совпадение по сегментам: корневой пункт выигрывает
 * только на самом себе, а раздел с вложенностью продолжает подсвечиваться на
 * своих внутренних страницах (аудит EP-51, кластер C, SDL-456).
 */
export function activeHref(pathname: string, hrefs: string[] = NAV_HREFS): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    if (!matchesHref(pathname, href)) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}

/**
 * The one active item (EP-157). Several items share a path when they are tabs
 * of one screen (Members, Plan and Theme of /settings/workspace): a tab item
 * is active only on its own tab, and the item without a tab stands for every
 * other tab of that screen. Longest path first, as `activeHref`.
 */
export function activeNavKey(
  pathname: string,
  tab: string | null,
  items: ReadonlyArray<Pick<NavItem, "key" | "href">> = navigation
): string | null {
  const path = activeHref(pathname, [...new Set(items.map((i) => hrefPath(i.href)))]);
  if (path === null) return null;
  const onPath = items.filter((i) => hrefPath(i.href) === path);
  const byTab = onPath.find((i) => hrefTab(i.href) !== null && hrefTab(i.href) === tab);
  if (byTab) return byTab.key;
  return onPath.find((i) => hrefTab(i.href) === null)?.key ?? null;
}

/**
 * The view screen of a pinned page (SDL-645) is ITS entry: there the pinned
 * item is the one active item, and "Pages" is not — one highlight, as on
 * canvas A (/design-system/feed, `activeKey="messages"`).
 */
export function pinnedViewRouteId(pathname: string | null): string | null {
  const m = /^\/pages\/([^/]+)\/view\/?$/.exec(pathname ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

export type SidebarProps = {
  /**
   * Runtime section flags of the contour (SDL-635). Required on purpose: the
   * server layout reads them from the pod env, and a caller that forgot to
   * pass them must fail type-check rather than silently show every section.
   */
  features: ProductFeatures;
  /** Desktop menu hidden entirely (EP-157); the toggle lives in the top bar. */
  collapsed: boolean;
  /** Kept for callers of the old rail; the toggle is the top bar's now. */
  onToggleCollapsed?: () => void;
  /** Открыт ли выдвижной вариант меню. Значим только ниже `lg`. */
  mobileOpen: boolean;
  onCloseMobile: () => void;
  /**
   * Куда вернуть фокус после закрытия выдвижного меню — кнопка меню в
   * верхней строке. Radix возвращает фокус только на `Sheet.Trigger`, а
   * триггера здесь нет (SDL-482).
   */
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  /** Opens the command palette (the «Search ⌘K» button). Absent = no button. */
  onOpenSearch?: () => void;
};

/**
 * A product section opened from the menu keeps the current workspace
 * (SDL-753): without ?ws= every section falls back to the FIRST workspace,
 * and a choice made in the shell switcher was lost on the next click.
 * Admin sections (behind a permission) are not workspace-scoped.
 */
export function navHref(item: Pick<NavItem, "href" | "permission">, workspaceId: string | null): string {
  if (item.permission !== null || !workspaceId) return item.href;
  const sep = item.href.includes("?") ? "&" : "?";
  return `${item.href}${sep}ws=${encodeURIComponent(workspaceId)}`;
}

/** Drawer rows: at least 36px tall — a finger target (SDL-645), over the kit's sm 32px. */
export const TOUCH_ROW = "min-h-9";

function NavItemButton({
  item,
  activeKey,
  onNavigate,
  workspaceId,
  count = null,
  touch = false,
}: {
  item: NavItem;
  activeKey: string | null;
  onNavigate: () => void;
  workspaceId: string | null;
  count?: number | null;
  /** The phone drawer: a 36px tap target (SDL-645); the desktop rail keeps the canvas's 32px. */
  touch?: boolean;
}) {
  const t = useTranslations("navigation");
  const hasAccess = useHasPermission(item.permission || "");

  // null permission = доступно всем, иначе проверяем
  if (item.permission !== null && !hasAccess) return null;

  const isActive = activeKey === item.key;
  const Icon = item.icon;

  return (
    <Button
      asChild
      fullWidth
      size="sm"
      variant={isActive ? "secondary" : "ghost"}
      suppressHydrationWarning
    >
      <Link
        href={navHref(item, workspaceId)}
        // Stable e2e hook: every in-app link starts with "/", so a selector
        // by href prefix would also catch the switcher and the account.
        data-nav-item={item.key}
        aria-current={isActive ? "page" : undefined}
        className={`justify-start gap-2.5 px-2 ${touch ? TOUCH_ROW : ""} ${isActive ? "" : "text-muted-foreground hover:text-foreground"}`}
        onClick={onNavigate}
      >
        <Icon size={16} aria-hidden="true" />
        <Text as="span" size="sm" className="min-w-0 truncate">
          {t(item.name) as string}
        </Text>
        {count !== null ? (
          <span className="ml-auto font-mono text-caption text-muted-foreground" data-nav-count={item.key}>
            {count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

function GroupLabel({ id, children, testId }: { id?: string; children: React.ReactNode; testId?: string }) {
  return (
    <Text
      as="span"
      id={id}
      size="xs"
      weight="medium"
      variant="muted"
      className="px-2 pb-1 pt-3 tracking-wide"
      data-testid={testId}
    >
      {children}
    </Text>
  );
}

/**
 * Закреплённые страницы (SDL-645, EP-130) — отдельной группой ПОД разделами,
 * как на канвасе A: раздел — место работы продукта, закреплённая страница —
 * место, куда человек сам решил ходить каждый день. Пункт открывает экран
 * просмотра (SDL-643), а не редактор. Число — только непрочитанное ленты на
 * этой странице; ноль и неизвестное число не рисуются.
 */
export function PinnedNav({
  entries,
  workspaceId,
  onNavigate,
  activeRouteId,
  touch = false,
}: {
  entries: PinnedEntry[];
  workspaceId: string | null;
  /** Kept for callers of the old rail: the menu no longer collapses to icons. */
  collapsed?: boolean;
  onNavigate: () => void;
  activeRouteId: string | null;
  /** The phone drawer: 36px rows, see TOUCH_ROW. */
  touch?: boolean;
}) {
  const t = useTranslations("navigation");
  if (entries.length === 0) return null;

  return (
    <Box direction="column" gap={0.5} data-testid="nav-pinned">
      <GroupLabel>{t("pinned") as string}</GroupLabel>
      {entries.map((entry) => {
        const isActive = entry.route.id === activeRouteId;
        const Icon = entry.hasFeed ? Inbox : FileText;
        return (
          <Button key={entry.route.id} asChild fullWidth size="sm" variant={isActive ? "secondary" : "ghost"}>
            <Link
              href={pageViewHref(entry.route.id, workspaceId)}
              data-nav-pinned={entry.route.id}
              aria-current={isActive ? "page" : undefined}
              className={`justify-start gap-2.5 px-2 ${touch ? TOUCH_ROW : ""} ${isActive ? "" : "text-muted-foreground hover:text-foreground"}`}
              title={entry.label}
              onClick={onNavigate}
            >
              <Icon size={16} aria-hidden="true" />
              <Text as="span" size="sm" className="min-w-0 truncate">
                {entry.label}
              </Text>
              {entry.badge !== null ? (
                <Badge
                  variant="secondary"
                  className="ml-auto"
                  data-testid="nav-pinned-count"
                  aria-label={t("pinnedUnreadAria", { count: entry.badge }) as string}
                >
                  {entry.badge}
                </Badge>
              ) : null}
            </Link>
          </Button>
        );
      })}
    </Box>
  );
}

/**
 * «Admin tools» (SDL-768): администрирование платформы — отдельной группой под
 * разделителем кита, после разделов продукта и закреплённых страниц. Обычный
 * пользователь не видит ни одного пункта группы, поэтому не видит и её саму.
 */
function AdminToolsNav({
  items,
  activeKey,
  onNavigate,
  workspaceId,
  touch = false,
}: {
  items: NavItem[];
  activeKey: string | null;
  onNavigate: () => void;
  /** Passed through to navHref; admin items carry a permission, so no ?ws= (SDL-753). */
  workspaceId: string | null;
  touch?: boolean;
}) {
  const t = useTranslations("navigation");
  const labelId = useId();
  const canSeeAny = useHasAnyPermission(items.map((item) => item.permission ?? ""));
  if (items.length === 0 || !canSeeAny) return null;

  return (
    <Box
      direction="column"
      gap={0.5}
      role="group"
      aria-labelledby={labelId}
      className="mt-3"
      data-testid="nav-admin-tools"
    >
      <Separator className="mb-1" />
      <GroupLabel id={labelId} testId="nav-admin-tools-label">
        {t("adminTools") as string}
      </GroupLabel>
      {items.map((item) => (
        <NavItemButton
          key={item.key}
          item={item}
          activeKey={activeKey}
          onNavigate={onNavigate}
          workspaceId={workspaceId}
          touch={touch}
        />
      ))}
    </Box>
  );
}

/**
 * The body of the menu — one for the desktop sidebar and for the phone
 * drawer, as on the canvas (SidebarBody there). `counts`: the numbers next to
 * items, desktop only (the canvas drops them in the drawer).
 */
function SidebarBody({
  features,
  onNavigate,
  counts,
  onOpenSearch,
  touch = false,
}: {
  features: ProductFeatures;
  onNavigate: () => void;
  counts: boolean;
  onOpenSearch?: () => void;
  /** The phone drawer: rows are a 36px tap target (SDL-645). */
  touch?: boolean;
}) {
  const t = useTranslations("navigation");
  const tShell = useTranslations("shell");
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const visible = visibleNavKeys(features, useDormantSections());
  const shown = navigation.filter((item) => visible.includes(item.key));
  const pinnedRouteId = features.pages ? pinnedViewRouteId(pathname) : null;
  // The current workspace (?ws=, else the first): the menu links carry it
  // (SDL-753); pinned pages exist only where pages-service does (SDL-635).
  const workspaceId = useEntryWorkspaceId();
  const userId = useAuthStore((s) => s.userId);
  const workspace = (useWorkspaces({ enabled: !!userId }).data ?? []).find((w) => w.id === workspaceId) ?? null;
  const numbers = useWorkspaceCounts(counts ? workspace : null, { pages: features.pages, userId });
  const { entries: pinned } = usePinnedEntries(workspaceId, features.pages);
  const pinnedActive = pinnedRouteId !== null && pinned.some((e) => e.route.id === pinnedRouteId);
  const activeKey = pinnedActive ? null : activeNavKey(pathname, searchParams?.get("tab") ?? null, shown);

  const item = (it: NavItem) => (
    <NavItemButton
      key={it.key}
      item={it}
      activeKey={activeKey}
      onNavigate={onNavigate}
      workspaceId={workspaceId}
      count={counts && it.count ? numbers[it.count] : null}
      touch={touch}
    />
  );

  return (
    <Box direction="column" gap={1} fullHeight className="min-h-0 w-full p-2.5">
      <Box direction="row" align="center" gap={1} className="shrink-0">
        <BrandMark className="ml-1 h-3.5 w-7 shrink-0" />
        <Box grow className="min-w-0">
          <ShellWorkspaceSwitcher onNavigate={onNavigate} />
        </Box>
      </Box>

      {onOpenSearch ? (
        <Button
          variant="outline"
          fullWidth
          className="mt-1 h-8 shrink-0 justify-start bg-background px-2 font-normal text-muted-foreground"
          aria-keyshortcuts="Meta+K Control+K"
          data-testid="shell-search"
          onClick={onOpenSearch}
        >
          <Search size={16} aria-hidden="true" />
          {tShell("search")}
          {counts ? (
            <kbd className="ml-auto rounded border border-border px-1 font-mono text-caption">⌘K</kbd>
          ) : null}
        </Button>
      ) : null}

      <Box
        as="nav"
        role="navigation"
        aria-label={tShell("navLabel")}
        grow
        direction="column"
        className="min-h-0 overflow-y-auto"
      >
        <Box direction="column" gap={0.5} className="pt-2" data-testid="nav-group-home">
          {shown.filter((it) => it.group === "home").map(item)}
        </Box>
        {PRODUCT_GROUPS.map((group) => {
          const items = shown.filter((it) => it.group === group);
          if (items.length === 0) return null;
          return (
            <Box key={group} direction="column" gap={0.5} data-testid={`nav-group-${group}`}>
              <GroupLabel>{t(GROUP_LABEL[group]) as string}</GroupLabel>
              {items.map(item)}
            </Box>
          );
        })}
        <PinnedNav
          entries={features.pages ? pinned : []}
          workspaceId={workspaceId}
          onNavigate={onNavigate}
          activeRouteId={pinnedRouteId}
          touch={touch}
        />
        <AdminToolsNav
          items={shown.filter((it) => it.group === "admin")}
          activeKey={activeKey}
          onNavigate={onNavigate}
          workspaceId={workspaceId}
          touch={touch}
        />
      </Box>

      <Box className="shrink-0 border-t border-border pt-1">
        <ShellUserMenu onNavigate={onNavigate} />
      </Box>
    </Box>
  );
}

export function Sidebar({
  features,
  collapsed,
  mobileOpen,
  onCloseMobile,
  restoreFocusRef,
  onOpenSearch,
}: SidebarProps) {
  const tCommon = useTranslations("common");
  const tShell = useTranslations("shell");

  return (
    <>
      {/*
        Desktop sidebar: in the flow, 240px, on a lightly tinted background.
        Collapsed = not rendered at all (the canvas model). Below `lg` it is
        never on screen — the drawer below carries the same body.
      */}
      {!collapsed ? (
        <Box
          as="aside"
          data-testid="admin-sidebar"
          className="hidden w-60 shrink-0 border-r border-border bg-muted/40 lg:flex"
        >
          <SidebarBody features={features} onNavigate={() => {}} counts onOpenSearch={onOpenSearch} />
        </Box>
      ) : null}

      {/*
        Выдвижное меню ниже `lg` — Sheet кита поверх Radix Dialog (SDL-482):
        подложку, Escape, тап вне панели, ловушку фокуса даёт Radix. Возврат
        фокуса — явно на `restoreFocusRef`: триггера у Sheet здесь нет, кнопка
        меню живёт в верхней строке.
      */}
      <Sheet open={mobileOpen} onOpenChange={(open) => (open ? undefined : onCloseMobile())}>
        <Sheet.Content
          side="left"
          data-testid="mobile-nav-panel"
          showCloseButton={false}
          className="gap-0 bg-background p-0 data-[side=left]:w-[300px] lg:hidden"
          onCloseAutoFocus={(event) => {
            const burger = restoreFocusRef?.current;
            if (!burger) return;
            event.preventDefault();
            burger.focus();
          }}
        >
          {/* Radix требует у диалога заголовок. */}
          <Sheet.Title className="sr-only">{tShell("navLabel")}</Sheet.Title>
          <Box direction="column" fullHeight className="min-h-0 bg-muted/40">
            <Box direction="row" justify="end" className="shrink-0 px-2.5 pt-2.5">
              <Sheet.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="mobile-nav-close"
                  aria-label={tCommon("close") as string}
                >
                  <X size={16} />
                </Button>
              </Sheet.Close>
            </Box>
            <Box grow className="min-h-0">
              <SidebarBody
                features={features}
                onNavigate={onCloseMobile}
                counts={false}
                touch
                onOpenSearch={
                  onOpenSearch
                    ? () => {
                        onCloseMobile();
                        onOpenSearch();
                      }
                    : undefined
                }
              />
            </Box>
          </Box>
        </Sheet.Content>
      </Sheet>
    </>
  );
}
