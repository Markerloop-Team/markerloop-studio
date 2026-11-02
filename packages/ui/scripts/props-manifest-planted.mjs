// Planted-defect check for `props:manifest:check` (SDL-632). Modelled on
// `packages/engine/test/planted.mjs`.
//
//   pnpm -C packages/ui run props:manifest:planted
//
// Plants each known regression, runs the check and requires it to FAIL with
// the expected words in its output, then restores the file. A plant the check
// survives is a guard that guards nothing — the script exits 1 and names it.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PLANTS = [
  {
    // O1: the overlay stops rejecting unknown sections — `"lable"` / `"hidden"`
    // are skipped in silence again and the manifest comes out green.
    name: "O1: applyPropsOverlay accepts an unknown section",
    file: "scripts/props-manifest.mjs",
    from: "    rejectUnknownKeys(meta, OVERLAY_SECTIONS, `\"${name}\"`, fail);\n",
    to: "",
    expect: /unknown key "hidden"|unknown key "lable"|accepted silently/,
  },
  {
    // O2: the real overlay carries a misspelled section — the check must name it.
    name: "O2: props-meta.json has a \"lable\" section on Badge",
    file: "src/ui/catalog-meta/props-meta.json",
    from: '  "Badge": {\n',
    to: '  "Badge": {\n    "lable": { "tone": "Tone" },\n',
    expect: /"Badge" has unknown key\(s\) "lable"/,
  },
  {
    // O3: the committed manifest is hand-edited — it must read as stale.
    name: "O3: props-manifest.json hand-edited",
    file: "props-manifest.json",
    from: '"label": "Tone"',
    to: '"label": "Tone (edited)"',
    expect: /is stale/,
  },
];

const runCheck = () => {
  try {
    const out = execFileSync("node", ["scripts/props-manifest-check.mjs"], {
      cwd: root,
      stdio: "pipe",
      env: { ...process.env, PROPS_MANIFEST_BASE_REF: "HEAD" },
    });
    return { code: 0, out: out.toString() };
  } catch (e) {
    return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};

let survived = 0;
for (const p of PLANTS) {
  const file = path.join(root, p.file);
  const original = readFileSync(file, "utf8");
  if (!original.includes(p.from)) {
    console.log(`  STALE ${p.name}: anchor not found in ${p.file}`);
    survived++;
    continue;
  }
  writeFileSync(file, original.replace(p.from, p.to));
  try {
    const { code, out } = runCheck();
    if (code === 0) {
      console.log(`  MISS  ${p.name}: check stayed green`);
      survived++;
    } else if (!p.expect.test(out)) {
      console.log(`  WRONG ${p.name}: check failed for another reason (exit ${code})`);
      console.log(out.split("\n").slice(-6).map((l) => `        ${l}`).join("\n"));
      survived++;
    } else {
      const line = out.split("\n").find((l) => p.expect.test(l)) ?? "";
      console.log(`  caught ${p.name}\n        ${line.trim()}`);
    }
  } finally {
    writeFileSync(file, original);
  }
}
console.log(`\n${PLANTS.length - survived}/${PLANTS.length} plants caught`);
process.exit(survived ? 1 : 0);
