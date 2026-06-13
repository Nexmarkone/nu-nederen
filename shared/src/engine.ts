// Pure game engine for Nu Nederen.
// applyAction(state, action, rng) -> { state, events, error? }
// The server is the only place this runs; clients only receive redacted
// snapshots plus the events emitted here (which drive all animations).

import { buildShuffledDeck, rankAbility, type Rng } from "./deck.js";
import { GRID_SIZE, MEMORIZE_POSITIONS, type HouseRules } from "./rules.js";
import { computeGameOver, computeReveal } from "./scoring.js";
import type {
  BotDifficulty,
  Card,
  GameState,
  GridRef,
  LobbyPlayer,
  RevealData,
  GameOverData,
} from "./types.js";

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type EngineAction =
  | { type: "endMemorize" }
  | { type: "draw"; playerId: string; from?: "pile" | "discard" }
  | { type: "swapInto"; playerId: string; gridIndex: number }
  | { type: "discardDrawn"; playerId: string; useAbility: boolean }
  | { type: "abilityPeek"; playerId: string; target: GridRef }
  | { type: "abilitySwap"; playerId: string; a: GridRef; b: GridRef }
  | { type: "skipAbility"; playerId: string }
  | { type: "jumpIn"; playerId: string; gridIndex: number; windowId: number }
  | { type: "baguette"; playerId: string }
  | { type: "closeJumpWindow"; windowId: number }
  | { type: "turnTimeout"; playerId: string }
  | { type: "nextRound" }
  | { type: "setConnected"; playerId: string; connected: boolean }
  | { type: "botTakeover"; playerId: string; difficulty: BotDifficulty }
  | { type: "reclaimSeat"; playerId: string };

// ---------------------------------------------------------------------------
// Events (drive client animations 1:1; `private` events are routed to one player)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: "roundStarted"; roundNumber: number; dealerId: string; startingPlayerId: string }
  | { type: "memorizeStarted"; seconds: number }
  | { type: "memorizePrivate"; private: string; cards: { gridIndex: number; card: Card }[] }
  | { type: "memorizeEnded" }
  | { type: "turnStarted"; playerId: string; lastLap: boolean; turnTimerSeconds: number }
  | { type: "cardDrawn"; playerId: string; cardId: string; from: "pile" | "discard" }
  | { type: "drawnPrivate"; private: string; card: Card }
  | { type: "swappedIn"; playerId: string; gridIndex: number; discarded: Card }
  | { type: "discarded"; playerId: string; card: Card; ability: "peek" | "swap" | null }
  | { type: "abilityPeeked"; byPlayerId: string; target: GridRef }
  | { type: "peekPrivate"; private: string; card: Card; target: GridRef }
  | { type: "abilitySwapped"; byPlayerId: string; a: GridRef; b: GridRef }
  | { type: "abilitySkipped"; playerId: string }
  | { type: "jumpWindowOpened"; windowId: number; durationMs: number }
  | { type: "jumpWindowClosed"; windowId: number }
  | { type: "jumpInSuccess"; playerId: string; gridIndex: number; card: Card }
  | {
      type: "jumpInFailed";
      playerId: string;
      gridIndex: number;
      penalty: "card" | "points5";
      penaltyCardId: string | null;
      penaltyGridIndex: number | null;
    }
  | { type: "baguetteCalled"; playerId: string }
  | { type: "deckReshuffled"; drawCount: number }
  | { type: "turnTimedOut"; playerId: string }
  | { type: "revealStarted"; reveal: RevealData }
  | { type: "gameOver"; data: GameOverData; rounds: number }
  | { type: "seatChanged"; playerId: string; isBot: boolean; connected: boolean };

export interface EngineError {
  code: string;
  message: string;
  /** Silent errors (e.g. late jump-ins) should not be surfaced loudly. */
  silent?: boolean;
}

export interface EngineResult {
  state: GameState;
  events: GameEvent[];
  error?: EngineError;
}

// ---------------------------------------------------------------------------
// Game creation / dealing
// ---------------------------------------------------------------------------

export function createGame(
  players: LobbyPlayer[],
  rules: HouseRules,
  rng: Rng,
  seed: number,
): EngineResult {
  const state: GameState = {
    seed,
    roundNumber: 0,
    phase: "memorize",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      botDifficulty: p.botDifficulty,
      connected: p.connected,
      grid: [],
      totalScore: 0,
      roundScore: null,
      stats: { jumpIns: 0, failedJumpIns: 0, baguettes: 0, baguetteHits: 0 },
    })),
    dealerIndex: Math.floor(rng() * players.length),
    currentPlayerIndex: 0,
    turnStage: "draw",
    drawPile: [],
    discardPile: [],
    drawnCard: null,
    drawnFromDiscard: false,
    pendingAbility: null,
    jumpWindow: { id: 0, open: false },
    baguette: { callerId: null, remaining: [] },
    rules,
    reveal: null,
    gameOver: null,
    turnCount: 0,
  };
  const events: GameEvent[] = [];
  dealRound(state, rng, events);
  return { state, events };
}

function dealRound(state: GameState, rng: Rng, events: GameEvent[]): void {
  state.roundNumber += 1;
  const deck = buildShuffledDeck(rng, state.roundNumber);

  for (const p of state.players) {
    p.grid = [];
    p.roundScore = null;
  }
  // Deal one card at a time, clockwise from the dealer's left.
  const n = state.players.length;
  for (let round = 0; round < GRID_SIZE; round++) {
    for (let i = 1; i <= n; i++) {
      const p = state.players[(state.dealerIndex + i) % n]!;
      p.grid.push(deck.pop()!);
    }
  }

  state.drawPile = deck;
  state.discardPile = [];
  state.drawnCard = null;
  state.drawnFromDiscard = false;
  state.pendingAbility = null;
  state.jumpWindow = { id: state.jumpWindow.id, open: false };
  state.baguette = { callerId: null, remaining: [] };
  state.reveal = null;
  state.phase = "memorize";
  state.currentPlayerIndex = (state.dealerIndex + 1) % n;
  state.turnStage = "draw";

  events.push({
    type: "roundStarted",
    roundNumber: state.roundNumber,
    dealerId: state.players[state.dealerIndex]!.id,
    startingPlayerId: state.players[state.currentPlayerIndex]!.id,
  });
  events.push({ type: "memorizeStarted", seconds: state.rules.memorizeSeconds });
  for (const p of state.players) {
    events.push({
      type: "memorizePrivate",
      private: p.id,
      cards: MEMORIZE_POSITIONS.map((gridIndex) => ({
        gridIndex,
        card: p.grid[gridIndex]!,
      })),
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function err(state: GameState, code: string, message: string, silent = false): EngineResult {
  return { state, events: [], error: { code, message, silent } };
}

function currentPlayer(state: GameState) {
  return state.players[state.currentPlayerIndex]!;
}

function findPlayer(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId) ?? null;
}

function discardTop(state: GameState): Card | null {
  return state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1]! : null;
}

/**
 * Makes sure the draw pile has at least one card, reshuffling the discard
 * pile (minus its top card) if needed. Returns false if no card can be made
 * available at all.
 */
function ensureDrawPile(state: GameState, rng: Rng, events: GameEvent[]): boolean {
  if (state.drawPile.length > 0) return true;
  if (state.discardPile.length <= 1) return false;
  const top = state.discardPile.pop()!;
  const rest = state.discardPile;
  state.discardPile = [top];
  // Fisher–Yates in place via deck helper semantics (copy is fine here).
  const reshuffled = rest.slice();
  for (let i = reshuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = reshuffled[i]!;
    reshuffled[i] = reshuffled[j]!;
    reshuffled[j] = tmp;
  }
  state.drawPile = reshuffled;
  events.push({ type: "deckReshuffled", drawCount: state.drawPile.length });
  return state.drawPile.length > 0;
}

function openJumpWindow(state: GameState, events: GameEvent[]): void {
  state.jumpWindow = { id: state.jumpWindow.id + 1, open: true };
  events.push({
    type: "jumpWindowOpened",
    windowId: state.jumpWindow.id,
    durationMs: state.rules.jumpInWindowSeconds * 1000,
  });
}

function startTurn(state: GameState, events: GameEvent[]): void {
  state.turnStage = "draw";
  state.drawnCard = null;
  state.drawnFromDiscard = false;
  state.pendingAbility = null;
  state.turnCount += 1;
  events.push({
    type: "turnStarted",
    playerId: currentPlayer(state).id,
    lastLap: state.baguette.callerId !== null,
    turnTimerSeconds: state.rules.turnTimerSeconds,
  });
}

function doReveal(state: GameState, events: GameEvent[]): void {
  const reveal = computeReveal(state);
  state.reveal = reveal;
  state.phase = "reveal";
  state.jumpWindow.open = false;
  for (const entry of reveal.entries) {
    const p = findPlayer(state, entry.playerId)!;
    p.roundScore = entry.roundScore;
    p.totalScore = entry.newTotal;
    if (entry.playerId === reveal.baguetteCallerId && entry.adjustment === -3) {
      p.stats.baguetteHits += 1;
    }
  }
  events.push({ type: "revealStarted", reveal });
}

/** Called when the active player's turn is fully complete. */
function endTurn(state: GameState, events: GameEvent[]): void {
  const n = state.players.length;
  const { callerId, remaining } = state.baguette;

  if (callerId === null) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % n;
    startTurn(state, events);
    return;
  }

  const endingPlayer = currentPlayer(state);
  if (endingPlayer.id !== callerId) {
    // A last-lap player just finished their single extra turn.
    const idx = remaining.indexOf(endingPlayer.id);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  if (remaining.length === 0) {
    doReveal(state, events);
    return;
  }
  const nextId = remaining[0]!;
  state.currentPlayerIndex = state.players.findIndex((p) => p.id === nextId);
  startTurn(state, events);
}

/** After ability resolution: keep waiting for the window, or end the turn. */
function afterAbility(state: GameState, events: GameEvent[]): void {
  state.pendingAbility = null;
  if (state.jumpWindow.open) {
    state.turnStage = "window";
  } else {
    endTurn(state, events);
  }
}

function performDiscardDrawn(
  state: GameState,
  events: GameEvent[],
  useAbility: boolean,
): void {
  const card = state.drawnCard!;
  state.discardPile.push(card);
  state.drawnCard = null;

  const ability = !state.drawnFromDiscard && useAbility ? rankAbility(card.rank) : null;
  events.push({ type: "discarded", playerId: currentPlayer(state).id, card, ability });
  openJumpWindow(state, events);
  if (ability) {
    state.pendingAbility = ability;
    state.turnStage = "ability";
  } else {
    state.turnStage = "window";
  }
}

function validGridRef(state: GameState, ref: GridRef): Card | null {
  const p = findPlayer(state, ref.playerId);
  if (!p) return null;
  if (ref.gridIndex < 0 || ref.gridIndex >= p.grid.length) return null;
  return p.grid[ref.gridIndex] ?? null;
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

export function applyAction(prev: GameState, action: EngineAction, rng: Rng): EngineResult {
  const state = structuredClone(prev);
  const events: GameEvent[] = [];

  switch (action.type) {
    case "endMemorize": {
      if (state.phase !== "memorize") return err(prev, "wrongPhase", "Ikke i memorize-fasen.");
      state.phase = "playing";
      events.push({ type: "memorizeEnded" });
      startTurn(state, events);
      return { state, events };
    }

    case "draw": {
      if (state.phase !== "playing") return err(prev, "wrongPhase", "Du kan ikke trække nu.");
      if (currentPlayer(state).id !== action.playerId)
        return err(prev, "notYourTurn", "Det er ikke din tur.");
      if (state.turnStage !== "draw")
        return err(prev, "wrongStage", "Du har allerede trukket.");

      if (action.from === "discard") {
        if (!state.rules.allowDrawFromDiscard)
          return err(prev, "notAllowed", "Husreglen tillader ikke at trække fra afkastbunken.");
        const top = state.discardPile.pop();
        if (!top) return err(prev, "emptyPile", "Afkastbunken er tom.");
        state.drawnCard = top;
        state.drawnFromDiscard = true;
      } else {
        if (!ensureDrawPile(state, rng, events)) {
          // Both piles effectively empty -> forced reveal.
          doReveal(state, events);
          return { state, events };
        }
        state.drawnCard = state.drawPile.pop()!;
        state.drawnFromDiscard = false;
      }
      state.turnStage = "decide";
      events.push({
        type: "cardDrawn",
        playerId: action.playerId,
        cardId: state.drawnCard.id,
        from: action.from === "discard" ? "discard" : "pile",
      });
      events.push({ type: "drawnPrivate", private: action.playerId, card: state.drawnCard });
      return { state, events };
    }

    case "swapInto": {
      if (state.phase !== "playing") return err(prev, "wrongPhase", "Du kan ikke bytte nu.");
      if (currentPlayer(state).id !== action.playerId)
        return err(prev, "notYourTurn", "Det er ikke din tur.");
      if (state.turnStage !== "decide" || !state.drawnCard)
        return err(prev, "wrongStage", "Træk et kort først.");
      const p = currentPlayer(state);
      if (action.gridIndex < 0 || action.gridIndex >= p.grid.length)
        return err(prev, "badIndex", "Ugyldig plads.");
      const old = p.grid[action.gridIndex];
      if (!old) return err(prev, "emptySlot", "Pladsen er tom — vælg et kort.");

      p.grid[action.gridIndex] = state.drawnCard;
      state.drawnCard = null;
      state.discardPile.push(old);
      events.push({
        type: "swappedIn",
        playerId: action.playerId,
        gridIndex: action.gridIndex,
        discarded: old,
      });
      openJumpWindow(state, events);
      state.turnStage = "window";
      return { state, events };
    }

    case "discardDrawn": {
      if (state.phase !== "playing") return err(prev, "wrongPhase", "Du kan ikke smide nu.");
      if (currentPlayer(state).id !== action.playerId)
        return err(prev, "notYourTurn", "Det er ikke din tur.");
      if (state.turnStage !== "decide" || !state.drawnCard)
        return err(prev, "wrongStage", "Træk et kort først.");
      performDiscardDrawn(state, events, action.useAbility);
      return { state, events };
    }

    case "abilityPeek": {
      if (state.phase !== "playing") return err(prev, "wrongPhase", "Ingen evne aktiv.");
      if (currentPlayer(state).id !== action.playerId)
        return err(prev, "notYourTurn", "Det er ikke din tur.");
      if (state.turnStage !== "ability" || state.pendingAbility !== "peek")
        return err(prev, "wrongStage", "Kig-evnen er ikke aktiv.");
      const card = validGridRef(state, action.target);
      if (!card) return err(prev, "badTarget", "Der ligger intet kort på den plads.");

      events.push({ type: "abilityPeeked", byPlayerId: action.playerId, target: action.target });
      events.push({
        type: "peekPrivate",
        private: action.playerId,
        card,
        target: action.target,
      });
      afterAbility(state, events);
      return { state, events };
    }

    case "abilitySwap": {
      if (state.phase !== "playing") return err(prev, "wrongPhase", "Ingen evne aktiv.");
      if (currentPlayer(state).id !== action.playerId)
        return err(prev, "notYourTurn", "Det er ikke din tur.");
      if (state.turnStage !== "ability" || state.pendingAbility !== "swap")
        return err(prev, "wrongStage", "Byt-evnen er ikke aktiv.");
      if (action.a.playerId === action.b.playerId && action.a.gridIndex === action.b.gridIndex)
        return err(prev, "badTarget", "Vælg to forskellige kort.");
      const cardA = validGridRef(state, action.a);
      const cardB = validGridRef(state, action.b);
      if (!cardA || !cardB) return err(prev, "badTarget", "Der ligger intet kort på den plads.");

      const pa = findPlayer(state, action.a.playerId)!;
      const pb = findPlayer(state, action.b.playerId)!;
      pa.grid[action.a.gridIndex] = cardB;
      pb.grid[action.b.gridIndex] = cardA;
      events.push({ type: "abilitySwapped", byPlayerId: action.playerId, a: action.a, b: action.b });
      afterAbility(state, events);
      return { state, events };
    }

    case "skipAbility": {
      if (state.phase !== "playing") return err(prev, "wrongPhase", "Ingen evne aktiv.");
      if (currentPlayer(state).id !== action.playerId)
        return err(prev, "notYourTurn", "Det er ikke din tur.");
      if (state.turnStage !== "ability")
        return err(prev, "wrongStage", "Ingen evne at springe over.");
      events.push({ type: "abilitySkipped", playerId: action.playerId });
      afterAbility(state, events);
      return { state, events };
    }

    case "jumpIn": {
      if (state.phase !== "playing")
        return err(prev, "wrongPhase", "Jump-in er lukket.", true);
      if (!state.jumpWindow.open || state.jumpWindow.id !== action.windowId)
        return err(prev, "jumpTooLate", "For sent — vinduet er lukket.", true);
      const p = findPlayer(state, action.playerId);
      if (!p) return err(prev, "noPlayer", "Ukendt spiller.");
      if (action.gridIndex < 0 || action.gridIndex >= p.grid.length)
        return err(prev, "badIndex", "Ugyldig plads.");
      const card = p.grid[action.gridIndex];
      if (!card) return err(prev, "emptySlot", "Pladsen er tom.");
      const top = discardTop(state);
      if (!top) return err(prev, "emptyPile", "Afkastbunken er tom.", true);

      if (card.rank === top.rank) {
        p.grid[action.gridIndex] = null;
        state.discardPile.push(card);
        p.stats.jumpIns += 1;
        events.push({
          type: "jumpInSuccess",
          playerId: action.playerId,
          gridIndex: action.gridIndex,
          card,
        });
        // The new top opens a fresh window (chains!).
        openJumpWindow(state, events);
        return { state, events };
      }

      // Wrong rank -> penalty.
      p.stats.failedJumpIns += 1;
      if (state.rules.jumpInPenalty === "points5") {
        p.totalScore += 5;
        events.push({
          type: "jumpInFailed",
          playerId: action.playerId,
          gridIndex: action.gridIndex,
          penalty: "points5",
          penaltyCardId: null,
          penaltyGridIndex: null,
        });
        return { state, events };
      }

      let penaltyCardId: string | null = null;
      let penaltyGridIndex: number | null = null;
      if (ensureDrawPile(state, rng, events)) {
        const penaltyCard = state.drawPile.pop()!;
        penaltyCardId = penaltyCard.id;
        const empty = p.grid.findIndex((c) => c === null);
        if (empty !== -1) {
          p.grid[empty] = penaltyCard;
          penaltyGridIndex = empty;
        } else {
          // House rule: a penalty card lands on TOP of the grid, not at the
          // bottom — a fitting punishment that also shifts what you memorised.
          p.grid.unshift(penaltyCard);
          penaltyGridIndex = 0;
        }
      }
      events.push({
        type: "jumpInFailed",
        playerId: action.playerId,
        gridIndex: action.gridIndex,
        penalty: "card",
        penaltyCardId,
        penaltyGridIndex,
      });
      return { state, events };
    }

    case "baguette": {
      if (state.phase !== "playing") return err(prev, "wrongPhase", "Du kan ikke kalde Baguette nu.");
      if (currentPlayer(state).id !== action.playerId)
        return err(prev, "notYourTurn", "Det er ikke din tur.");
      if (state.baguette.callerId !== null)
        return err(prev, "alreadyCalled", "Baguette er allerede kaldt i denne runde.");
      if (state.turnStage !== "window" && state.turnStage !== "ability")
        return err(prev, "wrongStage", "Baguette kaldes som allersidste handling i din tur.");

      const p = currentPlayer(state);
      const n = state.players.length;
      const remaining: string[] = [];
      for (let i = 1; i < n; i++) {
        remaining.push(state.players[(state.currentPlayerIndex + i) % n]!.id);
      }
      state.baguette = { callerId: p.id, remaining };
      p.stats.baguettes += 1;
      events.push({ type: "baguetteCalled", playerId: p.id });
      // House rule: calling Baguette is your final act of the turn — forgo any
      // pending ability and (re)open a fresh jump-in window so everyone gets a
      // full ~5s to react and jump in before the last lap begins.
      state.pendingAbility = null;
      state.turnStage = "window";
      openJumpWindow(state, events);
      return { state, events };
    }

    case "closeJumpWindow": {
      if (state.phase !== "playing") return { state: prev, events: [] };
      if (!state.jumpWindow.open || state.jumpWindow.id !== action.windowId)
        return { state: prev, events: [] }; // stale timer — idempotent no-op
      state.jumpWindow.open = false;
      events.push({ type: "jumpWindowClosed", windowId: action.windowId });
      if (state.turnStage === "window") {
        endTurn(state, events);
      }
      // turnStage "ability": the turn continues until the ability is resolved.
      return { state, events };
    }

    case "turnTimeout": {
      if (state.phase !== "playing") return { state: prev, events: [] };
      if (currentPlayer(state).id !== action.playerId) return { state: prev, events: [] };

      events.push({ type: "turnTimedOut", playerId: action.playerId });
      if (state.turnStage === "draw") {
        if (!ensureDrawPile(state, rng, events)) {
          doReveal(state, events);
          return { state, events };
        }
        state.drawnCard = state.drawPile.pop()!;
        state.drawnFromDiscard = false;
        events.push({
          type: "cardDrawn",
          playerId: action.playerId,
          cardId: state.drawnCard.id,
          from: "pile",
        });
        performDiscardDrawn(state, events, false);
      } else if (state.turnStage === "decide") {
        performDiscardDrawn(state, events, false);
      } else if (state.turnStage === "ability") {
        events.push({ type: "abilitySkipped", playerId: action.playerId });
        afterAbility(state, events);
      }
      // "window": the jump-window timer drives turn end; nothing to do.
      return { state, events };
    }

    case "nextRound": {
      if (state.phase !== "reveal")
        return err(prev, "wrongPhase", "Runden er ikke slut endnu.");
      if (state.reveal?.targetReached) {
        state.phase = "gameOver";
        state.gameOver = computeGameOver(state.players);
        events.push({ type: "gameOver", data: state.gameOver, rounds: state.roundNumber });
        return { state, events };
      }
      state.dealerIndex = (state.dealerIndex + 1) % state.players.length;
      dealRound(state, rng, events);
      return { state, events };
    }

    case "setConnected": {
      const p = findPlayer(state, action.playerId);
      if (!p) return err(prev, "noPlayer", "Ukendt spiller.");
      p.connected = action.connected;
      events.push({
        type: "seatChanged",
        playerId: p.id,
        isBot: p.isBot,
        connected: p.connected,
      });
      return { state, events };
    }

    case "botTakeover": {
      const p = findPlayer(state, action.playerId);
      if (!p) return err(prev, "noPlayer", "Ukendt spiller.");
      p.isBot = true;
      p.botDifficulty = action.difficulty;
      p.connected = false;
      events.push({ type: "seatChanged", playerId: p.id, isBot: true, connected: false });
      return { state, events };
    }

    case "reclaimSeat": {
      const p = findPlayer(state, action.playerId);
      if (!p) return err(prev, "noPlayer", "Ukendt spiller.");
      p.isBot = false;
      p.botDifficulty = null;
      p.connected = true;
      events.push({ type: "seatChanged", playerId: p.id, isBot: false, connected: true });
      return { state, events };
    }

    default: {
      const exhaustive: never = action;
      return err(prev, "unknownAction", `Ukendt handling: ${JSON.stringify(exhaustive)}`);
    }
  }
}
