import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "./separator";

const meta = {
  title: "Components/Primitives/Separator",
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** bg-border; горизонтальная и вертикальная ориентации. */
export const Orientations: Story = {
  render: () => (
    <div className="max-w-sm space-y-4">
      <p className="text-sm">Above the line</p>
      <Separator />
      <p className="text-sm">Below the line</p>
      <div className="flex h-6 items-center gap-4 text-sm">
        <span>Pages</span>
        <Separator orientation="vertical" />
        <span>Blocks</span>
        <Separator orientation="vertical" />
        <span>Theme</span>
      </div>
    </div>
  ),
};
