import type { Meta, StoryObj } from "@storybook/react-vite";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246/247). `VStack` is not exported at all — `Box`
// is the kit's single layout primitive and its default form IS a column stack,
// so `Box gap={n}` is what `VStack gap={n}` was. The control itself is reached
// as `FormControl.NativeSelect`, exactly as the title spells it.
import { Box, FormControl, Text } from "../../../index";

/**
 * `NativeSelect` — настоящий `<select>`, а не ARIA-реализация выпадающего
 * списка. Для продуктовых поверхностей по умолчанию берут `Forms/Select`
 * (Radix); нативный нужен там, где по элементу работают платформенные API:
 * присваивание `.value`, системный пикер на мобильном и Playwright
 * `selectOption()`. Панели редактора ездят именно на них.
 *
 * Оформление повторяет `Input`, чтобы поле и список стояли в одной строке
 * формы; родная стрелка оставлена намеренно — портала нет, рисовать свою
 * поверх нечего.
 */
const meta = {
  title: "Components/Forms/FormControl.NativeSelect",
  component: FormControl.NativeSelect,
  args: {
    children: (
      <>
        <option value="draft">Черновик</option>
        <option value="published">Опубликовано</option>
        <option value="archived">В архиве</option>
      </>
    ),
  },
} satisfies Meta<typeof FormControl.NativeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="max-w-64">
      <FormControl.NativeSelect {...args} />
    </div>
  ),
};

/**
 * Состояния: обычное, disabled и `aria-invalid`. Hover, focus-visible и
 * active проверяются addon-ом pseudo-states либо клавишей Tab.
 */
export const States: Story = {
  render: (args) => (
    <Box gap={4} className="max-w-64">
      <Box gap={1}>
        <Text variant="meta">обычное</Text>
        <FormControl.NativeSelect {...args} />
      </Box>
      <Box gap={1}>
        <Text variant="meta">disabled</Text>
        <FormControl.NativeSelect {...args} disabled />
      </Box>
      <Box gap={1}>
        <Text variant="meta">aria-invalid</Text>
        <FormControl.NativeSelect {...args} aria-invalid />
      </Box>
    </Box>
  ),
};

/** Пустое значение отдельным `<option value="">` — компонент его не добавляет. */
export const WithPlaceholder: Story = {
  render: () => (
    <div className="max-w-64">
      <FormControl.NativeSelect defaultValue="">
        <option value="" disabled>
          Выберите статус…
        </option>
        <option value="draft">Черновик</option>
        <option value="published">Опубликовано</option>
      </FormControl.NativeSelect>
    </div>
  ),
};

/** `<optgroup>` работает как в обычном `<select>` — обёртки для него нет и не нужно. */
export const Grouped: Story = {
  render: () => (
    <div className="max-w-64">
      <FormControl.NativeSelect defaultValue="row">
        <optgroup label="Раскладка">
          <option value="row">Строка</option>
          <option value="column">Колонка</option>
        </optgroup>
        <optgroup label="Сетка">
          <option value="grid-2">2 колонки</option>
          <option value="grid-3">3 колонки</option>
        </optgroup>
      </FormControl.NativeSelect>
    </div>
  ),
};
