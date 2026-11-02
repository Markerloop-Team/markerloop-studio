"use client";

// «Delete account» confirmation (SDL-743, EP-142): one screen, no wizard.
// The consequence is the product rules' own sentence
// (`account_delete_consequence`, packages/policy/strings.json); the person
// types their username to unlock the button. 409 keeps the dialog open with
// the workspaces to delete first, each linked to its settings; any other
// failure keeps it open with a sentence; 204 hands over to `onDeleted`
// (sign-out and the way to /login belong to the caller).

import { useEffect, useId, useState, type ChangeEvent } from "react";
import NextLink from "next/link";
import { useMutation } from "@tanstack/react-query";
import * as UI from "@markerloop/ui/ui";
import { Box, Text } from "@markerloop/ui/ui";

import { PolicyLine } from "@/entities/policy/ui/policy-line";
import { useTranslations } from "@/shared/hooks";

import {
  confirmationMatches,
  deleteAccountFailureOf,
  deleteMyAccount,
  workspaceSettingsHref,
  type DeleteAccountFailure,
} from "./model";

export interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The username to type; null while the profile is not loaded. */
  username: string | null;
  /** Runs after 204. The dialog stays busy until it resolves (or navigates). */
  onDeleted: () => Promise<void> | void;
  /** The request; tests pass a stub. Defaults to DELETE /v1/users/my. */
  request?: () => Promise<void>;
}

export function DeleteAccountDialog({
  open,
  onOpenChange,
  username,
  onDeleted,
  request = deleteMyAccount,
}: DeleteAccountDialogProps) {
  const t = useTranslations("accountDelete");
  const tCommon = useTranslations("common");
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [failure, setFailure] = useState<DeleteAccountFailure | null>(null);
  const [leaving, setLeaving] = useState(false);

  const mutation = useMutation({
    mutationFn: request,
    retry: false,
    onMutate: () => setFailure(null),
    onSuccess: async () => {
      setLeaving(true);
      await onDeleted();
    },
    onError: (error) => setFailure(deleteAccountFailureOf(error)),
  });

  // A reopened dialog asks again and forgets the last answer.
  useEffect(() => {
    if (open) {
      setTyped("");
      setFailure(null);
    }
  }, [open]);

  const busy = mutation.isPending || leaving;
  const confirmed = confirmationMatches(typed, username);

  return (
    <UI.Dialog.Alert.Root
      open={open}
      onOpenChange={(next) => {
        // Not closable while the request or the sign-out runs.
        if (!busy) onOpenChange(next);
      }}
    >
      {/* 100dvh, not vh: on a phone the browser bar would push the buttons
          under the fold; a long workspace list scrolls inside the dialog. */}
      <UI.Dialog.Alert.Content
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        data-testid="account-delete-dialog"
      >
        <UI.Dialog.Alert.Header>
          <UI.Dialog.Alert.Title>{t("dialogTitle")}</UI.Dialog.Alert.Title>
          <UI.Dialog.Alert.Description>{t("dialogDescription")}</UI.Dialog.Alert.Description>
        </UI.Dialog.Alert.Header>

        <DeleteAccountBody
          username={username}
          typed={typed}
          onTyped={setTyped}
          inputId={inputId}
          failure={failure}
          disabled={busy}
        />

        {/* Buttons in a Box, not the Footer's reversed column: on a phone the
            irreversible action must not land above Cancel. */}
        <Box direction="row" gap={2} wrap className="justify-end">
          <UI.Dialog.Alert.Cancel disabled={busy} asChild>
            <UI.Button type="button" variant="outline" disabled={busy} data-testid="account-delete-cancel">
              {tCommon("cancel") as string}
            </UI.Button>
          </UI.Dialog.Alert.Cancel>
          <UI.Button
            type="button"
            variant="destructive"
            data-testid="account-delete-confirm"
            disabled={busy || !confirmed}
            onClick={() => {
              if (confirmed && !busy) mutation.mutate();
            }}
          >
            {busy ? t("deleting") : t("confirm")}
          </UI.Button>
        </Box>
      </UI.Dialog.Alert.Content>
    </UI.Dialog.Alert.Root>
  );
}

/**
 * The dialog's body as a component of its own: the kit's Dialog content is
 * portalled and renders nothing under react-dom/server, so this is what
 * smoke:account-delete renders in every state.
 */
export function DeleteAccountBody({
  username,
  typed,
  onTyped,
  inputId,
  failure,
  disabled,
}: {
  username: string | null;
  typed: string;
  onTyped: (value: string) => void;
  inputId: string;
  failure: DeleteAccountFailure | null;
  disabled?: boolean;
}) {
  const t = useTranslations("accountDelete");
  return (
    <Box direction="column" gap={3} data-testid="account-delete-body">
      <PolicyLine
        stringKey="account_delete_consequence"
        target="deletion"
        testId="account-delete-policy-line"
      />

      {failure ? <DeleteAccountFailureNotice failure={failure} /> : null}

      <Box direction="column" gap={1}>
        <label htmlFor={inputId}>
          <Text as="span" size="sm">
            {username ? t("confirmLabel", { name: username }) : t("confirmLabelNoName")}
          </Text>
        </label>
        <UI.FormControl.Input
          id={inputId}
          data-testid="account-delete-confirm-name"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t("confirmPlaceholder")}
          value={typed}
          disabled={disabled || !username}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onTyped(e.target.value)}
        />
      </Box>
    </Box>
  );
}

function DeleteAccountFailureNotice({ failure }: { failure: DeleteAccountFailure }) {
  const t = useTranslations("accountDelete");
  if (failure.kind === "blocked") {
    return (
      <UI.Alert variant="destructive" data-testid="account-delete-blocked">
        <Box direction="column" gap={2}>
          <Text as="span" size="sm" weight="medium">
            {t("blockedTitle")}
          </Text>
          <Text as="span" size="sm">
            {t("blockedDescription")}
          </Text>
          {failure.workspaces.length > 0 ? (
            <Box as="ul" direction="column" gap={1} className="pl-5 list-disc">
              {failure.workspaces.map((ws) => (
                <li key={ws.id} className="min-w-0">
                  <NextLink
                    href={workspaceSettingsHref(ws.id)}
                    className="text-sm font-medium underline underline-offset-4 break-all"
                    data-testid="account-delete-blocking-workspace"
                    data-workspace-id={ws.id}
                  >
                    {ws.name}
                  </NextLink>
                </li>
              ))}
            </Box>
          ) : null}
        </Box>
      </UI.Alert>
    );
  }
  const message =
    failure.kind === "incomplete"
      ? t("errorIncomplete")
      : failure.kind === "unavailable"
        ? t("errorUnavailable")
        : t("errorGeneric");
  return (
    <UI.Alert variant="destructive" data-testid="account-delete-error" data-failure={failure.kind}>
      <Text as="span" size="sm">
        {message}
      </Text>
    </UI.Alert>
  );
}
