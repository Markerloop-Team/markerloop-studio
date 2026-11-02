"use client";

import * as React from "react";
import * as UI from "@markerloop/ui/ui";

/**
 * Settings card and row of the live workspace settings (SDL-615).
 *
 * The same composition as the canvas `_canvas/chrome.tsx` SettingsCard /
 * SettingsRow (SDL-599/SDL-600): the live screen must match the canvas the
 * owner approved, and `app/design-system` is not importable from a widget.
 * The layout notes (the `min-w-[12rem]` floor, the `div` description) are
 * on the canvas originals.
 */
export function SettingsRow({
  title,
  description,
  action,
  testid,
  data,
}: {
  title: string;
  description: React.ReactNode;
  action: React.ReactNode;
  testid: string;
  data?: Record<`data-${string}`, string>;
}) {
  return (
    <UI.Box
      direction="row"
      align="center"
      gap={3}
      wrap
      className="px-4 py-3"
      data-testid={testid}
      {...data}
    >
      <UI.Box direction="column" className="min-w-[12rem]" grow>
        <UI.Text as="span" size="sm" weight="medium">
          {title}
        </UI.Text>
        <UI.Text as="div" size="sm" variant="muted">
          {description}
        </UI.Text>
      </UI.Box>
      {action}
    </UI.Box>
  );
}

export function SettingsCard({
  title,
  description,
  children,
  testid,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testid: string;
}) {
  const rows = React.Children.toArray(children);
  return (
    <UI.Card padding="none" fullWidth data-testid={testid} className="gap-4 py-4">
      <UI.Card.Header className="px-4">
        <UI.Card.Title>{title}</UI.Card.Title>
        {description ? (
          <UI.Card.Description>{description}</UI.Card.Description>
        ) : null}
      </UI.Card.Header>
      <UI.Card.Content className="p-0">
        {rows.map((row, index) => (
          <UI.Box
            key={index}
            className={index > 0 ? "border-t border-border" : undefined}
          >
            {row}
          </UI.Box>
        ))}
      </UI.Card.Content>
    </UI.Card>
  );
}
