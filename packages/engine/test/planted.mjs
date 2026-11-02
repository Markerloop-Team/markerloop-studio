// Planted-defect check for the guarded behaviours (SDL-624, SDL-632). Modelled on
// `packages/studio/test/planted.mjs`.
//
//   pnpm --filter @markerloop/engine test:planted
//
// Plants each known regression into src, rebuilds, runs the suite and
// requires it to FAIL, then restores the file. A plant the suite survives is
// a guard that guards nothing — the script exits 1 and names it.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PLANTS_ALL = [
  {
    // G: the renderer forgets about file references altogether — the stored
    // `mlfile:…` string reaches `<img src>` and a visitor's browser requests
    // it from the page's host.
    name: "G: resolveProps passes mlfile: references straight to the component",
    file: "src/react/renderer.tsx",
    from:
      "  for (const [key, value] of Object.entries(next)) {\n" +
      "    const fileId = parseFileRef(value);\n" +
      "    if (fileId === null) continue;\n" +
      "    const url = context?.file?.(fileId)?.url;\n" +
      "    // The host's resolver is code we do not own: its URL is checked too (SDL-681).\n" +
      "    if (url && stripUnsafeProps({ [key]: url })[key] !== undefined) next[key] = url;\n" +
      "    else delete next[key];\n" +
      "  }\n",
    to: "",
  },
  {
    // G2: a reference the host cannot resolve is left as it was, instead of
    // being dropped so `Image` draws its empty frame.
    name: "G2: an unresolved mlfile: reference is passed through unchanged",
    file: "src/react/renderer.tsx",
    from: "    else delete next[key];\n",
    to: "",
  },
  {
    // N: the nil UUID passes as a file id — the server refuses it (422), so
    // the editor would store a reference the service never accepts.
    name: "N: parseFileRef accepts the nil UUID",
    file: "src/core/file-refs.ts",
    from: "  return lower === NIL_UUID ? null : lower;\n",
    to: "  return lower;\n",
  },
  {
    // S: the DataView source stops being strict — a `project_id` (gone since
    // SDL-617) or any other foreign key is silently dropped instead of
    // refused, and a document keeps a binding nobody can serve.
    name: "S: DataView source accepts and drops unknown keys such as project_id",
    file: "src/core/data-view.ts",
    from: "export const DataViewSource = z.strictObject({\n",
    to: "export const DataViewSource = z.object({\n",
  },
  {
    // V: a node's propsVersion is ignored — props written against a future
    // contract are parsed as v1 and misread instead of refused by number.
    name: "V: parseElementProps ignores a foreign propsVersion",
    file: "src/core/element-props.ts",
    from: "  const mismatch = elementPropsVersionMismatch(def, node);\n",
    to: "  const mismatch = null as ReturnType<typeof elementPropsVersionMismatch>;\n",
  },
  // --- SDL-667: the node carries its Element's version ----------------------
  {
    // PV1: insertion forgets the version — an Element at propsVersion 2
    // inserts a node that reads as v1, and the next render refuses the props
    // the editor itself just wrote.
    name: "PV1: an insertion at propsVersion 2 writes a node without the version",
    file: "src/core/schema-ops.ts",
    from: "    ...createInitialNodeConfig(child.type, child.propsVersion),\n",
    to: "    ...createInitialNodeConfig(child.type),\n",
  },
  {
    // PV2: the renderer stops checking — a v2 node is drawn by its v1
    // definition's component, which misreads the props instead of a plate.
    name: "PV2: the renderer draws a v2 node with its v1 definition",
    file: "src/react/renderer.tsx",
    from: "    const mismatch = def ? elementPropsVersionMismatch(def, node) : null;\n",
    to: "    const mismatch = null as ReturnType<typeof elementPropsVersionMismatch>;\n",
  },
  {
    // PV3: "absent = 1" is broken from the writing side — every new node is
    // stamped, v1 included, so fresh documents stop looking like old ones.
    name: "PV3: createInitialNodeConfig writes propsVersion 1",
    file: "src/core/schema-ops.ts",
    from: "  return propsVersion !== undefined && propsVersion !== SAUNA_DEFAULT_PROPS_VERSION ? { type, propsVersion } : { type };\n",
    to: "  return propsVersion !== undefined ? { type, propsVersion } : { type };\n",
  },
  {
    // PV4: a compound item's content child is created without its version.
    name: "PV4: addCompoundItem ignores propsVersionOf for the content child",
    file: "src/core/compounds.ts",
    from: "  const contentVersion = options?.propsVersionOf?.(COMPOUND_ITEM_CONTENT.type);\n",
    to: "  const contentVersion = undefined as number | undefined; void options;\n",
  },
  // --- SDL-670: declarative props migrations --------------------------------
  {
    // M1: a bump without a migration goes through — propsVersion 2 with no
    // migration is accepted by defineBlock and the catalog, and every stored
    // node of that type becomes a plate on published pages.
    name: "M1: checkElementMigrations accepts propsVersion 2 without a migration",
    file: "src/core/element-migrations.ts",
    from: "  if (migrations.length !== version - 1) {\n",
    to: "  if (false && migrations.length !== version - 1) {\n",
  },
  {
    // M2: migrated props are trusted — a step that writes props outside
    // staticProps reaches the component unchecked.
    name: "M2: parseElementProps skips staticProps after a migration",
    file: "src/core/element-props.ts",
    from: "  const parsed = def.staticProps.safeParse(raw);\n",
    to: "  const parsed = mismatch ? ({ success: true, data: raw } as const) : def.staticProps.safeParse(raw);\n",
  },
  {
    // M3: an unregistered custom id is skipped silently — TS and Go would
    // migrate the same node differently.
    name: "M3: an unregistered custom step is a silent no-op",
    file: "src/core/element-migrations.ts",
    from: "    if (!impl) throw new ElementMigrationError(\"unknown_custom\", `custom migration \"${step.id}\" has no registered implementation`);\n",
    to: "    if (!impl) return node;\n",
  },
  {
    // M4: setDefault writes into override layers — a phone override suddenly
    // pins a value the base props were meant to supply.
    name: "M4: setDefault writes into every member/screens/variants layer",
    file: "src/core/element-migrations.ts",
    from: "      if (ctx && (segs.length === 1 || !Object.prototype.hasOwnProperty.call(layer, segs[0]!))) return;\n",
    to: "",
  },
  {
    // M5: the input node is migrated in place — the stored document changes
    // under the caller that only asked to read it.
    name: "M5: migrateElementProps mutates its input",
    file: "src/core/element-migrations.ts",
    from: "  let out = clone(node) as unknown as SaunaNodeConfig;\n",
    to: "  let out = node as unknown as SaunaNodeConfig;\n",
  },
  {
    // M6 (review of !270): a nested setDefault stays in the base — a phone
    // override holding its own `source` hides the default (shallow overlay).
    name: "M6: a nested setDefault skips override layers that hold the parent",
    file: "src/core/element-migrations.ts",
    from: "      if (ctx && (segs.length === 1 || !Object.prototype.hasOwnProperty.call(layer, segs[0]!))) return;\n",
    to: "      if (ctx) return;\n",
  },
  {
    // M7 (review of !270): a nested move writes a partial parent into an
    // override layer, which then erases the base's siblings.
    name: "M7: a nested move does not seed the override layer's parent from the base",
    file: "src/core/element-migrations.ts",
    from: "    if (isPlainObject(seed)) layer[top] = clone(seed);\n",
    to: "    void seed;\n",
  },
  {
    // M8: propsVersion 0 / -1 / 1.5 on a node runs the chain with a bogus index.
    name: "M8: migrateElementProps accepts a node propsVersion that is not an integer >= 1",
    file: "src/core/element-migrations.ts",
    from: "  if (!Number.isInteger(from) || from < 1) {\n",
    to: "  if (false) {\n",
  },
  {
    // M9: unknown step fields pass — they leak into element-catalog.json and catalogVersion.
    name: "M9: a step field its op does not take is accepted",
    file: "src/core/element-migrations.ts",
    from: "    if (extra.length) throw new ElementMigrationError(\"invalid_step\", `${where}: ${String(step.op)} does not take ${extra.join(\", \")}`);\n",
    to: "",
  },
  {
    // M10: setDefault accepts a value that is not JSON (NaN, a Date, a function).
    name: "M10: setDefault accepts a non-JSON value",
    file: "src/core/element-migrations.ts",
    from: "      if (!(\"value\" in step) || !isJsonValue(step.value)) throw",
    to: "      if (!(\"value\" in step) || step.value === undefined) throw",
  },
  {
    // M11 (delta review of !270): a layer that holds `source: null` fails the
    // whole node on a nested setDefault instead of being skipped.
    name: "M11: a nested setDefault fails on a layer holding a non-object on the path",
    file: "src/core/element-migrations.ts",
    from: "        if (!ctx || !isPathConflict(e)) throw e;\n",
    to: "        throw e;\n",
  },
  {
    // M12 (delta review of !270): a layer holding the target's parent but not
    // the source hides the value the base just moved (probe C).
    name: "M12: a nested move does not carry the base value into a layer holding the target's parent",
    file: "src/core/element-migrations.ts",
    from: "      setAt(layer, toSegs, clone(ctx.baseSourceBefore.value), to);\n",
    to: "      void ctx;\n",
  },
  // --- SDL-632: visibility modes, public shell, props layers ---------------
  {
    // P1: `"private"` reads as visible — a guest is shown members-only content.
    name: "P1: evaluateVisibility treats private as visible",
    file: "src/react/visibility.ts",
    from: '    if (rule === "private") return saunaAudience(context) === "member";\n',
    to: '    if (rule === "private") return true;\n',
  },
  {
    // P2: the cut follows `children` only; a node reachable through
    // `variants[].children` of a private node survives into the public body.
    name: "P2: saunaPublicShell skips the variants[].children path",
    file: "src/core/public-shell.ts",
    from:
      "  if (Array.isArray(node.variants)) {\n" +
      "    for (const variant of node.variants) {\n" +
      "      if (variant && Array.isArray(variant.children)) out.push(...variant.children);\n" +
      "    }\n" +
      "  }\n" +
      "  return out;\n",
    to: "  return out;\n",
  },
  {
    // P3: `member` stays on the nodes of the public shell — a guest's body
    // carries the members' prices.
    name: "P3: saunaPublicShell leaves member in the shell",
    file: "src/core/public-shell.ts",
    from: "    const { member: _member, ...rest } = node;\n    void _member;\n",
    to: "    const rest = node;\n",
  },
  {
    // P4: an override's `params` replaces the ref's whole params map instead
    // of merging by parameter name — sibling parameters vanish.
    name: "P4: params of a Ref are replaced whole instead of merged by name",
    file: "src/core/visibility-mode.ts",
    from: "        ? { ...prev, ...value }\n",
    to: "        ? value\n",
  },
  {
    // P5: the renderer lays member.props over any node for a member, not only
    // where the mode in force is hybrid.
    name: "P5: renderer applies member.props outside a hybrid node",
    file: "src/react/renderer.tsx",
    from: '    const body = resolveNodeBody(node, context, { memberBranch: isMember && mode === "hybrid" });\n',
    to: "    const body = resolveNodeBody(node, context, { memberBranch: isMember });\n",
  },
  {
    // P6: the validator lets any string through as a mode — a typo that the
    // renderer hides and the shell cuts reaches storage with nothing red.
    name: "P6: validateSaunaSchema accepts an unknown visibility string",
    file: "src/schema/validate.ts",
    from: "    if (!isSaunaVisibilityMode(value)) {\n",
    to: "    if (false && !isSaunaVisibilityMode(value)) {\n",
  },
  {
    // P7: the parents-chain sweep goes back to the quadratic "rescan the map
    // until nothing grows" loop — correct, but a minute per GET at 50k nodes.
    name: "P7: saunaPrivateNodeIds sweeps the parents map quadratically",
    file: "src/core/public-shell.ts",
    edits: [
      {
        from: "    const viaParents = byParent.get(id);\n    if (viaParents) stack.push(...viaParents);\n",
        to: "",
      },
      {
        from: "  return removed;\n}\n\n/**\n * The v1 tree",
        to:
          "  let grew = true;\n" +
          "  while (grew) {\n" +
          "    grew = false;\n" +
          "    for (const [id, parent] of Object.entries(schema.parents ?? {})) {\n" +
          "      if (!removed.has(id) && parent != null && removed.has(parent)) {\n" +
          "        removed.add(id);\n" +
          "        grew = true;\n" +
          "      }\n" +
          "    }\n" +
          "  }\n" +
          "  return removed;\n}\n\n/**\n * The v1 tree",
      },
    ],
  },
  {
    // P8: the v1 `root` tree is not cut — a private node of a v1 document
    // ships to a visitor whole.
    name: "P8: saunaPublicShell ignores the v1 root tree",
    file: "src/core/public-shell.ts",
    from: "  const hasRoot = !!withRoot.root && typeof withRoot.root === \"object\";\n",
    to: "  const hasRoot = false;\n",
  },
  // --- SDL-633: compound Elements, the part guard, the block reference -----
  {
    // C1: TabsTrigger goes straight under Tabs — Radix throws without TabsList.
    name: "C1: TabsView.expand puts TabsTrigger under Tabs, skipping TabsList",
    file: "src/core/compounds.ts",
    from: "        const trigger = add(\"TabsTrigger\", { value: `tab-${i}` }, list);\n",
    to: "        const trigger = add(\"TabsTrigger\", { value: `tab-${i}` }, root);\n",
  },
  {
    // C2: the node's pass-through props do not reach the root — the canvas can no longer select the compound.
    name: "C2: createCompoundRegistry drops the root's pass-through props (data-sauna-node-id)",
    file: "src/react/compounds.tsx",
    from: "  const props = id === tree.rootId ? { ...node.props, ...rootProps } : { ...node.props };\n",
    to: "  const props = { ...node.props };\n",
  },
  {
    // C6 (review of a57dc14): toArray drops a hidden child's null, the next child moves into its slot.
    name: "C6: the compound component filters children with React.Children.toArray",
    file: "src/react/compounds.tsx",
    from: "    const own: React.ReactNode[] = Array.isArray(children) ? children : children == null ? [] : [children];\n",
    to: "    const own: React.ReactNode[] = React.Children.toArray(children);\n",
  },
  {
    // C7 (review of a57dc14): removing an item leaves its child behind — content slides under the next title.
    name: "C7: removeCompoundItem removes the item but not its child",
    file: "src/core/compounds.ts",
    from: "    if (index < children.length) removed = children.splice(index, 1)[0];\n",
    to: "",
  },
  {
    // C8: moving an item leaves the children where they were.
    name: "C8: moveCompoundItem moves the item but not its child",
    file: "src/core/compounds.ts",
    from: "    const [child] = children.splice(from, 1);\n    children.splice(to, 0, child);\n",
    to: "    const child = children[from];\n",
  },
  {
    // C9 (SDL-633 item editor): adding an item without its own child — a leftover block slides under the new title.
    name: "C9: addCompoundItem adds the item but no content child",
    file: "src/core/compounds.ts",
    from: "  children.splice(at, 0, ...ids);\n",
    to: "",
  },
  {
    // SDL-633 review: an item edit keeps `screens[w].props.items` — a phone override shows a deleted heading over the next content.
    name: "C10: item edits keep the width / member overrides of items",
    file: "src/core/compounds.ts",
    from: "[nodeId]: { ...withoutItemsOverrides(node), props: { ...node.props, items }, children:",
    to: "[nodeId]: { ...node, props: { ...node.props, items }, children:",
  },
  {
    // SDL-633 review: a move refused for a hole counts the `undefined` padding as a change — the node is rewritten, its overrides dropped.
    name: "C11: a move refused for a hole still rewrites the node",
    file: "src/core/compounds.ts",
    from: "  if (JSON.stringify([items, filled]) === before) return schema;\n",
    to: "  if (JSON.stringify([items, children]) === before) return schema;\n",
  },
  {
    // C4: `collapsible` goes to the root of a multiple accordion — Radix hands it to the DOM <div>.
    name: "C4: AccordionView.expand passes collapsible to a multiple Accordion",
    file: "src/core/compounds.ts",
    from: '? { type: "single", collapsible: p.collapsible } : { type: "multiple" }',
    to: '? { type: "single", collapsible: p.collapsible } : { type: "multiple", collapsible: p.collapsible }',
  },
  {
    // C5: every AccordionView child goes to the first item — the slot index is lost.
    name: "C5: AccordionView.expand puts every child in the first item",
    file: "src/core/compounds.ts",
    from: "        add(SAUNA_COMPOUND_SLOT, { index: i }, content);\n      });\n    }),\n});\n\n// --- TableView",
    to: "        add(SAUNA_COMPOUND_SLOT, i === 0 ? undefined : { index: 99 }, content);\n      });\n    }),\n});\n\n// --- TableView",
  },
  {
    // DG1: the literal plant of the task — Dialog.Portal back in the Insert
    // catalogue: its `within` row no longer becomes a parent rule, so the part
    // is offered at a page root and in a Section, where Radix throws
    // "DialogPortal must be used within Dialog".
    name: "DG1: a declared part gets no parent rule and is offered anywhere (Dialog.Portal back in the catalogue)",
    file: "src/react/sauna-component-catalog.ts",
    from: "    const allowedParents = meta?.allowedParents ?? (within && within.length > 0 ? [within[within.length - 1]!] : undefined);\n",
    to: "    const allowedParents = meta?.allowedParents;\n",
  },
  {
    // DG2: the shape walk skips namespace objects (the form of DialogKit) — DialogPortal is not recognised as a part.
    name: "DG2: saunaCompoundParts skips namespace objects",
    file: "src/react/catalog.ts",
    from: '    if (value == null || (typeof value !== "function" && typeof value !== "object") || seen.has(value)) return;\n',
    to: '    if (value == null || (typeof value !== "function" && typeof value !== "object") || seen.has(value)) return;\n    if (typeof value === "object") return;\n',
  },
  {
    // DG3: the engine's add-child modal (which previews every allowed item) offers a non-insertable entry again.
    name: "DG3: isCatalogItemAllowed ignores insertable:false",
    file: "src/react/catalog.ts",
    from: "  if (item.insertable === false) return false;\n",
    to: "",
  },
  {
    // R1: substituting params writes into the stored block — every page then sees one page's values.
    name: "R1: applyBlockParams writes into the stored block",
    file: "src/core/apply-params.ts",
    from: "    nodes ??= { ...block.nodes };\n",
    to: "    nodes ??= block.nodes;\n",
  },
  {
    // R2: the reference becomes a copy — the first version of a block a page
    // saw is kept forever, and an edit of the block no longer reaches it.
    name: "R2: loadBlockRefs keeps the first version of a block (reference turned into a copy)",
    file: "src/core/refs.ts",
    edits: [
      {
        from: "export async function loadBlockRefs(\n",
        to: "const FIRST_COPY = new Map<string, SaunaSchema | null>();\nexport async function loadBlockRefs(\n",
      },
      {
        from: "      frontier.map(async (id) => [id, await load(id)] as const),\n",
        to: "      frontier.map(async (id) => { if (!FIRST_COPY.has(id)) FIRST_COPY.set(id, await load(id)); return [id, FIRST_COPY.get(id) ?? null] as const; }),\n",
      },
    ],
  },
  {
    // X1: the renderer stops dropping unsafe props — a stored
    // `href: "javascript:…"` and `dangerouslySetInnerHTML` reach the
    // visitor's DOM through the primitives' rest-prop spread (SDL-681).
    name: "X1: resolveProps passes unsafe props through",
    file: "src/react/renderer.tsx",
    from: "  const next: Record<string, unknown> = { ...stripUnsafeProps(raw) };\n",
    to: "  const next: Record<string, unknown> = { ...raw };\n",
  },
  {
    // X2: the validator stops refusing them — they get into storage (SDL-681).
    name: "X2: validateSaunaSchema accepts unsafe URLs and raw-HTML props on write",
    file: "src/schema/validate.ts",
    from: "    if (options.mode === \"write\") {\n",
    to: "    if (false) {\n",
  },
  {
    // X3: javascript: counts as safe once its case or a tab disguises it.
    name: "X3: isSafeUrl reads the scheme without stripping control characters",
    file: "src/core/safe-url.ts",
    from: "  const compact = value.replace(/[\\u0000-\\u0020\\u007f-\\u009f]/g, \"\");\n",
    to: "  const compact = value;\n",
  },
  {
    // X4: prop names compared as written — `HREF: "javascript:…"` passes the
    // validator and React writes it into the DOM as is.
    name: "X4: isUrlPropName / isForbiddenPropName are case-sensitive",
    file: "src/core/safe-url.ts",
    edits: [
      { from: "  return URL_ATTRS.has(l) || l.endsWith(\"href\") || l.endsWith(\"src\");\n", to: "  return URL_ATTRS.has(name) || name.endsWith(\"Href\") || name.endsWith(\"Src\");\n" },
      { from: "  return URL_ATTRS.has(l) && !URL_PROPS.has(name);\n", to: "  return false;\n" },
    ],
  },
  {
    // X5: a read refuses the whole document for one unsafe link — a
    // published page answers 500 instead of losing one attribute.
    name: "X5: validateSaunaSchema refuses unsafe props on read",
    file: "src/schema/validate.ts",
    from: "    if (options.mode === \"write\") {\n",
    to: "    if (unsafe.length > 0) {\n",
  },
  {
    // X6: the provider stores what it is given — unsafe props reach storage.
    name: "X6: pages provider put skips the write validation",
    file: "src/providers/pages/provider.ts",
    from: "      if (!checked.ok) {\n",
    to: "      if (!checked.ok && id === \"\\u0000\") {\n",
  },
  {
    // X7: a forbidden prop nested below the top level is kept.
    name: "X7: stripUnsafeProps drops forbidden names only at the top level",
    file: "src/core/safe-url.ts",
    from: "      if (isForbiddenPropName(k) || (isUrlPropName(k)",
    to: "      if ((value === props && isForbiddenPropName(k)) || (isUrlPropName(k)",
  },
  {
    // X8: the round-2 isSafeUrl — `value.replace` on a number or array
    // throws inside a streamed render: a 500 for the whole page (review of
    // !265, round 3).
    name: "X8: isSafeUrl calls replace without checking the value is a string",
    file: "src/core/safe-url.ts",
    edits: [
      { from: "  if (typeof value !== \"string\") return false;\n", to: "" },
      { from: "  const compact = value.replace(", to: "  const compact = (value as string).replace(" },
    ],
  },
  {
    // X9: the round-2 walk — only a string under a URL name is checked, so
    // `src: ["data:text/html,x"]` is stored and React joins it into the DOM.
    name: "X9: a non-string URL prop passes findUnsafeProps and stripUnsafeProps",
    file: "src/core/safe-url.ts",
    from: "  if (typeof value !== \"string\") return \"url-type\";\n",
    to: "  if (typeof value !== \"string\") return null;\n",
  },
  {
    // X10: the route handler validates a PUT body leniently — an unsafe URL
    // reaches the provider instead of a 400.
    name: "X10: route handler PUT validates in read mode",
    file: "src/next/route-handlers.ts",
    from: "validateSaunaSchema(raw, { mode: \"write\" })",
    to: "validateSaunaSchema(raw)",
  },
  {
    // X11: the document's rest props come after rel — `rel: "opener"`
    // overrides the noopener of a new-tab link.
    name: "X11: Link spreads the rest props after rel",
    file: "src/react/primitives.tsx",
    edits: [
      { from: "      {...own}\n      href=", to: "      href=" },
      { from: "      style={{ color: \"var(--primary)\", textDecoration: \"underline\", ...style }}\n    >", to: "      style={{ color: \"var(--primary)\", textDecoration: \"underline\", ...style }}\n      {...rest}\n    >" },
    ],
  },
  {
    // X12: a refused PUT answers 400 with the message alone — the author is
    // not told which prop was refused (SDL-681 acceptance, D2).
    name: "X12: route handler 400 drops the validation issues",
    file: "src/next/route-handlers.ts",
    from: "throw new SaunaRouteError(400, validated.error.message, validated.error.issues)",
    to: "throw new SaunaRouteError(400, validated.error.message)",
  },
  {
    // X13: the Link filter compares names case-sensitively — a direct
    // `HREF="javascript:…"` reaches the DOM (SDL-681 acceptance, D3).
    name: "X13: Link keeps URL props in a non-canonical case",
    file: "src/react/primitives.tsx",
    edits: [
      { from: "      if (l === \"href\") return false;\n", to: "" },
      { from: "      return !isUrlPropName(k) || isSafeUrl(v, k);\n", to: "      return true;\n" },
    ],
  },
  {
    // SDL769: an Image keeps the automatic minimum width — of three 1600px
    // pictures in a row the first takes the row, the root clips the others
    // to 8px and 0px (SDL-769 review r2).
    name: "SDL769: an Image does not shrink with its row",
    file: "src/react/primitives.tsx",
    from: "        maxWidth: \"100%\",\n        minWidth: 0,\n        height: \"auto\",\n",
    to: "        maxWidth: \"100%\",\n        height: \"auto\",\n",
  },
  {
    // SDL769c: a row Box without its rule — a long paragraph squeezes a
    // 200px logo beside it to ~20px (SDL-769 review r1).
    name: "SDL769c: a row Box does not make its text yield to a picture",
    file: "src/react/primitives.tsx",
    from: "      {row ? <style>{BOX_ROW_RULE}</style> : null}\n",
    to: "",
  },
  {
    // SDL769d: the rule makes text and Box grow — a column of buttons beside a
    // picture stretches from 92 to 1064px (review r3).
    name: "SDL769d: the row rule makes its children grow",
    file: "src/react/primitives.tsx",
    from: "{ flex-shrink: 1000; }",
    to: "{ flex: 1 1 0%; }",
  },
  {
    // SDL769b: `aspect` is ignored — the box keeps the picture's shape and
    // cover / contain / fill draw the same pixels.
    name: "SDL769b: Image ignores aspect",
    file: "src/react/primitives.tsx",
    from: "  const framed = aspect !== \"auto\";\n",
    to: "  const framed = false as boolean; void aspect;\n",
  },
];

const PLANTS = process.env.PLANT ? PLANTS_ALL.filter((p) => p.name.startsWith(process.env.PLANT)) : PLANTS_ALL;

// A plant is caught only when the suite REPORTS it — a suite that dies proves
// nothing (see the studio harness for the OOM that taught this). Bound the run
// and require the runner's own `FAIL ` line in the output.
const TEST_MEM_MB = 1024;
const TEST_TIMEOUT_MS = 120_000;

const run = (cmd, opts = {}) => {
  try {
    const out = execSync(cmd, { stdio: "pipe", ...opts });
    return { code: 0, out: out ? out.toString() : "" };
  } catch (e) {
    const out = `${e.stdout ? e.stdout.toString() : ""}${e.stderr ? e.stderr.toString() : ""}`;
    return { code: e.status ?? -1, out };
  }
};

const runSuite = () =>
  run("pnpm test", {
    timeout: TEST_TIMEOUT_MS,
    env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${TEST_MEM_MB}`.trim() },
  });

let survived = 0;
for (const p of PLANTS) {
  const original = readFileSync(p.file, "utf8");
  const edits = p.edits ?? [{ from: p.from, to: p.to }];
  const missing = edits.find((e) => !original.includes(e.from));
  if (missing) {
    console.log(`  STALE ${p.name}: anchor not found in ${p.file}`);
    survived++;
    continue;
  }
  writeFileSync(p.file, edits.reduce((text, e) => text.replace(e.from, e.to), original));
  try {
    if (run("pnpm build").code !== 0) {
      console.log(`  STALE ${p.name}: plant does not compile`);
      survived++;
      continue;
    }
    const { code, out } = runSuite();
    const reported = /^\s*FAIL /m.test(out);
    if (code === 0) {
      console.log(`  MISS  ${p.name}: suite stayed green`);
      survived++;
    } else if (!reported) {
      console.log(`  CRASH ${p.name}: suite died without reporting a failure (exit ${code})`);
      console.log(out.split("\n").slice(-12).map((l) => `        ${l}`).join("\n"));
      survived++;
    } else {
      const failing = out.split("\n").filter((l) => /^\s*FAIL /.test(l)).map((l) => l.trim());
      console.log(`  caught ${p.name}\n        ${failing.join("\n        ")}`);
    }
  } finally {
    writeFileSync(p.file, original);
  }
}
// Every plant is restored by now; rebuild dist from the clean sources. A
// failure here leaves dist built from the LAST PLANT — anything that reads
// dist next (smoke:engine in the same CI job) would test a planted defect.
const rebuild = run("pnpm build");
if (rebuild.code !== 0) {
  console.error(`\nFATAL: the final rebuild of the restored sources failed (exit ${rebuild.code}); dist may still hold a planted defect.`);
  console.error(rebuild.out.split("\n").slice(-20).map((l) => `        ${l}`).join("\n"));
  process.exit(2);
}
console.log(`\n${PLANTS.length - survived}/${PLANTS.length} plants caught`);
process.exit(survived ? 1 : 0);
