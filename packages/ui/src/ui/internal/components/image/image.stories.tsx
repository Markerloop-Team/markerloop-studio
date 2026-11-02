import type { Meta, StoryObj } from "@storybook/react-vite";

import { Image } from "./image";

// Самодостаточный источник — data-URI, чтобы стори не зависели от сети.
const DEMO_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#8ca9ad"/><circle cx="320" cy="180" r="90" fill="#e8eef0"/></svg>`
)}`;

const meta = {
  title: "Components/Primitives/Image",
  component: Image,
  args: { src: DEMO_SRC, alt: "Demo placeholder" },
} satisfies Meta<typeof Image>;

export default meta;
type Story = StoryObj<typeof meta>;

/** aspect-обёртка держит layout до загрузки; скругление — пропсом. */
export const AspectRatio: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <Image {...args} aspect="16 / 9" rounded="lg" />
    </div>
  ),
};

/** fit-варианты поверх фиксированного контейнера. */
export const FitModes: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-4">
      {(["cover", "contain", "scale-down"] as const).map((fit) => (
        <figure key={fit} className="w-40">
          <div className="h-24 w-40 overflow-hidden rounded-md border">
            <Image {...args} fit={fit} className="h-full w-full" />
          </div>
          <figcaption className="mt-1 text-xs text-muted-foreground">
            {fit}
          </figcaption>
        </figure>
      ))}
    </div>
  ),
};

/** rounded="full" для круглых миниатюр. */
export const Rounded: Story = {
  render: (args) => (
    <div className="flex items-center gap-4">
      {(["none", "md", "xl", "full"] as const).map((rounded) => (
        <Image
          key={rounded}
          {...args}
          rounded={rounded}
          className="size-16"
        />
      ))}
    </div>
  ),
};
