import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Activity, ArrowLeft, ArrowRight, Flag, Gamepad2, Gauge, Grid2X2, Info, Maximize2, Minus, Monitor, Moon, Play, Plus, RotateCcw, Search, Smartphone, Sun, Trophy, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
const DEV_ASSET_ROUTE = "/dev-assets";
const IS_DEV_BUILD = import.meta.env.DEV;

type MotionCalibration = {
  frame: string;
  neutral: number;
  capturedAt: number;
};

let latestMotionCalibration: MotionCalibration | undefined;
let latestServerClockOffsetMs = 0;

type DisplayThemeMode = "system" | "light" | "dark";

function updateServerClock(serverNow: number) {
  latestServerClockOffsetMs = serverNow - Date.now();
}

function currentServerTimeMs() {
  return Date.now() + latestServerClockOffsetMs;
}

export function App() {
  if (IS_DEV_BUILD && location.pathname.startsWith(DEV_ASSET_ROUTE)) return <DevAssetGallery />;
  const isController = location.pathname.startsWith("/controller");
  return isController ? <ControllerApp /> : <DisplayApp />;
}

function DisplayApp() {
  const game = useGameSocket();
  const [joinCode, setJoinCode] = useState("");
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [themeMode, setThemeMode] = useStoredDisplayTheme();
  const resolvedTheme = useResolvedDisplayTheme(themeMode);
  const themeClass = `display-theme theme-${resolvedTheme}`;
  const themeToggle = <ThemeToggle mode={themeMode} onChange={setThemeMode} />;
  const activePlayers = game.liveStats.activePlayers;

  if (!game.room) {
    return (
      <main className={`landing ${themeClass}`}>
        <button className="landing-about-link" type="button" onClick={() => setIsAboutOpen(true)}>
          <Info size={15} /> About
        </button>
        <section className="hero">
          <div className="hero-copy-wrap">
            <p className="eyebrow">Real sim-racing energy, no rig required.</p>
            <h1>Sim Drive</h1>
            <p className="hero-kicker">The closest thing to pro sim racing that runs in a browser and uses your phone as the wheel. But also a party game lol.</p>
            <p className="hero-copy">
              Tilt to steer. Touch to throttle &amp; brake.
              <br />
              Feel your car: engine roar, tire slip, curb rumble, and rain grip through sound + haptics.
            </p>
            <div className="hero-actions">
              <button className="primary" onClick={() => game.send({ type: "create_room" })}>
                <Play size={18} /> Create Game
              </button>
              <span className="hero-action-or">or</span>
              <form
                className="join-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (joinCode.trim()) game.send({ type: "join_display", roomCode: joinCode.trim().toUpperCase() });
                }}
              >
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={4} />
                <button type="submit">Join Room on This Screen</button>
              </form>
            </div>
            <small className="hero-note">No install needed. Play solo, 4-way split-screen, two 4-way split screens, or everyone on their own screen :D</small>
            {activePlayers > 0 && (
              <div className="hero-live-stat" aria-live="polite">
                <Users size={16} />
                <span>{activePlayers} driver{activePlayers === 1 ? "" : "s"} online now</span>
              </div>
            )}
            <div className="hero-flow" aria-label="How Sim Drive works">
              <div>
                <strong>Host screen</strong>
                <span>Host on TV, laptop, projector, or screen share.</span>
              </div>
              <div>
                <strong>Phone controllers</strong>
                <span>Scan the QR. Each player gets tilt steering + touch pedals, and can even choose paw hands hehe.</span>
              </div>
              <div>
                <strong>Race options</strong>
                <span>Choose laps, track, rain, ghost cars, gentle assist, warm-up start, and reset rules.</span>
              </div>
              <div>
                <strong>Physics</strong>
                <span>Dynamic traction, downforce, rain grip, slip, curbs, and crash-out contact.</span>
              </div>
            </div>
            <div className="hero-pills" aria-label="Game features">
              <span><Smartphone size={16} /> Phone steering</span>
              <span><Gauge size={16} /> Exploding cars</span>
              <span><Gamepad2 size={16} /> Sound + haptics</span>
              <span><Users size={16} /> 1-8 drivers</span>
            </div>
          </div>
          <HeroShowcase />
        </section>
        {isAboutOpen && <HomeAboutModal onClose={() => setIsAboutOpen(false)} />}
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

function HomeAboutModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="about-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button className="about-close" type="button" onClick={onClose}>
          Close
        </button>
        {/* Sim Drive about story: personal background and inspiration for the home page overlay. */}
        <p className="eyebrow about-eyebrow">inspiration</p>
        <h2 id="about-title">made for fun</h2>
        <div className="about-body">
          <p>
            Multiplayer games were a big part of growing up, not just digital games, but board and card games too.
          </p>
          <p>
            We used to meet up at someone's house and play, from Halo to COD, then PUBG, then Among Us, Codenames, and my current favourites and inspo for Sim Drive:{" "}
            <a href="https://www.jackboxgames.com/?utm_source=simdrive.xyz" target="_blank" rel="noreferrer">
              Jackbox Games
            </a>{" "}
            and{" "}
            <a href="https://gamingcouch.com/?utm_source=simdrive.xyz" target="_blank" rel="noreferrer">
              Gaming Couch
            </a>
            .
          </p>
          <p>
            As we got older and moved away, online "party games" became much more of a thing for us, and even when we met in person, if it wasn't a board game, we'd still play a party game.
          </p>
          <p>
            Jackbox has been a staple for us, and the much more recent Gaming Couch is looking to take its place.
          </p>
          <p>
            This game carries my love for these games that gave me and my friends so much laughter, joy, yelling, and hoarse throats.
          </p>
          <p>
            Some of the games I enjoyed the most were racing games in my early years, and currently it's Mario Kart.
          </p>
          <p>
            When the PS3 came out, it had this Sixaxis controller that was fucking awesome sounding, but so few games took advantage of it. And now that our phones are awesome, I thought I could make my own dreams come true and give my crew a new game to have fun with :D
          </p>
          <p>
            I hope you enjoy this. It's my first game, and it's made with love &lt;3
          </p>
          <p className="about-signoff">And tokens, lol.</p>
        </div>
      </section>
    </div>
  );
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
  const localPlayerCount = room.players.filter((player) => player.displayGroupId === displayGroupId).length;

  return (
    <main className={`lobby ${themeClass}`}>
      {themeToggle}
      <section className="join-card">
        <div className="join-label">Join this screen</div>
        <div className="qr-wrap">
          <QRCodeSVG value={controllerUrl} size={260} bgColor="#f5f1e8" fgColor="#101214" />
        </div>
        <div className="room-code">{room.roomCode}</div>
        <p>Scan with your phone. Tilt to steer.</p>
        <small className="screen-note">Your friends can have their own view. Tell them to join on their computer with your room code.</small>
        <div className="join-card-stats">
          <span>{localPlayerCount}/4 this screen</span>
          <span>{room.players.length}/8 room</span>
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
  const countdown = room.countdownEndsAt ? Math.max(0, Math.ceil((room.countdownEndsAt - currentServerTimeMs()) / 1000)) : 0;
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
    return <RaceController send={game.send} feedback={game.feedback} crashEvents={game.controllerCrashEvents} countdownMark={game.controllerCountdownMark} room={game.room} playerId={game.playerId} />;
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

function RaceController({ send, feedback, crashEvents, countdownMark, room, playerId }: { send: ReturnType<typeof useGameSocket>["send"]; feedback?: CarState; crashEvents: CrashEvent[]; countdownMark?: number; room: RoomState; playerId: string }) {
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
  const countdownMarkRef = useRef(countdownMark);
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
    countdownMarkRef.current = countdownMark;
  }, [countdownMark]);

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
      if (audioEnabled) updateControllerAudio(audioRef.current, activeFeedback, roomRef.current, activePedals, crashEventsRef.current, countdownMarkRef.current);
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

type DevAsset = {
  group: string;
  name: string;
  note?: string;
  pivot?: [number, number, number];
  zoom?: number;
  render: (rain: boolean) => ReactNode;
};

type DevThemeMode = "system" | "dark" | "light";
type DevAssetViewMode = "grid" | "focus";
type DevAssetScaleMode = "fit" | "world";
type DevAssetViewport = {
  zoom: number;
  panX: number;
  panY: number;
};
type DevAssetPoint = {
  x: number;
  y: number;
};
type DevAssetViewportSize = {
  width: number;
  height: number;
};

const DEV_ASSET_MIN_ZOOM = 1;
const DEV_ASSET_MAX_ZOOM = 4;
const DEV_ASSET_ZOOM_STEP = 1.22;
const DEV_ASSET_DEFAULT_VIEWPORT: DevAssetViewport = { zoom: 1, panX: 0, panY: 0 };

const DEV_ASSET_CAR: CarState = {
  playerId: "dev-preview",
  carSetupId: DEFAULT_CAR_SETUP_ID,
  x: 0,
  y: 0,
  z: 0,
  velocityX: 0,
  velocityZ: 0,
  heading: 0,
  speed: 18,
  steer: 0.18,
  throttle: 0.4,
  brake: 0,
  lap: 1,
  progress: 0,
  distanceThisLap: 0,
  nextCheckpoint: 0,
  lastValidProgress: 0,
  timedLapStarted: false,
  timedRaceStartedAt: 0,
  currentLapStartedAt: 0,
  wheelDistance: 8,
  surface: "road",
  finished: false,
  crashed: false,
  dnf: false,
  resetAvailable: false,
  impact: 0,
  slip: 0.12
};

const DEV_ASSETS: DevAsset[] = [
  { group: "Generic Track", name: "TrackStartGantryModel", note: "Start grid, gantry, lights", pivot: [0, 0, -1.3], zoom: 1.28, render: () => <TrackStartGantryModel track={TRACKS.sakura} /> },
  { group: "Generic Track", name: "RoadsideBoardModel", note: "The pale blank boards seen along routes", render: (rain) => <RoadsideBoardModel rain={rain} /> },
  { group: "Generic Track", name: "BrakingBoardModel", note: "Striped braking marker", render: () => <BrakingBoardModel /> },
  { group: "Generic Track", name: "TrackBarrierModel", note: "Low roadside barrier", render: (rain) => <TrackBarrierModel rain={rain} /> },
  { group: "Generic Track", name: "SponsorBoardModel", note: "#vibejam sponsor board", render: (rain) => <SponsorBoardModel rain={rain} /> },
  { group: "Sakura", name: "SakuraToriiGate", render: (rain) => <SakuraToriiGateModel track={TRACKS.sakura} rain={rain} /> },
  { group: "Sakura", name: "SakuraBlossomTunnel", render: (rain) => <SakuraBlossomTunnelPreview rain={rain} /> },
  { group: "Sakura", name: "SakuraTunnelTree", render: (rain) => <SakuraTunnelTree position={[0, 0, 0]} side={1} heading={0} seed={220} rain={rain} /> },
  { group: "Sakura", name: "SakuraFeatureGrove", render: (rain) => <SakuraFeatureGrovePreview rain={rain} /> },
  { group: "Sakura", name: "SakuraGroundAccents", render: (rain) => <SakuraGroundAccentsPreview rain={rain} /> },
  { group: "Sakura", name: "SakuraTree", render: (rain) => <SakuraTree position={[0, 0, 0]} seed={5} rain={rain} /> },
  { group: "Sakura", name: "SakuraLantern", render: (rain) => <SakuraLantern position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Sakura", name: "SakuraBanner", render: (rain) => <SakuraBanner position={[0, 1.24, 0]} heading={0} rain={rain} /> },
  { group: "Alpine", name: "AlpineNearPeak", zoom: 1.22, render: (rain) => <AlpineNearPeak rain={rain} /> },
  { group: "Alpine", name: "AlpineBackdropPeak cone", render: (rain) => <AlpineBackdropPeak mountain={{ x: 0, z: 0, h: 28, r: 22, kind: "cone" }} seed={3} rain={rain} /> },
  { group: "Alpine", name: "AlpineBackdropPeak jagged", render: (rain) => <AlpineBackdropPeak mountain={{ x: 0, z: 0, h: 26, r: 22, kind: "jagged" }} seed={4} rain={rain} /> },
  { group: "Alpine", name: "AlpineCliffRock", render: (rain) => <AlpineCliffRock position={[0, 0, 0]} heading={0} seed={2} rain={rain} /> },
  { group: "Alpine", name: "AlpineChalet", render: (rain) => <AlpineChalet position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Alpine", name: "AlpineCableCar", render: (rain) => <AlpineCableCar position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Alpine", name: "AlpinePine", render: (rain) => <AlpinePine position={[0, 0, 0]} seed={8} rain={rain} /> },
  { group: "Alpine", name: "AlpineRock", render: (rain) => <AlpineRock position={[0, 0.25, 0]} seed={8} rain={rain} /> },
  { group: "Alpine", name: "AlpineSnowBank", render: (rain) => <AlpineSnowBank position={[0, 0.14, 0]} heading={0} seed={8} rain={rain} /> },
  { group: "Alpine", name: "AlpineBridge", render: (rain) => <AlpineBridge sample={{ x: 0, y: 0, z: 0, heading: 0 }} track={TRACKS.alpine} rain={rain} /> },
  { group: "Fjord", name: "FjordWaterfall", zoom: 1.26, render: (rain) => <FjordWaterfall position={[0, 0, 0]} heading={Math.PI} rain={rain} /> },
  { group: "Fjord", name: "FjordCliffRail", render: (rain) => <FjordCliffRail position={[0, 0, 0]} heading={0} length={11.5} rain={rain} /> },
  { group: "Fjord", name: "FjordVillage", render: (rain) => <FjordVillage position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Fjord", name: "FjordLookout", render: (rain) => <FjordLookout position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Fjord", name: "FjordMarker", render: (rain) => <FjordMarker position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Fjord", name: "FjordBackdrop", zoom: 1.12, render: (rain) => <FjordBackdropPreview rain={rain} /> },
  { group: "Cloudline", name: "CloudlineSummit", zoom: 1.24, render: (rain) => <CloudlineSummit position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Cloudline", name: "CloudlineSnowPoles", render: (rain) => <CloudlineSnowPoles position={[0, 0, 0]} heading={0} seed={2} rain={rain} /> },
  { group: "Cloudline", name: "CloudlineCliffBreak", render: (rain) => <CloudlineCliffBreak position={[0, 0, 0]} heading={0} seed={3} rain={rain} /> },
  { group: "Cloudline", name: "CloudlineSummitPoles", render: (rain) => <CloudlineSummitPoles position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Cloudline", name: "CloudWisps", render: (rain) => <CloudWispsPreview rain={rain} /> },
  { group: "Cloudline", name: "CloudlineBackdrop", zoom: 1.08, render: (rain) => <CloudlineBackdropPreview rain={rain} /> },
  { group: "Vehicle", name: "CarModel", render: () => <CarModel car={DEV_ASSET_CAR} color="#ff8f3d" /> },
  { group: "Vehicle", name: "Cockpit hands", render: () => <Cockpit car={DEV_ASSET_CAR} color="#ff8f3d" cockpitStyle="hands" /> },
  { group: "Vehicle", name: "Cockpit paws", render: () => <Cockpit car={DEV_ASSET_CAR} color="#ff8f3d" cockpitStyle="paws" /> }
];

function SakuraBlossomTunnelPreview({ rain }: { rain: boolean }) {
  return (
    <group>
      {[0, 1, 2].flatMap((segment) => [-1, 1].map((side) => (
        <SakuraTunnelTree
          key={`${segment}-${side}`}
          position={[side * 2.2, 0, (segment - 1) * 2.4]}
          side={side}
          heading={0}
          seed={220 + segment * 9 + side}
          rain={rain}
        />
      )))}
    </group>
  );
}

function SakuraFeatureGrovePreview({ rain }: { rain: boolean }) {
  return (
    <group>
      <SakuraTree position={[-1.5, 0, 0.25]} seed={104} rain={rain} />
      <SakuraTree position={[0.55, 0, -0.65]} seed={117} rain={rain} />
      <SakuraTree position={[1.85, 0, 0.55]} seed={131} rain={rain} />
    </group>
  );
}

function SakuraGroundAccentsPreview({ rain }: { rain: boolean }) {
  return (
    <group>
      {[[-1.6, 0.82], [0.15, 0.72], [1.65, 0.78]].map(([x, scale], index) => (
        <mesh key={index} position={[x, 0.01, 0]} rotation={[-Math.PI / 2, 0, index * 0.72]} scale={[scale * 2.7, scale * 0.92, 1]}>
          <circleGeometry args={[1, 18]} />
          <meshBasicMaterial color={rain ? "#c88da0" : "#f2a8bd"} transparent opacity={rain ? 0.1 : 0.14} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function FjordBackdropPreview({ rain }: { rain: boolean }) {
  const peaks = [
    { x: -2.2, h: 7.4, r: 3.2 },
    { x: 1.2, h: 9.1, r: 3.8 },
    { x: 4.0, h: 6.6, r: 2.8 }
  ];
  return (
    <group>
      {peaks.map((peak, index) => (
        <group key={index} position={[peak.x, 0, index * -0.65]} rotation={[0, seededUnit(index * 19) * 0.8, 0]}>
          <mesh position={[0, peak.h / 2, 0]}>
            <coneGeometry args={[peak.r, peak.h, 9]} />
            <meshStandardMaterial color={rain ? "#6f7774" : "#77846f"} roughness={0.98} />
          </mesh>
          <mesh position={[0, peak.h * 0.72, 0]}>
            <coneGeometry args={[peak.r * 0.34, peak.h * 0.22, 9]} />
            <meshStandardMaterial color={rain ? "#dfe5e4" : "#eef2f0"} roughness={0.82} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CloudWispsPreview({ rain }: { rain: boolean }) {
  return (
    <group scale={[1.25, 1.25, 1.25]}>
      {[-2.2, 0, 2.1].map((x, puff) => (
        <mesh key={puff} position={[x, 1.2 + puff * 0.08, seededUnit(puff + 4) * 0.7]} scale={[2.6 - puff * 0.28, 0.48, 1.2 + puff * 0.22]}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshBasicMaterial color={rain ? "#d7dee1" : "#f7fbff"} transparent opacity={rain ? 0.34 : 0.42} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function CloudlineBackdropPreview({ rain }: { rain: boolean }) {
  const peaks = [
    { x: -3.2, h: 8.5, r: 4.2 },
    { x: 0.6, h: 10.4, r: 4.8 },
    { x: 4.0, h: 9.2, r: 4.5 }
  ];
  return (
    <group>
      {peaks.map((peak, index) => (
        <group key={index} position={[peak.x, 0, index * -0.8]} rotation={[0, seededUnit(index * 23) * 0.7, 0]}>
          <mesh position={[0, peak.h / 2, 0]}>
            <coneGeometry args={[peak.r, peak.h, 9]} />
            <meshStandardMaterial color={rain ? "#6b7273" : "#778179"} roughness={0.98} />
          </mesh>
          <mesh position={[0, peak.h * 0.73, 0]}>
            <coneGeometry args={[peak.r * 0.42, peak.h * 0.24, 9]} />
            <meshStandardMaterial color={rain ? "#dce3e4" : "#f2f5f4"} roughness={0.82} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DevAssetGallery() {
  const [rain, setRain] = useState(false);
  const [spin, setSpin] = useState(false);
  const [themeMode, setThemeMode] = useState<DevThemeMode>("system");
  const [viewMode, setViewMode] = useState<DevAssetViewMode>("grid");
  const [scaleMode, setScaleMode] = useState<DevAssetScaleMode>("fit");
  const [assetViewport, setAssetViewport] = useState<DevAssetViewport>(DEV_ASSET_DEFAULT_VIEWPORT);
  const [isAssetPanning, setIsAssetPanning] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | undefined>();
  const assetCardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const assetBoardRef = useRef<HTMLDivElement | null>(null);
  const assetViewportRef = useRef(assetViewport);
  const assetPointerRefs = useRef(new Map<number, DevAssetPoint>());
  const assetDragRef = useRef<{ pointerId: number; point: DevAssetPoint } | undefined>(undefined);
  const assetPinchRef = useRef<{
    startCenter: DevAssetPoint;
    startDistance: number;
    startPanX: number;
    startPanY: number;
    startZoom: number;
  } | undefined>(undefined);
  const systemDark = usePrefersDarkMode();
  const darkMode = themeMode === "system" ? systemDark : themeMode === "dark";
  const groups = useMemo(() => [...Array.from(new Set(DEV_ASSETS.map((asset) => asset.group))), "All"], []);
  const [activeGroup, setActiveGroup] = useState("Generic Track");
  const normalizedSearch = search.trim().toLowerCase();
  const assets = useMemo(() => (
    (activeGroup === "All" ? DEV_ASSETS : DEV_ASSETS.filter((asset) => asset.group === activeGroup)).filter((asset) => (
      !normalizedSearch
      || asset.name.toLowerCase().includes(normalizedSearch)
      || asset.group.toLowerCase().includes(normalizedSearch)
      || asset.note?.toLowerCase().includes(normalizedSearch)
    ))
  ), [activeGroup, normalizedSearch]);
  const selectedAsset = assets.find((asset) => devAssetKey(asset) === selectedAssetKey) ?? assets[0];
  const canvasAssets = viewMode === "focus" && selectedAsset ? [selectedAsset] : assets;
  const columns = viewMode === "focus" ? 1 : Math.min(4, Math.max(1, Math.ceil(Math.sqrt(canvasAssets.length))));
  const rows = Math.max(1, Math.ceil(canvasAssets.length / columns));
  const boardHeight = viewMode === "focus" ? 620 : Math.min(920, Math.max(520, rows * 155));
  const activeAssetKey = selectedAsset ? devAssetKey(selectedAsset) : "";
  const assetZoomEnabled = viewMode === "focus" && !!selectedAsset;
  const canResetAssetViewport = assetViewport.zoom > DEV_ASSET_MIN_ZOOM + 0.001 || Math.abs(assetViewport.panX) > 0.5 || Math.abs(assetViewport.panY) > 0.5;
  const focusAsset = useCallback((asset: DevAsset) => {
    setSelectedAssetKey(devAssetKey(asset));
    setViewMode("focus");
  }, []);
  const resetAssetViewport = useCallback(() => {
    setAssetViewport(DEV_ASSET_DEFAULT_VIEWPORT);
    assetPointerRefs.current.clear();
    assetDragRef.current = undefined;
    assetPinchRef.current = undefined;
    setIsAssetPanning(false);
  }, []);
  const zoomAssetViewportBy = useCallback((factor: number) => {
    setAssetViewport((current) => zoomDevAssetViewport(current, current.zoom * factor));
  }, []);

  useEffect(() => {
    assetViewportRef.current = assetViewport;
  }, [assetViewport]);

  useEffect(() => {
    resetAssetViewport();
  }, [activeAssetKey, resetAssetViewport, scaleMode, viewMode]);

  useEffect(() => {
    const element = assetBoardRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (!assetZoomEnabled || !event.ctrlKey) return;
      event.preventDefault();
      const { point, size } = devAssetPointerPoint(event, element);
      const factor = Math.exp(-event.deltaY * 0.0045);
      setAssetViewport((current) => zoomDevAssetViewport(current, current.zoom * factor, point, size));
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [assetZoomEnabled]);

  useEffect(() => {
    if (selectedAssetKey && !assets.some((asset) => devAssetKey(asset) === selectedAssetKey)) {
      setSelectedAssetKey(undefined);
      setViewMode("grid");
    }
  }, [assets, selectedAssetKey]);

  useLayoutEffect(() => {
    if (!selectedAssetKey) return;
    const activeCard = assetCardRefs.current[activeAssetKey];
    if (activeCard) scrollDevAssetCardIntoPanel(activeCard);
  }, [activeAssetKey, selectedAssetKey, viewMode]);

  const handleAssetPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!assetZoomEnabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Some browsers reject capture for pointers that have already been cancelled.
    }

    const { point } = devAssetPointerPoint(event, event.currentTarget);
    const pointers = assetPointerRefs.current;
    pointers.set(event.pointerId, point);

    const summary = devAssetPointerSummary(pointers);
    if (summary) {
      const current = assetViewportRef.current;
      assetPinchRef.current = {
        startCenter: summary.center,
        startDistance: summary.distance,
        startPanX: current.panX,
        startPanY: current.panY,
        startZoom: current.zoom
      };
      assetDragRef.current = undefined;
      setIsAssetPanning(true);
      return;
    }

    if (assetViewportRef.current.zoom > DEV_ASSET_MIN_ZOOM + 0.001) {
      assetDragRef.current = { pointerId: event.pointerId, point };
      setIsAssetPanning(true);
    }
  }, [assetZoomEnabled]);

  const handleAssetPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!assetZoomEnabled || !assetPointerRefs.current.has(event.pointerId)) return;
    const { point, size } = devAssetPointerPoint(event, event.currentTarget);
    const pointers = assetPointerRefs.current;
    pointers.set(event.pointerId, point);

    const summary = devAssetPointerSummary(pointers);
    const pinch = assetPinchRef.current;
    if (summary && pinch) {
      event.preventDefault();
      const nextZoom = pinch.startZoom * (summary.distance / pinch.startDistance);
      setAssetViewport(clampDevAssetViewport(
        nextZoom,
        summary.center.x - (pinch.startCenter.x - pinch.startPanX) * (nextZoom / pinch.startZoom),
        summary.center.y - (pinch.startCenter.y - pinch.startPanY) * (nextZoom / pinch.startZoom),
        size
      ));
      return;
    }

    const drag = assetDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = point.x - drag.point.x;
    const deltaY = point.y - drag.point.y;
    drag.point = point;
    setAssetViewport((current) => clampDevAssetViewport(current.zoom, current.panX + deltaX, current.panY + deltaY, size));
  }, [assetZoomEnabled]);

  const handleAssetPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!assetZoomEnabled) return;
    assetPointerRefs.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Browsers may already release touch captures on gesture cancellation.
    }

    const pointers = assetPointerRefs.current;
    const summary = devAssetPointerSummary(pointers);
    if (summary) {
      const current = assetViewportRef.current;
      assetPinchRef.current = {
        startCenter: summary.center,
        startDistance: summary.distance,
        startPanX: current.panX,
        startPanY: current.panY,
        startZoom: current.zoom
      };
      return;
    }

    assetPinchRef.current = undefined;
    const remaining = Array.from(pointers.entries())[0];
    if (remaining && assetViewportRef.current.zoom > DEV_ASSET_MIN_ZOOM + 0.001) {
      assetDragRef.current = { pointerId: remaining[0], point: remaining[1] };
      setIsAssetPanning(true);
      return;
    }

    assetDragRef.current = undefined;
    setIsAssetPanning(false);
  }, [assetZoomEnabled]);

  return (
    <main className={`dev-assets ${darkMode ? "theme-dark" : "theme-light"}`}>
      <header className="dev-assets-header">
        <div>
          <p className="eyebrow">Dev viewer</p>
          <h1>Asset Gallery</h1>
          <span>{assets.length} visible / {DEV_ASSETS.length} procedural assets total</span>
        </div>
        <div className="dev-assets-controls">
          <a href="/">Back to app</a>
          <DevThemeControl mode={themeMode} onChange={setThemeMode} />
          <button type="button" className={rain ? "active" : undefined} onClick={() => setRain((value) => !value)}>
            Rain
          </button>
          <button type="button" className={spin ? "active" : undefined} onClick={() => setSpin((value) => !value)}>
            <RotateCcw size={16} /> Spin
          </button>
        </div>
      </header>
      <section className="dev-assets-tools" aria-label="Asset viewer tools">
        <label className="dev-assets-search">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search assets" />
        </label>
        <div className="dev-assets-view-toggle" role="group" aria-label="Canvas view mode">
          <button type="button" className={viewMode === "grid" ? "active" : undefined} onClick={() => setViewMode("grid")}>
            <Grid2X2 size={16} /> Grid
          </button>
          <button
            type="button"
            className={viewMode === "focus" ? "active" : undefined}
            disabled={!selectedAsset}
            onClick={() => {
              if (selectedAsset) {
                setSelectedAssetKey(devAssetKey(selectedAsset));
                setViewMode("focus");
              }
            }}
          >
            <Maximize2 size={16} /> Focus
          </button>
        </div>
        <div className="dev-assets-scale-toggle" role="group" aria-label="Asset scale mode">
          <button type="button" className={scaleMode === "fit" ? "active" : undefined} onClick={() => setScaleMode("fit")}>
            Fit
          </button>
          <button type="button" className={scaleMode === "world" ? "active" : undefined} onClick={() => setScaleMode("world")}>
            World
          </button>
        </div>
        {assetZoomEnabled && (
          <DevAssetZoomControls
            canReset={canResetAssetViewport}
            viewport={assetViewport}
            onReset={resetAssetViewport}
            onZoomIn={() => zoomAssetViewportBy(DEV_ASSET_ZOOM_STEP)}
            onZoomOut={() => zoomAssetViewportBy(1 / DEV_ASSET_ZOOM_STEP)}
          />
        )}
        <span>{viewMode === "focus" && selectedAsset ? `Focused: ${selectedAsset.name}` : "Click an asset or card to focus it"}</span>
      </section>
      <nav className="dev-assets-tabs" aria-label="Asset groups">
        {groups.map((group) => (
          <button key={group} type="button" className={group === activeGroup ? "active" : undefined} onClick={() => setActiveGroup(group)}>
            {group}
          </button>
        ))}
      </nav>
      <section className="dev-assets-board" style={{ "--dev-board-height": `${boardHeight}px` } as CSSProperties} aria-label="Procedural assets">
        <div className="dev-assets-workspace">
          <div
            ref={assetBoardRef}
            className={`dev-assets-board-canvas${assetZoomEnabled ? " zoomable" : ""}${isAssetPanning ? " panning" : ""}`}
            onPointerCancel={handleAssetPointerEnd}
            onPointerDown={handleAssetPointerDown}
            onPointerMove={handleAssetPointerMove}
            onPointerUp={handleAssetPointerEnd}
          >
            <DevAssetCanvas
              assets={canvasAssets}
              columns={columns}
              rows={rows}
              rain={rain}
              spin={spin}
              darkMode={darkMode}
              scaleMode={scaleMode}
              viewport={assetZoomEnabled ? assetViewport : DEV_ASSET_DEFAULT_VIEWPORT}
              zoomEnabled={assetZoomEnabled}
              onAssetClick={focusAsset}
            />
            {canvasAssets.length === 0 && (
              <div className="dev-assets-empty">No assets match {search.trim() ? `"${search.trim()}"` : "the current filters"}.</div>
            )}
          </div>
          <aside className="dev-assets-index-panel" aria-label="Asset index">
            <div className="dev-assets-index-header">
              <strong>{viewMode === "focus" && selectedAsset ? selectedAsset.name : activeGroup}</strong>
              <span>{assets.length} assets</span>
            </div>
            {assets.length === 0 ? (
              <p className="dev-assets-no-results">Try another group or search term.</p>
            ) : (
              <div className="dev-assets-index">
                {assets.map((asset, index) => (
                  <button
                    type="button"
                    className={devAssetKey(asset) === devAssetKey(selectedAsset) ? "dev-asset-meta active" : "dev-asset-meta"}
                    key={`${asset.group}-${asset.name}`}
                    ref={(node) => {
                      assetCardRefs.current[devAssetKey(asset)] = node;
                    }}
                    onClick={() => focusAsset(asset)}
                  >
                    <small>{asset.group}</small>
                    <div className="dev-asset-title">
                      <span>#{index + 1}</span>
                      <strong>{asset.name}</strong>
                    </div>
                    {asset.note && <span>{asset.note}</span>}
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}

function usePrefersDarkMode() {
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const update = () => setPrefersDark(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return prefersDark;
}

function DevThemeControl({ mode, onChange }: { mode: DevThemeMode; onChange: (mode: DevThemeMode) => void }) {
  const options: Array<{ mode: DevThemeMode; label: string; icon: ReactNode }> = [
    { mode: "system", label: "System", icon: <Monitor size={16} /> },
    { mode: "dark", label: "Dark", icon: <Moon size={16} /> },
    { mode: "light", label: "Light", icon: <Sun size={16} /> }
  ];

  return (
    <div className="dev-theme-control" role="group" aria-label="Viewer theme">
      {options.map((option) => (
        <button key={option.mode} type="button" className={mode === option.mode ? "active" : undefined} onClick={() => onChange(option.mode)}>
          {option.icon} {option.label}
        </button>
      ))}
    </div>
  );
}

function DevAssetZoomControls({
  canReset,
  viewport,
  onReset,
  onZoomIn,
  onZoomOut
}: {
  canReset: boolean;
  viewport: DevAssetViewport;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const zoomPercent = Math.round(viewport.zoom * 100);
  return (
    <div className="dev-assets-zoom-controls" role="group" aria-label="Focused asset zoom">
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={viewport.zoom <= DEV_ASSET_MIN_ZOOM + 0.001} onClick={onZoomOut}>
        <Minus size={16} />
      </button>
      <button type="button" aria-label="Reset zoom" title="Reset zoom" disabled={!canReset} onClick={onReset}>
        <RotateCcw size={15} />
      </button>
      <span className="dev-assets-zoom-value">{zoomPercent}%</span>
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={viewport.zoom >= DEV_ASSET_MAX_ZOOM - 0.001} onClick={onZoomIn}>
        <Plus size={16} />
      </button>
    </div>
  );
}

function devAssetKey(asset: DevAsset | undefined) {
  return asset ? `${asset.group}:${asset.name}` : "";
}

function scrollDevAssetCardIntoPanel(card: HTMLButtonElement) {
  const panel = card.closest(".dev-assets-index-panel") as HTMLElement | null;
  if (!panel || panel.scrollHeight <= panel.clientHeight + 1) return;
  const panelRect = panel.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const topInset = 58;
  const bottomInset = 10;
  if (cardRect.top < panelRect.top + topInset) {
    panel.scrollTop -= panelRect.top + topInset - cardRect.top;
  } else if (cardRect.bottom > panelRect.bottom - bottomInset) {
    panel.scrollTop += cardRect.bottom - (panelRect.bottom - bottomInset);
  }
}

function clampDevAssetViewport(zoom: number, panX: number, panY: number, size?: DevAssetViewportSize): DevAssetViewport {
  const nextZoom = clamp(zoom, DEV_ASSET_MIN_ZOOM, DEV_ASSET_MAX_ZOOM);
  if (nextZoom <= DEV_ASSET_MIN_ZOOM + 0.001) return DEV_ASSET_DEFAULT_VIEWPORT;
  const width = size?.width ?? 900;
  const height = size?.height ?? 620;
  const overflow = nextZoom - DEV_ASSET_MIN_ZOOM;
  const maxPanX = width * overflow * 0.52;
  const maxPanY = height * overflow * 0.52;
  return {
    zoom: nextZoom,
    panX: clamp(panX, -maxPanX, maxPanX),
    panY: clamp(panY, -maxPanY, maxPanY)
  };
}

function zoomDevAssetViewport(current: DevAssetViewport, zoom: number, anchor: DevAssetPoint = { x: 0, y: 0 }, size?: DevAssetViewportSize) {
  const nextZoom = clamp(zoom, DEV_ASSET_MIN_ZOOM, DEV_ASSET_MAX_ZOOM);
  const ratio = nextZoom / current.zoom;
  return clampDevAssetViewport(
    nextZoom,
    anchor.x - (anchor.x - current.panX) * ratio,
    anchor.y - (anchor.y - current.panY) * ratio,
    size
  );
}

function devAssetPointerPoint(event: { clientX: number; clientY: number }, element: HTMLDivElement) {
  const rect = element.getBoundingClientRect();
  return {
    point: {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2
    },
    size: {
      width: rect.width,
      height: rect.height
    }
  };
}

function devAssetPointerSummary(points: Map<number, DevAssetPoint>) {
  const values = Array.from(points.values());
  if (values.length < 2) return undefined;
  const first = values[0];
  const second = values[1];
  return {
    center: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2
    },
    distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y))
  };
}

function DevAssetCanvas({
  assets,
  columns,
  rows,
  rain,
  spin,
  darkMode,
  scaleMode,
  viewport,
  zoomEnabled,
  onAssetClick
}: {
  assets: DevAsset[];
  columns: number;
  rows: number;
  rain: boolean;
  spin: boolean;
  darkMode: boolean;
  scaleMode: DevAssetScaleMode;
  viewport: DevAssetViewport;
  zoomEnabled: boolean;
  onAssetClick: (asset: DevAsset) => void;
}) {
  const background = darkMode ? (rain ? "#20272d" : "#1c2630") : (rain ? "#9eabb2" : "#d8eaf3");
  const sky = darkMode ? (rain ? "#4f5961" : "#6d8899") : (rain ? "#c9d1d7" : "#eef8ff");
  const ground = darkMode ? (rain ? "#151a1d" : "#1a211d") : (rain ? "#3d4741" : "#596c4e");
  return (
    <Canvas orthographic dpr={[1, 1.4]} gl={{ antialias: true, powerPreference: "high-performance" }} camera={{ position: [0, 20, 36], zoom: 34, near: 0.1, far: 1000 }}>
      <color attach="background" args={[background]} />
      <ambientLight intensity={darkMode ? (rain ? 0.86 : 0.94) : (rain ? 0.72 : 0.86)} />
      <hemisphereLight args={[sky, ground, darkMode ? 0.64 : rain ? 0.5 : 0.42]} />
      <directionalLight position={[8, 10, 6]} intensity={darkMode ? 1.55 : rain ? 0.95 : 1.45} />
      <DevAssetGroupScene assets={assets} columns={columns} rows={rows} rain={rain} spin={spin} darkMode={darkMode} scaleMode={scaleMode} viewport={viewport} zoomEnabled={zoomEnabled} onAssetClick={onAssetClick} />
    </Canvas>
  );
}

function DevAssetGroupScene({
  assets,
  columns,
  rows,
  rain,
  spin,
  darkMode,
  scaleMode,
  viewport,
  zoomEnabled,
  onAssetClick
}: {
  assets: DevAsset[];
  columns: number;
  rows: number;
  rain: boolean;
  spin: boolean;
  darkMode: boolean;
  scaleMode: DevAssetScaleMode;
  viewport: DevAssetViewport;
  zoomEnabled: boolean;
  onAssetClick: (asset: DevAsset) => void;
}) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const cellSize = scaleMode === "world" ? 30 : 8.8;
  const width = Math.max(columns, 1) * cellSize;
  const depth = Math.max(rows, 1) * cellSize;
  const centerX = ((columns - 1) * cellSize) / 2;
  const centerZ = ((rows - 1) * cellSize) / 2;

  useLayoutEffect(() => {
    const orthographicCamera = camera as THREE.OrthographicCamera;
    let targetX = centerX;
    let targetY = 1.2;
    let targetZ = centerZ;
    let worldWidth = width + 5;
    let worldHeight = depth * 0.88 + 11;
    let cameraY = Math.max(18, rows * 2.2 + 14);
    let cameraZ = centerZ + Math.max(24, rows * 4.3 + 16);

    if (scaleMode === "world" && groupRef.current) {
      groupRef.current.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(groupRef.current);
      if (!box.isEmpty()) {
        const boxCenter = box.getCenter(new THREE.Vector3());
        const boxSize = box.getSize(new THREE.Vector3());
        targetX = boxCenter.x;
        targetY = Math.max(1.2, boxCenter.y * 0.56);
        targetZ = boxCenter.z;
        worldWidth = Math.max(width * 0.48, boxSize.x + 8);
        worldHeight = Math.max(18, boxSize.z * 0.88 + boxSize.y * 1.1 + 8);
        cameraY = Math.max(20, boxSize.y * 1.2 + rows * 1.2 + 16);
        cameraZ = boxCenter.z + Math.max(28, boxSize.z * 0.92 + boxSize.y * 0.45 + rows * 2.4 + 16);
      }
    }

    const baseZoom = Math.min(size.width / worldWidth, size.height / worldHeight);
    const cameraZoom = baseZoom * (zoomEnabled ? viewport.zoom : DEV_ASSET_MIN_ZOOM);
    const target = new THREE.Vector3(targetX, targetY, targetZ);
    const position = new THREE.Vector3(targetX, cameraY, cameraZ);
    if (zoomEnabled && viewport.zoom > DEV_ASSET_MIN_ZOOM + 0.001) {
      const viewDirection = target.clone().sub(position).normalize();
      const right = new THREE.Vector3().crossVectors(viewDirection, orthographicCamera.up).normalize();
      const cameraUp = new THREE.Vector3().crossVectors(right, viewDirection).normalize();
      const panOffset = right.multiplyScalar(-viewport.panX / cameraZoom).add(cameraUp.multiplyScalar(viewport.panY / cameraZoom));
      target.add(panOffset);
      position.add(panOffset);
    }

    orthographicCamera.position.copy(position);
    orthographicCamera.lookAt(target);
    orthographicCamera.zoom = cameraZoom;
    orthographicCamera.near = 0.1;
    orthographicCamera.far = 1000;
    orthographicCamera.updateProjectionMatrix();
  }, [assets, camera, centerX, centerZ, depth, rain, rows, scaleMode, size.height, size.width, viewport.panX, viewport.panY, viewport.zoom, width, zoomEnabled]);

  return (
    <group ref={groupRef}>
      {assets.map((asset, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        return (
          <DevAssetCell
            key={`${asset.group}-${asset.name}`}
            asset={asset}
            rain={rain}
            spin={spin}
            darkMode={darkMode}
            scaleMode={scaleMode}
            position={[col * cellSize, 0, row * cellSize]}
            onAssetClick={onAssetClick}
          />
        );
      })}
    </group>
  );
}

function DevAssetCell({
  asset,
  rain,
  spin,
  darkMode,
  scaleMode,
  position,
  onAssetClick
}: {
  asset: DevAsset;
  rain: boolean;
  spin: boolean;
  darkMode: boolean;
  scaleMode: DevAssetScaleMode;
  position: [number, number, number];
  onAssetClick: (asset: DevAsset) => void;
}) {
  const spinRef = useRef<THREE.Group>(null);
  const contentRef = useRef<THREE.Group>(null);
  const { gl } = useThree();

  useLayoutEffect(() => {
    const spinGroup = spinRef.current;
    const content = contentRef.current;
    if (!content) return;
    const savedSpinRotation = spinGroup?.rotation.clone();
    if (spinGroup) {
      spinGroup.rotation.set(0, 0, 0);
      spinGroup.updateWorldMatrix(true, true);
    }
    content.position.set(0, 0, 0);
    content.scale.setScalar(1);
    content.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(content);
    if (box.isEmpty()) {
      if (spinGroup && savedSpinRotation) {
        spinGroup.rotation.copy(savedSpinRotation);
        spinGroup.updateWorldMatrix(true, true);
      }
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    content.parent?.worldToLocal(center);
    const pivot = asset.pivot ? new THREE.Vector3(...asset.pivot) : center;
    content.position.sub(pivot);
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const scale = scaleMode === "fit" ? Math.min(5.8, 5.4 / (maxDimension * (asset.zoom ?? 1))) : 1;
    content.scale.setScalar(scale);
    content.updateWorldMatrix(true, true);

    const centeredBox = new THREE.Box3().setFromObject(content);
    if (Number.isFinite(centeredBox.min.y)) {
      const bottom = new THREE.Vector3(0, centeredBox.min.y, 0);
      content.parent?.worldToLocal(bottom);
      content.position.y -= bottom.y;
    }
    if (spinGroup && savedSpinRotation) {
      spinGroup.rotation.copy(savedSpinRotation);
      spinGroup.updateWorldMatrix(true, true);
    }
  }, [asset, rain, scaleMode]);

  useFrame((_, delta) => {
    if (spin && spinRef.current) spinRef.current.rotation.y += delta * 0.32;
  });

  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onAssetClick(asset);
  }, [asset, onAssetClick]);

  const handlePointerOver = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    gl.domElement.style.cursor = "pointer";
  }, [gl]);

  const handlePointerOut = useCallback(() => {
    gl.domElement.style.cursor = "";
  }, [gl]);

  useEffect(() => () => {
    gl.domElement.style.cursor = "";
  }, [gl]);

  return (
    <group position={position} onClick={handleClick} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
      <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.25, 32]} />
        <meshBasicMaterial color={darkMode ? "#111820" : rain ? "#4e565b" : "#c7d8de"} transparent opacity={darkMode ? 0.62 : 0.32} depthWrite={false} />
      </mesh>
      <group ref={spinRef} rotation={[0, 0.34, 0]}>
        <group ref={contentRef}>{asset.render(rain)}</group>
      </group>
    </group>
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

function TrackStartGantryModel({ track }: { track: TrackDef }) {
  return (
    <>
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
    </>
  );
}

function RoadsideBoardModel({ rain }: { rain: boolean }) {
  const texture = useMemo(() => createRoadsideBoardTexture(rain), [rain]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <>
      <mesh castShadow>
        <boxGeometry args={[1.9, 1.16, 0.12]} />
        <meshStandardMaterial color={rain ? "#c8d2d7" : "#f2efe4"} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.071]}>
        <planeGeometry args={[1.72, 0.86]} />
        <meshBasicMaterial map={texture} toneMapped={false} transparent />
      </mesh>
      {[-0.52, 0.52].map((x) => (
        <mesh key={x} position={[x, -0.82, 0]}>
          <boxGeometry args={[0.1, 1.18, 0.1]} />
          <meshStandardMaterial color="#22262c" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0.47, 0.073]}>
        <boxGeometry args={[1.68, 0.035, 0.018]} />
        <meshStandardMaterial color="#35a7ff" roughness={0.42} />
      </mesh>
      <mesh position={[0, -0.47, 0.073]}>
        <boxGeometry args={[1.68, 0.035, 0.018]} />
        <meshStandardMaterial color="#e84f5f" roughness={0.42} />
      </mesh>
    </>
  );
}

function createRoadsideBoardTexture(rain: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = rain ? "#d6dde0" : "#f7f3e8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = rain ? "#8a9498" : "#c6beb0";
    context.lineWidth = 18;
    context.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    context.fillStyle = "#35a7ff";
    context.fillRect(38, 38, canvas.width - 76, 18);
    context.fillStyle = "#e84f5f";
    context.fillRect(38, canvas.height - 56, canvas.width - 76, 18);
    context.fillStyle = "#12161b";
    context.font = "800 52px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("simdrive.xyz", canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function BrakingBoardModel() {
  return (
    <>
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
        <meshStandardMaterial color="#22262c" roughness={0.5} />
      </mesh>
    </>
  );
}

function TrackBarrierModel({ rain, accent = "#e04a54" }: { rain: boolean; accent?: string }) {
  return (
    <>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.68, 0.22]} />
        <meshStandardMaterial color={rain ? "#b8c1c4" : "#d7d7d2"} roughness={0.58} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.18, 0.13]}>
        <boxGeometry args={[2.1, 0.08, 0.04]} />
        <meshStandardMaterial color={accent} roughness={0.5} />
      </mesh>
    </>
  );
}

function SponsorBoardModel({ rain }: { rain: boolean }) {
  const texture = useMemo(() => createSponsorTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <>
      <mesh castShadow>
        <planeGeometry args={[5.25, 1.68]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {[-2.1, 2.1].map((x) => (
        <mesh key={x} position={[x, -1.22, -0.04]} castShadow>
          <boxGeometry args={[0.14, 2.44, 0.14]} />
          <meshStandardMaterial color={rain ? "#1d252b" : "#20242a"} roughness={0.55} />
        </mesh>
      ))}
    </>
  );
}

function SponsorBoard({ track, rain }: { track: TrackDef; rain: boolean }) {
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
      <SponsorBoardModel rain={rain} />
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
        <TrackStartGantryModel track={track} />
      </group>
      {boards.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const offset = track.width / 2 + track.curbWidth + track.wallMargin * 0.7 + 2.0;
        const x = sample.x + Math.sin(sample.heading + Math.PI / 2) * side * offset;
        const z = sample.z + Math.cos(sample.heading + Math.PI / 2) * side * offset;
        return (
          <group key={`${sample.x}-${sample.z}-prop`} position={[x, sample.y + 0.62, z]} rotation={[0, sample.heading - side * (Math.PI / 2 - 0.18), 0]}>
            <RoadsideBoardModel rain={rain} />
          </group>
        );
      })}
      {brakingBoards.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const x = sample.x + Math.sin(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + 4.3);
        const z = sample.z + Math.cos(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + 4.3);
        return (
          <group key={`${sample.x}-${sample.z}-brake`} position={[x, sample.y + 0.72, z]} rotation={[0, sample.heading + (side < 0 ? 0.42 : -0.42), 0]}>
            <BrakingBoardModel />
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
            <TrackBarrierModel rain={rain} accent={index % 2 === 0 ? "#e04a54" : "#24282f"} />
          </group>
        );
      })}
      {track.id === "sakura" && <SakuraSignatureProps track={track} rain={rain} />}
      {track.id === "alpine" && <AlpineSignatureProps track={track} rain={rain} />}
      <TrackIdentityProps track={track} rain={rain} />
    </group>
  );
});

function SakuraSignatureProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  return (
    <group>
      <SakuraToriiGate track={track} rain={rain} />
      <SakuraBlossomTunnel track={track} rain={rain} />
      <SakuraFeatureGrove track={track} rain={rain} />
    </group>
  );
}

function SakuraToriiGate({ track, rain }: { track: TrackDef; rain: boolean }) {
  const placement = useMemo(() => {
    const sample = sampleTrack(track, trackMetrics(track).totalLength * 0.13);
    return { ...sample, heading: sample.heading };
  }, [track]);

  return (
    <group position={[placement.x, placement.y, placement.z]} rotation={[0, placement.heading, 0]}>
      <SakuraToriiGateModel track={track} rain={rain} />
    </group>
  );
}

function SakuraToriiGateModel({ track, rain }: { track: Pick<TrackDef, "width" | "curbWidth">; rain: boolean }) {
  const span = track.width + track.curbWidth * 2 + 5.2;
  const postX = span / 2 - 1.35;
  const vermilion = rain ? "#a1322d" : "#bf332d";
  const darkWood = rain ? "#2b2523" : "#201b19";

  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={`torii-post-${side}`} position={[side * postX, 0, 0]}>
          <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.0, 0.32, 0.9]} />
            <meshStandardMaterial color={rain ? "#8b8d86" : "#a29d8f"} roughness={0.84} />
          </mesh>
          <mesh position={[0, 2.35, 0]} castShadow>
            <cylinderGeometry args={[0.26, 0.34, 4.7, 12]} />
            <meshStandardMaterial color={vermilion} roughness={0.56} />
          </mesh>
          <mesh position={[0, 4.62, 0]} castShadow>
            <boxGeometry args={[0.76, 0.36, 0.5]} />
            <meshStandardMaterial color={darkWood} roughness={0.58} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 4.78, 0]} castShadow>
        <boxGeometry args={[span, 0.42, 0.42]} />
        <meshStandardMaterial color={vermilion} roughness={0.56} />
      </mesh>
      <mesh position={[0, 5.17, 0]} castShadow>
        <boxGeometry args={[span + 1.9, 0.28, 0.64]} />
        <meshStandardMaterial color={darkWood} roughness={0.54} />
      </mesh>
      <mesh position={[0, 4.1, 0.08]} castShadow>
        <boxGeometry args={[span - 2.1, 0.28, 0.32]} />
        <meshStandardMaterial color={vermilion} roughness={0.56} />
      </mesh>
      {[-3.2, 3.2].map((x) => (
        <group key={`torii-lantern-${x}`} position={[x, 3.42, 0.1]}>
          <mesh position={[0, 0.34, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.66, 8]} />
            <meshStandardMaterial color={darkWood} roughness={0.6} />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[0.42, 0.38, 0.34]} />
            <meshStandardMaterial color={rain ? "#e8bca4" : "#ffd7ad"} emissive="#6b2518" emissiveIntensity={rain ? 0.55 : 0.34} roughness={0.62} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SakuraBlossomTunnel({ track, rain }: { track: TrackDef; rain: boolean }) {
  const tunnel = useMemo(() => {
    const metrics = trackMetrics(track);
    const progresses = [0.23, 0.265, 0.3, 0.335, 0.37, 0.405, 0.44];
    const trees = progresses.flatMap((progress, segment) => {
      const sample = sampleTrack(track, metrics.totalLength * progress);
      return [-1, 1].map((side) => {
        const position = tracksidePropPosition(track, sample, side, 0.2 + seededUnit(segment * 17 + side) * 1.2, 1.5, 0.8);
        return {
          ...position,
          side,
          heading: sample.heading,
          seed: 220 + segment * 9 + side
        };
      });
    });
    return { trees };
  }, [track]);

  return (
    <group>
      {tunnel.trees.map((tree) => (
        <SakuraTunnelTree key={`sakura-tunnel-tree-${tree.seed}`} position={[tree.x, tree.y, tree.z]} side={tree.side} heading={tree.heading} seed={tree.seed} rain={rain} />
      ))}
    </group>
  );
}

function SakuraTunnelTree({ position, side, heading, seed, rain }: { position: [number, number, number]; side: number; heading: number; seed: number; rain: boolean }) {
  const blossom = rain ? "#d98ea5" : "#f2a8bd";
  const blossomShade = rain ? "#c77d96" : "#ffc1cf";
  const height = 3.35 + seededUnit(seed * 13) * 0.75;
  const inward = -side;

  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh position={[0, height * 0.45, 0]} rotation={[0, 0, inward * 0.11]} castShadow>
        <cylinderGeometry args={[0.15, 0.26, height, 7]} />
        <meshStandardMaterial color="#5d4037" roughness={0.78} />
      </mesh>
      <mesh position={[inward * 0.74, height + 0.1, 0]} scale={[1.55, 0.9, 1.18]} castShadow>
        <sphereGeometry args={[0.86, 14, 8]} />
        <meshStandardMaterial color={blossom} roughness={0.86} />
      </mesh>
      <mesh position={[inward * 1.22, height - 0.25, 0.38]} scale={[1.18, 0.72, 0.94]} castShadow>
        <sphereGeometry args={[0.78, 12, 8]} />
        <meshStandardMaterial color={blossomShade} roughness={0.86} />
      </mesh>
      <mesh position={[inward * 1.08, height - 0.28, -0.42]} scale={[1.08, 0.68, 0.88]} castShadow>
        <sphereGeometry args={[0.72, 12, 8]} />
        <meshStandardMaterial color={blossom} roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, seededUnit(seed * 23) * Math.PI]} scale={[1.75, 0.95, 1]} receiveShadow>
        <circleGeometry args={[1, 18]} />
        <meshBasicMaterial color={blossomShade} transparent opacity={rain ? 0.12 : 0.18} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

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

function AlpineSignatureProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  return (
    <group>
      <AlpineVistaPeak track={track} rain={rain} />
      <AlpineRockWall track={track} rain={rain} />
      <AlpineChaletFeature track={track} rain={rain} />
      <AlpineCableCarFeature track={track} rain={rain} />
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
      <AlpineNearPeak rain={rain} />
    </group>
  );
}

function AlpineNearPeak({ rain }: { rain: boolean }) {
  const rock = rain ? "#7c8581" : "#858c7c";
  const shadowRock = rain ? "#6d7672" : "#747d70";
  const baseRock = rain ? "#5f6965" : "#66705f";
  const snow = rain ? "#dce3e2" : "#f2f5f1";

  return (
    <group>
      <mesh position={[0, 5.8, 0]} rotation={[0, 0.18, 0]} scale={[8.8, 11.6, 6.8]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 9]} />
        <meshStandardMaterial color={baseRock} roughness={0.99} />
      </mesh>
      <mesh position={[-4.8, 3.0, 3.0]} rotation={[0, -0.2, 0]} scale={[3.9, 6.0, 3.2]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color={shadowRock} roughness={0.99} />
      </mesh>
      <mesh position={[4.2, 2.65, -2.85]} rotation={[0, 0.4, 0]} scale={[3.55, 5.3, 2.9]} castShadow receiveShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color={rain ? "#737c79" : "#7c8576"} roughness={0.99} />
      </mesh>
      <mesh position={[0.1, 0.42, 0.15]} rotation={[0.02, 0.28, 0]} scale={[8.8, 0.72, 6.4]} receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={baseRock} roughness={0.99} />
      </mesh>
      <mesh position={[0.2, 10.25, -0.28]} rotation={[0, 0.18, 0]} scale={[2.9, 3.3, 2.15]} castShadow>
        <coneGeometry args={[1, 1, 9]} />
        <meshStandardMaterial color={snow} roughness={0.84} />
      </mesh>
      <mesh position={[-4.8, 5.35, 3.0]} rotation={[0, -0.2, 0]} scale={[1.28, 1.42, 1.02]} castShadow>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color={snow} roughness={0.86} />
      </mesh>
    </group>
  );
}

function AlpineRockWall({ track, rain }: { track: TrackDef; rain: boolean }) {
  const rocks = useMemo(() => {
    const metrics = trackMetrics(track);
    return [0.34, 0.375, 0.41, 0.445, 0.48].map((progress, index) => {
      const sample = sampleTrack(track, metrics.totalLength * progress);
      const side = -1;
      const position = tracksidePropPosition(track, sample, side, -0.4 + seededUnit(index * 11) * 1.3, 3.4, 1.1);
      return {
        ...position,
        heading: sample.heading + (seededUnit(index * 7) - 0.5) * 0.6,
        seed: index
      };
    });
  }, [track]);

  return (
    <group>
      {rocks.map((rock) => (
        <AlpineCliffRock key={`alpine-cliff-${rock.seed}`} position={[rock.x, rock.y, rock.z]} heading={rock.heading} seed={rock.seed} rain={rain} />
      ))}
    </group>
  );
}

function AlpineCliffRock({ position, heading, seed, rain }: { position: [number, number, number]; heading: number; seed: number; rain: boolean }) {
  const rock = rain ? "#68716d" : "#737b6e";
  const snow = rain ? "#d9e1e0" : "#eef2ee";
  const height = 2.8 + seededUnit(seed * 17) * 1.6;

  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh position={[0.12, 0.2, 0.05]} rotation={[0.02, seededUnit(seed * 5) * 0.5, 0]} scale={[2.7, 0.34, 1.45]} receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rain ? "#5e6764" : "#687164"} roughness={0.99} />
      </mesh>
      <mesh position={[0, height * 0.54, 0]} rotation={[0.12, seededUnit(seed * 3) * 0.4, -0.08]} scale={[2.55, height, 1.34]} castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rock} roughness={0.98} />
      </mesh>
      <mesh position={[1.75, height * 0.34, -0.45]} rotation={[-0.1, 0.42, 0.06]} scale={[1.6, height * 0.55, 1.1]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rain ? "#5e6764" : "#697265"} roughness={0.99} />
      </mesh>
      <mesh position={[-1.6, height * 0.28, 0.35]} rotation={[0.02, -0.36, 0.1]} scale={[1.5, height * 0.45, 1.0]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rain ? "#747d79" : "#7d8578"} roughness={0.99} />
      </mesh>
      <mesh position={[0.18, height + 0.5, -0.04]} rotation={[0.02, 0.2, 0]} scale={[1.25, 0.34, 0.76]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={snow} roughness={0.86} />
      </mesh>
    </group>
  );
}

function AlpineChaletFeature({ track, rain }: { track: TrackDef; rain: boolean }) {
  const placement = useMemo(() => {
    const sample = sampleTrack(track, trackMetrics(track).totalLength * 0.72);
    const position = tracksidePropPosition(track, sample, 1, 4.2, 4.3, 1.8);
    return { ...position, heading: sample.heading - 0.62 };
  }, [track]);

  return <AlpineChalet position={[placement.x, placement.y, placement.z]} heading={placement.heading} rain={rain} />;
}

function AlpineChalet({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  const timber = rain ? "#6f4a37" : "#87583d";
  const roof = rain ? "#31383f" : "#30343a";
  const snow = rain ? "#dce3e2" : "#f2f5f1";

  return (
    <group position={position} rotation={[0, heading, 0]} scale={[1.34, 1.34, 1.34]}>
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[3.5, 1.4, 2.35]} />
        <meshStandardMaterial color={timber} roughness={0.78} />
      </mesh>
      <mesh position={[0, 1.63, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[2.65, 1.25, 4]} />
        <meshStandardMaterial color={roof} roughness={0.64} />
      </mesh>
      <mesh position={[0, 2.2, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1.0, 0.2, 0.7]} castShadow>
        <coneGeometry args={[2.55, 0.45, 4]} />
        <meshStandardMaterial color={snow} roughness={0.84} />
      </mesh>
      {[-1.0, 1.0].map((x) => (
        <mesh key={`chalet-window-${x}`} position={[x, 0.88, -1.2]}>
          <boxGeometry args={[0.62, 0.38, 0.05]} />
          <meshStandardMaterial color={rain ? "#ffe0a0" : "#ffd166"} emissive="#5f300a" emissiveIntensity={rain ? 0.58 : 0.3} roughness={0.48} />
        </mesh>
      ))}
      <mesh position={[0, 0.28, -1.36]} castShadow>
        <boxGeometry args={[4.2, 0.18, 0.34]} />
        <meshStandardMaterial color={rain ? "#594032" : "#6b4a35"} roughness={0.76} />
      </mesh>
      {[-1.75, 0, 1.75].map((x) => (
        <mesh key={`chalet-rail-${x}`} position={[x, 0.62, -1.42]} castShadow>
          <boxGeometry args={[0.1, 0.68, 0.1]} />
          <meshStandardMaterial color={rain ? "#4a362d" : "#54392d"} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function AlpineCableCarFeature({ track, rain }: { track: TrackDef; rain: boolean }) {
  const placement = useMemo(() => {
    const sample = sampleTrack(track, trackMetrics(track).totalLength * 0.61);
    const position = tracksidePropPosition(track, sample, -1, 6.5, 4.6, 2);
    return { ...position, heading: sample.heading + 0.34 };
  }, [track]);

  return <AlpineCableCar position={[placement.x, placement.y, placement.z]} heading={placement.heading} rain={rain} />;
}

function AlpineCableCar({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  const steel = rain ? "#3d4548" : "#343b3f";
  const cabin = rain ? "#b83d43" : "#d64045";

  return (
    <group position={position} rotation={[0, heading, 0]} scale={[1.16, 1.14, 1.16]}>
      {[-6, 6].map((x) => (
        <group key={`cable-tower-${x}`} position={[x, 0, 0]}>
          <mesh position={[0, 2.15, 0]} castShadow>
            <boxGeometry args={[0.28, 4.3, 0.28]} />
            <meshStandardMaterial color={steel} roughness={0.56} metalness={0.12} />
          </mesh>
          <mesh position={[0, 4.32, 0]} castShadow>
            <boxGeometry args={[1.55, 0.18, 0.26]} />
            <meshStandardMaterial color={steel} roughness={0.56} metalness={0.12} />
          </mesh>
          <mesh position={[0, 0.1, 0]} receiveShadow>
            <boxGeometry args={[0.85, 0.2, 0.85]} />
            <meshStandardMaterial color={rain ? "#8b8d86" : "#a29d8f"} roughness={0.84} />
          </mesh>
        </group>
      ))}
      {[4.62, 4.86].map((y) => (
        <mesh key={`cable-line-${y}`} position={[0, y, 0]} castShadow>
          <boxGeometry args={[13.6, 0.045, 0.045]} />
          <meshStandardMaterial color={steel} roughness={0.42} metalness={0.2} />
        </mesh>
      ))}
      {[-2.2, 2.7].map((x, index) => (
        <group key={`cable-car-${index}`} position={[x, 3.68 - index * 0.12, 0]}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <boxGeometry args={[0.045, 0.72, 0.045]} />
            <meshStandardMaterial color={steel} roughness={0.48} metalness={0.12} />
          </mesh>
          <mesh castShadow>
            <boxGeometry args={[1.34, 0.88, 0.88]} />
            <meshStandardMaterial color={cabin} roughness={0.58} />
          </mesh>
          <mesh position={[0, 0.1, -0.41]}>
            <boxGeometry args={[0.84, 0.38, 0.035]} />
            <meshStandardMaterial color={rain ? "#d8eef4" : "#bfe8ff"} emissive="#18384b" emissiveIntensity={rain ? 0.3 : 0.18} roughness={0.42} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function SakuraGroundAccents({ track, rain }: { track: TrackDef; rain: boolean }) {
  const patches = useMemo(() => {
    const metrics = trackMetrics(track);
    return [
      { progress: 0.2, side: 1, s: 0.82, extra: 2.9 },
      { progress: 0.43, side: 1, s: 0.72, extra: 4.2 },
      { progress: 0.72, side: -1, s: 0.78, extra: 3.4 }
    ].map((patch, index) => {
      const sample = sampleTrack(track, metrics.totalLength * patch.progress);
      const position = tracksidePropPosition(track, sample, patch.side, patch.extra, patch.s * 2.7, 0.8);
      return { ...patch, ...position, rotation: seededUnit(index * 13) * Math.PI };
    });
  }, [track]);

  return (
    <group>
      {patches.map((patch, index) => (
        <mesh key={`sakura-petal-patch-${index}`} position={[patch.x, patch.y + 0.01, patch.z]} rotation={[-Math.PI / 2, 0, patch.rotation]} scale={[patch.s * 2.7, patch.s * 0.92, 1]}>
          <circleGeometry args={[1, 18]} />
          <meshBasicMaterial color={rain ? "#c88da0" : "#f2a8bd"} transparent opacity={rain ? 0.1 : 0.14} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function AlpineBackdrop({ rain }: { rain: boolean }) {
  const mountains: AlpineBackdropMountain[] = [
    { x: -92, z: 128, h: 25, r: 19, kind: "jagged" },
    { x: -46, z: 150, h: 32, r: 25, kind: "cone" },
    { x: 18, z: 158, h: 22, r: 18, kind: "jagged" },
    { x: 108, z: 152, h: 34, r: 28, kind: "cone" },
    { x: 178, z: 70, h: 26, r: 22, kind: "cone" }
  ];
  return (
    <group>
      {mountains.map((mountain, index) => (
        <AlpineBackdropPeak key={`mountain-${index}`} mountain={mountain} seed={index} rain={rain} />
      ))}
    </group>
  );
}

type AlpineBackdropMountain = { x: number; z: number; h: number; r: number; kind: "cone" | "jagged" };

function AlpineBackdropPeak({ mountain, seed, rain }: { mountain: AlpineBackdropMountain; seed: number; rain: boolean }) {
  const rock = rain ? "#707975" : "#7f8877";
  const shadowRock = rain ? "#646d69" : "#737d6f";
  const baseRock = rain ? "#59635f" : "#65705f";
  const snow = rain ? "#e5e8e8" : "#f4f6f2";

  if (mountain.kind === "cone") {
    return (
      <group position={[mountain.x, -0.2, mountain.z]} rotation={[0, seededUnit(seed * 17) * 0.8, 0]}>
        <mesh position={[0, mountain.h * 0.48, 0]} rotation={[0, 0.1 + seededUnit(seed * 13) * 0.28, 0]} scale={[mountain.r * 0.64, mountain.h * 0.96, mountain.r * 0.5]}>
          <coneGeometry args={[1, 1, 9]} />
          <meshStandardMaterial color={rock} roughness={0.98} />
        </mesh>
        <mesh position={[-mountain.r * 0.34, mountain.h * 0.28, mountain.r * 0.16]} rotation={[0, -0.28, 0]} scale={[mountain.r * 0.33, mountain.h * 0.56, mountain.r * 0.28]}>
          <coneGeometry args={[1, 1, 8]} />
          <meshStandardMaterial color={shadowRock} roughness={0.99} />
        </mesh>
        <mesh position={[mountain.r * 0.33, mountain.h * 0.24, -mountain.r * 0.2]} rotation={[0, 0.36, 0]} scale={[mountain.r * 0.3, mountain.h * 0.48, mountain.r * 0.25]}>
          <coneGeometry args={[1, 1, 8]} />
          <meshStandardMaterial color={baseRock} roughness={0.99} />
        </mesh>
        <mesh position={[0, 0.34, 0]} rotation={[0.02, -0.12, 0]} scale={[mountain.r * 0.72, mountain.h * 0.055, mountain.r * 0.54]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={baseRock} roughness={0.99} />
        </mesh>
        <mesh position={[0, mountain.h * 0.82, 0]} rotation={[0, 0.1, 0]} scale={[mountain.r * 0.22, mountain.h * 0.24, mountain.r * 0.18]}>
          <coneGeometry args={[1, 1, 9]} />
          <meshStandardMaterial color={snow} roughness={0.86} />
        </mesh>
        <mesh position={[-mountain.r * 0.34, mountain.h * 0.51, mountain.r * 0.16]} rotation={[0, -0.28, 0]} scale={[mountain.r * 0.1, mountain.h * 0.1, mountain.r * 0.08]}>
          <coneGeometry args={[1, 1, 8]} />
          <meshStandardMaterial color={snow} roughness={0.86} />
        </mesh>
      </group>
    );
  }

  return (
    <group position={[mountain.x, -0.2, mountain.z]} rotation={[0, seededUnit(seed * 17) * 0.8, 0]}>
      <mesh position={[0, mountain.h * 0.37, 0]} rotation={[0, 0.1 + seededUnit(seed * 13) * 0.28, 0]} scale={[mountain.r * 0.72, mountain.h * 0.74, mountain.r * 0.55]}>
        <coneGeometry args={[1, 1, 7]} />
        <meshStandardMaterial color={baseRock} roughness={0.99} />
      </mesh>
      <mesh position={[0, 0.44, 0]} rotation={[0.02, -0.12, 0]} scale={[mountain.r * 0.74, mountain.h * 0.075, mountain.r * 0.55]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={baseRock} roughness={0.99} />
      </mesh>
      <mesh position={[-mountain.r * 0.34, 0.36, mountain.r * 0.2]} rotation={[-0.02, 0.38, 0.03]} scale={[mountain.r * 0.42, mountain.h * 0.055, mountain.r * 0.3]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={shadowRock} roughness={0.99} />
      </mesh>
      <mesh position={[mountain.r * 0.35, 0.34, -mountain.r * 0.24]} rotation={[0.03, -0.26, -0.02]} scale={[mountain.r * 0.38, mountain.h * 0.05, mountain.r * 0.28]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={baseRock} roughness={0.99} />
      </mesh>
      <mesh position={[0, mountain.h * 0.45, 0]} rotation={[0.08, 0.22, -0.04]} scale={[mountain.r * 0.58, mountain.h * 0.45, mountain.r * 0.44]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rock} roughness={0.98} />
      </mesh>
      <mesh position={[-mountain.r * 0.36, mountain.h * 0.33, mountain.r * 0.16]} rotation={[-0.06, -0.3, 0.08]} scale={[mountain.r * 0.38, mountain.h * 0.32, mountain.r * 0.33]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={shadowRock} roughness={0.99} />
      </mesh>
      <mesh position={[mountain.r * 0.32, mountain.h * 0.27, -mountain.r * 0.22]} rotation={[0.02, 0.4, 0.08]} scale={[mountain.r * 0.34, mountain.h * 0.28, mountain.r * 0.3]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rain ? "#78817d" : "#858e7f"} roughness={0.99} />
      </mesh>
      <mesh position={[0, mountain.h * 0.86, 0]} rotation={[0.06, 0.2, 0]} scale={[mountain.r * 0.22, mountain.h * 0.08, mountain.r * 0.18]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={snow} roughness={0.86} />
      </mesh>
      <mesh position={[-mountain.r * 0.36, mountain.h * 0.61, mountain.r * 0.16]} rotation={[0.04, -0.22, 0]} scale={[mountain.r * 0.14, mountain.h * 0.06, mountain.r * 0.12]}>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={snow} roughness={0.86} />
      </mesh>
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
        const propOffset = 1.8 + seededUnit(index * 5) * 2.4;
        if (index % 3 === 1) {
          const position = tracksidePropPosition(track, sample, side, propOffset, 0.55, 0.8);
          return <SakuraLantern key={`sakura-lantern-${index}`} position={[position.x, position.y, position.z]} heading={sample.heading} rain={rain} />;
        }
        if (index % 4 === 2) {
          const bannerSide = Math.floor(index / 4) % 2 === 0 ? -1 : 1;
          const position = tracksidePropPosition(track, sample, bannerSide, 0.3 + seededUnit(index * 5) * 0.75, 1.85, 0.8);
          return (
            <SakuraBanner
              key={`sakura-banner-${index}`}
              position={[position.x, position.y + 1.24, position.z]}
              heading={sample.heading - bannerSide * (Math.PI / 2 - 0.18)}
              rain={rain}
            />
          );
        }
        const position = tracksidePropPosition(track, sample, side, propOffset, 2.1, 0.8);
        return <SakuraTree key={`sakura-tree-${index}`} position={[position.x, position.y, position.z]} seed={index} rain={rain} />;
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
  const texture = useMemo(() => createSakuraBannerTexture(rain), [rain]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh castShadow>
        <boxGeometry args={[3.8, 1.06, 0.1]} />
        <meshStandardMaterial color={rain ? "#c7798b" : "#ef92a8"} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0, 0.061]}>
        <planeGeometry args={[3.48, 0.74]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      {[-1.48, 1.48].map((x) => (
        <mesh key={x} position={[x, -0.8, -0.01]} castShadow>
          <boxGeometry args={[0.11, 1.48, 0.11]} />
          <meshStandardMaterial color="#2b2f35" roughness={0.58} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0.064]}>
        <boxGeometry args={[3.3, 0.05, 0.018]} />
        <meshStandardMaterial color={rain ? "#b64058" : "#d84763"} roughness={0.46} />
      </mesh>
      <mesh position={[0, -0.42, 0.064]}>
        <boxGeometry args={[3.3, 0.05, 0.018]} />
        <meshStandardMaterial color={rain ? "#343237" : "#27242b"} roughness={0.5} />
      </mesh>
    </group>
  );
}

function createSakuraBannerTexture(rain: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 1152;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = rain ? "#e9b2bd" : "#ffe4ec";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = rain ? "#f4d4d9" : "#fff6f2";
    context.fillRect(42, 38, canvas.width - 84, canvas.height - 76);
    context.strokeStyle = rain ? "#9d5267" : "#d84763";
    context.lineWidth = 16;
    context.strokeRect(28, 24, canvas.width - 56, canvas.height - 48);
    context.fillStyle = rain ? "#9d5267" : "#d84763";
    context.fillRect(68, 62, 86, 14);
    context.fillRect(canvas.width - 154, canvas.height - 76, 86, 14);
    context.fillStyle = "#26212a";
    context.font = "900 112px Inter, Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("try not to lose", canvas.width / 2, canvas.height / 2 + 6);
    context.fillStyle = rain ? "rgba(157, 82, 103, 0.28)" : "rgba(216, 71, 99, 0.22)";
    for (const [x, y, radius] of [
      [188, 172, 8],
      [844, 88, 7],
      [886, 112, 5],
      [144, 94, 5]
    ]) {
      context.beginPath();
      context.ellipse(x, y, radius, radius * 0.56, -0.45, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
    const waterfallSample = sampleTrack(track, metrics.totalLength * 0.165);
    const villageSample = sampleTrack(track, metrics.totalLength * 0.69);
    const lookoutSample = sampleTrack(track, metrics.totalLength * 0.455);
    return {
      waterfall: { ...tracksidePropPosition(track, waterfallSample, -1, 11, 6.8, 2.4), heading: waterfallSample.heading + 0.25 },
      village: { ...tracksidePropPosition(track, villageSample, 1, 2.8, 7.4, 2.2), heading: villageSample.heading - 0.28 },
      lookout: { ...tracksidePropPosition(track, lookoutSample, 1, 0.8, 6.0, 1.4), heading: lookoutSample.heading - 0.62 }
    };
  }, [track]);

  return (
    <group>
      <FjordWater bounds={bounds} rain={rain} />
      <FjordBackdrop bounds={bounds} rain={rain} />
      <FjordWaterfall position={[scenicAnchors.waterfall.x, scenicAnchors.waterfall.y, scenicAnchors.waterfall.z]} heading={scenicAnchors.waterfall.heading} rain={rain} />
      <FjordVillage position={[scenicAnchors.village.x, scenicAnchors.village.y, scenicAnchors.village.z]} heading={scenicAnchors.village.heading} rain={rain} />
      <FjordLookout position={[scenicAnchors.lookout.x, scenicAnchors.lookout.y, scenicAnchors.lookout.z]} heading={scenicAnchors.lookout.heading} rain={rain} />
      <FjordScenicMarkers track={track} rain={rain} />
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
      <mesh position={[0, 5.7, 0]} rotation={[0.04, 0, 0.02]} scale={[4.8, 6.0, 0.86]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rain ? "#69716f" : "#747b70"} roughness={0.98} />
      </mesh>
      <mesh position={[-3.5, 3.55, -0.42]} rotation={[0.08, -0.18, 0.04]} scale={[2.2, 3.2, 0.98]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rain ? "#69716f" : "#747b70"} roughness={0.98} />
      </mesh>
      <mesh position={[3.55, 3.85, -0.28]} rotation={[0.08, 0.22, -0.03]} scale={[2.35, 3.45, 1.0]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={rain ? "#69716f" : "#747b70"} roughness={0.98} />
      </mesh>
      {[-5.2, 5.4].map((x, index) => (
        <mesh key={`fjord-fall-rock-${index}`} position={[x * 0.68, 1.35, -1.02]} rotation={[0.15, 0.18 * (index === 0 ? -1 : 1), 0.06]} scale={[1.8, 0.68, 0.96]} castShadow>
          <dodecahedronGeometry args={[1.1, 0]} />
          <meshStandardMaterial color={rain ? "#5f6967" : "#646d61"} roughness={0.96} />
        </mesh>
      ))}
      <mesh position={[0, 4.78, -1.22]} rotation={[0, 0, 0.08]}>
        <planeGeometry args={[1.85, 8.8]} />
        <meshBasicMaterial color={rain ? "#d8eef4" : "#e7fbff"} transparent opacity={rain ? 0.52 : 0.62} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {[-1.35, 1.45].map((x, index) => (
        <mesh key={`fjord-fall-stream-${index}`} position={[x * 0.62, 4.1, -1.36]} rotation={[0, 0, index === 0 ? -0.05 : 0.04]}>
          <planeGeometry args={[0.34, 6.9]} />
          <meshBasicMaterial color="#f3feff" transparent opacity={rain ? 0.36 : 0.46} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <mesh position={[0, 0.12, -1.76]} rotation={[-Math.PI / 2, 0, 0]} scale={[3.4, 1.5, 1]}>
        <circleGeometry args={[1, 26]} />
        <meshBasicMaterial color="#cfefff" transparent opacity={rain ? 0.2 : 0.34} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {[-2.2, 0.2, 2.5].map((x, index) => (
        <mesh key={`fjord-fall-mist-${index}`} position={[x * 0.72, 0.5 + index * 0.05, -2.0 - index * 0.15]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.36 - index * 0.16, 0.45, 1]}>
          <circleGeometry args={[1, 18]} />
          <meshBasicMaterial color="#f1fbff" transparent opacity={rain ? 0.12 : 0.18} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function FjordScenicMarkers({ track, rain }: { track: TrackDef; rain: boolean }) {
  const markers = useMemo(() => {
    const metrics = trackMetrics(track);
    return [
      { progress: 0.135, side: -1, length: 9.5 },
      { progress: 0.445, side: 1, length: 11.5 },
      { progress: 0.685, side: 1, length: 10.5 }
    ].map((marker, index) => {
      const sample = sampleTrack(track, metrics.totalLength * marker.progress);
      const position = tracksidePropPosition(track, sample, marker.side, 0.3, 0.4, 0.8);
      return { ...marker, ...position, heading: sample.heading, seed: index };
    });
  }, [track]);

  return (
    <group>
      {markers.map((marker) => (
        <FjordCliffRail key={`fjord-rail-${marker.seed}`} position={[marker.x, marker.y, marker.z]} heading={marker.heading} length={marker.length} rain={rain} />
      ))}
    </group>
  );
}

function FjordCliffRail({ position, heading, length, rain }: { position: [number, number, number]; heading: number; length: number; rain: boolean }) {
  const postCount = Math.max(3, Math.round(length / 2.6));
  return (
    <group position={position} rotation={[0, heading, 0]}>
      {Array.from({ length: postCount }).map((_, index) => {
        const z = -length / 2 + (length / Math.max(1, postCount - 1)) * index;
        return (
          <mesh key={`fjord-rail-post-${index}`} position={[0, 0.62, z]} castShadow>
            <boxGeometry args={[0.16, 1.22, 0.16]} />
            <meshStandardMaterial color={rain ? "#273037" : "#303636"} roughness={0.68} />
          </mesh>
        );
      })}
      {[0.58, 1.04].map((y) => (
        <mesh key={`fjord-rail-bar-${y}`} position={[0, y, 0]} castShadow>
          <boxGeometry args={[0.16, 0.12, length]} />
          <meshStandardMaterial color={rain ? "#273037" : "#303636"} roughness={0.68} />
        </mesh>
      ))}
      <mesh position={[0.42, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.7, length + 0.8]} />
        <meshStandardMaterial color={rain ? "#77817d" : "#8f9488"} roughness={0.92} />
      </mesh>
    </group>
  );
}

function FjordVillage({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]} scale={[1.5, 1.5, 1.5]}>
      {[-3.8, -1.25, 1.35, 3.9].map((x, index) => (
        <group key={`fjord-cabin-${index}`} position={[x, 0, index % 2 === 0 ? 0.85 : -0.78]} rotation={[0, (index - 1.5) * 0.13, 0]}>
          <mesh position={[0, 0.68, 0]} castShadow>
            <boxGeometry args={[1.8, 1.28, 1.44]} />
            <meshStandardMaterial color={rain ? "#8d4c42" : "#a4473e"} roughness={0.72} />
          </mesh>
          <mesh position={[0, 1.5, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.48, 0.95, 4]} />
            <meshStandardMaterial color={rain ? "#303941" : "#2d3339"} roughness={0.62} />
          </mesh>
          <mesh position={[0, 0.86, -0.74]}>
            <boxGeometry args={[0.7, 0.38, 0.04]} />
            <meshStandardMaterial color={rain ? "#ffe1a0" : "#ffd166"} emissive="#5f300a" emissiveIntensity={rain ? 0.55 : 0.28} roughness={0.48} />
          </mesh>
        </group>
      ))}
      <mesh position={[0.1, 0.06, -2.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9.2, 0.82]} />
        <meshStandardMaterial color={rain ? "#463a2e" : "#5b4936"} roughness={0.78} />
      </mesh>
      {[-3.2, -1.05, 1.1, 3.25].map((x) => (
        <mesh key={`fjord-dock-post-${x}`} position={[x, 0.46, -3.08]} castShadow>
          <boxGeometry args={[0.14, 0.86, 0.14]} />
          <meshStandardMaterial color={rain ? "#3d342c" : "#5b4936"} roughness={0.74} />
        </mesh>
      ))}
      <mesh position={[4.95, 0.74, -1.65]} rotation={[0, -0.25, 0]} castShadow>
        <boxGeometry args={[0.14, 1.24, 0.14]} />
        <meshStandardMaterial color="#2f3438" roughness={0.6} />
      </mesh>
      <mesh position={[4.95, 1.22, -1.65]} rotation={[0, -0.25, 0]}>
        <boxGeometry args={[1.0, 0.42, 0.06]} />
        <meshStandardMaterial color={rain ? "#fff4d7" : "#fff7df"} roughness={0.56} />
      </mesh>
    </group>
  );
}

function FjordLookout({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]} scale={[1.16, 1.16, 1.16]}>
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <cylinderGeometry args={[3.9, 4.5, 0.36, 7]} />
        <meshStandardMaterial color={rain ? "#8a8e87" : "#a6a897"} roughness={0.86} />
      </mesh>
      {[-2.65, -1.3, 0, 1.3, 2.65].map((x) => (
        <mesh key={x} position={[x, 0.88, -2.2]}>
          <boxGeometry args={[0.1, 1.4, 0.1]} />
          <meshStandardMaterial color="#2f3438" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.45, -2.2]}>
        <boxGeometry args={[5.7, 0.14, 0.1]} />
        <meshStandardMaterial color="#2f3438" roughness={0.6} />
      </mesh>
      <mesh position={[-2.55, 1.0, 1.15]} castShadow>
        <boxGeometry args={[0.14, 1.8, 0.14]} />
        <meshStandardMaterial color="#303636" roughness={0.65} />
      </mesh>
      <mesh position={[-2.1, 1.62, 1.16]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.95, 0.5, 0.05]} />
        <meshStandardMaterial color={rain ? "#df484e" : "#d53d45"} roughness={0.48} />
      </mesh>
      <mesh position={[1.85, 0.48, 1.2]} rotation={[-Math.PI / 2, 0, -0.2]}>
        <planeGeometry args={[2.4, 1.2]} />
        <meshStandardMaterial color={rain ? "#6e7773" : "#7f887a"} roughness={0.88} />
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
    return { ...tracksidePropPosition(track, highest, 1, 3.2, 6.5, 2.8), heading: highest.heading - 0.35 };
  }, [track]);

  return (
    <group>
      <CloudlineBackdrop bounds={bounds} rain={rain} />
      <CloudlineSummit position={[summit.x, summit.y, summit.z]} heading={summit.heading} rain={rain} />
      <CloudWisps bounds={bounds} rain={rain} />
      <CloudlineRidgeDetails track={track} rain={rain} />
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
    <group position={position} rotation={[0, heading, 0]} scale={[1.55, 1.55, 1.55]}>
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[8.4, 32]} />
        <meshStandardMaterial color={rain ? "#cfd8d7" : "#eef1f2"} roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.34, 0]} castShadow>
        <cylinderGeometry args={[3.1, 3.55, 2.45, 18]} />
        <meshStandardMaterial color={rain ? "#c3c9c8" : "#e3e2d8"} roughness={0.72} />
      </mesh>
      <mesh position={[0, 2.86, 0]} castShadow>
        <sphereGeometry args={[2.32, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={rain ? "#8fa8b0" : "#9cc4d2"} roughness={0.42} metalness={0.12} />
      </mesh>
      <mesh position={[4.65, 5.05, -0.55]} rotation={[0, 0, 0.08]} castShadow>
        <cylinderGeometry args={[0.14, 0.19, 9.2, 8]} />
        <meshStandardMaterial color="#2c3137" roughness={0.52} />
      </mesh>
      {[0, 1, 2].map((level) => (
        <mesh key={level} position={[4.65, 1.7 + level * 1.92, -0.55]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.88 + level * 0.2, 0.03, 8, 28]} />
          <meshStandardMaterial color={rain ? "#dfe6e6" : "#f8f5e8"} roughness={0.5} metalness={0.08} />
        </mesh>
      ))}
      {[-6.5, 6.5].map((x) => (
        <group key={`cloudline-summit-marker-${x}`} position={[x, 0, 4.5]}>
          <mesh position={[0, 1.6, 0]} castShadow>
            <boxGeometry args={[0.16, 3.2, 0.16]} />
            <meshStandardMaterial color="#2c3137" roughness={0.55} />
          </mesh>
          <mesh position={[0, 3.25, 0]} castShadow>
            <boxGeometry args={[0.52, 0.52, 0.52]} />
            <meshStandardMaterial color={rain ? "#f0f2f0" : "#fff7df"} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CloudlineRidgeDetails({ track, rain }: { track: TrackDef; rain: boolean }) {
  const details = useMemo(() => {
    const metrics = trackMetrics(track);
    return [
      { progress: 0.18, side: -1, kind: "poles" as const },
      { progress: 0.29, side: 1, kind: "cliff" as const },
      { progress: 0.43, side: -1, kind: "poles" as const },
      { progress: 0.515, side: -1, kind: "summit" as const },
      { progress: 0.61, side: 1, kind: "cliff" as const },
      { progress: 0.72, side: -1, kind: "poles" as const },
      { progress: 0.84, side: 1, kind: "cliff" as const }
    ].map((detail, index) => {
      const sample = sampleTrack(track, metrics.totalLength * detail.progress);
      const radius = detail.kind === "cliff" ? 5.2 : detail.kind === "summit" ? 1.2 : 0.5;
      const extra = detail.kind === "cliff" ? 3.8 : 1.2;
      const position = tracksidePropPosition(track, sample, detail.side, extra, radius, 1.2);
      return { ...detail, ...position, heading: sample.heading, seed: index };
    });
  }, [track]);

  return (
    <group>
      {details.map((detail) => {
        if (detail.kind === "cliff") {
          return <CloudlineCliffBreak key={`cloudline-cliff-${detail.seed}`} position={[detail.x, detail.y, detail.z]} heading={detail.heading} seed={detail.seed} rain={rain} />;
        }
        if (detail.kind === "summit") {
          return <CloudlineSummitPoles key="cloudline-summit-poles" position={[detail.x, detail.y, detail.z]} heading={detail.heading} rain={rain} />;
        }
        return <CloudlineSnowPoles key={`cloudline-poles-${detail.seed}`} position={[detail.x, detail.y, detail.z]} heading={detail.heading} seed={detail.seed} rain={rain} />;
      })}
    </group>
  );
}

function CloudlineSnowPoles({ position, heading, seed, rain }: { position: [number, number, number]; heading: number; seed: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      {[-3.2, -1.1, 1.15, 3.25].map((z, index) => (
        <group key={`cloudline-snow-pole-${index}`} position={[seed % 2 === 0 ? 0 : 0.35, 0, z]}>
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[0.12, 2.3, 0.12]} />
            <meshStandardMaterial color={rain ? "#e3e8e8" : "#f4f0dd"} roughness={0.54} />
          </mesh>
          <mesh position={[0, 1.82, 0.01]}>
            <boxGeometry args={[0.14, 0.28, 0.14]} />
            <meshStandardMaterial color="#d53d45" roughness={0.44} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CloudlineCliffBreak({ position, heading, seed, rain }: { position: [number, number, number]; heading: number; seed: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading + seededUnit(seed * 13) * 0.18 - 0.09, 0]}>
      {[-3.8, 0, 3.7].map((z, index) => (
        <mesh key={`cloudline-cliff-rock-${index}`} position={[0.25 * (index - 1), 0.72, z]} rotation={[0.08, seededUnit(seed * (index + 5)) * 0.5, 0.04]} scale={[3.2 - index * 0.25, 0.82, 1.42 + index * 0.18]} castShadow>
          <dodecahedronGeometry args={[1.25, 0]} />
          <meshStandardMaterial color={rain ? "#687273" : "#727d76"} roughness={0.98} />
        </mesh>
      ))}
      <mesh position={[0, 1.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[5.8, 8.8]} />
        <meshStandardMaterial color={rain ? "#d6dfdf" : "#f1f4f3"} roughness={0.9} />
      </mesh>
    </group>
  );
}

function CloudlineSummitPoles({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      {[-1.8, 0, 1.8].map((z, index) => (
        <group key={`cloudline-summit-pole-${index}`} position={[0, 0, z]}>
          <mesh position={[0, 1.75, 0]} castShadow>
            <boxGeometry args={[0.16, 3.5, 0.16]} />
            <meshStandardMaterial color="#2c3137" roughness={0.54} />
          </mesh>
          <mesh position={[0.38, 3.0, 0]} rotation={[0, 0, index % 2 === 0 ? 0.05 : -0.05]}>
            <boxGeometry args={[0.76, 0.36, 0.05]} />
            <meshStandardMaterial color={rain ? "#f2eee0" : "#fff7df"} roughness={0.52} />
          </mesh>
        </group>
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
  const turn = -clamp(steer, -1, 1) * 0.8;
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
  const isPaws = style === "paws";
  const x = side * (isPaws ? 0.39 : 0.402);
  const skin = style === "paws" ? "#f2c8a4" : "#d4a06f";
  const fingerOffsets = [-0.066, -0.022, 0.022, 0.066];
  return (
    <group position={[x, isPaws ? -0.018 : -0.004, isPaws ? -0.012 : -0.006]} rotation={[isPaws ? 0.16 : 0.1, side * (isPaws ? 0 : 0.04), side * (isPaws ? -0.28 : -0.22)]}>
      <mesh position={isPaws ? [0, 0, 0] : [0, -0.056, -0.08]} scale={isPaws ? [1.38, 0.86, 0.72] : [1.12, 0.56, 0.38]}>
        <sphereGeometry args={[isPaws ? 0.158 : 0.116, 20, 12]} />
        <meshStandardMaterial color={skin} roughness={0.76} />
      </mesh>
      {isPaws ? (
        <>
          {[-0.076, 0, 0.076].map((offset) => (
            <mesh key={`paw-back-groove-${offset}`} position={[offset, 0.044, -0.115]} rotation={[-0.12, 0, offset * -1.45]} scale={[1, 1.06, 1]}>
              <boxGeometry args={[0.02, 0.145, 0.018]} />
              <meshStandardMaterial color="#9f6748" roughness={0.86} />
            </mesh>
          ))}
          {[-0.11, -0.037, 0.037, 0.11].map((offset) => (
            <mesh key={`paw-knuckle-${offset}`} position={[offset, 0.12 - Math.abs(offset) * 0.04, -0.106]} scale={[1.1, 0.52, 0.34]}>
              <sphereGeometry args={[0.026, 10, 6]} />
              <meshStandardMaterial color="#f7d7bd" roughness={0.78} />
            </mesh>
          ))}
          {[-0.108, 0.108].map((offset) => (
            <mesh key={`paw-side-${offset}`} position={[offset, -0.004, -0.034]} scale={[0.78, 0.58, 0.54]}>
              <sphereGeometry args={[0.048, 10, 8]} />
              <meshStandardMaterial color={skin} roughness={0.8} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {fingerOffsets.map((offset, index) => {
            const length = [0.106, 0.134, 0.126, 0.096][index];
            const width = [0.019, 0.023, 0.022, 0.018][index];
            return (
              <group key={offset} position={[offset, 0.018 - Math.abs(offset) * 0.02, -0.11]} rotation={[0.08, side * 0.03, offset * -0.95]}>
                <mesh position={[0, length * 0.1, 0]} scale={[1, 1, 0.72]}>
                  <capsuleGeometry args={[width, length, 3, 9]} />
                  <meshStandardMaterial color={skin} roughness={0.72} />
                </mesh>
                <mesh position={[0, -length * 0.48, -0.004]} scale={[1.16, 0.5, 0.32]}>
                  <sphereGeometry args={[width * 1.08, 9, 6]} />
                  <meshStandardMaterial color={skin} roughness={0.76} />
                </mesh>
                <mesh position={[0, length * 0.63, 0.01]} rotation={[0.68, 0, 0]} scale={[1, 0.72, 0.56]}>
                  <capsuleGeometry args={[width * 0.88, 0.034, 3, 8]} />
                  <meshStandardMaterial color={skin} roughness={0.74} />
                </mesh>
              </group>
            );
          })}
          <mesh position={[side * -0.096, -0.004, -0.092]} rotation={[0.46, side * 0.18, side * 0.78]} scale={[1.08, 0.86, 0.62]}>
            <capsuleGeometry args={[0.026, 0.098, 3, 9]} />
            <meshStandardMaterial color={skin} roughness={0.72} />
          </mesh>
          <mesh position={[side * -0.068, -0.05, -0.092]} rotation={[0.08, 0, side * 0.42]} scale={[1.05, 0.48, 0.34]}>
            <sphereGeometry args={[0.038, 10, 6]} />
            <meshStandardMaterial color={skin} roughness={0.78} />
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
  const [controllerCountdownMark, setControllerCountdownMark] = useState<number>();
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
        if ("serverNow" in message) updateServerClock(message.serverNow);
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
          setControllerCountdownMark(message.countdownMark);
          setRoom((current) => current ? { ...current, phase: message.roomPhase } : current);
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
          setControllerCountdownMark(undefined);
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
        setControllerCountdownMark(undefined);
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

  return { room, clientId, displayGroupId, playerId, joinedToken, liveStats, feedback, controllerCrashEvents, controllerCountdownMark, notice, isConnected, send };
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

function updateControllerAudio(audio: ControllerAudio | null, car: CarState | undefined, room: RoomState, pedals: { throttle: number; brake: number }, crashEvents: CrashEvent[], countdownMark?: number) {
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

  updateCountdownAudio(audio, room, countdownMark);
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

function updateCountdownAudio(audio: ControllerAudio, room: RoomState, countdownMark?: number) {
  if (room.phase === "countdown" && room.countdownEndsAt) {
    const remaining = Math.max(0, room.countdownEndsAt - currentServerTimeMs());
    const mark = countdownMark ?? clamp(Math.ceil(remaining / 1000), 1, 5);
    if (mark < 1 || audio.lastCountdownMark === mark) return;
    audio.lastCountdownMark = mark;
    playCue(audio, "countdown");
    return;
  }
  if (room.phase === "racing") {
    if (audio.lastCountdownMark !== undefined && audio.lastCountdownMark !== "go") {
      audio.lastCountdownMark = "go";
      playCue(audio, "go");
    }
    return;
  }
  audio.lastCountdownMark = undefined;
}

function playCue(audio: ControllerAudio, kind: "countdown" | "go" | "impact" | "explosion" | "start", intensity = 1) {
  const context = audio.context;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  osc.type = kind === "impact" || kind === "explosion" ? "square" : kind === "go" ? "triangle" : "sine";
  osc.frequency.value = kind === "go" ? 760 : kind === "countdown" ? 560 : kind === "explosion" ? 54 : kind === "impact" ? 80 : 660;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "go" ? 0.22 : kind === "explosion" ? 0.24 * intensity : kind === "impact" ? 0.18 * intensity : 0.12, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "go" ? 0.44 : kind === "explosion" ? 0.46 : kind === "impact" ? 0.16 : 0.18));
  osc.connect(gain);
  gain.connect(audio.masterGain);
  osc.start(now);
  osc.stop(now + (kind === "go" ? 0.48 : kind === "explosion" ? 0.52 : 0.38));
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
