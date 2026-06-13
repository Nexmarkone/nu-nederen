// Zustand store: connection, room, redacted game state, transient UI state
// (peeks, jump-window countdowns, toasts, banners) and all outbound actions.

import { create } from "zustand";
import {
  DEFAULT_RULES,
  type BotDifficulty,
  type Card,
  type ChatMessage,
  type GameEvent,
  type GridRef,
  type HouseRules,
  type PlayerAction,
  type PrivatePeek,
  type ReactionEmoji,
  type RedactedGameState,
  type RoomInfo,
  type ServerMessage,
} from "@nu/shared";
import {
  setMuted,
  sndBuzz,
  sndDeal,
  sndJackpot,
  sndFlip,
  sndHorn,
  sndPling,
  sndSlam,
  sndTick,
  startMusic,
  stopMusic,
} from "./audio";
import { playVoice } from "./voice";
import { GameSocket, type SocketStatus } from "./ws";

export type Screen = "home" | "lobby" | "game" | "rules" | "topliste";

export interface ActivePeek {
  id: number;
  context: PrivatePeek["context"];
  cards: { card: Card; gridRef?: GridRef }[];
  expiresAt: number;
}

export interface ToastItem {
  id: number;
  text: string;
  kind: "info" | "error" | "success";
}

export interface FloatingReaction {
  id: number;
  playerId: string;
  emoji: ReactionEmoji;
}

interface Session {
  code: string;
  token: string;
  playerId: string;
}

let nextId = 1;

const LS = {
  name: "nn:name",
  avatar: "nn:avatar",
  muted: "nn:muted",
  music: "nn:music",
  threeD: "nn:threed",
  session: "nn:session",
  hint: "nn:installHintSeen",
};

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(LS.session);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export interface StoreState {
  conn: SocketStatus;
  screen: Screen;
  previousScreen: Screen;
  name: string;
  avatar: string;
  muted: boolean;
  music: boolean;
  threeD: boolean;
  playerId: string | null;
  roomCode: string | null;
  token: string | null;
  room: RoomInfo | null;
  game: RedactedGameState | null;
  // Transient UI
  peeks: ActivePeek[];
  drawnCard: Card | null;
  windowDeadline: number | null;
  windowDuration: number;
  memorizeDeadline: number | null;
  turnDeadline: number | null;
  turnDuration: number;
  toasts: ToastItem[];
  swapSelecting: boolean;
  abilityFirstPick: GridRef | null;
  highlights: Record<string, number>;
  failFlash: Record<string, number>;
  banner: { text: string; sub?: string } | null;
  shake: number;
  joinCodeInput: string;
  joining: boolean;
  reactions: FloatingReaction[];
  chatMessages: ChatMessage[];
  chatSeen: number;
  // Actions
  setName(name: string): void;
  setAvatar(avatar: string): void;
  toggleMute(): void;
  toggleMusic(): void;
  toggleThreeD(): void;
  goto(screen: Screen): void;
  setJoinCodeInput(code: string): void;
  createRoom(solo: boolean): void;
  joinRoom(code: string): void;
  leaveRoom(): void;
  addBot(difficulty: BotDifficulty): void;
  removeBot(botId: string): void;
  updateRules(rules: HouseRules): void;
  startGame(): void;
  rematch(): void;
  act(action: PlayerAction): void;
  sendReaction(emoji: ReactionEmoji): void;
  sendVoice(data: string, mime: string): void;
  sendChat(text: string): void;
  markChatSeen(): void;
  kickPlayer(playerId: string): void;
  setSwapSelecting(on: boolean): void;
  setAbilityFirstPick(ref: GridRef | null): void;
  toast(text: string, kind?: ToastItem["kind"]): void;
}

let pendingSolo = false;

export const useStore = create<StoreState>((set, get) => ({
  conn: "connecting",
  screen: "home",
  previousScreen: "home",
  name: localStorage.getItem(LS.name) ?? "",
  avatar: localStorage.getItem(LS.avatar) ?? "🦊",
  muted: localStorage.getItem(LS.muted) === "1",
  music: false,
  // 3D table on by default; toggle persists. Set "0" to disable.
  threeD: localStorage.getItem(LS.threeD) !== "0",
  playerId: null,
  roomCode: null,
  token: null,
  room: null,
  game: null,
  peeks: [],
  drawnCard: null,
  windowDeadline: null,
  windowDuration: 5000,
  memorizeDeadline: null,
  turnDeadline: null,
  turnDuration: 60,
  toasts: [],
  swapSelecting: false,
  abilityFirstPick: null,
  highlights: {},
  failFlash: {},
  banner: null,
  shake: 0,
  joinCodeInput: "",
  joining: false,
  reactions: [],
  chatMessages: [],
  chatSeen: 0,

  setName(name) {
    localStorage.setItem(LS.name, name);
    set({ name });
  },
  setAvatar(avatar) {
    localStorage.setItem(LS.avatar, avatar);
    set({ avatar });
  },
  toggleMute() {
    const muted = !get().muted;
    localStorage.setItem(LS.muted, muted ? "1" : "0");
    setMuted(muted);
    set({ muted });
  },
  toggleMusic() {
    const music = !get().music;
    localStorage.setItem(LS.music, music ? "1" : "0");
    if (music) startMusic();
    else stopMusic();
    set({ music });
  },
  toggleThreeD() {
    const threeD = !get().threeD;
    localStorage.setItem(LS.threeD, threeD ? "1" : "0");
    set({ threeD });
  },
  goto(screen) {
    set((s) => ({ screen, previousScreen: s.screen }));
  },
  setJoinCodeInput(code) {
    set({ joinCodeInput: code.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) });
  },

  createRoom(solo) {
    pendingSolo = solo;
    set({ joining: true });
    if (!socket.send({ type: "createRoom", name: get().name, avatar: get().avatar })) {
      set({ joining: false });
      get().toast("Ingen forbindelse til serveren endnu — prøv igen.", "error");
    }
  },

  joinRoom(code) {
    set({ joining: true });
    if (
      !socket.send({ type: "joinRoom", code, name: get().name, avatar: get().avatar })
    ) {
      set({ joining: false });
      get().toast("Ingen forbindelse til serveren endnu — prøv igen.", "error");
    }
  },

  leaveRoom() {
    socket.send({ type: "leaveRoom" });
    localStorage.removeItem(LS.session);
    stopMusic();
    set({
      room: null,
      game: null,
      roomCode: null,
      token: null,
      playerId: null,
      screen: "home",
      drawnCard: null,
      peeks: [],
      windowDeadline: null,
      banner: null,
    });
  },

  addBot(difficulty) {
    socket.send({ type: "addBot", difficulty });
  },
  removeBot(botId) {
    socket.send({ type: "removeBot", botId });
  },
  updateRules(rules) {
    socket.send({ type: "updateRules", rules });
  },
  startGame() {
    socket.send({ type: "startGame" });
  },
  rematch() {
    socket.send({ type: "rematch" });
  },
  act(action) {
    socket.send({ type: "action", action });
  },
  sendReaction(emoji) {
    socket.send({ type: "react", emoji });
  },
  sendVoice(data, mime) {
    socket.send({ type: "voice", data, mime });
  },
  sendChat(text) {
    socket.send({ type: "chat", text });
  },
  markChatSeen() {
    set((s) => ({ chatSeen: s.chatMessages.length }));
  },
  kickPlayer(playerId) {
    socket.send({ type: "kickPlayer", playerId });
  },
  setSwapSelecting(on) {
    set({ swapSelecting: on });
  },
  setAbilityFirstPick(ref) {
    set({ abilityFirstPick: ref });
  },
  toast(text, kind = "info") {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },
}));

// ---------------------------------------------------------------------------
// Server message handling
// ---------------------------------------------------------------------------

function playerName(id: string): string {
  const s = useStore.getState();
  return (
    s.game?.players.find((p) => p.id === id)?.name ??
    s.room?.players.find((p) => p.id === id)?.name ??
    "Nogen"
  );
}

function isMe(id: string): boolean {
  return useStore.getState().playerId === id;
}

function handleEvent(ev: GameEvent): void {
  const set = useStore.setState;
  const { toast } = useStore.getState();

  switch (ev.type) {
    case "roundStarted":
      set({
        peeks: [],
        drawnCard: null,
        banner: null,
        windowDeadline: null,
        swapSelecting: false,
        abilityFirstPick: null,
      });
      if (ev.roundNumber > 1) toast(`Runde ${ev.roundNumber} — nye kort!`);
      sndDeal();
      break;

    case "memorizeStarted":
      set({ memorizeDeadline: Date.now() + ev.seconds * 1000 });
      sndTick();
      break;

    case "memorizeEnded":
      set((s) => ({
        memorizeDeadline: null,
        peeks: s.peeks.filter((p) => p.context !== "memorize"),
      }));
      sndFlip();
      break;

    case "turnStarted":
      set({
        turnDeadline: ev.turnTimerSeconds > 0 ? Date.now() + ev.turnTimerSeconds * 1000 : null,
        turnDuration: ev.turnTimerSeconds,
        swapSelecting: false,
        abilityFirstPick: null,
      });
      if (isMe(ev.playerId)) sndPling();
      break;

    case "cardDrawn":
      sndTick();
      break;

    case "swappedIn":
    case "discarded":
      sndFlip();
      break;

    case "abilityPeeked": {
      const key = `${ev.target.playerId}:${ev.target.gridIndex}`;
      set((s) => ({ highlights: { ...s.highlights, [key]: Date.now() + 5000 } }));
      if (!isMe(ev.byPlayerId)) {
        toast(`${playerName(ev.byPlayerId)} kigger på et kort 👀`);
      }
      break;
    }

    case "abilitySwapped": {
      const ka = `${ev.a.playerId}:${ev.a.gridIndex}`;
      const kb = `${ev.b.playerId}:${ev.b.gridIndex}`;
      set((s) => ({
        highlights: { ...s.highlights, [ka]: Date.now() + 2000, [kb]: Date.now() + 2000 },
      }));
      sndFlip();
      if (!isMe(ev.byPlayerId)) toast(`${playerName(ev.byPlayerId)} byttede to kort rundt 🔀`);
      break;
    }

    case "abilitySkipped":
      break;

    case "jumpWindowOpened":
      set({ windowDeadline: Date.now() + ev.durationMs, windowDuration: ev.durationMs });
      break;

    case "jumpWindowClosed":
      set({ windowDeadline: null });
      break;

    case "jumpInSuccess":
      set((s) => ({ shake: s.shake + 1 }));
      sndSlam();
      if (!isMe(ev.playerId)) toast(`${playerName(ev.playerId)} jumpede et kort! ⚡`);
      break;

    case "jumpInFailed": {
      const key = `${ev.playerId}:${ev.gridIndex}`;
      set((s) => ({ failFlash: { ...s.failFlash, [key]: Date.now() + 900 } }));
      if (isMe(ev.playerId)) {
        sndBuzz();
        toast(
          ev.penalty === "card" ? "Forkert kort! Du fik et strafkort." : "Forkert kort! +5 point.",
          "error",
        );
      }
      break;
    }

    case "baguetteCalled":
      set({
        banner: { text: "🥖 BAGUETTE!", sub: `${playerName(ev.playerId)} kalder — sidste omgang!` },
      });
      sndHorn();
      setTimeout(() => useStore.setState({ banner: null }), 2600);
      break;

    case "deckReshuffled":
      toast("Trækbunken er blandet igen 🔄");
      break;

    case "turnTimedOut":
      toast(`${playerName(ev.playerId)} løb tør for tid — auto-spil`, "info");
      break;

    case "revealStarted":
      set({ windowDeadline: null, drawnCard: null, swapSelecting: false, abilityFirstPick: null });
      break;

    case "gameOver":
      sndJackpot();
      break;

    case "seatChanged": {
      const name = playerName(ev.playerId);
      if (ev.isBot) toast(`${name} forsvandt — en bot overtager sædet 🤖`);
      else if (ev.connected) toast(`${name} er tilbage! 🎉`, "success");
      break;
    }

    default:
      break;
  }
}

function handleMessage(msg: ServerMessage): void {
  const set = useStore.setState;
  const state = useStore.getState();

  switch (msg.type) {
    case "joined": {
      const session: Session = { code: msg.code, token: msg.token, playerId: msg.playerId };
      localStorage.setItem(LS.session, JSON.stringify(session));
      set({ playerId: msg.playerId, roomCode: msg.code, token: msg.token, joining: false });
      if (pendingSolo) {
        pendingSolo = false;
        socket.send({ type: "updateRules", rules: { ...DEFAULT_RULES, turnTimerSeconds: 0 } });
        socket.send({ type: "addBot", difficulty: "easy" });
        socket.send({ type: "addBot", difficulty: "medium" });
        socket.send({ type: "addBot", difficulty: "hard" });
      }
      break;
    }

    case "roomState": {
      const screen = msg.room.inGame && state.game ? "game" : msg.room.inGame ? state.screen : "lobby";
      set({ room: msg.room, screen: screen === "home" ? "lobby" : screen });
      break;
    }

    case "gameState": {
      const g = msg.state;
      const patch: Partial<StoreState> = { game: g, screen: "game" };
      // The drawn card only exists while its owner decides.
      if (!g.drawnCard || g.drawnCard.byPlayerId !== state.playerId) {
        patch.drawnCard = null;
      }
      if (!g.jumpWindow.open) patch.windowDeadline = null;
      if (g.turnStage !== "decide") patch.swapSelecting = false;
      if (g.pendingAbility !== "swap") patch.abilityFirstPick = null;
      set(patch);
      break;
    }

    case "privatePeek": {
      const peek: ActivePeek = {
        id: nextId++,
        context: msg.context,
        cards: msg.cards,
        expiresAt: Date.now() + msg.ttlMs,
      };
      if (msg.context === "drawn") {
        set({ drawnCard: msg.cards[0]?.card ?? null });
      } else {
        set((s) => ({ peeks: [...s.peeks, peek] }));
        if (msg.context === "peek") sndFlip();
      }
      break;
    }

    case "event":
      handleEvent(msg.event);
      break;

    case "chat": {
      set((s) => ({ chatMessages: [...s.chatMessages.slice(-49), msg.message] }));
      if (msg.message.playerId !== state.playerId) sndTick();
      break;
    }

    case "chatHistory": {
      set({ chatMessages: msg.messages.slice(-50), chatSeen: msg.messages.length });
      break;
    }

    case "voice": {
      // Play everyone's clips (including a tiny echo of your own is avoided:
      // skip if it's me — I already heard myself speak).
      if (msg.playerId !== state.playerId) {
        playVoice(msg.data, msg.mime);
        useStore.getState().toast(`🎙️ ${msg.avatar} ${msg.name} taler…`, "info");
      }
      break;
    }

    case "reaction": {
      const id = nextId++;
      set((s) => ({ reactions: [...s.reactions.slice(-7), { id, playerId: msg.playerId, emoji: msg.emoji }] }));
      sndTick();
      setTimeout(() => {
        set((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) }));
      }, 2600);
      break;
    }

    case "kicked": {
      localStorage.removeItem(LS.session);
      socket.send({ type: "leaveRoom" });
      set({
        room: null,
        game: null,
        roomCode: null,
        token: null,
        playerId: null,
        screen: "home",
        drawnCard: null,
        peeks: [],
        windowDeadline: null,
        banner: null,
      });
      useStore.getState().toast("Værten har smidt dig ud af rummet 🥾", "error");
      break;
    }

    case "leftRoom":
      break;

    case "error": {
      // The room is gone (free server slept / restarted / expired). Recover
      // gracefully instead of leaving the player stuck on a dead screen.
      if (msg.code === "roomNotFound" || msg.code === "noRoom") {
        localStorage.removeItem(LS.session);
        const wasInGame =
          state.screen === "game" ||
          state.screen === "lobby" ||
          state.room !== null ||
          state.game !== null;
        if (wasInGame) {
          stopMusic();
          set({
            room: null,
            game: null,
            roomCode: null,
            token: null,
            playerId: null,
            screen: "home",
            drawnCard: null,
            peeks: [],
            windowDeadline: null,
            banner: null,
            swapSelecting: false,
            abilityFirstPick: null,
            joining: false,
          });
          useStore
            .getState()
            .toast("Spillet blev afbrudt (serveren sov eller genstartede). Start et nyt 🥖", "error");
        } else if (state.joining) {
          set({ joining: false });
          useStore.getState().toast(msg.message, "error");
        }
        break;
      }
      set({ joining: false });
      useStore.getState().toast(msg.message, "error");
      break;
    }

    case "pong":
      break;
  }
}

// ---------------------------------------------------------------------------
// Socket + boot
// ---------------------------------------------------------------------------

export const socket = new GameSocket({
  onMessage: handleMessage,
  onStatus: (conn) => useStore.setState({ conn }),
  onOpen: () => {
    const s = useStore.getState();
    const session = loadSession();
    if (session) {
      socket.send({
        type: "joinRoom",
        code: session.code,
        name: s.name || "Spiller",
        avatar: s.avatar,
        token: session.token,
      });
      socket.send({ type: "requestState" });
    }
  },
});

export function bootStore(): void {
  setMuted(useStore.getState().muted);

  // ?rum=KODE deep link
  const params = new URLSearchParams(location.search);
  const rum = params.get("rum");
  if (rum && /^[a-zA-Z]{4}$/.test(rum)) {
    const session = loadSession();
    if (!session || session.code !== rum.toUpperCase()) {
      localStorage.removeItem(LS.session);
      useStore.setState({ joinCodeInput: rum.toUpperCase() });
    }
    history.replaceState(null, "", "/");
  }

  socket.connect();

  // Sweep expired peeks/highlights so cards flip back automatically.
  setInterval(() => {
    const s = useStore.getState();
    const now = Date.now();
    const peeks = s.peeks.filter((p) => p.expiresAt > now);
    const highlights = Object.fromEntries(
      Object.entries(s.highlights).filter(([, until]) => until > now),
    );
    const failFlash = Object.fromEntries(
      Object.entries(s.failFlash).filter(([, until]) => until > now),
    );
    if (
      peeks.length !== s.peeks.length ||
      Object.keys(highlights).length !== Object.keys(s.highlights).length ||
      Object.keys(failFlash).length !== Object.keys(s.failFlash).length
    ) {
      useStore.setState({ peeks, highlights, failFlash });
    }
  }, 400);
}

export function hasSeenInstallHint(): boolean {
  return localStorage.getItem(LS.hint) === "1";
}

export function markInstallHintSeen(): void {
  localStorage.setItem(LS.hint, "1");
}
