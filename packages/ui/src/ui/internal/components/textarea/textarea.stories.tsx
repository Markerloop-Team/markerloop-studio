import type { Meta, StoryObj } from "@storybook/react-vite";

import { Textarea } from "./textarea";

const meta = {
  title: "Components/Forms/FormControl.Textarea",
  component: Textarea,
  args: { placeholder: "Placeholder" },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

/** default, hover, focus-visible, read-only, disabled, aria-invalid. */
export const States: Story = {
  render: (args) => (
    <div className="flex w-80 flex-col gap-3">
      <Textarea {...args} />
      <Textarea {...args} defaultValue="Read-only value" readOnly />
      <Textarea {...args} disabled />
      <Textarea {...args} aria-invalid />
    </div>
  ),
};
