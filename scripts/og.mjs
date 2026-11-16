// Renders public/og.png, the 1200x630 card X shows for a shared link. Usage: node scripts/og.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const font = readFileSync(new URL("../public/fonts/InterVariable.woff2", import.meta.url)).toString("base64");
const tokens = readFileSync(new URL("../src/design/tokens.css", import.meta.url), "utf8");
const bars = Array.from({ length: 24 }, (_, i) => {
  const u = 11.5, env = 1 - ((u - i) / u) ** 2 * 0.42, wave = [0.35, 0.6, 0.9, 0.7, 1, 0.55, 0.8, 0.45][i % 8];
  return `<span style="height:${Math.round(8 + 150 * env * wave)}px"></span>`;
}).join("");

const html = `<style>${tokens}
@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font})}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:var(--color-bg-sub);font-family:Inter;color:var(--color-label-base);-webkit-font-smoothing:antialiased;
  display:flex;align-items:center;gap:72px;padding:0 88px}
.text{flex:1;display:flex;flex-direction:column;gap:22px}
.brand{display:flex;align-items:center;gap:12px;font-size:28px;font-weight:600;color:var(--color-label-title)}
.brand svg{fill:var(--color-label-title)}
h1{font-size:64px;line-height:1.05;letter-spacing:-.03em;font-weight:600;color:var(--color-label-title)}
p{font-size:26px;line-height:1.4;color:var(--color-label-muted)}
.chip{align-self:flex-start;font-size:20px;font-weight:500;padding:6px 16px;border-radius:999px;background:var(--color-control-tertiary);box-shadow:0 0 0 1px var(--color-bg-border-alpha-thin)}
.card{width:380px;height:380px;border-radius:28px;background:var(--color-bg-base);box-shadow:0 0 0 1px var(--color-bg-border);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px}
.bars{display:flex;align-items:center;gap:6px;height:170px}.bars span{width:7px;border-radius:4px;background:var(--color-label-base)}
.heard{font-size:30px;font-weight:500;color:var(--color-label-title)}
</style>
<div class="text">
  <div class="brand"><svg width="30" height="30" viewBox="0 0 20 20"><rect x="3" y="7" width="3" height="6" rx="1.5"/><rect x="8.5" y="3" width="3" height="14" rx="1.5"/><rect x="14" y="5.5" width="3" height="9" rx="1.5"/></svg>Micless</div>
  <h1>Hear with your phone's motion sensor</h1>
  <p>Live accelerometer, right in the browser. Can it hear words?</p>
  <span class="chip">No microphone</span>
</div>
<div class="card"><div class="bars">${bars}</div><div class="heard">Beat · 120 BPM</div></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL("../public/og.png", import.meta.url).pathname });
await browser.close();
