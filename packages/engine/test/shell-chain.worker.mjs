// Worker for the "50k-node parents chain" test in run.tsx: builds the chain
// and times saunaPublicShell OFF the main thread, so a sweep that went
// quadratic again is reported as a red test after the limit instead of
// hanging the suite until the harness kills it (a suite that dies proves
// nothing — see planted.mjs).
import { parentPort, workerData } from "node:worker_threads";
import { saunaPublicShell } from "@markerloop/engine";

const N = workerData.n;
// Deepest-first: `Object.entries` walks insertion order, and a rescan loop
// that met the chain top-down would finish in one pass and hide its
// quadratic worst case.
const nodes = { root: { type: "Page", children: ["p0"] }, p0: { type: "Box", visibility: "private" } };
const parents = {};
for (let i = N - 1; i >= 1; i--) {
  nodes[`p${i}`] = { type: "Text", props: { children: `secret ${i}` } };
  parents[`p${i}`] = `p${i - 1}`;
}
parents.p0 = "root";
parents.root = null;
const started = performance.now();
const shell = saunaPublicShell({ version: 2, rootId: "root", nodes, parents });
parentPort.postMessage({ ms: performance.now() - started, kept: Object.keys(shell.nodes) });
