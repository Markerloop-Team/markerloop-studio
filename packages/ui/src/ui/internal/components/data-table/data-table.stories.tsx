import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

import { Badge } from "../badge/badge";
import { DataTable } from "./data-table";

type Page = {
  title: string;
  slug: string;
  status: "published" | "draft";
  updated: string;
};

const meta = {
  title: "Components/Data/Table.DataTable",
  component: DataTable,
} satisfies Meta<typeof DataTable>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Клиентские поиск/сортировка/пагинация; сорт-кнопка — focus-visible Tab-ом.
 *
 * Колонки и данные объявлены ВНУТРИ render: панель Source показывает тело
 * истории и ничего больше, поэтому общий `columns` уровня модуля пришёл бы
 * консьюмеру как неразрешимая ссылка (SDL-248). Истории состояний ниже держат
 * СВОЙ короткий `columns` — там предмет истории не колонки, а флаг состояния.
 */
export const Default: Story = {
  render: () => {
    const columns: ColumnDef<Page>[] = [
      { accessorKey: "title", header: "Title" },
      { accessorKey: "slug", header: "Slug", enableSorting: false },
      {
        accessorKey: "status",
        header: "Status",
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={row.original.status === "published" ? "green" : "orange"}>
            {row.original.status}
          </Badge>
        ),
      },
      { accessorKey: "updated", header: "Updated", enableSorting: false },
    ];

    const pages: Page[] = [
      { title: "Home", slug: "/", status: "published", updated: "1 Aug 2026" },
      { title: "Pricing", slug: "/pricing", status: "published", updated: "28 Jul 2026" },
      { title: "About us", slug: "/about", status: "draft", updated: "27 Jul 2026" },
      { title: "Blog", slug: "/blog", status: "published", updated: "25 Jul 2026" },
      { title: "Contacts", slug: "/contacts", status: "draft", updated: "24 Jul 2026" },
      { title: "Careers", slug: "/careers", status: "draft", updated: "22 Jul 2026" },
      { title: "Terms", slug: "/terms", status: "published", updated: "20 Jul 2026" },
      { title: "Privacy", slug: "/privacy", status: "published", updated: "18 Jul 2026" },
      { title: "Changelog", slug: "/changelog", status: "draft", updated: "15 Jul 2026" },
      { title: "Docs", slug: "/docs", status: "published", updated: "12 Jul 2026" },
      { title: "Support", slug: "/support", status: "draft", updated: "10 Jul 2026" },
      { title: "Status", slug: "/status", status: "published", updated: "8 Jul 2026" },
    ];

    const Demo = () => {
      const [search, setSearch] = React.useState("");
      const [sorting, setSorting] = React.useState<SortingState>([]);
      return (
        <DataTable
          columns={columns}
          data={pages}
          pageSize={5}
          searchValue={search}
          onSearchChange={setSearch}
          sorting={sorting}
          onSortingChange={(updater) =>
            setSorting((old) =>
              typeof updater === "function" ? updater(old) : updater
            )
          }
          manualFiltering={false}
        />
      );
    };
    return <Demo />;
  },
};

/** isLoading: строки-скелетоны вместо данных. */
export const Loading: Story = {
  render: () => {
    const columns: ColumnDef<Page>[] = [
      { accessorKey: "title", header: "Title" },
      { accessorKey: "slug", header: "Slug", enableSorting: false },
    ];
    return <DataTable columns={columns} data={[]} isLoading showSearch={false} />;
  },
};

/** Пустой результат: emptyMessage в колспан-ячейке. */
export const Empty: Story = {
  render: () => {
    const columns: ColumnDef<Page>[] = [
      { accessorKey: "title", header: "Title" },
      { accessorKey: "slug", header: "Slug", enableSorting: false },
    ];
    return (
      <DataTable
        columns={columns}
        data={[]}
        showSearch={false}
        emptyMessage="No pages yet"
      />
    );
  },
};

/** Ошибка загрузки: text-destructive, таблица не рендерится. */
export const ErrorState: Story = {
  render: () => {
    const columns: ColumnDef<Page>[] = [
      { accessorKey: "title", header: "Title" },
      { accessorKey: "slug", header: "Slug", enableSorting: false },
    ];
    return (
      <DataTable
        columns={columns}
        data={[]}
        error={new Error("boom")}
        errorMessage="Failed to load pages"
      />
    );
  },
};
