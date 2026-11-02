"use client";

export type { SaunaContext, SaunaRegistry, SaunaRoute, SaunaUser } from "./types";
export type { SaunaProps } from "./sauna-props";
export type {
  SaunaComponentCatalog,
  SaunaComponentCatalogItem,
  SaunaComponentGroup,
  SaunaComponentGroupId,
  SaunaElementAdapter,
  SaunaElementSet,
  SaunaInsertable,
} from "./catalog";
export {
  SAUNA_UNGROUPED_ID,
  defineElementSet,
  findUndeclaredParts,
  findUnrenderableTypes,
  isCatalogItemAllowed,
  saunaCompoundParts,
} from "./catalog";
export { createCompoundRegistry, PAGES_COMPOUND_INVALID_ATTR, PAGES_COMPOUND_LOST_ATTR } from "./compounds";

export { createSaunaCatalog, type CreateSaunaCatalogOptions, type SaunaCatalog } from "./sauna-catalog";

export { SaunaRenderer, type SaunaRendererProps, type SaunaNodeBoundaryProps } from "./renderer";
export { SaunaNodeErrorBoundary, SAUNA_NODE_ERROR_ATTR } from "./error-boundary";
export { findUnmarkedTypes, type SaunaMarkProbe, type SaunaUnmarkedType } from "./node-marks";
export {
  Text,
  Image,
  Box,
  Link,
  PRIMITIVE_REGISTRY,
  BOX_COLUMNS_ATTR,
  BOX_COLUMNS_RULE,
  type TextProps,
  type ImageProps,
  type BoxProps,
  type LinkProps,
} from "./primitives";
export { DataView, PublicDataView, PublicDataViewProvider, WIDGET_REGISTRY, type DataViewComponentProps, type PublicDataViewSource } from "./data-view";
export { Sauna } from "./sauna.client";
export { resolveNodeBody, type ResolvedNodeBody } from "./variants";
export {
  SaunaProvider,
  useSaunaContext,
  type SaunaProviderProps,
  type SaunaProviderValue,
  type SaunaEndpointFn,
} from "./sauna-provider";
