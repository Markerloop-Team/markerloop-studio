import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileText } from "lucide-react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../../internal/components/resizable";
import { StatusIndicator } from "../status-indicator/status-indicator";
import { TreeRow } from "../tree-row/tree-row";
import {
  PanelColumn,
  PanelColumnBody,
  PanelColumnFooter,
  PanelColumnHeader,
} from "./panel-column";

const meta = {
  title: "Admin/PanelColumn",
  component: PanelColumn,
} satisfies Meta<typeof PanelColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Шапка фиксирована, скроллится только тело, футер фиксирован. */
export const Column: Story = {
  render: () => (
    <div className="h-72 w-64 rounded-lg border">
      <PanelColumn>
        <PanelColumnHeader title="Pages" />
        <PanelColumnBody>
          <div className="p-1">
            {Array.from({ length: 20 }, (_, i) => (
              <TreeRow
                key={i}
                icon={<FileText />}
                label={`Page ${i + 1}`}
                selected={i === 2}
              />
            ))}
          </div>
        </PanelColumnBody>
        <PanelColumnFooter>
          <StatusIndicator tone="success">all changes saved</StatusIndicator>
        </PanelColumnFooter>
      </PanelColumn>
    </div>
  ),
};

/** Колонки в ResizablePanelGroup — размер задаёт родитель, колонка заполняет его. */
export const InsideResizable: Story = {
  render: () => (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-72 w-full max-w-2xl rounded-lg border"
    >
      <ResizablePanel defaultSize={30} minSize={20}>
        <PanelColumn>
          <PanelColumnHeader title="Outline" />
          <PanelColumnBody>
            <div className="p-1">
              {Array.from({ length: 12 }, (_, i) => (
                <TreeRow key={i} label={`Node ${i + 1}`} depth={i % 3} />
              ))}
            </div>
          </PanelColumnBody>
        </PanelColumn>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={70}>
        <PanelColumn className="border-r-0">
          <PanelColumnHeader title="Properties" />
          <PanelColumnBody>
            <div className="text-muted-foreground p-3 text-sm">
              Select a node on the left.
            </div>
          </PanelColumnBody>
        </PanelColumn>
      </ResizablePanel>
    </ResizablePanelGroup>
  ),
};
