import { getStore, type Store } from "@netlify/blobs";
import {
  advance,
  applyAction,
  createFlight,
  emptyLeaderboard,
  normalizeFlightCode,
  publicRoom,
  randomFlightCode,
  rememberScore,
  type GameRequest,
  type StoredRoom,
} from "./engine";
import type { Leaderboard } from "../src/types";

const ROOM_PREFIX = "room/";
const BOARD_KEY = "leaderboard";

export function openStore() {
  return getStore({ name: "overbooked", consistency: "strong" });
}

async function readBoard(store: Store): Promise<{ board: Leaderboard; etag?: string }> {
  const entry = await store.getWithMetadata(BOARD_KEY, { type: "json", consistency: "strong" });
  if (!entry) return { board: emptyLeaderboard() };
  const board = emptyLeaderboard();
  const saved = entry.data as Partial<Leaderboard> | null;
  for (const mapId of Object.keys(board) as (keyof Leaderboard)[]) {
    const rows = saved?.[mapId];
    if (!Array.isArray(rows)) continue;
    board[mapId] = rows
      .filter((row) => row && typeof row.crewName === "string" && Number.isFinite(row.score))
      .map((row) => ({
        crewName: String(row.crewName).trim().slice(0, 18),
        score: Math.max(0, Math.floor(row.score)),
      }))
      .filter((row) => row.crewName)
      .sort((left, right) => right.score - left.score || left.crewName.localeCompare(right.crewName))
      .slice(0, 20);
  }
  return { board, etag: entry.etag };
}

async function writeBoard(store: Store, board: Leaderboard, etag?: string) {
  if (etag) return store.setJSON(BOARD_KEY, board, { onlyIfMatch: etag });
  return store.setJSON(BOARD_KEY, board, { onlyIfNew: true });
}

async function recordScore(store: Store, room: StoredRoom) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await readBoard(store);
    const next = emptyLeaderboard();
    for (const mapId of Object.keys(next) as (keyof Leaderboard)[]) next[mapId] = [...current.board[mapId]];
    rememberScore(next, room);
    const wrote = await writeBoard(store, next, current.etag);
    if (wrote.modified) return next;
    await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 40));
  }
  return (await readBoard(store)).board;
}

export async function leaderboardOnly(store: Store = openStore()) {
  return (await readBoard(store)).board;
}

export async function handleAction(request: GameRequest, now: number, store: Store = openStore()) {
  const action = request.action;
  if (action === "leaderboard") {
    return { leaderboard: await leaderboardOnly(store), room: null };
  }

  if (action === "create-room") {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = randomFlightCode();
      const created = createFlight(code, String(request.name || ""), now);
      const wrote = await store.setJSON(`${ROOM_PREFIX}${code}`, created.room, { onlyIfNew: true });
      if (!wrote.modified) continue;
      return {
        leaderboard: await leaderboardOnly(store),
        room: publicRoom(created.room),
        playerId: created.playerId,
        token: created.token,
      };
    }
    return { error: "Could not open a flight. Try again.", leaderboard: await leaderboardOnly(store), room: null };
  }

  const code = normalizeFlightCode(request.code);
  if (!code) {
    return { error: "Flight code must be 4 letters (A–Z).", leaderboard: await leaderboardOnly(store), room: null };
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const entry = await store.getWithMetadata(`${ROOM_PREFIX}${code}`, { type: "json", consistency: "strong" });
    if (!entry?.data || !entry.etag) {
      if (!entry?.data) {
        return { error: "Flight not found.", leaderboard: await leaderboardOnly(store), room: null };
      }
      continue;
    }
    const room = entry.data as StoredRoom;
    const justFinished = advance(room, now);
    const finishedSnapshot = justFinished ? structuredClone(room) : null;
    const outcome = applyAction(room, request, now);
    if (outcome.remove || !outcome.room) {
      await store.delete(`${ROOM_PREFIX}${code}`);
      return { leaderboard: await leaderboardOnly(store), room: null };
    }
    let board: Leaderboard | null = null;
    if (finishedSnapshot) {
      board = await recordScore(store, finishedSnapshot);
      if (outcome.room.status === "finished") outcome.room.recorded = true;
    }
    const wrote = await store.setJSON(`${ROOM_PREFIX}${code}`, outcome.room, { onlyIfMatch: entry.etag });
    if (!wrote.modified) {
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 40));
      continue;
    }
    return {
      error: outcome.error,
      leaderboard: board ?? (await leaderboardOnly(store)),
      room: publicRoom(outcome.room),
      playerId: outcome.playerId,
      token: outcome.token,
    };
  }

  return { error: "The flight was busy. Try again.", leaderboard: await leaderboardOnly(store), room: null };
}
