import type { Meta, StoryObj } from "@storybook/react-vite";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246/247). `InlineAlert` is the internal name; the
// published one is `Alert`, which is also what the title advertises.
import { Alert } from "../../../index";

const meta = {
  title: "Components/Primitives/Alert",
  component: Alert,
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

/** default — bg-accent; destructive — статусная пара bg-destructive/15. */
export const Variants: Story = {
  render: () => (
    <div className="max-w-md space-y-3">
      <Alert>Draft saved locally.</Alert>
      <Alert variant="destructive">
        Failed to publish: storage unavailable.
      </Alert>
    </div>
  ),
};
