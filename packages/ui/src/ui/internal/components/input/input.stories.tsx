import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";

const meta = {
  title: "Components/Forms/FormControl.Input",
  component: Input,
  args: { placeholder: "Placeholder" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

/** default, hover (курсор), focus-visible (клик/Tab), read-only,
 * disabled, aria-invalid. */
export const States: Story = {
  render: (args) => (
    <div className="flex w-80 flex-col gap-3">
      <Input {...args} />
      <Input {...args} defaultValue="Read-only value" readOnly />
      <Input {...args} disabled />
      <Input {...args} aria-invalid />
      <Input {...args} leftInset="icon" placeholder="With left inset" />
      <Input {...args} type="file" />
    </div>
  ),
};
