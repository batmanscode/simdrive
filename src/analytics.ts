import { TRACKS } from "./shared/tracks";
import type { RoomState } from "./shared/types";

type AnalyticsEvent = "room-created" | "controller-joined" | "race-started" | "race-results" | "driver-started" | "driver-finished" | "motion-setup";
type EventData = Record<string, string | number | boolean>;
export type AnalyticsClient = { displayGroupId?: string; playerId?: string };

declare global {
  interface Window {
    umami?: { track: (name: string, data: EventData) => Promise<unknown> };
  }
}

const STORAGE_KEY = "sim-drive-analytics-milestones:v1";
const seen = new Set<string>();
const pending: { name: AnalyticsEvent; data: EventData }[] = [];
let initialized = false;
let enabled = false;
let loaded = false;

export function initializeAnalytics() {
  if (initialized) return;
  initialized = true;
  if (!import.meta.env.PROD || !["simdrive.xyz", "www.simdrive.xyz"].includes(location.hostname) || navigator.doNotTrack === "1") return;
  enabled = true;
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    if (Array.isArray(saved)) saved.filter((key): key is string => typeof key === "string").slice(-64).forEach(key => seen.add(key));
  } catch { /* Storage restrictions must not affect the game. */ }

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://anal.personalslave.xyz/script.js";
  script.dataset.websiteId = "2cb0ef87-81c8-4051-8978-d4c479c59d12";
  script.dataset.domains = "simdrive.xyz,www.simdrive.xyz";
  script.dataset.excludeSearch = "true";
  script.dataset.excludeHash = "true";
  script.dataset.doNotTrack = "true";
  script.onload = () => {
    loaded = typeof window.umami?.track === "function";
    for (const event of pending.splice(0)) if (loaded) sendEvent(event.name, event.data);
  };
  script.onerror = () => { enabled = false; pending.length = 0; };
  document.head.append(script);
}

function sendEvent(name: AnalyticsEvent, data: EventData) {
  // Never await analytics in the game or let a blocked tracker reject into it.
  void Promise.resolve().then(() => window.umami?.track(name, data)).catch(() => {});
}

export function trackMilestone(name: AnalyticsEvent, key: string, data: EventData = {}) {
  if (!enabled) return;
  const milestone = `${name}:${key}`;
  if (seen.has(milestone)) return;
  seen.add(milestone);
  if (seen.size > 64) seen.delete(seen.values().next().value!);
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...seen])); } catch { /* Optional storage. */ }
  // Keys stay in this tab; only the fixed event name and coarse data are sent.
  if (loaded) sendEvent(name, data);
  else if (pending.length < 20) pending.push({ name, data });
}

export function trackRoomMilestones(room: RoomState, client: AnalyticsClient) {
  if (!enabled || !room.raceStartedAt || (room.phase !== "racing" && room.phase !== "results")) return;
  const key = `${room.roomCode}:${room.raceStartedAt}`;
  const data: EventData = {
    track: room.settings.trackId,
    players: room.cars.length,
    laps: TRACKS[room.settings.trackId].finishFraction ? 1 : room.settings.lapCount,
    weather: room.settings.changingWeather ? "changing" : room.settings.rain ? "wet" : "dry",
    mode: room.settings.championship ? "championship" : "single-race",
    assists: room.settings.stabilityAssist,
    equal_pace: Boolean(room.settings.equalPace)
  };
  if (client.playerId) {
    const car = room.cars.find(car => car.playerId === client.playerId);
    const player = room.players.find(player => player.id === client.playerId);
    if (!car || !player) return;
    const driverData = { ...data, vehicle: car.vehicleId, setup: car.carSetupId, cockpit: player.cockpitStyle ?? "none" };
    if (room.phase === "racing" && !car.finished && !car.crashed && !car.dnf) trackMilestone("driver-started", `${key}:${client.playerId}`, driverData);
    if (car.finished) trackMilestone("driver-finished", `${key}:${client.playerId}`, driverData);
  } else if (client.displayGroupId && room.displayGroups[0]?.id === client.displayGroupId) {
    // Additional displays must not multiply the host's race counts.
    if (room.phase === "racing") trackMilestone("race-started", key, data);
    if (room.phase === "results") trackMilestone("race-results", key, {
      ...data,
      finishers: room.results.filter(result => result.status === "finished").length,
      crashed: room.results.filter(result => result.status === "crashed").length,
      dnf: room.results.filter(result => result.status === "dnf").length
    });
  }
}
