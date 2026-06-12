// One opponent at the top of the table: avatar, name, score, mini-grid and
// the gliding golden turn ring.

import { motion } from "motion/react";
import type { GridRef, RedactedPlayer } from "@nu/shared";
import { CardGrid } from "./CardGrid";

export function OpponentSeat({
  player,
  isCurrent,
  isDealer,
  isCaller,
  onCardTap,
  targetable,
  selectedRef,
}: {
  player: RedactedPlayer;
  isCurrent: boolean;
  isDealer: boolean;
  isCaller: boolean;
  onCardTap?: (ref: GridRef) => void;
  targetable?: boolean;
  selectedRef?: GridRef | null;
}) {
  return (
    <div
      className={`relative flex min-w-0 flex-col items-center gap-1 rounded-2xl p-1.5 ${
        player.connected || player.isBot ? "" : "opacity-50"
      }`}
    >
      {isCurrent && (
        <motion.div
          layoutId="turn-spotlight"
          className="pointer-events-none absolute -inset-1 -z-10 rounded-2xl"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(232,197,122,0.28) 0%, rgba(232,197,122,0) 70%)",
          }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        />
      )}
      <div className="relative">
        {isCurrent && (
          <motion.div
            layoutId="turn-ring"
            className="absolute -inset-1 rounded-full border-[2.5px] border-gold-bright"
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          />
        )}
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-felt-700 to-felt-800 text-lg shadow-lg ring-1 ring-gold/40"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.12)" }}
        >
          {player.avatar}
        </div>
        {isDealer && (
          <span className="absolute -right-1.5 -top-1 rounded-full bg-cream px-1 text-[8px] font-black text-ink shadow">
            D
          </span>
        )}
        {isCaller && <span className="absolute -left-2 -top-1 text-xs">🥖</span>}
        {player.isBot && (
          <span className="absolute -bottom-1 -right-1.5 text-[10px]">🤖</span>
        )}
        <span className="absolute -bottom-1 -left-1.5 rounded-full bg-felt-900/90 px-1 text-[8px] font-bold text-cream/80 ring-1 ring-gold/30">
          {player.grid.filter((c) => c !== null).length}
        </span>
      </div>
      <div className="max-w-16 truncate text-[10px] font-semibold leading-none text-cream/85">
        {player.name}
      </div>
      <div className="gold-bloom text-[11px] font-extrabold leading-none text-gold-bright tabular-nums">
        {player.totalScore}
      </div>
      <CardGrid
        player={player}
        cardClass="w-6"
        onCardTap={onCardTap}
        targetable={targetable}
        selectedRef={selectedRef}
      />
    </div>
  );
}
