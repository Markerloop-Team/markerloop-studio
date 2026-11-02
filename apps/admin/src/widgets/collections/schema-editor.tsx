"use client";

// SchemaEditor — manage the fields (and metadata) of one collection.
//
// The second write path in CollectionsShell. Lives in the side panel
// like RecordForm, opened by a "Schema" affordance next to the
// collection header.
//
// Backend constraints (collections-service UpdateFieldRequest):
//   - field.key  is immutable post-create
//   - field.type is immutable post-create
//
// We surface that honestly: the type select is disabled on existing
// fields, and the key input is read-only. To "change a type" the
// user deletes the field and adds a new one — we do not pretend to
// support a migration the backend can't honour.
//
// Stays presentation-only. All mutations and confirms are wired by
// the consuming page through the on* callbacks. Layout and controls
// come from the sunday-sauna kit (SDL-226); the remaining classNames
// are layout-only utilities compiled by the app's own sheet.

import { useState, type ReactNode } from "react";

import {
  Alert,
  Box,
  Button,
  FormControl,
  Text,
} from "@markerloop/ui/ui";

import type {
  Collection,
  CollectionField,
  FieldType,
} from "./types";

export interface SchemaEditorAddFieldPayload {
  key: string;
  name: string;
  type: FieldType;
  /**
   * Type-specific config. For `relation` it carries the target
   * collection: `{ collection_key: "<key>" }` (SDL-170) — the server
   * rejects a relation field without an existing same-project target.
   */
  config?: Record<string, unknown>;
}

export interface SchemaEditorRenameFieldPayload {
  fieldId: string;
  name: string;
}

export interface SchemaEditorRenameCollectionPayload {
  name: string;
}

export interface SchemaEditorProps {
  collection: Collection;
  fields: readonly CollectionField[];
  /** Add field. Returns a promise — page handles errors. */
  onAddField: (payload: SchemaEditorAddFieldPayload) => Promise<void>;
  /** Rename a field (key/type immutable). */
  onRenameField: (payload: SchemaEditorRenameFieldPayload) => Promise<void>;
  /** Delete a field (with consumer-side confirm). */
  onDeleteField: (fieldId: string) => Promise<void>;
  /** Rename the collection (name only — key is immutable). */
  onRenameCollection: (
    payload: SchemaEditorRenameCollectionPayload
  ) => Promise<void>;
  /** Delete the collection (with consumer-side confirm). */
  onDeleteCollection: () => Promise<void>;
  /** Close the editor. */
  onClose: () => void;
  /** Server error to surface in a banner. */
  error?: string | null;
  /** Pending flags drive button state. */
  isAddingField?: boolean;
  isMutatingField?: boolean;
  isMutatingCollection?: boolean;
  /** Field types available in this product's catalogue. */
  availableTypes?: readonly FieldType[];
  /**
   * Collections selectable as a relation target (usually every
   * collection of the current project, the current one included —
   * self-relations are legal). Without it the `relation` type still
   * shows but cannot be added: the server requires a target.
   */
  relationTargets?: readonly { key: string; name: string }[];
  labels?: SchemaEditorLabels;
}

export interface SchemaEditorLabels {
  title?: string;
  collectionNameLabel?: string;
  collectionKeyLabel?: string;
  saveCollection?: string;
  deleteCollection?: string;
  deleteCollectionHint?: string;
  builtinHint?: string;
  fieldsHeading?: string;
  addField?: string;
  newFieldKey?: string;
  newFieldName?: string;
  newFieldType?: string;
  add?: string;
  cancel?: string;
  rename?: string;
  delete?: string;
  typeImmutableHint?: string;
  keyImmutableHint?: string;
  close?: string;
  saving?: string;
  relationTarget?: string;
  relationTargetPlaceholder?: string;
}

const DEFAULT_TYPES: readonly FieldType[] = [
  "string",
  "number",
  "boolean",
  "date",
  "rich_text",
  "image",
  "relation",
  "select",
  "json",
];

/** Vertical section: 10px gap, 16/20 padding, hairline divider. */
const sectionClass = "flex flex-col gap-2.5 border-b border-border px-5 py-4";

// Немутируемое поле: приглушаем ФОН, но не текст (SDL-459).
//
// Раньше здесь стоял `opacity-60`, и он гасил не рамку с фоном, а само
// значение: замер против тест-контура (build 6af04127) дал реальному
// сохранённому `articles` цвет rgb(108,108,108) при `--foreground`
// rgb(17,17,17) и `--muted-foreground` rgb(143,143,143). То есть значение
// рендерилось ВТРОЕ ближе к цвету плейсхолдера, чем к цвету настоящих
// данных, — ровно жалоба аудита «заполненное неотличимо от пустого».
// Контраст падал с 18.88 у соседнего заполненного инпута до 4.82.
//
// Гасить текст тут вообще не нужно: `Input` кита сам несёт
// `read-only:bg-muted/50`, то есть немутируемость УЖЕ сигналится фоном.
// `opacity-60` был второй сигнализацией поверх первой и стоил читаемости.
const readOnlyValueClass = "text-foreground";

// Строка поля: три колонки только когда панель шире 36rem (SDL-452).
//
// Брейкпоинт КОНТЕЙНЕРНЫЙ, а не вьюпортовый, и это не стилистический
// выбор. Ширина панели схемы не выводится из ширины экрана: из неё уже
// вычтены хром админки и колонка/рельса списка, поэтому на 768px панели
// достаётся 408px, а на 390px — 278px. При жёсткой сетке
// `1fr 1fr 96px auto` фиксированная колонка типа и пара кнопок съедали
// остаток, и оба `1fr` схлопывались до 62px и 34px — ровно жалоба
// аудита про «инпуты шириной в 1–2 буквы». Вьюпортовый `sm:`/`md:` тут
// не помог бы: на 768px экран широкий, а панель — нет.
const fieldRowClass =
  "grid grid-cols-1 items-end gap-2 @xl:grid-cols-[1fr_1fr_96px_auto]";

export function SchemaEditor(props: SchemaEditorProps): ReactNode {
  const {
    collection,
    fields,
    onAddField,
    onRenameField,
    onDeleteField,
    onRenameCollection,
    onDeleteCollection,
    onClose,
    error = null,
    isAddingField = false,
    isMutatingField = false,
    isMutatingCollection = false,
    availableTypes = DEFAULT_TYPES,
    relationTargets = [],
    labels = {},
  } = props;

  const isBuiltin = collection.is_builtin;

  return (
    <Box
      direction="column"
      fullHeight
      className="min-h-0"
      data-collections-schema-editor=""
    >
      <Box
        direction="row"
        align="center"
        justify="between"
        className="border-b border-border px-5 py-4"
      >
        <Text as="span" size="md" weight="semibold">
          {labels.title ?? "Schema"}
        </Text>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {labels.close ?? "Close"}
        </Button>
      </Box>

      <div className="@container min-h-0 flex-1 overflow-auto">
        <CollectionMetaSection
          collection={collection}
          isBuiltin={isBuiltin}
          isMutating={isMutatingCollection}
          onRename={(name) => onRenameCollection({ name })}
          labels={labels}
        />

        <div className={sectionClass}>
          <Box direction="row" align="center" justify="between">
            <Text as="span" size="sm" weight="medium">
              {labels.fieldsHeading ?? "Fields"}
            </Text>
            <Text as="span" variant="muted" size="xs">
              {fields.length}
            </Text>
          </Box>
          {fields.length === 0 ? (
            <Text as="span" variant="muted" size="xs">
              —
            </Text>
          ) : (
            fields.map((f) => (
              <FieldRow
                key={f.id}
                field={f}
                isMutating={isMutatingField}
                onRename={(name) =>
                  onRenameField({ fieldId: f.id, name })
                }
                onDelete={() => onDeleteField(f.id)}
                labels={labels}
              />
            ))
          )}
        </div>

        <AddFieldSection
          isAdding={isAddingField}
          availableTypes={availableTypes}
          relationTargets={relationTargets}
          onAdd={onAddField}
          labels={labels}
        />

        {isBuiltin ? null : (
          <DangerZoneSection
            isMutating={isMutatingCollection}
            onDelete={onDeleteCollection}
            labels={labels}
          />
        )}

        {error ? (
          <Alert variant="destructive" className="m-5 whitespace-pre-wrap">
            {error}
          </Alert>
        ) : null}
      </div>
    </Box>
  );
}

function CollectionMetaSection(props: {
  collection: Collection;
  isBuiltin: boolean;
  isMutating: boolean;
  onRename: (name: string) => Promise<void>;
  labels: SchemaEditorLabels;
}): ReactNode {
  const { collection, isBuiltin, isMutating, onRename, labels } = props;
  const [name, setName] = useState(collection.name);

  return (
    <div className={sectionClass}>
      <FormControl.Field label={labels.collectionNameLabel ?? "Name"}>
        <FormControl.Input
          type="text"
          value={name}
          disabled={isBuiltin || isMutating}
          onChange={(e) => setName(e.target.value)}
        />
      </FormControl.Field>
      <FormControl.Field
        label={labels.collectionKeyLabel ?? "Key"}
        hint={labels.keyImmutableHint ?? "Key is immutable."}
      >
        <FormControl.Input
          type="text"
          value={collection.key}
          readOnly
          className={readOnlyValueClass}
        />
      </FormControl.Field>
      {isBuiltin ? (
        <Text as="span" variant="muted" size="xs">
          {labels.builtinHint ??
            "Built-in collection — name and structure are managed by the system."}
        </Text>
      ) : (
        <Box direction="row" gap={2}>
          <Button
            type="button"
            size="sm"
            disabled={
              isMutating || name === collection.name || name.trim() === ""
            }
            onClick={() => {
              void onRename(name.trim());
            }}
            data-collections-schema-save=""
          >
            {isMutating
              ? labels.saving ?? "Saving…"
              : labels.saveCollection ?? "Save"}
          </Button>
        </Box>
      )}
    </div>
  );
}

/**
 * Удаление коллекции — отдельной секцией в конце панели (SDL-459).
 *
 * Раньше «Удалить коллекцию» стояла ВПЛОТНУЮ к «Сохранить», в одном
 * `flex-row gap-2`: замер против тест-контура (build 6af04127) показал у
 * обеих кнопок одинаковый `top: 563` и общего родителя. При этом
 * «Сохранить» по смыслу задизейблена, пока имя не тронуто (opacity 0.5 в
 * замере), а «Удалить» всегда активна и покрашена в destructive — то есть
 * самым ярким элементом панели оказывалось самое опасное действие, а
 * основное выглядело выключенным. Вес был обратен опасности.
 *
 * Лечение — не перекрасить, а РАЗВЕСТИ: primary остаётся в своём ряду
 * рядом с полями, которые она сохраняет, а необратимое действие уезжает
 * вниз, за разделитель, теряет рамку (`ghost` вместо `outline`) и
 * получает подпись про необратимость. Красный текст сохранён: это
 * по-прежнему destructive-действие, просто вторичное по весу.
 */
function DangerZoneSection(props: {
  isMutating: boolean;
  onDelete: () => Promise<void>;
  labels: SchemaEditorLabels;
}): ReactNode {
  const { isMutating, onDelete, labels } = props;

  return (
    <div className={sectionClass} data-collections-schema-danger-zone="">
      <Text as="span" variant="muted" size="xs">
        {labels.deleteCollectionHint ??
          "Deleting a collection removes its records. This cannot be undone."}
      </Text>
      <Box direction="row">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isMutating}
          onClick={() => {
            void onDelete();
          }}
          className="text-destructive hover:text-destructive"
          data-collections-schema-delete=""
        >
          {labels.deleteCollection ?? "Delete collection"}
        </Button>
      </Box>
    </div>
  );
}

function FieldRow(props: {
  field: CollectionField;
  isMutating: boolean;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  labels: SchemaEditorLabels;
}): ReactNode {
  const { field, isMutating, onRename, onDelete, labels } = props;
  const [name, setName] = useState(field.name);
  const dirty = name.trim() !== field.name && name.trim() !== "";

  return (
    <div className={fieldRowClass}>
      <FormControl.Field label={labels.newFieldName ?? "Name"}>
        <FormControl.Input
          type="text"
          value={name}
          disabled={isMutating}
          onChange={(e) => setName(e.target.value)}
        />
      </FormControl.Field>
      <FormControl.Field label={labels.newFieldKey ?? "Key"}>
        <FormControl.Input
          type="text"
          value={field.key}
          readOnly
          className={readOnlyValueClass}
        />
      </FormControl.Field>
      <FormControl.Field
        label={labels.newFieldType ?? "Type"}
        hint={
          field.type === "relation" ? (
            <span data-collections-relation-target="">
              → {relationTargetKeyOf(field.config) ?? "?"}
            </span>
          ) : undefined
        }
      >
        <FormControl.Input
          type="text"
          value={String(field.type)}
          readOnly
          className={readOnlyValueClass}
          title={
            labels.typeImmutableHint ??
            "Type is immutable — delete and re-add to change."
          }
        />
      </FormControl.Field>
      <Box direction="row" gap={1}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isMutating || !dirty}
          onClick={() => {
            void onRename(name.trim());
          }}
        >
          {labels.rename ?? "Rename"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isMutating}
          onClick={() => {
            void onDelete();
          }}
          className="border-destructive text-destructive"
        >
          {labels.delete ?? "Delete"}
        </Button>
      </Box>
    </div>
  );
}

/** Target collection key from a relation field config (SDL-170). */
function relationTargetKeyOf(
  config: Record<string, unknown> | undefined
): string | null {
  const raw = config?.collection_key;
  return typeof raw === "string" && raw !== "" ? raw : null;
}

function AddFieldSection(props: {
  isAdding: boolean;
  availableTypes: readonly FieldType[];
  relationTargets: readonly { key: string; name: string }[];
  onAdd: (payload: SchemaEditorAddFieldPayload) => Promise<void>;
  labels: SchemaEditorLabels;
}): ReactNode {
  const { isAdding, availableTypes, relationTargets, onAdd, labels } = props;
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>(availableTypes[0] ?? "string");
  const [targetKey, setTargetKey] = useState("");

  const reset = () => {
    setKey("");
    setName("");
    setType(availableTypes[0] ?? "string");
    setTargetKey("");
  };

  const valid =
    key.trim() !== "" &&
    name.trim() !== "" &&
    /^[a-z][a-z0-9_]*$/.test(key.trim()) &&
    // The server refuses a relation field without an existing target
    // (400 relation_config_invalid) — don't offer a doomed Add.
    (type !== "relation" || targetKey !== "");

  return (
    <div className={sectionClass}>
      <Text as="span" size="sm" weight="medium">
        {labels.addField ?? "Add field"}
      </Text>
      <div className={fieldRowClass}>
        <FormControl.Field label={labels.newFieldName ?? "Name"}>
          <FormControl.Input
            type="text"
            value={name}
            disabled={isAdding}
            onChange={(e) => setName(e.target.value)}
            data-collections-add-field-name=""
          />
        </FormControl.Field>
        <FormControl.Field label={labels.newFieldKey ?? "Key"}>
          <FormControl.Input
            type="text"
            value={key}
            disabled={isAdding}
            onChange={(e) => setKey(e.target.value)}
            placeholder="lower_snake_case"
            data-collections-add-field-key=""
          />
        </FormControl.Field>
        {/* A Radix Select is a Root around a Trigger: the Field's id is
            repeated on the Trigger, which is the element the label names. */}
        <FormControl.Field
          id="collections-add-field-type"
          label={labels.newFieldType ?? "Type"}
        >
          <FormControl.Select.Root
            value={String(type)}
            disabled={isAdding}
            onValueChange={(value) => setType(value as FieldType)}
          >
            <FormControl.Select.Trigger
              id="collections-add-field-type"
              fullWidth
              data-collections-add-field-type=""
            >
              <FormControl.Select.Value />
            </FormControl.Select.Trigger>
            <FormControl.Select.Content>
              {availableTypes.map((t) => (
                <FormControl.Select.Item key={String(t)} value={String(t)}>
                  {String(t)}
                </FormControl.Select.Item>
              ))}
            </FormControl.Select.Content>
          </FormControl.Select.Root>
        </FormControl.Field>
        <Box direction="row" gap={1}>
          <Button
            type="button"
            size="sm"
            disabled={isAdding || !valid}
            onClick={async () => {
              await onAdd({
                key: key.trim(),
                name: name.trim(),
                type,
                config:
                  type === "relation"
                    ? { collection_key: targetKey }
                    : undefined,
              });
              reset();
            }}
          >
            {isAdding ? labels.saving ?? "Saving…" : labels.add ?? "Add"}
          </Button>
        </Box>
      </div>
      {type === "relation" ? (
        <FormControl.Field
          id="collections-add-field-target"
          label={labels.relationTarget ?? "Target collection"}
        >
          {/* "" = nothing picked yet: Radix shows the placeholder for an
              empty value (an Item may not carry ""). */}
          <FormControl.Select.Root
            value={targetKey}
            disabled={isAdding}
            onValueChange={setTargetKey}
          >
            <FormControl.Select.Trigger
              id="collections-add-field-target"
              fullWidth
            >
              <FormControl.Select.Value
                placeholder={
                  labels.relationTargetPlaceholder ?? "— pick a collection —"
                }
              />
            </FormControl.Select.Trigger>
            <FormControl.Select.Content>
              {relationTargets.map((t) => (
                <FormControl.Select.Item key={t.key} value={t.key}>
                  {t.name} ({t.key})
                </FormControl.Select.Item>
              ))}
            </FormControl.Select.Content>
          </FormControl.Select.Root>
        </FormControl.Field>
      ) : null}
      <Text as="span" variant="muted" size="xs">
        {labels.keyImmutableHint ??
          "Key must be lower_snake_case and is immutable after creation."}
      </Text>
    </div>
  );
}
