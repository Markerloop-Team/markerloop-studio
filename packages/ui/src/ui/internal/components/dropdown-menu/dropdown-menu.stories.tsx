import type { Meta, StoryObj } from "@storybook/react-vite";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246/247). `DropdownMenu*` is not exported — the
// access path is `Menu.*`, which is also what the title advertises.
import { Button, Menu } from "../../../index";

const meta = {
  title: "Components/Overlays/Menu",
  component: Menu.Root,
} satisfies Meta<typeof Menu.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

/** highlight (focus:bg-accent — паттерн Radix: фокус двигается по
 * пунктам), destructive, disabled, active. */
export const States: Story = {
  render: () => (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="outline">Open menu</Button>
      </Menu.Trigger>
      <Menu.Content>
        <Menu.Label>Section</Menu.Label>
        <Menu.Item>Default item</Menu.Item>
        <Menu.Item active>Active item</Menu.Item>
        <Menu.Item disabled>Disabled item</Menu.Item>
        <Menu.Separator />
        <Menu.Item variant="destructive">Destructive item</Menu.Item>
      </Menu.Content>
    </Menu.Root>
  ),
};
