import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";
import { Button } from "../button/button";
import { Input } from "../input/input";
import { Label } from "../label/label";

const meta = {
  title: "Components/Overlays/Sheet",
  component: Sheet,
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Правая панель (дефолт): заголовок, форма, футер с Close. */
export const Right: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Page settings</SheetTitle>
          <SheetDescription>Muted description text.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-4">
          <Label htmlFor="sheet-title">Title</Label>
          <Input id="sheet-title" defaultValue="Home" />
        </div>
        <SheetFooter>
          <Button>Save</Button>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

/** side="left" — навигационный вариант. */
export const Left: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open left</Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Links live here.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};
