import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../../internal/components/button";
import { ScreenHeader } from "./screen-header";

const meta = {
  title: "Admin/ScreenHeader",
  component: ScreenHeader,
} satisfies Meta<typeof ScreenHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Базовая форма: h1 + сводка (children) слева, действия справа. */
export const Default: Story = {
  render: () => (
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
      4 pages.
    </ScreenHeader>
  ),
};

/** С кикером — mono uppercase строка над заголовком (форма дашборда). */
export const WithKicker: Story = {
  render: () => (
    <ScreenHeader
      kicker="Studio"
      title="Dashboard"
      actions={<Button size="sm">+ New page</Button>}
    >
      4 pages · 2 components · theme configured
    </ScreenHeader>
  ),
};

/** Узкий контейнер: блок действий переносится под заголовок (flex-wrap). */
export const NarrowWraps: Story = {
  render: () => (
    <div className="w-72 rounded-lg border p-4">
      <ScreenHeader
        title="Site settings"
        actions={
          <>
            <Button variant="outline" size="sm">
              Discard
            </Button>
            <Button size="sm">Save changes</Button>
          </>
        }
      >
        Title, description, favicon.
      </ScreenHeader>
    </div>
  ),
};
