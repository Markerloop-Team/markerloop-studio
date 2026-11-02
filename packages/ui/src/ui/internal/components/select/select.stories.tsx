import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246/247). `SelectTrigger` and friends are not
// exported — the access path is `FormControl.Select.*`, which is also what the
// title advertises.
import { FormControl } from "../../../index";

const meta = {
  title: "Components/Forms/FormControl.Select",
  component: FormControl.Select.Root,
} satisfies Meta<typeof FormControl.Select.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

/** default, hover (граница), focus-visible, disabled, aria-invalid,
 * оба размера.
 *
 * `Demo` объявлен ВНУТРИ render, а не рядом с meta: панель Source показывает
 * тело истории и ничего больше, поэтому хелпер уровня модуля пришёл бы
 * консьюмеру как `<Demo />` без определения (SDL-248). */
export const States: Story = {
  render: () => {
    const Demo = (
      props: React.ComponentProps<typeof FormControl.Select.Trigger>,
    ) => (
      <FormControl.Select.Root>
        <FormControl.Select.Trigger {...props}>
          <FormControl.Select.Value placeholder="Pick one" />
        </FormControl.Select.Trigger>
        <FormControl.Select.Content>
          <FormControl.Select.Item value="one">One</FormControl.Select.Item>
          <FormControl.Select.Item value="two">Two</FormControl.Select.Item>
          <FormControl.Select.Item value="three" disabled>
            Three (disabled)
          </FormControl.Select.Item>
        </FormControl.Select.Content>
      </FormControl.Select.Root>
    );

    return (
      <div className="flex w-64 flex-col gap-3">
        <Demo />
        <Demo size="sm" />
        <Demo disabled />
        <Demo aria-invalid />
      </div>
    );
  },
};
