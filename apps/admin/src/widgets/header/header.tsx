"use client";

// The shell's top bar (EP-157, owner-approved 29 Oct 2026), after the canvas
// «Classic sidebar» (design-system/_canvas/classic-shell.tsx):
//  - desktop (lg and up): a thin 44px row with the one control that hides or
//    shows the sidebar. No search field, no theme / language / avatar (they
//    live in the account menu at the bottom of the sidebar), no bell, no Help;
//  - phone (below lg): the menu button — or a back arrow on a page deeper than
//    a section —, the current page title, search and the avatar.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Menu as MenuIcon, PanelLeft, Search } from "lucide-react";
import { Box, Button, Text } from "@markerloop/ui/ui";
import * as React from "react";

import { useTranslations } from "@/shared/hooks";
import { useShellTitle } from "@/shared/config/shell-title-context";
import { activeNavKey, navItemName, ShellUserMenu } from "@/widgets/sidebar";

export type HeaderProps = {
  /** Desktop sidebar hidden (EP-157); drives the toggle's label and state. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Открыть выдвижное меню. Кнопка видна только ниже `lg`. */
  onOpenMobileNav: () => void;
  /**
   * Ссылка на саму кнопку меню: Radix возвращает фокус после закрытия
   * диалога на `Sheet.Trigger`, а эта кнопка триггером не является — она
   * живёт здесь, тогда как Sheet живёт в сайдбаре (SDL-482).
   */
  openMobileNavRef?: React.Ref<HTMLButtonElement>;
  /** Opens the command palette. Absent = no search icon. */
  onOpenSearch?: () => void;
};

export function Header({
  collapsed = false,
  onToggleCollapsed,
  onOpenMobileNav,
  openMobileNavRef,
  onOpenSearch,
}: HeaderProps) {
  const t = useTranslations("common");
  const tNav = useTranslations("navigation");
  const tShell = useTranslations("shell");
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const written = useShellTitle();
  const activeKey = activeNavKey(pathname, searchParams?.get("tab") ?? null);
  const fallbackName = activeKey ? navItemName(activeKey) : null;
  const title = written?.title ?? (fallbackName ? (tNav(fallbackName) as string) : "");
  const back = written?.back ?? null;

  return (
    <>
      <Box
        as="header"
        direction="row"
        align="center"
        gap={1}
        className="hidden h-11 shrink-0 border-b border-border bg-background px-3 lg:flex"
        data-testid="shell-topbar"
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground"
          aria-label={(collapsed ? t("expand") : t("collapse")) as string}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
          data-testid="sidebar-toggle"
          suppressHydrationWarning
        >
          <PanelLeft size={16} aria-hidden="true" />
        </Button>
      </Box>

      <Box
        as="header"
        direction="row"
        align="center"
        gap={2}
        className="h-14 shrink-0 border-b border-border bg-background px-2.5 lg:hidden"
        data-testid="shell-phone-top"
      >
        {back ? (
          <Button asChild variant="ghost" size="icon" data-testid="shell-phone-back">
            <Link href={back.href} aria-label={tShell("backTo", { label: back.label })}>
              <ArrowLeft size={20} aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
        {/*
          The menu button stays mounted on a deep page too (hidden): it holds
          the focus-return ref of the drawer (SDL-482).
        */}
        <Button
          ref={openMobileNavRef}
          variant="ghost"
          size="icon"
          onClick={onOpenMobileNav}
          aria-label={t("openMenu") as string}
          data-testid="mobile-nav-open"
          className={back ? "hidden" : undefined}
          suppressHydrationWarning
        >
          <MenuIcon size={20} aria-hidden="true" />
        </Button>
        <Text as="span" weight="semibold" className="min-w-0 truncate text-base" data-testid="shell-phone-title">
          {title}
        </Text>
        <Box grow />
        {onOpenSearch ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSearch}
            aria-label={tShell("search")}
            data-testid="mobile-search-open"
          >
            <Search size={20} aria-hidden="true" />
          </Button>
        ) : null}
        <ShellUserMenu variant="avatar" />
      </Box>
    </>
  );
}
