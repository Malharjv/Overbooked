import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setEnvironmentContext } from "@netlify/blobs";
import { BlobsServer } from "@netlify/blobs/server";
import { handleGame } from "../netlify/functions/game";
import { STATIONS, seatPosition } from "./engine";
import type { ItemName, Leaderboard, RoomState } from "../src/types";

type Seat = "aisle" | "window";

type Session = { playerId: string; token: string; code: string };

let now = 1_700_000_000_000;

const fail = (message: string): never => {
  throw new Error(message);
};

async function post(body: Record<string, unknown>) {
  const response = await handleGame(new Request("http://local/game", { method: "POST", body: JSON.stringify(body) }), now);
  const payload = (await response.json()) as {
    error?: string;
    room?: RoomState | null;
    leaderboard?: Leaderboard;
    playerId?: string;
    token?: string;
  };
  if (!response.ok) fail(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function create(name: string): Promise<Session> {
  const result = await post({ action: "create-room", name });
  if (result.error || !result.room || !result.playerId || !result.token) fail(result.error || "create failed");
  return { playerId: result.playerId!, token: result.token!, code: result.room!.code };
}

async function join(code: string, name: string): Promise<Session> {
  const result = await post({ action: "join-room", code, name });
  if (result.error || !result.playerId || !result.token) fail(result.error || "join failed");
  return { playerId: result.playerId!, token: result.token!, code };
}

async function act(session: Session, action: string, extra: Record<string, unknown> = {}) {
  const result = await post({ action, code: session.code, playerId: session.playerId, token: session.token, ...extra });
  if (result.error) fail(`${action}: ${result.error}`);
  if (!result.room || !result.leaderboard) fail(`${action}: missing room`);
  return { room: result.room!, leaderboard: result.leaderboard! };
}

async function moveTo(session: Session, x: number, z: number) {
  let room = (await act(session, "sync")).room;
  let player = room.players.find((entry) => entry.id === session.playerId);
  if (!player) fail("missing player");
  let steps = 0;
  while (Math.abs(player!.z - z) > 0.05 || Math.abs(player!.x - x) > 0.02) {
    if (steps++ > 80) fail(`stuck walking toward ${x},${z} from ${player!.x},${player!.z}`);
    const dx = x - player!.x;
    const dz = z - player!.z;
    const distance = Math.hypot(dx, dz) || 1;
    const scale = Math.min(1, 0.4 / distance);
    room = (await act(session, "move", { x: player!.x + dx * scale, z: player!.z + dz * scale, facing: 0, squeezing: true })).room;
    player = room.players.find((entry) => entry.id === session.playerId);
    if (!player) fail("missing player");
  }
  return room;
}

function preference(seatId: number): Seat {
  const column = seatId % 4;
  return column === 0 || column === 3 ? "window" : "aisle";
}

async function serveOne(session: Session) {
  let room = (await act(session, "sync")).room;
  const order = room.orders[0];
  if (!order) fail("no order to serve");
  for (const item of order.items) {
    const station = STATIONS[item as ItemName];
    const x = Math.max(-0.15, Math.min(0.15, Math.sign(station.x) * 0.15));
    await moveTo(session, x, station.z);
    room = (await act(session, "interact", { seatPreference: "aisle" })).room;
    const player = room.players.find((entry) => entry.id === session.playerId);
    if (!player?.held.some((entry) => entry.item === item)) fail(`did not pick up ${item}`);
  }
  await moveTo(session, 0, seatPosition(order.seatId).z);
  const before = room.score;
  room = (await act(session, "interact", { seatPreference: preference(order.seatId) })).room;
  let guard = 0;
  while (room.orders.some((entry) => entry.id === order.id) && guard < order.items.length + 1) {
    room = (await act(session, "interact", { seatPreference: preference(order.seatId) })).room;
    guard += 1;
  }
  if (room.score <= before) fail("score did not increase");
  return room;
}

async function elapse(players: Session[], ms: number) {
  const target = now + ms;
  while (now + 10_000 < target) {
    now += 10_000;
    for (const player of players) await act(player, "sync");
  }
  now = target;
  let room = (await act(players[0], "sync")).room;
  for (const player of players.slice(1)) room = (await act(player, "sync")).room;
  return room;
}

async function fly(players: Session[], scorer: Session, alreadyStarted = false) {
  if (!alreadyStarted) await act(players[0], "start-game");
  let room = (await act(scorer, "sync")).room;
  let served = 0;
  while (room.score < 2000 && served < 16 && room.orders.length) {
    room = await serveOne(scorer);
    served += 1;
  }
  if (served < 1 || room.score <= 0) fail(`no points scored (${room.score})`);
  const finished = await elapse(players, 181_000);
  if (finished.status !== "finished") fail(`expected finished, got ${finished.status}`);
  if (finished.score <= 0) fail(`finished score was ${finished.score}`);
  for (const player of players) await act(player, "return-to-lobby");
  const lobby = await act(players[0], "sync");
  if (lobby.room.status !== "lobby") fail("crew did not return to the lobby");
  return finished.score;
}

export function attachContentEtags(blobs: BlobsServer) {
  const server = blobs as unknown as {
    address: string;
    get: (req: Request) => Promise<Response>;
    put: (req: Request) => Promise<Response>;
    getLocalPaths: (url: URL) => { dataPath?: string; key?: string };
    parseAPIRequest: (req: Request) => { url: URL; useSignedURL?: boolean } | null;
  };
  const locks = new Map<string, Promise<void>>();
  const location = (req: Request) => {
    const url = server.parseAPIRequest(req)?.url ?? new URL(req.url || "/", server.address);
    return server.getLocalPaths(url);
  };
  const contentEtag = async (filePath: string) => {
    try {
      const hash = createHash("sha256").update(await readFile(filePath)).digest("hex");
      return `"${hash}"`;
    } catch {
      return null;
    }
  };
  const exclusive = async (key: string, task: () => Promise<Response>) => {
    const previous = locks.get(key) ?? Promise.resolve();
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    locks.set(key, previous.then(() => gate));
    await previous.catch(() => undefined);
    try {
      return await task();
    } finally {
      release();
    }
  };
  const originalGet = server.get.bind(server);
  const originalPut = server.put.bind(server);
  server.get = (req: Request) => {
    if (server.parseAPIRequest(req)?.useSignedURL) return originalGet(req);
    const { dataPath, key } = location(req);
    const read = async () => {
      const response = await originalGet(req);
      if (!response.ok || !dataPath || !key || response.headers.has("etag")) return response;
      const etag = await contentEtag(dataPath);
      if (!etag) return response;
      const headers = new Headers(response.headers);
      headers.set("etag", etag);
      return new Response(await response.arrayBuffer(), { status: response.status, headers });
    };
    return key && dataPath ? exclusive(key, read) : read();
  };
  server.put = (req: Request) => {
    if (server.parseAPIRequest(req)?.useSignedURL) return originalPut(req);
    const { dataPath, key } = location(req);
    const write = async () => {
      const headers = new Headers(req.headers);
      const ifMatch = headers.get("if-match");
      if (ifMatch && dataPath) {
        const current = await contentEtag(dataPath);
        if (current !== ifMatch) return new Response(null, { status: 412 });
        headers.delete("if-match");
      }
      const forwarded = new Request(new URL(req.url || "/", server.address), {
        method: "PUT",
        headers,
        body: await req.arrayBuffer(),
      });
      const response = await originalPut(forwarded);
      if (!response.ok || !dataPath) return response;
      const etag = await contentEtag(dataPath);
      const nextHeaders = new Headers(response.headers);
      if (etag) nextHeaders.set("etag", etag);
      return new Response(null, { status: response.status, headers: nextHeaders });
    };
    return key && dataPath ? exclusive(key, write) : write();
  };
}

async function main() {
  const directory = await mkdtemp(path.join(tmpdir(), "overbooked-blobs-"));
  const blobs = new BlobsServer({ directory, token: "playthrough-token" });
  attachContentEtags(blobs);
  const address = await blobs.start();
  setEnvironmentContext({
    apiURL: address.address,
    siteID: "overbooked-site",
    token: "playthrough-token",
  });

  try {
    const captain = await create("Ava");
    const partner = await join(captain.code, "Ben");
    const crew = [captain, partner];
    await act(captain, "set-crew-name", { crewName: "Sky Club" });
    await act(captain, "set-map", { mapId: "smooth-skies" });
    await act(captain, "start-game");
    await Promise.all([
      act(captain, "move", { x: 0, z: 7.6, facing: 0, squeezing: true }),
      act(partner, "move", { x: 0, z: 7.1, facing: 0, squeezing: true }),
    ]);
    const sideBySide = await act(captain, "sync");
    const ava = sideBySide.room.players.find((player) => player.id === captain.playerId);
    const ben = sideBySide.room.players.find((player) => player.id === partner.playerId);
    if (!ava || !ben || Math.abs(ava.z - 7.6) > 0.2 || Math.abs(ben.z - 7.1) > 0.2) {
      fail(`conditional writes dropped a move (${ava?.z}, ${ben?.z})`);
    }

    const first = await fly(crew, captain, true);
    const second = await fly(crew, partner);
    const best = Math.max(first, second);
    await act(captain, "set-crew-name", { crewName: "Night Shift" });
    await act(captain, "start-game");
    const third = await elapse(crew, 181_000);
    if (third.status !== "finished") fail("third round did not finish");
    if (third.score !== 0) fail(`third round should be an empty service, scored ${third.score}`);

    const board = (await act(captain, "sync")).leaderboard["smooth-skies"];
    const winner = board[0];
    const night = board.find((entry) => entry.crewName === "Night Shift");
    if (!winner || winner.crewName !== "Sky Club") fail(`winner was ${winner?.crewName}`);
    if (winner.score !== best) fail(`winner score ${winner.score} != ${best}`);
    if (!night || night.score !== 0) fail("night shift score missing");
    if (board[0].score <= (night?.score ?? 0) && winner.crewName === night?.crewName) fail("winner ordering");
    if (sideBySide.room.players.length !== 2) fail("expected two players");
    console.log(
      JSON.stringify({
        rounds: [first, second, third.score],
        winner: winner.crewName,
        score: winner.score,
        players: sideBySide.room.players.map((player) => player.name),
      }),
    );
  } finally {
    await blobs.stop();
    await rm(directory, { recursive: true, force: true });
  }
}

const invokedDirectly = (process.argv[1] ?? "").includes("playthrough");
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
