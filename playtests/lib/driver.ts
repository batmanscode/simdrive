import WebSocket from "ws";
import { nearestTrackPoint, sampleTrack, TRACKS, trackMetrics } from "../../src/shared/tracks.js";
import type { CarSetupId, CarState, ClientMessage, CockpitStyle, RaceResult, RaceSettings, ServerMessage, TrackDef, TrackId } from "../../src/shared/types.js";

type Input = {
  steer: number;
  throttle: number;
  brake: number;
};

export type DriverSnapshot = {
  roomCode: string;
  phase: string;
  raceTime: number;
  trackId: TrackId;
  totalLength: number;
  latestCar?: Pick<CarState, "finished" | "crashed" | "dnf" | "lap" | "progress" | "speed" | "surface" | "bestLapTime" | "finishTime"> & {
    centerDistance: number;
  };
  maxDistance: number;
  maxSpeed: number;
  maxProgress: number;
  progressMarks: number[];
  surfaces: Partial<Record<CarState["surface"], number>>;
  results: RaceResult[];
  errorNotices: string[];
};

type RaceDriverOptions = {
  serverUrl: string;
  roomCode: string;
  displayGroupId: string;
  trackId: TrackId;
  name?: string;
  color?: string;
  lapCount?: number;
  warmupStart?: boolean;
  ghostMode?: boolean;
  stabilityAssist?: boolean;
  resetEnabled?: boolean;
  rain?: boolean;
  carSetupId?: CarSetupId;
  cockpitStyle?: CockpitStyle;
  inputHz?: number;
  speedScale?: number;
};

export type DisplayRoom = {
  ws: WebSocket;
  roomCode: string;
  displayGroupId: string;
  close: () => void;
};

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseTrackId(value: string | undefined): TrackId {
  if (value && value in TRACKS) return value as TrackId;
  throw new Error(`Expected --track to be one of: ${Object.keys(TRACKS).join(", ")}`);
}

export function readArg(args: string[], name: string, fallback?: string) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

type NumberArgOptions = {
  integer?: boolean;
  min?: number;
  max?: number;
};

export function readNumberArg(args: string[], name: string, fallback: string, options: NumberArgOptions = {}) {
  const raw = readArg(args, name, fallback);
  const value = Number(raw);
  if (!raw || raw.trim() === "" || !Number.isFinite(value)) {
    throw new Error(`Expected ${name} to be ${numberArgDescription(options)}`);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new Error(`Expected ${name} to be ${numberArgDescription(options)}`);
  }
  if (options.min !== undefined && value < options.min) {
    throw new Error(`Expected ${name} to be ${numberArgDescription(options)}`);
  }
  if (options.max !== undefined && value > options.max) {
    throw new Error(`Expected ${name} to be ${numberArgDescription(options)}`);
  }
  return value;
}

export function readRepeatedArg(args: string[], name: string) {
  const values: string[] = [];
  args.forEach((arg, index) => {
    if (arg === name) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
      values.push(value);
    }
  });
  return values;
}

export function hasFlag(args: string[], name: string) {
  return args.includes(name);
}

export function wsUrlFor(serverUrl: string) {
  const url = new URL(serverUrl);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.pathname === "/" || url.pathname === "") url.pathname = "/ws";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function createDisplayRoom(serverUrl: string): Promise<DisplayRoom> {
  const ws = await connectWs(serverUrl);
  const joined = waitForMessage(ws, (message): message is Extract<ServerMessage, { type: "joined_display" }> => message.type === "joined_display");
  ws.send(JSON.stringify({ type: "create_room" } satisfies ClientMessage));
  const message = await joined;
  return {
    ws,
    roomCode: message.roomCode,
    displayGroupId: message.displayGroupId,
    close: () => ws.close()
  };
}

export async function connectWs(serverUrl: string) {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(wsUrlFor(serverUrl));
    const timeout = setTimeout(() => {
      cleanup();
      ws.close();
      reject(new Error(`Timed out connecting to ${wsUrlFor(serverUrl)}`));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("open", onOpen);
      ws.off("error", onError);
    };
    const onOpen = () => {
      cleanup();
      resolve(ws);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    ws.on("open", onOpen);
    ws.on("error", onError);
  });
}

export function waitForMessage<T extends ServerMessage>(ws: WebSocket, predicate: (message: ServerMessage) => message is T, timeoutMs?: number): Promise<T>;
export function waitForMessage(ws: WebSocket, predicate: (message: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
export function waitForMessage(ws: WebSocket, predicate: (message: ServerMessage) => boolean, timeoutMs = 10_000) {
  return new Promise<ServerMessage>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);
    const onMessage = (raw: WebSocket.RawData) => {
      const message = parseMessage(raw);
      if (!message || !predicate(message)) return;
      clearTimeout(timeout);
      ws.off("message", onMessage);
      resolve(message);
    };
    ws.on("message", onMessage);
  });
}

export class RaceDriver {
  readonly serverUrl: string;
  readonly roomCode: string;
  readonly displayGroupId: string;
  readonly trackId: TrackId;
  readonly track: TrackDef;
  readonly totalLength: number;
  readonly options: Required<Omit<RaceDriverOptions, "serverUrl" | "roomCode" | "displayGroupId" | "trackId">>;

  private ws?: WebSocket;
  private inputTimer?: ReturnType<typeof setInterval>;
  private seq = 0;
  private holding = false;

  latestCar?: CarState;
  phase = "lobby";
  raceTime = 0;
  maxDistance = 0;
  maxSpeed = 0;
  maxProgress = 0;
  progressMarks = new Set<number>();
  surfaces: Partial<Record<CarState["surface"], number>> = {};
  results: RaceResult[] = [];
  errorNotices: string[] = [];

  constructor(options: RaceDriverOptions) {
    this.serverUrl = options.serverUrl;
    this.roomCode = options.roomCode;
    this.displayGroupId = options.displayGroupId;
    this.trackId = options.trackId;
    this.track = TRACKS[options.trackId];
    this.totalLength = trackMetrics(this.track).totalLength;
    this.options = {
      name: options.name ?? `${this.track.name} Automation`,
      color: options.color ?? "#ff8f3d",
      lapCount: options.lapCount ?? 1,
      warmupStart: options.warmupStart ?? false,
      ghostMode: options.ghostMode ?? true,
      stabilityAssist: options.stabilityAssist ?? true,
      resetEnabled: options.resetEnabled ?? true,
      rain: options.rain ?? false,
      carSetupId: options.carSetupId ?? "highGrip",
      cockpitStyle: options.cockpitStyle ?? "hands",
      inputHz: options.inputHz ?? 30,
      speedScale: options.speedScale ?? 1
    };
  }

  async start() {
    this.ws = await connectWs(this.serverUrl);
    this.ws.on("message", (raw) => this.handleMessage(raw));
    const joined = waitForMessage(this.ws, (message) => message.type === "joined_controller");
    this.send({
      type: "set_profile",
      roomCode: this.roomCode,
      displayGroupId: this.displayGroupId,
      name: this.options.name,
      color: this.options.color
    });
    await joined;
    await sleep(250);
    this.send({ type: "set_cockpit_style", cockpitStyle: this.options.cockpitStyle });
    this.send({ type: "set_car_setup", carSetupId: this.options.carSetupId });
    this.send({
      type: "vip_set_settings",
      settings: {
        trackId: this.trackId,
        lapCount: this.options.lapCount,
        warmupStart: this.options.warmupStart,
        resetEnabled: this.options.resetEnabled,
        ghostMode: this.options.ghostMode,
        stabilityAssist: this.options.stabilityAssist,
        rain: this.options.rain
      } satisfies Partial<RaceSettings>
    });
    await sleep(250);
    this.send({ type: "vip_start_race" });
    this.inputTimer = setInterval(() => this.sendInput(), 1000 / this.options.inputHz);
  }

  setHolding(holding: boolean) {
    this.holding = holding;
  }

  async waitForProgress(targetFraction: number, timeoutMs = 120_000) {
    if (!Number.isFinite(targetFraction) || targetFraction <= 0) {
      throw new Error(`Expected target progress to be a positive number, got ${targetFraction}`);
    }
    const targetProgress = targetFraction <= 1 ? targetFraction * this.totalLength : targetFraction;
    if (targetProgress > this.totalLength) {
      throw new Error(`Target progress ${targetProgress.toFixed(2)} exceeds ${this.trackId} track length ${this.totalLength.toFixed(2)}`);
    }
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.latestCar && this.latestCar.progress >= targetProgress) return this.snapshot();
      if (this.latestCar?.crashed || this.latestCar?.dnf) {
        throw new Error(`${this.trackId} ${this.latestCar.crashed ? "crashed" : "DNF"} before reaching progress ${targetProgress.toFixed(2)}; latest progress ${this.latestCar.progress.toFixed(2)}`);
      }
      if (this.phase === "results") {
        throw new Error(`${this.trackId} ended before reaching progress ${targetProgress.toFixed(2)}; latest progress ${(this.latestCar?.progress ?? this.maxProgress).toFixed(2)}`);
      }
      await sleep(80);
    }
    throw new Error(`Timed out before reaching progress ${targetProgress.toFixed(2)} on ${this.trackId}`);
  }

  async waitForResults(timeoutMs = 120_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (this.phase === "results") return this.snapshot();
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${this.trackId} results`);
  }

  snapshot(): DriverSnapshot {
    const latestDistance = this.latestCar
      ? nearestTrackPoint(this.track, { x: this.latestCar.x, y: this.latestCar.y, z: this.latestCar.z }).distance
      : 0;
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      raceTime: Number(this.raceTime.toFixed(3)),
      trackId: this.trackId,
      totalLength: Number(this.totalLength.toFixed(2)),
      latestCar: this.latestCar
        ? {
            finished: this.latestCar.finished,
            crashed: this.latestCar.crashed,
            dnf: this.latestCar.dnf,
            lap: this.latestCar.lap,
            progress: Number(this.latestCar.progress.toFixed(2)),
            speed: Number(this.latestCar.speed.toFixed(2)),
            surface: this.latestCar.surface,
            bestLapTime: roundOptional(this.latestCar.bestLapTime),
            finishTime: roundOptional(this.latestCar.finishTime),
            centerDistance: Number(latestDistance.toFixed(2))
          }
        : undefined,
      maxDistance: Number(this.maxDistance.toFixed(2)),
      maxSpeed: Number(this.maxSpeed.toFixed(2)),
      maxProgress: Number(this.maxProgress.toFixed(2)),
      progressMarks: [...this.progressMarks].sort((a, b) => a - b),
      surfaces: this.surfaces,
      results: this.results,
      errorNotices: this.errorNotices
    };
  }

  close() {
    if (this.inputTimer) clearInterval(this.inputTimer);
    this.ws?.close();
  }

  private handleMessage(raw: WebSocket.RawData) {
    const message = parseMessage(raw);
    if (!message) return;
    if (message.type === "controller_feedback") {
      this.phase = message.roomPhase;
      this.raceTime = message.raceTime;
      if (message.car) this.recordCar(message.car);
    }
    if (message.type === "room_state") {
      this.phase = message.state.phase;
      this.results = message.state.results;
      const car = message.state.cars[0];
      if (car) this.recordCar(car);
    }
    if (message.type === "error_notice") {
      this.errorNotices.push(message.message);
    }
  }

  private recordCar(car: CarState) {
    this.latestCar = car;
    const nearest = nearestTrackPoint(this.track, { x: car.x, y: car.y, z: car.z });
    this.maxDistance = Math.max(this.maxDistance, nearest.distance);
    this.maxSpeed = Math.max(this.maxSpeed, car.speed);
    this.maxProgress = Math.max(this.maxProgress, car.progress);
    this.surfaces[car.surface] = (this.surfaces[car.surface] ?? 0) + 1;
    const fraction = car.progress / this.totalLength;
    for (let mark = 10; mark <= 90; mark += 10) {
      if (fraction >= mark / 100) this.progressMarks.add(mark);
    }
  }

  private sendInput() {
    if (!this.latestCar || this.phase !== "racing" || this.latestCar.finished || this.latestCar.crashed || this.latestCar.dnf) return;
    const input = this.holding ? { steer: 0, throttle: 0, brake: 1 } : driverInput(this.track, this.latestCar, this.options.speedScale);
    this.send({ type: "input_frame", input: { seq: this.seq += 1, ...input } });
  }

  private send(message: ClientMessage) {
    this.ws?.send(JSON.stringify(message));
  }
}

function driverInput(track: TrackDef, car: CarState, speedScale = 1): Input {
  const nearest = nearestTrackPoint(track, { x: car.x, y: car.y, z: car.z });
  const speed = car.speed;
  const lookahead = clamp(10 + speed * 0.68, 9, 25);
  const target = sampleTrack(track, car.progress + lookahead);
  const near = sampleTrack(track, car.progress + lookahead + 16);
  const future = sampleTrack(track, car.progress + lookahead + 34);
  const far = sampleTrack(track, car.progress + lookahead + 56);
  const rightX = Math.sin(nearest.heading + Math.PI / 2);
  const rightZ = Math.cos(nearest.heading + Math.PI / 2);
  const lateral = (car.x - nearest.x) * rightX + (car.z - nearest.z) * rightZ;
  const headingError = angleDelta(car.heading, target.heading);
  const curve = Math.max(
    Math.abs(angleDelta(target.heading, near.heading)),
    Math.abs(angleDelta(target.heading, future.heading)) * 0.9,
    Math.abs(angleDelta(target.heading, far.heading)) * 0.65
  );
  const baseDesiredSpeed = curve > 1.08 ? 4.6 : curve > 0.82 ? 5.8 : curve > 0.58 ? 7.2 : curve > 0.36 ? 9.2 : curve > 0.22 ? 11.5 : 14.5;
  const desiredSpeed = clamp(baseDesiredSpeed * speedScale, 3.8, 28);
  const brake = speed > desiredSpeed + 0.55 ? clamp((speed - desiredSpeed) / 5.4, 0, 0.95) : 0;
  return {
    steer: clamp(headingError * 2.75 - lateral * 0.14, -1, 1),
    throttle: brake > 0.08 ? 0.02 : speed < desiredSpeed ? 0.58 : 0.08,
    brake
  };
}

function parseMessage(raw: WebSocket.RawData): ServerMessage | undefined {
  try {
    return JSON.parse(String(raw)) as ServerMessage;
  } catch {
    return undefined;
  }
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function numberArgDescription(options: NumberArgOptions) {
  const base = options.integer ? "an integer" : "a number";
  if (options.min !== undefined && options.max !== undefined) return `${base} between ${options.min} and ${options.max}`;
  if (options.min !== undefined) return `${base} >= ${options.min}`;
  if (options.max !== undefined) return `${base} <= ${options.max}`;
  return base;
}

function roundOptional(value: number | undefined) {
  return value === undefined ? undefined : Number(value.toFixed(3));
}
