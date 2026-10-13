import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import GameScene from "./GameScene";
import { createGameClient } from "./gameSocket";
import ItemIcon from "./ItemIcon";
import { getFlightAudio, readSoundEnabled, writeSoundEnabled } from "./flightAudio";
import { FLIGHT_MAP_LIST, FLIGHT_MAPS, STAR_THRESHOLDS, starsFor } from "./maps";
import type { Leaderboard, MapId, RoomState } from "./types";
import {
  getStormBoltState,
  getStormLightningGameTime,
  getStormScreenOpacity,
  getStormStrikeIndex,
  seededRandom,
  STORM_PULSE_COUNT,
} from "./stormLightning";

const socket = createGameClient();

type AppScreen = "home" | "lobby" | "game";

const screenOf = (room: RoomState | null): AppScreen => {
  if (!room) return "home";
  return room.status === "lobby" ? "lobby" : "game";
};

const sanitizeFlightCode = (raw: string) =>
  raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);

const isValidFlightCode = (code: string) => /^[A-Z]{4}$/.test(code);

function SoundMark({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path fill="currentColor" d="M3 9.5v5h3.2L12 19.2V4.8L6.2 9.5H3z" />
      {on ? (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M15.2 9.2a4 4 0 0 1 0 5.6M17.6 6.8a7 7 0 0 1 0 10.4"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M16 9.5 21 14.5M21 9.5 16 14.5"
        />
      )}
    </svg>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo ${compact ? "compact" : ""}`}>
      <span className="logo-wing">✦</span>
      <div>
        <small>FLIGHT 001</small>
        OVERBOOKED
      </div>
      <span className="logo-wing">✦</span>
    </div>
  );
}

function Rules({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`rules ${compact ? "compact" : ""}`}>
      <h2>Cabin crew briefing</h2>
      <div className="rule-grid">
        <div><b>1</b><span>Carry up to 3 items, but only one meal — meat, fish, or veg.</span></div>
        <div><b>2</b><span>Match every item in a passenger’s order before time runs out.</span></div>
        <div><b>3</b><span>Select aisle or window to collect their trash, then take it to the front bin.</span></div>
        <div><b>!</b><span>Wrong or duplicate items cost 50 points. Don’t block the aisle!</span></div>
      </div>
      {!compact && (
        <p className="controls-hint">
          MOVE <kbd>WASD</kbd> / <kbd>ARROWS</kbd>
          <span>•</span>
          PICK UP &amp; SERVE <kbd>E</kbd> / <kbd>SPACE</kbd>
          <span>•</span>
          RETURN ITEM <kbd>B</kbd>
        </p>
      )}
    </section>
  );
}

function Home({
  onCreate,
  onJoin,
}: {
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
}) {
  const params = new URLSearchParams(location.search);
  const [name, setName] = useState(() => localStorage.getItem("crew-name") || "");
  const [code, setCode] = useState(() =>
    sanitizeFlightCode(params.get("flight") || ""),
  );
  const [showJoin, setShowJoin] = useState(Boolean(params.get("flight")));

  const saveAnd = (action: () => void) => {
    const cleanName = name.trim();
    if (!cleanName) return;
    localStorage.setItem("crew-name", cleanName);
    action();
  };

  return (
    <main className="home">
      <div className="cloud cloud-one" />
      <div className="cloud cloud-two" />
      <div className="plane-streak">✈</div>
      <div className="home-stack">
      <div className="home-card">
        <Logo />
        <p className="tagline">Fasten your seatbelts. Service is about to get chaotic.</p>
        <label className="field">
          <span>CREW NAME</span>
          <input
            value={name}
            maxLength={14}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your name"
            autoFocus
          />
        </label>
        {showJoin && (
          <label className="field">
            <span>FLIGHT CODE</span>
            <input
              className="code-input"
              value={code}
              maxLength={4}
              onChange={(event) =>
                setCode(sanitizeFlightCode(event.target.value))
              }
              placeholder="ABCD"
              inputMode="text"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
        )}
        <div className="home-actions">
          {showJoin ? (
            <>
              <button
                className="primary"
                disabled={!name.trim() || !isValidFlightCode(code)}
                onClick={() => saveAnd(() => onJoin(name, code))}
              >
                BOARD FLIGHT
              </button>
              <button className="text-button" onClick={() => setShowJoin(false)}>
                Back
              </button>
            </>
          ) : (
            <>
              <button
                className="primary"
                disabled={!name.trim()}
                onClick={() => saveAnd(() => onCreate(name))}
              >
                CREATE FLIGHT
              </button>
              <button className="secondary" onClick={() => setShowJoin(true)}>
                JOIN WITH CODE
              </button>
            </>
          )}
        </div>
      </div>
      <Rules />
      </div>
    </main>
  );
}

function Lobby({
  room,
  playerId,
  leaderboard,
  onStart,
  onSelectMap,
  onCrewName,
}: {
  room: RoomState;
  playerId: string;
  leaderboard: Leaderboard;
  onStart: () => void;
  onSelectMap: (mapId: MapId) => void;
  onCrewName: (crewName: string) => void;
}) {
  const flightCode = sanitizeFlightCode(room.code);
  const selectedMap = FLIGHT_MAPS[room.mapId];
  const standings = leaderboard[room.mapId] ?? [];
  const isHost = playerId === room.hostId;
  const shareUrl = `${location.origin}${location.pathname}?flight=${flightCode}`;
  const [copied, setCopied] = useState(false);
  const [crewDraft, setCrewDraft] = useState(room.crewName);
  const crewFocused = useRef(false);
  const needsCrewName = room.players.length > 1;
  const crewReady = !needsCrewName || (isHost ? crewDraft : room.crewName).trim().length > 0;
  const you = room.players.find((player) => player.id === playerId);
  const listedName = needsCrewName ? (isHost ? crewDraft : room.crewName) : (you?.name ?? "");
  useEffect(() => {
    if (!crewFocused.current) setCrewDraft(room.crewName);
  }, [room.crewName]);
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="lobby-page">
      <div className="lobby-layout">
      <div className="lobby-stack">
      <section className="lobby-card">
        <Logo compact />
        <p className="eyebrow">YOUR FLIGHT CODE</p>
        <button
          type="button"
          className="flight-code"
          onClick={copy}
          title="Copy invite link"
        >
          {flightCode.split("").map((letter, index) => (
            <span className="code-letter" key={`${letter}-${index}`}>
              {letter}
            </span>
          ))}
        </button>
        <p className="copy-status">{copied ? "Invite copied!" : "Tap code to copy the invite link"}</p>
        <section className="map-select">
          <div className="map-select-heading">
            <div>
              <span className="eyebrow">CHOOSE YOUR FLIGHT</span>
              <h2>{isHost ? "Select a route" : "Captain’s route"}</h2>
            </div>
            <span className={`difficulty ${selectedMap.difficulty.toLowerCase()}`}>
              {selectedMap.difficulty}
            </span>
          </div>
          <div className="map-cards">
            {FLIGHT_MAP_LIST.map((map) => (
              <button
                type="button"
                className={`map-card map-${map.id} ${room.mapId === map.id ? "selected" : ""}`}
                key={map.id}
                onClick={() => isHost && onSelectMap(map.id)}
                disabled={!isHost}
                aria-pressed={room.mapId === map.id}
              >
                <span className="map-art" aria-hidden="true">
                  <i>{map.icon}</i>
                  <b className="map-plane">✈</b>
                </span>
                <span className="map-copy">
                  <strong>{map.name}</strong>
                  <small>{map.forecast}</small>
                </span>
                <span className="map-check">✓</span>
              </button>
            ))}
          </div>
          <p className="map-description">{selectedMap.description}</p>
        </section>
        {needsCrewName && (
          <label className="field crew-name">
            <span>CREW NAME</span>
            <input
              value={isHost ? crewDraft : room.crewName}
              maxLength={18}
              placeholder="Name your crew"
              disabled={!isHost}
              onFocus={() => {
                crewFocused.current = true;
              }}
              onBlur={() => {
                crewFocused.current = false;
                setCrewDraft(room.crewName);
              }}
              onChange={(event) => {
                setCrewDraft(event.target.value);
                onCrewName(event.target.value);
              }}
            />
          </label>
        )}
        <div className="crew-list">
          <h2>Crew manifest <span>{room.players.length}/4</span></h2>
          {room.players.map((player) => (
            <div className="crew-row" key={player.id}>
              <i style={{ background: player.color }} />
              <strong>{player.name}</strong>
              {player.id === room.hostId && <em>CAPTAIN</em>}
              {player.id === playerId && <span>YOU</span>}
            </div>
          ))}
          {Array.from({ length: 4 - room.players.length }, (_, index) => (
            <div className="crew-row empty" key={index}>Waiting for crew…</div>
          ))}
        </div>
        {isHost ? (
          <button className="primary depart" onClick={onStart} disabled={!crewReady}>
            DEPART: {selectedMap.shortName}
          </button>
        ) : (
          <p className="waiting">Waiting for the captain to start…</p>
        )}
      </section>
      <Rules compact />
      </div>
      <aside className="leaderboard" aria-label={`${selectedMap.name} leaderboard`}>
        <p className="eyebrow">GLOBAL LEADERBOARD</p>
        <h2>
          <span>{selectedMap.icon}</span>
          {selectedMap.shortName}
        </h2>
        {standings.length ? (
          <ol>
            {standings.map((entry, index) => {
              const stars = starsFor(room.mapId, entry.score);
              return (
                <li
                  key={`${entry.crewName}-${index}`}
                  className={entry.crewName.toLowerCase() === listedName.trim().toLowerCase() ? "yours" : ""}
                >
                  <b>{index + 1}</b>
                  <strong>{entry.crewName}</strong>
                  <span className="leaderboard-stars" aria-label={`${stars} of 3 stars`}>
                    {[0, 1, 2].map((star) => (
                      <i key={star} className={star < stars ? "earned" : ""}>★</i>
                    ))}
                  </span>
                  <span className="leaderboard-score">{entry.score.toLocaleString()}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="leaderboard-empty">No crews have landed this route yet.</p>
        )}
      </aside>
      </div>
    </main>
  );
}

function TouchControls({
  setVector,
  interact,
  dropItem,
  seatPreference,
  setSeatPreference,
  setSqueezing,
}: {
  setVector: (vector: { x: number; z: number }) => void;
  interact: () => void;
  dropItem: () => void;
  seatPreference: "aisle" | "window";
  setSeatPreference: (value: "aisle" | "window") => void;
  setSqueezing: (value: boolean) => void;
}) {
  const bind = (x: number, z: number) => ({
    onPointerDown: (event: React.PointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setVector({ x, z });
    },
    onPointerUp: () => setVector({ x: 0, z: 0 }),
    onPointerCancel: () => setVector({ x: 0, z: 0 }),
  });
  return (
    <div className="touch-controls">
      <div className="dpad">
        <button className="up" {...bind(0, -1)}>▲</button>
        <button className="left" {...bind(-1, 0)}>◀</button>
        <button className="right" {...bind(1, 0)}>▶</button>
        <button className="down" {...bind(0, 1)}>▼</button>
      </div>
      <div className="mobile-actions">
        <div className="seat-toggle mobile">
          <button
            className={seatPreference === "aisle" ? "active" : ""}
            onPointerDown={() => setSeatPreference("aisle")}
          >
            AISLE
          </button>
          <button
            className={seatPreference === "window" ? "active" : ""}
            onPointerDown={() => setSeatPreference("window")}
          >
            WINDOW
          </button>
        </div>
        <div className="mobile-button-row">
          <button
            className="squeeze-button"
            onPointerDown={() => setSqueezing(true)}
            onPointerUp={() => setSqueezing(false)}
            onPointerCancel={() => setSqueezing(false)}
          >
            F<span>HOLD TO SQUEEZE</span>
          </button>
          <button className="drop-button" onPointerDown={dropItem}>B<span>RETURN</span></button>
          <button className="action-button" onPointerDown={interact}>E<span>ACTION</span></button>
        </div>
      </div>
    </div>
  );
}

function StormLightningOverlay() {
  const whiteoutRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const boltRef = useRef<HTMLDivElement>(null);
  const lastPulseKey = useRef("");

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const time = getStormLightningGameTime();
      const opacity = getStormScreenOpacity(time);
      const { pulse, opacity: boltOpacity } = getStormBoltState(time);
      const strikeIndex = getStormStrikeIndex(time);

      if (whiteoutRef.current) whiteoutRef.current.style.opacity = String(opacity);
      if (flashRef.current) {
        flashRef.current.style.opacity = String(Math.min(0.75, boltOpacity * 0.85));
      }
      if (boltRef.current) {
        if (strikeIndex >= 0 && pulse >= 0) {
          // Each build-up strobe is a different bolt somewhere else in the sky.
          const key = `${strikeIndex}-${pulse}`;
          if (key !== lastPulseKey.current) {
            lastPulseKey.current = key;
            const rng = seededRandom(strikeIndex * 11 + pulse * 7 + 5);
            const isFinal = pulse === STORM_PULSE_COUNT - 1;
            const left = `${8 + rng() * 76}%`;
            const skew = -24 + rng() * 48;
            const scale = (isFinal ? 1.35 : 0.7) + rng() * 0.45;
            boltRef.current.style.left = left;
            boltRef.current.style.transform = `translateX(-50%) skewX(${skew}deg) scale(${scale})`;
            if (flashRef.current) {
              flashRef.current.style.background = `radial-gradient(circle at ${left} 12%, rgba(255,255,255,.98), rgba(255,255,255,0) 46%)`;
            }
          }
          boltRef.current.style.opacity = String(boltOpacity);
        } else {
          boltRef.current.style.opacity = "0";
        }
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="storm-lightning" aria-hidden="true">
      <div className="storm-lightning-flash" ref={flashRef} />
      <div className="storm-lightning-bolt" ref={boltRef} />
      <div className="storm-whiteout" ref={whiteoutRef} />
    </div>
  );
}

const RAIN_DROPS = Array.from({ length: 340 }, (_, index) => ({
  x: (index * 47) % 101,
  delay: -((index * 0.137) % 1.7),
  duration: 0.46 + ((index * 17) % 38) / 100,
  length: 30 + ((index * 29) % 70),
  opacity: 0.32 + ((index * 11) % 52) / 100,
  drift: 14 + ((index * 7) % 26),
  depth: index % 4,
}));

function WeatherScreen({ mapId }: { mapId: MapId }) {
  if (mapId === "smooth-skies") return null;

  return (
    <>
      <div className={`weather-screen weather-${mapId}`} aria-hidden="true">
      {mapId === "stormy-service" && (
        <div className="rain-field">
          {RAIN_DROPS.map((drop, index) => (
            <i
              key={index}
              className={`rain-drop depth-${drop.depth}`}
              style={
                {
                  "--rain-x": `${drop.x}%`,
                  "--rain-delay": `${drop.delay}s`,
                  "--rain-duration": `${drop.duration}s`,
                  "--rain-length": `${drop.length}px`,
                  "--rain-opacity": drop.opacity,
                  "--rain-drift": `${drop.drift}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      {mapId === "turbulent-torrent" && (
        <div className="wind-atmosphere">
          <i />
          <i />
          <i />
        </div>
      )}
      {(mapId === "turbulent-torrent" || mapId === "stormy-service") && (
        <div className={`turbulence-alert ${mapId === "stormy-service" ? "severe-alert" : ""}`}>
          <span>!</span>
          <div>
            <b>{mapId === "stormy-service" ? "SEVERE TURBULENCE" : "TURBULENCE"}</b>
            <small>FASTEN SEATBELTS</small>
          </div>
        </div>
      )}
      <div className="weather-vignette" />
      </div>
      {mapId === "stormy-service" && <StormLightningOverlay />}
    </>
  );
}

function Finished({
  room,
  canRestart,
  restart,
}: {
  room: RoomState;
  canRestart: boolean;
  restart: () => void;
}) {
  const stars = starsFor(room.mapId, room.score);
  const thresholds = STAR_THRESHOLDS[room.mapId];
  return (
    <div className="result-overlay">
      <section className="result-card">
        <p className="eyebrow">{FLIGHT_MAPS[room.mapId].shortName} · FLIGHT COMPLETE</p>
        <h1>{stars >= 2 ? "Smooth landing!" : stars === 1 ? "Made it!" : "Turbulent service!"}</h1>
        <div className="stars">
          {[0, 1, 2].map((index) => <span className={index < stars ? "earned" : ""} key={index}>★</span>)}
        </div>
        <p className="final-score">{room.score.toLocaleString()} <small>POINTS</small></p>
        <div className="thresholds">
          {thresholds.map((points) => <span key={points}>★ {points.toLocaleString()}</span>)}
        </div>
        {canRestart ? (
          <button className="primary" onClick={restart}>FLY AGAIN</button>
        ) : (
          <p className="waiting">Waiting for the captain…</p>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [error, setError] = useState("");
  const [mobileVector, setMobileVector] = useState({ x: 0, z: 0 });
  const [mobileSqueezing, setMobileSqueezing] = useState(false);
  const [seatPreference, setSeatPreference] = useState<"aisle" | "window">("aisle");
  const [leaderboard, setLeaderboard] = useState<Leaderboard>({
    "smooth-skies": [],
    "turbulent-torrent": [],
    "stormy-service": [],
  });
  const [soundOn, setSoundOn] = useState(readSoundEnabled);
  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      writeSoundEnabled(next);
      if (next) getFlightAudio().unlock();
      return next;
    });
  };
  const roomRef = useRef(room);
  roomRef.current = room;
  const screen = screenOf(room);

  const requestLobby = () => {
    socket.emit("return-to-lobby", (response?: { error?: string }) => {
      if (!response?.error) return;
      setRoom(null);
      setPlayerId("");
      setError(response.error);
    });
  };

  useEffect(() => {
    if (screen === "home") return;
    if (history.state?.overbooked !== screen) {
      history.pushState({ overbooked: screen }, "");
    }
    const onPop = () => {
      const here = screenOf(roomRef.current);
      if (here === "home") return;
      history.pushState({ overbooked: here }, "");
      if (here === "game") {
        socket.emit("return-to-lobby", (response?: { error?: string }) => {
          if (!response?.error) return;
          setRoom(null);
          setPlayerId("");
          setError(response.error);
        });
        return;
      }
      socket.emit("leave-room");
      setRoom(null);
      setPlayerId("");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [screen]);

  useEffect(() => {
    const update = (nextRoom: RoomState | null) => setRoom(nextRoom);
    const disconnected = () => {
      setRoom(null);
      setPlayerId("");
      setError("Connection lost. Create or join the flight again.");
    };
    const connected = () => setError("");
    socket.on("state", update);
    socket.on("leaderboard", setLeaderboard);
    socket.on("disconnect", disconnected);
    socket.on("connect", connected);
    return () => {
      socket.off("state", update);
      socket.off("leaderboard", setLeaderboard);
      socket.off("disconnect", disconnected);
      socket.off("connect", connected);
    };
  }, []);

  useEffect(() => {
    const unlock = () => {
      if (readSoundEnabled()) getFlightAudio().unlock();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const ambienceMap = room && room.status !== "lobby" && soundOn ? room.mapId : null;
  useEffect(() => {
    const audio = getFlightAudio();
    if (ambienceMap) audio.play(ambienceMap);
    else audio.stop();
  }, [ambienceMap]);

  useEffect(() => {
    const switchSeat = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") {
        setSeatPreference((current) => current === "aisle" ? "window" : "aisle");
      }
    };
    window.addEventListener("keydown", switchSeat);
    return () => window.removeEventListener("keydown", switchSeat);
  }, []);

  const callback = (response?: { playerId?: string; error?: string }) => {
    if (response?.error) return setError(response.error);
    setPlayerId(response?.playerId || "");
    setError("");
  };
  const time = useMemo(() => {
    const seconds = room?.timeLeft ?? 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }, [room?.timeLeft]);

  if (!room) {
    return (
      <>
        <Home
          onCreate={(name) => socket.emit("create-room", { name }, callback)}
          onJoin={(name, code) => socket.emit("join-room", { name, code }, callback)}
        />
        {error && <div className="toast">{error}</div>}
      </>
    );
  }
  if (room.status === "lobby") {
    return (
      <>
        <Lobby
          room={room}
          playerId={playerId}
          leaderboard={leaderboard}
          onStart={() => {
            if (soundOn) getFlightAudio().unlock();
            socket.emit("start-game");
          }}
          onSelectMap={(mapId) => socket.emit("set-map", { mapId })}
          onCrewName={(crewName) => socket.emit("set-crew-name", { crewName })}
        />
        {error && <div className="toast">{error}</div>}
      </>
    );
  }

  return (
    <main className={`game ${room.status === "finished" ? "finished" : ""}`}>
      <GameScene
        room={room}
        playerId={playerId}
        socket={socket}
        mobileVector={mobileVector}
        mobileSqueezing={mobileSqueezing}
        seatPreference={seatPreference}
      />
      <WeatherScreen mapId={room.mapId} />
      {createPortal(
        <>
          <div className="game-top-left">
            <button
              type="button"
              className={`game-back ${(room.lobbyReturnIds ?? []).includes(playerId) ? "ready" : ""}`}
              onClick={requestLobby}
            >
              {(room.lobbyReturnIds ?? []).includes(playerId) ? "READY" : "← LOBBY"}
              {room.players.length > 1 && (
                <small>{(room.lobbyReturnIds ?? []).length}/{room.players.length} CREW</small>
              )}
            </button>
            <div className={`map-hud map-${room.mapId}`}>
              <span>{FLIGHT_MAPS[room.mapId].icon}</span>
              <div>
                <small>ROUTE</small>
                <strong>{FLIGHT_MAPS[room.mapId].shortName}</strong>
              </div>
            </div>
            <button
              type="button"
              className={`sound-toggle ${soundOn ? "on" : "off"}`}
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Sound on" : "Sound off"}
            >
              <SoundMark on={soundOn} />
              {soundOn ? "ON" : "OFF"}
            </button>
          </div>
          {room.players.length > 1 && (room.lobbyReturnIds ?? []).length > 0 && (room.lobbyReturnIds ?? []).length < room.players.length && (
            <div className="lobby-wait">Waiting for the whole crew to return to the lobby</div>
          )}
        </>,
        document.body,
      )}
      <header className="game-hud">
        <div className="hud-panel score"><small>SERVICE SCORE</small><strong>{room.score.toLocaleString()}</strong></div>
        <div className={`hud-panel timer ${room.timeLeft <= 30 ? "urgent" : ""}`}><small>TIME LEFT</small><strong>{time}</strong></div>
        <div className="hud-panel orders"><small>OPEN ORDERS</small><strong>{room.orders.length}</strong></div>
      </header>
      <aside className="mini-manifest">
        {room.orders.slice(0, 5).map((order) => (
          <div
            key={order.id}
            className={order.expiresAt - Date.now() <= 3000 ? "expiring" : ""}
          >
            <b>
              ROW {Math.floor(order.seatId / 4) + 1}
              <small>{order.seatId % 4 === 0 || order.seatId % 4 === 3 ? "WINDOW" : "AISLE"}</small>
            </b>
            <span className="manifest-icons">
              {order.items.map((item) => <ItemIcon item={item} size={30} key={item} />)}
            </span>
          </div>
        ))}
      </aside>
      <div className="service-picker">
        <small>TARGET WHICH SEAT?</small>
        <div className="seat-toggle">
          <button
            className={seatPreference === "aisle" ? "active" : ""}
            onClick={() => setSeatPreference("aisle")}
          >
            AISLE
          </button>
          <button
            className={seatPreference === "window" ? "active" : ""}
            onClick={() => setSeatPreference("window")}
          >
            WINDOW
          </button>
        </div>
        <em>Press R to switch</em>
      </div>
      <div className="desktop-tip">MOVE: WASD / ARROWS · ACTION: E / SPACE · B RETURNS AN ITEM TO ITS STATION · HOLD F TO SQUEEZE PAST CREW</div>
      <TouchControls
        setVector={setMobileVector}
        seatPreference={seatPreference}
        setSeatPreference={setSeatPreference}
        setSqueezing={setMobileSqueezing}
        interact={() => socket.emit("interact", { seatPreference })}
        dropItem={() => socket.emit("drop")}
      />
      {room.status === "finished" && (
        <Finished
          room={room}
          canRestart={playerId === room.hostId}
          restart={() => socket.emit("start-game")}
        />
      )}
      {error && <div className="toast">{error}</div>}
    </main>
  );
}
