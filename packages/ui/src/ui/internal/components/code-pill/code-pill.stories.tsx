import type { Meta, StoryObj } from "@storybook/react-vite";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246/247). `CodePill` is the internal name; the
// published one is `Code`, which is also what the title advertises.
import { Code } from "../../../index";

const meta = {
  title: "Components/Primitives/Code",
  component: Code,
} satisfies Meta<typeof Code>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Моно-шрифт на bg-muted, инлайн в тексте. */
export const Default: Story = {
  render: () => (
    <p className="max-w-md text-sm">
      Set <Code>SAUNA_API_URL</Code> to switch the provider, or keep
      <Code>sauna-content/</Code> for local files.
    </p>
  ),
};
