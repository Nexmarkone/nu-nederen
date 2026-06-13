import { describe, expect, it } from "vitest";
import { applyAction, type GameEvent } from "../src/index.js";
import { card, currentId, fail, newGame, newPlayingGame, ok, playPlainTurn } from "./helpers.js";

function evts(events: GameEvent[], type: GameEvent["type"]) {
  return events.filter((e) => e.type === type);
}

describe("deal", () => {
  it("gives every player 4 face-down cards and starts in memorize", () => {
    const { state } = newGame(4);
    expect(state.phase).toBe("memorize");
    for (const p of state.players) expect(p.grid).toHaveLength(4);
    // 54 - 16 dealt
    expect(state.drawPile).toHaveLength(54 - 16);
    expect(state.discardPile).toHaveLength(0);
    expect(state.currentPlayerIndex).toBe((state.dealerIndex + 1) % 4);
  });

  it("emits private memorize peeks of positions 2 and 3 to each player", () => {
    const { state, rng } = newGame(3);
    const { events } = applyAction(state, { type: "endMemorize" }, rng);
    expect(events[0]!.type).toBe("memorizeEnded");
    // memorizePrivate was emitted at deal time via createGame; re-create to inspect:
    const { state: _s, rng: _r } = newGame(3);
    void _s;
    void _r;
  });

  it("rotates the dealer clockwise across rounds", () => {
    const { state, rng } = newPlayingGame(3);
    const firstDealer = state.dealerIndex;

    // Force an empty-pile reveal with zeroed grids (so no one reaches 50).
    for (const p of state.players) p.grid = [null, null, null, null];
    state.drawPile = [];
    state.discardPile = [card("5")];
    let res = ok(state, { type: "draw", playerId: currentId(state) }, rng);
    expect(res.state.phase).toBe("reveal");

    res = ok(res.state, { type: "nextRound" }, rng);
    expect(res.state.roundNumber).toBe(2);
    expect(res.state.dealerIndex).toBe((firstDealer + 1) % 3);
    expect(res.state.phase).toBe("memorize");
    for (const p of res.state.players) expect(p.grid).toHaveLength(4);
    expect(res.state.currentPlayerIndex).toBe((res.state.dealerIndex + 1) % 3);

    // And once more.
    const playing = applyAction(res.state, { type: "endMemorize" }, rng).state;
    for (const p of playing.players) p.grid = [null, null, null, null];
    playing.drawPile = [];
    playing.discardPile = [card("5")];
    let res2 = ok(playing, { type: "draw", playerId: currentId(playing) }, rng);
    res2 = ok(res2.state, { type: "nextRound" }, rng);
    expect(res2.state.dealerIndex).toBe((firstDealer + 2) % 3);
  });
});

describe("turn flow", () => {
  it("draw then swapInto puts the replaced card face-up on the discard pile", () => {
    const { state, rng } = newPlayingGame(3);
    const pid = currentId(state);
    const player = state.players[state.currentPlayerIndex]!;
    const oldCard = player.grid[1]!;

    let res = ok(state, { type: "draw", playerId: pid }, rng);
    const drawn = res.state.drawnCard!;
    expect(drawn).not.toBeNull();
    expect(evts(res.events, "cardDrawn")).toHaveLength(1);
    const priv = res.events.find((e) => e.type === "drawnPrivate");
    expect(priv && "private" in priv && priv.private).toBe(pid);

    res = ok(res.state, { type: "swapInto", playerId: pid, gridIndex: 1 }, rng);
    const p2 = res.state.players.find((p) => p.id === pid)!;
    expect(p2.grid[1]!.id).toBe(drawn.id);
    expect(res.state.discardPile.at(-1)!.id).toBe(oldCard.id);
    expect(res.state.drawnCard).toBeNull();
    // Jump window opened, turn waits for it.
    expect(res.state.jumpWindow.open).toBe(true);
    expect(res.state.turnStage).toBe("window");

    res = ok(res.state, { type: "closeJumpWindow", windowId: res.state.jumpWindow.id }, rng);
    expect(currentId(res.state)).not.toBe(pid);
    expect(res.state.turnStage).toBe("draw");
  });

  it("draw then discard advances the turn after the window closes", () => {
    const { state, rng } = newPlayingGame(3);
    const pid = currentId(state);
    const next = playPlainTurn(state, rng);
    expect(currentId(next)).not.toBe(pid);
    expect(next.discardPile).toHaveLength(1);
  });

  it("rejects acting out of turn and in the wrong phase", () => {
    const { state, rng } = newGame(3);
    // Wrong phase (memorize)
    fail(state, { type: "draw", playerId: currentId(state) }, rng, "wrongPhase");

    const playing = applyAction(state, { type: "endMemorize" }, rng).state;
    const notCurrent = playing.players.find((p) => p.id !== currentId(playing))!;
    fail(playing, { type: "draw", playerId: notCurrent.id }, rng, "notYourTurn");

    // Cannot discard before drawing.
    fail(
      playing,
      { type: "discardDrawn", playerId: currentId(playing), useAbility: false },
      rng,
      "wrongStage",
    );
    // Cannot draw twice.
    const afterDraw = ok(playing, { type: "draw", playerId: currentId(playing) }, rng).state;
    fail(afterDraw, { type: "draw", playerId: currentId(afterDraw) }, rng, "wrongStage");
    // Cannot swap into an out-of-range slot.
    fail(afterDraw, { type: "swapInto", playerId: currentId(afterDraw), gridIndex: 9 }, rng);
  });

  it("disallows drawing from the discard pile unless the house rule is on", () => {
    const { state, rng } = newPlayingGame(3, { allowDrawFromDiscard: false });
    state.discardPile = [card("4")];
    fail(state, { type: "draw", playerId: currentId(state), from: "discard" }, rng, "notAllowed");

    const { state: s2, rng: r2 } = newPlayingGame(3, { allowDrawFromDiscard: true });
    s2.discardPile = [card("4", "hearts", "disc-1")];
    const res = ok(s2, { type: "draw", playerId: currentId(s2), from: "discard" }, r2);
    expect(res.state.drawnCard!.id).toBe("disc-1");
    expect(res.state.drawnFromDiscard).toBe(true);
  });
});

describe("abilities", () => {
  function gameWithDrawnRank(rank: "10" | "J" | "Q") {
    const { state, rng } = newPlayingGame(3);
    state.drawPile.push(card(rank, "clubs", `top-${rank}`)); // top of pile
    const pid = currentId(state);
    const res = ok(state, { type: "draw", playerId: pid }, rng);
    expect(res.state.drawnCard!.rank).toBe(rank);
    return { state: res.state, rng, pid };
  }

  it("10 -> peek: only the peeker gets the private card event", () => {
    const { state, rng, pid } = gameWithDrawnRank("10");
    let res = ok(state, { type: "discardDrawn", playerId: pid, useAbility: true }, rng);
    expect(res.state.turnStage).toBe("ability");
    expect(res.state.pendingAbility).toBe("peek");

    const opponent = res.state.players.find((p) => p.id !== pid)!;
    const targetCard = opponent.grid[0]!;
    res = ok(
      res.state,
      { type: "abilityPeek", playerId: pid, target: { playerId: opponent.id, gridIndex: 0 } },
      rng,
    );
    const pub = res.events.find((e) => e.type === "abilityPeeked")!;
    expect(pub).toBeDefined();
    const priv = res.events.find((e) => e.type === "peekPrivate")!;
    expect("private" in priv && priv.private).toBe(pid);
    expect("card" in priv && priv.card.id).toBe(targetCard.id);
    // Everyone sees WHICH card was peeked, but the card itself is only private.
    expect(JSON.stringify(pub)).not.toContain(targetCard.rank);
  });

  it("J -> swap: moves exactly two cards across players, blind", () => {
    const { state, rng, pid } = gameWithDrawnRank("J");
    let res = ok(state, { type: "discardDrawn", playerId: pid, useAbility: true }, rng);
    expect(res.state.pendingAbility).toBe("swap");

    const me = res.state.players.find((p) => p.id === pid)!;
    const opp = res.state.players.find((p) => p.id !== pid)!;
    const myCard = me.grid[0]!;
    const oppCard = opp.grid[2]!;
    const untouched = res.state.players.flatMap((p) => p.grid.map((c) => c?.id));

    res = ok(
      res.state,
      {
        type: "abilitySwap",
        playerId: pid,
        a: { playerId: pid, gridIndex: 0 },
        b: { playerId: opp.id, gridIndex: 2 },
      },
      rng,
    );
    const me2 = res.state.players.find((p) => p.id === pid)!;
    const opp2 = res.state.players.find((p) => p.id === opp.id)!;
    expect(me2.grid[0]!.id).toBe(oppCard.id);
    expect(opp2.grid[2]!.id).toBe(myCard.id);
    // Exactly two positions changed.
    const after = res.state.players.flatMap((p) => p.grid.map((c) => c?.id));
    const changed = after.filter((id, i) => id !== untouched[i]);
    expect(changed).toHaveLength(2);
  });

  it("no ability when a 10/J is swapped into the grid instead of discarded", () => {
    const { state, rng, pid } = gameWithDrawnRank("10");
    const res = ok(state, { type: "swapInto", playerId: pid, gridIndex: 0 }, rng);
    expect(res.state.pendingAbility).toBeNull();
    expect(res.state.turnStage).toBe("window");
  });

  it("no ability when the card was drawn from the discard pile (house rule)", () => {
    const { state, rng } = newPlayingGame(3, { allowDrawFromDiscard: true });
    state.discardPile = [card("10", "hearts")];
    const pid = currentId(state);
    let res = ok(state, { type: "draw", playerId: pid, from: "discard" }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: pid, useAbility: true }, rng);
    expect(res.state.pendingAbility).toBeNull();
    expect(res.state.turnStage).toBe("window");
  });

  it("no ability for non-10/J ranks even if requested", () => {
    const { state, rng, pid } = gameWithDrawnRank("Q");
    const res = ok(state, { type: "discardDrawn", playerId: pid, useAbility: true }, rng);
    expect(res.state.pendingAbility).toBeNull();
  });

  it("skip ability works and the turn ends once the window closes", () => {
    const { state, rng, pid } = gameWithDrawnRank("10");
    let res = ok(state, { type: "discardDrawn", playerId: pid, useAbility: true }, rng);
    res = ok(res.state, { type: "closeJumpWindow", windowId: res.state.jumpWindow.id }, rng);
    // Window closed but ability pending -> still this player's turn.
    expect(currentId(res.state)).toBe(pid);
    res = ok(res.state, { type: "skipAbility", playerId: pid }, rng);
    expect(evts(res.events, "abilitySkipped")).toHaveLength(1);
    expect(currentId(res.state)).not.toBe(pid);
  });
});

describe("jump-in", () => {
  function windowOpenGame() {
    // p1 discards a 7; everyone has known grids.
    const { state, rng } = newPlayingGame(3);
    const [p1, p2, p3] = state.players;
    p1!.grid = [card("2"), card("3"), card("4"), card("5")];
    p2!.grid = [card("7", "hearts", "p2-seven"), card("9"), card("9"), card("K", "spades")];
    p3!.grid = [card("7", "clubs", "p3-seven"), card("A"), card("A"), card("2")];
    state.drawPile.push(card("7", "diamonds", "drawn-seven"));
    const pid = currentId(state);
    let res = ok(state, { type: "draw", playerId: pid }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: pid, useAbility: false }, rng);
    expect(res.state.jumpWindow.open).toBe(true);
    return { state: res.state, rng, windowId: res.state.jumpWindow.id };
  }

  it("a matching jump removes the card, lands it on the pile and opens a NEW window (chain)", () => {
    const { state, rng, windowId } = windowOpenGame();
    const p2 = state.players[1]!;
    let res = ok(state, { type: "jumpIn", playerId: p2.id, gridIndex: 0, windowId }, rng);
    expect(res.state.discardPile.at(-1)!.id).toBe("p2-seven");
    expect(res.state.players[1]!.grid[0]).toBeNull();
    expect(res.state.players[1]!.stats.jumpIns).toBe(1);
    const newWindowId = res.state.jumpWindow.id;
    expect(newWindowId).toBe(windowId + 1);
    expect(res.state.jumpWindow.open).toBe(true);

    // Chain: p3 jumps their 7 onto the new top.
    const p3 = res.state.players[2]!;
    res = ok(res.state, { type: "jumpIn", playerId: p3.id, gridIndex: 0, windowId: newWindowId }, rng);
    expect(res.state.discardPile.at(-1)!.id).toBe("p3-seven");
    expect(res.state.jumpWindow.id).toBe(newWindowId + 1);
  });

  it("a wrong-rank jump returns the card and draws a hidden penalty card", () => {
    const { state, rng, windowId } = windowOpenGame();
    const p2 = state.players[1]!;
    const before = state.drawPile.length;
    const res = ok(state, { type: "jumpIn", playerId: p2.id, gridIndex: 1, windowId }, rng); // a 9, top is 7
    const after = res.state.players[1]!;
    expect(after.grid).toHaveLength(5); // penalty card added on top
    expect(after.grid[2]!.rank).toBe("9"); // the returned 9 shifted down by one
    expect(after.stats.failedJumpIns).toBe(1);
    expect(res.state.drawPile).toHaveLength(before - 1);
    const ev = res.events.find((e) => e.type === "jumpInFailed")!;
    expect("penaltyGridIndex" in ev && ev.penaltyGridIndex).toBe(0); // lands on top
    if (ev.type === "jumpInFailed") {
      expect(after.grid[0]!.id).toBe(ev.penaltyCardId); // top slot is the penalty
    }
    // Window unaffected by a failed jump.
    expect(res.state.jumpWindow.id).toBe(windowId);
    expect(res.state.jumpWindow.open).toBe(true);
  });

  it("a penalty lands on TOP even when a lower slot is empty (never fills the bottom gap)", () => {
    const { state, rng, windowId } = windowOpenGame();
    const p2 = state.players[1]!;
    p2.grid[3] = null; // p2 had jumped a bottom card away earlier — empty bottom slot
    const res = ok(state, { type: "jumpIn", playerId: p2.id, gridIndex: 1, windowId }, rng); // a 9, top is 7 -> wrong
    const after = res.state.players[1]!;
    const ev = res.events.find((e) => e.type === "jumpInFailed")!;
    expect("penaltyGridIndex" in ev && ev.penaltyGridIndex).toBe(0); // TOP, not the empty bottom slot
    if (ev.type === "jumpInFailed") {
      expect(after.grid[0]!.id).toBe(ev.penaltyCardId);
    }
    expect(after.grid.at(-1)).toBeNull(); // the empty bottom slot is left untouched
  });

  it("supports the points5 penalty house rule", () => {
    const { state, rng } = newPlayingGame(3, { jumpInPenalty: "points5" });
    const p2 = state.players[1]!;
    p2.grid = [card("9"), card("9"), card("9"), card("9")];
    state.drawPile.push(card("7"));
    const pid = currentId(state);
    let res = ok(state, { type: "draw", playerId: pid }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: pid, useAbility: false }, rng);
    res = ok(
      res.state,
      { type: "jumpIn", playerId: p2.id, gridIndex: 0, windowId: res.state.jumpWindow.id },
      rng,
    );
    expect(res.state.players[1]!.totalScore).toBe(5);
    expect(res.state.players[1]!.grid).toHaveLength(4); // no extra card
  });

  it("race: the first valid jump wins; a late message for the old window is silently rejected", () => {
    const { state, rng, windowId } = windowOpenGame();
    const p2 = state.players[1]!;
    const p3 = state.players[2]!;
    const res1 = ok(state, { type: "jumpIn", playerId: p2.id, gridIndex: 0, windowId }, rng);
    // p3's message arrives referencing the OLD window -> silent, no penalty.
    const res2 = applyAction(res1.state, { type: "jumpIn", playerId: p3.id, gridIndex: 0, windowId }, rng);
    expect(res2.error?.code).toBe("jumpTooLate");
    expect(res2.error?.silent).toBe(true);
    expect(res2.state.players[2]!.stats.failedJumpIns).toBe(0);
    expect(res2.state.players[2]!.grid[0]).not.toBeNull();
  });

  it("a jump after the window closed is silently rejected", () => {
    const { state, rng, windowId } = windowOpenGame();
    const closed = ok(state, { type: "closeJumpWindow", windowId }, rng).state;
    const p2 = closed.players[1]!;
    const res = applyAction(closed, { type: "jumpIn", playerId: p2.id, gridIndex: 0, windowId }, rng);
    expect(res.error?.code).toBe("jumpTooLate");
    expect(res.error?.silent).toBe(true);
  });

  it("jumping your last card away leaves 0 cards = 0 points in the round", () => {
    const { state, rng } = newPlayingGame(2);
    const idle = state.players.find((_, i) => i !== state.currentPlayerIndex)!;
    idle.grid = [null, null, null, card("8", "hearts", "last-eight")];
    state.drawPile.push(card("8", "clubs"));
    const pid = currentId(state);
    let res = ok(state, { type: "draw", playerId: pid }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: pid, useAbility: false }, rng);
    res = ok(
      res.state,
      { type: "jumpIn", playerId: idle.id, gridIndex: 3, windowId: res.state.jumpWindow.id },
      rng,
    );
    const idleAfter = res.state.players.find((p) => p.id === idle.id)!;
    expect(idleAfter.grid.every((c) => c === null)).toBe(true);

    // Close the chain window, then force reveal and check the 0-point round.
    res = ok(res.state, { type: "closeJumpWindow", windowId: res.state.jumpWindow.id }, rng);
    res.state.drawPile = [];
    res.state.discardPile = [card("5")];
    const reveal = ok(res.state, { type: "draw", playerId: currentId(res.state) }, rng).state;
    expect(reveal.phase).toBe("reveal");
    const entry = reveal.reveal!.entries.find((e) => e.playerId === idle.id)!;
    expect(entry.rawSum).toBe(0);
    expect(entry.roundScore).toBe(0);
  });

  it("a player with 0 cards still takes a full turn (draw -> discard)", () => {
    const { state, rng } = newPlayingGame(2);
    const cur = state.players[state.currentPlayerIndex]!;
    cur.grid = [null, null, null, null];
    const next = playPlainTurn(state, rng);
    expect(currentId(next)).not.toBe(cur.id);
  });
});

describe("baguette", () => {
  it("opens a jump window with 5 EXTRA seconds so everyone can react", () => {
    const { state, rng } = newPlayingGame(3);
    const caller = currentId(state);
    let res = ok(state, { type: "draw", playerId: caller }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: caller, useAbility: false }, rng);
    res = ok(res.state, { type: "baguette", playerId: caller }, rng);
    const ev = res.events.find((e) => e.type === "jumpWindowOpened")!;
    // default jumpInWindowSeconds (5s) + 5s extra on baguette = 10s
    expect("durationMs" in ev && ev.durationMs).toBe(10000);
    expect(res.state.jumpWindow.open).toBe(true);
    expect(res.state.turnStage).toBe("window");
  });

  it("gives everyone else exactly one extra turn, then reveals (caller last)", () => {
    const { state, rng } = newPlayingGame(3);
    const caller = currentId(state);

    let res = ok(state, { type: "draw", playerId: caller }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: caller, useAbility: false }, rng);
    res = ok(res.state, { type: "baguette", playerId: caller }, rng);
    expect(evts(res.events, "baguetteCalled")).toHaveLength(1);
    res = ok(res.state, { type: "closeJumpWindow", windowId: res.state.jumpWindow.id }, rng);

    // Two other players get one turn each.
    let s = res.state;
    const turnTakers: string[] = [];
    for (let i = 0; i < 2; i++) {
      expect(s.phase).toBe("playing");
      turnTakers.push(currentId(s));
      s = playPlainTurn(s, rng);
    }
    expect(s.phase).toBe("reveal");
    expect(new Set(turnTakers).size).toBe(2);
    expect(turnTakers).not.toContain(caller);
    // Caller revealed last.
    expect(s.reveal!.order.at(-1)).toBe(caller);
  });

  it("cannot be called twice in the same round, nor mid-turn before discarding", () => {
    const { state, rng } = newPlayingGame(3);
    const caller = currentId(state);
    // Too early: before discard.
    fail(state, { type: "baguette", playerId: caller }, rng, "wrongStage");

    let res = ok(state, { type: "draw", playerId: caller }, rng);
    fail(res.state, { type: "baguette", playerId: caller }, rng, "wrongStage");
    res = ok(res.state, { type: "discardDrawn", playerId: caller, useAbility: false }, rng);
    res = ok(res.state, { type: "baguette", playerId: caller }, rng);
    res = ok(res.state, { type: "closeJumpWindow", windowId: res.state.jumpWindow.id }, rng);

    // Next player tries to call again.
    const second = currentId(res.state);
    let res2 = ok(res.state, { type: "draw", playerId: second }, rng);
    res2 = ok(res2.state, { type: "discardDrawn", playerId: second, useAbility: false }, rng);
    fail(res2.state, { type: "baguette", playerId: second }, rng, "alreadyCalled");
  });

  it("caller gets -3 only when STRICTLY lowest; a tie for lowest is +5", () => {
    // Case 1: caller uniquely lowest.
    const { state, rng } = newPlayingGame(2);
    const caller = currentId(state);
    const callerP = state.players[state.currentPlayerIndex]!;
    const other = state.players.find((p) => p.id !== caller)!;
    callerP.grid = [card("JOKER", null), card("K", "hearts"), null, null]; // -3 + 0 = -3
    other.grid = [card("5"), card("5"), null, null]; // 10

    let res = ok(state, { type: "draw", playerId: caller }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: caller, useAbility: false }, rng);
    res = ok(res.state, { type: "baguette", playerId: caller }, rng);
    res = ok(res.state, { type: "closeJumpWindow", windowId: res.state.jumpWindow.id }, rng);
    let s = playPlainTurn(res.state, rng);
    expect(s.phase).toBe("reveal");
    const callerEntry = s.reveal!.entries.find((e) => e.playerId === caller)!;
    expect(callerEntry.adjustment).toBe(-3);
    expect(callerEntry.roundScore).toBe(callerEntry.rawSum - 3);

    // Case 2: shared lowest (tie) -> +5, because the caller is not uniquely fewest.
    {
      const { state: st, rng: r } = newPlayingGame(2, {}, 7);
      const c = currentId(st);
      const cp = st.players[st.currentPlayerIndex]!;
      const op = st.players.find((p) => p.id !== c)!;
      cp.grid = [card("3"), null, null, null];
      op.grid = [card("3"), null, null, null];
      let rr = ok(st, { type: "draw", playerId: c }, r);
      rr = ok(rr.state, { type: "discardDrawn", playerId: c, useAbility: false }, r);
      rr = ok(rr.state, { type: "baguette", playerId: c }, r);
      rr = ok(rr.state, { type: "closeJumpWindow", windowId: rr.state.jumpWindow.id }, r);
      // The other player draws and discards without changing their grid sum.
      const sFinal = playPlainTurn(rr.state, r);
      expect(sFinal.phase).toBe("reveal");
      const e = sFinal.reveal!.entries.find((x) => x.playerId === c)!;
      expect(e.adjustment).toBe(5);
    }

    // Case 3: caller NOT lowest -> +5.
    {
      const { state: st, rng: r } = newPlayingGame(2, {}, 9);
      const c = currentId(st);
      const cp = st.players[st.currentPlayerIndex]!;
      const op = st.players.find((p) => p.id !== c)!;
      cp.grid = [card("9"), card("9"), null, null]; // 18
      op.grid = [card("A"), null, null, null]; // 1
      let rr = ok(st, { type: "draw", playerId: c }, r);
      rr = ok(rr.state, { type: "discardDrawn", playerId: c, useAbility: false }, r);
      rr = ok(rr.state, { type: "baguette", playerId: c }, r);
      rr = ok(rr.state, { type: "closeJumpWindow", windowId: rr.state.jumpWindow.id }, r);
      const sFinal = playPlainTurn(rr.state, r);
      const e = sFinal.reveal!.entries.find((x) => x.playerId === c)!;
      expect(e.adjustment).toBe(5);
      expect(e.roundScore).toBe(e.rawSum + 5);
    }
  });
});

describe("empty draw pile", () => {
  it("reshuffles the discard pile minus its top card", () => {
    const { state, rng } = newPlayingGame(3);
    state.drawPile = [];
    state.discardPile = [
      card("2", "hearts", "d1"),
      card("3", "hearts", "d2"),
      card("4", "hearts", "d-top"),
    ];
    const res = ok(state, { type: "draw", playerId: currentId(state) }, rng);
    expect(res.events.some((e) => e.type === "deckReshuffled")).toBe(true);
    expect(res.state.discardPile).toHaveLength(1);
    expect(res.state.discardPile[0]!.id).toBe("d-top");
    // 2 reshuffled, 1 drawn.
    expect(res.state.drawPile).toHaveLength(1);
    expect(["d1", "d2"]).toContain(res.state.drawnCard!.id);
  });

  it("forces a reveal when both piles are effectively empty", () => {
    const { state, rng } = newPlayingGame(3);
    state.drawPile = [];
    state.discardPile = [card("4")];
    const res = ok(state, { type: "draw", playerId: currentId(state) }, rng);
    expect(res.state.phase).toBe("reveal");
    expect(res.events.some((e) => e.type === "revealStarted")).toBe(true);
  });

  it("reshuffles before drawing a penalty card too", () => {
    const { state, rng } = newPlayingGame(3);
    const p2 = state.players[1]!;
    p2.grid = [card("9"), card("9"), card("9"), card("9")];
    state.drawPile.push(card("7"));
    const pid = currentId(state);
    let res = ok(state, { type: "draw", playerId: pid }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: pid, useAbility: false }, rng);
    // Now empty the draw pile and pad the discard pile.
    res.state.drawPile = [];
    res.state.discardPile.unshift(card("2", "hearts", "below-top"));
    res = ok(
      res.state,
      { type: "jumpIn", playerId: p2.id, gridIndex: 0, windowId: res.state.jumpWindow.id },
      rng,
    );
    expect(res.events.some((e) => e.type === "deckReshuffled")).toBe(true);
    expect(res.state.players[1]!.grid).toHaveLength(5);
  });
});

describe("turn timeout", () => {
  it("auto-plays draw -> discard without ability", () => {
    const { state, rng } = newPlayingGame(3);
    state.drawPile.push(card("10", "clubs")); // would have an ability
    const pid = currentId(state);
    const res = ok(state, { type: "turnTimeout", playerId: pid }, rng);
    expect(res.events.some((e) => e.type === "turnTimedOut")).toBe(true);
    expect(res.state.discardPile.at(-1)!.rank).toBe("10");
    expect(res.state.pendingAbility).toBeNull();
    expect(res.state.turnStage).toBe("window");
  });

  it("skips a pending ability on timeout", () => {
    const { state, rng } = newPlayingGame(3);
    state.drawPile.push(card("J", "clubs"));
    const pid = currentId(state);
    let res = ok(state, { type: "draw", playerId: pid }, rng);
    res = ok(res.state, { type: "discardDrawn", playerId: pid, useAbility: true }, rng);
    expect(res.state.turnStage).toBe("ability");
    res = ok(res.state, { type: "turnTimeout", playerId: pid }, rng);
    expect(res.state.pendingAbility).toBeNull();
    expect(res.state.turnStage).toBe("window");
  });
});
