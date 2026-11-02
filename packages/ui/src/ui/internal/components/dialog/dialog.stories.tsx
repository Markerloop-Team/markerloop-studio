import type { Meta, StoryObj } from "@storybook/react-vite";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246/247). `DialogContent` and friends are not
// exported; the access path is `Dialog.*`. Importing through the barrel also
// removes a name collision: `Dialog` from `./dialog` is the Radix root, while
// the published `Dialog` is the kit object whose `.Root` is that same root.
import { Button, Dialog } from "../../../index";

const meta = {
  title: "Components/Overlays/Dialog",
  component: Dialog.Root,
} satisfies Meta<typeof Dialog.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Оверлей — токен bg-overlay; close-кнопка — focus-visible (Tab). */
export const Default: Story = {
  render: () => (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="outline">Open dialog</Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Dialog title</Dialog.Title>
          <Dialog.Description>Muted description text.</Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer marginTop={4}>
          <Button variant="outline">Cancel</Button>
          <Button>Confirm</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};

export const DestructiveDescription: Story = {
  render: () => (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button variant="destructive">Delete…</Button>
      </Dialog.Trigger>
      <Dialog.Content showCloseButton={false}>
        <Dialog.Header>
          <Dialog.Title>Delete item</Dialog.Title>
          <Dialog.Description tone="destructive">
            This action cannot be undone.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Footer marginTop={4}>
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive">Delete</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  ),
};
