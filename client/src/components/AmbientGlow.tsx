// A slow breathing energy glow in the centre of the table — gives the felt
// that "alive" UNO feel without any heavy 3D. Respects reduced-motion.

import { motion, useReducedMotion } from "motion/react";

export function AmbientGlow({ active }: { active: boolean }) {
  const reduce = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <motion.div
        className="absolute left-1/2 top-1/2 h-[120vw] w-[120vw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(232,197,122,0.16) 0%, rgba(62,142,90,0.10) 35%, rgba(11,31,22,0) 65%)",
        }}
        animate={
          reduce
            ? { opacity: 0.6 }
            : { opacity: active ? [0.55, 0.9, 0.55] : [0.3, 0.5, 0.3], scale: [1, 1.08, 1] }
        }
        transition={{ duration: active ? 3.2 : 5, ease: "easeInOut", repeat: Infinity }}
      />
      {/* Faint rotating rays for energy */}
      {!reduce && (
        <motion.div
          className="absolute left-1/2 top-1/2 h-[90vw] w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.06]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgba(232,197,122,0.6) 20deg, transparent 40deg, transparent 180deg, rgba(232,197,122,0.5) 200deg, transparent 220deg)",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        />
      )}
    </div>
  );
}
