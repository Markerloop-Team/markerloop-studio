import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../../internal/components/button";
import { SaveStatus } from "../save-status/save-status";
import { UrlChip } from "../url-chip/url-chip";
import { DocHeader } from "./doc-header";

const meta = {
  title: "Admin/DocHeader",
  component: DocHeader,
} satisfies Meta<typeof DocHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Полная форма тулбара документа: Back · кикер · mono-имя · живой
 * статус (children) · url-чипы справа. Всё состояние — слоты хоста.
 */
export const Full: Story = {
  render: () => (
    <DocHeader
      back={
        <Button variant="ghost" size="xs">
          ← Back
        </Button>
      }
      kicker="Page"
      title="pricing"
      actions={
        <>
          <UrlChip href="#" title="Open the public page">
            /pricing
          </UrlChip>
          <UrlChip href="#" title="Preview page">
            preview
          </UrlChip>
        </>
      }
    >
      <SaveStatus state="saved" />
      <span className="text-muted-foreground font-mono text-[11.5px]">
        etag·pg-3f9a…
      </span>
    </DocHeader>
  ),
};

/** Минимальная форма: только имя документа. */
export const Minimal: Story = {
  render: () => <DocHeader title="untitled" />,
};

/** Длинное имя обрезается многоточием, тулбар остаётся однострочным. */
export const LongTitleTruncates: Story = {
  render: () => (
    <div className="w-96">
      <DocHeader
        back={
          <Button variant="ghost" size="xs">
            ← Back
          </Button>
        }
        kicker="Component"
        title="hero-with-a-very-long-descriptive-component-name-that-truncates"
      >
        <SaveStatus state="unsaved" />
      </DocHeader>
    </div>
  ),
};
