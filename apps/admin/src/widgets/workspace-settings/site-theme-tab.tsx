"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import * as UI from "@markerloop/ui/ui";
import { studioDeviceWidth, type StudioDeviceId } from "@markerloop/studio";

import { useBeforeUnloadGuard, useTranslations } from "@/shared/hooks";
import { SAVE_DEBOUNCE_MS } from "@/shared/components/save-status";
import { useSitesBaseDomain } from "@/shared/config/site-address-context";
import { siteAddress } from "@/shared/config/site-address";
import { useRoutes, type PagesRoute } from "@/entities/pages";
import {
  applyPresetTheme,
  cloneTheme,
  normalizeTheme,
  siteThemeApi,
  siteThemeKeys,
  themeConflictDraft,
  themeFieldErrors,
  themeHexValid,
  themeSendable,
  useSiteThemeDraft,
  useSiteThemeRevisions,
  type Preset,
  type SiteTheme,
  type SiteThemeDraft,
  type SiteThemeRevision,
} from "@/entities/site-theme";
import type { Workspace } from "@/widgets/collections";

import {
  SiteThemeEditorView,
  ThemePreview,
  type ThemeRevisionView,
  type ThemeSaveView,
} from "./site-theme-editor";
import { SiteThemeFrameView } from "./site-theme-frame";

const SiteThemePagePreview = dynamic(() => import("./site-theme-page-preview"), {
  ssr: false,
  loading: () => <UI.Skeleton height={360} />,
});

/**
 * The draft is written this long after the last change (one PATCH per pause)
 * — the one debounce of every autosaving editor (EP-186 pattern 6).
 */
export const THEME_SAVE_DEBOUNCE_MS = SAVE_DEBOUNCE_MS;

/**
 * Settings → Workspace → «Site theme» (SDL-776, EP-160): the canvas editor
 * (`site-theme-editor.tsx`, canvas /design-system/site-theme) over
 * pages-service's theme plane (SDL-772, `entities/site-theme`).
 *
 * - Every change goes to the DRAFT by itself: a PATCH of the whole theme,
 *   colours normalised like the service (`normalizeTheme`), with the draft's
 *   `version`, 800 ms after the last edit; one request in flight, the newest
 *   values follow it. A colour that is not a hex the service accepts is not
 *   sent (the service would refuse it the same way); everything else is the
 *   service's call, and its 422 (every field error at once) is shown as it is.
 * - 409 theme_version_conflict (another tab or member) → the service's draft
 *   replaces the screen and says so; nothing is overwritten.
 * - «Publish theme» asks first, waits the save out, then publishes the SAVED
 *   draft. Restore puts a revision into the draft; visitors see it on publish.
 * - The preview is a real page of the workspace (its «/» or the first
 *   address) in the draft theme; with no page, the canvas's sample page.
 */
export function WorkspaceSiteThemeTab({ workspace, frame }: { workspace: Workspace; frame?: SiteThemeFrameOptions }) {
  const t = useTranslations("siteTheme");
  const draftQuery = useSiteThemeDraft(workspace.id);
  const revisionsQuery = useSiteThemeRevisions(workspace.id);

  if (frame && (draftQuery.isLoading || revisionsQuery.isLoading)) {
    return (
      <UI.Box direction="column" gap={3} className="h-dvh p-3" data-testid="site-theme-loading">
        <UI.Skeleton height={48} />
        <UI.Box direction="row" gap={3} grow>
          <UI.Box grow>
            <UI.Skeleton className="h-full" />
          </UI.Box>
          <UI.Skeleton width={360} className="h-full max-md:hidden" />
        </UI.Box>
      </UI.Box>
    );
  }
  if (draftQuery.isLoading || revisionsQuery.isLoading) {
    return (
      <UI.Box direction="column" gap={4} data-testid="site-theme-loading">
        <UI.Skeleton height={88} />
        <UI.Skeleton height={420} />
      </UI.Box>
    );
  }
  if (draftQuery.error || revisionsQuery.error || !draftQuery.data) {
    return (
      <UI.Alert variant="destructive" data-testid="site-theme-load-error">
        {t("loadError")}
      </UI.Alert>
    );
  }
  return (
    <SiteThemeLive
      workspace={workspace}
      initial={draftQuery.data}
      revisions={revisionsQuery.data?.items ?? []}
      frame={frame}
    />
  );
}

/** The full-screen editor's options (EP-187, layer 5): where Back leads. */
export type SiteThemeFrameOptions = {
  back: { href: string; onClick?: React.MouseEventHandler<HTMLAnchorElement> };
};

function SiteThemeLive({
  workspace,
  initial,
  revisions,
  frame,
}: {
  workspace: Workspace;
  initial: SiteThemeDraft;
  revisions: SiteThemeRevision[];
  frame?: SiteThemeFrameOptions;
}) {
  const t = useTranslations("siteTheme");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const ws = workspace.id;

  const form = useForm<SiteTheme>({
    defaultValues: cloneTheme(initial.theme),
    mode: "onChange",
  });
  const draft = form.watch();

  /* ---------------------------------------------------------- save loop */

  const versionRef = React.useRef(initial.version);
  /** What the service holds now — the baseline of «is there anything to send». */
  const savedRef = React.useRef<SiteTheme>(normalizeTheme(initial.theme));
  const inFlight = React.useRef<Promise<void> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** While a restore is on its way, no edit is sent: it would land on top of the restored draft. */
  const restoring = React.useRef(false);
  const [save, setSave] = React.useState<ThemeSaveView>({ state: "idle" });
  const [publishedRev, setPublishedRev] = React.useState(initial.published_revision);
  const [restoredFrom, setRestoredFrom] = React.useState<number | undefined>(undefined);

  const adopt = React.useCallback(
    (next: SiteThemeDraft) => {
      versionRef.current = next.version;
      savedRef.current = normalizeTheme(next.theme);
      setPublishedRev(next.published_revision);
      queryClient.setQueryData(siteThemeKeys.draft(ws), next);
    },
    [queryClient, ws]
  );

  const sendNow = React.useCallback(async (): Promise<void> => {
    if (restoring.current) return;
    if (inFlight.current) {
      // One request at a time: the newest values go after it.
      await inFlight.current;
      return sendNow();
    }
    const values = form.getValues();
    if (!themeSendable(values)) {
      setSave({ state: "invalid" });
      return;
    }
    const body = normalizeTheme(values);
    if (JSON.stringify(body) === JSON.stringify(savedRef.current)) {
      setSave((s) => (s.state === "saving" || s.state === "refused" ? { state: "saved" } : s));
      return;
    }
    setSave({ state: "saving" });
    const run = (async () => {
      try {
        const next = await siteThemeApi.patchDraft(ws, { ...body, version: versionRef.current });
        adopt(next);
        setSave({ state: "saved" });
      } catch (error) {
        const fieldErrors = themeFieldErrors(error);
        const conflict = themeConflictDraft(error);
        if (fieldErrors) {
          setSave({ state: "refused", errors: fieldErrors });
        } else if (conflict) {
          adopt(conflict);
          form.reset(cloneTheme(conflict.theme));
          setSave({ state: "conflict" });
        } else {
          setSave({ state: "error", onRetry: () => void sendNow() });
        }
      }
    })();
    inFlight.current = run;
    try {
      await run;
    } finally {
      inFlight.current = null;
    }
  }, [adopt, form, ws]);

  /** Waits for the pending edit to be saved; true when the screen IS the saved draft. */
  const flush = React.useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    await sendNow();
    const values = form.getValues();
    return (
      themeSendable(values) &&
      JSON.stringify(normalizeTheme(values)) === JSON.stringify(savedRef.current)
    );
  }, [form, sendNow]);

  React.useEffect(() => {
    const sub = form.watch(() => {
      if (timer.current) clearTimeout(timer.current);
      setSave((s) => (s.state === "conflict" ? s : { state: "saving" }));
      timer.current = setTimeout(() => {
        timer.current = null;
        void sendNow();
      }, THEME_SAVE_DEBOUNCE_MS);
    });
    return () => {
      sub.unsubscribe();
      // Leaving the tab (or the page) inside the debounce must not lose the
      // last edit: it is sent now instead of in 800 ms.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void sendNow();
      }
    };
  }, [form, sendNow]);
  // …and a tab close or reload while the draft is not on the server asks
  // first — the one leave-guard of every autosaving editor (EP-186 pattern 6).
  // A conflict already put the service's draft on screen: nothing to lose.
  useBeforeUnloadGuard(
    save.state === "saving" || save.state === "invalid" || save.state === "refused" || save.state === "error"
  );

  /* ---------------------------------------------------- revisions, actions */

  const formatAt = React.useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Almaty",
      }).format(d);
    },
    [locale]
  );
  const revisionViews = React.useMemo<ThemeRevisionView[]>(
    () => revisions.map((r) => ({ n: r.revision, theme: r.theme, at: formatAt(r.created_at) })),
    [revisions, formatAt]
  );
  const live = revisionViews.find((r) => r.n === publishedRev) ?? null;

  const [busy, setBusy] = React.useState<"publish" | "restore" | null>(null);
  const [publishError, setPublishError] = React.useState<string | null>(null);
  const [restoreError, setRestoreError] = React.useState<string | null>(null);
  const [settledAt, setSettledAt] = React.useState(0);

  const publish = async () => {
    setBusy("publish");
    setPublishError(null);
    try {
      if (!(await flush())) {
        setPublishError(t("publishDialog.unsaved"));
        return;
      }
      const rev = await siteThemeApi.publish(ws);
      setPublishedRev(rev.revision);
      setRestoredFrom(undefined);
      // The cached draft is what the tab mounts from next time (Members →
      // back): it must already say which revision is live.
      queryClient.setQueryData<SiteThemeDraft>(siteThemeKeys.draft(ws), (old) =>
        old ? { ...old, published_revision: rev.revision, has_unpublished_changes: false } : old
      );
      await queryClient.invalidateQueries({ queryKey: siteThemeKeys.revisions(ws) });
      setSettledAt(Date.now());
    } catch (error) {
      const fieldErrors = themeFieldErrors(error);
      if (fieldErrors) setSave({ state: "refused", errors: fieldErrors });
      setPublishError(fieldErrors ? t("publishDialog.refused") : t("publishDialog.error"));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (n: number) => {
    setBusy("restore");
    setRestoreError(null);
    try {
      // An edit still waiting would land on top of the restored draft.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      restoring.current = true;
      if (inFlight.current) await inFlight.current;
      const next = await siteThemeApi.restore(ws, n);
      adopt(next);
      form.reset(cloneTheme(next.theme));
      setSave({ state: "saved" });
      setRestoredFrom(n);
      setSettledAt(Date.now());
    } catch {
      setRestoreError(t("restoreDialog.error"));
    } finally {
      restoring.current = false;
      setBusy(null);
    }
  };

  const applyPreset = (preset: Preset) => {
    // One change of the whole draft; the watcher saves it like any edit.
    form.reset(applyPresetTheme(preset.theme, form.getValues()), { keepDefaultValues: true });
    setRestoredFrom(undefined);
    if (timer.current) clearTimeout(timer.current);
    setSave({ state: "saving" });
    timer.current = setTimeout(() => {
      timer.current = null;
      void sendNow();
    }, THEME_SAVE_DEBOUNCE_MS);
  };

  /* ------------------------------------------------------------- preview */

  const routesQuery = useRoutes(ws);
  const previewRoute: PagesRoute | null = React.useMemo(() => {
    const list = (routesQuery.data ?? []).filter((r) => !r.path.includes("["));
    return list.find((r) => r.path === "/") ?? list[0] ?? null;
  }, [routesQuery.data]);
  const base = useSitesBaseDomain();
  const host =
    siteAddress(workspace.slug, base, previewRoute?.path ?? "/")?.label ??
    (workspace.slug ? workspace.slug : workspace.name);
  // The frame takes only a theme the service would store: while a colour is
  // half typed, the last valid draft stays on screen.
  const lastValid = React.useRef<SiteTheme>(normalizeTheme(initial.theme));
  if (themeHexValid(draft)) lastValid.current = normalizeTheme(draft);
  const previewTheme = lastValid.current;

  const preview = previewRoute ? (
    <SiteThemePagePreview workspaceId={ws} route={previewRoute} theme={previewTheme} host={host} />
  ) : routesQuery.isLoading ? (
    <UI.Skeleton height={360} />
  ) : (
    <ThemePreview theme={previewTheme} host={host} title={t("preview.sample")} note={t("preview.sampleNote")} />
  );

  const [device, setDevice] = React.useState<StudioDeviceId>("desktop");
  if (frame) {
    const canvas = previewRoute ? (
      <SiteThemePagePreview
        workspaceId={ws}
        route={previewRoute}
        theme={previewTheme}
        host={host}
        deviceWidth={studioDeviceWidth(device)}
      />
    ) : routesQuery.isLoading ? (
      <UI.Skeleton height={360} className="w-full" />
    ) : (
      <div className="w-full max-w-3xl">
        <ThemePreview theme={previewTheme} host={host} title={t("preview.sample")} note={t("preview.sampleNote")} />
      </div>
    );
    return (
      <div data-testid="site-theme-live" data-version={versionRef.current} className="contents">
        <SiteThemeFrameView
          workspaceName={workspace.name}
          back={frame.back}
          device={device}
          onDeviceChange={setDevice}
          canvas={canvas}
          notice={save.state === "conflict" ? <UI.Alert data-testid="theme-conflict">{t("save.conflictNote")}</UI.Alert> : null}
          form={form}
          draft={draft}
          published={live}
          revisions={revisionViews}
          restoredFrom={restoredFrom}
          onApplyPreset={applyPreset}
          onPublish={() => void publish()}
          onRestore={(n) => void restore(n)}
          confirmPublish
          save={save}
          busy={busy}
          publishError={publishError}
          restoreError={restoreError}
          settledAt={settledAt}
        />
      </div>
    );
  }

  return (
    <UI.Box direction="column" gap={4} data-testid="site-theme-live" data-version={versionRef.current}>
      {save.state === "conflict" ? (
        <UI.Alert data-testid="theme-conflict">{t("save.conflictNote")}</UI.Alert>
      ) : null}
      <SiteThemeEditorView
        form={form}
        draft={draft}
        published={live}
        revisions={revisionViews}
        restoredFrom={restoredFrom}
        preview={preview}
        onApplyPreset={applyPreset}
        onPublish={() => void publish()}
        onRestore={(n) => void restore(n)}
        confirmPublish
        save={save}
        busy={busy}
        publishError={publishError}
        restoreError={restoreError}
        settledAt={settledAt}
      />
    </UI.Box>
  );
}
