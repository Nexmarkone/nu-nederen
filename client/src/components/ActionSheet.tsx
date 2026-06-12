// Bottom sheet shown while you hold a drawn card: swap it into your grid or
// discard it (optionally activating a 10/J ability).

import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";
import { PlayingCard } from "./PlayingCard";

export function ActionSheet() {
  const game = useStore((s) => s.game);
  const playerId = useStore((s) => s.playerId);
  const drawnCard = useStore((s) => s.drawnCard);
  const swapSelecting = useStore((s) => s.swapSelecting);
  const setSwapSelecting = useStore((s) => s.setSwapSelecting);
  const act = useStore((s) => s.act);

  const myTurn =
    game?.phase === "playing" && game.players[game.currentPlayerIndex]?.id === playerId;
  const deciding = myTurn && game.turnStage === "decide" && drawnCard !== null;
  const open = !!deciding && !swapSelecting;

  const ability =
    drawnCard?.rank === "10" ? "Kig 👁" : drawnCard?.rank === "J" ? "Byt rundt 🔀" : null;

  return (
    <AnimatePresence>
      {open && drawnCard && (
        <motion.div
          key="actionsheet"
          className="glass fixed inset-x-2 bottom-2 z-30 mx-auto max-w-md rounded-3xl p-4 pb-[calc(env(safe-area-inset-bottom)+12px)] shadow-2xl"
          initial={{ y: 220, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 220, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
        >
          <div className="flex items-center gap-4">
            <PlayingCard
              card={drawnCard}
              className="w-20 shrink-0"
              layoutCardId={drawnCard.id}
              shadow
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-sm font-semibold text-cream/85">Du trak et kort. Hvad nu?</p>
              <button
                className="rounded-2xl bg-gold py-3 text-sm font-extrabold text-ink active:scale-[0.98]"
                onClick={() => setSwapSelecting(true)}
              >
                Byt ind — vælg en plads
              </button>
              {ability ? (
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-2xl bg-felt-700 py-3 text-sm font-bold text-cream active:scale-[0.98]"
                    onClick={() => act({ type: "discardDrawn", useAbility: false })}
                  >
                    Smid
                  </button>
                  <button
                    className="flex-1 rounded-2xl border border-gold/60 bg-felt-700 py-3 text-sm font-bold text-gold-bright active:scale-[0.98]"
                    onClick={() => act({ type: "discardDrawn", useAbility: true })}
                  >
                    Smid + {ability}
                  </button>
                </div>
              ) : (
                <button
                  className="rounded-2xl bg-felt-700 py-3 text-sm font-bold text-cream active:scale-[0.98]"
                  onClick={() => act({ type: "discardDrawn", useAbility: false })}
                >
                  Smid på bunken
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
      {deciding && swapSelecting && (
        <motion.div
          key="swaphint"
          className="glass fixed inset-x-10 bottom-3 z-30 flex items-center justify-between rounded-2xl px-4 py-3"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
        >
          <span className="text-sm font-semibold">Tap en plads i dit grid 👇</span>
          <button
            className="text-sm font-bold text-gold-bright"
            onClick={() => setSwapSelecting(false)}
          >
            Fortryd
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
