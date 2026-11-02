"use client";

import { withBasePath } from "@/demo/config";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslations } from "@/shared/hooks";
import type { PaginationState } from "@tanstack/react-table";
import type { DataViewSort } from "@/shared/components/data-view";
import { Plus } from "lucide-react";
import { useUsers } from "@/entities/user/hooks";
import type { User } from "@/entities/user/model";
import type { GetUsersParams } from "@/entities/user/api/user-api";
import { Button } from "@markerloop/ui/ui";
import { ListPage } from "@/shared/components/list-page";
import { PagePermissionGuard, PermissionGuard } from "@/shared/components/permission-guard";
import { CreateUserDialog } from "@/features/users/create-user-dialog";
import { EditUserDialog } from "@/features/users/edit-user-dialog";
import { DeleteUserDialog } from "@/features/users/delete-user-dialog";
import { UsersTable, UserFilters } from "@/features/users/ui";
import { useHasPermission } from "@/shared/hooks";
import {
  editionInForce,
  POLICY_JOURNAL_PERMISSION,
} from "@/entities/policy-acceptance";
import { usePolicyEdition } from "@/entities/policy";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

export default function UsersPage() {
  const t = useTranslations("common");
  const tNav = useTranslations("navigation");
  const [sorting, setSorting] = useState<DataViewSort[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [emailVerifiedFilter, setEmailVerifiedFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  // SDL-752: «Rules edition» comes with the list itself, no extra request;
  // without the journal right the column is simply not rendered.
  const canSeeRulesEdition = useHasPermission(POLICY_JOURNAL_PERMISSION);
  const policyEdition = usePolicyEdition();

  // Преобразуем фильтры в параметры для серверной фильтрации, сортировки и пагинации
  const queryParams = useMemo<GetUsersParams>(() => {
    const params: GetUsersParams = {
      page: pagination.pageIndex + 1, // API использует 1-based индексацию
      limit: pagination.pageSize,
    };

    // Поиск
    if (globalFilter) {
      params.search = globalFilter;
    }

    // Фильтр по email_verified
    if (emailVerifiedFilter !== "all") {
      params.email_verified = emailVerifiedFilter === "verified";
    }

    // Фильтр по дате создания
    if (dateFilter !== "all") {
      const now = new Date();
      const filterDate = new Date();

      switch (dateFilter) {
        case "today":
          filterDate.setHours(0, 0, 0, 0);
          params.date_from = filterDate.toISOString();
          break;
        case "week":
          filterDate.setDate(now.getDate() - 7);
          params.date_from = filterDate.toISOString();
          break;
        case "month":
          filterDate.setMonth(now.getMonth() - 1);
          params.date_from = filterDate.toISOString();
          break;
        case "year":
          filterDate.setFullYear(now.getFullYear() - 1);
          params.date_from = filterDate.toISOString();
          break;
      }
    }

    // Сортировка
    if (sorting.length > 0) {
      const sort = sorting[0];
      params.sort_by = sort.field;
      params.sort_order = sort.direction;
    }

    return params;
  }, [pagination, globalFilter, emailVerifiedFilter, dateFilter, sorting]);

  // Загружаем пользователей с серверной фильтрацией, сортировкой и пагинацией
  const { data, isLoading, error } = useUsers(queryParams);

  // Используем данные напрямую (фильтрация на сервере)
  const filteredUsers = data?.users || [];
  const total = data?.total ?? 0;
  const pageCount = data?.total ? Math.ceil(total / pagination.pageSize) : 1;

  // Обработка изменения пагинации
  const handlePaginationChange = useCallback((pageIndex: number, pageSize: number) => {
    setPagination({ pageIndex, pageSize });
  }, []);

  // Обработка изменения сортировки или фильтрации - сбрасываем на первую страницу
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [sorting, globalFilter, emailVerifiedFilter, dateFilter]);

  const handleEdit = useCallback((user: User) => {
    setSelectedUser(user);
    setEditDialogOpen(true);
  }, []);

  const handleDelete = useCallback((user: User) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  }, []);

  const handleView = useCallback((user: User) => {
    window.location.href = withBasePath(`/users/${user.id}`);
  }, []);

  const handleResetFilters = useCallback(() => {
    setEmailVerifiedFilter("all");
    setDateFilter("all");
    setGlobalFilter("");
  }, []);

  return (
    <PagePermissionGuard permission="users:read:all">
      <ListPage
        title={tNav("users")}
        description={t("manageUsersSystem")}
        actions={
          <PermissionGuard permission="users:create">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus size={16} />
              {t("createUser")}
            </Button>
          </PermissionGuard>
        }
      >
        <UsersTable
          users={filteredUsers}
          isLoading={isLoading}
          error={error}
          sort={sorting}
          onSortChange={setSorting}
          searchValue={globalFilter}
          onSearchChange={setGlobalFilter}
          filters={
            <UserFilters
              emailVerifiedFilter={emailVerifiedFilter}
              dateFilter={dateFilter}
              onEmailVerifiedFilterChange={setEmailVerifiedFilter}
              onDateFilterChange={setDateFilter}
              onResetFilters={handleResetFilters}
            />
          }
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          manualPagination={true}
          pageCount={pageCount}
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          onPaginationChange={handlePaginationChange}
          total={total}
          showRulesEdition={canSeeRulesEdition}
          currentEdition={editionInForce(policyEdition?.version)}
        />

        {/* Модальные окна */}
        <CreateUserDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
        <EditUserDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          user={selectedUser}
        />
        <DeleteUserDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          user={selectedUser}
        />
      </ListPage>
    </PagePermissionGuard>
  );
}
