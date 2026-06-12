// Home: logo, name/avatar, play buttons and code entry.

import { useState } from "react";
import { motion } from "motion/react";
import { useStore } from "../store";
import { InstallHint } from "../components/InstallHint";
import { Logo } from "../components/Logo";

const AVATARS = ["🦊", "🐻", "🐸", "🦁", "🐼", "🐙", "🦄", "🐷", "🐤", "😎", "👻", "🤠"];

export function Home() {
  const name = useStore((s) => s.name);
  const avatar = useStore((s) => s.avatar);
  const setName = useStore((s) => s.setName);
  const setAvatar = useStore((s) => s.setAvatar);
  const createRoom = useStore((s) => s.createRoom);
  const joinRoom = useStore((s) => s.joinRoom);
  const joinCodeInput = useStore((s) => s.joinCodeInput);
  const setJoinCodeInput = useStore((s) => s.setJoinCodeInput);
  const joining = useStore((s) => s.joining);
  const goto = useStore((s) => s.goto);
  const toast = useStore((s) => s.toast);
  const conn = useStore((s) => s.conn);

  const [nameOpen, setNameOpen] = useState(name === "");

  const requireName = (): boolean => {
    if (name.trim() === "") {
      setNameOpen(true);
      toast("Skriv dit navn først 👇");
      return false;
    }
    return true;
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="flex flex-col items-center"
      >
        <Logo className="w-44" />
        <h1 className="mt-1 font-display text-4xl font-black tracking-tight text-cream">
          Nu Nederen
        </h1>
        <p className="mt-1 text-sm font-semibold text-gold-bright">Først til 50 taber 🥖</p>
      </motion.div>

      {/* Name + avatar */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.08, type: "spring", stiffness: 220, damping: 22 }}
        className="glass mt-8 w-full max-w-sm rounded-3xl p-4"
      >
        {nameOpen ? (
          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold uppercase tracking-widest text-gold">
              Hvad hedder du?
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              placeholder="Dit navn"
              autoFocus
              enterKeyHint="done"
              onKeyDown={(e) => e.key === "Enter" && name.trim() && setNameOpen(false)}
              className="rounded-2xl border border-cream/20 bg-felt-900/70 px-4 py-3 text-base font-semibold text-cream outline-none placeholder:text-cream/30 focus:border-gold"
            />
            <div className="grid grid-cols-6 gap-1.5">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  className={`flex h-11 items-center justify-center rounded-xl text-xl transition ${
                    avatar === a ? "bg-gold/30 ring-2 ring-gold" : "bg-felt-900/50"
                  }`}
                  onClick={() => setAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
            <button
              className="rounded-2xl bg-gold py-3 font-bold text-ink disabled:opacity-40"
              disabled={name.trim() === ""}
              onClick={() => setNameOpen(false)}
            >
              Klar!
            </button>
          </div>
        ) : (
          <button
            className="flex w-full items-center justify-between"
            onClick={() => setNameOpen(true)}
          >
            <span className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-felt-700 text-xl">
                {avatar}
              </span>
              <span className="font-bold">{name}</span>
            </span>
            <span className="text-xs font-semibold text-cream/50">Ret ›</span>
          </button>
        )}
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.16, type: "spring", stiffness: 220, damping: 22 }}
        className="mt-4 flex w-full max-w-sm flex-col gap-2.5"
      >
        <button
          className="rounded-2xl bg-gradient-to-b from-gold-bright to-gold py-4 font-display text-lg font-extrabold text-ink shadow-lg active:scale-[0.98] disabled:opacity-50"
          disabled={joining}
          onClick={() => requireName() && createRoom(false)}
        >
          🎉 Spil med venner
        </button>
        <button
          className="rounded-2xl bg-felt-700 py-4 font-display text-lg font-extrabold text-cream shadow active:scale-[0.98] disabled:opacity-50"
          disabled={joining}
          onClick={() => requireName() && createRoom(true)}
        >
          🤖 Spil mod computeren
        </button>

        <div className="mt-1 flex gap-2">
          <input
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value)}
            placeholder="RUMKODE"
            autoCapitalize="characters"
            autoCorrect="off"
            enterKeyHint="go"
            onKeyDown={(e) =>
              e.key === "Enter" &&
              joinCodeInput.length === 4 &&
              requireName() &&
              joinRoom(joinCodeInput)
            }
            className="min-w-0 flex-1 rounded-2xl border border-cream/20 bg-felt-900/70 px-4 py-3 text-center font-display text-lg font-extrabold tracking-[0.35em] text-gold-bright outline-none placeholder:tracking-normal placeholder:text-cream/30 focus:border-gold"
          />
          <button
            className="rounded-2xl bg-felt-700 px-5 font-bold text-cream disabled:opacity-40"
            disabled={joinCodeInput.length !== 4 || joining}
            onClick={() => requireName() && joinRoom(joinCodeInput)}
          >
            Join
          </button>
        </div>

        <button
          className="mt-1 py-2 text-sm font-semibold text-cream/60 underline-offset-4 active:underline"
          onClick={() => goto("rules")}
        >
          📖 Sådan spiller man
        </button>
      </motion.div>

      <div className="mt-auto pt-6 text-[11px] text-cream/35">
        {conn === "open" ? "✓ forbundet til serveren" : "forbinder til serveren…"}
      </div>

      <InstallHint />
    </div>
  );
}
