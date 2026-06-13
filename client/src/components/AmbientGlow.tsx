// A vibrant energy core behind the table — UNO-style: a pulsing glow with
// rotating light rays and a bright hot centre. Sits behind the 3D canvas and
// fills the screen with life. Respects reduced-motion.

import { motion, useReducedMotion } from "motion/react";

export function AmbientGlow({ active }: { active: boolean }) {
  const reduce = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* warm hot-centre glow */}
      <motion.div
        className="absolute left-1/2 top-1/2 h-[150vw] w-[150vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(255,225,150,0.22) 0%, rgba(232,197,122,0.18) 22%, rgba(62,142,90,0.16) 46%, rgba(11,31,22,0) 68%)",
        }}
        animate={
          reduce
            ? { opacity: 0.7 }
            : { opacity: active ? [0.7, 1, 0.7] : [0.45, 0.7, 0.45], scale: [1, 1.07, 1] }
        }
        transition={{ duration: active ? 2.4 : 4.5, ease: "easeInOut", repeat: Infinity }}
      />
      {/* rotating warm rays */}
      {!reduce && (
        <motion.div
          className="absolute left-1/2 top-1/2 h-[120vw] w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.12]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(232,197,122,0.9) 14deg, transparent 30deg, transparent 90deg, rgba(120,220,160,0.7) 104deg, transparent 120deg, transparent 180deg, rgba(232,197,122,0.85) 194deg, transparent 210deg, transparent 270deg, rgba(120,220,160,0.6) 284deg, transparent 300deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 22, ease: "linear", repeat: Infinity }}
        />
      )}
      {/* counter-rotating finer rays for shimmer */}
      {!reduce && (
        <motion.div
          className="absolute left-1/2 top-1/2 h-[95vw] w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.08]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(255,240,200,0.9) 6deg, transparent 16deg, transparent 60deg, rgba(255,240,200,0.8) 66deg, transparent 76deg, transparent 120deg, rgba(255,240,200,0.8) 126deg, transparent 136deg, transparent 180deg, rgba(255,240,200,0.8) 186deg, transparent 196deg, transparent 240deg, rgba(255,240,200,0.8) 246deg, transparent 256deg, transparent 300deg, rgba(255,240,200,0.8) 306deg, transparent 316deg)",
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 34, ease: "linear", repeat: Infinity }}
        />
      )}
    </div>
  );
}
