"use client";

// The workspace switcher of the shell (SDL-753): top left of the rail, as on
// the canvas /design-system/home. It replaces the switcher that only the
// collections section had — before this, switching workspace was possible
// from «Collections» alone.
//
// The current workspace stays what it was: ?ws= in the address, falling back
// to the first workspace (useCollectionsScope / useEntryWorkspaceId). This
// component only READS it and writes it on a choice; it never reconciles the
// address on its own, because the collection workplace pins its scope from
// the collection and a shell-level write would stamp a foreign ?ws= before
// that pin resolves (SDL-229 №4).

import { usePathname, useRouter } from "next/navigation";

import { useEntryWorkspaceId } from "@/features/pinned-feed";
import { CollectionsShellHeader } from "@/features/collections-switchers";
import { useWorkspaces } from "@/entities/collections/workspace";
import { useWorkspaceBilling } from "@/entities/workspace-billing";
import { useAuthStore } from "@/shared/store/auth-store";
import { useTranslations } from "@/shared/hooks";

/**
 * Where a choice of workspace lands. A detail screen belongs to the
 * workspace it was opened in (a collection, a page), so switching leaves it
 * for the list of its section; any other screen stays where it is.
 */
export function switchTarget(pathname: string | null, workspaceId: string | null): string {
  const path = pathname ?? "/";
  const m = /^\/(collections|pages|components)\/.+/.exec(path);
  const base = m ? `/${m[1]}` : path;
  return workspaceId ? `${base}?ws=${encodeURIComponent(workspaceId)}` : base;
}

/**
 * The plan line under the workspace name (EP-157, canvas «Classic sidebar»):
 * «Free plan» / «Pro plan» from the workspace's billing read; nothing while it
 * loads or when it fails — never a guess.
 */
export function planLineKey(plan: string | null | undefined): "freePlan" | "proPlan" | null {
  if (plan === "pro") return "proPlan";
  if (plan === "free") return "freePlan";
  return null;
}

export function ShellWorkspaceSwitcher({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  /** Closes the mobile menu after a choice. */
  onNavigate: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const userId = useAuthStore((s) => s.userId);
  const workspaces = useWorkspaces({ enabled: !!userId }).data ?? [];
  const currentId = useEntryWorkspaceId();
  const selected = workspaces.find((w) => w.id === currentId) ?? null;
  const t = useTranslations("shell");
  const billing = useWorkspaceBilling(selected?.id ?? null);
  const planKey = billing.isError ? null : planLineKey(billing.data?.plan);

  const go = (workspaceId: string | null) => {
    router.push(switchTarget(pathname, workspaceId));
    onNavigate();
  };

  return (
    <CollectionsShellHeader
      collapsed={collapsed}
      subtitle={planKey ? t(planKey) : null}
      workspaces={workspaces}
      selectedWorkspace={selected}
      onSelectWorkspace={(id) => {
        if (id !== selected?.id) go(id);
      }}
      onCreatedWorkspace={(w) => go(w.id)}
      onDeletedWorkspace={() => go(null)}
    />
  );
}
