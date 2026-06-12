// Bot brains ("MPC'er"). Bots NEVER see hidden information: they receive the
// same public events humans see plus their own private peeks, and all
// decisions are made against a RedactedGameState — exactly what a human
// client gets. Knowledge lives in a belief map updated from events.

import {
  cardPoints,
  type BotDifficulty,
  type GameEvent,
  type GridRef,
  type Rank,
  type RedactedGameState,
  type RedactedPlayer,
} from "@nu/shared";

export type TurnChoice =
  | { kind: "swap"; gridIndex: number }
  | { kind: "discard"; useAbility: boolean };

export interface JumpPlan {
  gridIndex: number;
  reactionMs: number;
}

interface Belief {
  rank: Rank;
  points: number;
}

export const BOT_PROFILES: Record<BotDifficulty, { names: string[]; avatar: string }> = {
  easy: { names: ["Bot-Bente", "Bot-Birthe", "Bot-Børge", "Bot-Bjarne", "Bot-Bodil"], avatar: "🐣" },
  medium: { names: ["Bot-Ib", "Bot-Inge", "Bot-Iver", "Bot-Ida", "Bot-Ingolf"], avatar: "🤖" },
  hard: { names: ["MPC-Mogens", "MPC-Merete", "MPC-Magnus", "MPC-Maja", "MPC-Mads"], avatar: "🧠" },
};

/** All 54 point values in the deck — used for expected-value calculations. */
const FULL_POOL: number[] = (() => {
  const pool: number[] = [-3, -3]; // jokers
  for (let i = 0; i < 4; i++) {
    pool.push(1); // aces
    for (let v = 2; v <= 9; v++) pool.push(v);
    pool.push(10, 10, 10); // 10, J, Q
  }
  pool.push(0, 0, 25, 25); // red kings, black kings
  return pool;
})();

export class BotBrain {
  /** believed[playerId] -> gridIndex -> belief. Easy/medium only track themselves. */
  private believed = new Map<string, Map<number, Belief>>();
  private drawn: Belief | null = null;

  constructor(
    readonly playerId: string,
    readonly difficulty: BotDifficulty,
    private readonly rnd: () => number = Math.random,
  ) {}

  private beliefs(pid: string): Map<number, Belief> {
    let m = this.believed.get(pid);
    if (!m) {
      m = new Map();
      this.believed.set(pid, m);
    }
    return m;
  }

  private own(): Map<number, Belief> {
    return this.beliefs(this.playerId);
  }

  // -------------------------------------------------------------------------
  // Memory model — fed by the exact same events humans see.
  // -------------------------------------------------------------------------

  onEvent(ev: GameEvent): void {
    switch (ev.type) {
      case "roundStarted":
        this.believed.clear();
        this.drawn = null;
        break;

      case "memorizePrivate":
        if (ev.private === this.playerId) {
          for (const { gridIndex, card } of ev.cards) {
            this.own().set(gridIndex, { rank: card.rank, points: cardPoints(card) });
          }
        }
        break;

      case "drawnPrivate":
        if (ev.private === this.playerId) {
          this.drawn = { rank: ev.card.rank, points: cardPoints(ev.card) };
        }
        break;

      case "swappedIn":
        if (ev.playerId === this.playerId) {
          // My drawn card (which I saw) went into this slot.
          if (this.drawn) this.own().set(ev.gridIndex, this.drawn);
          this.drawn = null;
        } else {
          // Their unknown drawn card replaced whatever I believed was there.
          this.beliefs(ev.playerId).delete(ev.gridIndex);
        }
        break;

      case "discarded":
        if (ev.playerId === this.playerId) this.drawn = null;
        break;

      case "jumpInSuccess":
        this.beliefs(ev.playerId).delete(ev.gridIndex);
        break;

      case "jumpInFailed":
        if (ev.penaltyGridIndex !== null) {
          this.beliefs(ev.playerId).delete(ev.penaltyGridIndex);
        }
        if (ev.playerId === this.playerId) {
          // We tapped it and were wrong — whatever we believed there is stale.
          this.own().delete(ev.gridIndex);
        }
        break;

      case "abilitySwapped": {
        // Follow positions through blind swaps — works across all players.
        const a = this.believed.get(ev.a.playerId)?.get(ev.a.gridIndex) ?? null;
        const b = this.believed.get(ev.b.playerId)?.get(ev.b.gridIndex) ?? null;
        if (b) this.beliefs(ev.a.playerId).set(ev.a.gridIndex, b);
        else this.beliefs(ev.a.playerId).delete(ev.a.gridIndex);
        if (a) this.beliefs(ev.b.playerId).set(ev.b.gridIndex, a);
        else this.beliefs(ev.b.playerId).delete(ev.b.gridIndex);
        break;
      }

      case "peekPrivate":
        if (ev.private === this.playerId) {
          this.beliefs(ev.target.playerId).set(ev.target.gridIndex, {
            rank: ev.card.rank,
            points: cardPoints(ev.card),
          });
        }
        break;

      case "turnStarted":
        // Easy bots forget each known card with 30% chance per own turn.
        if (this.difficulty === "easy" && ev.playerId === this.playerId) {
          for (const key of [...this.own().keys()]) {
            if (this.rnd() < 0.3) this.own().delete(key);
          }
        }
        break;

      default:
        break;
    }

    // Easy/medium never track opponents (only MPC does cross-board tracking).
    if (this.difficulty !== "hard") {
      for (const pid of [...this.believed.keys()]) {
        if (pid !== this.playerId) this.believed.delete(pid);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private me(red: RedactedGameState): RedactedPlayer {
    return red.players.find((p) => p.id === this.playerId)!;
  }

  private ownSlots(red: RedactedGameState): number[] {
    return this.me(red)
      .grid.map((c, i) => (c ? i : -1))
      .filter((i) => i >= 0);
  }

  private ownUnknownSlots(red: RedactedGameState): number[] {
    return this.ownSlots(red).filter((i) => !this.own().has(i));
  }

  /** Expected value of an unknown card, from the remaining distribution. */
  private evUnknown(red: RedactedGameState): number {
    const pool = [...FULL_POOL];
    const remove = (points: number) => {
      const i = pool.indexOf(points);
      if (i !== -1) pool.splice(i, 1);
    };
    for (const c of red.discardPile) remove(cardPoints(c));
    // Hard bots additionally count every card they know the location of.
    if (this.difficulty === "hard") {
      for (const m of this.believed.values()) for (const b of m.values()) remove(b.points);
      if (this.drawn) remove(this.drawn.points);
    }
    if (pool.length === 0) return 5.4;
    return pool.reduce((a, b) => a + b, 0) / pool.length;
  }

  estimateOwnSum(red: RedactedGameState): number {
    const ev = this.evUnknown(red);
    return this.ownSlots(red).reduce(
      (sum, i) => sum + (this.own().get(i)?.points ?? ev),
      0,
    );
  }

  // -------------------------------------------------------------------------
  // Decisions — all based on the redacted state + own legitimate knowledge.
  // -------------------------------------------------------------------------

  chooseTurn(red: RedactedGameState): TurnChoice {
    const drawn = this.drawn;
    const slots = this.ownSlots(red);
    if (!drawn || slots.length === 0) {
      return { kind: "discard", useAbility: false };
    }
    const v = drawn.points;

    if (this.difficulty === "easy") {
      if (v < 7) {
        const known = slots
          .filter((i) => this.own().has(i))
          .sort((a, b) => this.own().get(b)!.points - this.own().get(a)!.points);
        const bestKnown = known[0];
        if (bestKnown !== undefined && this.own().get(bestKnown)!.points > v) {
          return { kind: "swap", gridIndex: bestKnown };
        }
        const unknown = this.ownUnknownSlots(red);
        if (unknown.length > 0) {
          return { kind: "swap", gridIndex: unknown[Math.floor(this.rnd() * unknown.length)]! };
        }
      }
      return { kind: "discard", useAbility: this.easyAbilityChoice(drawn.rank) };
    }

    // Medium + hard: EV-based.
    const ev = this.evUnknown(red);
    let bestSlot = -1;
    let bestVal = -Infinity;
    for (const i of slots) {
      const val = this.own().get(i)?.points ?? ev;
      if (val > bestVal) {
        bestVal = val;
        bestSlot = i;
      }
    }
    if (bestVal - v > 0.5) {
      return { kind: "swap", gridIndex: bestSlot };
    }
    return { kind: "discard", useAbility: this.wantsAbility(red, drawn.rank) };
  }

  private easyAbilityChoice(rank: Rank): boolean {
    if (rank === "10") return this.rnd() < 0.7; // peeks at a random own card
    return false; // easy bots skip the swap ability
  }

  private wantsAbility(red: RedactedGameState, rank: Rank): boolean {
    if (rank === "10") return this.choosePeekTarget(red) !== null;
    if (rank === "J") return this.chooseSwapTargets(red) !== null;
    return false;
  }

  choosePeekTarget(red: RedactedGameState): GridRef | null {
    const ownUnknown = this.ownUnknownSlots(red);
    const ownAll = this.ownSlots(red);

    if (this.difficulty === "easy") {
      if (ownAll.length === 0) return null;
      return { playerId: this.playerId, gridIndex: ownAll[Math.floor(this.rnd() * ownAll.length)]! };
    }
    if (ownUnknown.length > 0) {
      return {
        playerId: this.playerId,
        gridIndex: ownUnknown[Math.floor(this.rnd() * ownUnknown.length)]!,
      };
    }
    if (this.difficulty === "hard") {
      // Hunt jokers/red kings in opponents' grids.
      const targets: GridRef[] = [];
      for (const p of red.players) {
        if (p.id === this.playerId) continue;
        p.grid.forEach((c, i) => {
          if (c && !this.believed.get(p.id)?.has(i)) {
            targets.push({ playerId: p.id, gridIndex: i });
          }
        });
      }
      if (targets.length > 0) return targets[Math.floor(this.rnd() * targets.length)]!;
    }
    if (ownAll.length > 0 && this.difficulty === "medium") {
      return { playerId: this.playerId, gridIndex: ownAll[0]! };
    }
    return null;
  }

  chooseSwapTargets(red: RedactedGameState): { a: GridRef; b: GridRef } | null {
    if (this.difficulty === "easy") return null;

    const ownKnown = this.ownSlots(red)
      .filter((i) => this.own().has(i))
      .map((i) => ({ i, points: this.own().get(i)!.points }))
      .sort((x, y) => y.points - x.points);

    if (this.difficulty === "medium") {
      // Rarely: trade a known high card for a random opponent card (blind gamble).
      const high = ownKnown[0];
      if (!high || high.points < 9 || this.rnd() > 0.3) return null;
      const oppSlots: GridRef[] = [];
      for (const p of red.players) {
        if (p.id === this.playerId) continue;
        p.grid.forEach((c, i) => c && oppSlots.push({ playerId: p.id, gridIndex: i }));
      }
      if (oppSlots.length === 0) return null;
      return {
        a: { playerId: this.playerId, gridIndex: high.i },
        b: oppSlots[Math.floor(this.rnd() * oppSlots.length)]!,
      };
    }

    // Hard: steal known jokers / red kings, dumping our worst card.
    let bestOpp: { ref: GridRef; points: number } | null = null;
    for (const p of red.players) {
      if (p.id === this.playerId) continue;
      const m = this.believed.get(p.id);
      if (!m) continue;
      for (const [i, b] of m) {
        if (!p.grid[i]) continue; // slot emptied since
        if (!bestOpp || b.points < bestOpp.points) {
          bestOpp = { ref: { playerId: p.id, gridIndex: i }, points: b.points };
        }
      }
    }
    if (!bestOpp) return null;

    const ev = this.evUnknown(red);
    let worstOwn = -1;
    let worstVal = -Infinity;
    for (const i of this.ownSlots(red)) {
      const val = this.own().get(i)?.points ?? ev;
      if (val > worstVal) {
        worstVal = val;
        worstOwn = i;
      }
    }
    if (worstOwn === -1 || worstVal - bestOpp.points < 4) return null;
    return { a: { playerId: this.playerId, gridIndex: worstOwn }, b: bestOpp.ref };
  }

  shouldCallBaguette(red: RedactedGameState): boolean {
    if (red.baguette.callerId !== null) return false;
    const est = this.estimateOwnSum(red);

    if (this.difficulty === "easy") {
      return red.turnCount > red.players.length * 3 && this.rnd() < 0.15;
    }
    if (this.difficulty === "medium") {
      return est <= 6;
    }
    // Hard: aggressive when low, defensive when an opponent looks ready.
    const minOppCards = Math.min(
      ...red.players
        .filter((p) => p.id !== this.playerId)
        .map((p) => p.grid.filter((c) => c !== null).length),
    );
    return est <= 4 || (minOppCards <= 1 && est <= 9);
  }

  jumpCandidate(red: RedactedGameState): JumpPlan | null {
    if (this.difficulty === "easy") return null; // Bente never jumps
    const top = red.discardPile.length > 0 ? red.discardPile[red.discardPile.length - 1]! : null;
    if (!top) return null;
    const match = this.ownSlots(red).find((i) => this.own().get(i)?.rank === top.rank);
    if (match === undefined) return null;

    if (this.difficulty === "medium") {
      if (this.rnd() >= 0.8) return null; // 80% precision
      return { gridIndex: match, reactionMs: 1500 + this.rnd() * 1000 };
    }
    if (this.rnd() >= 0.97) return null; // near-perfect
    return { gridIndex: match, reactionMs: 600 + this.rnd() * 600 };
  }
}
