// Sunday-Sauna Studio properties — Zod-driven auto-form + pluggable
// editors. Public surface re-exported from `sunday-sauna/studio`.

export {
  pickDescriptorEditor,
  SaunaPropertiesAutoForm,
  type SaunaPropertiesAutoFormProps,
} from "./auto-form";
export {
  registerPropEditor,
  unregisterPropEditor,
  getPropEditor,
  listPropEditors,
} from "./registry";
export type { PropEditor, PropEditorContext } from "./types";
export {
  PROP_GROUPS,
  PROP_GROUP_LABELS,
  PROP_EDITOR_KINDS,
  contentDescriptorsForType,
  descriptorsForType,
  groupDescriptors,
  isPropsManifest,
  isPrimitiveValue,
  withUnknownProps,
  type PropDescriptor,
  type PropDescriptorGroup,
  type PropEditorKind,
  type PropGroup,
  type PropValueType,
  type SaunaPropsManifest,
} from "./descriptors";
export {
  blocksFromCatalog,
  mergeBlockCatalogs,
  staticPropsFromDescriptors,
} from "./kit-blocks";
// Which form a node gets — public so a host can assert its catalog never
// sends an insertable type to the raw JSON field (SDL-632).
export { resolvePropsForm, type PropsFormSpec } from "./form-spec";
export {
  BooleanEditor,
  EnumEditor,
  isUnambiguousHref,
  LinkEditor,
  NumberEditor,
  ReadonlyJsonEditor,
  SegmentedEditor,
  TextEditor,
} from "./builtin-editors";
// DataView settings (SDL-642): the host hands in the collections, the model
// is the serialization the panel writes (pinned by the package tests).
export {
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
  type DataViewDraft,
  type StudioCollection,
  type StudioCollectionField,
  type StudioDataSources,
} from "./data-view-model";
export { DataViewSettings, type DataViewSettingsProps } from "./data-view-settings";
// Compound list editors (SDL-633): tabs / accordion items and the table grid.
export {
  CompoundItemsEditor,
  readCompoundItems,
  TableRowsEditor,
  type CompoundItem,
  type CompoundItemsEditorProps,
} from "./compound-editors";
export {
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
} from "./table-model";
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
} from "./inspector-controls";
// Image panel (SDL-956, EP-190), built from the control set above.
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
} from "./image-panel";
