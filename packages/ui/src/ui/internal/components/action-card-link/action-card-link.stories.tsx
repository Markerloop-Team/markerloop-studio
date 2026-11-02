import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText, Palette, Settings } from "lucide-react";

import { ActionCardLink } from "./action-card-link";

const meta = {
  title: "Components/Widgets/ActionCardLink",
  component: ActionCardLink,
} satisfies Meta<typeof ActionCardLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * next/link в Storybook подменён plain-<a> моком (.storybook/next-link-mock).
 * hover:bg-accent на Card, focus-visible ring на обёртке-ссылке — Tab-ом.
 */
export const Grid: Story = {
  render: () => (
    <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <ActionCardLink
        href="/studio/pages"
        title="Pages"
        description="Create and edit site pages"
        icon={FileText}
      />
      <ActionCardLink
        href="/studio/theme"
        title="Theme"
        description="Tokens, colors and typography"
        icon={Palette}
      />
      <ActionCardLink
        href="/studio/settings"
        title="Settings"
        description="Domain and metadata"
        icon={Settings}
      />
      <ActionCardLink href="/studio/blocks" title="Blocks" />
    </div>
  ),
};
