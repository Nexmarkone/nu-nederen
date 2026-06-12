import { describe, expect, it } from "vitest";
import { buildShuffledDeck, cardPoints, mulberry32, RANKS, SUITS } from "../src/index.js";
import { card } from "./helpers.js";

describe("deck", () => {
  it("contains 54 cards: 52 standard + 2 jokers", () => {
    const deck = buildShuffledDeck(mulberry32(1), 1);
    expect(deck).toHaveLength(54);
    expect(deck.filter((c) => c.rank === "JOKER")).toHaveLength(2);
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(
          deck.filter((c) => c.rank === rank && c.suit === suit),
          `${rank} of ${suit}`,
        ).toHaveLength(1);
      }
    }
    // Unique ids
    expect(new Set(deck.map((c) => c.id)).size).toBe(54);
  });

  it("is deterministic for the same seed and different across seeds", () => {
    const a = buildShuffledDeck(mulberry32(7), 1);
    const b = buildShuffledDeck(mulberry32(7), 1);
    const c = buildShuffledDeck(mulberry32(8), 1);
    expect(a.map((x) => x.rank + x.suit)).toEqual(b.map((x) => x.rank + x.suit));
    expect(a.map((x) => x.rank + x.suit)).not.toEqual(c.map((x) => x.rank + x.suit));
  });

  it("ids carry no rank information (assigned after shuffling)", () => {
    // Same id position, different seeds -> different cards.
    const a = buildShuffledDeck(mulberry32(1), 1)[0]!;
    const b = buildShuffledDeck(mulberry32(99), 1)[0]!;
    expect(a.id).toBe(b.id);
    expect(a.rank + String(a.suit)).not.toBe(b.rank + String(b.suit));
  });

  it("scores every rank correctly", () => {
    expect(cardPoints(card("JOKER", null))).toBe(-3);
    expect(cardPoints(card("A"))).toBe(1);
    for (let v = 2; v <= 9; v++) {
      expect(cardPoints(card(String(v) as never))).toBe(v);
    }
    expect(cardPoints(card("10"))).toBe(10);
    expect(cardPoints(card("J"))).toBe(10);
    expect(cardPoints(card("Q"))).toBe(10);
    expect(cardPoints(card("K", "hearts"))).toBe(0);
    expect(cardPoints(card("K", "diamonds"))).toBe(0);
    expect(cardPoints(card("K", "spades"))).toBe(25);
    expect(cardPoints(card("K", "clubs"))).toBe(25);
  });
});
