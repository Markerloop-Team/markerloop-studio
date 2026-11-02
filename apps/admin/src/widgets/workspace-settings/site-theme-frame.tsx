"use client";

import * as React from "react";
import { History } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { StatusIndicator } from "@markerloop/ui/ui/admin";
import { StudioDeviceSwitch, type StudioDeviceId } from "@markerloop/studio";

import { useTranslations } from "@/shared/hooks";
import { PublishMark } from "@/shared/components/publish-mark";
import { EditorFrame, EditorIconButton, EditorNameMenuButton } from "@/shared/components/editor-frame";

import {
  ColorsCard,
  CustomColorsCard,
  HistoryCard,
  PresetsCard,
  PublishDialog,
  RestoreDialog,
  ScalesCard,
  ShapeCard,
  ThemeSaveStatus,
  TypographyCard,
  themeErrorText,
  themeFieldLabel,
  publishState,
  usePublishBarModel,
  type SiteThemeEditorViewProps,
} from "./site-theme-editor";

export type SiteThemeFrameViewProps = Omit<SiteThemeEditorViewProps, "preview"> & {
  /** The workspace whose site this is — the frame's document name. */
  workspaceName: string;
  back: { href: string; onClick?: React.MouseEventHandler<HTMLAnchorElement> };
  device: StudioDeviceId;
  onDeviceChange: (device: StudioDeviceId) => void;
  /** The canvas: a real page of the site in the draft theme, at the device's width. */
  canvas: React.ReactNode;
  /** A notice over the panel (the conflict note of the live editor). */
  notice?: React.ReactNode;
};

/**
 * The site theme in the editor frame (EP-187, layer 5, decision 4): the same
 * header as the page and the component editors, the canvas = a real page of
 * the site with Desktop / Tablet / Phone, the theme's fields on the right
 * (presets, colours, fonts, shape) and no left panel — a theme has no layers.
 * History is the header's button; its list opens in the right panel instead
 * of the fields. The fields, dialogs and publish rules are the Site theme
 * editor's own (`site-theme-editor.tsx`), only laid out in the frame.
 */
export function SiteThemeFrameView({
  form,
  draft,
  published,
  revisions,
  restoredFrom,
  onApplyPreset,
  onPublish,
  onRestore,
  confirmPublish,
  save,
  busy,
  publishError,
  restoreError,
  initialRestoreTarget,
  settledAt,
  workspaceName,
  back,
  device,
  onDeviceChange,
  canvas,
  notice,
}: SiteThemeFrameViewProps) {
  const t = useTranslations("siteTheme");
  const [restoreTarget, setRestoreTarget] = React.useState(initialRestoreTarget);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(initialRestoreTarget !== undefined);
  const target = revisions.find((r) => r.n === restoreTarget);
  const { mark, description, canPublish, refused, blocked } = usePublishBarModel({
    draft,
    published,
    save,
    busy: busy === "publish",
  });

  React.useEffect(() => {
    if (settledAt === undefined) return;
    setRestoreTarget(undefined);
    setPublishOpen(false);
  }, [settledAt]);
  // A restored revision is in the draft now: show the fields it filled.
  React.useEffect(() => {
    if (restoredFrom !== undefined) setHistoryOpen(false);
  }, [restoredFrom]);

  return (
    <UI.Box direction="column" className="h-dvh overflow-hidden bg-background" data-testid="theme-editor">
      <EditorFrame
        kind="theme"
        testId="theme-editor-header"
        back={{ href: back.href, label: t("frame.back"), onClick: back.onClick, testId: "theme-editor-back" }}
        name={workspaceName}
        fullName={workspaceName}
        nameTestId="theme-editor-title"
        nameMenu={
          <UI.Menu.Root>
            <UI.Menu.Trigger asChild>
              <EditorNameMenuButton label={t("frame.menu")} data-testid="theme-editor-name-menu" />
            </UI.Menu.Trigger>
            <UI.Menu.Content align="start">
              <UI.Menu.Label className="max-w-72 break-words">{workspaceName}</UI.Menu.Label>
              <UI.Menu.Separator />
              <UI.Menu.Item onSelect={() => setHistoryOpen(true)}>
                <History size={14} aria-hidden="true" />
                {t("frame.historyOpen")}
              </UI.Menu.Item>
            </UI.Menu.Content>
          </UI.Menu.Root>
        }
        saveStatus={save ? <ThemeSaveStatus save={save} /> : null}
        center={<StudioDeviceSwitch value={device} onChange={onDeviceChange} />}
        status={
          mark === "blocked" ? (
            <StatusIndicator tone="error" data-testid="theme-status" data-state="blocked">
              {t("status.blockedTitle")}
            </StatusIndicator>
          ) : (
            <PublishMark state={mark} data-testid="theme-status" />
          )
        }
        actions={
          <>
            <EditorIconButton
              label={t("history.open", { count: revisions.length })}
              pressed={historyOpen}
              onClick={() => setHistoryOpen((open) => !open)}
              data-testid="theme-history-open"
            >
              <History size={16} aria-hidden="true" />
            </EditorIconButton>
            <UI.Button
              type="button"
              size="sm"
              disabled={!canPublish}
              onClick={() => (confirmPublish ? setPublishOpen(true) : onPublish())}
              data-testid="theme-publish"
            >
              {t("publish")}
            </UI.Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 max-md:flex-col max-md:overflow-y-auto">
        {/* The canvas: the site as a visitor gets it, in the draft theme —
            never the admin's light or dark (decision 3). */}
        <div
          className="flex min-w-0 flex-1 justify-center bg-muted p-4 md:overflow-y-auto md:p-8"
          data-testid="theme-canvas"
          data-device={device}
        >
          {canvas}
        </div>

        <aside
          aria-label={historyOpen ? t("history.title") : t("frame.fields")}
          data-testid="theme-panel"
          className="flex w-full shrink-0 flex-col gap-4 border-border bg-background p-4 max-md:border-t md:w-[360px] md:overflow-y-auto md:border-l"
        >
          {notice}
          <div
            className="flex flex-col gap-2"
            data-testid="theme-publish-bar"
            data-state={blocked ? "blocked" : publishState(draft, published).dirty ? "dirty" : "clean"}
            data-save={save?.state}
          >
            <UI.Text as="p" size="sm" variant="muted" data-testid="theme-status-detail">
              {description}
            </UI.Text>
            {restoredFrom ? (
              <UI.Alert data-testid="theme-restored-note">
                {t("restoredNote", { from: restoredFrom, live: published?.n ?? "—" })}
              </UI.Alert>
            ) : null}
            {refused && refused.length ? (
              <ul className="flex list-none flex-col gap-1 p-0" data-testid="theme-server-errors">
                {refused.map((e) => (
                  <li key={`${e.field}:${e.message}`} data-field={e.field}>
                    <UI.Text as="span" size="xs" variant="destructive">
                      {`${themeFieldLabel(t, e.field)} — ${themeErrorText(t, e)}`}
                    </UI.Text>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {historyOpen ? (
            <UI.Box direction="column" gap={3} data-testid="theme-history-anchor">
              <UI.Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setHistoryOpen(false)}
                data-testid="theme-history-close"
              >
                {t("frame.historyClose")}
              </UI.Button>
              <HistoryCard
                revisions={revisions}
                published={published?.n ?? null}
                busy={!!busy}
                onRestore={setRestoreTarget}
              />
            </UI.Box>
          ) : (
            <UI.Field.Root {...form}>
              <form className="flex min-w-0 flex-col gap-4" onSubmit={(e) => e.preventDefault()} data-testid="theme-form">
                <UI.Alert data-testid="theme-scope-note">{t("scopeNote")}</UI.Alert>
                <PresetsCard draft={draft} onApply={onApplyPreset} />
                <ColorsCard form={form} draft={draft} />
                <CustomColorsCard form={form} draft={draft} published={published?.theme ?? null} />
                <TypographyCard form={form} draft={draft} />
                <ShapeCard form={form} />
                <ScalesCard form={form} draft={draft} published={published?.theme ?? null} />
              </form>
            </UI.Field.Root>
          )}
        </aside>
      </div>

      {target ? (
        <RestoreDialog
          revision={target}
          draft={draft}
          published={published?.n ?? null}
          busy={busy === "restore"}
          error={restoreError}
          onCancel={() => setRestoreTarget(undefined)}
          onConfirm={() => {
            onRestore(target.n);
            if (settledAt === undefined) setRestoreTarget(undefined);
          }}
        />
      ) : null}
      {publishOpen ? (
        <PublishDialog
          draft={draft}
          published={published}
          busy={busy === "publish"}
          error={publishError}
          onCancel={() => setPublishOpen(false)}
          onConfirm={onPublish}
        />
      ) : null}
    </UI.Box>
  );
}
