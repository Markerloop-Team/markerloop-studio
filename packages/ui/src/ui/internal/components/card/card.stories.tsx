import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../button/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "Components/Primitives/Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Поверхность bg-card + border; составные слоты Header/Content/Footer. */
export const Default: Story = {
  render: () => (
    <Card maxWidth={360}>
      <CardHeader>
        <CardTitle>Site settings</CardTitle>
        <CardDescription>Domain, favicon and metadata.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">Content area of the card.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Save</Button>
      </CardFooter>
    </Card>
  ),
};

/** CardAction: правый верхний слот в grid-шапке. */
export const WithAction: Story = {
  render: () => (
    <Card maxWidth={360}>
      <CardHeader>
        <CardTitle>Blocks</CardTitle>
        <CardDescription>Reusable project blocks.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            New
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">12 blocks</p>
      </CardContent>
    </Card>
  ),
};
