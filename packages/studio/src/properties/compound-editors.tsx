"use client";

// List editors for the compound Elements (SDL-633): the items of a
// `TabsView` / `AccordionView` and the grid of a `TableView`. Until these
// existed the panel drew both as a raw JSON textarea.
//
// Items are bound to the node's children BY POSITION (engine
// `compounds.ts`), so this editor never writes `items` wholesale for a
// structural change: add, delete and reorder are the store's `compoundItems`
// op, which changes the item and its content child in one edit. A heading
// or a text moves nothing and is that op's "set". Every action also drops
// `items` stored in a width or member override, so the one list shown here
// is what every width and every visitor gets.
//
// The table has no children; its editor is an ordinary `PropEditor` over
// `rows`, rewriting the grid through `table-model.ts`.

import { type ChangeEvent, type ReactNode } from "react";

import { Button, FormControl, Text } from "@markerloop/ui/ui";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, X } from "../icons";
import { StudioIconButton } from "../panel-parts";
import {
  addTableColumn,
  addTableRow,
  moveTableColumn,
  moveTableRow,
  readTableGrid,
  removeTableColumn,
  removeTableRow,
  setTableCell,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  tableWidth,
} from "./table-model";
import type { PropEditor } from "./types";

const { Input, Textarea } = FormControl;
const controlCls = "h-8 max-md:text-xs md:text-xs";

export type CompoundItem = { label: string; text: string };

/** Stored `items` → the list the editor shows; anything malformed reads as an empty string. */
export function readCompoundItems(value: unknown): CompoundItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((it) => {
    const o = it && typeof it === "object" ? (it as Record<string, unknown>) : {};
    return { label: typeof o.label === "string" ? o.label : "", text: typeof o.text === "string" ? o.text : "" };
  });
}

export type CompoundItemsEditorProps = {
  /** `TabsView` → "Tab", `AccordionView` → "Item": the noun the buttons use. */
  noun: string;
  items: CompoundItem[];
  max: number;
  disabled?: boolean;
  /** A heading or text changed: the whole next list (same length), written with the `compoundItems` "set" op. */
  onEdit: (next: CompoundItem[]) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  /** Whether a move is allowed (a stored document with holes can refuse one). */
  canMove: (from: number, to: number) => boolean;
  /** Shown above the list, e.g. "items are the same at every width". */
  note?: ReactNode;
};

export function CompoundItemsEditor(p: CompoundItemsEditorProps): ReactNode {
  const edit = (i: number, patch: Partial<CompoundItem>) =>
    p.onEdit(p.items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div className="flex flex-col gap-2 text-xs" data-sauna-prop="items" data-sauna-items-editor="">
      <Text as="span" size="xs" variant="muted">
        {p.noun}s ({p.items.length})
      </Text>
      {p.note}
      <ol className="flex flex-col gap-2">
        {p.items.map((item, i) => (
          <li
            key={i}
            className="flex flex-col gap-1 rounded-md border border-border p-2"
            data-sauna-item={i}
          >
            <div className="flex items-center gap-1">
              <Input
                type="text"
                className={controlCls}
                aria-label={`${p.noun} ${i + 1} heading`}
                data-sauna-item-label=""
                value={item.label}
                maxLength={p.noun === "Tab" ? 80 : 200}
                disabled={p.disabled}
                onChange={(e: ChangeEvent<HTMLInputElement>) => edit(i, { label: e.target.value })}
              />
              <StudioIconButton
                label={`Move ${p.noun.toLowerCase()} ${i + 1} up`}
                data-sauna-item-up=""
                disabled={p.disabled || i === 0 || !p.canMove(i, i - 1)}
                onClick={() => p.onMove(i, i - 1)}
              >
                <ArrowUp />
              </StudioIconButton>
              <StudioIconButton
                label={`Move ${p.noun.toLowerCase()} ${i + 1} down`}
                data-sauna-item-down=""
                disabled={p.disabled || i === p.items.length - 1 || !p.canMove(i, i + 1)}
                onClick={() => p.onMove(i, i + 1)}
              >
                <ArrowDown />
              </StudioIconButton>
              <StudioIconButton
                label={`Delete ${p.noun.toLowerCase()} ${i + 1} and its content`}
                data-sauna-item-remove=""
                disabled={p.disabled || p.items.length <= 1}
                onClick={() => p.onRemove(i)}
              >
                <X />
              </StudioIconButton>
            </div>
            <Textarea
              className="min-h-12 max-md:text-xs md:text-xs"
              aria-label={`${p.noun} ${i + 1} text`}
              data-sauna-item-text=""
              rows={2}
              value={item.text}
              maxLength={4000}
              disabled={p.disabled}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => edit(i, { text: e.target.value })}
            />
            {item.label.trim() === "" ? (
              <Text as="span" size="xs" variant="muted" data-sauna-item-empty="">
                A heading is required: while one is empty, the whole {p.noun === "Tab" ? "Tabs" : "Accordion"} block draws
                an error frame instead of its content, on the canvas and on the published page.
              </Text>
            ) : null}
          </li>
        ))}
      </ol>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="self-start"
        data-sauna-item-add=""
        disabled={p.disabled || p.items.length >= p.max}
        onClick={p.onAdd}
      >
        <Plus /> Add {p.noun.toLowerCase()}
      </Button>
      <Text as="span" size="xs" variant="muted">
        Blocks dropped into the {p.noun.toLowerCase()}&apos;s content in the outline stay with it when it moves or is deleted.
      </Text>
    </div>
  );
}

/** The `rows` of a `TableView`: columns (rename via the header row, move, delete) and rows (cells, move, delete). */
export const TableRowsEditor: PropEditor = ({ value, onChange, allProps, disabled }) => {
  const grid = readTableGrid(value);
  const width = tableWidth(grid);
  const header = allProps.header === true;
  const bodyStart = header ? 1 : 0;
  const colName = (j: number) => (header ? grid[0]?.[j] ?? "" : "");
  const commit = (next: string[][]) => {
    if (next !== grid) onChange(next);
  };
  return (
    <div className="flex flex-col gap-3 text-xs" data-sauna-prop="rows" data-sauna-table-editor="">
      <div className="flex flex-col gap-1">
        <Text as="span" size="xs" variant="muted">
          Columns ({width})
        </Text>
        <ol className="flex flex-col gap-1">
          {Array.from({ length: width }, (_, j) => (
            <li key={j} className="flex items-center gap-1" data-sauna-col={j}>
              {header ? (
                <Input
                  type="text"
                  className={controlCls}
                  aria-label={`Column ${j + 1} name`}
                  data-sauna-col-name=""
                  value={colName(j)}
                  maxLength={500}
                  disabled={disabled}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => commit(setTableCell(grid, 0, j, e.target.value))}
                />
              ) : (
                <Text as="span" size="xs" className="flex-1">
                  Column {j + 1}
                </Text>
              )}
              <StudioIconButton
                label={`Move column ${j + 1} left`}
                data-sauna-col-left=""
                disabled={disabled || j === 0}
                onClick={() => commit(moveTableColumn(grid, j, j - 1))}
              >
                <ArrowLeft />
              </StudioIconButton>
              <StudioIconButton
                label={`Move column ${j + 1} right`}
                data-sauna-col-right=""
                disabled={disabled || j === width - 1}
                onClick={() => commit(moveTableColumn(grid, j, j + 1))}
              >
                <ArrowRight />
              </StudioIconButton>
              <StudioIconButton
                label={`Delete column ${j + 1}`}
                data-sauna-col-remove=""
                disabled={disabled || width <= 1}
                onClick={() => commit(removeTableColumn(grid, j))}
              >
                <X />
              </StudioIconButton>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          data-sauna-col-add=""
          disabled={disabled || width >= TABLE_MAX_COLUMNS}
          onClick={() => commit(addTableColumn(grid))}
        >
          <Plus /> Add column
        </Button>
        {!header ? (
          <Text as="span" size="xs" variant="muted">
            Turn on “header” to name the columns.
          </Text>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Text as="span" size="xs" variant="muted">
          Rows ({grid.length - bodyStart})
        </Text>
        <ol className="flex flex-col gap-2">
          {grid.slice(bodyStart).map((row, k) => {
            const i = k + bodyStart;
            return (
              <li key={i} className="flex flex-col gap-1 rounded-md border border-border p-2" data-sauna-row={k}>
                <div className="flex items-center gap-1">
                  <Text as="span" size="xs" variant="muted" className="flex-1">
                    Row {k + 1}
                  </Text>
                  <StudioIconButton
                    label={`Move row ${k + 1} up`}
                    data-sauna-row-up=""
                    disabled={disabled || i === bodyStart}
                    onClick={() => commit(moveTableRow(grid, i, i - 1))}
                  >
                    <ArrowUp />
                  </StudioIconButton>
                  <StudioIconButton
                    label={`Move row ${k + 1} down`}
                    data-sauna-row-down=""
                    disabled={disabled || i === grid.length - 1}
                    onClick={() => commit(moveTableRow(grid, i, i + 1))}
                  >
                    <ArrowDown />
                  </StudioIconButton>
                  <StudioIconButton
                    label={`Delete row ${k + 1}`}
                    data-sauna-row-remove=""
                    disabled={disabled || grid.length - bodyStart <= 1}
                    onClick={() => commit(removeTableRow(grid, i))}
                  >
                    <X />
                  </StudioIconButton>
                </div>
                {row.map((cell, j) => (
                  <Input
                    key={j}
                    type="text"
                    className={controlCls}
                    aria-label={`Row ${k + 1}, ${colName(j) || `column ${j + 1}`}`}
                    placeholder={colName(j) || `Column ${j + 1}`}
                    data-sauna-cell={`${k}:${j}`}
                    value={cell}
                    maxLength={500}
                    disabled={disabled}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => commit(setTableCell(grid, i, j, e.target.value))}
                  />
                ))}
              </li>
            );
          })}
        </ol>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          data-sauna-row-add=""
          disabled={disabled || grid.length >= TABLE_MAX_ROWS}
          onClick={() => commit(addTableRow(grid))}
        >
          <Plus /> Add row
        </Button>
      </div>
    </div>
  );
};
