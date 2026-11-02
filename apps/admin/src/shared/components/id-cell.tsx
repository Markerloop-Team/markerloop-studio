"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { DataViewCardRole, DataViewField } from "@/shared/components/data-view/fields";
import * as UI from "@markerloop/ui/ui";
import { Box } from "@markerloop/ui/ui";
import { useTranslations } from "@/shared/hooks";

/** Сколько символов UUID остаётся видимым. Первый сегмент — 8 знаков. */
const VISIBLE_CHARS = 8;

export function truncateId(value: string): string {
  return value.length > VISIBLE_CHARS ? `${value.slice(0, VISIBLE_CHARS)}…` : value;
}

interface IdChipProps {
  value: string;
}

/**
 * Вторичное представление UUID: усечённый моноширинный чип + копирование.
 *
 * Зачем: до SDL-455 сырой UUID занимал первую и самую широкую колонку каждой
 * таблицы (~270–320px, до 28% ширины) — то, чем человек реально оперирует
 * (имя, email, код), было отодвинуто вправо, а на users-list из-за этого не
 * влезала даже колонка «Действия». При этом скопировать UUID было нечем:
 * он показывался целиком, но только глазами.
 *
 * Полное значение не теряется — оно лежит в `title` и в `data-full-id`,
 * и достаётся кнопкой копирования.
 */
export function IdChip({ value }: IdChipProps) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Буфер обмена недоступен (не-secure context, отказ в правах) — состояние
      // «скопировано» показывать нельзя, значение остаётся в title.
      setCopied(false);
    }
  }, [value]);

  if (!value) {
    return (
      <UI.Text as="span" variant="muted" size="sm">
        —
      </UI.Text>
    );
  }

  return (
    <Box direction="row" align="center" gap={1} className="whitespace-nowrap">
      <UI.Text
        as="span"
        variant="mono"
        size="xs"
        title={value}
        data-full-id={value}
        data-testid="id-chip-value"
      >
        {truncateId(value)}
      </UI.Text>
      <UI.Button
        variant="ghost"
        size="icon"
        aria-label={copied ? (t("copied") as string) : (t("copyId") as string)}
        data-testid="id-chip-copy"
        onClick={handleCopy}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </UI.Button>
    </Box>
  );
}

/**
 * The UUID field of an admin list (a DataView field).
 *
 * One function rather than a copy in every list, so the UUID cannot be fixed
 * in one list and forgotten in two others — the EP-51 audit found the defect
 * in all three at once.
 *
 * It goes AFTER the human-readable fields: the first column is what the row
 * is recognised by (username / name / code).
 */
export function createIdField<TRow extends { id: string }>(
  label: string,
  card: DataViewCardRole | undefined = "field"
): DataViewField<TRow> {
  return {
    id: "id",
    label,
    value: (row) => row.id,
    render: (row) => <IdChip value={String(row.id ?? "")} />,
    card,
  };
}
