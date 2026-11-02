import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box, FileText, Image as ImageIcon, Layers } from "lucide-react";

import { TreeRow } from "./tree-row";

const meta = {
  title: "Admin/TreeRow",
  component: TreeRow,
  args: { label: "Node" },
} satisfies Meta<typeof TreeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Дерево страницы: отступ 16px/уровень, глиф типа, счётчик детей, выделение. */
export const Tree: Story = {
  render: () => (
    <div className="w-72 rounded-lg border p-1" role="tree">
      <TreeRow
        depth={0}
        icon={<FileText />}
        label="Home"
        childCount={3}
        expandable
        expanded
      />
      <TreeRow
        depth={1}
        icon={<Layers />}
        label="Hero section"
        childCount={2}
        expandable
        expanded
        selected
      />
      <TreeRow depth={2} icon={<ImageIcon />} label="Cover image" />
      <TreeRow depth={2} icon={<Box />} label="Call to action" />
      <TreeRow depth={1} icon={<Layers />} label="Footer" childCount={4} expandable />
    </div>
  ),
};

/** Раскрытие контролирует хост — строка только сообщает о клике по шеврону. */
export const Interactive: Story = {
  render: function InteractiveStory() {
    const [expanded, setExpanded] = React.useState(true);
    const [selected, setSelected] = React.useState("a");
    return (
      <div className="w-72 rounded-lg border p-1" role="tree">
        <TreeRow
          depth={0}
          icon={<FileText />}
          label="Blog"
          childCount={2}
          expandable
          expanded={expanded}
          onExpandedChange={setExpanded}
          selected={selected === "a"}
          onClick={() => setSelected("a")}
        />
        {expanded ? (
          <TreeRow
            depth={1}
            icon={<Box />}
            label="Post list"
            selected={selected === "b"}
            onClick={() => setSelected("b")}
          />
        ) : null}
      </div>
    );
  },
};
