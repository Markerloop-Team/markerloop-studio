# kit-compat

The reference editor was written against the kit at the frozen reference's
HEAD. The kit that moved into `packages/ui` (SDL-602) is the published
`0.2.0-alpha.2`, kept byte-identical to the npm tarball. Four things the editor
uses are newer than that release. Until the kit is synced forward, they are
bridged here or at the call site, each marked `kit-compat` in the source:

| Kit feature (reference HEAD) | Bridge |
|---|---|
| `PanelSection` (admin) | copied here verbatim, imports re-pointed; the `Accordion` it is built on moved into `packages/ui` (SDL-633) |
| `ToggleGroup variant="segmented"` | `variant="outline"` (look differs, behaviour same) |
| `DialogContent maxHeight` | inline `style={{ maxHeight }}` |
| `SearchField` `inputRef` / `inputProps` / `hint` | wrapper resolves the input; hint renders beside the field |
| `TreeRow` with `meta`, inline rename (`editing`…) and `childCount: null` | copied here verbatim, imports re-pointed |

Delete this folder and the marked call sites when `packages/ui` catches up.
