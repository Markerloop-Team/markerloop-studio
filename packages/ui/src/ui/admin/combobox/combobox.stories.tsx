import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Combobox } from "./combobox";

const meta = {
  title: "Admin/Combobox",
  component: Combobox,
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Поиск по label; повторный выбор текущего значения снимает выбор.
 *
 * Список объявлен ВНУТРИ render: панель Source показывает тело истории и ничего
 * больше, поэтому общий `BLOCKS` уровня модуля пришёл бы консьюмеру как
 * неразрешимая ссылка (SDL-248). */
export const Basic: Story = {
  render: function BasicStory() {
    const blocks = [
      { value: "hero", label: "Hero", hint: "section" },
      { value: "gallery", label: "Gallery", hint: "section" },
      { value: "cta", label: "Call to action", hint: "section" },
      { value: "footer", label: "Footer", hint: "layout" },
      { value: "legacy", label: "Legacy banner", hint: "deprecated", disabled: true },
    ];
    const [value, setValue] = React.useState("hero");
    return (
      <div className="w-64">
        <Combobox
          options={blocks}
          value={value}
          onValueChange={setValue}
          placeholder="Pick a block…"
          aria-label="Block"
        />
      </div>
    );
  },
};

export const Empty: Story = {
  render: () => (
    <div className="w-64">
      <Combobox options={[]} placeholder="No options" emptyText="No blocks yet." aria-label="Empty" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="w-64">
      <Combobox
        options={[
          { value: "hero", label: "Hero", hint: "section" },
          { value: "footer", label: "Footer", hint: "layout" },
        ]}
        disabled
        placeholder="Disabled"
        aria-label="Disabled"
      />
    </div>
  ),
};
