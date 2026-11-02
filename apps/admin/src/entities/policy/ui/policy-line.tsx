"use client";

// A sentence of the product rules on another screen, with the link to the
// section it comes from (SDL-666): deletion dialogs, the limit refusal, the
// usage panel. The text is ALWAYS @markerloop/policy's (usePolicyString); the
// link label is the admin's own words. Where the promise behind the string is
// not in force on the contour, nothing is drawn — neither the claim nor a link
// to a section that answers 404 there.

import NextLink from "next/link";
import { toast } from "sonner";
import * as UI from "@markerloop/ui/ui";

import { usePolicyString } from "@/shared/config/policy-strings-context";
import type { PolicyStringKey } from "@/shared/config/policy-string-keys";
import { useTranslations } from "@/shared/hooks";
import {
  DELETION_RULES_HREF,
  FREE_WORKSPACES,
  LIMITS_RULES_HREF,
  RECORD_TOO_LARGE,
  WORKSPACES,
  limitRefusalOf,
} from "@/shared/lib/api/limit-refusal";

export type PolicyLinkTarget = "deletion" | "limits";

const HREF: Record<PolicyLinkTarget, string> = {
  deletion: DELETION_RULES_HREF,
  limits: LIMITS_RULES_HREF,
};

export function PolicyRulesLink({ target }: { target: PolicyLinkTarget }) {
  const t = useTranslations("limits");
  return (
    <NextLink
      href={HREF[target]}
      target="_blank"
      rel="noopener"
      className="text-sm font-medium text-primary underline underline-offset-4"
      data-testid={`policy-link-${target}`}
    >
      {t(target === "deletion" ? "deletionRulesLink" : "limitsRulesLink")}
    </NextLink>
  );
}

/** The policy sentence + its link, or nothing where the promise is not in force. */
export function PolicyLine({
  stringKey,
  target,
  testId = "policy-line",
}: {
  stringKey: PolicyStringKey;
  target: PolicyLinkTarget;
  testId?: string;
}) {
  const text = usePolicyString(stringKey);
  if (!text) return null;
  return (
    <UI.Box direction="column" gap={1} data-testid={testId} data-policy-key={stringKey}>
      <UI.Text as="span" size="sm">
        {text}
      </UI.Text>
      <PolicyRulesLink target={target} />
    </UI.Box>
  );
}

/**
 * The person-facing sentence for an error a write threw: a limit refusal gets
 * the policy sentence (quota) or the size ceiling (413) — never a raw body.
 */
export function useLimitRefusalText(): (error: unknown) => string | null {
  const t = useTranslations("limits");
  const refused = usePolicyString("limit_write_refused");
  // «Delete forever» exists where the trash promise is in force (SDL-666).
  const trashOn = usePolicyString("workspace_delete_forever") !== null;
  return (error) => {
    const refusal = limitRefusalOf(error);
    if (!refusal) return null;
    if (refusal.code === RECORD_TOO_LARGE) return t("recordTooLarge");
    // One free workspace per account (SDL-759): a refusal of its own, not the
    // general ceiling — the sentence says which limit it is.
    // The number is the service's answer (LIMIT_FREE_WORKSPACES_PER_OWNER).
    if (refusal.resource === FREE_WORKSPACES) {
      return refusal.limit !== undefined
        ? t("freeWorkspaceReached", { limit: refusal.limit })
        : t("freeWorkspaceReachedNoNumber");
    }
    // The owner's ceiling of workspaces (SDL-758): say which limit it is and
    // that deleted workspaces count until they are erased — a person who
    // deleted one does not see why the place is still taken. No number of
    // days (that is the trash promise, off on some contours) and «Delete
    // forever» only where the trash promise is in force.
    if (refusal.resource === WORKSPACES) {
      const head =
        refusal.limit !== undefined
          ? t("workspacesReached", { limit: refusal.limit })
          : t("workspacesReachedNoNumber");
      return `${head} ${t("workspacesTrashCounts")}${trashOn ? ` ${t("workspacesDeleteForeverFrees")}` : ""}`;
    }
    return refused ?? t("quotaReached");
  };
}

/**
 * toast.error for a failed write: a limit refusal shows the rule and an action
 * that opens /rules/limits; anything else shows the error's own message.
 */
export function useApiErrorToast(): (error: unknown, fallback: string) => void {
  const t = useTranslations("limits");
  const refusalText = useLimitRefusalText();
  return (error, fallback) => {
    const text = refusalText(error);
    if (text) {
      toast.error(text, {
        action: {
          label: t("limitsRulesLink"),
          onClick: () => window.open(LIMITS_RULES_HREF, "_blank", "noopener"),
        },
      });
      return;
    }
    toast.error(error instanceof Error && error.message ? error.message : fallback);
  };
}

/** Inline form of the same refusal, for dialogs that keep their error on screen. */
export function LimitRefusalNotice({ error }: { error: unknown }) {
  const refusalText = useLimitRefusalText();
  const text = refusalText(error);
  if (!text) return null;
  return (
    <UI.Alert variant="destructive" data-testid="limit-refusal">
      <UI.Box direction="column" gap={1}>
        <UI.Text as="span" size="sm">
          {text}
        </UI.Text>
        <PolicyRulesLink target="limits" />
      </UI.Box>
    </UI.Alert>
  );
}
