import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";

import { Badge, Box, Button, ListHeader, Text } from "./index";

/**
 * `ListHeader` — шапка списка: заголовок слева, произвольный слот `right`
 * справа, снизу разделитель. Заголовок и описание принимают либо строку
 * (тогда типографику ставит сам компонент), либо готовый узел — второе нужно,
 * когда в заголовок встраивают счётчик или бейдж.
 */
const meta = {
  title: "Components/Primitives/ListHeader",
  component: ListHeader,
  args: { title: "Страницы" },
} satisfies Meta<typeof ListHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: { description: "Публичные маршруты этого сайта" },
};

/** `right` — слот под действие раздела; он не сжимается при длинном заголовке. */
export const WithAction: Story = {
  args: {
    description: "Публичные маршруты этого сайта",
    right: (
      <Button size="sm">
        <Plus size={16} />
        Добавить
      </Button>
    ),
  },
};

/** Строковый заголовок усекается не сам по себе — усечение задаёт узел-заголовок. */
export const LongTitle: Story = {
  args: {
    title: "Очень длинный заголовок раздела, который обязан ужаться, а не вытеснить кнопку",
    right: <Button size="sm">Добавить</Button>,
  },
  render: (args) => (
    <Box className="max-w-md">
      <ListHeader {...args} />
    </Box>
  ),
};

/** Узел вместо строки: типографику в этом случае выбирает вызывающий код. */
export const NodeTitle: Story = {
  args: {
    title: (
      <Box direction="row" gap={2} align="center">
        <Text weight="semibold">Черновики</Text>
        <Badge tone="orange">3</Badge>
      </Box>
    ),
    description: "Не показываются в публичной выдаче",
  },
};

/** В списке шапки разделяют группы — разделитель снизу принадлежит шапке. */
export const InList: Story = {
  render: () => (
    <Box className="max-w-md">
      <ListHeader title="Опубликованные" right={<Badge tone="green">2</Badge>} />
      <Box gap={1} className="mb-6">
        <Text size="sm">/ — Главная</Text>
        <Text size="sm">/pricing — Тарифы</Text>
      </Box>
      <ListHeader title="Черновики" right={<Badge tone="orange">1</Badge>} />
      <Box gap={1}>
        <Text size="sm">/about — О нас</Text>
      </Box>
    </Box>
  ),
};
