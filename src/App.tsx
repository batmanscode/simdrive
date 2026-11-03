import { CockpitGrip } from "./race/CockpitGrip";
import { createBodyDynamics, stepBodyDynamics } from "./race/BodyDynamics";
import { createEngineVoice, updateEngineVoice, silenceEngineVoice, type EngineVoice } from "./audio/EngineVoice";
import { Earthworks, FjordQuay, colorMountainGround } from "./race/Earthworks";
import { AlpineViaduct } from "./race/AlpineViaduct";
import { CoastFeatures, coastPropHeight } from "./race/CoastFeatures";
import { Coastline, COAST_SEA_LEVEL } from "./race/Coastline";
import { BridgeRailing, type RailSection } from "./race/BridgeRailing";
import { MountainMassif, type MountainPeak } from "./race/MountainMassif";
import { ScenicBuildings } from "./race/ScenicBuildings";
import { ScenicWater } from "./race/ScenicWater";
import { Vegetation, type Plant, type PlantKind } from "./race/Vegetation";
import { Aerofoil, TruckWheelArch, KartEngine, KartSeat, RacingGlass, TukHeadlamp } from "./race/VehicleDetails";
import { RacingWheel as VehicleWheel } from "./race/RacingWheel";
import { BodyPanel, FORMULA_HULL, FORMULA_SIDEPOD, FORMULA_COVER, FORMULA_COCKPIT_NOSE, KART_NOSE, KART_SIDEPOD, TRUCK_HOOD, TRUCK_CAB, TRUCK_COCKPIT_HOOD, TUK_CANOPY, TUK_SIDE, TUK_REAR, TUK_SEAT, TUK_BACK } from "./race/Bodywork";
import { TireCloud } from "./race/TireCloud";
import { JourneyFinish } from "./race/JourneyFinish";
import { SkidMarkBatch, type SkidMark } from "./race/SkidMarkBatch";
import { AdaptiveResolution, useRaceDpr } from "./race/AdaptiveResolution";
import { ReplayDialog } from "./race/ReplayDialog";
import { readRaceReplay, recordRaceReplay } from "./race/replay";
import { cornerAdvice, formatLapTime, PersonalGhost, practiceKey, readPersonalLap, useDisplayPracticeRecorders } from "./race/Practice";
import { SculptedBox } from "./race/SculptedBox";
import { cameraRoadLook } from "./race/camera";
import { AsphaltMaterial, LandscapeMaterial, RoadsideGrass, CarGroundShadows, MotorsportLight, MotorsportSky, racePalette, RainStreaks, SakuraLandscape, SakuraPetals } from "./race/Atmosphere";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Activity, ArrowLeft, ArrowRight, Flag, Gamepad2, Gauge, Grid2X2, Info, Maximize2, Minus, Monitor, Moon, Play, Plus, RotateCcw, Search, Smartphone, Sun, Trophy, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createContext, useContext, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import * as THREE from "three";
import { DEFAULT_CAR_SETUP_ID, DEFAULT_VEHICLE_ID, getVehicle, getVehicleSetup, getVehicleSetups, VEHICLE_ORDER, VEHICLE_STAT_TOP_SPEED_MAX_KMH, VEHICLES, type CarSetup, type VehicleDefinition } from "./shared/cars";
import { speedToKmh } from "./shared/physics";
import { isCausewayBridgeProgress, nearestTrackPoint, raceCourseLength, sampleTrack, sceneryTrack as routeScenery, TRACKS, trackMetrics } from "./shared/tracks";
import type { CarSetupId, CarState, CockpitStyle, CrashEvent, InputFrame, LiveStats, NearbyAudioCar, Player, RaceSettings, RearViewMode, RoomState, ServerMessage, TrackDef, TrackId, VehicleId } from "./shared/types";

const CockpitMotion = createContext(true);

const COLORS = ["#ff3b5c", "#16c784", "#35a7ff", "#ffd166", "#c77dff", "#ff8f3d", "#5eead4", "#f472b6"];
const STEERING_SENSITIVITY_MIN = 1;
const STEERING_SENSITIVITY_MAX = 10;
const VEHICLE_STEERING_SENSITIVITY_DEFAULTS: Record<VehicleId, number> = {
  formula: 1,
  kart: 1,
  stockTruck: 4,
  tukTuk: 2
};
const INVERT_MOTION_STEERING_KEY = "sim-drive-invert-motion-steering";
const HAPTIC_TEST_PATTERN = [120, 60, 180];
const CONTROLLER_SESSION_KEY = "sim-drive-controller-session";
const DISPLAY_SESSION_KEY = "sim-drive-display-session:v1";
const LEGACY_DISPLAY_SESSION_KEY = "sim-drive-display-session";
const DISPLAY_THEME_KEY = "sim-drive-display-theme";
const MOTION_NEUTRAL_SAMPLE_MS = 320;
const MOTION_NEUTRAL_MAX_SAMPLE_MS = 900;
const MOTION_NEUTRAL_MIN_SAMPLES = 5;
const MOTION_NEUTRAL_MAX_SPREAD = 3.5;
const MOTION_STEERING_DEADZONE = 0.06;
const MOTION_CALIBRATION_MAX_AGE_MS = 5 * 60 * 1000;
const CRASH_EXPLOSION_VISUAL_MS = 1400;
const TIP_RISK_TOAST_THRESHOLD = 0.22;
const AUTO_SPECTATE_AFTER_FINISH_MS = 2500;
const RACE_FOCUS_SMOOTHING_RESPONSE = 16;
const DEV_ASSET_ROUTE = "/dev-assets";
const IS_DEV_BUILD = import.meta.env.DEV;

type CodexBenchmarkLap = {
  trackId: TrackId;
  vehicleId: VehicleId;
  setupId: CarSetupId;
  lapTime: string;
  avgSpeedKmh: number;
  surface: "road" | "curb" | "grass";
  surfaceLabel: string;
};

const CODEX_BENCHMARK_LAPS: CodexBenchmarkLap[] = [
  { trackId: "cloudline", vehicleId: "formula", setupId: "balanced", lapTime: "8:28.009", avgSpeedKmh: 226.0, surface: "curb", surfaceLabel: "tiny curb" },
  { trackId: "cloudline", vehicleId: "stockTruck", setupId: "balanced", lapTime: "8:32.607", avgSpeedKmh: 224.0, surface: "road", surfaceLabel: "road-only" },
  { trackId: "cloudline", vehicleId: "kart", setupId: "balanced", lapTime: "15:00.386", avgSpeedKmh: 127.5, surface: "curb", surfaceLabel: "tiny curb" },
  { trackId: "cloudline", vehicleId: "tukTuk", setupId: "balanced", lapTime: "28:58.112", avgSpeedKmh: 66.1, surface: "road", surfaceLabel: "road-only" },
  { trackId: "sakura", vehicleId: "formula", setupId: "balanced", lapTime: "7.618s", avgSpeedKmh: 227.5, surface: "grass", surfaceLabel: "grass + curb" },
  { trackId: "sakura", vehicleId: "stockTruck", setupId: "balanced", lapTime: "9.667s", avgSpeedKmh: 179.2, surface: "grass", surfaceLabel: "brief grass" },
  { trackId: "sakura", vehicleId: "kart", setupId: "balanced", lapTime: "15.344s", avgSpeedKmh: 112.9, surface: "grass", surfaceLabel: "grass + curb" },
  { trackId: "sakura", vehicleId: "tukTuk", setupId: "balanced", lapTime: "60.935s", avgSpeedKmh: 28.4, surface: "road", surfaceLabel: "road-only" }
];

const SHOWROOM_TRACK_IDS: TrackId[] = ["sakura", "alpine", "fjord", "causeway", "cloudline", "passage"];
const SHOWROOM_COCKPIT_STYLES: CockpitStyle[] = ["none", "hands", "paws"];
const SHOWROOM_VEHICLE_COLORS: Record<VehicleId, string> = {
  formula: "#ff8f3d",
  kart: "#35a7ff",
  stockTruck: "#16c784",
  tukTuk: "#ffd166"
};
type ShowroomSceneryItem = {
  assetName: string;
  label: string;
  previewYOffset?: number;
};

const SHOWROOM_SCENERY_ITEMS: ShowroomSceneryItem[] = [
  { assetName: "TrackStartGantryModel", label: "Start gantry" },
  { assetName: "SponsorBoardModel", label: "#[oss]vibejam board", previewYOffset: -0.56 },
  { assetName: "SakuraBanner", label: "try not to lose board" },
  { assetName: "SakuraBlossomTunnel", label: "Sakura tunnel" },
  { assetName: "AlpineCableCar", label: "Alpine cable car" },
  { assetName: "FjordVillage", label: "Fjord village" },
  { assetName: "CausewayMarina", label: "Causeway marina" },
  { assetName: "CloudlineBackdrop", label: "Cloudline ridges" }
];

type MotionCalibration = {
  frame: string;
  neutral: number;
  capturedAt: number;
};

type MotionSample = {
  raw: number;
  angle: number;
  source: MotionSource;
};

type MotionSource = "orientation" | "motion" | "gravity" | "accelerometer";

type MotionPermissionConstructor = {
  requestPermission?: () => Promise<PermissionState>;
};

type MotionSensorName = "GravitySensor" | "Accelerometer";

type MotionSensorConstructor = new (options?: {
  frequency?: number;
  referenceFrame?: "device" | "screen";
}) => MotionSensorInstance;

type MotionSensorInstance = EventTarget & {
  x: number | null;
  y: number | null;
  z: number | null;
  start: () => void;
  stop: () => void;
};

type MotionDebugEvent =
  | { kind: "request"; message: string }
  | { kind: "permissions"; status: string }
  | { kind: "event"; source: MotionSource | "orientation-null" | "motion-empty" }
  | { kind: "sample"; source: MotionSource; raw: number; angle: number }
  | { kind: "sensor-error"; source: "gravity" | "accelerometer"; message: string };

type MotionDebugState = {
  secure: boolean;
  policy: string;
  permissions: string;
  request: string;
  orientationEvents: number;
  motionEvents: number;
  gravityReadings: number;
  accelerometerReadings: number;
  emptyEvents: number;
  errors: number;
  last: string;
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
  useDisplayPracticeRecorders(game.room, game.displayGroupId, currentServerTimeMs);
  const [joinCode, setJoinCode] = useState("");
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isBenchmarksOpen, setIsBenchmarksOpen] = useState(false);
  const [isShowroomOpen, setIsShowroomOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isMobileLobbyAllowed, setIsMobileLobbyAllowed] = useState(false);
  const isPhoneDisplay = useIsPhoneDisplay();
  const [themeMode, setThemeMode] = useStoredDisplayTheme();
  const resolvedTheme = useResolvedDisplayTheme(themeMode);
  const themeClass = `display-theme theme-${resolvedTheme}`;
  const themeToggle = <ThemeToggle mode={themeMode} onChange={setThemeMode} />;
  const activePlayers = game.liveStats.activePlayers;

  if (!game.room) {
    return (
      <main className={`landing ${themeClass}`}>
        <div className="landing-top-actions">
          <button className="landing-about-link" type="button" onClick={() => setIsTutorialOpen(true)}>
            <Info size={15} /> How to play
          </button>
          <button className="landing-about-link" type="button" onClick={() => setIsShowroomOpen(true)}>
            <Grid2X2 size={15} /> Showroom
          </button>
          <button className="landing-about-link" type="button" onClick={() => setIsBenchmarksOpen(true)}>
            <Trophy size={15} /> Codex laps
          </button>
          <button className="landing-about-link" type="button" onClick={() => setIsAboutOpen(true)}>
            <Info size={15} /> About
          </button>
        </div>
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
              <button type="button" className="primary" onClick={() => game.send({ type: "create_room" })}>
                <Play size={18} /> Create Game
              </button>
              <span className="hero-action-or">or</span>
              <form
                className="join-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const roomCode = joinCode.trim().toUpperCase();
                  if (!roomCode) return;
                  game.send({ type: "join_display", roomCode });
                }}
              >
                <input aria-label="Room code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ROOM CODE" maxLength={4} />
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
        {isTutorialOpen && <HowToPlayModal onClose={() => setIsTutorialOpen(false)} />}
        {isShowroomOpen && <ShowroomModal onClose={() => setIsShowroomOpen(false)} />}
        {isBenchmarksOpen && <CodexBenchmarksModal onClose={() => setIsBenchmarksOpen(false)} />}
        {isAboutOpen && <HomeAboutModal onClose={() => setIsAboutOpen(false)} />}
      </main>
    );
  }

  if (game.room.phase === "results") {
    return <ResultsDisplay room={game.room} send={game.send} themeClass={themeClass} />;
  }

  if (game.room.phase === "tutorial") {
    return <TutorialDisplay room={game.room} send={game.send} themeClass={themeClass} />;
  }

  if (game.room.phase === "racing" || game.room.phase === "countdown") {
    return <RaceDisplay room={game.room} displayGroupId={game.displayGroupId} send={game.send} />;
  }

  return (
    <>
      <LobbyDisplay room={game.room} displayGroupId={game.displayGroupId} send={game.send} themeClass={themeClass} themeToggle={themeToggle} />
      {isPhoneDisplay && !isMobileLobbyAllowed && (
        <MobileDisplayLobbyOverlay roomCode={game.room.roomCode} themeClass={themeClass} onContinue={() => setIsMobileLobbyAllowed(true)} />
      )}
    </>
  );
}

function MobileDisplayLobbyOverlay({
  roomCode,
  themeClass,
  onContinue
}: {
  roomCode: string;
  themeClass: string;
  onContinue: () => void;
}) {
  return (
    <div className={`mobile-display-overlay ${themeClass}`} role="presentation">
      <section className="mobile-display-panel">
        <p className="eyebrow lobby-eyebrow">phone controller ready</p>
        <h1>Use a computer for the race screen</h1>
        <p>
          Right now SimDrive needs two screens: a display and a controller. This is the display side, which is great on a computer, tablet, or TV with a phone as a controller.
        </p>
        <p>
          If you really really want to, you can still use two phones with one being the display, but it is probably better to open this up on a bigger screen.
        </p>
        <div className="mobile-display-room">
          <span>Already made this room?</span>
          <strong>{roomCode}</strong>
          <small>Enter this code on a computer with "Join Room on This Screen," then scan the QR from the computer.</small>
        </div>
        <strong className="mobile-version-note">A single screen mobile-only version is being worked on.</strong>
        <button className="secondary" type="button" onClick={onContinue}>
          Show QR anyway
        </button>
      </section>
    </div>
  );
}

function HowToPlayModal({ onClose }: { onClose: () => void }) {
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
      <dialog className="about-modal tutorial-modal" open aria-labelledby="tutorial-title">
        <button className="about-close" type="button" onClick={onClose}>
          Close
        </button>
        <p className="eyebrow about-eyebrow">quick start</p>
        <h2 id="tutorial-title">how to play</h2>
        <div className="tutorial-body">
          <p className="tutorial-intro">
            Welcome! Sim Drive is simple: your computer is the race screen, and each phone is a controller.
          </p>

          <p className="tutorial-note"><Flag size={17} /> Try the Sakura track first :D</p>

          <div className="tutorial-steps">
            <section className="tutorial-step">
              <span className="tutorial-icon"><Smartphone size={21} /></span>
              <div>
                <h3>Solo or same-screen friends</h3>
                <p>Scan the QR with your phone and press Start. Friends on this screen scan the same QR.</p>
              </div>
            </section>

            <section className="tutorial-step">
              <span className="tutorial-icon"><Monitor size={21} /></span>
              <div>
                <h3>More screens</h3>
                <p>Friends can enter the room code from another computer to get their own race screen plus phone controllers.</p>
              </div>
            </section>

            <section className="tutorial-step">
              <span className="tutorial-icon"><Grid2X2 size={21} /></span>
              <div>
                <h3>Split screen</h3>
                <p>Each display can show up to 4 local players, so a full room can be two 4-player split screens.</p>
              </div>
            </section>

            <section className="tutorial-step">
              <span className="tutorial-icon"><Gamepad2 size={21} /></span>
              <div>
                <h3>Phone controls</h3>
                <p>Tilt to steer. Slide up anywhere on the right side to accelerate, and down anywhere on the left side to brake. Pedals are proportional.</p>
              </div>
            </section>

            <section className="tutorial-step">
              <span className="tutorial-icon"><Gauge size={21} /></span>
              <div>
                <h3>Calibration</h3>
                <p>Steering auto-calibrates your phone to center. You probably will not need to adjust it, but if it feels off, use the bottom level or top-left Calibrate button.</p>
              </div>
            </section>
          </div>
        </div>
      </dialog>
    </div>
  );
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
      <dialog className="about-modal" open aria-labelledby="about-title">
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
          <p className="about-contact">
            Get in touch at{" "}
            <a href="https://x.com/1000xcat" target="_blank" rel="noopener noreferrer">
              @1000xcat
            </a>{" "}
            ❤️
          </p>
        </div>
      </dialog>
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

function ShowroomModal({ onClose }: { onClose: () => void }) {
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
      <dialog className="about-modal showroom-modal" open aria-labelledby="showroom-title">
        <button className="about-close" type="button" onClick={onClose}>
          Close
        </button>
        <p className="eyebrow about-eyebrow">garage pass</p>
        <h2 id="showroom-title">Showroom</h2>
        <div className="showroom-body">
          <section className="showroom-section" aria-labelledby="showroom-cars-title">
            <div className="showroom-section-head">
              <h3 id="showroom-cars-title">Cars</h3>
              <span>{VEHICLE_ORDER.length} drive classes</span>
            </div>
            <div className="showroom-car-grid">
              {VEHICLE_ORDER.map((vehicleId) => <ShowroomVehicleCard key={vehicleId} vehicleId={vehicleId} />)}
            </div>
          </section>

          <section className="showroom-section" aria-labelledby="showroom-tracks-title">
            <div className="showroom-section-head">
              <h3 id="showroom-tracks-title">Tracks</h3>
              <span>{SHOWROOM_TRACK_IDS.length} routes</span>
            </div>
            <div className="showroom-track-grid">
              {SHOWROOM_TRACK_IDS.map((trackId) => <ShowroomTrackCard key={trackId} trackId={trackId} />)}
            </div>
          </section>

          <section className="showroom-section" aria-labelledby="showroom-cockpit-title">
            <div className="showroom-section-head">
              <h3 id="showroom-cockpit-title">Cockpit</h3>
              <span>visual style</span>
            </div>
            <div className="showroom-cockpit-grid">
              {SHOWROOM_COCKPIT_STYLES.map((style) => <ShowroomCockpitCard key={style} style={style} />)}
            </div>
          </section>

          <section className="showroom-section" aria-labelledby="showroom-scenery-title">
            <div className="showroom-section-head">
              <h3 id="showroom-scenery-title">Scenery sampler</h3>
              <span>curated highlights</span>
            </div>
            <div className="showroom-scenery-grid">
              {SHOWROOM_SCENERY_ITEMS.map((item) => <ShowroomSceneryCard key={item.assetName} item={item} />)}
            </div>
          </section>
        </div>
      </dialog>
    </div>
  );
}

function ShowroomVehicleCard({ vehicleId }: { vehicleId: VehicleId }) {
  const vehicle = getVehicle(vehicleId);
  const setup = getVehicleSetup(vehicle.id, vehicle.defaultSetupId);
  return (
    <article className="showroom-car-card">
      <div className="showroom-car-stage" aria-hidden>
        <Canvas camera={{ position: vehicle.id === "formula" ? [4.2, 2.7, 6] : [3.2, 2.1, 4.6], fov: 34 }} dpr={[1, 1.5]} shadows={false}>
          <color attach="background" args={["#181b21"]} />
          <ambientLight intensity={0.82} />
          <directionalLight position={[3, 5, 4]} intensity={1.35} />
          <CarPreviewScene vehicleId={vehicle.id} color={SHOWROOM_VEHICLE_COLORS[vehicle.id]} />
        </Canvas>
      </div>
      <div className="showroom-card-copy">
        <strong>{vehicle.name}</strong>
        <span>{setup.shortName} setup</span>
      </div>
      <div className="showroom-stat-row">
        <span>{setup.stats.topSpeedKmh} km/h</span>
        <span>{setup.stats.grip}/10 grip</span>
      </div>
    </article>
  );
}

function ShowroomTrackCard({ trackId }: { trackId: TrackId }) {
  const track = TRACKS[trackId];
  return (
    <article className="showroom-track-card">
      <MiniTrack track={track} />
      <div className="showroom-card-copy">
        <strong>{track.name}</strong>
        <span>{track.targetLap}</span>
      </div>
    </article>
  );
}

function ShowroomCockpitCard({ style }: { style: CockpitStyle }) {
  return (
    <article className="showroom-cockpit-card">
      <div className="showroom-cockpit-stage" aria-hidden>
        <Canvas orthographic camera={{ position: [0, 3.2, 4.8], zoom: 150, near: 0.1, far: 100 }} dpr={[1, 1.5]}>
          <color attach="background" args={["#181b21"]} />
          <ambientLight intensity={0.9} />
          <directionalLight position={[2, 4, 3]} intensity={1.2} />
          <group position={[0, -0.5, 0]} scale={[1.2, 1.2, 1.2]}>
            <CockpitWheel steer={0.18} style={style} />
          </group>
        </Canvas>
      </div>
      <div className="showroom-card-copy">
        <strong>{cockpitStyleLabel(style)}</strong>
        <span>{style === "none" ? "clean wheel" : style === "paws" ? "plush paws" : "racing gloves"}</span>
      </div>
    </article>
  );
}

function ShowroomSceneryCard({ item }: { item: typeof SHOWROOM_SCENERY_ITEMS[number] }) {
  const asset = useMemo(() => DEV_ASSETS.find((candidate) => candidate.name === item.assetName), [item.assetName]);
  if (!asset) return null;
  return (
    <article className="showroom-scenery-card">
      <div className="showroom-scenery-stage" aria-hidden>
        <ShowroomSceneryStage asset={asset} previewYOffset={item.previewYOffset ?? 0} />
      </div>
      <div className="showroom-card-copy">
        <strong>{item.label}</strong>
        <span>trackside detail</span>
      </div>
    </article>
  );
}

function ShowroomSceneryStage({ asset, previewYOffset }: { asset: DevAsset; previewYOffset: number }) {
  return (
    <Canvas orthographic dpr={[1, 1.4]} camera={{ position: [0, 1.55, 7.2], zoom: 38, near: 0.1, far: 1000 }}>
      <color attach="background" args={["#d8eaf3"]} />
      <ambientLight intensity={0.86} />
      <hemisphereLight args={["#eef8ff", "#596c4e", 0.42]} />
      <directionalLight position={[5, 7, 6]} intensity={1.35} />
      <ShowroomSceneryObject asset={asset} previewYOffset={previewYOffset} />
    </Canvas>
  );
}

function ShowroomSceneryObject({ asset, previewYOffset }: { asset: DevAsset; previewYOffset: number }) {
  const contentRef = useRef<THREE.Group>(null);
  const isFlatSign = asset.name === "SponsorBoardModel" || asset.name === "BrakingBoardModel" || asset.name === "RoadsideBoardModel" || asset.name === "SakuraBanner";

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.position.set(0, 0, 0);
    content.scale.setScalar(1);
    content.rotation.set(0, 0, 0);
    content.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(content);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    content.parent?.worldToLocal(center);
    const pivot = asset.pivot ? new THREE.Vector3(...asset.pivot) : center;
    content.position.x -= pivot.x;
    content.position.y -= pivot.y;
    content.position.z -= pivot.z;
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    content.scale.setScalar(Math.min(4.2, 3.0 / (maxDimension * (asset.zoom ?? 1))));
    content.updateWorldMatrix(true, true);
    const centeredBox = new THREE.Box3().setFromObject(content);
    if (!isFlatSign && Number.isFinite(centeredBox.min.y)) {
      const bottom = new THREE.Vector3(0, centeredBox.min.y, 0);
      content.parent?.worldToLocal(bottom);
      content.position.y -= bottom.y + 0.04;
    }
    content.position.y += previewYOffset;
  }, [asset, isFlatSign, previewYOffset]);

  return (
    <group rotation={[0, isFlatSign ? 0 : -0.32, 0]}>
      <group ref={contentRef}>{asset.render(false)}</group>
    </group>
  );
}

function CodexBenchmarksModal({ onClose }: { onClose: () => void }) {
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
      <dialog className="about-modal codex-benchmarks-modal" open aria-labelledby="codex-benchmarks-title">
        <button className="about-close" type="button" onClick={onClose}>
          Close
        </button>
        <CodexBenchmarks />
      </dialog>
    </div>
  );
}

function CodexBenchmarks() {
  return (
    <section className="codex-benchmarks" aria-labelledby="codex-benchmarks-title">
      <div className="codex-benchmarks-title">
        <span className="codex-benchmarks-icon"><Trophy size={17} /></span>
        <div>
          <p className="eyebrow">Automated lap board</p>
          <h2 id="codex-benchmarks-title">Codex benchmarks</h2>
        </div>
      </div>
      <p className="codex-benchmarks-copy">
        Historical automated laps, recorded before the motorsport handling update. They are kept for reference and are not directly comparable to current personal bests.
      </p>
      <div className="codex-benchmark-list">
        {CODEX_BENCHMARK_LAPS.map((lap) => {
          const track = TRACKS[lap.trackId];
          const vehicle = getVehicle(lap.vehicleId);
          const setup = getVehicleSetup(lap.vehicleId, lap.setupId);

          return (
            <div className="codex-benchmark-row" key={`${lap.trackId}-${lap.vehicleId}`}>
              <div className="codex-benchmark-main">
                <strong>{track.name}</strong>
                <span>{vehicle.shortName} / {setup.shortName}</span>
              </div>
              <span className="codex-benchmark-time">{lap.lapTime}</span>
              <div className="codex-benchmark-detail">
                <span>{lap.avgSpeedKmh.toFixed(1)} km/h avg</span>
                <span className={`codex-benchmark-line ${lap.surface}`}>{lap.surfaceLabel}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HeroShowcase() {
  return (
    <div className="hero-showcase" aria-hidden>
      <div className="mock-race">
        <img className="gameplay-preview" src="/race-preview.jpg" alt="" width={1440} height={900} />
        <div className="mock-leaderboard">
          <span>1 YOU</span>
          <span>2 LOSER</span>
          <span>3 OTHER LOSER</span>
        </div>
        <span className="gameplay-preview-label">IN-GAME · SAKURA SPRINT</span>
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
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
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
        <button className="join-help-button" type="button" onClick={() => setIsTutorialOpen(true)}>
          <Info size={16} /> How to play
        </button>
        <div className="join-card-stats">
          <span>{localPlayerCount}/4 this screen</span>
          <span>{room.players.length}/8 room</span>
          <span>{readyCount} ready</span>
        </div>
      </section>

      <section className="lobby-main">
        <div className="topline">
          <div>
            <p className="eyebrow lobby-eyebrow">{room.championship ? `Championship · round ${room.championship.round} / 3` : "Race room"}</p>
            <h2>{track.name}</h2>
          </div>
          <div className="topline-actions">
            <button type="button" className="secondary danger" onClick={() => send({ type: "close_room" })}>Exit Room</button>
          </div>
        </div>

        <div className="track-preview">
          <MiniTrack track={track} />
          <div>
            <h3>{track.name}</h3>
            <p>{track.description}</p>
            {track.inspiration && <small className="track-inspiration">{track.inspiration}</small>}
            <small>{track.finishFraction ? "Route" : "Target lap"}: {track.targetLap}. Rain lowers grip and top speed. Reset off means crashes kick drivers out.</small>
          </div>
        </div>

        <div className="settings-strip" aria-label="Race settings">
          {room.settings.equalPace && <SettingChip label="Pace" value="Equal" />}
          {room.settings.championship && <SettingChip label="Session" value="3 races" />}
          {room.settings.changingWeather && <SettingChip label="Weather" value="Changing" />}
          <SettingChip label={track.finishFraction ? "Format" : "Laps"} value={track.finishFraction ? "One-way run" : String(room.settings.lapCount)} />
          <SettingChip label="Tutorial" value={room.settings.tutorialEnabled ? "On" : "Off"} />
          <SettingChip label="Rain" value={room.settings.rain ? "Wet grip" : "Off"} />
          <SettingChip label="Start" value={room.settings.warmupStart && !track.finishFraction ? "Warm-up / Flying" : "Grid"} />
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
      {isTutorialOpen && <HowToPlayModal onClose={() => setIsTutorialOpen(false)} />}
    </main>
  );
}

function TutorialDisplay({ room, send, themeClass }: { room: RoomState; send: ReturnType<typeof useGameSocket>["send"]; themeClass: string }) {
  const players = room.players.filter((player) => player.connected);
  const doneCount = players.filter((player) => player.tutorialDone).length;
  const vip = room.players.find((player) => player.isVIP);

  return (
    <main className={`tutorial-display ${themeClass}`}>
      <section className="tutorial-display-panel" aria-live="polite">
        <p className="eyebrow lobby-eyebrow">pre-race tutorial</p>
        <h1>Look at your phone for the tutorial :D</h1>
        <div className="tutorial-progress-ring">
          <strong>{doneCount}/{players.length}</strong>
          <span>done</span>
        </div>
        <p>The race starts automatically when every connected driver finishes the phone tutorial.</p>
        <div className="tutorial-driver-list">
          {players.map((player) => (
            <div key={player.id} className={player.tutorialDone ? "done" : undefined}>
              <span className="swatch" style={{ background: player.color }} />
              <strong>{player.name}</strong>
              <small>{player.tutorialDone ? "Done" : "On phone"}{player.isVIP ? " · VIP" : ""}</small>
            </div>
          ))}
        </div>
        <small className="screen-note">VIP: {vip?.name ?? "none"}. The VIP can start anyway from their phone if someone gets stuck.</small>
        <button type="button" className="secondary danger" onClick={() => send({ type: "display_return_lobby" })}>
          <RotateCcw size={18} /> Return to Lobby
        </button>
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
            <small>{player.isVIP ? "VIP" : player.isReady ? "Ready" : "Setting up"} · {playerVehicleLabel(player)} · {cockpitStyleLabel(player.cockpitStyle)} · {player.connected ? "online" : "reconnecting"}</small>
          </div>
        </div>
      ))}
      {room.players.length === 0 && <div className="empty">Waiting for the first phone controller.</div>}
    </div>
  );
}

function RaceDisplay({ room, displayGroupId, send }: { room: RoomState; displayGroupId?: string; send: ReturnType<typeof useGameSocket>["send"] }) {
  const racers = room.players.filter(player => room.cars.some(car => car.playerId === player.id));
  const localPlayers = racers.filter((player) => player.displayGroupId === displayGroupId);
  const panes = (localPlayers.length ? localPlayers : racers).slice(0, 4);
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
      <button type="button" className="race-exit" title="Return every driver to the lobby (Esc)" onClick={() => send({ type: "display_return_lobby" })}>
        <RotateCcw size={18} /> {room.championship ? "Abort round" : "Exit Race"}
      </button>
      <div className={className}>
        {panes.map((player) => (
          <RacePane key={player.id} room={room} sourcePlayer={player} paneCount={paneCount} />
        ))}
      </div>
      {room.phase === "countdown" && <StartLights countdown={countdown} />}
      <RaceFinishBanner room={room} />
    </main>
  );
}

function RacePane({ room, sourcePlayer, paneCount }: { room: RoomState; sourcePlayer: Player; paneCount: number }) {
  const sourceCar = room.cars.find((item) => item.playerId === sourcePlayer.id);
  const [spectateState, setSpectateState] = useState<{
    finishKey?: string;
    playerId?: string;
    autoSpectateSuppressed: boolean;
  }>({ autoSpectateSuppressed: false });
  const spectateTargets = useMemo(() => raceSpectateTargets(room, sourcePlayer.id), [room, sourcePlayer.id]);
  const spectateTargetsRef = useRef(spectateTargets);
  const driverDone = sourceCar?.finished || sourceCar?.dnf || (sourceCar?.crashed && !room.settings.resetEnabled);
  const finishKey = room.phase === "racing" && driverDone ? `${sourcePlayer.id}:${sourceCar?.finishTime ?? "out"}` : undefined;
  const currentSpectateState = spectateState.finishKey === finishKey ? spectateState : undefined;
  const selectedSpectatePlayerId = currentSpectateState?.playerId;
  const autoSpectateSuppressed = currentSpectateState?.autoSpectateSuppressed ?? false;
  const resolvedSpectatePlayerId = selectedSpectatePlayerId
    ? spectateTargets.find((item) => item.id === selectedSpectatePlayerId)?.id ?? spectateTargets[0]?.id
    : undefined;
  const focusPlayerId = resolvedSpectatePlayerId ?? sourcePlayer.id;
  const spectatedPlayer = resolvedSpectatePlayerId ? room.players.find((item) => item.id === resolvedSpectatePlayerId) : undefined;
  const showWatchRacePrompt = Boolean(driverDone && autoSpectateSuppressed && !resolvedSpectatePlayerId && spectateTargets[0]);
  const showRearView = rearViewVisible(sourcePlayer.rearViewMode ?? "auto", room, focusPlayerId);
  const paneClassName = ["race-pane", paneCount > 1 ? "race-pane-split" : "", showRearView ? "race-pane-has-rear-view" : ""].filter(Boolean).join(" ");

  useEffect(() => {
    spectateTargetsRef.current = spectateTargets;
  }, [spectateTargets]);

  useEffect(() => {
    if (!finishKey || autoSpectateSuppressed || resolvedSpectatePlayerId) return;
    const timeout = window.setTimeout(() => {
      const target = spectateTargetsRef.current[0];
      if (target) {
        setSpectateState((current) => {
          if (current.finishKey === finishKey && current.playerId) return current;
          return { finishKey, playerId: target.id, autoSpectateSuppressed: false };
        });
      }
    }, AUTO_SPECTATE_AFTER_FINISH_MS);
    return () => window.clearTimeout(timeout);
  }, [autoSpectateSuppressed, finishKey, resolvedSpectatePlayerId]);

  const selectSpectatePlayer = (playerId: string) => {
    if (!finishKey) return;
    setSpectateState({ finishKey, playerId, autoSpectateSuppressed: false });
  };

  const watchLeadingTarget = () => {
    const target = spectateTargetsRef.current[0];
    if (!target || !finishKey) return;
    setSpectateState({ finishKey, playerId: target.id, autoSpectateSuppressed: false });
  };

  return (
    <div className={paneClassName}>
      <RaceCanvas room={room} focusPlayerId={focusPlayerId} paneCount={paneCount} cameraMotion={sourcePlayer.cameraMotion ?? true} />
      {room.settings.rain && <div className="rain-visor" aria-hidden />}
      <RaceHud room={room} focusPlayerId={focusPlayerId} />
      <DrivingCoach room={room} focusPlayerId={focusPlayerId} />
      {showRearView && <RaceRearView room={room} focusPlayerId={focusPlayerId} paneCount={paneCount} cameraMotion={sourcePlayer.cameraMotion ?? true} />}
      <RaceTipRiskToast room={room} focusPlayerId={focusPlayerId} />
      <RaceMiniMap room={room} focusPlayerId={focusPlayerId} />
      <RaceLeaderboard room={room} focusPlayerId={focusPlayerId} compact={paneCount > 1} />
      {spectatedPlayer && (
        <RaceSpectateControls
          activePlayers={spectateTargets}
          spectatedPlayer={spectatedPlayer}
          onSelect={selectSpectatePlayer}
          onReturn={() => {
            if (!finishKey) return;
            setSpectateState({ finishKey, autoSpectateSuppressed: true });
          }}
        />
      )}
      {showWatchRacePrompt && spectateTargets[0] && (
        <RaceSpectatePrompt targetPlayer={spectateTargets[0]} onWatch={watchLeadingTarget} />
      )}
    </div>
  );
}

function RaceSpectateControls({
  activePlayers,
  spectatedPlayer,
  onSelect,
  onReturn
}: {
  activePlayers: Player[];
  spectatedPlayer: Player;
  onSelect: (playerId: string) => void;
  onReturn: () => void;
}) {
  const currentIndex = Math.max(0, activePlayers.findIndex((player) => player.id === spectatedPlayer.id));
  const canSwitch = activePlayers.length > 1;
  const selectOffset = (offset: number) => {
    if (!canSwitch) return;
    const next = activePlayers[(currentIndex + offset + activePlayers.length) % activePlayers.length];
    if (next) onSelect(next.id);
  };

  return (
    <div className={canSwitch ? "race-spectate-controls" : "race-spectate-controls single"} aria-live="polite">
      {canSwitch && (
        <button type="button" aria-label="Previous racer" title="Previous racer" onClick={() => selectOffset(-1)}>
          <ArrowLeft size={18} />
        </button>
      )}
      <div className="race-spectate-driver">
        <span>Spectating</span>
        <strong>{spectatedPlayer.name}</strong>
      </div>
      {canSwitch && (
        <button type="button" aria-label="Next racer" title="Next racer" onClick={() => selectOffset(1)}>
          <ArrowRight size={18} />
        </button>
      )}
      <button type="button" className="race-spectate-return" onClick={onReturn}>
        <RotateCcw size={14} /> My car
      </button>
    </div>
  );
}

function RaceSpectatePrompt({ targetPlayer, onWatch }: { targetPlayer: Player; onWatch: () => void }) {
  return (
    <div className="race-spectate-controls prompt">
      <div className="race-spectate-driver">
        <span>Race still live</span>
        <strong>{targetPlayer.name}</strong>
      </div>
      <button type="button" className="race-spectate-return" onClick={onWatch}>
        <ArrowRight size={14} /> Watch
      </button>
    </div>
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
  const winner = room.cars.reduce<CarState | undefined>((best, car) => {
    if (!car.finished || car.finishTime === undefined) return best;
    if (!best || car.finishTime < (best.finishTime ?? Infinity)) return car;
    return best;
  }, undefined);
  const winnerPlayerId = winner?.playerId;
  const player = winnerPlayerId ? room.players.find((item) => item.id === winnerPlayerId) : undefined;
  const [visibleFor, setVisibleFor] = useState<string>();

  useEffect(() => {
    if (!winnerPlayerId) return;
    setVisibleFor(winnerPlayerId);
    const timeout = window.setTimeout(() => setVisibleFor(undefined), AUTO_SPECTATE_AFTER_FINISH_MS);
    return () => window.clearTimeout(timeout);
  }, [winnerPlayerId]);

  if (!player || visibleFor !== winnerPlayerId || room.phase !== "racing") return null;

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
  const lapText = TRACKS[room.settings.trackId].finishFraction && isActiveRacingCar(car) ? "One-way run" : raceHudStatusText(car, room.settings.lapCount);
  return (
    <div className="race-hud">
      <div><span className="swatch" style={{ background: player?.color }} />{player?.name}</div>
      <div>{lapText}</div>
      <div>{speed} km/h</div>
    </div>
  );
}

function DrivingCoach({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const car = room.cars.find(c => c.playerId === focusPlayerId);
  const player = room.players.find(p => p.id === focusPlayerId);
  const track = TRACKS[room.settings.trackId];
  if (!car || room.phase !== "racing" || car.finished || car.crashed || car.dnf) return null;
  const elapsed = car.timedLapStarted && room.raceStartedAt ? Math.max(0, (currentServerTimeMs() - room.raceStartedAt) / 1000 - car.currentLapStartedAt) : 0;
  const personal = readPersonalLap(practiceKey(track, car, room.settings, `${player?.name}:${player?.color}`));
  const advice = player?.cornerGuide ? cornerAdvice(track, car) : undefined;
  const overlaps = room.settings.ghostMode ? [] : room.cars.filter(other => {
    if (other.playerId === car.playerId || other.finished || other.crashed || other.dnf || Math.abs(other.y - car.y) > 2.4) return false;
    const dx = other.x - car.x, dz = other.z - car.z;
    const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
    const side = dx * Math.cos(car.heading) - dz * Math.sin(car.heading);
    return Math.abs(ahead) < 3.4 && Math.abs(side) > 0.8 && Math.abs(side) < 4.5;
  });
  const overlapSides = new Set(overlaps.map(other => (other.x-car.x)*Math.cos(car.heading)-(other.z-car.z)*Math.sin(car.heading) > 0 ? "right" : "left"));
  return <>
    {Array.from(overlapSides).map(side => <div key={side} className={`overlap-indicator ${side}`} aria-label={`Car alongside on the ${side}`}><span />CAR {side.toUpperCase()}</div>)}
    <div className="lap-telemetry" aria-label="Lap timing">
      <span>{car.timedLapStarted ? track.finishFraction ? "RUN TIME" : "LAP TIME" : "WARM-UP"}<strong>{formatLapTime(elapsed)}</strong></span>
      {(car.bestLapTime || personal) && <span>BEST<strong>{formatLapTime(Math.min(car.bestLapTime ?? Infinity, personal?.time ?? Infinity))}</strong></span>}
      {car.lastLapTime && <span>LAST<strong>{formatLapTime(car.lastLapTime)}</strong></span>}
      {player?.practiceGhost && !room.settings.changingWeather && <span className="practice-label">{personal ? "PB GHOST" : "GHOST"}<strong>{personal ? "Ready" : "Set a lap"}</strong></span>}
    </div>
    {advice && <div className={advice.braking ? "corner-advice braking" : "corner-advice"}>
      {advice.direction === "LEFT" ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
      <span>{advice.braking ? "BRAKE" : advice.sharp ? "TIGHT" : "TURN"} · {advice.direction}</span>
    </div>}
  </>;
}

function RaceTipRiskToast({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const car = room.cars.find((item) => item.playerId === focusPlayerId);
  const activeTukTuk = room.phase === "racing" && car?.vehicleId === "tukTuk" && !car.crashed && !car.finished && !car.dnf;
  const tipRisk = activeTukTuk ? car.rolloverRisk : 0;
  const [tipRiskLatch, setTipRiskLatch] = useState(() => ({ activeTukTuk, risk: 0 }));
  const latchTimeout = useRef<number | undefined>(undefined);
  let latchedTipRisk = tipRiskLatch.risk;
  if (tipRiskLatch.activeTukTuk !== activeTukTuk) {
    const nextLatch = { activeTukTuk, risk: activeTukTuk ? tipRiskLatch.risk : 0 };
    latchedTipRisk = nextLatch.risk;
    setTipRiskLatch(nextLatch);
  }

  useEffect(() => {
    if (tipRisk <= TIP_RISK_TOAST_THRESHOLD) return;
    setTipRiskLatch((current) => ({ activeTukTuk: true, risk: Math.max(current.activeTukTuk ? current.risk : 0, tipRisk) }));
    if (latchTimeout.current) window.clearTimeout(latchTimeout.current);
    latchTimeout.current = window.setTimeout(() => setTipRiskLatch((current) => ({ ...current, risk: 0 })), 900);
  }, [tipRisk]);
  useEffect(() => {
    if (activeTukTuk) return;
    if (latchTimeout.current) window.clearTimeout(latchTimeout.current);
    latchTimeout.current = undefined;
  }, [activeTukTuk]);
  useEffect(() => () => {
    if (latchTimeout.current) window.clearTimeout(latchTimeout.current);
  }, []);
  const displayedTipRisk = activeTukTuk ? Math.max(tipRisk, latchedTipRisk) : 0;
  if (displayedTipRisk <= TIP_RISK_TOAST_THRESHOLD) return null;
  return (
    <div className={displayedTipRisk > 0.72 ? "tip-risk-toast high" : "tip-risk-toast"} aria-live="polite">
      TIP RISK
    </div>
  );
}

function RaceMiniMap({ room, focusPlayerId }: { room: RoomState; focusPlayerId: string }) {
  const track = TRACKS[room.settings.trackId];
  const { bounds, points } = useMemo(() => {
    const bounds = track.finishFraction ? boundsFromSamples(courseMapSamples(track)) : getTrackBounds(track);
    const points = courseMapSamples(track)
      .map((point) => `${projectMiniX(point.x, bounds)},${projectMiniY(point.z, bounds)}`)
      .join(" ");
    return { bounds, points };
  }, [track]);
  return (
    <svg className="race-minimap" viewBox="0 0 210 150" aria-label="Race minimap">
      <polyline points={points} fill="none" stroke="rgba(255,250,240,0.28)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke="#f1eadc" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {track.finishFraction && <rect x={projectMiniX(sampleTrack(track, raceCourseLength(track)).x, bounds)-4} y={projectMiniY(sampleTrack(track, raceCourseLength(track)).z, bounds)-4} width={8} height={8} fill="#f5ecd8" stroke="#172e2b" strokeWidth={2} />}
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

function RaceLeaderboard({ room, focusPlayerId, compact = false }: { room: RoomState; focusPlayerId: string; compact?: boolean }) {
  const track = TRACKS[room.settings.trackId];
  const totalLength = raceCourseLength(track);
  const rows = room.players
    .filter(player => room.cars.some(car => car.playerId === player.id))
    .map((player) => {
      const car = room.cars.find((item) => item.playerId === player.id);
      const distance = raceDistance(car, room.settings.lapCount, totalLength);
      return { player, car, distance };
    })
    .sort((a, b) => {
      const statusScore = (item: typeof a) => item.car?.finished ? 3 : item.car?.crashed ? 1 : item.car?.dnf ? 0 : 2;
      return statusScore(b) - statusScore(a) || (a.car?.finished && b.car?.finished ? (a.car.finishTime ?? Infinity) - (b.car.finishTime ?? Infinity) : b.distance - a.distance);
    });

  if (rows.length < 2) return null;
  if (compact) {
    const position = rows.findIndex(r => r.player.id === focusPlayerId);
    const ahead = position > 0 ? rows[position - 1] : undefined;
    return <div className="race-position" aria-label={`Position ${position+1} of ${rows.length}`}><strong>P{position+1}<small> / {rows.length}</small></strong><span>{ahead ? `Ahead: ${ahead.player.name}` : "Leading"}</span></div>;
  }
  return (
    <ol className="race-leaderboard" aria-label="Race leaderboard">
      {rows.map(({ player, car }, index) => (
        <li key={player.id} className={player.id === focusPlayerId ? "focus" : undefined}>
          <span>{index + 1}</span>
          <i style={{ background: player.color }} />
          <strong>{player.name}</strong>
          <em>{TRACKS[room.settings.trackId].finishFraction && isActiveRacingCar(car) ? "run" : raceStatusText(car, room.settings.lapCount)}</em>
        </li>
      ))}
    </ol>
  );
}

function raceSpectateTargets(room: RoomState, sourcePlayerId: string) {
  const totalLength = raceCourseLength(TRACKS[room.settings.trackId]);
  return room.players
    .map((player) => {
      const car = room.cars.find((item) => item.playerId === player.id);
      return { player, car, distance: raceDistance(car, room.settings.lapCount, totalLength) };
    })
    .filter((item): item is { player: Player; car: CarState; distance: number } => item.player.id !== sourcePlayerId && isActiveRacingCar(item.car))
    .sort((a, b) => b.distance - a.distance)
    .map(({ player }) => player);
}

function rearViewVisible(mode: RearViewMode, room: RoomState, focusPlayerId: string) {
  const hasFocusCar = room.cars.some((car) => car.playerId === focusPlayerId);
  if (!hasFocusCar || mode === "off") return false;
  if (mode === "on") return true;
  return room.cars.some((car) => car.playerId !== focusPlayerId && !car.dnf);
}

function isActiveRacingCar(car: CarState | undefined): car is CarState {
  return Boolean(car && !car.finished && !car.crashed && !car.dnf);
}

function raceDistance(car: CarState | undefined, lapCount: number, totalLength: number) {
  if (!car) return 0;
  if (!car.timedLapStarted) return car.distanceThisLap - totalLength;
  // Cars waiting behind the line must not appear to lead before their first crossing.
  if (car.nextCheckpoint === 0 && car.distanceThisLap < totalLength * 0.1 && car.progress > totalLength * 0.8) return (car.lap - 1) * totalLength - 1;
  return (Math.min(car.lap, lapCount + 1) - 1) * totalLength + car.progress;
}

function raceHudStatusText(car: CarState | undefined, lapCount: number) {
  if (!car) return `Lap 1/${lapCount}`;
  if (car.finished) return "Finished";
  if (car.crashed) return "Crashed";
  if (car.dnf) return "DNF";
  if (!car.timedLapStarted) return "Warm-up";
  return `Lap ${car.lap}/${lapCount}`;
}

function ResultsDisplay({ room, send, themeClass }: { room: RoomState; send: ReturnType<typeof useGameSocket>["send"]; themeClass: string }) {
  const [replayOpen, setReplayOpen] = useState(false);
  const replay = readRaceReplay(room.roomCode, room.raceStartedAt);
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
        {replay && <button type="button" className="secondary" onClick={() => setReplayOpen(true)}>Watch the first finish <Play size={16} /></button>}
        <RaceAwards room={room} />
        {room.championship && <SeriesStandings room={room} />}
        {room.championship && room.championship.round < 3 && <><p>Vote for the next track on your phone, then continue to the lobby to tune your car.</p><button type="button" className="primary" onClick={() => send({ type: "advance_championship" })}>Next round <ArrowRight size={18} /></button></>}
        <p>VIP: {vip?.name ?? "none"}. {room.championship && room.championship.round < 3 ? "Return to lobby ends this championship." : "Return to lobby keeps the same room and drivers."}</p>
        <button type="button" className="secondary" onClick={() => send({ type: "display_return_lobby" })}>
          <RotateCcw size={18} /> Return to Lobby
        </button>
      </section>
      {replayOpen && <ReplayDialog room={room} onClose={() => setReplayOpen(false)} render={(replayRoom, focusId) => <RaceCanvas room={replayRoom} focusPlayerId={focusId} paneCount={1} replay />} />}
    </main>
  );
}

function RaceAwards({ room }: { room: RoomState }) {
  if (!room.awards?.length) return null;
  return <div className="race-awards">{room.awards.map(award => <div key={award.title}>
    <span>{award.title}</span><strong>{room.players.find(p => p.id === award.playerId)?.name ?? "Driver"}</strong><small>{award.detail}</small>
  </div>)}</div>;
}

function SeriesStandings({ room }: { room: RoomState }) {
  const series = room.championship;
  if (!series) return null;
  return <section className="series-standings"><h3>{series.round >= 3 ? "Championship complete" : `Championship · round ${series.round} / 3`}</h3>
    <ol>{series.standings.map(s => <li key={s.playerId}><span>{series.standings.findIndex(row => row.points === s.points && row.wins === s.wins) + 1}</span><i className="swatch" style={{background:s.color}} /><strong>{s.name}</strong><b>{s.points} pts</b></li>)}</ol>
    <small>12 · 9 · 7 · 5 · 4 · 3 · 2 · 1 points for finishers. Tied points use race wins; equal wins share a place.</small>
  </section>;
}

function ControllerResults({ room, player, send }: { room: RoomState; player?: Player; send: ReturnType<typeof useGameSocket>["send"] }) {
  const series = room.championship;
  const result = room.results.find(r => r.playerId === player?.id);
  const place = room.results.findIndex(r => r.playerId === player?.id) + 1;
  return <main className="phone results-phone">
    <p className="eyebrow">{series ? `Round ${series.round} / 3` : "Race complete"}</p>
    <h1>{result?.status === "finished" ? `P${place} · ${player?.name}` : result?.status === "crashed" ? "Quite an entrance." : "See you on the grid."}</h1>
    {result?.totalTime !== undefined && <p>{formatLapTime(result.totalTime)} total{result.bestLapTime ? ` · ${formatLapTime(result.bestLapTime)} best ${TRACKS[room.settings.trackId].finishFraction ? "run" : "lap"}` : ""}</p>}
    <RaceAwards room={room} />
    {series && <SeriesStandings room={room} />}
    {series && series.round < 3 && <section className="track-vote"><h2>Where next?</h2><p>One vote per connected driver. The VIP opens the next lobby when everyone is ready.</p><div className="vote-grid">
      {(Object.keys(TRACKS) as TrackId[]).map(id => {
        const votes = Object.entries(series.votes).filter(([playerId, vote]) => vote === id && room.players.some(p => p.id === playerId && p.connected)).length;
        const selected = player && series.votes[player.id] === id;
        return <button type="button" key={id} className={selected ? "selected" : undefined} aria-pressed={Boolean(selected)} onClick={() => send({ type: "vote_track", trackId: id })}><strong>{TRACKS[id].name}</strong><small>{votes} vote{votes === 1 ? "" : "s"}{selected ? " · yours" : ""}</small></button>;
      })}
    </div></section>}
    {player?.isVIP ? <div className="result-actions">
      {series && series.round < 3 && <button type="button" className="primary" onClick={() => send({ type: "advance_championship" })}>Next round <ArrowRight size={18} /></button>}
      <button type="button" className="secondary" onClick={() => send({ type: "vip_return_lobby" })}>{series && series.round < 3 ? "End championship" : "Return to lobby"}</button>
    </div> : <p className="phone-note">Waiting for the VIP to open the next lobby. Your driver stays connected.</p>}
  </main>;
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
  const selectedVehicleId = player?.vehicleId ?? DEFAULT_VEHICLE_ID;
  const [steeringLevel, setSteeringLevel] = useState(() => defaultSteeringSensitivityLevel(selectedVehicleId));
  const steeringVehicleRef = useRef(selectedVehicleId);
  const setSteeringLevelClamped = useCallback((value: number) => {
    setSteeringLevel(Math.round(clamp(value, STEERING_SENSITIVITY_MIN, STEERING_SENSITIVITY_MAX)));
  }, []);

  useLayoutEffect(() => {
    if (steeringVehicleRef.current === selectedVehicleId) return;
    steeringVehicleRef.current = selectedVehicleId;
    setSteeringLevel(defaultSteeringSensitivityLevel(selectedVehicleId));
  }, [selectedVehicleId]);

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
              <button key={item} type="button" className={item === color ? "color active" : "color"} style={{ background: item }} aria-label={`Choose ${item} driver color`} onClick={() => setColor(item)} />
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
    return <RaceController send={game.send} feedback={game.feedback} crashEvents={game.controllerCrashEvents} nearbyAudioCars={game.controllerNearbyAudioCars} nearbyCrashEvents={game.controllerNearbyCrashEvents} countdownMark={game.controllerCountdownMark} room={game.room} playerId={game.playerId} steeringLevel={steeringLevel} />;
  }

  if (game.room?.phase === "tutorial") {
    return <ControllerTutorial room={game.room} player={player} send={game.send} steeringLevel={steeringLevel} />;
  }

  if (game.room?.phase === "results") return <ControllerResults room={game.room} player={player} send={game.send} />;

  return <ControllerLobby room={game.room} player={player} send={game.send} feedback={game.feedback} joinStatus={joinStatus} browserNotice={browserNotice} steeringLevel={steeringLevel} onSteeringLevelChange={setSteeringLevelClamped} />;
}

function ControllerLobby({ room, player, send, feedback, joinStatus, browserNotice, steeringLevel, onSteeringLevelChange }: { room?: RoomState; player?: Player; send: ReturnType<typeof useGameSocket>["send"]; feedback?: CarState; joinStatus?: string; browserNotice?: string; steeringLevel: number; onSteeringLevelChange: (value: number) => void }) {
  const [lobbyTab, setLobbyTab] = useState<"drive" | "race">("drive");
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [lobbyTab]);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionStatus, setMotionStatus] = useState(() => motionLobbyStatus());
  const [motionLevel, setMotionLevel] = useState(0);
  const [audioEnabled, setAudioEnabled] = useStoredBoolean("sim-drive-audio-enabled", true);
  const [audioStatus, setAudioStatus] = useState(audioEnabled ? "Audio on" : "Audio off");
  const [hapticStatus, setHapticStatus] = useState(() => hapticSupportMessage());
  const [hapticsEnabled, setHapticsEnabled] = useStoredBoolean("sim-drive-haptics-enabled", true);
  const [brakeStart, setBrakeStart] = useStoredNumber("sim-drive-brake-start", 0);
  const [throttleStart, setThrottleStart] = useStoredNumber("sim-drive-throttle-start", 0);
  const [invertMotionSteering, setInvertMotionSteering] = useStoredBoolean(INVERT_MOTION_STEERING_KEY, false);
  const [feelTest, setFeelTest] = useState({ id: 0, label: "Feel test" });
  const [motionListenToken, setMotionListenToken] = useState(0);
  const [motionDebug, setMotionDebug] = useState(motionDebugInitial);
  const steeringSensitivity = steeringSensitivityFromLevel(steeringLevel);
  const motionSteeringDirection = invertMotionSteering ? -1 : 1;
  const settings = room?.settings;
  const explicitMotionPermission = explicitMotionPermissionRequired();
  const motionCheckRef = useRef<number | undefined>(undefined);
  const motionRequestInFlightRef = useRef(false);

  const noteMotionDebug = (event: MotionDebugEvent) => {
    setMotionDebug((current) => updateMotionDebug(current, event));
    if (event.kind === "event" && (event.source === "orientation-null" || event.source === "motion-empty")) {
      setMotionStatus((current) => current === "Motion ready" || current === "Motion waiting" || current === "Enable tilt steering" ? "Tap Enable Tilt" : current);
    }
  };

  const markMotionAwaitingEvents = () => {
    window.clearTimeout(motionCheckRef.current);
    motionCheckRef.current = window.setTimeout(() => {
      setMotionStatus((current) => current === "Motion ready" ? "Move phone; no tilt data yet" : current);
    }, 1800);
  };

  const applyMotionResult = (motion: Awaited<ReturnType<typeof enableControllerDevice>>) => {
    setMotionEnabled(motion.enabled);
    setMotionStatus(motion.message);
    noteMotionDebug({ kind: "permissions", status: motion.permissions });
    noteMotionDebug({ kind: "request", message: motion.message });
    if (motion.enabled) {
      setMotionListenToken((current) => current + 1);
      markMotionAwaitingEvents();
    }
  };

  const requestLobbyMotion = async () => {
    if (motionRequestInFlightRef.current) return;
    motionRequestInFlightRef.current = true;
    try {
      const motion = await enableControllerDevice({ landscape: false });
      applyMotionResult(motion);
    } finally {
      motionRequestInFlightRef.current = false;
    }
  };

  const prepareToDrive = async () => {
    if (explicitMotionPermission) {
      await requestLobbyMotion();
      if (audioEnabled) unlockControllerAudio();
      await requestLandscape();
      return true;
    }
    if (audioEnabled) unlockControllerAudio();
    await requestLobbyMotion();
    await requestLandscape();
    return true;
  };

  useEffect(() => {
    const neutral = { current: undefined as number | undefined };
    return listenToSteeringMotion(({ raw, angle, source }) => {
      window.clearTimeout(motionCheckRef.current);
      setMotionEnabled(true);
      const calibration = readMotionCalibration(motionOrientationFrameKey(angle, source));
      neutral.current = calibration?.neutral ?? neutral.current ?? raw;
      setMotionLevel(steeringFromTilt(raw, neutral.current, steeringSensitivity, motionSteeringDirection));
      setMotionStatus(motionLiveStatus(source));
    }, noteMotionDebug);
  }, [motionListenToken, motionSteeringDirection, steeringSensitivity]);

  useEffect(() => () => window.clearTimeout(motionCheckRef.current), []);

  return (
    <main
      className="phone controller-lobby"
      onPointerDownCapture={() => {
        if (!explicitMotionPermission && !motionEnabled && motionDebug.request === "not requested") void requestLobbyMotion();
      }}
    >
      <header className="phone-lobby-heading"><div><p className="eyebrow">ROOM {room?.roomCode}{player?.isVIP ? " · VIP" : ""}</p><h1>{lobbyTab === "race" ? "Race together." : "Your drive."}</h1></div><span className="swatch" style={{background:player?.color}} /></header>
      {player?.isVIP && <div className="lobby-tabs" role="tablist" aria-label="Lobby settings">
        <button type="button" role="tab" aria-selected={lobbyTab === "drive"} aria-controls="drive-settings" onClick={() => setLobbyTab("drive")}>Your car &amp; controls</button>
        <button type="button" role="tab" aria-selected={lobbyTab === "race"} aria-controls="race-settings" onClick={() => setLobbyTab("race")}>Race settings</button>
      </div>}
      {(!player?.isVIP || lobbyTab === "drive") && <div id="drive-settings" className="drive-settings">
      {joinStatus && <small className="phone-note">{joinStatus}</small>}
      {explicitMotionPermission ? (
        <div className="motion-permission-card" role="status">
          <div>
            <strong>{motionEnabled ? "Tilt steering enabled" : "Enable tilt steering"}</strong>
            <span>This browser asks before the controller can read phone tilt.</span>
          </div>
          <button type="button"
            className="primary"
            onClick={() => {
              void requestLobbyMotion();
            }}
          >
            <Activity size={18} /> {motionEnabled ? "Test Tilt" : "Enable Tilt"}
          </button>
          <small className="phone-note">{motionStatus}</small>
        </div>
      ) : (
        <>
          <button type="button"
            className="secondary"
            onClick={() => {
              void requestLobbyMotion();
            }}
          >
            <Activity size={18} /> {motionEnabled ? "Motion Enabled" : "Enable Motion"}
          </button>
          <small className="phone-note">{motionStatus}</small>
        </>
      )}
      <div className="motion-test">
        <span>Motion test</span>
        <div className="tilt-meter"><span style={{ transform: `translateX(${motionLevel * 42}px)` }} /></div>
      </div>
      <BrowserRecommendationNotice notice={browserNotice} />
      <details className="driving-options controller-device-options"><summary>Controller setup <span>Audio, haptics, sensitivity &amp; pedal preferences</span></summary>
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
      <button type="button"
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
      <button type="button"
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
      <FeelPreview test={feelTest} />
      <SteeringSensitivityPreference value={steeringLevel} onChange={onSteeringLevelChange} />
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
      <MotionDebugDetails debug={motionDebug} />
      </details>
      {player && <VehicleLoadoutSelector vehicleId={player.vehicleId} setupId={player.carSetupId} color={player.color} equalPace={settings?.equalPace} send={send} />}
      {player && <details className="driving-options">
        <summary>View &amp; practice <span>Personal preferences</span></summary>
        <Toggle label="Corner hints" value={player.cornerGuide ?? false} onChange={(cornerGuide) => send({ type: "set_view_options", cornerGuide })} />
        <small className="phone-note">A small turn/brake hint on your display. Learn the track at your own pace.</small>
        <Toggle label="Personal best ghost" value={player.practiceGhost ?? false} onChange={(practiceGhost) => send({ type: "set_view_options", practiceGhost })} />
        <small className="phone-note">Chase your best uninterrupted lap or run, saved on this display for your name, color, car, setup and weather.</small>
        <Toggle label="Camera movement" value={player.cameraMotion ?? true} onChange={(cameraMotion) => send({ type: "set_view_options", cameraMotion })} />
        <small className="phone-note">Subtle braking and cornering motion. Turn off for a steadier view.</small>
      {player && <RearViewModeSelector value={player.rearViewMode ?? "auto"} send={send} />}
      {player && <CockpitStyleSelector value={player.cockpitStyle} send={send} />}
      </details>}
      </div>}
      {player?.isVIP && settings && lobbyTab === "race" && (
        <div id="race-settings" className="vip-controls">
          <TrackPicker settings={settings} send={send} />
          {TRACKS[settings.trackId].finishFraction ? <p className="phone-note">Point-to-point · one run · grid start. Your circuit lap and flying-start choices are kept for circuit races.</p> : <Stepper label="Laps" value={settings.lapCount} min={1} max={9} onChange={(lapCount) => send({ type: "vip_set_settings", settings: { lapCount } })} />}
          <Toggle label="Tutorial" value={settings.tutorialEnabled} onChange={(tutorialEnabled) => send({ type: "vip_set_settings", settings: { tutorialEnabled } })} />
          <small className="phone-note">When on, everyone gets a short phone tutorial before the countdown. Default is on.</small>
          {!TRACKS[settings.trackId].finishFraction && <Toggle label="Warm-up / flying start" value={settings.warmupStart} onChange={(warmupStart) => send({ type: "vip_set_settings", settings: { warmupStart } })} />}
          {!TRACKS[settings.trackId].finishFraction && <small className="phone-note">First pass is untimed. Your race starts when you cross the line at speed.</small>}
          <Toggle label="Ghost cars" value={settings.ghostMode} onChange={(ghostMode) => send({ type: "vip_set_settings", settings: { ghostMode } })} />
          <small className="phone-note">Ghost cars disables car-to-car collisions. Walls and off-track still matter.</small>
          <Toggle label="Rain" value={settings.rain} onChange={(rain) => send({ type: "vip_set_settings", settings: { rain } })} />
          <small className="phone-note">Rain lowers grip and top speed, so braking and steering need more care.</small>
          <Toggle label="Gentle assist" value={settings.stabilityAssist} onChange={(stabilityAssist) => send({ type: "vip_set_settings", settings: { stabilityAssist } })} />
          <small className="phone-note">Gentle assist softly aligns the car toward the road direction so steering is more forgiving.</small>
          <Toggle label="Reset mode" value={settings.resetEnabled} onChange={(resetEnabled) => send({ type: "vip_set_settings", settings: { resetEnabled } })} />
          <small className="phone-note">Reset mode respawns crashes. Off-track reset appears after 5 seconds in the grass.</small>
          <details className="driving-options race-extras"><summary>Race extras <span>Optional · your settings stay yours</span></summary>
            <Toggle label="Equal pace" value={settings.equalPace ?? false} onChange={(equalPace) => send({ type: "vip_set_settings", settings: { equalPace } })} />
            <small className="phone-note">Bring the vehicles closer on the straights. Weight, steering and setup choices still matter.</small>
            <Toggle label="Three-race championship" value={settings.championship ?? false} onChange={(championship) => send({ type: "vip_set_settings", settings: { championship } })} />
            <small className="phone-note">Keep points across three races. Everyone votes for the next track between rounds.</small>
            <Toggle label="Changing weather" value={settings.changingWeather ?? false} onChange={(changingWeather) => send({ type: "vip_set_settings", settings: { changingWeather } })} />
            <small className="phone-note">Rain rolls in, or clears if you start wet. Grip changes gradually during the race. Ghost recording pauses for changing weather.</small>
          </details>

        </div>
      )}
      {player?.isVIP && <div className="lobby-action">
        <small>{settings ? TRACKS[settings.trackId].name : "Choose a track"}{room?.championship ? ` · Round ${room.championship.round} / 3` : ""}</small>
        <button type="button" className={lobbyTab === "drive" ? "secondary" : "primary"} onClick={async () => {
          if (lobbyTab === "drive") { setLobbyTab("race"); return; }
          if (!(await prepareToDrive())) return;
          send({ type: "vip_start_race" });
        }}>{lobbyTab === "drive" ? <>Continue <ArrowRight size={18} /></> : <><Flag size={18} /> Start Race</>}</button>
      </div>}
      {!player?.isVIP && (
        <div className="lobby-action">
          <button type="button"
            className="primary ready-button"
            onClick={async () => {
              if (!(await prepareToDrive())) return;
              send({ type: "set_ready", ready: !player?.isReady });
            }}
          >
            {player?.isReady ? "I'm not ready" : "I'm ready"}
          </button>
          <small>{player?.isReady ? "Ready. Waiting for the VIP." : "Pick your car, then get ready."}</small>
        </div>
      )}
      <small className="phone-note">Use earphones for clearer engine, tire, curb, nearby car, and impact feedback.</small>
      {feedback && <small>{Math.round(speedToKmh(feedback.speed))} km/h</small>}
    </main>
  );
}

function ControllerTutorial({ room, player, send, steeringLevel }: { room: RoomState; player?: Player; send: ReturnType<typeof useGameSocket>["send"]; steeringLevel: number }) {
  const [step, setStep] = useState<"controls" | "range">("controls");
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [motionStatus, setMotionStatus] = useState(() => motionLobbyStatus());
  const [motionLevel, setMotionLevel] = useState(0);
  const [rangeTravel, setRangeTravel] = useState(118);
  const [motionListenToken, setMotionListenToken] = useState(0);
  const [motionDebug, setMotionDebug] = useState(motionDebugInitial);
  const [calibrationLabel, setCalibrationLabel] = useState("Calibrate");
  const [invertMotionSteering] = useStoredBoolean(INVERT_MOTION_STEERING_KEY, false);
  const motionRequestInFlightRef = useRef(false);
  const rangeMeterRef = useRef<HTMLDivElement>(null);
  const rangeMarkerRef = useRef<HTMLSpanElement>(null);
  const rangeNeutralReadyRef = useRef(false);
  const lastRawSteerRef = useRef<number | undefined>(undefined);
  const initialOrientationFrame = useMemo(() => motionOrientationFrameKey(), []);
  const lastOrientationFrameRef = useRef(initialOrientationFrame);
  const neutralRef = useRef<number | undefined>(readMotionCalibration()?.neutral);
  const steeringSensitivity = steeringSensitivityFromLevel(steeringLevel);
  const motionSteeringDirection = invertMotionSteering ? -1 : 1;
  const explicitMotionPermission = explicitMotionPermissionRequired();
  const players = room.players.filter((item) => item.connected);
  const doneCount = players.filter((item) => item.tutorialDone).length;
  const remainingCount = Math.max(0, players.length - doneCount);
  const motionNeedsTiltAction = motionStatus.toLowerCase().includes("tilt");
  const motionButtonLabel = motionNeedsTiltAction ? "Enable Tilt" : motionEnabled ? "Test Motion" : "Enable Motion";

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [step, player?.tutorialDone]);

  useEffect(() => {
    rangeNeutralReadyRef.current = false;
    setMotionLevel(0);
  }, [step]);

  useLayoutEffect(() => {
    if (step !== "range") return;
    const meter = rangeMeterRef.current;
    const marker = rangeMarkerRef.current;
    if (!meter || !marker) return;

    const updateRangeTravel = () => {
      const meterWidth = meter.getBoundingClientRect().width;
      const markerWidth = marker.getBoundingClientRect().width;
      const nextTravel = Math.max(0, (meterWidth - markerWidth) / 2);
      setRangeTravel((current) => (Math.abs(current - nextTravel) < 0.5 ? current : nextTravel));
    };

    updateRangeTravel();
    window.addEventListener("resize", updateRangeTravel);
    const resizeObserver = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateRangeTravel);
    resizeObserver?.observe(meter);
    resizeObserver?.observe(marker);
    return () => {
      window.removeEventListener("resize", updateRangeTravel);
      resizeObserver?.disconnect();
    };
  }, [step]);

  useEffect(() => {
    void requestLandscape();
  }, []);

  const noteMotionDebug = (event: MotionDebugEvent) => {
    setMotionDebug((current) => updateMotionDebug(current, event));
    if (event.kind === "event" && (event.source === "orientation-null" || event.source === "motion-empty")) {
      setMotionStatus((current) => current === "Motion ready" || current === "Motion waiting" || current === "Enable tilt steering" ? "Tap Enable Tilt" : current);
    }
  };

  const applyMotionResult = (motion: Awaited<ReturnType<typeof enableControllerDevice>>) => {
    setMotionEnabled(motion.enabled);
    setMotionStatus(motion.message);
    noteMotionDebug({ kind: "permissions", status: motion.permissions });
    noteMotionDebug({ kind: "request", message: motion.message });
    if (motion.enabled) setMotionListenToken((current) => current + 1);
  };

  const requestTutorialMotion = async () => {
    if (motionRequestInFlightRef.current) return;
    motionRequestInFlightRef.current = true;
    try {
      const motion = await enableControllerDevice();
      applyMotionResult(motion);
    } finally {
      motionRequestInFlightRef.current = false;
    }
  };

  useEffect(() => {
    return listenToSteeringMotion(({ raw, angle, source }) => {
      const orientationFrame = motionOrientationFrameKey(angle, source);
      if (orientationFrame !== lastOrientationFrameRef.current) {
        lastOrientationFrameRef.current = orientationFrame;
        neutralRef.current = undefined;
        rangeNeutralReadyRef.current = false;
      }
      lastRawSteerRef.current = raw;
      setMotionEnabled(true);
      setMotionStatus(motionLiveStatus(source));
      if (step !== "range") return;
      if (!rangeNeutralReadyRef.current) {
        neutralRef.current = raw;
        rangeNeutralReadyRef.current = true;
        setMotionLevel(0);
        return;
      }
      const neutral = neutralRef.current ?? raw;
      neutralRef.current = neutral;
      setMotionLevel(steeringFromTilt(raw, neutral, steeringSensitivity, motionSteeringDirection));
    }, noteMotionDebug);
  }, [motionListenToken, motionSteeringDirection, steeringSensitivity, step]);

  const calibrate = () => {
    if (lastRawSteerRef.current === undefined) {
      setCalibrationLabel("Move phone first");
      window.setTimeout(() => setCalibrationLabel("Calibrate"), 1200);
      return;
    }
    neutralRef.current = lastRawSteerRef.current;
    rangeNeutralReadyRef.current = true;
    writeMotionCalibration({ frame: lastOrientationFrameRef.current, neutral: neutralRef.current, capturedAt: Date.now() });
    setMotionLevel(0);
    setCalibrationLabel("Straight set");
    window.setTimeout(() => setCalibrationLabel("Calibrate"), 1200);
  };

  const markDone = async () => {
    await requestLandscape();
    send({ type: "set_tutorial_done", done: true });
  };

  const startAnyway = async () => {
    await requestLandscape();
    send({ type: "vip_skip_tutorial" });
  };

  if (player?.tutorialDone) {
    return (
      <main className="phone controller-tutorial waiting">
        <div className="tutorial-phone-top">
          <span>{doneCount}/{players.length} done</span>
          <strong>{player.isVIP ? "VIP" : "Ready"}</strong>
        </div>
        <section className="tutorial-phone-panel compact" aria-live="polite">
          <p className="eyebrow lobby-eyebrow">tutorial complete</p>
          <h1>Done. Waiting for the grid.</h1>
          <p>{remainingCount === 0 ? "Starting countdown..." : `${remainingCount} driver${remainingCount === 1 ? "" : "s"} still finishing the tutorial.`}</p>
          {player.isVIP && (
            <button className="secondary danger" type="button" onClick={startAnyway}>
              <Flag size={18} /> Start anyway
            </button>
          )}
        </section>
        <div className="rotate-warning">
          <Smartphone size={42} />
          <strong>Turn your phone sideways</strong>
          <span>Rotate to landscape before the start. The tutorial and race controls work best sideways.</span>
          <button type="button" onClick={() => void requestLandscape()}>Try Lock Landscape</button>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`phone controller-tutorial ${step}`}
      onPointerDownCapture={() => {
        if (step === "range" && !explicitMotionPermission && !motionEnabled && motionDebug.request === "not requested") void requestTutorialMotion();
      }}
    >
      <div className="tutorial-phone-top">
        <span>{doneCount}/{players.length} done</span>
        <strong>{step === "controls" ? "Pedals" : "Steering"}</strong>
      </div>

      <section className="tutorial-phone-panel" aria-live="polite">
        {step === "controls" ? (
          <>
            <p className="eyebrow lobby-eyebrow">touch pedals</p>
            <h1>Slide for variable pedals.</h1>
            <div className="tutorial-control-map" aria-label="Phone control layout">
              <div className="brake">
                <strong>Brake</strong>
                <span>Left side</span>
                <em>slide down</em>
              </div>
              <div className="throttle">
                <strong>Accelerate</strong>
                <span>Right side</span>
                <em>slide up</em>
              </div>
            </div>
            <p className="tutorial-pedal-copy">Right side: slide up for more acceleration. Left side: slide down for more brake. Farther means more, like real pedals.</p>
          </>
        ) : (
          <>
            <p className="eyebrow lobby-eyebrow">tilt steering</p>
            <h1>Use it like a spirit level.</h1>
            <div className="tutorial-range-meter" ref={rangeMeterRef} aria-label="Motion steering level">
              <span ref={rangeMarkerRef} style={{ transform: `translateX(${motionLevel * rangeTravel}px)` }} />
            </div>
            <div className="tutorial-range-labels">
              <span>Left</span>
              <strong>{steeringLevel}/10 sensitivity</strong>
              <span>Right</span>
            </div>
            <p className="tutorial-steering-copy">Tilt the phone like a spirit level: lower the right side to steer right, and lower the left side to steer left.</p>
            <div className="tutorial-calibration-row">
              <button type="button" onClick={calibrate}>{calibrationLabel}</button>
              <p>Steering centers automatically before the race. Use this only if straight feels off.</p>
            </div>
          </>
        )}

        {step === "range" && (
          <div className="tutorial-motion-status">
            <strong>{motionStatus}</strong>
            <button type="button" onClick={() => void requestTutorialMotion()}>
              <Activity size={18} /> {motionButtonLabel}
            </button>
          </div>
        )}
      </section>

      <div className="tutorial-action-bar">
        {player?.isVIP && (
          <button className="secondary danger" type="button" onClick={startAnyway}>
            <Flag size={18} /> Start anyway
          </button>
        )}
        {step === "controls" ? (
          <button className="primary" type="button" onClick={() => setStep("range")}>
            Next: steering <ArrowRight size={18} />
          </button>
        ) : (
          <button className="primary" type="button" onClick={markDone}>
            Done <Flag size={18} />
          </button>
        )}
      </div>
      <div className="rotate-warning">
        <Smartphone size={42} />
        <strong>Turn your phone sideways</strong>
        <span>Rotate to landscape before the start. The tutorial and race controls work best sideways.</span>
        <button type="button" onClick={() => void requestLandscape()}>Try Lock Landscape</button>
      </div>
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

function RearViewModeSelector({ value, send }: { value: RearViewMode; send: ReturnType<typeof useGameSocket>["send"] }) {
  return (
    <section className="cockpit-selector" aria-label="Rear-view mirror">
      <div className="car-selector-head">
        <div>
          <span>Rear-view mirror</span>
          <strong>{rearViewModeLabel(value)}</strong>
        </div>
        <small>Personal</small>
      </div>
      <small className="phone-note">Auto shows it when other cars are active. Off keeps the race HUD cleaner.</small>
      <div className="segmented phone-segmented">
        {(["auto", "on", "off"] as RearViewMode[]).map((mode) => (
          <button type="button" key={mode} className={value === mode ? "active" : undefined} onClick={() => send({ type: "set_rear_view_mode", rearViewMode: mode })}>
            {rearViewModeLabel(mode)}
          </button>
        ))}
      </div>
    </section>
  );
}

function rearViewModeLabel(mode: RearViewMode | undefined) {
  if (mode === "on") return "On";
  if (mode === "off") return "Off";
  return "Auto";
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
          <button type="button" key={style} className={value === style ? "active" : undefined} onClick={() => send({ type: "set_cockpit_style", cockpitStyle: style })}>
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

function playerVehicleLabel(player: Player) {
  const vehicle = getVehicle(player.vehicleId);
  const setup = getVehicleSetup(vehicle.id, player.carSetupId);
  return `${vehicle.shortName} ${setup.shortName}`;
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

function VehicleLoadoutSelector({ vehicleId, setupId, color, equalPace, send }: { vehicleId: VehicleId; setupId: CarSetupId; color: string; equalPace?: boolean; send: ReturnType<typeof useGameSocket>["send"] }) {
  const selectedVehicle = getVehicle(vehicleId);
  const baselineSetup = getVehicleSetup(selectedVehicle.id, setupId);
  const selectedSetup = equalPace ? { ...baselineSetup, stats: { ...baselineSetup.stats, topSpeedKmh: Math.round(180 * baselineSetup.multipliers.maxSpeed) } } : baselineSetup;
  const setups = getVehicleSetups(selectedVehicle.id);
  const hasSetupChoices = setups.length > 1;
  return (
    <section className="car-selector" aria-label="Vehicle and setup">
      <CarSetupPreview vehicle={selectedVehicle} setup={selectedSetup} color={color} />
      <div className="car-selector-head">
        <div>
          <span>Drive class</span>
          <strong>{selectedVehicle.name}</strong>
        </div>
        <small>{selectedSetup.stats.topSpeedKmh} km/h dry top</small>
      </div>
      <small className="phone-note">{equalPace ? "Equal pace is on: a shared 180 km/h base before setup and weather. Each car keeps its steering, weight and character." : selectedVehicle.description}</small>
      <div className="vehicle-grid">
        {VEHICLE_ORDER.map((id) => {
          const vehicle = VEHICLES[id];
          return (
            <button type="button"
              key={vehicle.id}
              className={vehicle.id === selectedVehicle.id ? "vehicle-card active" : "vehicle-card"}
              onClick={() => send({ type: "set_vehicle", vehicleId: vehicle.id })}
            >
              <strong>{vehicle.shortName}</strong>
              <small>{vehicle.setupOrder.length > 1 ? "3 setups" : "Fixed setup"}</small>
            </button>
          );
        })}
      </div>
      <div className="car-selector-head">
        <div>
          <span>{hasSetupChoices ? "Tuning setup" : "Fixed setup"}</span>
          <strong>{selectedSetup.name}</strong>
        </div>
        <small>{selectedSetup.stats.difficulty}/10 difficulty</small>
      </div>
      {!hasSetupChoices && <small className="phone-note">This vehicle has one realistic baseline setup, so there is nothing to tune before the race.</small>}
      {hasSetupChoices && <div className="setup-choices" aria-label="Tuning setup">
        {setups.map(setup => <button type="button" key={setup.id} aria-pressed={setup.id === selectedSetup.id} onClick={() => send({ type: "set_car_setup", carSetupId: setup.id })}>{setup.shortName}</button>)}
      </div>}
      <div className="setup-summary"><small>{selectedSetup.description}</small><SetupStats setup={selectedSetup} /></div>
    </section>
  );
}

function CarSetupPreview({ vehicle, setup, color }: { vehicle: VehicleDefinition; setup: CarSetup; color: string }) {
  return (
    <div className="car-preview">
      <Canvas camera={{ position: vehicle.id === "formula" ? [4.2, 2.7, 6] : [3.2, 2.1, 4.6], fov: 34 }} dpr={[1, 1.5]} shadows={false}>
        <color attach="background" args={["#253338"]} />
        <ambientLight intensity={0.85} />
        <hemisphereLight args={["#e5f4ff", "#63755b", 0.75]} />
        <directionalLight position={[-3, 3, -4]} color="#bce3ed" intensity={1.6} />
        <directionalLight position={[3, 5, 4]} intensity={1.35} />
        <CarPreviewScene vehicleId={vehicle.id} color={color} />
      </Canvas>
      <div className="car-preview-meta">
        <strong>{vehicle.shortName} · {setup.shortName}</strong>
        <span>{setup.stats.topSpeedKmh} km/h top · {setup.stats.grip}/10 grip</span>
      </div>
    </div>
  );
}

function CarPreviewScene({ vehicleId, color }: { vehicleId: VehicleId; color: string }) {
  const car = useMemo<CarState>(() => ({
    playerId: "preview",
    vehicleId,
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
    slip: 0,
    rolloverRisk: 0
  }), [vehicleId]);
  const group = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * 0.38;
  });

  return (
    <group ref={group} position={[0, -0.18, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <circleGeometry args={[2.7, 48]} />
        <meshStandardMaterial color="#465753" roughness={0.82} />
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
      <StatMeter label="Top" value={setup.stats.topSpeedKmh} max={VEHICLE_STAT_TOP_SPEED_MAX_KMH} suffix="km/h" />
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
      <input type="range" min={STEERING_SENSITIVITY_MIN} max={STEERING_SENSITIVITY_MAX} step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}/10</strong>
      <small>Higher reacts to smaller phone tilts. Lower gives a calmer wheel.</small>
    </label>
  );
}

function TrackPicker({
  settings,
  send,
}: {
  settings: RaceSettings;
  send: ReturnType<typeof useGameSocket>["send"];
}) {
  const families = [
    "sakura",
    "alpine",
    "fjord",
    "causeway",
    "cloudline",
  ] as const;
  const track = TRACKS[settings.trackId];
  const familyIndex = families.indexOf(track.sceneryId);
  const familyNames = {
    sakura: "Sakura",
    alpine: "Alpine",
    fjord: "Fjord",
    causeway: "Keys",
    cloudline: "Cloudline",
  };
  const routes = Object.values(TRACKS).filter(
    (route) => route.sceneryId === track.sceneryId,
  );
  const choose = (trackId: TrackId) =>
    send({ type: "vip_set_settings", settings: { trackId } });
  const step = (direction: number) => {
    const family =
      families[(familyIndex + direction + families.length) % families.length];
    const sprint =
      track.finishFraction && track.id !== "passage"
        ? Object.values(TRACKS).find(
            (route) =>
              route.sceneryId === family &&
              route.finishFraction &&
              route.id !== "passage",
          )
        : undefined;
    choose(sprint?.id ?? family);
  };
  return (
    <div className="track-picker">
      <div className="picker">
        <button
          type="button"
          aria-label="Previous track"
          onClick={() => step(-1)}
        >
          <ArrowLeft />
        </button>
        <strong>{familyNames[track.sceneryId]}</strong>
        <button type="button" aria-label="Next track" onClick={() => step(1)}>
          <ArrowRight />
        </button>
      </div>
      {routes.length > 1 && (
        <div
          className="track-route-options"
          role="group"
          aria-label="Route length"
        >
          {routes.map((route) => (
            <button
              type="button"
              key={route.id}
              aria-pressed={route.id === track.id}
              onClick={() => choose(route.id)}
            >
              {!route.finishFraction
                ? "Full circuit"
                : route.id === "passage"
                  ? "Passage"
                  : "Short sprint"}
            </button>
          ))}
        </div>
      )}
      <small className="phone-note">
        {track.name} · {(raceCourseLength(track) / 1000).toFixed(1)} km ·{" "}
        {track.finishFraction ? "One-way run" : "Per lap"}
      </small>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))}>-</button>
      <strong>{value}</strong>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" className={value ? "toggle on" : "toggle"} role="switch" aria-checked={value} onClick={() => onChange(!value)}>
      <span>{label}</span><span className="toggle-state" aria-hidden="true"><strong>{value ? "On" : "Off"}</strong><i className="switch-track"><i /></i></span>
    </button>
  );
}

function RaceController({ send, feedback, crashEvents, nearbyAudioCars, nearbyCrashEvents, countdownMark, room, playerId, steeringLevel }: { send: ReturnType<typeof useGameSocket>["send"]; feedback?: CarState; crashEvents: CrashEvent[]; nearbyAudioCars: NearbyAudioCar[]; nearbyCrashEvents: CrashEvent[]; countdownMark?: number; room: RoomState; playerId: string; steeringLevel: number }) {
  const initialMotionCalibrationRef = useRef(room.phase === "countdown" ? undefined : readMotionCalibration());
  const [pedals, setPedals] = useState({ throttle: 0, brake: 0 });
  const [touchSteer, setTouchSteer] = useState(0);
  const [steerUi, setSteerUi] = useState(0);
  const [calibrationLabel, setCalibrationLabel] = useState("Calibrate");
  const [motionStatus, setMotionStatus] = useState(initialMotionCalibrationRef.current ? "Motion steering" : motionInitialStatus());
  const [motionSamplesLive, setMotionSamplesLive] = useState(false);
  const [hapticStatus, setHapticStatus] = useState(() => hapticShortStatus());
  const [motionListenToken, setMotionListenToken] = useState(0);
  const [motionDebug, setMotionDebug] = useState(motionDebugInitial);
  const reversingRef = useRef(false);
  const [reversing, setReversing] = useState(false);
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
  const nearbyAudioCarsRef = useRef(nearbyAudioCars);
  const nearbyCrashEventsRef = useRef(nearbyCrashEvents);
  const countdownMarkRef = useRef(countdownMark);
  const roomRef = useRef(room);
  const touchSteerRef = useRef(touchSteer);
  const touchSteerOverrideUntilRef = useRef(0);
  const neutralRef = useRef<number | undefined>(initialMotionCalibrationRef.current?.neutral);
  const audioRef = useRef<ControllerAudio | null>(sharedControllerAudio);
  const motionCheckRef = useRef<number | undefined>(undefined);
  const motionRequestInFlightRef = useRef(false);
  const car = feedback ?? room.cars.find((item) => item.playerId === playerId);
  const brakeStart = readStoredNumber("sim-drive-brake-start", 0);
  const throttleStart = readStoredNumber("sim-drive-throttle-start", 0);
  const audioEnabled = readStoredBoolean("sim-drive-audio-enabled", true);
  const hapticsEnabled = readStoredBoolean("sim-drive-haptics-enabled", true);
  const steeringSensitivity = steeringSensitivityFromLevel(steeringLevel);
  const [invertMotionSteering, setInvertMotionSteering] = useStoredBoolean(INVERT_MOTION_STEERING_KEY, false);
  const motionSteeringDirection = invertMotionSteering ? -1 : 1;
  const resetAvailable = Boolean(car?.resetAvailable);
  const explicitMotionPermission = explicitMotionPermissionRequired();

  const noteMotionDebug = (event: MotionDebugEvent) => {
    setMotionDebug((current) => updateMotionDebug(current, event));
    if (event.kind === "event" && (event.source === "orientation-null" || event.source === "motion-empty")) {
      setMotionStatus((current) => current === "Motion ready" || current === "Motion waiting" || current === "Enable tilt steering" ? "Tap Enable Tilt" : current);
    }
  };

  const markRaceMotionAwaitingEvents = () => {
    window.clearTimeout(motionCheckRef.current);
    motionCheckRef.current = window.setTimeout(() => {
      setMotionStatus((current) => current === "Motion ready" ? "Use arrows; tilt not detected" : current);
    }, 1800);
  };

  const applyRaceMotionResult = (motion: Awaited<ReturnType<typeof enableControllerDevice>>) => {
    setMotionStatus(motion.message);
    setMotionSamplesLive(false);
    noteMotionDebug({ kind: "permissions", status: motion.permissions });
    noteMotionDebug({ kind: "request", message: motion.message });
    if (motion.enabled) {
      setMotionListenToken((current) => current + 1);
      markRaceMotionAwaitingEvents();
    }
  };

  const requestRaceMotion = () => {
    if (hasMotionRef.current || motionRequestInFlightRef.current) {
      void requestLandscape();
      return;
    }
    motionRequestInFlightRef.current = true;
    enableControllerDevice()
      .then(applyRaceMotionResult)
      .finally(() => {
        motionRequestInFlightRef.current = false;
      });
  };

  useEffect(() => {
    void requestLandscape();
    return listenToSteeringMotion(({ raw, angle, source }) => {
      window.clearTimeout(motionCheckRef.current);
      hasMotionRef.current = true;
      setMotionSamplesLive(true);
      if (!phoneIsLandscape()) {
        neutralRef.current = undefined;
        neutralCaptureRef.current = undefined;
        steerRef.current = 0;
        setSteerUi(0);
        setMotionStatus("Turn phone sideways");
        return;
      }
      const orientationFrame = motionOrientationFrameKey(angle, source);
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
          setMotionStatus(motionRaceStatus(source));
        }
        return;
      }
      const targetSteer = steeringFromTilt(raw, neutralRef.current, steeringSensitivity, motionSteeringDirection);
      steerRef.current = THREE.MathUtils.lerp(steerRef.current, targetSteer, 0.42);
      if (Math.abs(steerRef.current) < 0.01) steerRef.current = 0;
      setMotionStatus(motionRaceStatus(source));
    }, noteMotionDebug);
  }, [motionListenToken, motionSteeringDirection, steeringSensitivity]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!hasMotionRef.current) {
        setMotionStatus((current) => current === "Motion waiting" ? "Touch steering" : current);
      }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => window.clearTimeout(motionCheckRef.current), []);

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
    nearbyAudioCarsRef.current = nearbyAudioCars;
  }, [nearbyAudioCars]);

  useEffect(() => {
    nearbyCrashEventsRef.current = nearbyCrashEvents;
  }, [nearbyCrashEvents]);

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
      const inactive = activeFeedback && (activeFeedback.finished || activeFeedback.dnf || activeFeedback.crashed);
      const input: InputFrame = { seq: seqRef.current, steer: inactive ? 0 : steer, reverse: !inactive && reversingRef.current, throttle: inactive ? 0 : reversingRef.current ? 1 : activePedals.throttle, brake: inactive ? 0 : reversingRef.current ? 0 : activePedals.brake };
      seqRef.current += 1;
      send({ type: "input_frame", input });
      if (audioEnabled) updateControllerAudio(audioRef.current, activeFeedback, roomRef.current, activePedals, crashEventsRef.current, nearbyAudioCarsRef.current, nearbyCrashEventsRef.current, countdownMarkRef.current);
      driveHaptics(activeFeedback, activePedals, hapticsEnabled, lastHapticAtRef, crashEventsRef.current, lastCrashHapticIdRef);
    }, 33);
    return () => {
      window.clearInterval(timer);
      const controllerAudio = audioRef.current;
      silenceControllerAudio(controllerAudio);
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

  const reverseAvailable = room.phase === "racing" && car && !car.finished && !car.crashed && !car.dnf && ((car.surface === "grass" && car.speed < 3) || reversing);
  const stopReversing = () => { reversingRef.current = false; setReversing(false); };
  useEffect(() => {
    if (car?.crashed || car?.finished || car?.dnf) { reversingRef.current = false; setReversing(false); }
  }, [car?.crashed, car?.finished, car?.dnf]);

  const armControllerDevice = () => {
    if (explicitMotionPermission) return;
    if (audioEnabled) audioRef.current = unlockControllerAudio();
    requestRaceMotion();
  };

  const raceOverForDriver = car && (car.finished || car.dnf || (car.crashed && !room.settings.resetEnabled));
  useEffect(() => {
    if (!raceOverForDriver) return;
    setPedals({ throttle: 0, brake: 0 });
    pedalsRef.current = { throttle: 0, brake: 0 };
    steerRef.current = 0;
    touchSteerRef.current = 0;
    setTouchSteer(0);
    reversingRef.current = false;
  }, [Boolean(raceOverForDriver)]);
  if (raceOverForDriver) return <main className="phone driver-finish">
    <p className="eyebrow">{car.finished ? "Chequered flag" : "Race status"}</p>
    <h1>{car.finished ? "Finished!" : car.crashed ? "Out of this race." : "Race ended."}</h1>
    {car.finishTime !== undefined && <strong>{formatLapTime(car.finishTime)}</strong>}
    <p>{car.finished ? "Nice run. Your display follows the remaining racers." : "Watch the rest of the race on the display."}</p>
    <small>Keep this phone connected. Results will appear when everyone finishes.</small>
  </main>;

  return (
    <main
      className="phone race-controller"
      onPointerDown={armControllerDevice}
      onClick={armControllerDevice}
    >
      {explicitMotionPermission && !motionSamplesLive && (
        <div className="motion-permission-banner" role="status">
          <div>
            <strong>Enable tilt steering</strong>
            <span>This browser needs permission before the phone can steer. Touch arrows still work.</span>
          </div>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              requestRaceMotion();
              if (audioEnabled) audioRef.current = unlockControllerAudio();
            }}
          >
            Enable
          </button>
        </div>
      )}
      <div className="rotate-warning">
        <Smartphone size={42} />
        <strong>Turn your phone sideways</strong>
        <span>Rotate to landscape before the start. Pedals, touch steering, and motion steering work best sideways.</span>
        <button type="button" onClick={() => void requestLandscape()}>Try Lock Landscape</button>
      </div>
      <button type="button" className="calibrate" onClick={calibrate}>{calibrationLabel}</button>
      <div className="telemetry">
        <span>{Math.round(speedToKmh(car?.speed ?? 0))} km/h</span>
        <span>{TRACKS[room.settings.trackId].finishFraction ? "One-way run" : car && !car.timedLapStarted ? "Warm-up" : `Lap ${car?.lap ?? 1}/${room.settings.lapCount}`}</span>
        <button type="button"
          onClick={() => {
            requestRaceMotion();
          }}
        >
          {motionStatus}
        </button>
        <button type="button"
          onClick={() => {
            const result = pulseHaptic(HAPTIC_TEST_PATTERN);
            setHapticStatus(hapticResultMessage(result, "compact"));
          }}
        >
          {hapticStatus}
        </button>
        <button type="button" onClick={() => setInvertMotionSteering(!invertMotionSteering)}>
          {invertMotionSteering ? "Steer inverted" : "Steer normal"}
        </button>
      </div>
      {resetAvailable && (
        <button type="button" className="reset-to-track" onClick={() => send({ type: "request_reset" })}>
          Reset to track
        </button>
      )}
      {room.phase === "countdown" && (
        <ControllerCountdownHints
          motionStatus={motionStatus}
          showSteerHint={!explicitMotionPermission || motionSamplesLive}
        />
      )}
      <PedalZone side="brake" value={pedals.brake} firstTap={brakeStart} onChange={(brake) => setPedals((current) => ({ ...current, brake }))} />
      <PedalZone side="throttle" value={pedals.throttle} firstTap={throttleStart} onChange={(throttle) => setPedals((current) => ({ ...current, throttle }))} />
      {reverseAvailable && <button type="button" className={reversing ? "reverse-control active" : "reverse-control"} aria-label="Hold to reverse" onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); reversingRef.current = true; setReversing(true); }}
        onPointerUp={stopReversing} onPointerCancel={stopReversing} onLostPointerCapture={stopReversing}>
        <strong>R</strong><span>{reversing ? "Reversing" : "Hold to reverse"}</span>
      </button>}
      <div className="steer-touch">
        <button type="button" aria-label="Steer left" onPointerDown={() => setTouchSteering(-1)} onPointerUp={() => setTouchSteering(0)} onPointerCancel={() => setTouchSteering(0)} onPointerLeave={() => setTouchSteering(0)}><ArrowLeft /></button>
        <div className="tilt-meter"><span style={{ transform: `translateX(${(touchSteer || steerUi) * 42}px)` }} /></div>
        <button type="button" aria-label="Steer right" onPointerDown={() => setTouchSteering(1)} onPointerUp={() => setTouchSteering(0)} onPointerCancel={() => setTouchSteering(0)} onPointerLeave={() => setTouchSteering(0)}><ArrowRight /></button>
      </div>
    </main>
  );
}

function ControllerCountdownHints({ motionStatus, showSteerHint = true }: { motionStatus: string; showSteerHint?: boolean }) {
  const steerHint = motionStatus === "Turn phone sideways"
    ? "Turn phone sideways"
    : motionStatus === "Hold steady, centering :D"
      ? "Hold steady, centering :D"
      : "Hold straight to center";
  return (
    <div className="controller-hints" aria-live="polite">
      <span className="hint brake-hint">Brake: slide down</span>
      <span className="hint throttle-hint">Throttle: slide up</span>
      {showSteerHint && <span className="hint steer-hint">{steerHint}</span>}
    </div>
  );
}

function MotionDebugDetails({ debug }: { debug: MotionDebugState }) {
  return (
    <details className="motion-debug">
      <summary>things for nerds</summary>
      <code>{formatMotionDebug(debug)}</code>
    </details>
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
const REAR_VIEW_CAR_LIMIT = 7;
const REAR_VIEW_FORWARD_MARGIN = 36;
const REAR_VIEW_MAX_DISTANCE: Record<RaceRenderQuality, number> = {
  full: 300,
  split: 220
};

function RaceCanvas({ room, focusPlayerId, paneCount, replay = false, cameraMotion }: { room: RoomState; focusPlayerId: string; paneCount: number; replay?: boolean; cameraMotion?: boolean }) {
  const quality: RaceRenderQuality = paneCount > 1 ? "split" : "full";
  const [dpr, selectDpr] = useRaceDpr(quality === "split");
  return (
    <Canvas
      shadows={quality === "full"}
      dpr={dpr}
      gl={{ antialias: quality === "full", powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
      camera={{ fov: replay ? 54 : 76, near: 0.1, far: 1500 }}
    >
      <fog attach="fog" args={[racePalette(room.settings.trackId, room.settings.rain).fog, room.settings.rain ? 55 : 130, room.settings.rain ? 290 : 650]} />
      <AdaptiveResolution split={quality === "split"} dpr={dpr} onChange={selectDpr} />
      <MotorsportSky trackId={room.settings.trackId} rain={room.settings.rain} wetness={room.settings.wetness} />
      <MotorsportLight trackId={room.settings.trackId} rain={room.settings.rain} wetness={room.settings.wetness} shadows={quality === "full"} />
      <RaceScene room={room} focusPlayerId={focusPlayerId} quality={quality} replay={replay} cameraMotion={cameraMotion} />
    </Canvas>
  );
}

function RaceRearView({ room, focusPlayerId, paneCount, cameraMotion }: { room: RoomState; focusPlayerId: string; paneCount: number; cameraMotion?: boolean }) {
  if (!room.cars.some((car) => car.playerId === focusPlayerId)) return null;
  const quality: RaceRenderQuality = paneCount > 1 ? "split" : "full";
  return (
    <div className="race-rear-view" aria-hidden="true">
      <Canvas
        shadows={false}
        dpr={quality === "split" ? 0.75 : 0.9}
        gl={{ antialias: false, powerPreference: "high-performance" }}
        camera={{ fov: 32, near: 0.1, far: quality === "split" ? 220 : 300 }}
      >
        <fog attach="fog" args={[racePalette(room.settings.trackId, room.settings.rain).fog, room.settings.rain ? 28 : 58, room.settings.rain ? 180 : 280]} />
        <MotorsportSky trackId={room.settings.trackId} rain={room.settings.rain} wetness={room.settings.wetness} />
        <ambientLight intensity={0.65} />
        <hemisphereLight args={["#dcebf1", "#657457", 0.8]} />
        <directionalLight position={[-38, 55, -32]} color={racePalette(room.settings.trackId, room.settings.rain).sun} intensity={room.settings.rain ? 0.9 : 2} />
        <RaceRearViewScene room={room} focusPlayerId={focusPlayerId} quality={quality} cameraMotion={cameraMotion} />
      </Canvas>
    </div>
  );
}

function RaceRearViewScene({ room, focusPlayerId, quality, cameraMotion }: { room: RoomState; focusPlayerId: string; quality: RaceRenderQuality; cameraMotion?: boolean }) {
  const { camera } = useThree();
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const track = TRACKS[room.settings.trackId];
  const sceneryTrack = routeScenery(track);
  const focus = room.cars.find((car) => car.playerId === focusPlayerId);
  const cars = useMemo(() => focus ? rearViewCars(room.cars, focus, quality) : [], [focus, quality, room.cars]);
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

    const amount = smoothingAmount(delta, RACE_FOCUS_SMOOTHING_RESPONSE);
    smoothFocus.current.x = THREE.MathUtils.lerp(smoothFocus.current.x, focus.x, amount);
    smoothFocus.current.y = THREE.MathUtils.lerp(smoothFocus.current.y, focus.y, amount);
    smoothFocus.current.z = THREE.MathUtils.lerp(smoothFocus.current.z, focus.z, amount);
    smoothFocus.current.heading = lerpAngle(smoothFocus.current.heading, focus.heading, amount);
    smoothFocus.current.surface = focus.surface;
    smoothFocus.current.impact = THREE.MathUtils.lerp(smoothFocus.current.impact, focus.impact, amount);
    smoothFocus.current.slip = THREE.MathUtils.lerp(smoothFocus.current.slip, focus.slip, amount);

    const profile = rearViewCameraProfile(focus.vehicleId);
    const renderFocus = smoothFocus.current;
    const forwardX = Math.sin(renderFocus.heading);
    const forwardZ = Math.cos(renderFocus.heading);
    const motionEnabled = (cameraMotion ?? true) && !reducedMotion.matches;
    const shake = motionEnabled ? (renderFocus.surface === "curb" ? 0.025 : 0) + renderFocus.impact * 0.055 + renderFocus.slip * 0.012 : 0;

    camera.position.set(
      renderFocus.x + forwardX * profile.forwardOffset,
      renderFocus.y + profile.height + Math.sin(performance.now() / 48) * shake,
      renderFocus.z + forwardZ * profile.forwardOffset
    );
    camera.lookAt(
      renderFocus.x - forwardX * profile.lookBack,
      renderFocus.y + profile.lookHeight,
      renderFocus.z - forwardZ * profile.lookBack
    );
  });

  return (
    <>
      <TrackMesh track={sceneryTrack} rain={room.settings.rain} wetness={room.settings.wetness} detail="mirror" />
      <TrackProps track={sceneryTrack} rain={room.settings.rain} detail="mirror" />
      {cars.map((car) => {
        const player = room.players.find((item) => item.id === car.playerId);
        const color = player?.color ?? "#ff3b5c";
        return (
          <group key={car.playerId}>
            <CarEffects car={car} rain={room.settings.rain} color={color} />
            <CarModel car={car} color={color} />
          </group>
        );
      })}
      {track.finishFraction && <JourneyFinish track={track} />}
      <CrashExplosions events={room.crashEvents} track={track} />
    </>
  );
}

function rearViewCars(cars: CarState[], focus: CarState, quality: RaceRenderQuality) {
  const forwardX = Math.sin(focus.heading);
  const forwardZ = Math.cos(focus.heading);
  const maxDistance = REAR_VIEW_MAX_DISTANCE[quality];
  const visibleCars: Array<{ car: CarState; distance: number }> = [];
  for (const car of cars) {
    if (car.playerId === focus.playerId || car.dnf) continue;
    const dx = car.x - focus.x;
    const dz = car.z - focus.z;
    const distance = Math.hypot(dx, dz);
    const forwardDistance = dx * forwardX + dz * forwardZ;
    if (distance > maxDistance || forwardDistance > REAR_VIEW_FORWARD_MARGIN) continue;
    visibleCars.push({ car, distance });
  }
  visibleCars.sort((a, b) => a.distance - b.distance);
  return visibleCars.slice(0, REAR_VIEW_CAR_LIMIT).map((item) => item.car);
}

function rearViewCameraProfile(vehicleId: VehicleId) {
  if (vehicleId === "kart") {
    return { height: 0.92, forwardOffset: 0.78, lookBack: 28, lookHeight: 0.66 };
  }
  if (vehicleId === "stockTruck") {
    return { height: 1.72, forwardOffset: 0.9, lookBack: 34, lookHeight: 1.22 };
  }
  if (vehicleId === "tukTuk") {
    return { height: 1.42, forwardOffset: 0.78, lookBack: 28, lookHeight: 0.98 };
  }
  return { height: 1.28, forwardOffset: 0.7, lookBack: 34, lookHeight: 0.86 };
}

function RaceScene({ room, focusPlayerId, quality, replay = false, cameraMotion }: { room: RoomState; focusPlayerId: string; quality: RaceRenderQuality; replay?: boolean; cameraMotion?: boolean }) {
  const { camera } = useThree();
  const reducedMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const track = TRACKS[room.settings.trackId];
  const sceneryTrack = routeScenery(track);
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
    const amount = smoothingAmount(delta, RACE_FOCUS_SMOOTHING_RESPONSE);
    smoothFocus.current.x = THREE.MathUtils.lerp(smoothFocus.current.x, focus.x, amount);
    smoothFocus.current.y = THREE.MathUtils.lerp(smoothFocus.current.y, focus.y, amount);
    smoothFocus.current.z = THREE.MathUtils.lerp(smoothFocus.current.z, focus.z, amount);
    smoothFocus.current.heading = lerpAngle(smoothFocus.current.heading, focus.heading, amount);
    smoothFocus.current.surface = focus.surface;
    smoothFocus.current.impact = THREE.MathUtils.lerp(smoothFocus.current.impact, focus.impact, amount);
    smoothFocus.current.slip = THREE.MathUtils.lerp(smoothFocus.current.slip, focus.slip, amount);

    const renderFocus = smoothFocus.current;
    const cameraProfile = getVehicle(focus.vehicleId).camera;
    if (replay) {
      camera.position.set(renderFocus.x - Math.sin(renderFocus.heading) * 9 + Math.cos(renderFocus.heading) * 5, renderFocus.y + 4.6, renderFocus.z - Math.cos(renderFocus.heading) * 9 - Math.sin(renderFocus.heading) * 5);
      camera.lookAt(renderFocus.x, renderFocus.y + 0.5, renderFocus.z);
      return;
    }
    const motionEnabled = (cameraMotion ?? room.players.find(p => p.id === focusPlayerId)?.cameraMotion ?? true) && !reducedMotion.matches;
    const shake = motionEnabled ? (renderFocus.surface === "curb" ? 0.05 : 0) + renderFocus.impact * 0.12 + renderFocus.slip * 0.025 : 0;
    camera.position.set(
      renderFocus.x - Math.sin(renderFocus.heading) * cameraProfile.back + Math.sin(renderFocus.heading + Math.PI / 2) * cameraProfile.lateral,
      renderFocus.y + cameraProfile.height + Math.sin(performance.now() / 35) * shake,
      renderFocus.z - Math.cos(renderFocus.heading) * cameraProfile.back
    );
    const gradeLook = cameraRoadLook(track, focus, cameraProfile.lookAhead);
    camera.lookAt(renderFocus.x + Math.sin(renderFocus.heading) * cameraProfile.lookAhead, renderFocus.y + cameraProfile.lookHeight + gradeLook + (motionEnabled ? (focus.longitudinalLoad ?? 0) * 0.12 : 0), renderFocus.z + Math.cos(renderFocus.heading) * cameraProfile.lookAhead);
    if (motionEnabled) camera.rotateZ(-(focus.lateralLoad ?? 0) * 0.012);
  });

  return (
    <>
      <TrackMesh track={sceneryTrack} rain={room.settings.rain} wetness={room.settings.wetness} />
      <TrackProps track={sceneryTrack} rain={room.settings.rain} />
      <RoadsideGrass track={sceneryTrack} rain={room.settings.rain} />
      <DynamicSkidMarks cars={room.cars} rain={room.settings.rain} quality={quality} track={track} />
      {(room.settings.wetness ?? (room.settings.rain ? 1 : 0)) > 0.1 && focus && <RainStreaks focus={focus} wetness={room.settings.wetness} count={quality === "split" ? 90 : 240} />}
      {!room.settings.rain && track.id === "sakura" && focus && <SakuraPetals focus={focus} count={quality === "split" ? 24 : 60} />}
      <CarGroundShadows cars={room.cars} />
      {focus && room.players.find(p => p.id === focusPlayerId)?.practiceGhost && <PersonalGhost car={focus} track={track} settings={room.settings} raceStartedAt={room.raceStartedAt} now={currentServerTimeMs} identity={`${room.players.find(p => p.id === focusPlayerId)?.name}:${room.players.find(p => p.id === focusPlayerId)?.color}`} />}
      {room.cars.map((car) => {
        const player = room.players.find((item) => item.id === car.playerId);
        const color = player?.color ?? "#ff3b5c";
        return (
          <group key={car.playerId}>
            <CarEffects car={car} rain={room.settings.rain} color={color} />
            <CarModel car={car} color={color} dimmed={!replay && car.playerId === focusPlayerId} translucent={room.settings.ghostMode && car.playerId !== focusPlayerId && Boolean(focus && Math.hypot(car.x - focus.x, car.z - focus.z, car.y - focus.y) < 7)} />
          </group>
        );
      })}
      {track.finishFraction && <JourneyFinish track={track} />}
      <CrashExplosions events={room.crashEvents} track={track} />
      {focus && !replay && (
        <CockpitMotion.Provider value={cameraMotion !== false}>
          <Cockpit
            car={focus}
            color={room.players.find((item) => item.id === focusPlayerId)?.color ?? "#ff3b5c"}
            cockpitStyle={room.players.find((item) => item.id === focusPlayerId)?.cockpitStyle ?? "hands"}
          />
        </CockpitMotion.Provider>
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
  vehicleId: DEFAULT_VEHICLE_ID,
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
  slip: 0.12,
  rolloverRisk: 0
};

function devAssetCar(vehicleId: VehicleId, setupId = getVehicle(vehicleId).defaultSetupId): CarState {
  return { ...DEV_ASSET_CAR, vehicleId, carSetupId: setupId };
}

const DEV_ASSETS: DevAsset[] = [
  { group: "Generic Track", name: "TrackStartGantryModel", note: "Start grid, gantry, lights", pivot: [0, 0, -1.3], zoom: 1.28, render: () => <TrackStartGantryModel track={TRACKS.sakura} /> },
  { group: "Generic Track", name: "RoadsideBoardModel", note: "The pale blank boards seen along routes", render: (rain) => <RoadsideBoardModel rain={rain} /> },
  { group: "Generic Track", name: "BrakingBoardModel", note: "Striped braking marker", render: () => <BrakingBoardModel /> },
  { group: "Generic Track", name: "TrackBarrierModel", note: "Low roadside barrier", render: (rain) => <TrackBarrierModel rain={rain} /> },
  { group: "Generic Track", name: "SponsorBoardModel", note: "#[oss]vibejam sponsor board", render: (rain) => <SponsorBoardModel rain={rain} /> },
  { group: "Sakura", name: "SakuraToriiGate", render: (rain) => <SakuraToriiGateModel track={TRACKS.sakura} rain={rain} /> },
  { group: "Sakura", name: "SakuraBlossomTunnel", render: (rain) => <SakuraBlossomTunnelPreview rain={rain} /> },
  { group: "Sakura", name: "SakuraTunnelTree", render: (rain) => <SakuraTunnelTree position={[0, 0, 0]} side={1} heading={0} seed={220} rain={rain} /> },
  { group: "Sakura", name: "SakuraFeatureGrove", render: (rain) => <SakuraFeatureGrovePreview rain={rain} /> },
  { group: "Sakura", name: "SakuraGroundAccents", render: (rain) => <SakuraGroundAccentsPreview rain={rain} /> },
  { group: "Sakura", name: "SakuraTree", render: (rain) => <SakuraTree position={[0, 0, 0]} seed={5} rain={rain} /> },
  { group: "Sakura", name: "SakuraLantern", render: (rain) => <SakuraLantern position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Sakura", name: "SakuraBanner", render: (rain) => <SakuraBanner position={[0, 1.24, 0]} heading={0} rain={rain} /> },
  { group: "Alpine", name: "AlpineNearPeak", zoom: 1.22, render: (rain) => <AlpineNearPeak rain={rain} /> },
  { group: "Alpine", name: "AlpineBackdropPeak tall massif", render: (rain) => <AlpineBackdropPeak mountain={{ x: 0, z: 0, h: 28, r: 22 }} seed={3} rain={rain} /> },
  { group: "Alpine", name: "AlpineBackdropPeak ridge massif", render: (rain) => <AlpineBackdropPeak mountain={{ x: 0, z: 0, h: 26, r: 22 }} seed={4} rain={rain} /> },
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
  { group: "Causeway", name: "CausewayBridgeRail", render: (rain) => <CausewayBridgeRail position={[0, 0, 0]} heading={0} length={12} rain={rain} /> },
  { group: "Causeway", name: "CausewayOldBridgeSegment", render: (rain) => <CausewayOldBridgeSegment position={[0, 0, 0]} heading={0} length={13} rain={rain} /> },
  { group: "Causeway", name: "CausewayPalm", render: (rain) => <CausewayPalm position={[0, 0, 0]} heading={0} seed={5} rain={rain} /> },
  { group: "Causeway", name: "CausewayMangrove", render: (rain) => <CausewayMangrove position={[0, 0, 0]} seed={7} rain={rain} /> },
  { group: "Causeway", name: "CausewayLighthouse", zoom: 1.2, render: (rain) => <CausewayLighthouse position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Causeway", name: "CausewayMarina", zoom: 1.16, render: (rain) => <CausewayMarina position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Causeway", name: "CausewayBoat", render: (rain) => <CausewayBoat position={[0, 0, 0]} heading={0} seed={2} rain={rain} /> },
  { group: "Causeway", name: "CausewayBuoy", render: (rain) => <CausewayBuoy position={[0, 0, 0]} seed={2} rain={rain} /> },
  { group: "Cloudline", name: "CloudlineSummit", zoom: 1.24, render: (rain) => <CloudlineSummit position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Cloudline", name: "CloudlineSnowPoles", render: (rain) => <CloudlineSnowPoles position={[0, 0, 0]} heading={0} seed={2} rain={rain} /> },
  { group: "Cloudline", name: "CloudlineCliffBreak", render: (rain) => <CloudlineCliffBreak position={[0, 0, 0]} heading={0} seed={3} rain={rain} /> },
  { group: "Cloudline", name: "CloudlineSummitPoles", render: (rain) => <CloudlineSummitPoles position={[0, 0, 0]} heading={0} rain={rain} /> },
  { group: "Cloudline", name: "CloudWisps", render: (rain) => <CloudWispsPreview rain={rain} /> },
  { group: "Cloudline", name: "CloudlineBackdrop", zoom: 1.08, render: (rain) => <CloudlineBackdropPreview rain={rain} /> },
  { group: "Vehicle", name: "Formula Prototype", note: "Formula visual with balanced, high grip, and high speed setups", render: () => <CarModel car={devAssetCar("formula")} color="#ff8f3d" /> },
  { group: "Vehicle", name: "KZ Kart", note: "Single fixed sprint setup", render: () => <CarModel car={devAssetCar("kart")} color="#35a7ff" /> },
  { group: "Vehicle", name: "Stock Truck", note: "Truck visual with balanced, high grip, and high speed setups", render: () => <CarModel car={devAssetCar("stockTruck")} color="#16c784" /> },
  { group: "Vehicle", name: "Tuk-Tuk", note: "Single fixed stock setup with rollover-prone physics", render: () => <CarModel car={devAssetCar("tukTuk")} color="#ffd166" /> },
  { group: "Vehicle", name: "Vehicle Colour Lineup", note: "Every controller colour available on every vehicle class", zoom: 1.22, render: () => <VehicleColourLineup /> },
  { group: "Cockpit", name: "Cockpit none", render: () => <Cockpit car={DEV_ASSET_CAR} color="#ff8f3d" cockpitStyle="none" /> },
  { group: "Cockpit", name: "Cockpit hands", render: () => <Cockpit car={DEV_ASSET_CAR} color="#ff8f3d" cockpitStyle="hands" /> },
  { group: "Cockpit", name: "Cockpit paws", render: () => <Cockpit car={DEV_ASSET_CAR} color="#ff8f3d" cockpitStyle="paws" /> },
  { group: "Cockpit", name: "Kart cockpit hands", render: () => <Cockpit car={devAssetCar("kart")} color="#35a7ff" cockpitStyle="hands" /> },
  { group: "Cockpit", name: "Kart cockpit paws", render: () => <Cockpit car={devAssetCar("kart")} color="#35a7ff" cockpitStyle="paws" /> },
  { group: "Cockpit", name: "Stock Truck cockpit hands", render: () => <Cockpit car={devAssetCar("stockTruck")} color="#16c784" cockpitStyle="hands" /> },
  { group: "Cockpit", name: "Stock Truck cockpit paws", render: () => <Cockpit car={devAssetCar("stockTruck")} color="#16c784" cockpitStyle="paws" /> },
  { group: "Cockpit", name: "Tuk-Tuk cockpit hands", render: () => <Cockpit car={devAssetCar("tukTuk")} color="#ffd166" cockpitStyle="hands" /> },
  { group: "Cockpit", name: "Tuk-Tuk cockpit paws", render: () => <Cockpit car={devAssetCar("tukTuk")} color="#ffd166" cockpitStyle="paws" /> },
  { group: "Driver", name: "Hands on wheel", render: () => <DriverWheelPreview cockpitStyle="hands" /> },
  { group: "Driver", name: "Paws on wheel", render: () => <DriverWheelPreview cockpitStyle="paws" /> }
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
  const assetPointers = useMemo(() => new Map<number, DevAssetPoint>(), []);
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
    assetPointers.clear();
    assetDragRef.current = undefined;
    assetPinchRef.current = undefined;
    setIsAssetPanning(false);
  }, [assetPointers]);
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
    const pointers = assetPointers;
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
  }, [assetPointers, assetZoomEnabled]);

  const handleAssetPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!assetZoomEnabled || !assetPointers.has(event.pointerId)) return;
    const { point, size } = devAssetPointerPoint(event, event.currentTarget);
    const pointers = assetPointers;
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
  }, [assetPointers, assetZoomEnabled]);

  const handleAssetPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!assetZoomEnabled) return;
    assetPointers.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Browsers may already release touch captures on gesture cancellation.
    }

    const pointers = assetPointers;
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
  }, [assetPointers, assetZoomEnabled]);

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
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return prefersDark;
}

function useIsPhoneDisplay() {
  const [isPhoneDisplay, setIsPhoneDisplay] = useState(() => isLikelyPhoneDisplay());

  useEffect(() => {
    const queries = [
      window.matchMedia?.("(pointer: coarse)"),
      window.matchMedia?.("(max-width: 820px)")
    ].filter(Boolean) as MediaQueryList[];
    const update = () => setIsPhoneDisplay(isLikelyPhoneDisplay());
    window.addEventListener("resize", update);
    for (const query of queries) query.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      for (const query of queries) query.removeEventListener?.("change", update);
    };
  }, []);

  return isPhoneDisplay;
}

function isLikelyPhoneDisplay() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent;
  const phoneUserAgent = /Mobi|iPhone|iPod/i.test(userAgent) || (/Android/i.test(userAgent) && !/Tablet/i.test(userAgent));
  const coarseSmallScreen = (window.matchMedia?.("(pointer: coarse)").matches ?? false)
    && (window.matchMedia?.("(max-width: 820px)").matches ?? window.innerWidth <= 820);
  return phoneUserAgent || coarseSmallScreen;
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
      const viewDirection = new THREE.Vector3(target.x - position.x, target.y - position.y, target.z - position.z).normalize();
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
    content.position.x -= pivot.x;
    content.position.y -= pivot.y;
    content.position.z -= pivot.z;
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

  const selectAssetFromScene = useCallback((event: ThreeEvent<MouseEvent>) => {
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
    <group position={position} onClick={selectAssetFromScene} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
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

const TrackMesh = memo(function TrackMesh({ track, rain, wetness, detail = "full" }: { track: TrackDef; rain: boolean; wetness?: number; detail?: "full" | "mirror" }) {
  const mirrorDetail = detail === "mirror";
  const bounds = useMemo(() => getTrackBounds(track), [track]);
  const elevatedTrack = track.id === "fjord" || track.id === "cloudline";
  const coastalTrack = track.id === "causeway";
  const terrainBaseY = elevatedTrack ? bounds.minY - (track.id === "cloudline" ? 1.15 : 0.9) : bounds.minY - 0.55;
  const groundWidth = bounds.maxX - bounds.minX + 360;
  const groundDepth = bounds.maxZ - bounds.minZ + 360;
  const groundX = (bounds.minX + bounds.maxX) / 2;
  const groundZ = (bounds.minZ + bounds.maxZ) / 2;
  const groundColor = coastalTrack
    ? (rain ? "#456d78" : "#51abc1")
    : (rain ? "#3e4d45" : "#5a7e48");
  const elevatedTerrainGeometry = useMemo(() => {
    if (!elevatedTrack || mirrorDetail) return undefined;
    const geometry = createElevatedTrackTerrainGeometry(track, terrainBaseY);
    return track.id === "cloudline" ? colorMountainGround(geometry, track) : geometry;
  }, [elevatedTrack, mirrorDetail, terrainBaseY, track]);
  const elevatedTerrainColor = track.id === "cloudline"
    ? (rain ? "#7e8988" : "#b9c5bd")
    : (rain ? "#3d594d" : "#66855a");
  const shoulderGeometry = useMemo(() => {
    const shoulderWidth = track.width + (track.curbWidth + track.wallMargin) * 2 + (coastalTrack ? 24 : elevatedTrack ? 26 : 34);
    const geometry = createTrackRibbonGeometry(track, shoulderWidth, 0, -0.09, track.id === "cloudline" ? 6.5 : 4.2);
    return track.id === "cloudline" ? colorMountainGround(geometry, track) : geometry;
  }, [coastalTrack, elevatedTrack, track]);
  const shoulderColor = track.id === "cloudline"
    ? (rain ? "#8d9998" : "#d0d8d3")
    : track.id === "causeway"
      ? (rain ? "#929486" : "#cfc6a1")
    : track.id === "fjord"
      ? (rain ? "#455f55" : "#6f8a5f")
      : (rain ? "#43564b" : "#638650");
  const runoffColor = track.id === "causeway"
    ? (rain ? "#8b9083" : "#c7ba8c")
    : (rain ? "#46524d" : "#6f8c58");
  const curbStripeGeometries = useMemo(() => mirrorDetail ? undefined : createCurbStripeGeometries(track, 4.6), [mirrorDetail, track]);
  const roadGeometry = useMemo(() => createTrackRibbonGeometry(track, track.width, 0, 0.035, 2.7), [track]);
  const runoffGeometry = useMemo(() => {
    const geometry = createTrackRibbonGeometry(track, track.width + (track.curbWidth + track.wallMargin) * 2, 0, -0.01, 2.7);
    return track.id === "cloudline" ? colorMountainGround(geometry, track, true) : geometry;
  }, [track]);
  const leftCurbGeometry = useMemo(() => createTrackRibbonGeometry(track, track.curbWidth, -track.width / 2 - track.curbWidth / 2, 0.055, 2.7), [track]);
  const rightCurbGeometry = useMemo(() => createTrackRibbonGeometry(track, track.curbWidth, track.width / 2 + track.curbWidth / 2, 0.055, 2.7), [track]);
  const leftCurbInnerEdge = useMemo(() => createTrackRibbonGeometry(track, 0.16, -track.width / 2 - 0.08, 0.102, 2.7), [track]);
  const leftCurbOuterEdge = useMemo(() => createTrackRibbonGeometry(track, 0.16, -track.width / 2 - track.curbWidth + 0.08, 0.101, 2.7), [track]);
  const rightCurbInnerEdge = useMemo(() => createTrackRibbonGeometry(track, 0.16, track.width / 2 + 0.08, 0.102, 2.7), [track]);
  const rightCurbOuterEdge = useMemo(() => createTrackRibbonGeometry(track, 0.16, track.width / 2 + track.curbWidth - 0.08, 0.101, 2.7), [track]);
  const leftLineGeometry = useMemo(() => createTrackRibbonGeometry(track, 0.13, -track.width / 2 + 0.18, 0.075, 2.7), [track]);
  const rightLineGeometry = useMemo(() => createTrackRibbonGeometry(track, 0.13, track.width / 2 - 0.18, 0.075, 2.7), [track]);
  const racingLineGeometry = useMemo(() => mirrorDetail ? undefined : createTrackRibbonGeometry(track, 1.35, 0, 0.078, 2.7), [mirrorDetail, track]);
  const rubberLeftGeometry = useMemo(() => mirrorDetail ? undefined : createTrackRibbonGeometry(track, 0.28, -0.48, 0.081, 2.7), [mirrorDetail, track]);
  const rubberRightGeometry = useMemo(() => mirrorDetail ? undefined : createTrackRibbonGeometry(track, 0.28, 0.48, 0.081, 2.7), [mirrorDetail, track]);
  useEffect(() => () => {
    for (const geometry of [elevatedTerrainGeometry, shoulderGeometry, roadGeometry, runoffGeometry,
      leftCurbGeometry, rightCurbGeometry, leftCurbInnerEdge, leftCurbOuterEdge,
      rightCurbInnerEdge, rightCurbOuterEdge, leftLineGeometry, rightLineGeometry,
      racingLineGeometry, rubberLeftGeometry, rubberRightGeometry,
      curbStripeGeometries?.white, curbStripeGeometries?.red]) geometry?.dispose();
  }, [elevatedTerrainGeometry, shoulderGeometry, roadGeometry, runoffGeometry,
    leftCurbGeometry, rightCurbGeometry, leftCurbInnerEdge, leftCurbOuterEdge,
    rightCurbInnerEdge, rightCurbOuterEdge, leftLineGeometry, rightLineGeometry,
    racingLineGeometry, rubberLeftGeometry, rubberRightGeometry, curbStripeGeometries]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[groundX, coastalTrack ? COAST_SEA_LEVEL - .12 : terrainBaseY - 0.08, groundZ]} receiveShadow>
        <planeGeometry args={[groundWidth, groundDepth]} />
        <LandscapeMaterial color={groundColor} />
      </mesh>
      {elevatedTerrainGeometry && (
        <mesh geometry={elevatedTerrainGeometry} receiveShadow>
          <meshStandardMaterial color={track.id === "cloudline" ? rain ? "#b5c5c0" : "#ffffff" : elevatedTerrainColor} vertexColors={track.id === "cloudline"} roughness={0.98} side={THREE.DoubleSide} />
        </mesh>
      )}
      {coastalTrack && <Coastline track={track} rain={rain} mirror={mirrorDetail} />}
      {!coastalTrack && <mesh geometry={shoulderGeometry} receiveShadow>
        <LandscapeMaterial color={track.id === "cloudline" ? rain ? "#b5c5c0" : "#ffffff" : shoulderColor} vertexColors={track.id === "cloudline"} />
      </mesh>}
      {!mirrorDetail && <TrackTerrain track={track} rain={rain} />}
      {!coastalTrack && <mesh geometry={runoffGeometry} receiveShadow>
        <LandscapeMaterial color={track.id === "cloudline" ? rain ? "#b5c5c0" : "#ffffff" : runoffColor} vertexColors={track.id === "cloudline"} />
      </mesh>}
      <mesh geometry={roadGeometry} receiveShadow>
        <AsphaltMaterial rain={rain} wetness={wetness} />
      </mesh>
      {racingLineGeometry && (
        <mesh geometry={racingLineGeometry}>
          <meshBasicMaterial color={rain ? "#11191c" : "#17181a"} transparent opacity={rain ? 0.28 : 0.18} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {rubberLeftGeometry && (
        <mesh geometry={rubberLeftGeometry}>
          <meshBasicMaterial color="#07090b" transparent opacity={rain ? 0.1 : 0.16} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {rubberRightGeometry && (
        <mesh geometry={rubberRightGeometry}>
          <meshBasicMaterial color="#07090b" transparent opacity={rain ? 0.1 : 0.16} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      {!mirrorDetail && <AsphaltDetails track={track} rain={rain} />}
      {rain && !mirrorDetail && <RainPuddles track={track} />}
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
      {curbStripeGeometries && (
        <>
          <mesh geometry={curbStripeGeometries.white}>
            <meshStandardMaterial color="#e8e1d1" roughness={0.58} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={curbStripeGeometries.red}>
            <meshStandardMaterial color="#b02b35" roughness={0.58} side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
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
  const samples = useMemo(() => sampleTrackVisuals(track, track.id === "cloudline" ? 220 : track.id === "fjord" ? 90 : track.id === "causeway" ? 120 : track.id === "alpine" ? 36 : 26), [track]);
  if (track.id === "causeway") {
    return <CausewayGroundAccents track={track} rain={rain} />;
  }
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
  const puddles = useMemo(() => sampleTrackVisuals(track, track.id === "cloudline" ? 140 : track.id === "fjord" || track.id === "causeway" ? 70 : 18).filter((_, index) => index % 3 === 0), [track]);
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
    const samples = sampleTrackVisuals(track, track.id === "cloudline" ? 42 : track.id === "fjord" || track.id === "causeway" ? 18 : 5.2);
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

    const curveSamples = sampleTrackVisuals(track, track.id === "cloudline" ? 70 : track.id === "fjord" || track.id === "causeway" ? 28 : 8.5);
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
    <group scale={[1.7, 1.7, 1.25]}>
      <mesh castShadow>
        <boxGeometry args={[1.9, 1.16, 0.12]} />
        <meshStandardMaterial color={rain ? "#c8d2d7" : "#f2efe4"} roughness={0.7} />
      </mesh>
      {[-1, 1].map((face) => (
        <group key={face}>
          <mesh position={[0, 0, face * 0.071]} rotation={[0, face < 0 ? Math.PI : 0, 0]}>
            <planeGeometry args={[1.72, 0.86]} />
            <meshBasicMaterial map={texture} toneMapped={false} transparent />
          </mesh>
          <mesh position={[0, 0.47, face * 0.073]}>
            <boxGeometry args={[1.68, 0.035, 0.018]} />
            <meshStandardMaterial color="#35a7ff" roughness={0.42} />
          </mesh>
          <mesh position={[0, -0.47, face * 0.073]}>
            <boxGeometry args={[1.68, 0.035, 0.018]} />
            <meshStandardMaterial color="#e84f5f" roughness={0.42} />
          </mesh>
        </group>
      ))}
      {[-0.52, 0.52].map((x) => (
        <mesh key={x} position={[x, -0.82, 0]}>
          <boxGeometry args={[0.1, 1.18, 0.1]} />
          <meshStandardMaterial color="#22262c" roughness={0.5} />
        </mesh>
      ))}
    </group>
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
      {[-1, 1].flatMap((face) => [0, 1, 2].map((stripe) => (
        <mesh key={`${face}-${stripe}`} position={[-0.28 + stripe * 0.28, 0.0, face * 0.06]}>
          <boxGeometry args={[0.11, 0.78 - stripe * 0.18, 0.025]} />
          <meshStandardMaterial color={stripe === 0 ? "#e84f5f" : "#101214"} roughness={0.5} />
        </mesh>
      )))}
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
      {[-1, 1].map((face) => (
        <mesh key={face} position={[0, 0.18, face * 0.13]}>
          <boxGeometry args={[2.1, 0.08, 0.04]} />
          <meshStandardMaterial color={accent} roughness={0.5} />
        </mesh>
      ))}
    </>
  );
}

function SponsorBoardModel({ rain }: { rain: boolean }) {
  const texture = useMemo(() => createSponsorTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group scale={[1.75, 1.75, 1.25]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[5.45, 1.86, 0.16]} />
        <meshStandardMaterial color={rain ? "#151f27" : "#10141a"} roughness={0.62} metalness={0.04} />
      </mesh>
      {[-1, 1].map((face) => (
        <mesh key={face} position={[0, 0, face * 0.091]} rotation={[0, face < 0 ? Math.PI : 0, 0]}>
          <planeGeometry args={[5.25, 1.68]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ))}
      {[-2.1, 2.1].map((x) => (
        <mesh key={x} position={[x, -1.22, 0]} castShadow>
          <boxGeometry args={[0.14, 2.44, 0.14]} />
          <meshStandardMaterial color={rain ? "#1d252b" : "#20242a"} roughness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

function SponsorBoard({ track, rain }: { track: TrackDef; rain: boolean }) {
  const placement = useMemo(() => {
    const progress = trackMetrics(track).totalLength * (track.id === "sakura" ? 0.6 : 0.36);
    const sample = sampleTrack(track, progress);
    const side = track.id === "sakura" ? 1 : -1;
    const position = tracksidePropPosition(track, sample, side, 1.2, 4.7, 0.8);
    return {
      ...position,
      heading: sample.heading - side * (Math.PI / 2 - 0.18)
    };
  }, [track]);

  return (
    <group position={[placement.x, placement.y + 2.35, placement.z]} rotation={[0, placement.heading, 0]}>
      <SponsorBoardModel rain={rain} />
    </group>
  );
}

const TrackProps = memo(function TrackProps({ track, rain, detail = "full" }: { track: TrackDef; rain: boolean; detail?: "full" | "mirror" }) {
  const mirrorDetail = detail === "mirror";
  const start = sampleTrackVisuals(track, 7)[0];
  const propSamples = useMemo(() => sampleTrackVisuals(track, track.id === "cloudline" ? 140 : track.id === "fjord" || track.id === "causeway" ? 70 : track.id === "alpine" ? 28 : 21), [track]);
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
          <group key={`${sample.x}-${sample.z}-prop`} position={[x, sample.y + 1.08, z]} rotation={[0, sample.heading - side * (Math.PI / 2 - 0.18), 0]}>
            <RoadsideBoardModel rain={rain} />
          </group>
        );
      })}
      {brakingBoards.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const x = sample.x + Math.sin(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + 4.3);
        const z = sample.z + Math.cos(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + 4.3);
        return (
          <group key={`${sample.x}-${sample.z}-brake`} position={[x, sample.y + 0.72, z]} rotation={[0, sample.heading + Math.PI + side * 0.42, 0]}>
            <BrakingBoardModel />
          </group>
        );
      })}
      <SponsorBoard track={track} rain={rain} />
      {!mirrorDetail && barriers.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        const x = sample.x + Math.sin(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + track.wallMargin - 0.65);
        const z = sample.z + Math.cos(sample.heading + Math.PI / 2) * side * (track.width / 2 + track.curbWidth + track.wallMargin - 0.65);
        return (
          <group key={`${sample.x}-${sample.z}-barrier`} position={[x, sample.y + 0.34, z]} rotation={[0, sample.heading - side * Math.PI / 2, 0]}>
          <TrackBarrierModel rain={rain} accent={index % 2 === 0 ? "#e04a54" : "#24282f"} />
        </group>
      );
      })}
      {!mirrorDetail && track.id === "sakura" && <><SakuraSignatureProps track={track} rain={rain} /><SakuraLandscape track={track} rain={rain} /></>}
      {!mirrorDetail && track.id === "alpine" && <AlpineSignatureProps track={track} rain={rain} />}
      {!mirrorDetail && <TrackIdentityProps track={track} rain={rain} />}
    </group>
  );
});

function SakuraSignatureProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  return (
    <group>
      <SakuraToriiGate track={track} rain={rain} />
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


function SakuraTunnelTree({
  position,
  side,
  heading,
  seed,
  rain,
}: {
  position: [number, number, number];
  side: number;
  heading: number;
  seed: number;
  rain: boolean;
}) {
  const plants = useMemo<Plant[]>(
    () => [{ position, seed, heading, scale: 1.08, lean: side * 0.06 }],
    [position, seed, heading, side],
  );
  return <Vegetation kind="cherry" plants={plants} rain={rain} />;
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
  const peaks = useMemo<MountainPeak[]>(
    () => [
      { position: [0, 0, 0], size: [8.8, 11.6, 6.8], seed: 11 },
      { position: [-4.8, 0, 3], size: [3.9, 6, 3.2], seed: 24 },
      { position: [4.2, 0, -2.85], size: [3.55, 5.3, 2.9], seed: 36 },
    ],
    [],
  );
  return <MountainMassif peaks={peaks} rain={rain} castShadow />;
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

function AlpineChalet({
  position,
  heading,
  rain,
}: {
  position: [number, number, number];
  heading: number;
  rain: boolean;
}) {
  return (
    <ScenicBuildings position={position} heading={heading} rain={rain} alpine />
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
    { x: -92, z: 128, h: 25, r: 19 },
    { x: -46, z: 150, h: 32, r: 25 },
    { x: 18, z: 158, h: 22, r: 18 },
    { x: 108, z: 152, h: 34, r: 28 },
    { x: 178, z: 70, h: 26, r: 22 }
  ];
  return (
    <group>
      {mountains.map((mountain, index) => (
        <AlpineBackdropPeak key={`mountain-${index}`} mountain={mountain} seed={index} rain={rain} />
      ))}
    </group>
  );
}

type AlpineBackdropMountain = { x: number; z: number; h: number; r: number };

function AlpineBackdropPeak({
  mountain,
  seed,
  rain,
}: {
  mountain: AlpineBackdropMountain;
  seed: number;
  rain: boolean;
}) {
  const peaks = useMemo<MountainPeak[]>(
    () => [
      {
        position: [mountain.x, -0.2, mountain.z],
        size: [mountain.r * 0.64, mountain.h * 0.96, mountain.r * 0.5],
        seed: seed * 5,
      },
      {
        position: [
          mountain.x - mountain.r * 0.34,
          -0.2,
          mountain.z + mountain.r * 0.16,
        ],
        size: [mountain.r * 0.33, mountain.h * 0.56, mountain.r * 0.28],
        seed: seed * 5 + 1,
      },
      {
        position: [
          mountain.x + mountain.r * 0.33,
          -0.2,
          mountain.z - mountain.r * 0.2,
        ],
        size: [mountain.r * 0.3, mountain.h * 0.48, mountain.r * 0.25],
        seed: seed * 5 + 2,
      },
    ],
    [mountain.x, mountain.z, mountain.r, mountain.h, seed],
  );
  return <MountainMassif peaks={peaks} rain={rain} />;
}

function TrackIdentityProps({
  track,
  rain,
}: {
  track: TrackDef;
  rain: boolean;
}) {
  let scenery: ReactNode;
  if (track.id === "sakura")
    scenery = <SakuraProps track={track} rain={rain} />;
  else if (track.id === "alpine")
    scenery = <AlpineProps track={track} rain={rain} />;
  else if (track.id === "fjord")
    scenery = <FjordProps track={track} rain={rain} />;
  else if (track.id === "causeway")
    scenery = <CausewayProps track={track} rain={rain} />;
  else scenery = <CloudlineProps track={track} rain={rain} />;
  return (
    <>
      <TrackWoodland track={track} rain={rain} />
      {track.id !== "causeway" && <Earthworks track={track} rain={rain} />}
      {scenery}
    </>
  );
}

function TrackWoodland({ track, rain }: { track: TrackDef; rain: boolean }) {
  const plants = useMemo(() => {
    const result: Record<PlantKind, Plant[]> = {
      cherry: [],
      pine: [],
      palm: [],
      mangrove: [],
    };
    const add = (
      kind: PlantKind,
      p: { x: number; y: number; z: number },
      seed: number,
      heading?: number,
      scale?: number,
      lean?: number,
    ) =>
      result[kind].push({
        position: [p.x, p.y, p.z],
        seed,
        heading,
        scale,
        lean,
      });
    if (track.id === "sakura") {
      sampleTrackVisuals(track, 23).forEach((sample, index) => {
        if (index % 3 === 1 || index % 4 === 2) return;
        const side = index % 2 === 0 ? -1 : 1;
        add(
          "cherry",
          tracksidePropPosition(
            track,
            sample,
            side,
            1.8 + seededUnit(index * 5) * 2.4,
            2.1,
            0.8,
          ),
          index,
        );
      });
      [0.23, 0.265, 0.3, 0.335, 0.37, 0.405, 0.44].forEach(
        (fraction, segment) => {
          const sample = sampleTrack(
            track,
            trackMetrics(track).totalLength * fraction,
          );
          for (const side of [-1, 1])
            add(
              "cherry",
              tracksidePropPosition(
                track,
                sample,
                side,
                0.2 + seededUnit(segment * 17 + side) * 1.2,
                2.1,
                0.8,
              ),
              220 + segment * 9 + side,
              sample.heading,
              1.08,
              side * 0.06,
            );
        },
      );
      const anchor = sampleTrack(track, trackMetrics(track).totalLength * 0.42),
        main = tracksidePropPosition(track, anchor, 1, 4.2, 2.2, 1.2);
      [
        { x: main.x, z: main.z },
        {
          x: main.x + Math.sin(anchor.heading + 0.55) * 3.1,
          z: main.z + Math.cos(anchor.heading + 0.55) * 3.1,
        },
        {
          x: main.x - Math.sin(anchor.heading - 0.35) * 2.5,
          z: main.z - Math.cos(anchor.heading - 0.35) * 2.5,
        },
      ].forEach((p, i) =>
        add(
          "cherry",
          clearTrackPropPosition(track, p, 2.1, 1),
          [104, 117, 131][i],
        ),
      );
    } else if (track.id === "alpine") {
      sampleTrackVisuals(track, 31).forEach((sample, index) => {
        if (index % 5 === 2)
          add(
            "pine",
            tracksidePropPosition(
              track,
              sample,
              index % 2 === 0 ? -1 : 1,
              3.2 + seededUnit(index * 7) * 3.2,
              1.8,
              0.8,
            ),
            index,
          );
      });
    } else if (track.id === "fjord") {
      sampleTrackVisuals(track, 115).forEach((sample, index) => {
        if (index % 4 === 0)
          add(
            "pine",
            tracksidePropPosition(
              track,
              sample,
              index % 2 === 0 ? -1 : 1,
              5 + seededUnit(index * 5) * 7,
              2.3,
              1.2,
            ),
            index + 200,
          );
      });
    } else if (track.id === "causeway") {
      const samples = sampleTrackVisuals(track, 125);
      samples.forEach((sample, index) => {
        if (isCausewayBridgeProgress((index + 0.5) / samples.length)) return;
        const side = index % 2 === 0 ? -1 : 1;
        if (index % 3 === 0)
          add(
            "palm",
            tracksidePropPosition(
              track,
              sample,
              side,
              5 + seededUnit(index * 5) * 9,
              1.8,
              1.2,
            ),
            index,
            sample.heading,
          );
        else if (index % 3 === 1)
          add(
            "mangrove",
            tracksidePropPosition(
              track,
              sample,
              side,
              3 + seededUnit(index * 7) * 7,
              2.1,
              1.2,
            ),
            index,
          );
      });
    } else {
      sampleTrackVisuals(track, 230).forEach((sample, index) => {
        if (sample.y < Math.max(...track.points.map(p=>p.y??0)) * .66 && index % 3 !== 1)
          add(
            "pine",
            tracksidePropPosition(
              track,
              sample,
              index % 2 === 0 ? -1 : 1,
              5 + seededUnit(index * 7) * 8,
              2.4,
              1.2,
            ),
            index + 600,
          );
      });
    }
    // Fill treelines on the existing flat shoulder shelf, with the same road-clearance helper.
    if (track.id !== "sakura") {
      const spacing =
        track.id === "alpine"
          ? 70
          : track.id === "causeway"
            ? 82
            : track.id === "cloudline"
              ? 150
              : 100;
      const samples = sampleTrackVisuals(track, spacing);
      samples.forEach((sample, index) => {
        if (
          track.id === "causeway" &&
          isCausewayBridgeProgress((index + 0.5) / samples.length)
        )
          return;
        if (track.id === "cloudline" && sample.y >= Math.max(...track.points.map(p=>p.y??0)) * .66) return;
        for (const side of [-1, 1]) {
          if ((index + (side === 1 ? 1 : 0)) % 3 === 0) continue;
          const kind = track.id === "causeway" ? "palm" : "pine";
          const root = tracksidePropPosition(
            track,
            sample,
            side,
            0.5 + seededUnit(index * 41 + side) * 1.5,
            1.8,
            1,
          );
          add(
            kind,
            root,
            5000 + index * 3 + side,
            sample.heading,
            0.85 + seededUnit(index * 43) * 0.3,
          );
          // Small, varied groves look more natural than an evenly spaced row of trees.
          if (kind === "pine" && index % 2 === 0) {
            for (const along of [-3.2, 3.2]) {
              const neighbor = clearTrackPropPosition(
                track,
                {
                  x: root.x + Math.sin(sample.heading) * along,
                  y: root.y,
                  z: root.z + Math.cos(sample.heading) * along,
                },
                1.8,
                1,
              );
              add(
                "pine",
                neighbor,
                7000 + index * 11 + along + side,
                sample.heading + along * 0.16,
                0.68 + seededUnit(index * 71 + along) * 0.24,
              );
            }
          }
        }
      });
    }
    return result;
  }, [track]);
  return (
    <>
      {(Object.keys(plants) as PlantKind[]).map((kind) =>
        plants[kind].length ? (
          <Vegetation
            key={kind}
            kind={kind}
            plants={plants[kind]}
            rain={rain}
          />
        ) : null,
      )}
    </>
  );
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
          const position = tracksidePropPosition(track, sample, bannerSide, 0.3 + seededUnit(index * 5) * 0.75, 3, 0.8);
          return (
            <SakuraBanner
              key={`sakura-banner-${index}`}
              position={[position.x, position.y + 1.75, position.z]}
              heading={sample.heading - bannerSide * (Math.PI / 2 - 0.18)}
              rain={rain}
            />
          );
        }
        return null;
      })}
    </group>
  );
}

function SakuraTree({
  position,
  seed,
  rain,
}: {
  position: [number, number, number];
  seed: number;
  rain: boolean;
}) {
  const plants = useMemo<Plant[]>(() => [{ position, seed }], [position, seed]);
  return <Vegetation kind="cherry" plants={plants} rain={rain} />;
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
      <group scale={[1.6, 1.6, 1.2]}>
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
          return null;
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

function AlpinePine({
  position,
  seed,
  rain,
}: {
  position: [number, number, number];
  seed: number;
  rain: boolean;
}) {
  const plants = useMemo<Plant[]>(() => [{ position, seed }], [position, seed]);
  return <Vegetation kind="pine" plants={plants} rain={rain} />;
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

function AlpineBridge({
  sample,
  rain,
}: {
  sample: { x: number; y: number; z: number; heading: number };
  track: TrackDef;
  rain: boolean;
}) {
  return (
    <AlpineViaduct
      position={[sample.x, sample.y, sample.z]}
      heading={sample.heading}
      rain={rain}
    />
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
    const village = tracksidePropPosition(
      track,
      villageSample,
      1,
      2.8,
      16.6,
      2.2,
    );
    const villageHeading = villageSample.heading - 0.28;
    // A full-depth quay sits above the sloping bank and outside usable runoff.
    const corners = [-12, 12].flatMap((x) =>
      [-11, 11].map((z) => ({
        x:
          village.x +
          Math.cos(villageHeading) * x +
          Math.sin(villageHeading) * z,
        y: village.y,
        z:
          village.z -
          Math.sin(villageHeading) * x +
          Math.cos(villageHeading) * z,
      })),
    );
    village.y =
      Math.max(
        village.y,
        ...corners.map((p) => nearestTrackPoint(track, p).y),
      ) + 0.2;
    return {
      waterfall: {
        ...tracksidePropPosition(track, waterfallSample, -1, 11, 6.8, 2.4),
        heading: waterfallSample.heading + 0.25,
      },
      village: { ...village, heading: villageHeading },
      lookout: {
        ...tracksidePropPosition(track, lookoutSample, 1, 0.8, 6.0, 1.4),
        heading: lookoutSample.heading - 0.62,
      },
    };
  }, [track]);

  return (
    <group>
      <FjordWater bounds={bounds} rain={rain} />
      <FjordBackdrop bounds={bounds} rain={rain} />
      <FjordWaterfall
        position={[
          scenicAnchors.waterfall.x,
          scenicAnchors.waterfall.y,
          scenicAnchors.waterfall.z,
        ]}
        heading={scenicAnchors.waterfall.heading}
        rain={rain}
      />
      <FjordVillage
        position={[
          scenicAnchors.village.x,
          scenicAnchors.village.y,
          scenicAnchors.village.z,
        ]}
        heading={scenicAnchors.village.heading}
        rain={rain}
      />
      <FjordQuay
        position={[
          scenicAnchors.village.x,
          scenicAnchors.village.y,
          scenicAnchors.village.z,
        ]}
        heading={scenicAnchors.village.heading}
        waterY={bounds.minY - 0.47}
        rain={rain}
      />
      <FjordLookout
        position={[
          scenicAnchors.lookout.x,
          scenicAnchors.lookout.y,
          scenicAnchors.lookout.z,
        ]}
        heading={scenicAnchors.lookout.heading}
        rain={rain}
      />
      <FjordScenicMarkers track={track} rain={rain} />
      {samples.map((sample, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        if (index % 4 === 0) {
          return null;
        }
        if (index % 4 === 1) {
          const position = tracksidePropPosition(
            track,
            sample,
            side,
            4 + seededUnit(index * 7) * 6,
            2.8,
            1.2,
          );
          return (
            <FjordMarker
              key={`fjord-marker-${index}`}
              position={[position.x, position.y + 0.42, position.z]}
              heading={sample.heading - side * 0.35}
              rain={rain}
            />
          );
        }
        const position = tracksidePropPosition(
          track,
          sample,
          side,
          5 + seededUnit(index * 9) * 8,
          3.2,
          1.2,
        );
        return (
          <AlpineRock
            key={`fjord-rock-${index}`}
            position={[position.x, position.y + 0.3, position.z]}
            seed={index + 300}
            rain={rain}
          />
        );
      })}
    </group>
  );
}

function FjordWater({ bounds, rain }: { bounds: TrackBounds; rain: boolean }) {
  return (
    <ScenicWater
      center={[
        (bounds.minX + bounds.maxX) / 2,
        bounds.minY - 0.47,
        (bounds.minZ + bounds.maxZ) / 2,
      ]}
      size={[bounds.maxX - bounds.minX + 420, bounds.maxZ - bounds.minZ + 420]}
      rain={rain}
    />
  );
}

function FjordBackdrop({
  bounds,
  rain,
}: {
  bounds: TrackBounds;
  rain: boolean;
}) {
  const peaks = [
    { x: bounds.minX - 120, z: bounds.maxZ + 80, h: 68, r: 52 },
    { x: bounds.maxX + 150, z: bounds.maxZ - 60, h: 82, r: 70 },
    { x: bounds.minX + 180, z: bounds.minZ - 130, h: 62, r: 58 },
    { x: bounds.maxX + 110, z: bounds.minZ + 100, h: 76, r: 64 },
  ];
  const shapes = useMemo<MountainPeak[]>(
    () =>
      peaks.map((peak, index) => ({
        position: [peak.x, bounds.minY - 0.3, peak.z],
        size: [peak.r, peak.h, peak.r],
        seed: 100 + index * 7,
      })),
    [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, bounds.minY],
  );
  return <MountainMassif peaks={shapes} rain={rain} />;
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

function FjordVillage({
  position,
  heading,
  rain,
}: {
  position: [number, number, number];
  heading: number;
  rain: boolean;
}) {
  return <ScenicBuildings position={position} heading={heading} rain={rain} />;
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

function CausewayGroundAccents({ track, rain }: { track: TrackDef; rain: boolean }) {
  const patches = useMemo(() => {
    return sampleTrackVisuals(track, 180).map((sample, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const radius = 5.2 + seededUnit(index * 17) * 5.4;
      const position = tracksidePropPosition(track, sample, side, 7 + seededUnit(index * 11) * 18, radius, 1.6);
      return {
        ...position,
        radius,
        rotation: seededUnit(index * 23) * Math.PI,
        mangrove: index % 3 !== 1,
        seed: index
      };
    });
  }, [track]);

  return (
    <group>
      {patches.map((patch) => (
        <group key={`causeway-shoal-${patch.seed}`} position={[patch.x, COAST_SEA_LEVEL + .09, patch.z]} rotation={[0, patch.rotation, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[patch.radius * 1.75, patch.radius * 0.58, 1]} receiveShadow>
            <circleGeometry args={[1, 26]} />
            <meshStandardMaterial color={rain ? "#b9ad8b" : "#dfd09c"} roughness={0.96} />
          </mesh>
          {patch.mangrove && (
            <>
              <mesh position={[-patch.radius * 0.34, 0.08, 0.16]} rotation={[-Math.PI / 2, 0, 0.22]} scale={[patch.radius * 0.52, patch.radius * 0.18, 1]}>
                <circleGeometry args={[1, 14]} />
                <meshStandardMaterial color={rain ? "#426451" : "#4f7b54"} roughness={0.92} />
              </mesh>
              <mesh position={[patch.radius * 0.22, 0.1, -0.24]} rotation={[-Math.PI / 2, 0, -0.34]} scale={[patch.radius * 0.42, patch.radius * 0.16, 1]}>
                <circleGeometry args={[1, 14]} />
                <meshStandardMaterial color={rain ? "#3a5848" : "#426d4b"} roughness={0.92} />
              </mesh>
            </>
          )}
        </group>
      ))}
    </group>
  );
}

function CausewayProps({ track, rain }: { track: TrackDef; rain: boolean }) {
  const bounds = useMemo(() => getTrackBounds(track), [track]);
  const samples = useMemo(() => sampleTrackVisuals(track, 125), [track]);
  const landmarks = useMemo(() => {
    const metrics = trackMetrics(track);
    const place = (progress: number, side: number, extra: number, radius: number, headingOffset: number) => {
      const sample = sampleTrack(track, metrics.totalLength * progress);
      const position = tracksidePropPosition(track, sample, side, extra, radius, 1.7);
      return { ...position, heading: sample.heading + headingOffset };
    };
    return {
      lighthouse: place(0.422, -1, 2.4, 6.8, 1.12),
      village: place(0.70, -1, 1.8, 10.8, 1.26),
      overlook: place(0.285, -1, 2.2, 5.6, -0.22)
    };
  }, [track]);

  return (
    <group>
      <CausewayWater bounds={bounds} rain={rain} />
      <CausewayDistantKeys bounds={bounds} rain={rain} />
      <CoastFeatures track={track} rain={rain} />
      <CausewayBridgeRails track={track} rain={rain} />
      <CausewayHeritageBridge track={track} rain={rain} />
      <CausewayLighthouse position={[landmarks.lighthouse.x, landmarks.lighthouse.y, landmarks.lighthouse.z]} heading={landmarks.lighthouse.heading} rain={rain} />
      <CausewayMarina position={[landmarks.village.x, landmarks.village.y, landmarks.village.z]} heading={landmarks.village.heading} rain={rain} />
      <CausewayOverlook position={[landmarks.overlook.x, landmarks.overlook.y, landmarks.overlook.z]} heading={landmarks.overlook.heading} rain={rain} />
      <CausewayBoats bounds={bounds} rain={rain} />
      {samples.map((sample, index) => {
        const progress = (index + 0.5) / samples.length;
        const side = index % 2 === 0 ? -1 : 1;
        if (isCausewayBridgeProgress(progress)) {
          if (index % 3 === 0) {
            const position = causewayWaterMarkerPosition(sample, side, 26 + seededUnit(index * 13) * 18);
            return <CausewayBuoy key={`causeway-buoy-${index}`} position={[position.x, COAST_SEA_LEVEL + .28, position.z]} seed={index} rain={rain} />;
          }
          if (index % 4 === 1) {
            const position = tracksidePropPosition(track, sample, side, -5.4, 0.35, 0.8);
            return <CausewayMileMarker key={`causeway-marker-${index}`} position={[position.x, position.y + 0.42, position.z]} heading={sample.heading - side * 0.38} rain={rain} />;
          }
          return null;
        }
        if (index % 3 === 0) {
          return null;
        }
        if (index % 3 === 1) {
          return null;
        }
        const position = causewayWaterMarkerPosition(sample, side, 21 + seededUnit(index * 19) * 14);
        return <CausewayBuoy key={`causeway-open-buoy-${index}`} position={[position.x, COAST_SEA_LEVEL + .28, position.z]} seed={index} rain={rain} />;
      })}
    </group>
  );
}

function CausewayWater({
  bounds,
  rain,
}: {
  bounds: TrackBounds;
  rain: boolean;
}) {
  return (
    <ScenicWater
      center={[
        (bounds.minX + bounds.maxX) / 2,
        COAST_SEA_LEVEL,
        (bounds.minZ + bounds.maxZ) / 2,
      ]}
      size={[bounds.maxX - bounds.minX + 520, bounds.maxZ - bounds.minZ + 520]}
      rain={rain}
      coastal
    />
  );
}

function CausewayDistantKeys({ bounds, rain }: { bounds: TrackBounds; rain: boolean }) {
  const islands = [
    { x: bounds.minX + 120, z: bounds.maxZ + 126, sx: 68, sz: 18, r: 0.18 },
    { x: bounds.maxX - 220, z: bounds.maxZ + 90, sx: 92, sz: 25, r: -0.12 },
    { x: bounds.minX - 138, z: bounds.minZ + 72, sx: 72, sz: 20, r: 0.36 },
    { x: bounds.maxX + 128, z: bounds.minZ + 168, sx: 84, sz: 24, r: -0.28 }
  ];
  return (
    <group>
      {islands.map((island, index) => (
        <group key={`causeway-distant-key-${index}`} position={[island.x, COAST_SEA_LEVEL + .12, island.z]} rotation={[0, island.r, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[island.sx, island.sz, 1]}>
            <circleGeometry args={[1, 28]} />
            <meshStandardMaterial color={rain ? "#bdb08f" : "#ddce96"} roughness={0.94} />
          </mesh>
          <mesh position={[0, 0.07, -1.5]} rotation={[-Math.PI / 2, 0, 0.08]} scale={[island.sx * 0.58, island.sz * 0.52, 1]}>
            <circleGeometry args={[1, 18]} />
            <meshStandardMaterial color={rain ? "#405d4d" : "#4f7954"} roughness={0.92} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CausewayBridgeRails({
  track,
  rain,
}: {
  track: TrackDef;
  rain: boolean;
}) {
  const sections = useMemo<RailSection[]>(() => {
    const samples = sampleTrackVisuals(track, 30);
    return samples.flatMap((sample, index) => {
      if (!isCausewayBridgeProgress((index + 0.5) / samples.length)) return [];
      return [-1, 1].map((side) => {
        const offset = side * (track.width / 2 + track.curbWidth + 1.2);
        return {
          position: [
            sample.x + Math.cos(sample.heading) * offset,
            sample.y,
            sample.z - Math.sin(sample.heading) * offset,
          ] as [number, number, number],
          heading: sample.heading,
          length: sample.length * 0.7,
        };
      });
    });
  }, [track]);
  return <BridgeRailing sections={sections} rain={rain} />;
}

function CausewayBridgeRail({
  position,
  heading,
  length,
  rain,
}: RailSection & { rain: boolean }) {
  const sections = useMemo(
    () => [{ position, heading, length }],
    [position, heading, length],
  );
  return <BridgeRailing sections={sections} rain={rain} />;
}

function CausewayHeritageBridge({ track, rain }: { track: TrackDef; rain: boolean }) {
  const samples = useMemo(() => sampleTrackVisuals(track, 96), [track]);
  return (
    <group>
      {samples.map((sample, index) => {
        const progress = (index + 0.5) / samples.length;
        if (progress < 0.035 || progress > 0.25 || index % 7 === 3) return null;
        const rightX = Math.sin(sample.heading + Math.PI / 2);
        const rightZ = Math.cos(sample.heading + Math.PI / 2);
        const offset = -(track.width / 2 + track.curbWidth + track.wallMargin + 18);
        return (
          <CausewayOldBridgeSegment
            key={`causeway-old-bridge-${index}`}
            position={[sample.x + rightX * offset, sample.y - 0.18, sample.z + rightZ * offset]}
            heading={sample.heading}
            length={sample.length * 0.86}
            rain={rain}
          />
        );
      })}
    </group>
  );
}

function CausewayOldBridgeSegment({ position, heading, length, rain }: { position: [number, number, number]; heading: number; length: number; rain: boolean }) {
  const postCount = Math.max(3, Math.min(8, Math.round(length / 10)));
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <boxGeometry args={[3.15, 0.22, length]} />
        <meshStandardMaterial color={rain ? "#7d8078" : "#9a9788"} roughness={0.9} />
      </mesh>
      {[-1.35, 1.35].map((x) => (
        <mesh key={`old-bridge-rail-${x}`} position={[x, 0.55, 0]}>
          <boxGeometry args={[0.09, 0.1, length]} />
          <meshStandardMaterial color={rain ? "#4c4740" : "#675a49"} roughness={0.74} />
        </mesh>
      ))}
      {Array.from({ length: postCount }).map((_, index) => {
        const z = -length / 2 + (length / Math.max(1, postCount - 1)) * index;
        return (
          <group key={`old-bridge-post-${index}`} position={[0, 0, z]}>
            {[-1.35, 1.35].map((x) => (
              <mesh key={x} position={[x, 0.32, 0]} castShadow>
                <boxGeometry args={[0.12, 0.72, 0.12]} />
                <meshStandardMaterial color={rain ? "#4c4740" : "#675a49"} roughness={0.74} />
              </mesh>
            ))}
            <mesh position={[0, -3.5, 0]} castShadow>
              <cylinderGeometry args={[0.16, 0.22, 6.4, 8]} />
              <meshStandardMaterial color={rain ? "#6f736e" : "#898579"} roughness={0.86} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function CausewayPalm({
  position,
  heading,
  seed,
  rain,
}: {
  position: [number, number, number];
  heading: number;
  seed: number;
  rain: boolean;
}) {
  const plants = useMemo<Plant[]>(
    () => [{ position, heading, seed }],
    [position, heading, seed],
  );
  return <Vegetation kind="palm" plants={plants} rain={rain} />;
}

function CausewayMangrove({
  position,
  seed,
  rain,
}: {
  position: [number, number, number];
  seed: number;
  rain: boolean;
}) {
  const plants = useMemo<Plant[]>(() => [{ position, seed }], [position, seed]);
  return <Vegetation kind="mangrove" plants={plants} rain={rain} />;
}

function CausewayLighthouse({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]} scale={[1.94, 1.94, 1.94]}>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[4.15, 2.82, 1]} receiveShadow>
        <circleGeometry args={[1, 26]} />
        <meshStandardMaterial color={rain ? "#b7ac8b" : "#dbc98d"} roughness={0.94} />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.78, 3.78, 16]} />
        <meshStandardMaterial color={rain ? "#e8ebe8" : "#fff8e8"} roughness={0.68} />
      </mesh>
      {[0.94, 2.2].map((y) => (
        <mesh key={`lighthouse-stripe-${y}`} position={[0, y, 0]} castShadow>
          <cylinderGeometry args={[0.58, 0.65, 0.24, 16]} />
          <meshStandardMaterial color={rain ? "#b33b42" : "#d6474f"} roughness={0.58} />
        </mesh>
      ))}
      <mesh position={[0, 3.92, 0]} castShadow>
        <cylinderGeometry args={[0.72, 0.66, 0.48, 16]} />
        <meshStandardMaterial color={rain ? "#263039" : "#2d343b"} roughness={0.55} />
      </mesh>
      <mesh position={[0, 4.24, 0]} castShadow>
        <coneGeometry args={[0.78, 0.6, 16]} />
        <meshStandardMaterial color={rain ? "#b33b42" : "#d6474f"} roughness={0.58} />
      </mesh>
      <mesh position={[0, 3.94, -0.54]}>
        <boxGeometry args={[0.86, 0.3, 0.05]} />
        <meshStandardMaterial color={rain ? "#ffe8a8" : "#ffd166"} emissive="#6b3908" emissiveIntensity={rain ? 0.56 : 0.32} roughness={0.4} />
      </mesh>
      <mesh position={[-1.72, 0.32, 0.98]} rotation={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[1.2, 0.58, 0.82]} />
        <meshStandardMaterial color={rain ? "#dfd7c5" : "#fff2d4"} roughness={0.75} />
      </mesh>
      <mesh position={[-1.72, 0.82, 0.98]} rotation={[0, 0.28, 0]} castShadow>
        <coneGeometry args={[0.78, 0.48, 4]} />
        <meshStandardMaterial color={rain ? "#a53c42" : "#cf4a51"} roughness={0.62} />
      </mesh>
      <group scale={[0.52, 0.52, 0.52]}>
        <CausewayPalm position={[3.8, 0, 1.75]} heading={0.4} seed={712} rain={rain} />
      </group>
    </group>
  );
}

function CausewayMarina({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  const colors = rain ? ["#9b7862", "#617c8e", "#9b626b"] : ["#e7a66e", "#81b7c7", "#e47f93"];
  const accentColors = rain ? ["#a75d52", "#668da0", "#b59255", "#7a8f68"] : ["#df665f", "#5bb3ca", "#f0bf57", "#84a86b"];
  return (
    <group position={position} rotation={[0, heading, 0]} scale={[1.78, 1.78, 1.78]}>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0.08]} scale={[8.55, 4.65, 1]} receiveShadow>
        <circleGeometry args={[1, 26]} />
        <meshStandardMaterial color={rain ? "#b8ad8a" : "#d8c88f"} roughness={0.94} />
      </mesh>
      {[-2.5, 0.1, 2.7].map((x, index) => (
        <group key={`marina-hut-${index}`} position={[x, 0, index % 2 === 0 ? 0.7 : -0.55]} rotation={[0, (index - 1) * 0.12, 0]}>
          <mesh position={[0, 0.62, 0]} castShadow>
            <boxGeometry args={[1.65, 1.18, 1.38]} />
            <meshStandardMaterial color={colors[index]} roughness={0.72} />
          </mesh>
          <mesh position={[0, 1.42, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[1.24, 0.82, 4]} />
            <meshStandardMaterial color={rain ? "#2f3940" : "#334049"} roughness={0.62} />
          </mesh>
          <mesh position={[0, 0.78, -0.71]}>
            <boxGeometry args={[0.64, 0.34, 0.04]} />
            <meshStandardMaterial color={rain ? "#ffe6aa" : "#ffd166"} emissive="#5f300a" emissiveIntensity={rain ? 0.5 : 0.26} roughness={0.48} />
          </mesh>
        </group>
      ))}
      {[-3.4, -1.15, 1.15, 3.4].map((x, index) => (
        <group key={`marina-cabana-${index}`} position={[x, 0, -2.02 + (index % 2) * 0.28]} rotation={[0, (index - 1.5) * 0.08, 0]}>
          <mesh position={[0, 0.48, 0]} castShadow>
            <boxGeometry args={[1.22, 0.88, 0.78]} />
            <meshStandardMaterial color={accentColors[index]} roughness={0.7} />
          </mesh>
          <mesh position={[0, 1.0, -0.03]} castShadow>
            <boxGeometry args={[1.46, 0.18, 0.96]} />
            <meshStandardMaterial color={index % 2 === 0 ? (rain ? "#f0e5ca" : "#fff1cf") : (rain ? "#32434b" : "#354852")} roughness={0.62} />
          </mesh>
          <mesh position={[0, 0.55, -0.41]}>
            <boxGeometry args={[0.52, 0.28, 0.04]} />
            <meshStandardMaterial color={rain ? "#ffe6aa" : "#ffd166"} emissive="#5f300a" emissiveIntensity={rain ? 0.48 : 0.24} roughness={0.48} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.1, -3.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.8, 0.8]} />
        <meshStandardMaterial color={rain ? "#5c4938" : "#73563d"} roughness={0.82} />
      </mesh>
      {[-3.9, -2.6, -1.3, 0, 1.3, 2.6, 3.9].map((x, index) => (
        <group key={`marina-flag-${index}`} position={[x, 0, -3.75]}>
          <mesh position={[0, 0.92, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 1.78, 6]} />
            <meshStandardMaterial color={rain ? "#465159" : "#53616a"} roughness={0.58} />
          </mesh>
          <mesh position={[0.18, 1.58, 0]}>
            <boxGeometry args={[0.46, 0.24, 0.035]} />
            <meshStandardMaterial color={accentColors[index % accentColors.length]} roughness={0.52} />
          </mesh>
        </group>
      ))}
      {[-3.4, -1.7, 0, 1.7, 3.4].map((x) => (
        <mesh key={`marina-post-${x}`} position={[x, 0.46, -3.62]} castShadow>
          <boxGeometry args={[0.13, 0.92, 0.13]} />
          <meshStandardMaterial color={rain ? "#4b3a2f" : "#654832"} roughness={0.78} />
        </mesh>
      ))}
      <CausewayBoat position={[4.95, COAST_SEA_LEVEL / 1.78 + .15, -10.0]} heading={-0.18} seed={12} rain={rain} />
    </group>
  );
}

function CausewayOverlook({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]} scale={[1.12, 1.12, 1.12]}>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.2, 28]} />
        <meshStandardMaterial color={rain ? "#b8b1a1" : "#d6cda9"} roughness={0.88} />
      </mesh>
      {[-3.0, -1.5, 0, 1.5, 3.0].map((x) => (
        <mesh key={`overlook-post-${x}`} position={[x, 0.72, -2.5]} castShadow>
          <boxGeometry args={[0.12, 1.28, 0.12]} />
          <meshStandardMaterial color={rain ? "#435057" : "#4f595f"} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 1.34, -2.5]} castShadow>
        <boxGeometry args={[6.4, 0.12, 0.12]} />
        <meshStandardMaterial color={rain ? "#435057" : "#4f595f"} roughness={0.6} />
      </mesh>
      <mesh position={[-1.1, 0.46, 1.0]} rotation={[-Math.PI / 2, 0, 0.28]}>
        <planeGeometry args={[2.3, 1.1]} />
        <meshStandardMaterial color={rain ? "#8f9a8d" : "#9fa88e"} roughness={0.9} />
      </mesh>
      <CausewayPalm position={[2.8, 0, 1.4]} heading={0.2} seed={900} rain={rain} />
    </group>
  );
}

function CausewayBoats({ bounds, rain }: { bounds: TrackBounds; rain: boolean }) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const boats = [
    { x: bounds.minX + width * 0.22, z: bounds.maxZ + 72, h: -0.2, r: 0.9, seed: 1 },
    { x: bounds.maxX - width * 0.18, z: bounds.minZ + depth * 0.22, h: -0.2, r: -0.55, seed: 2 },
    { x: bounds.minX + width * 0.52, z: bounds.minZ - 88, h: -0.2, r: 0.18, seed: 3 }
  ];
  return (
    <group>
      {boats.map((boat) => (
        <CausewayBoat key={`causeway-boat-${boat.seed}`} position={[boat.x, COAST_SEA_LEVEL + .22, boat.z]} heading={boat.r} seed={boat.seed} rain={rain} />
      ))}
    </group>
  );
}

function CausewayBoat({ position, heading, seed, rain }: { position: [number, number, number]; heading: number; seed: number; rain: boolean }) {
  const hull = seed % 2 === 0 ? (rain ? "#b44b52" : "#d84f5c") : (rain ? "#5d89a0" : "#46a7c9");
  return (
    <group position={position} rotation={[0, heading, 0]} scale={[0.9 + seededUnit(seed * 7) * 0.32, 0.9, 0.9]}>
      <mesh position={[0, 0.08, 0]} scale={[1.35, 0.28, 0.48]} castShadow>
        <sphereGeometry args={[1, 14, 8]} />
        <meshStandardMaterial color={hull} roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 2.0, 8]} />
        <meshStandardMaterial color={rain ? "#2f3940" : "#343a40"} roughness={0.52} />
      </mesh>
      <mesh position={[0.36, 1.12, 0.02]} rotation={[0, 0, -0.18]}>
        <planeGeometry args={[0.88, 1.42]} />
        <meshBasicMaterial color={rain ? "#e2e7df" : "#fff4d8"} transparent opacity={0.92} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function CausewayBuoy({ position, seed, rain }: { position: [number, number, number]; seed: number; rain: boolean }) {
  const red = seed % 2 === 0;
  return (
    <group position={position} rotation={[0, seededUnit(seed * 11) * Math.PI, 0]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.22, 0.48, 10]} />
        <meshStandardMaterial color={red ? (rain ? "#b63d44" : "#d8474f") : rain ? "#d6e2df" : "#fff7df"} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <sphereGeometry args={[0.12, 10, 8]} />
        <meshStandardMaterial color={red ? "#fff7df" : "#d8474f"} roughness={0.5} />
      </mesh>
    </group>
  );
}

function CausewayMileMarker({ position, heading, rain }: { position: [number, number, number]; heading: number; rain: boolean }) {
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <mesh castShadow>
        <boxGeometry args={[0.28, 0.86, 0.2]} />
        <meshStandardMaterial color={rain ? "#e0e7e3" : "#fff8e4"} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.2, 0.12]}>
        <boxGeometry args={[0.18, 0.2, 0.035]} />
        <meshStandardMaterial color={rain ? "#438d93" : "#31a4b5"} roughness={0.46} />
      </mesh>
    </group>
  );
}

function causewayWaterMarkerPosition(sample: { x: number; z: number; heading: number }, side: number, offset: number) {
  const rightX = Math.sin(sample.heading + Math.PI / 2);
  const rightZ = Math.cos(sample.heading + Math.PI / 2);
  return {
    x: sample.x + rightX * side * offset,
    z: sample.z + rightZ * side * offset
  };
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
        if (sample.y < Math.max(...track.points.map(p=>p.y??0)) * .66 && index % 3 !== 1) {
          return null;
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

function CloudlineBackdrop({
  bounds,
  rain,
}: {
  bounds: TrackBounds;
  rain: boolean;
}) {
  const peaks = [
    { x: bounds.minX - 260, z: bounds.minZ + 120, h: 210, r: 150 },
    { x: bounds.maxX + 280, z: bounds.minZ + 260, h: 260, r: 190 },
    { x: bounds.minX + 120, z: bounds.maxZ + 240, h: 230, r: 170 },
    { x: bounds.maxX - 80, z: bounds.maxZ + 290, h: 280, r: 210 },
  ];
  const shapes = useMemo<MountainPeak[]>(
    () =>
      peaks.map((peak, index) => ({
        position: [peak.x, bounds.minY - 0.4, peak.z],
        size: [peak.r, peak.h, peak.r],
        seed: 100 + index * 7,
      })),
    [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, bounds.minY],
  );
  return <MountainMassif peaks={shapes} rain={rain} />;
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

function CrashExplosions({ events, track }: { events: CrashEvent[]; track: TrackDef }) {
  return (
    <group>
      {events.map((event) => <CrashExplosion key={event.id} event={event} track={track} />)}
    </group>
  );
}

function CrashExplosion({ event, track }: { event: CrashEvent; track: TrackDef }) {
  const group = useRef<THREE.Group>(null);
  const startedAt = useMemo(() => performance.now(), []);
  const fire = useRef<THREE.MeshBasicMaterial>(null);
  const cap = useRef<THREE.MeshBasicMaterial>(null);
  const smoke = useRef<Array<THREE.MeshBasicMaterial | null>>([]);
  const ring = useRef<THREE.MeshBasicMaterial>(null);
  const baseScale = 1.15 + event.severity * 0.95;
  const baseY = useMemo(() => event.y ?? nearestTrackPoint(track, { x: event.x, z: event.z }).y, [event.x, event.y, event.z, track]);

  useFrame(() => {
    const age = clamp((performance.now() - startedAt) / CRASH_EXPLOSION_VISUAL_MS, 0, 1);
    const pop = Math.sin(Math.min(1, age * 1.55) * Math.PI);
    const rise = age * 1.4;
    group.current?.scale.setScalar(baseScale * (0.45 + age * 0.9));
    if (group.current) group.current.position.y = baseY + 0.18 + rise;
    if (fire.current) fire.current.opacity = Math.max(0, 1 - age * 1.65);
    if (cap.current) cap.current.opacity = Math.max(0, 0.72 * (1 - age));
    for (const material of smoke.current) if (material) material.opacity = Math.max(0, 0.42 * (1 - age));
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
          <meshBasicMaterial ref={(material) => { smoke.current[index] = material; }} color="#5c6062" transparent opacity={0.42} depthWrite={false} />
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
  const impactOpacity = car.impact > 0.35 ? clamp(car.impact, 0, 1) * 0.36 : 0;
  return <>
    <TireCloud car={car} rain={rain} />
    {impactOpacity > 0 && <group position={[car.x, car.y + 0.12, car.z]} rotation={[0, car.heading, 0]}>
      <mesh position={[0, 0.25, 0.2]}><sphereGeometry args={[1.15, 12, 8]} /><meshBasicMaterial color={color} transparent opacity={impactOpacity} depthWrite={false} /></mesh>
    </group>}
  </>;
}

type LiveSkidMark = SkidMark & { id: string };

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
  return <SkidMarkBatch marks={marks} />;
}

function CarModel({ car, color, dimmed, translucent = false }: { car: CarState; color: string; dimmed?: boolean; translucent?: boolean }) {
  const group = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const originals: { material: THREE.Material; transparent: boolean; opacity: number; depthWrite: boolean }[] = [];
    group.current?.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        originals.push({ material, transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite });
        if (translucent) { material.transparent = true; material.opacity *= 0.23; material.depthWrite = false; material.needsUpdate = true; }
      }
    });
    return () => { for (const o of originals) { o.material.transparent=o.transparent; o.material.opacity=o.opacity; o.material.depthWrite=o.depthWrite; o.material.needsUpdate=true; } };
  }, [translucent, car.vehicleId]);
  return <group ref={group}><VehicleModel car={car} color={color} dimmed={dimmed} /></group>;
}

function VehicleModel({ car, color, dimmed }: { car: CarState; color: string; dimmed?: boolean }) {
  if (car.vehicleId === "kart") return <KartModel car={car} color={color} dimmed={dimmed} />;
  if (car.vehicleId === "stockTruck") return <StockTruckModel car={car} color={color} dimmed={dimmed} />;
  if (car.vehicleId === "tukTuk") return <TukTukModel car={car} color={color} dimmed={dimmed} />;
  return <FormulaCarModel car={car} color={color} dimmed={dimmed} />;
}

function KartModel({ car, color, dimmed }: { car: CarState; color: string; dimmed?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const motionState = useRef(createBodyDynamics());
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const initial = useRef({ x: car.x, y: car.y, z: car.z, heading: car.heading });
  const visible = !dimmed;
  const ghosted = visible && Boolean(car.resetInvulnerableUntil);
  const frontSteer = visualWheelSteer(car.steer, 0.58);
  useFrame((_, delta) => {
    if (!group.current) return;
    const motion = stepBodyDynamics(motionState.current, car, delta, reduced.matches);
    const amount = smoothingAmount(delta, 20);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, car.x, amount);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, car.y + 0.16 + motion.heave, amount);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, car.z, amount);
    group.current.rotation.y = lerpAngle(group.current.rotation.y, car.heading, amount);
    group.current.rotation.x = motion.pitch;
    group.current.rotation.z = motion.roll;
  });
  return (
    <group ref={group} position={[initial.current.x, initial.current.y + 0.16, initial.current.z]} rotation={[0, initial.current.heading, 0]}>
      {ghosted && (
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[2.1, 0.7, 2.65]} />
          <meshBasicMaterial color="#d9f6ff" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      <group visible={visible}>
        <mesh castShadow position={[0, 0.04, 0]}>
          <boxGeometry args={[1.1, 0.08, 1.75]} />
          <meshStandardMaterial color="#303e45" roughness={0.8} metalness={0.1} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`frame-rail-${side}`} castShadow position={[side * 0.48, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.032, 0.032, 1.95, 8]} />
            <meshStandardMaterial color="#6c8188" roughness={0.4} metalness={0.22} />
          </mesh>
        ))}
        {[-0.96, 0.96].map((z) => (
          <mesh key={`frame-cross-${z}`} castShadow position={[0, 0.12, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.032, 0.032, 1.2, 8]} />
            <meshStandardMaterial color="#6c8188" roughness={0.4} metalness={0.22} />
          </mesh>
        ))}
        <BodyPanel sections={KART_NOSE} color={color} stripe={0.12} position={[0, 0.1, 0.78]} />
        {[-1, 1].map(side => <BodyPanel key={side} sections={KART_SIDEPOD} color={color} endBand position={[side * 0.72, 0.08, 0.08]} />)}
        <group position={[0, 0, -0.36]}>
          <KartSeat />
        </group>
        <group position={[0.52, 0.24, -0.58]}>
          <KartEngine />
        </group>
        <mesh castShadow position={[0.66, 0.17, -0.9]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 0.52, 10]} />
          <meshStandardMaterial color="#927c64" roughness={0.56} metalness={0.24} />
        </mesh>
        <mesh castShadow position={[0, 0.48, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.24, 0.026, 8, 24]} />
          <meshStandardMaterial color="#303a40" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.35, 0.35]} rotation={[0.9, 0, 0]}>
          <cylinderGeometry args={[0.032, 0.032, 0.58, 10]} />
          <meshStandardMaterial color="#111418" roughness={0.44} metalness={0.32} />
        </mesh>
        <mesh castShadow position={[0, 0.46, 0.18]} rotation={[0.9, 0, 0]}>
          <boxGeometry args={[0.28, 0.05, 0.06]} />
          <meshStandardMaterial color="#111418" roughness={0.44} metalness={0.26} />
        </mesh>
        <group position={[0, 0.52, 0.1]} scale={[0.48, 0.48, 0.48]}>
          <KartDataLogger speed={car.speed} throttle={car.throttle} />
        </group>
        {[-1, 1].map((side) => (
          <mesh key={`pedal-${side}`} castShadow position={[side * 0.16, 0.18, 0.55]} rotation={[-0.2, 0, 0]}>
            <boxGeometry args={[0.12, 0.035, 0.18]} />
            <meshStandardMaterial color="#2c323a" roughness={0.48} metalness={0.25} />
          </mesh>
        ))}
        {[[-0.44, 0.76, 0.1], [0.44, 0.76, -0.1], [-0.5, -0.78, -0.06], [0.5, -0.78, 0.06]].map(([x, z, rot]) => (
          <mesh key={`${x}-${z}`} position={[x, 0.05, z]} rotation={[0, rot, 0]}>
            <boxGeometry args={[0.05, 0.05, 0.84]} />
            <meshStandardMaterial color="#2c323a" roughness={0.44} metalness={0.22} />
          </mesh>
        ))}
        {[[-0.78, -0.82], [0.78, -0.82], [-0.78, 0.82], [0.78, 0.82]].map(([x, z]) => (
          <group key={`${x}-${z}`} position={[x, -0.03, z]}>
            <VehicleWheel radius={0.24} width={0.2} distance={car.wheelDistance} side={x < 0 ? -1 : 1} steer={z > 0 ? frontSteer : 0} />
          </group>
        ))}
      </group>
    </group>
  );
}

function StockTruckModel({ car, color, dimmed }: { car: CarState; color: string; dimmed?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const motionState = useRef(createBodyDynamics());
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const initial = useRef({ x: car.x, y: car.y, z: car.z, heading: car.heading });
  const visible = !dimmed;
  const ghosted = visible && Boolean(car.resetInvulnerableUntil);
  const frontSteer = visualWheelSteer(car.steer, 0.42);
  useFrame((_, delta) => {
    if (!group.current) return;
    const motion = stepBodyDynamics(motionState.current, car, delta, reduced.matches);
    const amount = smoothingAmount(delta, 15);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, car.x, amount);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, car.y + 0.38 + motion.heave, amount);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, car.z, amount);
    group.current.rotation.y = lerpAngle(group.current.rotation.y, car.heading, amount);
    group.current.rotation.x = motion.pitch;
    group.current.rotation.z = motion.roll;
  });
  return (
    <group ref={group} position={[initial.current.x, initial.current.y + 0.38, initial.current.z]} rotation={[0, initial.current.heading, 0]}>
      {ghosted && (
        <mesh position={[0, 0.32, 0]}>
          <boxGeometry args={[2.35, 1.15, 3.55]} />
          <meshBasicMaterial color="#d9f6ff" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      <group visible={visible}>
        <mesh castShadow position={[0, 0.06, 0]}>
          <SculptedBox args={[1.84, 0.38, 3.22]} />
          <meshStandardMaterial color={color} roughness={0.34} metalness={0.18} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`truck-skirt-${side}`} castShadow position={[side * 0.94, 0.02, -0.02]}>
            <boxGeometry args={[0.08, 0.16, 2.76]} />
            <meshStandardMaterial color="#101418" roughness={0.48} metalness={0.12} />
          </mesh>
        ))}
        <BodyPanel sections={TRUCK_HOOD} color={color} stripe={0.34} twinStripe position={[0, 0.33, 0.72]} />
        <BodyPanel sections={TRUCK_CAB} color={color} stripe={0.34} twinStripe />
        <group position={[0, 0.695, 0.13]} rotation={[-0.77, 0, 0]}>
          <RacingGlass width={1.2} height={0.62} />
        </group>
        <group position={[0, 0.66, -0.79]} rotation={[0.38, Math.PI, 0]}>
          <RacingGlass width={1.05} height={0.3} />
        </group>
        {[-1, 1].map((side) => (
          <mesh key={`truck-side-window-${side}`} position={[side * 0.73, 0.66, -0.28]} rotation={[0, 0, side * 0.08]}>
            <boxGeometry args={[0.045, 0.34, 0.58]} />
            <meshStandardMaterial color="#304f5d" roughness={0.4} metalness={0.04} />
          </mesh>
        ))}
        <mesh castShadow position={[0, 0.32, -1.25]}>
          <boxGeometry args={[1.58, 0.18, 1.18]} />
          <meshStandardMaterial color="#36434b" roughness={0.9} metalness={0.04} />
        </mesh>
        <mesh castShadow position={[0, 0.55, -1.7]}>
          <SculptedBox args={[1.9, 0.11, 0.22]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
        </mesh>
        <mesh castShadow position={[0, 0.82, -0.78]} rotation={[-0.18, 0, 0]}>
          <boxGeometry args={[1.46, 0.06, 0.22]} />
          <meshStandardMaterial color="#38464c" roughness={0.66} metalness={0.1} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`truck-bed-brace-${side}`} castShadow position={[side * 0.62, 0.58, -0.95]} rotation={[0.18, 0, side * 0.12]}>
            <boxGeometry args={[0.055, 0.62, 0.055]} />
            <meshStandardMaterial color="#101214" roughness={0.44} metalness={0.18} />
          </mesh>
        ))}
        <mesh castShadow position={[0, -0.03, 1.76]}>
          <boxGeometry args={[1.92, 0.06, 0.24]} />
          <meshStandardMaterial color="#101214" roughness={0.48} />
        </mesh>
        <mesh position={[0, 0.12, 1.72]}>
          <boxGeometry args={[1.45, 0.08, 0.16]} />
          <meshStandardMaterial color="#d9d3c4" roughness={0.54} />
        </mesh>
        <mesh position={[0, 0.28, 1.62]}>
          <SculptedBox args={[1.24, 0.18, 0.055]} />
          <meshStandardMaterial color="#34434a" roughness={0.6} metalness={0.16} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`truck-headlight-${side}`} position={[side * 0.55, 0.29, 1.66]}>
            <boxGeometry args={[0.28, 0.09, 0.04]} />
            <meshStandardMaterial color="#f7edd0" emissive="#f3d386" emissiveIntensity={0.35} roughness={0.32} />
          </mesh>
        ))}
        <mesh position={[0, 0.12, -1.73]}>
          <boxGeometry args={[1.4, 0.08, 0.16]} />
          <meshStandardMaterial color="#111318" roughness={0.42} />
        </mesh>
        {[[-0.94, -1.1], [0.94, -1.1], [-0.94, 1.1], [0.94, 1.1]].map(([x, z]) => (
          <group key={`${x}-${z}`} position={[x, -0.12, z]}>
            <VehicleWheel radius={0.34} width={0.3} distance={car.wheelDistance} side={x < 0 ? -1 : 1} steer={z > 0 ? frontSteer : 0} hub="#2e333b" stripe="#d8dde2" />
          </group>
        ))}
        {[[-0.98, 1.1], [0.98, 1.1], [-0.98, -1.1], [0.98, -1.1]].map(([x, z]) => (
          <group key={`fender-${x}-${z}`} position={[x, -0.12, z]}>
            <TruckWheelArch color={color} />
          </group>
        ))}
      </group>
    </group>
  );
}

function TukTukModel({ car, color, dimmed }: { car: CarState; color: string; dimmed?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const canopy = useRef<THREE.Group>(null);
  const motionState = useRef(createBodyDynamics());
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const initial = useRef({ x: car.x, y: car.y, z: car.z, heading: car.heading });
  const visible = !dimmed;
  const ghosted = visible && Boolean(car.resetInvulnerableUntil);
  const frontSteer = visualWheelSteer(car.steer, 0.62);
  const riskLean = car.steer === 0 ? 0 : -Math.sign(car.steer) * car.rolloverRisk * 0.12;
  const riskWobble = Math.sin(car.wheelDistance * 14) * car.rolloverRisk * 0.035;
  const roll = car.crashed ? (car.steer < 0 ? 1.28 : -1.28) : -car.steer * clamp(car.speed / 8, 0, 1) * 0.18 + riskLean + riskWobble;
  useFrame((_, delta) => {
    if (!group.current) return;
    const motion = stepBodyDynamics(motionState.current, car, delta, reduced.matches);
    const amount = smoothingAmount(delta, 14);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, car.x, amount);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, car.y + 0.28 + motion.heave, amount);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, car.z, amount);
    group.current.rotation.y = lerpAngle(group.current.rotation.y, car.heading, amount);
    group.current.rotation.x = motion.pitch;
    group.current.rotation.z = motion.roll;
    if (canopy.current) canopy.current.rotation.z = motion.canopy;
  });
  return (
    <group ref={group} position={[initial.current.x, initial.current.y + 0.28, initial.current.z]} rotation={[0, initial.current.heading, 0]}>
      {ghosted && (
        <mesh position={[0, 0.44, 0]}>
          <boxGeometry args={[1.65, 1.35, 2.35]} />
          <meshBasicMaterial color="#d9f6ff" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      <group rotation={[0, 0, roll]} visible={visible}>
        <mesh castShadow position={[0, 0.12, -0.1]}>
          <SculptedBox args={[1.08, 0.24, 1.72]} />
          <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`tuktuk-step-${side}`} castShadow position={[side * 0.66, 0.12, -0.1]}>
            <boxGeometry args={[0.13, 0.055, 1.26]} />
            <meshStandardMaterial color="#3b454b" roughness={0.7} metalness={0.12} />
          </mesh>
        ))}
        {[-1, 1].map(side => <BodyPanel key={side} sections={TUK_SIDE} color={color} position={[side * 0.5, 0.34, -0.28]} roughness={0.42} metalness={0.08} />)}
        <BodyPanel sections={TUK_REAR} color={color} position={[0, 0.55, -0.86]} roughness={0.42} metalness={0.08} />
        <BodyPanel sections={TUK_SEAT} color="#8d5c3e" finish="seat" position={[0, 0.37, -0.48]} roughness={0.9} metalness={0} />
        <BodyPanel sections={TUK_BACK} color="#8d5c3e" finish="seat" position={[0, 0.61, -0.77]} roughness={0.9} metalness={0} />
        <mesh position={[0, 0.75, 0.37]} rotation={[-0.15, 0, 0]}>
          <planeGeometry args={[0.9, 0.43]} />
          <meshStandardMaterial color="#a5d1d4" roughness={0.2} transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <group ref={canopy} position={[0, 1.04, -0.2]}>
          <BodyPanel sections={TUK_CANOPY} color="#d7be7b" finish="fabric" roughness={0.92} metalness={0} />
        </group>
        <mesh castShadow position={[0, 0.96, -0.2]}>
          <SculptedBox args={[1.38, 0.035, 1.68]} />
          <meshStandardMaterial color="#111318" roughness={0.46} metalness={0.08} />
        </mesh>
        <mesh castShadow position={[0, 0.86, -1.02]}>
          <boxGeometry args={[1.1, 0.08, 0.16]} />
          <meshStandardMaterial color="#111318" roughness={0.42} />
        </mesh>
        <mesh castShadow position={[0, 0.26, 0.8]}>
          <SculptedBox args={[0.28, 0.18, 0.64]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.08} />
        </mesh>
        <mesh castShadow position={[0, 0.26, 0.96]} rotation={[0.12, 0, 0]}>
          <SculptedBox args={[0.52, 0.08, 0.24]} />
          <meshStandardMaterial color={color} roughness={0.4} metalness={0.08} />
        </mesh>
        <mesh castShadow position={[0, 0.48, 0.48]} rotation={[0.2, 0, 0]}>
          <boxGeometry args={[0.82, 0.05, 0.08]} />
          <meshStandardMaterial color="#101214" roughness={0.48} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`tuktuk-fork-${side}`} castShadow position={[side * 0.08, 0.28, 0.86]} rotation={[0.32, 0, 0]}>
            <boxGeometry args={[0.035, 0.48, 0.035]} />
            <meshStandardMaterial color="#8b9b9c" roughness={0.4} metalness={0.24} />
          </mesh>
        ))}
        <group position={[0, 0.45, 1.0]}>
          <TukHeadlamp />
        </group>
        <group position={[0, -0.03, 0.98]}>
          <VehicleWheel radius={0.25} width={0.18} distance={car.wheelDistance} side={1} steer={frontSteer} hub="#303640" stripe="#f7e6bc" />
        </group>
        {[[-0.62, -0.82], [0.62, -0.82]].map(([x, z]) => (
          <group key={`${x}-${z}`} position={[x, -0.05, z]}>
            <VehicleWheel radius={0.28} width={0.2} distance={car.wheelDistance} side={x < 0 ? -1 : 1} hub="#303640" stripe="#f7e6bc" />
          </group>
        ))}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.58, 0.52, -0.22]}>
              <boxGeometry args={[0.05, 0.9, 0.05]} />
              <meshStandardMaterial color="#45555a" roughness={0.55} />
            </mesh>
            <mesh position={[side * 0.53, 0.58, 0.36]} rotation={[0.08, 0, side * 0.08]}>
              <boxGeometry args={[0.045, 0.78, 0.045]} />
              <meshStandardMaterial color="#45555a" roughness={0.55} />
            </mesh>
            <mesh position={[side * 0.55, 0.58, -0.86]} rotation={[-0.08, 0, side * -0.08]}>
              <boxGeometry args={[0.045, 0.72, 0.045]} />
              <meshStandardMaterial color="#45555a" roughness={0.55} />
            </mesh>
            <mesh position={[side * 0.6, 0.84, -0.22]}>
              <boxGeometry args={[0.045, 0.045, 1.2]} />
              <meshStandardMaterial color="#45555a" roughness={0.55} />
            </mesh>
          </group>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={`tuktuk-tail-${side}`} position={[side * 0.34, 0.3, -0.98]}>
            <boxGeometry args={[0.12, 0.08, 0.035]} />
            <meshStandardMaterial color="#ff2b38" emissive="#b80018" emissiveIntensity={0.55} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function FormulaCarModel({ car, color, dimmed }: { car: CarState; color: string; dimmed?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const motionState = useRef(createBodyDynamics());
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const initial = useRef({ x: car.x, y: car.y, z: car.z, heading: car.heading });
  const visible = !dimmed;
  const ghosted = visible && Boolean(car.resetInvulnerableUntil);
  const frontSteer = visualWheelSteer(car.steer, 0.48);
  useFrame((_, delta) => {
    if (!group.current) return;
    const motion = stepBodyDynamics(motionState.current, car, delta, reduced.matches);
    const amount = smoothingAmount(delta, 18);
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, car.x, amount);
    group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, car.y + 0.3 + motion.heave, amount);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, car.z, amount);
    group.current.rotation.y = lerpAngle(group.current.rotation.y, car.heading, amount);
    group.current.rotation.x = motion.pitch;
    group.current.rotation.z = motion.roll;
  });
  return (
    <group ref={group} position={[initial.current.x, initial.current.y + 0.3, initial.current.z]} rotation={[0, initial.current.heading, 0]}>
      {ghosted && (
        <mesh position={[0, 0.25, 0.15]}>
          <boxGeometry args={[2.6, 0.9, 4.25]} />
          <meshBasicMaterial color="#d9f6ff" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      <BodyPanel sections={FORMULA_HULL} color={color} stripe={0.08} visible={visible} />
      <BodyPanel sections={FORMULA_SIDEPOD} color={color} position={[-0.56, 0, 0]} visible={visible} />
      <BodyPanel sections={FORMULA_SIDEPOD} color={color} position={[0.56, 0, 0]} visible={visible} />
      <BodyPanel sections={FORMULA_COVER} color={color} visible={visible} />
      <mesh castShadow position={[0, 0.72, -0.86]} rotation={[0.08, 0, 0]} visible={visible}>
        <boxGeometry args={[0.34, 0.18, 0.44]} />
        <meshStandardMaterial color="#111318" roughness={0.42} metalness={0.14} />
      </mesh>
      <mesh castShadow position={[0, 0.73, -0.64]} visible={visible}>
        <boxGeometry args={[0.18, 0.08, 0.055]} />
        <meshStandardMaterial color="#050608" roughness={0.52} metalness={0.08} />
      </mesh>
      <mesh castShadow position={[0, 0.5, -0.58]} visible={visible}>
        <boxGeometry args={[0.48, 0.22, 0.22]} />
        <meshStandardMaterial color="#384149" roughness={0.86} metalness={0} />
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
      <mesh castShadow position={[0, 0.51, -0.16]} visible={visible}>
        <boxGeometry args={[0.055, 0.34, 0.055]} />
        <meshStandardMaterial color="#101214" roughness={0.42} metalness={0.12} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`formula-mirror-${side}`} visible={visible}>
          <mesh castShadow position={[side * 0.5, 0.4, -0.34]} rotation={[0, side * 0.24, side * 0.18]}>
            <boxGeometry args={[0.34, 0.035, 0.035]} />
            <meshStandardMaterial color="#101214" roughness={0.44} metalness={0.18} />
          </mesh>
          <mesh castShadow position={[side * 0.68, 0.43, -0.35]} rotation={[0, side * 0.18, 0]}>
            <boxGeometry args={[0.18, 0.08, 0.11]} />
            <meshStandardMaterial color="#101214" roughness={0.36} metalness={0.16} />
          </mesh>
          <mesh position={[side * 0.68, 0.43, -0.29]} rotation={[0, side * 0.18, 0]}>
            <boxGeometry args={[0.13, 0.045, 0.015]} />
            <meshStandardMaterial color="#8fb6c7" roughness={0.14} metalness={0.25} />
          </mesh>
        </group>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`formula-sidepod-inlet-${side}`} position={[side * 0.8, 0.14, -0.12]} rotation={[0, side * 0.08, 0]} visible={visible}>
          <boxGeometry args={[0.045, 0.16, 0.44]} />
          <meshStandardMaterial color="#101214" roughness={0.48} metalness={0.08} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <group key={`formula-sidepod-sweep-${side}`} visible={visible}>
          <mesh castShadow position={[side * 0.64, 0.11, 0.34]} rotation={[0, side * 0.28, 0]}>
            <boxGeometry args={[0.04, 0.18, 0.36]} />
            <meshStandardMaterial color="#303c43" roughness={0.64} metalness={0.08} />
          </mesh>
          <mesh castShadow position={[side * 0.68, 0.2, 0.28]} rotation={[0, side * -0.12, side * 0.08]}>
            <SculptedBox args={[0.28, 0.035, 0.46]} />
            <meshStandardMaterial color={color} roughness={0.34} metalness={0.16} />
          </mesh>
        </group>
      ))}
      <group position={[0, 0.22, 2.05]} visible={visible}>
        <Aerofoil width={2.25} chord={0.34} height={0.065} color={color} />
      </group>
      <mesh castShadow position={[0, 0.1, 2.38]} visible={visible}>
        <boxGeometry args={[2.45, 0.06, 0.18]} />
        <meshStandardMaterial color="#111318" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.02, 2.68]} visible={visible}>
        <boxGeometry args={[2.36, 0.045, 0.14]} />
        <meshStandardMaterial color="#20242a" roughness={0.48} />
      </mesh>
      <mesh castShadow position={[-1.18, 0.15, 2.35]} visible={visible}>
        <SculptedBox args={[0.065, 0.36, 0.86]} />
        <meshStandardMaterial color="#303c43" roughness={0.64} />
      </mesh>
      <mesh castShadow position={[1.18, 0.15, 2.35]} visible={visible}>
        <SculptedBox args={[0.065, 0.36, 0.86]} />
        <meshStandardMaterial color="#303c43" roughness={0.64} />
      </mesh>
      <group position={[0, 0.58, -1.62]} visible={visible}>
        <Aerofoil width={2.05} chord={0.36} height={0.09} color={color} />
      </group>
      <mesh castShadow position={[0, 0.78, -1.76]} visible={visible}>
        <SculptedBox args={[1.88, 0.045, 0.24]} />
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
        <SculptedBox args={[0.16, 0.12, 1.22]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0.55, 0.1, -0.95]} rotation={[0, 0, 0.28]} visible={visible}>
        <SculptedBox args={[0.16, 0.12, 1.22]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[-0.68, 0.07, 0.82]} rotation={[0, 0, 0.22]} visible={visible}>
        <SculptedBox args={[0.14, 0.1, 1.18]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0.68, 0.07, 0.82]} rotation={[0, 0, -0.22]} visible={visible}>
        <SculptedBox args={[0.14, 0.1, 1.18]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.18} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`suspension-${side}`} visible={visible}>
          <mesh position={[side * 0.54, 0.03, 0.9]} rotation={[0, side * 0.22, side * 0.16]}>
            <boxGeometry args={[0.032, 0.034, 1.15]} />
            <meshStandardMaterial color="#15181d" roughness={0.44} metalness={0.18} />
          </mesh>
          <mesh position={[side * 0.54, 0.03, -0.9]} rotation={[0, side * -0.2, side * -0.14]}>
            <boxGeometry args={[0.032, 0.034, 1.05]} />
            <meshStandardMaterial color="#15181d" roughness={0.44} metalness={0.18} />
          </mesh>
          <mesh position={[side * 0.62, 0.09, 0.88]} rotation={[0, side * 0.18, side * -0.08]}>
            <boxGeometry args={[0.026, 0.03, 1.02]} />
            <meshStandardMaterial color="#15181d" roughness={0.44} metalness={0.18} />
          </mesh>
          <mesh position={[side * 0.62, 0.09, -0.86]} rotation={[0, side * -0.17, side * 0.08]}>
            <boxGeometry args={[0.026, 0.03, 0.92]} />
            <meshStandardMaterial color="#15181d" roughness={0.44} metalness={0.18} />
          </mesh>
        </group>
      ))}
      {[[-0.9, -1.1], [0.9, -1.1], [-0.9, 1.1], [0.9, 1.1]].map(([x, z]) => (
        <group key={`${x}-${z}`} position={[x, -0.05, z]} visible={visible}>
          <VehicleWheel radius={0.32} width={0.28} distance={car.wheelDistance} side={x < 0 ? -1 : 1} steer={z > 0 ? frontSteer : 0} />
        </group>
      ))}
    </group>
  );
}

function Cockpit({ car, color, cockpitStyle }: { car: CarState; color: string; cockpitStyle: CockpitStyle }) {
  if (car.vehicleId === "kart") return <KartCockpit car={car} color={color} cockpitStyle={cockpitStyle} />;
  if (car.vehicleId === "stockTruck") return <TruckCockpit car={car} color={color} cockpitStyle={cockpitStyle} />;
  if (car.vehicleId === "tukTuk") return <TukTukCockpit car={car} color={color} cockpitStyle={cockpitStyle} />;
  return <FormulaCockpit car={car} color={color} cockpitStyle={cockpitStyle} />;
}

function FormulaCockpit({ car, color, cockpitStyle }: { car: CarState; color: string; cockpitStyle: CockpitStyle }) {
  const group = useCockpitPose(car, .65);
  const frontSteer = visualWheelSteer(car.steer, .52);
  return (
    <group ref={group.ref} position={group.position} rotation={group.rotation}>
      <BodyPanel sections={FORMULA_COCKPIT_NOSE} color={color} stripe={0.08} />
      <group position={[0, -0.1, 2.45]}>
        <Aerofoil width={1.84} chord={0.42} height={0.065} color={color} />
      </group>
      <mesh position={[0, -0.2, 2.78]}>
        <boxGeometry args={[1.84, 0.055, 0.18]} />
        <meshStandardMaterial color="#111318" roughness={0.5} />
      </mesh>
      <mesh position={[-0.93, -0.1, 2.6]}>
        <SculptedBox args={[0.05, 0.24, 0.76]} />
        <meshStandardMaterial color="#101214" roughness={0.48} />
      </mesh>
      <mesh position={[0.93, -0.1, 2.6]}>
        <SculptedBox args={[0.05, 0.24, 0.76]} />
        <meshStandardMaterial color="#101214" roughness={0.48} />
      </mesh>
      {[[-0.92, 1.5], [0.92, 1.5]].map(([x, z]) => (
        <group key={x} position={[x, -0.1, z]}>
          <VehicleWheel radius={0.34} width={0.22} distance={car.wheelDistance} side={x < 0 ? -1 : 1} steer={frontSteer} />
        </group>
      ))}
      <mesh position={[-0.58, -0.08, 1.88]} rotation={[0, 0, 0.28]}>
        <SculptedBox args={[0.1, 0.08, 1.52]} />
        <meshStandardMaterial color={color} roughness={0.36} metalness={0.16} />
      </mesh>
      <mesh position={[0.58, -0.08, 1.88]} rotation={[0, 0, -0.28]}>
        <SculptedBox args={[0.1, 0.08, 1.52]} />
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
      <mesh position={[0, 0.25, 0.68]} rotation={[0.52, 0, 0]}>
        <boxGeometry args={[0.06, 0.06, 0.48]} />
        <meshStandardMaterial color="#101214" roughness={0.46} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.21, 0.84]} rotation={[0.42, 0, 0]}>
        <boxGeometry args={[0.22, 0.045, 0.08]} />
        <meshStandardMaterial color="#151922" roughness={0.44} metalness={0.2} />
      </mesh>
      <FormulaSteeringWheel steer={car.steer} style={cockpitStyle} speed={car.speed} throttle={car.throttle} />
      <mesh position={[0, -0.06, 1.02]}>
        <boxGeometry args={[0.56, 0.055, 0.28]} />
        <meshStandardMaterial color="#101214" roughness={0.52} />
      </mesh>
      <mesh position={[0, 0.07, 0.82]}>
        <boxGeometry args={[0.62, 0.045, 0.07]} />
        <meshStandardMaterial color="#111318" roughness={0.48} metalness={0.08} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`formula-cockpit-rim-${side}`} position={[side * 0.42, 0.08, 0.78]} rotation={[0, side * 0.16, side * 0.12]}>
          <boxGeometry args={[0.055, 0.055, 0.76]} />
          <meshStandardMaterial color="#111318" roughness={0.48} metalness={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function FormulaSteeringWheel({ steer, style, speed, throttle }: { steer: number; style: CockpitStyle; speed: number; throttle: number }) {
  const turn = -clamp(steer, -1, 1) * 0.62;
  const level = clamp(speed / 42 + throttle * 0.22, 0, 1);
  const lit = Math.round(level * 7);
  return (
    <group position={[0, 0.5, 0.54]} scale={[0.78, 0.78, 0.78]}>
      <group rotation={[0, 0, turn]}>
        <mesh position={[0, 0, -0.006]}>
          <boxGeometry args={[0.34, 0.18, 0.058]} />
          <meshStandardMaterial color="#394851" roughness={0.5} metalness={0.18} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`formula-wheel-grip-${side}`} position={[side * 0.245, -0.01, -0.008]} rotation={[0, 0, side * 0.12]}>
            <capsuleGeometry args={[0.032, 0.18, 4, 10]} />
            <meshStandardMaterial color="#252c30" roughness={0.94} metalness={0} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={`formula-wheel-spoke-${side}`} position={[side * 0.14, -0.02, -0.002]} rotation={[0, 0, side * 0.22]}>
            <boxGeometry args={[0.18, 0.03, 0.038]} />
            <meshStandardMaterial color="#a3b3b4" roughness={0.38} metalness={0.22} />
          </mesh>
        ))}
        <mesh position={[0, 0.002, -0.042]}>
          <boxGeometry args={[0.25, 0.096, 0.01]} />
          <meshStandardMaterial color="#10212b" emissive="#07151b" emissiveIntensity={0.24} roughness={0.34} metalness={0.05} />
        </mesh>
        <mesh position={[0, -0.12, 0.018]}>
          <boxGeometry args={[0.14, 0.046, 0.052]} />
          <meshStandardMaterial color="#151922" roughness={0.44} metalness={0.16} />
        </mesh>
        <mesh position={[0, 0.012, -0.049]}>
          <boxGeometry args={[0.13, 0.016, 0.006]} />
          <meshStandardMaterial color="#86f2d1" emissive="#1b6753" emissiveIntensity={0.44} roughness={0.34} metalness={0.04} />
        </mesh>
        <mesh position={[-0.045, -0.028, -0.05]}>
          <boxGeometry args={[0.052, 0.014, 0.006]} />
          <meshStandardMaterial color="#7fc7ff" emissive="#1b4f6b" emissiveIntensity={0.38} roughness={0.34} metalness={0.04} />
        </mesh>
        <mesh position={[0.052, -0.028, -0.05]}>
          <boxGeometry args={[0.066, 0.014, 0.006]} />
          <meshStandardMaterial color="#ffd166" emissive="#6a4b11" emissiveIntensity={0.34} roughness={0.34} metalness={0.04} />
        </mesh>
        {Array.from({ length: 7 }).map((_, index) => {
          const active = index < lit;
          const color = index < 3 ? "#24c06f" : index < 5 ? "#ffd166" : "#ff3b5c";
          return (
            <mesh key={index} position={[-0.126 + index * 0.042, 0.1, -0.046]}>
              <boxGeometry args={[0.026, 0.014, 0.01]} />
              <meshStandardMaterial color={active ? color : "#28303a"} emissive={active ? color : "#000000"} emissiveIntensity={active ? 1.25 : 0} roughness={0.36} metalness={0.04} />
            </mesh>
          );
        })}
        {style !== "none" && ([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.245, -0.01, -0.008]} rotation={[0, 0, side * 0.12]}>
            <CockpitGrip side={side} style={style} grip="formula" />
          </group>
        ))}
      </group>
    </group>
  );
}

function KartCockpit({ car, color, cockpitStyle }: { car: CarState; color: string; cockpitStyle: CockpitStyle }) {
  const group = useCockpitPose(car, 0.34);
  const frontSteer = visualWheelSteer(car.steer, 0.58);
  return (
    <group ref={group.ref} position={group.position} rotation={group.rotation}>
      <mesh position={[0, -0.24, 1.2]}>
        <boxGeometry args={[0.82, 0.08, 1.7]} />
        <meshStandardMaterial color="#303e45" roughness={0.8} />
      </mesh>
      <BodyPanel sections={KART_NOSE} color={color} stripe={0.12} position={[0, -0.15, 1.35]} />
      <mesh position={[0, -0.21, 1.28]}>
        <boxGeometry args={[1.58, 0.055, 0.055]} />
        <meshStandardMaterial color="#6c8188" roughness={0.4} metalness={0.22} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`kart-cockpit-frame-${side}`}>
          <mesh position={[side * 0.34, -0.205, 0.78]} rotation={[0, side * 0.1, 0]}>
            <boxGeometry args={[0.055, 0.055, 1.26]} />
            <meshStandardMaterial color="#6c8188" roughness={0.4} metalness={0.22} />
          </mesh>
          <mesh position={[side * 0.46, -0.16, 0.95]} rotation={[0, side * 0.55, 0]}>
            <boxGeometry args={[0.035, 0.035, 0.76]} />
            <meshStandardMaterial color="#52676d" roughness={0.45} metalness={0.2} />
          </mesh>
          <mesh position={[side * 0.68, -0.16, 1.12]} rotation={[0, side * 0.2, 0]}>
            <boxGeometry args={[0.05, 0.05, 0.34]} />
            <meshStandardMaterial color="#52676d" roughness={0.45} metalness={0.2} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.0, 0.72]} rotation={[0.52, 0, 0]}>
        <boxGeometry args={[0.07, 0.07, 0.86]} />
        <meshStandardMaterial color="#52676d" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.14, 0.62]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.28, 0.045, 0.06]} />
        <meshStandardMaterial color="#12171d" roughness={0.44} metalness={0.28} />
      </mesh>
      <mesh position={[0, -0.18, 0.42]}>
        <boxGeometry args={[0.52, 0.05, 0.18]} />
        <meshStandardMaterial color="#101214" roughness={0.52} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`kart-pedal-${side}`} position={[side * 0.16, -0.12, 0.5]} rotation={[-0.28, 0, 0]}>
          <boxGeometry args={[0.12, 0.035, 0.16]} />
          <meshStandardMaterial color="#303640" roughness={0.5} metalness={0.22} />
        </mesh>
      ))}
      {[[-0.74, 1.28], [0.74, 1.28]].map(([x, z]) => (
        <group key={x} position={[x, -0.2, z]}>
          <VehicleWheel radius={0.25} width={0.18} distance={car.wheelDistance} side={x < 0 ? -1 : 1} steer={frontSteer} />
        </group>
      ))}
      <group position={[0, -0.09, 0.36]} scale={[0.68, 0.68, 0.68]}>
        <CockpitWheel steer={car.steer} style={cockpitStyle} />
      </group>
      <group position={[0, 0.215, 0.59]} scale={[0.62, 0.62, 0.62]}>
        <mesh position={[0, -0.09, 0.04]} rotation={[0.42, 0, 0]}>
          <boxGeometry args={[0.045, 0.045, 0.22]} />
          <meshStandardMaterial color="#11161c" roughness={0.44} metalness={0.28} />
        </mesh>
        <mesh position={[0, -0.035, 0.01]}>
          <boxGeometry args={[0.32, 0.035, 0.035]} />
          <meshStandardMaterial color="#151a21" roughness={0.42} metalness={0.26} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={`kart-logger-stay-${side}`} position={[side * 0.1, -0.13, 0.08]} rotation={[0.48, side * 0.1, side * 0.32]}>
            <boxGeometry args={[0.034, 0.034, 0.25]} />
            <meshStandardMaterial color="#2a333c" roughness={0.4} metalness={0.34} />
          </mesh>
        ))}
        <mesh position={[0, -0.18, 0.15]} rotation={[0.58, 0, 0]}>
          <boxGeometry args={[0.052, 0.052, 0.26]} />
          <meshStandardMaterial color="#2a333c" roughness={0.4} metalness={0.34} />
        </mesh>
        <KartDataLogger speed={car.speed} throttle={car.throttle} />
      </group>
    </group>
  );
}

function KartDataLogger({ speed, throttle }: { speed: number; throttle: number }) {
  const level = clamp(speedToKmh(speed) / 125 + throttle * 0.22, 0, 1);
  const litBars = Math.max(1, Math.round(level * 6));
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.3, 0.16, 0.045]} />
        <meshStandardMaterial color="#090d12" roughness={0.44} metalness={0.14} />
      </mesh>
      <mesh position={[0, 0.008, -0.028]}>
        <boxGeometry args={[0.218, 0.078, 0.008]} />
        <meshStandardMaterial color="#14222a" emissive="#07141a" emissiveIntensity={0.22} roughness={0.38} metalness={0.04} />
      </mesh>
      {Array.from({ length: 6 }).map((_, index) => {
        const active = index < litBars;
        const color = index < 4 ? "#89f7c3" : "#ffb347";
        return (
          <mesh key={index} position={[-0.078 + index * 0.031, 0.024, -0.035]}>
            <boxGeometry args={[0.02, active ? 0.03 : 0.012, 0.006]} />
            <meshStandardMaterial color={active ? color : "#26313a"} emissive={active ? color : "#000000"} emissiveIntensity={active ? 0.6 : 0} roughness={0.36} metalness={0.04} />
          </mesh>
        );
      })}
      <mesh position={[0, -0.034, -0.035]}>
        <boxGeometry args={[0.13, 0.012, 0.006]} />
        <meshStandardMaterial color="#7fc7ff" emissive="#1b4f6b" emissiveIntensity={0.34} roughness={0.36} metalness={0.04} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.118, 0.056, -0.028]}>
          <sphereGeometry args={[0.012, 8, 6]} />
          <meshStandardMaterial color="#55616c" roughness={0.34} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function TruckCockpit({ car, color, cockpitStyle }: { car: CarState; color: string; cockpitStyle: CockpitStyle }) {
  const group = useCockpitPose(car, 0.86);
  return (
    <group ref={group.ref} position={group.position} rotation={group.rotation}>
      <BodyPanel sections={TRUCK_COCKPIT_HOOD} color={color} stripe={0.4} twinStripe />
      <mesh position={[0, 0.02, 0.52]}>
        <boxGeometry args={[2.22, 0.26, 0.46]} />
        <meshStandardMaterial color="#101214" roughness={0.54} />
      </mesh>
      <mesh position={[0, -0.08, 0.78]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[2.32, 0.1, 0.58]} />
        <meshStandardMaterial color="#252b33" roughness={0.46} metalness={0.08} />
      </mesh>
      <mesh position={[0, -0.02, 0.86]} rotation={[-0.08, 0, 0]}>
        <SculptedBox args={[2.28, 0.035, 0.5]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh position={[0, -0.04, 0.86]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[2.2, 0.06, 0.16]} />
        <meshStandardMaterial color="#181b21" roughness={0.44} metalness={0.12} />
      </mesh>
      <mesh position={[0, 0.04, 0.96]}>
        <boxGeometry args={[2.08, 0.035, 0.055]} />
        <meshStandardMaterial color="#101214" roughness={0.48} metalness={0.14} />
      </mesh>
      <mesh position={[-0.84, 0.58, 0.5]} rotation={[0, 0, -0.11]}>
        <cylinderGeometry args={[0.024, 0.024, 1.36, 8]} />
        <meshStandardMaterial color="#39464c" roughness={0.64} />
      </mesh>
      <mesh position={[0.84, 0.58, 0.5]} rotation={[0, 0, 0.11]}>
        <cylinderGeometry args={[0.024, 0.024, 1.36, 8]} />
        <meshStandardMaterial color="#39464c" roughness={0.64} />
      </mesh>
      <mesh position={[0, 1.32, 0.52]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.022, 0.022, 1.74, 8]} />
        <meshStandardMaterial color="#39464c" roughness={0.64} />
      </mesh>
      <mesh position={[0, 1.34, 0.4]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[1.82, 0.045, 0.1]} />
        <meshStandardMaterial color="#101214" roughness={0.46} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`truck-cage-side-${side}`} position={[side * 0.82, 0.94, 0.46]} rotation={[0.2, side * -0.04, side * 0.14]}>
          <cylinderGeometry args={[0.016, 0.016, 1.1, 8]} />
          <meshStandardMaterial color="#20252d" roughness={0.42} metalness={0.16} />
        </mesh>
      ))}
      <mesh position={[0, 0.2, 0.74]} rotation={[0.84, 0, 0]}>
        <boxGeometry args={[0.07, 0.07, 0.46]} />
        <meshStandardMaterial color="#171b22" roughness={0.44} metalness={0.22} />
      </mesh>
      <TruckGaugeCluster speed={car.speed} throttle={car.throttle} />
      <group position={[0, -0.02, 0.28]} rotation={[-0.14, 0, 0]} scale={[0.92, 0.92, 0.92]}>
        <CockpitWheel steer={car.steer} style={cockpitStyle} />
      </group>
    </group>
  );
}

function TruckGaugeCluster({ speed, throttle }: { speed: number; throttle: number }) {
  const revNeedle = -0.7 + clamp(throttle, 0, 1) * 1.4;
  return (
    <group position={[0, 0.33, 0.58]} rotation={[-0.08, 0, 0]}>
      <TruckAnalogGauge x={-0.2} needle={revNeedle} accent="#ff8c3a" />
      <TruckDigitalSpeedometer speed={speed} />
    </group>
  );
}

function TruckAnalogGauge({ x, needle, accent }: { x: number; needle: number; accent: string }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.062, 0.062, 0.024, 22]} />
        <meshStandardMaterial color="#080a0d" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, -0.016]} rotation={[0, 0, needle]}>
        <boxGeometry args={[0.009, 0.075, 0.007]} />
        <meshStandardMaterial color={accent} roughness={0.38} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0, -0.022]}>
        <sphereGeometry args={[0.01, 8, 6]} />
        <meshStandardMaterial color="#d9dde4" roughness={0.4} metalness={0.12} />
      </mesh>
    </group>
  );
}

const TRUCK_DIGIT_SEGMENTS: Record<string, readonly string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "c", "d", "e"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
  " ": []
};

const TRUCK_SEGMENT_LAYOUT: Record<string, { position: [number, number, number]; args: [number, number, number] }> = {
  a: { position: [0, 0.032, -0.017], args: [0.034, 0.006, 0.006] },
  b: { position: [0.019, 0.017, -0.017], args: [0.006, 0.032, 0.006] },
  c: { position: [0.019, -0.017, -0.017], args: [0.006, 0.032, 0.006] },
  d: { position: [0, -0.032, -0.017], args: [0.034, 0.006, 0.006] },
  e: { position: [-0.019, -0.017, -0.017], args: [0.006, 0.032, 0.006] },
  f: { position: [-0.019, 0.017, -0.017], args: [0.006, 0.032, 0.006] },
  g: { position: [0, 0, -0.017], args: [0.032, 0.006, 0.006] }
};

function TruckDigitalSpeedometer({ speed }: { speed: number }) {
  const kmh = Math.min(999, Math.max(0, Math.round(speedToKmh(speed))));
  const digits = kmh.toString().padStart(3, " ").split("");
  return (
    <group position={[0.2, 0, 0]}>
      <mesh position={[0, 0, -0.004]}>
        <boxGeometry args={[0.19, 0.096, 0.014]} />
        <meshStandardMaterial color="#06090b" roughness={0.48} metalness={0.08} />
      </mesh>
      <mesh position={[0, -0.057, -0.014]}>
        <boxGeometry args={[0.13, 0.006, 0.005]} />
        <meshStandardMaterial color="#26313a" roughness={0.44} metalness={0.08} />
      </mesh>
      {digits.map((digit, index) => (
        <TruckDigitalDigit key={`${digit}-${index}`} digit={digit} position={[0.056 - index * 0.056, 0.008, 0]} />
      ))}
    </group>
  );
}

function TruckDigitalDigit({ digit, position }: { digit: string; position: [number, number, number] }) {
  return (
    <group position={position}>
      {(TRUCK_DIGIT_SEGMENTS[digit] ?? []).map((segment) => {
        const layout = TRUCK_SEGMENT_LAYOUT[segment];
        const position = [-layout.position[0], layout.position[1], layout.position[2]] as [number, number, number];
        return (
          <mesh key={segment} position={position}>
            <boxGeometry args={layout.args} />
            <meshStandardMaterial color="#8eddbd" emissive="#315f4e" emissiveIntensity={0.5} roughness={0.38} metalness={0.04} />
          </mesh>
        );
      })}
    </group>
  );
}

function TukTukCockpit({ car, color, cockpitStyle }: { car: CarState; color: string; cockpitStyle: CockpitStyle }) {
  const group = useCockpitPose(car, 0.7);
  const motionEnabled = useContext(CockpitMotion);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)"), []);
  const riskLean = car.steer === 0 ? 0 : -Math.sign(car.steer) * car.rolloverRisk * 0.13;
  const riskWobble = Math.sin(car.wheelDistance * 16) * car.rolloverRisk * 0.026;
  const roll = !motionEnabled || reduced.matches ? 0 : car.crashed ? (car.steer < 0 ? 0.8 : -0.8) : -car.steer * clamp(car.speed / 8, 0, 1) * 0.1 + riskLean + riskWobble;
  return (
    <group ref={group.ref} position={group.position} rotation={group.rotation}>
      <group rotation={[0, 0, roll]}>
        <mesh position={[0, -0.16, 0.86]} rotation={[-0.12, 0, 0]}>
          <SculptedBox args={[0.88, 0.22, 0.62]} />
          <meshStandardMaterial color={color} roughness={0.42} metalness={0.08} />
        </mesh>
        <mesh position={[0, -0.02, 0.72]} rotation={[-0.12, 0, 0]}>
          <boxGeometry args={[0.82, 0.1, 0.44]} />
          <meshStandardMaterial color="#3a5055" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.06, 0.54]} rotation={[0.08, 0, 0]}>
          <boxGeometry args={[0.68, 0.1, 0.2]} />
          <meshStandardMaterial color="#101214" roughness={0.48} />
        </mesh>
        <TukTukSpeedometer speed={car.speed} />
        {[-1, 1].map((side) => (
          <group key={`tuktuk-windscreen-post-${side}`}>
            <mesh position={[side * 0.56, 0.64, 0.72]} rotation={[0.08, 0, side * 0.08]}>
              <boxGeometry args={[0.03, 1.1, 0.03]} />
              <meshStandardMaterial color="#101214" roughness={0.44} metalness={0.12} />
            </mesh>
            <mesh position={[side * 0.56, 1.18, 0.75]} rotation={[0.04, 0, side * 0.08]}>
              <boxGeometry args={[0.036, 0.09, 0.036]} />
              <meshStandardMaterial color="#101214" roughness={0.44} metalness={0.12} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.19, 0.72]} rotation={[0.02, 0, 0]}>
          <boxGeometry args={[1.12, 0.032, 0.048]} />
          <meshStandardMaterial color="#101214" roughness={0.44} metalness={0.12} />
        </mesh>
        <mesh position={[0, 1.225, 0.72]} rotation={[0.04, 0, 0]}>
          <boxGeometry args={[1.14, 0.035, 0.28]} />
          <meshStandardMaterial color="#d7be7b" roughness={0.92} metalness={0} />
        </mesh>
        <TukTukHandlebar steer={car.steer} cockpitStyle={cockpitStyle} />
        <CockpitRevLights speed={car.speed} throttle={car.throttle} />
      </group>
    </group>
  );
}

const TUK_TUK_SPEEDO_MAX_KMH = 80;
const TUK_TUK_SPEEDO_TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80] as const;
const TUK_TUK_SPEEDO_LABELS = [
  { label: "0", angle: -2.18, radius: 0.052 },
  { label: "40", angle: 0, radius: 0.054 },
  { label: "80", angle: 2.18, radius: 0.052 }
] as const;

function TukTukSpeedometer({ speed }: { speed: number }) {
  const kmh = Math.max(0, Math.round(speedToKmh(speed)));
  const needle = -2.18 + clamp(kmh / TUK_TUK_SPEEDO_MAX_KMH, 0, 1) * 4.36;
  return (
    <group position={[0, 0.4, 0.55]} scale={[0.82, 0.82, 0.82]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.105, 0.105, 0.026, 28]} />
        <meshStandardMaterial color="#07090d" roughness={0.48} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0, -0.018]}>
        <torusGeometry args={[0.106, 0.006, 8, 28]} />
        <meshStandardMaterial color="#d8dde4" roughness={0.36} metalness={0.22} />
      </mesh>
      {TUK_TUK_SPEEDO_TICKS.map((tick) => {
        const angle = -2.18 + (tick / TUK_TUK_SPEEDO_MAX_KMH) * 4.36;
        const radius = tick % 20 === 0 ? 0.078 : 0.083;
        return (
          <mesh key={tick} position={[-Math.sin(angle) * radius, Math.cos(angle) * radius, -0.021]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.006, tick % 20 === 0 ? 0.026 : 0.018, 0.005]} />
            <meshStandardMaterial color="#dce4e8" emissive="#dce4e8" emissiveIntensity={0.1} roughness={0.4} metalness={0.05} />
          </mesh>
        );
      })}
      {TUK_TUK_SPEEDO_LABELS.map((label) => <TukTukSpeedometerNumber key={label.label} {...label} />)}
      <group rotation={[0, 0, needle]}>
        <mesh position={[0, 0.038, -0.032]}>
          <boxGeometry args={[0.008, 0.082, 0.006]} />
          <meshStandardMaterial color="#ff6b3d" emissive="#69210f" emissiveIntensity={0.22} roughness={0.38} metalness={0.08} />
        </mesh>
        <mesh position={[0, -0.014, -0.032]}>
          <boxGeometry args={[0.006, 0.028, 0.005]} />
          <meshStandardMaterial color="#9b3420" emissive="#371008" emissiveIntensity={0.12} roughness={0.42} metalness={0.08} />
        </mesh>
      </group>
      <mesh position={[0, 0, -0.034]}>
        <sphereGeometry args={[0.015, 10, 8]} />
        <meshStandardMaterial color="#eef3f7" roughness={0.34} metalness={0.16} />
      </mesh>
    </group>
  );
}

function TukTukSpeedometerNumber({ label, angle, radius }: { label: string; angle: number; radius: number }) {
  const digits = label.split("");
  return (
    <group position={[-Math.sin(angle) * radius, Math.cos(angle) * radius, -0.032]} scale={[0.34, 0.34, 0.34]}>
      {digits.map((digit, index) => (
        <group key={`${label}-${digit}-${index}`} position={[((digits.length - 1) / 2 - index) * 0.052, 0, 0]}>
          {(TRUCK_DIGIT_SEGMENTS[digit] ?? []).map((segment) => {
            const layout = TRUCK_SEGMENT_LAYOUT[segment];
            const position = [-layout.position[0], layout.position[1], 0] as [number, number, number];
            const args = [layout.args[0], layout.args[1], 0.005] as [number, number, number];
            return (
              <mesh key={segment} position={position}>
                <boxGeometry args={args} />
                <meshStandardMaterial color="#e8edf0" emissive="#586269" emissiveIntensity={0.16} roughness={0.42} metalness={0.04} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}

function TukTukHandlebar({ steer, cockpitStyle }: { steer: number; cockpitStyle: CockpitStyle }) {
  const turn = -clamp(steer, -1, 1) * 0.42;
  return (
    <group position={[0, 0.25, 0.36]} rotation={[0, turn, 0]}>
      <mesh position={[0, -0.08, 0.22]} rotation={[0.45, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.5]} />
        <meshStandardMaterial color="#8b9b9c" roughness={0.42} metalness={0.22} />
      </mesh>
      <mesh position={[0, 0.06, 0.02]}>
        <boxGeometry args={[0.58, 0.05, 0.05]} />
        <meshStandardMaterial color="#8b9b9c" roughness={0.42} metalness={0.22} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`tuktuk-grip-${side}`} position={[side * 0.36, 0.06, 0.02]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.042, 0.042, 0.18, 16]} />
            <meshStandardMaterial color="#303940" roughness={0.94} />
          </mesh>
          <mesh position={[side * 0.1, -0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.12, 12]} />
            <meshStandardMaterial color="#20242a" roughness={0.45} metalness={0.18} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.07, 0.15]} rotation={[-0.16, 0, 0]}>
        <boxGeometry args={[0.15, 0.038, 0.07]} />
        <meshStandardMaterial color="#181b21" roughness={0.5} metalness={0.08} />
      </mesh>
      {cockpitStyle !== "none" && ([-1, 1] as const).map((side) => (
        <group key={side} position={[side * 0.36, 0.06, 0.02]}>
          <CockpitGrip side={side} style={cockpitStyle} grip="bar" />
        </group>
      ))}
    </group>
  );
}

function useCockpitPose(car: CarState, yOffset: number) {
  const ref = useRef<THREE.Group>(null);
  const motionState = useRef(createBodyDynamics());
  const enabled = useContext(CockpitMotion);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)"),
    [],
  );
  const initial = useRef({
    x: car.x,
    y: car.y,
    z: car.z,
    heading: car.heading,
  });
  useFrame((_, delta) => {
    if (!ref.current) return;
    const motion = stepBodyDynamics(
      motionState.current,
      car,
      delta,
      !enabled || reduced.matches,
    );
    const amount = smoothingAmount(delta, RACE_FOCUS_SMOOTHING_RESPONSE);
    ref.current.position.x = THREE.MathUtils.lerp(
      ref.current.position.x,
      car.x,
      amount,
    );
    ref.current.position.y = THREE.MathUtils.lerp(
      ref.current.position.y,
      car.y + yOffset + motion.heave,
      amount,
    );
    ref.current.position.z = THREE.MathUtils.lerp(
      ref.current.position.z,
      car.z,
      amount,
    );
    ref.current.rotation.y = lerpAngle(
      ref.current.rotation.y,
      car.heading,
      amount,
    );
    ref.current.rotation.x = motion.pitch;
    ref.current.rotation.z = motion.roll;
  });
  return {
    ref,
    position: [
      initial.current.x,
      initial.current.y + yOffset,
      initial.current.z,
    ] as [number, number, number],
    rotation: [0, initial.current.heading, 0] as [number, number, number],
  };
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

function VehicleColourLineup() {
  const xGap = 2.9;
  const zGap = 3.3;
  const centerX = ((COLORS.length - 1) * xGap) / 2;
  const centerZ = ((VEHICLE_ORDER.length - 1) * zGap) / 2;
  return (
    <group>
      {VEHICLE_ORDER.flatMap((vehicleId, row) => (
        COLORS.map((color, col) => (
          <group key={`${vehicleId}-${color}`} position={[col * xGap - centerX, 0, row * zGap - centerZ]}>
            <CarModel car={devAssetCar(vehicleId)} color={color} />
          </group>
        ))
      ))}
    </group>
  );
}

function DriverWheelPreview({ cockpitStyle }: { cockpitStyle: Exclude<CockpitStyle, "none"> }) {
  return (
    <group position={[0, -0.1, -0.08]}>
      <CockpitWheel steer={DEV_ASSET_CAR.steer} style={cockpitStyle} />
    </group>
  );
}

function CockpitWheel({ steer, style }: { steer: number; style: CockpitStyle }) {
  const turn = -clamp(steer, -1, 1) * 0.8;
  return (
    <group position={[0, 0.42, 0.48]} rotation={[Math.PI / 2, 0, 0]}>
      <group rotation={[0, 0, turn]}>
        <mesh>
          <torusGeometry args={[0.42, 0.035, 8, 30]} />
          <meshStandardMaterial color="#303940" roughness={0.94} />
        </mesh>
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((angle) => (
          <mesh key={angle} position={[Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, 0]} rotation={[0, 0, angle]}>
            <boxGeometry args={[0.44, 0.035, 0.035]} />
            <meshStandardMaterial color="#9aaeb2" roughness={0.4} metalness={0.2} />
          </mesh>
        ))}
        {style !== "none" && ([-1, 1] as const).map((side) => (
          <group key={side} position={[side * 0.42, 0, 0]}>
            <CockpitGrip side={side} style={style} grip="wheel" />
          </group>
        ))}
      </group>
    </group>
  );
}

function courseMapSamples(track: TrackDef) {
  return Array.from({ length: 181 }, (_,i) => sampleTrack(track, raceCourseLength(track) * i / 180));
}

function MiniTrack({ track }: { track: TrackDef }) {
  const { minX, maxX, minZ, maxZ } = track.finishFraction ? boundsFromSamples(courseMapSamples(track)) : getTrackBounds(track);
  const points = courseMapSamples(track)
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
  return boundsFromSamples(sampleTrackVisuals(track, 4));
}

function boundsFromSamples(samples: Array<{ x: number; y: number; z: number }>): TrackBounds {
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

function clearTrackPropPosition(
  track: TrackDef,
  point: { x: number; y?: number; z: number },
  radius = 0,
  padding = 0.75,
) {
  const requiredDistance =
    track.width / 2 + track.curbWidth + track.wallMargin + radius + padding;
  let x = point.x;
  let z = point.z;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nearest = nearestTrackPoint(track, { x, y: point.y, z });
    const missing = requiredDistance - nearest.distance;
    if (missing <= 0)
      return {
        x,
        y:
          track.sceneryId === "causeway" &&
          radius <= 3 &&
          !isCausewayBridgeProgress(
            nearest.progress / trackMetrics(track).totalLength,
          )
            ? coastPropHeight(track, x, z, nearest) + 0.03
            : nearest.y,
        z,
      };

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
  return {
    x,
    y:
      track.sceneryId === "causeway" &&
      radius <= 3 &&
      !isCausewayBridgeProgress(
        nearest.progress / trackMetrics(track).totalLength,
      )
        ? coastPropHeight(track, x, z, nearest) + 0.03
        : nearest.y,
    z,
  };
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
  const [controllerNearbyAudioCars, setControllerNearbyAudioCars] = useState<NearbyAudioCar[]>([]);
  const [controllerNearbyCrashEvents, setControllerNearbyCrashEvents] = useState<CrashEvent[]>([]);
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
          sessionStorage.setItem(DISPLAY_SESSION_KEY, JSON.stringify({ roomCode: message.roomCode, displayGroupId: message.displayGroupId }));
        }
        if (message.type === "joined_controller") {
          setPlayerId(message.playerId);
          setDisplayGroupId(message.displayGroupId);
          setJoinedToken(message.token);
          setNotice(undefined);
        }
        if (message.type === "room_state") {
          if (!location.pathname.startsWith("/controller")) recordRaceReplay(message.state, message.serverNow);
          if (message.state.phase === "lobby" || message.state.phase === "countdown") setFeedback(current => message.state.cars.find(car => car.playerId === current?.playerId));
          setRoom(message.state);
        }
        if (message.type === "race_snapshot") {
          if (!location.pathname.startsWith("/controller")) recordRaceReplay(message.snapshot, message.serverNow);
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
          setControllerNearbyAudioCars(message.nearbyAudioCars ?? []);
          setControllerNearbyCrashEvents(message.nearbyCrashEvents ?? []);
          setControllerCountdownMark(message.countdownMark);
          setRoom((current) => current ? { ...current, phase: message.roomPhase } : current);
        }
        if (message.type === "room_closed") {
          console.warn(message.message);
          clearDisplaySession();
          setRoom(undefined);
          setDisplayGroupId(undefined);
          setPlayerId(undefined);
          setJoinedToken(undefined);
          setFeedback(undefined);
          setControllerCrashEvents([]);
          setControllerNearbyAudioCars([]);
          setControllerNearbyCrashEvents([]);
          setControllerCountdownMark(undefined);
          setNotice({ id: Date.now(), message: message.message });
        }
        if (message.type === "error_notice") {
          console.warn(message.message);
          if (message.message === "Room not found.") {
            clearDisplaySession();
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
        setControllerNearbyAudioCars([]);
        setControllerNearbyCrashEvents([]);
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

  return { room, clientId, displayGroupId, playerId, joinedToken, liveStats, feedback, controllerCrashEvents, controllerNearbyAudioCars, controllerNearbyCrashEvents, controllerCountdownMark, notice, isConnected, send };
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

function readStoredBoolean(key: string, fallback: boolean) {
  const value = localStorage.getItem(key);
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function defaultSteeringSensitivityLevel(vehicleId: VehicleId) {
  return VEHICLE_STEERING_SENSITIVITY_DEFAULTS[vehicleId] ?? VEHICLE_STEERING_SENSITIVITY_DEFAULTS[DEFAULT_VEHICLE_ID];
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
    const value = sessionStorage.getItem(DISPLAY_SESSION_KEY) ?? sessionStorage.getItem(LEGACY_DISPLAY_SESSION_KEY);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as { roomCode?: string; displayGroupId?: string };
    if (!parsed.roomCode || !parsed.displayGroupId) return undefined;
    return { roomCode: parsed.roomCode, displayGroupId: parsed.displayGroupId };
  } catch {
    return undefined;
  }
}

function clearDisplaySession() {
  sessionStorage.removeItem(DISPLAY_SESSION_KEY);
  sessionStorage.removeItem(LEGACY_DISPLAY_SESSION_KEY);
}

function wsUrl() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws`;
}

async function enableControllerDevice(options: { landscape?: boolean } = {}) {
  const motion = await requestMotion();
  if (options.landscape ?? true) await requestLandscape();
  return motion;
}

function phoneIsLandscape(angle = getScreenAngle()) {
  return window.innerWidth > window.innerHeight || screenAngleIsLandscape(angle);
}

async function requestMotion() {
  if (!sensorSupported()) {
    return { enabled: false, message: "Motion unavailable in this browser", permissions: "perm ?" };
  }
  if (!motionContextAllowed()) {
    return { enabled: false, message: "Motion needs HTTPS on this phone", permissions: "perm ?" };
  }

  if (explicitMotionPermissionRequired()) {
    return requestExplicitMotionPermission();
  }

  const permissions = await readSensorPermissionStatus();
  if (permissions.includes("denied")) {
    return { enabled: false, message: "Chrome motion sensors blocked", permissions };
  }

  try {
    const permissionRequests = await requestSensorPermissions();
    if (permissionRequests.length > 0 && !permissionRequests.some((permission) => permission.status === "fulfilled" && permission.value === "granted")) {
      if (permissionRequests.some((permission) => permission.status === "rejected")) {
        return { enabled: false, message: "Tap Enable Motion again", permissions };
      }
      return { enabled: false, message: "Motion permission denied", permissions };
    }
  } catch {
    return { enabled: false, message: "Tap Enable Motion again", permissions };
  }

  return { enabled: true, message: "Motion ready", permissions };
}

async function requestExplicitMotionPermission() {
  try {
    const permissionRequests = await requestSensorPermissions();
    const permissions = await readSensorPermissionStatus();
    if (permissionRequests.length > 0 && !permissionRequests.some((permission) => permission.status === "fulfilled" && permission.value === "granted")) {
      if (permissionRequests.some((permission) => permission.status === "rejected")) {
        return { enabled: false, message: "Tap Enable Tilt again", permissions };
      }
      return { enabled: false, message: "Tilt permission denied", permissions };
    }
    return { enabled: true, message: "Motion ready", permissions };
  } catch {
    const permissions = await readSensorPermissionStatus();
    return { enabled: false, message: "Tap Enable Tilt again", permissions };
  }
}

async function requestSensorPermissions() {
  const permissionRequests = [
    motionPermissionRequest("DeviceMotionEvent"),
    motionPermissionRequest("DeviceOrientationEvent")
  ].filter((request): request is Promise<PermissionState> => Boolean(request));

  if (permissionRequests.length === 0) return [];
  return Promise.allSettled(permissionRequests);
}

function motionPermissionRequest(eventName: "DeviceMotionEvent" | "DeviceOrientationEvent") {
  const eventConstructor = motionPermissionConstructor(eventName);
  if (typeof eventConstructor?.requestPermission !== "function") return undefined;
  return eventConstructor.requestPermission();
}

function explicitMotionPermissionRequired() {
  return typeof window !== "undefined" && (
    typeof motionPermissionConstructor("DeviceMotionEvent")?.requestPermission === "function"
    || typeof motionPermissionConstructor("DeviceOrientationEvent")?.requestPermission === "function"
  );
}

function motionPermissionConstructor(eventName: "DeviceMotionEvent" | "DeviceOrientationEvent") {
  return (window as Window & Record<"DeviceMotionEvent" | "DeviceOrientationEvent", MotionPermissionConstructor | undefined>)[eventName];
}

async function readSensorPermissionStatus() {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "perm ?";
  const names = [
    ["a", "accelerometer"],
    ["g", "gyroscope"],
    ["m", "magnetometer"]
  ] as const;
  const states = await Promise.all(names.map(async ([label, name]) => {
    try {
      const status = await navigator.permissions.query({ name: name as PermissionName });
      return `${label}:${status.state}`;
    } catch {
      return `${label}:?`;
    }
  }));
  return `perm ${states.join(" ")}`;
}

function motionInitialStatus() {
  if (!sensorSupported()) return "Touch steering";
  if (!motionContextAllowed()) return "Motion needs HTTPS";
  if (explicitMotionPermissionRequired()) return "Enable tilt steering";
  return "Motion waiting";
}

function motionLobbyStatus() {
  if (!sensorSupported()) return "Motion unavailable";
  if (!motionContextAllowed()) return "Motion needs HTTPS on this phone";
  if (explicitMotionPermissionRequired()) return "Enable tilt steering";
  return "Motion ready";
}

function sensorSupported() {
  return typeof window !== "undefined" && (
    "DeviceOrientationEvent" in window
    || "DeviceMotionEvent" in window
    || "GravitySensor" in window
    || "Accelerometer" in window
  );
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

function screenAngleIsLandscape(angle: number) {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  return normalizedAngle === 90 || normalizedAngle === 270;
}

function motionOrientationFrameKey(angle = getScreenAngle(), source: MotionSource = "orientation") {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  return `${source}:${normalizedAngle}:${phoneIsLandscape(angle) ? "landscape" : "portrait"}`;
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

function listenToSteeringMotion(onSample: (sample: MotionSample) => void, onDebug?: (event: MotionDebugEvent) => void) {
  let lastOrientationAt = 0;
  let lastMotionAt = 0;
  let lastGravitySensorAt = 0;
  const sensors: MotionSensorInstance[] = [];

  const onOrientation = (event: DeviceOrientationEvent) => {
    onDebug?.({ kind: "event", source: event.beta === null && event.gamma === null ? "orientation-null" : "orientation" });
    if (event.beta === null && event.gamma === null) return;
    const angle = getScreenAngle();
    lastOrientationAt = performance.now();
    const sample = { raw: readSteeringTilt(event, angle), angle, source: "orientation" as const };
    onDebug?.({ kind: "sample", ...sample });
    onSample(sample);
  };

  const onMotion = (event: DeviceMotionEvent) => {
    if (performance.now() - lastOrientationAt < 500) return;
    const angle = getScreenAngle();
    const raw = readSteeringMotion(event, angle);
    onDebug?.({ kind: "event", source: raw === undefined ? "motion-empty" : "motion" });
    if (raw === undefined) return;
    lastMotionAt = performance.now();
    onDebug?.({ kind: "sample", raw, angle, source: "motion" });
    onSample({ raw, angle, source: "motion" });
  };

  if ("DeviceOrientationEvent" in window) window.addEventListener("deviceorientation", onOrientation);
  if ("DeviceMotionEvent" in window) window.addEventListener("devicemotion", onMotion);
  startMotionSensor("GravitySensor", "gravity", sensors, () => Math.max(lastOrientationAt, lastMotionAt), onDebug, (raw, angle) => {
    lastGravitySensorAt = performance.now();
    onSample({ raw, angle, source: "gravity" });
  });
  startMotionSensor("Accelerometer", "accelerometer", sensors, () => Math.max(lastOrientationAt, lastMotionAt, lastGravitySensorAt), onDebug, (raw, angle) => {
    onSample({ raw, angle, source: "accelerometer" });
  });

  return () => {
    window.removeEventListener("deviceorientation", onOrientation);
    window.removeEventListener("devicemotion", onMotion);
    sensors.forEach((sensor) => sensor.stop());
  };
}

function startMotionSensor(
  sensorName: MotionSensorName,
  source: "gravity" | "accelerometer",
  sensors: MotionSensorInstance[],
  higherPriorityLastSampleAt: () => number,
  onDebug: ((event: MotionDebugEvent) => void) | undefined,
  onSample: (raw: number, angle: number) => void
) {
  const SensorConstructor = (window as unknown as Record<MotionSensorName, MotionSensorConstructor | undefined>)[sensorName];
  if (typeof SensorConstructor !== "function") return;

  try {
    const sensor = new SensorConstructor({ frequency: 45, referenceFrame: "device" });
    sensor.addEventListener("reading", () => {
      if (performance.now() - higherPriorityLastSampleAt() < 500) return;
      const angle = getScreenAngle();
      const raw = readSteeringGravity(sensor.x, sensor.y, sensor.z, angle);
      onDebug?.({ kind: "event", source });
      if (raw === undefined) return;
      onDebug?.({ kind: "sample", source, raw, angle });
      onSample(raw, angle);
    });
    sensor.addEventListener("error", () => {
      onDebug?.({ kind: "sensor-error", source, message: `${sensorName} error` });
      sensor.stop();
    });
    sensor.start();
    sensors.push(sensor);
  } catch (error) {
    const name = error instanceof Error ? error.name : "blocked";
    onDebug?.({ kind: "sensor-error", source, message: `${sensorName} ${name}` });
    // Generic Sensor is a Chrome-only fallback here; legacy events still cover other browsers.
  }
}

function readSteeringTilt(event: DeviceOrientationEvent, angle: number) {
  const beta = event.beta ?? 0;
  const gamma = event.gamma ?? 0;
  return readSteeringTiltValues(beta, gamma, angle);
}

function readSteeringMotion(event: DeviceMotionEvent, angle: number) {
  const gravity = event.accelerationIncludingGravity;
  if (!gravity) return undefined;

  return readSteeringGravity(gravity.x, gravity.y, gravity.z, angle);
}

function readSteeringGravity(gravityX: number | null | undefined, gravityY: number | null | undefined, gravityZ: number | null | undefined, angle: number) {
  const x = gravityX ?? 0;
  const y = gravityY ?? 0;
  const z = gravityZ ?? 0;
  if (Math.hypot(x, y, z) < 1) return undefined;

  // Chrome can withhold fused orientation events on some phones. The gravity
  // projection gives us the same small-angle tilt signal from motion sensors.
  const beta = THREE.MathUtils.radToDeg(Math.atan2(y, Math.hypot(x, z)));
  const gamma = THREE.MathUtils.radToDeg(Math.atan2(x, Math.hypot(y, z)));
  return readSteeringTiltValues(beta, gamma, angle);
}

function readSteeringTiltValues(beta: number, gamma: number, angle: number) {
  const normalizedAngle = ((angle % 360) + 360) % 360;
  const isLandscape = phoneIsLandscape(angle);

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

function motionLiveStatus(source: MotionSource) {
  if (source === "orientation") return "Motion live";
  if (source === "motion") return "Motion fallback live";
  return "Motion sensor live";
}

function motionRaceStatus(source: MotionSource) {
  if (source === "orientation") return "Motion steering";
  if (source === "motion") return "Motion fallback steering";
  return "Motion sensor steering";
}

function motionDebugInitial(): MotionDebugState {
  return {
    secure: motionContextAllowed(),
    policy: motionPolicyStatus(),
    permissions: "perm ?",
    request: "not requested",
    orientationEvents: 0,
    motionEvents: 0,
    gravityReadings: 0,
    accelerometerReadings: 0,
    emptyEvents: 0,
    errors: 0,
    last: "waiting"
  };
}

function updateMotionDebug(current: MotionDebugState, event: MotionDebugEvent): MotionDebugState {
  const next = {
    ...current,
    secure: motionContextAllowed(),
    policy: motionPolicyStatus()
  };

  if (event.kind === "request") {
    return { ...next, request: event.message, last: event.message };
  }

  if (event.kind === "permissions") {
    return { ...next, permissions: event.status };
  }

  if (event.kind === "sensor-error") {
    return { ...next, errors: next.errors + 1, last: event.message };
  }

  if (event.kind === "event") {
    if (event.source === "orientation") return { ...next, orientationEvents: next.orientationEvents + 1 };
    if (event.source === "motion") return { ...next, motionEvents: next.motionEvents + 1 };
    if (event.source === "gravity") return { ...next, gravityReadings: next.gravityReadings + 1 };
    if (event.source === "accelerometer") return { ...next, accelerometerReadings: next.accelerometerReadings + 1 };
    return { ...next, emptyEvents: next.emptyEvents + 1, last: event.source };
  }

  return {
    ...next,
    last: `${event.source} ${event.raw.toFixed(1)} @ ${Math.round(event.angle)}`
  };
}

function formatMotionDebug(debug: MotionDebugState) {
  const context = debug.secure ? "secure" : "not secure";
  return `Motion debug: ${context}; ${debug.policy}; ${debug.permissions}; request ${debug.request}; events o${debug.orientationEvents} m${debug.motionEvents} g${debug.gravityReadings} a${debug.accelerometerReadings} empty${debug.emptyEvents} err${debug.errors}; last ${debug.last}`;
}

function motionPolicyStatus() {
  if (typeof document === "undefined") return "policy ?";
  const policyHost = document as Document & {
    featurePolicy?: { allowsFeature?: (feature: string) => boolean };
    permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
  };
  const policy = policyHost.permissionsPolicy ?? policyHost.featurePolicy;
  if (typeof policy?.allowsFeature !== "function") return "policy ?";

  try {
    const features = [
      ["a", "accelerometer"],
      ["g", "gyroscope"],
      ["m", "magnetometer"]
    ] as const;
    return features.map(([label, feature]) => `${label}${policy.allowsFeature?.(feature) ? "+" : "-"}`).join(" ");
  } catch {
    return "policy ?";
  }
}

function motionSamplesStable(values: number[]) {
  if (values.length < MOTION_NEUTRAL_MIN_SAMPLES) return false;
  return Math.max(...values) - Math.min(...values) <= MOTION_NEUTRAL_MAX_SPREAD;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = Array.from(values);
  sorted.sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

type ControllerAudio = {
  context: AudioContext;
  engineVoice: EngineVoice;
  tireSource: AudioBufferSourceNode;
  tireGain: GainNode;
  tireFilter: BiquadFilterNode;
  brakeOsc: OscillatorNode;
  brakeGain: GainNode;
  curbOsc: OscillatorNode;
  curbGain: GainNode;
  rivalLayers: RivalAudioLayer[];
  masterGain: GainNode;
  lastCountdownMark?: number | "go";
  lastImpactAt: number;
  lastCrashEventId?: string;
  lastNearbyCrashEventId?: string;
};

type RivalAudioLayer = {
  playerId?: string;
  engineOsc: OscillatorNode;
  engineGain: GainNode;
  airSource: AudioBufferSourceNode;
  airFilter: BiquadFilterNode;
  airGain: GainNode;
  pan: StereoPannerNode;
};

const RIVAL_AUDIO_MAX_LAYERS = 3;
const RIVAL_AUDIO_MAX_DISTANCE = 48;

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
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = .002;
  limiter.release.value = .12;
  masterGain.connect(limiter);
  limiter.connect(context.destination);

  const noise = createNoiseBuffer(context);
  const engineVoice = createEngineVoice(context, masterGain, noise);

  const tireSource = context.createBufferSource();
  tireSource.buffer = noise;
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

  const rivalLayers = Array.from({ length: RIVAL_AUDIO_MAX_LAYERS }, () => createRivalAudioLayer(context, masterGain));

  return {
    context,
    engineVoice,
    tireSource,
    tireGain,
    tireFilter,
    brakeOsc,
    brakeGain,
    curbOsc,
    curbGain,
    rivalLayers,
    masterGain,
    lastImpactAt: 0
  };
}

function createRivalAudioLayer(context: AudioContext, masterGain: GainNode): RivalAudioLayer {
  const pan = context.createStereoPanner();

  const engineOsc = context.createOscillator();
  const engineGain = context.createGain();
  engineOsc.type = "triangle";
  engineOsc.frequency.value = 64;
  engineGain.gain.value = 0;
  engineOsc.connect(engineGain);
  engineGain.connect(pan);
  engineOsc.start();

  const airSource = context.createBufferSource();
  airSource.buffer = createNoiseBuffer(context);
  airSource.loop = true;
  const airFilter = context.createBiquadFilter();
  const airGain = context.createGain();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 1800;
  airFilter.Q.value = 0.8;
  airGain.gain.value = 0;
  airSource.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(pan);
  airSource.start();

  pan.connect(masterGain);
  return { engineOsc, engineGain, airSource, airFilter, airGain, pan };
}

function updateControllerAudio(audio: ControllerAudio | null, car: CarState | undefined, room: RoomState, pedals: { throttle: number; brake: number }, crashEvents: CrashEvent[], nearbyAudioCars: NearbyAudioCar[], nearbyCrashEvents: CrashEvent[], countdownMark?: number) {
  if (!audio || audio.context.state !== "running") return;
  if (room.phase !== "countdown" && room.phase !== "racing") {
    silenceControllerAudio(audio);
    return;
  }

  if (car?.finished || car?.dnf) { silenceControllerAudio(audio); return; }
  const now = audio.context.currentTime;
  const raceCar = car;
  const speed = raceCar?.speed ?? 0;
  const throttle = raceCar?.throttle ?? pedals.throttle;
  const brake = raceCar?.brake ?? pedals.brake;
  const slip = raceCar?.slip ?? 0;
  const surface = raceCar?.surface ?? "road";
  const impact = raceCar?.impact ?? 0;
  const crashEvent = crashEvents[crashEvents.length - 1];
  const profile = getVehicle(raceCar?.vehicleId).audio;

  updateEngineVoice(audio.engineVoice, raceCar, now, room.settings.equalPace);

  const nearLimit = speed > 4 && (surface === "road" || surface === "curb")
    ? clamp(((raceCar?.gripUsage ?? 0) - .68) / .32, 0, 1) * .15 * (1 - clamp(slip * 2, 0, 1)) : 0;
  const tireAmount = raceCar?.crashed ? 0 : clamp(slip * .75 + nearLimit + (surface === "grass" ? .38 : 0) + (surface === "curb" ? .25 : 0), 0, 1);
  audio.tireFilter.frequency.setTargetAtTime(profile.tireFilterBaseHz + speed * profile.tireFilterSpeedHz, now, 0.05);
  audio.tireGain.gain.setTargetAtTime(tireAmount * profile.tireGain, now, 0.04);

  const brakeAmount = !raceCar?.crashed && brake > 0.12 && speed > 4 ? brake * clamp(speed / 30, 0, 1) : 0;
  audio.brakeOsc.frequency.setTargetAtTime(profile.brakeBaseHz + brake * profile.brakeRangeHz + speed * 4, now, 0.05);
  audio.brakeGain.gain.setTargetAtTime(brakeAmount * profile.brakeGain, now, 0.04);

  const curbAmount = !raceCar?.crashed && surface === "curb" && speed > 4 ? clamp(speed / 35, 0.15, 1) : 0;
  audio.curbOsc.frequency.setTargetAtTime(profile.curbHz, now, 0.03);
  audio.curbGain.gain.setTargetAtTime(curbAmount * profile.curbGain, now, 0.025);

  if (!raceCar?.crashed && impact > 0.18 && now - audio.lastImpactAt > 0.16) {
    audio.lastImpactAt = now;
    playCue(audio, "impact", impact * profile.impactGain);
  }
  if (crashEvent && audio.lastCrashEventId !== crashEvent.id) {
    audio.lastCrashEventId = crashEvent.id;
    audio.lastImpactAt = now;
    playCue(audio, "explosion", crashEvent.severity);
  }

  updateNearbyAudio(audio, raceCar, nearbyAudioCars);
  updateNearbyCrashAudio(audio, raceCar, nearbyCrashEvents);
  updateCountdownAudio(audio, room, countdownMark);
}

function silenceControllerAudio(audio: ControllerAudio | null) {
  if (!audio) return;
  const now = audio.context.currentTime;
  silenceEngineVoice(audio.engineVoice, now);
  audio.tireGain.gain.setTargetAtTime(0, now, 0.04);
  audio.brakeGain.gain.setTargetAtTime(0, now, 0.04);
  audio.curbGain.gain.setTargetAtTime(0, now, 0.04);
  silenceNearbyAudio(audio, now);
  audio.lastCountdownMark = undefined;
}

function updateNearbyAudio(audio: ControllerAudio, car: CarState | undefined, nearbyAudioCars: NearbyAudioCar[]) {
  const now = audio.context.currentTime;
  if (!car) {
    silenceNearbyAudio(audio, now);
    return;
  }

  const audibleCars = nearbyAudioCars
    .filter((rival) => rival.distance > 0 && rival.distance <= RIVAL_AUDIO_MAX_DISTANCE)
    .slice(0, RIVAL_AUDIO_MAX_LAYERS);
  const activeIds = new Set(audibleCars.map((rival) => rival.playerId));
  const usedLayers = new Set<RivalAudioLayer>();
  const layerByPlayerId = new Map<string, RivalAudioLayer>();
  for (const layer of audio.rivalLayers) {
    if (layer.playerId) layerByPlayerId.set(layer.playerId, layer);
  }

  for (const rival of audibleCars) {
    let layer = layerByPlayerId.get(rival.playerId);
    if (!layer || usedLayers.has(layer)) {
      for (const candidate of audio.rivalLayers) {
        if (!usedLayers.has(candidate) && (!candidate.playerId || !activeIds.has(candidate.playerId))) {
          layer = candidate;
          break;
        }
      }
      if (!layer) continue;
      layer.playerId = rival.playerId;
      layerByPlayerId.set(rival.playerId, layer);
    }
    usedLayers.add(layer);

    const profile = getVehicle(rival.vehicleId).audio;
    const proximity = clamp(1 - rival.distance / RIVAL_AUDIO_MAX_DISTANCE, 0, 1);
    const rev = clamp(rival.speed / profile.revSpeedDivisor + rival.throttle * profile.throttleRev + rival.closingSpeed * 0.012, 0, profile.maxRev * 1.08);
    const pan = clamp(rival.side * (0.35 + proximity * 0.58), -0.92, 0.92);
    const engineGain = clamp((profile.baseGain * 0.42 + rev * profile.revGain * 0.26) * Math.pow(proximity, 1.35), 0, 0.052);
    const passAmount = clamp(Math.pow(proximity, 1.7) * Math.abs(rival.side) * Math.max(rival.relativeSpeed, rival.closingSpeed) / 30, 0, 1);

    layer.engineOsc.type = profile.engineWave;
    layer.engineOsc.frequency.setTargetAtTime(profile.engineBaseHz + rev * profile.engineRangeHz + rival.closingSpeed * 1.7, now, 0.07);
    layer.engineGain.gain.setTargetAtTime(engineGain, now, 0.1);
    layer.airFilter.frequency.setTargetAtTime(950 + rival.speed * 58 + rival.relativeSpeed * 72, now, 0.08);
    layer.airGain.gain.setTargetAtTime(passAmount * 0.028, now, 0.06);
    layer.pan.pan.setTargetAtTime(pan, now, 0.06);
  }

  for (const layer of audio.rivalLayers) {
    if (usedLayers.has(layer)) continue;
    layer.engineGain.gain.setTargetAtTime(0, now, 0.12);
    layer.airGain.gain.setTargetAtTime(0, now, 0.08);
    if (layer.playerId && !activeIds.has(layer.playerId)) layer.playerId = undefined;
  }
}

function silenceNearbyAudio(audio: ControllerAudio, now = audio.context.currentTime) {
  for (const layer of audio.rivalLayers) {
    layer.engineGain.gain.setTargetAtTime(0, now, 0.08);
    layer.airGain.gain.setTargetAtTime(0, now, 0.06);
    layer.playerId = undefined;
  }
}

function updateNearbyCrashAudio(audio: ControllerAudio, car: CarState | undefined, nearbyCrashEvents: CrashEvent[]) {
  if (!car) return;
  const crashEvent = nearbyCrashEvents[nearbyCrashEvents.length - 1];
  if (!crashEvent || audio.lastNearbyCrashEventId === crashEvent.id) return;

  const distance = Math.hypot(crashEvent.x - car.x, crashEvent.z - car.z, ((crashEvent.y ?? car.y) - car.y) * 1.5);
  const proximity = clamp(1 - distance / 72, 0, 1);
  if (proximity <= 0) return;

  audio.lastNearbyCrashEventId = crashEvent.id;
  playCue(audio, "explosion", crashEvent.severity * (0.16 + proximity * 0.28), panForWorldPoint(car, crashEvent.x, crashEvent.z, 72));
}

function panForWorldPoint(car: CarState, x: number, z: number, maxDistance: number) {
  const dx = x - car.x;
  const dz = z - car.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.001) return 0;
  const rightX = Math.sin(car.heading + Math.PI / 2);
  const rightZ = Math.cos(car.heading + Math.PI / 2);
  const side = (dx / distance) * rightX + (dz / distance) * rightZ;
  const proximity = clamp(1 - distance / maxDistance, 0, 1);
  return clamp(side * (0.32 + proximity * 0.62), -0.92, 0.92);
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

function playCue(audio: ControllerAudio, kind: "countdown" | "go" | "impact" | "explosion" | "start", intensity = 1, pan = 0) {
  const context = audio.context;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const panner = context.createStereoPanner();
  const now = context.currentTime;
  const normalizedIntensity = clamp(intensity, 0.001, 1.4);
  const peakGain = kind === "go"
    ? 0.22
    : kind === "explosion"
      ? 0.24 * normalizedIntensity
      : kind === "impact"
        ? 0.18 * normalizedIntensity
        : 0.12;

  osc.type = kind === "impact" || kind === "explosion" ? "square" : kind === "go" ? "triangle" : "sine";
  osc.frequency.value = kind === "go" ? 760 : kind === "countdown" ? 560 : kind === "explosion" ? 54 : kind === "impact" ? 80 : 660;
  panner.pan.value = clamp(pan, -1, 1);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "go" ? 0.44 : kind === "explosion" ? 0.46 : kind === "impact" ? 0.16 : 0.18));
  osc.connect(gain);
  gain.connect(panner);
  panner.connect(audio.masterGain);
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
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function isIOSSafari() {
  if (typeof navigator === "undefined" || !isIOS()) return false;
  return /safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(navigator.userAgent);
}

function controllerBrowserRecommendation() {
  if (isRecommendedAndroidControllerBrowser()) return undefined;
  if (isInAppBrowser()) return "Open this controller in a Chromium-based browser on Android for reliable motion steering and haptics. In-app browsers often block sensors.";
  if (isIOSSafari()) return "Tap Enable tilt steering when prompted. If Safari does not deliver tilt data, use the touch arrows; web vibration is not supported on iPhone.";
  if (isIOS()) return "iPhone browsers use iOS browser limits. Steering can work after permission, but web vibration is not supported.";
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
  const profile = getVehicle(car?.vehicleId).haptics;
  if (crashEvent && lastCrashEventIdRef.current !== crashEvent.id) {
    lastCrashEventIdRef.current = crashEvent.id;
    if (pulseHaptic(profile.crashPattern)) lastHapticAtRef.current = now;
    return;
  }
  if (!car || car.finished || car.dnf || car.crashed) return;
  const speedKmh = speedToKmh(car.speed);
  if (car.impact > 0.2 && now - lastHapticAtRef.current > 240) {
    if (pulseHaptic(Math.round(profile.impactMs + car.impact * profile.impactScale))) lastHapticAtRef.current = now;
    return;
  }
  if (profile.rolloverWarningPattern && car.rolloverRisk > 0.44 && speedKmh > 30 && now - lastHapticAtRef.current > 300) {
    if (pulseHaptic(profile.rolloverWarningPattern)) lastHapticAtRef.current = now;
    return;
  }
  if (pedals.brake > 0.72 && speedKmh > 35 && now - lastHapticAtRef.current > 260) {
    if (pulseHaptic(profile.brakePattern)) lastHapticAtRef.current = now;
    return;
  }
  if (car.surface === "curb" && speedKmh > 18 && now - lastHapticAtRef.current > 120) {
    if (pulseHaptic(profile.curbMs)) lastHapticAtRef.current = now;
    return;
  }
  if (car.surface === "grass" && speedKmh > 20 && now - lastHapticAtRef.current > 180) {
    if (pulseHaptic(profile.grassMs)) lastHapticAtRef.current = now;
    return;
  }
  if ((car.gripUsage ?? 0) > 0.78 && car.slip < 0.5 && car.surface === "road" && speedKmh > 35 && now - lastHapticAtRef.current > 400) {
    if (pulseHaptic(8)) lastHapticAtRef.current = now;
    return;
  }
  if (car.slip > 0.5 && speedKmh > 25 && now - lastHapticAtRef.current > 220) {
    if (pulseHaptic(profile.slipMs)) lastHapticAtRef.current = now;
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
    const sponsorText = "#[oss]vibejam";
    const maxTextWidth = canvas.width - 92;
    let sponsorFontSize = 70;
    context.fillStyle = "#fffaf0";
    context.font = `900 ${sponsorFontSize}px Arial, sans-serif`;
    while (context.measureText(sponsorText).width > maxTextWidth && sponsorFontSize > 42) {
      sponsorFontSize -= 2;
      context.font = `900 ${sponsorFontSize}px Arial, sans-serif`;
    }
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(sponsorText, canvas.width / 2, canvas.height / 2 + 4);
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
