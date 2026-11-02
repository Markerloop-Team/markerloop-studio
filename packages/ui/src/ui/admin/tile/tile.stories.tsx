import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { Database, FileText, Image as ImageIcon } from "lucide-react";

import { Badge } from "../../internal/components/badge";
import { Tile, TileGrid } from "./tile";

const meta = {
  title: "Admin/Tile",
  component: Tile,
  args: { title: "Tile" },
} satisfies Meta<typeof Tile>;

export default meta;
type Story = StoryObj<typeof meta>;

const Preview = ({ icon: Icon }: { icon: typeof ImageIcon }) => (
  <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-border bg-muted">
    <Icon size={28} aria-hidden="true" className="opacity-40" />
  </span>
);

/** Сетка файлов: тайл-кнопка с превью, мета без «подпись:», бейдж. */
export const FilesGrid: Story = {
  render: () => (
    <TileGrid>
      <Tile media={<Preview icon={ImageIcon} />} title="hero.jpg" meta={["2.4 MB"]} badge={<Badge variant="secondary">Public</Badge>} onClick={() => {}} />
      <Tile media={<Preview icon={FileText} />} title="price-list-october.pdf" meta={["310 KB"]} onClick={() => {}} />
      <Tile media={<Preview icon={ImageIcon} />} title="logo.svg" meta={["12 KB"]} onClick={() => {}} />
    </TileGrid>
  ),
};

/** Выбранный тайл пикера или пресета — ring-2 ring-primary, aria-pressed. */
export const Selected: Story = {
  render: () => {
    const Picker = () => {
      const [picked, setPicked] = React.useState("b");
      return (
        <TileGrid>
          {["a", "b", "c"].map((id) => (
            <Tile
              key={id}
              title={`Preset ${id.toUpperCase()}`}
              meta={["Calm and neutral"]}
              selected={picked === id}
              aria-pressed={picked === id}
              onClick={() => setPicked(id)}
            />
          ))}
        </TileGrid>
      );
    };
    return <Picker />;
  },
};

/** Тайл-ссылка (дашборд, обзор коллекций): значения с sr-only подписями. */
export const Links: Story = {
  render: () => (
    <TileGrid>
      <Tile
        href="#"
        media={<Database size={20} aria-hidden="true" />}
        title="Articles"
        badge={<Badge variant="secondary">Built-in</Badge>}
        meta={[
          <>
            <span className="sr-only">Key: </span>articles
          </>,
          <>
            <span className="sr-only">Records: </span>128
          </>,
        ]}
      />
      <Tile href="#" media={<Database size={20} aria-hidden="true" />} title="Leads" meta={["leads", "4"]} />
    </TileGrid>
  ),
};
