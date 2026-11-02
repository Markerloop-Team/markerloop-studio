import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import { Button } from "../button/button";

const meta = {
  title: "Components/Overlays/Tooltip",
  component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** hover/focus по кнопке; open-вариант закреплён для визуальной приёмки. */
export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <div className="flex items-center gap-6 p-10">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>Tooltip text</TooltipContent>
        </Tooltip>
        <Tooltip open>
          <TooltipTrigger asChild>
            <Button variant="outline">Always open</Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Pinned tooltip</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  ),
};
