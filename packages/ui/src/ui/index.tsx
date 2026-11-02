import * as React from "react";

/**
 * Временная реализация публичного UI API.
 *
 * Цель по плану: `import * as UI from "sunday-sauna/ui"`.
 *
 * Этот слой намеренно выступает как узкий, нейтрально названный фасад.
 */
import type { SaunaCatalogComponentMeta, SaunaCatalogGroup } from "./catalog-meta";
import { saunaCatalogGroups, saunaCatalogMeta } from "./catalog-meta";
import {
  GAP_CLASS,
  ALIGN_CLASS,
  JUSTIFY_CLASS,
} from "./internal/layout/stack";
import { PADDING_CLASS } from "./internal/layout/center";
import {
  GAP_CLASS as GRID_GAP_CLASS,
  gridColumnsClasses,
} from "./internal/layout/grid";
import {
  // Primitive
  Badge,
  Button,
  Card as CardRoot,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Separator,
  Skeleton,
  Tabs as TabsRoot,
  Accordion as AccordionRoot,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
  cn,
  // Widgets / misc
  Avatar as AvatarRoot,
  AvatarFallback,
  AvatarImage,
  CodePill as CodePillRoot,
  EmptyState,
  IconGallery,
  Image,
  InlineAlert as InlineAlertRoot,
  Toaster as ToasterRoot,
  // Forms / controls
  Checkbox,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  NativeCheckbox,
  NativeSelect,
  ControlField,
  SearchField,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Textarea,
  useFormField,
  // Data
  DataTable,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  // Overlays
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Sheet as SheetRoot,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  // Controls (S1.5) — Switch/Toggle are re-exported straight from "./internal"
  // below, they need no local binding here.
  ToggleGroup as ToggleGroupRoot,
  ToggleGroupItem,
  // Surfaces / composition (S1.5)
  ScrollArea as ScrollAreaRoot,
  ScrollBar,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Command as CommandRoot,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
  InputGroup as InputGroupRoot,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
  // System
  ThemeProvider,
  useTheme,
  // Navigation
  ActionCardLink,
  RowLink,
  // Icons
  icons as internalIcons,
} from "./internal";

// ---- Widgets kits (сжатие публичного API) ----
//
// Compound objects allow ergonomic JSX (`<Card.Header />` / `<Avatar.Fallback />`)
// and *also* re-export the sub-components as top-level names below so
// they survive `import * as UI from "sunday-sauna/ui"`. That second
// form is what the schema-driven renderer relies on: `createSaunaRegistry`
// walks the imported namespace and only registers PascalCase function
// exports — a property accessed through `Card.Header` is invisible to
// it. Without the flat re-exports a schema with `"type": "CardHeader"`
// silently renders nothing (the registry lookup returns undefined,
// renderer skips the node).
export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Footer: CardFooter,
  Title: CardTitle,
  Action: CardAction,
  Description: CardDescription,
  Content: CardContent,
} as const);

// Flat exports so the schema renderer sees them by their canonical name.
// Keep both forms in sync — if a new sub-component is added to the
// compound, mirror it here.
export {
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from "./internal";

export const Avatar = Object.assign(AvatarRoot, {
  Image: AvatarImage,
  Fallback: AvatarFallback,
} as const);

export { AvatarImage, AvatarFallback } from "./internal";

export const Tabs = Object.assign(TabsRoot, {
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
} as const);

export { TabsList, TabsTrigger, TabsContent } from "./internal";

// SDL-633: moved in from `@markerloop/studio`'s kit-compat. Same pattern as
// Tabs — compound on the root plus flat re-exports, or the registry never
// sees the parts.
export const Accordion = Object.assign(AccordionRoot, {
  Item: AccordionItem,
  Trigger: AccordionTrigger,
  Content: AccordionContent,
} as const);

export { AccordionItem, AccordionTrigger, AccordionContent } from "./internal";
export type { AccordionProps } from "./internal";

// ---- S1.5: controls / surfaces из shadcn ----
// Каждый compound следует паттерну Card/Avatar/Tabs: Object.assign поверх
// корня + обязательные плоские реэкспорты (hard rule 6 — иначе
// createSaunaRegistry их не видит и схема с "type": "SheetContent"
// молча рендерит пустоту).

export { Switch, Toggle } from "./internal";

export const ToggleGroup = Object.assign(ToggleGroupRoot, {
  Item: ToggleGroupItem,
} as const);

export { ToggleGroupItem } from "./internal";

export const ScrollArea = Object.assign(ScrollAreaRoot, {
  Bar: ScrollBar,
} as const);

export { ScrollBar } from "./internal";

export const Tooltip = Object.assign(TooltipRoot, {
  Trigger: TooltipTrigger,
  Content: TooltipContent,
  Provider: TooltipProvider,
} as const);

export { TooltipTrigger, TooltipContent, TooltipProvider } from "./internal";

/**
 * Resizable: панельная раскладка (react-resizable-panels, не Radix).
 * Root-компонента у примитива нет — кит собран как namespace-объект
 * по образцу DialogKit.
 */
export const Resizable = {
  PanelGroup: ResizablePanelGroup,
  Panel: ResizablePanel,
  Handle: ResizableHandle,
} as const;

export { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./internal";

export const Sheet = Object.assign(SheetRoot, {
  Trigger: SheetTrigger,
  Close: SheetClose,
  Content: SheetContent,
  Header: SheetHeader,
  Footer: SheetFooter,
  Title: SheetTitle,
  Description: SheetDescription,
} as const);

export {
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from "./internal";

export const Command = Object.assign(CommandRoot, {
  Dialog: CommandDialog,
  Input: CommandInput,
  List: CommandList,
  Empty: CommandEmpty,
  Group: CommandGroup,
  Item: CommandItem,
  Shortcut: CommandShortcut,
  Separator: CommandSeparator,
} as const);

export {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from "./internal";

export const InputGroup = Object.assign(InputGroupRoot, {
  Addon: InputGroupAddon,
  Button: InputGroupButton,
  Text: InputGroupText,
  Input: InputGroupInput,
  Textarea: InputGroupTextarea,
} as const);

export {
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
} from "./internal";

export const Alert = InlineAlertRoot;
export const Code = CodePillRoot;
export const Toast = ToasterRoot;

export type ListHeaderProps = Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  right?: React.ReactNode;
};

export function ListHeader({ title, description, right, className, ...props }: ListHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b pb-2 mb-2", className)} {...props}>
      <div className="min-w-0">
        {typeof title === "string" ? <Text weight="semibold">{title}</Text> : title}
        {description ? (
          typeof description === "string" ? (
            <Text variant="muted" size="sm">
              {description}
            </Text>
          ) : (
            description
          )
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export {
  // primitive
  Button,
  Badge,
  Image,
  Separator,
  Skeleton,
  Text,
  cn,
  // widgets
  EmptyState,
  IconGallery,
  // system
  ThemeProvider,
  useTheme,
};

export type { ImageProps } from "./internal";

// ListHeader and ListHeaderProps are already exported above as they are defined in this file

/**
 * Box: универсальный layout-примитив вместо Stack/HStack/VStack/Center/Panel/Grid.
 *
 * По плану это первый "сжимающий" компонент, поэтому даём явные варианты,
 * чтобы замена в приложении была механической.
 */
type BoxGap = 0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
type BoxAlign = "start" | "center" | "end" | "stretch" | "baseline";
type BoxJustify = "start" | "center" | "end" | "between" | "around" | "evenly";

type BoxBaseProps<T extends React.ElementType> = {
  as?: T;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "children">;

type BoxStackProps<T extends React.ElementType> = BoxBaseProps<T> & {
  variant?: "stack";
  direction?: "row" | "column";
  gap?: BoxGap;
  align?: BoxAlign;
  justify?: BoxJustify;
  wrap?: boolean;
  fullWidth?: boolean;
  fullHeight?: boolean;
  grow?: boolean;
  /** `false` → `flex-none`: opt out of shrinking inside a flex parent (EP-32 §4.3). */
  shrink?: boolean;
  textAlign?: "left" | "center" | "right";
};

type BoxCenterProps<T extends React.ElementType> = BoxBaseProps<T> & {
  variant: "center";
  inline?: boolean;
  minHeightScreen?: boolean;
  padding?: 0 | 1 | 2 | 3 | 4 | 6 | 8;
};

type BoxPanelProps<T extends React.ElementType> = BoxBaseProps<T> & {
  variant: "panel";
  padding?: 0 | 2 | 3 | 4 | 6;
};

type BoxGridProps<T extends React.ElementType> = BoxBaseProps<T> & {
  variant: "grid";
  gap?: 0 | 2 | 3 | 4 | 6 | 8;
  columns?: 1 | 2 | 3 | 4;
  mdColumns?: 1 | 2 | 3 | 4;
  lgColumns?: 1 | 2 | 3 | 4;
};

export type BoxProps<T extends React.ElementType = "div"> =
  | BoxStackProps<T>
  | BoxCenterProps<T>
  | BoxPanelProps<T>
  | BoxGridProps<T>;

// Таблицы классов живут в internal/layout/* — Box переиспользует их,
// а не держит вторую копию (дубль убран в S1.4).

export function Box<T extends React.ElementType = "div">(props: BoxProps<T>) {
  const { as, className, children, ...rest } = props as BoxProps;
  const Comp = (as ?? "div") as React.ElementType;

  if (props.variant === "center") {
    const { inline, minHeightScreen, padding = 0, ...divProps } = rest as BoxCenterProps<"div">;
    return (
      <Comp
        className={cn(
          inline ? "inline-flex" : "flex",
          "items-center justify-center",
          minHeightScreen ? "min-h-screen" : undefined,
          PADDING_CLASS[String(padding)],
          "bg-background",
          className
        )}
        {...divProps}
      >
        {children}
      </Comp>
    );
  }

  if (props.variant === "panel") {
    const { padding = 0, ...divProps } = rest as BoxPanelProps<"div">;
    return (
      <Comp
        className={cn("rounded-md border bg-background", PADDING_CLASS[String(padding)], className)}
        {...divProps}
      >
        {children}
      </Comp>
    );
  }

  if (props.variant === "grid") {
    const {
      gap = 0,
      columns = 1,
      mdColumns,
      lgColumns,
      ...divProps
    } = rest as BoxGridProps<"div">;
    return (
      <Comp
        className={cn(
          "grid",
          GRID_GAP_CLASS[String(gap)],
          ...gridColumnsClasses(columns, mdColumns, lgColumns),
          className
        )}
        {...divProps}
      >
        {children}
      </Comp>
    );
  }

  // stack (default)
  const {
    direction = "column",
    gap = 0,
    align,
    justify,
    wrap,
    fullWidth,
    fullHeight,
    grow,
    shrink,
    textAlign,
    ...divProps
  } = rest as BoxStackProps<"div">;

  return (
    <Comp
      className={cn(
        "flex",
        direction === "row" ? "flex-row" : "flex-col",
        GAP_CLASS[String(gap)],
        align ? ALIGN_CLASS[align] : undefined,
        justify ? JUSTIFY_CLASS[justify] : undefined,
        wrap ? "flex-wrap" : undefined,
        fullWidth ? "w-full" : undefined,
        fullHeight ? "h-full" : undefined,
        grow ? "flex-1" : undefined,
        shrink === false ? "flex-none" : undefined,
        textAlign === "center"
          ? "text-center"
          : textAlign === "right"
            ? "text-right"
            : textAlign === "left"
              ? "text-left"
              : undefined,
        className
      )}
      {...divProps}
    >
      {children}
    </Comp>
  );
}

/**
 * Link: унифицированная ссылка (RowLink / ActionCardLink).
 */
export type LinkProps =
  | ({ variant?: "row" } & React.ComponentProps<typeof RowLink>)
  | ({ variant: "action-card" } & React.ComponentProps<typeof ActionCardLink>);

export function Link(props: LinkProps) {
  if (props.variant === "action-card") {
    const { variant: _variant, ...rest } = props;
    return <ActionCardLink {...(rest as React.ComponentProps<typeof ActionCardLink>)} />;
  }

  const { variant: _variant, ...rest } = props;
  return <RowLink {...(rest as React.ComponentProps<typeof RowLink>)} />;
}

/**
 * Dialog: единая точка доступа к Dialog и AlertDialog.
 *
 * Использование:
 * - `UI.Dialog.Root`, `UI.Dialog.Content`, ...
 * - `UI.Dialog.Alert.Root`, `UI.Dialog.Alert.Content`, ...
 */
export const DialogKit = {
  Root: Dialog,
  Trigger: DialogTrigger,
  Portal: DialogPortal,
  Overlay: DialogOverlay,
  Content: DialogContent,
  Header: DialogHeader,
  Footer: DialogFooter,
  Title: DialogTitle,
  Description: DialogDescription,
  Close: DialogClose,
  Alert: {
    Root: AlertDialog,
    Trigger: AlertDialogTrigger,
    Portal: AlertDialogPortal,
    Overlay: AlertDialogOverlay,
    Content: AlertDialogContent,
    Header: AlertDialogHeader,
    Footer: AlertDialogFooter,
    Title: AlertDialogTitle,
    Description: AlertDialogDescription,
    Action: AlertDialogAction,
    Cancel: AlertDialogCancel,
  },
} as const;

export { DialogKit as Dialog };

/**
 * Menu: единая точка доступа к DropdownMenu.
 *
 * Использование:
 * - `UI.Menu.Root`, `UI.Menu.Trigger`, `UI.Menu.Content`, ...
 */
export const MenuKit = {
  Root: DropdownMenu,
  Portal: DropdownMenuPortal,
  Trigger: DropdownMenuTrigger,
  Content: DropdownMenuContent,
  Group: DropdownMenuGroup,
  Label: DropdownMenuLabel,
  Item: DropdownMenuItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  Separator: DropdownMenuSeparator,
  Shortcut: DropdownMenuShortcut,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
} as const;

export { MenuKit as Menu };

/**
 * Field + FormControl: унифицированный доступ к form-провайдеру и контролам.
 */
export const Field = {
  useField: useFormField,
  Root: Form,
  Field: FormField,
  Item: FormItem,
  Label: FormLabel,
  Control: FormControl,
  Description: FormDescription,
  Message: FormMessage,
} as const;

export const FormControlKit = {
  Input,
  Textarea,
  Select: {
    Root: Select,
    Trigger: SelectTrigger,
    Value: SelectValue,
    Content: SelectContent,
    Group: SelectGroup,
    Label: SelectLabel,
    Item: SelectItem,
    Separator: SelectSeparator,
    ScrollUpButton: SelectScrollUpButton,
    ScrollDownButton: SelectScrollDownButton,
  },
  Checkbox,
  NativeCheckbox,
  // Kit-only, never a top-level export: `createSaunaRegistry` walks the
  // top-level namespace, so a flat `NativeSelect` would turn editor chrome
  // into a schema block type. Same treatment as `NativeCheckbox`.
  NativeSelect,
  // Label + one control + hint/error without react-hook-form (EP-185).
  // Kit-only for the same reason as `NativeSelect`: a flat export would
  // become a page block type through `createSaunaRegistry`.
  Field: ControlField,
  SearchField,
  Label,
} as const;

export { FormControlKit as FormControl };

/**
 * Table: единая точка доступа для Table и DataTable.
 *
 * Собран по паттерну Card/Avatar/Tabs: Object.assign поверх корневого
 * компонента, а не plain object. Иначе экспортируемый `Table` — не функция,
 * реестр его не регистрирует, и узел `{ "type": "Table" }` рендерится
 * пустотой. `.Root` сохранён для обратной совместимости с формой TableKit.
 */
export const TableKit = Object.assign(Table, {
  Root: Table,
  Header: TableHeader,
  Body: TableBody,
  Footer: TableFooter,
  Head: TableHead,
  Row: TableRow,
  Cell: TableCell,
  Caption: TableCaption,
  DataTable,
} as const);

export { TableKit as Table };

// Flat exports so the schema renderer sees them by their canonical name
// (same contract as Card/Avatar/Tabs above): saunaCatalogMeta describes
// Table*, and ActionCardLink, so every one of them must be resolvable by
// createSaunaRegistry, which only walks top-level namespace keys.
export {
  TableHeader,
  TableBody,
  TableFooter,
  TableCaption,
  TableRow,
  TableHead,
  TableCell,
  ActionCardLink,
} from "./internal";

/**
 * Нейтральные имена для каталога/иконок (в публичном API — только универсальный нейминг).
 */
export const icons: Record<string, React.ComponentType<unknown>> =
  internalIcons as unknown as Record<string, React.ComponentType<unknown>>;
export { saunaCatalogGroups, saunaCatalogMeta };

export type { SaunaCatalogGroup, SaunaCatalogComponentMeta };

