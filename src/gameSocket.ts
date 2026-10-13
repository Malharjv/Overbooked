import type { Leaderboard, RoomState } from "./types";

const ENDPOINT = "/.netlify/functions/game";

type StateListener = (room: RoomState | null) => void;
type BoardListener = (board: Leaderboard) => void;
type SignalListener = () => void;
type AnyListener = StateListener | BoardListener | SignalListener;

export type GameClient = {
  emit: (
    event: string,
    payload?: object,
    callback?: (response?: { error?: string; playerId?: string }) => void,
  ) => void;
  on(event: "state", handler: StateListener): void;
  on(event: "leaderboard", handler: BoardListener): void;
  on(event: "disconnect" | "connect", handler: SignalListener): void;
  off(event: "state", handler: StateListener): void;
  off(event: "leaderboard", handler: BoardListener): void;
  off(event: "disconnect" | "connect", handler: SignalListener): void;
};

type Move = { x: number; z: number; facing: number; squeezing?: boolean };

type Reply = {
  error?: string;
  room?: RoomState | null;
  leaderboard?: Leaderboard;
  playerId?: string;
  token?: string;
};

export function createGameClient(): GameClient {
  const listeners: Record<"state" | "leaderboard" | "disconnect" | "connect", Set<AnyListener>> = {
    state: new Set(),
    leaderboard: new Set(),
    disconnect: new Set(),
    connect: new Set(),
  };
  let code = "";
  let playerId = "";
  let token = "";
  let pendingMove: Move | null = null;
  let timer = 0;
  let chain = Promise.resolve();
  let syncQueued = false;
  let failures = 0;

  const emitEvent = (event: "state" | "leaderboard" | "disconnect" | "connect", payload?: unknown) => {
    for (const listener of [...listeners[event]]) (listener as (value?: unknown) => void)(payload);
  };

  const schedule = () => {
    window.clearTimeout(timer);
    if (!code || !token) return;
    timer = window.setTimeout(() => {
      enqueue("sync");
    }, document.hidden ? 1000 : 90);
  };

  const enqueue = (
    action: string,
    payload: object = {},
    callback?: (response?: { error?: string; playerId?: string }) => void,
  ) => {
    if (action === "sync") {
      if (syncQueued) return;
      syncQueued = true;
    }
    chain = chain.then(async () => {
      if (action === "sync") syncQueued = false;
      await send(action, payload, callback);
    });
  };

  async function send(
    action: string,
    payload: object,
    callback?: (response?: { error?: string; playerId?: string }) => void,
  ) {
    const fields = payload as Record<string, unknown>;
    const includeMove = action === "sync" || action === "interact" || action === "drop" || action === "move";
    const move = includeMove ? pendingMove : null;
    if (includeMove) pendingMove = null;
    const flightCode = action === "join-room" ? String(fields.code || "") : code;
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          ...fields,
          ...(flightCode ? { code: flightCode } : {}),
          ...(playerId ? { playerId } : {}),
          ...(token ? { token } : {}),
          ...(move ? { move } : {}),
        }),
      });
      const body = (await response.json()) as Reply;
      failures = 0;
      if (body.token) token = body.token;
      if (body.playerId) playerId = body.playerId;
      if (body.leaderboard) emitEvent("leaderboard", body.leaderboard);
      if (body.error) {
        callback?.({ error: body.error, playerId: body.playerId });
        if (token && body.room) emitEvent("state", body.room);
        return;
      }
      if (body.room?.code) code = body.room.code;
      callback?.({ playerId: body.playerId });
      if ("room" in body) {
        emitEvent("state", body.room ?? null);
        if (!body.room) {
          code = "";
          token = "";
          playerId = "";
          window.clearTimeout(timer);
        }
      }
    } catch {
      failures += 1;
      callback?.({ error: "Connection lost. Create or join the flight again." });
      if (failures >= 4 && code) {
        code = "";
        token = "";
        playerId = "";
        window.clearTimeout(timer);
        emitEvent("disconnect", null);
      }
    } finally {
      if (code && token) schedule();
    }
  }

  return {
    on(event: "state" | "leaderboard" | "disconnect" | "connect", handler: AnyListener) {
      listeners[event].add(handler);
      if (event === "connect") (handler as SignalListener)();
    },
    off(event, handler) {
      listeners[event].delete(handler);
    },
    emit(event, payload, callback) {
      if (event === "move") {
        pendingMove = payload as Move;
        return;
      }
      enqueue(event, payload, callback);
    },
  };
}
