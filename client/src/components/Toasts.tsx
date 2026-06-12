import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+8px)]">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: -24, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`glass max-w-[92vw] rounded-2xl px-4 py-2.5 text-sm font-medium shadow-lg ${
              t.kind === "error"
                ? "text-red-200"
                : t.kind === "success"
                  ? "text-emerald-200"
                  : "text-cream"
            }`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
