import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronRight, FileText, Palette, Settings } from "lucide-react";

import { Badge, Box, Link, Text } from "./index";

/**
 * `Link` — фасад над двумя ссылочными формами кита: `RowLink` (строка списка,
 * вариант по умолчанию) и `ActionCardLink` (карточка-действие). Это union по
 * `variant`, а не общий props-набор: у карточки свои `title`/`description`/
 * `icon`, у строки — произвольные children. Отдельные истории есть и у самих
 * `Widgets/RowLink` / `Widgets/ActionCardLink`; здесь показано, как выбрать
 * форму через фасад, которым пользуется хост.
 *
 * `next/link` в Storybook подменён plain-&lt;a&gt; моком
 * (`.storybook/next-link-mock`) — сам пакет держит настоящий импорт.
 */
const meta = {
  title: "Components/Widgets/Link",
  component: Link,
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `variant` не указан → строка списка. */
export const Row: Story = {
  render: () => (
    <Box gap={2} className="max-w-md">
      <Link href="/studio/pages/home">
        <Text size="sm">Главная</Text>
        <ChevronRight size={16} className="text-muted-foreground" />
      </Link>
      <Link href="/studio/pages/pricing">
        <Box direction="row" gap={2} align="center">
          <Text size="sm">Тарифы</Text>
          <Badge tone="orange">черновик</Badge>
        </Box>
        <ChevronRight size={16} className="text-muted-foreground" />
      </Link>
    </Box>
  ),
};

/** `variant="action-card"` — крупная точка входа в раздел; иконка необязательна. */
export const ActionCard: Story = {
  render: () => (
    <Box variant="grid" columns={1} mdColumns={2} gap={3}>
      <Link
        variant="action-card"
        href="/studio/pages"
        title="Страницы"
        description="Маршруты и их содержимое"
        icon={FileText}
      />
      <Link
        variant="action-card"
        href="/studio/theme"
        title="Тема"
        description="Цвета, типографика, радиусы"
        icon={Palette}
      />
      <Link variant="action-card" href="/studio/settings" title="Настройки" icon={Settings} />
      <Link variant="action-card" href="/studio/blocks" title="Блоки" />
    </Box>
  ),
};

/** Обе формы рядом: одна и та же навигация в списке и на витрине раздела. */
export const BothVariants: Story = {
  render: () => (
    <Box gap={6} className="max-w-2xl">
      <Box gap={2}>
        <Text variant="label">variant=&quot;row&quot;</Text>
        <Link href="/studio/pages">
          <Text size="sm">Страницы</Text>
          <ChevronRight size={16} className="text-muted-foreground" />
        </Link>
      </Box>
      <Box gap={2}>
        <Text variant="label">variant=&quot;action-card&quot;</Text>
        <Link
          variant="action-card"
          href="/studio/pages"
          title="Страницы"
          description="Маршруты и их содержимое"
          icon={FileText}
        />
      </Box>
    </Box>
  ),
};
