import { cardPoints } from "./deck.js";
import type { GameOverData, GameState, PlayerState, RevealData, RevealEntry } from "./types.js";

/** Sum of the points currently lying in a player's grid (0 cards = 0). */
export function gridSum(player: PlayerState): number {
  return player.grid.reduce<number>((sum, card) => (card ? sum + cardPoints(card) : sum), 0);
}

/**
 * Computes the full reveal for a round: raw sums, baguette adjustment
 * (-3 if the caller has the (shared) lowest raw sum, otherwise +5),
 * round scores and new totals. Does NOT mutate state.
 */
export function computeReveal(state: GameState): RevealData {
  const callerId = state.baguette.callerId;
  const raw = new Map<string, number>();
  for (const p of state.players) raw.set(p.id, gridSum(p));

  const minRaw = Math.min(...raw.values());

  const entries: RevealEntry[] = state.players.map((p) => {
    const rawSum = raw.get(p.id)!;
    const adjustment = p.id === callerId ? (rawSum <= minRaw ? -3 : 5) : 0;
    const roundScore = rawSum + adjustment;
    return {
      playerId: p.id,
      cards: p.grid.map((c) => (c ? { ...c } : null)),
      rawSum,
      adjustment,
      roundScore,
      newTotal: p.totalScore + roundScore,
    };
  });

  // Reveal order: clockwise starting left of the dealer, baguette caller last.
  const n = state.players.length;
  const order: string[] = [];
  for (let i = 1; i <= n; i++) {
    const p = state.players[(state.dealerIndex + i) % n]!;
    if (p.id !== callerId) order.push(p.id);
  }
  if (callerId) order.push(callerId);

  const targetReached = entries.some((e) => e.newTotal >= state.rules.targetScore);

  return { order, entries, baguetteCallerId: callerId, targetReached };
}

/** Loser ("Nederen") = highest total, winner = lowest total. Ties shared. */
export function computeGameOver(players: PlayerState[]): GameOverData {
  const totals = players.map((p) => ({ playerId: p.id, total: p.totalScore }));
  const max = Math.max(...totals.map((t) => t.total));
  const min = Math.min(...totals.map((t) => t.total));
  return {
    loserIds: totals.filter((t) => t.total === max).map((t) => t.playerId),
    winnerIds: totals.filter((t) => t.total === min).map((t) => t.playerId),
    finalScores: totals,
  };
}
