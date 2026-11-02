"use client";

// The «Make a parameter» affordance under a field in the Properties pane
// (SDL-503, EP-61).
//
// Rendered only in the COMPONENT editor: a parameter is what a block hands
// outwards, and a page has nobody to hand anything to. The auto-form takes
// the switch as a prop (`onParamsChange`) rather than sniffing the document
// — the shell has no notion of "this is a block" and giving it one to serve
// one button would be a worse trade than one optional prop.
//
// What the author sees, in the three states the field can be in:
//   idle       — a quiet «Make a parameter» link under the control
//   naming     — an input prefilled with the prop name, Enter confirms
//   parametrised — a chip with the parameter's name and a Remove button
//
// The current value stays where it is. It IS the default: `applyBlockParams`
// leaves a node alone when the page supplies no value for its parameter, so
// "the current value becomes the default" needs no storage of its own, and
// the manifest stays a pointer rather than a second copy of the content.

import { useState, type ReactNode } from "react";

import type { SaunaNodeId, SaunaParamSpec } from "@markerloop/engine";
import { Badge, Button, FormControl, Text } from "@markerloop/ui/ui";

import {
  addParam,
  paramFor,
  paramNameErrorText,
  removeParam,
  suggestParamName,
  type SaunaParamNameError,
} from "./params";

const { Input } = FormControl;

export type SaunaParamFieldActionProps = {
  /** The document's manifest as it stands. */
  params: readonly SaunaParamSpec[];
  /** The node whose prop this field edits. */
  nodeId: SaunaNodeId;
  /** The prop key this field edits. */
  prop: string;
  /** Commits a new manifest. `null` clears it. */
  onParamsChange: (params: SaunaParamSpec[] | null) => void;
  disabled?: boolean;
};

export function SaunaParamFieldAction({
  params,
  nodeId,
  prop,
  onParamsChange,
  disabled,
}: SaunaParamFieldActionProps): ReactNode {
  const existing = paramFor(params, nodeId, prop);
  const [naming, setNaming] = useState<string | null>(null);
  const [error, setError] = useState<SaunaParamNameError | null>(null);

  if (existing) {
    return (
      <div
        className="flex items-center gap-1.5"
        data-sauna-param-of={prop}
        data-sauna-param-name={existing.name}
      >
        <Badge variant="secondary" className="text-xs">
          Parameter: {existing.name}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="h-auto px-1 py-0 text-xs font-normal"
          disabled={disabled}
          data-sauna-param-remove={prop}
          onClick={() => {
            const next = removeParam(params, existing.name);
            onParamsChange(next.length > 0 ? next : null);
          }}
        >
          Remove
        </Button>
      </div>
    );
  }

  if (naming === null) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-auto self-start px-1 py-0 text-xs font-normal"
        disabled={disabled}
        data-sauna-param-add={prop}
        onClick={() => {
          setError(null);
          setNaming(suggestParamName(params, prop));
        }}
      >
        Make a parameter
      </Button>
    );
  }

  const confirm = () => {
    const result = addParam(params, { name: naming, nodeId, prop });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onParamsChange(result.params);
    setNaming(null);
    setError(null);
  };

  return (
    <div className="flex flex-col gap-1" data-sauna-param-naming={prop}>
      <div className="flex items-center gap-1.5">
        <Input
          autoFocus
          value={naming}
          aria-label="Parameter name"
          className="h-7 text-xs"
          disabled={disabled}
          data-sauna-param-name-input={prop}
          onChange={(e) => {
            setNaming(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirm();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setNaming(null);
              setError(null);
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={disabled}
          data-sauna-param-confirm={prop}
          onClick={confirm}
        >
          Add
        </Button>
      </div>
      {error ? (
        <Text size="xs" variant="destructive" data-sauna-param-error={prop}>
          {paramNameErrorText(error)}
        </Text>
      ) : null}
    </div>
  );
}
