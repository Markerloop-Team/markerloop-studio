import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus, RefreshCw } from "lucide-react";

import { Button } from "../../internal/components/button";
import { PanelHeader } from "./panel-header";

const meta = {
  title: "Admin/PanelHeader",
  component: PanelHeader,
  args: { title: "Pages" },
} satisfies Meta<typeof PanelHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {
  render: (args) => (
    <div className="w-72 rounded-lg border">
      <PanelHeader {...args} />
    </div>
  ),
};

/** Слот actions — icon-кнопки; children — строка-подзаголовок. */
export const WithActionsAndSubtitle: Story = {
  render: (args) => (
    <div className="w-72 rounded-lg border">
      <PanelHeader
        {...args}
        actions={
          <>
            <Button variant="ghost" size="icon-xs" aria-label="Refresh">
              <RefreshCw />
            </Button>
            <Button variant="ghost" size="icon-xs" aria-label="Add page">
              <Plus />
            </Button>
          </>
        }
      >
        12 published · 3 drafts
      </PanelHeader>
    </div>
  ),
};
