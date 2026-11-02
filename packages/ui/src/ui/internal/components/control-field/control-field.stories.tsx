import type { Meta, StoryObj } from "@storybook/react-vite";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246): the wrapper is reached as
// `FormControl.Field`, never by its internal name.
import { Box, FormControl } from "../../../index";

/**
 * `FormControl.Field` — label + one control + hint or error, for forms that
 * do not run on react-hook-form. Same look as `Field.*`: the label is the
 * kit's Label, the error is destructive `text-sm`, the gap is `gap-2`.
 * It gives the control `id`, `aria-invalid` and `aria-describedby`, unless
 * the control sets them itself.
 */
const meta = {
  title: "Components/Forms/FormControl.Field",
  component: FormControl.Field,
  args: {
    label: "Email",
    children: <FormControl.Input type="email" placeholder="you@example.com" />,
  },
} satisfies Meta<typeof FormControl.Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <FormControl.Field {...args} />
    </div>
  ),
};

/** Hint, error (the error replaces the hint) and a Select as the control. */
export const States: Story = {
  render: () => (
    <Box gap={4} className="max-w-sm">
      <FormControl.Field label="Address" hint="Starts with “/”.">
        <FormControl.Input placeholder="/about" />
      </FormControl.Field>
      <FormControl.Field
        label="Address"
        hint="Starts with “/”."
        error="The address must start with “/”"
      >
        <FormControl.Input defaultValue="about" />
      </FormControl.Field>
      <FormControl.Field id="story-role" label="Role">
        <FormControl.Select.Root defaultValue="editor">
          <FormControl.Select.Trigger id="story-role" fullWidth>
            <FormControl.Select.Value />
          </FormControl.Select.Trigger>
          <FormControl.Select.Content>
            <FormControl.Select.Item value="editor">editor</FormControl.Select.Item>
            <FormControl.Select.Item value="member">member</FormControl.Select.Item>
          </FormControl.Select.Content>
        </FormControl.Select.Root>
      </FormControl.Field>
    </Box>
  ),
};
