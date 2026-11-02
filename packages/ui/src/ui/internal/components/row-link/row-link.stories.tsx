import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronRight } from "lucide-react";

// The source panel is copy-pasted by consumers, so it may only contain names
// the published API has (SDL-246/247). `RowLink` is not exported at all: the
// row form is reached as `Link` with `variant="row"` (the default), which is
// what the title `Link.Row` spells out. The title may keep naming the access
// path — `story-titles.test.ts` resolves only its ROOT, and `story-coverage`
// keys on the title precisely so a facade variant can be advertised this way.
// What a story RENDERS is the separate contract, and it is this one.
import { Badge, Link } from "../../../index";

const meta = {
  title: "Components/Widgets/Link.Row",
  component: Link,
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * next/link в Storybook подменён plain-<a> моком (.storybook/next-link-mock).
 * hover:bg-accent и focus-visible ring живут на классах — проверяются Tab-ом.
 *
 * `variant="row"` — форма по умолчанию, здесь указана явно, чтобы панель
 * исходника читалась однозначно рядом с `variant="action-card"`.
 */
export const Default: Story = {
  render: () => (
    <div className="max-w-md space-y-2">
      <Link variant="row" href="/studio/pages/home">
        <span>Home</span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </Link>
      <Link variant="row" href="/studio/pages/pricing">
        <span className="flex items-center gap-2">
          Pricing
          <Badge tone="orange">draft</Badge>
        </span>
        <ChevronRight size={16} className="text-muted-foreground" />
      </Link>
    </div>
  ),
};
