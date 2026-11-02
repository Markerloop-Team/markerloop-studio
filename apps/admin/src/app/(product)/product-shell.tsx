"use client";

// The client half of the product layout: sidebar, header, auth guard. The
// server half (layout.tsx) reads the contour's runtime flags and hands them
// in as `features` — this file never reads the environment itself (SDL-635).

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRef } from "react";
import { useCallback, useState } from "react";
import { Sidebar, useSidebarCollapsed } from "@/widgets/sidebar";
import { Header } from "@/widgets/header";
import { GlobalCommandPalette, usePaletteHotkey } from "@/widgets/command-palette";
import { ShellTitleProvider } from "@/shared/config/shell-title-context";
import { EmailVerificationBanner } from "@/shared/components/email-verification-banner";
import { useAuthStore } from "@/shared/store/auth-store";
import { Box, Skeleton, Text } from "@markerloop/ui/ui";
import type { ProductFeatures } from "@/shared/config/product-features";
import { ProductFeaturesProvider } from "@/shared/config/product-features-context";
import type { DormantSections } from "@/shared/config/product-features";
import { DORMANT_SECTIONS_HIDDEN, DormantSectionsProvider } from "@/shared/config/dormant-sections-context";
import { loginHref } from "@/shared/config/product-routes";
import { PolicyGate } from "@/features/policy-acceptance";
import { ProductNoticeBanner } from "@/features/product-notice";
import type { ProductNotice } from "@/shared/config/product-notice";
import { WELCOME_PATH } from "@/features/collections-switchers";

// The page editor and, since SDL-721, the Component editor — at
// /components/<id> since EP-157 (it was /pages/blocks/<id>).
export const EDITOR_ROUTE = /^\/(?:(?:pages|components)\/[^/]+|theme)\/?$/;
const WELCOME_ROUTE = new RegExp(`^${WELCOME_PATH}/?$`);

type ProductShellProps = {
  children: React.ReactNode;
  /** Runtime section flags of this contour, read on the server (SDL-635). */
  features: ProductFeatures;
  /**
   * The announcement in force on this contour (PRODUCT_NOTICE, SDL-744), read
   * on the server per request; null = none.
   */
  notice?: ProductNotice | null;
  /**
   * Whether the shell leads to Notifications and the Telegram bot (SDL-768),
   * read on the server per request. Absent = both hidden.
   */
  dormant?: DormantSections;
};

/**
 * Until the signed-in account accepts the rules edition in force here, the
 * acceptance screen replaces the whole shell — no section, rail or header
 * renders (SDL-665). The gate waits for the auth store, so the frame below
 * keeps its own loading and /login redirect.
 */
export function ProductShell({ dormant = DORMANT_SECTIONS_HIDDEN, ...props }: ProductShellProps) {
  // Around the whole frame: the header (bell), the sidebar (items) and the
  // dashboard (cards) all read it (SDL-768).
  return (
    <PolicyGate>
      <DormantSectionsProvider sections={dormant}>
        <ProductShellFrame {...props} />
      </DormantSectionsProvider>
    </PolicyGate>
  );
}

function ProductShellFrame({ children, features, notice = null }: ProductShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isInitialized, isAuthenticated } = useAuthStore();
  // No client redirect to /welcome any more (SDL-759 re-open): the server
  // answers a page load of a workspace section with a 307 there
  // (app/layout.tsx), and inside the shell the sections draw the
  // no-workspace state in place. /welcome sits under PolicyGate too, so the
  // rules still come first and the first workspace second.
  // Desktop sidebar hidden or shown, remembered per browser (EP-157). On a
  // phone it plays no part: the menu is a drawer held by `mobileNavOpen`.
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Search ⌘K (EP-157): one palette for the shell — the sidebar button, the
  // phone search icon and ⌘K / Ctrl+K open it.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const togglePalette = useCallback(() => setPaletteOpen((v) => !v), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  usePaletteHotkey(togglePalette);
  /**
   * Гамбургер живёт в шапке, выдвижное меню — в сайдбаре, и связывает их
   * только этот layout. Ссылка нужна, чтобы после закрытия меню фокус вернулся
   * туда, откуда его открыли: Radix делает это сам лишь через `Sheet.Trigger`,
   * которым гамбургер быть не может (SDL-482).
   */
  const mobileNavButtonRef = useRef<HTMLButtonElement>(null);

  // The proxy lets a request through on the cookie alone; a session that
  // turns out dead in the browser lands here. It goes to /login with the
  // whole address — path and query — to come back to (SDL-643): a bare
  // "/login" dropped `?ws=` and `?record=` along with the path. The live
  // location, not a render-time snapshot (SDL-229 №2).
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push(loginHref(window.location.pathname, window.location.search));
    }
  }, [isInitialized, isAuthenticated, router]);

  // Оверлей закрывается с клавиатуры — иначе на планшете с внешней клавиатурой
  // единственный выход из открытого меню это попасть пальцем в подложку.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileNavOpen]);

  if (!isInitialized) {
    return (
      <Box variant="center" className="h-dvh">
        <Box gap={2} align="center">
          <Skeleton width={160} height={16} />
          <Text variant="muted" size="sm">Loading...</Text>
        </Box>
      </Box>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // The pages editor (SDL-605) is a full-screen document: the canvas
  // /design-system/studio has no rail and no header — outline, canvas and
  // properties already take 900px, and the rail would squeeze the canvas to
  // a strip on a laptop. Its own header carries the way back. The matcher is
  // exact: /pages itself keeps the shell.
  // Screens inside the shell read the same flags through context (SDL-636):
  // the editor hides "publish" when this contour has it off.
  const content = <ProductFeaturesProvider features={features}>{children}</ProductFeaturesProvider>;

  if (EDITOR_ROUTE.test(pathname ?? "")) {
    return <Box className="h-dvh overflow-hidden">{content}</Box>;
  }

  // The onboarding screen (SDL-759) has nothing to navigate to yet: no rail,
  // no header — one card, like the rules acceptance before it.
  if (WELCOME_ROUTE.test(pathname ?? "")) {
    return <Box className="h-dvh overflow-y-auto">{content}</Box>;
  }

  return (
    <ShellTitleProvider>
      {/*
        The canvas «Classic sidebar» (EP-157): the sidebar sits in the flow and
        is hidden entirely when collapsed (no spacer, no icon rail); below
        `lg` it is a drawer, opened from the phone top bar.
      */}
      <Box direction="row" className="h-dvh overflow-hidden bg-background" data-testid="product-shell">
        <Sidebar
          features={features}
          collapsed={collapsed}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
          restoreFocusRef={mobileNavButtonRef}
          onOpenSearch={openPalette}
        />

        <Box direction="column" grow className="min-w-0 overflow-hidden">
          <Header
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onOpenMobileNav={() => setMobileNavOpen(true)}
            openMobileNavRef={mobileNavButtonRef}
            onOpenSearch={openPalette}
          />
          <EmailVerificationBanner />
          {/* Объявление из конфигурации контура (SDL-744): канал для тех, у
              кого нет почты. Не в полноэкранном редакторе — там нет оболочки. */}
          <ProductNoticeBanner notice={notice} />
          <Box as="main" grow className="min-h-0 overflow-y-auto">
            <Box direction="column" className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-7">
              {content}
            </Box>
          </Box>
        </Box>
      </Box>
      <GlobalCommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} features={features} />
    </ShellTitleProvider>
  );
}
