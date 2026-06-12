// RoomManager: room codes, seats, reconnect tokens, lobby flow, lifetimes,
// disconnect grace periods and bot takeover of abandoned seats.

import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  DEFAULT_RULES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type BotDifficulty,
  type ChatMessage,
  type GameState,
  type HouseRules,
  type LobbyPlayer,
  type PlayerAction,
  type ReactionEmoji,
  type RoomInfo,
  type ServerMessage,
} from "@nu/shared";
import { BOT_PROFILES } from "./bots.js";
import { GameLoop } from "./gameLoop.js";
import { statsStore } from "./stats.js";

// Code alphabet without lookalikes (no O/I — and no digits at all).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_ROOMS = 200;
const ROOM_IDLE_MS = 30 * 60 * 1000;
const LOBBY_DISCONNECT_GRACE_MS = 30 * 1000;
const TAKEOVER_MS = 90 * 1000;

export class RoomError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Seat {
  id: string;
  name: string;
  avatar: string;
  /** True for seats created as bots in the lobby (not takeover stand-ins). */
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  token: string | null;
  ws: WebSocket | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  lastReactAt: number;
}

export class Room {
  hostId: string = "";
  seats: Seat[] = [];
  rules: HouseRules = { ...DEFAULT_RULES };
  loop: GameLoop | null = null;
  lastActivity = Date.now();
  chatLog: ChatMessage[] = [];

  constructor(
    readonly code: string,
    private readonly manager: RoomManager,
  ) {}

  touch(): void {
    this.lastActivity = Date.now();
  }

  // --- LoopHost interface ---------------------------------------------------

  sendTo(playerId: string, msg: ServerMessage): void {
    const seat = this.seats.find((s) => s.id === playerId);
    if (seat?.ws && seat.ws.readyState === seat.ws.OPEN) {
      seat.ws.send(JSON.stringify(msg));
    }
  }

  sendAll(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const s of this.seats) {
      if (s.ws && s.ws.readyState === s.ws.OPEN) s.ws.send(data);
    }
  }

  connectedHumanIds(): string[] {
    return this.seats
      .filter((s) => s.ws && s.ws.readyState === s.ws.OPEN)
      .map((s) => s.id);
  }

  onGameOver(state: GameState): void {
    statsStore.record(state);
  }

  // --- Lobby ------------------------------------------------------------------

  roomInfo(): RoomInfo {
    const playerInfo = (s: Seat) => {
      const inGame = this.loop?.state.players.find((p) => p.id === s.id);
      return {
        id: s.id,
        name: s.name,
        avatar: s.avatar,
        isBot: inGame ? inGame.isBot : s.isBot,
        botDifficulty: inGame ? inGame.botDifficulty : s.botDifficulty,
        connected: s.isBot ? true : s.ws?.readyState === s.ws?.OPEN,
      };
    };
    return {
      code: this.code,
      hostId: this.hostId,
      inGame: this.loop !== null && this.loop.state.phase !== "gameOver",
      players: this.seats.map(playerInfo),
      rules: this.rules,
    };
  }

  broadcastRoomState(): void {
    this.sendAll({ type: "roomState", room: this.roomInfo() });
  }

  addHuman(name: string, avatar: string, ws: WebSocket): Seat {
    if (this.loop && this.loop.state.phase !== "gameOver") {
      throw new RoomError("gameInProgress", "Spillet er allerede i gang — bed om et nyt link.");
    }
    if (this.seats.length >= MAX_PLAYERS) {
      throw new RoomError("roomFull", "Rummet er fuldt (max 6 spillere).");
    }
    const seat: Seat = {
      id: `p-${randomUUID().slice(0, 12)}`,
      name,
      avatar,
      isBot: false,
      botDifficulty: null,
      token: randomUUID(),
      ws,
      graceTimer: null,
      lastReactAt: 0,
    };
    this.seats.push(seat);
    if (!this.hostId) this.hostId = seat.id;
    this.touch();
    return seat;
  }

  /** Token-based reconnect; returns the seat or null if the token is unknown. */
  reconnect(token: string, ws: WebSocket): Seat | null {
    const seat = this.seats.find((s) => s.token === token);
    if (!seat) return null;
    if (seat.graceTimer) {
      clearTimeout(seat.graceTimer);
      seat.graceTimer = null;
    }
    if (seat.ws && seat.ws !== ws && seat.ws.readyState === seat.ws.OPEN) {
      seat.ws.close(4000, "Erstattet af ny forbindelse");
    }
    seat.ws = ws;
    this.touch();

    if (this.loop) {
      const p = this.loop.state.players.find((x) => x.id === seat.id);
      if (p?.isBot) {
        // A bot took the seat — reclaim it.
        this.loop.removeBrain(seat.id);
        this.loop.dispatch({ type: "reclaimSeat", playerId: seat.id });
      } else {
        this.loop.dispatch({ type: "setConnected", playerId: seat.id, connected: true });
      }
    }
    this.broadcastRoomState();
    return seat;
  }

  addBot(byPlayerId: string, difficulty: BotDifficulty): void {
    this.requireHost(byPlayerId);
    this.requireLobby();
    if (this.seats.length >= MAX_PLAYERS) {
      throw new RoomError("roomFull", "Rummet er fuldt (max 6 spillere).");
    }
    const profile = BOT_PROFILES[difficulty];
    const used = new Set(this.seats.map((s) => s.name));
    const name =
      profile.names.find((n) => !used.has(n)) ??
      `${profile.names[0]} ${this.seats.filter((s) => s.isBot).length + 1}`;
    this.seats.push({
      id: `bot-${randomUUID().slice(0, 8)}`,
      name,
      avatar: profile.avatar,
      isBot: true,
      botDifficulty: difficulty,
      token: null,
      ws: null,
      graceTimer: null,
      lastReactAt: 0,
    });
    this.touch();
    this.broadcastRoomState();
  }

  removeBot(byPlayerId: string, botId: string): void {
    this.requireHost(byPlayerId);
    this.requireLobby();
    const idx = this.seats.findIndex((s) => s.id === botId && s.isBot);
    if (idx === -1) throw new RoomError("noBot", "Botten findes ikke.");
    this.seats.splice(idx, 1);
    this.broadcastRoomState();
  }

  updateRules(byPlayerId: string, rules: HouseRules): void {
    this.requireHost(byPlayerId);
    this.requireLobby();
    this.rules = rules;
    this.broadcastRoomState();
  }

  startGame(byPlayerId: string): void {
    this.requireHost(byPlayerId);
    this.requireLobby();
    if (this.seats.length < MIN_PLAYERS) {
      throw new RoomError("tooFew", "Der skal være mindst 2 spillere (tilføj en bot?).");
    }
    this.loop?.dispose();
    this.loop = new GameLoop(this, this.lobbyPlayers(), this.rules);
    this.broadcastRoomState();
  }

  rematch(byPlayerId: string): void {
    this.requireHost(byPlayerId);
    if (!this.loop || this.loop.state.phase !== "gameOver") {
      throw new RoomError("notOver", "Spillet er ikke slut endnu.");
    }
    // Drop abandoned human seats (taken over by bots) before the rematch.
    const abandoned = this.seats.filter(
      (s) => !s.isBot && (!s.ws || s.ws.readyState !== s.ws.OPEN),
    );
    for (const s of abandoned) this.dropSeat(s.id);
    if (this.seats.length < MIN_PLAYERS) {
      throw new RoomError("tooFew", "For få spillere tilbage til revanche.");
    }
    this.loop.dispose();
    this.loop = new GameLoop(this, this.lobbyPlayers(), this.rules);
    this.broadcastRoomState();
  }

  private lobbyPlayers(): LobbyPlayer[] {
    return this.seats.map((s) => ({
      id: s.id,
      name: s.name,
      avatar: s.avatar,
      isBot: s.isBot,
      botDifficulty: s.botDifficulty,
      connected: s.isBot ? true : s.ws?.readyState === s.ws?.OPEN,
    }));
  }

  // --- Game actions -------------------------------------------------------

  action(playerId: string, action: PlayerAction): void {
    if (!this.loop) throw new RoomError("noGame", "Spillet er ikke startet.");
    if (action.type === "nextRound" && playerId !== this.hostId) {
      throw new RoomError("notHost", "Kun værten kan fortsætte til næste runde.");
    }
    this.touch();
    const err = this.loop.dispatchPlayer(playerId, action);
    if (err && !err.silent) {
      this.sendTo(playerId, { type: "error", code: err.code, message: err.message });
    }
  }

  resync(playerId: string): void {
    this.sendTo(playerId, { type: "roomState", room: this.roomInfo() });
    this.sendChatHistory(playerId);
    this.loop?.resyncPlayer(playerId);
  }

  /** Emoji reaction — broadcast to everyone, lightly rate-limited per seat. */
  react(playerId: string, emoji: ReactionEmoji): void {
    const seat = this.seats.find((s) => s.id === playerId);
    if (!seat) return;
    const now = Date.now();
    if (now - seat.lastReactAt < 700) return; // spam guard, silently dropped
    seat.lastReactAt = now;
    this.sendAll({ type: "reaction", playerId, emoji });
  }

  /** Text chat — broadcast + kept in a short in-memory log for late joiners. */
  chat(playerId: string, text: string): void {
    const seat = this.seats.find((s) => s.id === playerId);
    if (!seat) return;
    const now = Date.now();
    if (now - seat.lastReactAt < 600) return;
    seat.lastReactAt = now;
    const message: ChatMessage = {
      playerId,
      name: seat.name,
      avatar: seat.avatar,
      text,
      ts: now,
    };
    this.chatLog.push(message);
    if (this.chatLog.length > 30) this.chatLog.shift();
    this.touch();
    this.sendAll({ type: "chat", message });
  }

  sendChatHistory(playerId: string): void {
    if (this.chatLog.length > 0) {
      this.sendTo(playerId, { type: "chatHistory", messages: this.chatLog });
    }
  }

  /**
   * Host privilege: throw a player out. In the lobby the seat disappears;
   * mid-game a bot takes over instantly. Their token is rotated so the seat
   * cannot be reclaimed.
   */
  kickPlayer(byPlayerId: string, targetId: string): void {
    this.requireHost(byPlayerId);
    if (targetId === byPlayerId) {
      throw new RoomError("cantKickSelf", "Du kan ikke smide dig selv ud.");
    }
    const seat = this.seats.find((s) => s.id === targetId);
    if (!seat) throw new RoomError("noPlayer", "Spilleren findes ikke.");
    if (seat.isBot) {
      // Bots kickes via removeBot i lobbyen; midt i spillet kan de ikke fjernes.
      this.removeBot(byPlayerId, targetId);
      return;
    }

    this.sendTo(targetId, { type: "kicked" });
    seat.token = randomUUID(); // invalidate any stored reconnect token
    seat.ws = null;
    if (seat.graceTimer) {
      clearTimeout(seat.graceTimer);
      seat.graceTimer = null;
    }

    if (this.loop && this.loop.state.phase !== "gameOver") {
      this.takeOverSeat(targetId);
    } else {
      this.dropSeat(targetId);
    }
    this.touch();
    this.broadcastRoomState();
    this.disposeIfAbandoned();
  }

  // --- Presence -------------------------------------------------------------

  /** Explicit leave: lobby = remove seat; in game = hand the seat to a bot. */
  leave(playerId: string): void {
    const seat = this.seats.find((s) => s.id === playerId);
    if (!seat) return;
    seat.ws = null;
    if (this.loop && this.loop.state.phase !== "gameOver") {
      this.takeOverSeat(playerId);
    } else {
      this.dropSeat(playerId);
    }
    this.broadcastRoomState();
    this.disposeIfAbandoned();
  }

  /** Socket dropped without a goodbye (backgrounded Safari, bad network...). */
  handleClose(playerId: string, ws: WebSocket): void {
    const seat = this.seats.find((s) => s.id === playerId);
    if (!seat || seat.ws !== ws) return; // an old socket closing late
    seat.ws = null;

    if (this.loop && this.loop.state.phase !== "gameOver") {
      this.loop.dispatch({ type: "setConnected", playerId, connected: false });
      seat.graceTimer = setTimeout(() => {
        if (!seat.ws && this.loop && this.loop.state.phase !== "gameOver") {
          this.takeOverSeat(playerId);
        }
      }, TAKEOVER_MS);
    } else {
      seat.graceTimer = setTimeout(() => {
        if (!seat.ws) {
          this.dropSeat(playerId);
          this.broadcastRoomState();
          this.disposeIfAbandoned();
        }
      }, LOBBY_DISCONNECT_GRACE_MS);
    }
    this.broadcastRoomState();
  }

  private takeOverSeat(playerId: string): void {
    if (!this.loop) return;
    const p = this.loop.state.players.find((x) => x.id === playerId);
    if (!p || p.isBot) return;
    this.loop.dispatch({ type: "botTakeover", playerId, difficulty: "medium" });
    this.loop.ensureBrain(playerId);
    this.loop.nudgeBot(playerId);
    this.migrateHostIfNeeded();
    this.broadcastRoomState();
  }

  private dropSeat(playerId: string): void {
    const idx = this.seats.findIndex((s) => s.id === playerId);
    if (idx === -1) return;
    const seat = this.seats[idx]!;
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    this.seats.splice(idx, 1);
    this.migrateHostIfNeeded();
  }

  private migrateHostIfNeeded(): void {
    const host = this.seats.find((s) => s.id === this.hostId);
    const hostAlive = host && !host.isBot && host.ws?.readyState === host.ws?.OPEN;
    if (hostAlive) return;
    // Oldest remaining connected human becomes host.
    const heir = this.seats.find((s) => !s.isBot && s.ws?.readyState === s.ws?.OPEN);
    if (heir) this.hostId = heir.id;
  }

  private disposeIfAbandoned(): void {
    const hasHumans = this.seats.some((s) => !s.isBot);
    if (!hasHumans) this.manager.dispose(this.code);
  }

  dispose(): void {
    this.loop?.dispose();
    this.loop = null;
    for (const s of this.seats) {
      if (s.graceTimer) clearTimeout(s.graceTimer);
      if (s.ws && s.ws.readyState === s.ws.OPEN) s.ws.close(4001, "Rummet er lukket");
    }
    this.seats = [];
  }

  private requireHost(playerId: string): void {
    if (playerId !== this.hostId) {
      throw new RoomError("notHost", "Kun værten kan gøre det.");
    }
  }

  private requireLobby(): void {
    if (this.loop && this.loop.state.phase !== "gameOver") {
      throw new RoomError("inGame", "Det kan ikke ændres midt i et spil.");
    }
  }
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval>;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 60 * 1000);
    this.sweeper.unref?.();
  }

  createRoom(): Room {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new RoomError("serverFull", "Serveren er fuld lige nu — prøv igen om lidt.");
    }
    let code = this.generateCode();
    while (this.rooms.has(code)) code = this.generateCode();
    const room = new Room(code, this);
    this.rooms.set(code, room); // reserved immediately: collisions impossible
    return room;
  }

  get(code: string): Room | null {
    return this.rooms.get(code.toUpperCase()) ?? null;
  }

  dispose(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    this.rooms.delete(code);
    room.dispose();
  }

  private generateCode(): string {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return code;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > ROOM_IDLE_MS) {
        this.dispose(code);
      }
    }
  }
}
