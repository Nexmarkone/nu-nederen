// Dramatic round reveal: cards flip player by player (clockwise, the
// Baguette caller last), sums count up, bonus/penalty stamp lands on the
// caller — then the scoreboard with race bars.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cardPoints, type RedactedGameState, type RevealEntry } from "@nu/shared";
import { sndFlip } from "../audio";
import { useStore } from "../store";
import { PlayingCard } from "./PlayingCard";
import { ScoreBoard } from "./ScoreBoard";

const FLIP_MS = 280;
const PLAYER_PAUSE_MS = 650;

interface Timeline {
  /** Per ordered player: timestamp (ms from start) of each card flip. */
  flips: number[][];
  total: number;
}

function buildTimeline(entries: RevealEntry[], order: string[]): Timeline {
  let t = 600;
  const flips: number[][] = [];
  for (const pid of order) {
    const entry = entries.find((e) => e.playerId === pid)!;
    const times: number[] = [];
    for (const c of entry.cards) {
      if (c !== null) {
        times.push(t);
        t += FLIP_MS;
      } else {
        times.push(-1);
      }
    }
    flips.push(times);
    t += PLAYER_PAUSE_MS;
  }
  return { flips, total: t };
}

export function RevealOverlay({ game }: { game: RedactedGameState }) {
  const playerId = useStore((s) => s.playerId);
  const room = useStore((s) => s.room);
  const act = useStore((s) => s.act);
  const leaveRoom = useStore((s) => s.leaveRoom);
  const reduce = useReducedMotion();
  const reveal = game.reveal;

  const [elapsed, setElapsed] = useState(0);
  const flipCount = useRef(0);

  const timeline = useMemo(
    () => (reveal ? buildTimeline(reveal.entries, reveal.order) : null),
    [reveal],
  );

  useEffect(() => {
    if (!timeline) return;
    if (reduce) {
      setElapsed(timeline.total + 1);
      return;
    }
    setElapsed(0);
    flipCount.current = 0;
    const started = Date.now();
    const iv = setInterval(() => {
      const e = Date.now() - started;
      setElapsed(e);
      if (e > timeline.total + 500) clearInterval(iv);
    }, 90);
    return () => clearInterval(iv);
  }, [timeline, reduce]);

  if (!reveal || !timeline) return null;

  const done = elapsed >= timeline.total;
  const isHost = room?.hostId === playerId;

  // Flip sound bookkeeping
  let flippedNow = 0;
  for (const times of timeline.flips) {
    for (const t of times) if (t >= 0 && elapsed >= t) flippedNow++;
  }
  if (flippedNow > flipCount.current) {
    flipCount.current = flippedNow;
    sndFlip();
  }

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-felt-900/92 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+18px)] backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <button
        className="absolute right-3 top-[calc(env(safe-area-inset-top)+10px)] z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-felt-800/80 text-base text-cream/80"
        onClick={leaveRoom}
        aria-label="Forlad spillet"
      >
        ✕
      </button>
      <h2 className="mb-3 text-center font-display text-2xl font-black tracking-wide text-gold-bright">
        Runde {game.roundNumber} — reveal!
      </h2>

      <div className="flex flex-1 flex-col gap-2.5">
        {reveal.order.map((pid, oi) => {
          const entry = reveal.entries.find((e) => e.playerId === pid)!;
          const player = game.players.find((p) => p.id === pid)!;
          const times = timeline.flips[oi]!;
          const isCaller = pid === reveal.baguetteCallerId;

          let visibleSum = 0;
          entry.cards.forEach((c, i) => {
            if (c && times[i]! >= 0 && elapsed >= times[i]!) visibleSum += cardPoints(c);
          });
          const allFlipped = times.every((t, i) => t < 0 || elapsed >= t || entry.cards[i] === null);
          const showAdjust = isCaller && allFlipped && entry.adjustment !== 0;

          return (
            <div
              key={pid}
              className={`glass flex items-center gap-3 rounded-2xl p-2.5 ${
                pid === playerId ? "border-gold/40" : ""
              }`}
            >
              <div className="flex w-14 flex-col items-center">
                <span className="text-xl">{player.avatar}</span>
                <span className="max-w-14 truncate text-[10px] font-semibold">{player.name}</span>
                {isCaller && <span className="text-[10px]">🥖</span>}
              </div>
              <div className="flex flex-1 flex-wrap gap-1">
                {entry.cards.map((c, i) =>
                  c === null ? null : (
                    <PlayingCard
                      key={c.id}
                      card={elapsed >= (times[i] ?? 0) && times[i]! >= 0 ? c : null}
                      className="w-9"
                      glowGold={
                        c.rank === "K" &&
                        (c.suit === "hearts" || c.suit === "diamonds") &&
                        elapsed >= (times[i] ?? 0)
                      }
                    />
                  ),
                )}
                {entry.cards.every((c) => c === null) && (
                  <span className="self-center text-xs text-cream/60">0 kort = 0 point 🎉</span>
                )}
              </div>
              <div className="flex w-16 flex-col items-end">
                <motion.span
                  key={visibleSum}
                  initial={reduce ? false : { scale: 1.3 }}
                  animate={{ scale: 1 }}
                  className="font-display text-xl font-black tabular-nums"
                >
                  {visibleSum}
                </motion.span>
                <AnimatePresence>
                  {showAdjust && (
                    <motion.span
                      initial={{ scale: 2.2, opacity: 0, rotate: -12 }}
                      animate={{ scale: 1, opacity: 1, rotate: -6 }}
                      className={`rounded-md border-2 px-1 text-[11px] font-black ${
                        entry.adjustment < 0
                          ? "border-bonus-green text-emerald-300"
                          : "border-signal-red text-red-300"
                      }`}
                    >
                      {entry.adjustment < 0 ? "−3 BONUS" : "+5 STRAF"}
                    </motion.span>
                  )}
                </AnimatePresence>
                {allFlipped && (
                  <span className="text-[10px] text-cream/60 tabular-nums">
                    i alt {entry.newTotal}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className="glass mt-4 rounded-3xl p-4"
          >
            <ScoreBoard game={game} />
            <div className="mt-4">
              {isHost ? (
                <button
                  className="w-full rounded-2xl bg-gold py-3.5 font-display text-base font-extrabold text-ink active:scale-[0.98]"
                  onClick={() => act({ type: "nextRound" })}
                >
                  {reveal.targetReached ? "Se resultatet 🏁" : "Næste runde →"}
                </button>
              ) : (
                <p className="text-center text-sm text-cream/60">Venter på værten…</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
