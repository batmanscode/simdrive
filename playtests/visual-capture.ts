import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { hasFlag, parseTrackId, parseVehicleId, RaceDriver, readArg, readNumberArg, readRepeatedArg, sleep } from "./lib/driver.js";
import type { CarSetupId } from "../src/shared/types.js";

type Target = {
  fraction: number;
  label: string;
};

const args = process.argv.slice(2);
const consoleErrors: string[] = [];
let driver: RaceDriver | undefined;
let browser: { close: () => Promise<void> } | undefined;

try {
  const serverUrl = readArg(args, "--server", "http://127.0.0.1:8787/")!;
  const trackId = parseTrackId(readArg(args, "--track", "alpine"));
  const vehicleId = parseVehicleId(readArg(args, "--vehicle", "formula"));
  const setupId = readArg(args, "--setup") as CarSetupId | undefined;
  const timeoutMs = readNumberArg(args, "--timeout-ms", "120000", { integer: true, min: 1 });
  const width = readNumberArg(args, "--width", "1440", { integer: true, min: 1 });
  const height = readNumberArg(args, "--height", "900", { integer: true, min: 1 });
  const speedScale = readNumberArg(args, "--speed-scale", "1", { min: 0.2, max: 3 });
  const outDir = readArg(args, "--out-dir", "playtest-captures")!;
  const headed = hasFlag(args, "--headed");
  const targets = parseTargets(args);

  await resetOutputDir(outDir);
  const { chromium } = loadPlaywright();
  const launchedBrowser = await chromium.launch({ headless: !headed });
  browser = launchedBrowser;
  const context = await launchedBrowser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();

  page.on("console", (message: any) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error: Error) => {
    consoleErrors.push(error.message);
  });

  await page.goto(serverUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Create Game/i }).click();
  await page.waitForSelector(".room-code");
  const roomCode = (await page.locator(".room-code").innerText()).trim();
  await page.waitForFunction(() => sessionStorage.getItem("sim-drive-display-session")?.includes("displayGroupId"));
  const displaySession = await page.evaluate(() => JSON.parse(sessionStorage.getItem("sim-drive-display-session") || "{}"));

  driver = new RaceDriver({
    serverUrl,
    roomCode,
    displayGroupId: displaySession.displayGroupId,
    trackId,
    vehicleId,
    carSetupId: setupId,
    speedScale,
    name: `${vehicleId} ${trackId} visual`,
    color: "#ff8f3d"
  });
  await driver.start();
  await page.waitForSelector("canvas");

  const captures = [];
  for (const target of targets) {
    await driver.waitForProgress(target.fraction, timeoutMs);
    driver.setHolding(true);
    await sleep(250);
    const filename = `${trackId}-${vehicleId}-${safeLabel(target.label)}.png`;
    const filePath = path.join(outDir, filename);
    await page.screenshot({ path: filePath, fullPage: false });
    captures.push({
      target: target.fraction,
      label: target.label,
      path: filePath,
      snapshot: driver.snapshot()
    });
    driver.setHolding(false);
    await sleep(100);
  }

  console.log(JSON.stringify({ roomCode, trackId, vehicleId, captures, consoleErrors }, null, 2));
  if (consoleErrors.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  driver?.close();
  await browser?.close();
}

function parseTargets(argv: string[]): Target[] {
  const values = [
    ...readRepeatedArg(argv, "--target"),
    ...readRepeatedArg(argv, "--targets").flatMap((value) => value.split(","))
  ].map((value) => value.trim()).filter(Boolean);
  const parsed = values.length > 0 ? values : ["0.25:quarter", "0.50:half", "0.75:three-quarter", "0.94:finish"];
  return parsed.map((value) => {
    const [rawProgress, rawLabel] = value.split(":");
    const progress = Number(rawProgress);
    if (!Number.isFinite(progress) || progress <= 0 || progress > 100) {
      throw new Error(`Bad target: ${value}. Use a 0-1 fraction or 1-100 percent, optionally followed by :label.`);
    }
    const fraction = progress <= 1 ? progress : progress / 100;
    return {
      fraction,
      label: rawLabel || `${Math.round(fraction * 100)}pct`
    };
  });
}

function loadPlaywright() {
  const base = process.env.PLAYWRIGHT_NODE_PATH ?? process.env.NODE_PATH;
  const require = base
    ? createRequire(`${base.replace(/\/$/, "")}/simdrive-playtest-visual.js`)
    : createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    throw new Error("Playwright is required for visual captures. Run with: npx -y -p playwright@latest -c 'NODE_PATH=$(dirname $(dirname $(which playwright))) npm run playtest:capture -- --track alpine --target 0.24:vista'");
  }
}

async function resetOutputDir(directory: string) {
  const resolved = path.resolve(directory);
  if (!isSafeCaptureDir(resolved)) {
    throw new Error(`Refusing to delete output directory outside a playtest capture path: ${resolved}`);
  }
  await rm(resolved, { recursive: true, force: true });
  await mkdir(resolved, { recursive: true });
}

function isSafeCaptureDir(directory: string) {
  const base = path.basename(directory);
  return base === "playtest-captures"
    || base.startsWith("playtest-captures-")
    || base === "simdrive-playtest-captures"
    || base.startsWith("simdrive-playtest-captures-");
}

function safeLabel(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "capture";
}
