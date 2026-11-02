import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText, Palette, Plus, Settings, Trash2 } from "lucide-react";

import { IconGallery } from "./icon-gallery";

/**
 * `IconGallery` — витрина набора иконок: сетка «превью + имя», по которой
 * подбирают иконку для экрана. Компонент готовый, а не заготовка раскладки:
 * заголовок, описание и адаптивная сетка (2/3/4 колонки) внутри него.
 *
 * Без props показывает набор кита (`internal/icons`), который и является
 * ответом на вопрос «какие иконки уже есть». `icons` передают, когда витрину
 * надо ограничить подмножеством — например показать иконки одного раздела.
 */
const meta = {
  title: "Components/Widgets/IconGallery",
  component: IconGallery,
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Набор кита целиком — то, что видит разработчик, когда ищет иконку. */
export const Default: Story = {};

/** Своё подмножество: ключ карты — то имя, которое покажет витрина. */
export const CustomIcons: Story = {
  args: {
    title: "Действия строки",
    description: "Иконки, которыми размечены действия в списках Studio.",
    icons: { Plus, Trash2, Settings, FileText, Palette },
  },
};

/** `size` меняет только сам глиф — ячейка держит размер, сетка не едет. */
export const LargeGlyphs: Story = {
  args: {
    title: "Крупные глифы",
    description: "size={28} — тот же макет, другой размер иконки.",
    icons: { Plus, Trash2, Settings, FileText, Palette },
    size: 28,
  },
};

/** Пустой набор: витрина остаётся с шапкой, но без сетки — состояние без данных. */
export const Empty: Story = {
  args: {
    title: "Иконки раздела",
    description: "Набор пуст — показывать нечего.",
    icons: {},
  },
};
