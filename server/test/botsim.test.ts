// Phase 5 verification: MPC-Mogens (hard) must clearly beat Bot-Bente (easy)
// over 20 simulated games. The sim drives the pure engine + brains
// synchronously with seeded RNGs, so the result is deterministic.

import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  mulberry32,
  redactGameState,
  type EngineAction,
  type GameEvent,
  type GameState,
  type LobbyPlayer,
} from "@nu/shared";
import { BotBrain } from "../src/bots.js";

interface SimResult {
  totals: Map<string, number>;
  loserIds: string[];
  rounds: number;
}

function simulate(seed: number): SimResult {
  const rng = mulberry32(seed);
  const players: LobbyPlayer[] = [
    { id: "easy", name: "Bot-Bente", avatar: "🐣", isBot: true, botDifficulty: "easy", connected: true },
    { id: "hard", name: "MPC-Mogens", avatar: "🧠", isBot: true, botDifficulty: "hard", connected: true },
  ];
  const brains = new Map<string, BotBrain>([
    ["easy", new BotBrain("easy", "easy", mulberry32(seed * 31 + 1))],
    ["hard", new BotBrain("hard", "hard", mulberry32(seed * 31 + 2))],
  ]);

  const feed = (events: GameEvent[]) => {
    for (const ev of events) {
      if ("private" in ev) brains.get(ev.private)?.onEvent(ev);
      else for (const b of brains.values()) b.onEvent(ev);
    }
  };

  const init = createGame(players, { ...DEFAULT_RULES, turnTimerSeconds: 0 }, rng, seed);
  let state: GameState = init.state;
  feed(init.events);

  const dispatch = (action: EngineAction): boolean => {
    const res = applyAction(state, action, rng);
    if (res.error) return false;
    state = res.state;
    feed(res.events);
    return true;
  };

  let safety = 0;
  while (state.phase !== "gameOver" && safety++ < 50_000) {
    if (state.phase === "memorize") {
      dispatch({ type: "endMemorize" });
      continue;
    }
    if (state.phase === "reveal") {
      dispatch({ type: "nextRound" });
      continue;
    }

    const cur = state.players[state.currentPlayerIndex]!;
    const brain = brains.get(cur.id)!;

    switch (state.turnStage) {
      case "draw":
        dispatch({ type: "draw", playerId: cur.id });
        break;
      case "decide": {
        const choice = brain.chooseTurn(redactGameState(state, cur.id));
        if (choice.kind === "swap") {
          dispatch({ type: "swapInto", playerId: cur.id, gridIndex: choice.gridIndex });
        } else {
          dispatch({ type: "discardDrawn", playerId: cur.id, useAbility: choice.useAbility });
        }
        break;
      }
      case "ability": {
        if (state.pendingAbility === "peek") {
          const t = brain.choosePeekTarget(redactGameState(state, cur.id));
          if (t && dispatch({ type: "abilityPeek", playerId: cur.id, target: t })) break;
        } else if (state.pendingAbility === "swap") {
          const t = brain.chooseSwapTargets(redactGameState(state, cur.id));
          if (t && dispatch({ type: "abilitySwap", playerId: cur.id, a: t.a, b: t.b })) break;
        }
        dispatch({ type: "skipAbility", playerId: cur.id });
        break;
      }
      case "window": {
        if (
          state.baguette.callerId === null &&
          brain.shouldCallBaguette(redactGameState(state, cur.id))
        ) {
          dispatch({ type: "baguette", playerId: cur.id });
          break;
        }
        // Fastest jump candidate wins the race, like on the real server.
        let best: { id: string; gridIndex: number; reactionMs: number } | null = null;
        for (const [id, b] of brains) {
          const plan = b.jumpCandidate(redactGameState(state, id));
          if (plan && (!best || plan.reactionMs < best.reactionMs)) best = { id, ...plan };
        }
        if (best && best.reactionMs < state.rules.jumpInWindowSeconds * 1000) {
          dispatch({
            type: "jumpIn",
            playerId: best.id,
            gridIndex: best.gridIndex,
            windowId: state.jumpWindow.id,
          });
        } else {
          dispatch({ type: "closeJumpWindow", windowId: state.jumpWindow.id });
        }
        break;
      }
    }
  }

  expect(state.phase).toBe("gameOver");
  return {
    totals: new Map(state.players.map((p) => [p.id, p.totalScore])),
    loserIds: state.gameOver!.loserIds,
    rounds: state.roundNumber,
  };
}

describe("bot simulation", () => {
  it("MPC-Mogens clearly beats Bot-Bente over 20 games", () => {
    let hardWins = 0;
    let easyNederen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const result = simulate(seed);
      const easy = result.totals.get("easy")!;
      const hard = result.totals.get("hard")!;
      if (hard < easy) hardWins++;
      if (result.loserIds.includes("easy")) easyNederen++;
    }
    // "Klart" = at least 14 of 20.
    expect(hardWins).toBeGreaterThanOrEqual(14);
    expect(easyNederen).toBeGreaterThanOrEqual(14);
  });

  it("games terminate in a sane number of rounds", () => {
    const result = simulate(99);
    expect(result.rounds).toBeGreaterThanOrEqual(1);
    expect(result.rounds).toBeLessThan(60);
  });
});
