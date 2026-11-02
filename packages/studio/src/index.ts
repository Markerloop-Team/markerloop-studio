// Sunday-Sauna `./studio` subpath — Phase 1A complete (PRs 3–5).
//
// What ships here:
//   - <SaunaStudio>            — 3-column outline / preview / properties shell
//   - createStudioStore()      — per-instance Zustand store, history, applyOp
//   - useStudioHotkeys()       — undo/redo/duplicate/delete/escape
//   - SchemaOp / Selection     — typed mutation vocabulary
//   - <SaunaPropertiesAutoForm> + Zod-driven editors + register/getPropEditor
//   - useStudioAutoSave()      — debounced save through a SaunaProvider with
//                                optimistic concurrency (412 → conflict callback)
//   - <SaunaEditableOverlay>   — fullscreen editing surface with dirty-state
//                                guarded close (Esc / backdrop / x button)
//
// Phase 1B will replace the legacy modal-based editor in `react/editor/`
// with visual-canvas DnD on top of the same store + ops.

export {
  SaunaStudio,
  type SaunaComponentLibraryApi,
  type SaunaSaveAsComponentApi,
  type SaunaStudioProps,
  type SaunaStudioRenderContext,
  type SaunaStudioSection,
} from "./shell";
// The canvas frame itself (SDL-643): the admin's page VIEW screen renders the
// page in the very frame the editor's canvas uses — same iframe, same public
// sheets, no editor chrome inside it. Exported under a neutral name; the
// device list stays internal to the Studio.
// The site theme (SDL-773): the published theme → the kit's CSS variables.
export {
  SITE_THEME_DARK_SELECTOR,
  SITE_THEME_DEFAULT,
  SITE_THEME_DENSITIES,
  SITE_THEME_RADII,
  SITE_THEME_ROLES,
  SITE_THEME_ROLE_VARIABLES,
  SITE_THEME_SHADOWS,
  SITE_THEME_STYLE_ATTR,
  SITE_THEME_TYPE_SCALES,
  SITE_THEME_CONTRAST_PAIRS,
  SITE_THEME_DEFAULT_FONTS,
  SITE_THEME_FONT_RULES,
  SITE_THEME_MIN_CONTRAST,
  SITE_THEME_MAX_SCALE_STEPS,
  SITE_THEME_SCALE_KEYS,
  SITE_THEME_SCALE_NAME,
  SITE_THEME_SCALES,
  SITE_THEME_MAX_CUSTOM_COLORS,
  SITE_THEME_MAX_CUSTOM_COLOR_LABEL,
  SiteThemeStyle,
  SiteThemeCustomColorStyle,
  SITE_THEME_CUSTOM_COLORS_STYLE_ATTR,
  siteThemeCustomColorCss,
  siteThemeCustomColorVariables,
  siteThemeColorLabelValid,
  isSiteThemeColorKey,
  SITE_THEME_COLOR_KEY,
  SITE_THEME_RESERVED_COLOR_KEYS,
  parseSiteTheme,
  siteThemeColorVariables,
  siteThemeContrast,
  siteThemeCss,
  siteThemeFontPreloads,
  siteThemeDefaultScale,
  siteThemeRootVariables,
  siteThemeScaleVariables,
  validateSiteTheme,
  type SiteTheme,
  type SiteThemeCustomColor,
  type SiteThemeScaleKey,
  type SiteThemeScaleSpec,
  type SiteThemeScaleStep,
  type SiteThemeCssOptions,
  type SiteThemeFontPreload,
  type SiteThemeFonts,
  type SiteThemeRole,
} from "./site-theme";
export { SITE_THEME_PRESETS, siteThemePreset, type SiteThemePreset, type SiteThemePresetTheme } from "./site-theme-presets";
export {
  SITE_FONTS,
  SITE_FONTS_BASE,
  SITE_FONT_DEFAULT,
  SITE_FONT_FALLBACKS,
  SITE_FONT_SUBSET_RANGES,
  SITE_FONT_WEIGHTS,
  siteFont,
  siteFontFaces,
  siteFontFile,
  siteFontStack,
  siteFontSubsets,
  type SiteFont,
  type SiteFontCategory,
  type SiteFontSubset,
} from "./site-fonts";
export { SaunaGroupField, type SaunaGroupFieldProps } from "./group-field";
export { saunaComponentGroups, saunaGroupOptions, type SaunaGroupOption } from "./group-options";
export { SaunaCanvasFrame as CanvasFrame, type SaunaCanvasFrameProps as CanvasFrameProps } from "./canvas-frame";
export {
  StudioCanvasControls,
  StudioDeviceSwitch,
  StudioUndoRedo,
  studioDeviceWidth,
  type StudioDeviceId,
} from "./canvas-controls";
export {
  saunaCachingBlockLoader,
  saunaCyclicComponentIds,
  saunaTooDeepComponentIds,
  saunaFilterComponents,
  type SaunaComponentSummary,
} from "./own-components";
export {
  saunaCheckComponentName,
  saunaComponentKey,
  saunaComponentNameSuggestion,
  saunaIsComponentKey,
  saunaSaveComponentErrorText,
  saunaUniqueComponentKey,
  SAUNA_COMPONENT_KEY_FALLBACK,
  SAUNA_COMPONENT_KEY_MAX,
  SAUNA_COMPONENT_NAME_MAX,
  type SaunaComponentNameCheck,
} from "./save-as-component-copy";
export { saunaSaveNodeAsComponent, type SaunaSaveAsComponentResult } from "./save-as-component";
export {
  createPagesComponentsApi,
  isPagesComponentsError,
  PagesComponentsError,
  type PagesComponentRecord,
  type PagesComponentsApi,
  type PagesComponentsApiOptions,
} from "./pages-components-api";
export {
  createStudioStore,
  propsPatchOp,
  resetOverrideOp,
  type ApplyOpResult,
  type CreateStudioStoreOptions,
  type StudioState,
  type StudioStore,
} from "./store";
export {
  STUDIO_SCREENS,
  canvasDeviceFor,
  deviceToScreen,
  editTargetForScreen,
  isScreenOverridden,
  nodePropsForScreen,
  screenOverriddenKeys,
  screenOverrideProps,
  screenToDevice,
  studioScreenLabel,
  memberOverrideProps,
  withMemberPropsPatch,
  withoutMemberProp,
  withoutOverrideProp,
  withOverridePatch,
  withOverrideProps,
  withoutScreenProp,
  withScreenProps,
  withScreenPropsPatch,
  type StudioEditTarget,
  type StudioOverrideBranch,
  type StudioScreen,
} from "./screen-variants";
export {
  STUDIO_VISIBILITY_MODES,
  hasLegacyVisibilityRule,
  inheritedVisibilityMode,
  isTargetOverridden,
  memberBranchCount,
  withMembersPruned,
  nodePropsForTarget,
  privateRevealCount,
  studioCanvasAudience,
  studioEditTarget,
  studioFieldProps,
  studioNodeMode,
  targetOverrideProps,
  visibilityModeRefusal,
  withVisibilityMode,
  type StudioAudience,
} from "./visibility-modes";
export {
  SaunaVisibilityModeEditor,
  setNodeVisibilityMode,
  type SaunaVisibilityModeEditorProps,
} from "./visibility-mode-editor";
export {
  SAUNA_VARIANTS_SECTION_ID,
  SAUNA_VISIBILITY_SECTION_ID,
  saunaBlockSections,
} from "./block-sections";
export { useStudioHotkeys, type StudioHotkeyOptions } from "./hotkeys";
export {
  canParentType,
  computeOutlineDrop,
  parentGuardFromBlocks,
  parentRuleVerdict,
  typeAcceptsChildren,
  type ComputeOutlineDropArgs,
  type OutlineDropTarget,
  type ParentRuleVerdict,
} from "./outline-drop";
export { useStudioIsMobile } from "./use-mobile";
export { SaunaParamsSection, type SaunaParamsSectionProps } from "./params-section";
export {
  addParam,
  checkParamName,
  paramFor,
  paramNameErrorText,
  removeParam,
  suggestParamName,
  updateParam,
  type SaunaParamAddResult,
  type SaunaParamNameError,
} from "./properties/params";
export type { SchemaOp, Selection } from "./types";
export {
  pickDescriptorEditor,
  SaunaPropertiesAutoForm,
  type SaunaPropertiesAutoFormProps,
  type PropEditor,
  type PropEditorContext,
  registerPropEditor,
  unregisterPropEditor,
  getPropEditor,
  listPropEditors,
  TextEditor,
  NumberEditor,
  BooleanEditor,
  EnumEditor,
  SegmentedEditor,
  LinkEditor,
  isUnambiguousHref,
  ReadonlyJsonEditor,
  PROP_GROUPS,
  PROP_GROUP_LABELS,
  PROP_EDITOR_KINDS,
  contentDescriptorsForType,
  descriptorsForType,
  groupDescriptors,
  isPrimitiveValue,
  isPropsManifest,
  withUnknownProps,
  blocksFromCatalog,
  mergeBlockCatalogs,
  resolvePropsForm,
  staticPropsFromDescriptors,
  type PropDescriptor,
  type PropsFormSpec,
  type PropDescriptorGroup,
  type PropGroup,
  type SaunaPropsManifest,
  addFilterClause,
  addPreset,
  bindCollection,
  withCollectionKey,
  clauseText,
  coerceClauseValue,
  draftToProps,
  makeClause,
  makeDefaultPreset,
  opsForType,
  parseSortValue,
  presetIdFor,
  isIsoDate,
  transliterate,
  readDataViewDraft,
  removeFilterClause,
  removePreset,
  sortOptions,
  sortValue,
  toggleField,
  DataViewSettings,
  type DataViewSettingsProps,
  CompoundItemsEditor,
  readCompoundItems,
  TableRowsEditor,
  type CompoundItem,
  type CompoundItemsEditorProps,
  addTableColumn,
  addTableRow,
  moveTableColumn,
  moveTableRow,
  readTableGrid,
  removeTableColumn,
  removeTableRow,
  setTableCell,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  tableWidth,
  type TableGrid,
  type DataViewDraft,
  type StudioCollection,
  type StudioCollectionField,
  type StudioDataSources,
} from "./properties";
export {
  applyRedo,
  applyUndo,
  canRedo,
  canUndo,
  createHistory,
  DEFAULT_HISTORY_DEPTH,
  pushHistory,
  type HistoryState,
} from "./history";
export {
  useStudioAutoSave,
  type AutoSaveStatus,
  type UseStudioAutoSaveOptions,
  type UseStudioAutoSaveResult,
} from "./auto-save";
export {
  SaunaEditableOverlay,
  type SaunaEditableOverlayProps,
  useEditableOverlay,
} from "./overlay";
export {
  SaunaVisibilityEditor,
  type SaunaVisibilityEditorProps,
} from "./visibility-editor";
export {
  SaunaVariantsEditor,
  newVariantId,
  type SaunaVariantsEditorProps,
} from "./variants-editor";
export {
  SaunaPreviewContextEditor,
  previewContextSummary,
  emptyPreviewContextView,
  viewToContext as previewContextViewToContext,
  type PreviewContextView,
  type PreviewContextSchema,
  type PreviewContextField,
  type SaunaPreviewContextEditorProps,
} from "./preview-context-editor";
export {
  SaunaHistoryPanel,
  type SaunaHistoryPanelProps,
  type RevisionRow,
} from "./history-panel";
// Inspector control set (SDL-952, EP-189): style A rows and the grey/blue rule.
export {
  INSPECTOR_COLORS,
  INSPECTOR_ROW_LABEL_WIDTH,
  INSPECTOR_ROW_MIN_HEIGHT,
  INSPECTOR_STATE_ATTR,
  InspectorInfoHint,
  InspectorRow,
  InspectorScaleSelect,
  InspectorSection,
  InspectorSegmented,
  InspectorSelect,
  InspectorThemeColorRow,
  InspectorToggle,
  inspectorColor,
  inspectorFill,
  inspectorScaleBarWidth,
  inspectorScaleTextSize,
  inspectorValueState,
  type InspectorInfoHintProps,
  type InspectorRowProps,
  type InspectorScaleKind,
  type InspectorScaleSelectProps,
  type InspectorScaleStep,
  type InspectorSectionProps,
  type InspectorSegmentOption,
  type InspectorSegmentedProps,
  type InspectorSelectOption,
  type InspectorSelectProps,
  type InspectorThemeColor,
  type InspectorThemeColorRowProps,
  type InspectorThemeEntry,
  type InspectorToggleProps,
  type InspectorValueState,
} from "./properties";
// Image panel (SDL-956, EP-190).
export {
  IMAGE_PANEL_DEFAULTS,
  IMAGE_SHAPE_OPTIONS,
  ImageInspectorPanel,
  ImageShapeMark,
  focusFromClick,
  imageDefaultWidth,
  imageFileName,
  imageShapeChoices,
  type ImageInspectorPanelProps,
  type ImagePanelFile,
  type ImagePanelValue,
  type ImagePanelVisibility,
} from "./properties";
