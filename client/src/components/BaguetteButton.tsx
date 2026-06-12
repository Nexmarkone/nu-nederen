// The big gold Baguette button: long-press 700 ms with a filling ring to
// confirm — prevents accidental calls. Fixed bottom-right in the game.

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { BAGUETTE_HOLD_MS } from "@nu/shared";
import { useStore } from "../store";

export function BaguetteButton() {
  const game = useStore((s) => s.game);
  const playerId = useStore((s) => s.playerId);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);

  const [progress, setProgress] = useState(0);
  const holdRef = useRef<{ raf: number; start: number } | null>(null);

  if (!game || game.phase !== "playing") return null;

  const me = game.players[game.currentPlayerIndex];
  const myTurn = me?.id === playerId;
  const allowedStage = game.turnStage === "window" || game.turnStage === "ability";
  const available = myTurn && allowedStage && game.baguette.callerId === null;
  const visible = game.baguette.callerId === null;
  if (!visible) return null;

  const cancel = () => {
    if (holdRef.current) {
      cancelAnimationFrame(holdRef.current.raf);
      holdRef.current = null;
    }
    setProgress(0);
  };

  const start = () => {
    if (!available) {
      toast("Baguette kaldes som det allersidste i din egen tur 🥖");
      return;
    }
    const startTime = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - startTime) / BAGUETTE_HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        holdRef.current = null;
        setProgress(0);
        act({ type: "baguette" });
        return;
      }
      holdRef.current = { raf: requestAnimationFrame(tick), start: startTime };
    };
    holdRef.current = { raf: requestAnimationFrame(tick), start: startTime };
  };

  const size = 64;
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;

  return (
    <motion.button
      className={`fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] right-4 z-30 flex h-16 w-16 items-center justify-center rounded-full border-2 shadow-xl ${
        available
          ? "border-gold-bright bg-gradient-to-b from-gold-bright to-gold"
          : "border-cream/20 bg-felt-800/80 opacity-60"
      }`}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      whileTap={{ scale: 0.92 }}
      aria-label="Kald Baguette (hold knappen inde)"
    >
      <span className="text-2xl">🥖</span>
      {progress > 0 && (
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#0B1F16"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - progress)}
          />
        </svg>
      )}
    </motion.button>
  );
}
