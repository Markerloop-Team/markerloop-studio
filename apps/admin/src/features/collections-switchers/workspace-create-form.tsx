"use client";

// One form for a new workspace — name + address (SDL-759). Drawn by the
// onboarding screen /welcome and by the «+ New workspace» dialog, so both ask
// the same two questions and read the same answers:
//
//   - the address is suggested from the name until the person edits it;
//   - GET /v1/workspaces/name-check judges it as it is typed (debounced) and
//     the verdict is a line of text under the field — invalid, reserved,
//     taken, or available;
//   - the POST re-checks it: a 409 workspace_slug_taken / 400 invalid|reserved
//     lands under the same field, a limit refusal (409 quota_exceeded, also
//     resource "free_workspaces") stays in the form with its rule and link;
//   - a free_workspaces refusal whose place is held by a workspace in the
//     trash (`data.blocking_trashed`, SDL-758) opens FreePlaceInTrashDialog:
//     restore that one, or erase it forever and create this one at once.

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { useSitesBaseDomain } from "@/shared/config/site-address-context";
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useRestoreWorkspace,
  useWorkspaceSlugCheck,
  type Workspace,
  type WorkspaceSlugStatus,
} from "@/entities/collections/workspace";
import { LimitRefusalNotice } from "@/entities/policy/ui/policy-line";
import { FREE_WORKSPACES, WORKSPACES, limitRefusalOf } from "@/shared/lib/api/limit-refusal";

import { normalizeSlugInput, slugFromName } from "./workspace-slug";
import { FreePlaceInTrashDialog, type FreePlaceAction } from "./free-place-in-trash-dialog";

const SLUG_CHECK_DELAY_MS = 300;

const formSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().min(1),
});
type FormValues = z.infer<typeof formSchema>;

/** The service's error code of a failed call (`{error: "<code>"}`), if any. */
function apiErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const data = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const code = (data as { error?: unknown }).error;
  return typeof code === "string" ? code : null;
}

const SLUG_REFUSALS: Record<string, WorkspaceSlugStatus> = {
  workspace_slug_taken: "taken",
  workspace_slug_invalid: "invalid",
  workspace_slug_reserved: "reserved",
};

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export type WorkspaceCreateActionsState = {
  pending: boolean;
  canSubmit: boolean;
};

/** How the form ended: a new workspace, or the trashed one brought back (SDL-758). */
export type WorkspaceCreateOutcome = "created" | "restored";

export function WorkspaceCreateForm({
  onCreated,
  renderActions,
  autoFocus = false,
  resetKey,
  testIdPrefix = "workspace-create",
}: {
  /** Callers read only the id: a restored workspace is known by it. */
  onCreated: (workspace: Pick<Workspace, "id">, outcome: WorkspaceCreateOutcome) => void;
  /** The buttons under the fields; the submit one must be `type="submit"`. */
  renderActions: (state: WorkspaceCreateActionsState) => React.ReactNode;
  autoFocus?: boolean;
  /** A change empties the form (the dialog passes its `open`). */
  resetKey?: unknown;
  testIdPrefix?: string;
}) {
  const t = useTranslations("common.dialogs.collectionsWorkspace");
  // The sites' base of this contour; null = unknown here, so no suffix and
  // no "<address> is available" — a guessed domain would be a false promise.
  const base = useSitesBaseDomain();
  const tFree = useTranslations("limits.freePlace");
  const createMutation = useCreateWorkspace();
  const restoreMutation = useRestoreWorkspace();
  const deleteMutation = useDeleteWorkspace();
  // The window of a free place held by the trash (SDL-758).
  const [freePlaceOpen, setFreePlaceOpen] = useState(false);
  const [freePlaceBusy, setFreePlaceBusy] = useState<FreePlaceAction | null>(null);
  const [freePlaceError, setFreePlaceError] = useState<string | null>(null);
  // The workspace just erased from the window: its place on the free plan is
  // free at once, but the owner's ceiling counts it until the purger's pass
  // (collections-service, ~an hour) — a 409 «workspaces» right after it is
  // explained, and that workspace is never offered for restore again.
  const [erasedName, setErasedName] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", slug: "" },
  });
  // Until the person types an address of their own, it follows the name.
  const [slugEdited, setSlugEdited] = useState(false);
  // The address the POST refused, with the reason — shown until it changes.
  const [refused, setRefused] = useState<{ slug: string; status: WorkspaceSlugStatus } | null>(null);

  useEffect(() => {
    form.reset({ name: "", slug: "" });
    setSlugEdited(false);
    setRefused(null);
    setFreePlaceOpen(false);
    setFreePlaceBusy(null);
    setFreePlaceError(null);
    setErasedName(null);
    createMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on key change only
  }, [resetKey, form]);

  const slug = form.watch("slug");
  const name = form.watch("name");
  const debouncedSlug = useDebounced(slug, SLUG_CHECK_DELAY_MS);
  const check = useWorkspaceSlugCheck(debouncedSlug || null);

  const settled = debouncedSlug === slug && !!slug;
  const checkedStatus: WorkspaceSlugStatus | null =
    settled && check.data && check.data.slug === slug ? check.data.status : null;
  const status: WorkspaceSlugStatus | null =
    refused && refused.slug === slug ? refused.status : checkedStatus;
  const checking = !!slug && !status && !check.isError;
  // A check that failed does not block: the POST has the last word.
  const slugOk = status === "available" || (settled && check.isError && !refused);
  const canSubmit = name.trim().length > 0 && slugOk && !createMutation.isPending;

  const create = (values: FormValues, settle?: () => void) => {
    createMutation.mutate(
      { name: values.name.trim(), slug: values.slug },
      {
        onSuccess: (workspace) => {
          setFreePlaceOpen(false);
          onCreated(workspace, "created");
        },
        onError: (error) => {
          const code = apiErrorCode(error);
          if (code && SLUG_REFUSALS[code]) {
            setRefused({ slug: values.slug, status: SLUG_REFUSALS[code] });
          }
          const refusal = limitRefusalOf(error);
          // Another trashed workspace may hold a free place too (older data:
          // two free ones in the trash) — the window simply shows it next.
          if (refusal?.resource === FREE_WORKSPACES && refusal.blockingTrashed) {
            setFreePlaceError(null);
            setFreePlaceOpen(true);
          } else {
            setFreePlaceOpen(false);
          }
        },
        onSettled: () => settle?.(),
      }
    );
  };

  const onSubmit = (values: FormValues) => {
    if (!canSubmit) return;
    create(values);
  };

  // The refusal that opened the window: the trashed workspace holding the place.
  const lastRefusal = createMutation.error ? limitRefusalOf(createMutation.error) : null;
  const blockingTrashed =
    lastRefusal?.resource === FREE_WORKSPACES ? (lastRefusal.blockingTrashed ?? null) : null;

  const onRestoreTrashed = async () => {
    if (!blockingTrashed) return;
    setFreePlaceBusy("restore");
    setFreePlaceError(null);
    try {
      const restored = await restoreMutation.mutateAsync(blockingTrashed.id);
      setFreePlaceOpen(false);
      onCreated({ id: restored?.id || blockingTrashed.id }, "restored");
    } catch (e) {
      // 409 free_workspaces with blocking_trashed=null: an active workspace
      // took the place meanwhile — the restore cannot happen now.
      const refusal = limitRefusalOf(e);
      setFreePlaceError(
        refusal?.resource === FREE_WORKSPACES
          ? tFree("restoreBlocked", { name: blockingTrashed.name })
          : e instanceof Error && e.message
            ? e.message
            : tFree("restoreError")
      );
    } finally {
      setFreePlaceBusy(null);
    }
  };

  const onEraseAndCreate = async () => {
    if (!blockingTrashed) return;
    setFreePlaceBusy("erase");
    setFreePlaceError(null);
    try {
      await deleteMutation.mutateAsync({ id: blockingTrashed.id, permanent: true });
      setErasedName(blockingTrashed.name);
    } catch (e) {
      setFreePlaceError(e instanceof Error && e.message ? e.message : tFree("eraseError"));
      setFreePlaceBusy(null);
      return;
    }
    // The place is free at once (collections-service SDL-758): the same
    // name and address the person typed go in right away.
    create(form.getValues(), () => setFreePlaceBusy(null));
  };

  const statusLine = (() => {
    if (!slug) return null;
    if (checking) return { tone: "muted" as const, text: t("slugChecking"), state: "checking" };
    if (status === "available") {
      return {
        tone: "muted" as const,
        text: base ? t("slugAvailable", { address: `${slug}.${base}` }) : t("slugAvailableNoBase"),
        state: status,
      };
    }
    if (status === "invalid") return { tone: "error" as const, text: t("slugInvalid"), state: status };
    if (status === "reserved") return { tone: "error" as const, text: t("slugReserved"), state: status };
    if (status === "taken") return { tone: "error" as const, text: t("slugTaken"), state: status };
    if (check.isError) return { tone: "muted" as const, text: t("slugCheckFailed"), state: "unknown" };
    return null;
  })();

  const slugRefusal = createMutation.error ? apiErrorCode(createMutation.error) : null;
  const otherError =
    createMutation.error &&
    !limitRefusalOf(createMutation.error) &&
    !(slugRefusal && SLUG_REFUSALS[slugRefusal])
      ? createMutation.error.message || t("createError")
      : null;

  return (
    <UI.Field.Root {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <UI.Box gap={4}>
          <UI.Field.Field
            control={form.control as never}
            name="name"
            render={({ field }) => (
              <UI.Field.Item>
                <UI.Field.Label>{t("nameLabel")}</UI.Field.Label>
                <UI.Field.Control>
                  <UI.FormControl.Input
                    placeholder={t("namePlaceholder")}
                    autoFocus={autoFocus}
                    autoComplete="off"
                    data-testid={`${testIdPrefix}-name`}
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      if (!slugEdited) {
                        form.setValue("slug", slugFromName(e.target.value));
                      }
                    }}
                  />
                </UI.Field.Control>
                <UI.Field.Message />
              </UI.Field.Item>
            )}
          />
          <UI.Field.Field
            control={form.control as never}
            name="slug"
            render={({ field }) => (
              <UI.Field.Item>
                <UI.Field.Label>{t("addressLabel")}</UI.Field.Label>
                <UI.InputGroup>
                  <UI.Field.Control>
                    <UI.InputGroupInput
                      placeholder={t("addressPlaceholder")}
                      autoComplete="off"
                      spellCheck={false}
                      inputMode="url"
                      aria-invalid={statusLine?.tone === "error" ? true : undefined}
                      data-testid={`${testIdPrefix}-slug`}
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={field.value}
                      onChange={(e) => {
                        setSlugEdited(true);
                        field.onChange(normalizeSlugInput(e.target.value));
                      }}
                    />
                  </UI.Field.Control>
                  {base ? (
                    <UI.InputGroupAddon align="inline-end">
                      <UI.InputGroupText>.{base}</UI.InputGroupText>
                    </UI.InputGroupAddon>
                  ) : null}
                </UI.InputGroup>
                {statusLine ? (
                  <UI.Text
                    as="p"
                    size="sm"
                    variant={statusLine.tone === "error" ? undefined : "muted"}
                    className={statusLine.tone === "error" ? "text-destructive" : undefined}
                    role={statusLine.tone === "error" ? "alert" : undefined}
                    aria-live="polite"
                    data-testid={`${testIdPrefix}-slug-status`}
                    data-status={statusLine.state}
                  >
                    {statusLine.text}
                  </UI.Text>
                ) : (
                  <UI.Text as="p" size="sm" variant="muted">
                    {t("addressHint")}
                  </UI.Text>
                )}
              </UI.Field.Item>
            )}
          />
          {createMutation.error ? <LimitRefusalNotice error={createMutation.error} /> : null}
          {erasedName && lastRefusal?.resource === WORKSPACES ? (
            <UI.Text as="p" size="sm" variant="muted" data-testid={`${testIdPrefix}-erased-pending`}>
              {tFree("erasedPendingPurge", { name: erasedName })}
            </UI.Text>
          ) : null}
          {blockingTrashed && !freePlaceOpen ? (
            <UI.Button
              type="button"
              variant="outline"
              size="sm"
              data-testid={`${testIdPrefix}-free-place-options`}
              onClick={() => setFreePlaceOpen(true)}
            >
              {tFree("showOptions")}
            </UI.Button>
          ) : null}
          {otherError ? (
            <UI.Alert variant="destructive" data-testid={`${testIdPrefix}-error`}>
              {otherError}
            </UI.Alert>
          ) : null}
          {renderActions({ pending: createMutation.isPending, canSubmit })}
        </UI.Box>
      </form>
      {blockingTrashed ? (
        <FreePlaceInTrashDialog
          open={freePlaceOpen}
          onOpenChange={setFreePlaceOpen}
          trashed={blockingTrashed}
          limit={lastRefusal?.limit}
          busy={freePlaceBusy}
          error={freePlaceError}
          onRestore={() => void onRestoreTrashed()}
          onEraseAndCreate={() => void onEraseAndCreate()}
        />
      ) : null}
    </UI.Field.Root>
  );
}
