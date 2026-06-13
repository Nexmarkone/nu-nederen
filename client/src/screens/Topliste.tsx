// Global leaderboard across all evenings on this server.

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { ToplisteEntry } from "@nu/shared";
import { useStore } from "../store";

export function Topliste() {
  const goto = useStore((s) => s.goto);
  const [entries, setEntries] = useState<ToplisteEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/topliste")
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setError(true));
  }, []);

  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+16px)]">
      <header className="flex items-center justify-between">
        <button className="text-sm font-bold text-cream/60" onClick={() => goto("home")}>
          ‹ Tilbage
        </button>
        <h1 className="font-display text-xl font-black">Topliste 🏆</h1>
        <span className="w-14" />
      </header>

      <p className="text-center text-xs text-cream/55">
        Verdensranglisten på denne server — på tværs af alle aftener. Spil færdige spil for at
        komme på listen!
      </p>

      {/* Legend so the icons make sense at a glance. */}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-cream/45">
        <span>🏆 sejre</span>
        <span>⚡ jump-ins</span>
        <span>🥖 baguette-kald</span>
        <span>nederen = gange tabt</span>
      </div>

      {error && (
        <p className="py-8 text-center text-sm text-red-300">Kunne ikke hente toplisten 😢</p>
      )}
      {!error && entries === null && (
        <p className="animate-pulse py-8 text-center text-sm text-cream/50">Henter…</p>
      )}
      {entries !== null && entries.length === 0 && (
        <div className="glass mt-4 rounded-3xl p-6 text-center">
          <p className="text-3xl">🃏</p>
          <p className="mt-2 text-sm text-cream/70">
            Ingen på listen endnu. Spil et helt spil til ende, så tæller det!
          </p>
        </div>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {entries.map((e, i) => (
            <motion.div
              key={e.name}
              initial={{ x: -16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: Math.min(i * 0.04, 0.6) }}
              className={`glass flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ${
                i === 0 ? "border-gold/50" : ""
              }`}
            >
              <span className="w-8 text-center font-display text-base font-black text-gold-bright">
                {medal(i)}
              </span>
              <span className="text-xl">{e.avatar}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{e.name}</p>
                <p className="text-[11px] text-cream/55">
                  {e.games} {e.games === 1 ? "spil" : "spil"} · ⚡{e.jumpIns} · 🥖{e.baguetteHits}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-base font-black text-emerald-300 tabular-nums">
                  {e.wins} 🏆
                </p>
                <p className="text-[11px] text-red-300/85 tabular-nums">{e.nederen} × nederen</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
