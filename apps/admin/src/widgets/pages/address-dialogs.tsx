"use client";

// The life cycle of an address (SDL-605, slice 3): its path and tab title,
// and its deletion. Both are operations on the `route`, so both live on the
// screen that IS one route — the editor — behind one icon menu in its header.
//
// Where the trigger goes is OURS to decide, not the canvas's: the EP-124
// canvas draws the consequences card (/design-system/pages?case=delete) and
// the editor header (/design-system/studio) but never says what opens the
// card. The header is a deliberate choice and a deliberate deviation from
// the two actions the canvas header shows: an address is edited and deleted
// from the screen about that address, and the list column set of the canvas
// (three columns, no actions column) stays exactly as drawn. The width that
// buys is watched by the 390px geometry sweep in
// e2e/sdl605-pages-section.auth.spec.ts (findOverflowingChrome), because the
// header of this editor has already gone off the right edge once and only a
// screenshot caught it.
//
// The delete dialog is the canvas's DeleteConsequences card, word for word
// and testid for testid, with one thing carried over that is easy to lose:
// the REVERSIBLE alternative ("unpublish") stands BEFORE the irreversible
// button. That is why the buttons sit in a plain kit Box and not in
// UI.Dialog.Footer — the footer is `max-sm:flex-col-reverse`, so on a phone
// it would print "Delete address" ABOVE "Unpublish" and invert the one
// ordering the canvas argues for.

import * as React from "react";
import { EyeOff, FileText, MoreHorizontal, Settings2, Trash2 } from "lucide-react";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { PolicyLine } from "@/entities/policy/ui/policy-line";
import { DeleteDialogBody, DeleteDialogShell } from "@/shared/components/delete-dialog";
import { isGatewayRouteMissing } from "@/shared/lib/api/client";
import {
  hasReservedAddressChars,
  invalidRoutePathMessageKey,
  normalizeAddressPath,
  pagesConflictRoute,
  pagesErrorCode,
  pagesHttpStatus,
  useDeleteAddress,
  useSetRouteStatus,
  useUpdateRoute,
  type PagesRoute,
  type RouteStatus,
  type UpdateRouteArgs,
} from "@/entities/pages";
import { useProductFeatures } from "@/shared/config/product-features-context";

/* ------------------------------------------------------------- settings */

type Snapshot = { path: string; title: string; version: number };

/**
 * The rename warning's whole condition, in ONE executable place.
 *
 * `true` = saving this form frees a path that is answering visitors right
 * now, and nothing redirects them (pages-service has no alias table). The
 * service normalises before it compares and drops a path that did not
 * actually change, so "/about/" typed over "/about" is not a rename and must
 * not raise the warning — a warning that lies in the cheap case stops being
 * read in the expensive one. A draft answers 404 already: nothing to lose.
 */
export function shouldWarnAboutRename(currentPath: string, status: RouteStatus, typed: string): boolean {
  const normalized = normalizeAddressPath(typed);
  return normalized !== null && normalized !== currentPath && status === "published";
}

/**
 * What pressing "Save" in the settings form decides, BEFORE any request —
 * in one executable place, for the same reason `shouldWarnAboutRename` is
 * one: the form runs in a portal, so a server render never reaches this
 * code, and a smoke that re-states the rule stays green while the form
 * drifts away from it.
 */
export type AddressSettingsPlan =
  | { kind: "pathError"; code: "required" | "slash" | "reserved" | "invalid" }
  | { kind: "titleError" }
  /** Nothing changed and nothing ever conflicted — just close. */
  | { kind: "nothingToSend" }
  /** Nothing LEFT to change after a 409 refilled a field — say so. */
  | { kind: "nothingLeftToSend" }
  | { kind: "send"; path?: string; title?: string };

export function planAddressSettingsSubmit(input: {
  typedPath: string;
  typedTitle: string;
  /** What the form believes the server holds — the snapshot, not the cache. */
  saved: { path: string; title: string };
  /** A 409 has already refilled a field in this dialog. */
  sawConflict: boolean;
}): AddressSettingsPlan {
  const normalized = normalizeAddressPath(input.typedPath);
  if (normalized === null) {
    // `null` covers TWO different refusals, and telling someone who typed
    // "/about /" that the address "must start with /" sends them looking for
    // a slash that is already there. The missing leading slash is the one
    // rule worth its own sentence; everything else the normaliser refuses
    // gets the sentence that states the rules (errors.invalid).
    const typed = input.typedPath.trim();
    if (!typed) return { kind: "pathError", code: "required" };
    if (!typed.startsWith("/")) return { kind: "pathError", code: "slash" };
    // ":" and "{" (SDL-690) get their own sentence too: it names the
    // character and the way to write a parameter ([slug]).
    return { kind: "pathError", code: hasReservedAddressChars(typed) ? "reserved" : "invalid" };
  }
  const title = input.typedTitle.trim();
  if (!title) return { kind: "titleError" };

  const send: { kind: "send"; path?: string; title?: string } = { kind: "send" };
  // The service normalises before it compares and drops a path that did not
  // actually change, so what is sent is what actually differs.
  if (normalized !== input.saved.path) send.path = normalized;
  if (title !== input.saved.title) send.title = title;
  if (send.path === undefined && send.title === undefined) {
    // After a conflict this is the trap the notice walks straight into: the
    // untouched field was refilled from the server, so the "save again" it
    // asks for can have nothing left to send — and closing silently would
    // read as a rename that happened.
    return input.sawConflict ? { kind: "nothingLeftToSend" } : { kind: "nothingToSend" };
  }
  return send;
}

/** What that rename does to a visitor, in the visitor's words (canvas EP-124). */
export function AddressPathWarning({ from }: { from: string }) {
  const t = useTranslations("pages.settings");
  return (
    <UI.Alert data-testid="address-path-warning">
      <UI.Box direction="column" gap={1}>
        <UI.Text as="span" size="sm" weight="medium">
          {t("pathWarning.title")}
        </UI.Text>
        <UI.Text as="span" size="sm">
          {t("pathWarning.hint", { path: from })}
        </UI.Text>
      </UI.Box>
    </UI.Alert>
  );
}

/**
 * Path and tab title of an existing address.
 *
 * The version travels with the values the person is looking at: it is taken
 * ONCE, when the dialog opens, and the PATCH goes under it. The route query
 * has no staleTime of its own, so a tab switch can refetch it while the form
 * is open — sending the version from the cache instead would let this form's
 * old path overwrite someone else's rename with a perfectly successful 200.
 * Pinned to the open, that case is a 409 — and the 409 refills only the
 * fields the person has not typed into. Taking the server's value into a
 * field they were editing would destroy their text with nothing left on
 * screen to recover it from, and would then leave the form with nothing to
 * send, so the "save again" the notice asks for would close the dialog
 * without a request. What the server holds now is printed under the field
 * instead, next to what was typed.
 */
export function AddressSettingsDialog({
  open,
  onOpenChange,
  workspaceId,
  route,
  onRouteChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  route: PagesRoute;
  /** A write to this address landed — see AddressActions. */
  onRouteChanged?: () => void;
}) {
  const t = useTranslations("pages.settings");
  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={460} data-testid="address-settings-dialog">
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("title")}</UI.Dialog.Title>
          <UI.Dialog.Description>{t("description")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        {/* The form is a component of its own, and it is mounted only while
            the dialog is open — which is what pins the version to the
            opening, and what lets `smoke:pages` render it: the kit's
            Dialog.Content lives in a portal, and a portal renders nothing
            under react-dom/server. */}
        <AddressSettingsForm
          workspaceId={workspaceId}
          route={route}
          onRouteChanged={onRouteChanged}
          onClose={() => onOpenChange(false)}
        />
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}

export function AddressSettingsForm({
  workspaceId,
  route,
  onClose,
  onRouteChanged,
}: {
  workspaceId: string;
  route: PagesRoute;
  onClose: () => void;
  /** A write to this address landed — see AddressActions. */
  onRouteChanged?: () => void;
}) {
  const t = useTranslations("pages.settings");
  const update = useUpdateRoute();
  const [snapshot, setSnapshot] = React.useState<Snapshot>({
    path: route.path,
    title: route.title,
    version: route.version,
  });
  const [path, setPath] = React.useState(route.path);
  const [title, setTitle] = React.useState(route.title);
  const [pathError, setPathError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  /**
   * The conflict NOTICE — about the last attempt, not about the dialog's
   * whole life.
   *
   * It used to be a one-way flag, raised by the first 409 and never lowered.
   * Everything it says then goes stale together: it tells the person to
   * compare their text against "what the server holds now, printed under the
   * field", and those lines hide themselves the moment the typed value
   * matches — so after the very edit the notice asks for, the notice is
   * pointing at something that is no longer on screen. It also outlived the
   * attempt, standing over a later failure that had nothing to do with a
   * conflict. So an edit retires it, and so does a new attempt.
   */
  const [conflict, setConflict] = React.useState(false);
  /** What the 409 said the address is now — shown next to what was typed. */
  const [serverNow, setServerNow] = React.useState<{ path: string; title: string } | null>(null);
  const [noChanges, setNoChanges] = React.useState(false);
  /**
   * A 409 happened in this dialog at least once. Deliberately NOT the notice
   * above: the empty-args branch needs the fact (an untouched field was
   * refilled from the server, so "save again" can have nothing left to send)
   * and the fact does not expire when the notice does.
   */
  const conflicted = React.useRef(false);
  const dismissConflictNotice = () => {
    setConflict(false);
    setServerNow(null);
  };
  /**
   * Which fields the person actually typed into. A conflict refills only the
   * OTHER ones: the server's value written over text someone is in the middle
   * of entering destroys it with nothing left on screen to recover it from.
   */
  const touched = React.useRef({ path: false, title: false });

  const warn = shouldWarnAboutRename(snapshot.path, route.status, path);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPathError(null);
    setFormError(null);
    dismissConflictNotice();
    const plan = planAddressSettingsSubmit({
      typedPath: path,
      typedTitle: title,
      saved: snapshot,
      sawConflict: conflicted.current,
    });
    // The keys are spelled out rather than built from `plan.code`, so
    // `validate:i18n` keeps seeing all four statically.
    if (plan.kind === "pathError") {
      setPathError(
        plan.code === "required"
          ? t("errors.required")
          : plan.code === "slash"
            ? t("errors.slash")
            : plan.code === "reserved"
              ? t("errors.reserved")
              : t("errors.invalid")
      );
      return;
    }
    if (plan.kind === "titleError") {
      setFormError(t("errors.titleRequired"));
      return;
    }
    if (plan.kind === "nothingLeftToSend") {
      setNoChanges(true);
      return;
    }
    if (plan.kind === "nothingToSend") {
      onClose();
      return;
    }
    const args: UpdateRouteArgs = {
      workspaceId,
      routeId: route.id,
      version: snapshot.version,
    };
    if (plan.path !== undefined) args.path = plan.path;
    if (plan.title !== undefined) args.title = plan.title;
    setNoChanges(false);
    try {
      await update.mutateAsync(args);
      // The address moved, so anything the editor is still saying about a
      // failed attempt on it is now about a state that no longer exists.
      onRouteChanged?.();
      onClose();
    } catch (err) {
      const code = pagesErrorCode(err);
      if (code === "route_path_taken") setPathError(t("errors.taken"));
      else if (code === "invalid_route_path")
        setPathError(invalidRoutePathMessageKey(args.path ?? path) === "reserved" ? t("errors.reserved") : t("errors.invalid"));
      else if (code === "route_version_conflict") {
        const actual = pagesConflictRoute(err);
        if (actual) {
          setSnapshot({
            path: actual.path,
            title: actual.title,
            version: actual.version,
          });
          if (!touched.current.path) setPath(actual.path);
          if (!touched.current.title) setTitle(actual.title);
          setServerNow({ path: actual.path, title: actual.title });
        }
        conflicted.current = true;
        setConflict(true);
        setNoChanges(false);
      } else if (pagesHttpStatus(err) === 404 && !isGatewayRouteMissing(err)) setFormError(t("errors.gone"));
      // Never the service's own prose: it says "Route", and this section
      // calls the thing an address everywhere else.
      else setFormError(t("errors.generic"));
    }
  };

  return (
    <UI.Box as="form" onSubmit={onSubmit} gap={4} noValidate data-testid="address-settings-form">
      <UI.Box gap={2}>
        <UI.FormControl.Field
          id="address-settings-path"
          label={t("path")}
          hint={t("pathHint")}
          error={pathError}
        >
          <UI.FormControl.Input
            data-testid="address-settings-path"
            value={path}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              touched.current.path = true;
              setNoChanges(false);
              dismissConflictNotice();
              setPath(e.target.value);
            }}
            placeholder="/about"
            autoComplete="off"
          />
        </UI.FormControl.Field>
        {serverNow && serverNow.path !== path ? (
          <UI.Text size="xs" variant="muted" data-testid="address-settings-path-server">
            {t("serverNow", { value: serverNow.path })}
          </UI.Text>
        ) : null}
      </UI.Box>
      {warn ? <AddressPathWarning from={snapshot.path} /> : null}
      <UI.Box gap={2}>
        <UI.FormControl.Field id="address-settings-title" label={t("pageTitle")}>
          <UI.FormControl.Input
            data-testid="address-settings-title"
            value={title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              touched.current.title = true;
              setNoChanges(false);
              dismissConflictNotice();
              setTitle(e.target.value);
            }}
            autoComplete="off"
          />
        </UI.FormControl.Field>
        {serverNow && serverNow.title !== title ? (
          <UI.Text size="xs" variant="muted" data-testid="address-settings-title-server">
            {t("serverNow", { value: serverNow.title })}
          </UI.Text>
        ) : null}
      </UI.Box>
      {conflict ? (
        <UI.Alert data-testid="address-settings-conflict">
          <UI.Text as="span" size="sm">
            {t("conflictNotice")}
          </UI.Text>
        </UI.Alert>
      ) : null}
      {noChanges ? (
        <UI.Alert data-testid="address-settings-nochanges">
          <UI.Text as="span" size="sm">
            {t("noChanges")}
          </UI.Text>
        </UI.Alert>
      ) : null}
      {formError ? (
        <UI.Alert variant="destructive" data-testid="address-settings-error">
          <UI.Text as="span" size="sm">
            {formError}
          </UI.Text>
        </UI.Alert>
      ) : null}
      <UI.Box direction="row" gap={2} wrap justify="end" fullWidth>
        <UI.Button type="button" variant="ghost" onClick={onClose} disabled={update.isPending}>
          {t("cancel")}
        </UI.Button>
        <UI.Button type="submit" disabled={update.isPending} data-testid="address-settings-save">
          {update.isPending ? t("saving") : t("save")}
        </UI.Button>
      </UI.Box>
    </UI.Box>
  );
}

/* --------------------------------------------------------------- delete */

/**
 * Deleting an address, and what that does to a visitor — the canvas's
 * DeleteConsequences.
 *
 * Only ONE consequence line about pages: pages-service holds a unique index
 * on `route_id` (uq_pages_route), so an address has at most one page and the
 * canvas's plural branch can never be reached.
 *
 * The reversible alternative is the point of this dialog, so a successful
 * unpublish CLOSES it: the person who picked the safe way is done, and
 * leaving them in front of a red "Delete address" (with the alternative now
 * gone from under the cursor) would be the opposite of what it is for.
 */
export function DeleteAddressDialog({
  open,
  onOpenChange,
  workspaceId,
  route,
  pageId,
  onDeleted,
  onRouteChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  route: PagesRoute;
  pageId?: string | null;
  onDeleted: () => void;
  /** A write to this address landed — see AddressActions. */
  onRouteChanged?: () => void;
}) {
  const tDelete = useTranslations("pages.delete");
  // The admin's one delete dialog (EP-186, pattern 4). The body is split out
  // for the same two reasons as the settings form: it is mounted only while
  // the dialog is open, and a portal renders nothing under react-dom/server,
  // which is where the smoke pins the button order and the alternative.
  return (
    <DeleteDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={tDelete("title", { path: route.path })}
      description={tDelete("description")}
    >
      <DeleteAddressBody
        workspaceId={workspaceId}
        route={route}
        pageId={pageId}
        onClose={() => onOpenChange(false)}
        onDeleted={onDeleted}
        onRouteChanged={onRouteChanged}
      />
    </DeleteDialogShell>
  );
}

export function DeleteAddressBody({
  workspaceId,
  route,
  pageId,
  onClose,
  onDeleted,
  onRouteChanged,
}: {
  workspaceId: string;
  route: PagesRoute;
  pageId?: string | null;
  onClose: () => void;
  onDeleted: () => void;
  /** A write to this address landed — see AddressActions. */
  onRouteChanged?: () => void;
}) {
  const tDelete = useTranslations("pages.delete");
  const remove = useDeleteAddress();
  const setStatus = useSetRouteStatus();
  const { pagesPublish } = useProductFeatures();
  const [error, setError] = React.useState<string | null>(null);
  const busy = remove.isPending || setStatus.isPending;

  const onUnpublish = async () => {
    setError(null);
    try {
      await setStatus.mutateAsync({
        workspaceId,
        routeId: route.id,
        version: route.version,
        status: "draft",
      });
      // Same reason as the settings form: the address is off the site now,
      // so an older complaint about it in the editor header is stale.
      onRouteChanged?.();
      onClose();
    } catch {
      setError(tDelete("errors.unpublish"));
    }
  };

  const onConfirm = async () => {
    setError(null);
    try {
      await remove.mutateAsync({ workspaceId, routeId: route.id, pageId });
      onClose();
      onDeleted();
    } catch {
      setError(tDelete("errors.generic"));
    }
  };

  return (
    <DeleteDialogBody
      consequence={
        <UI.Box direction="column" gap={2} data-testid="delete-consequences">
          <UI.Box direction="row" align="start" gap={2}>
            <EyeOff size={16} aria-hidden="true" className="mt-0.5 shrink-0 opacity-60" />
            <UI.Text size="sm">{tDelete("consequence.address")}</UI.Text>
          </UI.Box>
          <UI.Box direction="row" align="start" gap={2}>
            <FileText size={16} aria-hidden="true" className="mt-0.5 shrink-0 opacity-60" />
            <UI.Text size="sm">{tDelete("consequence.page")}</UI.Text>
          </UI.Box>
          {/* The rule's own sentence and its link (SDL-666). */}
          <PolicyLine stringKey="item_delete_consequence" target="deletion" testId="delete-policy-line" />
        </UI.Box>
      }
      pending={busy}
      error={error}
      onCancel={onClose}
      onConfirm={() => void onConfirm()}
      confirmLabel={tDelete("confirm")}
      pendingLabel={remove.isPending ? tDelete("deleting") : tDelete("confirm")}
      // The reversible alternative sits between Cancel and Delete — and the
      // body keeps all three in a Box, not Dialog.Footer, which reverses the
      // order below 640px: the reversible button stays ABOVE the irreversible one.
      extraActions={
        route.status === "published" ? (
          <UI.Button variant="outline" onClick={onUnpublish} disabled={busy} data-testid="delete-unpublish">
            <EyeOff size={16} aria-hidden="true" />
            {setStatus.isPending ? tDelete("unpublishing") : tDelete("unpublish")}
          </UI.Button>
        ) : null
      }
    >
      {/* The alternative is a lie on an address that is not on the site:
          there is nothing to take off it. */}
      {route.status === "published" ? (
        <UI.Alert data-testid="delete-alternative">
          <UI.Box direction="column" gap={1}>
            <UI.Text as="span" size="sm" weight="medium">
              {tDelete("alternative.title")}
            </UI.Text>
            <UI.Text as="span" size="sm">
              {/* "publish it back any time" is a promise only where publishing is on (SDL-636). */}
              {pagesPublish ? tDelete("alternative.hint") : tDelete("alternative.hintNoPublish")}
            </UI.Text>
          </UI.Box>
        </UI.Alert>
      ) : null}
    </DeleteDialogBody>
  );
}

  /* ----------------------------------------------------------------- menu */

  /**
   * The entry point to both dialogs.
   *
   * It is mounted in the editor header AND on the fallback screens of
   * /pages/[routeId] — "the address has no page", "the document will not
   * open". Those screens render INSTEAD of the editor, so without this the one
   * address that actually needs deleting (a broken one, which a failed create
   * with a failed rollback leaves behind) could not be deleted from anywhere:
   * the list row links to the editor and nothing else does.
   */
  export function AddressActions({
    workspaceId,
    route,
    pageId,
    onGone,
    onRouteChanged,
    trigger,
    leadingItems,
  }: {
    workspaceId: string;
    route: PagesRoute;
    pageId?: string | null;
    /** The address is gone — take the person back to the list. */
    onGone: () => void;
    /**
     * A write to this address landed (renamed, unpublished from the delete
     * dialog). The editor's header keeps its own red notice about a failed
     * publish, and that notice is about ONE state of ONE address: once the
     * address moves, the notice describes something that is no longer true,
     * and the person reads it as a complaint about the action they just
     * completed successfully. The dialogs say when they moved it.
     */
    onRouteChanged?: () => void;
    /**
     * The menu's trigger (EP-187, layer 5): the editor frame's ▾ next to the
     * name. Must carry `data-testid="studio-address-menu"`. Absent → the "⋯"
     * icon button the fallback screens keep.
     */
    trigger?: React.ReactElement;
    /** Items above the address's own (the editor frame: the full address, the site). */
    leadingItems?: React.ReactNode;
  }) {
    const tMenu = useTranslations("pages.menu");
    const [settingsOpen, setSettingsOpen] = React.useState(false);
    const [deleteOpen, setDeleteOpen] = React.useState(false);

    return (
      <>
        <UI.Menu.Root>
          <UI.Menu.Trigger asChild>
            {trigger ?? (
              <UI.Button variant="ghost" size="sm" aria-label={tMenu("label")} data-testid="studio-address-menu">
                <MoreHorizontal size={16} aria-hidden="true" />
              </UI.Button>
            )}
          </UI.Menu.Trigger>
          <UI.Menu.Content align={trigger ? "start" : "end"}>
            {leadingItems}
            <UI.Menu.Item onSelect={() => setSettingsOpen(true)} data-testid="address-menu-settings">
              <Settings2 size={14} aria-hidden="true" />
              {tMenu("settings")}
            </UI.Menu.Item>
            <UI.Menu.Item
              variant="destructive"
              onSelect={() => setDeleteOpen(true)}
              data-testid="address-menu-delete"
            >
              <Trash2 size={14} aria-hidden="true" />
              {tMenu("delete")}
            </UI.Menu.Item>
          </UI.Menu.Content>
        </UI.Menu.Root>
        <AddressSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          workspaceId={workspaceId}
          route={route}
          onRouteChanged={onRouteChanged}
        />
        <DeleteAddressDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          workspaceId={workspaceId}
          route={route}
          pageId={pageId}
          onDeleted={onGone}
          onRouteChanged={onRouteChanged}
        />
      </>
    );
  }
