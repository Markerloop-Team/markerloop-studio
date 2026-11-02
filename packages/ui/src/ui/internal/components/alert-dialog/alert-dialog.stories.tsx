import type { Meta, StoryObj } from "@storybook/react-vite";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246/247). `AlertDialog*` is not exported — the
// access path is `Dialog.Alert.*`, which is also what the title advertises.
import { Button, Dialog } from "../../../index";

const meta = {
  title: "Components/Overlays/Dialog.Alert",
  component: Dialog.Alert.Root,
} satisfies Meta<typeof Dialog.Alert.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Оверлей — токен bg-overlay; Cancel/Action — buttonVariants, фокус Tab-ом. */
export const Default: Story = {
  render: () => (
    <Dialog.Alert.Root>
      <Dialog.Alert.Trigger asChild>
        <Button variant="outline">Show alert</Button>
      </Dialog.Alert.Trigger>
      <Dialog.Alert.Content>
        <Dialog.Alert.Header>
          <Dialog.Alert.Title>Are you sure?</Dialog.Alert.Title>
          <Dialog.Alert.Description>
            This will overwrite the draft with the published version.
          </Dialog.Alert.Description>
        </Dialog.Alert.Header>
        <Dialog.Alert.Footer>
          <Dialog.Alert.Cancel>Cancel</Dialog.Alert.Cancel>
          <Dialog.Alert.Action>Continue</Dialog.Alert.Action>
        </Dialog.Alert.Footer>
      </Dialog.Alert.Content>
    </Dialog.Alert.Root>
  ),
};

/** Деструктив: Action принимает variant из buttonVariants. */
export const Destructive: Story = {
  render: () => (
    <Dialog.Alert.Root>
      <Dialog.Alert.Trigger asChild>
        <Button variant="destructive">Delete page…</Button>
      </Dialog.Alert.Trigger>
      <Dialog.Alert.Content>
        <Dialog.Alert.Header>
          <Dialog.Alert.Title>Delete page</Dialog.Alert.Title>
          <Dialog.Alert.Description>
            The page and its blocks will be removed. This cannot be undone.
          </Dialog.Alert.Description>
        </Dialog.Alert.Header>
        <Dialog.Alert.Footer>
          <Dialog.Alert.Cancel>Cancel</Dialog.Alert.Cancel>
          <Dialog.Alert.Action variant="destructive">Delete</Dialog.Alert.Action>
        </Dialog.Alert.Footer>
      </Dialog.Alert.Content>
    </Dialog.Alert.Root>
  ),
};
