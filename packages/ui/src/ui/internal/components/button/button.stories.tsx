import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";

const meta = {
  title: "Components/Primitives/Button",
  component: Button,
  args: { children: "Button" },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {(
        ["default", "secondary", "outline", "ghost", "destructive", "link"] as const
      ).map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {(["xs", "sm", "default", "lg"] as const).map((size) => (
        <Button key={size} {...args} size={size}>
          {size}
        </Button>
      ))}
    </div>
  ),
};

/** Все состояния каждого варианта на одном экране: default, hover
 * (навести курсор), focus-visible (Tab), active (зажать), disabled,
 * aria-invalid. */
export const States: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      {(
        ["default", "secondary", "outline", "ghost", "destructive", "link"] as const
      ).map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          <Button {...args} variant={variant}>
            {variant}
          </Button>
          <Button {...args} variant={variant} disabled>
            disabled
          </Button>
          <Button {...args} variant={variant} aria-invalid>
            invalid
          </Button>
        </div>
      ))}
    </div>
  ),
};
