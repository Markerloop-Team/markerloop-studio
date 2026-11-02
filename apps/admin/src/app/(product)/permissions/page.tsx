"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslations } from "@/shared/hooks";
import type { PaginationState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { usePermissions, type GetPermissionsParams } from "@/entities/permission/hooks";
import type { Permission } from "@/entities/permission/model";
import * as UI from "@markerloop/ui/ui";
import { DataView, type DataViewField, type DataViewSort } from "@/shared/components/data-view";
import { ListPage, ListRowActions } from "@/shared/components/list-page";
import { createIdField } from "@/shared/components/id-cell";
import { PagePermissionGuard, PermissionGuard } from "@/shared/components/permission-guard";
import { CreatePermissionDialog } from "@/features/permissions/create-permission-dialog";
import { EditPermissionDialog } from "@/features/permissions/edit-permission-dialog";
import { DeletePermissionDialog } from "@/features/permissions/delete-permission-dialog";

// Отключаем статическую генерацию для этой страницы
export const dynamic = "force-dynamic";

export default function PermissionsPage() {
  const t = useTranslations("common");
  const tNav = useTranslations("navigation");
  const [sorting, setSorting] = useState<DataViewSort[]>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null);

  // Формируем параметры запроса на основе состояния фильтров, сортировки и пагинации
  const queryParams = useMemo<GetPermissionsParams>(() => {
    const params: GetPermissionsParams = {
      page: pagination.pageIndex + 1, // API использует 1-based индексацию
      limit: pagination.pageSize,
    };

    if (globalFilter) {
      params.search = globalFilter;
    }

    if (methodFilter !== "all") {
      params.method = methodFilter;
    }

    if (sorting.length > 0) {
      const sort = sorting[0];
      params.sort_by = sort.field;
      params.sort_order = sort.direction;
    }

    return params;
  }, [pagination, globalFilter, methodFilter, sorting]);

  const { data: permissionsResponse, isLoading, error } = usePermissions(queryParams);
  const permissions = permissionsResponse?.permissions || [];
  const total = permissionsResponse?.total ?? 0;
  const pageCount = permissionsResponse?.total ? Math.ceil(total / pagination.pageSize) : 1;

  const handleEdit = useCallback((permission: Permission) => {
    setSelectedPermission(permission);
    setEditDialogOpen(true);
  }, []);

  const handleDelete = useCallback((permission: Permission) => {
    setSelectedPermission(permission);
    setDeleteDialogOpen(true);
  }, []);

  const fields = useMemo<DataViewField<Permission>[]>(
    () => [
      {
        id: "code",
        label: t("code") as string,
        value: (permission) => permission.code,
        render: (permission) => (
          <UI.Text as="span" variant="mono" size="sm">
            {String(permission.code ?? "")}
          </UI.Text>
        ),
        card: "title",
      },
      {
        id: "method",
        label: t("method") as string,
        value: (permission) => permission.method,
        render: (permission) => {
          const method = permission.method;
          return (
            <UI.Badge
              variant="outline"
              tone={
                method === "DELETE"
                  ? "red"
                  : method === "POST"
                    ? "green"
                    : method === "PUT"
                      ? "orange"
                      : undefined
              }
            >
              {method}
            </UI.Badge>
          );
        },
        card: "field",
      },
      {
        id: "path",
        label: t("path") as string,
        value: (permission) => permission.path,
        render: (permission) => (
          <UI.Text as="span" variant="mono" size="sm">
            {String(permission.path ?? "")}
          </UI.Text>
        ),
        card: "field",
      },
      {
        id: "description",
        label: t("description") as string,
        value: (permission) => permission.description,
        render: (permission) =>
          permission.description || (
            <UI.Text as="span" variant="muted" size="sm">
              —
            </UI.Text>
          ),
        card: "field",
      },
      createIdField<Permission>(t("id") as string),
      {
        id: "actions",
        label: t("actions") as string,
        sortable: false,
        render: (permission) => (
          <ListRowActions
            onEdit={() => handleEdit(permission)}
            onDelete={() => handleDelete(permission)}
          />
        ),
        card: "actions",
      },
    ],
    [handleEdit, handleDelete, t]
  );

  // Обработка изменения пагинации
  const handlePaginationChange = useCallback((pageIndex: number, pageSize: number) => {
    setPagination({ pageIndex, pageSize });
  }, []);

  // Обработка изменения сортировки или фильтрации - сбрасываем на первую страницу
  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [sorting, globalFilter, methodFilter]);

  return (
    <PagePermissionGuard permission="permissions:read:all">
      <ListPage
        title={tNav("permissions") as string}
        description={t("managePermissionsSystem") as string}
        actions={
          <PermissionGuard permission="permissions:create">
            <UI.Button onClick={() => setCreateDialogOpen(true)}>
              <Plus size={16} />
              {t("createPermission") as string}
            </UI.Button>
          </PermissionGuard>
        }
      >
        <DataView
          fields={fields}
          data={permissions}
          getRowId={(permission) => permission.id}
          isLoading={isLoading}
          error={error}
          errorMessage={t("errorLoadingPermissions") as string}
          emptyMessage={t("permissionsNotFound") as string}
          searchPlaceholder={t("searchPermissions") as string}
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
          filters={
            <UI.FormControl.Select.Root value={methodFilter} onValueChange={setMethodFilter}>
              <UI.FormControl.Select.Trigger width={180}>
                <UI.FormControl.Select.Value placeholder={t("httpMethod") as string} />
              </UI.FormControl.Select.Trigger>
              <UI.FormControl.Select.Content>
                <UI.FormControl.Select.Item value="all">
                  {t("allMethods") as string}
                </UI.FormControl.Select.Item>
                <UI.FormControl.Select.Item value="GET">GET</UI.FormControl.Select.Item>
                <UI.FormControl.Select.Item value="POST">POST</UI.FormControl.Select.Item>
                <UI.FormControl.Select.Item value="PUT">PUT</UI.FormControl.Select.Item>
                <UI.FormControl.Select.Item value="DELETE">DELETE</UI.FormControl.Select.Item>
                <UI.FormControl.Select.Item value="PATCH">PATCH</UI.FormControl.Select.Item>
              </UI.FormControl.Select.Content>
            </UI.FormControl.Select.Root>
          }
          paginationInfo={({ shown }) => (
            <UI.Text variant="muted" size="sm">
              {t("shown") as string} {shown} {t("of") as string} {total}{" "}
              {t("permissionsCount2") as string}
            </UI.Text>
          )}
        />

        {/* Модальные окна */}
        <CreatePermissionDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
        <EditPermissionDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          permission={selectedPermission}
        />
        <DeletePermissionDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          permission={selectedPermission}
        />
      </ListPage>
    </PagePermissionGuard>
  );
}
