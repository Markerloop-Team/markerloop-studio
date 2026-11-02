import type { Meta, StoryObj } from "@storybook/react-vite";

import { ScrollArea, ScrollBar } from "./scroll-area";
import { Separator } from "../separator/separator";

const meta = {
  title: "Components/Primitives/ScrollArea",
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Вертикальный скролл в ограниченной колонке. */
export const Vertical: Story = {
  render: () => (
    <ScrollArea className="h-56 w-48 rounded-md border">
      <div className="p-3">
        <p className="mb-2 text-sm font-medium">Pages</p>
        {Array.from({ length: 30 }, (_, i) => `page-${i + 1}`).map((tag) => (
          <div key={tag}>
            <div className="py-1.5 text-sm">{tag}</div>
            <Separator />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

/** Горизонтальный скролл — явный ScrollBar orientation="horizontal". */
export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-72 rounded-md border whitespace-nowrap">
      <div className="flex w-max gap-3 p-3">
        {Array.from({ length: 12 }, (_, i) => `page-${i + 1}`).map((tag) => (
          <div
            key={tag}
            className="flex h-20 w-28 shrink-0 items-center justify-center rounded-md bg-muted text-sm"
          >
            {tag}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  ),
};
