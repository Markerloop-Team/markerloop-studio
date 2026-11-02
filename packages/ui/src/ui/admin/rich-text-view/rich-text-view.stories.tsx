import type { Meta, StoryObj } from "@storybook/react-vite";

import { RichTextView } from "./rich-text-view";

const meta = {
  title: "Admin/RichTextView",
  component: RichTextView,
} satisfies Meta<typeof RichTextView>;

export default meta;
type Story = StoryObj<typeof meta>;

const t = (text: string, marks?: Array<Record<string, unknown>>) => ({
  type: "text",
  text,
  ...(marks ? { marks } : {}),
});

/** Every node and mark of the pm/1 canon (go-sdk pkg/richtext). */
export const AllNodes: Story = {
  args: {
    value: {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [t("Release notes")] },
        {
          type: "paragraph",
          content: [
            t("Plain, "),
            t("bold", [{ type: "bold" }]),
            t(", "),
            t("italic", [{ type: "italic" }]),
            t(", "),
            t("inline code", [{ type: "code" }]),
            t(" and "),
            t("a link", [{ type: "link", attrs: { href: "https://markerloop.com" } }]),
            t("."),
          ],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [t("First")] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [t("Second")] }] },
          ],
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [t("Third")] }] },
          ],
        },
        { type: "blockquote", content: [{ type: "paragraph", content: [t("A quote.")] }] },
        { type: "codeBlock", attrs: { language: "ts" }, content: [t("const x = 1;")] },
      ],
    },
  },
};

/** A refused scheme keeps its words and loses the link. */
export const RejectedLink: Story = {
  args: {
    value: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [t("click me", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])],
        },
      ],
    },
  },
};
