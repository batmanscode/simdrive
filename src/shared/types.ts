export type Phase = "lobby" | "countdown" | "racing" | "results";

export type TrackId = "sakura" | "alpine";

export type SurfaceType = "road" | "curb" | "grass" | "wall";

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
  rollingStart: boolean;
  ghostMode: boolean;
  rain: boolean;
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
  isReady: boolean;
  isVIP: boolean;
  connected: boolean;
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
  x: number;
  z: number;
  heading: number;
  speed: number;
  steer: number;
  throttle: number;
  brake: number;
  lap: number;
  progress: number;
  distanceThisLap: number;
  surface: SurfaceType;
  finished: boolean;
  crashed: boolean;
  finishTime?: number;
  impact: number;
  slip: number;
};

export type RaceResult = {
  playerId: string;
  name: string;
  color: string;
  totalTime?: number;
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

export type ClientMessage =
  | { type: "create_room" }
  | { type: "join_display"; roomCode: string; displayGroupId?: string }
  | { type: "set_profile"; roomCode: string; displayGroupId: string; token?: string; name: string; color: string }
  | { type: "set_ready"; ready: boolean }
  | { type: "input_frame"; input: InputFrame }
  | { type: "vip_set_settings"; settings: Partial<RaceSettings> }
  | { type: "vip_start_race" }
  | { type: "vip_return_lobby" }
  | { type: "display_return_lobby" }
  | { type: "ping"; at: number };

export type ServerMessage =
  | { type: "hello"; clientId: string }
  | { type: "joined_display"; roomCode: string; displayGroupId: string }
  | { type: "joined_controller"; roomCode: string; playerId: string; token: string; displayGroupId: string }
  | { type: "room_state"; state: RoomState }
  | { type: "controller_feedback"; car?: CarState; roomPhase: Phase; raceTime: number }
  | { type: "room_closed"; message: string }
  | { type: "error_notice"; message: string }
  | { type: "pong"; at: number };
