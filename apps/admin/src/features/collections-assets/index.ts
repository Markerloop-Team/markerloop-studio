// Registers the Markerloop asset picker over the module default of the
// `image` field type. Importing this module is the registration (the
// registry is a process-global singleton) — the collections admin page
// pulls it in for its side effect before the first RecordForm render,
// exactly like features/collections-relations.
//
// Only the field renderer lives here since SDL-625: the file library it
// opens is the workspace one (widgets/files, the /files section), not a
// collections copy with its own scope.

import { registerFieldType, defaultImageCell } from "@/widgets/collections";

import { AssetPickerInput } from "./asset-picker";

registerFieldType({
  type: "image",
  FormInput: AssetPickerInput,
  // The table cell keeps the module default: the stored value is still a
  // string, and a cell is not the place to spend a request per row
  // resolving it into a thumbnail.
  CellRender: defaultImageCell,
  defaultValue: "",
});

export { AssetPickerInput, isFileId } from "./asset-picker";
