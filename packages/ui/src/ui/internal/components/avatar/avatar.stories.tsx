import type { Meta, StoryObj } from "@storybook/react-vite";

import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

const meta = {
  title: "Components/Primitives/Avatar",
  component: Avatar,
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Три размера; fallback — bg-muted, пока изображение не загрузилось. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {([8, 10, 12] as const).map((size) => (
        <Avatar key={size} size={size}>
          <AvatarImage alt="" src="/broken-on-purpose.png" />
          <AvatarFallback>SS</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};
