import { randomInt } from "node:crypto";
import { nanoid } from "nanoid";
import type { HeldItem, ItemName, Leaderboard, MapId, Player, RoomState } from "../src/types";

const FLIGHT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAP_IDS = new Set<MapId>(["smooth-skies", "turbulent-torrent", "stormy-service"]);
const ROUND_SECONDS = 180;
const ITEM_POINTS = 75;
const COMPLETE_BONUS = 100;
const MAX_OPEN_ORDERS = 5;
const INVENTORY_CAPACITY = 3;
const TRASH_DELAY_MS = 6000;
const ORDER_LIFETIME_MS = 42000;
const STALE_MS = 20_000;
const COLORS = ["#243b6b", "#c94755", "#858d9b", "#e45b9d"];
const AVATARS = ["female", "male", "female", "male"] as const;
const EXTRAS: ItemName[] = ["water", "soda", "chips"];
const MEALS: ItemName[] = ["meat", "fish", "veg"];
const MEAL_ITEMS = new Set<ItemName>(MEALS);
const STATION_RANGE = 1.3;

export const STATIONS: Record<ItemName, { x: number; z: number }> = {
  water: { x: -1.25, z: 7.3 },
  soda: { x: 1.25, z: 7.3 },
  chips: { x: -1.25, z: -7.3 },
  meat: { x: 1.25, z: -6.45 },
  fish: { x: 1.25, z: -7.3 },
  veg: { x: 1.25, z: -8.05 },
};

export type SeatPreference = "aisle" | "window";

export type StoredPlayer = Player & { token: string; seenAt: number };

export type StoredRoom = {
  code: string;
  hostId: string;
  mapId: MapId;
  crewName: string;
  status: "lobby" | "playing" | "finished";
  score: number;
  timeLeft: number;
  endsAt: number | null;
  players: StoredPlayer[];
  orders: RoomState["orders"];
  messes: RoomState["messes"];
  lobbyVotes: string[];
  nextOrderAt: number | null;
  scheduledOrders: number[];
  pendingTrash: { seatId: number; readyAt: number }[];
  recorded: boolean;
  roundId: number;
};

export type ClientMove = {
  x: number;
  z: number;
  facing: number;
  squeezing?: boolean;
};

export function emptyLeaderboard(): Leaderboard {
  return {
    "smooth-skies": [],
    "turbulent-torrent": [],
    "stormy-service": [],
  };
}

export function randomFlightCode() {
  let code = "";
  for (let index = 0; index < 4; index += 1) code += FLIGHT_ALPHABET[randomInt(26)];
  return code;
}

export function normalizeFlightCode(raw: unknown) {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return code.length === 4 ? code : null;
}

export function publicRoom(room: StoredRoom): RoomState {
  return {
    code: room.code,
    hostId: room.hostId,
    mapId: room.mapId,
    crewName: room.crewName,
    status: room.status,
    score: room.score,
    timeLeft: room.timeLeft,
    players: room.players.map(({ token: _token, seenAt: _seenAt, ...player }) => player),
    orders: room.orders,
    messes: room.messes,
    lobbyReturnIds: room.lobbyVotes,
  };
}

export function recordedCrewName(room: StoredRoom) {
  const crewName = room.crewName.trim().slice(0, 18);
  if (crewName) return crewName;
  const solo = room.players[0];
  const name = String(solo?.name || "").trim().slice(0, 18);
  return name || room.code;
}

export function rememberScore(board: Leaderboard, room: StoredRoom) {
  const crewName = recordedCrewName(room);
  const rows = board[room.mapId] ?? [];
  const existing = rows.find((entry) => entry.crewName.toLowerCase() === crewName.toLowerCase());
  if (existing) existing.score = Math.max(existing.score, room.score);
  else rows.push({ crewName, score: room.score });
  rows.sort((left, right) => right.score - left.score || left.crewName.localeCompare(right.crewName));
  board[room.mapId] = rows.slice(0, 20);
  return board;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

function holdsMeal(held: HeldItem[]) {
  return held.some((entry) => entry.type === "item" && MEAL_ITEMS.has(entry.item as ItemName));
}

function canPickUp(held: HeldItem[], item: ItemName) {
  if (held.length >= INVENTORY_CAPACITY) return false;
  if (MEAL_ITEMS.has(item) && holdsMeal(held)) return false;
  return true;
}

function nearestStation(player: { x: number; z: number; held: HeldItem[] }, allowed?: (item: ItemName) => boolean) {
  let best: ItemName | null = null;
  let bestDistance = STATION_RANGE;
  for (const [item, point] of Object.entries(STATIONS) as [ItemName, { x: number; z: number }][]) {
    if (allowed && !allowed(item)) continue;
    const gap = distance(player, point);
    if (gap < bestDistance) {
      best = item;
      bestDistance = gap;
    }
  }
  return best;
}

export function seatPosition(seatId: number) {
  const row = Math.floor(seatId / 4);
  const column = seatId % 4;
  return {
    x: [-2.25, -1.25, 1.25, 2.25][column],
    z: 5.25 - row * 1.5,
  };
}

function seatKind(seatId: number): SeatPreference {
  const column = seatId % 4;
  return column === 0 || column === 3 ? "window" : "aisle";
}

function makeOrder(room: StoredRoom, now: number) {
  if (room.orders.length >= MAX_OPEN_ORDERS) return;
  const occupied = new Set([
    ...room.orders.map((order) => order.seatId),
    ...room.messes.map((mess) => mess.seatId),
    ...room.pendingTrash.map((entry) => entry.seatId),
  ]);
  const available = Array.from({ length: 32 }, (_, index) => index).filter((seatId) => !occupied.has(seatId));
  if (!available.length) return;
  const seatId = available[Math.floor(Math.random() * available.length)];
  const itemCount = Math.random() > 0.78 ? 3 : Math.random() > 0.34 ? 2 : 1;
  const items: ItemName[] = [];
  if (Math.random() < 0.68) items.push(MEALS[Math.floor(Math.random() * MEALS.length)]);
  const shuffledExtras = [...EXTRAS].sort(() => Math.random() - 0.5);
  for (const extra of shuffledExtras) {
    if (items.length >= itemCount) break;
    items.push(extra);
  }
  if (!items.length) items.push(shuffledExtras[0]);
  room.orders.push({
    id: nanoid(7),
    seatId,
    items,
    served: [],
    expiresAt: now + ORDER_LIFETIME_MS,
  });
}

function spawnTrash(room: StoredRoom, seatId: number) {
  const seat = seatPosition(seatId);
  const column = seatId % 4;
  const isWindow = column === 0 || column === 3;
  const visualSeatX = [-2, -1.05, 1.05, 2][column];
  room.messes.push({
    id: nanoid(7),
    seatId,
    x: isWindow ? visualSeatX : Math.sign(seat.x) * 0.67,
    pickupX: Math.sign(seat.x) * 0.67,
    z: seat.z,
  });
}

function queueOrder(room: StoredRoom, now: number, delay = 2400) {
  room.scheduledOrders.push(now + delay);
}

function queueTrash(room: StoredRoom, seatId: number, now: number) {
  room.pendingTrash.push({ seatId, readyAt: now + TRASH_DELAY_MS });
}

/** Catch the flight up to `now`. Returns true when this call is the one that should record the score. */
export function advance(room: StoredRoom, now: number) {
  if (room.status !== "playing" || room.endsAt == null) return false;
  room.timeLeft = Math.max(0, Math.ceil((room.endsAt - now) / 1000));

  const ready = room.pendingTrash.filter((entry) => entry.readyAt <= now);
  room.pendingTrash = room.pendingTrash.filter((entry) => entry.readyAt > now);
  for (const entry of ready) spawnTrash(room, entry.seatId);

  if (room.timeLeft <= 0) {
    room.timeLeft = 0;
    room.status = "finished";
    room.nextOrderAt = null;
    room.scheduledOrders = [];
    return !room.recorded;
  }

  const expired = room.orders.filter((order) => order.expiresAt <= now);
  if (expired.length) {
    room.score = Math.max(0, room.score - expired.length * 50);
    const expiredIds = new Set(expired.map((order) => order.id));
    room.orders = room.orders.filter((order) => !expiredIds.has(order.id));
    expired.forEach((_, index) => queueOrder(room, now, 2400 + index * 450));
  }

  const due = room.scheduledOrders.filter((time) => time <= now);
  room.scheduledOrders = room.scheduledOrders.filter((time) => time > now);
  for (let index = 0; index < due.length; index += 1) {
    if (room.orders.length < MAX_OPEN_ORDERS) makeOrder(room, now);
  }

  if (
    room.nextOrderAt != null &&
    now >= room.nextOrderAt &&
    room.orders.length + room.scheduledOrders.length < MAX_OPEN_ORDERS
  ) {
    makeOrder(room, now);
    room.nextOrderAt = now + 6500;
  }
  return false;
}

function dropStale(room: StoredRoom, now: number, keepId: string) {
  const active = room.players.filter((player) => player.id === keepId || now - player.seenAt < STALE_MS);
  if (active.length === room.players.length) return;
  room.players = active;
  const ids = new Set(active.map((player) => player.id));
  room.lobbyVotes = room.lobbyVotes.filter((id) => ids.has(id));
  if (!active.some((player) => player.id === room.hostId) && active[0]) room.hostId = active[0].id;
}

function freshPlayer(room: StoredRoom, name: string, now: number): StoredPlayer {
  const index = room.players.length;
  return {
    id: nanoid(8),
    token: nanoid(24),
    name: String(name || "Crewmate").trim().slice(0, 14) || "Crewmate",
    color: COLORS[index],
    avatar: AVATARS[index],
    x: 0,
    z: 8.1 - index * 0.55,
    facing: Math.PI,
    squeezing: false,
    held: [],
    seenAt: now,
  };
}

export function createFlight(code: string, name: string, now: number) {
  const room: StoredRoom = {
    code,
    hostId: "",
    mapId: "smooth-skies",
    crewName: "",
    status: "lobby",
    score: 0,
    timeLeft: ROUND_SECONDS,
    endsAt: null,
    players: [],
    orders: [],
    messes: [],
    lobbyVotes: [],
    nextOrderAt: null,
    scheduledOrders: [],
    pendingTrash: [],
    recorded: false,
    roundId: 0,
  };
  const player = freshPlayer(room, name, now);
  room.players.push(player);
  room.hostId = player.id;
  return { room, playerId: player.id, token: player.token };
}

function findPlayer(room: StoredRoom, playerId: string, token: string) {
  return room.players.find((player) => player.id === playerId && player.token === token) ?? null;
}

function applyMove(room: StoredRoom, player: StoredPlayer, move: ClientMove | undefined, now: number) {
  if (!move || room.status !== "playing") return;
  const next = { x: clamp(Number(move.x), -0.15, 0.15), z: clamp(Number(move.z), -8.25, 8.25) };
  const elapsed = Math.max(0.05, Math.min(0.5, (now - player.seenAt) / 1000));
  const maxStep = Math.max(0.55, 3.5 * elapsed + 0.1);
  const blocked =
    !move.squeezing &&
    room.players.some((other) => other.id !== player.id && distance(next, other) < 0.43);
  if (distance(next, player) <= maxStep && !blocked) {
    player.x = next.x;
    player.z = next.z;
    player.facing = Number(move.facing) || 0;
    player.squeezing = Boolean(move.squeezing);
  }
}

function returnToLobby(room: StoredRoom) {
  room.roundId += 1;
  room.status = "lobby";
  room.score = 0;
  room.timeLeft = ROUND_SECONDS;
  room.endsAt = null;
  room.orders = [];
  room.messes = [];
  room.scheduledOrders = [];
  room.pendingTrash = [];
  room.nextOrderAt = null;
  room.recorded = false;
  room.lobbyVotes = [];
  for (const player of room.players) {
    player.held = [];
    player.squeezing = false;
  }
}

function startRound(room: StoredRoom, now: number) {
  if (room.status === "playing") return;
  room.roundId += 1;
  room.status = "playing";
  room.score = 0;
  room.timeLeft = ROUND_SECONDS;
  room.endsAt = now + ROUND_SECONDS * 1000;
  room.orders = [];
  room.messes = [];
  room.scheduledOrders = [];
  room.pendingTrash = [];
  room.lobbyVotes = [];
  room.recorded = false;
  room.players.forEach((player, index) => {
    player.x = 0;
    player.z = 8.1 - index * 0.55;
    player.held = [];
    player.squeezing = false;
    player.seenAt = now;
  });
  for (let index = 0; index < Math.min(3, room.players.length + 1); index += 1) makeOrder(room, now);
  room.nextOrderAt = now + 6500;
}

function interact(room: StoredRoom, player: StoredPlayer, seatPreference: SeatPreference, now: number) {
  if (!Array.isArray(player.held)) player.held = [];
  const trashCount = player.held.filter((entry) => entry.type === "trash").length;
  if (trashCount && player.z > 7.1) {
    player.held = player.held.filter((entry) => entry.type !== "trash");
    room.score += trashCount * 25;
    return;
  }

  const nearbyMess = room.messes
    .filter((entry) => seatKind(entry.seatId) === seatPreference && Math.abs(player.z - entry.z) < 0.9)
    .sort(
      (left, right) =>
        Math.abs(player.x - (left.pickupX ?? left.x)) - Math.abs(player.x - (right.pickupX ?? right.x)),
    )[0];
  if (nearbyMess && player.held.length < INVENTORY_CAPACITY) {
    player.held.push({ type: "trash", item: "trash" });
    room.messes = room.messes.filter((entry) => entry.id !== nearbyMess.id);
    return;
  }

  const nearby = room.orders
    .filter((order) => {
      const seat = seatPosition(order.seatId);
      return seatKind(order.seatId) === seatPreference && Math.abs(player.z - seat.z) < 0.9;
    })
    .sort((left, right) => {
      const seatA = seatPosition(left.seatId);
      const seatB = seatPosition(right.seatId);
      return Math.abs(player.x - Math.sign(seatA.x) * 0.15) - Math.abs(player.x - Math.sign(seatB.x) * 0.15);
    })[0];

  let acted = false;
  if (nearby) {
    const neededIndex = player.held.findIndex(
      (entry) => entry.type === "item" && nearby.items.includes(entry.item as ItemName) && !nearby.served.includes(entry.item as ItemName),
    );
    const fallbackIndex = player.held.findIndex((entry) => entry.type === "item");
    const itemIndex = neededIndex >= 0 ? neededIndex : fallbackIndex;
    if (itemIndex >= 0) {
      const [servedItem] = player.held.splice(itemIndex, 1);
      acted = true;
      if (neededIndex >= 0 && servedItem.item !== "trash") {
        nearby.served.push(servedItem.item);
        room.score += ITEM_POINTS;
        if (nearby.served.length === nearby.items.length) {
          room.score += COMPLETE_BONUS;
          queueTrash(room, nearby.seatId, now);
          room.orders = room.orders.filter((order) => order.id !== nearby.id);
          queueOrder(room, now);
        }
      } else {
        room.score = Math.max(0, room.score - 50);
      }
    }
  }

  if (!acted) {
    const pickup = nearestStation(player, (item) => canPickUp(player.held, item));
    if (pickup) player.held.push({ type: "item", item: pickup });
  }
}

function dropItem(player: StoredPlayer) {
  if (!Array.isArray(player.held)) player.held = [];
  const item = nearestStation(player, (name) => player.held.some((entry) => entry.type === "item" && entry.item === name));
  if (!item) return;
  const index = player.held.findIndex((entry) => entry.type === "item" && entry.item === item);
  if (index < 0) return;
  player.held.splice(index, 1);
}

export type GameRequest = {
  action?: string;
  name?: string;
  code?: string;
  playerId?: string;
  token?: string;
  mapId?: string;
  crewName?: string;
  seatPreference?: SeatPreference;
  move?: ClientMove;
  x?: number;
  z?: number;
  facing?: number;
  squeezing?: boolean;
};

export type EngineResult = {
  error?: string;
  room: StoredRoom | null;
  playerId?: string;
  token?: string;
  remove?: boolean;
  justFinished?: boolean;
};

function authed(room: StoredRoom, request: GameRequest, now: number) {
  const player = findPlayer(room, String(request.playerId || ""), String(request.token || ""));
  if (!player) return { error: "Rejoin the flight to continue." as const, player: null };
  dropStale(room, now, player.id);
  if (!room.players.some((entry) => entry.id === player.id)) return { error: "Rejoin the flight to continue." as const, player: null };
  return { player };
}

function maybeReturn(room: StoredRoom) {
  if (room.status !== "lobby" && room.players.length > 0 && room.lobbyVotes.length >= room.players.length) {
    returnToLobby(room);
  }
}

/** Apply one client action to a room that has already been advanced to `now`. */
export function applyAction(room: StoredRoom, request: GameRequest, now: number): EngineResult {
  const action = request.action;
  if (action === "join-room") {
    const name = String(request.name || "");
    if (room.status === "playing") return { error: "This flight has already departed.", room };
    if (room.players.length >= 4) return { error: "This crew is full.", room };
    const player = freshPlayer(room, name, now);
    room.players.push(player);
    return { room, playerId: player.id, token: player.token };
  }

  const auth = authed(room, request, now);
  if (!auth.player) return { error: auth.error, room };
  const player = auth.player;

  if (action === "leave-room") {
    room.players = room.players.filter((entry) => entry.id !== player.id);
    room.lobbyVotes = room.lobbyVotes.filter((id) => id !== player.id);
    if (!room.players.length) return { room: null, remove: true };
    if (room.hostId === player.id) room.hostId = room.players[0].id;
    maybeReturn(room);
    return { room };
  }

  if (action === "set-map") {
    if (room.status === "lobby" && player.id === room.hostId && MAP_IDS.has(request.mapId as MapId)) {
      room.mapId = request.mapId as MapId;
    }
  } else if (action === "set-crew-name") {
    if (room.status === "lobby" && player.id === room.hostId) {
      room.crewName = String(request.crewName ?? "").replace(/\s+/g, " ").slice(0, 18);
    }
  } else if (action === "start-game") {
    if (player.id === room.hostId && (room.players.length <= 1 || room.crewName.trim())) startRound(room, now);
  } else if (action === "return-to-lobby") {
    if (room.status !== "lobby") {
      if (!room.lobbyVotes.includes(player.id)) room.lobbyVotes.push(player.id);
      room.lobbyVotes = room.lobbyVotes.filter((id) => room.players.some((entry) => entry.id === id));
      maybeReturn(room);
    }
  } else if (action === "move" || action === "sync" || action === "interact" || action === "drop") {
    const move =
      request.move ??
      (action === "move"
        ? { x: Number(request.x), z: Number(request.z), facing: Number(request.facing), squeezing: Boolean(request.squeezing) }
        : undefined);
    applyMove(room, player, move, now);
    if (action === "interact" && room.status === "playing") {
      interact(room, player, request.seatPreference === "window" ? "window" : "aisle", now);
    }
    if (action === "drop" && room.status === "playing") dropItem(player);
  }

  player.seenAt = now;
  return { room };
}
