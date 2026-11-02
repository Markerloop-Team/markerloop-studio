import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyPropsOverlay,
  buildManifest,
  contractChanges,
  manifestPath,
  serializeManifest,
  warnContractChanges,
} from "./props-manifest.mjs";

/**
 * Freshness guard for the checked-in `props-manifest.json` (SDL-632 S1).
 *
 * `packages/ui` has no test runner, so this is a plain node script, run by CI
 * (`pnpm -C packages/ui run props:manifest:check`, smoke:pages). It
 *
 *   1. rebuilds the manifest in memory from the kit sources and the overlay
 *      `src/ui/catalog-meta/props-meta.json` — an overlay key naming a
 *      component or prop the kit does not have throws inside `buildManifest`
 *      with that key in the message, and fails the check;
 *   2. compares it byte-for-byte with the committed file — any difference
 *      fails, listing the components that differ;
 *   3. warns (never fails) on removed components, props and enum values — a
 *      props contract change that needs `propsVersion` (EP-128) — against the
 *      committed file and, when git can see it, against the base branch's
 *      manifest (`PROPS_MANIFEST_BASE_REF`, default `origin/master`). A
 *      missing `origin/<branch>` (a GIT_DEPTH 1 CI clone) is fetched shallow
 *      first; with no git, no reachable base ref or no manifest at the base,
 *      the comparison is skipped with a printed line saying which.
 *
 * Exit code: 0 green, 1 red.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = manifestPath(root);
const rel = path.relative(process.cwd(), file) || file;
const regen = "pnpm --filter @markerloop/ui props:manifest";

function fail(message) {
  console.error(`props:manifest:check FAILED — ${message}`);
  process.exit(1);
}

// Self-test of the overlay's closed shape (SDL-632): a misspelled section or
// key must fail the generator by name. Runs on a synthetic extraction, so it
// holds even while the real props-meta.json happens to contain no typo —
// which is exactly when a silently-lenient guard would go unnoticed.
selfTestOverlayGuard();

function selfTestOverlayGuard() {
  const probe = {
    componentNames: ["Probe"],
    components: {
      Probe: {
        props: [{ name: "tone", type: "string", editor: "text", group: "appearance", required: false }],
      },
    },
  };
  const typos = [
    [{ Probe: { lable: { tone: "Tone" } } }, "lable"],
    [{ Probe: { hidden: ["tone"] } }, "hidden"],
    [{ Probe: { children: { editor: "text", group: "content", lable: "Text" } } }, "lable"],
    [{ Probe: { props: { size: { type: "string", editor: "text", group: "layout", defualt: "a" } } } }, "defualt"],
  ];
  for (const [overlay, key] of typos) {
    let message = null;
    try {
      applyPropsOverlay(probe, overlay);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (message === null || !message.includes(`"${key}"`)) {
      fail(
        `overlay guard: props-meta.json with the unknown key "${key}" was ` +
          (message === null ? "accepted silently" : `refused without naming it (${message})`),
      );
    }
  }
  // The well-formed spellings of the same sections still apply.
  const ok = applyPropsOverlay(probe, { Probe: { label: { tone: "Tone" } } });
  if (ok.Probe?.props?.[0]?.label !== "Tone") {
    fail("overlay guard: a well-formed `label` section no longer applies");
  }
}

let fresh;
try {
  fresh = buildManifest(root);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (!existsSync(file)) {
  fail(`${rel} is missing. Generate it with \`${regen}\` and commit it.`);
}

const committedText = readFileSync(file, "utf8");
let committed;
try {
  committed = JSON.parse(committedText);
} catch (error) {
  fail(`${rel} is not valid JSON (${error.message}). Regenerate with \`${regen}\`.`);
}

// Contract warnings against the base branch, best effort — but never silent:
// every way the comparison can be skipped prints why.
const baseRef = process.env.PROPS_MANIFEST_BASE_REF ?? "origin/master";
compareWithBase(baseRef);

function git(args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function reason(error) {
  const text = String(error?.stderr || error?.message || error).trim();
  return text.split("\n")[0];
}

/**
 * Resolve `baseRef` explicitly: CI clones with GIT_DEPTH 1 and may not have
 * `origin/master` at all, so a missing `origin/<branch>` is fetched (shallow)
 * before giving up. Outcomes, each printed: compared; skipped — no git / no
 * base ref; base ref has no manifest yet (the MR that introduces it).
 */
function compareWithBase(ref) {
  const skip = (why) =>
    console.log(`props:manifest:check: skipped base-branch contract comparison — ${why}`);
  const has = () => {
    try {
      git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return true;
    } catch {
      return false;
    }
  };

  try {
    git(["--version"]);
  } catch (error) {
    return skip(`git is not available (${reason(error)})`);
  }
  if (!has()) {
    const remote = /^([^/]+)\/(.+)$/.exec(ref);
    let fetchError = "not a <remote>/<branch> ref, nothing to fetch";
    if (remote) {
      try {
        git([
          "fetch", "--no-tags", "--depth=1", remote[1],
          `+refs/heads/${remote[2]}:refs/remotes/${remote[1]}/${remote[2]}`,
        ]);
      } catch (error) {
        fetchError = `fetch failed: ${reason(error)}`;
      }
    }
    if (!has()) return skip(`no base ref ${ref} (${fetchError})`);
  }

  const repoRel =
    git(["ls-files", "--full-name", "--", "props-manifest.json"]).trim() ||
    "packages/ui/props-manifest.json";
  let baseText;
  try {
    baseText = git(["show", `${ref}:${repoRel}`]);
  } catch {
    return skip(`${ref} has no ${repoRel} yet (nothing to compare against)`);
  }
  let base;
  try {
    base = JSON.parse(baseText);
  } catch (error) {
    return skip(`${repoRel} at ${ref} is not valid JSON (${reason(error)})`);
  }
  const changes = contractChanges(base, fresh);
  warnContractChanges(changes, ref);
  console.log(
    `props:manifest:check: compared with ${ref} — ${changes.length} contract change(s)`,
  );
}

const freshText = serializeManifest(fresh);
if (freshText !== committedText) {
  warnContractChanges(contractChanges(committed, fresh), `committed ${rel}`);
  const names = new Set([
    ...Object.keys(committed?.components ?? {}),
    ...Object.keys(fresh.components),
  ]);
  const differing = [...names]
    .filter(
      (name) =>
        JSON.stringify(committed?.components?.[name]) !==
        JSON.stringify(fresh.components[name]),
    )
    .sort();
  const header = ["package", "version", "generatedBy"].filter(
    (key) => JSON.stringify(committed?.[key]) !== JSON.stringify(fresh[key]),
  );
  const what = [
    ...(header.length ? [`header fields: ${header.join(", ")}`] : []),
    ...(differing.length ? [`components: ${differing.join(", ")}`] : []),
  ];
  fail(
    `${rel} is stale — it differs from the kit sources + overlay` +
      (what.length ? ` (${what.join("; ")})` : " (formatting only)") +
      `. Regenerate with \`${regen}\` and commit the result; never hand-edit it.`,
  );
}

const total = Object.values(fresh.components).reduce((sum, c) => sum + c.props.length, 0);
console.log(
  `props:manifest:check OK — ${rel} is up to date (${Object.keys(fresh.components).length} components, ${total} props)`,
);
