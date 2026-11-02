// Collections module — UI for user-defined collections and their records.
//
// The UI half of collections-service (EP-13); the data half lives in
// `entities/collections` and `shared/lib/api/collections-client.ts`.
// Everything exported here stays presentation-only: the consuming page
// owns fetching, mutations and confirms.

export { CollectionsShell, type CollectionsShellProps } from "./shell";
export {
  CollectionsList,
  type CollectionsListProps,
} from "./collections-list";
export {
  RecordsTable,
  type RecordsTableProps,
  type RecordsTablePagination,
} from "./records-table";
export {
  RecordForm,
  type RecordFormProps,
  type RecordFormSubmit,
} from "./record-form";
export {
  SchemaEditor,
  type SchemaEditorProps,
  type SchemaEditorLabels,
  type SchemaEditorAddFieldPayload,
  type SchemaEditorRenameFieldPayload,
  type SchemaEditorRenameCollectionPayload,
} from "./schema-editor";
export {
  CollectionCreateForm,
  type CollectionCreateFormProps,
  type CollectionCreateFormSubmit,
} from "./collection-create-form";
export {
  registerFieldType,
  getFieldTypeRenderers,
  listRegisteredFieldTypes,
  makeRichTextEnvelope,
  readRelationTargetKey,
  relationIdsFromValue,
  defaultRelationCell,
  defaultImageInput,
  defaultImageCell,
  type FieldTypeRenderers,
  type FieldFormInputProps,
  type FieldCellRenderProps,
} from "./field-type-registry";
export {
  BulkActionBar,
  type BulkActionBarProps,
} from "./bulk-action-bar";
export {
  CommandPalette,
  type CommandPaletteProps,
  type CommandPaletteCommand,
} from "./command-palette";
export {
  ApiTab,
  IssuedTokenBanner,
  DATA_PLANE_RATE_LIMITS,
  tokenStatus,
  buildSampleRecordData,
  buildSampleListResponse,
  buildCurlSnippet,
  buildFetchSnippet,
  type ApiTabProps,
  type ApiTabLabels,
} from "./api-tab";
export {
  AccessTab,
  publicAccess,
  indexGrants,
  AddMemberForm,
  describeMember,
  filterMemberCandidates,
  looksLikeEmail,
  grantableRoles,
  PUBLIC_ROLE_NAME,
  AUTHENTICATED_ROLE_NAME,
  type AccessTabProps,
  type InviteNoticeView,
  type AccessTabLabels,
} from "./access-tab";
export {
  isRichTextEnvelope,
  GRANT_ACTIONS,
  FIELD_SCOPED_ACTIONS,
} from "./types";
export type {
  Workspace,
  Collection,
  CollectionField,
  FieldType,
  CollectionRecord,
  RichTextEnvelope,
  AccessToken,
  IssuedToken,
  ProjectRole,
  ProjectMember,
  MemberUser,
  CollectionGrant,
  GrantAction,
} from "./types";
