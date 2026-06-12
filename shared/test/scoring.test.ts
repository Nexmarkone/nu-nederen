import { describe, expect, it } from "vitest";
import { computeGameOver, gridSum, type PlayerState } from "../src/index.js";
import { card, currentId, newPlayingGame, ok } from "./helpers.js";

function playerWithTotal(id: string, total: number): PlayerState {
  return {
    id,
    name: id,
    avatar: "🦊",
    isBot: false,
    botDifficulty: null,
    connected: true,
    grid: [],
    totalScore: total,
    roundScore: null,
    stats: { jumpIns: 0, failedJumpIns: 0, baguettes: 0, baguetteHits: 0 },
  };
}

describe("scoring", () => {
  it("sums a grid with empty slots and special cards", () => {
    const p = playerWithTotal("x", 0);
    p.grid = [card("JOKER", null), null, card("K", "hearts"), card("K", "clubs")];
    expect(gridSum(p)).toBe(-3 + 0 + 25);
    p.grid = [null, null, null, null];
    expect(gridSum(p)).toBe(0);
  });

  it("loser = highest total, winner = lowest, ties are shared", () => {
    const res = computeGameOver([
      playerWithTotal("a", 55),
      playerWithTotal("b", 55),
      playerWithTotal("c", -4),
      playerWithTotal("d", -4),
    ]);
    expect(res.loserIds.sort()).toEqual(["a", "b"]);
    expect(res.winnerIds.sort()).toEqual(["c", "d"]);
    expect(res.finalScores).toHaveLength(4);
  });

  it("accumulates round scores, allows negative totals and ends the game at >= target", () => {
    const { state, rng } = newPlayingGame(3, { targetScore: 50 });
    const [p1, p2, p3] = state.players;
    p1!.totalScore = 45;
    p2!.totalScore = 10;
    p3!.totalScore = 10;
    p1!.grid = [card("K", "spades"), null, null, null]; // 25 -> 70: over target
    p2!.grid = [card("JOKER", null), card("JOKER", null), null, null]; // -6 -> 4
    p3!.grid = [null, null, null, null]; // 0 -> 10

    // Forced reveal via empty piles.
    state.drawPile = [];
    state.discardPile = [card("5")];
    let res = ok(state, { type: "draw", playerId: currentId(state) }, rng);
    expect(res.state.phase).toBe("reveal");
    expect(res.state.reveal!.targetReached).toBe(true);

    const e1 = res.state.reveal!.entries.find((e) => e.playerId === "p1")!;
    const e2 = res.state.reveal!.entries.find((e) => e.playerId === "p2")!;
    expect(e1.newTotal).toBe(70);
    expect(e2.newTotal).toBe(4);
    expect(res.state.players.find((p) => p.id === "p2")!.totalScore).toBe(4);

    res = ok(res.state, { type: "nextRound" }, rng);
    expect(res.state.phase).toBe("gameOver");
    expect(res.state.gameOver!.loserIds).toEqual(["p1"]);
    expect(res.state.gameOver!.winnerIds).toEqual(["p2"]);
    const overEvent = res.events.find((e) => e.type === "gameOver");
    expect(overEvent).toBeDefined();
  });

  it("supports negative cumulative totals across rounds", () => {
    const { state, rng } = newPlayingGame(2);
    const [p1, p2] = state.players;
    p1!.grid = [card("JOKER", null), card("JOKER", null), null, null];
    p2!.grid = [card("2"), null, null, null];
    state.drawPile = [];
    state.discardPile = [card("5")];
    const res = ok(state, { type: "draw", playerId: currentId(state) }, rng);
    expect(res.state.players.find((p) => p.id === "p1")!.totalScore).toBe(-6);
    expect(res.state.reveal!.targetReached).toBe(false);
  });
});
