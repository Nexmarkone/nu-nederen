import type { Card, Rank, Suit } from "./types.js";

export const SUITS: readonly Suit[] = ["hearts", "diamonds", "spades", "clubs"];

export const RANKS: readonly Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

/** Deterministic, seedable RNG (mulberry32). Returns floats in [0, 1). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(arr: readonly T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Builds the 54-card deck (52 + 2 jokers), shuffles it, and only THEN assigns
 * sequential ids. Ids therefore carry zero information about rank/suit, and
 * they are namespaced per round so clients can never correlate across rounds.
 */
export function buildShuffledDeck(rng: Rng, roundNumber: number): Card[] {
  const proto: { rank: Rank; suit: Suit | null }[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      proto.push({ rank, suit });
    }
  }
  proto.push({ rank: "JOKER", suit: null });
  proto.push({ rank: "JOKER", suit: null });

  const shuffled = shuffle(proto, rng);
  return shuffled.map((c, i) => ({ id: `r${roundNumber}-${i}`, ...c }));
}

export function cardPoints(card: Pick<Card, "rank" | "suit">): number {
  switch (card.rank) {
    case "JOKER":
      return -3;
    case "A":
      return 1;
    case "10":
    case "J":
    case "Q":
      return 10;
    case "K":
      return card.suit === "hearts" || card.suit === "diamonds" ? 0 : 25;
    default:
      return parseInt(card.rank, 10);
  }
}

/** Which ability (if any) a rank triggers when drawn from the pile and discarded. */
export function rankAbility(rank: Rank): "peek" | "swap" | null {
  if (rank === "10") return "peek";
  if (rank === "J") return "swap";
  return null;
}
