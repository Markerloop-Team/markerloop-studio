import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
} from "./input-group";

const meta = {
  title: "Components/Forms/InputGroup",
  component: InputGroup,
} satisfies Meta<typeof InputGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Аддоны: иконка, текст-префикс, кнопка-суффикс, invalid, textarea. */
export const States: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-4">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search pages…" />
      </InputGroup>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>https://</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="example.com" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>Copy</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput placeholder="Invalid value" aria-invalid />
      </InputGroup>
      <InputGroup>
        <InputGroupTextarea placeholder="Multiline notes…" />
        <InputGroupAddon align="block-end">
          <InputGroupText>0/200</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  ),
};
