import { handleAction } from "../../game/persist";
import type { GameRequest } from "../../game/engine";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

export async function handleGame(request: Request, now = Date.now()) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  let body: GameRequest;
  try {
    body = (await request.json()) as GameRequest;
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  try {
    return json(await handleAction(body, now));
  } catch (error) {
    console.error(error);
    return json({ error: "The flight could not be saved." }, 500);
  }
}

export default function handler(request: Request) {
  return handleGame(request);
}
