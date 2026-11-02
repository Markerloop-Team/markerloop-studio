"use client";

// The page VIEW screen (SDL-643, EP-130 «Messages feed»): a workspace member
// opens a page inside Markerloop to use it, not to edit it. One page, two
// places — inside the product it is always the draft (the current body, read
// exactly like the editor reads it); the workspace subdomain will serve only
// the published version (not this screen).
//
// Laid out after canvas A (/design-system/feed, SDL-637): the product's rail
// and header stay (the view lives INSIDE the product, in the interface
// theme), and the page itself sits in the same frame the editor's canvas
// uses — `CanvasFrame` from @markerloop/studio, the same public sheets,
// the same renderer (`PagesCanvas`), never editable. The site theme from
// `layouts.theme` is out of scope for this first case.
//
// No editor chrome: no outline, no properties, no selection overlay, no
// device switcher. The frame is given the width of the column it sits in, so
// it is drawn 1:1 and the page's own `@media` sees the real width.

import * as React from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { SectionHeader } from "@/shared/components/section-header";
import type { SaunaSchema } from "@markerloop/engine";
import { CanvasFrame, type StudioScreen } from "@markerloop/studio";

import { useTranslations } from "@/shared/hooks";
import { PublishMark, publishMarkState } from "@/shared/components/publish-mark";
import type { PagesRoute } from "@/entities/pages";
import type { FileScope } from "@/entities/files";

import { DataViewHostProvider, type DataViewHost } from "./data-view";
import { PagesCanvas, createAdminPagesComponentsApi } from "./page-editor";
import { usePagesComponentBlocks } from "@/entities/pages";

export { pageEditorHref, pageViewHref } from "./page-hrefs";

/**
 * Which width variant of the page the view draws for a column this wide —
 * the same breakpoints the canvas devices stand on (768 tablet, 1024+ base).
 */
export function viewScreenFor(width: number): StudioScreen {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "base";
}

/** The narrowest viewport the frame is given, whatever the column. */
export const VIEW_MIN_WIDTH = 320;

/**
 * The page in the editor's frame, 1:1 with its column. Before the first
 * measurement there is no width to give it, so a placeholder holds the place.
 */
export function PageViewFrame({
  schema,
  fileScope,
  title,
  workspaceId,
  theme,
  width: fixedWidth,
}: {
  schema: SaunaSchema;
  fileScope: FileScope | null;
  title: string;
  /**
   * A device width to draw the page at (EP-187: the site theme's canvas with
   * its Desktop / Tablet / Phone switch) instead of the column's own width.
   * The frame scales it down to fit, as the editor's canvas does.
   */
  width?: number;
  /** The page's workspace: its Components draw the page's `Ref` nodes (SDL-719). */
  workspaceId: string;
  /**
   * A site theme to draw the page in (SDL-773 `CanvasFrame theme`) — the Site
   * theme tab passes its draft (SDL-776); absent = the kit's own look.
   */
  theme?: unknown;
}) {
  const componentsApi = React.useMemo(() => createAdminPagesComponentsApi(workspaceId), [workspaceId]);
  const refBlocks = usePagesComponentBlocks(workspaceId, componentsApi, schema);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setWidth(box.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  const frameWidth = fixedWidth ?? Math.max(VIEW_MIN_WIDTH, width);
  return (
    <div ref={boxRef} className="w-full min-w-0" data-testid="page-view-frame" data-view-width={width || undefined}>
      {width > 0 ? (
        <CanvasFrame width={frameWidth} title={title} theme={theme}>
          {/* A member is signed in: a hybrid block shows its member branch. */}
          <PagesCanvas
            editable={false}
            schema={schema}
            fileScope={fileScope}
            screen={viewScreenFor(frameWidth)}
            audience="member"
            blocks={refBlocks}
          />
        </CanvasFrame>
      ) : (
        <UI.Skeleton height={320} />
      )}
    </div>
  );
}

export function PageView({
  route,
  schema,
  fileScope,
  backHref,
  editHref,
  onOpenInStudio,
}: {
  route: PagesRoute;
  schema: SaunaSchema;
  fileScope: FileScope | null;
  backHref: string;
  editHref: string;
  /** "Open in Studio" on a DataView whose collection is gone: the editor of this address. */
  onOpenInStudio: () => void;
}) {
  const t = useTranslations("pages.view");
  const tNav = useTranslations("navigation");
  const published = route.status === "published";
  const host = React.useMemo<DataViewHost>(() => ({ openInStudio: onOpenInStudio }), [onOpenInStudio]);
  const title = route.title?.trim() ? route.title : route.path;
  return (
    <UI.Box direction="column" gap={5} data-testid="page-view" data-route-status={route.status}>
      {/*
        EP-157: no kicker, no «Back» button — the crumbs above the title are
        the way back to the list (and the phone's back arrow).
      */}
      <SectionHeader
        crumbs={[{ label: tNav("pages") as string, href: backHref }, { label: title }]}
        title={<span data-testid="page-view-title">{title}</span>}
        titleText={title}
        description={
          <UI.Box direction="row" align="center" gap={2} wrap>
            <UI.Text as="span" variant="muted" size="sm" className="font-mono" data-testid="page-view-path">
              {route.path}
            </UI.Text>
            <PublishMark
              state={publishMarkState(published, route.has_unpublished_changes === true)}
              data-testid="page-view-status"
            />
          </UI.Box>
        }
        actions={
          <UI.Box direction="row" align="center" gap={2} wrap>
            <UI.Button asChild variant="outline" data-testid="page-view-edit">
              <Link href={editHref}>
                <Pencil size={16} aria-hidden="true" />
                {t("edit")}
              </Link>
            </UI.Button>
          </UI.Box>
        }
      />
      <UI.Box className="rounded-lg bg-muted/40 p-3 md:p-6">
        <DataViewHostProvider value={host}>
          <PageViewFrame
            schema={schema}
            fileScope={fileScope}
            title={t("frameTitle", { path: route.path })}
            workspaceId={route.workspace_id}
          />
        </DataViewHostProvider>
      </UI.Box>
    </UI.Box>
  );
}
