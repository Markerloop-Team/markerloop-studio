import type { Meta, StoryObj } from "@storybook/react-vite";

import { UrlChip } from "./url-chip";

const meta = {
  title: "Admin/UrlChip",
  component: UrlChip,
} satisfies Meta<typeof UrlChip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Рабочая ссылка в новую вкладку: mono-подпись + декоративная стрелка. */
export const Default: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <UrlChip href="#" title="Open the public page">
        /pricing
      </UrlChip>
      <UrlChip href="#" title="Preview page">
        preview
      </UrlChip>
    </div>
  ),
};

/** Подпись длиннее 18ch обрезается многоточием, чип не растягивается. */
export const LongLabelTruncates: Story = {
  render: () => (
    <UrlChip href="#" title="Open the public page">
      /a-very-long-slug-that-does-not-fit-in-the-chip
    </UrlChip>
  ),
};
