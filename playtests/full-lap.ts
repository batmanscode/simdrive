import { createDisplayRoom, hasFlag, parseTrackId, RaceDriver, readArg, readNumberArg } from "./lib/driver.js";

const args = process.argv.slice(2);

let display: Awaited<ReturnType<typeof createDisplayRoom>> | undefined;
let driver: RaceDriver | undefined;

try {
  const serverUrl = readArg(args, "--server", "http://127.0.0.1:8787/")!;
  const trackId = parseTrackId(readArg(args, "--track", "alpine"));
  const timeoutMs = readNumberArg(args, "--timeout-ms", "120000", { integer: true, min: 1 });
  const lapCount = readNumberArg(args, "--laps", "1", { integer: true, min: 1, max: 9 });
  const jsonOnly = hasFlag(args, "--json");

  display = await createDisplayRoom(serverUrl);
  driver = new RaceDriver({
    serverUrl,
    roomCode: display.roomCode,
    displayGroupId: display.displayGroupId,
    trackId,
    lapCount,
    name: `${trackId} full-lap`,
    color: "#ff8f3d"
  });
  await driver.start();
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
  driver?.close();
  display?.close();
}
