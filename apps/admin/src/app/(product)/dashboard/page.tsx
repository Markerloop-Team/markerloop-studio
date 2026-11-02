"use client";

import { Box, Skeleton } from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { useAuthStore } from "@/shared/store/auth-store";
import { useWorkspaces } from "@/entities/collections/workspace";
import { WelcomeCard, wasWelcomeSkipped } from "@/features/collections-switchers";
import { useProductFeatures } from "@/shared/config/product-features-context";
import { HomeFeedRow } from "@/widgets/home-feed";
import { useEntryWorkspaceId } from "@/features/pinned-feed";
import { SectionHeader } from "@/shared/components/section-header";

export const dynamic = "force-dynamic";

/**
 * The home screen waits for the workspace list before it draws anything
 * (SDL-759 re-open): an account with none gets the «Create your first
 * workspace» card IN PLACE — no dashboard frame first, no jump to /welcome.
 * A page load never gets here without a workspace (the server answers it with
 * a 307 to /welcome); this is the way for the rest: the last workspace deleted
 * while on the page, a client-side navigation, a gateway hiccup during the
 * server check. After «Skip» the dashboard is the ordinary one; a failed list
 * read draws it too — an error is not "you have nothing".
 */
export default function DashboardPage() {
  const userId = useAuthStore((s) => s.userId);
  const workspaces = useWorkspaces({ enabled: !!userId });

  if (workspaces.data === undefined && !workspaces.isError) {
    return (
      <Box gap={4} data-testid="dashboard-loading" aria-busy="true">
        <Skeleton width={220} height={32} />
        <Skeleton width={320} height={16} />
      </Box>
    );
  }

  if (workspaces.data?.length === 0 && !wasWelcomeSkipped(userId)) {
    return (
      <Box variant="center" data-testid="dashboard-welcome">
        <WelcomeCard />
      </Box>
    );
  }

  return <DashboardHome />;
}

/**
 * The home of the current workspace: for now only the section header («Home»,
 * one line about the workspace) and the pinned feed's unread line (SDL-645).
 * The owner did not accept the canvas home of layer 4 (29 Oct 2026, «пока
 * пусть будет заголовок и не более») — it is to be redone later; the blocks
 * built for it (site card, numbers, quick actions, recent changes) are in
 * git history, commit c60aa7fa, widgets/home.
 */
function DashboardHome() {
  const t = useTranslations("navigation");
  const tHome = useTranslations("home");
  const features = useProductFeatures();
  const userId = useAuthStore((s) => s.userId);
  const workspaces = useWorkspaces({ enabled: !!userId }).data ?? [];
  const currentId = useEntryWorkspaceId();
  const workspace = workspaces.find((w) => w.id === currentId) ?? null;

  return (
    <Box gap={5} data-testid="home">
      <SectionHeader
        title={t("home") as string}
        description={workspace ? tHome("description", { name: workspace.name }) : undefined}
      />
      <HomeFeedRow enabled={features.pages} />
    </Box>
  );
}
