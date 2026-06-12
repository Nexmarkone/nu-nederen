// Golden pulsing countdown ring around the discard pile while the
// jump-in window is open.

import { useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useStore } from "../store";

export function JumpRing({ size = 110 }: { size?: number }) {
  const deadline = useStore((s) => s.windowDeadline);
  const duration = useStore((s) => s.windowDuration);
  const circleRef = useRef<SVGCircleElement>(null);
  const reduce = useReducedMotion();

  const r = size / 2 - 5;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    if (!deadline) return;
    let raf = 0;
    const tick = () => {
      const el = circleRef.current;
      if (el) {
        const remaining = Math.max(0, deadline - Date.now());
        const frac = duration > 0 ? remaining / duration : 0;
        el.style.strokeDashoffset = String(circumference * (1 - frac));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [deadline, duration, circumference]);

  return (
    <AnimatePresence>
      {deadline && (
        <motion.div
          key="jumpring"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          initial={{ scale: reduce ? 1 : 1.25, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: reduce ? 1 : 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
        >
          <div
            className={`relative ${reduce ? "" : "pulse-gold"} rounded-full`}
            style={{ width: size, height: size }}
          >
            <svg width={size} height={size} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="rgba(232,197,122,0.25)"
                strokeWidth="5"
              />
              <circle
                ref={circleRef}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke="#E8C57A"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={0}
              />
            </svg>
            <div className="absolute inset-x-0 -bottom-7 text-center text-xs font-bold tracking-wide text-gold-bright">
              JUMP!
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
