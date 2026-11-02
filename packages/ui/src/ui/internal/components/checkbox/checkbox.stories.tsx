import type { Meta, StoryObj } from "@storybook/react-vite";

import { Checkbox } from "./checkbox";
import { NativeCheckbox } from "../native-checkbox/native-checkbox";
import { Label } from "../label/label";

const meta = {
  title: "Components/Forms/FormControl.Checkbox",
  component: Checkbox,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** unchecked, checked, indeterminate, disabled, aria-invalid; hover —
 * навести курсор, focus-visible — Tab. */
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="c1" />
        <Label htmlFor="c1">Unchecked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c2" defaultChecked />
        <Label htmlFor="c2">Checked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c3" checked="indeterminate" />
        <Label htmlFor="c3">Indeterminate</Label>
      </div>
      <div className="flex items-center gap-2" data-disabled="true">
        <Checkbox id="c4" disabled />
        <Label htmlFor="c4">Disabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="c5" aria-invalid />
        <Label htmlFor="c5">Invalid</Label>
      </div>
    </div>
  ),
};

export const Native: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <NativeCheckbox id="n1" />
        <Label htmlFor="n1">Unchecked</Label>
      </div>
      <div className="flex items-center gap-2">
        <NativeCheckbox id="n2" defaultChecked />
        <Label htmlFor="n2">Checked</Label>
      </div>
      <div className="flex items-center gap-2">
        <NativeCheckbox id="n3" disabled />
        <Label htmlFor="n3">Disabled</Label>
      </div>
    </div>
  ),
};
