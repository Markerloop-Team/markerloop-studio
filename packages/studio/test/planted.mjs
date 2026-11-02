// Planted-defect check for the guarded behaviours (SDL-604, SDL-605, SDL-634).
//
//   pnpm --filter @markerloop/studio test:planted
//
// Plants each known regression into src, rebuilds, runs the suite and
// requires it to FAIL, then restores the file. A plant the suite survives is
// a guard that guards nothing — the script exits 1 and names it.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PLANTS_ALL = [
  {
    // SDL-678: a name drops out of the ONE assembled registry — every stored
    // page that used it loses the node on the admin canvas AND the site.
    name: "CAT1: Section is dropped from the assembled pages registry",
    file: "src/catalog/catalog.tsx",
    from: "    Page,\n    Section,\n    ...PRIMITIVE_REGISTRY,",
    to: "    Page,\n    ...PRIMITIVE_REGISTRY,",
  },
  {
    // SDL-678: the published render turns editable — a visitor's page carries editor node ids.
    name: "CAT2: renderPublishedPage renders the page editable",
    file: "src/catalog/published-page.tsx",
    from: "      schema={schema}\n",
    to: "      editable\n      schema={schema}\n",
  },
  {
    // SDL-678 review: isolation by the error boundary alone — on the server a
    // boundary never runs, so one orphaned part answers the page with a 500.
    name: "CAT4: the published page isolates nodes with the error boundary only (no Suspense)",
    file: "src/catalog/published-page.tsx",
    from: "      nodeBoundary={PublishedNodeBoundary}\n",
    to: "      nodeBoundary={SaunaNodeErrorBoundary}\n",
  },
  {
    // SDL-678 review: the published page loses per-node isolation altogether.
    name: "CAT5: the published page renders without nodeBoundary",
    file: "src/catalog/published-page.tsx",
    from: "      nodeBoundary={PublishedNodeBoundary}\n      isolate={isPagesIsolatedType}\n",
    to: "",
  },
  {
    // SDL-722 review: the engine gets the map as it came — a Ref whose blockId
    // is "constructor" finds Object.prototype's member and the page throws.
    name: "CAT6: PublishedPage hands the plain block map to the engine",
    file: "src/catalog/published-page.tsx",
    from: "      blocks={lookup}\n",
    to: "      blocks={blocks}\n",
  },
  {
    // SDL-678: the server entry imports a client-only module directly.
    name: "CAT3: the server entry imports the client engine index",
    file: "src/catalog/server.ts",
    from: 'import { DataViewPropsSchema, migrateSaunaSchema, publicDataViewKey, publicDataViewRequest, validateSaunaSchema } from "@markerloop/engine";\n',
    to: 'import { DataViewPropsSchema, migrateSaunaSchema, publicDataViewKey, publicDataViewRequest, validateSaunaSchema } from "@markerloop/engine";\nimport "@markerloop/engine/react";\n',
  },
  {
    // SDL-633 re-review: the node boundary never retries after an edit. The
    // boundary lives in the engine, so this plant rebuilds the engine too.
    name: "NB1: SaunaNodeErrorBoundary does not reset after the node is edited",
    file: "../engine/src/react/error-boundary.tsx",
    build: "pnpm --dir ../engine build && pnpm build",
    from: "    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });\n",
    to: "    void prev;\n",
  },
  {
    name: "NB2: SaunaRenderer ignores nodeBoundary",
    file: "../engine/src/react/renderer.tsx",
    build: "pnpm --dir ../engine build && pnpm build",
    from: "(isolate?.(node.type) ?? true)) {",
    to: "(isolate?.(node.type) ?? true) && id === \"__never__\") {",
  },
  {
    // SDL-633 review: a move refused for a hole still rewrites the node — an undo step that changes nothing.
    // The refusal lives in the engine, so this plant rebuilds the engine too.
    name: "CI5: a move refused for a hole pushes an undo step",
    file: "../engine/src/core/compounds.ts",
    build: "pnpm --dir ../engine build && pnpm build",
    from: "  if (JSON.stringify([items, filled]) === before) return schema;\n",
    to: "  if (JSON.stringify([items, children]) === before) return schema;\n",
  },
  {
    // SDL-633 list editor: delete writes `items` only — the next tab's content slides under the deleted heading.
    name: "CI1: the items editor deletes the item but not its content child",
    file: "src/properties/auto-form.tsx",
    from: 'onRemove={(index) => store.getState().applyOp({ kind: "compoundItems", nodeId, edit: { action: "remove", index } })}',
    to: 'onRemove={(index) => store.getState().applyOp(propsPatchOp({ kind: "base" }, nodeId, { items: readCompoundItems(node.props?.items).filter((_, i) => i !== index) }))}',
  },
  {
    name: "CI2: the items editor reorders the items but not the children",
    file: "src/properties/auto-form.tsx",
    from: 'onMove={(from, to) => store.getState().applyOp({ kind: "compoundItems", nodeId, edit: { action: "move", from, to } })}',
    to: 'onMove={(from, to) => { const l = readCompoundItems(node.props?.items); const [x] = l.splice(from, 1); l.splice(to, 0, x!); store.getState().applyOp(propsPatchOp({ kind: "base" }, nodeId, { items: l })); }}',
  },
  {
    name: "CI3: the store adds an item without its content child",
    file: "src/store.ts",
    from: '          ? addCompoundItem(schema, op.nodeId, e.item, { propsVersionOf: opts?.propsVersionOf })\n',
    to: '          ? updateNodePropsPartial(schema, op.nodeId, { items: [...((before?.props?.items as unknown[]) ?? []), e.item] })\n',
  },
  {
    // SDL-633 review: a rename writes base `items` and keeps the phone / member copies — they still win there.
    name: "CI4: a heading edit keeps the width / member overrides of items",
    file: "src/store.ts",
    from: "              ? setCompoundItems(schema, op.nodeId, e.items)\n",
    to: "              ? updateNodePropsPartial(schema, op.nodeId, { items: e.items })\n",
  },
  {
    name: "TG1: deleting a table column drops only the header cell",
    file: "src/properties/table-model.ts",
    from: "  return grid.map((r) => r.filter((_, j) => j !== col));",
    to: "  return grid.map((r, i) => (i === 0 ? r.filter((_, j) => j !== col) : [...r]));",
  },
  {
    name: "1a: canvas click heard on the admin document instead of the frame's",
    file: "src/canvas-selection.tsx",
    from: 'doc.addEventListener("click", onClick);',
    to: 'window.document.addEventListener("click", onClick);',
  },
  {
    name: "1c: a link on the canvas is cancelled only in the bubble phase (SDL-634)",
    file: "src/canvas-selection.tsx",
    from: '    doc.addEventListener("click", onClickCapture, true);\n',
    to: "",
  },
  {
    name: "1b: hit-test guarded by cross-realm instanceof",
    file: "src/canvas-selection.tsx",
    from: 'if (typeof el?.closest !== "function") return null;',
    to: "if (!(el instanceof Element)) return null;",
  },
  {
    // EP-187: the selection is the layer-1 token, never a literal again.
    name: "2: selection colour written as a literal",
    file: "src/canvas-selection.tsx",
    from: 'const SELECT_COLOR = "var(--selection)";',
    to: 'const SELECT_COLOR = "#2fa3da";',
  },
  {
    // EP-187: the overlay paints with admin tokens the frame never declares —
    // under next dev the selection turned black and the label lost its fill.
    name: "2e: the frame does not re-declare the admin tokens for the overlay",
    file: "src/canvas-frame.tsx",
    from: "    installOverlayTokens(doc);\n",
    to: "",
  },
  {
    // SDL-770: the frame sized to the node under the frame's border-box
    // preflight — shifted up-left by its stroke, edges lost at the page edge.
    name: "2b: selection frame sized to the node instead of its outer box",
    file: "src/canvas-selection.tsx",
    from: "        width: box.width,\n        height: box.height,\n        borderWidth: width,",
    to: "        width: rect.width,\n        height: rect.height,\n        borderWidth: width,",
  },
  {
    // SDL-770: an edge outside the document is left there, where nobody sees it.
    name: "2c: selection frame not kept inside the document",
    file: "src/canvas-selection.tsx",
    from: "  const top = Math.max(0, rect.top - stroke);",
    to: "  const top = rect.top - stroke;",
  },
  {
    // SDL-770: the layer can size the page (a frame past the last block grows the canvas).
    name: "2d: overlay layer not clipped to the viewport",
    file: "src/canvas-selection.tsx",
    from: '        overflow: "hidden",\n        // Above author content',
    to: "        // Above author content",
  },
  {
    // SDL-770 acceptance: the sheet's 1px border eats the document's last
    // 2px under the admin's border-box preflight — right edge clipped.
    name: "2e: canvas sheet sized border-box (the border clips the document)",
    file: "src/canvas-frame.tsx",
    from: 'style={{ boxSizing: "content-box", width: width * scale, height: height * scale }}',
    to: "style={{ width: width * scale, height: height * scale }}",
  },
  {
    // SDL-770 review: the fit ignores the border, so the sheet (content-box)
    // is 2px wider than the workspace that measured it.
    name: "2f: fit-to-width scale without the sheet's border",
    file: "src/canvas-frame.tsx",
    from: "Math.max(0, available - 2 * SHEET_BORDER) / width",
    to: "available / width",
  },
  {
    // SDL-770 review: the clipping sheet rounded again — the radius shaves the
    // document's corners and the selection frame's corner handles with them.
    name: "2g: canvas sheet rounded (the radius clips the document's corners)",
    file: "src/canvas-frame.tsx",
    from: 'className="h-fit overflow-hidden border',
    to: 'className="h-fit overflow-hidden rounded-lg border',
  },
  {
    name: "3a: inline edit commits an op per keystroke",
    file: "src/canvas-text-edit.ts",
    from: "      store.getState().setTextDraft({\n        nodeId: current.nodeId,\n        prop: current.prop,\n        value: current.el.textContent ?? \"\",\n      });",
    to: "      store.getState().applyOp({ kind: \"updateNodePropsPartial\", nodeId: current.nodeId, patch: { [current.prop]: current.el.textContent ?? \"\" } });",
  },
  {
    name: "3b: store pushes two frames per op",
    file: "src/store.ts",
    from: "history: pushHistory(history, schema, historyDepth),",
    to: "history: pushHistory(pushHistory(history, schema, historyDepth), schema, historyDepth),",
  },
  // SDL-605 review: preview used to be a costume — the canvas stopped
  // selecting and every other door into the document stayed open. One plant
  // per door, because a single "preview is off" plant would go red on the
  // first assertion and say nothing about the other two.
  {
    name: "4a: preview leaves the Properties pane editable",
    file: "src/shell.tsx",
    from: "  if (readOnly) return <PropertiesPreviewNotice bare={bare} />;\n",
    to: "",
  },
  {
    name: "4b: preview still offers Insert",
    file: "src/shell.tsx",
    from: "  const canInsert = !readOnly && !!props.blocks && props.blocks.length > 0;",
    to: "  const canInsert = !!props.blocks && props.blocks.length > 0;",
  },
  {
    name: "4c: preview still lets the outline rename a row",
    file: "src/shell.tsx",
    from: "  const startRename = (nodeId: SaunaNodeId) => {\n    if (readOnly) return;\n    setRenamingId(nodeId);\n  };",
    to: "  const startRename = (nodeId: SaunaNodeId) => {\n    setRenamingId(nodeId);\n  };",
  },
  // SDL-634: the nesting rule is checked when a node goes in. A plant per
  // layer: the store's refusal (which alone carries the reason), the store
  // and the op together (the tree itself must stay unchanged), and the
  // Insert modal's own-components tab (the one surface the rule reaches
  // through a Ref node).
  {
    name: "5a: the store stops refusing an insertion the nesting rule forbids",
    file: "src/store.ts",
    from: "const refused = canParent ? refusedInsertion(schema, op, canParent) : null;",
    to: "const refused: string | null = null;",
  },
  {
    name: "5b: neither the store nor the op checks the rule — a Button lands in a Box",
    file: "src/store.ts",
    edits: [
      {
        from: "const refused = canParent ? refusedInsertion(schema, op, canParent) : null;",
        to: "const refused: string | null = null;",
      },
      { from: "op.index,\n        { canParent: opts?.canParent }", to: "op.index,\n        {}" },
    ],
  },
  {
    name: "5c: the Insert modal offers a component where the target refuses it",
    file: "src/shell.tsx",
    from: "const refAllowed = canParentType(blocks, targetType, SAUNA_REF_TYPE);",
    to: "const refAllowed = true;",
  },
  // SDL-631: the insert panel on icons. One plant per state of the SDL-594
  // canvas the suite claims to cover: the no-empty-card guarantee, groups
  // from the adapter, search.
  {
    name: "6a: a block without a description comes out as an empty card again",
    file: "src/insert-catalog.ts",
    from: 'return group ? `Component from the ${group} group.` : "Component from the kit.";',
    to: 'return "";',
  },
  {
    name: "6b: the panel ignores the adapter's group and files everything together",
    file: "src/shell.tsx",
    from: 'const groupTitle = b.meta?.category?.trim() || "Other";',
    to: 'const groupTitle = "Other";',
  },
  {
    name: "6c: the search stops narrowing the tiles",
    file: "src/insert-catalog.ts",
    from: "    if (!matches(entry, q)) continue;\n",
    to: "",
  },
  {
    name: "6d: a click on a tile inserts at once instead of selecting it",
    file: "src/shell.tsx",
    from: "onClick={entry.allowed ? onPick : undefined}",
    to: "onClick={entry.allowed ? onInsert : undefined}",
  },
  {
    name: "6e: groups fall back to arrival order (the engine's alphabetical order)",
    file: "src/insert-catalog.ts",
    from: "  groups.sort((a, b) => (rank(a) === rank(b) ? 0 : rank(a) - rank(b)));\n",
    to: "",
  },
  {
    name: "6f: Enter on any focused button inserts the selected tile",
    file: "src/shell.tsx",
    from: "    if (!fromPanel) return;\n",
    to: "",
  },
  // SDL-632 S5: width variants in the Properties form.
  {
    name: "7a: at Phone the form reads the base props instead of the override",
    file: "src/properties/auto-form.tsx",
    from: "const stored = studioFieldProps(schema, selectedId, view);",
    to: "const stored = (node.props ?? {}) as Record<string, unknown>;",
  },
  {
    name: "7b: Reset writes an empty string instead of deleting the override",
    file: "src/store.ts",
    from: "  return { kind: \"resetScreenProp\", nodeId, screen: target.screen, key };",
    to: "  return { kind: \"setScreenProps\", nodeId, screen: target.screen, patch: { [key]: \"\" } };",
  },
  {
    name: "7c: the canvas text edit looks the prop up in the base props, not the variant drawn",
    file: "src/canvas-text-edit.ts",
    from: "? { ...stored, props: studioFieldProps(state.schema, nodeId, state.view) }",
    to: "? { ...stored, props: stored.props }",
  },
  {
    name: "7d: a width override equal to the base is stored instead of dropped",
    file: "src/screen-variants.ts",
    from: "if (Object.hasOwn(base, key) && sameValue(baseValue, value)) delete next[key];",
    to: "if (Object.hasOwn(base, key) && false) delete next[key];",
  },
  // SDL-632 S6: visibility modes and the hybrid member branch, plus the S5
  // debts folded into S6.
  {
    name: "8a: the mode switch writes a condition OBJECT instead of the mode string",
    file: "src/visibility-mode-editor.tsx",
    from: 'store.getState().applyOp({ kind: "setVisibilityMode", nodeId, mode });',
    to: 'store.getState().applyOp({ kind: "setVisibility", nodeId, rule: { when: { op: "eq", path: "mode", value: mode } } });',
  },
  {
    name: "8b: preview renders for the author's audience and shows a private block",
    file: "src/visibility-modes.ts",
    from: '  if (args.preview) return "guest";\n',
    to: "",
  },
  {
    name: "8c: leaving hybrid leaves member in the subtree",
    file: "src/visibility-modes.ts",
    from: "      nodes[id] = withoutMember(current);",
    to: "      void withoutMember;",
  },
  {
    name: "8d: an emptied field at a width deletes the key (behaves like Reset)",
    file: "src/screen-variants.ts",
    from: '      value = "";',
    to: "      delete next[key];\n      continue;",
  },
  {
    name: "8e: the Signed in tab edits the base instead of member.props",
    file: "src/visibility-modes.ts",
    from: '    return { kind: "member" };',
    to: '    return { kind: "base" };',
  },
  {
    name: "8f: a Ref's params at a width keep every base parameter instead of the diff",
    file: "src/screen-variants.ts",
    from: "      value = paramsDiff(baseValue, value);",
    to: "      void paramsDiff;",
  },
  // S6 independent review — each blocker and fix pinned by a plant.
  {
    name: "9a: at a width the form shows member values (they leak into screens on blur)",
    file: "src/visibility-modes.ts",
    from: "  return nodePropsForTarget(node, studioEditTarget(schema, nodeId, view), false);",
    to: '  return nodePropsForTarget(node, studioEditTarget(schema, nodeId, view), view.audience === "member" && saunaEffectiveVisibilityMode(schema, nodeId) === "hybrid");',
  },
  {
    name: "9b: the Signed in tab stays live at a width",
    file: "src/properties/auto-form.tsx",
    from: "          disabled={atWidth}\n",
    to: "",
  },
  {
    name: "9c: the canvas in-place edit ignores the member branch (routes by width only)",
    file: "src/canvas-text-edit.ts",
    from: "propsPatchOp(studioEditTarget(state.schema, current.nodeId, state.view), current.nodeId, {",
    to: "propsPatchOp(state.view.screen, current.nodeId, {",
  },
  {
    name: "9d: preview still draws the sections that write to the document",
    file: "src/shell.tsx",
    from: "        if (readOnly && section.editsDocument) return null;\n",
    to: "",
  },
  {
    name: "9e: the root is offered Hybrid / Private (pages-service 422s every autosave)",
    file: "src/visibility-modes.ts",
    from: 'if (nodeId === schema.rootId && mode !== null && mode !== "public") {',
    to: "if (false) {",
  },
  {
    name: "9f: the mode editor offers the switch on the root",
    file: "src/visibility-mode-editor.tsx",
    from: "  if (selectedId === schema.rootId) {",
    to: "  if (false) {",
  },
  {
    name: "9g: the inherited mode is pinned as an explicit copy instead of removing the field",
    file: "src/visibility-modes.ts",
    from: '    mode === null || (mode !== "private" && mode === inheritedVisibilityMode(schema, nodeId))',
    to: "    mode === null",
  },
  {
    name: "9h: the store writes member.props outside hybrid",
    file: "src/store.ts",
    from: 'if (op.kind === "setMemberProps" && saunaEffectiveVisibilityMode(schema, op.nodeId) !== "hybrid") {',
    to: "if (false) {",
  },
  {
    name: "9i: a cleared number at a width is stored as an override instead of falling back to the base",
    file: "src/screen-variants.ts",
    from: '      if (typeof baseValue !== "string" || !hasValue(baseValue)) {',
    to: "      if (!hasValue(baseValue)) {",
  },
  {
    name: "9j: an override key is written by assignment (a __proto__ key swaps the prototype)",
    file: "src/screen-variants.ts",
    from: "    else defineOwn(next, key, value);",
    to: "    else next[key] = value;",
  },
  // S6 re-review.
  {
    name: "9k: an explicit Private inside a Private block collapses to inherit (opens when the block leaves Private)",
    file: "src/visibility-modes.ts",
    from: '    mode === null || (mode !== "private" && mode === inheritedVisibilityMode(schema, nodeId))',
    to: "    mode === null || mode === inheritedVisibilityMode(schema, nodeId)",
  },
  {
    name: "9l: a selected private block makes the canvas render for a member at a width",
    file: "src/visibility-modes.ts",
    from: '  if (args.screen && args.screen !== "base") return "guest";\n  if (args.selectedMode === "private") return "member";',
    to: '  if (args.selectedMode === "private") return "member";\n  if (args.screen && args.screen !== "base") return "guest";',
  },
  {
    name: "9m: leaving Private does not warn about the blocks it opens",
    file: "src/visibility-modes.ts",
    from: '    if (saunaEffectiveVisibilityMode(probe, id) !== "private") count += 1;',
    to: "    void probe;",
  },
  {
    name: "10a: a move out from under a hybrid block keeps member (SDL-632 S7)",
    file: "src/store.ts",
    from: "      const next = withMembersPruned(moved, op.nodeId);",
    to: "      const next = moved;",
  },
  {
    name: "10b: the member tabs ignore the Visibility-section gate (SDL-632 S7)",
    file: "src/properties/auto-form.tsx",
    from: '  const hybrid = memberBranch && saunaEffectiveVisibilityMode(schema, selectedId) === "hybrid";',
    to: '  const hybrid = saunaEffectiveVisibilityMode(schema, selectedId) === "hybrid";',
  },
  {
    name: "10c: the edit target ignores the Visibility-section gate (SDL-632 S7)",
    file: "src/properties/auto-form.tsx",
    from: '  const view = { screen, audience: memberBranch ? audience : ("guest" as const) };',
    to: "  const view = { screen, audience };",
  },
  // --- SDL-633 ---------------------------------------------------------------
  {
    name: "C3: the Insert modal inserts a compound with empty props instead of its settings",
    file: "src/shell.tsx",
    from: "            props: structuredClone(block.meta?.initialProps ?? {}),\n",
    to: "            props: {},\n",
  },
  {
    // DG4: a compound part is offered wherever the target is — at a Box, in a
    // Section — where Radix throws "must be used within".
    name: "DG4: the Insert modal offers a compound part outside its root",
    file: "src/shell.tsx",
    from: "          !(b.meta?.partOf && !canParentType(blocks, targetType, b.type)) &&\n",
    to: "",
  },
  {
    // R3: the reference becomes a copy — inserting an own component writes
    // its nodes into the page, and an edit of the block never reaches it.
    name: "R3: inserting an own component adds a copy of its root instead of a Ref",
    file: "src/shell.tsx",
    from: "          child: { type: SAUNA_REF_TYPE, props: { [SAUNA_REF_BLOCK_ID_PROP]: item.id } },\n",
    to: "          child: { type: ownSchemas[item.id]?.nodes[ownSchemas[item.id]!.rootId]?.type ?? SAUNA_REF_TYPE, props: {} },\n",
  },
  // --- SDL-667: the node carries its Element's props version ---------------
  {
    // SPV1: the store stops stamping — a host calling applyOp (or the
    // compound item list) writes nodes that read as v1 under a v2 Element.
    name: "SPV1: the store ignores propsVersionOf",
    file: "src/store.ts",
    from: "  const propsVersion = propsVersionOf(child.type);\n",
    to: "  const propsVersion = undefined as number | undefined;\n",
  },
  {
    // SPV2: the Insert modal drops the version — the admin's own store is the
    // only thing left between a fresh node and a plate on the canvas.
    name: "SPV2: the Insert modal inserts without the Element's propsVersion",
    file: "src/shell.tsx",
    from: "            propsVersion: blockPropsVersion(block),\n",
    to: "",
  },
  {
    // SPV3: the form is drawn for a node of another schema version — an edit
    // would write a mix of two contracts under the node's old number.
    name: "SPV3: the Properties form ignores a props version mismatch",
    file: "src/properties/auto-form.tsx",
    from: "  const mismatch = def ? elementPropsVersionMismatch(def, node) : null;\n",
    to: "  const mismatch = null as ReturnType<typeof elementPropsVersionMismatch>; void def;\n",
  },
  {
    // SPV4: the published page renders without the definitions — a visitor
    // gets props of another contract misread instead of a plate.
    name: "SPV4: the published page passes no elements to the renderer",
    file: "src/catalog/published-page.tsx",
    from: "      elements={PAGES_BLOCKS}\n",
    to: "",
  },
  {
    // SDL769: the page root clips with `hidden` — it becomes the scroll
    // container of every sticky inside (the reason it is `clip`).
    name: "SDL769: the Page root clips with overflow-x hidden",
    file: "src/catalog/catalog.tsx",
    from: 'overflowX: "clip"',
    to: 'overflowX: "hidden"',
  },
  {
    // SDL769b: the page root no longer holds the page to the viewport — a wide
    // picture scrolls the document sideways again.
    name: "SDL769b: the Page root does not clip sideways overflow",
    file: "src/catalog/catalog.tsx",
    from: ', overflowX: "clip"',
    to: "",
  },
  {
    // SDL721a: a top section is no longer drawn above Properties.
    name: "SDL721a: placement top is not drawn above Properties",
    file: "src/shell.tsx",
    from: 'sections={sections.filter((s) => s.placement === "top")}',
    to: "sections={[]}",
  },
  {
    // SDL721b: the bottom list keeps the top sections too — drawn twice.
    name: "SDL721b: a top section is drawn again below Properties",
    file: "src/shell.tsx",
    from: 'sections={sections.filter((s) => s.placement !== "top")}',
    to: "sections={sections}",
  },
  {
    // SDL721c: an emptied default is written as `default: undefined` instead of removed.
    name: "SDL721c: updateParam keeps an undefined default key",
    file: "src/properties/params.ts",
    from: "      if (patch.default === undefined) delete next.default;\n      else next.default = patch.default;",
    to: "      next.default = patch.default;",
  },
  {
    // SDL757a: the outline's pointer threshold back at 4px — a shaky click
    // starts a drag and the row is never selected.
    name: "SDL757a: the outline PointerSensor activates at 4px",
    file: "src/shell.tsx",
    from: "activationConstraint: { distance: OUTLINE_DRAG_ACTIVATION_DISTANCE },",
    to: "activationConstraint: { distance: 4 },",
  },
  {
    // SDL757b: the drop animation ignores reduced motion.
    name: "SDL757b: the drop animation ignores prefers-reduced-motion",
    file: "src/outline-drag-motion.ts",
    from: "  return prefersReducedMotion ? null : OUTLINE_DROP_ANIMATION;\n",
    to: "  void prefersReducedMotion;\n  return OUTLINE_DROP_ANIMATION;\n",
  },
  {
    // SDL757c: the server render assumes motion — the first paint animates
    // for a person who asked for none.
    name: "SDL757c: the reduced-motion hook answers false on the server",
    file: "src/outline-drag-motion.ts",
    from: "function getServerSnapshot(): boolean {\n  return true;\n}",
    to: "function getServerSnapshot(): boolean {\n  return false;\n}",
  },
  {
    // SDL-773: a colour of any shape reaches the theme sheet — author CSS, or a `</style>` breakout.
    name: "TH1: the site theme accepts any string starting with # as a colour",
    file: "src/site-theme.ts",
    from: "const HEX = /^#[0-9a-fA-F]{6}$/;",
    to: "const HEX = /^#/;",
  },
  {
    // SDL-773: a dark band reads the LIGHT set — the dark pairs are written nowhere.
    name: "TH2: the dark scope gets the light colours",
    file: "src/site-theme.ts",
    from: 'block(SITE_THEME_DARK_SELECTOR, siteThemeColorVariables(theme, "dark"))',
    to: 'block(SITE_THEME_DARK_SELECTOR, siteThemeColorVariables(theme, "light"))',
  },
  {
    // SDL-773: the published theme never reaches the site's page.
    name: "TH3: renderPublishedPage ignores the theme",
    file: "src/catalog/server.ts",
    from: "  if (siteThemeCss(theme) === null) return page;\n",
    to: "  return page;\n",
  },
  {
    // SDL-773: the editor's canvas shows the kit's look, not the site's theme.
    name: "TH4: the canvas frame drops the theme",
    file: "src/canvas-frame.tsx",
    from: "              <SiteThemeStyle theme={theme} fontsBase={null} />\n",
    to: "",
  },
  {
    // SDL-773: a dark Section is painted dark but its kit components keep their light variants.
    name: "TH5: a dark Section does not carry the kit's .dark scope",
    file: "src/catalog/catalog.tsx",
    from: '      {...(dark ? { className: "dark" } : null)}\n',
    to: "",
  },  {
    // SDL-777: the validator forgets AA — a preset with unreadable text ships.
    name: "PR1: validateSiteTheme skips the contrast check",
    file: "src/site-theme.ts",
    from: "      if (ratio < SITE_THEME_MIN_CONTRAST) errors.push(",
    to: "      if (ratio < 0) errors.push(",
  },
  {
    // SDL-777: a preset's primary button below AA in the dark set.
    name: "PR2: a preset's dark primary button fails AA",
    file: "src/site-theme-presets.ts",
    from: 'primary: { light: "#a0441c", dark: "#f0956a" },',
    to: 'primary: { light: "#a0441c", dark: "#5a3020" },',
  },
  {
    // SDL-777: a preset names a family outside the whitelist (the site would draw the fallback).
    name: "PR3: a preset's font is not in the whitelist",
    file: "src/site-theme-presets.ts",
    from: 'fonts: { heading: "Lora", body: "Nunito" },',
    to: 'fonts: { heading: "Lora", body: "Comic Sans MS" },',
  },
  {
    // SDL-777: a preset with a face that lacks Kazakh letters.
    name: "PR4: a preset's font lacks Kazakh",
    file: "src/site-theme-presets.ts",
    from: 'fonts: { heading: "Oswald", body: "Rubik" },',
    to: 'fonts: { heading: "Unbounded", body: "Rubik" },',
  },
  {
    // SDL-721: a Block saved from a Text opens in its editor as «The page is empty».
    name: "SDL721d: the canvas ignores rootIsContent",
    file: "src/shell.tsx",
    from: "    (!rootIsContent || Object.keys(root?.props ?? {}).length === 0);\n",
    to: "    true;\n",
  },
];

// `PLANT=<prefix>` runs only the plants whose name starts with it.
const PLANTS = process.env.PLANT ? PLANTS_ALL.filter((p) => p.name.startsWith(process.env.PLANT)) : PLANTS_ALL;

// A plant is caught only when the suite REPORTS it — a suite that dies proves
// nothing. Until 23 Sep 2026 this harness read the exit code alone, so any
// non-zero death counted as a catch; plant 4c was "caught" by a heap OOM that
// took 5.7 GB and 60 s, OOM-killed the CI container (exit 137, pipeline
// 2873398865) and never printed a word about the guard. Hence: bound the run
// so a runaway cannot take the container with it, and require the runner's own
// `FAIL ` line in the output.
const TEST_MEM_MB = 1024;
const TEST_TIMEOUT_MS = 120_000;

const run = (cmd, opts = {}) => {
  try {
    const out = execSync(cmd, { stdio: "pipe", ...opts });
    return { code: 0, out: out ? out.toString() : "" };
  } catch (e) {
    const out = `${e.stdout ? e.stdout.toString() : ""}${e.stderr ? e.stderr.toString() : ""}`;
    // A timeout kill leaves `status` null; treat anything that is not a clean
    // exit code as a crash, which the caller must not read as a catch.
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
  // A plant is one edit (`from`/`to`) or several in one file (`edits`).
  const edits = p.edits ?? [{ from: p.from, to: p.to }];
  const missing = edits.find((e) => !original.includes(e.from));
  if (missing) {
    console.log(`  STALE ${p.name}: anchor not found in ${p.file}`);
    survived++;
    continue;
  }
  writeFileSync(p.file, edits.reduce((text, e) => text.replace(e.from, e.to), original));
  try {
    if (run(p.build ?? "pnpm build").code !== 0) {
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
      // Non-zero, but the suite never named a failing test: it crashed, hung
      // or was killed. That is a broken check, not a proven guard.
      console.log(`  CRASH ${p.name}: suite died without reporting a failure (exit ${code})`);
      console.log(out.split("\n").slice(-12).map((l) => `        ${l}`).join("\n"));
      survived++;
    } else {
      console.log(`  caught ${p.name}`);
    }
  } finally {
    writeFileSync(p.file, original);
    // A plant outside studio's src rebuilt another package: rebuild it clean.
    if (p.build) run(p.build);
  }
}
run("pnpm build");
console.log(`\n${PLANTS.length - survived}/${PLANTS.length} plants caught`);
process.exit(survived ? 1 : 0);
