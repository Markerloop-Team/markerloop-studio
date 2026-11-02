"use client";

// Workspace usage panel (SDL-666): every counting limit of the workspace,
// «used / limit», read from the three usage handles — collections
// (/v1/workspaces/:id/usage), pages (/v1/pages/usage), files (/v1/files/usage).
// From 75 % of any limit a banner names the resource; at 100 % it explains
// what that means with the rule's own sentence (@markerloop/policy,
// limit_write_refused) and links /rules/limits. No number here is the admin's.

import * as UI from "@markerloop/ui/ui";
import { AlertTriangle } from "lucide-react";

import { PolicyLine, PolicyRulesLink } from "@/entities/policy/ui/policy-line";
import {
  useFilesUsage,
  usePagesUsage,
  useWorkspaceUsageQuery,
  usageAlerts,
  usageLevel,
  usageRows,
  type UsageRow,
} from "@/entities/usage";
import { useProductFeatures } from "@/shared/config/product-features-context";
import { useTranslations } from "@/shared/hooks";
import { useAuthStore } from "@/shared/store/auth-store";
import { formatBytes } from "@/shared/lib/format-bytes";

export function UsagePanel({
  workspaceId,
  ownerUserId,
}: {
  workspaceId: string;
  /** The workspace's owner: /v1/files/usage answers the owner only (gateway ScopeOwnerOnly). */
  ownerUserId: string;
}) {
  const { pages: pagesSection } = useProductFeatures();
  const userId = useAuthStore((s) => s.userId);
  const isOwner = !!userId && userId === ownerUserId;
  const workspace = useWorkspaceUsageQuery(workspaceId);
  const pages = usePagesUsage(workspaceId, pagesSection);
  // A member is not asked for files at all; a 403 (a stale owner) is the same
  // answer — «not yours to see», never «part of the usage failed».
  const files = useFilesUsage(isOwner ? { workspace_id: workspaceId } : null);
  const filesFailed = files.isError && (files.error as { status?: number } | null)?.status !== 403;
  const rows = usageRows({ workspace: workspace.data, pages: pages.data, files: files.data });
  const failed = workspace.isError || (pagesSection && pages.isError) || filesFailed;
  const loading = [workspace, pagesSection ? pages : null, isOwner ? files : null].some((q) => q?.isLoading);
  return <UsagePanelView rows={rows} loading={loading} failed={failed} />;
}

/** Presentational half — what smoke:usage-limits renders with fixed rows. */
export function UsagePanelView({
  rows,
  loading = false,
  failed = false,
}: {
  rows: readonly UsageRow[];
  loading?: boolean;
  failed?: boolean;
}) {
  const t = useTranslations("limits.usage");
  const { full, warn } = usageAlerts(rows);
  const names = (list: readonly UsageRow[]) => list.map((r) => t(`resource.${r.resource}`)).join(", ");
  return (
    <UI.Box direction="column" gap={3} fullWidth data-testid="usage-panel" className="rounded-lg border border-border p-4">
      <UI.Box direction="row" align="center" gap={3} wrap className="justify-between">
        <UI.Text as="h2" size="sm" weight="medium">
          {t("title")}
        </UI.Text>
        <PolicyRulesLink target="limits" />
      </UI.Box>

      {full.length > 0 ? (
        <UI.Alert variant="destructive" data-testid="usage-banner" data-level="full">
          <UI.Box direction="column" gap={1}>
            <UI.Box direction="row" align="center" gap={2}>
              <AlertTriangle size={16} aria-hidden="true" />
              <UI.Text as="span" size="sm" weight="medium">
                {t("fullTitle", { resources: names(full) })}
              </UI.Text>
            </UI.Box>
            <PolicyLine stringKey="limit_write_refused" target="limits" testId="usage-full-rule" />
          </UI.Box>
        </UI.Alert>
      ) : warn.length > 0 ? (
        <UI.Alert data-testid="usage-banner" data-level="warn">
          <UI.Box direction="row" align="center" gap={2}>
            <AlertTriangle size={16} aria-hidden="true" />
            <UI.Text as="span" size="sm" weight="medium">
              {t("warnTitle", { resources: names(warn) })}
            </UI.Text>
          </UI.Box>
        </UI.Alert>
      ) : null}

      {loading && rows.length === 0 ? (
        <UI.Text size="sm" variant="muted">
          {t("loading")}
        </UI.Text>
      ) : null}
      {failed ? (
        <UI.Text size="sm" variant="muted" data-testid="usage-partial">
          {t("partial")}
        </UI.Text>
      ) : null}

      <UI.Box as="ul" direction="column" gap={3}>
        {rows.map((r) => (
          <UsageMeter key={r.resource} row={r} label={t(`resource.${r.resource}`)} />
        ))}
      </UI.Box>
    </UI.Box>
  );
}

function UsageMeter({ row, label }: { row: UsageRow; label: string }) {
  const t = useTranslations("limits.usage");
  const level = usageLevel(row);
  const show = (n: number) => (row.unit === "bytes" ? formatBytes(n) : String(n));
  const clamped = row.percent === null ? 0 : Math.max(0, Math.min(100, row.percent));
  const tone = level === "full" ? "bg-destructive" : level === "warn" ? "bg-destructive/60" : "bg-primary";
  return (
    <UI.Box as="li" direction="column" gap={1} data-testid={`usage-${row.resource}`} data-level={level}>
      <UI.Box direction="row" align="center" gap={3} className="justify-between">
        <UI.Text as="span" size="sm">
          {label}
        </UI.Text>
        <UI.Text as="span" size="sm" variant="muted" data-testid={`usage-${row.resource}-numbers`}>
          {row.limit > 0 ? t("numbers", { used: show(row.used), limit: show(row.limit) }) : t("noLimit", { used: show(row.used) })}
        </UI.Text>
      </UI.Box>
      <UI.Box
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <UI.Box className={`h-full rounded-full ${tone}`} style={{ width: `${clamped}%` }} />
      </UI.Box>
    </UI.Box>
  );
}
