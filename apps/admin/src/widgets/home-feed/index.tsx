"use client";

// The home page line of the pinned feed (SDL-645, EP-130; canvas A
// `HomeUnreadRow`, /design-system/feed?case=entry): one line, not a feed —
// the home page is a summary, the feed lives on its own page. The number is
// the service's `meta.total` for "read_at is empty" of the first pinned page
// that carries a DataView; an unknown number is said to be unknown, never
// guessed. No pinned feed → no line.

import Link from "next/link";
import { Inbox } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { useHomeFeed, type PinnedEntry } from "@/features/pinned-feed";
import { pageViewHref } from "@/widgets/pages/page-hrefs";

export function HomeFeedRowView({ entry, workspaceId }: { entry: PinnedEntry; workspaceId: string | null }) {
  const t = useTranslations("home.pinnedFeed");
  const { count } = entry;
  const headline =
    count === "loading"
      ? (t("loading") as string)
      : count === null
        ? (t("unknown") as string)
        : count === 0
          ? (t("none") as string)
          : (t("count", { count }) as string);

  return (
    <UI.Card fullWidth data-testid="home-unread">
      <UI.Card.Content>
        <UI.Box direction="row" align="center" gap={3} wrap>
          <UI.Box direction="row" align="center" justify="center" className="size-9 shrink-0 rounded-md bg-muted">
            <Inbox size={16} aria-hidden="true" />
          </UI.Box>
          <UI.Box direction="column" className="min-w-[10rem]" grow>
            <UI.Text
              as="span"
              size="sm"
              weight="medium"
              data-testid="home-unread-count"
              data-count={typeof count === "number" ? String(count) : count === null ? "unknown" : "loading"}
              aria-live="polite"
            >
              {headline}
            </UI.Text>
            <UI.Text as="span" size="xs" variant="muted" className="truncate">
              {entry.latest ? (t("latest", { title: entry.latest, page: entry.label }) as string) : entry.label}
            </UI.Text>
          </UI.Box>
          <UI.Button asChild size="sm" variant="outline" className="max-w-full">
            <Link
              href={pageViewHref(entry.route.id, workspaceId)}
              data-testid="home-unread-open"
              title={t("open", { page: entry.label }) as string}
            >
              {/* A long page title must not push the button past a 390 screen. */}
              <span className="min-w-0 truncate">{t("open", { page: entry.label }) as string}</span>
            </Link>
          </UI.Button>
        </UI.Box>
      </UI.Card.Content>
    </UI.Card>
  );
}

export function HomeFeedRow({ enabled }: { enabled: boolean }) {
  const { workspaceId, entry } = useHomeFeed(enabled);
  if (!enabled || !entry) return null;
  return <HomeFeedRowView entry={entry} workspaceId={workspaceId} />;
}
