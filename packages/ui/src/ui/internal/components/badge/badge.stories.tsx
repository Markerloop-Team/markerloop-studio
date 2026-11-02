import type { Meta, StoryObj } from "@storybook/react-vite";

import { Badge } from "./badge";

const meta = {
  title: "Components/Primitives/Badge",
  component: Badge,
  args: { children: "Badge" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {(["default", "secondary", "destructive", "outline", "ghost", "link"] as const).map(
        (variant) => (
          <Badge key={variant} {...args} variant={variant}>
            {variant}
          </Badge>
        )
      )}
    </div>
  ),
};

/** Статусные тона поверх темы: подложка с альфой 15% + читаемый foreground. */
export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {(["red", "green", "orange"] as const).map((tone) => (
        <Badge key={tone} {...args} tone={tone}>
          {tone}
        </Badge>
      ))}
    </div>
  ),
};

/** hover активен только в виде ссылки ([a&]) — фокус проверяется Tab-ом. */
export const AsLink: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Badge {...args} asChild>
        <a href="#link">link badge</a>
      </Badge>
      <Badge {...args} asChild tone="green">
        <a href="#link">tone link</a>
      </Badge>
    </div>
  ),
};
