import type { Meta, StoryObj } from "@storybook/react-vite";

import { Skeleton } from "./skeleton";

const meta = {
  title: "Components/Primitives/Skeleton",
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** bg-accent + animate-pulse; размеры пропсами width/height без className. */
export const Default: Story = {
  render: () => (
    <div className="max-w-sm space-y-3">
      <Skeleton width="full" height={24} />
      <Skeleton width={240} height={16} />
      <Skeleton width={160} height={16} />
      <div className="flex items-center gap-3 pt-2">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton width="full" height={12} />
          <Skeleton width={120} height={12} />
        </div>
      </div>
    </div>
  ),
};
