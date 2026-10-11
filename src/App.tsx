import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import GameScene from "./GameScene";
import ItemIcon from "./ItemIcon";
import type { RoomState } from "./types";

const socket = io();

function Logo() {
  return (
    <div className="logo">
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
        <div><b>1</b><span>Load up to three drinks, snacks, meals, or trash on your tray.</span></div>
        <div><b>2</b><span>Match every item in a passenger’s order before time runs out.</span></div>
        <div><b>3</b><span>Select aisle or window to collect their trash, then take it to the front bin.</span></div>
        <div><b>!</b><span>Wrong or duplicate items cost 50 points. Don’t block the aisle!</span></div>
      </div>
      {!compact && (
        <p className="controls-hint">
          MOVE <kbd>WASD</kbd> / <kbd>ARROWS</kbd>
          <span>•</span>
          PICK UP &amp; SERVE <kbd>E</kbd> / <kbd>SPACE</kbd>
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
  const [code, setCode] = useState(params.get("flight") || "");
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
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABCD"
            />
          </label>
        )}
        <div className="home-actions">
          {showJoin ? (
            <>
              <button
                className="primary"
                disabled={!name.trim() || code.length !== 4}
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
    </main>
  );
}

function Lobby({
  room,
  playerId,
  onStart,
}: {
  room: RoomState;
  playerId: string;
  onStart: () => void;
}) {
  const shareUrl = `${location.origin}${location.pathname}?flight=${room.code}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <main className="lobby-page">
      <Logo />
      <section className="lobby-card">
        <p className="eyebrow">YOUR FLIGHT CODE</p>
        <button className="flight-code" onClick={copy} title="Copy invite link">
          {room.code}
        </button>
        <p className="copy-status">{copied ? "Invite copied!" : "Tap code to copy the invite link"}</p>
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
        {playerId === room.hostId ? (
          <button className="primary depart" onClick={onStart}>
            START LEVEL 1
          </button>
        ) : (
          <p className="waiting">Waiting for the captain to start…</p>
        )}
      </section>
      <Rules compact />
    </main>
  );
}

function TouchControls({
  setVector,
  interact,
  seatPreference,
  setSeatPreference,
  setSqueezing,
}: {
  setVector: (vector: { x: number; z: number }) => void;
  interact: () => void;
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
          <button className="action-button" onPointerDown={interact}>E<span>ACTION</span></button>
        </div>
      </div>
    </div>
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
  const stars = room.score >= 1800 ? 3 : room.score >= 1100 ? 2 : room.score >= 500 ? 1 : 0;
  return (
    <div className="result-overlay">
      <section className="result-card">
        <p className="eyebrow">FLIGHT COMPLETE</p>
        <h1>{stars >= 2 ? "Smooth landing!" : stars === 1 ? "Made it!" : "Turbulent service!"}</h1>
        <div className="stars">
          {[0, 1, 2].map((index) => <span className={index < stars ? "earned" : ""} key={index}>★</span>)}
        </div>
        <p className="final-score">{room.score.toLocaleString()} <small>POINTS</small></p>
        <div className="thresholds"><span>★ 500</span><span>★ 1,100</span><span>★ 1,800</span></div>
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

  useEffect(() => {
    const update = (nextRoom: RoomState) => setRoom(nextRoom);
    const disconnected = () => setError("Connection lost — trying to reconnect…");
    socket.on("state", update);
    socket.on("disconnect", disconnected);
    socket.on("connect", () => setError(""));
    return () => {
      socket.off("state", update);
      socket.off("disconnect", disconnected);
      socket.off("connect");
    };
  }, []);

  useEffect(() => {
    const switchSeat = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "r") {
        setSeatPreference((current) => current === "aisle" ? "window" : "aisle");
      }
    };
    window.addEventListener("keydown", switchSeat);
    return () => window.removeEventListener("keydown", switchSeat);
  }, []);

  const callback = (response: { code?: string; playerId?: string; error?: string }) => {
    if (response.error) return setError(response.error);
    setPlayerId(response.playerId || "");
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
        <Lobby room={room} playerId={playerId} onStart={() => socket.emit("start-game")} />
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
      <div className="desktop-tip">MOVE: WASD / ARROWS · ACTION: E / SPACE · HOLD F TO SQUEEZE PAST CREW</div>
      <TouchControls
        setVector={setMobileVector}
        seatPreference={seatPreference}
        setSeatPreference={setSeatPreference}
        setSqueezing={setMobileSqueezing}
        interact={() => socket.emit("interact", { seatPreference })}
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
