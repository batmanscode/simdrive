import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { createCar, resolveCarContacts, stepCar } from "../src/shared/physics.js";
import { TRACKS, trackMetrics } from "../src/shared/tracks.js";
import type { CarState, ClientMessage, DisplayGroup, InputFrame, Player, RaceResult, RaceSettings, RoomState, RaceSnapshot, ServerMessage } from "../src/shared/types.js";

const PORT = Number(process.env.PORT ?? 8787);
const TICK_HZ = 60;
const SNAPSHOT_HZ = 20;
const ACTIVE_FULL_STATE_HZ = 2;
const COUNTDOWN_MS = 3200;
const DISCONNECT_GRACE_MS = 12_000;
const NO_DISPLAY_GRACE_MS = 20_000;
const RACE_DNF_GRACE_MS = DISCONNECT_GRACE_MS;

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
  settings: RaceSettings;
  lastFullStateBroadcastAt: number;
  countdownEndsAt?: number;
  raceStartedAt?: number;
  noDisplaySince?: number;
  noDisplayCloseTimer?: NodeJS.Timeout;
  results: RaceResult[];
};

const rooms = new Map<string, Room>();
const clients = new Map<string, Client>();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const distPath = path.resolve(process.cwd(), "dist");

app.use(express.static(distPath));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

wss.on("connection", (ws) => {
  const client: Client = { id: id("c"), ws, role: "unknown" };
  clients.set(client.id, client);
  send(client, { type: "hello", clientId: client.id });

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
  const dt = 1 / TICK_HZ;
  for (const room of rooms.values()) {
    tickRoom(room, dt);
  }
}, 1000 / TICK_HZ);

setInterval(() => {
  for (const room of rooms.values()) {
    broadcastRealtime(room);
    sendControllerFeedback(room);
  }
}, 1000 / SNAPSHOT_HZ);

setInterval(cleanRooms, 5_000);

server.listen(PORT, () => {
  console.log(`Drive Sim server listening on http://localhost:${PORT}`);
});

function handleMessage(client: Client, message: ClientMessage) {
  if (message.type === "ping") {
    send(client, { type: "pong", at: message.at });
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
    const player = existing ?? createPlayer(room, resolvedGroupId);
    player.name = cleanName(message.name);
    player.color = cleanColor(message.color);
    player.connected = true;
    player.disconnectedAt = undefined;
    player.isVIP = room.players.size === 1 || player.id === getVipId(room);
    if (!getVipId(room)) player.isVIP = true;
    client.role = "controller";
    client.roomCode = room.code;
    client.displayGroupId = player.displayGroupId;
    client.playerId = player.id;
    assignVip(room);
    send(client, { type: "joined_controller", roomCode: room.code, playerId: player.id, token: player.token, displayGroupId: player.displayGroupId });
    broadcastRoom(room);
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
    if (!isVip(client, room)) return;
    room.settings = {
      ...room.settings,
      ...message.settings,
      lapCount: clamp(Math.round(message.settings.lapCount ?? room.settings.lapCount), 1, 9),
      trackId: message.settings.trackId && TRACKS[message.settings.trackId] ? message.settings.trackId : room.settings.trackId,
      rollingStart: typeof message.settings.rollingStart === "boolean" ? message.settings.rollingStart : room.settings.rollingStart,
      ghostMode: typeof message.settings.ghostMode === "boolean" ? message.settings.ghostMode : room.settings.ghostMode,
      rain: typeof message.settings.rain === "boolean" ? message.settings.rain : room.settings.rain,
      stabilityAssist: typeof message.settings.stabilityAssist === "boolean" ? message.settings.stabilityAssist : room.settings.stabilityAssist
    };
    broadcastRoom(room);
    return;
  }

  if (message.type === "vip_start_race") {
    if (!isVip(client, room)) return;
    startCountdown(room);
    broadcastRoom(room);
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
  }
}

function returnToLobby(room: Room) {
    room.phase = "lobby";
    room.results = [];
    room.cars.clear();
    for (const player of room.players.values()) player.isReady = false;
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
    lastFullStateBroadcastAt: 0,
    settings: {
      trackId: "sakura",
      lapCount: 1,
      rollingStart: false,
      ghostMode: false,
      rain: false,
      stabilityAssist: true
    },
    results: []
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
  if (room.players.size >= 8) {
    throw new Error("Room is full");
  }
  const player: Player = {
    id: id("p"),
    token: id("t"),
    displayGroupId,
    name: `Driver ${room.players.size + 1}`,
    color: defaultColors[room.players.size % defaultColors.length],
    isReady: false,
    isVIP: false,
    connected: true,
    joinedAt: Date.now()
  };
  room.players.set(player.id, player);
  return player;
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
  for (const car of room.cars.values()) {
    const player = room.players.get(car.playerId);
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
  }
  resolveCarContacts([...room.cars.values()], room.settings);
  collectResults(room);
}

function startCountdown(room: Room) {
  const players = [...room.players.values()].filter((player) => player.connected);
  if (players.length === 0) return;
  const track = TRACKS[room.settings.trackId];
  room.phase = "countdown";
  room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
  room.raceStartedAt = undefined;
  room.results = [];
  room.cars.clear();
  room.inputs.clear();
  players.forEach((player, index) => {
    room.cars.set(player.id, createCar(player, track, index));
  });
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
    } else if (car.crashed) {
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
  if (cars.length > 0 && room.results.length === cars.length) {
    room.phase = "results";
  }
}

function raceLimitSeconds(track: (typeof TRACKS)[keyof typeof TRACKS], lapCount: number) {
  const measuredLap = trackMetrics(track).totalLength / 4.2;
  return Math.max(240, measuredLap * lapCount * 2 + 60);
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
    results: room.phase === "results" ? room.results : undefined
  };
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
  const snapshot = raceSnapshot(room);
  for (const client of clients.values()) {
    if (client.roomCode === room.code) {
      send(client, { type: "race_snapshot", snapshot });
    }
  }
}

function broadcastRoom(room: Room) {
  const state = roomState(room);
  for (const client of clients.values()) {
    if (client.roomCode === room.code) {
      send(client, { type: "room_state", state });
    }
  }
}

function sendControllerFeedback(room: Room) {
  const raceTime = room.raceStartedAt ? (Date.now() - room.raceStartedAt) / 1000 : 0;
  for (const client of clients.values()) {
    if (client.roomCode !== room.code || client.role !== "controller" || !client.playerId) continue;
    send(client, {
      type: "controller_feedback",
      car: room.cars.get(client.playerId),
      roomPhase: room.phase,
      raceTime
    });
  }
}

function markDisconnected(client: Client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;
  if (client.role === "display" && client.displayGroupId) {
    const group = room.displayGroups.get(client.displayGroupId);
    if (group) group.connected = false;
    if (!hasConnectedDisplay(room)) {
      scheduleNoDisplayClose(room);
    }
  }
  if (client.role === "controller" && client.playerId) {
    const player = room.players.get(client.playerId);
    if (player) {
      player.connected = false;
      player.disconnectedAt = Date.now();
    }
    setTimeout(() => {
      const stillDisconnected = player && !player.connected;
      if (stillDisconnected && room.phase === "lobby") {
        room.players.delete(player.id);
        room.inputs.delete(player.id);
        assignVip(room);
        broadcastRoom(room);
      }
    }, DISCONNECT_GRACE_MS);
  }
  assignVip(room);
  broadcastRoom(room);
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
}

function hasConnectedDisplay(room: Room) {
  return [...room.displayGroups.values()].some((group) => group.connected);
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
  if (client.ws.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify(message));
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
