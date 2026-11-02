"use client";

import * as React from "react";
import { Download } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { editionStatus, shortUserAgent } from "@/entities/policy-acceptance";

/**
 * Edition with «Current» / «Outdated» against the contour's edition in force;
 * neither while that edition is unknown (`editionStatus`, same rule as Users).
 */
export function EditionBadge({
  version,
  current,
  testid,
}: {
  version: string | null;
  current: string | null;
  testid?: string;
}) {
  const t = useTranslations("policyAcceptances");
  const status = editionStatus(version, current);
  if (status === "none") {
    return (
      <UI.Text as="span" variant="muted" data-testid={testid} data-edition="none">
        —
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
      data-testid={testid}
      data-edition={status}
    >
      <UI.Text as="span" size="sm" className="font-mono tabular-nums">
        {version}
      </UI.Text>
      {status === "current" ? (
        <UI.Badge variant="secondary">{t("current")}</UI.Badge>
      ) : status === "outdated" ? (
        <UI.Badge variant="outline">{t("outdated")}</UI.Badge>
      ) : null}
    </UI.Box>
  );
}

/**
 * Browser: the short form on screen, the full User-Agent in the tooltip.
 * «Imported» marks only a backfilled row (`source === "backfill"`): an
 * ordinary acceptance whose request carried no User-Agent is stored with NULL
 * too, and is just «Not recorded».
 */
export function BrowserCell({
  userAgent,
  source,
}: {
  userAgent: string | null;
  source: string;
}) {
  const t = useTranslations("policyAcceptances");
  if (!userAgent) {
    return (
      <UI.Box as="span" direction="row" align="center" gap={2} wrap>
        <UI.Text as="span" size="sm" variant="muted" data-testid="acceptance-no-ua">
          {t("notRecorded")}
        </UI.Text>
        {source === "backfill" ? (
          <UI.Badge
            variant="outline"
            title={t("importedHint")}
            data-testid="acceptance-backfill"
          >
            {t("imported")}
          </UI.Badge>
        ) : null}
      </UI.Box>
    );
  }
  return (
    <UI.Tooltip>
      <UI.Tooltip.Trigger asChild>
        <UI.Text
          as="span"
          size="sm"
          title={userAgent}
          tabIndex={0}
          className="cursor-help underline decoration-dotted underline-offset-4"
          data-testid="acceptance-browser"
          data-full-ua={userAgent}
        >
          {shortUserAgent(userAgent)}
        </UI.Text>
      </UI.Tooltip.Trigger>
      <UI.Tooltip.Content className="max-w-xs break-all font-mono text-xs">
        {userAgent}
      </UI.Tooltip.Content>
    </UI.Tooltip>
  );
}

export function IpCell({ ip }: { ip: string | null }) {
  return ip ? (
    <UI.Text as="span" size="sm" className="font-mono break-all">
      {ip}
    </UI.Text>
  ) : (
    <UI.Text as="span" size="sm" variant="muted">
      —
    </UI.Text>
  );
}

export function PersonCell({
  email,
  username,
}: {
  email: string | null;
  username: string;
}) {
  const t = useTranslations("policyAcceptances");
  return (
    <UI.Box direction="column" className="min-w-0">
      <UI.Text as="span" size="sm" weight="medium" className="break-all">
        {email ?? t("noEmail")}
      </UI.Text>
      <UI.Text as="span" size="xs" variant="muted" className="break-all">
        @{username}
      </UI.Text>
    </UI.Box>
  );
}

/** A labelled field of a card on narrow screens, like `DataView`. */
export function CardField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <UI.Box direction="row" gap={2} wrap align="center">
      <UI.Text as="span" variant="muted" size="sm" className="shrink-0">
        {label}:
      </UI.Text>
      <UI.Box as="span" className="min-w-0">
        {children}
      </UI.Box>
    </UI.Box>
  );
}

export function ExportCsvButton({
  onExport,
  disabled,
  filename,
  testid,
}: {
  onExport: () => Promise<void>;
  disabled: boolean;
  filename: string;
  testid: string;
}) {
  const t = useTranslations("policyAcceptances");
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onExport();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <UI.Box direction="row" align="center" gap={2} wrap>
      {failed ? (
        <UI.Text as="span" size="sm" variant="danger" data-testid={`${testid}-error`}>
          {t("exportError")}
        </UI.Text>
      ) : null}
      <UI.Button
        variant="outline"
        size="sm"
        onClick={run}
        disabled={disabled || busy}
        data-testid={testid}
        data-filename={filename}
      >
        <Download size={16} aria-hidden="true" />
        {busy ? t("exporting") : t("exportCsv")}
      </UI.Button>
    </UI.Box>
  );
}
