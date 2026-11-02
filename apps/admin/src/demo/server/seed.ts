// The demo workspace every visitor starts with: "Ember & Oak Coffee
// Roasters" — a small roastery's site (pages, reusable components, a theme)
// backed by real collections (coffees, brew guides, wholesale enquiries,
// events) and a file library. All names, people and companies are fictional.

import { siteThemeDefaultScale, siteThemePreset } from "@markerloop/studio";
import { el, toDoc, type DocV2, type TreeNode } from "./tree";
import type { ArtSpec } from "./art";

/* ------------------------------------------------------------------ ids */

/** Deterministic, random-looking v4 UUIDs: the same (group, n) always gives the same id. */
function uuid(group: number, n: number): string {
  let h = (group ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  let hex = "";
  while (hex.length < 32) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    hex += h.toString(16).padStart(8, "0");
  }
  const variant = "89ab"[parseInt(hex[16]!, 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const DEMO_USER_ID = uuid(0x5eed0001, 1);
export const DEMO_WORKSPACE_ID = uuid(0x5eed0002, 1);
const MEMBER_MAYA = uuid(0x5eed0001, 2);
const MEMBER_SAM = uuid(0x5eed0001, 3);

const fileId = (n: number) => uuid(0x5eed0003, n);
const collectionId = (n: number) => uuid(0x5eed0004, n);
const fieldId = (c: number, n: number) => uuid(0x5eed0005, c * 100 + n);
const recordId = (c: number, n: number) => uuid(0x5eed0006, c * 100 + n);
const routeId = (n: number) => uuid(0x5eed0007, n);
const pageId = (n: number) => uuid(0x5eed0008, n);
const blockId = (n: number) => uuid(0x5eed0009, n);
const roleId = (n: number) => uuid(0x5eed000a, n);

/* -------------------------------------------------------------- types */

export type Json = Record<string, unknown>;

export type DemoFile = {
  id: string;
  filename: string;
  art: ArtSpec | null;
  /** Bytes uploaded by the visitor (null for generated artwork). */
  bytes: Uint8Array | null;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  status: "pending" | "ready" | "deleted";
  is_public: boolean;
  checksum: string;
  created_at: string;
  updated_at: string;
};

export type DemoRevision = { n: number; body: DocV2 | Json; note: string; created_at: string; author: string | null };

export type DemoState = {
  createdAt: number;
  user: Json;
  workspaces: Json[];
  members: Json[];
  invites: Json[];
  projectRoles: Json[];
  tokens: Json[];
  collections: Json[];
  fields: Json[];
  records: Json[];
  grants: Json[];
  files: DemoFile[];
  routes: Json[];
  pages: Json[];
  pageRevisions: Record<string, DemoRevision[]>;
  blocks: Json[];
  blockRevisions: Record<string, DemoRevision[]>;
  theme: { theme: Json; version: number; published_revision: number | null; has_unpublished_changes: boolean; updated_at: string };
  themeRevisions: Array<{ revision: number; theme: Json; note: string; author_id: string | null; created_at: string }>;
  seq: number;
};

/* --------------------------------------------------------------- time */

const DAY = 24 * 60 * 60 * 1000;
function ago(days: number, hours = 0): string {
  return new Date(Date.now() - days * DAY - hours * 60 * 60 * 1000).toISOString();
}

/* -------------------------------------------------------------- files */

type FileSeed = { n: number; filename: string; art: ArtSpec; days: number };

const COFFEE_COLORS: Record<string, [string, string]> = {
  Ethiopia: ["#7a3b5c", "#f1dfe6"],
  Colombia: ["#a0441c", "#f6e3d6"],
  Kenya: ["#2f5d4a", "#dcebe2"],
  Guatemala: ["#3c4f8a", "#dfe4f3"],
  Brazil: ["#8a5a1c", "#f3e6cf"],
  Rwanda: ["#8a2f3c", "#f5dde0"],
  Blend: ["#2b2b2b", "#e9e4dc"],
};

type CoffeeSeed = {
  name: string;
  slug: string;
  origin: string;
  region: string;
  process: string;
  roast: string;
  notes: string;
  price: number;
  weight: number;
  stock: boolean;
  featured: boolean;
  altitude: string;
  description: string;
  days: number;
};

const COFFEES: CoffeeSeed[] = [
  {
    name: "Yirgacheffe Konga",
    slug: "yirgacheffe-konga",
    origin: "Ethiopia",
    region: "Gedeo Zone, Yirgacheffe",
    process: "washed",
    roast: "light",
    notes: "Jasmine, bergamot, white peach",
    price: 19,
    weight: 250,
    stock: true,
    featured: true,
    altitude: "1,900–2,100 m",
    description:
      "Grown by 650 smallholders who deliver ripe cherry to the Konga washing station. A floral, tea-like cup that opens up as it cools — our favourite as a slow pour-over on Sunday mornings.",
    days: 40,
  },
  {
    name: "Guji Hambela",
    slug: "guji-hambela",
    origin: "Ethiopia",
    region: "Guji Zone, Hambela Wamena",
    process: "natural",
    roast: "light",
    notes: "Blueberry, dark chocolate, rose",
    price: 21,
    weight: 250,
    stock: true,
    featured: false,
    altitude: "2,000–2,200 m",
    description:
      "Dried whole on raised beds for three weeks, which gives this lot its jammy blueberry sweetness. Wild in a filter, surprisingly gentle as a long espresso.",
    days: 32,
  },
  {
    name: "Huila La Esperanza",
    slug: "huila-la-esperanza",
    origin: "Colombia",
    region: "Pitalito, Huila",
    process: "washed",
    roast: "medium",
    notes: "Red apple, panela, cocoa",
    price: 17,
    weight: 250,
    stock: true,
    featured: true,
    altitude: "1,650 m",
    description:
      "From the Muñoz family's farm, our longest relationship — this is the sixth harvest we have bought from them. Round, sweet and forgiving: the coffee we recommend to everyone.",
    days: 25,
  },
  {
    name: "Nyeri Gatomboya AA",
    slug: "nyeri-gatomboya",
    origin: "Kenya",
    region: "Nyeri County",
    process: "washed",
    roast: "light",
    notes: "Blackcurrant, pink grapefruit, cane sugar",
    price: 22,
    weight: 250,
    stock: true,
    featured: true,
    altitude: "1,750 m",
    description:
      "SL28 and SL34 cherries processed at the Gatomboya factory with a double fermentation. Juicy and bright — the cup that converts people to light roasts.",
    days: 18,
  },
  {
    name: "Huehuetenango Las Moritas",
    slug: "huehuetenango-las-moritas",
    origin: "Guatemala",
    region: "La Libertad, Huehuetenango",
    process: "washed",
    roast: "medium",
    notes: "Milk chocolate, orange zest, almond",
    price: 18,
    weight: 250,
    stock: true,
    featured: false,
    altitude: "1,800 m",
    description:
      "Grown in the dry, warm winds that blow up from Mexico's Tehuantepec plain. Balanced and chocolatey, with a clean citrus finish that shines with milk.",
    days: 14,
  },
  {
    name: "Cerrado Mineiro",
    slug: "cerrado-mineiro",
    origin: "Brazil",
    region: "Patrocínio, Minas Gerais",
    process: "natural",
    roast: "dark",
    notes: "Hazelnut, caramel, cocoa nib",
    price: 15,
    weight: 250,
    stock: true,
    featured: false,
    altitude: "1,100 m",
    description:
      "A comforting, low-acidity coffee for moka pots and French presses. Roasted a touch darker to bring out the caramel without tipping into bitterness.",
    days: 10,
  },
  {
    name: "Nyamasheke Honey",
    slug: "nyamasheke-honey",
    origin: "Rwanda",
    region: "Lake Kivu, Western Province",
    process: "honey",
    roast: "light",
    notes: "Red grape, hibiscus, wildflower honey",
    price: 20,
    weight: 250,
    stock: false,
    featured: false,
    altitude: "1,700 m",
    description:
      "A tiny lot from the shores of Lake Kivu, dried with some of the fruit's mucilage left on. Sold out for this season — the next shipment lands in March.",
    days: 7,
  },
  {
    name: "Ember House Espresso",
    slug: "ember-house-espresso",
    origin: "Blend",
    region: "Colombia · Brazil · Ethiopia",
    process: "washed",
    roast: "medium",
    notes: "Dark chocolate, cherry, toffee",
    price: 16,
    weight: 500,
    stock: true,
    featured: true,
    altitude: "1,100–2,000 m",
    description:
      "Our house blend, built for milk drinks: Huila for sweetness, Cerrado for body and a splash of Ethiopian for a cherry top note. It's what we pour at the café bar every day.",
    days: 60,
  },
];

const FILES: FileSeed[] = [
  { n: 1, filename: "hero-morning-pour.svg", art: { kind: "hero" }, days: 62 },
  { n: 2, filename: "roastery-floor.svg", art: { kind: "roastery" }, days: 61 },
  { n: 3, filename: "pour-over-v60.svg", art: { kind: "pourover" }, days: 45 },
  { n: 4, filename: "latte-art-rosetta.svg", art: { kind: "latte" }, days: 44 },
  { n: 5, filename: "green-beans-texture.svg", art: { kind: "beans" }, days: 43 },
  { n: 6, filename: "team-ember-and-oak.svg", art: { kind: "team" }, days: 30 },
  { n: 7, filename: "logo-ember-and-oak.svg", art: { kind: "logo" }, days: 63 },
  ...COFFEES.map((c, i) => ({
    n: 20 + i,
    filename: `bag-${c.slug}.svg`,
    art: {
      kind: "bag" as const,
      label: c.name.replace(/^(Yirgacheffe|Guji|Huila|Nyeri|Huehuetenango|Cerrado|Nyamasheke|Ember House)\s*/, "") || c.name,
      origin: c.origin === "Blend" ? "House Blend" : c.origin,
      color: COFFEE_COLORS[c.origin]![0],
      accent: COFFEE_COLORS[c.origin]![1],
      roast: c.roast,
    },
    days: c.days,
  })),
];

export const FILE = {
  hero: fileId(1),
  roastery: fileId(2),
  pourover: fileId(3),
  latte: fileId(4),
  beans: fileId(5),
  team: fileId(6),
  logo: fileId(7),
  bag: (i: number) => fileId(20 + i),
};

function fakeChecksum(n: number): string {
  let h = "";
  let x = (n * 2654435761) >>> 0;
  for (let i = 0; i < 64; i += 1) {
    x = (x * 1103515245 + 12345) >>> 0;
    h += (x % 16).toString(16);
  }
  return h;
}

/* --------------------------------------------------------- collections */

type FieldSeed = { key: string; name: string; type: string; config?: Json };

const opts = (...values: string[]) => ({ options: values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) })) });

function rich(text: string): Json {
  return {
    format: "pm/1",
    doc: {
      type: "doc",
      content: text.split("\n\n").map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
    },
    text,
  };
}

const COLLECTIONS: Array<{ n: number; key: string; name: string; icon: string; days: number; fields: FieldSeed[] }> = [
  {
    n: 1,
    key: "coffees",
    name: "Coffees",
    icon: "☕",
    days: 64,
    fields: [
      { key: "name", name: "Name", type: "string" },
      { key: "slug", name: "Slug", type: "string" },
      { key: "origin", name: "Origin", type: "select", config: opts("Ethiopia", "Colombia", "Kenya", "Guatemala", "Brazil", "Rwanda", "Blend") },
      { key: "region", name: "Region", type: "string" },
      { key: "process", name: "Process", type: "select", config: opts("washed", "natural", "honey") },
      { key: "roast", name: "Roast", type: "select", config: opts("light", "medium", "dark") },
      { key: "tasting_notes", name: "Tasting notes", type: "string" },
      { key: "price", name: "Price, USD", type: "number" },
      { key: "weight_g", name: "Weight, g", type: "number" },
      { key: "photo", name: "Bag photo", type: "image" },
      { key: "altitude", name: "Altitude", type: "string" },
      { key: "in_stock", name: "In stock", type: "boolean" },
      { key: "featured", name: "Featured", type: "boolean" },
      { key: "description", name: "Description", type: "rich_text" },
    ],
  },
  {
    n: 2,
    key: "brew_guides",
    name: "Brew guides",
    icon: "📖",
    days: 50,
    fields: [
      { key: "title", name: "Title", type: "string" },
      { key: "method", name: "Method", type: "select", config: opts("V60", "AeroPress", "Chemex", "Espresso", "French press") },
      { key: "level", name: "Level", type: "select", config: opts("beginner", "intermediate", "advanced") },
      { key: "time_min", name: "Brew time, min", type: "number" },
      { key: "ratio", name: "Ratio", type: "string" },
      { key: "recommended", name: "Recommended coffee", type: "relation", config: { collection_key: "coffees" } },
      { key: "published_on", name: "Published", type: "date" },
      { key: "steps", name: "Steps", type: "rich_text" },
    ],
  },
  {
    n: 3,
    key: "wholesale_enquiries",
    name: "Wholesale enquiries",
    icon: "📥",
    days: 35,
    fields: [
      { key: "company", name: "Company", type: "string" },
      { key: "contact_name", name: "Contact", type: "string" },
      { key: "email", name: "Email", type: "string" },
      { key: "city", name: "City", type: "string" },
      { key: "monthly_kg", name: "Volume, kg / month", type: "number" },
      { key: "status", name: "Status", type: "select", config: opts("new", "contacted", "sampling", "won", "lost") },
      { key: "received", name: "Received", type: "date" },
      { key: "notes", name: "Notes", type: "rich_text" },
      { key: "read_at", name: "Read", type: "date" },
    ],
  },
  {
    n: 4,
    key: "events",
    name: "Cuppings & classes",
    icon: "📅",
    days: 20,
    fields: [
      { key: "title", name: "Title", type: "string" },
      { key: "date", name: "Date", type: "date" },
      { key: "seats", name: "Seats", type: "number" },
      { key: "price", name: "Price, USD", type: "number" },
      { key: "sold_out", name: "Sold out", type: "boolean" },
      { key: "host", name: "Host", type: "string" },
    ],
  },
];

function futureDate(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}
function pastDate(days: number): string {
  return new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
}

function recordsSeed(): Array<{ c: number; data: Json; days: number }> {
  const out: Array<{ c: number; data: Json; days: number }> = [];
  COFFEES.forEach((c, i) =>
    out.push({
      c: 1,
      days: c.days,
      data: {
        name: c.name,
        slug: c.slug,
        photo: FILE.bag(i),
        origin: c.origin,
        region: c.region,
        process: c.process,
        roast: c.roast,
        tasting_notes: c.notes,
        price: c.price,
        weight_g: c.weight,
        altitude: c.altitude,
        in_stock: c.stock,
        featured: c.featured,
        description: rich(c.description),
      },
    })
  );
  const guides: Array<[string, string, string, number, string, number, string]> = [
    ["The everyday V60", "V60", "beginner", 3.5, "15 g : 250 g", 0, "Rinse the paper and preheat the cone.\n\nBloom with 40 g of water for 40 seconds, then pour in slow spirals to 250 g by 1:45.\n\nAim to finish draining around 3:30. Coarser if it runs slow, finer if it rushes."],
    ["AeroPress, upside down", "AeroPress", "beginner", 2.5, "15 g : 230 g", 2, "Flip the AeroPress and add 15 g of medium-fine coffee.\n\nPour 230 g of water at 90 °C, stir three times and steep for 1:30.\n\nCap, flip onto your mug and press gently for 30 seconds."],
    ["Chemex for four", "Chemex", "intermediate", 5, "42 g : 700 g", 3, "Use the thick Chemex filter folded with three layers toward the spout.\n\nBloom with 100 g, then pour in three stages to 700 g.\n\nA total time near 5 minutes gives a clean, sweet cup to share."],
    ["Dialling in espresso at home", "Espresso", "advanced", 0.5, "18 g : 40 g", 7, "Start at 18 g in, 40 g out, in 28–32 seconds.\n\nSour and thin? Grind finer. Bitter and dry? Grind coarser.\n\nChange one thing at a time and taste every shot."],
    ["Bold French press", "French press", "beginner", 4, "30 g : 500 g", 5, "Grind coarse, like sea salt.\n\nAdd water just off the boil, stir and leave the lid on for 4 minutes.\n\nSkim the crust, then press slowly and pour straight away."],
  ];
  guides.forEach(([title, method, level, time, ratio, coffee, steps], i) =>
    out.push({
      c: 2,
      days: 45 - i * 6,
      data: {
        title,
        method,
        level,
        time_min: time,
        ratio,
        recommended: [recordId(1, coffee + 1)],
        published_on: pastDate(45 - i * 6),
        steps: rich(steps),
      },
    })
  );
  const leads: Array<[string, string, string, string, number, string, number, string]> = [
    ["Northside Bakery Co.", "Priya Natarajan", "priya@northside-bakery.example", "Portland, OR", 40, "won", 30, "Two locations, switching from a commodity roaster. Weekly delivery of the house espresso, Tuesdays."],
    ["Tidewater Hotel", "Marcus Bell", "m.bell@tidewater-hotel.example", "Seattle, WA", 120, "sampling", 12, "Lobby café plus room service. Sent 3 sample bags; tasting with their F&B team next week."],
    ["Paper Lantern Books & Café", "Hana Sato", "hana@paperlantern.example", "Eugene, OR", 15, "contacted", 6, "Small bookshop café, wants a single-origin filter that rotates monthly."],
    ["Fieldwork Coworking", "Diego Alvarez", "diego@fieldwork.example", "Portland, OR", 25, "new", 2, "Batch brew for 200 members. Asked about brewer rental."],
    ["Gather Kitchen", "Lena Fischer", "lena@gatherkitchen.example", "Vancouver, WA", 30, "sampling", 9, "Brunch restaurant. Interested in the Huila for espresso with milk."],
    ["Marlow Street Deli", "Tom Okonkwo", "tom@marlowdeli.example", "Salem, OR", 10, "lost", 40, "Went with a cheaper supplier for now; check back in spring."],
  ];
  leads.forEach(([company, contact, email, city, kg, status, days, notes]) =>
    out.push({
      c: 3,
      days,
      data: {
        company,
        contact_name: contact,
        email,
        city,
        monthly_kg: kg,
        status,
        received: pastDate(days),
        notes: rich(notes),
        // The newest three are unread: they make the inbox on the home screen.
        ...(days > 8 ? { read_at: pastDate(Math.max(0, days - 1)) } : {}),
      },
    })
  );
  const events: Array<[string, number, number, number, boolean, string]> = [
    ["Saturday public cupping", 5, 12, 0, false, "Maya Chen"],
    ["Home espresso masterclass", 12, 8, 65, true, "Sam Okafor"],
    ["Latte art basics", 19, 6, 45, false, "Sam Okafor"],
    ["Origin stories: a night with Huila", 26, 30, 15, false, "Alex Rivera"],
  ];
  events.forEach(([title, inDays, seats, price, sold, host], i) =>
    out.push({ c: 4, days: 15 - i * 3, data: { title, date: futureDate(inDays), seats, price, sold_out: sold, host } })
  );
  return out;
}

/* ---------------------------------------------------------------- site */

const BLOCK = { header: blockId(1), footer: blockId(2), cta: blockId(3) };

const nav = (label: string, href: string) => el("Link", { text: label, href, target: "_self" }, [], `Nav: ${label}`);

function headerBlock(): DocV2 {
  return toDoc(
    el("Section", { background: "default", padding: "sm", width: "wide" }, [
      el("Box", { direction: "row", gap: 6, padding: 0, align: "center" }, [
        el("Text", { level: "h3", text: "Ember & Oak", weight: "bold" }, [], "Brand"),
        el("Box", { direction: "row", gap: 5, padding: 0, align: "center" }, [
          nav("Coffees", "/coffees"),
          nav("Brew guides", "/brew-guides"),
          nav("Our story", "/about"),
          nav("Visit", "/visit"),
        ], "Navigation"),
      ]),
    ], "Header"),
    "hdr"
  );
}

function footerBlock(): DocV2 {
  return toDoc(
    el("Section", { background: "dark", padding: "md", width: "wide" }, [
      el("Box", { columns: 3, gap: 6, padding: 0 }, [
        el("Box", { gap: 2, padding: 0 }, [
          el("Text", { level: "h3", text: "Ember & Oak", color: "inverse" }),
          el("Text", { level: "body", text: "Small-batch coffee roasters since 2017.", color: "inverse" }),
        ], "Brand"),
        el("Box", { gap: 2, padding: 0 }, [
          el("Text", { level: "caption", text: "ROASTERY & CAFÉ", color: "inverse", weight: "bold" }),
          el("Text", { level: "body", text: "1418 Alder Street, Portland, OR", color: "inverse" }),
          el("Text", { level: "body", text: "hello@emberandoak.example", color: "inverse" }),
        ], "Address"),
        el("Box", { gap: 2, padding: 0 }, [
          el("Text", { level: "caption", text: "HOURS", color: "inverse", weight: "bold" }),
          el("Text", { level: "body", text: "Mon–Fri 7:00–16:00", color: "inverse" }),
          el("Text", { level: "body", text: "Sat–Sun 8:00–15:00", color: "inverse" }),
        ], "Hours"),
      ]),
      el("Separator", {}),
      el("Text", { level: "caption", text: "© 2026 Ember & Oak Coffee Roasters. Roasted on Tuesdays, shipped on Wednesdays.", color: "inverse" }),
    ], "Footer"),
    "ftr"
  );
}

function ctaBlock(): DocV2 {
  return toDoc(
    el("Section", { background: "primary", align: "center", padding: "lg", width: "narrow" }, [
      el("Text", { level: "h2", text: "Fresh roasts, once a month", align: "center", color: "inverse" }, [], "Heading", "cta-heading"),
      el("Text", { level: "lead", text: "One email when a new harvest lands. No spam, no discount codes every Tuesday.", align: "center", color: "inverse" }, [], "Text", "cta-text"),
      el("Button", { children: "Join the list", variant: "secondary", size: "lg" }, [], "Button", "cta-button"),
    ], "Call to action"),
    "cta",
    [
      { name: "Heading", nodeId: "cta-heading", prop: "text", type: "string", default: "Fresh roasts, once a month" },
      { name: "Text", nodeId: "cta-text", prop: "text", type: "text", default: "One email when a new harvest lands." },
      { name: "Button", nodeId: "cta-button", prop: "children", type: "string", default: "Join the list" },
    ]
  );
}

const ref = (id: string, name: string, params?: Json) => el("Ref", { blockId: id, ...(params ? { params } : {}) }, [], name);

const image = (file: string, alt: string, aspect = "4 / 3", name?: string) =>
  el("Image", { src: `mlfile:${file}`, alt, fit: "cover", aspect, radius: "theme", width: "fill" }, [], name);

function dataView(collection: number, key: string, fields: string[], extra: Json = {}, name?: string): TreeNode {
  return el(
    "DataView",
    {
      source: { kind: "collection", workspace_id: DEMO_WORKSPACE_ID, collection_id: collectionId(collection), collection_key: key },
      fields,
      sort: { field: fields[0]!, direction: "asc" },
      filter: [],
      presets: [],
      limit: 12,
      ...extra,
    },
    [],
    name
  );
}

function homePage(variant: 0 | 1 | 2 = 2): DocV2 {
  const headline = variant === 0 ? "Coffee, roasted slowly." : "Small-batch coffee, roasted with patience.";
  const sections: TreeNode[] = [
    ref(BLOCK.header, "Site header"),
    el("Section", { background: "default", padding: "lg", width: "wide" }, [
      el("Box", { columns: 2, gap: 8, padding: 0, align: "center" }, [
        el("Box", { gap: 4, padding: 0 }, [
          el("Badge", { children: "New harvest · Nyeri Gatomboya AA", variant: "secondary" }),
          el("Text", { level: "display", text: headline }, [], "Headline"),
          el("Text", {
            level: "lead",
            text: "We buy green coffee directly from twelve farms we know by name, roast it in 15 kg batches every Tuesday, and ship it the next morning.",
            color: "muted",
          }, [], "Intro"),
          el("Box", { direction: "row", gap: 3, padding: 0 }, [
            el("Button", { children: "Shop coffees", size: "lg" }),
            el("Button", { children: "Visit the roastery", variant: "outline", size: "lg" }),
          ], "Actions"),
        ], "Hero copy"),
        image(FILE.hero, "A cup of filter coffee on the roastery counter", "4 / 3", "Hero image"),
      ]),
    ], "Hero"),
  ];
  if (variant >= 1) {
    sections.push(
      el("Section", { background: "muted", padding: "lg", width: "wide" }, [
        el("Text", { level: "h2", text: "How we roast", align: "center" }),
        el("Text", { level: "body", text: "Three promises we've kept since the first batch.", align: "center", color: "muted" }),
        el("Box", { columns: 3, gap: 5, padding: 0 }, [
          el("CardView", { title: "Direct from farms", description: "12 partner farms", text: "We visit every origin we buy from and pay well above Fair Trade minimums — prices are published on each bag." }),
          el("CardView", { title: "Roasted to order", description: "Every Tuesday", text: "Small 15 kg batches on our restored 1978 Probat, profiled separately for filter and espresso." }),
          el("CardView", { title: "Shipped next day", description: "Wednesday dispatch", text: "Coffee reaches you within days of roasting, in compostable bags with a one-way valve." }),
        ]),
      ], "Our promises")
    );
  }
  if (variant >= 2) {
    sections.push(
      el("Section", { background: "default", padding: "lg", width: "wide" }, [
        el("ListHeader", { title: "This month's coffees", description: "Straight from the Coffees collection — edit a record and the page follows." }),
        dataView(1, "coffees", ["name", "origin", "roast", "tasting_notes", "price"], {
          filter: [{ field: "in_stock", op: "eq", value: true }],
          presets: [
            { id: "all", label: "All", filter: [] },
            { id: "featured", label: "Featured", filter: [{ field: "featured", op: "eq", value: true }] },
            { id: "light", label: "Light roasts", filter: [{ field: "roast", op: "eq", value: "light" }] },
          ],
          limit: 6,
        }, "Coffee list"),
      ], "Featured coffees"),
      el("Section", { background: "default", padding: "lg", width: "wide" }, [
        el("Box", { columns: 2, gap: 8, padding: 0, align: "center" }, [
          image(FILE.roastery, "The drum roaster on the roastery floor", "4 / 3", "Roastery photo"),
          el("Box", { gap: 4, padding: 0 }, [
            el("Text", { level: "h2", text: "A roastery you can walk into" }),
            el("Text", {
              level: "body",
              text: "Our café sits on the roastery floor. Order a pour-over, watch Tuesday's batch drop into the cooling tray, and ask the roaster anything — that's the whole point.",
            }),
            el("Link", { text: "Plan your visit →", href: "/visit", target: "_self" }),
          ]),
        ]),
      ], "Visit teaser"),
      ref(BLOCK.cta, "Newsletter", { Heading: "Fresh roasts, once a month", Text: "One email when a new harvest lands. No spam, ever.", Button: "Join the list" })
    );
  }
  sections.push(ref(BLOCK.footer, "Site footer"));
  return toDoc(el("Page", {}, sections), "home");
}

function coffeesPage(): DocV2 {
  return toDoc(
    el("Page", {}, [
      ref(BLOCK.header, "Site header"),
      el("Section", { background: "muted", padding: "md", width: "wide" }, [
        el("Text", { level: "h1", text: "Our coffees" }),
        el("Text", { level: "lead", text: "Eight coffees on the shelf this month — four single origins for filter, two for espresso, and our house blend.", color: "muted" }),
      ], "Page title"),
      el("Section", { background: "default", padding: "md", width: "wide" }, [
        dataView(1, "coffees", ["name", "origin", "process", "roast", "tasting_notes", "price", "in_stock"], {
          presets: [
            { id: "all", label: "All coffees", filter: [] },
            { id: "light", label: "Light", filter: [{ field: "roast", op: "eq", value: "light" }] },
            { id: "medium", label: "Medium", filter: [{ field: "roast", op: "eq", value: "medium" }] },
            { id: "dark", label: "Dark", filter: [{ field: "roast", op: "eq", value: "dark" }] },
          ],
          limit: 20,
        }, "Catalogue"),
      ], "Catalogue"),
      el("Section", { background: "default", padding: "md", width: "default" }, [
        el("Text", { level: "h2", text: "Which roast is for me?" }),
        el("TableView", {
          header: true,
          striped: true,
          rows: [
            ["Roast", "Best for", "Expect"],
            ["Light", "Pour-over, AeroPress", "Fruit, florals, tea-like body"],
            ["Medium", "Everything, espresso with milk", "Chocolate, caramel, balance"],
            ["Dark", "Moka pot, French press", "Nutty, heavy body, low acidity"],
          ],
        }),
      ], "Roast guide"),
      ref(BLOCK.footer, "Site footer"),
    ]),
    "coffees"
  );
}

function aboutPage(): DocV2 {
  return toDoc(
    el("Page", {}, [
      ref(BLOCK.header, "Site header"),
      el("Section", { background: "default", padding: "lg", width: "wide" }, [
        el("Box", { columns: 2, gap: 8, padding: 0, align: "center" }, [
          el("Box", { gap: 4, padding: 0 }, [
            el("Text", { level: "h1", text: "Our story" }),
            el("Text", {
              level: "lead",
              text: "Ember & Oak started in 2017 with a secondhand roaster in a garage and a stubborn idea: great coffee should taste like where it comes from.",
            }),
            el("Text", {
              level: "body",
              text: "Today we're a team of nine roasting about two tonnes a month for our café, 40 wholesale partners and a few thousand subscribers. We still cup every batch before it ships.",
            }),
          ]),
          image(FILE.team, "Alex, Maya and Sam behind the café bar", "4 / 3", "Team photo"),
        ]),
      ], "Intro"),
      el("Section", { background: "muted", padding: "lg", width: "default" }, [
        el("Text", { level: "h2", text: "What we believe" }),
        el("AccordionView", {
          type: "single",
          collapsible: true,
          items: [
            { label: "Pay farmers first", text: "We set prices with each farm before the harvest and publish them on every bag. On average we pay 2.4× the commodity price." },
            { label: "Roast for the coffee, not the brand", text: "There is no 'Ember & Oak roast'. Each lot gets its own profile, adjusted until it tastes like itself." },
            { label: "Waste less", text: "Compostable bags, chaff donated to a local community garden, and a refill programme at the café." },
          ],
        }),
      ], "Values"),
      ref(BLOCK.cta, "Newsletter", { Heading: "Come roast with us", Text: "We host a public cupping every Saturday at 10 am. Free, no booking needed.", Button: "See all events" }),
      ref(BLOCK.footer, "Site footer"),
    ]),
    "about"
  );
}

function guidesPage(): DocV2 {
  return toDoc(
    el("Page", {}, [
      ref(BLOCK.header, "Site header"),
      el("Section", { background: "default", padding: "lg", width: "wide" }, [
        el("Box", { columns: 2, gap: 8, padding: 0, align: "center" }, [
          el("Box", { gap: 3, padding: 0 }, [
            el("Text", { level: "h1", text: "Brew guides" }),
            el("Text", { level: "lead", text: "Recipes we use at the café bar, written for a kitchen counter.", color: "muted" }),
          ]),
          image(FILE.pourover, "A V60 dripper over a glass carafe", "16 / 9", "Guide image"),
        ]),
      ], "Page title"),
      el("Section", { background: "default", padding: "md", width: "wide" }, [
        dataView(2, "brew_guides", ["title", "method", "level", "time_min", "ratio"], {
          presets: [
            { id: "all", label: "All", filter: [] },
            { id: "beginner", label: "Beginner", filter: [{ field: "level", op: "eq", value: "beginner" }] },
          ],
        }, "Guides"),
      ], "Guides"),
      el("Section", { background: "muted", padding: "md", width: "default" }, [
        el("Text", { level: "h2", text: "Three rules that fix most cups" }),
        el("TabsView", {
          orientation: "horizontal",
          items: [
            { label: "Weigh it", text: "A $15 kitchen scale does more for your coffee than a $300 grinder. Start at 1:16 coffee to water." },
            { label: "Fresh water", text: "Use filtered water just off the boil — around 94 °C for light roasts, 90 °C for darker ones." },
            { label: "Grind last", text: "Grind right before brewing. Ground coffee loses most of its aroma within fifteen minutes." },
          ],
        }),
      ], "Tips"),
      ref(BLOCK.footer, "Site footer"),
    ]),
    "guides"
  );
}

function visitPage(): DocV2 {
  return toDoc(
    el("Page", {}, [
      ref(BLOCK.header, "Site header"),
      el("Section", { background: "default", padding: "lg", width: "wide" }, [
        el("Box", { columns: 2, gap: 8, padding: 0 }, [
          el("Box", { gap: 4, padding: 0 }, [
            el("Text", { level: "h1", text: "Visit the roastery" }),
            el("Text", { level: "lead", text: "1418 Alder Street, Portland — a five-minute walk from the Morrison Bridge.", color: "muted" }),
            el("TableView", {
              header: true,
              compact: true,
              rows: [
                ["Day", "Café", "Roasting"],
                ["Monday – Friday", "7:00 – 16:00", "Tue & Thu"],
                ["Saturday", "8:00 – 15:00", "Public cupping 10:00"],
                ["Sunday", "8:00 – 15:00", "—"],
              ],
            }, [], "Opening hours"),
          ]),
          image(FILE.latte, "A rosetta in a cappuccino", "1 / 1", "Café photo"),
        ]),
      ], "Address & hours"),
      el("Section", { background: "muted", padding: "lg", width: "default" }, [
        el("Text", { level: "h2", text: "Good to know" }),
        el("AccordionView", {
          type: "single",
          collapsible: true,
          items: [
            { label: "Can I bring my dog?", text: "Of course. Water bowl by the door, biscuits behind the bar." },
            { label: "Is there parking?", text: "Two-hour street parking on Alder and 15th, and a bike rack for twelve bikes." },
            { label: "Do you host private events?", text: "Yes — team cuppings and brewing workshops for up to 20 people. Write to hello@emberandoak.example." },
          ],
        }),
      ], "FAQ"),
      ref(BLOCK.footer, "Site footer"),
    ]),
    "visit"
  );
}

function wholesalePage(): DocV2 {
  return toDoc(
    el("Page", {}, [
      ref(BLOCK.header, "Site header"),
      el("Section", { background: "default", padding: "lg", width: "default", align: "center" }, [
        el("Badge", { children: "Draft — not on the site yet", variant: "outline" }),
        el("Text", { level: "h1", text: "Wholesale partners", align: "center" }),
        el("Text", { level: "lead", text: "Serve Ember & Oak at your café, restaurant or office. We'll help you pick the coffee, set up the bar and train your team.", align: "center", color: "muted" }),
      ], "Intro"),
      el("Section", { background: "default", padding: "md", width: "wide" }, [
        el("Box", { columns: 3, gap: 5, padding: 0 }, [
          el("CardView", { title: "Barista training", description: "Included", text: "Two on-site sessions when you start, and refreshers whenever your team changes." }),
          el("CardView", { title: "Equipment", description: "Lease or buy", text: "Grinders and batch brewers at cost, or leased with your monthly order." }),
          el("CardView", { title: "Weekly delivery", description: "Tuesday roast", text: "Free delivery in the metro area for orders above 10 kg a month." }),
        ]),
      ], "Benefits"),
      ref(BLOCK.footer, "Site footer"),
    ]),
    "wholesale"
  );
}

function inboxPage(): DocV2 {
  return toDoc(
    el("Page", {}, [
      el("Section", { background: "default", padding: "md", width: "wide" }, [
        el("ListHeader", { title: "Wholesale inbox", description: "Enquiries sent through the wholesale form. An internal page — it is never published." }),
        dataView(3, "wholesale_enquiries", ["company", "contact_name", "city", "monthly_kg", "status", "received"], {
          sort: { field: "received", direction: "desc" },
          presets: [
            { id: "open", label: "Open", filter: [{ field: "status", op: "in", value: "new,contacted,sampling" }] },
            { id: "won", label: "Won", filter: [{ field: "status", op: "eq", value: "won" }] },
            { id: "all", label: "All", filter: [] },
          ],
          limit: 25,
        }, "Enquiries"),
      ], "Inbox"),
    ]),
    "inbox"
  );
}

/* ---------------------------------------------------------------- build */

function themeSeed(): Json {
  const preset = siteThemePreset("cafe");
  const base = preset ? preset.theme : null;
  return {
    ...(base ?? {}),
    preset: "cafe",
    spacing: siteThemeDefaultScale("spacing"),
    iconSize: siteThemeDefaultScale("iconSize"),
    customColors: [{ key: "crema", label: "Crema", light: "#efe0cc", dark: "#3b2b21" }],
  };
}

export function createSeedState(): DemoState {
  const user = {
    id: DEMO_USER_ID,
    username: "alex.rivera",
    email: "alex@emberandoak.example",
    email_verified: true,
    email_verified_at: ago(90),
    policy_accepted_version: null as string | null,
    policy_accepted_at: ago(60),
    first_name: "Alex",
    last_name: "Rivera",
    display_name: "Alex Rivera",
    created_at: ago(90),
    updated_at: ago(3),
  };

  const workspace = {
    id: DEMO_WORKSPACE_ID,
    name: "Ember & Oak Coffee",
    owner_user_id: DEMO_USER_ID,
    slug: "ember-oak",
    billing_plan: "pro",
    is_personal: false,
    created_at: ago(64),
    updated_at: ago(2),
  };

  const members = [
    { workspace_id: DEMO_WORKSPACE_ID, user_id: DEMO_USER_ID, role: "owner", role_id: roleId(1), source: "direct", username: "alex.rivera", email: "alex@emberandoak.example", display_name: "Alex Rivera", first_name: "Alex", last_name: "Rivera", created_at: ago(64) },
    { workspace_id: DEMO_WORKSPACE_ID, user_id: MEMBER_MAYA, role: "member", role_id: roleId(2), source: "invite", username: "maya.chen", email: "maya@emberandoak.example", display_name: "Maya Chen", first_name: "Maya", last_name: "Chen", created_at: ago(50) },
    { workspace_id: DEMO_WORKSPACE_ID, user_id: MEMBER_SAM, role: "member", role_id: roleId(2), source: "invite", username: "sam.okafor", email: "sam@emberandoak.example", display_name: "Sam Okafor", first_name: "Sam", last_name: "Okafor", created_at: ago(21) },
  ];

  const invites = [
    { id: uuid(0x5eed000b, 1), email: "jordan@emberandoak.example", invited_by: DEMO_USER_ID, created_at: ago(1), last_sent_at: ago(1), expires_at: new Date(Date.now() + 6 * DAY).toISOString(), status: "valid", locale: "en" },
  ];

  const projectRoles = [
    { id: roleId(1), project_id: DEMO_WORKSPACE_ID, name: "owner", kind: "admin", is_builtin: true, created_at: ago(64) },
    { id: roleId(2), project_id: DEMO_WORKSPACE_ID, name: "editor", kind: "admin", is_builtin: true, created_at: ago(64) },
    { id: roleId(3), project_id: DEMO_WORKSPACE_ID, name: "public", kind: "consumer", is_builtin: true, created_at: ago(64) },
    { id: roleId(4), project_id: DEMO_WORKSPACE_ID, name: "authenticated", kind: "consumer", is_builtin: true, created_at: ago(64) },
  ];

  const tokens = [
    { id: uuid(0x5eed000c, 1), project_id: DEMO_WORKSPACE_ID, name: "Mobile ordering app", prefix: "mlk_live_7Qx", role_id: roleId(3), created_by: DEMO_USER_ID, expires_at: null, revoked_at: null, rotated_from: null, last_used_at: ago(0, 3), created_at: ago(20) },
  ];

  const files: DemoFile[] = FILES.map((f) => {
    const size = f.art.kind === "bag" ? { width: 1200, height: 1200 } : f.art.kind === "logo" ? { width: 800, height: 800 } : { width: 1600, height: 1200 };
    return {
      id: fileId(f.n),
      filename: f.filename,
      art: f.art,
      bytes: null,
      mime: "image/svg+xml",
      size_bytes: 0, // filled by the store from the rendered SVG
      width: size.width,
      height: size.height,
      status: "ready",
      is_public: true,
      checksum: fakeChecksum(f.n),
      created_at: ago(f.days),
      updated_at: ago(f.days),
    };
  });

  const collections = COLLECTIONS.map((c) => ({
    id: collectionId(c.n),
    project_id: DEMO_WORKSPACE_ID,
    key: c.key,
    name: c.name,
    is_builtin: false,
    icon: c.icon,
    created_at: ago(c.days),
    updated_at: ago(Math.max(1, c.days - 10)),
  }));
  const fields = COLLECTIONS.flatMap((c) =>
    c.fields.map((f, i) => ({
      id: fieldId(c.n, i + 1),
      collection_id: collectionId(c.n),
      key: f.key,
      name: f.name,
      type: f.type,
      config: f.config ?? {},
      schema_version: 1,
      created_at: ago(c.days),
      updated_at: ago(c.days),
    }))
  );
  const counters: Record<number, number> = {};
  const records = recordsSeed().map((r) => {
    counters[r.c] = (counters[r.c] ?? 0) + 1;
    const slug = typeof r.data.slug === "string" ? r.data.slug : null;
    return {
      id: recordId(r.c, counters[r.c]!),
      project_id: DEMO_WORKSPACE_ID,
      collection_id: collectionId(r.c),
      data: r.data,
      schema_version: 1,
      slug,
      version: 1 + ((counters[r.c]! * 7) % 4),
      created_at: ago(r.days),
      updated_at: ago(Math.max(0, r.days - 2), counters[r.c]!),
    };
  });
  const grants = [
    { id: uuid(0x5eed000d, 1), collection_id: collectionId(1), role_id: roleId(3), action: "read", fields: [], created_at: ago(40) },
    { id: uuid(0x5eed000d, 2), collection_id: collectionId(2), role_id: roleId(3), action: "read", fields: [], created_at: ago(40) },
    { id: uuid(0x5eed000d, 3), collection_id: collectionId(3), role_id: roleId(3), action: "create", fields: ["company", "contact_name", "email", "city", "monthly_kg", "notes"], created_at: ago(30) },
  ];

  type RouteSeed = { n: number; path: string; title: string; status: "draft" | "published"; pinned: boolean; days: number; body: DocV2; history: DocV2[]; unpublished?: boolean };
  const routeSeeds: RouteSeed[] = [
    { n: 1, path: "/", title: "Ember & Oak — small-batch coffee roasters", status: "published", pinned: true, days: 63, body: homePage(2), history: [homePage(0), homePage(1)] },
    { n: 2, path: "/coffees", title: "Our coffees", status: "published", pinned: true, days: 60, body: coffeesPage(), history: [] },
    { n: 3, path: "/brew-guides", title: "Brew guides", status: "published", pinned: false, days: 45, body: guidesPage(), history: [] },
    { n: 4, path: "/about", title: "Our story", status: "published", pinned: false, days: 58, body: aboutPage(), history: [], unpublished: true },
    { n: 5, path: "/visit", title: "Visit the roastery", status: "published", pinned: false, days: 40, body: visitPage(), history: [] },
    { n: 6, path: "/wholesale", title: "Wholesale partners", status: "draft", pinned: false, days: 4, body: wholesalePage(), history: [] },
    { n: 7, path: "/inbox", title: "Wholesale inbox", status: "draft", pinned: true, days: 34, body: inboxPage(), history: [] },
  ];
  const routes = routeSeeds.map((r) => ({
    id: routeId(r.n),
    workspace_id: DEMO_WORKSPACE_ID,
    path: r.path,
    title: r.title,
    status: r.status,
    pinned: r.pinned,
    version: 2 + r.history.length,
    created_at: ago(r.days),
    updated_at: ago(Math.max(0, Math.floor(r.days / 6)), r.n),
    published_at: r.status === "published" ? ago(Math.max(1, Math.floor(r.days / 5))) : null,
    has_unpublished_changes: r.unpublished === true,
  }));
  const pageRevisions: Record<string, DemoRevision[]> = {};
  const pages = routeSeeds.map((r) => {
    const id = pageId(r.n);
    const snaps = [...r.history, r.body];
    pageRevisions[id] = snaps.map((body, i) => ({
      n: i + 1,
      body,
      note: i === 0 ? "created" : "",
      created_at: ago(Math.max(0, r.days - Math.round(((i + 1) * r.days) / (snaps.length + 1))), i),
      author: i % 2 === 0 ? DEMO_USER_ID : MEMBER_MAYA,
    }));
    return {
      id,
      workspace_id: DEMO_WORKSPACE_ID,
      route_id: routeId(r.n),
      label: r.title,
      collection_binding: null,
      body: r.body,
      version: snaps.length,
      created_at: ago(r.days),
      updated_at: pageRevisions[id]![snaps.length - 1]!.created_at,
    };
  });

  const blockSeeds = [
    { id: BLOCK.header, key: "site_header", name: "Site header", group: "Layout", schema: headerBlock(), days: 62 },
    { id: BLOCK.footer, key: "site_footer", name: "Site footer", group: "Layout", schema: footerBlock(), days: 62 },
    { id: BLOCK.cta, key: "newsletter_cta", name: "Newsletter call to action", group: "Marketing", schema: ctaBlock(), days: 30 },
  ];
  const blockRevisions: Record<string, DemoRevision[]> = {};
  const blocks = blockSeeds.map((b) => {
    blockRevisions[b.id] = [
      { n: 1, body: b.schema, note: "created", created_at: ago(b.days), author: DEMO_USER_ID },
      { n: 2, body: b.schema, note: "", created_at: ago(Math.floor(b.days / 3)), author: MEMBER_MAYA },
    ];
    return {
      id: b.id,
      workspace_id: DEMO_WORKSPACE_ID,
      key: b.key,
      name: b.name,
      group: b.group,
      schema: b.schema,
      version: 2,
      created_at: ago(b.days),
      updated_at: ago(Math.floor(b.days / 3)),
      updated_by: MEMBER_MAYA,
    };
  });

  const theme = themeSeed();
  return {
    createdAt: Date.now(),
    user,
    workspaces: [workspace],
    members,
    invites,
    projectRoles,
    tokens,
    collections,
    fields,
    records,
    grants,
    files,
    routes,
    pages,
    pageRevisions,
    blocks,
    blockRevisions,
    theme: { theme, version: 3, published_revision: 2, has_unpublished_changes: false, updated_at: ago(12) },
    themeRevisions: [
      { revision: 1, theme: { ...theme, preset: "minimal" }, note: "", author_id: DEMO_USER_ID, created_at: ago(60) },
      { revision: 2, theme, note: "", author_id: DEMO_USER_ID, created_at: ago(12) },
    ],
    seq: 1000,
  };
}
