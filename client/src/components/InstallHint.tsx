// One-time iOS Safari hint: Del → "Føj til hjemmeskærm".

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { hasSeenInstallHint, markInstallHintSeen } from "../store";

function isIosSafariBrowser(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !standalone;
}

export function InstallHint() {
  const [visible, setVisible] = useState(() => isIosSafariBrowser() && !hasSeenInstallHint());

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="glass fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+12px)] z-40 rounded-3xl p-4"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
        >
          <div className="flex items-start gap-3">
            <svg viewBox="0 0 40 40" className="mt-0.5 h-9 w-9 shrink-0">
              <rect x="6" y="4" width="28" height="32" rx="5" fill="none" stroke="#E8C57A" strokeWidth="2.5" />
              <path d="M20 24 V 10 M 15 14 L 20 9 L 25 14" fill="none" stroke="#E8C57A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flex-1 text-sm">
              <p className="font-bold text-gold-bright">Installér som app</p>
              <p className="text-cream/80">
                Tryk på <b>Del</b>-knappen i Safari og vælg <b>“Føj til hjemmeskærm”</b> — så
                spiller du i fuld skærm.
              </p>
            </div>
            <button
              className="text-cream/60"
              aria-label="Luk"
              onClick={() => {
                markInstallHintSeen();
                setVisible(false);
              }}
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
