export type Phase = "lobby" | "countdown" | "racing" | "results";

export type TrackId = "sakura" | "alpine";

export type SurfaceType = "road" | "curb" | "grass" | "wall";

export type CarSetupId = "balanced" | "highGrip" | "highSpeed";

export type CockpitStyle = "none" | "hands" | "paws";

export type Vec2 = {
  x: number;
  z: number;
};

export type TrackDef = {
  id: TrackId;
  name: string;
  description: string;
  targetLap: string;
  width: number;
  curbWidth: number;
  wallMargin: number;
  points: Vec2[];
};

export type RaceSettings = {
  trackId: TrackId;
  lapCount: number;
  warmupStart: boolean;
  ghostMode: boolean;
  rain: boolean;
  stabilityAssist: boolean;
  resetEnabled: boolean;
};

export type DisplayGroup = {
  id: string;
  label: string;
  connected: boolean;
};

export type Player = {
  id: string;
  token: string;
  displayGroupId: string;
  name: string;
  color: string;
  carSetupId: CarSetupId;
  cockpitStyle: CockpitStyle;
  isReady: boolean;
  isVIP: boolean;
  connected: boolean;
  disconnectedAt?: number;
  joinedAt: number;
};

export type InputFrame = {
  seq: number;
  steer: number;
  throttle: number;
  brake: number;
};

export type CarState = {
  playerId: string;
  carSetupId: CarSetupId;
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
  heading: number;
  speed: number;
  steer: number;
  throttle: number;
  brake: number;
  lap: number;
  progress: number;
  distanceThisLap: number;
  nextCheckpoint: number;
  lastValidProgress: number;
  timedLapStarted: boolean;
  timedRaceStartedAt: number;
  currentLapStartedAt: number;
  lastLapTime?: number;
  bestLapTime?: number;
  wheelDistance: number;
  surface: SurfaceType;
  finished: boolean;
  crashed: boolean;
  crashedAt?: number;
  dnf: boolean;
  finishTime?: number;
  resetAvailable: boolean;
  offTrackSince?: number;
  resetInvulnerableUntil?: number;
  impact: number;
  slip: number;
};

export type RaceResult = {
  playerId: string;
  name: string;
  color: string;
  totalTime?: number;
  bestLapTime?: number;
  status: "finished" | "crashed" | "dnf";
};

export type RoomState = {
  roomCode: string;
  phase: Phase;
  displayGroups: DisplayGroup[];
  players: Player[];
  settings: RaceSettings;
  countdownEndsAt?: number;
  raceStartedAt?: number;
  cars: CarState[];
  results: RaceResult[];
};

export type RaceSnapshot = {
  roomCode: string;
  phase: Phase;
  countdownEndsAt?: number;
  raceStartedAt?: number;
  cars: CarState[];
  results?: RaceResult[];
};

export type ClientMessage =
  | { type: "create_room" }
  | { type: "join_display"; roomCode: string; displayGroupId?: string }
  | { type: "set_profile"; roomCode: string; displayGroupId: string; token?: string; name: string; color: string }
  | { type: "set_car_setup"; carSetupId: CarSetupId }
  | { type: "set_cockpit_style"; cockpitStyle: CockpitStyle }
  | { type: "set_ready"; ready: boolean }
  | { type: "input_frame"; input: InputFrame }
  | { type: "request_reset" }
  | { type: "vip_set_settings"; settings: Partial<RaceSettings> }
  | { type: "vip_start_race" }
  | { type: "vip_return_lobby" }
  | { type: "display_return_lobby" }
  | { type: "close_room" }
  | { type: "ping"; at: number };

export type ServerMessage =
  | { type: "hello"; clientId: string }
  | { type: "joined_display"; roomCode: string; displayGroupId: string }
  | { type: "joined_controller"; roomCode: string; playerId: string; token: string; displayGroupId: string }
  | { type: "room_state"; state: RoomState }
  | { type: "race_snapshot"; snapshot: RaceSnapshot }
  | { type: "controller_feedback"; car?: CarState; roomPhase: Phase; raceTime: number }
  | { type: "room_closed"; message: string }
  | { type: "error_notice"; message: string }
  | { type: "pong"; at: number };
