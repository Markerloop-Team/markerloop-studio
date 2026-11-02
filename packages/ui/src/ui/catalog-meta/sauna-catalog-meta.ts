export type SaunaCatalogGroup = {
  id: string;
  title: string;
  order: number;
};

export type SaunaCatalogComponentMeta = {
  /**
   * Группа для каталога (структура/навигация в редакторе).
   * Если не задано — каталог может применить эвристику/дефолт.
   */
  groupId?: string;
  title?: string;
  description?: string;
  keywords?: string[];

  /**
   * Вложенность (универсальные правила):
   * - allowedParents: "куда можно вставлять этот компонент"
   * - allowedChildren: "что можно вставлять внутрь этого компонента"
   *
   * Если поле не задано — ограничений нет (разрешаем).
   */
  allowedParents?: string[];
  allowedChildren?: string[];

  /**
   * Превью для каталога:
   * цепочка типов, которую редактор может собрать в мини-схему (root → ... → leaf).
   * Поддерживает маркер "$self", который заменяется на текущий компонент.
   *
   * Пример для TableCell: ["Table", "TableBody", "TableRow", "$self"]
   */
  previewPath?: string[];

  /**
   * Дефолтные props для нового узла этого типа (при добавлении).
   * Это намеренно "плоские" props: children в виде строки — ок.
   */
  initialProps?: Record<string, unknown>;

  /**
   * Offer this component for insertion (default `true`). `false` keeps the
   * entry in the catalog and the registry — a node of this type still renders
   * — but takes it out of the editor's Insert list: a provider or a global
   * mount point is not a block of a page (SDL-337 — a task number of the
   * frozen sunday-sauna reference, not of this board — and SDL-632
   * here). The admin's `smoke:pages` fails if a provider becomes insertable.
   */
  insertable?: boolean;

  /**
   * Ссылки на доки / Storybook (опционально, на будущее).
   */
  storyId?: string;
  docs?: string;
  previewImageSrc?: string;
};

export const saunaCatalogGroups: SaunaCatalogGroup[] = [
  { id: "primitives", title: "Primitives", order: 10 },
  { id: "forms", title: "Forms", order: 20 },
  { id: "widgets", title: "Widgets", order: 30 },
];

/**
 * Метаданные, которые описывают:
 * - как показывать компонент в каталоге
 * - какие ограничения вложенности действуют
 * - какие дефолтные props ставить при создании узла
 *
 * Это намеренно отделено от editor/renderer: UI-пакет "знает" свои компоненты.
 */
export const saunaCatalogMeta: Record<string, SaunaCatalogComponentMeta> = {
  Text: {
    groupId: "primitives",
    title: "Text",
    description: "Текстовый блок.",
    keywords: ["text", "typography"],
    initialProps: { children: "Новый текст" },
    previewPath: ["$self"],
    storyId: "typography-text--default",
  },

  ActionCardLink: {
    groupId: "primitives",
    title: "ActionCardLink",
    description: "Карточка-ссылка с заголовком.",
    keywords: ["link", "card", "navigation"],
    initialProps: { href: "#", title: "Новая ссылка" },
    previewPath: ["$self"],
    storyId: "components-actioncardlink--default",
  },

  Image: {
    groupId: "primitives",
    title: "Image",
    description: "Картинка с lazy-loading, object-fit и aspect-ratio.",
    keywords: ["image", "media", "picture", "asset"],
    // Без `src` (SDL-630): путь по умолчанию резолвится против хоста и
    // существует только в одном приложении — у остальных это 404.
    initialProps: {
      alt: "",
      fit: "cover",
      rounded: "none",
      loading: "lazy",
    },
    previewPath: ["$self"],
  },

  // Table (структурный компонент)
  Table: {
    groupId: "widgets",
    title: "Table",
    description: "Таблица. Разрешает только table-примитивы внутри.",
    keywords: ["table"],
    allowedChildren: ["TableHeader", "TableBody", "TableFooter", "TableCaption"],
    previewPath: ["$self", "TableBody", "TableRow", "TableCell"],
    storyId: "components-table--default",
  },
  TableHeader: {
    groupId: "widgets",
    title: "TableHeader",
    description: "Шапка таблицы.",
    keywords: ["table", "header"],
    allowedParents: ["Table"],
    allowedChildren: ["TableRow"],
    previewPath: ["Table", "$self", "TableRow", "TableHead"],
  },
  TableBody: {
    groupId: "widgets",
    title: "TableBody",
    description: "Тело таблицы.",
    keywords: ["table", "body"],
    allowedParents: ["Table"],
    allowedChildren: ["TableRow"],
    previewPath: ["Table", "$self", "TableRow", "TableCell"],
  },
  TableFooter: {
    groupId: "widgets",
    title: "TableFooter",
    description: "Футер таблицы.",
    keywords: ["table", "footer"],
    allowedParents: ["Table"],
    allowedChildren: ["TableRow"],
    previewPath: ["Table", "$self", "TableRow", "TableCell"],
  },
  TableCaption: {
    groupId: "widgets",
    title: "TableCaption",
    description: "Подпись таблицы.",
    keywords: ["table", "caption"],
    allowedParents: ["Table"],
    initialProps: { children: "Caption" },
    previewPath: ["Table", "$self"],
  },
  TableRow: {
    groupId: "widgets",
    title: "TableRow",
    description: "Строка таблицы.",
    keywords: ["table", "row"],
    allowedParents: ["TableHeader", "TableBody", "TableFooter"],
    allowedChildren: ["TableCell", "TableHead"],
    previewPath: ["Table", "TableBody", "$self", "TableCell"],
  },
  TableHead: {
    groupId: "widgets",
    title: "TableHead",
    description: "Ячейка заголовка (th).",
    keywords: ["table", "head"],
    allowedParents: ["TableRow"],
    initialProps: { children: "Head" },
    previewPath: ["Table", "TableHeader", "TableRow", "$self"],
  },
  TableCell: {
    groupId: "widgets",
    title: "TableCell",
    description: "Ячейка (td).",
    keywords: ["table", "cell"],
    allowedParents: ["TableRow"],
    initialProps: { children: "Cell" },
    previewPath: ["Table", "TableBody", "TableRow", "$self"],
  },

  // Accordion (SDL-633): moved into the kit. Pages insert it as one
  // `AccordionView` node; the parts below exist for trees built by hand.
  Accordion: {
    groupId: "widgets",
    title: "Accordion",
    description: "Раскрывающиеся пункты.",
    keywords: ["accordion", "collapse", "faq"],
    allowedChildren: ["AccordionItem"],
    initialProps: { type: "single", collapsible: true },
    previewPath: ["$self", "AccordionItem", "AccordionTrigger"],
  },
  AccordionItem: {
    groupId: "widgets",
    title: "AccordionItem",
    description: "Пункт аккордеона: заголовок и содержимое.",
    keywords: ["accordion", "item"],
    allowedParents: ["Accordion"],
    allowedChildren: ["AccordionTrigger", "AccordionContent"],
    initialProps: { value: "item-1" },
    previewPath: ["Accordion", "$self", "AccordionTrigger"],
  },
  AccordionTrigger: {
    groupId: "widgets",
    title: "AccordionTrigger",
    description: "Заголовок пункта; раскрывает содержимое.",
    keywords: ["accordion", "trigger"],
    allowedParents: ["AccordionItem"],
    initialProps: { children: "Question" },
    previewPath: ["Accordion", "AccordionItem", "$self"],
  },
  AccordionContent: {
    groupId: "widgets",
    title: "AccordionContent",
    description: "Содержимое пункта.",
    keywords: ["accordion", "content"],
    allowedParents: ["AccordionItem"],
    initialProps: { children: "Answer" },
    previewPath: ["Accordion", "AccordionItem", "$self"],
  },

  // Radix ToggleGroup throws "Missing prop `type`" without one, so a fresh
  // node must carry it (SDL-633: every offered block renders on its own).
  ToggleGroup: {
    title: "ToggleGroup",
    initialProps: { type: "single" },
  },

  // `title` is required (SDL-696): without a start value the editor inserted
  // a node that failed its own schema, and the Element catalog served it as
  // the example.
  ListHeader: {
    title: "ListHeader",
    initialProps: { title: "List title" },
  },

  // Not blocks of a page (SDL-632): context providers and a global mount
  // point. They stay renderable; they are only not offered for insertion.
  ThemeProvider: {
    title: "ThemeProvider",
    description: "Theme context provider; not a page block.",
    insertable: false,
  },
  Toast: {
    title: "Toast",
    description: "Global toast mount point; not a page block.",
    insertable: false,
  },
  TooltipProvider: {
    title: "TooltipProvider",
    description: "Tooltip context provider; not a page block.",
    insertable: false,
  },
  // Radix Tooltip throws without a TooltipProvider above it, and neither the
  // canvas nor the public render mounts one (no per-node error boundary
  // either): an inserted Tooltip would take the whole page down. Not offered
  // until the render root provides the context (SDL-632 follow-up); existing
  // nodes keep rendering exactly as before.
  Tooltip: {
    title: "Tooltip",
    description: "Needs a TooltipProvider the page render does not mount; not offered.",
    insertable: false,
  },
  TooltipTrigger: {
    title: "TooltipTrigger",
    description: "Part of Tooltip; not offered while Tooltip is not.",
    insertable: false,
  },
  TooltipContent: {
    title: "TooltipContent",
    description: "Part of Tooltip; not offered while Tooltip is not.",
    insertable: false,
  },
};
