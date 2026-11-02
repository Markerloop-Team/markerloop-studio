"use client";

// The question before a page goes on the site, gets a new publication or comes
// off it (EP-186, layer 3, pattern 7): what visitors will see, then the one
// button that does it. The editor header has one button; pressing it opens
// this dialog, and only its confirm button publishes.

import * as React from "react";
import { Globe, Save, Undo2 } from "lucide-react";

import {
  ConfirmDialogBody,
  ConfirmDialogLine,
  ConfirmDialogShell,
} from "@/shared/components/confirm-dialog";
import { useTranslations } from "@/shared/hooks";

export type PublishDialogKind = "publish" | "republish" | "unpublish";

export const PUBLISH_DIALOG_TEST_IDS = {
  dialog: "studio-publish-dialog",
  body: "studio-publish-body",
  cancel: "studio-publish-cancel",
  confirm: "studio-publish-confirm",
  error: "studio-publish-error",
} as const;

/** «What visitors will see» — a component of its own so the smokes render it. */
export function PublishDialogContent({
  kind,
  path,
  url,
}: {
  kind: PublishDialogKind;
  path: string;
  /** The public address, when the contour and the workspace have one. */
  url: string | null;
}) {
  const tDialog = useTranslations("pages.editor.publishDialog");
  const where = url ?? path;
  return (
    <>
      {kind === "publish" ? (
        <ConfirmDialogLine icon={<Globe aria-hidden="true" />} testId="studio-publish-visitors">
          {url ? tDialog("publish.visitorsUrl", { url }) : tDialog("publish.visitorsPath", { path })}
        </ConfirmDialogLine>
      ) : null}
      {kind === "republish" ? (
        <ConfirmDialogLine icon={<Globe aria-hidden="true" />} testId="studio-publish-visitors">
          {tDialog("republish.visitors", { where })}
        </ConfirmDialogLine>
      ) : null}
      {kind === "unpublish" ? (
        <>
          <ConfirmDialogLine icon={<Globe aria-hidden="true" />} testId="studio-publish-visitors">
            {tDialog("unpublish.visitors", { where })}
          </ConfirmDialogLine>
          <ConfirmDialogLine icon={<Undo2 aria-hidden="true" />}>{tDialog("unpublish.keeps")}</ConfirmDialogLine>
        </>
      ) : (
        <ConfirmDialogLine icon={<Save aria-hidden="true" />}>{tDialog("savedFirst")}</ConfirmDialogLine>
      )}
    </>
  );
}

export function PublishDialog({
  kind,
  path,
  url,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  /** null = closed. */
  kind: PublishDialogKind | null;
  path: string;
  url: string | null;
  pending: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("pages.editor");
  // The last kind stays drawn while the card animates out.
  const [shown, setShown] = React.useState<PublishDialogKind>(kind ?? "publish");
  React.useEffect(() => {
    if (kind) setShown(kind);
  }, [kind]);
  const current = kind ?? shown;
  return (
    <ConfirmDialogShell
      open={kind !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={t(`publishDialog.${current}.title`, { path })}
      pending={pending}
      testId={PUBLISH_DIALOG_TEST_IDS.dialog}
    >
      <ConfirmDialogBody
        pending={pending}
        error={error}
        onCancel={() => {
          if (!pending) onCancel();
        }}
        onConfirm={onConfirm}
        confirmLabel={current === "publish" ? t("publish") : current === "republish" ? t("republish") : t("unpublish")}
        pendingLabel={
          current === "publish" ? t("publishing") : current === "republish" ? t("republishing") : t("unpublishing")
        }
        testIds={PUBLISH_DIALOG_TEST_IDS}
      >
        <PublishDialogContent kind={current} path={path} url={url} />
      </ConfirmDialogBody>
    </ConfirmDialogShell>
  );
}
