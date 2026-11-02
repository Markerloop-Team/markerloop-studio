"use client";

// The Image panel of the inspector (SDL-956, EP-190), after
// docs/component-studio-step3-image-2026-11-01/prototype.html: a thumbnail
// with the file name and "Replace" (pick from Files, upload, paste a link),
// Alt text with ⓘ, Shape as a list drawing each frame, Fit (Crop / Whole)
// only when the frame crops, the focus point set by a tap on the thumbnail,
// Width, Corners, Border, Shadow and Visibility.
//
// Built from the inspector control set (inspector-controls.tsx, SDL-952): the
// grey / blue-fill rule, the 84 px label rows and the sections are theirs.
// The panel is controlled and writes the engine's Image keys as they are on
// master (packages/engine/src/core/primitives.ts, ImageBlock): `src`, `alt`,
// `aspect`, `fit`, `focus {x, y}`, `width`, `fixedWidth`, `radius`, `border`,
// `shadow`. A patch value of `undefined` clears the key.

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useId, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  IMAGE_ASPECTS,
  IMAGE_FIXED_WIDTH_DEFAULT,
  IMAGE_FIXED_WIDTH_MAX,
  IMAGE_FIXED_WIDTH_MIN,
  IMAGE_OFFERED_ASPECTS,
  isAllowedMediaSrc,
  type ImageAspect,
} from "@markerloop/engine";
import { cn } from "@markerloop/ui/ui";

import {
  INSPECTOR_COLORS,
  INSPECTOR_STATE_ATTR,
  InspectorInfoHint,
  InspectorRow,
  InspectorSection,
  InspectorSegmented,
  InspectorSelect,
  InspectorToggle,
  inspectorFill,
  inspectorValueState,
  type InspectorSelectOption,
} from "./inspector-controls";

/** The Image props the panel reads and writes (engine names). */
export type ImagePanelValue = {
  src?: string;
  alt?: string;
  aspect?: string;
  fit?: string;
  focus?: { x: number; y: number };
  width?: string;
  fixedWidth?: number;
  radius?: string;
  border?: boolean;
  shadow?: boolean;
};

/** A picture of the workspace's Files the "Replace" popover offers. */
export type ImagePanelFile = { id: string; name: string; src: string };

export type ImagePanelVisibility = {
  value?: string;
  defaultValue: string;
  options: readonly InspectorSelectOption[];
  onChange: (value: string) => void;
};

export type ImageInspectorPanelProps = {
  value: ImagePanelValue;
  onChange: (patch: Partial<ImagePanelValue>) => void;
  /**
   * What the thumbnail draws when `src` is not a drawable address — a host
   * resolves a `mlfile:` reference to its URL here. Absent = `src` itself.
   */
  previewSrc?: string;
  /** File name under the thumbnail; absent = derived from `files` / `src`. */
  fileName?: string;
  /** Name in the panel's header (the node's name); "Image" by default. */
  title?: string;
  /** Pictures of the workspace's Files; absent or empty — the grid says so. */
  files?: readonly ImagePanelFile[];
  /** Upload from the device; absent — the item is shown as "Soon". */
  onUpload?: () => void;
  /** Visibility list (audience); absent — the row is not drawn. */
  visibility?: ImagePanelVisibility;
  /** Per-field slot after the label — the parameter chip ◇ of the host. */
  fieldAction?: (field: keyof ImagePanelValue) => ReactNode;
  disabled?: boolean;
};

/**
 * Engine defaults of the panel's controls; grey when equal, a blue fill when
 * set. Width has none of its own: see imageDefaultWidth.
 */
export const IMAGE_PANEL_DEFAULTS = {
  aspect: "auto",
  fit: "cover",
  radius: "none",
  border: false,
  shadow: false,
  focus: { x: 50, y: 50 },
} as const;

/**
 * What the engine draws for an Image WITHOUT `width` (primitives.ts, SDL-951):
 * the picture's own width in an `auto` frame (= hug), the container's in a
 * framed one (= fill). The Width row shows this as its grey default.
 */
export function imageDefaultWidth(aspect: string | undefined): "hug" | "fill" {
  return !aspect || aspect === "auto" ? "hug" : "fill";
}

/**
 * The shapes the list offers: the engine's offered four (owner, 13 Oct 2026),
 * plus the stored value when a node already has one of the other three — so
 * the list shows what is on the page (the same rule as ImageAspectEditor).
 */
export function imageShapeChoices(current: string | undefined): readonly { value: ImageAspect; label: string }[] {
  const offered: string[] = [...IMAGE_OFFERED_ASPECTS];
  if (current && !offered.includes(current) && (IMAGE_ASPECTS as readonly string[]).includes(current)) offered.push(current);
  return IMAGE_SHAPE_OPTIONS.filter((o) => offered.includes(o.value));
}

/** Names of all seven frame shapes, in the prototype's order. */
export const IMAGE_SHAPE_OPTIONS: readonly { value: ImageAspect; label: string }[] = [
  { value: "auto", label: "Original" },
  { value: "16 / 9", label: "16:9" },
  { value: "3 / 2", label: "3:2" },
  { value: "4 / 3", label: "4:3" },
  { value: "1 / 1", label: "Square" },
  { value: "3 / 4", label: "3:4" },
  { value: "9 / 16", label: "9:16" },
];

const FOCUS = "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#008ed0]";
const STATE = (s: "default" | "set") => ({ [INSPECTOR_STATE_ATTR]: s });

const Icon = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const CoverIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 15l5-5 5 5 3-3 5 5" />
  </Icon>
);
const ContainIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <rect x="7" y="7" width="10" height="10" rx="1" fill="currentColor" opacity=".18" />
  </Icon>
);
const UploadIcon = () => (
  <Icon>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </Icon>
);
const LinkIcon = () => (
  <Icon>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Icon>
);
const DownIcon = () => (
  <Icon>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

/** The frame drawn at its proportions (dashed for "Original"), after the prototype's `shape()`. */
export function ImageShapeMark({ aspect, size = 14 }: { aspect: string; size?: number }) {
  // Longhands: React warns when a rerender swaps borderStyle under a `border` shorthand.
  const base: CSSProperties = { display: "inline-block", borderWidth: 1.5, borderStyle: "solid", borderColor: "currentColor", borderRadius: 2, flexShrink: 0 };
  if (aspect === "auto") return <i data-image-shape="auto" style={{ ...base, width: Math.round(size * 1.2), height: size, borderStyle: "dashed" }} />;
  const [w, h] = aspect.split(" / ").map(Number);
  const k = (size / Math.max(w, h)) * 1.4;
  return <i data-image-shape={aspect} style={{ ...base, width: Math.round(w * k), height: Math.round(h * k) }} />;
}

/** File name shown under the thumbnail: the file's own name, else the last part of the address. */
export function imageFileName(src: string | undefined, files?: readonly ImagePanelFile[]): string {
  if (!src) return "No picture";
  const hit = files?.find((f) => f.src === src);
  if (hit) return hit.name;
  if (src.startsWith("data:")) return "Embedded picture";
  const tail = src.split(/[?#]/)[0].split("/").filter(Boolean).pop();
  try {
    return tail ? decodeURIComponent(tail) : src;
  } catch {
    return tail ?? src;
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Focus point of a click inside a box, whole percents. */
export function focusFromClick(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  const x = rect.width > 0 ? ((clientX - rect.left) / rect.width) * 100 : 50;
  const y = rect.height > 0 ? ((clientY - rect.top) / rect.height) * 100 : 50;
  return { x: Math.round(clamp(x, 0, 100)), y: Math.round(clamp(y, 0, 100)) };
}

function Label({ text, action }: { text: string; action?: ReactNode }) {
  return action ? (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{text}</span>
      {action}
    </span>
  ) : (
    <>{text}</>
  );
}

export function ImageInspectorPanel({ value, onChange, previewSrc, fileName, title = "Image", files, onUpload, visibility, fieldAction, disabled }: ImageInspectorPanelProps) {
  const altId = useId();
  const widthId = useId();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [shapeOpen, setShapeOpen] = useState(false);
  const [linkMode, setLinkMode] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState(false);

  const aspect = value.aspect ?? IMAGE_PANEL_DEFAULTS.aspect;
  const fit = value.fit ?? IMAGE_PANEL_DEFAULTS.fit;
  const cropped = aspect !== "auto";
  const focusable = cropped && fit === "cover" && !!value.src;
  const focus = value.focus ?? IMAGE_PANEL_DEFAULTS.focus;
  const shapeState = inspectorValueState(value.aspect, IMAGE_PANEL_DEFAULTS.aspect);
  const shapeLabel = IMAGE_SHAPE_OPTIONS.find((o) => o.value === aspect)?.label ?? aspect;
  const name = fileName ?? imageFileName(value.src, files);
  const drawn = previewSrc ?? value.src;
  const fromFiles = !!value.src && !!files?.some((f) => f.src === value.src);

  const setFocusAt = (e: MouseEvent<HTMLButtonElement>) => {
    // Enter / Space fire a click with detail 0 and no pointer position — that
    // would write {0, 0}. The keyboard moves the point with the arrows instead.
    if (disabled || e.detail === 0) return;
    onChange({ focus: focusFromClick(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()) });
  };
  const nudgeFocus = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 10 : 5;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d || disabled) return;
    e.preventDefault();
    onChange({ focus: { x: clamp(focus.x + d[0], 0, 100), y: clamp(focus.y + d[1], 0, 100) } });
  };
  const pickSrc = (src: string) => {
    // A new picture starts centred: the old focus belonged to the old picture.
    onChange({ src, focus: undefined });
    setSourceOpen(false);
    setLinkMode(false);
    setLink("");
    setLinkError(false);
  };

  const thumbStyle: CSSProperties = {
    width: 96,
    height: 72,
    borderRadius: 8,
    backgroundImage: drawn ? `url("${drawn.replace(/"/g, "%22")}")` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    position: "relative",
    padding: 0,
    cursor: focusable ? "crosshair" : "pointer",
  };

  const replace = (
    <PopoverPrimitive.Root
      open={sourceOpen}
      onOpenChange={(o) => {
        setSourceOpen(o);
        if (!o) setLinkMode(false);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-image-replace=""
          className={`cursor-pointer border-0 bg-transparent p-0 font-medium ${FOCUS}`}
          style={{ color: INSPECTOR_COLORS.set, fontSize: 12 }}
        >
          Replace
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          data-image-source-popover=""
          className="z-50 rounded-[10px] bg-popover text-popover-foreground shadow-[0_12px_32px_rgba(0,0,0,0.16),0_0_0_1px_var(--border)]"
          style={{ width: 236, padding: 4 }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: INSPECTOR_COLORS.default, padding: "8px 10px 4px" }}>
            Files
          </div>
          {files && files.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, padding: "4px 8px 8px" }}>
              {files.map((f) => {
                const on = f.src === value.src;
                return (
                  <button
                    key={f.id}
                    type="button"
                    title={f.name}
                    aria-label={f.name}
                    aria-pressed={on}
                    data-image-file={f.id}
                    onClick={() => pickSrc(f.src)}
                    className={`cursor-pointer border border-border p-0 ${FOCUS}`}
                    style={{
                      aspectRatio: "4 / 3",
                      borderRadius: 6,
                      backgroundImage: `url("${f.src.replace(/"/g, "%22")}")`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      boxShadow: on ? `0 0 0 2px ${INSPECTOR_COLORS.set}` : undefined,
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <p style={{ margin: 0, padding: "4px 10px 8px", fontSize: 12, color: INSPECTOR_COLORS.default }}>No pictures in Files yet</p>
          )}
          <button
            type="button"
            data-image-upload=""
            disabled={!onUpload}
            onClick={() => {
              setSourceOpen(false);
              onUpload?.();
            }}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] border-0 bg-transparent text-left hover:bg-muted disabled:cursor-default disabled:opacity-55 ${FOCUS}`}
            style={{ padding: "8px 10px", fontSize: 13 }}
          >
            <span className="flex w-6 justify-center" style={{ color: INSPECTOR_COLORS.default }}>
              <UploadIcon />
            </span>
            Upload from device
            {!onUpload ? (
              <span className="ml-auto rounded-[5px] border border-border px-1.5" style={{ fontSize: 10.5, color: INSPECTOR_COLORS.default }}>
                Soon
              </span>
            ) : null}
          </button>
          {linkMode ? (
            <form
              data-image-link-form=""
              className="flex gap-1.5"
              style={{ padding: "6px 8px 8px" }}
              onSubmit={(e) => {
                e.preventDefault();
                const next = link.trim();
                // The rule pages-service applies (422 otherwise): https:// or a Files reference.
                if (!next || !isAllowedMediaSrc(next)) {
                  setLinkError(true);
                  return;
                }
                pickSrc(next);
              }}
            >
              <input
                autoFocus
                aria-label="Picture address"
                placeholder="https://"
                value={link}
                aria-invalid={linkError || undefined}
                onChange={(e) => {
                  setLink(e.target.value);
                  setLinkError(false);
                }}
                className="min-w-0 flex-1 rounded-[7px] border border-border bg-background px-2.5 text-foreground"
                style={{ height: 32, fontSize: 13 }}
              />
              <button
                type="submit"
                disabled={!link.trim()}
                className={`rounded-[7px] border-0 bg-primary px-3 font-medium text-primary-foreground disabled:opacity-55 ${FOCUS}`}
                style={{ height: 32, fontSize: 13 }}
              >
                Use
              </button>
            </form>
          ) : null}
          {linkMode && linkError ? (
            <p data-image-link-error="" role="alert" style={{ margin: 0, padding: "0 10px 8px", fontSize: 12, color: INSPECTOR_COLORS.default }}>
              Use an https:// address
            </p>
          ) : null}
          {linkMode ? null : (
            <button
              type="button"
              data-image-link=""
              onClick={() => setLinkMode(true)}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] border-0 bg-transparent text-left hover:bg-muted ${FOCUS}`}
              style={{ padding: "8px 10px", fontSize: 13 }}
            >
              <span className="flex w-6 justify-center" style={{ color: INSPECTOR_COLORS.default }}>
                <LinkIcon />
              </span>
              Paste a link
            </button>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );

  return (
    // A disabled fieldset disables every native control inside — segments,
    // switches, list triggers, inputs — so `disabled` reaches all of them.
    <fieldset data-inspector-panel="Image" disabled={disabled} className="m-0 min-w-0 border-0 p-0 text-foreground">
      <div className="flex items-baseline gap-2" style={{ padding: "16px 20px 10px" }}>
        <b className="truncate" style={{ fontSize: 15 }}>
          {title}
        </b>
        <span style={{ fontSize: 12.5, color: INSPECTOR_COLORS.default }}>Image</span>
      </div>

      <InspectorSection title="Content">
        <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", gap: 12, alignItems: "center", padding: "4px 0 8px" }}>
          {focusable ? (
            <button
              type="button"
              aria-label={`Focus point, ${focus.x}% from the left, ${focus.y}% from the top`}
              data-image-thumb="focus"
              disabled={disabled}
              onClick={setFocusAt}
              onKeyDown={nudgeFocus}
              {...STATE(inspectorValueState(value.focus ? `${value.focus.x},${value.focus.y}` : undefined, "50,50"))}
              className={`border border-border ${FOCUS}`}
              style={thumbStyle}
            >
              <span
                data-image-focus-dot=""
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: `${focus.x}%`,
                  top: `${focus.y}%`,
                  width: 16,
                  height: 16,
                  margin: "-8px 0 0 -8px",
                  borderRadius: 8,
                  border: "2px solid #fff",
                  boxShadow: `0 0 0 1.5px ${INSPECTOR_COLORS.set}, 0 1px 4px rgba(0,0,0,.4)`,
                  background: INSPECTOR_COLORS.set,
                }}
              />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Replace picture"
              data-image-thumb="source"
              disabled={disabled}
              onClick={() => setSourceOpen(true)}
              className={cn("border border-border", !value.src && "bg-muted", FOCUS)}
              style={thumbStyle}
            />
          )}
          <div className="flex min-w-0 flex-col items-start" style={{ gap: 3 }}>
            <b data-image-file-name="" className="max-w-full truncate font-medium" style={{ fontSize: 13.5 }} title={value.src}>
              {name}
            </b>
            <span style={{ fontSize: 12, color: INSPECTOR_COLORS.default }}>
              {focusable ? "Tap it to set the focus" : value.src ? (fromFiles ? "From Files" : "From a link") : "Pick a picture"}
            </span>
            <span className="flex items-center gap-1">
              {replace}
              {fieldAction?.("src")}
            </span>
          </div>
        </div>
        <div
          data-inspector-row=""
          style={{ display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", alignItems: "start", gap: 12, minHeight: 44, fontSize: 13.5, paddingTop: 6 }}
        >
          <span className="flex min-w-0 items-center gap-1" style={{ paddingTop: 8 }}>
            <label htmlFor={altId} className="whitespace-nowrap" style={{ color: INSPECTOR_COLORS.default }}>
              Alt text
            </label>
            <InspectorInfoHint label="About alt text">
              Read aloud by screen readers and shown if the picture fails to load. Leave empty for a decorative picture.
            </InspectorInfoHint>
            {fieldAction?.("alt")}
          </span>
          <textarea
            id={altId}
            rows={2}
            disabled={disabled}
            placeholder="Describe the picture"
            value={value.alt ?? ""}
            onChange={(e) => onChange({ alt: e.target.value })}
            className={`w-full resize-y rounded-[8px] border border-border bg-background text-foreground ${FOCUS}`}
            style={{ padding: "8px 10px", font: "inherit", fontSize: 13.5, lineHeight: 1.4 }}
          />
        </div>
      </InspectorSection>

      <InspectorSection title="Frame">
        <InspectorRow label="Shape" hint={fieldAction?.("aspect")}>
          <PopoverPrimitive.Root open={shapeOpen} onOpenChange={setShapeOpen}>
            <PopoverPrimitive.Trigger asChild>
              <button
                type="button"
                aria-label={`Shape: ${shapeLabel}`}
                disabled={disabled}
                data-inspector-control="shape"
                {...STATE(shapeState)}
                className={`flex w-full cursor-pointer items-center justify-between border border-border bg-background text-left ${FOCUS}`}
                style={{ height: 34, borderRadius: 8, fontSize: 13.5, padding: "0 8px", color: INSPECTOR_COLORS.default, ...inspectorFill(shapeState) }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ImageShapeMark aspect={aspect} />
                  <span className="truncate">{shapeLabel}</span>
                </span>
                <DownIcon />
              </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
              <PopoverPrimitive.Content
                align="end"
                sideOffset={6}
                data-image-shape-popover=""
                role="listbox"
                aria-label="Shape"
                className="z-50 rounded-[10px] bg-popover text-popover-foreground shadow-[0_12px_32px_rgba(0,0,0,0.16),0_0_0_1px_var(--border)]"
                style={{ width: 236, padding: 4 }}
              >
                {imageShapeChoices(value.aspect).map((o) => {
                  const on = o.value === aspect;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={on}
                      data-image-aspect={o.value}
                      onClick={() => {
                        onChange({ aspect: o.value === IMAGE_PANEL_DEFAULTS.aspect ? undefined : o.value });
                        setShapeOpen(false);
                      }}
                      className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] border-0 bg-transparent text-left hover:bg-muted", on && "bg-muted", FOCUS)}
                      style={{ padding: "8px 10px", fontSize: 13 }}
                    >
                      <span className="flex w-6 justify-center" style={{ color: INSPECTOR_COLORS.default }}>
                        <ImageShapeMark aspect={o.value} size={16} />
                      </span>
                      {o.label}
                    </button>
                  );
                })}
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          </PopoverPrimitive.Root>
        </InspectorRow>
        {cropped ? (
          <InspectorRow label="Fit" hint={fieldAction?.("fit")}>
            <InspectorSegmented
              label="Fit"
              options={[
                { value: "cover", label: "Fill the frame, crop the edges", icon: <span className="flex items-center gap-1.5"><CoverIcon /> Crop</span> },
                { value: "contain", label: "Show the whole picture", icon: <span className="flex items-center gap-1.5"><ContainIcon /> Whole</span> },
                // A stored fit the panel does not offer (fill, none, scale-down) is shown as it is.
                ...(value.fit && value.fit !== "cover" && value.fit !== "contain" ? [{ value: value.fit, label: value.fit }] : []),
              ]}
              value={value.fit}
              defaultValue={IMAGE_PANEL_DEFAULTS.fit}
              onChange={(next) => onChange({ fit: next })}
            />
          </InspectorRow>
        ) : null}
        <InspectorRow label="Width" htmlFor={widthId} hint={fieldAction?.("width")}>
          <InspectorSegmented
            id={widthId}
            label="Width"
            options={[
              { value: "fill", label: "Fill" },
              { value: "hug", label: "Hug" },
              { value: "fixed", label: "Fixed" },
            ]}
            value={value.width}
            defaultValue={imageDefaultWidth(value.aspect)}
            onChange={(next) => onChange({ width: next })}
          />
        </InspectorRow>
        {value.width === "fixed" ? (
          <InspectorRow label="">
            <FixedWidthInput value={value.fixedWidth} disabled={disabled} onCommit={(n) => onChange({ fixedWidth: n })} />
          </InspectorRow>
        ) : null}
      </InspectorSection>

      <InspectorSection title="Look">
        <InspectorRow label="Corners" hint={fieldAction?.("radius")}>
          <InspectorSegmented
            label="Corners"
            options={[
              { value: "none", label: "Square" },
              { value: "theme", label: "Theme" },
              { value: "full", label: "Round" },
            ]}
            value={value.radius}
            defaultValue={IMAGE_PANEL_DEFAULTS.radius}
            onChange={(next) => onChange({ radius: next })}
          />
        </InspectorRow>
        <InspectorRow label="Border" hint={fieldAction?.("border")}>
          <InspectorToggle label="Border" value={value.border} defaultValue={IMAGE_PANEL_DEFAULTS.border} onChange={(next) => onChange({ border: next || undefined })} />
        </InspectorRow>
        <InspectorRow label="Shadow" hint={fieldAction?.("shadow")}>
          <InspectorToggle label="Shadow" value={value.shadow} defaultValue={IMAGE_PANEL_DEFAULTS.shadow} onChange={(next) => onChange({ shadow: next || undefined })} />
        </InspectorRow>
      </InspectorSection>

      {/* The prototype's last section has no heading: Visibility, then On click (not built yet). */}
      <InspectorSection title="">
        {visibility ? (
          <InspectorRow label="Visibility">
            <InspectorSelect
              label="Visibility"
              options={visibility.options}
              value={visibility.value}
              defaultValue={visibility.defaultValue}
              onChange={visibility.onChange}
            />
          </InspectorRow>
        ) : null}
        <InspectorRow label="On click" className="opacity-55">
          <div
            data-image-on-click=""
            className="flex w-full items-center justify-between border border-border bg-background"
            style={{ height: 34, borderRadius: 8, fontSize: 13.5, padding: "0 8px", color: INSPECTOR_COLORS.default }}
          >
            Nothing
            <span className="rounded-[5px] border border-border px-1.5" style={{ fontSize: 10.5 }}>
              Soon
            </span>
          </div>
        </InspectorRow>
      </InspectorSection>
    </fieldset>
  );
}

function FixedWidthInput({ value, disabled, onCommit }: { value?: number; disabled?: boolean; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value ?? IMAGE_FIXED_WIDTH_DEFAULT);
  const commit = () => {
    if (draft === null) return;
    const n = Math.round(Number(draft));
    setDraft(null);
    if (!Number.isFinite(n) || draft.trim() === "") return;
    onCommit(clamp(n, IMAGE_FIXED_WIDTH_MIN, IMAGE_FIXED_WIDTH_MAX));
  };
  const state = inspectorValueState(value, IMAGE_FIXED_WIDTH_DEFAULT);
  return (
    <input
      type="number"
      aria-label="Fixed width"
      data-inspector-control="fixed-width"
      {...STATE(state)}
      min={IMAGE_FIXED_WIDTH_MIN}
      max={IMAGE_FIXED_WIDTH_MAX}
      step={20}
      disabled={disabled}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className={`w-full rounded-[7px] border border-border bg-background text-center text-foreground ${FOCUS}`}
      style={{ height: 32, fontSize: 13, ...inspectorFill(state) }}
    />
  );
}
