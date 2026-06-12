// Nu Nederen server: one process, one port (8080).
// Hono serves the built client bundle + a tiny API; `ws` handles the
// realtime game protocol on /ws. Rooms live in memory only.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocketServer, type WebSocket } from "ws";
import { ClientMessageSchema, type ClientMessage, type ServerMessage } from "@nu/shared";
import { Room, RoomError, RoomManager } from "./rooms.js";
import { statsStore } from "./stats.js";

const PORT = Number(process.env.PORT ?? 8080);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.resolve(HERE, "../../client/dist");

const manager = new RoomManager();

// ---------------------------------------------------------------------------
// HTTP: health + static client bundle (SPA fallback to index.html)
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const app = new Hono();

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    rooms: manager.rooms.size,
    uptime: process.uptime(),
    leaderboard: statsStore.status(),
  }),
);

app.get("/api/topliste", (c) => c.json(statsStore.top(50)));

app.get("*", async (c) => {
  let pathname = decodeURIComponent(new URL(c.req.url).pathname);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const filePath = path.normalize(path.join(CLIENT_DIST, pathname));
  if (!filePath.startsWith(CLIENT_DIST)) return c.text("Nej.", 403);

  const tryServe = async (fp: string): Promise<Response | null> => {
    try {
      const data = await readFile(fp);
      const ext = path.extname(fp).toLowerCase();
      const immutable = pathname.startsWith("/assets/");
      return c.body(new Uint8Array(data), 200, {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": immutable
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
    } catch {
      return null;
    }
  };

  const direct = await tryServe(filePath);
  if (direct) return direct;
  // SPA fallback (e.g. /?rum=KODE deep links).
  const fallback = await tryServe(path.join(CLIENT_DIST, "index.html"));
  if (fallback) return fallback;
  return c.text("Klienten er ikke bygget endnu (kør npm run build).", 404);
});

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

interface Session {
  room: Room | null;
  playerId: string | null;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sendError(ws: WebSocket, code: string, message: string): void {
  send(ws, { type: "error", code, message });
}

function handleMessage(ws: WebSocket, session: Session, msg: ClientMessage): void {
  session.room?.touch();

  switch (msg.type) {
    case "ping":
      send(ws, { type: "pong", t: msg.t });
      return;

    case "createRoom": {
      leaveCurrent(ws, session);
      const room = manager.createRoom();
      const seat = room.addHuman(msg.name, msg.avatar, ws);
      session.room = room;
      session.playerId = seat.id;
      send(ws, { type: "joined", playerId: seat.id, token: seat.token!, code: room.code });
      room.broadcastRoomState();
      return;
    }

    case "joinRoom": {
      const room = manager.get(msg.code);
      if (!room) {
        sendError(ws, "roomNotFound", "Rummet findes ikke — tjek koden.");
        return;
      }
      leaveCurrent(ws, session);
      if (msg.token) {
        const seat = room.reconnect(msg.token, ws);
        if (seat) {
          session.room = room;
          session.playerId = seat.id;
          send(ws, { type: "joined", playerId: seat.id, token: seat.token!, code: room.code });
          room.resync(seat.id);
          return;
        }
      }
      const seat = room.addHuman(msg.name, msg.avatar, ws);
      session.room = room;
      session.playerId = seat.id;
      send(ws, { type: "joined", playerId: seat.id, token: seat.token!, code: room.code });
      room.broadcastRoomState();
      room.sendChatHistory(seat.id);
      return;
    }

    default:
      break;
  }

  const { room, playerId } = session;
  if (!room || !playerId) {
    sendError(ws, "noRoom", "Du er ikke i et rum.");
    return;
  }

  switch (msg.type) {
    case "leaveRoom":
      room.leave(playerId);
      session.room = null;
      session.playerId = null;
      send(ws, { type: "leftRoom" });
      return;
    case "addBot":
      room.addBot(playerId, msg.difficulty);
      return;
    case "removeBot":
      room.removeBot(playerId, msg.botId);
      return;
    case "updateRules":
      room.updateRules(playerId, msg.rules);
      return;
    case "startGame":
      room.startGame(playerId);
      return;
    case "rematch":
      room.rematch(playerId);
      return;
    case "action":
      room.action(playerId, msg.action);
      return;
    case "requestState":
      room.resync(playerId);
      return;
    case "kickPlayer":
      room.kickPlayer(playerId, msg.playerId);
      return;
    case "react":
      room.react(playerId, msg.emoji);
      return;
    case "chat":
      room.chat(playerId, msg.text);
      return;
    case "voice":
      room.voice(playerId, msg.data, msg.mime);
      return;
  }
}

function leaveCurrent(ws: WebSocket, session: Session): void {
  if (session.room && session.playerId) {
    session.room.leave(session.playerId);
  }
  session.room = null;
  session.playerId = null;
  void ws;
}

const httpServer = serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`Nu Nederen-server kører på http://localhost:${info.port}`);
  console.log(`Client-bundle: ${CLIENT_DIST}`);
});

const wss = new WebSocketServer({ noServer: true });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(httpServer as any).on("upgrade", (req: any, socket: any, head: any) => {
  const url = req.url as string | undefined;
  if (url && (url === "/ws" || url.startsWith("/ws?"))) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

const aliveMap = new WeakMap<WebSocket, boolean>();

wss.on("connection", (ws: WebSocket) => {
  const session: Session = { room: null, playerId: null };
  aliveMap.set(ws, true);

  ws.on("pong", () => aliveMap.set(ws, true));

  ws.on("message", (data) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      sendError(ws, "badJson", "Ugyldig besked.");
      return;
    }
    const result = ClientMessageSchema.safeParse(parsed);
    if (!result.success) {
      sendError(ws, "badMessage", "Beskeden kunne ikke forstås.");
      return;
    }
    try {
      handleMessage(ws, session, result.data);
    } catch (e) {
      if (e instanceof RoomError) {
        sendError(ws, e.code, e.message);
      } else {
        console.error("Uventet fejl:", e);
        sendError(ws, "internal", "Der skete en serverfejl — prøv igen.");
      }
    }
  });

  ws.on("close", () => {
    if (session.room && session.playerId) {
      session.room.handleClose(session.playerId, ws);
    }
  });
});

// Terminate dead sockets (Safari kills background tabs without a close frame).
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (aliveMap.get(ws) === false) {
      ws.terminate();
      continue;
    }
    aliveMap.set(ws, false);
    ws.ping();
  }
}, 30 * 1000);
heartbeat.unref?.();
