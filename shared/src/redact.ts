// Per-player redaction of GameState — the anti-cheat core.
// Hidden cards are serialized as { id, faceUp: false } with NO rank/suit,
// even for the player's OWN grid (memory is the game). Rank/suit only ever
// reaches a client for cards that are face-up for everyone (discard pile,
// reveal phase) — transient private peeks travel as separate privatePeek
// messages handled by the server.

import type { Phase } from "./types.js";
import type {
  BaguetteState,
  BotDifficulty,
  Card,
  GameOverData,
  GameState,
  JumpWindowState,
  PlayerStats,
  Rank,
  RevealData,
  Suit,
  TurnStage,
} from "./types.js";
import type { HouseRules } from "./rules.js";

export interface RedactedCard {
  id: string;
  faceUp: boolean;
  rank?: Rank;
  suit?: Suit | null;
}

export interface RedactedPlayer {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  connected: boolean;
  grid: (RedactedCard | null)[];
  totalScore: number;
  roundScore: number | null;
  stats: PlayerStats;
}

export interface RedactedGameState {
  roundNumber: number;
  phase: Phase;
  players: RedactedPlayer[];
  dealerIndex: number;
  currentPlayerIndex: number;
  turnStage: TurnStage;
  drawCount: number;
  /** Fully public — every card here landed face-up at some point. */
  discardPile: Card[];
  /** Only existence + owner; the actual card goes out as a privatePeek. */
  drawnCard: { id: string; byPlayerId: string } | null;
  pendingAbility: "peek" | "swap" | null;
  jumpWindow: JumpWindowState;
  baguette: BaguetteState;
  rules: HouseRules;
  reveal: RevealData | null;
  gameOver: GameOverData | null;
  turnCount: number;
}

/**
 * Redacts a GameState for one viewer. Note that grids are hidden for the
 * viewer too — after the memorize phase you must REMEMBER your cards.
 * During reveal/gameOver everything is face-up for everyone.
 */
export function redactGameState(state: GameState, _viewerId: string): RedactedGameState {
  const revealAll = state.phase === "reveal" || state.phase === "gameOver";

  return {
    roundNumber: state.roundNumber,
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: p.isBot,
      botDifficulty: p.botDifficulty,
      connected: p.connected,
      grid: p.grid.map((c) =>
        c === null
          ? null
          : revealAll
            ? { id: c.id, faceUp: true, rank: c.rank, suit: c.suit }
            : { id: c.id, faceUp: false },
      ),
      totalScore: p.totalScore,
      roundScore: p.roundScore,
      stats: { ...p.stats },
    })),
    dealerIndex: state.dealerIndex,
    currentPlayerIndex: state.currentPlayerIndex,
    turnStage: state.turnStage,
    drawCount: state.drawPile.length,
    discardPile: state.discardPile.map((c) => ({ ...c })),
    drawnCard: state.drawnCard
      ? { id: state.drawnCard.id, byPlayerId: state.players[state.currentPlayerIndex]!.id }
      : null,
    pendingAbility: state.pendingAbility,
    jumpWindow: { ...state.jumpWindow },
    baguette: { callerId: state.baguette.callerId, remaining: [...state.baguette.remaining] },
    rules: { ...state.rules },
    reveal: revealAll && state.reveal ? structuredClone(state.reveal) : null,
    gameOver: state.gameOver ? structuredClone(state.gameOver) : null,
    turnCount: state.turnCount,
  };
}
