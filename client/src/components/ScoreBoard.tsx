// "Kapløb mod 50" — the closer your bar is to full, the closer you are to
// being Nederen.

import { motion } from "motion/react";
import type { RedactedGameState } from "@nu/shared";

export function ScoreBoard({ game }: { game: RedactedGameState }) {
  const target = game.rules.targetScore;
  const sorted = [...game.players].sort((a, b) => a.totalScore - b.totalScore);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold uppercase tracking-widest text-gold">
          Kapløb mod {target}
        </h3>
        <span className="text-xs text-cream/50">lavest vinder</span>
      </div>
      {sorted.map((p) => {
        const frac = Math.max(0, Math.min(1, p.totalScore / target));
        const danger = frac > 0.75;
        return (
          <div key={p.id} className="flex items-center gap-2">
            <span className="w-7 text-center text-lg">{p.avatar}</span>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-xs">
                <span className="truncate font-semibold">{p.name}</span>
                <span className={`font-bold tabular-nums ${danger ? "text-red-300" : "text-cream/80"}`}>
                  {p.totalScore}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-felt-900/80">
                <motion.div
                  className={`h-full rounded-full ${
                    danger ? "bg-signal-red" : "bg-gradient-to-r from-bonus-green to-gold"
                  }`}
                  initial={false}
                  animate={{ width: `${frac * 100}%` }}
                  transition={{ type: "spring", stiffness: 120, damping: 22 }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
