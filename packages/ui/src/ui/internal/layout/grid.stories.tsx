import type { Meta, StoryObj } from "@storybook/react-vite";

import { Grid } from "./grid";

const meta = {
  title: "Admin/Grid",
  component: Grid,
} satisfies Meta<typeof Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Columns: Story = {
  render: () => (
    <Grid gap={3} columns={2} mdColumns={4}>
      {Array.from({ length: 8 }, (_, i) => (
        <div
          key={i}
          className="rounded-md border bg-card p-4 text-sm text-card-foreground"
        >
          col {i + 1}
        </div>
      ))}
    </Grid>
  ),
};

/**
 * Auto-fill track sizing (EP-32 inventory §4.3): as many `minmax(Xpx,1fr)`
 * columns as fit the container. The closed width list — 178 (insert cards),
 * 200 (metric/asset cards), 240 (collection cards). Mutually exclusive with
 * `columns`.
 */
export const AutoFill: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      {([178, 200, 240] as const).map((w) => (
        <div key={w}>
          <p className="mb-2 font-mono text-xs text-muted-foreground">
            minItemWidth={w}
          </p>
          <Grid gap={3} minItemWidth={w}>
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="rounded-md border bg-card p-4 text-sm text-card-foreground"
              >
                item {i + 1}
              </div>
            ))}
          </Grid>
        </div>
      ))}
    </div>
  ),
};
