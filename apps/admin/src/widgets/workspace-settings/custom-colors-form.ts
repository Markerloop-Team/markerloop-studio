import type { UseFormReturn } from "react-hook-form";

import { removeCustomColor, type CustomColor, type SiteTheme } from "@/entities/site-theme";

/**
 * Removes a custom colour from the theme form (SDL-950). The card keys its
 * rows by `key` but names the fields by index, so the removed row's errors
 * would land on the next colour: the list's errors are dropped and ONLY the
 * remaining rows are checked again, by their explicit paths. A plain
 * `trigger("customColors")` right after `setValue` still sees the removed
 * row's fields registered (they unmount only on the next render) and, when
 * the last colour goes, leaves `customColors.0.label` as an error that the
 * next added colour then shows (review of !402).
 */
export function removeCustomColorFromForm(form: UseFormReturn<SiteTheme>, colors: readonly CustomColor[], key: string): void {
  const next = removeCustomColor(colors, key);
  form.setValue("customColors", next, { shouldDirty: true });
  form.clearErrors("customColors");
  const paths = next.flatMap(
    (_, i) => [`customColors.${i}.label`, `customColors.${i}.light`, `customColors.${i}.dark`] as const
  );
  if (paths.length > 0) void form.trigger(paths);
}
