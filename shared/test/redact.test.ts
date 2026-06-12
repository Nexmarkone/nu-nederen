import { describe, expect, it } from "vitest";
import { redactGameState } from "../src/index.js";
import { card, currentId, newGame, newPlayingGame, ok } from "./helpers.js";

describe("redaction (anti-cheat)", () => {
  it("never serializes rank/suit for hidden cards — not even the viewer's own", () => {
    const { state } = newGame(3);
    const red = redactGameState(state, "p1");
    for (const p of red.players) {
      for (const c of p.grid) {
        expect(c).not.toBeNull();
        expect(c!.faceUp).toBe(false);
        expect("rank" in c!).toBe(false);
        expect("suit" in c!).toBe(false);
      }
    }
    // During memorize nothing is face-up at all -> the whole payload is rank-free.
    const json = JSON.stringify(red);
    expect(json).not.toContain('"rank"');
    expect(json).not.toContain('"suit"');
  });

  it("exposes only the draw pile COUNT and an opaque drawn-card reference", () => {
    const { state, rng } = newPlayingGame(3);
    const pid = currentId(state);
    const res = ok(state, { type: "draw", playerId: pid }, rng);
    const red = redactGameState(res.state, pid);
    expect(red.drawCount).toBe(res.state.drawPile.length);
    expect((red as unknown as Record<string, unknown>).drawPile).toBeUndefined();
    expect(red.drawnCard).toEqual({ id: res.state.drawnCard!.id, byPlayerId: pid });
    expect(JSON.stringify(red.drawnCard)).not.toContain("rank");
  });

  it("keeps the discard pile fully public", () => {
    const { state, rng } = newPlayingGame(3);
    const pid = currentId(state);
    let res = ok(state, { type: "draw", playerId: pid }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: pid, useAbility: false }, rng);
    const red = redactGameState(res.state, "p2");
    expect(red.discardPile).toHaveLength(1);
    expect(red.discardPile[0]!.rank).toBeDefined();
  });

  it("reveals all cards during the reveal phase", () => {
    const { state, rng } = newPlayingGame(2);
    state.players[0]!.grid = [card("K", "hearts"), null, null, null];
    state.drawPile = [];
    state.discardPile = [card("5")];
    const res = ok(state, { type: "draw", playerId: currentId(state) }, rng);
    expect(res.state.phase).toBe("reveal");
    const red = redactGameState(res.state, "p2");
    const c = red.players[0]!.grid[0]!;
    expect(c.faceUp).toBe(true);
    expect(c.rank).toBe("K");
    expect(red.reveal).not.toBeNull();
  });
});
