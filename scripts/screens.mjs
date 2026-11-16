// Drives the app in a phone-sized browser with a scripted accelerometer and saves screenshots.
// Usage: node scripts/screens.mjs [url] [outDir]   (the dev server must be running; browsers come from `npx playwright-core install chromium webkit`)
import { chromium, webkit } from "playwright-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "screens";
mkdirSync(out, { recursive: true });

/** 60 readings a second: quiet, a double tap at 2 s, a buzz pulsing at 120 BPM from 4 s to 12 s, then quiet */
const fakeSensor = () => {
  const t0 = performance.now();
  let seed = 3;
  const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 2 ** 32 - 0.5) * 0.004; };
  setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const tap = [2, 2.25].some(at => Math.abs(t - at) < 0.009) ? 1.5 : 0;
    const beat = t > 4 && t < 12 && t % 0.5 < 0.15 ? 0.4 * Math.sin(2 * Math.PI * 22 * t) : 0;
    const z = noise() + tap + beat;
    window.dispatchEvent(new DeviceMotionEvent("devicemotion", {
      acceleration: { x: noise(), y: noise(), z }, accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 + z }, interval: 16,
    }));
  }, 1000 / 60);
};

const engines = process.env.ENGINES?.split(",") ?? ["chromium"];
for (const name of engines) {
  const browser = await { chromium, webkit }[name].launch();
  // An iPhone 15 in X's in-app browser: 393 wide, about 660 tall once X's bars are drawn
  const context = await browser.newContext({ viewport: { width: 393, height: 660 }, deviceScaleFactor: 3, isMobile: name === "chromium", hasTouch: true });
  // What tapping Allow grants (Chromium asks through DeviceMotionEvent.requestPermission too)
  if (name === "chromium") await context.grantPermissions(["accelerometer", "gyroscope"]);
  const page = await context.newPage();
  page.on("pageerror", e => console.error(`[${name}] page error:`, e.message));
  page.on("console", m => m.type() === "error" && console.error(`[${name}] console:`, m.text()));
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/${name}-1-start.png` });
  // Desktop WebKit can't construct motion events: it stands in for a browser with no sensor
  const canFake = await page.evaluate(() => { try { new DeviceMotionEvent("devicemotion"); return true; } catch { return false; } });
  if (canFake) await page.addScriptTag({ content: `(${fakeSensor})()` });
  await page.getByRole("button", { name: "Start listening" }).click();
  if (canFake) {
    await page.waitForTimeout(2900);
    await page.screenshot({ path: `${out}/${name}-2-double-tap.png` });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${out}/${name}-3-beat.png` });
    await page.screenshot({ path: `${out}/${name}-4-beat-full.png`, fullPage: true });
    console.log(`[${name}] heard:`, await page.locator("ol li").allInnerTexts());
  } else {
    await page.getByText("This browser can't feel motion").waitFor();
    await page.screenshot({ path: `${out}/${name}-2-no-sensor.png` });
    console.log(`[${name}] no sensor notice shown`);
  }
  await page.getByRole("tab", { name: "Can it hear words?" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}-5-words.png`, fullPage: true });
  await page.getByRole("button", { name: "Play Original" }).click();
  await page.waitForTimeout(1500);
  console.log(`[${name}] original clip:`, await page.locator("audio").first().evaluate(a => ({ time: a.currentTime.toFixed(2), error: a.error?.code ?? null })));
  await page.getByRole("tab", { name: "80×" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${name}-6-words-80.png`, fullPage: true });
  await browser.close();
}
