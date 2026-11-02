// Showroom acceptance walk: signs in, edits a page in the studio, a record, the
// theme, uploads a file — through the app mounted under its base path — and
// records every request that escapes the prefix, any external host, HTTP
// errors and console errors. Exits 1 on any finding.
//
//   node scripts/showroom-check.mjs <origin> <outdir> <viewport width> [prefix]
//   node scripts/showroom-check.mjs http://127.0.0.1:3321 /tmp/shots 1440
//
// Needs Playwright's Chromium (`pnpm --filter admin exec playwright install chromium`).
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(new URL("../apps/admin/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const [origin, out, widthArg, prefixArg] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const width = Number(widthArg);
const mobile = width < 768;
const PREFIX = prefixArg ?? "/markerloop-studio";
const base = origin + PREFIX;
let ids = null;
const route = (p) => ids.routes.find((r) => r[0] === p)[1];
let ws = "";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
const page = await ctx.newPage();
const report = { escaped: [], external: [], httpErrors: [], console: [], pageErrors: [], requests: 0, steps: [] };
const host = new URL(origin).host;
page.on("request", (r) => {
  const u = new URL(r.url());
  if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return;
  report.requests += 1;
  if (u.host !== host) report.external.push(r.url());
  else if (!(u.pathname === PREFIX || u.pathname.startsWith(PREFIX + "/"))) report.escaped.push(r.url());
});
page.on("response", (r) => { if (r.status() >= 400) report.httpErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
page.on("console", (m) => { if (m.type() === "error") report.console.push(m.text().slice(0, 400)); });
page.on("pageerror", (e) => report.pageErrors.push(String(e).slice(0, 400)));

let n = 0;
async function shot(name) {
  n += 1;
  await page.waitForTimeout(600);
  const file = `${out}/${mobile ? "m" : "d"}${String(n).padStart(2, "0")}-${name}-${width}.png`;
  await page.screenshot({ path: file });
  report.steps.push(file.split("/").pop());
}
async function settle() {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
}
async function step(name, fn) {
  try { await fn(); } catch (e) { report.steps.push(`FAILED ${name}: ${String(e).split("\n")[0]}`); }
}

await step("login", async () => {
  await page.goto(`${origin}${PREFIX}/`);
  await settle();
  if (!page.url().includes("/login")) throw new Error("root did not redirect to login: " + page.url());
  await shot("login");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  await settle();
  // The demo workspace's ids, read from the mock API as the signed-in visitor.
  ids = await page.evaluate(async (prefix) => {
    const { access_token } = await fetch(prefix + "/api/auth/get-tokens").then((r) => r.json());
    const get = (p) => fetch(prefix + "/api/v1" + p, { headers: { Authorization: "Bearer " + access_token } }).then((r) => r.json()).then((j) => j.data);
    const [w] = await get("/workspaces");
    const q = "?workspace_id=" + w.id;
    const routes = await get("/pages/routes" + q);
    const collections = await get("/collections" + q);
    const blocks = await get("/pages/blocks" + q);
    return { ws: w.id, routes: routes.map((r) => [r.path, r.id]), collections: collections.map((c) => [c.key, c.id]), blocks: blocks.map((b) => [b.key, b.id]) };
  }, PREFIX);
  ws = ids.ws;
});

await step("dashboard", async () => {
  await page.goto(`${base}/dashboard`);
  await settle();
  await page.getByText(/unread records?/i).first().waitFor({ timeout: 15000 });
  await shot("dashboard");
});

await step("pages", async () => {
  await page.goto(`${base}/pages?ws=${ws}`);
  await settle();
  await page.getByText("/coffees").filter({ visible: true }).first().waitFor();
  await shot("pages-list");
});

const NEW_HEADLINE = "Small-batch coffee, roasted every Tuesday.";
await step("studio-edit", async () => {
  await page.goto(`${base}/pages/${route("/")}?ws=${ws}`);
  await settle();
  await page.frameLocator("iframe").first().getByText("Small-batch coffee").first().waitFor({ timeout: 20000 });
  await shot("studio");
  if (mobile) {
    // On a phone the layers live behind a toggle; select through the canvas.
    await page.frameLocator("iframe").first().getByText("Small-batch coffee").first().click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /props/i }).filter({ visible: true }).first().click();
  } else {
    await page.getByText("Headline", { exact: true }).first().click();
  }
  await page.waitForTimeout(800);
  const input = page.locator('input[value^="Small-batch coffee"]').filter({ visible: true }).first();
  await input.waitFor({ timeout: 10000 });
  await shot("studio-selected");
  await input.fill(NEW_HEADLINE);
  await page.waitForTimeout(400);
  await page.getByText(/^Saved$/).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await shot("studio-edited");
  await page.reload();
  await settle();
  await page.frameLocator("iframe").first().getByText(NEW_HEADLINE).first().waitFor({ timeout: 20000 });
  report.steps.push("ok: headline edit persisted after reload");
});

await step("revisions", async () => {
  await page.goto(`${base}/pages/${route("/")}/revisions?ws=${ws}`);
  await settle();
  await shot("page-revisions");
});

await step("collections", async () => {
  const coffees = ids.collections.find((c) => c[0] === "coffees")[1];
  await page.goto(`${base}/collections/${coffees}?ws=${ws}`);
  await settle();
  await page.getByText("Huila La Esperanza").filter({ visible: true }).first().waitFor();
  await shot("collection");
  await page.getByText("Huila La Esperanza").filter({ visible: true }).first().click();
  const price = page.locator('input[value="17"]').filter({ visible: true }).first();
  await price.waitFor({ timeout: 10000 });
  await shot("record-edit");
  await price.fill("18.5");
  await page.getByRole("button", { name: /^save$/i }).filter({ visible: true }).click();
  await page.waitForTimeout(1500);
  const check = await page.evaluate(async (args) => {
    const t = await fetch(args.prefix + "/api/auth/get-tokens").then((r) => r.json());
    const r = await fetch(args.prefix + "/api/v1/records?collection_id=" + args.c + "&search=Huila", { headers: { Authorization: "Bearer " + t.access_token } }).then((r) => r.json());
    return r.data?.[0]?.data?.price;
  }, { prefix: PREFIX, c: coffees });
  if (check !== 18.5 && check !== "18.5") throw new Error("price not saved: " + check);
  report.steps.push("ok: record price saved (18.5)");
  await shot("record-saved");
});

await step("theme", async () => {
  await page.goto(`${base}/theme?ws=${ws}`);
  await settle();
  await page.getByText("Warm café").first().waitFor({ timeout: 15000 });
  await shot("theme");
  await page.getByText("Boutique", { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await shot("theme-boutique");
  const publish = page.getByRole("button", { name: /publish theme/i }).first();
  if (await publish.isEnabled()) {
    await publish.click();
    await page.waitForTimeout(800);
    const confirm = page.getByRole("dialog").getByRole("button", { name: /publish/i }).first();
    if (await confirm.count()) await confirm.click();
    await page.waitForTimeout(1500);
    await shot("theme-published");
    report.steps.push("ok: theme preset applied and publish clicked");
  }
});

await step("files", async () => {
  await page.goto(`${base}/files?ws=${ws}`);
  await settle();
  await page.locator('[data-testid="file-preview"] img').first().waitFor({ timeout: 15000 });
  await shot("files");
  // Upload a small PNG (1x1) generated in memory.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[type="file"]').first().setInputFiles({ name: "espresso-menu.png", mimeType: "image/png", buffer: png });
  await page.getByText("espresso-menu.png").first().waitFor({ timeout: 20000 });
  report.steps.push("ok: file uploaded and listed");
  await shot("files-uploaded");
});

await step("components", async () => {
  await page.goto(`${base}/components?ws=${ws}`);
  await settle();
  await page.getByText("Site header").first().waitFor();
  await shot("components");
  const header = ids.blocks.find((b) => b[0] === "site_header")[1];
  await page.goto(`${base}/components/${header}?ws=${ws}`);
  await settle();
  await shot("component-editor");
});

await step("inbox", async () => {
  await page.goto(`${base}/pages/${route("/inbox")}/view?ws=${ws}`);
  await settle();
  await page.frameLocator("iframe").first().getByText("Fieldwork Coworking").first().waitFor({ timeout: 20000 });
  await shot("inbox-view");
});

await step("workspace", async () => {
  await page.goto(`${base}/settings/workspace?ws=${ws}`);
  await settle();
  await shot("workspace-members");
});

fs.writeFileSync(`${out}/report-${width}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
const failed = report.escaped.length + report.external.length + report.httpErrors.length + report.console.length + report.pageErrors.length + report.steps.filter((s) => s.startsWith("FAILED")).length;
process.exit(failed ? 1 : 0);
