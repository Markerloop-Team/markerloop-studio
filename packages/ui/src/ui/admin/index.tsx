/**
 * Administrative primitives — `sunday-sauna/ui/admin`.
 *
 * Deliberately a SEPARATE entry point from `sunday-sauna/ui` (decision D1,
 * EP-15): `createSaunaCatalog(UI)` iterates every export of the `ui`
 * namespace and turns it into a schema block type for client sites. Editor
 * chrome (tree rows, panel columns, comboboxes) must never become schema
 * blocks, so it lives here, invisible to the catalog by construction —
 * no exclude-list to rot. Guarded by `src/__tests__/registry.test.ts`.
 */

// Grid is deliberately NOT on `./ui` (it would become a schema block, D1) —
// admin surfaces get it here. SDL-224 could not adopt it in the studio for
// exactly this reason; SDL-225 closes the gap on the admin entry.
export { Grid } from "../internal/layout/grid";
export type { GridProps, GridMinItemWidth } from "../internal/layout/grid";

export { TreeRow } from "./tree-row/tree-row";
export type { TreeRowProps } from "./tree-row/tree-row";

export { PanelHeader } from "./panel-header/panel-header";
export type { PanelHeaderProps } from "./panel-header/panel-header";

export { StatusIndicator } from "./status-indicator/status-indicator";
export type { StatusIndicatorProps } from "./status-indicator/status-indicator";

export {
  PanelColumn,
  PanelColumnHeader,
  PanelColumnBody,
  PanelColumnFooter,
} from "./panel-column/panel-column";
export type {
  PanelColumnProps,
  PanelColumnHeaderProps,
  PanelColumnBodyProps,
  PanelColumnFooterProps,
} from "./panel-column/panel-column";

export { Combobox } from "./combobox/combobox";
export type { ComboboxProps, ComboboxOption } from "./combobox/combobox";

// Screen scaffolds (SDL-223): the repeated screen compositions of an admin
// app, lifted from the studio. Generic chrome only — domain widgets
// (records tables, schema editors) stay in the host by decision of 11 Aug 2026.

export { ScreenShell } from "./screen-shell/screen-shell";
export type { ScreenShellProps } from "./screen-shell/screen-shell";

export { ScreenHeader } from "./screen-header/screen-header";
export type { ScreenHeaderProps } from "./screen-header/screen-header";

export { DocHeader } from "./doc-header/doc-header";
export type { DocHeaderProps } from "./doc-header/doc-header";

export { UrlChip } from "./url-chip/url-chip";
export type { UrlChipProps } from "./url-chip/url-chip";

// Screen pattern 2 (EP-186): one tile and one grid for every tiled screen.
export { Tile, TileGrid } from "./tile/tile";
export type { TileProps, TileGridProps } from "./tile/tile";

export { SaveStatus } from "./save-status/save-status";
export type { SaveStatusProps, SaveStatusState } from "./save-status/save-status";

// Read-only pm/1 rich text (SDL-638). Admin entry, not `./ui`: it is a view
// of a field value, not a page block, so it must stay out of the catalog.
export {
  RichTextView,
  richTextHasFormatting,
  isAllowedRichTextHref,
  RICH_TEXT_LINK_SCHEMES,
} from "./rich-text-view/rich-text-view";
export type { RichTextViewProps } from "./rich-text-view/rich-text-view";
