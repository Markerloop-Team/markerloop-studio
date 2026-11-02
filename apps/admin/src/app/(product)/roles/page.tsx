"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "@/shared/hooks";
import type { PaginationState } from "@tanstack/react-table";
import { Plus, Settings } from "lucide-react";
import { useRoles, type GetRolesParams } from "@/entities/role/hooks";
import type { Role } from "@/entities/role/model";
import * as UI from "@markerloop/ui/ui";
import { DataView, type DataViewField, type DataViewSort } from "@/shared/components/data-view";
import { ListPage, ListRowActions } from "@/shared/components/list-page";
import { createIdField } from "@/shared/components/id-cell";
import { PagePermissionGuard, PermissionGuard } from "@/shared/components/permission-guard";
import { CreateRoleDialog } from "@/features/roles/create-role-dialog";
import { EditRoleDialog } from "@/features/roles/edit-role-dialog";
import { DeleteRoleDialog } from "@/features/roles/delete-role-dialog";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

export default function RolesPage() {
  const router = useRouter();
  const t = useTranslations("common");
  const tNav = useTranslations("navigation");
  const [sorting, setSorting] = useState<DataViewSort[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // Формируем параметры запроса на основе состояния фильтров, сортировки и пагинации
  const queryParams = useMemo<GetRolesParams>(() => {
    const params: GetRolesParams = {
      page: pagination.pageIndex + 1, // API использует 1-based индексацию
      limit: pagination.pageSize,
    };

    if (globalFilter) {
      params.search = globalFilter;
    }

    if (sorting.length > 0) {
      const sort = sorting[0];
      params.sort_by = sort.field;
      params.sort_order = sort.direction;
    }

    return params;
  }, [pagination, globalFilter, sorting]);

  const { data: rolesResponse, isLoading, error } = useRoles(queryParams);
  const roles = rolesResponse?.roles || [];
  const total = rolesResponse?.total ?? 0;
  const pageCount = rolesResponse?.total ? Math.ceil(total / pagination.pageSize) : 1;

  const handleEdit = useCallback((role: Role) => {
    setSelectedRole(role);
    setEditDialogOpen(true);
  }, []);

  const handleDelete = useCallback((role: Role) => {
    setSelectedRole(role);
    setDeleteDialogOpen(true);
  }, []);

  const handleView = useCallback((role: Role) => {
    router.push(`/roles/${role.id}`);
  }, [router]);

  const handleManagePermissions = useCallback((role: Role) => {
    router.push(`/roles/${role.id}/permissions`);
  }, [router]);

  const fields = useMemo<DataViewField<Role>[]>(
    () => [
      {
        id: "name",
        label: t("name") as string,
        value: (role) => role.name,
        card: "title",
      },
      {
        id: "description",
        label: t("description") as string,
        value: (role) => role.description,
        render: (role) =>
          role.description || (
            <UI.Text as="span" variant="muted" size="sm">
              —
            </UI.Text>
          ),
        card: "field",
      },
      {
        id: "created_at",
        label: t("created") as string,
        value: (role) => role.created_at,
        render: (role) => new Date(role.created_at).toLocaleDateString("ru-RU"),
        card: "field",
      },
      createIdField<Role>(t("id") as string),
      {
        id: "actions",
        label: t("actions") as string,
        sortable: false,
        render: (role) => (
          <ListRowActions
            onView={() => handleView(role)}
            extra={
              <UI.Button
                variant="ghost"
                size="icon"
                aria-label={t("managePermissions") as string}
                onClick={() => handleManagePermissions(role)}
              >
                <Settings size={16} />
              </UI.Button>
            }
            onEdit={() => handleEdit(role)}
            onDelete={() => handleDelete(role)}
          />
        ),
        card: "actions",
      },
    ],
    [handleEdit, handleDelete, handleView, handleManagePermissions, t]
  );

  // Обработка изменения пагинации
  const handlePaginationChange = useCallback((pageIndex: number, pageSize: number) => {
    setPagination({ pageIndex, pageSize });
  }, []);

  // Обработка изменения сортировки с задержкой для дебаунса
  useEffect(() => {
    // Сбрасываем на первую страницу при изменении сортировки или фильтрации
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [sorting, globalFilter]);

  return (
    <PagePermissionGuard permission="roles:read:all">
      <ListPage
        title={tNav("roles") as string}
        description={t("manageRolesSystem") as string}
        actions={
          <PermissionGuard permission="roles:create">
            <UI.Button onClick={() => setCreateDialogOpen(true)}>
              <Plus size={16} />
              {t("createRole") as string}
            </UI.Button>
          </PermissionGuard>
        }
      >
        <DataView
          fields={fields}
          data={roles}
          getRowId={(role) => role.id}
          isLoading={isLoading}
          error={error}
          errorMessage={t("errorLoadingRoles") as string}
          emptyMessage={t("rolesNotFound") as string}
          searchPlaceholder={t("searchRoles") as string}
          searchValue={globalFilter}
          onSearchChange={setGlobalFilter}
          sort={sorting}
          onSortChange={setSorting}
          sortMode="server"
          paging={{
            mode: "server",
            pageIndex: pagination.pageIndex,
            pageSize: pagination.pageSize,
            total,
            pageCount,
            onPageChange: (pageIndex) => handlePaginationChange(pageIndex, pagination.pageSize),
          }}
          paginationInfo={({ shown }) => (
            <UI.Text variant="muted" size="sm">
              {t("shown") as string} {shown} {t("of") as string} {total}{" "}
              {t("rolesCount") as string}
            </UI.Text>
          )}
        />

        {/* Модальные окна */}
        <CreateRoleDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
        <EditRoleDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          role={selectedRole}
        />
        <DeleteRoleDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          role={selectedRole}
        />
      </ListPage>
    </PagePermissionGuard>
  );
}
