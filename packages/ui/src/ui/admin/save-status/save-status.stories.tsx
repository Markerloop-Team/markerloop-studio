import type { Meta, StoryObj } from "@storybook/react-vite";

import { SaveStatus, type SaveStatusState } from "./save-status";

const meta = {
  title: "Admin/SaveStatus",
  component: SaveStatus,
} satisfies Meta<typeof SaveStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Все состояния чипа: тон и слово задаёт state, цвета — токены темы. */
export const States: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      {(
        [
          "saved",
          "saving",
          "unsaved",
          "loading",
          "error",
          "conflict",
        ] satisfies SaveStatusState[]
      ).map((state) => (
        <SaveStatus key={state} state={state} />
      ))}
    </div>
  ),
};

/** Деталь ошибки уезжает в title — чип остаётся одним коротким словом. */
export const ErrorWithDetail: Story = {
  render: () => (
    <SaveStatus state="error" detail="PUT /api/sauna/pages/pricing → 500" />
  ),
};

/** bare-вариант — точка + слово без пилюли, для тесных мобильных баров. */
export const Bare: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <SaveStatus variant="bare" state="saved" />
      <SaveStatus variant="bare" state="saving" />
      <SaveStatus variant="bare" state="error" />
    </div>
  ),
};

/** label переопределяет слово состояния, тон остаётся от state. */
export const CustomLabel: Story = {
  render: () => <SaveStatus state="conflict" label="reload required" />,
};
