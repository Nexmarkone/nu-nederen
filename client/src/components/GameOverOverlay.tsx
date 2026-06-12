// Game over: confetti for the winners, a big NEDEREN stamp for the loser,
// a little stats block and the rematch button.

import { motion } from "motion/react";
import type { RedactedGameState } from "@nu/shared";
import { useStore } from "../store";
import { Confetti } from "./Confetti";
import { ScoreBoard } from "./ScoreBoard";

export function GameOverOverlay({ game }: { game: RedactedGameState }) {
  const playerId = useStore((s) => s.playerId);
  const room = useStore((s) => s.room);
  const rematch = useStore((s) => s.rematch);
  const leaveRoom = useStore((s) => s.leaveRoom);

  const over = game.gameOver;
  if (!over) return null;

  const iWon = over.winnerIds.includes(playerId ?? "");
  const iLost = over.loserIds.includes(playerId ?? "");
  const isHost = room?.hostId === playerId;
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? "?";
  const avatar = (id: string) => game.players.find((p) => p.id === id)?.avatar ?? "❓";

  const mostJumps = [...game.players].sort((a, b) => b.stats.jumpIns - a.stats.jumpIns)[0];
  const bestBaguette = [...game.players].sort(
    (a, b) => b.stats.baguetteHits - a.stats.baguetteHits,
  )[0];

  return (
    <motion.div
      className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-felt-900/94 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+24px)] backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {iWon && <Confetti />}

      <div className="flex flex-col items-center gap-1.5">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 240, damping: 18 }}
          className="text-5xl"
        >
          {iWon ? "🏆" : iLost ? "🥖" : "🃏"}
        </motion.div>
        <h2 className="font-display text-3xl font-black text-gold-bright">
          {iWon ? "Du vandt!" : iLost ? "Du er Nederen!" : "Spillet er slut"}
        </h2>
        <p className="text-sm text-cream/70">
          {over.winnerIds.map((id) => `${avatar(id)} ${name(id)}`).join(" & ")} vandt med færrest
          point
        </p>
      </div>

      {/* NEDEREN stamp */}
      <div className="mt-6 flex justify-center">
        <motion.div
          initial={{ scale: 3, opacity: 0, rotate: 14 }}
          animate={{ scale: 1, opacity: 1, rotate: -8 }}
          transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.35 }}
          className="rounded-xl border-4 border-signal-red px-6 py-2 font-display text-2xl font-black tracking-widest text-red-300"
        >
          {over.loserIds.map((id) => `${avatar(id)} ${name(id)}`).join(" & ")} — NEDEREN 🥖
        </motion.div>
      </div>

      <div className="glass mt-7 rounded-3xl p-4">
        <ScoreBoard game={game} />
      </div>

      <div className="glass mt-3 rounded-3xl p-4 text-sm">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gold">Statistik</h3>
        <ul className="space-y-1.5 text-cream/85">
          <li>🔁 Runder spillet: <b>{game.roundNumber}</b></li>
          {mostJumps && mostJumps.stats.jumpIns > 0 && (
            <li>
              ⚡ Flest jump-ins: <b>{mostJumps.name}</b> ({mostJumps.stats.jumpIns})
            </li>
          )}
          {bestBaguette && bestBaguette.stats.baguetteHits > 0 && (
            <li>
              🥖 Bedste Baguette: <b>{bestBaguette.name}</b> ({bestBaguette.stats.baguetteHits}{" "}
              {bestBaguette.stats.baguetteHits === 1 ? "bonus" : "bonusser"})
            </li>
          )}
        </ul>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        {isHost && (
          <button
            className="rounded-2xl bg-gold py-4 font-display text-base font-extrabold text-ink active:scale-[0.98]"
            onClick={rematch}
          >
            Revanche! 🔁
          </button>
        )}
        <button
          className="rounded-2xl border border-cream/20 py-3.5 text-sm font-bold text-cream/80 active:scale-[0.98]"
          onClick={leaveRoom}
        >
          Forlad rummet
        </button>
      </div>
    </motion.div>
  );
}
