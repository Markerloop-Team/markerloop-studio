import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const meta = {
  title: "Components/Data/Table",
  component: Table,
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

/** hover строки — курсор; selected — data-state. */
export const States: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Default row</TableCell>
          <TableCell>—</TableCell>
        </TableRow>
        <TableRow data-state="selected">
          <TableCell>Selected row</TableCell>
          <TableCell>data-state=selected</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
