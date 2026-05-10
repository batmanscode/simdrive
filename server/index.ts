import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { DEFAULT_CAR_SETUP_ID, DEFAULT_VEHICLE_ID, getDefaultSetupIdForVehicle, getVehicle, hasVehicleSetup, kmhToInternalSpeed, resolveCarSetupId, VEHICLES } from "../src/shared/cars.js";
import { createCar, resetCarToTrack, resolveCarContacts, stepCar } from "../src/shared/physics.js";
import { TRACKS, trackMetrics } from "../src/shared/tracks.js";
import type { CarState, ClientMessage, CockpitStyle, CrashEvent, DisplayGroup, InputFrame, LiveStats, NearbyAudioCar, Player, RaceResult, RaceSettings, RearViewMode, RoomState, RaceSnapshot, ServerMessage, VehicleId } from "../src/shared/types.js";

const PORT = Number(process.env.PORT ?? 8787);
const TICK_HZ = 60;
const FIXED_DT = 1 / TICK_HZ;
const SNAPSHOT_HZ = 30;
const CONTROLLER_FEEDBACK_HZ = 20;
const ACTIVE_FULL_STATE_HZ = 2;
const COUNTDOWN_MS = 5000;
const DISCONNECT_GRACE_MS = 12_000;
const NO_DISPLAY_GRACE_MS = 20_000;
const RACE_DNF_GRACE_MS = DISCONNECT_GRACE_MS;
const MAX_PLAYERS_PER_ROOM = 8;
const MAX_PLAYERS_PER_DISPLAY_GROUP = 4;
const CRASH_EVENT_TTL_MS = 1_600;
const CRASH_EVENT_COOLDOWN_MS = 1_200;
const WALL_EXPLOSION_SPEED_THRESHOLD = 24;
const NEARBY_AUDIO_RADIUS = 48;
const NEARBY_AUDIO_MAX_CARS = 3;
const NEARBY_CRASH_AUDIO_RADIUS = 72;
const COCKPIT_STYLES = new Set<CockpitStyle>(["none", "hands", "paws"]);
const DEFAULT_COCKPIT_STYLE: CockpitStyle = "none";
const REAR_VIEW_MODES = new Set<RearViewMode>(["auto", "on", "off"]);
const DEFAULT_REAR_VIEW_MODE: RearViewMode = "auto";
const VEHICLE_IDS = new Set<VehicleId>(Object.keys(VEHICLES) as VehicleId[]);
const SENSOR_PERMISSIONS_POLICY = "accelerometer=(self), gyroscope=(self), magnetometer=(self)";

type ClientRole = "unknown" | "display" | "controller";

type Client = {
  id: string;
  ws: WebSocket;
  role: ClientRole;
  roomCode?: string;
  displayGroupId?: string;
  playerId?: string;
};

type Room = {
  code: string;
  phase: RoomState["phase"];
  createdAt: number;
  displayGroups: Map<string, DisplayGroup>;
  players: Map<string, Player>;
  cars: Map<string, CarState>;
  inputs: Map<string, InputFrame>;
  controllerClients: Map<string, string>;
  settings: RaceSettings;
  lastFullStateBroadcastAt: number;
  countdownEndsAt?: number;
  raceStartedAt?: number;
  noDisplaySince?: number;
  noDisplayCloseTimer?: NodeJS.Timeout;
  results: RaceResult[];
  crashEvents: CrashEvent[];
  crashEventCooldowns: Map<string, number>;
};

const rooms = new Map<string, Room>();
const clients = new Map<string, Client>();
let lastPhysicsTickAt = Date.now();
let physicsAccumulator = 0;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const distPath = path.resolve(process.cwd(), "dist");

app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", SENSOR_PERMISSIONS_POLICY);
  next();
});
app.use(express.static(distPath));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

wss.on("connection", (ws) => {
  const client: Client = { id: id("c"), ws, role: "unknown" };
  clients.set(client.id, client);
  send(client, { type: "hello", clientId: client.id, serverNow: Date.now() });
  sendLiveStats(client);

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(String(raw)) as ClientMessage;
      handleMessage(client, message);
    } catch {
      send(client, { type: "error_notice", message: "Could not read that message." });
    }
  });

  ws.on("close", () => {
    clients.delete(client.id);
    markDisconnected(client);
  });
});

setInterval(() => {
  const now = Date.now();
  physicsAccumulator += Math.min((now - lastPhysicsTickAt) / 1000, 0.25);
  lastPhysicsTickAt = now;
  while (physicsAccumulator >= FIXED_DT) {
    for (const room of rooms.values()) {
      tickRoom(room, FIXED_DT);
    }
    physicsAccumulator -= FIXED_DT;
  }
}, 1000 / TICK_HZ);

setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase === "countdown" || room.phase === "racing") {
      broadcastRealtime(room);
    }
  }
}, 1000 / SNAPSHOT_HZ);

setInterval(() => {
  for (const room of rooms.values()) {
    sendControllerFeedback(room);
  }
}, 1000 / CONTROLLER_FEEDBACK_HZ);

setInterval(cleanRooms, 5_000);

server.listen(PORT, () => {
  console.log(`Sim Drive server listening on http://localhost:${PORT}`);
});

function handleMessage(client: Client, message: ClientMessage) {
  if (message.type === "ping") {
    send(client, { type: "pong", at: message.at, serverNow: Date.now() });
    return;
  }

  if (message.type === "create_room") {
    const room = createRoom();
    const group = createDisplayGroup(room);
    client.role = "display";
    client.roomCode = room.code;
    client.displayGroupId = group.id;
    send(client, { type: "joined_display", roomCode: room.code, displayGroupId: group.id });
    broadcastRoom(room);
    return;
  }

  if (message.type === "join_display") {
    const room = getRoom(message.roomCode, client);
    if (!room) return;
    const group = message.displayGroupId ? room.displayGroups.get(message.displayGroupId) : undefined;
    const joinedGroup = group ?? createDisplayGroup(room);
    joinedGroup.connected = true;
    room.noDisplaySince = undefined;
    if (room.noDisplayCloseTimer) {
      clearTimeout(room.noDisplayCloseTimer);
      room.noDisplayCloseTimer = undefined;
    }
    client.role = "display";
    client.roomCode = room.code;
    client.displayGroupId = joinedGroup.id;
    send(client, { type: "joined_display", roomCode: room.code, displayGroupId: joinedGroup.id });
    broadcastRoom(room);
    return;
  }

  if (message.type === "set_profile") {
    const room = getRoom(message.roomCode, client);
    if (!room) return;
    const resolvedGroupId = room.displayGroups.has(message.displayGroupId)
      ? message.displayGroupId
      : [...room.displayGroups.keys()][0];
    if (!resolvedGroupId) {
      send(client, { type: "error_notice", message: "That display group is not available." });
      return;
    }
    const existing = findPlayerByToken(room, message.token);
    if (!existing && room.players.size >= MAX_PLAYERS_PER_ROOM) {
      send(client, { type: "error_notice", message: "Room is full." });
      return;
    }
    if (!existing && playerCountInDisplayGroup(room, resolvedGroupId) >= MAX_PLAYERS_PER_DISPLAY_GROUP) {
      send(client, { type: "error_notice", message: "This screen already has 4 drivers. Join the room on another computer for another screen." });
      return;
    }
    const player = existing ?? createPlayer(room, resolvedGroupId);
    player.name = cleanName(message.name);
    player.color = cleanColor(message.color);
    player.connected = true;
    player.disconnectedAt = undefined;
    player.isVIP = room.players.size === 1 || player.id === getVipId(room);
    if (!getVipId(room)) player.isVIP = true;
    releasePreviousControllerSlot(client, room, player.id);
    claimControllerConnection(room, player.id, client);
    client.role = "controller";
    client.roomCode = room.code;
    client.displayGroupId = player.displayGroupId;
    client.playerId = player.id;
    assignVip(room);
    send(client, { type: "joined_controller", roomCode: room.code, playerId: player.id, token: player.token, displayGroupId: player.displayGroupId });
    broadcastRoom(room);
    broadcastLiveStats();
    return;
  }

  const room = client.roomCode ? rooms.get(client.roomCode) : undefined;
  if (!room) {
    send(client, { type: "error_notice", message: "Join or create a room first." });
    return;
  }

  if (message.type === "set_ready") {
    const player = getClientPlayer(client, room);
    if (!player) return;
    player.isReady = message.ready;
    broadcastRoom(room);
    return;
  }

  if (message.type === "set_tutorial_done") {
    const player = getClientPlayer(client, room);
    if (!player || room.phase !== "tutorial") return;
    player.tutorialDone = message.done;
    maybeFinishTutorial(room);
    broadcastRoom(room);
    return;
  }

  if (message.type === "set_vehicle") {
    const player = getClientPlayer(client, room);
    if (!player || room.phase !== "lobby" || !VEHICLE_IDS.has(message.vehicleId)) return;
    player.vehicleId = message.vehicleId;
    player.carSetupId = resolveCarSetupId(player.vehicleId, player.carSetupId);
    broadcastRoom(room);
    return;
  }

  if (message.type === "set_car_setup") {
    const player = getClientPlayer(client, room);
    if (!player || room.phase !== "lobby" || !hasVehicleSetup(player.vehicleId, message.carSetupId)) return;
    player.carSetupId = message.carSetupId;
    broadcastRoom(room);
    return;
  }

  if (message.type === "set_cockpit_style") {
    const player = getClientPlayer(client, room);
    if (!player || room.phase !== "lobby" || !COCKPIT_STYLES.has(message.cockpitStyle)) return;
    player.cockpitStyle = message.cockpitStyle;
    broadcastRoom(room);
    return;
  }

  if (message.type === "set_rear_view_mode") {
    const player = getClientPlayer(client, room);
    if (!player || !REAR_VIEW_MODES.has(message.rearViewMode)) return;
    player.rearViewMode = message.rearViewMode;
    broadcastRoom(room);
    return;
  }

  if (message.type === "input_frame") {
    const player = getClientPlayer(client, room);
    if (!player) return;
    room.inputs.set(player.id, {
      seq: message.input.seq,
      steer: clamp(message.input.steer, -1, 1),
      throttle: clamp(message.input.throttle, 0, 1),
      brake: clamp(message.input.brake, 0, 1)
    });
    return;
  }

  if (message.type === "vip_set_settings") {
    if (!isVip(client, room) || room.phase !== "lobby") return;
    room.settings = {
      ...room.settings,
      ...message.settings,
      lapCount: clamp(Math.round(message.settings.lapCount ?? room.settings.lapCount), 1, 9),
      trackId: message.settings.trackId && TRACKS[message.settings.trackId] ? message.settings.trackId : room.settings.trackId,
      tutorialEnabled: typeof message.settings.tutorialEnabled === "boolean" ? message.settings.tutorialEnabled : room.settings.tutorialEnabled,
      warmupStart: typeof message.settings.warmupStart === "boolean" ? message.settings.warmupStart : room.settings.warmupStart,
      ghostMode: typeof message.settings.ghostMode === "boolean" ? message.settings.ghostMode : room.settings.ghostMode,
      rain: typeof message.settings.rain === "boolean" ? message.settings.rain : room.settings.rain,
      stabilityAssist: typeof message.settings.stabilityAssist === "boolean" ? message.settings.stabilityAssist : room.settings.stabilityAssist,
      resetEnabled: typeof message.settings.resetEnabled === "boolean" ? message.settings.resetEnabled : room.settings.resetEnabled
    };
    broadcastRoom(room);
    return;
  }

  if (message.type === "request_reset") {
    const player = getClientPlayer(client, room);
    const car = player ? room.cars.get(player.id) : undefined;
    if (!player || !car || !room.raceStartedAt || room.phase !== "racing") return;
    if (!car.resetAvailable || car.finished || car.crashed || car.dnf) return;
    resetCarToTrack(car, TRACKS[room.settings.trackId], (Date.now() - room.raceStartedAt) / 1000);
    broadcastRealtime(room);
    return;
  }

  if (message.type === "vip_start_race") {
    if (!isVip(client, room) || room.phase !== "lobby") return;
    if (startRaceFlow(room)) broadcastRoom(room);
    return;
  }

  if (message.type === "vip_skip_tutorial") {
    if (!isVip(client, room) || room.phase !== "tutorial") return;
    if (startCountdown(room)) broadcastRoom(room);
    return;
  }

  if (message.type === "vip_return_lobby") {
    if (!isVip(client, room)) return;
    returnToLobby(room);
    broadcastRoom(room);
    return;
  }

  if (message.type === "display_return_lobby") {
    if (client.role !== "display") return;
    returnToLobby(room);
    broadcastRoom(room);
    return;
  }

  if (message.type === "close_room") {
    if (client.role !== "display" && !isVip(client, room)) return;
    closeRoom(room, "Room closed.");
  }
}

function returnToLobby(room: Room) {
  room.phase = "lobby";
  room.results = [];
  room.cars.clear();
  room.inputs.clear();
  room.countdownEndsAt = undefined;
  room.raceStartedAt = undefined;
  room.lastFullStateBroadcastAt = 0;
  for (const player of room.players.values()) {
    player.isReady = false;
    player.tutorialDone = false;
  }
}

function createRoom(): Room {
  let code = "";
  do {
    code = Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (rooms.has(code));

  const room: Room = {
    code,
    phase: "lobby",
    createdAt: Date.now(),
    displayGroups: new Map(),
    players: new Map(),
    cars: new Map(),
    inputs: new Map(),
    controllerClients: new Map(),
    lastFullStateBroadcastAt: 0,
    settings: {
      trackId: "sakura",
      lapCount: 1,
      tutorialEnabled: true,
      warmupStart: true,
      ghostMode: false,
      rain: false,
      stabilityAssist: true,
      resetEnabled: false
    },
    results: [],
    crashEvents: [],
    crashEventCooldowns: new Map()
  };
  rooms.set(code, room);
  return room;
}

function createDisplayGroup(room: Room) {
  const group: DisplayGroup = {
    id: id("g"),
    label: `Screen ${room.displayGroups.size + 1}`,
    connected: true
  };
  room.displayGroups.set(group.id, group);
  return group;
}

function createPlayer(room: Room, displayGroupId: string): Player {
  if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
    throw new Error("Room is full");
  }
  const player: Player = {
    id: id("p"),
    token: id("t"),
    displayGroupId,
    name: `Driver ${room.players.size + 1}`,
    color: defaultColors[room.players.size % defaultColors.length],
    vehicleId: DEFAULT_VEHICLE_ID,
    carSetupId: getDefaultSetupIdForVehicle(DEFAULT_VEHICLE_ID) ?? DEFAULT_CAR_SETUP_ID,
    cockpitStyle: DEFAULT_COCKPIT_STYLE,
    rearViewMode: DEFAULT_REAR_VIEW_MODE,
    isReady: false,
    tutorialDone: false,
    isVIP: false,
    connected: true,
    joinedAt: Date.now()
  };
  room.players.set(player.id, player);
  return player;
}

function playerCountInDisplayGroup(room: Room, displayGroupId: string) {
  return [...room.players.values()].filter((player) => player.displayGroupId === displayGroupId).length;
}

function startRaceFlow(room: Room) {
  if (!room.settings.tutorialEnabled) return startCountdown(room);
  return startTutorial(room);
}

function startTutorial(room: Room) {
  const players = [...room.players.values()].filter((player) => player.connected);
  if (players.length === 0) return false;
  room.phase = "tutorial";
  room.countdownEndsAt = undefined;
  room.raceStartedAt = undefined;
  room.lastFullStateBroadcastAt = 0;
  room.results = [];
  room.crashEvents = [];
  room.crashEventCooldowns.clear();
  room.cars.clear();
  room.inputs.clear();
  for (const player of room.players.values()) player.tutorialDone = false;
  return true;
}

function maybeFinishTutorial(room: Room) {
  if (room.phase !== "tutorial") return false;
  const players = [...room.players.values()].filter((player) => player.connected);
  if (players.length === 0 || !players.every((player) => player.tutorialDone)) return false;
  return startCountdown(room);
}

function tickRoom(room: Room, dt: number) {
  if (room.phase === "countdown" && room.countdownEndsAt && Date.now() >= room.countdownEndsAt) {
    room.phase = "racing";
    room.raceStartedAt = Date.now();
  }
  if (room.phase !== "racing" || !room.raceStartedAt) return;

  const track = TRACKS[room.settings.trackId];
  const raceTime = (Date.now() - room.raceStartedAt) / 1000;
  const raceTimeLimit = raceLimitSeconds(track, room.settings.lapCount);
  const crashedBeforeContacts = new Map<string, boolean>();
  for (const car of room.cars.values()) {
    const player = room.players.get(car.playerId);
    const wasCrashed = car.crashed;
    const speedBeforeStep = car.speed;
    if (room.settings.resetEnabled && car.crashed && !car.dnf && !car.finished) {
      car.crashedAt ??= raceTime;
      car.resetAvailable = false;
      if (raceTime - car.crashedAt >= 2.5) {
        resetCarToTrack(car, track, raceTime);
      }
    }
    if (player && !player.connected && player.disconnectedAt && Date.now() - player.disconnectedAt > RACE_DNF_GRACE_MS) {
      car.dnf = true;
    }
    if (!car.finished && !car.crashed && !car.dnf && raceTime > raceTimeLimit) {
      car.dnf = true;
      car.velocityX *= 0.35;
      car.velocityZ *= 0.35;
      car.speed = Math.hypot(car.velocityX, car.velocityZ);
    }
    const input = player?.connected
      ? room.inputs.get(car.playerId) ?? emptyInput
      : { ...emptyInput, brake: 0.35 };
    stepCar(car, input, track, room.settings, dt, raceTime);
    if (!wasCrashed && car.crashed && !car.finished && !car.dnf) {
      addCrashEvent(room, "wall", car.x, car.z, clamp(speedBeforeStep / 28, 0.65, 1), [car.playerId], car.y);
    } else if (!wasCrashed && !car.crashed && !car.finished && !car.dnf && car.impact >= 0.95 && speedBeforeStep >= wallExplosionSpeedThreshold(car)) {
      addCrashEvent(room, "wall", car.x, car.z, clamp(speedBeforeStep / 38, 0.7, 1), [car.playerId], car.y);
    }
    crashedBeforeContacts.set(car.playerId, car.crashed);
    updateResetAvailability(car, raceTime);
  }
  resolveCarContacts([...room.cars.values()], room.settings);
  const newlyCrashed = [...room.cars.values()].filter((car) => car.crashed && !crashedBeforeContacts.get(car.playerId));
  if (newlyCrashed.length > 0) {
    addCrashEvent(
      room,
      "car",
      newlyCrashed.reduce((sum, car) => sum + car.x, 0) / newlyCrashed.length,
      newlyCrashed.reduce((sum, car) => sum + car.z, 0) / newlyCrashed.length,
      1,
      newlyCrashed.map((car) => car.playerId),
      newlyCrashed.reduce((sum, car) => sum + car.y, 0) / newlyCrashed.length
    );
  }
  if (room.settings.resetEnabled) {
    for (const car of room.cars.values()) {
      if (car.crashed && !car.crashedAt) car.crashedAt = raceTime;
    }
  }
  if (collectResults(room)) {
    broadcastRoom(room);
  }
  pruneCrashEvents(room);
}

function startCountdown(room: Room) {
  const players = [...room.players.values()].filter((player) => player.connected);
  if (players.length === 0) return false;
  const track = TRACKS[room.settings.trackId];
  room.phase = "countdown";
  room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
  room.raceStartedAt = undefined;
  room.lastFullStateBroadcastAt = 0;
  room.results = [];
  room.crashEvents = [];
  room.crashEventCooldowns.clear();
  room.cars.clear();
  room.inputs.clear();
  players.forEach((player, index) => {
    room.cars.set(player.id, createCar(player, track, index, room.settings.warmupStart));
  });
  return true;
}

function collectResults(room: Room) {
  const cars = [...room.cars.values()];
  const players = room.players;
  const known = new Set(room.results.map((result) => result.playerId));
  for (const car of cars) {
    if (known.has(car.playerId)) continue;
    const player = players.get(car.playerId);
    if (!player) continue;
    if (car.finished) {
      room.results.push({
        playerId: player.id,
        name: player.name,
        color: player.color,
        totalTime: car.finishTime,
        bestLapTime: car.bestLapTime,
        status: "finished"
      });
    } else if (car.crashed && !room.settings.resetEnabled) {
      room.results.push({
        playerId: player.id,
        name: player.name,
        color: player.color,
        status: "crashed"
      });
    } else if (car.dnf) {
      room.results.push({
        playerId: player.id,
        name: player.name,
        color: player.color,
        status: "dnf"
      });
    }
  }
  sortResults(room);
  if (cars.length > 0 && room.results.length === cars.length) {
    room.phase = "results";
    return true;
  }
  return false;
}

function sortResults(room: Room) {
  room.results.sort((a, b) => {
    const status = resultStatusRank(a) - resultStatusRank(b);
    if (status !== 0) return status;
    const time = (a.totalTime ?? Infinity) - (b.totalTime ?? Infinity);
    if (time !== 0) return time;
    const joinedAt = (room.players.get(a.playerId)?.joinedAt ?? 0) - (room.players.get(b.playerId)?.joinedAt ?? 0);
    if (joinedAt !== 0) return joinedAt;
    return a.name.localeCompare(b.name);
  });
}

function resultStatusRank(result: RaceResult) {
  if (result.status === "finished") return 0;
  if (result.status === "crashed") return 1;
  return 2;
}

function updateResetAvailability(car: CarState, raceTime: number) {
  if (car.finished || car.crashed || car.dnf) {
    car.resetAvailable = false;
    car.offTrackSince = undefined;
    return;
  }
  if (car.surface !== "grass") {
    car.resetAvailable = false;
    car.offTrackSince = undefined;
    return;
  }
  car.offTrackSince ??= raceTime;
  car.resetAvailable = raceTime - car.offTrackSince >= 5;
}

function raceLimitSeconds(track: (typeof TRACKS)[keyof typeof TRACKS], lapCount: number) {
  const measuredLap = trackMetrics(track).totalLength / 4.2;
  return Math.max(240, measuredLap * lapCount * 2 + 60);
}

function wallExplosionSpeedThreshold(car: CarState) {
  const vehicle = getVehicle(car.vehicleId);
  return Math.min(WALL_EXPLOSION_SPEED_THRESHOLD, kmhToInternalSpeed(vehicle.physics.wallExplosionSpeedKmh));
}

function roomState(room: Room): RoomState {
  return {
    roomCode: room.code,
    phase: room.phase,
    displayGroups: [...room.displayGroups.values()],
    players: [...room.players.values()],
    settings: room.settings,
    countdownEndsAt: room.countdownEndsAt,
    raceStartedAt: room.raceStartedAt,
    cars: [...room.cars.values()],
    crashEvents: activeCrashEvents(room),
    results: room.results
  };
}

function raceSnapshot(room: Room): RaceSnapshot {
  return {
    roomCode: room.code,
    phase: room.phase,
    countdownEndsAt: room.countdownEndsAt,
    raceStartedAt: room.raceStartedAt,
    cars: [...room.cars.values()],
    crashEvents: activeCrashEvents(room),
    results: room.phase === "results" ? room.results : undefined
  };
}

function activeCrashEvents(room: Room) {
  pruneCrashEvents(room);
  return room.crashEvents;
}

function nearbyAudioCarsForPlayer(room: Room, playerId: string): NearbyAudioCar[] {
  if (room.phase !== "racing") return [];
  const car = room.cars.get(playerId);
  if (!car || car.finished || car.crashed || car.dnf) return [];

  const forwardX = Math.sin(car.heading);
  const forwardZ = Math.cos(car.heading);
  const rightX = Math.sin(car.heading + Math.PI / 2);
  const rightZ = Math.cos(car.heading + Math.PI / 2);
  const candidates: Array<NearbyAudioCar & { sortScore: number }> = [];

  for (const other of room.cars.values()) {
    if (other.playerId === playerId || other.finished || other.crashed || other.dnf) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const horizontalDistance = Math.hypot(dx, dz);
    if (horizontalDistance <= 0.001) continue;
    const distance = Math.hypot(dx, dz, (other.y - car.y) * 1.5);
    if (distance > NEARBY_AUDIO_RADIUS) continue;

    const dirX = dx / horizontalDistance;
    const dirZ = dz / horizontalDistance;
    const relativeVelocityX = other.velocityX - car.velocityX;
    const relativeVelocityZ = other.velocityZ - car.velocityZ;
    const relativeSpeed = Math.hypot(relativeVelocityX, relativeVelocityZ);
    const closingSpeed = Math.max(0, -(relativeVelocityX * dirX + relativeVelocityZ * dirZ));
    candidates.push({
      playerId: other.playerId,
      vehicleId: other.vehicleId,
      distance: roundAudioValue(distance, 1),
      side: roundAudioValue(clamp(dirX * rightX + dirZ * rightZ, -1, 1), 2),
      ahead: roundAudioValue(clamp(dirX * forwardX + dirZ * forwardZ, -1, 1), 2),
      speed: roundAudioValue(other.speed, 1),
      throttle: roundAudioValue(other.throttle, 2),
      relativeSpeed: roundAudioValue(relativeSpeed, 1),
      closingSpeed: roundAudioValue(closingSpeed, 1),
      sortScore: distance - closingSpeed * 0.55
    });
  }

  return candidates
    .sort((a, b) => a.sortScore - b.sortScore)
    .slice(0, NEARBY_AUDIO_MAX_CARS)
    .map(({ sortScore: _sortScore, ...audioCar }) => audioCar);
}

function nearbyCrashEventsForPlayer(room: Room, playerId: string, events: CrashEvent[]) {
  const car = room.cars.get(playerId);
  if (!car) return [];
  return events
    .filter((event) => {
      if (event.playerIds.includes(playerId)) return false;
      return Math.hypot(event.x - car.x, event.z - car.z, ((event.y ?? car.y) - car.y) * 1.5) <= NEARBY_CRASH_AUDIO_RADIUS;
    })
    .slice(-3);
}

function roundAudioValue(value: number, decimals: number) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function addCrashEvent(room: Room, kind: CrashEvent["kind"], x: number, z: number, severity: number, playerIds: string[], y?: number) {
  const now = Date.now();
  const cooldownKeys = playerIds.map((playerId) => `${kind}:${playerId}`);
  if (cooldownKeys.every((key) => now - (room.crashEventCooldowns.get(key) ?? 0) < CRASH_EVENT_COOLDOWN_MS)) return;
  for (const key of cooldownKeys) room.crashEventCooldowns.set(key, now);
  room.crashEvents.push({
    id: id("boom"),
    kind,
    x,
    y,
    z,
    createdAt: now,
    severity: clamp(severity, 0.6, 1),
    playerIds
  });
  pruneCrashEvents(room, now);
}

function pruneCrashEvents(room: Room, now = Date.now()) {
  room.crashEvents = room.crashEvents.filter((event) => now - event.createdAt <= CRASH_EVENT_TTL_MS);
  for (const [key, at] of room.crashEventCooldowns) {
    if (now - at > CRASH_EVENT_COOLDOWN_MS * 2) room.crashEventCooldowns.delete(key);
  }
}

function broadcastRealtime(room: Room) {
  if (room.phase === "countdown" || room.phase === "racing") {
    broadcastRaceSnapshot(room);
    const now = Date.now();
    if (now - room.lastFullStateBroadcastAt >= 1000 / ACTIVE_FULL_STATE_HZ) {
      room.lastFullStateBroadcastAt = now;
      broadcastRoom(room);
    }
    return;
  }
  broadcastRoom(room);
}

function broadcastRaceSnapshot(room: Room) {
  const payload = JSON.stringify({ type: "race_snapshot", snapshot: raceSnapshot(room), serverNow: Date.now() } satisfies ServerMessage);
  for (const client of clients.values()) {
    if (client.roomCode === room.code && client.role === "display") {
      sendRaw(client, payload, true);
    }
  }
}

function broadcastRoom(room: Room) {
  const payload = JSON.stringify({ type: "room_state", state: roomState(room), serverNow: Date.now() } satisfies ServerMessage);
  for (const client of clients.values()) {
    if (client.roomCode === room.code) {
      sendRaw(client, payload);
    }
  }
}

function sendControllerFeedback(room: Room) {
  const now = Date.now();
  const raceTime = room.raceStartedAt ? (now - room.raceStartedAt) / 1000 : 0;
  const countdownMark = room.phase === "countdown" && room.countdownEndsAt
    ? clamp(Math.ceil((room.countdownEndsAt - now) / 1000), 1, 5)
    : undefined;
  const crashEvents = activeCrashEvents(room);
  for (const client of clients.values()) {
    if (client.roomCode !== room.code || client.role !== "controller" || !client.playerId) continue;
    if (room.controllerClients.get(client.playerId) !== client.id) continue;
    send(client, {
      type: "controller_feedback",
      car: room.cars.get(client.playerId),
      roomPhase: room.phase,
      raceTime,
      crashEvents: crashEvents.filter((event) => event.playerIds.includes(client.playerId!)),
      nearbyAudioCars: nearbyAudioCarsForPlayer(room, client.playerId),
      nearbyCrashEvents: nearbyCrashEventsForPlayer(room, client.playerId, crashEvents),
      countdownMark,
      serverNow: now
    });
  }
}

function markDisconnected(client: Client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;
  if (client.role === "display" && client.displayGroupId) {
    const group = room.displayGroups.get(client.displayGroupId);
    if (group) group.connected = hasConnectedDisplayForGroup(room.code, group.id);
    if (!hasConnectedDisplay(room)) {
      scheduleNoDisplayClose(room);
    }
  }
  if (client.role === "controller" && client.playerId) {
    const player = room.players.get(client.playerId);
    if (room.controllerClients.get(client.playerId) === client.id) {
      room.controllerClients.delete(client.playerId);
    }
    if (player && !hasConnectedControllerForPlayer(room.code, player.id)) {
      player.connected = false;
      player.disconnectedAt = Date.now();
    }
    setTimeout(() => {
      const stillDisconnected = player && !hasConnectedControllerForPlayer(room.code, player.id) && !player.connected;
      if (stillDisconnected && room.phase === "lobby") {
        room.players.delete(player.id);
        room.inputs.delete(player.id);
        room.controllerClients.delete(player.id);
        assignVip(room);
        broadcastRoom(room);
        broadcastLiveStats();
      }
    }, DISCONNECT_GRACE_MS);
  }
  assignVip(room);
  maybeFinishTutorial(room);
  broadcastRoom(room);
  broadcastLiveStats();
}

function cleanRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hasClients = [...clients.values()].some((client) => client.roomCode === code);
    if (!hasClients && now - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}

function scheduleNoDisplayClose(room: Room) {
  room.noDisplaySince = Date.now();
  if (room.noDisplayCloseTimer) return;
  room.noDisplayCloseTimer = setTimeout(() => {
    if (!rooms.has(room.code) || hasConnectedDisplay(room)) {
      room.noDisplayCloseTimer = undefined;
      return;
    }
    closeRoom(room, "Host display disconnected. Room closed.");
  }, NO_DISPLAY_GRACE_MS);
}

function closeRoom(room: Room, message: string) {
  if (room.noDisplayCloseTimer) {
    clearTimeout(room.noDisplayCloseTimer);
    room.noDisplayCloseTimer = undefined;
  }
  for (const client of clients.values()) {
    if (client.roomCode !== room.code) continue;
    send(client, { type: "room_closed", message });
    client.role = "unknown";
    client.roomCode = undefined;
    client.displayGroupId = undefined;
    client.playerId = undefined;
  }
  rooms.delete(room.code);
  broadcastLiveStats();
}

function liveStats(): LiveStats {
  return {
    activePlayers: [...rooms.values()].reduce((sum, room) => {
      const connectedPlayers = [...room.players.values()].filter((player) => hasConnectedControllerForPlayer(room.code, player.id));
      return sum + connectedPlayers.length;
    }, 0)
  };
}

function sendLiveStats(client: Client) {
  send(client, { type: "live_stats", stats: liveStats() });
}

function broadcastLiveStats() {
  const payload = JSON.stringify({ type: "live_stats", stats: liveStats() } satisfies ServerMessage);
  for (const client of clients.values()) {
    sendRaw(client, payload);
  }
}

function hasConnectedDisplay(room: Room) {
  return [...clients.values()].some((client) => client.roomCode === room.code && client.role === "display");
}

function hasConnectedDisplayForGroup(roomCode: string, displayGroupId: string) {
  return [...clients.values()].some((client) => client.roomCode === roomCode && client.role === "display" && client.displayGroupId === displayGroupId);
}

function hasConnectedControllerForPlayer(roomCode: string, playerId: string) {
  const room = rooms.get(roomCode);
  const activeClientId = room?.controllerClients.get(playerId);
  if (!activeClientId) return false;
  const activeClient = clients.get(activeClientId);
  return Boolean(activeClient && activeClient.roomCode === roomCode && activeClient.role === "controller" && activeClient.playerId === playerId);
}

function claimControllerConnection(room: Room, playerId: string, activeClient: Client) {
  const previousClientId = room.controllerClients.get(playerId);
  if (previousClientId && previousClientId !== activeClient.id) {
    const previousClient = clients.get(previousClientId);
    if (previousClient) send(previousClient, { type: "error_notice", message: "Controller resumed in another tab." });
  }
  room.controllerClients.set(playerId, activeClient.id);
}

function releasePreviousControllerSlot(client: Client, nextRoom: Room, nextPlayerId: string) {
  if (client.role !== "controller" || !client.roomCode || !client.playerId) return;
  if (client.roomCode === nextRoom.code && client.playerId === nextPlayerId) return;
  const previousRoom = rooms.get(client.roomCode);
  const previousPlayerId = client.playerId;
  if (previousRoom?.controllerClients.get(previousPlayerId) === client.id) {
    previousRoom.controllerClients.delete(previousPlayerId);
  }
  client.role = "unknown";
  client.roomCode = undefined;
  client.displayGroupId = undefined;
  client.playerId = undefined;
  const previousPlayer = previousRoom?.players.get(previousPlayerId);
  if (previousRoom && previousPlayer && !hasConnectedControllerForPlayer(previousRoom.code, previousPlayerId)) {
    previousPlayer.connected = false;
    previousPlayer.disconnectedAt = Date.now();
    assignVip(previousRoom);
    maybeFinishTutorial(previousRoom);
    broadcastRoom(previousRoom);
  }
}

function assignVip(room: Room) {
  let vip = [...room.players.values()].find((player) => player.isVIP && player.connected);
  if (!vip) {
    vip = [...room.players.values()].filter((player) => player.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0];
  }
  for (const player of room.players.values()) {
    player.isVIP = player.id === vip?.id;
  }
}

function getVipId(room: Room) {
  return [...room.players.values()].find((player) => player.isVIP)?.id;
}

function getClientPlayer(client: Client, room: Room) {
  if (!client.playerId) return undefined;
  if (room.controllerClients.get(client.playerId) !== client.id) return undefined;
  return room.players.get(client.playerId);
}

function isVip(client: Client, room: Room) {
  const player = getClientPlayer(client, room);
  return Boolean(player?.isVIP);
}

function getRoom(code: string, client: Client) {
  const room = rooms.get(code.trim().toUpperCase());
  if (!room) {
    send(client, { type: "error_notice", message: "Room not found." });
  }
  return room;
}

function findPlayerByToken(room: Room, token?: string) {
  if (!token) return undefined;
  return [...room.players.values()].find((player) => player.token === token);
}

function send(client: Client, message: ServerMessage) {
  sendRaw(client, JSON.stringify(message));
}

function sendRaw(client: Client, payload: string, dropIfBackedUp = false) {
  if (client.ws.readyState === client.ws.OPEN) {
    if (dropIfBackedUp && client.ws.bufferedAmount > 64_000) return;
    client.ws.send(payload);
  }
}

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanName(name: string) {
  const trimmed = name.trim().slice(0, 18);
  return trimmed || "Guest Driver";
}

function cleanColor(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#ff3b5c";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const emptyInput: InputFrame = {
  seq: 0,
  steer: 0,
  throttle: 0,
  brake: 0
};

const defaultColors = ["#ff3b5c", "#16c784", "#35a7ff", "#ffd166", "#c77dff", "#ff8f3d", "#5eead4", "#f472b6"];
