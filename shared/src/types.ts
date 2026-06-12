// Core domain types for Nu Nederen.
// The engine is server-authoritative; clients only ever see RedactedGameState (see redact.ts).

import type { HouseRules } from "./rules.js";

export type Suit = "hearts" | "diamonds" | "spades" | "clubs";

export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "JOKER";

export interface Card {
  /** Opaque per-round id (re-randomized every round so ids leak nothing). */
  id: string;
  rank: Rank;
  /** null for jokers */
  suit: Suit | null;
}

export type BotDifficulty = "easy" | "medium" | "hard";

export interface PlayerStats {
  jumpIns: number;
  failedJumpIns: number;
  baguettes: number;
  baguetteHits: number;
}

export interface PlayerState {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  connected: boolean;
  /**
   * Grid slots. Starts as 4 slots (2x2: 0-1 top row, 2-3 bottom row).
   * A slot becomes null when the card is jumped away. Penalty cards fill the
   * first null slot, or grow the array beyond 4.
   */
  grid: (Card | null)[];
  totalScore: number;
  /** Set during reveal, null while playing. */
  roundScore: number | null;
  stats: PlayerStats;
}

export type Phase = "memorize" | "playing" | "reveal" | "gameOver";

/**
 * Stage within the active player's turn:
 *  - draw:    waiting for the active player to draw
 *  - decide:  card drawn, waiting for swapInto / discardDrawn
 *  - ability: discarded a 10/J with useAbility, waiting for target or skip
 *  - window:  discard done & ability resolved; waiting for the jump-in window to close
 */
export type TurnStage = "draw" | "decide" | "ability" | "window";

export interface GridRef {
  playerId: string;
  gridIndex: number;
}

export interface RevealEntry {
  playerId: string;
  cards: (Card | null)[];
  rawSum: number;
  /** -3 / +5 for the baguette caller, 0 for everyone else. */
  adjustment: number;
  roundScore: number;
  newTotal: number;
}

export interface RevealData {
  /** Player ids in dramatic reveal order (clockwise, baguette caller last). */
  order: string[];
  entries: RevealEntry[];
  baguetteCallerId: string | null;
  targetReached: boolean;
}

export interface GameOverData {
  loserIds: string[];
  winnerIds: string[];
  finalScores: { playerId: string; total: number }[];
}

export interface JumpWindowState {
  /** Monotonically increasing per game; identifies the current window. */
  id: number;
  open: boolean;
}

export interface BaguetteState {
  callerId: string | null;
  /** Player ids (clockwise) that still get exactly one turn after the call. */
  remaining: string[];
}

export interface GameState {
  seed: number;
  roundNumber: number;
  phase: Phase;
  players: PlayerState[];
  dealerIndex: number;
  currentPlayerIndex: number;
  turnStage: TurnStage;
  /** Top of pile = last element. */
  drawPile: Card[];
  /** Top of pile = last element. All discards are public information. */
  discardPile: Card[];
  /** Card currently held by the active player (after draw, before decide). */
  drawnCard: Card | null;
  /** True if the drawn card was taken from the discard pile (house rule) — no ability then. */
  drawnFromDiscard: boolean;
  pendingAbility: "peek" | "swap" | null;
  jumpWindow: JumpWindowState;
  baguette: BaguetteState;
  rules: HouseRules;
  reveal: RevealData | null;
  gameOver: GameOverData | null;
  turnCount: number;
}

/** What the lobby hands to the engine when a game starts. */
export interface LobbyPlayer {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  connected: boolean;
}
