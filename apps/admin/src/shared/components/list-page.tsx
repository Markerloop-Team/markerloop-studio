"use client";

import type { ReactNode } from "react";
import { Edit, Eye, Trash2 } from "lucide-react";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";
import { SectionHeader, type SectionCrumb } from "./section-header";

/**
 * ЕДИНЫЙ ПАТТЕРН LIST-СТРАНИЦЫ АДМИНКИ (SDL-457, кластер C аудита EP-51).
 *
 * До этого каждый список был собран по-своему: у users фильтры стояли
 * отдельным блоком НАД таблицей, у permissions — внутри тулбара таблицы,
 * у справочников не было ни шапки с действием, ни карточной ветки на
 * <768px. Пользователь переучивался на каждой странице.
 *
 * Канон, к которому приведены все списки:
 *
 *   1. Шапка — `ListPage`: слева заголовок (h1) и подпись, справа единственное
 *      первичное действие («Создать …»). На <640px шапка складывается в
 *      колонку, действие занимает всю ширину. Форма шапки — ровно та, что
 *      измерена и защищена геометрическим тестом SDL-451/454: менять её
 *      классы без перезамера нельзя.
 *   2. Поиск и фильтры — ТОЛЬКО внутри тулбара таблицы (пропсы
 *      `searchValue`/`onSearchChange` и `filters` у `DataView`).
 *      Отдельного блока фильтров над таблицей быть не должно: он разрывает
 *      связь «фильтр → набор строк» и на узком экране уезжает от таблицы.
 *   3. Таблица — всегда `DataView`, никогда `UI.Table.DataTable`
 *      напрямую: только он даёт карточную ветку на <768px (SDL-449).
 *   4. Действия строки — `ListRowActions`: ghost-иконки в фиксированном
 *      порядке «просмотр → специальное → редактирование → удаление».
 *
 * Шапка — общая шапка раздела админки, SectionHeader (EP-157,
 * shared/components/section-header.tsx): к ней же сведены экраны на китовом
 * `ScreenHeader`, рукописные h1 и шапки со стрелкой назад. Геометрия
 * SDL-451/454 (колонка на телефоне, действие во всю ширину) живёт там.
 */
export interface ListPageProps {
  /** Заголовок страницы, рендерится как `<h1>`. */
  title: ReactNode;
  /** Подпись под заголовком — одна фраза о том, чем управляет экран. */
  description?: ReactNode;
  /** Первичное действие справа: «Создать …». У справочников его нет. */
  actions?: ReactNode;
  /** Крошки — только на странице глубже раздела (справочники). */
  crumbs?: SectionCrumb[];
  /** Тело страницы: таблица и диалоги. */
  children: ReactNode;
}

export function ListPage({ title, description, actions, crumbs, children }: ListPageProps) {
  return (
    <Box gap={5}>
      <SectionHeader title={title} description={description} actions={actions} crumbs={crumbs} />
      {children}
    </Box>
  );
}

export interface ListRowActionsProps {
  /** Переход на деталку. Экрана деталки нет — проп не передаётся. */
  onView?: () => void;
  /**
   * Специальное действие раздела (например «Управление разрешениями»
   * у роли). Стоит между просмотром и редактированием, потому что это
   * навигация, а не мутация.
   */
  extra?: ReactNode;
  onEdit?: () => void;
  /** Переопределение подписи редактирования (справочники правят переводы). */
  editLabel?: string;
  onDelete?: () => void;
}

/**
 * Действия строки списка в каноническом порядке и оформлении.
 *
 * Порядок один на всю админку: просмотр → специальное → редактирование →
 * удаление. Разрушающее действие всегда последнее и всегда крайнее справа —
 * до SDL-457 у ролей «Удалить» стояло четвёртым, а у разрешений вторым, и
 * рука попадала не туда при переходе между списками.
 *
 * Отсутствие действия — это отсутствие пропа, а не другой порядок: у
 * разрешений нет экрана деталки, поэтому нет `onView`; у справочников нет
 * удаления, потому что строки справочника приходят сидом.
 */
export function ListRowActions({
  onView,
  extra,
  onEdit,
  editLabel,
  onDelete,
}: ListRowActionsProps) {
  const t = useTranslations("common");

  return (
    <Box direction="row" align="center" gap={2}>
      {onView ? (
        <UI.Button
          variant="ghost"
          size="icon"
          aria-label={t("view") as string}
          onClick={onView}
        >
          <Eye size={16} />
        </UI.Button>
      ) : null}
      {extra}
      {onEdit ? (
        <UI.Button
          variant="ghost"
          size="icon"
          aria-label={editLabel ?? (t("edit") as string)}
          onClick={onEdit}
        >
          <Edit size={16} />
        </UI.Button>
      ) : null}
      {onDelete ? (
        <UI.Button
          variant="ghost"
          size="icon"
          aria-label={t("delete") as string}
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </UI.Button>
      ) : null}
    </Box>
  );
}
