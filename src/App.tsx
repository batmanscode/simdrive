import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Activity, ArrowLeft, ArrowRight, Flag, Gamepad2, Gauge, Info, Play, RotateCcw, Smartphone, Trophy, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { CAR_SETUPS, DEFAULT_CAR_SETUP_ID, type CarSetup } from "./shared/cars";
import { speedToKmh } from "./shared/physics";
import { nearestTrackPoint, sampleTrack, TRACKS, trackMetrics } from "./shared/tracks";
import type { CarSetupId, CarState, CockpitStyle, CrashEvent, InputFrame, LiveStats, Player, RaceSettings, RoomState, ServerMessage, TrackDef } from "./shared/types";

const COLORS = ["#ff3b5c", "#16c784", "#35a7ff", "#ffd166", "#c77dff", "#ff8f3d", "#5eead4", "#f472b6"];
const STEERING_SENSITIVITY_KEY = "sim-drive-steering-sensitivity-level";
const STEERING_SENSITIVITY_DEFAULT = 6;
const INVERT_MOTION_STEERING_KEY = "sim-drive-invert-motion-steering";
const HAPTIC_TEST_PATTERN = [120, 60, 180];
const CONTROLLER_SESSION_KEY = "sim-drive-controller-session";
const DISPLAY_THEME_KEY = "sim-drive-display-theme";
const MOTION_NEUTRAL_SAMPLE_MS = 320;
const MOTION_NEUTRAL_MAX_SAMPLE_MS = 900;
const MOTION_NEUTRAL_MIN_SAMPLES = 5;
const MOTION_NEUTRAL_MAX_SPREAD = 3.5;
const MOTION_STEERING_DEADZONE = 0.06;
const MOTION_CALIBRATION_MAX_AGE_MS = 5 * 60 * 1000;
const CRASH_EXPLOSION_VISUAL_MS = 1400;

type MotionCalibration = {
  frame: string;
  neutral: number;
  capturedAt: number;
};

let latestMotionCalibration: MotionCalibration | undefined;

type DisplayThemeMode = "system" | "light" | "dark";

export function App() {
  const isController = location.pathname.startsWith("/controller");
  return isController ? <ControllerApp /> : <DisplayApp />;
}

function DisplayApp() {
  const game = useGameSocket();
  const [joinCode, setJoinCode] = useState("");
  const [themeMode, setThemeMode] = useStoredDisplayTheme();
  const resolvedTheme = useResolvedDisplayTheme(themeMode);
  const themeClass = `display-theme theme-${resolvedTheme}`;
  const themeToggle = <ThemeToggle mode={themeMode} onChange={setThemeMode} />;
  const activePlayers = game.liveStats.activePlayers;

  if (!game.room) {
    return (
      <main className={`landing ${themeClass}`}>
        <section className="hero">
          <div className="hero-copy-wrap">
            <p className="eyebrow">Real sim-racing energy, no rig required.</p>
            <h1>Sim Drive</h1>
            <p className="hero-kicker">The closest thing to pro sim racing that runs in a browser and uses your phone as the wheel.</p>
            <p className="hero-copy">
              Tilt to steer. Touch to throttle &amp; brake.
              <br />
              Feel your car: engine roar, tire slip, curb rumble, and rain grip through sound + haptics.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => game.send({ type: "create_room" })}>
                <Play size={18} /> Create Game
              </button>
              <form
                className="join-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (joinCode.trim()) game.send({ type: "join_display", roomCode: joinCode.trim().toUpperCase() });
                }}
              >
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={4} />
                <button type="submit">Join Game</button>
              </form>
            </div>
            <small className="hero-note">No install needed. One-player practice works, and room races support up to 8 drivers.</small>
            {activePlayers > 0 && (
              <div className="hero-live-stat" aria-live="polite">
                <Users size={16} />
                <span>{activePlayers} driver{activePlayers === 1 ? "" : "s"} online now</span>
              </div>
            )}
            <div className="hero-flow" aria-label="How Sim Drive works">
              <div>
                <strong>Host screen</strong>
                <span>Host on TV, laptop, projector.</span>
              </div>
              <div>
                <strong>Phone controllers</strong>
                <span>Scan the QR. Each player gets tilt steering + touch pedals, and can even choose paw hands hehe.</span>
              </div>
              <div>
                <strong>Race options</strong>
                <span>Choose laps, track, rain, ghost cars, gentle assist, warm-up start, and reset rules.</span>
              </div>
            </div>
            <div className="hero-pills" aria-label="Game features">
              <span><Smartphone size={16} /> Phone steering</span>
              <span><Gauge size={16} /> Sim-like grip</span>
              <span><Gamepad2 size={16} /> Sound + haptics</span>
              <span><Users size={16} /> 1-8 drivers</span>
            </div>
          </div>
          <HeroShowcase />
        </section>
      </main>
    );
  }

  if (game.room.phase === "racing" || game.room.phase === "countdown") {
    return <RaceDisplay room={game.room} displayGroupId={game.displayGroupId} send={game.send} />;
  }

  if (game.room.phase === "results") {
    return <ResultsDisplay room={game.room} send={game.send} themeClass={themeClass} />;
  }

  return <LobbyDisplay room={game.room} displayGroupId={game.displayGroupId} send={game.send} themeClass={themeClass} themeToggle={themeToggle} />;
}

function ThemeToggle({ mode, onChange }: { mode: DisplayThemeMode; onChange: (mode: DisplayThemeMode) => void }) {
  return (
    <div className="theme-toggle" aria-label="Display theme">
      {(["system", "light", "dark"] as DisplayThemeMode[]).map((item) => (
        <button key={item} type="button" className={mode === item ? "active" : undefined} aria-pressed={mode === item} onClick={() => onChange(item)}>
          {item === "system" ? "System" : item === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}

function HeroShowcase() {
  return (
    <div className="hero-showcase" aria-hidden>
      <div className="mock-race">
        <div className="mock-sky" />
        <div className="mock-track">
          <span className="mock-line" />
          <i className="mock-curb left" />
          <i className="mock-curb right" />
        </div>
        <div className="mock-cockpit">
          <span />
          <strong>128</strong>
          <em>km/h</em>
        </div>
        <div className="mock-leaderboard">
          <span>1 YOU</span>
          <span>2 LOSER</span>
          <span>3 OTHER LOSER</span>
        </div>
        <div className="mock-minimap" />
      </div>
      <div className="mock-phone">
        <div className="mock-phone-top">
          <span>Lap 1/3</span>
          <strong>Motion steering</strong>
        </div>
        <div className="mock-tilt"><span /></div>
        <div className="mock-pedals">
          <span>Brake</span>
          <span>Throttle</span>
        </div>
      </div>
    </div>
  );
}

function LobbyDisplay({
  room,
  displayGroupId,
  send,
  themeClass,
  themeToggle
}: {
  room: RoomState;
  displayGroupId?: string;
  send: ReturnType<typeof useGameSocket>["send"];
  themeClass: string;
  themeToggle: ReactNode;
}) {
  const controllerUrl = makeControllerUrl(room.roomCode, displayGroupId);
  const track = TRACKS[room.settings.trackId];
  const readyCount = room.players.filter((player) => player.isReady || player.isVIP).length;

  return (
    <main className={`lobby ${themeClass}`}>
      {themeToggle}
      <section className="join-card">
        <div className="join-label">Join this race</div>
        <div className="qr-wrap">
          <QRCodeSVG value={controllerUrl} size={260} bgColor="#f5f1e8" fgColor="#101214" />
        </div>
        <div className="room-code">{room.roomCode}</div>
        <p>Scan with your phone. Tilt to steer, then try not to bin it.</p>
        <div className="join-card-stats">
          <span>{room.players.length}/8 drivers</span>
          <span>{readyCount} ready</span>
        </div>
      </section>

      <section className="lobby-main">
        <div className="topline">
          <div>
            <p className="eyebrow lobby-eyebrow">Race room</p>
            <h2>{track.name}</h2>
          </div>
          <div className="topline-actions">
            <button className="secondary danger" onClick={() => send({ type: "close_room" })}>Exit Room</button>
          </div>
        </div>

        <div className="track-preview">
          <MiniTrack track={track} />
          <div>
            <h3>{track.name}</h3>
            <p>{track.description}</p>
            {track.inspiration && <small className="track-inspiration">{track.inspiration}</small>}
            <small>Target lap: {track.targetLap}. Rain lowers grip and top speed. Reset off means crashes kick drivers out.</small>
          </div>
        </div>

        <div className="settings-strip" aria-label="Race settings">
          <SettingChip label="Laps" value={String(room.settings.lapCount)} />
          <SettingChip label="Rain" value={room.settings.rain ? "Wet grip" : "Off"} />
          <SettingChip label="Start" value={room.settings.warmupStart ? "Warm-up / Flying" : "Grid"} />
          <SettingChip label="Cars" value={room.settings.ghostMode ? "Ghost" : "Collide"} />
          <SettingChip label="Assist" value={room.settings.stabilityAssist ? "Gentle" : "Off"} />
          <SettingChip label="Reset" value={room.settings.resetEnabled ? "On" : "Crash-out"} />
        </div>

        <div className="grid-header">
          <div>
            <span>Driver lineup</span>
            <strong>{room.players.length ? `${room.players.length} driver${room.players.length === 1 ? "" : "s"}` : "Waiting for phones"}</strong>
          </div>
          <small>Each driver picks their own car setup on their phone.</small>
        </div>
        <PlayerGrid room={room} />
      </section>
    </main>
  );
}

function SettingChip({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PlayerGrid({ room }: { room: RoomState }) {
  return (
    <div className="players">
      {room.players.map((player, index) => (
        <div className="player" key={player.id}>
          <span className="grid-position">{index + 1}</span>
          <span className="swatch" style={{ background: player.color }} />
          <div>
            <strong>{player.name}</strong>
            <small>{player.isVIP ? "VIP" : player.isReady ? "Ready" : "Setting up"} · {CAR_SETUPS[player.carSetupId ?? DEFAULT_CAR_SETUP_ID].shortName} · {cockpitStyleLabel(player.cockpitStyle)} · {player.connected ? "online" : "reconnecting"}</small>
          </div>
        </div>
      ))}
      {room.players.length === 0 && <div className="empty">Waiting for the first phone controller.</div>}
    </div>
  );
}

function RaceDisplay({ room, displayGroupId, send }: { room: RoomState; displayGroupId?: string; send: ReturnType<typeof useGameSocket>["send"] }) {
  const localPlayers = room.players.filter((player) => player.displayGroupId === displayGroupId);
  const panes = (localPlayers.length ? localPlayers : room.players).slice(0, 4);
  const countdown = room.countdownEndsAt ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000)) : 0;
  const className = `race-grid panes-${Math.max(1, panes.length)}`;
  const paneCount = Math.max(1, panes.length);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") send({ type: "display_return_lobby" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [send]);

  return (
    <main className="race-screen">
      <button className="race-exit" onClick={() => send({ type: "display_return_lobby" })}>
        <RotateCcw size={18} /> Exit Race
      </button>
      <div className={className}>
        {panes.map((player) => (
          <div className="race-pane" key={player.id}>
            <RaceCanvas room={room} focusPlayerId={player.id} paneCount={paneCount} />
            {room.settings.rain && <div className="rain-visor" aria-hidden />}
            <RaceHud room={room} focusPlayerId={player.id} />
            <RaceMiniMap room={room} focusPlayerId={player.id} />
            <RaceLeaderboard room={room} focusPlayerId={player.id} />
          </div>
        ))}
      </div>
      {room.phase === "countdown" && <StartLights countdown={countdown} />}
      <RaceFinishBanner room={room} />
    </main>
  );
}

function StartLights({ countdown }: { countdown: number | string }) {
  const isGo = countdown === 0 || countdown === "GO";
  const lit = isGo ? 5 : typeof countdown === "number" ? clamp(6 - countdown, 0, 5) : 5;
  return (
    <div className="start-lights" aria-label="Race countdown">
      <div>
        {[0, 1, 2, 3, 4].map((index) => <span key={index} className={index < lit ? `lit${isGo ? " go" : ""}` : undefined} />)}
      </div>
      <strong>{countdown || "GO"}</strong>
    </div>
  );
}

function RaceFinishBanner({ room }: { room: RoomState }) {
  const winner = room.cars
    .filter((car) => car.finished && car.finishTime !== undefined)
    .sort((a, b) => (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity))[0];
  const player = winner ? room.players.find((item) => item.id === winner.playerId) : undefined;
  const [visibleFor, setVisibleFor] = useState<string>();

  useEffect(() => {
    if (!player) return;
    setVisibleFor(player.id);
    const timeout = window.setTimeout(() => setVisibleFor(undefined), 4200);
    return () => window.clearTimeout(timeout);
  }, [player?.id]);

  if (!player || visibleFor !== player.id || room.phase !== "racing") return null;

  return (
    <div className="finish-banner">
      <span className="swatch" style={{ background: player.color }} />
      <strong>{player.name} came first</strong>
    </div>
  );
}

function RaceHud({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const player = room.players.find((item) => item.id === focusPlayerId);
  const car = room.cars.find((item) => item.playerId === focusPlayerId);
  const speed = car ? Math.round(speedToKmh(car.speed)) : 0;
  const lapText = car && !car.timedLapStarted ? "Warm-up" : `Lap ${car?.lap ?? 1}/${room.settings.lapCount}`;
  return (
    <div className="race-hud">
      <div><span className="swatch" style={{ background: player?.color }} />{player?.name}</div>
      <div>{lapText}</div>
      <div>{speed} km/h</div>
    </div>
  );
}

function RaceMiniMap({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const track = TRACKS[room.settings.trackId];
  const { bounds, points } = useMemo(() => {
    const bounds = getTrackBounds(track);
    const points = sampleTrackVisuals(track, 4)
      .map((point) => `${projectMiniX(point.x, bounds)},${projectMiniY(point.z, bounds)}`)
      .join(" ");
    return { bounds, points };
  }, [track]);
  return (
    <svg className="race-minimap" viewBox="0 0 210 150" aria-label="Race minimap">
      <polyline points={points} fill="none" stroke="rgba(255,250,240,0.28)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="#f1eadc" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {room.cars.map((car) => {
        const player = room.players.find((item) => item.id === car.playerId);
        return (
          <circle
            key={car.playerId}
            cx={projectMiniX(car.x, bounds)}
            cy={projectMiniY(car.z, bounds)}
            r={car.playerId === focusPlayerId ? 5.5 : 4}
            fill={player?.color ?? "#ff3b5c"}
            stroke={car.playerId === focusPlayerId ? "#fffaf0" : "rgba(16,18,20,0.8)"}
            strokeWidth={car.playerId === focusPlayerId ? 2.5 : 1.5}
          />
        );
      })}
    </svg>
  );
}

function RaceLeaderboard({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const track = TRACKS[room.settings.trackId];
  const totalLength = trackMetrics(track).totalLength;
  const rows = room.players
    .map((player) => {
      const car = room.cars.find((item) => item.playerId === player.id);
      const distance = car ? (car.timedLapStarted ? (Math.min(car.lap, room.settings.lapCount + 1) - 1) * totalLength + car.progress : car.progress - totalLength) : 0;
      return { player, car, distance };
    })
    .sort((a, b) => {
      const statusScore = (item: typeof a) => item.car?.finished ? 3 : item.car?.crashed ? 1 : item.car?.dnf ? 0 : 2;
      return statusScore(b) - statusScore(a) || b.distance - a.distance;
    });

  return (
    <ol className="race-leaderboard" aria-label="Race leaderboard">
      {rows.map(({ player, car }, index) => (
        <li key={player.id} className={player.id === focusPlayerId ? "focus" : undefined}>
          <span>{index + 1}</span>
          <i style={{ background: player.color }} />
          <strong>{player.name}</strong>
          <em>{raceStatusText(car, room.settings.lapCount)}</em>
        </li>
      ))}
    </ol>
  );
}

function ResultsDisplay({ room, send, themeClass }: { room: RoomState; send: ReturnType<typeof useGameSocket>["send"]; themeClass: string }) {
  const vip = room.players.find((player) => player.isVIP);
  const podium = room.results.slice(0, 3);
  return (
    <main className={`results ${themeClass}`}>
      <section>
        <h2><Trophy /> Results</h2>
        {podium.length > 0 && (
          <div className="podium">
            {podium.map((result, index) => (
              <div key={result.playerId} className={`podium-place place-${index + 1}`}>
                <span>{index + 1}</span>
                <i style={{ background: result.color }} />
                <strong>{result.name}</strong>
                <small>{result.totalTime ? `${result.totalTime.toFixed(2)}s` : result.status.toUpperCase()}</small>
              </div>
            ))}
          </div>
        )}
        <ol className="leaderboard">
          {room.results.map((result) => (
            <li key={result.playerId}>
              <span className="swatch" style={{ background: result.color }} />
              <strong>{result.name}</strong>
              <span>
                {result.totalTime ? `${result.totalTime.toFixed(2)}s total` : result.status.toUpperCase()}
                {result.bestLapTime ? ` · ${result.bestLapTime.toFixed(2)}s best` : ""}
              </span>
            </li>
          ))}
        </ol>
        <p>VIP: {vip?.name ?? "none"}. Return to lobby keeps the same room and drivers.</p>
        <button className="secondary" onClick={() => send({ type: "display_return_lobby" })}>
          <RotateCcw size={18} /> Return to Lobby
        </button>
      </section>
    </main>
  );
}

function ControllerApp() {
  const params = new URLSearchParams(location.search);
  const game = useGameSocket();
  const savedSession = useMemo(() => readControllerSession(), []);
  const browserNotice = useMemo(() => controllerBrowserRecommendation(), []);
  const initialRoomCode = params.get("room")?.toUpperCase() ?? savedSession?.roomCode ?? "";
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [displayGroupId, setDisplayGroupId] = useState(params.get("group") ?? (initialRoomCode === savedSession?.roomCode ? savedSession.displayGroupId : ""));
  const [name, setName] = useState(localStorage.getItem("sim-drive-name") ?? `Guest ${Math.floor(Math.random() * 90 + 10)}`);
  const [color, setColor] = useState(localStorage.getItem("sim-drive-color") ?? COLORS[Math.floor(Math.random() * COLORS.length)]);
  const [joinStatus, setJoinStatus] = useState("");
  const autoResumeAttemptedRef = useRef(false);
  const token = localStorage.getItem(controllerTokenKey(roomCode)) ?? (savedSession?.roomCode === roomCode ? savedSession.token : null);
  const player = game.room?.players.find((item) => item.id === game.playerId);

  useEffect(() => {
    if (game.joinedToken && roomCode) {
      writeControllerSession({ roomCode, displayGroupId: game.displayGroupId ?? displayGroupId, token: game.joinedToken });
      setJoinStatus(autoResumeAttemptedRef.current ? "Reconnected as your saved driver." : "Controller joined.");
    }
  }, [displayGroupId, game.displayGroupId, game.joinedToken, roomCode]);

  useEffect(() => {
    autoResumeAttemptedRef.current = false;
  }, [roomCode]);

  useEffect(() => {
    if (!game.isConnected) autoResumeAttemptedRef.current = false;
  }, [game.isConnected]);

  useEffect(() => {
    if (!roomCode || !token || game.playerId || autoResumeAttemptedRef.current) return;
    autoResumeAttemptedRef.current = true;
    setJoinStatus("Reconnecting to your saved driver...");
    game.send({ type: "set_profile", roomCode, displayGroupId, token, name, color });
  }, [color, displayGroupId, game.playerId, game.send, name, roomCode, token]);

  useEffect(() => {
    if (!game.notice) return;
    setJoinStatus(game.notice.message);
    if (game.notice.message === "Room not found." || game.notice.message.includes("Room closed")) {
      clearControllerSession(roomCode);
      autoResumeAttemptedRef.current = false;
    }
  }, [game.notice, roomCode]);

  if (!game.playerId) {
    return (
      <main className="phone setup">
        <h1>Sim Drive</h1>
        {joinStatus && <small className="phone-note">{joinStatus}</small>}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            localStorage.setItem("sim-drive-name", name);
            localStorage.setItem("sim-drive-color", color);
            setJoinStatus(token ? "Reconnecting to your saved driver..." : "Joining controller...");
            game.send({ type: "set_profile", roomCode, displayGroupId, token: token ?? undefined, name, color });
          }}
        >
          <label>
            Room
            <input
              value={roomCode}
              onChange={(event) => {
                setRoomCode(event.target.value.toUpperCase());
                setDisplayGroupId("");
                setJoinStatus("");
              }}
              maxLength={4}
              placeholder="CODE"
            />
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={18} />
          </label>
          <div className="color-row">
            {COLORS.map((item) => (
              <button key={item} type="button" className={item === color ? "color active" : "color"} style={{ background: item }} onClick={() => setColor(item)} />
            ))}
          </div>
          {token && <small className="phone-note">Saved driver found for this room. Refreshes and QR rescans reconnect automatically.</small>}
          <button className="primary" type="submit"><Smartphone size={18} /> {token ? "Reconnect Controller" : "Join Controller"}</button>
        </form>
        <BrowserRecommendationNotice notice={browserNotice} />
      </main>
    );
  }

  if (game.room?.phase === "racing" || game.room?.phase === "countdown") {
    return <RaceController send={game.send} feedback={game.feedback} crashEvents={game.controllerCrashEvents} room={game.room} playerId={game.playerId} />;
  }

  return <ControllerLobby room={game.room} player={player} send={game.send} feedback={game.feedback} joinStatus={joinStatus} browserNotice={browserNotice} />;
}

function ControllerLobby({ room, player, send, feedback, joinStatus, browserNotice }: { room?: RoomState; player?: Player; send: ReturnType<typeof useGameSocket>["send"]; feedback?: CarState; joinStatus?: string; browserNotice?: string }) {
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionStatus, setMotionStatus] = useState(motionLobbyStatus());
  const [motionLevel, setMotionLevel] = useState(0);
  const [audioEnabled, setAudioEnabled] = useStoredBoolean("sim-drive-audio-enabled", true);
  const [audioStatus, setAudioStatus] = useState(audioEnabled ? "Audio on" : "Audio off");
  const [hapticStatus, setHapticStatus] = useState(hapticSupportMessage());
  const [hapticsEnabled, setHapticsEnabled] = useStoredBoolean("sim-drive-haptics-enabled", true);
  const [brakeStart, setBrakeStart] = useStoredNumber("sim-drive-brake-start", 0);
  const [throttleStart, setThrottleStart] = useStoredNumber("sim-drive-throttle-start", 0);
  const [steeringLevel, setSteeringLevel] = useStoredRangeNumber(STEERING_SENSITIVITY_KEY, STEERING_SENSITIVITY_DEFAULT, 1, 10);
  const [invertMotionSteering, setInvertMotionSteering] = useStoredBoolean(INVERT_MOTION_STEERING_KEY, false);
  const [feelTest, setFeelTest] = useState({ id: 0, label: "Feel test" });
  const steeringSensitivity = steeringSensitivityFromLevel(steeringLevel);
  const motionSteeringDirection = invertMotionSteering ? -1 : 1;
  const settings = room?.settings;

  const prepareToDrive = async () => {
    if (audioEnabled) unlockControllerAudio();
    const motion = await enableControllerDevice();
    setMotionEnabled(motion.enabled);
    setMotionStatus(motion.message);
    return true;
  };

  useEffect(() => {
    const neutral = { current: undefined as number | undefined };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null && event.gamma === null) return;
      const angle = getScreenAngle();
      const raw = readSteeringTilt(event, angle);
      const calibration = readMotionCalibration(motionOrientationFrameKey(angle));
      neutral.current = calibration?.neutral ?? neutral.current ?? raw;
      setMotionLevel(steeringFromTilt(raw, neutral.current, steeringSensitivity, motionSteeringDirection));
      setMotionStatus("Motion live");
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [motionSteeringDirection, steeringSensitivity]);

  return (
    <main className="phone controller-lobby">
      <h1>{player?.isVIP ? "VIP Settings" : "Ready Room"}</h1>
      {joinStatus && <small className="phone-note">{joinStatus}</small>}
      <button
        className="secondary"
        onClick={() => {
          enableControllerDevice().then((result) => {
            setMotionEnabled(result.enabled);
            setMotionStatus(result.message);
          });
        }}
      >
        <Activity size={18} /> {motionEnabled ? "Motion Enabled" : "Enable Motion"}
      </button>
      <small className="phone-note">{motionStatus}</small>
      <div className="motion-test">
        <span>Motion test</span>
        <div className="tilt-meter"><span style={{ transform: `translateX(${motionLevel * 42}px)` }} /></div>
      </div>
      <Toggle
        label="Audio"
        value={audioEnabled}
        onChange={(value) => {
          setAudioEnabled(value);
          setAudioStatus(value ? "Audio on" : "Audio off");
          if (!value) silenceControllerAudio(sharedControllerAudio);
          if (value) {
            const audio = unlockControllerAudio();
            playCue(audio, "start");
          }
        }}
      />
      <button
        className="secondary"
        onClick={() => {
          if (!audioEnabled) {
            setAudioStatus("Audio off");
            return;
          }
          playCue(unlockControllerAudio(), "start");
          setAudioStatus("Audio on");
          setFeelTest((current) => ({ id: current.id + 1, label: "Audio pulse" }));
        }}
      >
        <Activity size={18} /> Test Audio
      </button>
      <small className="phone-note">{audioStatus}</small>
      <Toggle
        label="Haptics"
        value={hapticsEnabled && hapticsSupported()}
        onChange={(value) => {
          setHapticsEnabled(value);
          if (!value) stopHaptics();
          setHapticStatus(value ? hapticSupportMessage() : "Haptics off");
        }}
      />
      <button
        className="secondary"
        onClick={() => {
          const result = pulseHaptic(HAPTIC_TEST_PATTERN);
          setHapticStatus(hapticResultMessage(result));
          setFeelTest((current) => ({ id: current.id + 1, label: "Haptic pulse" }));
        }}
      >
        <Activity size={18} /> Test Haptics
      </button>
      <small className="phone-note">{hapticStatus}</small>
      <BrowserRecommendationNotice notice={browserNotice} />
      <FeelPreview test={feelTest} />
      <SteeringSensitivityPreference value={steeringLevel} onChange={setSteeringLevel} />
      <Toggle label="Invert motion steering" value={invertMotionSteering} onChange={setInvertMotionSteering} />
      <small className="phone-note">Use invert only if tilting right makes the motion test or car steer left on this phone.</small>
      <StartPreference
        label="Brake start"
        value={brakeStart}
        onChange={setBrakeStart}
        description="How much brake is applied the instant your thumb lands before you slide."
      />
      <StartPreference
        label="Throttle start"
        value={throttleStart}
        onChange={setThrottleStart}
        description="How much throttle is applied the instant your thumb lands before you slide."
      />
      {player && <CarSetupSelector value={player.carSetupId} color={player.color} send={send} />}
      {player && <CockpitStyleSelector value={player.cockpitStyle} send={send} />}
      {player?.isVIP && settings && (
        <div className="vip-controls">
          <TrackPicker settings={settings} send={send} />
          <Stepper label="Laps" value={settings.lapCount} min={1} max={9} onChange={(lapCount) => send({ type: "vip_set_settings", settings: { lapCount } })} />
          <Toggle label="Warm-up / flying start" value={settings.warmupStart} onChange={(warmupStart) => send({ type: "vip_set_settings", settings: { warmupStart } })} />
          <small className="phone-note">First pass is untimed. Your race starts when you cross the line at speed.</small>
          <Toggle label="Ghost cars" value={settings.ghostMode} onChange={(ghostMode) => send({ type: "vip_set_settings", settings: { ghostMode } })} />
          <small className="phone-note">Ghost cars disables car-to-car collisions. Walls and off-track still matter.</small>
          <Toggle label="Rain" value={settings.rain} onChange={(rain) => send({ type: "vip_set_settings", settings: { rain } })} />
          <small className="phone-note">Rain lowers grip and top speed, so braking and steering need more care.</small>
          <Toggle label="Gentle assist" value={settings.stabilityAssist} onChange={(stabilityAssist) => send({ type: "vip_set_settings", settings: { stabilityAssist } })} />
          <small className="phone-note">Gentle assist softly aligns the car toward the road direction so steering is more forgiving.</small>
          <Toggle label="Reset mode" value={settings.resetEnabled} onChange={(resetEnabled) => send({ type: "vip_set_settings", settings: { resetEnabled } })} />
          <small className="phone-note">Reset mode respawns crashes. Off-track reset appears after 5 seconds in the grass.</small>
          <button
            className="primary"
            onClick={async () => {
              if (!(await prepareToDrive())) return;
              send({ type: "vip_start_race" });
            }}
          >
            <Flag size={18} /> Start Race
          </button>
        </div>
      )}
      {!player?.isVIP && (
        <>
          <button
            className="primary ready-button"
            onClick={async () => {
              if (!(await prepareToDrive())) return;
              send({ type: "set_ready", ready: !player?.isReady });
            }}
          >
            {player?.isReady ? "I'm not ready" : "I'm ready"}
          </button>
          {player?.isReady && <small className="phone-note">Ready. Waiting for the VIP to start the race.</small>}
        </>
      )}
      <small className="phone-note">Use earphones for clearer engine, tire, curb, and impact feedback. Full directional audio is not implemented yet.</small>
      {feedback && <small>{Math.round(speedToKmh(feedback.speed))} km/h</small>}
    </main>
  );
}

function BrowserRecommendationNotice({ notice }: { notice?: string }) {
  if (!notice) return null;
  return (
    <div className="browser-notice" role="status">
      <Info size={18} aria-hidden />
      <div>
        <strong>Recommended browser</strong>
        <span>{notice}</span>
      </div>
    </div>
  );
}

function CockpitStyleSelector({ value, send }: { value: CockpitStyle; send: ReturnType<typeof useGameSocket>["send"] }) {
  return (
    <section className="cockpit-selector" aria-label="Cockpit style">
      <div className="car-selector-head">
        <div>
          <span>Cockpit style</span>
          <strong>{cockpitStyleLabel(value)}</strong>
        </div>
        <small>Personal</small>
      </div>
      <small className="phone-note">Changes only what you see in your cockpit. It does not affect speed or grip.</small>
      <div className="segmented phone-segmented">
        {(["none", "hands", "paws"] as CockpitStyle[]).map((style) => (
          <button key={style} className={value === style ? "active" : undefined} onClick={() => send({ type: "set_cockpit_style", cockpitStyle: style })}>
            {cockpitStyleLabel(style)}
          </button>
        ))}
      </div>
    </section>
  );
}

function cockpitStyleLabel(style: CockpitStyle | undefined) {
  if (style === "none") return "None";
  if (style === "paws") return "Paws";
  return "Hands";
}

function FeelPreview({ test }: { test: { id: number; label: string } }) {
  return (
    <div className={`feel-preview ${test.id ? "active" : ""}`} key={test.id}>
      <span />
      <span />
      <span />
      <strong>{test.label}</strong>
    </div>
  );
}

function CarSetupSelector({ value, color, send }: { value: CarSetupId; color: string; send: ReturnType<typeof useGameSocket>["send"] }) {
  const selected = CAR_SETUPS[value ?? DEFAULT_CAR_SETUP_ID];
  return (
    <section className="car-selector" aria-label="Car setup">
      <CarSetupPreview setup={selected} color={color} />
      <div className="car-selector-head">
        <div>
          <span>Car setup</span>
          <strong>{selected.name}</strong>
        </div>
        <small>{selected.stats.topSpeedKmh} km/h dry top</small>
      </div>
      <small className="phone-note">This changes the same formula car's tuning, not a different vehicle. Grip builds with speed on road and curbs. Rain still lowers grip and top speed.</small>
      <div className="setup-grid">
        {Object.values(CAR_SETUPS).map((setup) => (
          <button
            key={setup.id}
            className={setup.id === value ? "setup-card active" : "setup-card"}
            onClick={() => send({ type: "set_car_setup", carSetupId: setup.id })}
          >
            <strong>{setup.name}</strong>
            <small>{setup.description}</small>
            <SetupStats setup={setup} />
          </button>
        ))}
      </div>
    </section>
  );
}

function CarSetupPreview({ setup, color }: { setup: CarSetup; color: string }) {
  return (
    <div className="car-preview">
      <Canvas camera={{ position: [3.2, 2.1, 4.6], fov: 34 }} dpr={[1, 1.5]} shadows={false}>
        <color attach="background" args={["#181b21"]} />
        <ambientLight intensity={0.82} />
        <directionalLight position={[3, 5, 4]} intensity={1.35} />
        <CarPreviewScene color={color} />
      </Canvas>
      <div className="car-preview-meta">
        <strong>{setup.shortName}</strong>
        <span>{setup.stats.topSpeedKmh} km/h top · {setup.stats.grip}/10 grip</span>
      </div>
    </div>
  );
}

function CarPreviewScene({ color }: { color: string }) {
  const car = useMemo<CarState>(() => ({
    playerId: "preview",
    carSetupId: DEFAULT_CAR_SETUP_ID,
    x: 0,
    y: 0,
    z: 0,
    velocityX: 0,
    velocityZ: 0,
    heading: -0.62,
    speed: 0,
    steer: 0.12,
    throttle: 0,
    brake: 0,
    lap: 1,
    progress: 0,
    distanceThisLap: 0,
    nextCheckpoint: 0,
    lastValidProgress: 0,
    timedLapStarted: false,
    timedRaceStartedAt: 0,
    currentLapStartedAt: 0,
    wheelDistance: 0,
    surface: "road",
    finished: false,
    crashed: false,
    dnf: false,
    resetAvailable: false,
    impact: 0,
    slip: 0
  }), []);
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.38;
  });

  return (
    <group ref={group} position={[0, -0.18, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <circleGeometry args={[2.7, 48]} />
        <meshStandardMaterial color="#22262c" roughness={0.82} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
        <ringGeometry args={[1.45, 2.1, 48]} />
        <meshBasicMaterial color="#2f343b" side={THREE.DoubleSide} />
      </mesh>
      <CarModel car={car} color={color} />
    </group>
  );
}

function SetupStats({ setup }: { setup: CarSetup }) {
  return (
    <div className="setup-stats">
      <StatMeter label="Top" value={setup.stats.topSpeedKmh} max={432} suffix="km/h" />
      <StatMeter label="Accel" value={setup.stats.acceleration} max={10} />
      <StatMeter label="Grip" value={setup.stats.grip} max={10} />
      <StatMeter label="Brake" value={setup.stats.braking} max={10} />
    </div>
  );
}

function StatMeter({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  return (
    <div className="stat-meter">
      <span>{label}</span>
      <div><span style={{ width: `${clamp(value / max, 0, 1) * 100}%` }} /></div>
      <strong>{suffix ? `${value} ${suffix}` : value}</strong>
    </div>
  );
}

function StartPreference({ label, value, description, onChange }: { label: string; value: number; description: string; onChange: (value: number) => void }) {
  return (
    <label className="range-control">
      <span>{label}</span>
      <input type="range" min="0" max="100" value={Math.round(value * 100)} onChange={(event) => onChange(Number(event.target.value) / 100)} />
      <strong>{Math.round(value * 100)}%</strong>
      <small>{description}</small>
    </label>
  );
}

function SteeringSensitivityPreference({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="range-control">
      <span>Motion sensitivity</span>
      <input type="range" min="1" max="10" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}/10</strong>
      <small>Higher reacts to smaller phone tilts. Lower gives a calmer wheel.</small>
    </label>
  );
}

function TrackPicker({ settings, send }: { settings: RaceSettings; send: ReturnType<typeof useGameSocket>["send"] }) {
  const ids = Object.keys(TRACKS) as Array<keyof typeof TRACKS>;
  const index = ids.indexOf(settings.trackId);
  const setIndex = (next: number) => send({ type: "vip_set_settings", settings: { trackId: ids[(next + ids.length) % ids.length] } });
  return (
    <div className="picker">
      <button onClick={() => setIndex(index - 1)}><ArrowLeft /></button>
      <strong>{TRACKS[settings.trackId].name}</strong>
      <button onClick={() => setIndex(index + 1)}><ArrowRight /></button>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button onClick={() => onChange(Math.max(min, value - 1))}>-</button>
      <strong>{value}</strong>
      <button onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={value ? "toggle on" : "toggle"} onClick={() => onChange(!value)}>
      <span>{label}</span><strong>{value ? "On" : "Off"}</strong>
    </button>
  );
}

function RaceController({ send, feedback, crashEvents, room, playerId }: { send: ReturnType<typeof useGameSocket>["send"]; feedback?: CarState; crashEvents: CrashEvent[]; room: RoomState; playerId: string }) {
  const initialMotionCalibrationRef = useRef(room.phase === "countdown" ? undefined : readMotionCalibration());
  const [pedals, setPedals] = useState({ throttle: 0, brake: 0 });
  const [touchSteer, setTouchSteer] = useState(0);
  const [steerUi, setSteerUi] = useState(0);
  const [calibrationLabel, setCalibrationLabel] = useState("Calibrate");
  const [motionStatus, setMotionStatus] = useState(initialMotionCalibrationRef.current ? "Motion steering" : motionInitialStatus());
  const [hapticStatus, setHapticStatus] = useState(hapticShortStatus());
  const steerRef = useRef(0);
  const hasMotionRef = useRef(false);
  const lastRawSteerRef = useRef(initialMotionCalibrationRef.current?.neutral ?? 0);
  const lastOrientationFrameRef = useRef(initialMotionCalibrationRef.current?.frame ?? motionOrientationFrameKey());
  const neutralCaptureRef = useRef<{ startedAt: number; samples: number[] } | undefined>(undefined);
  const seqRef = useRef(0);
  const lastHapticAtRef = useRef(0);
  const lastCrashHapticIdRef = useRef<string | undefined>(undefined);
  const pedalsRef = useRef(pedals);
  const feedbackRef = useRef(feedback);
  const crashEventsRef = useRef(crashEvents);
  const roomRef = useRef(room);
  const touchSteerRef = useRef(touchSteer);
  const touchSteerOverrideUntilRef = useRef(0);
  const neutralRef = useRef<number | undefined>(initialMotionCalibrationRef.current?.neutral);
  const audioRef = useRef<ControllerAudio | null>(sharedControllerAudio);
  const brakeStart = readStoredNumber("sim-drive-brake-start", 0);
  const throttleStart = readStoredNumber("sim-drive-throttle-start", 0);
  const audioEnabled = readStoredBoolean("sim-drive-audio-enabled", true);
  const hapticsEnabled = readStoredBoolean("sim-drive-haptics-enabled", true);
  const steeringSensitivity = steeringSensitivityFromLevel(readStoredRangeNumber(STEERING_SENSITIVITY_KEY, STEERING_SENSITIVITY_DEFAULT, 1, 10));
  const [invertMotionSteering, setInvertMotionSteering] = useStoredBoolean(INVERT_MOTION_STEERING_KEY, false);
  const motionSteeringDirection = invertMotionSteering ? -1 : 1;
  const car = feedback ?? room.cars.find((item) => item.playerId === playerId);
  const resetAvailable = Boolean(car?.resetAvailable);

  useEffect(() => {
    void requestLandscape();
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null && event.gamma === null) return;
      hasMotionRef.current = true;
      if (!phoneIsLandscape()) {
        neutralRef.current = undefined;
        neutralCaptureRef.current = undefined;
        steerRef.current = 0;
        setSteerUi(0);
        setMotionStatus("Turn phone sideways");
        return;
      }
      const angle = getScreenAngle();
      const raw = readSteeringTilt(event, angle);
      const orientationFrame = motionOrientationFrameKey(angle);
      if (orientationFrame !== lastOrientationFrameRef.current) {
        neutralRef.current = readMotionCalibration(orientationFrame)?.neutral;
        neutralCaptureRef.current = undefined;
        steerRef.current = 0;
        setSteerUi(0);
        lastOrientationFrameRef.current = orientationFrame;
      }
      lastRawSteerRef.current = raw;
      if (neutralRef.current === undefined) {
        const now = performance.now();
        const capture = neutralCaptureRef.current ?? { startedAt: now, samples: [] };
        capture.samples.push(raw);
        if (capture.samples.length > 12) capture.samples.shift();
        neutralCaptureRef.current = capture;
        steerRef.current = 0;
        setMotionStatus("Hold steady, centering :D");
        const elapsed = now - capture.startedAt;
        const stable = motionSamplesStable(capture.samples);
        if ((capture.samples.length >= MOTION_NEUTRAL_MIN_SAMPLES && elapsed >= MOTION_NEUTRAL_SAMPLE_MS && stable) || elapsed >= MOTION_NEUTRAL_MAX_SAMPLE_MS) {
          neutralRef.current = median(capture.samples);
          writeMotionCalibration({ frame: orientationFrame, neutral: neutralRef.current, capturedAt: Date.now() });
          neutralCaptureRef.current = undefined;
          setMotionStatus("Motion steering");
        }
        return;
      }
      const targetSteer = steeringFromTilt(raw, neutralRef.current, steeringSensitivity, motionSteeringDirection);
      steerRef.current = THREE.MathUtils.lerp(steerRef.current, targetSteer, 0.42);
      if (Math.abs(steerRef.current) < 0.01) steerRef.current = 0;
      setMotionStatus("Motion steering");
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [motionSteeringDirection, steeringSensitivity]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!hasMotionRef.current) setMotionStatus("Touch steering");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setSteerUi(steerRef.current), 80);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    pedalsRef.current = pedals;
  }, [pedals]);

  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  useEffect(() => {
    crashEventsRef.current = crashEvents;
  }, [crashEvents]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    touchSteerRef.current = touchSteer;
  }, [touchSteer]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const activeFeedback = feedbackRef.current;
      const activePedals = pedalsRef.current;
      const touchActive = Math.abs(touchSteerRef.current) > 0.03 || performance.now() < touchSteerOverrideUntilRef.current;
      const steer = touchActive ? touchSteerRef.current : hasMotionRef.current && Math.abs(steerRef.current) > 0.03 ? steerRef.current : 0;
      const input: InputFrame = { seq: seqRef.current, steer, throttle: activePedals.throttle, brake: activePedals.brake };
      seqRef.current += 1;
      send({ type: "input_frame", input });
      if (audioEnabled) updateControllerAudio(audioRef.current, activeFeedback, roomRef.current, activePedals, crashEventsRef.current);
      driveHaptics(activeFeedback, activePedals, hapticsEnabled, lastHapticAtRef, crashEventsRef.current, lastCrashHapticIdRef);
    }, 33);
    return () => {
      window.clearInterval(timer);
      silenceControllerAudio(audioRef.current);
    };
  }, [audioEnabled, hapticsEnabled, send]);

  const calibrate = () => {
    neutralRef.current = lastRawSteerRef.current;
    writeMotionCalibration({ frame: lastOrientationFrameRef.current, neutral: neutralRef.current, capturedAt: Date.now() });
    neutralCaptureRef.current = undefined;
    steerRef.current = 0;
    setSteerUi(0);
    setCalibrationLabel("Straight set");
    window.setTimeout(() => setCalibrationLabel("Calibrate"), 1200);
  };

  const setTouchSteering = (value: number) => {
    touchSteerOverrideUntilRef.current = performance.now() + (value === 0 ? 140 : 1200);
    setTouchSteer(value);
  };

  return (
    <main
      className="phone race-controller"
      onPointerDown={() => {
        if (audioEnabled) audioRef.current = unlockControllerAudio();
        void requestLandscape();
      }}
    >
      <div className="rotate-warning">
        <strong>Turn your phone sideways</strong>
        <span>Landscape keeps the pedal zones wide and makes tilt steering use the correct axis.</span>
        <button onClick={() => void requestLandscape()}>Lock Landscape</button>
      </div>
      <button className="calibrate" onClick={calibrate}>{calibrationLabel}</button>
      <div className="telemetry">
        <span>{Math.round(speedToKmh(car?.speed ?? 0))} km/h</span>
        <span>{car && !car.timedLapStarted ? "Warm-up" : `Lap ${car?.lap ?? 1}/${room.settings.lapCount}`}</span>
        <button
          onClick={() => {
            enableControllerDevice().then((result) => setMotionStatus(result.message));
          }}
        >
          {motionStatus}
        </button>
        <button
          onClick={() => {
            const result = pulseHaptic(HAPTIC_TEST_PATTERN);
            setHapticStatus(hapticResultMessage(result, "compact"));
          }}
        >
          {hapticStatus}
        </button>
        <button onClick={() => setInvertMotionSteering(!invertMotionSteering)}>
          {invertMotionSteering ? "Steer inverted" : "Steer normal"}
        </button>
      </div>
      {resetAvailable && (
        <button className="reset-to-track" onClick={() => send({ type: "request_reset" })}>
          Reset to track
        </button>
      )}
      {room.phase === "countdown" && <ControllerCountdownHints motionStatus={motionStatus} />}
      <PedalZone side="brake" value={pedals.brake} firstTap={brakeStart} onChange={(brake) => setPedals((current) => ({ ...current, brake }))} />
      <PedalZone side="throttle" value={pedals.throttle} firstTap={throttleStart} onChange={(throttle) => setPedals((current) => ({ ...current, throttle }))} />
      <div className="steer-touch">
        <button onPointerDown={() => setTouchSteering(-1)} onPointerUp={() => setTouchSteering(0)} onPointerCancel={() => setTouchSteering(0)} onPointerLeave={() => setTouchSteering(0)}><ArrowLeft /></button>
        <div className="tilt-meter"><span style={{ transform: `translateX(${(touchSteer || steerUi) * 42}px)` }} /></div>
        <button onPointerDown={() => setTouchSteering(1)} onPointerUp={() => setTouchSteering(0)} onPointerCancel={() => setTouchSteering(0)} onPointerLeave={() => setTouchSteering(0)}><ArrowRight /></button>
      </div>
    </main>
  );
}

function ControllerCountdownHints({ motionStatus }: { motionStatus: string }) {
  const steerHint = motionStatus === "Turn phone sideways"
    ? "Turn phone sideways"
    : motionStatus === "Hold steady, centering :D"
      ? "Hold steady, centering :D"
      : "Hold straight to center";
  return (
    <div className="controller-hints" aria-live="polite">
      <span className="hint brake-hint">Brake: slide down</span>
      <span className="hint throttle-hint">Throttle: slide up</span>
      <span className="hint steer-hint">{steerHint}</span>
    </div>
  );
}

function PedalZone({ side, value, firstTap, onChange }: { side: "brake" | "throttle"; value: number; firstTap: number; onChange: (value: number) => void }) {
  const startY = useRef(0);
  const startValue = useRef(0);
  return (
    <div
      className={`pedal ${side}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        startY.current = event.clientY;
        startValue.current = firstTap;
        onChange(firstTap);
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const delta = side === "brake" ? event.clientY - startY.current : startY.current - event.clientY;
        onChange(clamp(startValue.current + delta / 180, 0, 1));
      }}
      onPointerUp={() => onChange(0)}
      onPointerCancel={() => onChange(0)}
    >
      <strong>{side === "brake" ? "Brake" : "Throttle"}</strong>
      <div className={`pedal-track ${side}`}><span style={{ height: `${value * 100}%` }} /></div>
      <em>{Math.round(value * 100)}%</em>
    </div>
  );
}

type RaceRenderQuality = "full" | "split";

function RaceCanvas({ room, focusPlayerId, paneCount }: { room: RoomState; focusPlayerId: string; paneCount: number }) {
  const quality: RaceRenderQuality = paneCount > 1 ? "split" : "full";
  return (
    <Canvas
      shadows={quality === "full"}
      dpr={quality === "split" ? [0.75, 1] : [1, 1.35]}
      gl={{ antialias: quality === "full", powerPreference: "high-performance" }}
      camera={{ fov: 76, near: 0.1, far: 1500 }}
    >
      <color attach="background" args={[room.settings.rain ? "#78818a" : "#9fc4dc"]} />
      <fog attach="fog" args={[room.settings.rain ? "#8b949b" : "#b8d4e2", room.settings.rain ? 38 : 95, room.settings.rain ? 210 : 380]} />
      <ambientLight intensity={room.settings.rain ? 0.58 : 0.72} />
      <hemisphereLight args={[room.settings.rain ? "#b7c2cc" : "#d8f0ff", "#526447", room.settings.rain ? 0.55 : 0.42]} />
      <directionalLight position={[20, 35, 12]} intensity={room.settings.rain ? 0.72 : 1.38} castShadow={quality === "full"} />
      <RaceScene room={room} focusPlayerId={focusPlayerId} quality={quality} />
    </Canvas>
  );
}

function RaceScene({ room, focusPlayerId, quality }: { room: RoomState; focusPlayerId: string; quality: RaceRenderQuality }) {
  const { camera } = useThree();
  const track = TRACKS[room.settings.trackId];
  const focus = room.cars.find((car) => car.playerId === focusPlayerId);
  const smoothFocus = useRef<{ playerId: string; x: number; y: number; z: number; heading: number; surface: CarState["surface"]; impact: number; slip: number } | undefined>(undefined);

  useFrame((_, delta) => {
    if (!focus) return;
    if (!smoothFocus.current || smoothFocus.current.playerId !== focus.playerId) {
      smoothFocus.current = {
        playerId: focus.playerId,
        x: focus.x,
        y: focus.y,
        z: focus.z,
        heading: focus.heading,
        surface: focus.surface,
        impact: focus.impact,
        slip: focus.slip
      };
    }
    const amount = smoothingAmount(delta, 16);
    smoothFocus.current.x = THREE.MathUtils.lerp(smoothFocus.current.x, focus.x, amount);
    smoothFocus.current.y = THREE.MathUtils.lerp(smoothFocus.current.y, focus.y, amount);
    smoothFocus.current.z = THREE.MathUtils.lerp(smoothFocus.current.z, focus.z, amount);
    smoothFocus.current.heading = lerpAngle(smoothFocus.current.heading, focus.heading, amount);
    smoothFocus.current.surface = focus.surface;
    smoothFocus.current.impact = THREE.MathUtils.lerp(smoothFocus.current.impact, focus.impact, amount);
    smoothFocus.current.slip = THREE.MathUtils.lerp(smoothFocus.current.slip, focus.slip, amount);

    const renderFocus = smoothFocus.current;
    const shake = (renderFocus.surface === "curb" ? 0.05 : 0) + renderFocus.impact * 0.12 + renderFocus.slip * 0.025;
    camera.position.set(
      renderFocus.x - Math.sin(renderFocus.heading) * 0.2 + Math.sin(renderFocus.heading + Math.PI / 2) * 0.12,
      renderFocus.y + 1.55 + Math.sin(performance.now() / 35) * shake,
      renderFocus.z - Math.cos(renderFocus.heading) * 0.2
    );
    camera.lookAt(renderFocus.x + Math.sin(renderFocus.heading) * 18, renderFocus.y + 1.1, renderFocus.z + Math.cos(renderFocus.heading) * 18);
  });

  return (
    <>
      <TrackMesh track={track} rain={room.settings.rain} />
      <TrackProps track={track} rain={room.settings.rain} />
      <DynamicSkidMarks cars={room.cars} rain={room.settings.rain} quality={quality} track={track} />
      {room.settings.rain && focus && <RainEffect focus={focus} dropCount={quality === "split" ? 90 : 240} />}
      {room.cars.map((car) => {
        const player = room.players.find((item) => item.id === car.playerId);
        const color = player?.color ?? "#ff3b5c";
        return (
          <group key={car.playerId}>
            <CarEffects car={car} rain={room.settings.rain} color={color} />
            <CarModel car={car} color={color} dimmed={car.playerId === focusPlayerId} />
          </group>
        );
      })}
      <CrashExplosions events={room.crashEvents} track={track} />
      {focus && (
        <Cockpit
          car={focus}
          color={room.players.find((item) => item.id === focusPlayerId)?.color ?? "#ff3b5c"}
          cockpitStyle={room.players.find((item) => item.id === focusPlayerId)?.cockpitStyle ?? "hands"}
        />
      )}
    </>
  );
}

const TrackMesh = memo(function TrackMesh({ track, rain }: { track: TrackDef; rain: boolean }) {
  const bounds = useMemo(() => getTrackBounds(track), [track]);
  const elevatedTrack = track.id === "fjord" || track.id === "cloudline";
  const terrainBaseY = elevatedTrack ? bounds.minY - (track.id === "cloudline" ? 1.15 : 0.9) : bounds.minY - 0.55;
  const groundWidth = bounds.maxX - bounds.minX + 360;
  const groundDepth = bounds.maxZ - bounds.minZ + 360;
  const groundX = (bounds.minX + bounds.maxX) / 2;
  const groundZ = (bounds.minZ + bounds.maxZ) / 2;
  const elevatedTerrainGeometry = useMemo(() => {
    if (!elevatedTrack) return undefined;
    return createElevatedTrackTerrainGeometry(track, terrainBaseY);
  }, [elevatedTrack, terrainBaseY, track]);
  const elevatedTerrainColor = track.id === "cloudline"
    ? (rain ? "#7e8988" : "#b9c5bd")
    : (rain ? "#3d594d" : "#66855a");
  const shoulderGeometry = useMemo(() => {
    const shoulderWidth = track.width + (track.curbWidth + track.wallMargin) * 2 + (elevatedTrack ? 26 : 34);
    return createTrackRibbonGeometry(track, shoulderWidth, 0, -0.09, track.id === "cloudline" ? 6.5 : 4.2);
  }, [elevatedTrack, track]);
  const shoulderColor = track.id === "cloudline"
    ? (rain ? "#8d9998" : "#d0d8d3")
    : track.id === "fjord"
      ? (rain ? "#455f55" : "#6f8a5f")
      : (rain ? "#43564b" : "#638650");
  const curbStripeGeometries = useMemo(() => createCurbStripeGeometries(track, 4.6), [track]);
  const roadGeometry = useMemo(() => createTrackRibbonGeometry(track, track.width, 0, 0.035, 2.7), [track]);
  const runoffGeometry = useMemo(() => createTrackRibbonGeometry(track, track.width + (track.curbWidth + track.wallMargin) * 2, 0, -0.01, 2.7), [track]);
  const leftCurbGeometry = useMemo(() => createTrackRibbonGeometry(track, track.curbWidth, -track.width / 2 - track.curbWidth / 2, 0.055, 2.7), [track]);
  const rightCurbGeometry = useMemo(() => createTrackRibbonGeometry(track, track.curbWidth, track.width / 2 + track.curbWidth / 2, 0.055, 2.7), [track]);
  const leftCurbInnerEdge = useMemo(() => createTrackRibbonGeometry(track, 0.16, -track.width / 2 - 0.08, 0.102, 2.7), [track]);
  const leftCurbOuterEdge = useMemo(() => createTrackRibbonGeometry(track, 0.16, -track.width / 2 - track.curbWidth + 0.08, 0.101, 2.7), [track]);
  const rightCurbInnerEdge = useMemo(() => createTrackRibbonGeometry(track, 0.16, track.width / 2 + 0.08, 0.102, 2.7), [track]);
  const rightCurbOuterEdge = useMemo(() => createTrackRibbonGeometry(track, 0.16, track.width / 2 + track.curbWidth - 0.08, 0.101, 2.7), [track]);
  const leftLineGeometry = useMemo(() => createTrackRibbonGeometry(track, 0.13, -track.width / 2 + 0.18, 0.075, 2.7), [track]);
  const rightLineGeometry = useMemo(() => createTrackRibbonGeometry(track, 0.13, track.width / 2 - 0.18, 0.075, 2.7), [track]);
  const racingLineGeometry = useMemo(() => createTrackRibbonGeometry(track, 1.35, 0, 0.078, 2.7), [track]);
  const rubberLeftGeometry = useMemo(() => createTrackRibbonGeometry(track, 0.28, -0.48, 0.081, 2.7), [track]);
  const rubberRightGeometry = useMemo(() => createTrackRibbonGeometry(track, 0.28, 0.48, 0.081, 2.7), [track]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[groundX, terrainBaseY - 0.08, groundZ]} receiveShadow>
        <planeGeometry args={[groundWidth, groundDepth]} />
        <meshStandardMaterial color={rain ? "#3e4d45" : "#5a7e48"} roughness={0.95} />
      </mesh>
      {elevatedTerrainGeometry && (
        <mesh geometry={elevatedTerrainGeometry} receiveShadow>
          <meshStandardMaterial color={elevatedTerrainColor} roughness={0.98} side={THREE.DoubleSide} />
        </mesh>
      )}
      <mesh geometry={shoulderGeometry} receiveShadow>
        <meshStandardMaterial color={shoulderColor} roughness={0.96} side={THREE.DoubleSide} />
      </mesh>
      <TrackTerrain track={track} rain={rain} />
      <mesh geometry={runoffGeometry} receiveShadow>
        <meshStandardMaterial color={rain ? "#46524d" : "#6f8c58"} roughness={0.92} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={roadGeometry} receiveShadow>
        <meshStandardMaterial color={rain ? "#2f383b" : "#2c2e31"} roughness={rain ? 0.34 : 0.76} metalness={rain ? 0.14 : 0.04} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={racingLineGeometry}>
        <meshBasicMaterial color={rain ? "#11191c" : "#17181a"} transparent opacity={rain ? 0.28 : 0.18} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rubberLeftGeometry}>
        <meshBasicMaterial color="#07090b" transparent opacity={rain ? 0.1 : 0.16} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rubberRightGeometry}>
        <meshBasicMaterial color="#07090b" transparent opacity={rain ? 0.1 : 0.16} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <AsphaltDetails track={track} rain={rain} />
      {rain && <RainPuddles track={track} />}
      <mesh geometry={leftCurbGeometry}>
        <meshStandardMaterial color={rain ? "#8f4c52" : "#9f2630"} roughness={0.66} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightCurbGeometry}>
        <meshStandardMaterial color={rain ? "#8f4c52" : "#9f2630"} roughness={0.66} side={THREE.DoubleSide} />
      </mesh>
      {[leftCurbInnerEdge, leftCurbOuterEdge, rightCurbInnerEdge, rightCurbOuterEdge].map((geometry, index) => (
        <mesh key={`curb-edge-${index}`} geometry={geometry}>
          <meshStandardMaterial color={index % 2 === 0 ? "#f4eddf" : "#7d2028"} roughness={0.5} metalness={0.04} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh geometry={leftLineGeometry}>
        <meshBasicMaterial color={rain ? "#d7dad8" : "#f5f1dc"} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightLineGeometry}>
        <meshBasicMaterial color={rain ? "#d7dad8" : "#f5f1dc"} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={curbStripeGeometries.white}>
        <meshStandardMaterial color="#e8e1d1" roughness={0.58} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={curbStripeGeometries.red}>
        <meshStandardMaterial color="#b02b35" roughness={0.58} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
});

type AsphaltPatch = {
  x: number;
  y: number;
  z: number;
  heading: number;
  width: number;
  length: number;
  opacity: number;
};

function TrackTerrain({ track, rain }: { track: TrackDef; rain: boolean }) {
  const samples = useMemo(() => sampleTrackVisuals(track, track.id === "cloudline" ? 220 : track.id === "fjord" ? 90 : track.id === "alpine" ? 36 : 26), [track]);
  return (
    <group>
      {samples.map((sample, index) => {
        if (index % 2 === 1) return null;
        const side = index % 4 === 0 ? -1 : 1;
        const mountainTrack = track.id === "alpine" || track.id === "fjord" || track.id === "cloudline";
        const scaleX = mountainTrack ? 6.5 : 4.8;
        const scaleZ = mountainTrack ? 2.2 : 1.4;
        const height = mountainTrack ? 0.72 + seededUnit(index * 3) * 0.65 : 0.18 + seededUnit(index * 3) * 0.18;
        const position = tracksidePropPosition(track, sample, side, 2.5 + seededUnit(index + track.id.length) * 4, scaleX, 0.35);
        return (
          <mesh
            key={`bank-${index}`}
            position={[position.x, position.y + height * 0.34 - 0.06, position.z]}
            rotation={[0, sample.heading + seededUnit(index * 7) * 0.8, 0]}
            scale={[scaleX, height, scaleZ]}
            receiveShadow
          >
            <sphereGeometry args={[1, 12, 6]} />
            <meshStandardMaterial color={mountainTrack ? (rain ? "#59605b" : "#74806c") : (rain ? "#4a5b4f" : "#78965d")} roughness={0.96} />
          </mesh>
        );
      })}
      {track.id === "alpine" ? <AlpineBackdrop rain={rain} /> : track.id === "sakura" ? <SakuraGroundAccents track={track} rain={rain} /> : null}
    </group>
  );
}

function RainPuddles({ track }: { track: TrackDef }) {
  const puddles = useMemo(() => sampleTrackVisuals(track, track.id === "cloudline" ? 140 : track.id === "fjord" ? 70 : 18).filter((_, index) => index % 3 === 0), [track]);
  return (
    <group>
      {puddles.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const rightX = Math.sin(sample.heading + Math.PI / 2);
        const rightZ = Math.cos(sample.heading + Math.PI / 2);
        const lateral = side * (track.width * (0.22 + seededUnit(index * 5) * 0.22));
        return (
          <mesh
            key={`puddle-${index}`}
            position={[sample.x + rightX * lateral, sample.y + 0.088, sample.z + rightZ * lateral]}
            rotation={[-Math.PI / 2, 0, -sample.heading + seededUnit(index * 11) * 0.5]}
            scale={[0.65 + seededUnit(index * 13) * 0.8, 0.28 + seededUnit(index * 17) * 0.32, 1]}
          >
            <circleGeometry args={[1, 20]} />
            <meshBasicMaterial color="#9bc8d8" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

function AsphaltDetails({ track, rain }: { track: TrackDef; rain: boolean }) {
  const patches = useMemo<AsphaltPatch[]>(() => {
    const surfacePatches: AsphaltPatch[] = [];
    const samples = sampleTrackVisuals(track, track.id === "cloudline" ? 42 : track.id === "fjord" ? 18 : 5.2);
    samples.forEach((sample, index) => {
      if (index % 2 !== 0) return;
      const sideNoise = seededUnit(index * 11 + track.id.length) - 0.5;
      const lateral = sideNoise * track.width * 0.72;
      const rightX = Math.sin(sample.heading + Math.PI / 2);
      const rightZ = Math.cos(sample.heading + Math.PI / 2);
      surfacePatches.push({
        x: sample.x + rightX * lateral,
        y: sample.y,
        z: sample.z + rightZ * lateral,
        heading: sample.heading + (seededUnit(index * 7) - 0.5) * 0.28,
        width: 0.18 + seededUnit(index * 5) * 0.42,
        length: 0.9 + seededUnit(index * 13) * 1.8,
        opacity: 0.025 + seededUnit(index * 17) * (rain ? 0.035 : 0.05)
      });
    });

    const curveSamples = sampleTrackVisuals(track, track.id === "cloudline" ? 70 : track.id === "fjord" ? 28 : 8.5);
    curveSamples.forEach((sample, index) => {
      const previous = curveSamples[(index - 1 + curveSamples.length) % curveSamples.length];
      const next = curveSamples[(index + 1) % curveSamples.length];
      const turn = angleDeltaLocal(previous.heading, next.heading);
      if (Math.abs(turn) < 0.16 || index % 2 !== 0) return;
      const rightX = Math.sin(sample.heading + Math.PI / 2);
      const rightZ = Math.cos(sample.heading + Math.PI / 2);
      const outside = turn > 0 ? -1 : 1;
      const lateral = outside * (track.width * 0.18 + seededUnit(index * 23) * track.width * 0.12);
      surfacePatches.push({
        x: sample.x + rightX * lateral,
        y: sample.y,
        z: sample.z + rightZ * lateral,
        heading: sample.heading + outside * 0.05,
        width: 0.18,
        length: 4.2 + seededUnit(index * 29) * 3.2,
        opacity: rain ? 0.14 : 0.22
      });
    });

    return surfacePatches;
  }, [track, rain]);

  return (
    <group>
      {patches.map((patch, index) => (
        <mesh key={`asphalt-${index}`} position={[patch.x, patch.y + 0.086, patch.z]} rotation={[-Math.PI / 2, 0, -patch.heading]}>
          <planeGeometry args={[patch.width, patch.length]} />
          <meshBasicMaterial color="#050608" transparent opacity={patch.opacity} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function SponsorBoard({ track, rain }: { track: TrackDef; rain: boolean }) {
  const texture = useMemo(() => createSponsorTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  const placement = useMemo(() => {
    const progress = trackMetrics(track).totalLength * (track.id === "sakura" ? 0.6 : 0.36);
    const sample = sampleTrack(track, progress);
    const side = track.id === "sakura" ? 1 : -1;
    const position = tracksidePropPosition(track, sample, side, 1.2, 2.6, 0.8);
    return {
      ...position,
      heading: sample.heading - side * (Math.PI / 2 - 0.18)
    };
  }, [track]);

  return (
    <group position={[placement.x, placement.y + 1.35, placement.z]} rotation={[0, placement.heading, 0]}>
      <mesh castShadow>
        <planeGeometry args={[4.2, 1.35]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {[-1.65, 1.65].map((x) => (
        <mesh key={x} position={[x, -1.05, -0.04]} castShadow>
          <boxGeometry args={[0.12, 2.1, 0.12]} />
          <meshStandardMaterial color={rain ? "#1d252b" : "#20242a"} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

const TrackProps = memo(function TrackProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  const start = sampleTrackVisuals(track, 7)[0];
  const propSamples = useMemo(() => sampleTrackVisuals(track, track.id === "cloudline" ? 140 : track.id === "fjord" ? 70 : track.id === "alpine" ? 28 : 21), [track]);
  const boards = propSamples.filter((_, index) => index % 3 === 0);
  const barriers = propSamples.filter((_, index) => index % 2 === 1);
  const brakingBoards = propSamples.filter((_, index) => index % 4 === 1);
  return (
    <group>
      <group position={[start.x, start.y + 0.16, start.z]} rotation={[0, start.heading, 0]}>
        <mesh receiveShadow>
          <boxGeometry args={[track.width + track.curbWidth * 2, 0.04, 1.2]} />
          <meshStandardMaterial color="#f7f4ea" roughness={0.7} />
        </mesh>
        {Array.from({ length: 10 }).map((_, index) => (
          <mesh key={index} position={[-track.width / 2 + 0.55 + index * (track.width / 10), 0.19, 0]}>
            <boxGeometry args={[track.width / 10, 0.045, 0.6]} />
            <meshStandardMaterial color={index % 2 === 0 ? "#111318" : "#f7f4ea"} roughness={0.6} />
          </mesh>
        ))}
        {[0, 4, 8, 12].map((offset, index) => (
          <mesh key={offset} position={[index % 2 === 0 ? -2.1 : 2.1, 0.08, -offset - 3]}>
            <boxGeometry args={[1.3, 0.03, 2.0]} />
            <meshStandardMaterial color="#f7f4ea" roughness={0.7} />
          </mesh>
        ))}
        <mesh position={[0, 4.2, -1.3]} castShadow>
          <boxGeometry args={[track.width + track.curbWidth * 2 + 4.4, 0.26, 0.26]} />
          <meshStandardMaterial color="#20242a" roughness={0.5} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`gantry-tower-${side}`} position={[side * (track.width / 2 + track.curbWidth + 0.62), 2.05, -1.3]} castShadow>
            <boxGeometry args={[0.42, 4.1, 0.42]} />
            <meshStandardMaterial color="#20242a" roughness={0.52} metalness={0.08} />
          </mesh>
        ))}
        <mesh position={[0, 3.55, -1.08]} castShadow>
          <boxGeometry args={[6.2, 0.72, 0.18]} />
          <meshStandardMaterial color="#fffaf0" roughness={0.5} />
        </mesh>
        <mesh position={[0, 3.55, -0.96]}>
          <boxGeometry args={[5.55, 0.18, 0.04]} />
          <meshStandardMaterial color="#35a7ff" roughness={0.42} />
        </mesh>
        <mesh position={[0, 3.26, -0.96]}>
          <boxGeometry args={[5.55, 0.18, 0.04]} />
          <meshStandardMaterial color="#e84f5f" roughness={0.42} />
        </mesh>
        {[-2.4, 0, 2.4].map((x, index) => (
          <mesh key={x} position={[x, 3.8, -1.3]} castShadow>
            <sphereGeometry args={[0.28, 16, 16]} />
            <meshStandardMaterial color={index === 2 ? "#24c06f" : "#d23a3a"} emissive={index === 2 ? "#0b3f25" : "#3f0b0b"} />
          </mesh>
        ))}
      </group>
      {boards.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const x = sample.x + Math.sin(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + 2.3);
        const z = sample.z + Math.cos(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + 2.3);
        return (
          <group key={`${sample.x}-${sample.z}-prop`} position={[x, sample.y + 0.55, z]} rotation={[0, sample.heading + (side < 0 ? 0.18 : -0.18), 0]}>
            <mesh castShadow>
              <boxGeometry args={[1.4, 1.1, 0.12]} />
              <meshStandardMaterial color={rain ? "#c8d2d7" : "#f2efe4"} roughness={0.7} />
            </mesh>
            <mesh position={[0, -0.72, 0]}>
              <boxGeometry args={[0.12, 1.1, 0.12]} />
              <meshStandardMaterial color="#22262c" roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {brakingBoards.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const x = sample.x + Math.sin(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + 4.3);
        const z = sample.z + Math.cos(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + 4.3);
        return (
          <group key={`${sample.x}-${sample.z}-brake`} position={[x, sample.y + 0.72, z]} rotation={[0, sample.heading + (side < 0 ? 0.42 : -0.42), 0]}>
            <mesh castShadow>
              <boxGeometry args={[1.0, 1.0, 0.1]} />
              <meshStandardMaterial color="#fffaf0" roughness={0.62} />
            </mesh>
            {[0, 1, 2].map((stripe) => (
              <mesh key={stripe} position={[-0.28 + stripe * 0.28, 0.0, 0.06]}>
                <boxGeometry args={[0.11, 0.78 - stripe * 0.18, 0.025]} />
                <meshStandardMaterial color={stripe === 0 ? "#e84f5f" : "#101214"} roughness={0.5} />
              </mesh>
            ))}
            <mesh position={[0, -0.76, 0]}>
              <boxGeometry args={[0.1, 1.1, 0.1]} />
              <meshStandardMaterial color="#22262c" roughness={0.52} />
            </mesh>
          </group>
        );
      })}
      <SponsorBoard track={track} rain={rain} />
      {barriers.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const x = sample.x + Math.sin(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + track.wallMargin - 0.65);
        const z = sample.z + Math.cos(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + track.wallMargin - 0.65);
        return (
          <group key={`${sample.x}-${sample.z}-barrier`} position={[x, sample.y + 0.34, z]} rotation={[0, sample.heading, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[2.4, 0.68, 0.22]} />
              <meshStandardMaterial color={rain ? "#b8c1c4" : "#d7d7d2"} roughness={0.58} metalness={0.08} />
            </mesh>
            <mesh position={[0, 0.18, 0.13]}>
              <boxGeometry args={[2.1, 0.08, 0.04]} />
              <meshStandardMaterial color={index % 2 === 0 ? "#e04a54" : "#24282f"} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      {track.id === "sakura" && <SakuraFeatureGrove track={track} rain={rain} />}
      {track.id === "alpine" && <AlpineVistaPeak track={track} rain={rain} />}
      <TrackIdentityProps track={track} rain={rain} />
    </group>
  );
});

function SakuraFeatureGrove({ track, rain }: { track: TrackDef; rain: boolean }) {
  const trees = useMemo(() => {
    const metrics = trackMetrics(track);
    const anchor = sampleTrack(track, metrics.totalLength * 0.42);
    const main = tracksidePropPosition(track, anchor, 1, 4.2, 2.2, 1.2);
    return [
      { x: main.x, z: main.z, seed: 104 },
      { x: main.x + Math.sin(anchor.heading + 0.55) * 3.1, z: main.z + Math.cos(anchor.heading + 0.55) * 3.1, seed: 117 },
      { x: main.x - Math.sin(anchor.heading - 0.35) * 2.5, z: main.z - Math.cos(anchor.heading - 0.35) * 2.5, seed: 131 }
    ].map((tree) => ({ ...tree, ...clearTrackPropPosition(track, tree, 2.1, 1.0) }));
  }, [track]);

  return (
    <group>
      {trees.map((tree) => (
        <SakuraTree key={`feature-sakura-${tree.seed}`} position={[tree.x, tree.y, tree.z]} seed={tree.seed} rain={rain} />
      ))}
    </group>
  );
}

function AlpineVistaPeak({ track, rain }: { track: TrackDef; rain: boolean }) {
  const placement = useMemo(() => {
    const metrics = trackMetrics(track);
    const sample = sampleTrack(track, metrics.totalLength * 0.24);
    const position = tracksidePropPosition(track, sample, 1, 14, 13, 2.5);
    return { ...position, heading: sample.heading - 0.45 };
  }, [track]);

  return (
    <group position={[placement.x, placement.y, placement.z]} rotation={[0, placement.heading, 0]}>
      <mesh position={[0, 4.9, 0]} scale={[1.15, 1, 0.86]}>
        <coneGeometry args={[11.5, 15.5, 9]} />
        <meshStandardMaterial color={rain ? "#848c88" : "#8d937f"} roughness={0.96} />
      </mesh>
      <mesh position={[-6.8, 3.2, 4.2]} rotation={[0, -0.35, 0]} scale={[0.78, 0.72, 0.92]}>
        <coneGeometry args={[8.4, 10.4, 8]} />
        <meshStandardMaterial color={rain ? "#737c79" : "#7d8675"} roughness={0.98} />
      </mesh>
      <mesh position={[0, 12.4, 0]} scale={[0.92, 0.82, 0.7]}>
        <coneGeometry args={[4.9, 4.5, 9]} />
        <meshStandardMaterial color={rain ? "#e3e8e8" : "#f4f6f2"} roughness={0.82} />
      </mesh>
      <mesh position={[-6.8, 7.3, 4.2]} rotation={[0, -0.35, 0]} scale={[0.62, 0.58, 0.72]}>
        <coneGeometry args={[3.5, 2.7, 8]} />
        <meshStandardMaterial color={rain ? "#d9e0df" : "#eef1f2"} roughness={0.84} />
      </mesh>
    </group>
  );
}

function SakuraGroundAccents({ track, rain }: { track: TrackDef; rain: boolean }) {
  const patches = useMemo(() => {
    const metrics = trackMetrics(track);
    return [
      { progress: 0.18, side: 1, s: 1.25, extra: 2.4 },
      { progress: 0.39, side: 1, s: 1.05, extra: 3.6 },
      { progress: 0.58, side: -1, s: 0.95, extra: 2.8 },
      { progress: 0.78, side: -1, s: 1.15, extra: 3.2 }
    ].map((patch, index) => {
      const sample = sampleTrack(track, metrics.totalLength * patch.progress);
      const position = tracksidePropPosition(track, sample, patch.side, patch.extra, patch.s * 4.8, 0.8);
      return { ...patch, ...position, rotation: seededUnit(index * 13) * Math.PI };
    });
  }, [track]);

  return (
    <group>
      {patches.map((patch, index) => (
        <mesh key={`sakura-petal-patch-${index}`} position={[patch.x, patch.y + 0.01, patch.z]} rotation={[-Math.PI / 2, 0, patch.rotation]} scale={[patch.s * 4.8, patch.s * 1.8, 1]}>
          <circleGeometry args={[1, 22]} />
          <meshBasicMaterial color={rain ? "#c88da0" : "#f2a8bd"} transparent opacity={rain ? 0.18 : 0.24} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function AlpineBackdrop({ rain }: { rain: boolean }) {
  const mountains = [
    { x: -88, z: 128, h: 22, r: 18 },
    { x: -48, z: 148, h: 29, r: 24 },
    { x: 18, z: 158, h: 20, r: 18 },
    { x: 108, z: 152, h: 31, r: 27 },
    { x: 178, z: 70, h: 24, r: 22 }
  ];
  return (
    <group>
      {mountains.map((mountain, index) => (
        <group key={`mountain-${index}`} position={[mountain.x, mountain.h / 2 - 0.2, mountain.z]} rotation={[0, seededUnit(index * 17) * 0.8, 0]}>
          <mesh>
            <coneGeometry args={[mountain.r, mountain.h, 8]} />
            <meshStandardMaterial color={rain ? "#707975" : "#7f8877"} roughness={0.98} />
          </mesh>
          <mesh position={[0, mountain.h * 0.28, 0]}>
            <coneGeometry args={[mountain.r * 0.38, mountain.h * 0.24, 8]} />
            <meshStandardMaterial color={rain ? "#e5e8e8" : "#f4f6f2"} roughness={0.86} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function TrackIdentityProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  if (track.id === "sakura") return <SakuraProps track={track} rain={rain} />;
  if (track.id === "alpine") return <AlpineProps track={track} rain={rain} />;
  if (track.id === "fjord") return <FjordProps track={track} rain={rain} />;
  return <CloudlineProps track={track} rain={rain} />;
}

function SakuraProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  const samples = useMemo(() => sampleTrackVisuals(track, 23), [track]);
  return (
    <group>
      {samples.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const radius = index % 3 === 1 ? 0.55 : index % 4 === 2 ? 0.95 : 2.1;
        const position = tracksidePropPosition(track, sample, side, 1.8 + seededUnit(index * 5) * 2.4, radius, 0.8);
        const x = position.x;
        const y = position.y;
        const z = position.z;
        if (index % 3 === 1) return <SakuraLantern key={`sakura-lantern-${index}`} position={[x, y, z]} heading={sample.heading} rain={rain} />;
        if (index % 4 === 2) return <SakuraBanner key={`sakura-banner-${index}`} position={[x, y + 0.86, z]} heading={sample.heading - side * 0.28} rain={rain} />;
        return <SakuraTree key={`sakura-tree-${index}`} position={[x, y, z]} seed={index} rain={rain} />;
      })}
    </group>
  );
}

function SakuraTree({ position, seed, rain }: { position: [number, number, number]; seed: number; rain: boolean }) {
  const blossom = rain ? "#d98ea5" : "#f2a8bd";
  const blossomShade = rain ? "#c77d96" : "#ffc1cf";
  const height = 2.3 + seededUnit(seed * 11) * 0.7;
  return (
    <group position={position} rotation={[0, seededUnit(seed * 7) * Math.PI, 0]}>
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, seededUnit(seed * 3) * Math.PI]} scale={[1.8, 1.05, 1]} receiveShadow>
        <circleGeometry args={[1, 18]} />
        <meshBasicMaterial color={blossomShade} transparent opacity={rain ? 0.14 : 0.2} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, height * 0.46, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.22, height, 7]} />
        <meshStandardMaterial color="#5d4037" roughness={0.78} />
      </mesh>
      {[
        [0, height + 0.25, 0],
        [0.42, height - 0.1, 0.08],
        [-0.38, height - 0.18, -0.16],
        [0.12, height + 0.05, -0.52],
        [-0.1, height + 0.02, 0.5]
      ].map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]} scale={[1.24 - index * 0.04, 0.78, 1.0 - index * 0.03]} castShadow>
          <sphereGeometry args={[0.72, 12, 8]} />
          <meshStandardMaterial color={index % 2 === 0 ? blossom : blossomShade} roughness={0.86} />
        </mesh>
      ))}
    </group>
  );
}

function SakuraLantern({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.07, 1.8, 8]} />
        <meshStandardMaterial color="#272322" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.7, 0.08]} castShadow>
        <boxGeometry args={[0.42, 0.36, 0.32]} />
        <meshStandardMaterial color={rain ? "#e6bca8" : "#ffd6b0"} emissive="#6b2518" emissiveIntensity={rain ? 0.6 : 0.35} roughness={0.62} />
      </mesh>
    </group>
  );
}

function SakuraBanner({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh castShadow>
        <boxGeometry args={[1.5, 0.62, 0.08]} />
        <meshStandardMaterial color={rain ? "#cf8fa0" : "#f2a8bd"} roughness={0.72} />
      </mesh>
      <mesh position={[0, -0.56, 0]}>
        <boxGeometry args={[0.08, 1.1, 0.08]} />
        <meshStandardMaterial color="#2b2f35" roughness={0.58} />
      </mesh>
    </group>
  );
}

function AlpineProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  const samples = useMemo(() => sampleTrackVisuals(track, 31), [track]);
  const bridge = sampleTrack(track, trackMetrics(track).totalLength * 0.68);
  return (
    <group>
      {samples.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        if (index % 5 === 2) {
          const position = tracksidePropPosition(track, sample, side, 3.2 + seededUnit(index * 7) * 3.2, 1.8, 0.8);
          return <AlpinePine key={`pine-${index}`} position={[position.x, position.y, position.z]} seed={index} rain={rain} />;
        }
        if (index % 3 === 0) {
          const position = tracksidePropPosition(track, sample, side, 2.5 + seededUnit(index * 9) * 2.8, 3.6, 0.8);
          return <AlpineSnowBank key={`snowbank-${index}`} position={[position.x, position.y + 0.14, position.z]} heading={sample.heading} seed={index} rain={rain} />;
        }
        const position = tracksidePropPosition(track, sample, side, 2.8 + seededUnit(index * 9) * 3.4, 2.5, 0.8);
        return <AlpineRock key={`rock-${index}`} position={[position.x, position.y + 0.25, position.z]} seed={index} rain={rain} />;
      })}
      <AlpineBridge sample={bridge} track={track} rain={rain} />
    </group>
  );
}

function AlpinePine({ position, seed, rain }: { position: [number, number, number]; seed: number; rain: boolean }) {
  const height = 3.0 + seededUnit(seed * 13) * 1.1;
  return (
    <group position={position} rotation={[0, seededUnit(seed * 19) * Math.PI, 0]}>
      <mesh position={[0, height * 0.32, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, height * 0.64, 7]} />
        <meshStandardMaterial color="#4b382b" roughness={0.78} />
      </mesh>
      {[0, 1, 2].map((layer) => (
        <mesh key={layer} position={[0, height * (0.52 + layer * 0.16), 0]} castShadow>
          <coneGeometry args={[1.25 - layer * 0.25, 1.45 - layer * 0.18, 7]} />
          <meshStandardMaterial color={rain ? "#34433d" : "#2f5139"} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, seededUnit(seed * 23) * Math.PI]} scale={[1.4, 0.8, 1]} receiveShadow>
        <circleGeometry args={[1, 16]} />
        <meshBasicMaterial color={rain ? "#d7dedc" : "#edf1ec"} transparent opacity={rain ? 0.18 : 0.24} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function AlpineRock({ position, seed, rain }: { position: [number, number, number]; seed: number; rain: boolean }) {
  return (
    <mesh position={position} rotation={[0, seededUnit(seed * 17) * Math.PI, 0]} scale={[0.9 + seededUnit(seed) * 1.4, 0.42 + seededUnit(seed * 3) * 0.55, 0.75 + seededUnit(seed * 5) * 1.3]} castShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={rain ? "#6f7775" : "#7c8177"} roughness={0.95} />
    </mesh>
  );
}

function AlpineSnowBank({ position, heading, seed, rain }: { position: [number, number, number]; heading: number; seed: number; rain: boolean }) {
  return (
    <mesh position={position} rotation={[0, heading + seededUnit(seed) * 0.5, 0]} scale={[2.2 + seededUnit(seed * 3) * 1.3, 0.22, 0.9 + seededUnit(seed * 5) * 0.5]} receiveShadow>
      <sphereGeometry args={[1, 12, 6]} />
      <meshStandardMaterial color={rain ? "#c9d1d0" : "#eef1f2"} roughness={0.9} />
    </mesh>
  );
}

function AlpineBridge({ sample, track, rain }: { sample: { x: number; y: number; z: number; heading: number }; track: TrackDef; rain: boolean }) {
  return (
    <group position={[sample.x, sample.y, sample.z]} rotation={[0, sample.heading, 0]}>
      {[-1, 1].map((side) => (
        <mesh key={`bridge-wall-${side}`} position={[side * (track.width / 2 + track.curbWidth + 0.7), 1.0, 0]} castShadow>
          <boxGeometry args={[0.55, 2.0, 3.6]} />
          <meshStandardMaterial color={rain ? "#6e7472" : "#8b8d85"} roughness={0.82} />
        </mesh>
      ))}
      <mesh position={[0, 2.35, 0]} castShadow>
        <boxGeometry args={[track.width + track.curbWidth * 2 + 2.6, 0.42, 3.8]} />
        <meshStandardMaterial color={rain ? "#747a78" : "#989b91"} roughness={0.84} />
      </mesh>
      <mesh position={[0, 2.72, -1.2]} castShadow>
        <boxGeometry args={[track.width + track.curbWidth * 2 + 1.7, 0.2, 0.18]} />
        <meshStandardMaterial color={rain ? "#e2e8e8" : "#f3f5f1"} roughness={0.75} />
      </mesh>
    </group>
  );
}

function FjordProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  const bounds = useMemo(() => getTrackBounds(track), [track]);
  const samples = useMemo(() => sampleTrackVisuals(track, 115), [track]);
  const scenicAnchors = useMemo(() => {
    const metrics = trackMetrics(track);
    const waterfallSample = sampleTrack(track, metrics.totalLength * 0.18);
    const villageSample = sampleTrack(track, metrics.totalLength * 0.72);
    const lookoutSample = sampleTrack(track, metrics.totalLength * 0.48);
    return {
      waterfall: { ...tracksidePropPosition(track, waterfallSample, -1, 16, 5.5, 2), heading: waterfallSample.heading + 0.35 },
      village: { ...tracksidePropPosition(track, villageSample, 1, 10, 5, 2), heading: villageSample.heading - 0.35 },
      lookout: { ...tracksidePropPosition(track, lookoutSample, 1, 8, 3, 1.2), heading: lookoutSample.heading - 0.7 }
    };
  }, [track]);

  return (
    <group>
      <FjordWater bounds={bounds} rain={rain} />
      <FjordBackdrop bounds={bounds} rain={rain} />
      <FjordWaterfall position={[scenicAnchors.waterfall.x, scenicAnchors.waterfall.y, scenicAnchors.waterfall.z]} heading={scenicAnchors.waterfall.heading} rain={rain} />
      <FjordVillage position={[scenicAnchors.village.x, scenicAnchors.village.y, scenicAnchors.village.z]} heading={scenicAnchors.village.heading} rain={rain} />
      <FjordLookout position={[scenicAnchors.lookout.x, scenicAnchors.lookout.y, scenicAnchors.lookout.z]} heading={scenicAnchors.lookout.heading} rain={rain} />
      {samples.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        if (index % 4 === 0) {
          const position = tracksidePropPosition(track, sample, side, 5 + seededUnit(index * 5) * 7, 2.3, 1.2);
          return <AlpinePine key={`fjord-pine-${index}`} position={[position.x, position.y, position.z]} seed={index + 200} rain={rain} />;
        }
        if (index % 4 === 1) {
          const position = tracksidePropPosition(track, sample, side, 4 + seededUnit(index * 7) * 6, 2.8, 1.2);
          return <FjordMarker key={`fjord-marker-${index}`} position={[position.x, position.y + 0.42, position.z]} heading={sample.heading - side * 0.35} rain={rain} />;
        }
        const position = tracksidePropPosition(track, sample, side, 5 + seededUnit(index * 9) * 8, 3.2, 1.2);
        return <AlpineRock key={`fjord-rock-${index}`} position={[position.x, position.y + 0.3, position.z]} seed={index + 300} rain={rain} />;
      })}
    </group>
  );
}

function FjordWater({ bounds, rain }: { bounds: TrackBounds; rain: boolean }) {
  const width = bounds.maxX - bounds.minX + 420;
  const depth = bounds.maxZ - bounds.minZ + 420;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(bounds.minX + bounds.maxX) / 2, bounds.minY - 0.47, (bounds.minZ + bounds.maxZ) / 2]}>
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial color={rain ? "#496b78" : "#3c82a6"} roughness={0.38} metalness={0.12} transparent opacity={0.46} />
    </mesh>
  );
}

function FjordBackdrop({ bounds, rain }: { bounds: TrackBounds; rain: boolean }) {
  const peaks = [
    { x: bounds.minX - 120, z: bounds.maxZ + 80, h: 68, r: 52 },
    { x: bounds.maxX + 150, z: bounds.maxZ - 60, h: 82, r: 70 },
    { x: bounds.minX + 180, z: bounds.minZ - 130, h: 62, r: 58 },
    { x: bounds.maxX + 110, z: bounds.minZ + 100, h: 76, r: 64 }
  ];
  return (
    <group>
      {peaks.map((peak, index) => (
        <group key={`fjord-peak-${index}`} position={[peak.x, bounds.minY - 0.3 + peak.h / 2, peak.z]} rotation={[0, seededUnit(index * 19) * 0.8, 0]}>
          <mesh>
            <coneGeometry args={[peak.r, peak.h, 9]} />
            <meshStandardMaterial color={rain ? "#6f7774" : "#77846f"} roughness={0.98} />
          </mesh>
          <mesh position={[0, peak.h * 0.31, 0]}>
            <coneGeometry args={[peak.r * 0.34, peak.h * 0.22, 9]} />
            <meshStandardMaterial color={rain ? "#dfe5e4" : "#eef2f0"} roughness={0.82} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FjordWaterfall({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh position={[0, 7.5, 0]} scale={[1.2, 1, 0.65]} castShadow>
        <coneGeometry args={[6.2, 16, 7]} />
        <meshStandardMaterial color={rain ? "#69716f" : "#747b70"} roughness={0.98} />
      </mesh>
      <mesh position={[0, 6.2, -1.05]} rotation={[0, 0, 0.08]}>
        <planeGeometry args={[1.25, 10.8]} />
        <meshBasicMaterial color={rain ? "#d8eef4" : "#e7fbff"} transparent opacity={rain ? 0.42 : 0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.12, -1.25]} rotation={[-Math.PI / 2, 0, 0]} scale={[2.8, 1.25, 1]}>
        <circleGeometry args={[1, 22]} />
        <meshBasicMaterial color="#cfefff" transparent opacity={rain ? 0.18 : 0.28} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function FjordVillage({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      {[-2.2, 0.4, 2.8].map((x, index) => (
        <group key={`fjord-cabin-${index}`} position={[x, 0, index % 2 === 0 ? 0.8 : -0.75]} rotation={[0, (index - 1) * 0.16, 0]}>
          <mesh position={[0, 0.58, 0]} castShadow>
            <boxGeometry args={[1.55, 1.12, 1.28]} />
            <meshStandardMaterial color={rain ? "#8d4c42" : "#a4473e"} roughness={0.72} />
          </mesh>
          <mesh position={[0, 1.28, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.22, 0.8, 4]} />
            <meshStandardMaterial color={rain ? "#303941" : "#2d3339"} roughness={0.62} />
          </mesh>
          <mesh position={[0, 0.78, -0.66]}>
            <boxGeometry args={[0.58, 0.32, 0.035]} />
            <meshStandardMaterial color={rain ? "#ffe1a0" : "#ffd166"} emissive="#5f300a" emissiveIntensity={rain ? 0.55 : 0.28} roughness={0.48} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.2, 0.06, -2.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.6, 0.75]} />
        <meshStandardMaterial color={rain ? "#463a2e" : "#5b4936"} roughness={0.78} />
      </mesh>
    </group>
  );
}

function FjordLookout({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[2.1, 7]} />
        <meshStandardMaterial color={rain ? "#8a8e87" : "#a6a897"} roughness={0.86} />
      </mesh>
      {[-1.4, 0, 1.4].map((x) => (
        <mesh key={x} position={[x, 0.68, -1.05]}>
          <boxGeometry args={[0.08, 1.2, 0.08]} />
          <meshStandardMaterial color="#2f3438" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.18, -1.05]}>
        <boxGeometry args={[3.2, 0.12, 0.08]} />
        <meshStandardMaterial color="#2f3438" roughness={0.6} />
      </mesh>
    </group>
  );
}

function FjordMarker({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.32, 0.84, 0.22]} />
        <meshStandardMaterial color={rain ? "#dfe7e8" : "#fff7df"} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.2, 0.13]}>
        <boxGeometry args={[0.2, 0.18, 0.035]} />
        <meshStandardMaterial color="#d53d45" roughness={0.5} />
      </mesh>
    </group>
  );
}

function CloudlineProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  const bounds = useMemo(() => getTrackBounds(track), [track]);
  const samples = useMemo(() => sampleTrackVisuals(track, 230), [track]);
  const summit = useMemo(() => {
    const highest = trackMetrics(track).samples.reduce((best, sample) => (sample.y > best.y ? sample : best));
    return { ...tracksidePropPosition(track, highest, 1, 18, 7, 2.5), heading: highest.heading - 0.42 };
  }, [track]);

  return (
    <group>
      <CloudlineBackdrop bounds={bounds} rain={rain} />
      <CloudlineSummit position={[summit.x, summit.y, summit.z]} heading={summit.heading} rain={rain} />
      <CloudWisps bounds={bounds} rain={rain} />
      {samples.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        if (sample.y < 230 && index % 3 !== 1) {
          const position = tracksidePropPosition(track, sample, side, 5 + seededUnit(index * 7) * 8, 2.4, 1.2);
          return <AlpinePine key={`cloud-pine-${index}`} position={[position.x, position.y, position.z]} seed={index + 600} rain={rain} />;
        }
        if (index % 4 === 0) {
          const position = tracksidePropPosition(track, sample, side, 4 + seededUnit(index * 11) * 5, 3.4, 1.2);
          return <AlpineSnowBank key={`cloud-snow-${index}`} position={[position.x, position.y + 0.16, position.z]} heading={sample.heading} seed={index + 700} rain={rain} />;
        }
        const position = tracksidePropPosition(track, sample, side, 5 + seededUnit(index * 13) * 9, 3, 1.2);
        return <AlpineRock key={`cloud-rock-${index}`} position={[position.x, position.y + 0.32, position.z]} seed={index + 800} rain={rain} />;
      })}
    </group>
  );
}

function CloudlineBackdrop({ bounds, rain }: { bounds: TrackBounds; rain: boolean }) {
  const peaks = [
    { x: bounds.minX - 260, z: bounds.minZ + 120, h: 210, r: 150 },
    { x: bounds.maxX + 280, z: bounds.minZ + 260, h: 260, r: 190 },
    { x: bounds.minX + 120, z: bounds.maxZ + 240, h: 230, r: 170 },
    { x: bounds.maxX - 80, z: bounds.maxZ + 290, h: 280, r: 210 }
  ];
  return (
    <group>
      {peaks.map((peak, index) => (
        <group key={`cloudline-peak-${index}`} position={[peak.x, bounds.minY - 0.4 + peak.h / 2, peak.z]} rotation={[0, seededUnit(index * 23) * 0.7, 0]}>
          <mesh>
            <coneGeometry args={[peak.r, peak.h, 9]} />
            <meshStandardMaterial color={rain ? "#6b7273" : "#778179"} roughness={0.98} />
          </mesh>
          <mesh position={[0, peak.h * 0.31, 0]}>
            <coneGeometry args={[peak.r * 0.42, peak.h * 0.24, 9]} />
            <meshStandardMaterial color={rain ? "#dce3e4" : "#f2f5f4"} roughness={0.82} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CloudlineSummit({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6.4, 32]} />
        <meshStandardMaterial color={rain ? "#cfd8d7" : "#eef1f2"} roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[2.3, 2.6, 1.9, 18]} />
        <meshStandardMaterial color={rain ? "#c3c9c8" : "#e3e2d8"} roughness={0.72} />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow>
        <sphereGeometry args={[1.75, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={rain ? "#8fa8b0" : "#9cc4d2"} roughness={0.42} metalness={0.12} />
      </mesh>
      <mesh position={[3.2, 3.35, -0.4]} rotation={[0, 0, 0.08]} castShadow>
        <cylinderGeometry args={[0.12, 0.16, 6.2, 8]} />
        <meshStandardMaterial color="#2c3137" roughness={0.52} />
      </mesh>
      {[0, 1, 2].map((level) => (
        <mesh key={level} position={[3.2, 1.25 + level * 1.45, -0.4]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.72 + level * 0.15, 0.025, 8, 28]} />
          <meshStandardMaterial color={rain ? "#dfe6e6" : "#f8f5e8"} roughness={0.5} metalness={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function CloudWisps({ bounds, rain }: { bounds: TrackBounds; rain: boolean }) {
  const wisps = [
    { x: bounds.minX + 260, y: bounds.maxY * 0.58, z: bounds.maxZ - 420, s: 1.4 },
    { x: bounds.maxX - 520, y: bounds.maxY * 0.68, z: bounds.minZ + 340, s: 1.1 },
    { x: bounds.maxX - 230, y: bounds.maxY * 0.78, z: bounds.maxZ - 780, s: 1.25 }
  ];
  return (
    <group>
      {wisps.map((wisp, index) => (
        <group key={`cloud-wisp-${index}`} position={[wisp.x, wisp.y, wisp.z]} rotation={[0, seededUnit(index * 29) * Math.PI, 0]} scale={[wisp.s, wisp.s * 0.42, wisp.s]}>
          {[-2.2, 0, 2.1].map((x, puff) => (
            <mesh key={puff} position={[x, seededUnit((index + 1) * (puff + 3)) * 0.4, seededUnit(index * 7 + puff) * 1.2]} scale={[2.6 - puff * 0.28, 0.48, 1.2 + puff * 0.22]}>
              <sphereGeometry args={[1, 12, 8]} />
              <meshBasicMaterial color={rain ? "#d7dee1" : "#f7fbff"} transparent opacity={rain ? 0.14 : 0.2} depthWrite={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function RainEffect({ focus, dropCount }: { focus: CarState; dropCount: number }) {
  const group = useRef<THREE.Group>(null);
  const drops = useMemo(() => Array.from({ length: dropCount }, (_, index) => ({
    x: ((index * 37) % 58) - 29,
    y: 2 + ((index * 19) % 30),
    z: ((index * 53) % 72) - 18,
    speed: 0.24 + ((index * 11) % 24) / 100
  })), [dropCount]);

  useFrame(() => {
    if (!group.current) return;
    group.current.position.set(
      focus.x + Math.sin(focus.heading) * 18,
      focus.y,
      focus.z + Math.cos(focus.heading) * 18
    );
    group.current.rotation.y = focus.heading;
    for (const child of group.current.children) {
      if (child.userData.kind === "mist") continue;
      child.position.y -= (child.userData.speed as number) * 3.8;
      child.position.z += (child.userData.speed as number) * 1.1;
      if (child.position.y < 0.1) {
        child.position.y = 31;
        child.position.z = ((child.userData.seed as number) * 53 % 72) - 18;
      }
    }
  });

  return (
    <group ref={group}>
      {drops.map((drop, index) => (
        <mesh key={index} position={[drop.x, drop.y, drop.z]} rotation={[0.55, 0, 0]} userData={{ speed: drop.speed, seed: index }}>
          <boxGeometry args={[index % 3 === 0 ? 0.045 : 0.03, index % 3 === 0 ? 2.2 : 1.55, 0.035]} />
          <meshBasicMaterial color={index % 4 === 0 ? "#ffffff" : "#b9d9e8"} transparent opacity={index % 3 === 0 ? 0.72 : 0.5} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.055, 5]} rotation={[-Math.PI / 2, 0, 0]} userData={{ kind: "mist" }}>
        <planeGeometry args={[22, 34]} />
        <meshBasicMaterial color="#dbecef" transparent opacity={0.14} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CrashExplosions({ events, track }: { events: CrashEvent[]; track: TrackDef }) {
  return (
    <group>
      {events.map((event) => <CrashExplosion key={event.id} event={event} track={track} />)}
    </group>
  );
}

function CrashExplosion({ event, track }: { event: CrashEvent; track: TrackDef }) {
  const group = useRef<THREE.Group>(null);
  const startedAtRef = useRef(performance.now());
  const fire = useRef<THREE.MeshBasicMaterial>(null);
  const cap = useRef<THREE.MeshBasicMaterial>(null);
  const smoke = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const baseScale = 1.15 + event.severity * 0.95;
  const baseY = useMemo(() => event.y ?? nearestTrackPoint(track, { x: event.x, z: event.z }).y, [event.x, event.y, event.z, track]);

  useFrame(() => {
    const age = clamp((performance.now() - startedAtRef.current) / CRASH_EXPLOSION_VISUAL_MS, 0, 1);
    const pop = Math.sin(Math.min(1, age * 1.55) * Math.PI);
    const rise = age * 1.4;
    group.current?.scale.setScalar(baseScale * (0.45 + age * 0.9));
    if (group.current) group.current.position.y = baseY + 0.18 + rise;
    if (fire.current) fire.current.opacity = Math.max(0, 1 - age * 1.65);
    if (cap.current) cap.current.opacity = Math.max(0, 0.72 - age * 0.48);
    if (smoke.current) smoke.current.opacity = Math.max(0, 0.46 - age * 0.34);
    if (ring.current) ring.current.opacity = Math.max(0, pop * 0.42);
  });

  return (
    <group ref={group} position={[event.x, baseY + 0.18, event.z]}>
      <mesh position={[0, 0.34, 0]}>
        <sphereGeometry args={[0.9, 18, 12]} />
        <meshBasicMaterial ref={fire} color={event.kind === "car" ? "#ff7a1a" : "#ffb13d"} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.15, 0]} scale={[1.35, 0.72, 1.35]}>
        <sphereGeometry args={[0.92, 18, 10]} />
        <meshBasicMaterial ref={cap} color="#2e3032" transparent opacity={0.72} depthWrite={false} />
      </mesh>
      {[
        [-0.58, 0.82, 0.14],
        [0.48, 0.7, -0.28],
        [0.05, 1.42, 0.34]
      ].map(([x, y, z], index) => (
        <mesh key={index} position={[x, y, z]} scale={[0.85, 0.65, 0.85]}>
          <sphereGeometry args={[0.62, 12, 8]} />
          <meshBasicMaterial ref={index === 0 ? smoke : undefined} color="#5c6062" transparent opacity={0.42} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.15, 0.055, 8, 36]} />
        <meshBasicMaterial ref={ring} color="#fff1a8" transparent opacity={0.36} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CarEffects({ car, rain, color }: { car: CarState; rain: boolean; color: string }) {
  const speedAmount = clamp(car.speed / 32, 0, 1);
  const dustOpacity = car.surface === "grass" ? speedAmount * 0.26 : 0;
  const sprayOpacity = rain && car.surface !== "grass" ? speedAmount * 0.22 : 0;
  const impactOpacity = car.impact > 0.35 ? clamp(car.impact, 0, 1) * 0.36 : 0;
  if (dustOpacity <= 0 && sprayOpacity <= 0 && impactOpacity <= 0) return null;
  return (
    <group position={[car.x, car.y + 0.12, car.z]} rotation={[0, car.heading, 0]}>
      {dustOpacity > 0 && (
        <>
          <mesh position={[-0.55, 0.02, -2.1]} rotation={[-Math.PI / 2, 0, 0.18]}>
            <planeGeometry args={[1.25, 2.1]} />
            <meshBasicMaterial color="#bca57b" transparent opacity={dustOpacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.55, 0.02, -2.1]} rotation={[-Math.PI / 2, 0, -0.18]}>
            <planeGeometry args={[1.25, 2.1]} />
            <meshBasicMaterial color="#bca57b" transparent opacity={dustOpacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
      {sprayOpacity > 0 && (
        <>
          <mesh position={[-0.62, 0.08, -1.9]} rotation={[-Math.PI / 2, 0, 0.28]}>
            <planeGeometry args={[0.9, 2.5]} />
            <meshBasicMaterial color="#dbecef" transparent opacity={sprayOpacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.62, 0.08, -1.9]} rotation={[-Math.PI / 2, 0, -0.28]}>
            <planeGeometry args={[0.9, 2.5]} />
            <meshBasicMaterial color="#dbecef" transparent opacity={sprayOpacity} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
      {impactOpacity > 0 && (
        <mesh position={[0, 0.25, 0.2]}>
          <sphereGeometry args={[1.15, 12, 8]} />
          <meshBasicMaterial color={color} transparent opacity={impactOpacity} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

type LiveSkidMark = {
  id: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  opacity: number;
};

function DynamicSkidMarks({ cars, rain, quality, track }: { cars: CarState[]; rain: boolean; quality: RaceRenderQuality; track: TrackDef }) {
  const [marks, setMarks] = useState<LiveSkidMark[]>([]);
  const lastSpawnAt = useRef<Record<string, number>>({});
  const spawnInterval = quality === "split" ? 180 : 115;
  const maxMarks = quality === "split" ? 60 : 140;

  useFrame(() => {
    const now = performance.now();
    const additions: LiveSkidMark[] = [];
    for (const car of cars) {
      if (car.finished || car.crashed || car.dnf || car.surface === "grass" || car.speed < 7) continue;
      const brakingMark = car.brake > 0.74 && car.speed > 11;
      const slipMark = car.slip > 0.52 && car.speed > 9;
      if (!brakingMark && !slipMark) continue;
      if (now - (lastSpawnAt.current[car.playerId] ?? 0) < spawnInterval) continue;
      lastSpawnAt.current[car.playerId] = now;

      const forwardX = Math.sin(car.heading);
      const forwardZ = Math.cos(car.heading);
      const rightX = Math.sin(car.heading + Math.PI / 2);
      const rightZ = Math.cos(car.heading + Math.PI / 2);
      const markY = nearestTrackPoint(track, { x: car.x, y: car.y, z: car.z }).y + 0.09;
      const opacity = clamp((car.slip * 0.3 + car.brake * 0.22) * (rain ? 0.55 : 1), 0.12, rain ? 0.24 : 0.42);
      for (const side of [-1, 1]) {
        additions.push({
          id: `${car.playerId}-${side}-${Math.round(now)}`,
          x: car.x - forwardX * 1.18 + rightX * side * 0.62,
          y: markY,
          z: car.z - forwardZ * 1.18 + rightZ * side * 0.62,
          heading: car.heading,
          opacity
        });
      }
    }
    if (additions.length) {
      setMarks((current) => [...current, ...additions].slice(-maxMarks));
    }
  });

  if (marks.length === 0) return null;
  return (
    <group>
      {marks.map((mark) => (
        <mesh key={mark.id} position={[mark.x, mark.y, mark.z]} rotation={[-Math.PI / 2, 0, -mark.heading]}>
          <planeGeometry args={[0.18, 1.35]} />
          <meshBasicMaterial color="#050608" transparent opacity={mark.opacity} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function CarModel({ car, color, dimmed }: { car: CarState; color: string; dimmed?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const initial = useRef({ x: car.x, y: car.y, z: car.z, heading: car.heading });
  const visible = !dimmed;
  const ghosted = visible && Boolean(car.resetInvulnerableUntil);
  const wheelSpin = car.wheelDistance * 3.1;
  const frontSteer = visualWheelSteer(car.steer, 0.48);
  useFrame((_, delta) => {
    if (!group.current) return;
    const amount = smoothingAmount(delta, 18);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, car.x, amount);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, car.y + 0.3, amount);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, car.z, amount);
    group.current.rotation.y = lerpAngle(group.current.rotation.y, car.heading, amount);
  });
  return (
    <group ref={group} position={[initial.current.x, initial.current.y + 0.3, initial.current.z]} rotation={[0, initial.current.heading, 0]}>
      {ghosted && (
        <mesh position={[0, 0.25, 0.15]}>
          <boxGeometry args={[2.6, 0.9, 4.25]} />
          <meshBasicMaterial color="#d9f6ff" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      <mesh castShadow visible={visible} position={[0, 0.06, 0.1]}>
        <boxGeometry args={[0.86, 0.22, 2.85]} />
        <meshStandardMaterial color={color} roughness={0.34} metalness={0.26} />
      </mesh>
      <mesh castShadow visible={visible} position={[0, 0.08, 1.35]}>
        <boxGeometry args={[0.44, 0.16, 1.35]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.22} />
      </mesh>
      <mesh castShadow visible={visible} position={[0, 0.055, 2.06]}>
        <boxGeometry args={[0.26, 0.12, 0.72]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh castShadow visible={visible} position={[0, 0.035, 2.48]}>
        <boxGeometry args={[0.14, 0.09, 0.48]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.18} />
      </mesh>
      <mesh castShadow visible={visible} position={[0, 0.18, 1.45]}>
        <boxGeometry args={[0.12, 0.045, 1.85]} />
        <meshStandardMaterial color="#fffaf0" roughness={0.42} metalness={0.08} />
      </mesh>
      <mesh castShadow visible={visible} position={[-0.56, 0.03, -0.12]}>
        <boxGeometry args={[0.46, 0.24, 1.02]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      <mesh castShadow visible={visible} position={[0.56, 0.03, -0.12]}>
        <boxGeometry args={[0.46, 0.24, 1.02]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      <mesh castShadow visible={visible} position={[0, 0.36, -0.78]}>
        <boxGeometry args={[0.12, 0.62, 0.9]} />
        <meshStandardMaterial color={color} roughness={0.34} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0, 0.24, -0.48]} visible={visible}>
        <boxGeometry args={[0.72, 0.34, 0.72]} />
        <meshStandardMaterial color="#15181d" roughness={0.38} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[0, 0.42, -0.38]} visible={visible}>
        <torusGeometry args={[0.38, 0.035, 8, 24]} />
        <meshStandardMaterial color="#07090c" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.67, -0.44]} rotation={[Math.PI / 2, 0, 0]} visible={visible}>
        <torusGeometry args={[0.54, 0.028, 8, 28, Math.PI]} />
        <meshStandardMaterial color="#0b0e12" roughness={0.42} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.36, -0.84]} visible={visible}>
        <boxGeometry args={[0.95, 0.05, 0.16]} />
        <meshStandardMaterial color="#fffaf0" roughness={0.45} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.22, 2.05]} visible={visible}>
        <boxGeometry args={[2.25, 0.08, 0.34]} />
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 0.1, 2.38]} visible={visible}>
        <boxGeometry args={[2.45, 0.06, 0.18]} />
        <meshStandardMaterial color="#111318" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.02, 2.68]} visible={visible}>
        <boxGeometry args={[2.15, 0.045, 0.14]} />
        <meshStandardMaterial color="#20242a" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[-1.18, 0.15, 2.18]} visible={visible}>
        <boxGeometry args={[0.1, 0.42, 0.46]} />
        <meshStandardMaterial color="#111318" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[1.18, 0.15, 2.18]} visible={visible}>
        <boxGeometry args={[0.1, 0.42, 0.46]} />
        <meshStandardMaterial color="#111318" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[-1.32, 0.08, 2.54]} visible={visible}>
        <boxGeometry args={[0.08, 0.42, 0.34]} />
        <meshStandardMaterial color="#111318" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[1.32, 0.08, 2.54]} visible={visible}>
        <boxGeometry args={[0.08, 0.42, 0.34]} />
        <meshStandardMaterial color="#111318" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[0, 0.58, -1.62]} visible={visible}>
        <boxGeometry args={[2.05, 0.16, 0.36]} />
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 0.78, -1.76]} visible={visible}>
        <boxGeometry args={[1.88, 0.08, 0.24]} />
        <meshStandardMaterial color="#111318" roughness={0.46} />
      </mesh>
      <mesh castShadow position={[0, 0.34, -1.62]} visible={visible}>
        <boxGeometry args={[0.14, 0.6, 0.12]} />
        <meshStandardMaterial color="#15181d" roughness={0.45} />
      </mesh>
      <mesh castShadow position={[0, 0.34, -1.86]} visible={visible}>
        <boxGeometry args={[0.14, 0.6, 0.12]} />
        <meshStandardMaterial color="#15181d" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.48, -2.02]} visible={visible}>
        <sphereGeometry args={[0.07, 12, 8]} />
        <meshStandardMaterial color="#ff2b38" emissive="#b80018" emissiveIntensity={car.surface === "grass" || car.brake > 0.2 ? 1.8 : 0.75} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[-0.55, 0.1, -0.95]} rotation={[0, 0, -0.28]} visible={visible}>
        <boxGeometry args={[0.16, 0.12, 1.22]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0.55, 0.1, -0.95]} rotation={[0, 0, 0.28]} visible={visible}>
        <boxGeometry args={[0.16, 0.12, 1.22]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[-0.68, 0.07, 0.82]} rotation={[0, 0, 0.22]} visible={visible}>
        <boxGeometry args={[0.14, 0.1, 1.18]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0.68, 0.07, 0.82]} rotation={[0, 0, -0.22]} visible={visible}>
        <boxGeometry args={[0.14, 0.1, 1.18]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`suspension-${side}`} visible={visible}>
          <mesh position={[side * 0.54, 0.03, 0.9]} rotation={[0, side * 0.22, side * 0.16]}>
            <boxGeometry args={[0.045, 0.045, 1.15]} />
            <meshStandardMaterial color="#15181d" roughness={0.44} metalness={0.18} />
          </mesh>
          <mesh position={[side * 0.54, 0.03, -0.9]} rotation={[0, side * -0.2, side * -0.14]}>
            <boxGeometry args={[0.045, 0.045, 1.05]} />
            <meshStandardMaterial color="#15181d" roughness={0.44} metalness={0.18} />
          </mesh>
        </group>
      ))}
      {[[-0.9, -1.1], [0.9, -1.1], [-0.9, 1.1], [0.9, 1.1]].map(([x, z]) => {
        const isFront = z > 0;
        const side = x < 0 ? -1 : 1;
        return (
        <group key={`${x}-${z}`} position={[x, -0.05, z]} rotation={[0, isFront ? frontSteer : 0, 0]} visible={visible}>
          <group rotation={[wheelSpin * side, 0, 0]}>
            <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.32, 0.32, 0.28, 24]} />
              <meshStandardMaterial color="#050608" roughness={0.72} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.17, 0.17, 0.3, 18]} />
              <meshStandardMaterial color="#2e333b" roughness={0.36} metalness={0.45} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.325, 0.018, 8, 24]} />
              <meshStandardMaterial color="#161a20" roughness={0.5} />
            </mesh>
            {[0, Math.PI / 3, (Math.PI * 2) / 3].map((angle) => (
              <mesh key={angle} position={[0, 0.21, 0]} rotation={[0, 0, Math.PI / 2 + angle]}>
                <boxGeometry args={[0.3, 0.032, 0.032]} />
                <meshStandardMaterial color="#f1eadc" roughness={0.55} metalness={0.12} />
              </mesh>
            ))}
          </group>
        </group>
        );
      })}
    </group>
  );
}

function Cockpit({ car, color, cockpitStyle }: { car: CarState; color: string; cockpitStyle: CockpitStyle }) {
  const group = useRef<THREE.Group>(null);
  const initial = useRef({ x: car.x, y: car.y, z: car.z, heading: car.heading });
  const wheelSpin = car.wheelDistance * 3.1;
  const frontSteer = visualWheelSteer(car.steer, 0.52);
  useFrame((_, delta) => {
    if (!group.current) return;
    const amount = smoothingAmount(delta, 18);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, car.x, amount);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, car.y + 0.65, amount);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, car.z, amount);
    group.current.rotation.y = lerpAngle(group.current.rotation.y, car.heading, amount);
  });
  return (
    <group ref={group} position={[initial.current.x, initial.current.y + 0.65, initial.current.z]} rotation={[0, initial.current.heading, 0]}>
      <mesh position={[0, -0.22, 1.88]}>
        <boxGeometry args={[0.62, 0.28, 3.3]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.14} />
      </mesh>
      <mesh position={[0, -0.13, 2.28]}>
        <boxGeometry args={[0.34, 0.14, 1.22]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.14} />
      </mesh>
      <mesh position={[0, -0.15, 3.0]}>
        <boxGeometry args={[0.19, 0.1, 0.62]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.14} />
      </mesh>
      <mesh position={[0, -0.17, 3.42]}>
        <boxGeometry args={[0.1, 0.07, 0.28]} />
        <meshStandardMaterial color={color} roughness={0.38} metalness={0.14} />
      </mesh>
      <mesh position={[0, -0.01, 2.3]}>
        <boxGeometry args={[0.1, 0.055, 2.5]} />
        <meshStandardMaterial color="#fffaf0" roughness={0.45} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.0, 2.45]}>
        <boxGeometry args={[1.72, 0.08, 0.42]} />
        <meshStandardMaterial color={color} roughness={0.34} metalness={0.18} />
      </mesh>
      <mesh position={[0, -0.12, 2.78]}>
        <boxGeometry args={[2.02, 0.055, 0.18]} />
        <meshStandardMaterial color="#111318" roughness={0.5} />
      </mesh>
      <mesh position={[-0.92, -0.02, 2.45]}>
        <boxGeometry args={[0.08, 0.26, 0.46]} />
        <meshStandardMaterial color="#101214" roughness={0.48} />
      </mesh>
      <mesh position={[0.92, -0.02, 2.45]}>
        <boxGeometry args={[0.08, 0.26, 0.46]} />
        <meshStandardMaterial color="#101214" roughness={0.48} />
      </mesh>
      <mesh position={[-1.06, -0.05, 2.68]}>
        <boxGeometry args={[0.08, 0.38, 0.32]} />
        <meshStandardMaterial color="#101214" roughness={0.48} />
      </mesh>
      <mesh position={[1.06, -0.05, 2.68]}>
        <boxGeometry args={[0.08, 0.38, 0.32]} />
        <meshStandardMaterial color="#101214" roughness={0.48} />
      </mesh>
      {[[-0.92, 1.5], [0.92, 1.5]].map(([x, z]) => (
        <group key={x} position={[x, -0.1, z]} rotation={[0, frontSteer, 0]}>
          <group rotation={[wheelSpin * (x < 0 ? -1 : 1), 0, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.34, 0.34, 0.22, 22]} />
              <meshStandardMaterial color="#050608" roughness={0.75} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.16, 0.16, 0.24, 16]} />
              <meshStandardMaterial color="#2e333b" roughness={0.36} metalness={0.4} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.345, 0.018, 8, 24]} />
              <meshStandardMaterial color="#161a20" roughness={0.5} />
            </mesh>
            {[0, Math.PI / 3, (Math.PI * 2) / 3].map((angle) => (
              <mesh key={angle} position={[0, 0.22, 0]} rotation={[0, 0, Math.PI / 2 + angle]}>
                <boxGeometry args={[0.31, 0.032, 0.032]} />
                <meshStandardMaterial color="#f1eadc" roughness={0.55} metalness={0.12} />
              </mesh>
            ))}
          </group>
        </group>
      ))}
      <mesh position={[-0.58, -0.08, 1.88]} rotation={[0, 0, 0.28]}>
        <boxGeometry args={[0.1, 0.08, 1.52]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.16} />
      </mesh>
      <mesh position={[0.58, -0.08, 1.88]} rotation={[0, 0, -0.28]}>
        <boxGeometry args={[0.1, 0.08, 1.52]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.16} />
      </mesh>
      <mesh position={[-0.46, 0.02, 0.78]} rotation={[0, 0.24, 0]}>
        <boxGeometry args={[0.42, 0.04, 0.1]} />
        <meshStandardMaterial color="#101214" roughness={0.42} />
      </mesh>
      <mesh position={[0.46, 0.02, 0.78]} rotation={[0, -0.24, 0]}>
        <boxGeometry args={[0.42, 0.04, 0.1]} />
        <meshStandardMaterial color="#101214" roughness={0.42} />
      </mesh>
      <CockpitWheel steer={car.steer} style={cockpitStyle} />
      <CockpitRevLights speed={car.speed} throttle={car.throttle} />
      <mesh position={[0, 0.08, 1.0]}>
        <boxGeometry args={[0.82, 0.18, 0.42]} />
        <meshStandardMaterial color="#101214" roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.2, 0.8]}>
        <torusGeometry args={[0.55, 0.035, 8, 28, Math.PI]} />
        <meshStandardMaterial color="#111318" />
      </mesh>
    </group>
  );
}

function CockpitRevLights({ speed, throttle }: { speed: number; throttle: number }) {
  const level = clamp(speed / 42 + throttle * 0.22, 0, 1);
  const lit = Math.round(level * 7);
  return (
    <group position={[0, 0.29, 0.61]} rotation={[-0.1, 0, 0]}>
      {Array.from({ length: 7 }).map((_, index) => {
        const active = index < lit;
        const color = index < 3 ? "#24c06f" : index < 5 ? "#ffd166" : "#ff3b5c";
        return (
          <mesh key={index} position={[-0.24 + index * 0.08, 0, 0]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <meshStandardMaterial color={active ? color : "#24282f"} emissive={active ? color : "#000000"} emissiveIntensity={active ? 1.8 : 0} roughness={0.36} />
          </mesh>
        );
      })}
    </group>
  );
}

function CockpitWheel({ steer, style }: { steer: number; style: CockpitStyle }) {
  const turn = clamp(steer, -1, 1) * 0.8;
  const hands = useRef<THREE.Group>(null);
  const handTurn = useRef(turn);
  useFrame((_, delta) => {
    handTurn.current = THREE.MathUtils.lerp(handTurn.current, turn, smoothingAmount(delta, 10));
    if (hands.current) hands.current.rotation.z = handTurn.current;
  });
  return (
    <group position={[0, 0.42, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
      <group rotation={[0, 0, turn]}>
        <mesh>
          <torusGeometry args={[0.42, 0.035, 8, 30]} />
          <meshStandardMaterial color="#0b0e12" roughness={0.46} />
        </mesh>
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
          <mesh key={angle} position={[Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, 0]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.44, 0.035, 0.035]} />
            <meshStandardMaterial color="#151922" roughness={0.5} />
          </mesh>
        ))}
      </group>
      {style !== "none" && (
        <group ref={hands} rotation={[0, 0, handTurn.current]}>
          <CockpitHand side={-1} style={style} />
          <CockpitHand side={1} style={style} />
        </group>
      )}
    </group>
  );
}

function CockpitHand({ side, style }: { side: -1 | 1; style: Exclude<CockpitStyle, "none"> }) {
  const x = side * 0.36;
  const skin = style === "paws" ? "#f2c8a4" : "#d4a06f";
  const pad = style === "paws" ? "#5c2b35" : "#1b1d23";
  return (
    <group position={[x, -0.02, 0.02]} rotation={[0, 0, side * -0.16]}>
      <mesh scale={style === "paws" ? [1.12, 0.92, 0.68] : [1.0, 0.82, 0.58]}>
        <sphereGeometry args={[style === "paws" ? 0.145 : 0.12, 18, 12]} />
        <meshStandardMaterial color={skin} roughness={0.76} />
      </mesh>
      {style === "paws" ? (
        <>
          {[-0.09, -0.03, 0.03, 0.09].map((offset) => (
            <mesh key={offset} position={[offset, 0.105 - Math.abs(offset) * 0.12, 0.055]} scale={[1, 0.78, 0.62]}>
              <sphereGeometry args={[0.034, 10, 8]} />
              <meshStandardMaterial color={pad} roughness={0.82} />
            </mesh>
          ))}
          <mesh position={[0, -0.025, 0.065]} scale={[1.25, 0.82, 0.6]}>
            <sphereGeometry args={[0.06, 12, 8]} />
            <meshStandardMaterial color={pad} roughness={0.82} />
          </mesh>
        </>
      ) : (
        <>
          {[-0.06, -0.02, 0.02, 0.06].map((offset) => (
            <mesh key={offset} position={[offset, 0.092, 0.035]} rotation={[0.45, 0, side * 0.08]}>
              <cylinderGeometry args={[0.017, 0.021, 0.15, 8]} />
              <meshStandardMaterial color="#20242d" roughness={0.62} />
            </mesh>
          ))}
          <mesh position={[side * -0.1, -0.025, 0.045]} rotation={[0.15, 0, side * 0.78]}>
            <boxGeometry args={[0.05, 0.16, 0.055]} />
            <meshStandardMaterial color="#20242d" roughness={0.62} />
          </mesh>
        </>
      )}
    </group>
  );
}

function MiniTrack({ track }: { track: TrackDef }) {
  const { minX, maxX, minZ, maxZ } = getTrackBounds(track);
  const points = sampleTrackVisuals(track, 3.8)
    .map((point) => `${((point.x - minX) / (maxX - minX || 1)) * 180 + 10},${((point.z - minZ) / (maxZ - minZ || 1)) * 110 + 10}`)
    .join(" ");
  return (
    <svg className="mini-track" viewBox="0 0 200 130" aria-hidden>
      <polyline points={points} fill="none" stroke="#101214" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="#e84f5f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type TrackBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

function getTrackBounds(track: TrackDef): TrackBounds {
  const samples = sampleTrackVisuals(track, 4);
  const xs = samples.map((point) => point.x);
  const ys = samples.map((point) => point.y);
  const zs = samples.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs)
  };
}

function projectMiniX(x: number, bounds: TrackBounds) {
  return ((x - bounds.minX) / (bounds.maxX - bounds.minX || 1)) * 180 + 15;
}

function projectMiniY(z: number, bounds: TrackBounds) {
  return ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ || 1)) * 120 + 15;
}

function raceStatusText(car: CarState | undefined, lapCount: number) {
  if (!car) return "grid";
  if (car.finished) return "finish";
  if (car.crashed) return "crash";
  if (car.dnf) return "dnf";
  if (!car.timedLapStarted) return "warm-up";
  return `L${Math.min(car.lap, lapCount)}/${lapCount}`;
}

function sampleTrackVisuals(track: TrackDef, spacing: number) {
  const samples: Array<{ x: number; y: number; z: number; heading: number; grade: number; length: number }> = [];
  const metrics = trackMetrics(track);
  const count = Math.max(1, Math.ceil(metrics.totalLength / spacing));
  for (let step = 0; step < count; step += 1) {
    const start = (metrics.totalLength * step) / count;
    const end = (metrics.totalLength * (step + 1)) / count;
    const sample = sampleTrack(track, (start + end) / 2);
    samples.push({ ...sample, length: end - start });
  }
  return samples;
}

function tracksidePropPosition(
  track: TrackDef,
  sample: { x: number; y?: number; z: number; heading: number },
  side: number,
  extraOffset: number,
  radius = 0,
  padding = 0.75
) {
  const rightX = Math.sin(sample.heading + Math.PI / 2);
  const rightZ = Math.cos(sample.heading + Math.PI / 2);
  const baseOffset = track.width / 2 + track.curbWidth + track.wallMargin + extraOffset + radius;
  return clearTrackPropPosition(
    track,
    {
      x: sample.x + rightX * side * baseOffset,
      y: sample.y,
      z: sample.z + rightZ * side * baseOffset
    },
    radius,
    padding
  );
}

function clearTrackPropPosition(track: TrackDef, point: { x: number; y?: number; z: number }, radius = 0, padding = 0.75) {
  const requiredDistance = track.width / 2 + track.curbWidth + track.wallMargin + radius + padding;
  let x = point.x;
  let z = point.z;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nearest = nearestTrackPoint(track, { x, y: point.y, z });
    const missing = requiredDistance - nearest.distance;
    if (missing <= 0) return { x, y: nearest.y, z };

    let awayX = x - nearest.x;
    let awayZ = z - nearest.z;
    const length = Math.hypot(awayX, awayZ);
    if (length < 0.001) {
      awayX = Math.sin(nearest.heading + Math.PI / 2);
      awayZ = Math.cos(nearest.heading + Math.PI / 2);
    } else {
      awayX /= length;
      awayZ /= length;
    }

    x += awayX * (missing + 0.35);
    z += awayZ * (missing + 0.35);
  }

  const nearest = nearestTrackPoint(track, { x, y: point.y, z });
  return { x, y: nearest.y, z };
}

function createElevatedTrackTerrainGeometry(track: TrackDef, baseY: number) {
  const metrics = trackMetrics(track);
  const spacing = track.id === "cloudline" ? 8.5 : 4.8;
  const count = Math.max(64, Math.ceil(metrics.totalLength / spacing));
  const shoulderEdge = track.width / 2 + track.curbWidth + track.wallMargin + 5.5;
  const slopeWidth = track.id === "cloudline" ? 96 : 62;
  const innerSlopeWidth = track.id === "cloudline" ? 34 : 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const side of [-1, 1]) {
    for (let index = 0; index < count; index += 1) {
      const progress = (metrics.totalLength * index) / count;
      const profile = terrainProfileAt(track, progress, side, baseY, shoulderEdge, innerSlopeWidth, slopeWidth);
      const next = (index + 1) % count;
      const nextProgress = (metrics.totalLength * next) / count;
      const nextProfile = terrainProfileAt(track, nextProgress, side, baseY, shoulderEdge, innerSlopeWidth, slopeWidth);
      for (let band = 0; band < 2; band += 1) {
        const a = profile[band];
        const b = nextProfile[band];
        const c = profile[band + 1];
        const d = nextProfile[band + 1];
        if (band === 1 && terrainBandConflictsWithTrack(track, metrics.totalLength, progress, nextProgress, [a, b, c, d])) continue;
        addTerrainQuad(positions, uvs, indices, a, b, c, d, progress / metrics.totalLength, nextProgress / metrics.totalLength);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type TerrainVertex = {
  x: number;
  y: number;
  z: number;
};

function terrainProfileAt(
  track: TrackDef,
  progress: number,
  side: number,
  baseY: number,
  shoulderEdge: number,
  innerSlopeWidth: number,
  slopeWidth: number
): TerrainVertex[] {
  const sample = sampleTrack(track, progress);
  const rightX = Math.sin(sample.heading + Math.PI / 2);
  const rightZ = Math.cos(sample.heading + Math.PI / 2);
  const elevation = Math.max(0.1, sample.y - baseY);
  const midDrop = Math.min(track.id === "cloudline" ? 54 : 24, elevation * 0.64);
  const midY = Math.max(baseY + 0.22, sample.y - midDrop);
  const offsets = [
    side * shoulderEdge,
    side * (shoulderEdge + innerSlopeWidth),
    side * (shoulderEdge + slopeWidth)
  ];
  const heights = [
    sample.y - 0.16,
    midY,
    baseY + 0.02
  ];

  return offsets.map((offset, index) => ({
    x: sample.x + rightX * offset,
    y: heights[index],
    z: sample.z + rightZ * offset
  }));
}

function terrainBandConflictsWithTrack(track: TrackDef, totalLength: number, startProgress: number, endProgress: number, vertices: TerrainVertex[]) {
  if (track.id !== "fjord") return false;
  const midpointProgress = progressMidpoint(startProgress, endProgress, totalLength);
  const probes = [
    { ...vertices[0], progress: startProgress },
    { ...vertices[1], progress: endProgress },
    { ...vertices[2], progress: startProgress },
    { ...vertices[3], progress: endProgress },
    midpoint(vertices[0], vertices[1], midpointProgress),
    midpoint(vertices[2], vertices[3], midpointProgress),
    midpoint(vertices[0], vertices[2], startProgress),
    midpoint(vertices[1], vertices[3], endProgress),
    midpoint(midpoint(vertices[0], vertices[1], midpointProgress), midpoint(vertices[2], vertices[3], midpointProgress), midpointProgress)
  ];
  const clearDistance = track.width / 2 + track.curbWidth + track.wallMargin + 1.8;
  for (const probe of probes) {
    const nearest = nearestTrackPoint(track, { x: probe.x, y: probe.y, z: probe.z });
    const progressGap = progressSeparation(nearest.progress, probe.progress, totalLength);
    if (progressGap > 55 && nearest.distance < clearDistance && Math.abs(nearest.y - probe.y) < 5.5) return true;
  }
  return false;
}

function midpoint(a: TerrainVertex, b: TerrainVertex, progress: number) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    progress
  };
}

function progressSeparation(a: number, b: number, totalLength: number) {
  const direct = Math.abs(a - b);
  return Math.min(direct, totalLength - direct);
}

function progressMidpoint(start: number, end: number, totalLength: number) {
  let delta = end - start;
  if (delta < -totalLength / 2) delta += totalLength;
  if (delta > totalLength / 2) delta -= totalLength;
  return ((start + delta / 2) % totalLength + totalLength) % totalLength;
}

function addTerrainQuad(
  positions: number[],
  uvs: number[],
  indices: number[],
  a: TerrainVertex,
  b: TerrainVertex,
  c: TerrainVertex,
  d: TerrainVertex,
  startUv: number,
  endUv: number
) {
  const vertexStart = positions.length / 3;
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
  uvs.push(0, startUv, 0, endUv, 1, startUv, 1, endUv);
  indices.push(vertexStart, vertexStart + 1, vertexStart + 2, vertexStart + 2, vertexStart + 1, vertexStart + 3);
}

function createTrackRibbonGeometry(track: TrackDef, width: number, lateralOffset: number, y: number, spacing: number) {
  const metrics = trackMetrics(track);
  const count = Math.max(24, Math.ceil(metrics.totalLength / spacing));
  const halfWidth = width / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const progress = (metrics.totalLength * index) / count;
    const sample = sampleTrack(track, progress);
    const rightX = Math.sin(sample.heading + Math.PI / 2);
    const rightZ = Math.cos(sample.heading + Math.PI / 2);
    const centerX = sample.x + rightX * lateralOffset;
    const centerZ = sample.z + rightZ * lateralOffset;
    positions.push(centerX - rightX * halfWidth, sample.y + y, centerZ - rightZ * halfWidth);
    positions.push(centerX + rightX * halfWidth, sample.y + y, centerZ + rightZ * halfWidth);
    uvs.push(0, progress / metrics.totalLength, 1, progress / metrics.totalLength);
  }

  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const left = index * 2;
    const right = left + 1;
    const nextLeft = next * 2;
    const nextRight = nextLeft + 1;
    indices.push(left, nextLeft, right, right, nextLeft, nextRight);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCurbStripeGeometries(track: TrackDef, stripeLength: number) {
  const metrics = trackMetrics(track);
  const stripeCount = Math.min(1200, Math.max(1, Math.ceil(metrics.totalLength / stripeLength)));
  const leftOffset = -track.width / 2 - track.curbWidth / 2;
  const rightOffset = track.width / 2 + track.curbWidth / 2;
  const stripeWidth = track.curbWidth * 0.82;
  const red: THREE.BufferGeometry[] = [];
  const white: THREE.BufferGeometry[] = [];

  for (let index = 0; index < stripeCount; index += 1) {
    const start = (metrics.totalLength * index) / stripeCount;
    const end = (metrics.totalLength * (index + 1)) / stripeCount;
    const left = createTrackRibbonSectionGeometry(track, stripeWidth, leftOffset, 0.083, start, end, 0.9);
    const right = createTrackRibbonSectionGeometry(track, stripeWidth, rightOffset, 0.083, start, end, 0.9);
    if (index % 2 === 0) {
      white.push(left);
      red.push(right);
    } else {
      red.push(left);
      white.push(right);
    }
  }

  return {
    red: mergeIndexedGeometries(red),
    white: mergeIndexedGeometries(white)
  };
}

function createTrackRibbonSectionGeometry(track: TrackDef, width: number, lateralOffset: number, y: number, startProgress: number, endProgress: number, spacing: number) {
  const length = Math.max(0.001, endProgress - startProgress);
  const count = Math.max(2, Math.ceil(length / spacing));
  const halfWidth = width / 2;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index <= count; index += 1) {
    const progress = startProgress + (length * index) / count;
    const sample = sampleTrack(track, progress);
    const rightX = Math.sin(sample.heading + Math.PI / 2);
    const rightZ = Math.cos(sample.heading + Math.PI / 2);
    const centerX = sample.x + rightX * lateralOffset;
    const centerZ = sample.z + rightZ * lateralOffset;
    positions.push(centerX - rightX * halfWidth, sample.y + y, centerZ - rightZ * halfWidth);
    positions.push(centerX + rightX * halfWidth, sample.y + y, centerZ + rightZ * halfWidth);
  }

  for (let index = 0; index < count; index += 1) {
    const left = index * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    indices.push(left, nextLeft, right, right, nextLeft, nextRight);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeIndexedGeometries(geometries: THREE.BufferGeometry[]) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const geometry of geometries) {
    vertexCount += geometry.getAttribute("position").count;
    indexCount += geometry.getIndex()?.count ?? 0;
  }

  const positions = new Float32Array(vertexCount * 3);
  const indices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;
  for (const geometry of geometries) {
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const index = geometry.getIndex();
    positions.set(position.array as ArrayLike<number>, vertexOffset * 3);
    if (index) {
      for (let i = 0; i < index.count; i += 1) {
        indices[indexOffset + i] = index.getX(i) + vertexOffset;
      }
      indexOffset += index.count;
    }
    vertexOffset += position.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  merged.computeVertexNormals();
  return merged;
}

function useGameSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queuedMessagesRef = useRef<object[]>([]);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const reconnectAttemptRef = useRef(0);
  const unmountedRef = useRef(false);
  const [room, setRoom] = useState<RoomState>();
  const [clientId, setClientId] = useState("");
  const [displayGroupId, setDisplayGroupId] = useState<string>();
  const [playerId, setPlayerId] = useState<string>();
  const [joinedToken, setJoinedToken] = useState<string>();
  const [liveStats, setLiveStats] = useState<LiveStats>({ activePlayers: 0 });
  const [feedback, setFeedback] = useState<CarState>();
  const [controllerCrashEvents, setControllerCrashEvents] = useState<CrashEvent[]>([]);
  const [notice, setNotice] = useState<{ id: number; message: string }>();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    unmountedRef.current = false;
    const connect = () => {
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        setNotice(undefined);
        const displaySession = readDisplaySession();
        if (!location.pathname.startsWith("/controller") && displaySession) {
          ws.send(JSON.stringify({ type: "join_display", roomCode: displaySession.roomCode, displayGroupId: displaySession.displayGroupId }));
        }
        for (const message of queuedMessagesRef.current) {
          ws.send(JSON.stringify(message));
        }
        queuedMessagesRef.current = [];
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === "hello") setClientId(message.clientId);
        if (message.type === "live_stats") setLiveStats(message.stats);
        if (message.type === "joined_display") {
          setDisplayGroupId(message.displayGroupId);
          sessionStorage.setItem("sim-drive-display-session", JSON.stringify({ roomCode: message.roomCode, displayGroupId: message.displayGroupId }));
        }
        if (message.type === "joined_controller") {
          setPlayerId(message.playerId);
          setDisplayGroupId(message.displayGroupId);
          setJoinedToken(message.token);
          setNotice(undefined);
        }
        if (message.type === "room_state") setRoom(message.state);
        if (message.type === "race_snapshot") {
          setRoom((current) => current && current.roomCode === message.snapshot.roomCode
            ? {
              ...current,
              phase: message.snapshot.phase,
              countdownEndsAt: message.snapshot.countdownEndsAt,
              raceStartedAt: message.snapshot.raceStartedAt,
              cars: message.snapshot.cars,
              crashEvents: message.snapshot.crashEvents,
              results: message.snapshot.results ?? current.results
            }
            : current);
        }
        if (message.type === "controller_feedback") {
          setFeedback(message.car);
          setControllerCrashEvents(message.crashEvents ?? []);
        }
        if (message.type === "room_closed") {
          console.warn(message.message);
          sessionStorage.removeItem("sim-drive-display-session");
          setRoom(undefined);
          setDisplayGroupId(undefined);
          setPlayerId(undefined);
          setJoinedToken(undefined);
          setFeedback(undefined);
          setControllerCrashEvents([]);
          setNotice({ id: Date.now(), message: message.message });
        }
        if (message.type === "error_notice") {
          console.warn(message.message);
          if (message.message === "Room not found.") {
            sessionStorage.removeItem("sim-drive-display-session");
          }
          setNotice({ id: Date.now(), message: message.message });
        }
      };
      ws.onerror = () => {
        ws.close();
      };
      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        if (unmountedRef.current) return;
        setIsConnected(false);
        setClientId("");
        setPlayerId(undefined);
        setJoinedToken(undefined);
        setFeedback(undefined);
        setControllerCrashEvents([]);
        setNotice({ id: Date.now(), message: "Connection lost. Reconnecting..." });
        const delay = Math.min(3000, 250 * 2 ** reconnectAttemptRef.current);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, []);

  const send = useCallback((message: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState === WebSocket.CONNECTING) {
      if (shouldQueueSocketMessage(message)) queuedMessagesRef.current.push(message);
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) {
      if (shouldQueueSocketMessage(message)) queuedMessagesRef.current.push(message);
      return;
    }
    ws.send(JSON.stringify(message));
  }, []);

  return { room, clientId, displayGroupId, playerId, joinedToken, liveStats, feedback, controllerCrashEvents, notice, isConnected, send };
}

function shouldQueueSocketMessage(message: object) {
  return !("type" in message) || message.type !== "input_frame";
}

function useStoredDisplayTheme() {
  const [mode, setMode] = useState<DisplayThemeMode>(() => readDisplayTheme());
  const setStored = useCallback((next: DisplayThemeMode) => {
    setMode(next);
    localStorage.setItem(DISPLAY_THEME_KEY, next);
  }, []);
  return [mode, setStored] as const;
}

function useResolvedDisplayTheme(mode: DisplayThemeMode) {
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() => getSystemTheme());

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const onChange = () => setSystemTheme(query.matches ? "dark" : "light");
    onChange();
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  return mode === "system" ? systemTheme : mode;
}

function readDisplayTheme(): DisplayThemeMode {
  const value = localStorage.getItem(DISPLAY_THEME_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useStoredNumber(key: string, fallback: number) {
  const [value, setValue] = useState(() => readStoredNumber(key, fallback));
  const setStored = useCallback((next: number) => {
    setValue(next);
    localStorage.setItem(key, String(next));
  }, [key]);
  return [value, setStored] as const;
}

function useStoredRangeNumber(key: string, fallback: number, min: number, max: number) {
  const [value, setValue] = useState(() => readStoredRangeNumber(key, fallback, min, max));
  const setStored = useCallback((next: number) => {
    const value = Math.round(clamp(next, min, max));
    setValue(value);
    localStorage.setItem(key, String(value));
  }, [key, min, max]);
  return [value, setStored] as const;
}

function useStoredBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => readStoredBoolean(key, fallback));
  const setStored = useCallback((next: boolean) => {
    setValue(next);
    localStorage.setItem(key, next ? "true" : "false");
  }, [key]);
  return [value, setStored] as const;
}

function readStoredNumber(key: string, fallback: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
}

function readStoredRangeNumber(key: string, fallback: number, min: number, max: number) {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? Math.round(clamp(value, min, max)) : fallback;
}

function readStoredBoolean(key: string, fallback: boolean) {
  const value = localStorage.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function makeControllerUrl(roomCode: string, displayGroupId?: string) {
  const url = new URL("/controller", location.origin);
  url.searchParams.set("room", roomCode);
  if (displayGroupId) url.searchParams.set("group", displayGroupId);
  return url.toString();
}

type ControllerSession = {
  roomCode: string;
  displayGroupId: string;
  token: string;
};

function controllerTokenKey(roomCode: string) {
  return `sim-drive-token-${roomCode}`;
}

function readControllerSession(): ControllerSession | undefined {
  try {
    const value = localStorage.getItem(CONTROLLER_SESSION_KEY);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as Partial<ControllerSession>;
    if (!parsed.roomCode || !parsed.token) return undefined;
    return {
      roomCode: parsed.roomCode.toUpperCase(),
      displayGroupId: parsed.displayGroupId ?? "",
      token: parsed.token
    };
  } catch {
    return undefined;
  }
}

function writeControllerSession(session: ControllerSession) {
  const roomCode = session.roomCode.toUpperCase();
  localStorage.setItem(controllerTokenKey(roomCode), session.token);
  localStorage.setItem(CONTROLLER_SESSION_KEY, JSON.stringify({ ...session, roomCode }));
}

function clearControllerSession(roomCode?: string) {
  const session = readControllerSession();
  if (!roomCode || session?.roomCode === roomCode.toUpperCase()) {
    localStorage.removeItem(CONTROLLER_SESSION_KEY);
  }
  if (roomCode) localStorage.removeItem(controllerTokenKey(roomCode.toUpperCase()));
}

function readDisplaySession() {
  try {
    const value = sessionStorage.getItem("sim-drive-display-session");
    if (!value) return undefined;
    const parsed = JSON.parse(value) as { roomCode?: string; displayGroupId?: string };
    if (!parsed.roomCode || !parsed.displayGroupId) return undefined;
    return { roomCode: parsed.roomCode, displayGroupId: parsed.displayGroupId };
  } catch {
    return undefined;
  }
}

function wsUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

async function enableControllerDevice() {
  const motion = await requestMotion();
  await requestLandscape();
  return motion;
}

function phoneIsLandscape() {
  return window.innerWidth > window.innerHeight;
}

async function requestMotion() {
  if (!sensorSupported()) {
    return { enabled: false, message: "Motion unavailable in this browser" };
  }
  if (!motionContextAllowed()) {
    return { enabled: false, message: "Motion needs HTTPS on this phone" };
  }
  const orientation = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<PermissionState> };
  if (typeof orientation.requestPermission === "function") {
    const permission = await orientation.requestPermission();
    return {
      enabled: permission === "granted",
      message: permission === "granted" ? "Motion ready" : "Motion permission denied"
    };
  }
  return { enabled: true, message: "Motion ready" };
}

function motionInitialStatus() {
  if (!sensorSupported()) return "Touch steering";
  if (!motionContextAllowed()) return "Motion needs HTTPS";
  return "Motion waiting";
}

function motionLobbyStatus() {
  if (!sensorSupported()) return "Motion unavailable";
  if (!motionContextAllowed()) return "Motion needs HTTPS on this phone";
  return "Motion ready";
}

function sensorSupported() {
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
}

function motionContextAllowed() {
  return typeof window !== "undefined" && window.isSecureContext;
}

async function requestLandscape() {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
  };
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: "landscape") => Promise<void>;
  };

  try {
    if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
      if (element.requestFullscreen) await element.requestFullscreen();
      else if (element.webkitRequestFullscreen) await element.webkitRequestFullscreen();
    }
  } catch {
    // Some mobile browsers only allow fullscreen from certain gestures.
  }

  try {
    await orientation.lock?.("landscape");
  } catch {
    // iOS Safari and some embedded browsers do not support orientation locking.
  }
}

function getScreenAngle() {
  const legacyWindow = window as Window & { orientation?: number };
  return screen.orientation?.angle ?? legacyWindow.orientation ?? 0;
}

function motionOrientationFrameKey(angle = getScreenAngle()) {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  return `${normalizedAngle}:${phoneIsLandscape() ? "landscape" : "portrait"}`;
}

function readMotionCalibration(frame = motionOrientationFrameKey()) {
  if (!latestMotionCalibration) return undefined;
  if (latestMotionCalibration.frame !== frame) return undefined;
  if (Date.now() - latestMotionCalibration.capturedAt > MOTION_CALIBRATION_MAX_AGE_MS) return undefined;
  return latestMotionCalibration;
}

function writeMotionCalibration(calibration: MotionCalibration) {
  latestMotionCalibration = calibration;
}

function readSteeringTilt(event: DeviceOrientationEvent, angle: number) {
  const beta = event.beta ?? 0;
  const gamma = event.gamma ?? 0;
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const isLandscape = phoneIsLandscape();

  if (isLandscape && normalizedAngle === 270) return beta;
  if (isLandscape) return -beta;
  if (normalizedAngle === 90) return beta;
  if (normalizedAngle === 270) return -beta;
  if (normalizedAngle === 180) return -gamma;
  return gamma;
}

function steeringFromTilt(raw: number, neutral: number, sensitivity: number, direction: number) {
  const value = clamp(((raw - neutral) / 28) * sensitivity * direction, -1, 1);
  const magnitude = Math.abs(value);
  if (magnitude < MOTION_STEERING_DEADZONE) return 0;
  return Math.sign(value) * ((magnitude - MOTION_STEERING_DEADZONE) / (1 - MOTION_STEERING_DEADZONE));
}

function motionSamplesStable(values: number[]) {
  if (values.length < MOTION_NEUTRAL_MIN_SAMPLES) return false;
  return Math.max(...values) - Math.min(...values) <= MOTION_NEUTRAL_MAX_SPREAD;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

type ControllerAudio = {
  context: AudioContext;
  engineOsc: OscillatorNode;
  engineGain: GainNode;
  tireSource: AudioBufferSourceNode;
  tireGain: GainNode;
  tireFilter: BiquadFilterNode;
  brakeOsc: OscillatorNode;
  brakeGain: GainNode;
  curbOsc: OscillatorNode;
  curbGain: GainNode;
  masterGain: GainNode;
  lastCountdownMark?: number | "go";
  lastImpactAt: number;
  lastCrashEventId?: string;
};

let sharedControllerAudio: ControllerAudio | null = null;

function unlockControllerAudio() {
  sharedControllerAudio ??= createControllerAudio();
  void sharedControllerAudio.context.resume();
  return sharedControllerAudio;
}

function createControllerAudio(): ControllerAudio {
  const context = new AudioContext();
  const masterGain = context.createGain();
  masterGain.gain.value = 0.92;
  masterGain.connect(context.destination);

  const engineOsc = context.createOscillator();
  const engineGain = context.createGain();
  engineOsc.type = "triangle";
  engineOsc.frequency.value = 64;
  engineGain.gain.value = 0;
  engineOsc.connect(engineGain);
  engineGain.connect(masterGain);
  engineOsc.start();

  const tireSource = context.createBufferSource();
  tireSource.buffer = createNoiseBuffer(context);
  tireSource.loop = true;
  const tireFilter = context.createBiquadFilter();
  const tireGain = context.createGain();
  tireFilter.type = "bandpass";
  tireFilter.frequency.value = 1500;
  tireFilter.Q.value = 0.9;
  tireGain.gain.value = 0;
  tireSource.connect(tireFilter);
  tireFilter.connect(tireGain);
  tireGain.connect(masterGain);
  tireSource.start();

  const brakeOsc = context.createOscillator();
  const brakeGain = context.createGain();
  brakeOsc.type = "triangle";
  brakeOsc.frequency.value = 240;
  brakeGain.gain.value = 0;
  brakeOsc.connect(brakeGain);
  brakeGain.connect(masterGain);
  brakeOsc.start();

  const curbOsc = context.createOscillator();
  const curbGain = context.createGain();
  curbOsc.type = "square";
  curbOsc.frequency.value = 38;
  curbGain.gain.value = 0;
  curbOsc.connect(curbGain);
  curbGain.connect(masterGain);
  curbOsc.start();

  return {
    context,
    engineOsc,
    engineGain,
    tireSource,
    tireGain,
    tireFilter,
    brakeOsc,
    brakeGain,
    curbOsc,
    curbGain,
    masterGain,
    lastImpactAt: 0
  };
}

function updateControllerAudio(audio: ControllerAudio | null, car: CarState | undefined, room: RoomState, pedals: { throttle: number; brake: number }, crashEvents: CrashEvent[]) {
  if (!audio || audio.context.state !== "running") return;
  if (room.phase !== "countdown" && room.phase !== "racing") {
    silenceControllerAudio(audio);
    return;
  }

  const now = audio.context.currentTime;
  const raceCar = car;
  const speed = raceCar?.speed ?? 0;
  const throttle = raceCar?.throttle ?? pedals.throttle;
  const brake = raceCar?.brake ?? pedals.brake;
  const slip = raceCar?.slip ?? 0;
  const surface = raceCar?.surface ?? "road";
  const impact = raceCar?.impact ?? 0;
  const crashEvent = crashEvents[crashEvents.length - 1];

  const rev = clamp(speed / 42 + throttle * 0.46, 0, 1.35);
  audio.engineOsc.frequency.setTargetAtTime(64 + rev * 215, now, 0.055);
  audio.engineGain.gain.setTargetAtTime(0.035 + rev * 0.075, now, 0.08);

  const tireAmount = clamp(slip * 0.75 + (surface === "grass" ? 0.38 : 0) + (surface === "curb" ? 0.25 : 0), 0, 1);
  audio.tireFilter.frequency.setTargetAtTime(780 + speed * 42, now, 0.05);
  audio.tireGain.gain.setTargetAtTime(tireAmount * 0.085, now, 0.04);

  const brakeAmount = brake > 0.12 && speed > 4 ? brake * clamp(speed / 30, 0, 1) : 0;
  audio.brakeOsc.frequency.setTargetAtTime(160 + brake * 380 + speed * 4, now, 0.05);
  audio.brakeGain.gain.setTargetAtTime(brakeAmount * 0.06, now, 0.04);

  const curbAmount = surface === "curb" && speed > 4 ? clamp(speed / 35, 0.15, 1) : 0;
  audio.curbGain.gain.setTargetAtTime(curbAmount * 0.05, now, 0.025);

  if (impact > 0.18 && now - audio.lastImpactAt > 0.16) {
    audio.lastImpactAt = now;
    playCue(audio, "impact", impact);
  }
  if (crashEvent && audio.lastCrashEventId !== crashEvent.id) {
    audio.lastCrashEventId = crashEvent.id;
    audio.lastImpactAt = now;
    playCue(audio, "explosion", crashEvent.severity);
  }

  updateCountdownAudio(audio, room);
}

function silenceControllerAudio(audio: ControllerAudio | null) {
  if (!audio) return;
  const now = audio.context.currentTime;
  audio.engineGain.gain.setTargetAtTime(0, now, 0.08);
  audio.tireGain.gain.setTargetAtTime(0, now, 0.04);
  audio.brakeGain.gain.setTargetAtTime(0, now, 0.04);
  audio.curbGain.gain.setTargetAtTime(0, now, 0.04);
  audio.lastCountdownMark = undefined;
}

function updateCountdownAudio(audio: ControllerAudio, room: RoomState) {
  if (room.phase !== "countdown" || !room.countdownEndsAt) {
    audio.lastCountdownMark = undefined;
    return;
  }
  const remaining = Math.max(0, room.countdownEndsAt - Date.now());
  const mark = remaining > 220 ? Math.ceil(remaining / 1000) : "go";
  if (audio.lastCountdownMark === mark) return;
  audio.lastCountdownMark = mark;
  playCue(audio, mark === "go" ? "go" : "countdown");
}

function playCue(audio: ControllerAudio, kind: "countdown" | "go" | "impact" | "explosion" | "start", intensity = 1) {
  const context = audio.context;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  osc.type = kind === "impact" || kind === "explosion" ? "square" : "sine";
  osc.frequency.value = kind === "go" ? 880 : kind === "countdown" ? 560 : kind === "explosion" ? 54 : kind === "impact" ? 80 : 660;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "explosion" ? 0.24 * intensity : kind === "impact" ? 0.18 * intensity : 0.12, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "go" ? 0.34 : kind === "explosion" ? 0.46 : kind === "impact" ? 0.16 : 0.18));
  osc.connect(gain);
  gain.connect(audio.masterGain);
  osc.start(now);
  osc.stop(now + (kind === "explosion" ? 0.52 : 0.38));
}

function createNoiseBuffer(context: AudioContext) {
  const length = Math.floor(context.sampleRate * 1.2);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function hapticsSupported() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function hapticSupportMessage() {
  if (isIOS()) return "iOS browsers do not support web vibration";
  if (!hapticsSupported()) return "No Vibration API in this browser";
  if (isFirefox()) return "Limited in Firefox; test on this phone";
  if (isAndroid()) return "Haptics ready. Test on this phone.";
  return "Haptics ready";
}

function hapticShortStatus() {
  if (!hapticsSupported()) return "No haptics";
  if (isFirefox()) return "Test haptics";
  return "Haptics on";
}

function hapticResultMessage(result: boolean, detail: "detail" | "compact" = "detail") {
  if (!hapticsSupported()) return "No Vibration API";
  if (!result) return "Vibration blocked";
  if (detail === "compact") return "Pulse requested";
  if (isAndroid()) return "Pulse requested. If no buzz, check Silent/DND, power saving, and touch vibration.";
  return "Pulse requested";
}

function pulseHaptic(pattern: number | number[]) {
  if (!hapticsSupported()) return false;
  return navigator.vibrate(pattern);
}

function stopHaptics() {
  if (hapticsSupported()) navigator.vibrate(0);
}

function isFirefox() {
  return typeof navigator !== "undefined" && /firefox|fennec|fxios/i.test(navigator.userAgent);
}

function isRecommendedAndroidControllerBrowser() {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  return /android/i.test(userAgent)
    && /chrome|chromium|edga|opr|opera|samsungbrowser/i.test(userAgent)
    && !/firefox|fennec|wv/i.test(userAgent)
    && !isInAppBrowser();
}

function isInAppBrowser() {
  return typeof navigator !== "undefined" && /FBAN|FBAV|Instagram|Line\/|TikTok|Snapchat|Twitter|LinkedInApp|Pinterest/i.test(navigator.userAgent);
}

function isAndroid() {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

function isIOS() {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function controllerBrowserRecommendation() {
  if (isRecommendedAndroidControllerBrowser()) return undefined;
  if (isInAppBrowser()) return "Open this controller in a Chromium-based browser on Android for reliable motion steering and haptics. In-app browsers often block sensors.";
  if (isIOS()) return "Chrome on iPhone still uses iOS browser limits. Steering can work, but web vibration is not supported; Android Chromium browsers give the full feedback experience.";
  if (isAndroid()) return "A Chromium-based Android browser is recommended for the most reliable motion steering and haptic feedback.";
  return "A Chromium-based Android browser is recommended for the best phone controller motion and haptic feedback.";
}

function driveHaptics(
  car: CarState | undefined,
  pedals: { throttle: number; brake: number },
  enabled: boolean,
  lastHapticAtRef: React.MutableRefObject<number>,
  crashEvents: CrashEvent[],
  lastCrashEventIdRef: React.MutableRefObject<string | undefined>
) {
  if (!enabled || !hapticsSupported()) return;

  const now = performance.now();
  const crashEvent = crashEvents[crashEvents.length - 1];
  if (crashEvent && lastCrashEventIdRef.current !== crashEvent.id) {
    lastCrashEventIdRef.current = crashEvent.id;
    if (pulseHaptic([120, 45, 190, 55, 90])) lastHapticAtRef.current = now;
    return;
  }
  if (!car) return;
  const speedKmh = speedToKmh(car.speed);
  if (car.impact > 0.2 && now - lastHapticAtRef.current > 240) {
    if (pulseHaptic(Math.round(45 + car.impact * 95))) lastHapticAtRef.current = now;
    return;
  }
  if (pedals.brake > 0.72 && speedKmh > 35 && now - lastHapticAtRef.current > 260) {
    if (pulseHaptic([18, 24, 18])) lastHapticAtRef.current = now;
    return;
  }
  if (car.surface === "curb" && speedKmh > 18 && now - lastHapticAtRef.current > 120) {
    if (pulseHaptic(18)) lastHapticAtRef.current = now;
    return;
  }
  if (car.surface === "grass" && speedKmh > 20 && now - lastHapticAtRef.current > 180) {
    if (pulseHaptic(24)) lastHapticAtRef.current = now;
    return;
  }
  if (car.slip > 0.5 && speedKmh > 25 && now - lastHapticAtRef.current > 220) {
    if (pulseHaptic(16)) lastHapticAtRef.current = now;
  }
}

function createSponsorTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#101214";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#35a7ff";
    context.fillRect(0, 0, canvas.width, 18);
    context.fillRect(0, canvas.height - 18, canvas.width, 18);
    context.strokeStyle = "#fffaf0";
    context.lineWidth = 8;
    context.strokeRect(18, 30, canvas.width - 36, canvas.height - 60);
    context.fillStyle = "#fffaf0";
    context.font = "900 74px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("#vibejam", canvas.width / 2, canvas.height / 2 + 4);
    context.fillStyle = "#e84f5f";
    context.fillRect(42, 48, 42, 14);
    context.fillRect(canvas.width - 84, canvas.height - 62, 42, 14);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function seededUnit(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function angleDeltaLocal(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function steeringSensitivityFromLevel(level: number) {
  return 0.6 + clamp(level, 1, 10) * 0.16;
}

function visualWheelSteer(steer: number, amount: number) {
  if (Math.abs(steer) < 0.06) return 0;
  return steer < 0 ? -amount : amount;
}

function smoothingAmount(delta: number, response: number) {
  return 1 - Math.exp(-response * delta);
}

function lerpAngle(current: number, target: number, amount: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * amount;
}
