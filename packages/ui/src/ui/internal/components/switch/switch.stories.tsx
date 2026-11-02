import type { Meta, StoryObj } from "@storybook/react-vite";

import { Switch } from "./switch";
import { Label } from "../label/label";

const meta = {
  title: "Components/Forms/Switch",
  component: Switch,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** off, on, disabled, invalid + размер sm; focus-visible — Tab. */
export const States: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Switch id="s1" />
        <Label htmlFor="s1">Off</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="s2" defaultChecked />
        <Label htmlFor="s2">On</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="s3" disabled />
        <Label htmlFor="s3">Disabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="s4" defaultChecked disabled />
        <Label htmlFor="s4">Disabled on</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="s5" aria-invalid />
        <Label htmlFor="s5">Invalid</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="s6" size="sm" defaultChecked />
        <Label htmlFor="s6">Small</Label>
      </div>
    </div>
  ),
};
