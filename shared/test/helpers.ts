import { expect } from "vitest";
import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  mulberry32,
  type Card,
  type EngineAction,
  type EngineResult,
  type GameState,
  type HouseRules,
  type LobbyPlayer,
  type Rank,
  type Rng,
  type Suit,
} from "../src/index.js";

export function makePlayers(n: number): LobbyPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Spiller ${i + 1}`,
    avatar: "🦊",
    isBot: false,
    botDifficulty: null,
    connected: true,
  }));
}

export function newGame(
  n = 3,
  rulesOverride: Partial<HouseRules> = {},
  seed = 42,
): { state: GameState; rng: Rng } {
  const rng = mulberry32(seed);
  const { state } = createGame(makePlayers(n), { ...DEFAULT_RULES, ...rulesOverride }, rng, seed);
  return { state, rng };
}

/** New game fast-forwarded past the memorize phase. */
export function newPlayingGame(
  n = 3,
  rulesOverride: Partial<HouseRules> = {},
  seed = 42,
): { state: GameState; rng: Rng } {
  const { state, rng } = newGame(n, rulesOverride, seed);
  const res = applyAction(state, { type: "endMemorize" }, rng);
  expect(res.error).toBeUndefined();
  return { state: res.state, rng };
}

let cardSeq = 1000;
export function card(rank: Rank, suit: Suit | null = "spades", id?: string): Card {
  return { id: id ?? `t-${cardSeq++}`, rank, suit: rank === "JOKER" ? null : suit };
}

/** Dispatch an action and assert it succeeded. */
export function ok(state: GameState, action: EngineAction, rng: Rng): EngineResult {
  const res = applyAction(state, action, rng);
  expect(res.error, `action ${action.type} should succeed`).toBeUndefined();
  return res;
}

/** Dispatch an action and assert it failed with the given code. */
export function fail(
  state: GameState,
  action: EngineAction,
  rng: Rng,
  code?: string,
): EngineResult {
  const res = applyAction(state, action, rng);
  expect(res.error, `action ${action.type} should fail`).toBeDefined();
  if (code) expect(res.error!.code).toBe(code);
  return res;
}

export function currentId(state: GameState): string {
  return state.players[state.currentPlayerIndex]!.id;
}

/** Plays a plain turn for the current player: draw -> discard -> window closes. */
export function playPlainTurn(state: GameState, rng: Rng): GameState {
  const pid = currentId(state);
  let res = ok(state, { type: "draw", playerId: pid }, rng);
  res = ok(res.state, { type: "discardDrawn", playerId: pid, useAbility: false }, rng);
  res = ok(res.state, { type: "closeJumpWindow", windowId: res.state.jumpWindow.id }, rng);
  return res.state;
}
