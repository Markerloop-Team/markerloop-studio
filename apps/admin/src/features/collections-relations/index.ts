// Registers the Markerloop relation record picker over the module
// default of the `relation` field type. Importing this module is the
// registration (the registry is a process-global singleton) — the
// collections admin page pulls it in for its side effect before the
// first RecordForm render.

import {
  registerFieldType,
  defaultRelationCell,
} from "@/widgets/collections";

import { RelationPickerInput } from "./relation-picker";

registerFieldType({
  type: "relation",
  FormInput: RelationPickerInput,
  CellRender: defaultRelationCell,
  defaultValue: null,
});

export { RelationPickerInput };
