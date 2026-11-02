import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { SearchField } from "./search-field";

const meta = {
  title: "Components/Forms/FormControl.SearchField",
  component: SearchField,
} satisfies Meta<typeof SearchField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `SearchField` — контролируемый: состояние держит вызывающий.
 *
 * Обёртка объявлена ВНУТРИ render, а не рядом с meta: панель Source показывает
 * тело истории и ничего больше, поэтому хелпер уровня модуля пришёл бы
 * консьюмеру как `<ControlledSearch />` без определения (SDL-248). */
export const Empty: Story = {
  render: () => {
    const ControlledSearch = () => {
      const [value, setValue] = React.useState("");
      return (
        <SearchField
          value={value}
          onChange={setValue}
          placeholder="Search pages…"
          ariaLabel="Search pages"
          maxWidth={320}
        />
      );
    };

    return <ControlledSearch />;
  },
};

/** С текстом появляется clear-кнопка (ghost icon-sm, focus-visible Tab-ом). */
export const WithValue: Story = {
  render: () => {
    const ControlledSearch = () => {
      const [value, setValue] = React.useState("pricing");
      return (
        <SearchField
          value={value}
          onChange={setValue}
          placeholder="Search pages…"
          ariaLabel="Search pages"
          maxWidth={320}
        />
      );
    };

    return <ControlledSearch />;
  },
};
