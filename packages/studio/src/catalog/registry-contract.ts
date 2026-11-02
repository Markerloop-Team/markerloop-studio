// The names the pages editor is committed to keeping (SDL-608).
//
// WHY THIS FILE EXISTS. A page document stores node types as plain strings;
// the renderer looks each one up in the BUILT registry (`PAGES_REGISTRY` in
// `./catalog`). Nothing ties the two together, so renaming or dropping an
// export of `@markerloop/ui` — or of the local primitives below it — makes
// every stored page that used that name lose the node and its whole subtree.
// Since the design system ships inside the admin, one admin release would do
// that to every published page at once. This list is the promise that it
// will not happen by accident.
//
// WHAT IS FROZEN — THE NAMES, NOTHING ELSE. Not the props, not the markup,
// not the behaviour. A name that is here must still resolve to something the
// registry can render; what it renders is free to change. The full property
// contract is a separate, larger step and deliberately not this one.
//
// WHY THE BUILT REGISTRY AND NOT THE KIT. `PAGES_REGISTRY` is the kit with
// `Page`, `Section` and `Text` laid OVER it, and the local `Text` shadows the
// kit's. A guard that walked `@markerloop/ui` would not see a single node of
// a real page — every document the section creates is made of exactly those
// three local names. So the guard walks the assembled registry, the same
// object the renderer indexes into.
//
// WHY THE CHECK IS ONE-DIRECTIONAL. `smoke:pages` asserts that this list is a
// SUBSET of the live registry — never that the two are equal, and there is
// deliberately no command that rewrites this file from the registry. A
// "record the contract / check the contract" pair is its own escape hatch:
// the check goes red, you re-record, and the breaking change ships green.
// Here the only way to retire a name is to delete its line by hand, in a diff
// a reviewer sees. ADDING a name needs no edit at all — a bigger registry
// still contains this list.
//
// WHAT THIS DOES NOT CATCH — stated, not glossed over. The smoke checks that
// each frozen name is still present AND still resolves to something React can
// render, so `{ ...registry, Gone: undefined }` fails rather than passing on a
// present key. It cannot catch a hand-written stub — `Gone: () => null` keeps
// the guard green while the page goes blank. That is deliberate: a stub is a
// fork of the component, it lives as an added line in `./catalog`, and it is
// caught by reading the diff, which is the same standard this list relies on.
// A guard cannot tell a lazy stub from a real reimplementation, and one that
// tried would fail on every legitimate component that renders nothing without
// props.
//
// The list was taken from the registry as built on 23 Sep 2026; it is not
// regenerated, it is amended.
export const FROZEN_REGISTRY_TYPES: readonly string[] = [
  "ActionCardLink",
  "Alert",
  "Avatar",
  "AvatarFallback",
  "AvatarImage",
  "Badge",
  "Box",
  "Button",
  "Card",
  "CardAction",
  "CardContent",
  "CardDescription",
  "CardFooter",
  "CardHeader",
  "CardTitle",
  "Code",
  "Command",
  "CommandDialog",
  "CommandEmpty",
  "CommandGroup",
  "CommandInput",
  "CommandItem",
  "CommandList",
  "CommandSeparator",
  "CommandShortcut",
  "EmptyState",
  "IconGallery",
  "Image",
  "InputGroup",
  "InputGroupAddon",
  "InputGroupButton",
  "InputGroupInput",
  "InputGroupText",
  "InputGroupTextarea",
  "Link",
  "ListHeader",
  "Page",
  "ResizableHandle",
  "ResizablePanel",
  "ResizablePanelGroup",
  "ScrollArea",
  "ScrollBar",
  "Section",
  "Separator",
  "Sheet",
  "SheetClose",
  "SheetContent",
  "SheetDescription",
  "SheetFooter",
  "SheetHeader",
  "SheetTitle",
  "SheetTrigger",
  "Skeleton",
  "Switch",
  "Table",
  "TableBody",
  "TableCaption",
  "TableCell",
  "TableFooter",
  "TableHead",
  "TableHeader",
  "TableKit",
  "TableRow",
  "Tabs",
  "TabsContent",
  "TabsList",
  "TabsTrigger",
  "Text",
  "ThemeProvider",
  "Toast",
  "Toggle",
  "ToggleGroup",
  "ToggleGroupItem",
  "Tooltip",
  "TooltipContent",
  "TooltipProvider",
  "TooltipTrigger",
  // SDL-633 (28 Sep 2026): the compound Elements, one stored node each.
  "Accordion",
  "AccordionContent",
  "AccordionItem",
  "AccordionTrigger",
  "AccordionView",
  "CardView",
  "TableView",
  "TabsView",
];
