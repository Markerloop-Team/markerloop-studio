// The node-boundary test of test/run.tsx (SDL-633), in its own process.
// A failure used to take ~90 s of 100 % CPU and end in an OOM kill with not
// a word printed: `assert.equal(<element>, null)` inspects the element for its
// message, i.e. jsdom's whole object graph. So the checks below compare
// booleans, never hand assert a DOM node, and the renders run in a worker
// thread whose every stretch — each step and the checks after it — is timed
// by THIS process's main thread: a thread stuck in a loop fires none of its
// own timers, but the main thread's still fire, print a FAIL line naming the
// stretch and terminate the worker (which stops even a spinning thread).
// run.tsx's 60 s limit on the whole process is only the last backstop.
import { installLayoutStubs } from "./dom";

import assert from "node:assert/strict";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import type { SaunaSchema } from "@markerloop/engine";
import { SAUNA_NODE_ID_ATTR, SaunaRenderer } from "@markerloop/engine/react/renderer";
import { SAUNA_NODE_ERROR_ATTR, SaunaNodeErrorBoundary } from "@markerloop/engine/react";

void installLayoutStubs;

async function main() {
  const Ctx = React.createContext(false);
  const registry = {
    Box: (p: { children?: React.ReactNode }) => <div data-part="Box" {...p} />,
    Tabs: (p: { children?: React.ReactNode }) => <Ctx.Provider value><div {...p} /></Ctx.Provider>,
    TabsList: function TabsList(p: { children?: React.ReactNode; label?: string }) {
      if (!React.useContext(Ctx)) throw new Error("`TabsList` must be used within `Tabs`");
      const { label, ...rest } = p;
      return <div data-part="TabsList" {...rest}>{label}</div>;
    },
  };
  const doc = (orphan: boolean, label: string): SaunaSchema => ({
    version: 2,
    rootId: "p",
    nodes: {
      p: { type: "Box", children: orphan ? ["o", "s"] : ["t", "s"] },
      ...(orphan ? { o: { type: "TabsList", props: { label } } } : { t: { type: "Tabs", children: ["o"] }, o: { type: "TabsList", props: { label } } }),
      s: { type: "Box", props: { "data-k": "sibling" } },
    },
    parents: orphan ? { p: null, o: "p", s: "p" } : { p: null, t: "p", o: "t", s: "p" },
  } as SaunaSchema);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const origError = console.error;
  console.error = () => {};
  // Every step is reported to the main thread, which times it (see the top).
  const step = async (label: string, fn: () => void) => {
    parentPort!.postMessage({ step: label });
    await act(async () => fn());
    parentPort!.postMessage({ settled: label });
  };
  const draw = (s: SaunaSchema) => (
    <SaunaRenderer editable schema={s} registry={registry} nodeBoundary={SaunaNodeErrorBoundary} isolate={(t) => t === "TabsList"} />
  );
  try {
    const orphan = doc(true, "one");
    await step("render 1", () => root.render(draw(orphan)));
    const plate = host.querySelector(`[${SAUNA_NODE_ERROR_ATTR}="TabsList"]`);
    assert.ok(plate, `no plate: ${host.innerHTML.slice(0, 200)}`);
    assert.equal(plate.getAttribute(SAUNA_NODE_ID_ATTR), "o", "the plate is selectable as the broken node");
    assert.ok(host.querySelector('[data-k="sibling"]'), "the sibling still renders");
    // Same document again: still broken, still a plate.
    await step("render 2", () => root.render(draw({ ...orphan })));
    assert.ok(host.querySelector(`[${SAUNA_NODE_ERROR_ATTR}]`));
    // The author edits the node (a new node object) — the boundary tries again.
    const edited = { ...orphan, nodes: { ...orphan.nodes, o: { type: "TabsList", props: { label: "two" } } } } as SaunaSchema;
    await step("render 3", () => root.render(draw(edited)));
    assert.ok(host.querySelector(`[${SAUNA_NODE_ERROR_ATTR}]`), "still an orphan after a label edit: still a plate");
    // The author moves it under a Tabs root — it renders.
    await step("render 4", () => root.render(draw(doc(false, "three"))));
    assert.equal(host.querySelector(`[${SAUNA_NODE_ERROR_ATTR}]`) === null, true, host.innerHTML.slice(0, 200));
    assert.equal(host.querySelector('[data-part="TabsList"]')?.textContent, "three");
    // Back to broken, then fixed IN PLACE by an edit of the node: the reset is what makes it render.
    const Fixable = { ...registry, TabsList: (p: { children?: React.ReactNode; ok?: boolean }) => {
      if (!p.ok) throw new Error("broken");
      return <div data-part="TabsList">fixed</div>;
    } };
    const inPlace = (ok: boolean) => ({ ...orphan, nodes: { ...orphan.nodes, o: { type: "TabsList", props: { ok } } } } as SaunaSchema);
    const drawF = (s: SaunaSchema) => <SaunaRenderer editable schema={s} registry={Fixable} nodeBoundary={SaunaNodeErrorBoundary} />;
    await step("render 5", () => root.render(drawF(inPlace(false))));
    assert.ok(host.querySelector(`[${SAUNA_NODE_ERROR_ATTR}]`));
    await step("render 6", () => root.render(drawF(inPlace(true))));
    assert.equal(host.querySelector(`[${SAUNA_NODE_ERROR_ATTR}]`) === null, true, "an edit of the node resets its boundary");
    assert.equal(host.querySelector('[data-part="TabsList"]')?.textContent, "fixed");
  } finally {
    console.error = origError;
    await step("unmount", () => root.unmount()).catch(() => {});
    host.remove();
  }
}

type Report = { step: string } | { settled: string } | { ok: true } | { fail: string };

const LOAD_LIMIT_MS = 30_000;
const STEP_LIMIT_MS = 5000;

function supervise() {
  const worker = new Worker(new URL(import.meta.url));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let over = false;
  const finish = (line: string, code: number) => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    console.log(`node-boundary: ${line}`);
    // terminate() interrupts even a thread stuck in a loop.
    void worker.terminate().finally(() => process.exit(code));
  };
  // One timer at a time, re-armed at every report: no stretch of the worker goes untimed.
  const arm = (what: string, ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => finish(`FAIL ${what} did not finish in ${ms / 1000} s`, 1), ms);
  };
  arm("loading the test", LOAD_LIMIT_MS);
  worker.on("message", (m: Report) => {
    if ("step" in m) arm(`step "${m.step}"`, STEP_LIMIT_MS);
    else if ("settled" in m) arm(`the checks after step "${m.settled}"`, STEP_LIMIT_MS);
    else if ("ok" in m) finish("ok", 0);
    else finish(`FAIL ${m.fail}`, 1);
  });
  worker.on("error", (e) => finish(`FAIL ${e instanceof Error ? e.message : String(e)}`, 1));
  worker.on("exit", (code) => finish(`FAIL the worker exited (${code}) without a verdict`, 1));
}

if (isMainThread) {
  supervise();
} else {
  main().then(
    () => parentPort!.postMessage({ ok: true } satisfies Report),
    (e) => parentPort!.postMessage({ fail: e instanceof Error ? e.message : String(e) } satisfies Report),
  );
}
