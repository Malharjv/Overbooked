import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Server } from "socket.io";
import { nanoid } from "nanoid";

const PORT = process.env.PORT || 3001;
const ROUND_SECONDS = 180;
const ITEM_POINTS = 75;
const COMPLETE_BONUS = 100;
const MAX_OPEN_ORDERS = 5;
const COLORS = ["#ff5d73", "#32c8b2", "#ffb547", "#8c7cff"];
const EXTRAS = ["water", "soda", "chips"];
const MEALS = ["meat", "fish", "veg"];
const PICKUPS = {
  water: { x: -1.25, z: 7.3 },
  soda: { x: 1.25, z: 7.3 },
  chips: { x: -1.25, z: -7.3 },
  meat: { x: 1.25, z: -6.45 },
  fish: { x: 1.25, z: -7.3 },
  veg: { x: 1.25, z: -8.05 },
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.NODE_ENV === "production" ? false : "*" },
});
const rooms = new Map();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    score: room.score,
    timeLeft: room.timeLeft,
    players: [...room.players.values()],
    orders: room.orders,
    messes: room.messes,
  };
}

function emitRoom(room) {
  io.to(room.code).emit("state", publicRoom(room));
}

function createRoom(code) {
  const room = {
    code,
    status: "lobby",
    score: 0,
    timeLeft: ROUND_SECONDS,
    players: new Map(),
    orders: [],
    messes: [],
    interval: null,
    orderInterval: null,
    pendingOrders: 0,
    roundId: 0,
  };
  rooms.set(code, room);
  return room;
}

function makeOrder(room) {
  if (room.orders.length >= MAX_OPEN_ORDERS) return;
  const occupied = new Set(room.orders.map((order) => order.seatId));
  const available = Array.from({ length: 32 }, (_, i) => i).filter(
    (seatId) => !occupied.has(seatId),
  );
  if (!available.length) return;
  const seatId = available[Math.floor(Math.random() * available.length)];
  const itemCount = Math.random() > 0.78 ? 3 : Math.random() > 0.34 ? 2 : 1;
  const items = [];
  if (Math.random() < 0.68) {
    items.push(MEALS[Math.floor(Math.random() * MEALS.length)]);
  }
  const shuffledExtras = [...EXTRAS].sort(() => Math.random() - 0.5);
  for (const extra of shuffledExtras) {
    if (items.length >= itemCount) break;
    items.push(extra);
  }
  // A one-item order without a meal still gets a valid drink or snack.
  if (!items.length) items.push(shuffledExtras[0]);
  room.orders.push({
    id: nanoid(7),
    seatId,
    items,
    served: [],
    expiresAt: Date.now() + 42000,
  });
}

function queueOrder(room, delay = 2400) {
  const roundId = room.roundId;
  room.pendingOrders += 1;
  setTimeout(() => {
    if (room.roundId !== roundId) return;
    room.pendingOrders = Math.max(0, room.pendingOrders - 1);
    if (room.status === "playing") {
      makeOrder(room);
      emitRoom(room);
    }
  }, delay);
}

function startRound(room) {
  if (room.status === "playing") return;
  room.status = "playing";
  room.score = 0;
  room.timeLeft = ROUND_SECONDS;
  room.orders = [];
  room.messes = [];
  room.pendingOrders = 0;
  room.roundId += 1;
  let spawnIndex = 0;
  for (const player of room.players.values()) {
    player.x = 0;
    player.z = 8.1 - spawnIndex * 0.55;
    player.held = null;
    player.squeezing = false;
    spawnIndex += 1;
  }
  for (let i = 0; i < Math.min(3, room.players.size + 1); i++) makeOrder(room);
  room.orderInterval = setInterval(() => {
    if (room.orders.length + room.pendingOrders < MAX_OPEN_ORDERS) makeOrder(room);
    emitRoom(room);
  }, 6500);
  room.interval = setInterval(() => {
    room.timeLeft -= 1;
    const expired = room.orders.filter((order) => order.expiresAt <= Date.now());
    if (expired.length) {
      room.score = Math.max(0, room.score - expired.length * 50);
      room.orders = room.orders.filter((order) => order.expiresAt > Date.now());
      expired.forEach((_, index) => queueOrder(room, 2400 + index * 450));
    }
    if (room.timeLeft <= 0) {
      room.timeLeft = 0;
      room.status = "finished";
      clearInterval(room.interval);
      clearInterval(room.orderInterval);
      room.interval = null;
      room.orderInterval = null;
    }
    emitRoom(room);
  }, 1000);
  emitRoom(room);
}

function seatPosition(seatId) {
  const row = Math.floor(seatId / 4);
  const column = seatId % 4;
  return {
    x: [-2.25, -1.25, 1.25, 2.25][column],
    z: 5.25 - row * 1.5,
  };
}

io.on("connection", (socket) => {
  socket.on("create-room", ({ name }, callback) => {
    let code;
    do code = nanoid(4).toUpperCase();
    while (rooms.has(code));
    const room = createRoom(code);
    joinRoom(socket, room, name, callback);
  });

  socket.on("join-room", ({ code, name }, callback) => {
    const room = rooms.get(String(code).trim().toUpperCase());
    if (!room) return callback?.({ error: "Flight not found." });
    if (room.status === "playing")
      return callback?.({ error: "This flight has already departed." });
    if (room.players.size >= 4)
      return callback?.({ error: "This crew is full." });
    joinRoom(socket, room, name, callback);
  });

  socket.on("start-game", () => {
    const room = rooms.get(socket.data.roomCode);
    if (room && socket.data.playerId === room.hostId) startRound(room);
  });

  socket.on("move", ({ x, z, facing, squeezing = false }) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || room.status !== "playing") return;
    const next = { x: clamp(Number(x), -0.15, 0.15), z: clamp(Number(z), -8.25, 8.25) };
    // The narrow aisle creates the core co-op bottleneck.
    const blocked = !squeezing && [...room.players.values()].some(
      (other) => other.id !== player.id && distance(next, other) < 0.43,
    );
    if (distance(next, player) <= 0.55 && !blocked) {
      player.x = next.x;
      player.z = next.z;
      player.facing = Number(facing) || 0;
      player.squeezing = Boolean(squeezing);
      emitRoom(room);
    }
  });

  socket.on("interact", ({ seatPreference = "aisle" } = {}) => {
    const room = rooms.get(socket.data.roomCode);
    const player = room?.players.get(socket.data.playerId);
    if (!room || !player || room.status !== "playing") return;

    if (!player.held) {
      const pickup = Object.entries(PICKUPS).find(([, point]) => distance(player, point) < 1.3);
      if (pickup) player.held = { type: "item", item: pickup[0] };
      else {
        const mess = room.messes.find((entry) => distance(player, entry) < 1.25);
        if (mess) {
          player.held = { type: "trash", item: "trash" };
          room.messes = room.messes.filter((entry) => entry.id !== mess.id);
        }
      }
    } else if (
      player.held.type === "trash" &&
      player.z > 7.1
    ) {
      player.held = null;
      room.score += 25;
    } else if (player.held.type === "item") {
      const nearby = room.orders
        .filter((order) => {
          const column = order.seatId % 4;
          const seatType = column === 0 || column === 3 ? "window" : "aisle";
          return (
            seatType === seatPreference &&
            Math.abs(player.z - seatPosition(order.seatId).z) < 0.9
          );
        })
        .sort((a, b) => {
          const seatA = seatPosition(a.seatId);
          const seatB = seatPosition(b.seatId);
          const distanceA = Math.abs(player.x - Math.sign(seatA.x) * 0.15);
          const distanceB = Math.abs(player.x - Math.sign(seatB.x) * 0.15);
          return distanceA - distanceB;
        })[0];
      if (nearby) {
        if (nearby.served.includes(player.held.item)) {
          room.score = Math.max(0, room.score - 50);
        } else if (nearby.items.includes(player.held.item)) {
          nearby.served.push(player.held.item);
          room.score += ITEM_POINTS;
          if (nearby.served.length === nearby.items.length) {
            room.score += COMPLETE_BONUS;
            const seat = seatPosition(nearby.seatId);
            room.messes.push({ id: nanoid(7), x: Math.sign(seat.x) * 0.67, z: seat.z });
            room.orders = room.orders.filter((order) => order.id !== nearby.id);
            queueOrder(room);
          }
        } else {
          room.score = Math.max(0, room.score - 50);
        }
        player.held = null;
      }
    }
    emitRoom(room);
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    room.players.delete(socket.data.playerId);
    if (!room.players.size) {
      clearInterval(room.interval);
      clearInterval(room.orderInterval);
      rooms.delete(room.code);
    } else {
      if (room.hostId === socket.data.playerId)
        room.hostId = room.players.keys().next().value;
      emitRoom(room);
    }
  });
});

function joinRoom(socket, room, rawName, callback) {
  const playerId = nanoid(8);
  const player = {
    id: playerId,
    name: String(rawName || "Crewmate").trim().slice(0, 14),
    color: COLORS[room.players.size],
    x: 0,
    z: 8.1 - room.players.size * 0.55,
    facing: Math.PI,
    squeezing: false,
    held: null,
  };
  room.players.set(playerId, player);
  if (!room.hostId) room.hostId = playerId;
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  socket.join(room.code);
  callback?.({ code: room.code, playerId, hostId: room.hostId });
  emitRoom(room);
}

const dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(dirname, "../dist");
app.use(express.static(clientDist));
app.get("/{*splat}", (_, response) =>
  response.sendFile(path.join(clientDist, "index.html")),
);

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Overbooked is ready on port ${PORT}`);
});
