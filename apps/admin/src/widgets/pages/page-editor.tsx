"use client";

// The pages editor host (SDL-605): SaunaStudio from @markerloop/studio over
// pages-service through the gateway, laid out like the EP-124 canvas
// /design-system/studio?case=edit|selected — the editor frame's header on top
// (EP-187, layer 5: shared/components/editor-frame, shared with the component and the
// site theme editors), then the Studio's own three tracks (Layers 260 /
// canvas 1fr / Properties 360).
//
// Data path: the engine's `createPagesServiceProvider` (GET/PATCH
// /api/v1/pages/pages/{id}?workspace_id=…, `version` for optimistic
// concurrency, 409 → SaunaConflictError). `useStudioAutoSave` debounces the
// store's edits into PATCHes and freezes on a conflict until reload.
//
// The editor gets the whole screen: the admin layout renders this route
// without its sidebar/header (app/(product)/product-shell.tsx). The link back to the
// section lives in the header — the only thing the editor needs from the
// shell (canvas StudioDocHeader note).
//
// Slice 3 put the address's life cycle in that header: publication (one
// button, which names the only action that means anything — see below),
// Preview, and an icon menu with the settings and delete dialogs
// (widgets/pages/address-dialogs.tsx). SDL-687 added the site side of it: the
// canvas's UrlChip and "Open site" for a published address
// (`https://<workspace slug>.<base><path>`, served by apps/site), the
// "unpublished changes" mark and "Update publication" (a new snapshot,
// SDL-676).

import { componentsListHref } from "./page-hrefs";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Eye, History } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { UrlChip } from "@markerloop/ui/ui/admin";
import { propsVersionsFromBlocks } from "@markerloop/engine";
import type { BlockDefinition, SaunaBlockMap, SaunaProvider, SaunaSchema, SaunaSnapshot, SaunaVersion } from "@markerloop/engine";
import { SaunaNodeErrorBoundary, SaunaRenderer } from "@markerloop/engine/react";
import { createPagesServiceProvider } from "@markerloop/engine/providers/pages";
import { useStore } from "zustand";
import {
  SaunaStudio,
  StudioCanvasControls,
  createPagesComponentsApi,
  createStudioStore,
  parentGuardFromBlocks,
  saunaBlockSections,
  type PagesComponentsApi,
  type SaunaComponentLibraryApi,
  type SaunaSaveAsComponentApi,
  type StudioAudience,
  type StudioScreen,
} from "@markerloop/studio";

import { useTranslations } from "@/shared/hooks";
import { isGatewayRouteMissing, workspaceTokens } from "@/shared/lib/api/client";
import { getApiBaseUrl } from "@/shared/lib/api/base-url";
import {
  COMPONENT_STALE_MS,
  markUnpublishedChanges,
  pagesBlockKeys,
  pagesComponentKeys,
  pagesHttpStatus,
  seedCreatedComponent,
  usePagesComponentBlocks,
  useRepublishRoute,
  useSetRouteStatus,
  type PagesRoute,
} from "@/entities/pages";
import { useProductFeatures } from "@/shared/config/product-features-context";
import { siteAddress } from "@/shared/config/site-address";
import { useSitesBaseDomain } from "@/shared/config/site-address-context";
import type { FileScope } from "@/entities/files";
import { customColors, useSiteThemeDraft, type CustomColor } from "@/entities/site-theme";
import { makeImageSrcEditor, usePageFileUrls } from "@/features/pages-media";

import { EditorSaveStatus } from "@/shared/components/save-status";
import { EditorFrame, EditorIconButton, EditorNameMenuButton } from "@/shared/components/editor-frame";
import { PublishMark, publishMarkState, usePublishMarkWord } from "@/shared/components/publish-mark";

import { AddressActions } from "./address-dialogs";
import { useEditorAutoSave } from "./editor-autosave";
import { PublishDialog, type PublishDialogKind } from "./publish-dialog";
import { PAGES_BLOCKS, PAGES_PROPS_MANIFEST, PAGES_REGISTRY } from "./catalog";
import { isPagesIsolatedType } from "@markerloop/studio/catalog";
import { usePagesDataSources } from "./data-sources";
import { DataViewHostProvider, readRecordParam, writeRecordParam, type DataViewHost } from "./data-view";
import { RefBlocksContext, refParamsSection } from "./ref-params-section";

/**
 * The bearer for the provider's requests: this tab's workspace token for the
 * provider's workspace (SDL-613 S6b), the same store apiClient's pages and
 * files calls use. Never the session token — the gateway takes the scope from
 * `wsid`. The exchange behind it is a session call through the one refresh
 * point (S6a), so the editor still never refreshes on its own.
 */
async function workspaceAuthHeaders(workspaceId: string): Promise<Record<string, string>> {
  const token = await workspaceTokens.get(workspaceId);
  return { Authorization: `Bearer ${token}` };
}

function bearerOf(headers: HeadersInit | undefined): string | null {
  const value = new Headers(headers).get("authorization");
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}

/**
 * The provider's fetch with apiClient's rule for a refused workspace token:
 * 401 (revoked, expired) → drop that token, exchange again, retry ONCE. 403
 * is not retried (one FORBIDDEN for a foreign wsid and a role refusal alike,
 * and the map cannot hold a foreign wsid). When the exchange itself is
 * refused (the member was removed → 403 not_a_member) the first answer
 * stands and the engine maps it to SaunaAccessDeniedError, as before.
 */
function withWorkspaceTokenRetry(
  workspaceId: string,
  fetchImpl: typeof globalThis.fetch
): typeof globalThis.fetch {
  return async (input, init) => {
    const res = await fetchImpl(input, init);
    if (res.status !== 401) return res;
    workspaceTokens.invalidate(workspaceId, bearerOf(init?.headers));
    let token: string;
    try {
      token = await workspaceTokens.get(workspaceId);
    } catch {
      return res;
    }
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    headers.authorization = `Bearer ${token}`;
    return fetchImpl(input, { ...init, headers });
  };
}

/** The admin's pages-service provider for one workspace. */
export function createAdminPagesProvider(
  workspaceId: string,
  fetchImpl?: typeof globalThis.fetch
): SaunaProvider {
  return createPagesServiceProvider({
    apiBaseUrl: getApiBaseUrl(),
    workspaceId,
    headers: () => workspaceAuthHeaders(workspaceId),
    fetch: withWorkspaceTokenRetry(workspaceId, fetchImpl ?? ((input, init) => globalThis.fetch(input, init))),
  });
}

/**
 * The workspace's Components (SDL-719): `POST /v1/pages/blocks` with a key,
 * list and read — the studio package's client over the same workspace-token
 * fetch as the page provider above.
 */
export function createAdminPagesComponentsApi(
  workspaceId: string,
  fetchImpl?: typeof globalThis.fetch
): PagesComponentsApi {
  return createPagesComponentsApi({
    apiBaseUrl: getApiBaseUrl(),
    workspaceId,
    headers: () => workspaceAuthHeaders(workspaceId),
    fetch: withWorkspaceTokenRetry(workspaceId, fetchImpl ?? ((input, init) => globalThis.fetch(input, init))),
  });
}

/**
 * pages-service marks its editor read of a page with this header when it
 * strips private content from the public read plane itself (SDL-632). The
 * gateway copies upstream response headers, and the admin reads through the
 * same-origin `/api`, so CORS does not hide it.
 */
export const PUBLIC_SHELL_HEADER = "X-Pages-Public-Shell";

/** The editor's snapshot of a page plus whether the server strips private content. */
export type EditorPageSnapshot = SaunaSnapshot & { publicShell: boolean };

/**
 * The editor read of a page. The rollout order is enforced here: until the
 * server says it strips private content (`X-Pages-Public-Shell: 1`), the
 * author gets no visibility switch — a "private" block would still be served
 * to anyone.
 */
export async function readEditorPage(workspaceId: string, pageId: string): Promise<EditorPageSnapshot> {
  let publicShell = false;
  const provider = createAdminPagesProvider(workspaceId, async (input, init) => {
    const res = await globalThis.fetch(input, init);
    publicShell = res.headers.get(PUBLIC_SHELL_HEADER) === "1";
    return res;
  });
  const snapshot = await provider.get(pageId);
  return { ...snapshot, publicShell };
}

/** Per-node isolation of the canvas — the same types the published render isolates (SDL-678). */
export { isPagesIsolatedType };

/**
 * The editor's store, built from the catalog it offers (`blocks`, the
 * admin's set by default): the nesting rule (SDL-634) and the Elements'
 * props versions, which every node the store creates is stamped with
 * (SDL-667). Exported so `smoke:pages` inserts through this very store.
 */
export function createPagesEditorStore(
  initialSchema: SaunaSchema,
  blocks: readonly BlockDefinition[] = PAGES_BLOCKS
) {
  return createStudioStore({
    initialSchema,
    canParent: parentGuardFromBlocks(blocks),
    propsVersionOf: propsVersionsFromBlocks(blocks),
  });
}

/**
 * The canvas: the engine renderer with `context.file`, so a `mlfile:<uuid>`
 * in the page becomes a real picture (SDL-624 §6.3). Its own component
 * because the URLs are queries — hooks cannot live in a render prop.
 * The view screen (SDL-643, ./page-view.tsx) draws the page through this same
 * component, never editable.
 */
/** The query value that opens the editor with the «Save as component» hint (EP-175). */
export const SAVE_COMPONENT_HINT = "save-component";

export function PagesCanvas({
  schema,
  editable,
  fileScope,
  screen,
  audience,
  blocks,
}: {
  schema: SaunaSchema;
  editable: boolean;
  fileScope: FileScope | null;
  /** The width variant the Studio is editing (SDL-632): the canvas shows it. */
  screen: StudioScreen;
  /**
   * Who the canvas renders for (SDL-632 S6): the Guests / Signed in tab of a
   * hybrid block, and always a guest in preview — a private block is not drawn.
   */
  audience: StudioAudience;
  /**
   * The Components the page's `Ref` nodes point at, by id (SDL-719) — without
   * them every Ref draws the "not found" plate.
   */
  blocks?: SaunaBlockMap;
}) {
  const file = usePageFileUrls(schema, fileScope, blocks);
  return (
    <SaunaRenderer
      editable={editable}
      schema={schema}
      registry={PAGES_REGISTRY}
      // A node whose props follow another version of its Element draws a
      // plate, never its props misread (SDL-667).
      elements={PAGES_BLOCKS}
      context={{ file, screen, audience }}
      nodeBoundary={SaunaNodeErrorBoundary}
      isolate={isPagesIsolatedType}
      blocks={blocks}
    />
  );
}

/**
 * The theme DRAFT's custom colours (SDL-950) for a SaunaStudio's
 * `themeColors`: the page and the Component editors offer them in the
 * inspector and paint them on the canvas. Absent while the draft loads.
 */
export function useThemeDraftColors(workspaceId: string): CustomColor[] | undefined {
  const themeDraft = useSiteThemeDraft(workspaceId);
  const theme = themeDraft.data?.theme;
  return React.useMemo(() => (theme ? customColors(theme) : undefined), [theme]);
}

/**
 * The node sections under Properties (SDL-632 S6): Visibility (mode) and
 * Variants (width), in the canvas's order. Built once — the sections read the
 * store they are handed, they hold no state of their own.
 */
const BLOCK_SECTIONS = saunaBlockSections();

export function PageEditor({
  workspaceId,
  workspaceSlug = null,
  fileScope,
  route,
  pageId,
  initialSchema,
  initialVersion,
  publicShell,
  backHref,
  historyHref,
  onReload,
}: {
  workspaceId: string;
  /**
   * The workspace's slug (SDL-677) — the first label of its site's host.
   * `null` = not known (not backfilled yet): no site address is shown.
   */
  workspaceSlug?: string | null;
  /** Where the page's pictures live (features/pages-media selectionFileScope). */
  fileScope: FileScope | null;
  route: PagesRoute;
  pageId: string;
  initialSchema: SaunaSchema;
  initialVersion: SaunaVersion;
  /**
   * The editor read carried `X-Pages-Public-Shell: 1` (SDL-632 S7): only then
   * are Visibility and Variants offered. Without it the server would serve a
   * "private" block to guests, so the author must not be able to make one.
   */
  publicShell: boolean;
  backHref: string;
  /** The page's revision journal (a screen of its own inside the address). */
  historyHref: string;
  /** Re-fetch the document from the service (conflict recovery). */
  onReload: () => void;
}) {
  const t = useTranslations("pages.editor");
  const tMenu = useTranslations("pages.menu");
  const tSave = useTranslations("common.saveStatus");
  // «Save from a page» on /components (EP-175) opens this editor with
  // ?hint=save-component: one line saying how a part becomes a Component.
  const searchParams = useSearchParams();
  const [saveHint, setSaveHint] = React.useState(false);
  React.useEffect(() => {
    if (searchParams?.get("hint") === SAVE_COMPONENT_HINT) setSaveHint(true);
  }, [searchParams]);
  const markWord = usePublishMarkWord();
  const propEditors = React.useMemo(() => ({ src: makeImageSrcEditor(fileScope) }), [fileScope]);
  const provider = React.useMemo(() => createAdminPagesProvider(workspaceId), [workspaceId]);
  const [store] = React.useState(() => createPagesEditorStore(initialSchema));
  const themeColors = useThemeDraftColors(workspaceId);
  const queryClient = useQueryClient();
  // The auto-save, its status and the leave-guard: the one implementation
  // the Block editor shares (./editor-autosave.ts, EP-186 pattern 6).
  const { autoSave, unsaved, saveState, retry, flushPendingSave, leaveTo } = useEditorAutoSave({
    store,
    provider,
    id: pageId,
    externalVersion: initialVersion,
    leaveUnsavedMessage: tSave("leaveUnsaved"),
    onSaveSuccess: () => {
      // A saved edit of a published page is not on the site until "Update
      // publication" (SDL-676 snapshot): say so now, not on the next re-read.
      void markUnpublishedChanges(queryClient, workspaceId, route.id);
      // A save may add or drop a Ref: the Blocks tab's usage is re-read (SDL-721).
      void queryClient.invalidateQueries({ queryKey: pagesBlockKeys.all(workspaceId) });
    },
  });
  const router = useRouter();

  /**
   * Preview = the canvas without the editor's identifiers. `editable` is the
   * only switch there is: without it the renderer puts no data-sauna-node-id
   * on the nodes, so a click selects nothing and inline text editing turns
   * itself off. The mode therefore has to SAY it is on — the canvas toolbar
   * carries the badge and the way out (packages/studio), and this button
   * stays lit.
   */
  const [preview, setPreviewState] = React.useState(false);
  /**
   * A `?record=<id>` address is a link to a record of the page's DataView
   * (SDL-641): the widget opens it only when live, so the editor starts in
   * preview for it. Leaving preview drops the parameter — the record it
   * named is no longer open, and a reload must not bring preview back.
   */
  const setPreview = React.useCallback((next: boolean) => {
    if (!next) writeRecordParam(null);
    setPreviewState(next);
  }, []);
  const togglePreview = (next: boolean) => {
    // A selection frame drawn around a node that no longer carries an id
    // would hang over the page until the next click.
    if (next) store.getState().selectNode(null);
    setPreview(next);
  };
  React.useEffect(() => {
    if (readRecordParam(window.location.search)) {
      store.getState().selectNode(null);
      setPreviewState(true);
    }
    // Once, on arrival (`store` is created once): the address is read as the
    // link that brought us here.
  }, [store]);
  /**
   * "Open in Studio" on a DataView whose collection is gone (canvas A): the
   * author is already in Studio, looking through a visitor's eyes — the way
   * to the binding is back to editing, where the node can be selected and
   * rebound. On the editable canvas the widget keeps the button inert.
   * Leaving preview is only `setPreview(false)` (togglePreview clears the
   * selection on the way IN), and the setter is stable.
   */
  const dataViewHost = React.useMemo<DataViewHost>(
    () => ({
      openInStudio: (collectionId) => {
        setPreview(false);
        // …and select the DataView the author came from (SDL-642): its
        // settings panel is where the binding is fixed. The node bound to this
        // collection, else the first DataView on the page. After the frame
        // that leaves preview, so the selection lands on an editable canvas.
        const nodes = store.getState().schema.nodes;
        const views = Object.entries(nodes).filter(([, n]) => n.type === "DataView");
        const bound = views.find(([, n]) => {
          const source = (n.props as { source?: { collection_id?: unknown } } | undefined)?.source;
          return collectionId !== null && source?.collection_id === collectionId;
        });
        const target = (bound ?? views[0])?.[0];
        if (target) requestAnimationFrame(() => store.getState().selectNode(target));
      },
    }),
    [setPreview, store]
  );
  const dataSources = usePagesDataSources(workspaceId);

  // Components (SDL-719, EP-145). "Save as component" writes the Component
  // first (POST with a key, the service's id), seeds its schema so the Ref it
  // leaves is drawn at once, and re-reads the list; the Insert modal's
  // "Your components" tab reads the same cache. A page is never a Component,
  // so it hosts no cycle (`hostBlockId: null`); the empty state links to the
  // Blocks tab of the pages section (SDL-721).
  const componentsApi = React.useMemo(() => createAdminPagesComponentsApi(workspaceId), [workspaceId]);
  const saveAsComponent = React.useMemo<SaunaSaveAsComponentApi>(
    () => ({
      create: async (input) => {
        const created = await componentsApi.saveAsComponent.create(input);
        seedCreatedComponent(queryClient, workspaceId, created.id, input.schema);
        return created;
      },
      // The Group field of "Save as component" (EP-175): the groups the
      // workspace's Components already carry.
      groups: () => componentsApi.saveAsComponent.groups?.() ?? Promise.resolve([]),
    }),
    [componentsApi, queryClient, workspaceId]
  );
  const componentLibrary = React.useMemo<SaunaComponentLibraryApi>(
    () => ({
      hostBlockId: null,
      list: () =>
        queryClient.fetchQuery({
          queryKey: pagesComponentKeys.list(workspaceId),
          queryFn: componentsApi.list,
          staleTime: 0,
        }),
      load: (blockId) =>
        queryClient.fetchQuery({
          queryKey: pagesComponentKeys.schema(workspaceId, blockId),
          queryFn: () => componentsApi.load(blockId),
          staleTime: COMPONENT_STALE_MS,
        }),
      libraryHref: componentsListHref(workspaceId),
    }),
    [componentsApi, queryClient, workspaceId]
  );
  const liveSchema = useStore(store, (s) => s.schema);
  const refBlocks = usePagesComponentBlocks(workspaceId, componentsApi, liveSchema);
  // The node sections: Visibility and Variants, then a Ref's Component
  // parameters. Offered as one column, and only behind the public-shell
  // header like before (SDL-632 S7) — without it there is no sections column.
  const pagesSections = React.useMemo(
    () => [...BLOCK_SECTIONS, refParamsSection(t("componentParams"))],
    [t]
  );

  /**
   * Publication.
   *
   * Publishing takes a snapshot of the SAVED page (pages-service SDL-676), not
   * of what is on the screen — so publishing (and "Update publication")
   * flushes the debounced save first, and the button is refused outright while
   * the auto-saver sits in `error`/`conflict`, where a flush cannot succeed and
   * the body on the server is somebody else's.
   *
   * One button (EP-186 pattern 7), and it names the only action that means
   * anything: on a draft "publish", on a published address whose site is
   * behind "update publication", otherwise "unpublish" (while the site is
   * behind, unpublishing stays in the address menu's delete dialog). A second
   * press of "publish" would be a no-op that reports success. The state itself
   * is said by the one mark next to it, never by reading the button
   * backwards. Pressing the button only opens the dialog that says what
   * visitors will see; its confirm button does the step.
   */
  const setStatus = useSetRouteStatus();
  const republish = useRepublishRoute();
  const [actionError, setActionError] = React.useState<string | null>(null);
  const published = route.status === "published";
  const saveBlocked = autoSave.status === "conflict" || autoSave.status === "error";
  /**
   * "Update publication" is busy from the click on — through the save flush,
   * which can take seconds, to the end of the PATCH. `republish.isPending`
   * covers only the PATCH, so a second click during the flush sent a second
   * PATCH.
   */
  const [republishBusy, setRepublishBusy] = React.useState(false);
  const statusBusy = setStatus.isPending || republish.isPending || republishBusy;
  /**
   * The site shows an older version than the editor (SDL-687): the service
   * says so for what is saved (`has_unpublished_changes`, SDL-676), and an
   * edit not saved yet is the same fact a moment early.
   */
  const siteBehind = published && (route.has_unpublished_changes === true || unsaved);
  const sitesBase = useSitesBaseDomain();
  const site = published ? siteAddress(workspaceSlug, sitesBase, route.path) : null;
  /**
   * SDL-636: publishing is a runtime flag of the contour (PAGES_PUBLISH_ENABLED,
   * off on prod until a publication snapshot exists). Off hides the way IN
   * only: a draft shows no button at all, while an address that is already
   * published — by the API, or before the flag went off — keeps "unpublish",
   * the retreat that takes it off the site.
   */
  const { pagesPublish } = useProductFeatures();
  const showPublishToggle = published || pagesPublish;
  const showRepublish = siteBehind && pagesPublish;
  const [confirmKind, setConfirmKind] = React.useState<PublishDialogKind | null>(null);
  const openConfirm = (kind: PublishDialogKind) => {
    setActionError(null);
    setConfirmKind(kind);
  };
  const closeConfirm = () => {
    setConfirmKind(null);
    setActionError(null);
  };
  /** `true` = the status flipped; the dialog closes. */
  const onPublishToggle = async (): Promise<boolean> => {
    // A second line under the hidden button: nothing on this screen may
    // publish while the contour has publishing off.
    if (!published && !pagesPublish) return false;
    setActionError(null);
    if (!(await flushPendingSave())) {
      setActionError(t("errors.unsavedPublish"));
      return false;
    }
    try {
      await setStatus.mutateAsync({
        workspaceId,
        routeId: route.id,
        version: route.version,
        status: published ? "draft" : "published",
      });
      return true;
    } catch (err) {
      // pages-service's own 404 means the address is gone. The GATEWAY's
      // 404 means the request never reached it — the address is still
      // there, and telling the person it was deleted elsewhere sends them
      // to look for a deletion that did not happen. The two are told apart
      // by the body, which is what `isGatewayRouteMissing` reads.
      const gone = pagesHttpStatus(err) === 404 && !isGatewayRouteMissing(err);
      setActionError(gone ? t("errors.gone") : t("errors.publish"));
      return false;
    }
  };
  /**
   * "Update publication": a new snapshot of the saved page for an address
   * already on the site. Same flag as publishing — it is the way IN for new
   * content — and the same flush first: the snapshot is of what is saved.
   */
  const onRepublish = async (): Promise<boolean> => {
    if (!published || !pagesPublish || republishBusy) return false;
    setRepublishBusy(true);
    setActionError(null);
    try {
      if (!(await flushPendingSave())) {
        setActionError(t("errors.unsavedPublish"));
        return false;
      }
      await republish.mutateAsync({ workspaceId, routeId: route.id, version: route.version });
      return true;
    } catch (err) {
      const gone = pagesHttpStatus(err) === 404 && !isGatewayRouteMissing(err);
      setActionError(gone ? t("errors.gone") : t("errors.publish"));
      return false;
    } finally {
      setRepublishBusy(false);
    }
  };
  /** The dialog's confirm: the step it asked about. On an error it stays open and says so inline. */
  const onConfirmPublish = async () => {
    const ok = confirmKind === "republish" ? await onRepublish() : await onPublishToggle();
    if (ok) setConfirmKind(null);
  };
  /** The address the dialog names — where the page is (or will be) on the site. */
  const publicUrl = siteAddress(workspaceSlug, sitesBase, route.path)?.url ?? null;

  return (
    <UI.Box direction="column" data-testid="studio-desktop" className="h-dvh overflow-hidden bg-background">
      {/* The editor frame's one header (EP-187, layer 5, variant B). */}
      <EditorFrame
        kind="page"
        testId="studio-doc-header"
        back={{ href: backHref, label: t("back"), onClick: leaveTo(backHref), testId: "studio-back" }}
        name={route.path}
        fullName={route.path}
        nameTestId="studio-title"
        nameMenu={
          // The address menu, now behind the name's ▾: the full address, the
          // site, then the address's settings and delete (unpublish lives in
          // the delete dialog).
          <AddressActions
            workspaceId={workspaceId}
            route={route}
            pageId={pageId}
            onGone={() => router.push(backHref)}
            // The notice below is about one state of one address. A
            // rename or an unpublish from this very menu moves the
            // address on, and a red line left standing over the header
            // then reads as a complaint about the action that just
            // succeeded. Only the dialogs know when that happened —
            // `route.version` cannot say it, because the 409 path writes
            // the conflicting route into the cache BEFORE the catch below
            // raises the notice, and clearing on the version would wipe
            // the notice in the same commit that set it.
            onRouteChanged={() => setActionError(null)}
            trigger={<EditorNameMenuButton label={tMenu("label")} data-testid="studio-address-menu" />}
            leadingItems={
              <>
                <UI.Menu.Label className="max-w-72 break-all font-mono text-xs" data-testid="studio-full-path">
                  {route.path}
                </UI.Menu.Label>
                <UI.Menu.Separator />
              </>
            }
          />
        }
        saveStatus={
          <EditorSaveStatus
            state={saveState}
            detail={(autoSave.error as { code?: unknown } | null)?.code === "component_depth_exceeded" ? t("save.componentDepth", { limit: String((autoSave.error as unknown as { limit: number }).limit) }) : autoSave.error?.message}
            onRetry={retry}
            testId="studio-save"
            retryTestId="studio-save-retry"
            data={{ "data-save-status": autoSave.status }}
          />
        }
        center={<StudioCanvasControls store={store} readOnly={preview} />}
        status={
          <>
            {/* ONE mark, three states, the words every publication uses
                (EP-186 pattern 7). "Unpublished changes" keeps its own
                testid inside the mark. */}
            <PublishMark state={publishMarkState(published, siteBehind)} data-testid="studio-status">
              {siteBehind ? (
                <span data-testid="studio-unpublished-changes">{markWord("unpublishedChanges")}</span>
              ) : undefined}
            </PublishMark>
            {site ? (
              // The site's address: wide screens only — the kit cuts its label
              // at 18ch, which on a narrow header answers nothing. "Open site"
              // carries the way there on every width.
              <UrlChip
                href={site.url}
                title={site.url}
                aria-label={t("siteAddress", { url: site.url })}
                className="hidden xl:inline-flex"
                data-testid="studio-url"
              >
                {site.label}
              </UrlChip>
            ) : null}
          </>
        }
        actions={
          <>
            <UI.Button asChild variant="ghost" size="icon-sm">
              <Link
                href={historyHref}
                onClick={leaveTo(historyHref)}
                aria-label={t("history")}
                title={t("history")}
                data-testid="studio-history"
              >
                <History size={16} aria-hidden="true" />
              </Link>
            </UI.Button>
            {site ? (
              <UI.Button asChild variant="ghost" size="icon-sm">
                <a
                  href={site.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("openSiteAria", { url: site.url })}
                  title={t("openSite")}
                  data-testid="studio-open-site"
                >
                  <ExternalLink size={16} aria-hidden="true" />
                </a>
              </UI.Button>
            ) : null}
            <EditorIconButton
              label={t("preview")}
              pressed={preview}
              onClick={() => togglePreview(!preview)}
              data-testid="studio-preview-toggle"
            >
              <Eye size={16} aria-hidden="true" />
            </EditorIconButton>
            {showRepublish ? (
              <UI.Button
                size="sm"
                disabled={statusBusy || saveBlocked}
                onClick={() => openConfirm("republish")}
                data-testid="studio-republish"
              >
                {republishBusy ? t("republishing") : t("republish")}
              </UI.Button>
            ) : showPublishToggle ? (
              <UI.Button
                size="sm"
                variant={published ? "outline" : "default"}
                disabled={statusBusy || saveBlocked}
                onClick={() => openConfirm(published ? "unpublish" : "publish")}
                data-testid="studio-publish"
              >
                {setStatus.isPending
                  ? published
                    ? t("unpublishing")
                    : t("publishing")
                  : published
                    ? t("unpublish")
                    : t("publish")}
              </UI.Button>
            ) : null}
          </>
        }
      />

      <PublishDialog
        kind={confirmKind}
        path={route.path}
        url={publicUrl}
        pending={statusBusy}
        error={actionError}
        onCancel={closeConfirm}
        onConfirm={() => void onConfirmPublish()}
      />

      {saveHint ? (
        <UI.Box className="shrink-0 px-4 pt-3">
          <UI.Alert data-testid="studio-save-component-hint">
            <UI.Box direction="row" align="center" gap={3} wrap className="min-w-0">
              <UI.Text as="span" size="sm" className="min-w-0 flex-1">
                {t("saveComponentHint")}
              </UI.Text>
              <UI.Button size="sm" variant="ghost" onClick={() => setSaveHint(false)} data-testid="studio-save-component-hint-close">
                {t("saveComponentHintClose")}
              </UI.Button>
            </UI.Box>
          </UI.Alert>
        </UI.Box>
      ) : null}

      {actionError && confirmKind === null ? (
        <UI.Box className="shrink-0 px-4 pt-3">
          <UI.Alert variant="destructive" data-testid="studio-action-error">
            <UI.Text as="span" size="sm">
              {actionError}
            </UI.Text>
          </UI.Alert>
        </UI.Box>
      ) : null}

      {autoSave.status === "conflict" ? (
        <UI.Box className="shrink-0 px-4 pt-3">
          <UI.Alert variant="destructive" data-testid="studio-conflict">
            <UI.Box direction="row" align="center" gap={3} wrap>
              <UI.Text as="span" size="sm">
                {t("conflict")}
              </UI.Text>
              <UI.Button size="sm" variant="outline" onClick={onReload} data-testid="studio-reload">
                {t("reload")}
              </UI.Button>
            </UI.Box>
          </UI.Alert>
        </UI.Box>
      ) : null}

      <UI.Box grow className="min-h-0">
        <DataViewHostProvider value={dataViewHost}>
          <RefBlocksContext.Provider value={refBlocks}>
          <SaunaStudio
            store={store}
            blocks={PAGES_BLOCKS}
            // The theme draft's custom colours (SDL-950): swatches on
            // Section.background, Text.color and Box.background, and their
            // --pages-color-<key> variables on the canvas, so a chosen colour
            // shows at once. The rest of the theme stays off the canvas.
            themeColors={themeColors}
            // The kit's descriptors (SDL-632): kit blocks get a grouped form
            // instead of the raw JSON field.
            propsManifest={PAGES_PROPS_MANIFEST}
            outlineStateKey={`pages:${pageId}`}
            // Images come from the files library as `mlfile:<uuid>` (SDL-624).
            // Keyed by the field name, which works for the zod path and the
            // manifest path alike (studio properties/auto-form.tsx).
            propEditors={propEditors}
            // The workspace's collections for the DataView settings (SDL-642).
            dataSources={dataSources}
            preview={preview}
            onExitPreview={() => togglePreview(false)}
            // The devices and Undo / Redo are in the frame's header (EP-187).
            canvasToolbar={false}
            disableHotkeys={preview}
            sections={publicShell ? pagesSections : undefined}
            saveAsComponent={preview ? undefined : saveAsComponent}
            componentLibrary={componentLibrary}
            renderPreview={(schema, { screen, audience }) => (
              // `editable` marks every node with data-sauna-node-id so a click
              // on the canvas becomes a selection. Only here: a visitor's page
              // must not carry the editor's identifiers — and in preview the
              // author is looking at exactly what the visitor gets.
              <PagesCanvas
                editable={!preview}
                schema={schema}
                fileScope={fileScope}
                screen={screen}
                audience={audience}
                blocks={refBlocks}
              />
            )}
          />
          </RefBlocksContext.Provider>
        </DataViewHostProvider>
      </UI.Box>
    </UI.Box>
  );
}
