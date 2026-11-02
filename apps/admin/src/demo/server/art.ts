// Demo artwork, drawn as SVG at request time: the showcase ships no photos,
// so every "file" in the demo workspace is an illustration generated here
// from a small spec. Deterministic — the same id always draws the same image.

export type ArtSpec =
  | { kind: "hero" }
  | { kind: "beans" }
  | { kind: "pourover" }
  | { kind: "roastery" }
  | { kind: "latte" }
  | { kind: "team" }
  | { kind: "logo" }
  | { kind: "bag"; label: string; origin: string; color: string; accent: string; roast: string };

const W = 1600;
const H = 1200;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function bean(x: number, y: number, r: number, rot: number, fill: string, line: string): string {
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})">
<ellipse rx="${(r * 0.72).toFixed(1)}" ry="${r.toFixed(1)}" fill="${fill}"/>
<path d="M0 ${(-r * 0.86).toFixed(1)} C ${(r * 0.32).toFixed(1)} ${(-r * 0.3).toFixed(1)}, ${(-r * 0.32).toFixed(1)} ${(r * 0.3).toFixed(1)}, 0 ${(r * 0.86).toFixed(1)}" stroke="${line}" stroke-width="${(r * 0.09).toFixed(1)}" fill="none" stroke-linecap="round"/>
</g>`;
}

function scatter(seed: number, count: number, box: [number, number, number, number], rmin: number, rmax: number, fills: string[], line: string): string {
  const rand = rng(seed);
  let out = "";
  for (let i = 0; i < count; i += 1) {
    const x = box[0] + rand() * (box[2] - box[0]);
    const y = box[1] + rand() * (box[3] - box[1]);
    const r = rmin + rand() * (rmax - rmin);
    out += bean(x, y, r, rand() * 360, fills[i % fills.length]!, line);
  }
  return out;
}

function frame(w: number, h: number, body: string, defs = ""): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs>${body}</svg>`;
}

function steam(x: number, y: number, color: string): string {
  return [0, 1, 2]
    .map(
      (i) =>
        `<path d="M${x + i * 46} ${y} c -28 -40, 28 -70, 0 -110 s -28 -70, 0 -110" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round" opacity="${0.55 - i * 0.12}"/>`
    )
    .join("");
}

function hero(): string {
  const defs = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e7d6"/><stop offset="1" stop-color="#e3c2a1"/></linearGradient>
<radialGradient id="glow" cx="0.62" cy="0.45" r="0.6"><stop offset="0" stop-color="#fff6ea" stop-opacity="0.95"/><stop offset="1" stop-color="#fff6ea" stop-opacity="0"/></radialGradient>
<linearGradient id="cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbf5ee"/><stop offset="1" stop-color="#e8d8c6"/></linearGradient>`;
  const body = `<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#glow)"/>
<rect y="860" width="${W}" height="340" fill="#6b3f24"/>
<rect y="860" width="${W}" height="18" fill="#57321c"/>
${scatter(11, 26, [40, 900, 1560, 1170], 22, 34, ["#3b2015", "#4a2a1b", "#2f190f"], "#1c0e07")}
<ellipse cx="940" cy="880" rx="330" ry="46" fill="#3e2416" opacity="0.45"/>
<path d="M650 470 h560 l-50 360 a70 70 0 0 1 -70 60 h-320 a70 70 0 0 1 -70 -60 z" fill="url(#cup)"/>
<path d="M1205 540 c120 0 150 170 30 210 l-40 12" stroke="#ead9c6" stroke-width="44" fill="none" stroke-linecap="round"/>
<ellipse cx="930" cy="470" rx="280" ry="46" fill="#f3e7da"/>
<ellipse cx="930" cy="476" rx="246" ry="34" fill="#5a2e17"/>
<path d="M860 470 c40 -26 100 -26 140 0 c-40 22 -100 22 -140 0z" fill="#c9905c" opacity="0.9"/>
${steam(880, 400, "#ffffff")}
<circle cx="310" cy="300" r="120" fill="#a0441c" opacity="0.12"/>
<circle cx="1390" cy="210" r="70" fill="#a0441c" opacity="0.1"/>`;
  return frame(W, H, body, defs);
}

function beans(): string {
  const body = `<rect width="${W}" height="${H}" fill="#2a160d"/>
${scatter(7, 150, [-40, -40, W + 40, H + 40], 34, 52, ["#5b311c", "#6e3b20", "#4a2716", "#7a4526"], "#24110a")}
<rect width="${W}" height="${H}" fill="#2a160d" opacity="0.08"/>`;
  return frame(W, H, body);
}

function pourover(): string {
  const body = `<rect width="${W}" height="${H}" fill="#e9efe9"/>
<rect y="900" width="${W}" height="300" fill="#c7b299"/>
<path d="M600 900 h400 a20 20 0 0 0 20 -20 v-210 a200 120 0 0 0 -440 0 v210 a20 20 0 0 0 20 20z" fill="#d7e6ef" opacity="0.85"/>
<path d="M600 760 h400 v120 a20 20 0 0 1 -20 20 h-360 a20 20 0 0 1 -20 -20z" fill="#5a2e17" opacity="0.85"/>
<rect x="760" y="600" width="80" height="40" rx="8" fill="#bfa58a"/>
<path d="M560 300 h480 l-170 300 h-140z" fill="#f4f1ec" stroke="#cfc6bb" stroke-width="6"/>
<path d="M600 330 h400 l-150 260 h-100z" fill="#e8dccb"/>
<path d="M1260 160 c-80 0 -120 40 -150 90 l-60 100" stroke="#3b3b3b" stroke-width="18" fill="none" stroke-linecap="round"/>
<path d="M1180 130 h220 a40 40 0 0 1 40 40 v130 a60 60 0 0 1 -60 60 h-180 a60 60 0 0 1 -60 -60 v-130 a40 40 0 0 1 40 -40z" fill="#4a4a4a"/>
<path d="M1040 360 q-30 80 -230 120" stroke="#8a5a3a" stroke-width="10" fill="none" opacity="0.7" stroke-linecap="round"/>
${scatter(3, 9, [120, 950, 520, 1150], 22, 30, ["#4a2a1b", "#3b2015"], "#1c0e07")}`;
  return frame(W, H, body);
}

function roastery(): string {
  const body = `<rect width="${W}" height="${H}" fill="#31241c"/>
<rect x="0" y="0" width="${W}" height="760" fill="#3d2d22"/>
<g fill="#f2c27b" opacity="0.9">${[220, 560, 900, 1240].map((x) => `<circle cx="${x}" cy="110" r="22"/><path d="M${x - 2} 0 v88" stroke="#1d1410" stroke-width="4"/>`).join("")}</g>
<g opacity="0.25" fill="#f2c27b">${[220, 560, 900, 1240].map((x) => `<ellipse cx="${x}" cy="200" rx="160" ry="90"/>`).join("")}</g>
<rect x="0" y="760" width="${W}" height="440" fill="#24180f"/>
<rect x="420" y="430" width="560" height="330" rx="40" fill="#8b2f1b"/>
<circle cx="700" cy="595" r="120" fill="#2b1a12"/>
<circle cx="700" cy="595" r="92" fill="#4a2c1d"/>
<path d="M980 520 h170 v60 h-170z" fill="#6e2516"/>
<rect x="560" y="300" width="70" height="140" fill="#5b5b5b"/>
<path d="M560 300 h70 v-180 h-70z" fill="#4a4a4a"/>
<ellipse cx="1230" cy="780" rx="190" ry="40" fill="#5b4636"/>
<path d="M1040 780 a190 120 0 0 0 380 0z" fill="#6b5241"/>
${scatter(21, 40, [1080, 700, 1380, 790], 12, 16, ["#6e3b20", "#5b311c"], "#24110a")}
<rect x="100" y="820" width="200" height="300" rx="18" fill="#c8a57e"/>
<rect x="320" y="860" width="160" height="260" rx="18" fill="#b8916a"/>`;
  return frame(W, H, body);
}

function latte(): string {
  const body = `<rect width="${W}" height="${H}" fill="#b98a63"/>
<circle cx="800" cy="600" r="430" fill="#efe4d8"/>
<circle cx="800" cy="600" r="370" fill="#f8f2ea"/>
<circle cx="800" cy="600" r="320" fill="#9a5b32"/>
<path d="M800 380 c-140 60 -150 200 -30 250 c-120 10 -150 120 -60 170 c40 22 140 22 180 0 c90 -50 60 -160 -60 -170 c120 -50 110 -190 -30 -250z" fill="#f4e6d4"/>
<path d="M800 420 v380" stroke="#9a5b32" stroke-width="10" stroke-linecap="round"/>
<path d="M1230 600 c120 0 160 120 40 170" stroke="#efe4d8" stroke-width="52" fill="none" stroke-linecap="round"/>`;
  return frame(W, H, body);
}

function team(): string {
  const people = [
    { x: 470, skin: "#e0b48f", shirt: "#a0441c" },
    { x: 800, skin: "#8d5a3b", shirt: "#2f4a3a" },
    { x: 1130, skin: "#c98f68", shirt: "#d4a24c" },
  ];
  const body = `<rect width="${W}" height="${H}" fill="#f3e6d6"/>
<rect y="900" width="${W}" height="300" fill="#dcc3a6"/>
${people
  .map(
    (p) => `<path d="M${p.x - 170} 1200 v-160 a170 170 0 0 1 340 0 v160z" fill="${p.shirt}"/>
<rect x="${p.x - 120}" y="930" width="240" height="270" rx="30" fill="#efe4d8" opacity="0.9"/>
<circle cx="${p.x}" cy="700" r="130" fill="${p.skin}"/>
<path d="M${p.x - 135} 690 a135 140 0 0 1 270 0 q-60 -70 -135 -60 q-75 -10 -135 60z" fill="#2b1a12"/>`
  )
  .join("")}`;
  return frame(W, H, body);
}

function logo(): string {
  const body = `<rect width="800" height="800" fill="#fdf8f3"/>
<circle cx="400" cy="400" r="300" fill="#a0441c"/>
<circle cx="400" cy="400" r="262" fill="none" stroke="#fdf8f3" stroke-width="8"/>
${bean(400, 360, 120, 18, "#fdf8f3", "#a0441c")}
<text x="400" y="590" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#fdf8f3" letter-spacing="6">EMBER &amp; OAK</text>`;
  return frame(800, 800, body);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bag(spec: Extract<ArtSpec, { kind: "bag" }>): string {
  const body = `<rect width="1200" height="1200" fill="${spec.accent}"/>
<ellipse cx="600" cy="1110" rx="330" ry="40" fill="#000" opacity="0.15"/>
<path d="M330 260 h540 l40 830 h-620z" fill="#cfa77c"/>
<path d="M330 260 h540 l10 120 h-560z" fill="#b98f63"/>
<path d="M330 200 h540 v70 h-540z" fill="#a67d55"/>
<rect x="380" y="470" width="440" height="470" rx="26" fill="${spec.color}"/>
<text x="600" y="560" text-anchor="middle" font-family="Georgia, serif" font-size="34" letter-spacing="8" fill="#fdf8f3" opacity="0.85">EMBER &amp; OAK</text>
<text x="600" y="690" text-anchor="middle" font-family="Georgia, serif" font-size="70" font-weight="700" fill="#fdf8f3">${escapeXml(spec.origin)}</text>
<text x="600" y="770" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#fdf8f3">${escapeXml(spec.label)}</text>
<rect x="470" y="830" width="260" height="56" rx="28" fill="#fdf8f3" opacity="0.92"/>
<text x="600" y="869" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="700" fill="${spec.color}" letter-spacing="3">${escapeXml(spec.roast.toUpperCase())} ROAST</text>
${scatter(spec.origin.length * 31 + spec.label.length, 7, [240, 980, 960, 1120], 20, 28, ["#3b2015", "#4a2a1b"], "#1c0e07")}`;
  return frame(1200, 1200, body);
}

export function renderArt(spec: ArtSpec): string {
  switch (spec.kind) {
    case "hero":
      return hero();
    case "beans":
      return beans();
    case "pourover":
      return pourover();
    case "roastery":
      return roastery();
    case "latte":
      return latte();
    case "team":
      return team();
    case "logo":
      return logo();
    case "bag":
      return bag(spec);
  }
}

export function artSize(spec: ArtSpec): { width: number; height: number } {
  if (spec.kind === "logo") return { width: 800, height: 800 };
  if (spec.kind === "bag") return { width: 1200, height: 1200 };
  return { width: W, height: H };
}
