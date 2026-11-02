import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

const meta = {
  title: "Components/Forms/ToggleGroup",
  component: ToggleGroup,
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** single-выбор (сегментный контрол), outline. */
export const Single: Story = {
  render: () => (
    <ToggleGroup type="single" defaultValue="center" variant="outline">
      <ToggleGroupItem value="left" aria-label="Align left">
        <AlignLeftIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <AlignCenterIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <AlignRightIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};

/** multiple-выбор + disabled item. */
export const Multiple: Story = {
  render: () => (
    <ToggleGroup type="multiple" defaultValue={["a"]}>
      <ToggleGroupItem value="a">Draft</ToggleGroupItem>
      <ToggleGroupItem value="b">Published</ToggleGroupItem>
      <ToggleGroupItem value="c" disabled>
        Archived
      </ToggleGroupItem>
    </ToggleGroup>
  ),
};
