import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import { EmptyState } from "./empty-state";

const meta = {
  title: "Components/Primitives/EmptyState",
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** text-muted-foreground, паддинги и выравнивание — пропсами. */
export const Default: Story = {
  render: () => (
    <EmptyState>
      <p>No blocks yet.</p>
    </EmptyState>
  ),
};

export const WithAction: Story = {
  render: () => (
    <EmptyState paddingY={10}>
      <p className="mb-3">No pages yet.</p>
      <Button size="sm">Create page</Button>
    </EmptyState>
  ),
};

export const AlignStart: Story = {
  render: () => (
    <EmptyState align="start" paddingY={4}>
      <p>Nothing to show for this filter.</p>
    </EmptyState>
  ),
};
