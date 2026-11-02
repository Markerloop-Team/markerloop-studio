import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoldIcon, ItalicIcon } from "lucide-react";

import { Toggle } from "./toggle";

const meta = {
  title: "Components/Forms/Toggle",
  component: Toggle,
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** default/outline × pressed/disabled; размеры sm/default/lg. */
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Toggle aria-label="Bold">
          <BoldIcon />
        </Toggle>
        <Toggle defaultPressed aria-label="Italic">
          <ItalicIcon />
        </Toggle>
        <Toggle disabled aria-label="Disabled">
          <BoldIcon />
        </Toggle>
      </div>
      <div className="flex items-center gap-2">
        <Toggle variant="outline" aria-label="Bold outline">
          <BoldIcon />
        </Toggle>
        <Toggle variant="outline" defaultPressed aria-label="Pressed outline">
          Pressed
        </Toggle>
        <Toggle variant="outline" disabled aria-label="Disabled outline">
          Disabled
        </Toggle>
      </div>
      <div className="flex items-center gap-2">
        <Toggle variant="outline" size="sm">
          sm
        </Toggle>
        <Toggle variant="outline" size="default">
          default
        </Toggle>
        <Toggle variant="outline" size="lg">
          lg
        </Toggle>
      </div>
    </div>
  ),
};
