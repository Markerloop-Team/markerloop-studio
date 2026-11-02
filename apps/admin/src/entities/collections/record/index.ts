export type { Record } from "./model";
export {
  collectionsRecordsApi,
  type RecordListParams,
  type RecordCreatePayload,
  type RecordUpdatePayload,
} from "./api";
export {
  recordKeys,
  useRecords,
  useRecord,
  useCreateRecord,
  useUpdateRecord,
  useDeleteRecord,
} from "./hooks";
