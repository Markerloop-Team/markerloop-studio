import type { Meta, StoryObj } from "@storybook/react-vite";

import { Text } from "./text";

const meta = {
  title: "Typography/Text",
  component: Text,
  args: { children: "The quick brown fox" },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {(["default", "muted", "destructive", "mono", "success", "danger"] as const).map(
        (variant) => (
          <Text key={variant} {...args} variant={variant}>
            {variant}: {String(args.children)}
          </Text>
        )
      )}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {(["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"] as const).map((size) => (
        <Text key={size} {...args} size={size}>
          {size}: {String(args.children)}
        </Text>
      ))}
    </div>
  ),
};

export const Weights: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {(["normal", "medium", "semibold", "bold"] as const).map((weight) => (
        <Text key={weight} {...args} weight={weight}>
          {weight}: {String(args.children)}
        </Text>
      ))}
    </div>
  ),
};

/**
 * Micro-typography presets (EP-32 inventory §4.1). The px values live inside
 * the kit; screens reference the preset by name only:
 * - `kicker` — mono 9.5px/600, 0.09em, uppercase (Page/Component kicker)
 * - `label` — mono 11px/600, 0.1em, uppercase (section/table heads)
 * - `meta` — mono 11.5px/400 (etag, row subtitles, url chips)
 */
export const Presets: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      {(["kicker", "label", "meta"] as const).map((variant) => (
        <Text key={variant} {...args} variant={variant}>
          {variant}: {String(args.children)}
        </Text>
      ))}
    </div>
  ),
};
