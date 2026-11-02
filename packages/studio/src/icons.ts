// The glyphs the editor draws (SDL-604).
//
// The reference imported these from the kit's `ui/icons` entry, which exists
// only in the frozen reference's HEAD. The kit that moved into
// `packages/ui` (SDL-602) is the published `0.2.0-alpha.2`, byte-identical to
// the npm tarball, and has neither that entry nor several of these glyphs in
// its registry. Growing the kit here would break that parity for the sake of
// one consumer, so the editor names its glyphs itself, straight from the same
// `lucide-react` the kit uses. When the kit grows an icons entry, this file
// becomes a re-export of it and nothing else changes: every other module
// imports from `./icons`, never from `lucide-react`.
export {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  Blocks,
  Box,
  ChevronDown,
  ChevronsDownUp,
  CircleUser,
  Code,
  Columns2,
  Component,
  Copy,
  Edit,
  Image,
  LayoutTemplateIcon,
  Link,
  List,
  MessageSquare,
  Minus,
  Monitor,
  MoreHorizontal,
  MoreVertical,
  MousePointerClick,
  PackageOpen,
  Palette,
  PanelRight,
  PanelTop,
  Plus,
  RectangleHorizontal,
  RectangleHorizontalIcon,
  Redo2,
  RefreshCw,
  Rows3,
  ScrollText,
  Search,
  Shapes,
  SlidersHorizontal,
  Smartphone,
  SquareArrowOutUpRight,
  SquareDashed,
  SquareIcon,
  Table,
  Tablet,
  Tag,
  Text,
  TextCursorInput,
  ToggleLeft,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
export type { LucideIcon as Icon } from "lucide-react";
