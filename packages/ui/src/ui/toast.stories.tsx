import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";

import { Box, Button, Text, Toast } from "./index";

/**
 * `Toast` — это КОНТЕЙНЕР (sonner `Toaster`), а не сам всплывающий блок:
 * его монтируют один раз в корне приложения, а сообщения потом шлют функцией
 * `toast()` из `sonner`. Поэтому у историй ниже всегда две части — `<Toast />`
 * где-то в разметке и кнопка, которая шлёт сообщение; отрендерить «тост» в
 * отрыве от контейнера нельзя.
 *
 * Иконки статусов и цвета контейнер подставляет сам (`--normal-bg` и прочие
 * подтянуты из темы), поэтому вызывающему коду не нужно ничего оформлять.
 */
const meta = {
  title: "Components/Overlays/Toast",
  component: Toast,
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Пять статусов, которым контейнер даёт свою иконку. */
export const Statuses: Story = {
  render: (args) => (
    <>
      <Toast {...args} />
      <Box direction="row" gap={2} wrap>
        <Button size="sm" onClick={() => toast("Страница сохранена")}>
          обычный
        </Button>
        <Button size="sm" variant="secondary" onClick={() => toast.success("Опубликовано")}>
          success
        </Button>
        <Button size="sm" variant="secondary" onClick={() => toast.info("Черновик обновлён")}>
          info
        </Button>
        <Button size="sm" variant="secondary" onClick={() => toast.warning("Есть несохранённые правки")}>
          warning
        </Button>
        <Button size="sm" variant="destructive" onClick={() => toast.error("Не удалось сохранить")}>
          error
        </Button>
      </Box>
    </>
  ),
};

/** Описание и действие: второй строкой — контекст, справа — обратимость. */
export const WithDescriptionAndAction: Story = {
  render: (args) => (
    <>
      <Toast {...args} />
      <Box direction="row" gap={2} wrap>
        <Button
          size="sm"
          onClick={() =>
            toast.success("Страница удалена", {
              description: "/pricing больше не отвечает на публичном маршруте",
              action: { label: "Вернуть", onClick: () => toast("Возвращено") },
            })
          }
        >
          с действием
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast("Сохранено", { description: "Изменения ушли в sauna-content" })
          }
        >
          с описанием
        </Button>
      </Box>
    </>
  ),
};

/**
 * `toast.promise` — единственная форма, где виден `loading`-статус: сообщение
 * живёт, пока обещание не разрешится, и само меняет иконку на итоговую.
 */
export const WithPromise: Story = {
  render: (args) => (
    <>
      <Toast {...args} />
      <Box direction="row" gap={2} wrap>
        <Button
          size="sm"
          onClick={() =>
            toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
              loading: "Публикуем…",
              success: "Опубликовано",
              error: "Публикация не удалась",
            })
          }
        >
          успешное обещание
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            toast.promise(
              new Promise((_resolve, reject) =>
                setTimeout(() => reject(new Error("500")), 1500)
              ),
              {
                loading: "Публикуем…",
                success: "Опубликовано",
                error: "Публикация не удалась",
              }
            )
          }
        >
          упавшее обещание
        </Button>
      </Box>
    </>
  ),
};

/**
 * `position` задаётся на контейнере, а не на сообщении: у приложения одна
 * точка вывода, и менять её на лету не предполагается.
 */
export const Position: Story = {
  render: () => (
    <>
      <Toast position="top-center" />
      <Box gap={2}>
        <Text variant="meta">position=&quot;top-center&quot;</Text>
        <Box direction="row" gap={2}>
          <Button size="sm" onClick={() => toast("Сверху по центру")}>
            показать
          </Button>
        </Box>
      </Box>
    </>
  ),
};
