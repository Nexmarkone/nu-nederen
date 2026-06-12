// Draw pile + discard pile, with the jump-in ring around the discard.

import { motion } from "motion/react";
import type { Card } from "@nu/shared";
import { CardBack, PlayingCard } from "./PlayingCard";
import { JumpRing } from "./JumpRing";

export function DrawPile({
  count,
  active,
  onTap,
}: {
  count: number;
  active: boolean;
  onTap?: () => void;
}) {
  return (
    <button
      className="relative flex flex-col items-center disabled:opacity-100"
      onClick={onTap}
      disabled={!onTap}
      aria-label={`Trækbunke, ${count} kort`}
    >
      <div className={`relative h-[100px] w-[72px] ${active ? "pulse-gold rounded-xl" : ""}`}>
        {count > 2 && (
          <div className="absolute inset-0 translate-x-[5px] translate-y-[4px] opacity-60">
            <CardBack />
          </div>
        )}
        {count > 1 && (
          <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2px] opacity-80">
            <CardBack />
          </div>
        )}
        {count > 0 ? (
          <motion.div
            className="absolute inset-0"
            whileTap={active ? { scale: 0.94 } : undefined}
          >
            <CardBack />
          </motion.div>
        ) : (
          <div className="absolute inset-0 rounded-xl border-2 border-dashed border-cream/15" />
        )}
      </div>
      <span className="mt-1.5 text-[11px] font-semibold text-cream/50">{count} kort</span>
    </button>
  );
}

export function DiscardPile({
  cards,
  takeable,
  onTake,
}: {
  cards: Card[];
  takeable?: boolean;
  onTake?: () => void;
}) {
  const top = cards.length > 0 ? cards[cards.length - 1]! : null;
  const under = cards.length > 1 ? cards[cards.length - 2]! : null;

  return (
    <button
      className="relative flex flex-col items-center"
      onClick={takeable ? onTake : undefined}
      disabled={!takeable}
      aria-label="Afkastbunke"
    >
      <div className="relative h-[100px] w-[72px]">
        <JumpRing size={132} />
        {under && (
          <div className="absolute inset-0 rotate-6 opacity-70">
            <PlayingCard card={under} className="w-[72px]" />
          </div>
        )}
        {top ? (
          <motion.div
            key={top.id}
            className="absolute inset-0"
            initial={{ scale: 1.18, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 18 }}
          >
            <PlayingCard card={top} className="w-[72px]" layoutCardId={top.id} />
          </motion.div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl border-2 border-dashed border-cream/15 text-[10px] text-cream/40">
            Afkast
          </div>
        )}
      </div>
      <span className="mt-1.5 text-[11px] font-semibold text-cream/50">
        {takeable ? "Tag toppen?" : "Afkast"}
      </span>
    </button>
  );
}
