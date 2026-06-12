// Emoji reactions: a small expandable bar + floating emojis over the table.
// Pure fun, zero rule complexity.

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { REACTION_EMOJIS } from "@nu/shared";
import { useStore } from "../store";

export function ReactionBar() {
  const sendReaction = useStore((s) => s.sendReaction);
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] left-4 z-30 flex items-center gap-1.5">
      <motion.button
        className="glass flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-lg"
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Reaktioner"
      >
        {open ? "✕" : "😄"}
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="glass flex gap-0.5 rounded-full px-2 py-1.5 shadow-lg"
            initial={{ x: -16, opacity: 0, scale: 0.9 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: -16, opacity: 0, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
          >
            {REACTION_EMOJIS.map((e) => (
              <motion.button
                key={e}
                className="flex h-9 w-8 items-center justify-center text-xl"
                whileTap={{ scale: 1.5 }}
                onClick={() => {
                  sendReaction(e);
                  setOpen(false);
                }}
              >
                {e}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ReactionOverlay() {
  const reactions = useStore((s) => s.reactions);
  const game = useStore((s) => s.game);
  const room = useStore((s) => s.room);
  const reduce = useReducedMotion();

  const nameOf = (id: string) => {
    const p =
      game?.players.find((x) => x.id === id) ?? room?.players.find((x) => x.id === id);
    return p ? `${p.avatar} ${p.name}` : "";
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <AnimatePresence>
        {reactions.map((r) => {
          const x = 12 + ((r.id * 37) % 64); // deterministic pseudo-random lane
          return (
            <motion.div
              key={r.id}
              className="absolute bottom-40 flex flex-col items-center"
              style={{ left: `${x}%` }}
              initial={{ y: 30, opacity: 0, scale: 0.5 }}
              animate={
                reduce
                  ? { opacity: 1, scale: 1 }
                  : { y: -180, opacity: [0, 1, 1, 0], scale: [0.5, 1.3, 1, 1], rotate: [0, -8, 8, 0] }
              }
              exit={{ opacity: 0 }}
              transition={{ duration: 2.4, ease: "easeOut" }}
            >
              <span className="text-4xl drop-shadow-lg">{r.emoji}</span>
              <span className="glass mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold text-cream/90">
                {nameOf(r.playerId)}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
