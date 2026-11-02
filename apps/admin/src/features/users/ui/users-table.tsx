"use client";

import { useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/shared/hooks";
import type { User } from "@/entities/user/model";
import * as UI from "@markerloop/ui/ui";
import { DataView, type DataViewField, type DataViewSort } from "@/shared/components/data-view";
import { ListRowActions } from "@/shared/components/list-page";
import { createIdField } from "@/shared/components/id-cell";
import { RulesEditionCell } from "./rules-edition-cell";

interface UsersTableProps {
  users: User[];
  isLoading?: boolean;
  error?: Error | null;
  sort?: DataViewSort[];
  onSortChange?: (sort: DataViewSort[]) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  /** Фильтры раздела — рендерятся в тулбаре таблицы, а не над ней (SDL-457). */
  filters?: ReactNode;
  onEdit?: (user: User) => void;
  onDelete?: (user: User) => void;
  onView?: (user: User) => void;
  // Серверная пагинация
  manualPagination?: boolean;
  pageCount?: number;
  pageIndex?: number;
  pageSize?: number;
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
  total?: number;
  /**
   * SDL-752: show «Rules edition». Only for holders of
   * users:read:policy_acceptances — without it the column is not rendered.
   */
  showRulesEdition?: boolean;
  /** The contour's edition in force; null — Current/Outdated is not marked. */
  currentEdition?: string | null;
}

export function UsersTable({
  users,
  isLoading = false,
  error = null,
  sort = [],
  onSortChange,
  searchValue = "",
  onSearchChange,
  filters,
  onEdit,
  onDelete,
  onView,
  manualPagination = false,
  pageCount,
  pageIndex,
  pageSize = 10,
  onPaginationChange,
  total,
  showRulesEdition = false,
  currentEdition = null,
}: UsersTableProps) {
  const router = useRouter();
  const t = useTranslations("common");

  const handleView = useCallback(
    (user: User) => {
      if (onView) {
        onView(user);
      } else {
        router.push(`/users/${user.id}`);
      }
    },
    [router, onView]
  );

  const handleEdit = useCallback(
    (user: User) => {
      onEdit?.(user);
    },
    [onEdit]
  );

  const handleDelete = useCallback(
    (user: User) => {
      onDelete?.(user);
    },
    [onDelete]
  );

  const fields = useMemo<DataViewField<User>[]>(
    () => [
      {
        id: "username",
        label: t("username"),
        value: (user) => user.username,
        card: "title",
      },
      {
        id: "email",
        label: t("email"),
        value: (user) => user.email,
        render: (user) =>
          user.email ? (
            <UI.Text as="span">{String(user.email)}</UI.Text>
          ) : (
            <UI.Text as="span" variant="muted" size="sm">
              —
            </UI.Text>
          ),
        card: "field",
      },
      ...(showRulesEdition
        ? [
            {
              id: "rules_edition",
              label: t("rulesEdition"),
              sortable: false,
              render: (user) => (
                <RulesEditionCell version={user.policy_accepted_version} current={currentEdition} />
              ),
              card: "field",
            } satisfies DataViewField<User>,
          ]
        : []),
      {
        id: "email_verified",
        label: t("emailVerifiedStatus"),
        value: (user) => user.email_verified,
        render: (user) => {
          const verified = Boolean(user.email_verified);
          return (
            <UI.Text as="span" variant={verified ? "success" : "danger"} size="sm" weight="medium">
              {verified ? t("yes") : t("no")}
            </UI.Text>
          );
        },
        card: "field",
      },
      {
        id: "created_at",
        label: t("created"),
        value: (user) => user.created_at,
        render: (user) => new Date(String(user.created_at ?? "")).toLocaleDateString("ru-RU"),
        card: "field",
      },
      createIdField<User>(t("id") as string),
      {
        id: "actions",
        label: t("actions"),
        sortable: false,
        render: (user) => (
          <ListRowActions
            onView={onView ? () => handleView(user) : undefined}
            onEdit={onEdit ? () => handleEdit(user) : undefined}
            onDelete={onDelete ? () => handleDelete(user) : undefined}
          />
        ),
        card: "actions",
      },
    ],
    [handleEdit, handleDelete, handleView, onEdit, onDelete, onView, t, showRulesEdition, currentEdition]
  );

  return (
    <DataView
      fields={fields}
      data={users}
      getRowId={(user) => user.id}
      isLoading={isLoading}
      error={error}
      errorMessage={t("errorLoadingUsers")}
      emptyMessage={t("usersNotFound")}
      searchPlaceholder={t("searchUsers")}
      searchValue={searchValue}
      onSearchChange={onSearchChange}
      filters={filters}
      sort={sort}
      onSortChange={onSortChange}
      sortMode={manualPagination ? "server" : "client"}
      paging={
        manualPagination
          ? {
              mode: "server",
              pageIndex: pageIndex ?? 0,
              pageSize,
              total: total ?? users.length,
              pageCount,
              onPageChange: (next) => onPaginationChange?.(next, pageSize),
            }
          : { mode: "client", pageSize, pageIndex, onPageChange: (next) => onPaginationChange?.(next, pageSize) }
      }
      paginationInfo={({ shown }) => (
        <UI.Text variant="muted" size="sm">
          {t("shown")} {shown}{" "}
          {t("of")} {total ?? users.length} {t("usersCount")}
        </UI.Text>
      )}
    />
  );
}
