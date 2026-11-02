"use client";

// One publish mark (EP-186, layer 3, pattern 7): the state of a publication in
// the same three words wherever it is shown — the page editor's header, the
// address list, the view screen and the site theme.

import * as React from "react";
import { StatusIndicator } from "@markerloop/ui/ui/admin";

import { useTranslations } from "@/shared/hooks";

export type PublishMarkState = "published" | "notPublished" | "unpublishedChanges";

const TONE: Record<PublishMarkState, "success" | "neutral" | "warning"> = {
  published: "success",
  notPublished: "neutral",
  unpublishedChanges: "warning",
};

/** The mark's state from the two facts every publication has. */
export function publishMarkState(published: boolean, behind: boolean): PublishMarkState {
  if (!published) return "notPublished";
  return behind ? "unpublishedChanges" : "published";
}

export function usePublishMarkWord(): (state: PublishMarkState) => string {
  const t = useTranslations("common.publishMark");
  return (state) => t(state);
}

export function PublishMark({
  state,
  children,
  ...props
}: { state: PublishMarkState; children?: React.ReactNode } & Omit<
  React.ComponentProps<typeof StatusIndicator>,
  "tone" | "children"
>) {
  const word = usePublishMarkWord();
  return (
    <StatusIndicator tone={TONE[state]} data-state={state} {...props}>
      {children ?? word(state)}
    </StatusIndicator>
  );
}
