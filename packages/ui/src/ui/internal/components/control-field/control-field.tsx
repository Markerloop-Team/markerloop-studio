"use client"

import * as React from "react"

import { cn } from "../../utils/cn"
import { Label } from "../label"

type ControlFieldProps = {
  /** Text above the control; rendered as a `<label htmlFor>` pointing at it. */
  label: React.ReactNode
  /** Muted helper line under the control. Hidden while `error` is shown. */
  hint?: React.ReactNode
  /** Error under the control; also marks the control `aria-invalid`. */
  error?: string | null
  /** Id for the control. Generated with `React.useId` when absent. */
  id?: string
  className?: string
  /** Exactly one control (input, textarea, select trigger...). */
  children: React.ReactElement
}

type ControlProps = {
  id?: string
  "aria-invalid"?: React.AriaAttributes["aria-invalid"]
  "aria-describedby"?: string
}

/**
 * Label + one control + hint or error, without react-hook-form.
 *
 * The non-RHF counterpart of `Field.Item`/`Field.Label`/`Field.Message`: the
 * same label, the same gap, the same error colour and size. It wires `id`,
 * `aria-invalid` and `aria-describedby` onto its single child, but never
 * overrides a value the child already sets itself.
 *
 * Reached only as `FormControl.Field` — never a top-level export, because
 * `createSaunaRegistry` would turn a flat export into a page block type.
 */
function ControlField({
  label,
  hint,
  error,
  id,
  className,
  children,
}: ControlFieldProps) {
  const generatedId = React.useId()
  const child = React.Children.only(children) as React.ReactElement<ControlProps>
  const controlId = child.props.id ?? id ?? generatedId
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`
  const hasError = Boolean(error)
  const describedBy = hasError ? errorId : hint ? hintId : undefined

  const injected: ControlProps = {}
  if (child.props.id === undefined) injected.id = controlId
  if (child.props["aria-invalid"] === undefined && hasError) {
    injected["aria-invalid"] = true
  }
  if (child.props["aria-describedby"] === undefined && describedBy) {
    injected["aria-describedby"] = describedBy
  }

  return (
    <div
      data-slot="control-field"
      className={cn("flex flex-col gap-2", className)}
    >
      <Label
        htmlFor={controlId}
        data-error={hasError}
        className="data-[error=true]:text-destructive"
      >
        {label}
      </Label>
      {React.cloneElement(child, injected)}
      {hasError ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export { ControlField }
export type { ControlFieldProps }
