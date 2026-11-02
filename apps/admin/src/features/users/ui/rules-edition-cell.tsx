"use client";

import * as UI from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { editionStatus } from "@/entities/policy-acceptance";

/**
 * «Rules edition» cell of the Users list (SDL-752, canvas
 * /design-system/policy-acceptances?case=users-column): the edition of the
 * product rules the person accepted last (users.policy_accepted_version, it
 * comes with GET /v1/users — no request per row), marked Current / Outdated
 * against the contour's edition in force. Never accepted — a muted dash, as on
 * the canvas, with «Never accepted» for screen readers.
 */
export function RulesEditionCell({
  version,
  current,
}: {
  version: string | null | undefined;
  current: string | null;
}) {
  const t = useTranslations("common");
  const status = editionStatus(version, current);
  if (status === "none") {
    const never = t("rulesNeverAccepted");
    // The dash is for the eye; a screen reader reads the words next to it.
    return (
      <UI.Text
        as="span"
        variant="muted"
        title={never}
        data-testid="user-accepted-edition"
        data-edition="none"
      >
        <span aria-hidden="true">—</span>
        <span className="sr-only">{never}</span>
      </UI.Text>
    );
  }
  return (
    <UI.Box
      as="span"
      direction="row"
      align="center"
      gap={2}
      wrap
      data-testid="user-accepted-edition"
      data-edition={status}
    >
      <UI.Text as="span" size="sm" className="font-mono tabular-nums">
        {version}
      </UI.Text>
      {status === "current" ? (
        <UI.Badge variant="secondary">{t("rulesEditionCurrent")}</UI.Badge>
      ) : status === "outdated" ? (
        <UI.Badge variant="outline">{t("rulesEditionOutdated")}</UI.Badge>
      ) : null}
    </UI.Box>
  );
}
