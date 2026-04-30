import { createDisplayRoom, hasFlag, parseTrackId, parseVehicleId, RaceDriver, readArg, readNumberArg } from "./lib/driver.js";
import type { CarSetupId } from "../src/shared/types.js";

const args = process.argv.slice(2);

let display: Awaited<ReturnType<typeof createDisplayRoom>> | undefined;
let driver: RaceDriver | undefined;
let progressLogTimer: ReturnType<typeof setInterval> | undefined;

try {
  const serverUrl = readArg(args, "--server", "http://127.0.0.1:8787/")!;
  const trackId = parseTrackId(readArg(args, "--track", "alpine"));
  const vehicleId = parseVehicleId(readArg(args, "--vehicle", "formula"));
  const setupId = readArg(args, "--setup") as CarSetupId | undefined;
  const timeoutMs = readNumberArg(args, "--timeout-ms", "120000", { integer: true, min: 1 });
  const lapCount = readNumberArg(args, "--laps", "1", { integer: true, min: 1, max: 9 });
  const speedScale = readNumberArg(args, "--speed-scale", "1", { min: 0.2, max: 3 });
  const progressLogMs = readNumberArg(args, "--progress-log-ms", "0", { integer: true, min: 0 });
  const jsonOnly = hasFlag(args, "--json");

  display = await createDisplayRoom(serverUrl);
  driver = new RaceDriver({
    serverUrl,
    roomCode: display.roomCode,
    displayGroupId: display.displayGroupId,
    trackId,
    vehicleId,
    carSetupId: setupId,
    lapCount,
    speedScale,
    name: `${vehicleId} ${trackId} full-lap`,
    color: "#ff8f3d"
  });
  await driver.start();
  if (progressLogMs > 0) {
    progressLogTimer = setInterval(() => {
      if (!driver) return;
      const snapshot = driver.snapshot();
      const fraction = snapshot.totalLength > 0 ? snapshot.maxProgress / snapshot.totalLength : 0;
      const latest = snapshot.latestCar;
      console.error([
        `${trackId} progress ${Math.round(fraction * 100)}%`,
        `time=${snapshot.raceTime.toFixed(1)}s`,
        latest ? `speed=${latest.speed.toFixed(1)}` : "speed=unknown",
        latest ? `surface=${latest.surface}` : "surface=unknown",
        `maxDistance=${snapshot.maxDistance.toFixed(2)}`
      ].join(" "));
    }, progressLogMs);
  }
  const result = await driver.waitForResults(timeoutMs);
  if (!jsonOnly) {
    console.log(`Finished ${trackId} automation room ${result.roomCode}: ${result.results[0]?.status ?? result.phase}`);
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.results.some((raceResult) => raceResult.status === "finished")) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (progressLogTimer) clearInterval(progressLogTimer);
  driver?.close();
  display?.close();
}
