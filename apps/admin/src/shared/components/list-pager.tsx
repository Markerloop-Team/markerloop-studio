"use client";

import { Box, Button, Text } from "@markerloop/ui/ui";

/**
 * Единственный пейджер админки (SDL-458, вторая половина).
 *
 * До этого их было три, с почти одинаковой разметкой и тремя разными
 * наборами английских дефолтов: `DataView` (мобильная ветка,
 * «1 / 14»), `RecordsTable` («Page 1» + пара кнопок справа) и
 * `AssetsLibrary` («Prev» вместо «Previous»; удалена в SDL-625 вместе с
 * панелью ассетов коллекций, теперь вызывающих два). Аудит EP-51 (кластер C)
 * поймал их как «три системы пагинации»: видимого дефекта у двух
 * последних не было — вызывающие передавали русские подписи, — но любая
 * правка поведения пейджера требовала трёх одинаковых правок, и третья
 * систематически отставала.
 *
 * Канонический вид: «кнопка назад — индикатор — кнопка вперёд», по краям
 * контейнера. Индикатор — `<слово> N` и, если вызывающий знает общее
 * число страниц, ` / M`. Числа сервер отдаёт не всегда: `RecordsTable`
 * знает только `hasMore`, потому что `GET /records` общего количества не
 * возвращает, — поэтому `totalPages` необязателен, а не подставляется
 * единицей.
 *
 * Компонент презентационный и НЕ зовёт `useTranslations`: он рендерится
 * внутри `widgets/collections`, который по своему устройству не знает про
 * next-intl и живёт в смоук-харнессе без провайдера (`smoke:collections`).
 * Подписи приходят пропсами; каталог до них доводит вызывающий.
 */
export interface ListPagerLabels {
  previous: string;
  next: string;
  /** Слово перед номером: «Страница 3 / 14». */
  page: string;
}

/**
 * Единственный английский фолбэк на весь пейджер — на случай вызывающего,
 * который подписи не передал (фикстуры смоука, сторонний хост модуля
 * коллекций). Раньше таких наборов было три, и они успели разойтись:
 * `AssetsLibrary` показывала «Prev», остальные — «Previous».
 *
 * В самой админке он не должен доезжать до разметки: оба вызывающих
 * берут строки из next-intl, и это стережёт `smoke:pager-i18n`.
 */
export const PAGER_FALLBACK_LABELS: ListPagerLabels = {
  previous: "Previous",
  next: "Next",
  page: "Page",
};

export interface ListPagerProps {
  /** Номер текущей страницы, 1-based — как его видит человек. */
  page: number;
  /** Всего страниц; не передан — индикатор рисуется без « / M». */
  totalPages?: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  labels?: Partial<ListPagerLabels>;
  /** Обрамление задаёт вызывающий: у списка и у панели оно разное. */
  className?: string;
}

export function ListPager({
  page,
  totalPages,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  labels,
  className,
}: ListPagerProps) {
  const previousLabel = labels?.previous ?? PAGER_FALLBACK_LABELS.previous;
  const nextLabel = labels?.next ?? PAGER_FALLBACK_LABELS.next;
  const pageLabel = labels?.page ?? PAGER_FALLBACK_LABELS.page;

  return (
    <Box
      direction="row"
      align="center"
      justify="between"
      gap={2}
      className={className}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasPrev}
        onClick={onPrev}
      >
        {previousLabel}
      </Button>

      <Text as="span" variant="muted" size="sm">
        {pageLabel} {page}
        {typeof totalPages === "number" ? ` / ${totalPages}` : ""}
      </Text>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!hasNext}
        onClick={onNext}
      >
        {nextLabel}
      </Button>
    </Box>
  );
}
