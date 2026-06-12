// Push-to-talk button: hold to record a voice clip, release to send it to
// everyone in the room. Stays inside the game — no leaving for FaceTime.

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useStore } from "../store";
import {
  MAX_VOICE_MS,
  isRecording,
  startRecording,
  stopRecording,
  voiceSupported,
} from "../voice";

type State = "idle" | "starting" | "recording";

export function WalkieTalkie() {
  const sendVoice = useStore((s) => s.sendVoice);
  const toast = useStore((s) => s.toast);
  const [state, setState] = useState<State>("idle");
  const [elapsed, setElapsed] = useState(0);
  // If the user releases before the mic finishes opening, stop as soon as it does.
  const wantStopRef = useRef(false);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported = voiceSupported();

  useEffect(() => {
    return () => {
      if (autoStopRef.current) clearTimeout(autoStopRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const finishAndSend = async () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setState("idle");
    setElapsed(0);
    const clip = await stopRecording();
    if (clip) {
      sendVoice(clip.data, clip.mime);
    }
  };

  const begin = async () => {
    if (!supported) {
      toast("Din browser understøtter ikke mikrofon her 🎙️", "error");
      return;
    }
    if (state !== "idle") return;
    setState("starting");
    wantStopRef.current = false;
    const res = await startRecording();
    if (res !== "ok") {
      setState("idle");
      toast(
        res === "denied"
          ? "Giv adgang til mikrofonen for at tale 🎙️"
          : "Mikrofon virker ikke her 🎙️",
        "error",
      );
      return;
    }
    if (wantStopRef.current) {
      // Released during startup — send whatever tiny clip we got.
      void finishAndSend();
      return;
    }
    setState("recording");
    const started = Date.now();
    tickRef.current = setInterval(() => setElapsed(Date.now() - started), 100);
    autoStopRef.current = setTimeout(() => {
      if (isRecording()) void finishAndSend();
    }, MAX_VOICE_MS);
  };

  const end = () => {
    if (state === "starting") {
      wantStopRef.current = true;
      return;
    }
    if (state === "recording") {
      void finishAndSend();
    }
  };

  const active = state === "recording" || state === "starting";
  const seconds = Math.floor(elapsed / 1000);

  return (
    <>
      <motion.button
        className={`glass fixed bottom-[calc(env(safe-area-inset-bottom)+88px)] right-[88px] z-30 flex h-16 w-16 items-center justify-center rounded-full shadow-xl ${
          active ? "bg-signal-red/90" : ""
        } ${active ? "pulse-gold" : ""}`}
        onPointerDown={(e) => {
          e.preventDefault();
          void begin();
        }}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        onContextMenu={(e) => e.preventDefault()}
        whileTap={{ scale: 0.92 }}
        aria-label="Hold inde for at tale (walkie-talkie)"
      >
        <span className="text-2xl">{active ? "🔴" : "🎙️"}</span>
      </motion.button>

      {active && (
        <motion.div
          className="glass pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+160px)] left-1/2 z-40 -translate-x-1/2 rounded-2xl px-4 py-2 text-center"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
        >
          <p className="text-sm font-bold text-red-200">
            🎙️ Taler… {seconds}s
          </p>
          <p className="text-[11px] text-cream/60">slip for at sende</p>
        </motion.div>
      )}
    </>
  );
}
