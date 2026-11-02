"use client";

// "New address" (SDL-605): creates the route and the page living at it, then
// opens the editor. Two requests behind one button — see useCreateAddress for
// the rollback when the second one fails.
//
// Plain controlled inputs in FormControl.Field rather than the kit's
// Field.* form: Field.Label needs a react-hook-form provider around it
// (memory: sunday-sauna forms need FormProvider), and two fields with two
// server-side error codes do not earn one.

import * as React from "react";
import { useRouter } from "next/navigation";
import * as UI from "@markerloop/ui/ui";

import { useTranslations } from "@/shared/hooks";
import { hasReservedAddressChars, invalidRoutePathMessageKey, pagesErrorCode, useCreateAddress } from "@/entities/pages";
import { useProductFeatures } from "@/shared/config/product-features-context";

/**
 * What pages-service NormalizeRoutePath would refuse, said before the request:
 * an empty address, one that does not start with "/", one carrying ":" or "{"
 * (SDL-690 — reserved for route parameters, written as [slug]).
 */
export function checkAddressPath(raw: string): "required" | "slash" | "reserved" | null {
  const path = raw.trim();
  if (!path) return "required";
  if (!path.startsWith("/")) return "slash";
  if (hasReservedAddressChars(path)) return "reserved";
  return null;
}

export function CreateAddressDialog({
  open,
  onOpenChange,
  workspaceId,
  editorHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  editorHref: (routeId: string) => string;
}) {
  const t = useTranslations("pages.create");
  const router = useRouter();
  const create = useCreateAddress();
  const { pagesPublish } = useProductFeatures();
  const [path, setPath] = React.useState("/");
  const [title, setTitle] = React.useState("");
  const [pathError, setPathError] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setPath("/");
    setTitle("");
    setPathError(null);
    setFormError(null);
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPathError(null);
    setFormError(null);
    const local = checkAddressPath(path);
    if (local) {
      // Spelled out, not `errors.${local}`, so validate:i18n sees every key.
      setPathError(
        local === "required" ? t("errors.required") : local === "slash" ? t("errors.slash") : t("errors.reserved")
      );
      return;
    }
    if (!title.trim()) {
      setFormError(t("errors.titleRequired"));
      return;
    }
    try {
      const { route } = await create.mutateAsync({ workspaceId, path: path.trim(), title: title.trim() });
      onOpenChange(false);
      router.push(editorHref(route.id));
    } catch (err) {
      const code = pagesErrorCode(err);
      if (code === "route_path_taken") setPathError(t("errors.taken"));
      else if (code === "invalid_route_path")
        setPathError(invalidRoutePathMessageKey(path) === "reserved" ? t("errors.reserved") : t("errors.invalid"));
      else setFormError(err instanceof Error && err.message ? err.message : t("errors.generic"));
    }
  };

  return (
    <UI.Dialog.Root open={open} onOpenChange={onOpenChange}>
      <UI.Dialog.Content maxWidth={460} data-testid="pages-create-dialog">
        <UI.Dialog.Header>
          <UI.Dialog.Title>{t("title")}</UI.Dialog.Title>
          {/* "You can publish it later" is a promise only where publishing is on (SDL-636). */}
          <UI.Dialog.Description>{pagesPublish ? t("description") : t("descriptionNoPublish")}</UI.Dialog.Description>
        </UI.Dialog.Header>
        <UI.Box as="form" onSubmit={onSubmit} gap={4} noValidate>
          {/* The error line is `#pages-create-path-error` (the wrapper
              names it after the control id). */}
          <UI.FormControl.Field
            id="pages-create-path"
            label={t("path")}
            hint={t("pathHint")}
            error={pathError}
          >
            <UI.FormControl.Input
              data-testid="pages-create-path"
              value={path}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPath(e.target.value)}
              placeholder="/about"
              autoComplete="off"
            />
          </UI.FormControl.Field>
          <UI.FormControl.Field id="pages-create-title" label={t("pageTitle")}>
            <UI.FormControl.Input
              data-testid="pages-create-title"
              value={title}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
              placeholder={t("pageTitlePlaceholder")}
              autoComplete="off"
            />
          </UI.FormControl.Field>
          {formError ? (
            <UI.Alert variant="destructive" data-testid="pages-create-error">
              {formError}
            </UI.Alert>
          ) : null}
          <UI.Dialog.Footer>
            <UI.Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              {t("cancel")}
            </UI.Button>
            <UI.Button type="submit" disabled={create.isPending} data-testid="pages-create-submit">
              {create.isPending ? t("creating") : t("submit")}
            </UI.Button>
          </UI.Dialog.Footer>
        </UI.Box>
      </UI.Dialog.Content>
    </UI.Dialog.Root>
  );
}
