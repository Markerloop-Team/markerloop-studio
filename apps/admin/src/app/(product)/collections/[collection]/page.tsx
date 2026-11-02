"use client";

// /collections/[collection] — per-collection workplace
// (SDL-217 / EP-31). All four tabs are live: Data (records), Schema
// (fields), API (public data plane + workspace tokens, SDL-218) and
// Access (workspace roles + the grant matrix of this collection,
// SDL-309).
//
// Deep links: the route segment pins the collection; ?tab= picks the
// tab; ?record=<id> opens the record panel (?record=new — creation).
// ?ws= is carried for the switcher, but the workspace the collection
// actually lives in is the source of truth — the scope hook pins it
// once it resolves (SDL-621: no project level in the UI).

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { useLocale } from "next-intl";
import { useTranslations } from "@/shared/hooks";
import { useAuthStore } from "@/shared/store/auth-store";
import {
  apiErrorCode,
  conflictCurrentRecord,
  isGatewayRouteMissing,
  WORKSPACE_UNRESOLVED,
} from "@/shared/lib/api/collections-client";
import { ApiError } from "@/shared/lib/errors";
import {
  useCollection,
  useCollections,
  useCollectionWorkspaceId,
  useDeleteCollection,
  useUpdateCollection,
  type Collection,
} from "@/entities/collections/collection";
import {
  useCollectionFields,
  useCreateCollectionField,
  useDeleteCollectionField,
  useUpdateCollectionField,
} from "@/entities/collections/collection-field";
import {
  CurrentWorkspaceProvider,
  useWorkspaces,
} from "@/entities/collections/workspace";
import {
  useCreateToken,
  useProjectTokens,
  useRevokeToken,
  useRotateToken,
} from "@/entities/collections/token";
import {
  useCreateProjectRole,
  useDeleteProjectRole,
  useProjectRoles,
  useUpdateProjectRole,
} from "@/entities/collections/project-role";
import {
  useCollectionGrants,
  useCreateGrant,
  useDeleteGrant,
  useUpdateGrant,
} from "@/entities/collections/grant";
import {
  inviteErrorKey,
  inviteNoticeOf,
  useCreateInvite,
  useProjectMembers,
  usePutMember,
  useRemoveMember,
  useWorkspaceMembers,
} from "@/entities/collections/member";
import {
  useCreateRecord,
  useDeleteRecord,
  useRecord,
  useRecords,
  useUpdateRecord,
} from "@/entities/collections/record";
import {
  DeleteConfirmDialog,
  useCollectionsScope,
} from "@/features/collections-switchers";
import { PolicyLine } from "@/entities/policy/ui/policy-line";
import { DeleteDialog } from "@/shared/components/delete-dialog";
import { ItemPanel, ItemPanelMessage } from "@/shared/components/item-panel";
// Side-effect import: registers the relation record picker over the
// registry default before the first RecordForm render (SDL-170).
import "@/features/collections-relations";
// Side-effect import: registers the image field picker over the workspace
// files library (SDL-360, SDL-625).
import "@/features/collections-assets";
import {
  AccessTab,
  ApiTab,
  BulkActionBar,
  CollectionsList,
  CollectionsShell,
  CommandPalette,
  RecordForm,
  RecordsTable,
  SchemaEditor,
  FIELD_SCOPED_ACTIONS,
  type CollectionGrant,
  type CommandPaletteCommand,
  type GrantAction,
  type InviteNoticeView,
  type MemberUser,
  type ProjectRole,
  type RecordFormSubmit,
  type RecordsTablePagination,
} from "@/widgets/collections";
import {
  Box,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@markerloop/ui/ui";
import {
  SectionHeader,
  SECTION_TABS_LIST_CLASS,
  SECTION_TABS_SCROLL_CLASS,
  SECTION_TABS_TRIGGER_CLASS,
  SHELL_WORKPLACE_HEIGHT_CLASS as WORKPLACE_HEIGHT,
} from "@/shared/components/section-header";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const COLLECTIONS_PAGE_LIMIT = 100;
const TAB_PARAM = "tab";
const RECORD_PARAM = "record";

const LIVE_TABS = ["data", "schema", "api", "access"] as const;
type LiveTab = (typeof LIVE_TABS)[number];

/** A destructive question of this screen (EP-186, pattern 4). */
interface ConfirmQuestion {
  title: string;
  /** What the action does, in the screen's words. */
  consequence: string;
  /** Add the rule's own sentence (records are items of the deletion rule). */
  policy?: boolean;
  confirmLabel?: string;
  pendingLabel?: string;
}

interface ConfirmSpec extends ConfirmQuestion {
  run: () => Promise<void>;
  cancel: () => void;
}

export default function CollectionWorkplacePage() {
  const params = useParams<{ collection: string }>();
  const collectionId = params.collection;
  // Key the workplace by collection id: App Router keeps the page
  // component mounted across sibling navigation, and stale table
  // state (pagination, sort, selection) must not leak between
  // collections.
  return <CollectionWorkplace key={collectionId} collectionId={collectionId} />;
}

function CollectionWorkplace({ collectionId }: { collectionId: string }) {
  const t = useTranslations("collections");
  const tw = useTranslations("workspaceSettings");
  const tc = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  // --- Scope: the workspace this collection lives in ----------------
  const collectionQuery = useCollection(collectionId);
  const collection = collectionQuery.data ?? null;
  const workspacesList = useWorkspaces();
  const workspaceIds = useMemo(
    () => (workspacesList.data ?? []).map((w) => w.id),
    [workspacesList.data]
  );
  const collectionScope = useCollectionWorkspaceId(
    collection?.id,
    workspaceIds,
    searchParams.get("ws"),
    COLLECTIONS_PAGE_LIMIT
  );
  const collectionWorkspaceId = collectionScope.workspaceId;
  const workspaceResolving =
    collectionScope.isResolving || workspacesList.isPending;
  // The API and Access tabs render as soon as the collection loads, and
  // their role/token queries are disabled until the workspace is known —
  // a disabled query reports "not loading", so without this the tabs sat
  // idle-and-empty with live Create buttons during the scan, and a write
  // there went to `/v1/workspaces/null/...` (SDL-621). Pending shows the
  // tabs' loading state; unresolved is the terminal "not in any listing".
  const workspacePending = !collectionWorkspaceId && workspaceResolving;
  const workspaceUnresolved = !collectionWorkspaceId && !workspaceResolving;

  const { workspaces, selectedWorkspace } = useCollectionsScope({
    pin: { workspaceId: collectionWorkspaceId },
  });

  // Switching scope from the workplace leaves the collection behind —
  // land on the overview of the newly selected scope.
  const gotoOverview = (next: { ws?: string | null }) => {
    const sp = new URLSearchParams();
    const ws = next.ws === undefined ? selectedWorkspace?.id : next.ws;
    if (ws) sp.set("ws", ws);
    const qs = sp.toString();
    router.push(`/collections${qs ? `?${qs}` : ""}`);
  };

  // --- Tabs ---------------------------------------------------------
  const tabFromUrl = searchParams.get(TAB_PARAM);
  const activeTab: LiveTab = (LIVE_TABS as readonly string[]).includes(
    tabFromUrl ?? ""
  )
    ? (tabFromUrl as LiveTab)
    : "data";
  const setTab = (tab: LiveTab) => {
    // Live params (not the searchParams snapshot): the scope hook's
    // reconciler replace can land between render and this click, and a
    // snapshot-built URL would silently revert it (SDL-229 №2).
    const sp = new URLSearchParams(window.location.search);
    if (tab === "data") sp.delete(TAB_PARAM);
    else sp.set(TAB_PARAM, tab);
    sp.delete(RECORD_PARAM);
    const qs = sp.toString();
    router.replace(
      `/collections/${collectionId}${qs ? `?${qs}` : ""}`,
      { scroll: false }
    );
  };

  // --- Sibling collections (sidebar + palette) ---------------------
  const collectionsQuery = useCollections(
    collectionWorkspaceId
      ? { workspace_id: collectionWorkspaceId, limit: COLLECTIONS_PAGE_LIMIT }
      : null
  );
  const collections = useMemo<readonly Collection[]>(
    () => collectionsQuery.data?.data ?? [],
    [collectionsQuery.data]
  );

  const gotoCollection = (c: Collection) => {
    if (c.id === collectionId) return;
    const sp = new URLSearchParams();
    if (selectedWorkspace) sp.set("ws", selectedWorkspace.id);
    router.push(`/collections/${c.id}?${sp.toString()}`);
  };

  // Files are not a tab of collections any more (SDL-625): the button
  // opens the workspace files section — the same library the image field
  // picker and the pages editor show — for the collection's workspace.
  // Until that workspace is known there is nowhere to go: a bare /files
  // would fall back to the switcher's (or the first) workspace and show
  // another library, so the button is disabled and the command absent.
  const openFiles = () => {
    if (!collectionWorkspaceId) return;
    router.push(`/files?ws=${encodeURIComponent(collectionWorkspaceId)}`);
  };

  // --- Records state -----------------------------------------------
  const [pagination, setPagination] = useState<RecordsTablePagination>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [formError, setFormError] = useState<string | null>(null);
  // Record and collection deletes confirm in a dialog that carries the
  // rule's sentence and its link (SDL-666) — window.confirm could not.
  const [confirmDelete, setConfirmDelete] = useState<"record" | "collection" | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(
    new Set()
  );
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");

  const fieldsQuery = useCollectionFields(collectionId);
  const recordsQuery = useRecords({
    collection_id: collectionId,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    sort_by: sortBy ?? undefined,
    sort_order: sortBy ? sortOrder : undefined,
    search: search.trim() ? search.trim() : undefined,
  });

  const fields = fieldsQuery.data ?? [];
  const records = recordsQuery.data?.data ?? [];
  const recordsMeta = recordsQuery.data?.meta ?? null;
  const hasMoreRecords = recordsMeta
    ? recordsMeta.page < recordsMeta.total_pages
    : false;

  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord();
  const deleteRecord = useDeleteRecord();
  const updateCollection = useUpdateCollection();
  const deleteCollection = useDeleteCollection();
  const createField = useCreateCollectionField();
  const updateField = useUpdateCollectionField();
  const deleteField = useDeleteCollectionField();

  // --- API tab: workspace access tokens (SDL-218) ------------------
  // Fetched only while the tab is open: a credential inventory is not
  // something to pull on every visit to the Data tab.
  const workspaceId = collectionWorkspaceId;
  const tokensQuery = useProjectTokens(activeTab === "api" ? workspaceId : null);
  const createToken = useCreateToken(workspaceId);
  const rotateToken = useRotateToken(workspaceId);
  const revokeToken = useRevokeToken(workspaceId);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // --- Access tab: workspace roles + grants of this collection -----
  // Roles are shared with the API tab (the issue form binds a token to
  // a consumer role), so they load for either tab; grants are specific
  // to this one.
  const rolesQuery = useProjectRoles(
    activeTab === "api" || activeTab === "access" ? workspaceId : null
  );
  const grantsQuery = useCollectionGrants(
    activeTab === "access" ? collectionId : null
  );
  const createRole = useCreateProjectRole(workspaceId);
  const updateRole = useUpdateProjectRole(workspaceId);
  const deleteRole = useDeleteProjectRole(workspaceId);
  const createGrant = useCreateGrant(collectionId);
  const updateGrant = useUpdateGrant(collectionId);
  const deleteGrant = useDeleteGrant(collectionId);
  const [accessError, setAccessError] = useState<string | null>(null);

  // --- Access tab: members (SDL-320) --------------------------------
  //
  // Membership is read and written by workspace, one request each
  // (SDL-617); no project id is involved. It loads with the tab and not
  // with the collection.
  //
  // Names come with the members themselves (`?include=profiles`,
  // SDL-727), and the picker offers the workspace's own members from the
  // same answer. Nothing here reads the global user directory
  // (user-service list): it needs `users:read:all`, which an ordinary workspace
  // owner does not hold — the gateway answers 403 and the card used to
  // show bare ids with an empty picker.
  const accessOpen = activeTab === "access";
  const membersQuery = useProjectMembers(accessOpen ? workspaceId : null);
  const members = useMemo(
    () => membersQuery.data ?? [],
    [membersQuery.data]
  );
  const workspacePeopleQuery = useWorkspaceMembers(
    accessOpen ? workspaceId : null,
    "profiles"
  );
  const memberCandidates = useMemo<MemberUser[]>(
    () =>
      (workspacePeopleQuery.data ?? [])
        // The owner's role is immutable (409 `workspace_owner_immutable`).
        .filter((m) => m.role !== "owner")
        .map((m) => ({
          id: m.user_id,
          username: m.username ?? m.user_id,
          email: m.email ?? m.invited_email ?? null,
        })),
    [workspacePeopleQuery.data]
  );
  const createInvite = useCreateInvite(workspaceId);
  const locale = useLocale();
  const inviteLocale =
    locale === "ru" || locale === "kk" || locale === "en" ? locale : "en";
  const putMember = usePutMember(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const currentUserId = useAuthStore((s) => s.userId);

  // --- Record panel is URL-driven (?record=new | ?record=<id>) -----
  const recordParam = searchParams.get(RECORD_PARAM);
  const recordFromList =
    recordParam && recordParam !== "new"
      ? (records.find((r) => r.id === recordParam) ?? null)
      : null;
  // Deep link to a record outside the current page: fetch the detail.
  const recordDetailQuery = useRecord(
    recordParam && recordParam !== "new" && !recordFromList
      ? recordParam
      : undefined
  );
  // A deep-linked ?record is honoured only when the record belongs to
  // THIS collection: without the check, /collections/<A>?record=<B>
  // renders B in a form built from A's fields and Save PATCHes B with
  // A-shaped payload (SDL-229 №3). Mismatch falls through to the
  // existing not-found branch of the panel.
  const detailRecord =
    recordDetailQuery.data &&
    recordDetailQuery.data.collection_id === collectionId
      ? recordDetailQuery.data
      : null;
  const editorRecord = recordFromList ?? detailRecord;
  const panelOpen = recordParam !== null;

  // ONE router.replace per user action. Two back-to-back replace calls
  // (setTab + set record) both build from the same stale searchParams
  // snapshot, so whichever lands last silently drops the other's
  // change — caught by the e2e run of MR !88: ?tab=schema survived the
  // "+ add record" click and the panel never opened. Opening a record
  // therefore clears the tab param itself (the panel belongs to the
  // Data tab), in a single replace.
  const setRecordParam = (value: string | null) => {
    // Live params for the same reason as setTab: never build a URL from
    // a render-time snapshot when another writer may have replaced in
    // between (SDL-229 №2).
    const sp = new URLSearchParams(window.location.search);
    if (value === null) {
      sp.delete(RECORD_PARAM);
    } else {
      sp.set(RECORD_PARAM, value);
      sp.delete(TAB_PARAM);
    }
    const qs = sp.toString();
    router.replace(
      `/collections/${collectionId}${qs ? `?${qs}` : ""}`,
      { scroll: false }
    );
  };

  const closePanel = () => {
    setRecordParam(null);
    setFormError(null);
  };

  // ⌘K / Ctrl+K belongs to the shell's one search palette (EP-157); this
  // screen's own palette (record commands) opens from its «Commands» button.

  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  // EP-186 (pattern 4): every destructive question of this screen is the
  // admin's one delete dialog — no window.confirm. `ask` opens it and
  // resolves with the action's result once it succeeded, or null when the
  // person cancelled; a failure stays in the dialog, in words.
  const [confirmSpec, setConfirmSpec] = useState<ConfirmSpec | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const ask = <T,>(
    question: ConfirmQuestion,
    action: () => Promise<T>,
    describe: (e: unknown) => string = errMsg
  ): Promise<T | null> =>
    new Promise((resolve) => {
      setConfirmError(null);
      setConfirmSpec({
        ...question,
        run: async () => {
          setConfirmError(null);
          setConfirmBusy(true);
          try {
            const value = await action();
            setConfirmSpec(null);
            resolve(value);
          } catch (e) {
            setConfirmError(describe(e));
          } finally {
            setConfirmBusy(false);
          }
        },
        cancel: () => {
          setConfirmSpec(null);
          resolve(null);
        },
      });
    });

  // 409 record_version_conflict → readable divergence report; the
  // envelope's data carries the CURRENT server record.
  const conflictError = (
    e: unknown,
    submitted: Record<string, unknown>
  ): string | null => {
    if (!(e instanceof ApiError) || e.status !== 409) return null;
    if (apiErrorCode(e) !== "record_version_conflict") return null;
    const current = conflictCurrentRecord(e);
    let msg = t("versionConflict") as string;
    if (current) {
      const diverging = fields
        .filter(
          (f) =>
            JSON.stringify(current.data?.[f.key] ?? null) !==
            JSON.stringify(submitted[f.key] ?? null)
        )
        .map((f) => f.name);
      if (diverging.length > 0) {
        msg += `\n${t("versionConflictFields") as string}${diverging.join(", ")}`;
      }
    }
    return msg;
  };

  const handleRecordSubmit = async (submit: RecordFormSubmit) => {
    setFormError(null);
    try {
      if (editorRecord && recordParam !== "new") {
        if (submit.version === undefined) {
          setFormError(t("missingVersion") as string);
          return;
        }
        await updateRecord.mutateAsync({
          id: editorRecord.id,
          payload: { data: submit.data, version: submit.version },
        });
      } else {
        await createRecord.mutateAsync({
          collection_id: collectionId,
          data: submit.data,
        });
      }
      closePanel();
    } catch (e) {
      setFormError(conflictError(e, submit.data) ?? errMsg(e));
    }
  };

  const handleRecordDelete = async () => {
    if (!editorRecord) return;
    setConfirmDelete("record");
  };

  const runRecordDelete = async () => {
    if (!editorRecord) return;
    setFormError(null);
    await deleteRecord.mutateAsync(editorRecord.id);
    closePanel();
  };

  const handleCollectionRename = async ({ name }: { name: string }) => {
    setFormError(null);
    try {
      await updateCollection.mutateAsync({
        id: collectionId,
        payload: { name },
      });
    } catch (e) {
      setFormError(errMsg(e));
    }
  };

  const handleCollectionDelete = async () => {
    setConfirmDelete("collection");
  };

  const runCollectionDelete = async () => {
    setFormError(null);
    await deleteCollection.mutateAsync(collectionId);
    gotoOverview({});
  };

  const handleAddField = async (payload: {
    key: string;
    name: string;
    type: string;
    config?: Record<string, unknown>;
  }) => {
    setFormError(null);
    try {
      await createField.mutateAsync({
        collectionId,
        payload: {
          key: payload.key,
          name: payload.name,
          type: payload.type,
          config: payload.config,
        },
      });
    } catch (e) {
      setFormError(errMsg(e));
    }
  };

  const handleRenameField = async ({
    fieldId,
    name,
  }: {
    fieldId: string;
    name: string;
  }) => {
    setFormError(null);
    try {
      await updateField.mutateAsync({
        collectionId,
        fieldId,
        payload: { name },
      });
    } catch (e) {
      setFormError(errMsg(e));
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    setFormError(null);
    const field = fields.find((f) => f.id === fieldId);
    await ask(
      {
        title: t("deleteFieldTitle", { name: field?.name ?? field?.key ?? "" }) as string,
        consequence: t("deleteFieldConfirm") as string,
      },
      () => deleteField.mutateAsync({ collectionId, fieldId })
    );
  };

  // Bulk delete fans out N sequential mutations — no batch endpoint.
  const handleBulkDelete = async () => {
    if (selectedRecordIds.size === 0) return;
    const ids = [...selectedRecordIds];
    await ask(
      {
        title: t("bulkDeleteTitle", { count: ids.length }) as string,
        consequence: t("bulkDeleteConfirm") as string,
        policy: true,
      },
      async () => {
        setBulkDeleting(true);
        const done = new Set<string>();
        try {
          for (const id of ids) {
            await deleteRecord.mutateAsync(id);
            done.add(id);
          }
          setSelectedRecordIds(new Set());
        } finally {
          // What went before a failure is gone: it leaves the selection, so
          // a retry asks only about the records still standing.
          if (done.size > 0 && done.size < ids.length) {
            setSelectedRecordIds(new Set(ids.filter((id) => !done.has(id))));
          }
          setBulkDeleting(false);
        }
      }
    );
  };

  // The token endpoints answer with a code in the envelope; the raw
  // message is a server-side sentence, so translate the codes we know
  // and fall back to the message for the ones we don't.
  const tokenErrorMessage = (e: unknown): string | null => {
    switch (apiErrorCode(e)) {
      case "token_role_not_consumer":
        return t("tokenErrorNotConsumer") as string;
      case "role_not_in_project":
        return t("tokenErrorRoleNotInProject") as string;
      case "token_grace_too_long":
        return t("tokenErrorGraceTooLong") as string;
      case "token_revoked":
        return t("tokenErrorRevoked") as string;
      case "scope_collection_not_in_project":
        return t("tokenErrorScopeCollection") as string;
      case "scope_action_invalid":
        return t("tokenErrorScopeAction") as string;
      case WORKSPACE_UNRESOLVED:
        return t("workspaceUnresolved") as string;
      default:
        return null;
    }
  };

  // Token handlers never reject: the widget drives them from onClick,
  // and a rejected promise there is an unhandled rejection. They report
  // through `tokenError` and answer `null` instead.
  //
  // The IssuedToken they return carries the plaintext secret. It is
  // handed straight to the widget's one-shot banner and nowhere else —
  // `.reset()` clears it out of the mutation state so it does not
  // survive in React Query's observer either.
  const handleCreateToken = async (payload: {
    name: string;
    role_id: string;
    expires_at: string | null;
  }) => {
    setTokenError(null);
    try {
      const issued = await createToken.mutateAsync(payload);
      createToken.reset();
      return issued;
    } catch (e) {
      setTokenError(tokenErrorMessage(e) ?? errMsg(e));
      return null;
    }
  };

  const tokenName = (tokenId: string) =>
    (tokensQuery.data ?? []).find((tok) => tok.id === tokenId)?.name ?? "";

  const handleRotateToken = async (tokenId: string) => {
    setTokenError(null);
    return ask(
      {
        title: t("rotateTokenTitle", { name: tokenName(tokenId) }) as string,
        consequence: t("rotateTokenConfirm") as string,
        confirmLabel: t("rotateTokenAction") as string,
        pendingLabel: t("rotatingToken") as string,
      },
      async () => {
        const issued = await rotateToken.mutateAsync({ tokenId });
        rotateToken.reset();
        return issued;
      },
      (e) => tokenErrorMessage(e) ?? errMsg(e)
    );
  };

  const handleRevokeToken = async (tokenId: string) => {
    setTokenError(null);
    await ask(
      {
        title: t("revokeTokenTitle", { name: tokenName(tokenId) }) as string,
        consequence: t("revokeTokenConfirm") as string,
        confirmLabel: t("revokeTokenAction") as string,
        pendingLabel: t("revokingToken") as string,
      },
      () => revokeToken.mutateAsync(tokenId),
      (e) => tokenErrorMessage(e) ?? errMsg(e)
    );
  };

  // --- Access tab handlers (SDL-309) -------------------------------
  //
  // Same shape as the token handlers above and for the same reason:
  // the widget drives them from onClick, so they never reject — they
  // report through `accessError` instead.
  const accessErrorMessage = (e: unknown): string | null => {
    switch (apiErrorCode(e)) {
      case "role_name_taken":
        return t("access.errorNameTaken") as string;
      case "role_builtin_immutable":
        return t("access.errorBuiltin") as string;
      case "role_in_use":
        return t("access.errorRoleInUse") as string;
      case "role_kind_invalid":
        return t("access.errorKindInvalid") as string;
      case "role_not_in_project":
      case "role_not_in_workspace":
        return t("access.errorRoleNotInProject") as string;
      case "workspace_owner_immutable":
        return t("access.errorOwnerImmutable") as string;
      case "workspace_owner_role_not_grantable":
        return t("access.errorOwnerRoleNotGrantable") as string;
      case "workspace_has_many_projects":
        return t("access.errorManyStorages") as string;
      case "role_id_invalid":
        return t("access.errorRoleIdInvalid") as string;
      case "grant_exists":
        return t("access.errorGrantExists") as string;
      case "grant_action_invalid":
        return t("access.errorGrantAction") as string;
      case WORKSPACE_UNRESOLVED:
        return t("workspaceUnresolved") as string;
      default:
        return null;
    }
  };

  const runAccess = async (fn: () => Promise<unknown>) => {
    setAccessError(null);
    try {
      await fn();
    } catch (e) {
      setAccessError(accessErrorMessage(e) ?? errMsg(e));
    }
  };

  const handleCreateRole = (payload: {
    name: string;
    kind: "admin" | "consumer";
  }) => runAccess(() => createRole.mutateAsync(payload));

  const handleRenameRole = (payload: { roleId: string; name: string }) =>
    runAccess(() =>
      updateRole.mutateAsync({
        roleId: payload.roleId,
        payload: { name: payload.name },
      })
    );

  const handleDeleteRole = async (roleId: string) => {
    setAccessError(null);
    const role = (rolesQuery.data ?? []).find((r) => r.id === roleId);
    await ask(
      {
        title: t("access.deleteRoleTitle", { name: role?.name ?? "" }) as string,
        consequence: t("access.deleteRoleConfirm") as string,
      },
      () => deleteRole.mutateAsync(roleId),
      (e) => accessErrorMessage(e) ?? errMsg(e)
    );
  };

  /**
   * Flip one matrix cell.
   *
   * The asymmetry here is deliberate. Revoking is just a DELETE, but
   * ISSUING a field-scoped grant seeds the allow-list with every field
   * the schema has today, because the alternative is worse: the server
   * defaults `fields` to `[]` and `[]` means *no* fields (EP-13 §16),
   * so a read grant created "empty" answers 200 with `data: {}` on
   * every record. That reads as a broken collection, not as a
   * permissions decision, and it is exactly the state a one-click
   * "make it public" would otherwise land in. Narrowing the list is a
   * second, deliberate step in the allow-list card.
   *
   * `delete`, `publish` and `schema` are not field-scoped — their
   * allow-list is stored and never consulted — so they get none.
   */
  const handleToggleGrant = async ({
    role,
    action,
    grant,
  }: {
    role: ProjectRole;
    action: GrantAction;
    grant: CollectionGrant | null;
  }) => {
    if (grant) {
      await runAccess(() => deleteGrant.mutateAsync(grant.id));
      return;
    }
    await runAccess(() =>
      createGrant.mutateAsync({
        role_id: role.id,
        action,
        fields: FIELD_SCOPED_ACTIONS.includes(action)
          ? fields.map((f) => f.key)
          : [],
      })
    );
  };

  /**
   * Add a member, or move one to another role — the same call, because
   * the server has one endpoint for both (PUT upsert on the composite
   * key). The row's role picker and the add form therefore hand this
   * identical payloads, and nothing here needs to know which of the two
   * the user thought they were doing.
   */
  // Same sentences as Settings → Members (SDL-727): the server's codes go
  // through `inviteErrorKey`, and "sent" is said only when the mail was
  // accepted for delivery — otherwise the one-time link is what is offered.
  const handleInviteMember = async (email: string): Promise<InviteNoticeView> => {
    let created;
    try {
      created = await createInvite.mutateAsync({ email, locale: inviteLocale });
    } catch (error) {
      throw new Error(tw(inviteErrorKey(error)) as string);
    }
    const notice = inviteNoticeOf(created);
    const sent = notice.kind === "sent";
    return {
      kind: notice.kind,
      acceptUrl: notice.acceptUrl,
      title: tw(sent ? "invite.sentTitle" : "invite.mailfailTitle", {
        email: notice.email,
      }) as string,
      body: tw(sent ? "invite.sentBody" : "invite.mailfailBody") as string,
    };
  };

  const handlePutMember = ({
    userId,
    roleId,
  }: {
    userId: string;
    roleId: string;
  }) =>
    runAccess(() =>
      putMember.mutateAsync({ user_id: userId, role_id: roleId })
    );

  /**
   * Removing a member does NOT take all their access away — on the
   * public data plane they lose their role's grants but keep those of
   * the built-in `authenticated` role, which every signed-in user reads
   * with. The confirm says so, because the word "удалить" promises the
   * opposite.
   */
  const handleRemoveMember = async (userId: string) => {
    setAccessError(null);
    await ask(
      {
        title: t("access.removeMemberTitle") as string,
        consequence: t("access.removeMemberConfirm") as string,
        confirmLabel: t("access.removeMemberAction") as string,
        pendingLabel: t("access.removingMember") as string,
      },
      () => removeMember.mutateAsync(userId),
      (e) => accessErrorMessage(e) ?? errMsg(e)
    );
  };

  const handleSetGrantFields = ({
    grantId,
    fields: next,
  }: {
    grantId: string;
    fields: string[];
  }) =>
    runAccess(() =>
      updateGrant.mutateAsync({ grantId, payload: { fields: next } })
    );

  const commands = useMemo<readonly CommandPaletteCommand[]>(() => {
    const out: CommandPaletteCommand[] = [
      {
        id: "create-record",
        title: t("addRecord") as string,
        hint: collection?.name,
        group: t("commandGroupActions") as string,
        run: () => {
          setRecordParam("new");
          setFormError(null);
        },
      },
      {
        id: "edit-schema",
        title: t("schemaButton") as string,
        hint: collection?.name,
        group: t("commandGroupActions") as string,
        run: () => setTab("schema"),
      },
    ];
    if (collectionWorkspaceId) {
      out.push({
        id: "open-files",
        title: t("filesButton") as string,
        hint: t("filesHint") as string,
        group: t("commandGroupActions") as string,
        run: openFiles,
      });
    }
    for (const c of collections) {
      if (c.id === collectionId) continue;
      out.push({
        id: `goto-${c.id}`,
        title: c.name,
        hint: c.key,
        group: t("commandGroupCollections") as string,
        run: () => gotoCollection(c),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collections, collection, collectionId, collectionWorkspaceId, t]);

  const tableError =
    fieldsQuery.error instanceof Error
      ? fieldsQuery.error.message
      : recordsQuery.error instanceof Error
        ? recordsQuery.error.message
        : null;

  // The same list feeds three surfaces since SDL-452 — desktop column,
  // tablet rail and the drawer — so its props are built once and the
  // rail only overrides `variant`. Two hand-copied prop blocks would
  // drift the moment one of them gains a label.
  const collectionsListProps = {
    collections,
    selectedId: collectionId,
    onSelect: gotoCollection,
    onAddClick: () => gotoOverview({}),
    isLoading: collectionsQuery.isLoading,
    error:
      collectionsQuery.error instanceof Error
        ? collectionsQuery.error.message
        : null,
    labels: {
      heading: t("collectionsHeading") as string,
      loading: t("loading") as string,
      empty: t("emptyCollections") as string,
      error: t("error") as string,
      builtinBadge: t("builtinBadge") as string,
      addCollection: t("addCollection") as string,
    },
  };

  // --- Not found / loading shells ----------------------------------
  if (collectionQuery.isLoading) {
    return <CenteredText>{t("loading") as string}</CenteredText>;
  }
  if (collectionQuery.error instanceof Error || !collection) {
    return (
      <CenteredText title={t("notFoundTitle") as string}>
        <Text variant="muted" size="sm">
          {collectionQuery.error instanceof Error
            ? collectionQuery.error.message
            : (t("notFoundHint") as string)}
        </Text>
        <Button type="button" variant="outline" onClick={() => gotoOverview({})}>
          {t("backToList") as string}
        </Button>
      </CenteredText>
    );
  }

  return (
    // The pickers inside RecordForm are scoped by the collection's
    // workspace: the relation picker and the image picker (files scope,
    // SDL-625) both read it from here. It comes from the collection itself,
    // never from the switcher (SDL-617, SDL-621).
    <CurrentWorkspaceProvider
      workspaceId={collectionWorkspaceId}
      isResolving={workspaceResolving}
    >
      {/*
        A full-height workplace inside the shell's content column (EP-157):
        the viewport minus the top bar (56px phone / 44px desktop) and the
        content padding.
      */}
      <Box className={WORKPLACE_HEIGHT}>
        <Box grow className="min-h-0">
          <CollectionsShell
            sidebar={<CollectionsList {...collectionsListProps} />}
            rail={<CollectionsList {...collectionsListProps} variant="rail" />}
            labels={{ openList: t("collectionsHeading") as string }}
            main={
              <Box gap={3} fullHeight className="relative min-h-0 pt-4 md:pl-6 md:pt-0">
                <SectionHeader
                  crumbs={[
                    {
                      label: t("collectionsHeading") as string,
                      href: collectionWorkspaceId
                        ? `/collections?ws=${encodeURIComponent(collectionWorkspaceId)}`
                        : "/collections",
                    },
                    { label: collection.name },
                  ]}
                  title={collection.name}
                  description={
                    <>
                      {t("keyLabel") as string}: {collection.key}
                      {collection.is_builtin ? ` · ${t("builtinBadge") as string}` : ""}
                    </>
                  }
                  actions={
                    <Box direction="row" gap={2}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setPaletteOpen(true)}
                        data-testid="collection-commands"
                      >
                        {t("commandPaletteButton") as string}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={openFiles}
                        disabled={!collectionWorkspaceId}
                        data-collections-files-open=""
                      >
                        {t("filesButton") as string}
                      </Button>
                      <Button
                        type="button"
                        onClick={() => {
                          setRecordParam("new");
                          setFormError(null);
                        }}
                      >
                        {t("addRecord") as string}
                      </Button>
                    </Box>
                  }
                />

                <Tabs
                  value={activeTab}
                  onValueChange={(v) => {
                    if ((LIVE_TABS as readonly string[]).includes(v))
                      setTab(v as LiveTab);
                  }}
                  className="flex min-h-0 flex-1 flex-col gap-3"
                >
                  {/* The canvas's line tabs (EP-157, section-header.tsx). */}
                  <div className={SECTION_TABS_SCROLL_CLASS}>
                    <TabsList variant="line" className={SECTION_TABS_LIST_CLASS}>
                      {LIVE_TABS.map((key) => (
                        <TabsTrigger key={key} value={key} className={SECTION_TABS_TRIGGER_CLASS}>
                          {t(`tabs.${key}`) as string}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <TabsContent
                    value="data"
                    className="flex min-h-0 flex-1 flex-col gap-3"
                  >
                    <Box
                      variant="panel"
                      className="flex min-h-0 flex-1 flex-col overflow-hidden"
                    >
                      <RecordsTable
                        fields={fields}
                        records={records}
                        pagination={pagination}
                        onPaginationChange={setPagination}
                        isLoading={
                          fieldsQuery.isLoading || recordsQuery.isLoading
                        }
                        error={tableError}
                        hasMore={hasMoreRecords}
                        onRowClick={(r) => {
                          setRecordParam(r.id);
                          setFormError(null);
                        }}
                        onCreateRecord={() => {
                          setRecordParam("new");
                          setFormError(null);
                        }}
                        selectedIds={selectedRecordIds}
                        onSelectionChange={setSelectedRecordIds}
                        enableQuickFilter
                        search={search}
                        onSearchChange={(next) => {
                          setSearch(next);
                          setPagination({
                            pageIndex: 0,
                            pageSize: pagination.pageSize,
                          });
                        }}
                        // The single GET does not compute records_count
                        // (SDL-238); the listing does. Unknown → no count.
                        total={
                          collections.find((c) => c.id === collectionId)
                            ?.records_count
                        }
                        formatCount={(shown, total) =>
                          tc("listCount", { shown, total }) as string
                        }
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSortChange={({ sort_by, sort_order }) => {
                          setSortBy(sort_by);
                          setSortOrder(sort_order);
                          setPagination({
                            pageIndex: 0,
                            pageSize: pagination.pageSize,
                          });
                        }}
                        labels={{
                          idColumn: t("idColumn") as string,
                          createdAtColumn: t("createdAtColumn") as string,
                          updatedAtColumn: t("updatedAtColumn") as string,
                          loading: t("loading") as string,
                          empty: t("emptyRecords") as string,
                          emptyHint: t("emptyRecordsHint") as string,
                          emptySearch: t("emptyRecordsSearch") as string,
                          emptySearchHint: t("emptyRecordsSearchHint") as string,
                          clearSearch: t("clearSearch") as string,
                          createFirstRecord: t("createFirstRecord") as string,
                          error: t("error") as string,
                          noFields: t("noFields") as string,
                          prev: t("prev") as string,
                          next: t("next") as string,
                          page: t("page") as string,
                          selectAll: t("selectAll") as string,
                          selectRow: t("selectRow") as string,
                          quickFilterPlaceholder: t(
                            "quickFilterPlaceholder"
                          ) as string,
                          searchPlaceholder: t("searchPlaceholder") as string,
                        }}
                      />
                    </Box>
                    <BulkActionBar
                      count={selectedRecordIds.size}
                      onDelete={handleBulkDelete}
                      onClear={() => setSelectedRecordIds(new Set())}
                      isDeleting={bulkDeleting}
                      labels={{
                        selected: t("selectedSuffix") as string,
                        delete: t("delete") as string,
                        deleting: t("deleting") as string,
                        clear: t("clear") as string,
                      }}
                    />
                  </TabsContent>

                  <TabsContent
                    value="schema"
                    className="min-h-0 flex-1 overflow-y-auto"
                  >
                    <Box variant="panel" className="max-w-[720px]">
                      <SchemaEditor
                        collection={collection}
                        fields={fields}
                        onAddField={handleAddField}
                        onRenameField={handleRenameField}
                        onDeleteField={handleDeleteField}
                        onRenameCollection={handleCollectionRename}
                        onDeleteCollection={handleCollectionDelete}
                        onClose={() => setTab("data")}
                        error={formError}
                        isAddingField={createField.isPending}
                        isMutatingField={
                          updateField.isPending || deleteField.isPending
                        }
                        isMutatingCollection={
                          updateCollection.isPending ||
                          deleteCollection.isPending
                        }
                        relationTargets={collections.map((c) => ({
                          key: c.key,
                          name: c.name,
                        }))}
                        labels={{
                          title: t("schemaTitle") as string,
                          collectionNameLabel: t(
                            "schemaCollectionName"
                          ) as string,
                          collectionKeyLabel: t("keyLabel") as string,
                          saveCollection: t("save") as string,
                          deleteCollection: t("deleteCollection") as string,
                          deleteCollectionHint: t("deleteCollectionHint") as string,
                          builtinHint: t("builtinHint") as string,
                          fieldsHeading: t("schemaFieldsHeading") as string,
                          addField: t("addField") as string,
                          newFieldKey: t("newFieldKey") as string,
                          newFieldName: t("newFieldName") as string,
                          newFieldType: t("newFieldType") as string,
                          add: t("add") as string,
                          cancel: t("cancel") as string,
                          rename: t("rename") as string,
                          delete: t("delete") as string,
                          typeImmutableHint: t("typeImmutableHint") as string,
                          keyImmutableHint: t("keyImmutableHint") as string,
                          close: t("close") as string,
                          saving: t("saving") as string,
                          relationTarget: t("relationTarget") as string,
                          relationTargetPlaceholder: t(
                            "relationTargetPlaceholder"
                          ) as string,
                        }}
                      />
                    </Box>
                  </TabsContent>

                  <TabsContent
                    value="api"
                    className="min-h-0 flex-1 overflow-y-auto"
                  >
                    {/* Wider than the Schema tab's 720px because of the
                        code blocks. Note this is a ceiling, not a floor:
                        the shell's main pane is ~825px at 1440, so the
                        token table has to fit *that* — see the density
                        note in api-tab.tsx. */}
                    <Box className="max-w-[960px]">
                      <ApiTab
                        collection={collection}
                        fields={fields}
                        workspaceId={collectionWorkspaceId}
                        tokens={tokensQuery.data ?? []}
                        roles={rolesQuery.data ?? []}
                        isTokensLoading={
                          workspacePending ||
                          tokensQuery.isLoading ||
                          rolesQuery.isLoading
                        }
                        // A bare 404 from the gateway's router is not
                        // "no tokens" — it is a route the gateway does
                        // not proxy. Naming it keeps the section from
                        // reporting a missing deployment as user error.
                        isTokensUnavailable={
                          isGatewayRouteMissing(tokensQuery.error) ||
                          isGatewayRouteMissing(rolesQuery.error)
                        }
                        tokensError={
                          workspaceUnresolved
                            ? (t("workspaceUnresolved") as string)
                            : tokensQuery.error instanceof Error &&
                                !isGatewayRouteMissing(tokensQuery.error)
                              ? tokensQuery.error.message
                              : null
                        }
                        onCreateToken={handleCreateToken}
                        onRotateToken={handleRotateToken}
                        onRevokeToken={handleRevokeToken}
                        isMutatingToken={
                          createToken.isPending ||
                          rotateToken.isPending ||
                          revokeToken.isPending
                        }
                        mutationError={tokenError}
                        labels={{
                          endpointsHeading: t("api.endpointsHeading") as string,
                          endpointsIntro: t("api.endpointsIntro") as string,
                          pathParamsNote: t("api.pathParamsNote") as string,
                          authHeading: t("api.authHeading") as string,
                          authAnonymous: t("api.authAnonymous") as string,
                          authToken: t("api.authToken") as string,
                          grantNoticeHeading: t(
                            "api.grantNoticeHeading"
                          ) as string,
                          grantNotice: t("api.grantNotice") as string,
                          rateLimitHeading: t("api.rateLimitHeading") as string,
                          rateLimitNote: t("api.rateLimitNote") as string,
                          rateLimitToken: t("api.rateLimitToken") as string,
                          rateLimitIp: t("api.rateLimitIp") as string,
                          rateLimitAnonWrite: t(
                            "api.rateLimitAnonWrite"
                          ) as string,
                          sampleHeading: t("api.sampleHeading") as string,
                          sampleNote: t("api.sampleNote") as string,
                          snippetsHeading: t("api.snippetsHeading") as string,
                          snippetsIntro: t("api.snippetsIntro") as string,
                          copy: t("api.copy") as string,
                          copied: t("api.copied") as string,
                          copyFailed: t("api.copyFailed") as string,
                          tokensHeading: t("api.tokensHeading") as string,
                          tokensIntro: t("api.tokensIntro") as string,
                          tokensEmpty: t("api.tokensEmpty") as string,
                          tokensEmptyHint: t("api.tokensEmptyHint") as string,
                          tokensLoading: t("loading") as string,
                          tokensError: t("api.tokensError") as string,
                          tokensUnavailable: t(
                            "api.tokensUnavailable"
                          ) as string,
                          newToken: t("api.newToken") as string,
                          tokenName: t("api.tokenName") as string,
                          tokenRole: t("api.tokenRole") as string,
                          tokenExpiry: t("api.tokenExpiry") as string,
                          expiryDays: t("api.expiryDays") as string,
                          expiryNever: t("api.expiryNever") as string,
                          expiryNeverWarning: t(
                            "api.expiryNeverWarning"
                          ) as string,
                          noConsumerRoles: t("api.noConsumerRoles") as string,
                          create: t("create") as string,
                          creating: t("creating") as string,
                          cancel: t("cancel") as string,
                          rotate: t("api.rotate") as string,
                          revoke: t("api.revoke") as string,
                          revoked: t("api.statusRevoked") as string,
                          active: t("api.statusActive") as string,
                          expired: t("api.statusExpired") as string,
                          columnName: t("api.columnName") as string,
                          columnPrefix: t("api.columnPrefix") as string,
                          columnRole: t("api.columnRole") as string,
                          columnCreated: t("createdAtColumn") as string,
                          columnLastUsed: t("api.columnLastUsed") as string,
                          columnExpires: t("api.columnExpires") as string,
                          columnStatus: t("api.columnStatus") as string,
                          never: t("api.never") as string,
                          secretHeading: t("api.secretHeading") as string,
                          secretOnceWarning: t(
                            "api.secretOnceWarning"
                          ) as string,
                          dismiss: t("api.dismiss") as string,
                        }}
                      />
                    </Box>
                  </TabsContent>

                  <TabsContent
                    value="access"
                    className="min-h-0 flex-1 overflow-y-auto"
                  >
                    {/* Same 960px ceiling as the API tab: the grant
                        matrix is seven columns wide and the shell's
                        main pane is ~825px at 1440. */}
                    <Box className="max-w-[960px]">
                      <AccessTab
                        collection={collection}
                        fields={fields}
                        roles={rolesQuery.data ?? []}
                        grants={grantsQuery.data ?? []}
                        isLoading={
                          workspacePending ||
                          rolesQuery.isLoading ||
                          grantsQuery.isLoading
                        }
                        // A bare 404 out of the gateway's own router is
                        // not "no roles" — it is a route the gateway
                        // does not proxy. Same distinction the API tab
                        // draws, for the same reason.
                        isUnavailable={
                          isGatewayRouteMissing(rolesQuery.error) ||
                          isGatewayRouteMissing(grantsQuery.error)
                        }
                        error={
                          workspaceUnresolved
                            ? (t("workspaceUnresolved") as string)
                            : rolesQuery.error instanceof Error &&
                                !isGatewayRouteMissing(rolesQuery.error)
                              ? rolesQuery.error.message
                              : grantsQuery.error instanceof Error &&
                                  !isGatewayRouteMissing(grantsQuery.error)
                                ? grantsQuery.error.message
                                : null
                        }
                        isMutating={
                          createRole.isPending ||
                          updateRole.isPending ||
                          deleteRole.isPending ||
                          createGrant.isPending ||
                          updateGrant.isPending ||
                          deleteGrant.isPending ||
                          putMember.isPending ||
                          removeMember.isPending
                        }
                        mutationError={accessError}
                        onCreateRole={handleCreateRole}
                        onRenameRole={handleRenameRole}
                        onDeleteRole={handleDeleteRole}
                        members={members}
                        currentUserId={currentUserId}
                        isMembersLoading={membersQuery.isLoading}
                        // Same distinction the tab already draws for
                        // roles: a bare gateway 404 is handled above by
                        // `isUnavailable`, so only a real failure of the
                        // members endpoint is reported here.
                        membersError={
                          membersQuery.error instanceof Error &&
                          !isGatewayRouteMissing(membersQuery.error)
                            ? membersQuery.error.message
                            : null
                        }
                        memberCandidates={memberCandidates}
                        isMemberCandidatesLoading={
                          workspacePeopleQuery.isLoading
                        }
                        memberCandidatesError={
                          workspacePeopleQuery.error instanceof Error
                            ? workspacePeopleQuery.error.message
                            : null
                        }
                        onInviteMember={handleInviteMember}
                        inviteManageHref={
                          workspaceId
                            ? `/settings/workspace?ws=${encodeURIComponent(workspaceId)}`
                            : "/settings/workspace"
                        }
                        onPutMember={handlePutMember}
                        onRemoveMember={handleRemoveMember}
                        onToggleGrant={handleToggleGrant}
                        onSetGrantFields={handleSetGrantFields}
                        labels={{
                          statusHeading: t("access.statusHeading") as string,
                          statusPublic: t("access.statusPublic") as string,
                          statusPublicFields: t(
                            "access.statusPublicFields"
                          ) as string,
                          statusPublicNoFields: t(
                            "access.statusPublicNoFields"
                          ) as string,
                          statusPrivate: t("access.statusPrivate") as string,
                          statusPrivateHint: t(
                            "access.statusPrivateHint"
                          ) as string,
                          statusAuthenticated: t(
                            "access.statusAuthenticated"
                          ) as string,
                          rolesHeading: t("access.rolesHeading") as string,
                          rolesIntro: t("access.rolesIntro") as string,
                          rolesEmpty: t("access.rolesEmpty") as string,
                          newRole: t("access.newRole") as string,
                          roleName: t("access.roleName") as string,
                          roleKind: t("access.roleKind") as string,
                          kindAdmin: t("access.kindAdmin") as string,
                          kindConsumer: t("access.kindConsumer") as string,
                          kindHint: t("access.kindHint") as string,
                          builtinBadge: t("builtinBadge") as string,
                          columnRole: t("access.columnRole") as string,
                          columnKind: t("access.columnKind") as string,
                          columnActions: t("access.columnActions") as string,
                          rename: t("rename") as string,
                          save: t("save") as string,
                          delete: t("delete") as string,
                          create: t("create") as string,
                          creating: t("creating") as string,
                          cancel: t("cancel") as string,
                          builtinImmutableHint: t(
                            "access.builtinImmutableHint"
                          ) as string,
                          membersHeading: t("access.membersHeading") as string,
                          membersIntro: t("access.membersIntro") as string,
                          membersNonMemberNote: t(
                            "access.membersNonMemberNote"
                          ) as string,
                          membersEmpty: t("access.membersEmpty") as string,
                          membersError: t("access.membersError") as string,
                          membersNoRoles: t("access.membersNoRoles") as string,
                          addMember: t("access.addMember") as string,
                          memberFilterLabel: t(
                            "access.memberFilterLabel"
                          ) as string,
                          memberFilterPlaceholder: t(
                            "access.memberFilterPlaceholder"
                          ) as string,
                          memberFilterHint: t(
                            "access.memberFilterHint"
                          ) as string,
                          memberFilterEmpty: t(
                            "access.memberFilterEmpty"
                          ) as string,
                          memberFilterLoading: t("loading") as string,
                          memberRoleLabel: t("access.memberRoleLabel") as string,
                          memberChangeRole: t(
                            "access.memberChangeRole"
                          ) as string,
                          memberNotInWorkspace: t(
                            "access.memberNotInWorkspace"
                          ) as string,
                          memberInviteNeedsEmail: t(
                            "access.memberInviteNeedsEmail"
                          ) as string,
                          memberInvite: t("access.memberInvite") as string,
                          memberInviting: t("access.memberInviting") as string,
                          memberInviteCopyLink: tw("invite.copyLink") as string,
                          memberInviteCopied: tw("invite.copied") as string,
                          memberCandidatesError: t(
                            "access.memberCandidatesError"
                          ) as string,
                          memberInviteManage: t(
                            "access.memberInviteManage"
                          ) as string,
                          memberYou: t("access.memberYou") as string,
                          memberUnknown: t("access.memberUnknown") as string,
                          columnMember: t("access.columnMember") as string,
                          add: t("add") as string,
                          adding: t("access.adding") as string,
                          grantsHeading: t("access.grantsHeading") as string,
                          grantsIntro: t("access.grantsIntro") as string,
                          grantsEmptyRoles: t(
                            "access.grantsEmptyRoles"
                          ) as string,
                          grantAll: t("access.grantAll") as string,
                          actionRead: t("access.actionRead") as string,
                          actionCreate: t("access.actionCreate") as string,
                          actionUpdate: t("access.actionUpdate") as string,
                          actionDelete: t("access.actionDelete") as string,
                          actionPublish: t("access.actionPublish") as string,
                          actionSchema: t("access.actionSchema") as string,
                          failClosedHeading: t(
                            "access.failClosedHeading"
                          ) as string,
                          failClosedNote: t("access.failClosedNote") as string,
                          fieldsHeading: t("access.fieldsHeading") as string,
                          fieldsIntro: t("access.fieldsIntro") as string,
                          fieldsEmpty: t("access.fieldsEmpty") as string,
                          fieldsAll: t("access.fieldsAll") as string,
                          fieldsNoneWarning: t(
                            "access.fieldsNoneWarning"
                          ) as string,
                          noSchemaFields: t("access.noSchemaFields") as string,
                          loading: t("loading") as string,
                          error: t("access.loadError") as string,
                          unavailable: t("access.unavailable") as string,
                        }}
                      />
                    </Box>
                  </TabsContent>
                </Tabs>
              </Box>
            }
          />
        </Box>
      </Box>

      <ItemPanel
        open={panelOpen}
        onClose={closePanel}
        ariaLabel={
          (recordParam === "new"
            ? t("createTitle")
            : t("editTitle")) as string
        }
        width="lg"
        testId="record-panel"
      >
        {/*
          SDL-244: the schema and the record are two independent
          queries, and `useForm` snapshots `defaultValues` on its
          first render only. Mounting the form before the fields
          arrive therefore registers it against an empty schema —
          every field then submits as `null`, and the first save dies
          on the server with "Невалидный конверт rich_text-поля"
          instead of saving. Which query wins the race decides
          whether the panel works, so gate on the schema and key the
          form by record so switching records re-initialises it.
        */}
        {fieldsQuery.isLoading ? (
          <ItemPanelMessage>{t("loading") as string}</ItemPanelMessage>
        ) : recordParam === "new" || editorRecord ? (
          <RecordForm
            key={recordParam === "new" ? "new" : editorRecord!.id}
            fields={fields}
            record={recordParam === "new" ? null : editorRecord}
            onSubmit={handleRecordSubmit}
            onCancel={closePanel}
            onDelete={
              recordParam !== "new" && editorRecord
                ? handleRecordDelete
                : undefined
            }
            isSubmitting={createRecord.isPending || updateRecord.isPending}
            isDeleting={deleteRecord.isPending}
            error={formError}
            labels={{
              titleCreate: t("createTitle") as string,
              titleEdit: t("editTitle") as string,
              close: t("close") as string,
              save: t("save") as string,
              cancel: t("cancel") as string,
              delete: t("delete") as string,
              deleting: t("deleting") as string,
              saving: t("saving") as string,
              required: t("required") as string,
              booleanTrue: t("booleanTrue") as string,
              booleanFalse: t("booleanFalse") as string,
              invalidJson: t("invalidJson") as string,
              richTextSaved: t("richTextSaved") as string,
              richTextFormattingLoss: t("richTextFormattingLoss") as string,
            }}
          />
        ) : recordDetailQuery.isLoading ? (
          <ItemPanelMessage>{t("loading") as string}</ItemPanelMessage>
        ) : (
          <ItemPanelMessage>{t("notFoundTitle") as string}</ItemPanelMessage>
        )}
      </ItemPanel>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        labels={{
          placeholder: t("commandPalettePlaceholder") as string,
          empty: t("commandPaletteEmpty") as string,
          open: t("commandPaletteAriaLabel") as string,
        }}
      />

      <DeleteConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={t(confirmDelete === "collection" ? "deleteCollection" : "delete")}
        description={t(confirmDelete === "collection" ? "deleteCollectionConfirm" : "deleteConfirm")}
        consequence={
          <PolicyLine stringKey="item_delete_consequence" target="deletion" testId="delete-policy-line" />
        }
        onConfirm={confirmDelete === "collection" ? runCollectionDelete : runRecordDelete}
        isDeleting={deleteRecord.isPending || deleteCollection.isPending}
        errorMessage={t(confirmDelete === "collection" ? "deleteCollectionError" : "deleteRecordError")}
      />

      <DeleteDialog
        open={confirmSpec !== null}
        onOpenChange={(open) => {
          if (!open) confirmSpec?.cancel();
        }}
        testId="collection-confirm-dialog"
        title={confirmSpec?.title ?? ""}
        consequence={
          confirmSpec ? (
            <>
              <Text size="sm" className="break-words">
                {confirmSpec.consequence}
              </Text>
              {confirmSpec.policy ? (
                <PolicyLine stringKey="item_delete_consequence" target="deletion" testId="delete-policy-line" />
              ) : null}
            </>
          ) : null
        }
        confirmLabel={confirmSpec?.confirmLabel}
        pendingLabel={confirmSpec?.pendingLabel}
        pending={confirmBusy}
        error={confirmError}
        onCancel={() => confirmSpec?.cancel()}
        onConfirm={() => void confirmSpec?.run()}
      />
    </CurrentWorkspaceProvider>
  );
}

function CenteredText({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      align="center"
      justify="center"
      gap={2}
      textAlign="center"
      className={`${WORKPLACE_HEIGHT} p-6`}
    >
      {title ? (
        <Text size="lg" weight="semibold">
          {title}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}
