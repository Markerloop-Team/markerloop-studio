"use client";

// THE header of every product screen (EP-157, owner 29 Oct 2026), after the
// canvas «Classic sidebar» (design-system/_canvas/classic-shell.tsx,
// SectionHeader + ClassicCrumbs + SectionTabs): title, one line of
// description, the primary action on the right, and the section's tabs under
// it where the section has tabs. Five hand-made patterns converged here —
// ListPage, the kit's ScreenHeader, a bare h1, back-arrow + h1, and the
// collection workplace's own header. No kicker labels, no back arrows: on a
// page deeper than a section the breadcrumbs above the title are the way back.
//
// The breadcrumbs rule lives here and nowhere else: crumbs are drawn ONLY on a
// page deeper than a section (`crumbsShownOn`) — a section-level screen
// (/collections, /pages, /users, /settings/workspace, …) shows none even if a
// caller passes them. smoke:shell-layout pins both directions.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { useRegisterShellTitle } from "@/shared/config/shell-title-context";

export type SectionCrumb = { label: string; href?: string };

/**
 * Section-level screens: the menu's own destinations and the two settings
 * screens. Everything below one of them is deeper — that is where crumbs go.
 */
export const SECTION_LEVEL_PATHS: readonly string[] = [
  "/dashboard",
  "/collections",
  "/pages",
  "/components",
  "/files",
  "/users",
  "/roles",
  "/permissions",
  "/dictionary",
  "/policy-acceptances",
  "/notifications",
  "/telegram-bot",
  "/settings/workspace",
  "/settings/account",
];

/** Whether a page shows breadcrumbs: only deeper than a section. */
export function crumbsShownOn(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").replace(/\/+$/, "") || "/";
  if (SECTION_LEVEL_PATHS.includes(path)) return false;
  return SECTION_LEVEL_PATHS.some((section) => path.startsWith(`${section}/`));
}

/** Line tabs of the canvas (kit `Tabs`, variant `line`) — for a section's own `UI.Tabs`. */
export const SECTION_TABS_LIST_CLASS =
  "h-auto w-full min-w-max justify-start gap-5 rounded-none border-b border-border p-0";
export const SECTION_TABS_TRIGGER_CLASS =
  "-mb-px h-auto flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 pb-2.5 pt-0 shadow-none data-[state=inactive]:text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:border-primary dark:data-[state=active]:bg-transparent";
/**
 * A full-height workplace inside the shell's content column (the collection
 * workplace): the viewport minus the top bar (56px phone, 44px from lg) and
 * the content padding (py-5, py-7 from md) — product-shell.tsx.
 */
export const SHELL_WORKPLACE_HEIGHT_CLASS =
  "h-[calc(100dvh-6rem)] md:h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-6.25rem)]";

/** The row around the list: scrolls sideways on a phone instead of wrapping. */
export const SECTION_TABS_SCROLL_CLASS = "-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0";

export function SectionCrumbs({ crumbs }: { crumbs: SectionCrumb[] }) {
  const t = useTranslations("navigation");
  return (
    <nav aria-label={t("breadcrumb") as string} data-breadcrumbs="" data-testid="section-crumbs">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {last || !c.href ? (
                <span
                  aria-current={last ? "page" : undefined}
                  className={`truncate ${last ? "font-medium text-foreground" : ""}`}
                >
                  {c.label}
                </span>
              ) : (
                <Link
                  href={c.href}
                  className="truncate rounded-sm hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {c.label}
                </Link>
              )}
              {last ? null : <ChevronRight size={14} aria-hidden="true" className="shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface SectionHeaderProps {
  /** The screen's name, rendered as `<h1>`. */
  title: ReactNode;
  /**
   * The title as plain text for the phone top bar, when `title` is markup.
   * A string `title` is used as is.
   */
  titleText?: string;
  /** One line about what the screen manages. */
  description?: ReactNode;
  /** The primary action (and at most a couple of secondary ones), right. */
  actions?: ReactNode;
  /**
   * The trail to this page, the current page last. Drawn only on a page
   * deeper than a section (`crumbsShownOn`).
   */
  crumbs?: SectionCrumb[];
  /** The section's tabs, under the header (use the SECTION_TABS_* classes). */
  tabs?: ReactNode;
  "data-testid"?: string;
}

export function SectionHeader({
  title,
  titleText,
  description,
  actions,
  crumbs,
  tabs,
  "data-testid": testId,
}: SectionHeaderProps) {
  const pathname = usePathname();
  const deep = crumbsShownOn(pathname);
  const shownCrumbs = deep && crumbs && crumbs.length > 0 ? crumbs : null;
  // The parent crumb is the phone's back arrow (canvas: «Back to …»).
  const parent = shownCrumbs ? [...shownCrumbs].slice(0, -1).reverse().find((c) => c.href) : undefined;
  useRegisterShellTitle(
    titleText ?? (typeof title === "string" ? title : null),
    parent?.href ? { href: parent.href, label: parent.label } : null
  );

  return (
    <Box direction="column" gap={5} data-testid="section-header">
      {shownCrumbs ? <SectionCrumbs crumbs={shownCrumbs} /> : null}
      {/*
        Column on a phone, a row from `sm` (the SDL-451/454 geometry: a long
        title never pushes the action off screen, the action takes the full
        width under it on a phone).
      */}
      <Box
        direction="column"
        align="start"
        gap={4}
        className="sm:flex-row sm:items-start sm:justify-between sm:gap-6"
        data-testid={testId}
      >
        <Box direction="column" gap={1} className="min-w-0">
          <UI.Text as="h1" weight="semibold" className="break-words text-xl tracking-tight md:text-2xl">
            {title}
          </UI.Text>
          {description ? (
            // A string is a paragraph; markup (a path and a status mark) a div.
            <UI.Text as={typeof description === "string" ? "p" : "div"} size="sm" variant="muted">
              {description}
            </UI.Text>
          ) : null}
        </Box>
        {actions ? (
          <Box direction="row" align="center" gap={2} wrap className="w-full shrink-0 sm:w-auto">
            {actions}
          </Box>
        ) : null}
      </Box>
      {tabs ?? null}
    </Box>
  );
}
