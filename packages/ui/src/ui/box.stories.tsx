import type { Meta, StoryObj } from "@storybook/react-vite";

import { Box, Text } from "./index";

/**
 * `Box` — единственный layout-примитив кита: он заменяет Stack/HStack/VStack,
 * Center, Panel и Grid, поэтому у него не props-набор, а четыре формы,
 * различаемые `variant`. Каждая форма принимает СВОЙ набор props (union-тип),
 * так что показывать их надо по отдельности, а не одним Controls-столом.
 */
const meta = {
  title: "Layout/Box",
  component: Box,
} satisfies Meta<typeof Box>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `variant="stack"` — форма по умолчанию: flex-колонка, `direction="row"` разворачивает в строку.
 *
 * Плитка-заполнитель `Tile` объявлена ВНУТРИ render (и так в каждой истории,
 * которой она нужна): панель Source показывает тело истории и ничего больше,
 * поэтому хелпер уровня модуля пришёл бы консьюмеру как `<Tile>` без
 * определения (SDL-248). У самой плитки нет своей раскладки — всю геометрию
 * задаёт родитель. */
export const Stack: Story = {
  render: () => {
    const Tile = ({ children }: { children: React.ReactNode }) => (
      <Box variant="panel" padding={2}>
        <Text size="sm" variant="mono">
          {children}
        </Text>
      </Box>
    );

    return (
      <Box gap={4}>
        <Box gap={2}>
          <Text variant="label">direction=&quot;column&quot; (по умолчанию)</Text>
          <Box gap={2}>
            <Tile>первый</Tile>
            <Tile>второй</Tile>
            <Tile>третий</Tile>
          </Box>
        </Box>
        <Box gap={2}>
          <Text variant="label">direction=&quot;row&quot;</Text>
          <Box direction="row" gap={2}>
            <Tile>первый</Tile>
            <Tile>второй</Tile>
            <Tile>третий</Tile>
          </Box>
        </Box>
      </Box>
    );
  },
};

/** Шкала `gap` — ступени фиксированы типом `BoxGap`, произвольных значений нет. */
export const Gaps: Story = {
  render: () => {
    const Tile = ({ children }: { children: React.ReactNode }) => (
      <Box variant="panel" padding={2}>
        <Text size="sm" variant="mono">
          {children}
        </Text>
      </Box>
    );

    return (
      <Box gap={4}>
        {([0, 1, 2, 3, 4, 6, 8] as const).map((gap) => (
          <Box key={gap} gap={1}>
            <Text variant="meta">gap={gap}</Text>
            <Box direction="row" gap={gap}>
              <Tile>A</Tile>
              <Tile>B</Tile>
              <Tile>C</Tile>
            </Box>
          </Box>
        ))}
      </Box>
    );
  },
};

/** `align` — поперечная ось. Разная высота плиток нужна, иначе `stretch` неотличим. */
export const Align: Story = {
  render: () => {
    const Tile = ({ children }: { children: React.ReactNode }) => (
      <Box variant="panel" padding={2}>
        <Text size="sm" variant="mono">
          {children}
        </Text>
      </Box>
    );

    return (
      <Box gap={4}>
        {(["start", "center", "end", "stretch", "baseline"] as const).map((align) => (
          <Box key={align} gap={1}>
            <Text variant="meta">align=&quot;{align}&quot;</Text>
            <Box variant="panel" padding={2}>
              <Box direction="row" gap={2} align={align} className="h-20">
                <Tile>обычная</Tile>
                <Box variant="panel" padding={4}>
                  <Text size="sm" variant="mono">
                    высокая
                  </Text>
                </Box>
                <Tile>обычная</Tile>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    );
  },
};

/** `justify` — главная ось. Виден только при `fullWidth`, иначе контейнер сжат по контенту. */
export const Justify: Story = {
  render: () => {
    const Tile = ({ children }: { children: React.ReactNode }) => (
      <Box variant="panel" padding={2}>
        <Text size="sm" variant="mono">
          {children}
        </Text>
      </Box>
    );

    return (
      <Box gap={4}>
        {(["start", "center", "end", "between", "around", "evenly"] as const).map(
          (justify) => (
            <Box key={justify} gap={1}>
              <Text variant="meta">justify=&quot;{justify}&quot;</Text>
              <Box variant="panel" padding={2}>
                <Box direction="row" gap={2} justify={justify} fullWidth>
                  <Tile>A</Tile>
                  <Tile>B</Tile>
                  <Tile>C</Tile>
                </Box>
              </Box>
            </Box>
          )
        )}
      </Box>
    );
  },
};

/**
 * `shrink={false}` → `flex-none`: ячейка иконки держит ширину, а сосед
 * усекается. Это замена ad-hoc `style={{flexShrink:0}}` (EP-32 §4.3).
 */
export const Shrink: Story = {
  render: () => (
    <Box gap={4} className="max-w-72">
      <Box gap={1}>
        <Text variant="meta">shrink не задан — сжимаются оба</Text>
        <Box variant="panel" padding={2}>
          <Box direction="row" gap={2} align="center">
            <Box align="center" justify="center" className="size-9 rounded-md border">
              <Text variant="meta">9×9</Text>
            </Box>
            <Text size="sm" className="min-w-0 truncate">
              Очень длинный заголовок строки, который вытесняет ячейку иконки
            </Text>
          </Box>
        </Box>
      </Box>
      <Box gap={1}>
        <Text variant="meta">shrink={"{false}"} — иконка держит размер</Text>
        <Box variant="panel" padding={2}>
          <Box direction="row" gap={2} align="center">
            <Box
              shrink={false}
              align="center"
              justify="center"
              className="size-9 rounded-md border"
            >
              <Text variant="meta">9×9</Text>
            </Box>
            <Text size="sm" className="min-w-0 truncate">
              Очень длинный заголовок строки, который вытесняет ячейку иконки
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  ),
};

/** `variant="center"` — центрирование по обеим осям; `inline` не растягивает по ширине. */
export const Center: Story = {
  render: () => (
    <Box gap={4}>
      <Box gap={1}>
        <Text variant="meta">variant=&quot;center&quot; padding={"{6}"}</Text>
        <Box variant="center" padding={6} className="rounded-md border">
          <Text>по центру</Text>
        </Box>
      </Box>
      <Box gap={1}>
        <Text variant="meta">inline — ширина по контенту</Text>
        <Box variant="center" inline padding={4} className="rounded-md border">
          <Text>inline</Text>
        </Box>
      </Box>
    </Box>
  ),
};

/** `variant="panel"` — рамка + фон + скругление; вся разница между панелями в `padding`. */
export const Panel: Story = {
  render: () => (
    <Box gap={3}>
      {([0, 2, 3, 4, 6] as const).map((padding) => (
        <Box key={padding} variant="panel" padding={padding}>
          <Text size="sm" variant="mono">
            padding={padding}
          </Text>
        </Box>
      ))}
    </Box>
  ),
};

/**
 * `variant="grid"` — адаптивная сетка. `columns`/`mdColumns`/`lgColumns` —
 * ступени, а не свободные числа: раскладка меняется вместе с шириной вьюпорта.
 */
export const Grid: Story = {
  render: () => {
    const Tile = ({ children }: { children: React.ReactNode }) => (
      <Box variant="panel" padding={2}>
        <Text size="sm" variant="mono">
          {children}
        </Text>
      </Box>
    );

    return (
      <Box gap={4}>
        <Box gap={1}>
          <Text variant="meta">columns={"{2}"} mdColumns={"{3}"} lgColumns={"{4}"}</Text>
          <Box variant="grid" columns={2} mdColumns={3} lgColumns={4} gap={3}>
            {Array.from({ length: 8 }, (_, index) => (
              <Tile key={index}>{index + 1}</Tile>
            ))}
          </Box>
        </Box>
        <Box gap={1}>
          <Text variant="meta">columns={"{1}"} — одна колонка на любой ширине</Text>
          <Box variant="grid" columns={1} gap={2}>
            <Tile>A</Tile>
            <Tile>B</Tile>
          </Box>
        </Box>
      </Box>
    );
  },
};

/** `as` меняет тег без потери типизации props — полезно для семантики разметки. */
export const PolymorphicAs: Story = {
  render: () => (
    <Box as="section" gap={2}>
      <Text variant="label">as=&quot;section&quot;</Text>
      <Box as="ul" gap={1}>
        <Box as="li">
          <Text size="sm">первый пункт</Text>
        </Box>
        <Box as="li">
          <Text size="sm">второй пункт</Text>
        </Box>
      </Box>
    </Box>
  ),
};
