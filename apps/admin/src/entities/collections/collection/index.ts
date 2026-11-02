export type { Collection } from "./model";
export {
  collectionsApi,
  type CollectionListParams,
  type CollectionCreatePayload,
  type CollectionUpdatePayload,
} from "./api";
export {
  collectionKeys,
  useCollections,
  useCollectionWorkspaceId,
  resolveCollectionWorkspace,
  type StickyCollectionWorkspace,
  type WorkspaceListProbe,
  useCollection,
  useCreateCollection,
  useUpdateCollection,
  useDeleteCollection,
} from "./hooks";
