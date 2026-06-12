// Runs the pure engine for one room: applies actions, routes events,
// drives all timers (memorize / jump-in window / turn timer) and schedules
// bot behaviour with natural thinking pauses.

import {
  applyAction,
  createGame,
  mulberry32,
  PEEK_TTL_MS,
  redactGameState,
  type Card,
  type EngineAction,
  type EngineError,
  type GameEvent,
  type GameState,
  type GridRef,
  type HouseRules,
  type LobbyPlayer,
  type PlayerAction,
  type PrivatePeek,
  type Rng,
  type ServerMessage,
} from "@nu/shared";
import { BotBrain } from "./bots.js";

export interface LoopHost {
  sendTo(playerId: string, msg: ServerMessage): void;
  sendAll(msg: ServerMessage): void;
  /** Ids of connected human players (receive state snapshots). */
  connectedHumanIds(): string[];
  /** Called once when the game reaches gameOver (leaderboard bookkeeping). */
  onGameOver?(state: GameState): void;
}

const DRAWN_PEEK_TTL_MS = 10 * 60 * 1000;

export class GameLoop {
  state: GameState;
  memorizeEndsAt = 0;
  windowClosesAt = 0;
  private readonly rng: Rng;
  private brains = new Map<string, BotBrain>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private memorizeTimer: ReturnType<typeof setTimeout> | null = null;
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly host: LoopHost,
    players: LobbyPlayer[],
    rules: HouseRules,
    readonly seed: number = Math.floor(Math.random() * 2 ** 31),
  ) {
    this.rng = mulberry32(this.seed);
    for (const p of players) {
      if (p.isBot) {
        this.brains.set(p.id, new BotBrain(p.id, p.botDifficulty ?? "medium"));
      }
    }
    const { state, events } = createGame(players, rules, this.rng, this.seed);
    this.state = state;
    this.processEvents(events);
    this.broadcastState();
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const t of [this.memorizeTimer, this.windowTimer, this.turnTimer, this.revealTimer]) {
      if (t) clearTimeout(t);
    }
  }

  // -------------------------------------------------------------------------
  // Dispatch
  // -------------------------------------------------------------------------

  /** Maps a validated client PlayerAction to an engine action for that player. */
  dispatchPlayer(playerId: string, action: PlayerAction): EngineError | null {
    let engineAction: EngineAction;
    switch (action.type) {
      case "draw":
        engineAction = { type: "draw", playerId, from: action.from };
        break;
      case "swapInto":
        engineAction = { type: "swapInto", playerId, gridIndex: action.gridIndex };
        break;
      case "discardDrawn":
        engineAction = { type: "discardDrawn", playerId, useAbility: action.useAbility };
        break;
      case "abilityPeek":
        engineAction = { type: "abilityPeek", playerId, target: action.target };
        break;
      case "abilitySwap":
        engineAction = { type: "abilitySwap", playerId, a: action.a, b: action.b };
        break;
      case "skipAbility":
        engineAction = { type: "skipAbility", playerId };
        break;
      case "jumpIn":
        engineAction = {
          type: "jumpIn",
          playerId,
          gridIndex: action.gridIndex,
          windowId: action.windowId,
        };
        break;
      case "baguette":
        engineAction = { type: "baguette", playerId };
        break;
      case "nextRound":
        engineAction = { type: "nextRound" };
        break;
    }
    return this.dispatch(engineAction);
  }

  dispatch(action: EngineAction): EngineError | null {
    if (this.disposed) return { code: "disposed", message: "Spillet er lukket." };
    const res = applyAction(this.state, action, this.rng);
    if (res.error) return res.error;
    this.state = res.state;
    this.processEvents(res.events);
    this.broadcastState();
    return null;
  }

  // -------------------------------------------------------------------------
  // Event routing + timers
  // -------------------------------------------------------------------------

  private processEvents(events: GameEvent[]): void {
    for (const ev of events) {
      if ("private" in ev) {
        this.routePrivate(ev);
        continue;
      }
      this.host.sendAll({ type: "event", event: ev });
      for (const brain of this.brains.values()) brain.onEvent(ev);
      this.handleTimersFor(ev);
    }
  }

  private routePrivate(
    ev: Extract<GameEvent, { private: string }>,
  ): void {
    // Bots receive their own private peeks through the same channel.
    this.brains.get(ev.private)?.onEvent(ev);

    let peek: PrivatePeek | null = null;
    if (ev.type === "memorizePrivate") {
      peek = {
        type: "privatePeek",
        context: "memorize",
        cards: ev.cards.map(({ gridIndex, card }) => ({
          card,
          gridRef: { playerId: ev.private, gridIndex },
        })),
        ttlMs: this.state.rules.memorizeSeconds * 1000,
      };
    } else if (ev.type === "drawnPrivate") {
      peek = {
        type: "privatePeek",
        context: "drawn",
        cards: [{ card: ev.card }],
        ttlMs: DRAWN_PEEK_TTL_MS,
      };
    } else if (ev.type === "peekPrivate") {
      peek = {
        type: "privatePeek",
        context: "peek",
        cards: [{ card: ev.card, gridRef: ev.target }],
        ttlMs: PEEK_TTL_MS,
      };
    }
    if (peek) this.host.sendTo(ev.private, peek);
  }

  private handleTimersFor(ev: GameEvent): void {
    switch (ev.type) {
      case "memorizeStarted": {
        this.memorizeEndsAt = Date.now() + ev.seconds * 1000;
        if (this.memorizeTimer) clearTimeout(this.memorizeTimer);
        this.memorizeTimer = setTimeout(() => {
          this.dispatch({ type: "endMemorize" });
        }, ev.seconds * 1000);
        break;
      }

      case "turnStarted": {
        this.clearTurnTimer();
        const player = this.state.players.find((p) => p.id === ev.playerId);
        if (!player) break;
        if (player.isBot) {
          this.botDelay(1200, 2500, () => {
            if (this.isCurrent(ev.playerId, "draw")) {
              this.dispatch({ type: "draw", playerId: ev.playerId });
            }
          });
        } else if (ev.turnTimerSeconds > 0) {
          this.turnTimer = setTimeout(() => {
            this.dispatch({ type: "turnTimeout", playerId: ev.playerId });
          }, ev.turnTimerSeconds * 1000);
        }
        break;
      }

      case "cardDrawn": {
        const player = this.state.players.find((p) => p.id === ev.playerId);
        if (player?.isBot) {
          this.botDelay(800, 1800, () => this.botDecide(ev.playerId));
        }
        break;
      }

      case "jumpWindowOpened": {
        this.windowClosesAt = Date.now() + ev.durationMs;
        if (this.windowTimer) clearTimeout(this.windowTimer);
        this.windowTimer = setTimeout(() => {
          this.dispatch({ type: "closeJumpWindow", windowId: ev.windowId });
        }, ev.durationMs);
        this.scheduleBotJumps(ev.windowId, ev.durationMs);
        break;
      }

      case "discarded":
      case "swappedIn": {
        const player = this.state.players.find((p) => p.id === ev.playerId);
        if (player?.isBot) {
          if (ev.type === "discarded" && ev.ability) {
            this.botDelay(1000, 2000, () => this.botAbility(ev.playerId));
          }
          this.botDelay(500, 900, () => this.botMaybeBaguette(ev.playerId));
        }
        break;
      }

      case "revealStarted": {
        this.clearTurnTimer();
        if (this.windowTimer) clearTimeout(this.windowTimer);
        this.clearBotTimers();
        this.scheduleRevealAdvance();
        break;
      }

      case "gameOver": {
        this.clearBotTimers();
        this.clearTurnTimer();
        this.host.onGameOver?.(this.state);
        break;
      }

      case "seatChanged": {
        if (ev.isBot) this.nudgeBot(ev.playerId);
        break;
      }

      default:
        break;
    }
  }

  private scheduleRevealAdvance(): void {
    if (this.revealTimer) clearTimeout(this.revealTimer);
    // Humans advance via the host's button; bots-only games (or everyone
    // disconnected) advance automatically. A long fallback keeps stuck
    // games moving even if the host walked away.
    const humans = this.host.connectedHumanIds();
    const delay = humans.length === 0 ? 9000 : 120000;
    this.revealTimer = setTimeout(() => {
      if (this.state.phase === "reveal") this.dispatch({ type: "nextRound" });
    }, delay);
  }

  // -------------------------------------------------------------------------
  // Bots
  // -------------------------------------------------------------------------

  ensureBrain(playerId: string): void {
    if (!this.brains.has(playerId)) {
      const p = this.state.players.find((x) => x.id === playerId);
      this.brains.set(playerId, new BotBrain(playerId, p?.botDifficulty ?? "medium"));
    }
  }

  removeBrain(playerId: string): void {
    this.brains.delete(playerId);
  }

  /** Kick a bot into action mid-turn (used after a takeover). */
  nudgeBot(playerId: string): void {
    this.ensureBrain(playerId);
    const brain = this.brains.get(playerId)!;
    if (this.state.phase !== "playing") return;
    if (this.state.players[this.state.currentPlayerIndex]!.id !== playerId) return;

    const stage = this.state.turnStage;
    if (stage === "draw") {
      this.botDelay(1200, 2200, () => {
        if (this.isCurrent(playerId, "draw")) this.dispatch({ type: "draw", playerId });
      });
    } else if (stage === "decide") {
      // The seat legitimately holds this card; hand the knowledge to the brain.
      if (this.state.drawnCard) {
        brain.onEvent({ type: "drawnPrivate", private: playerId, card: this.state.drawnCard });
      }
      this.botDelay(800, 1600, () => this.botDecide(playerId));
    } else if (stage === "ability") {
      this.botDelay(800, 1600, () => this.botAbility(playerId));
    }
  }

  private isCurrent(playerId: string, stage?: GameState["turnStage"]): boolean {
    return (
      this.state.phase === "playing" &&
      this.state.players[this.state.currentPlayerIndex]!.id === playerId &&
      (stage === undefined || this.state.turnStage === stage)
    );
  }

  private botDecide(playerId: string): void {
    if (!this.isCurrent(playerId, "decide")) return;
    const brain = this.brains.get(playerId);
    if (!brain) return;
    const red = redactGameState(this.state, playerId);
    const choice = brain.chooseTurn(red);
    if (choice.kind === "swap") {
      this.dispatch({ type: "swapInto", playerId, gridIndex: choice.gridIndex });
    } else {
      this.dispatch({ type: "discardDrawn", playerId, useAbility: choice.useAbility });
    }
  }

  private botAbility(playerId: string): void {
    if (!this.isCurrent(playerId, "ability")) return;
    const brain = this.brains.get(playerId);
    if (!brain) return;
    const red = redactGameState(this.state, playerId);

    if (this.state.pendingAbility === "peek") {
      const target = brain.choosePeekTarget(red);
      if (target) {
        this.dispatch({ type: "abilityPeek", playerId, target });
        return;
      }
    } else if (this.state.pendingAbility === "swap") {
      const targets = brain.chooseSwapTargets(red);
      if (targets) {
        this.dispatch({ type: "abilitySwap", playerId, a: targets.a, b: targets.b });
        return;
      }
    }
    this.dispatch({ type: "skipAbility", playerId });
  }

  private botMaybeBaguette(playerId: string): void {
    if (!this.isCurrent(playerId)) return;
    if (this.state.turnStage !== "window" && this.state.turnStage !== "ability") return;
    if (this.state.baguette.callerId !== null) return;
    const brain = this.brains.get(playerId);
    if (!brain) return;
    if (brain.shouldCallBaguette(redactGameState(this.state, playerId))) {
      this.dispatch({ type: "baguette", playerId });
    }
  }

  private scheduleBotJumps(windowId: number, durationMs: number): void {
    for (const [botId, brain] of this.brains) {
      const player = this.state.players.find((p) => p.id === botId);
      if (!player?.isBot) continue;
      const plan = brain.jumpCandidate(redactGameState(this.state, botId));
      if (!plan) continue;
      const reaction = Math.min(plan.reactionMs, Math.max(200, durationMs - 250));
      this.botDelay(reaction, reaction, () => {
        // Stale window ids fail silently inside the engine — exactly like a
        // human whose tap arrived too late.
        this.dispatch({ type: "jumpIn", playerId: botId, gridIndex: plan.gridIndex, windowId });
      });
    }
  }

  private botDelay(minMs: number, maxMs: number, fn: () => void): void {
    const delay = minMs + Math.random() * Math.max(0, maxMs - minMs);
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.disposed) fn();
    }, delay);
    this.timers.add(t);
  }

  private clearBotTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // State sync
  // -------------------------------------------------------------------------

  private broadcastState(): void {
    for (const id of this.host.connectedHumanIds()) {
      this.host.sendTo(id, { type: "gameState", state: redactGameState(this.state, id) });
    }
  }

  /** Full resync for one player (reconnect / requestState). Edge case #1. */
  resyncPlayer(playerId: string): void {
    this.host.sendTo(playerId, {
      type: "gameState",
      state: redactGameState(this.state, playerId),
    });

    if (this.state.phase === "memorize") {
      const p = this.state.players.find((x) => x.id === playerId);
      const ttl = this.memorizeEndsAt - Date.now();
      if (p && ttl > 500) {
        const cards = [2, 3]
          .filter((i) => p.grid[i])
          .map((gridIndex) => ({
            card: p.grid[gridIndex]! as Card,
            gridRef: { playerId, gridIndex } as GridRef,
          }));
        this.host.sendTo(playerId, {
          type: "privatePeek",
          context: "memorize",
          cards,
          ttlMs: ttl,
        });
      }
    }

    // Re-send the drawn card if this player is mid-decision.
    if (
      this.state.phase === "playing" &&
      this.state.turnStage === "decide" &&
      this.state.drawnCard &&
      this.state.players[this.state.currentPlayerIndex]!.id === playerId
    ) {
      this.host.sendTo(playerId, {
        type: "privatePeek",
        context: "drawn",
        cards: [{ card: this.state.drawnCard }],
        ttlMs: DRAWN_PEEK_TTL_MS,
      });
    }
  }
}
