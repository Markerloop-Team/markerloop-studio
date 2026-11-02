import type { Meta, StoryObj } from "@storybook/react-vite";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "Components/Widgets/Tabs",
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** active, inactive (+hover), disabled, focus-visible (Tab). */
export const States: Story = {
  render: () => (
    <Tabs defaultValue="one" className="w-96">
      <TabsList>
        <TabsTrigger value="one">Active</TabsTrigger>
        <TabsTrigger value="two">Inactive</TabsTrigger>
        <TabsTrigger value="three" disabled>
          Disabled
        </TabsTrigger>
      </TabsList>
      <TabsContent value="one">Content one</TabsContent>
      <TabsContent value="two">Content two</TabsContent>
    </Tabs>
  ),
};

export const LineVariant: Story = {
  render: () => (
    <Tabs defaultValue="one" className="w-96">
      <TabsList variant="line">
        <TabsTrigger value="one">Active</TabsTrigger>
        <TabsTrigger value="two">Inactive</TabsTrigger>
        <TabsTrigger value="three" disabled>
          Disabled
        </TabsTrigger>
      </TabsList>
      <TabsContent value="one">Content one</TabsContent>
      <TabsContent value="two">Content two</TabsContent>
    </Tabs>
  ),
};
