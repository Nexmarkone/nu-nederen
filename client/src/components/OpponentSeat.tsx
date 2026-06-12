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
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-felt-700 text-lg shadow">
          {player.avatar}
        </div>
        {isDealer && (
          <span className="absolute -right-1.5 -top-1 rounded-full bg-cream px-1 text-[8px] font-black text-ink">
            D
          </span>
        )}
        {isCaller && <span className="absolute -left-2 -top-1 text-xs">🥖</span>}
        {player.isBot && (
          <span className="absolute -bottom-1 -right-1.5 text-[10px]">🤖</span>
        )}
      </div>
      <div className="max-w-16 truncate text-[10px] font-semibold leading-none text-cream/85">
        {player.name}
      </div>
      <div className="text-[10px] font-bold leading-none text-gold-bright tabular-nums">
        {player.totalScore} pt
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
