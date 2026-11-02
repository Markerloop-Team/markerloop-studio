import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../../internal/components/button";
import { ScreenHeader } from "../screen-header/screen-header";
import { ScreenShell } from "./screen-shell";

const meta = {
  title: "Admin/ScreenShell",
  component: ScreenShell,
} satisfies Meta<typeof ScreenShell>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Паддинг — clamp(20px, 3vw, 40px): на узком экране 20px, на широком 40px.
 * Скролл и фон — забота раскладки хоста, шелл владеет только рамкой.
 */
export const Screen: Story = {
  render: () => (
    <div className="bg-background w-full rounded-lg border">
      <ScreenShell>
        <ScreenHeader
          title="Pages"
          actions={
            <>
              <Button variant="outline" size="sm">
                Preview site
              </Button>
              <Button size="sm">Create page</Button>
            </>
          }
        >
          3 pages.
        </ScreenHeader>
        <div className="bg-card text-muted-foreground rounded-xl border p-6 text-sm">
          Screen content
        </div>
      </ScreenShell>
    </div>
  ),
};
