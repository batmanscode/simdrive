import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Activity, ArrowLeft, ArrowRight, Flag, Gamepad2, Gauge, Play, RotateCcw, Smartphone, Trophy, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TRACKS, trackMetrics } from "./shared/tracks";
import type { CarState, InputFrame, RaceSettings, RoomState, ServerMessage, TrackDef } from "./shared/types";

const COLORS = ["#ff3b5c", "#16c784", "#35a7ff", "#ffd166", "#c77dff", "#ff8f3d", "#5eead4", "#f472b6"];
const STEERING_SENSITIVITY_KEY = "drive-sim-steering-sensitivity-level";
const STEERING_SENSITIVITY_DEFAULT = 6;

export function App() {
  const isController = location.pathname.startsWith("/controller");
  return isController ? <ControllerApp /> : <DisplayApp />;
}

function DisplayApp() {
  const game = useGameSocket();
  const [joinCode, setJoinCode] = useState("");

  if (!game.room) {
    return (
      <main className="landing">
        <section className="hero">
          <div>
            <p className="eyebrow">Multiplayer phone-controller racing</p>
            <h1>Drive Sim</h1>
            <p className="hero-copy">Create a room on this screen, scan with a phone, and race from a cockpit view where tilt steering, engine audio, tire slip, curb rumble, rain, and optional vibration make the car feel alive.</p>
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
                <button type="submit">Join Screen</button>
              </form>
            </div>
            <small className="hero-note">No install needed. One-player practice works, and room races support up to 8 drivers.</small>
          </div>
          <div className="hero-panel">
            <div className="stat">
              <Smartphone />
              <div><strong>Phone Controller</strong><span>Tilt steering, touch pedals, calibration, and fallback buttons.</span></div>
            </div>
            <div className="stat">
              <Users />
              <div><strong>Room Multiplayer</strong><span>Scan a QR code, join fast, race solo or with up to 8 drivers.</span></div>
            </div>
            <div className="stat">
              <Gauge />
              <div><strong>Sim-Lite Feel</strong><span>Lateral slip, tuned braking, rain grip, curbs, grass, and gentle assist.</span></div>
            </div>
            <div className="stat">
              <Gamepad2 />
              <div><strong>Driver Feedback</strong><span>Engine, tires, brake tone, impacts, countdown, and supported vibration.</span></div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (game.room.phase === "racing" || game.room.phase === "countdown") {
    return <RaceDisplay room={game.room} displayGroupId={game.displayGroupId} />;
  }

  if (game.room.phase === "results") {
    return <ResultsDisplay room={game.room} send={game.send} />;
  }

  return <LobbyDisplay room={game.room} displayGroupId={game.displayGroupId} />;
}

function LobbyDisplay({ room, displayGroupId }: { room: RoomState; displayGroupId?: string }) {
  const controllerUrl = makeControllerUrl(room.roomCode, displayGroupId);
  const track = TRACKS[room.settings.trackId];

  return (
    <main className="lobby">
      <section className="join-card">
        <div className="qr-wrap">
          <QRCodeSVG value={controllerUrl} size={260} bgColor="#f5f1e8" fgColor="#101214" />
        </div>
        <div className="room-code">{room.roomCode}</div>
        <p>Scan with your phone or open the controller page and enter this code.</p>
      </section>

      <section className="lobby-main">
        <div className="topline">
          <h2>Lobby</h2>
          <span>{room.players.length}/8 racers</span>
        </div>
        <PlayerGrid room={room} />
        <div className="settings-strip">
          <div>
            <span>Track</span>
            <strong>{track.name}</strong>
          </div>
          <div>
            <span>Laps</span>
            <strong>{room.settings.lapCount}</strong>
          </div>
          <div>
            <span>Rain</span>
            <strong>{room.settings.rain ? "On" : "Off"}</strong>
          </div>
          <div>
            <span>Rolling</span>
            <strong>{room.settings.rollingStart ? "On" : "Off"}</strong>
          </div>
          <div>
            <span>Collisions</span>
            <strong>{room.settings.ghostMode ? "Ghost" : "On"}</strong>
          </div>
          <div>
            <span>Assist</span>
            <strong>{room.settings.stabilityAssist ? "Gentle" : "Off"}</strong>
          </div>
        </div>
        <div className="track-preview">
          <MiniTrack track={track} />
          <div>
            <h3>{track.name}</h3>
            <p>{track.description}</p>
            <small>Target lap: {track.targetLap}. Gentle assist nudges cars toward the track direction to make steering more forgiving.</small>
          </div>
        </div>
      </section>
    </main>
  );
}

function PlayerGrid({ room }: { room: RoomState }) {
  return (
    <div className="players">
      {room.players.map((player) => (
        <div className="player" key={player.id}>
          <span className="swatch" style={{ background: player.color }} />
          <div>
            <strong>{player.name}</strong>
            <small>{player.isVIP ? "VIP" : player.isReady ? "Ready" : "Setting up"} · {player.connected ? "online" : "reconnecting"}</small>
          </div>
        </div>
      ))}
      {room.players.length === 0 && <div className="empty">Waiting for the first phone controller.</div>}
    </div>
  );
}

function RaceDisplay({ room, displayGroupId }: { room: RoomState; displayGroupId?: string }) {
  const localPlayers = room.players.filter((player) => player.displayGroupId === displayGroupId);
  const panes = (localPlayers.length ? localPlayers : room.players).slice(0, 4);
  const countdown = room.countdownEndsAt ? Math.max(0, Math.ceil((room.countdownEndsAt - Date.now()) / 1000)) : 0;
  const className = `race-grid panes-${Math.max(1, panes.length)}`;

  return (
    <main className="race-screen">
      <div className={className}>
        {panes.map((player) => (
          <div className="race-pane" key={player.id}>
            <RaceCanvas room={room} focusPlayerId={player.id} />
            <RaceHud room={room} focusPlayerId={player.id} />
            <RaceMiniMap room={room} focusPlayerId={player.id} />
            <RaceLeaderboard room={room} focusPlayerId={player.id} />
          </div>
        ))}
      </div>
      {room.phase === "countdown" && <div className="countdown">{countdown || "GO"}</div>}
    </main>
  );
}

function RaceHud({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const player = room.players.find((item) => item.id === focusPlayerId);
  const car = room.cars.find((item) => item.playerId === focusPlayerId);
  const speed = car ? Math.round(car.speed * 3.6) : 0;
  return (
    <div className="race-hud">
      <div><span className="swatch" style={{ background: player?.color }} />{player?.name}</div>
      <div>Lap {car?.lap ?? 1}/{room.settings.lapCount}</div>
      <div>{speed} km/h</div>
    </div>
  );
}

function RaceMiniMap({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const track = TRACKS[room.settings.trackId];
  const bounds = getTrackBounds(track);
  const points = track.points.map((point) => `${projectMiniX(point.x, bounds)},${projectMiniY(point.z, bounds)}`).join(" ");
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
      const distance = car ? (Math.min(car.lap, room.settings.lapCount + 1) - 1) * totalLength + car.progress : 0;
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

function ResultsDisplay({ room, send }: { room: RoomState; send: ReturnType<typeof useGameSocket>["send"] }) {
  const vip = room.players.find((player) => player.isVIP);
  return (
    <main className="results">
      <section>
        <h2><Trophy /> Results</h2>
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
  const [roomCode, setRoomCode] = useState(params.get("room")?.toUpperCase() ?? "");
  const [displayGroupId] = useState(params.get("group") ?? "");
  const [name, setName] = useState(localStorage.getItem("drive-sim-name") ?? `Guest ${Math.floor(Math.random() * 90 + 10)}`);
  const [color, setColor] = useState(localStorage.getItem("drive-sim-color") ?? COLORS[Math.floor(Math.random() * COLORS.length)]);
  const token = localStorage.getItem(`drive-sim-token-${roomCode}`);
  const player = game.room?.players.find((item) => item.id === game.playerId);

  useEffect(() => {
    if (game.joinedToken && roomCode) {
      localStorage.setItem(`drive-sim-token-${roomCode}`, game.joinedToken);
    }
  }, [game.joinedToken, roomCode]);

  if (!game.playerId) {
    return (
      <main className="phone setup">
        <h1>Drive Sim</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            localStorage.setItem("drive-sim-name", name);
            localStorage.setItem("drive-sim-color", color);
            game.send({ type: "set_profile", roomCode, displayGroupId, token: token ?? undefined, name, color });
          }}
        >
          <label>
            Room
            <input value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={4} placeholder="CODE" />
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
          <button className="primary" type="submit"><Smartphone size={18} /> Join Controller</button>
        </form>
      </main>
    );
  }

  if (game.room?.phase === "racing" || game.room?.phase === "countdown") {
    return <RaceController send={game.send} feedback={game.feedback} room={game.room} playerId={game.playerId} />;
  }

  return <ControllerLobby room={game.room} player={player} send={game.send} feedback={game.feedback} />;
}

function ControllerLobby({ room, player, send, feedback }: { room?: RoomState; player?: { isVIP: boolean; isReady: boolean }; send: ReturnType<typeof useGameSocket>["send"]; feedback?: CarState }) {
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionStatus, setMotionStatus] = useState(sensorSupported() ? "Motion ready" : "Motion unavailable");
  const [motionLevel, setMotionLevel] = useState(0);
  const [audioEnabled, setAudioEnabled] = useStoredBoolean("drive-sim-audio-enabled", true);
  const [audioStatus, setAudioStatus] = useState(audioEnabled ? "Audio on" : "Audio off");
  const [hapticStatus, setHapticStatus] = useState(hapticSupportMessage());
  const [hapticsEnabled, setHapticsEnabled] = useStoredBoolean("drive-sim-haptics-enabled", true);
  const [brakeStart, setBrakeStart] = useStoredNumber("drive-sim-brake-start", 0);
  const [throttleStart, setThrottleStart] = useStoredNumber("drive-sim-throttle-start", 0);
  const [steeringLevel, setSteeringLevel] = useStoredRangeNumber(STEERING_SENSITIVITY_KEY, STEERING_SENSITIVITY_DEFAULT, 1, 10);
  const steeringSensitivity = steeringSensitivityFromLevel(steeringLevel);
  const settings = room?.settings;

  useEffect(() => {
    const neutral = { current: undefined as number | undefined };
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null && event.gamma === null) return;
      const raw = readSteeringTilt(event, getScreenAngle());
      neutral.current ??= raw;
      setMotionLevel(clamp(((raw - neutral.current) / 28) * steeringSensitivity, -1, 1));
      setMotionStatus("Motion live");
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [steeringSensitivity]);

  return (
    <main className="phone controller-lobby">
      <h1>{player?.isVIP ? "VIP Settings" : "Ready Room"}</h1>
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
          const result = pulseHaptic([35, 30, 55]);
          setHapticStatus(hapticResultMessage(result));
        }}
      >
        <Activity size={18} /> Test Haptics
      </button>
      <small className="phone-note">{hapticStatus}</small>
      <SteeringSensitivityPreference value={steeringLevel} onChange={setSteeringLevel} />
      <StartPreference label="Brake first tap" value={brakeStart} onChange={setBrakeStart} />
      <StartPreference label="Throttle first tap" value={throttleStart} onChange={setThrottleStart} />
      {player?.isVIP && settings && (
        <div className="vip-controls">
          <TrackPicker settings={settings} send={send} />
          <Stepper label="Laps" value={settings.lapCount} min={1} max={9} onChange={(lapCount) => send({ type: "vip_set_settings", settings: { lapCount } })} />
          <Toggle label="Rolling start" value={settings.rollingStart} onChange={(rollingStart) => send({ type: "vip_set_settings", settings: { rollingStart } })} />
          <Toggle label="Ghost cars" value={settings.ghostMode} onChange={(ghostMode) => send({ type: "vip_set_settings", settings: { ghostMode } })} />
          <Toggle label="Rain" value={settings.rain} onChange={(rain) => send({ type: "vip_set_settings", settings: { rain } })} />
          <Toggle label="Gentle assist" value={settings.stabilityAssist} onChange={(stabilityAssist) => send({ type: "vip_set_settings", settings: { stabilityAssist } })} />
          <small className="phone-note">Gentle assist softly aligns the car toward the road direction so steering is more forgiving.</small>
          <button
            className="primary"
            onClick={() => {
              if (audioEnabled) unlockControllerAudio();
              void requestLandscape();
              send({ type: "vip_start_race" });
            }}
          >
            <Flag size={18} /> Start Race
          </button>
        </div>
      )}
      {!player?.isVIP && (
        <button
          className="primary"
          onClick={() => {
            if (audioEnabled) unlockControllerAudio();
            void requestLandscape();
            send({ type: "set_ready", ready: !player?.isReady });
          }}
        >
          {player?.isReady ? "Unready" : "Ready"}
        </button>
      )}
      <small className="phone-note">Use earphones for clearer engine, tire, and curb feedback. Motion is optional; touch steering appears in-race if needed.</small>
      {feedback && <small>{Math.round(feedback.speed * 3.6)} km/h</small>}
    </main>
  );
}

function StartPreference({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="range-control">
      <span>{label}</span>
      <input type="range" min="0" max="100" value={Math.round(value * 100)} onChange={(event) => onChange(Number(event.target.value) / 100)} />
      <strong>{Math.round(value * 100)}%</strong>
    </label>
  );
}

function SteeringSensitivityPreference({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <label className="range-control">
      <span>Motion sensitivity</span>
      <input type="range" min="1" max="10" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}/10</strong>
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

function RaceController({ send, feedback, room, playerId }: { send: ReturnType<typeof useGameSocket>["send"]; feedback?: CarState; room: RoomState; playerId: string }) {
  const [pedals, setPedals] = useState({ throttle: 0, brake: 0 });
  const [touchSteer, setTouchSteer] = useState(0);
  const [steerUi, setSteerUi] = useState(0);
  const [calibrationLabel, setCalibrationLabel] = useState("Calibrate");
  const [motionStatus, setMotionStatus] = useState(sensorSupported() ? "Motion waiting" : "Touch steering");
  const [hapticStatus, setHapticStatus] = useState(hapticShortStatus());
  const steerRef = useRef(0);
  const hasMotionRef = useRef(false);
  const lastRawSteerRef = useRef(0);
  const lastOrientationAngleRef = useRef(getScreenAngle());
  const seqRef = useRef(0);
  const lastHapticAtRef = useRef(0);
  const pedalsRef = useRef(pedals);
  const feedbackRef = useRef(feedback);
  const roomRef = useRef(room);
  const touchSteerRef = useRef(touchSteer);
  const neutralRef = useRef<number | undefined>(undefined);
  const audioRef = useRef<ControllerAudio | null>(sharedControllerAudio);
  const brakeStart = readStoredNumber("drive-sim-brake-start", 0);
  const throttleStart = readStoredNumber("drive-sim-throttle-start", 0);
  const audioEnabled = readStoredBoolean("drive-sim-audio-enabled", true);
  const hapticsEnabled = readStoredBoolean("drive-sim-haptics-enabled", true);
  const steeringSensitivity = steeringSensitivityFromLevel(readStoredRangeNumber(STEERING_SENSITIVITY_KEY, STEERING_SENSITIVITY_DEFAULT, 1, 10));
  const car = room.cars.find((item) => item.playerId === playerId);

  useEffect(() => {
    void requestLandscape();
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null && event.gamma === null) return;
      hasMotionRef.current = true;
      setMotionStatus("Motion steering");
      const angle = getScreenAngle();
      const raw = readSteeringTilt(event, angle);
      if (angle !== lastOrientationAngleRef.current) {
        neutralRef.current = raw;
        lastOrientationAngleRef.current = angle;
      }
      lastRawSteerRef.current = raw;
      if (neutralRef.current === undefined) neutralRef.current = raw;
      steerRef.current = clamp(((raw - neutralRef.current) / 28) * steeringSensitivity, -1, 1);
    };
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [steeringSensitivity]);

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
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    touchSteerRef.current = touchSteer;
  }, [touchSteer]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const activeFeedback = feedbackRef.current;
      const activePedals = pedalsRef.current;
      const steer = hasMotionRef.current && Math.abs(steerRef.current) > 0.03 ? steerRef.current : touchSteerRef.current;
      const input: InputFrame = { seq: seqRef.current, steer, throttle: activePedals.throttle, brake: activePedals.brake };
      seqRef.current += 1;
      send({ type: "input_frame", input });
      if (audioEnabled) updateControllerAudio(audioRef.current, activeFeedback, roomRef.current, activePedals);
      driveHaptics(activeFeedback, activePedals, hapticsEnabled, lastHapticAtRef);
    }, 33);
    return () => {
      window.clearInterval(timer);
      silenceControllerAudio(audioRef.current);
    };
  }, [audioEnabled, hapticsEnabled, send]);

  const calibrate = () => {
    neutralRef.current = lastRawSteerRef.current;
    steerRef.current = 0;
    setSteerUi(0);
    setCalibrationLabel("Straight set");
    window.setTimeout(() => setCalibrationLabel("Calibrate"), 1200);
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
        <span>{Math.round((car?.speed ?? 0) * 3.6)} km/h</span>
        <span>Lap {car?.lap ?? 1}/{room.settings.lapCount}</span>
        <span>{motionStatus}</span>
        <button
          onClick={() => {
            const result = pulseHaptic([35, 30, 55]);
            setHapticStatus(hapticResultMessage(result));
          }}
        >
          {hapticStatus}
        </button>
      </div>
      <PedalZone side="brake" value={pedals.brake} firstTap={brakeStart} onChange={(brake) => setPedals((current) => ({ ...current, brake }))} />
      <PedalZone side="throttle" value={pedals.throttle} firstTap={throttleStart} onChange={(throttle) => setPedals((current) => ({ ...current, throttle }))} />
      <div className="steer-touch">
        <button onPointerDown={() => setTouchSteer(1)} onPointerUp={() => setTouchSteer(0)}><ArrowLeft /></button>
        <div className="tilt-meter"><span style={{ transform: `translateX(${(steerUi || touchSteer) * 42}px)` }} /></div>
        <button onPointerDown={() => setTouchSteer(-1)} onPointerUp={() => setTouchSteer(0)}><ArrowRight /></button>
      </div>
    </main>
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
        onChange(clamp(startValue.current + (startY.current - event.clientY) / 180, 0, 1));
      }}
      onPointerUp={() => onChange(0)}
      onPointerCancel={() => onChange(0)}
    >
      <strong>{side === "brake" ? "Brake" : "Throttle"}</strong>
      <div className="pedal-track"><span style={{ height: `${value * 100}%` }} /></div>
      <em>{Math.round(value * 100)}%</em>
    </div>
  );
}

function RaceCanvas({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  return (
    <Canvas shadows camera={{ fov: 76, near: 0.1, far: 420 }}>
      <color attach="background" args={[room.settings.rain ? "#78818a" : "#9fc4dc"]} />
      <fog attach="fog" args={[room.settings.rain ? "#8b949b" : "#b8d4e2", room.settings.rain ? 38 : 95, room.settings.rain ? 175 : 290]} />
      <ambientLight intensity={room.settings.rain ? 0.58 : 0.72} />
      <hemisphereLight args={[room.settings.rain ? "#b7c2cc" : "#d8f0ff", "#526447", room.settings.rain ? 0.55 : 0.42]} />
      <directionalLight position={[20, 35, 12]} intensity={room.settings.rain ? 0.72 : 1.38} castShadow />
      <RaceScene room={room} focusPlayerId={focusPlayerId} />
    </Canvas>
  );
}

function RaceScene({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const { camera } = useThree();
  const track = TRACKS[room.settings.trackId];
  const focus = room.cars.find((car) => car.playerId === focusPlayerId);
  const smoothFocus = useRef<{ playerId: string; x: number; z: number; heading: number; surface: CarState["surface"]; impact: number; slip: number } | undefined>(undefined);

  useFrame((_, delta) => {
    if (!focus) return;
    if (!smoothFocus.current || smoothFocus.current.playerId !== focus.playerId) {
      smoothFocus.current = {
        playerId: focus.playerId,
        x: focus.x,
        z: focus.z,
        heading: focus.heading,
        surface: focus.surface,
        impact: focus.impact,
        slip: focus.slip
      };
    }
    const amount = smoothingAmount(delta, 16);
    smoothFocus.current.x = THREE.MathUtils.lerp(smoothFocus.current.x, focus.x, amount);
    smoothFocus.current.z = THREE.MathUtils.lerp(smoothFocus.current.z, focus.z, amount);
    smoothFocus.current.heading = lerpAngle(smoothFocus.current.heading, focus.heading, amount);
    smoothFocus.current.surface = focus.surface;
    smoothFocus.current.impact = THREE.MathUtils.lerp(smoothFocus.current.impact, focus.impact, amount);
    smoothFocus.current.slip = THREE.MathUtils.lerp(smoothFocus.current.slip, focus.slip, amount);

    const renderFocus = smoothFocus.current;
    const shake = (renderFocus.surface === "curb" ? 0.05 : 0) + renderFocus.impact * 0.12 + renderFocus.slip * 0.025;
    camera.position.set(
      renderFocus.x - Math.sin(renderFocus.heading) * 0.2 + Math.sin(renderFocus.heading + Math.PI / 2) * 0.12,
      1.55 + Math.sin(performance.now() / 35) * shake,
      renderFocus.z - Math.cos(renderFocus.heading) * 0.2
    );
    camera.lookAt(renderFocus.x + Math.sin(renderFocus.heading) * 18, 1.1, renderFocus.z + Math.cos(renderFocus.heading) * 18);
  });

  return (
    <>
      <TrackMesh track={track} rain={room.settings.rain} />
      <TrackProps track={track} rain={room.settings.rain} />
      {room.settings.rain && focus && <RainEffect focus={focus} />}
      {room.cars.map((car) => {
        const player = room.players.find((item) => item.id === car.playerId);
        return <CarModel key={car.playerId} car={car} color={player?.color ?? "#ff3b5c"} dimmed={car.playerId === focusPlayerId} />;
      })}
      {focus && <Cockpit car={focus} color={room.players.find((item) => item.id === focusPlayerId)?.color ?? "#ff3b5c"} />}
    </>
  );
}

function TrackMesh({ track, rain }: { track: TrackDef; rain: boolean }) {
  const samples = useMemo(() => sampleTrackVisuals(track, 7), [track]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[35, -0.05, 45]} receiveShadow>
        <planeGeometry args={[260, 240]} />
        <meshStandardMaterial color={rain ? "#516056" : "#5a7e48"} roughness={0.95} />
      </mesh>
      {samples.map((sample, index) => {
        return (
          <group key={`${sample.x}-${sample.z}-${index}`} position={[sample.x, 0, sample.z]} rotation={[0, sample.heading, 0]}>
            <mesh position={[-track.width / 2 - track.curbWidth - track.wallMargin / 2, -0.005, 0]} receiveShadow>
              <boxGeometry args={[track.wallMargin, 0.045, sample.length + 0.35]} />
              <meshStandardMaterial color={rain ? "#59625d" : "#6f8c58"} roughness={0.92} />
            </mesh>
            <mesh position={[track.width / 2 + track.curbWidth + track.wallMargin / 2, -0.005, 0]} receiveShadow>
              <boxGeometry args={[track.wallMargin, 0.045, sample.length + 0.35]} />
              <meshStandardMaterial color={rain ? "#59625d" : "#6f8c58"} roughness={0.92} />
            </mesh>
            <mesh receiveShadow>
              <boxGeometry args={[track.width, 0.08, sample.length + 0.35]} />
              <meshStandardMaterial color={rain ? "#2f383b" : "#2c2e31"} roughness={rain ? 0.36 : 0.78} metalness={rain ? 0.12 : 0.04} />
            </mesh>
            <mesh position={[-track.width / 2 + 0.12, 0.055, 0]}>
              <boxGeometry args={[0.12, 0.024, sample.length + 0.1]} />
              <meshStandardMaterial color={rain ? "#d7dad8" : "#f5f1dc"} roughness={0.7} />
            </mesh>
            <mesh position={[track.width / 2 - 0.12, 0.055, 0]}>
              <boxGeometry args={[0.12, 0.024, sample.length + 0.1]} />
              <meshStandardMaterial color={rain ? "#d7dad8" : "#f5f1dc"} roughness={0.7} />
            </mesh>
            <mesh position={[-track.width / 2 - track.curbWidth / 2, 0.045, 0]}>
              <boxGeometry args={[track.curbWidth, 0.07, sample.length + 0.15]} />
              <meshStandardMaterial color={index % 2 === 0 ? "#e8e1d1" : "#b02b35"} roughness={0.65} />
            </mesh>
            <mesh position={[track.width / 2 + track.curbWidth / 2, 0.045, 0]}>
              <boxGeometry args={[track.curbWidth, 0.07, sample.length + 0.15]} />
              <meshStandardMaterial color={index % 2 === 0 ? "#b02b35" : "#e8e1d1"} roughness={0.65} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function TrackProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  const start = sampleTrackVisuals(track, 7)[0];
  const propSamples = useMemo(() => sampleTrackVisuals(track, track.id === "alpine" ? 28 : 21), [track]);
  const boards = propSamples.filter((_, index) => index % 3 === 0);
  const barriers = propSamples.filter((_, index) => index % 2 === 1);
  return (
    <group>
      <group position={[start.x, 0.16, start.z]} rotation={[0, start.heading, 0]}>
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
          <boxGeometry args={[track.width + 6, 0.26, 0.26]} />
          <meshStandardMaterial color="#20242a" roughness={0.5} />
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
          <group key={`${sample.x}-${sample.z}-prop`} position={[x, 0.55, z]} rotation={[0, sample.heading + (side < 0 ? 0.18 : -0.18), 0]}>
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
      {barriers.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const x = sample.x + Math.sin(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + track.wallMargin - 0.65);
        const z = sample.z + Math.cos(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + track.wallMargin - 0.65);
        return (
          <group key={`${sample.x}-${sample.z}-barrier`} position={[x, 0.34, z]} rotation={[0, sample.heading, 0]}>
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
      {track.id === "sakura" && (
        <>
          <mesh position={[35, 1.4, 66]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 2.8, 8]} />
            <meshStandardMaterial color="#5d4037" roughness={0.7} />
          </mesh>
          <mesh position={[35, 3.0, 66]} castShadow>
            <sphereGeometry args={[1.05, 12, 8]} />
            <meshStandardMaterial color="#f2a8bd" roughness={0.8} />
          </mesh>
        </>
      )}
      {track.id === "alpine" && (
        <>
          <mesh position={[88, 4.5, 116]} rotation={[0, -0.5, 0]}>
            <coneGeometry args={[12, 14, 4]} />
            <meshStandardMaterial color={rain ? "#8f9692" : "#8b907d"} roughness={0.95} />
          </mesh>
          <mesh position={[88, 11.8, 116]} rotation={[0, -0.5, 0]}>
            <coneGeometry args={[6.5, 4.2, 4]} />
            <meshStandardMaterial color="#eef1f2" roughness={0.82} />
          </mesh>
        </>
      )}
    </group>
  );
}

function RainEffect({ focus }: { focus: CarState }) {
  const group = useRef<THREE.Group>(null);
  const drops = useMemo(() => Array.from({ length: 240 }, (_, index) => ({
    x: ((index * 37) % 58) - 29,
    y: 2 + ((index * 19) % 30),
    z: ((index * 53) % 72) - 18,
    speed: 0.24 + ((index * 11) % 24) / 100
  })), []);

  useFrame(() => {
    if (!group.current) return;
    group.current.position.set(
      focus.x + Math.sin(focus.heading) * 18,
      0,
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

function CarModel({ car, color, dimmed }: { car: CarState; color: string; dimmed?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const initial = useRef({ x: car.x, z: car.z, heading: car.heading });
  const visible = !dimmed;
  const wheelSpin = car.wheelDistance * 3.1;
  const frontSteer = visualWheelSteer(car.steer, 0.48);
  useFrame((_, delta) => {
    if (!group.current) return;
    const amount = smoothingAmount(delta, 18);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, car.x, amount);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, car.z, amount);
    group.current.rotation.y = lerpAngle(group.current.rotation.y, car.heading, amount);
  });
  return (
    <group ref={group} position={[initial.current.x, 0.3, initial.current.z]} rotation={[0, initial.current.heading, 0]}>
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
      <mesh castShadow position={[0, 0.22, 2.05]} visible={visible}>
        <boxGeometry args={[2.25, 0.08, 0.34]} />
        <meshStandardMaterial color={color} roughness={0.32} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 0.1, 2.38]} visible={visible}>
        <boxGeometry args={[2.45, 0.06, 0.18]} />
        <meshStandardMaterial color="#111318" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[-1.18, 0.15, 2.18]} visible={visible}>
        <boxGeometry args={[0.1, 0.42, 0.46]} />
        <meshStandardMaterial color="#111318" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[1.18, 0.15, 2.18]} visible={visible}>
        <boxGeometry args={[0.1, 0.42, 0.46]} />
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
      {[[-0.9, -1.1], [0.9, -1.1], [-0.9, 1.1], [0.9, 1.1]].map(([x, z]) => {
        const isFront = z > 0;
        const side = x < 0 ? -1 : 1;
        return (
        <group key={`${x}-${z}`} position={[x, -0.05, z]} rotation={[0, isFront ? frontSteer : 0, 0]} visible={visible}>
          <mesh castShadow rotation={[Math.PI / 2, 0, wheelSpin * side]}>
            <cylinderGeometry args={[0.32, 0.32, 0.28, 24]} />
            <meshStandardMaterial color="#050608" roughness={0.72} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, wheelSpin * side]}>
            <cylinderGeometry args={[0.17, 0.17, 0.3, 18]} />
            <meshStandardMaterial color="#2e333b" roughness={0.36} metalness={0.45} />
          </mesh>
        </group>
        );
      })}
    </group>
  );
}

function Cockpit({ car, color }: { car: CarState; color: string }) {
  const group = useRef<THREE.Group>(null);
  const initial = useRef({ x: car.x, z: car.z, heading: car.heading });
  const wheelSpin = car.wheelDistance * 3.1;
  const frontSteer = visualWheelSteer(car.steer, 0.52);
  useFrame((_, delta) => {
    if (!group.current) return;
    const amount = smoothingAmount(delta, 18);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, car.x, amount);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, car.z, amount);
    group.current.rotation.y = lerpAngle(group.current.rotation.y, car.heading, amount);
  });
  return (
    <group ref={group} position={[initial.current.x, 0.65, initial.current.z]} rotation={[0, initial.current.heading, 0]}>
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
          <mesh rotation={[Math.PI / 2, 0, wheelSpin * (x < 0 ? -1 : 1)]}>
            <cylinderGeometry args={[0.34, 0.34, 0.22, 22]} />
            <meshStandardMaterial color="#050608" roughness={0.75} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, wheelSpin * (x < 0 ? -1 : 1)]}>
            <cylinderGeometry args={[0.16, 0.16, 0.24, 16]} />
            <meshStandardMaterial color="#2e333b" roughness={0.36} metalness={0.4} />
          </mesh>
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
      <mesh position={[0, 0.42, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.42, 0.035, 8, 28]} />
        <meshStandardMaterial color="#0b0e12" />
      </mesh>
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

function MiniTrack({ track }: { track: TrackDef }) {
  const { minX, maxX, minZ, maxZ } = getTrackBounds(track);
  const points = track.points
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
  minZ: number;
  maxZ: number;
};

function getTrackBounds(track: TrackDef): TrackBounds {
  const xs = track.points.map((point) => point.x);
  const zs = track.points.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
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
  return `L${Math.min(car.lap, lapCount)}/${lapCount}`;
}

function sampleTrackVisuals(track: TrackDef, spacing: number) {
  const samples: Array<{ x: number; z: number; heading: number; length: number }> = [];
  for (let i = 0; i < track.points.length; i += 1) {
    const a = track.points[i];
    const b = track.points[(i + 1) % track.points.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const segmentLength = Math.hypot(dx, dz);
    const count = Math.max(1, Math.ceil(segmentLength / spacing));
    const heading = Math.atan2(dx, dz);
    for (let step = 0; step < count; step += 1) {
      const t0 = step / count;
      const t1 = (step + 1) / count;
      samples.push({
        x: a.x + dx * ((t0 + t1) / 2),
        z: a.z + dz * ((t0 + t1) / 2),
        heading,
        length: segmentLength / count
      });
    }
  }
  return samples;
}

function useGameSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const queuedMessagesRef = useRef<object[]>([]);
  const [room, setRoom] = useState<RoomState>();
  const [clientId, setClientId] = useState("");
  const [displayGroupId, setDisplayGroupId] = useState<string>();
  const [playerId, setPlayerId] = useState<string>();
  const [joinedToken, setJoinedToken] = useState<string>();
  const [feedback, setFeedback] = useState<CarState>();

  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    wsRef.current = ws;
    ws.onopen = () => {
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
      if (message.type === "joined_display") {
        setDisplayGroupId(message.displayGroupId);
        sessionStorage.setItem("drive-sim-display-session", JSON.stringify({ roomCode: message.roomCode, displayGroupId: message.displayGroupId }));
      }
      if (message.type === "joined_controller") {
        setPlayerId(message.playerId);
        setDisplayGroupId(message.displayGroupId);
        setJoinedToken(message.token);
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
            results: message.snapshot.results ?? current.results
          }
          : current);
      }
      if (message.type === "controller_feedback") setFeedback(message.car);
      if (message.type === "room_closed") {
        console.warn(message.message);
        sessionStorage.removeItem("drive-sim-display-session");
        setRoom(undefined);
        setDisplayGroupId(undefined);
        setPlayerId(undefined);
        setJoinedToken(undefined);
        setFeedback(undefined);
      }
      if (message.type === "error_notice") {
        console.warn(message.message);
        if (message.message === "Room not found.") {
          sessionStorage.removeItem("drive-sim-display-session");
        }
      }
    };
    return () => ws.close();
  }, []);

  const send = useCallback((message: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState === WebSocket.CONNECTING) {
      queuedMessagesRef.current.push(message);
      return;
    }
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  }, []);

  return { room, clientId, displayGroupId, playerId, joinedToken, feedback, send };
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

function readDisplaySession() {
  try {
    const value = sessionStorage.getItem("drive-sim-display-session");
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

async function requestMotion() {
  if (!sensorSupported()) {
    return { enabled: false, message: "Motion unavailable in this browser" };
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

function sensorSupported() {
  return typeof window !== "undefined" && "DeviceOrientationEvent" in window;
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

function readSteeringTilt(event: DeviceOrientationEvent, angle: number) {
  const beta = event.beta ?? 0;
  const gamma = event.gamma ?? 0;
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const isLandscape = window.innerWidth > window.innerHeight;

  if (isLandscape && normalizedAngle === 270) return beta;
  if (isLandscape) return -beta;
  if (normalizedAngle === 90) return beta;
  if (normalizedAngle === 270) return -beta;
  if (normalizedAngle === 180) return -gamma;
  return gamma;
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

function updateControllerAudio(audio: ControllerAudio | null, car: CarState | undefined, room: RoomState, pedals: { throttle: number; brake: number }) {
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
  const mark = remaining > 2200 ? 3 : remaining > 1200 ? 2 : remaining > 220 ? 1 : "go";
  if (audio.lastCountdownMark === mark) return;
  audio.lastCountdownMark = mark;
  playCue(audio, mark === "go" ? "go" : "countdown");
}

function playCue(audio: ControllerAudio, kind: "countdown" | "go" | "impact" | "start", intensity = 1) {
  const context = audio.context;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  osc.type = kind === "impact" ? "square" : "sine";
  osc.frequency.value = kind === "go" ? 880 : kind === "countdown" ? 560 : kind === "impact" ? 80 : 660;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === "impact" ? 0.18 * intensity : 0.12, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "go" ? 0.34 : kind === "impact" ? 0.16 : 0.18));
  osc.connect(gain);
  gain.connect(audio.masterGain);
  osc.start(now);
  osc.stop(now + 0.38);
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
  if (!hapticsSupported()) return "No Vibration API in this browser";
  if (isFirefox()) return "Limited in Firefox; test on this phone";
  if (isIOS()) return "iOS Safari does not support web vibration";
  return "Haptics ready";
}

function hapticShortStatus() {
  if (!hapticsSupported()) return "No haptics";
  if (isFirefox()) return "Test haptics";
  return "Haptics on";
}

function hapticResultMessage(result: boolean) {
  if (!hapticsSupported()) return "No Vibration API";
  if (!result) return "Vibration blocked";
  if (isFirefox()) return "Pulse requested";
  return "Pulse sent";
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

function isIOS() {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function driveHaptics(car: CarState | undefined, pedals: { throttle: number; brake: number }, enabled: boolean, lastHapticAtRef: React.MutableRefObject<number>) {
  if (!enabled || !car || !hapticsSupported()) return;

  const now = performance.now();
  const speedKmh = car.speed * 3.6;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function steeringSensitivityFromLevel(level: number) {
  return 0.65 + clamp(level, 1, 10) * 0.09;
}

function visualWheelSteer(steer: number, amount: number) {
  if (Math.abs(steer) < 0.06) return 0;
  return steer < 0 ? amount : -amount;
}

function smoothingAmount(delta: number, response: number) {
  return 1 - Math.exp(-response * delta);
}

function lerpAngle(current: number, target: number, amount: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * amount;
}
