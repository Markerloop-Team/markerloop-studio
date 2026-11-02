"use client";

import { useTranslations } from "@/shared/hooks";
import { ListPage } from "@/shared/components/list-page";
import { PagePermissionGuard } from "@/shared/components/permission-guard";
import { POLICY_JOURNAL_PERMISSION } from "@/entities/policy-acceptance";
import { PolicyJournal } from "@/widgets/policy-acceptances";

export const dynamic = "force-dynamic";

/**
 * Admin tools → Policy acceptances (SDL-752): who accepted which edition of
 * the product rules, when and from where. The guard comes first, so an
 * account without the journal permission sees the standard refusal and the
 * journal (and its requests) never mounts.
 */
export default function PolicyAcceptancesPage() {
  const t = useTranslations("policyAcceptances");
  return (
    <PagePermissionGuard permission={POLICY_JOURNAL_PERMISSION}>
      <ListPage title={t("title")} description={t("intro")}>
        <PolicyJournal />
      </ListPage>
    </PagePermissionGuard>
  );
}
