import type { Meta, StoryObj } from "@storybook/react-vite";

import { StatusIndicator } from "./status-indicator";

const meta = {
  title: "Admin/StatusIndicator",
  component: StatusIndicator,
} satisfies Meta<typeof StatusIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Семантические тона на токенах темы — без захардкоженных цветов. */
export const Tones: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      {(["neutral", "success", "warning", "error", "info"] as const).map((tone) => (
        <StatusIndicator key={tone} tone={tone}>
          {tone}
        </StatusIndicator>
      ))}
    </div>
  ),
};

/** pulse — для «идёт публикация» и прочих переходных состояний. */
export const Pulsing: Story = {
  render: () => (
    <StatusIndicator tone="warning" pulse>
      publishing…
    </StatusIndicator>
  ),
};
