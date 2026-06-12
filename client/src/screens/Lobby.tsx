// Lobby: HUGE room code, share link + QR, player chips popping in, bot
// management and house rules (host only).

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import {
  type BotDifficulty,
  type HouseRules,
} from "@nu/shared";
import { useStore } from "../store";
import { ChatPanel } from "../components/ChatPanel";

const DIFF_LABEL: Record<BotDifficulty, string> = {
  easy: "🟢 Let",
  medium: "🟡 Mellem",
  hard: "🔴 MPC",
};

function RuleSelect<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <span className="text-sm font-semibold text-cream/85">{label}</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={String(o.value)}
            disabled={disabled}
            className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition ${
              o.value === value
                ? "bg-gold text-ink"
                : "bg-felt-900/60 text-cream/70 disabled:opacity-60"
            }`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Lobby() {
  const room = useStore((s) => s.room);
  const playerId = useStore((s) => s.playerId);
  const roomCode = useStore((s) => s.roomCode);
  const addBot = useStore((s) => s.addBot);
  const removeBot = useStore((s) => s.removeBot);
  const kickPlayer = useStore((s) => s.kickPlayer);
  const updateRules = useStore((s) => s.updateRules);
  const startGame = useStore((s) => s.startGame);
  const leaveRoom = useStore((s) => s.leaveRoom);
  const toast = useStore((s) => s.toast);

  const [qr, setQr] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const shareUrl = `${location.origin}/?rum=${roomCode ?? ""}`;
  const isHost = room?.hostId === playerId;

  useEffect(() => {
    if (!roomCode) return;
    QRCode.toDataURL(shareUrl, {
      width: 220,
      margin: 1,
      color: { dark: "#F5EFDC", light: "#00000000" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [shareUrl, roomCode]);

  if (!room || !roomCode) return null;

  const share = async () => {
    const text = `Spil Nu Nederen med mig! 🥖 Koden er ${roomCode}: ${shareUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Nu Nederen", text, url: shareUrl });
        return;
      } catch {
        // user cancelled — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Link kopieret! 📋", "success");
    } catch {
      toast(shareUrl);
    }
  };

  const setRule = <K extends keyof HouseRules>(key: K, value: HouseRules[K]) => {
    updateRules({ ...room.rules, [key]: value });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+20px)]">
      <header className="flex w-full max-w-md items-center justify-between">
        <button className="text-sm font-bold text-cream/60" onClick={leaveRoom}>
          ‹ Forlad
        </button>
        <span className="text-xs font-semibold text-cream/50">
          {room.players.length}/6 spillere
        </span>
      </header>

      {/* The code — KÆMPESTOR */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 18 }}
        className="mt-5 flex flex-col items-center"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-cream/50">Rumkode</span>
        <div className="font-display text-7xl font-black tracking-[0.18em] text-gold-bright drop-shadow-[0_0_22px_rgba(232,197,122,0.35)]">
          {roomCode}
        </div>
      </motion.div>

      <div className="mt-3 flex items-center gap-2.5">
        <button
          className="rounded-2xl bg-gold px-5 py-2.5 text-sm font-extrabold text-ink active:scale-[0.97]"
          onClick={share}
        >
          Del link 📤
        </button>
        <a
          className="rounded-2xl bg-bonus-green px-4 py-2.5 text-sm font-extrabold text-cream active:scale-[0.97]"
          href={`sms:?&body=${encodeURIComponent(`Spil Nu Nederen med mig! 🥖 Koden er ${roomCode}: ${shareUrl}`)}`}
        >
          SMS 💬
        </a>
        {qr && (
          <details className="group">
            <summary className="cursor-pointer list-none rounded-2xl bg-felt-700 px-4 py-2.5 text-sm font-bold text-cream group-open:bg-felt-900">
              QR-kode
            </summary>
            <div className="glass absolute left-1/2 z-20 mt-2 -translate-x-1/2 rounded-3xl p-4">
              <img src={qr} alt={`QR-kode til rum ${roomCode}`} className="h-44 w-44" />
            </div>
          </details>
        )}
      </div>

      {/* Players */}
      <div className="mt-6 flex w-full max-w-md flex-wrap justify-center gap-2">
        <AnimatePresence>
          {room.players.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 22 }}
              className={`glass flex items-center gap-2 rounded-2xl px-3 py-2 ${
                p.connected ? "" : "opacity-50"
              }`}
            >
              <span className="text-lg">{p.avatar}</span>
              <span className="text-sm font-bold">{p.name}</span>
              {p.id === room.hostId && (
                <span className="rounded-full bg-gold/25 px-1.5 py-0.5 text-[9px] font-black text-gold-bright">
                  VÆRT
                </span>
              )}
              {p.isBot && p.botDifficulty && (
                <span className="text-[10px] text-cream/60">{DIFF_LABEL[p.botDifficulty]}</span>
              )}
              {isHost && p.id !== playerId && (
                <button
                  className="ml-0.5 text-cream/50"
                  aria-label={`Fjern ${p.name}`}
                  onClick={() => (p.isBot ? removeBot(p.id) : kickPlayer(p.id))}
                >
                  ✕
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Add bots */}
      {isHost && room.players.length < 6 && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-semibold text-cream/60">+ Tilføj bot:</span>
          {(["easy", "medium", "hard"] as const).map((d) => (
            <button
              key={d}
              className="rounded-xl bg-felt-700 px-3 py-2 text-xs font-bold active:scale-95"
              onClick={() => addBot(d)}
            >
              {DIFF_LABEL[d]}
            </button>
          ))}
        </div>
      )}

      {/* House rules */}
      <div className="glass mt-6 w-full max-w-md rounded-3xl px-4 py-2">
        <button
          className="flex w-full items-center justify-between py-2"
          onClick={() => setRulesOpen((o) => !o)}
        >
          <span className="text-sm font-extrabold text-gold-bright">⚙️ Husregler</span>
          <motion.span animate={{ rotate: rulesOpen ? 90 : 0 }} className="text-cream/50">
            ›
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {rulesOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="divide-y divide-cream/10 pb-2">
                <RuleSelect
                  label="Spil til"
                  value={room.rules.targetScore}
                  options={[
                    { value: 50 as const, label: "50" },
                    { value: 75 as const, label: "75" },
                    { value: 100 as const, label: "100" },
                  ]}
                  onChange={(v) => setRule("targetScore", v)}
                  disabled={!isHost}
                />
                <RuleSelect
                  label="Memorize-tid"
                  value={room.rules.memorizeSeconds}
                  options={[
                    { value: 5 as const, label: "5 s" },
                    { value: 10 as const, label: "10 s" },
                    { value: 15 as const, label: "15 s" },
                  ]}
                  onChange={(v) => setRule("memorizeSeconds", v)}
                  disabled={!isHost}
                />
                <RuleSelect
                  label="Jump-vindue"
                  value={room.rules.jumpInWindowSeconds}
                  options={[
                    { value: 3 as const, label: "3 s" },
                    { value: 5 as const, label: "5 s" },
                    { value: 8 as const, label: "8 s" },
                  ]}
                  onChange={(v) => setRule("jumpInWindowSeconds", v)}
                  disabled={!isHost}
                />
                <RuleSelect
                  label="Straf ved fejl-jump"
                  value={room.rules.jumpInPenalty}
                  options={[
                    { value: "card" as const, label: "Strafkort" },
                    { value: "points5" as const, label: "+5 point" },
                  ]}
                  onChange={(v) => setRule("jumpInPenalty", v)}
                  disabled={!isHost}
                />
                <RuleSelect
                  label="Turtimer"
                  value={room.rules.turnTimerSeconds}
                  options={[
                    { value: 0 as const, label: "Fra" },
                    { value: 30 as const, label: "30 s" },
                    { value: 60 as const, label: "60 s" },
                  ]}
                  onChange={(v) => setRule("turnTimerSeconds", v)}
                  disabled={!isHost}
                />
                <RuleSelect
                  label="Træk fra afkast"
                  value={room.rules.allowDrawFromDiscard}
                  options={[
                    { value: false as const, label: "Nej" },
                    { value: true as const, label: "Ja" },
                  ]}
                  onChange={(v) => setRule("allowDrawFromDiscard", v)}
                  disabled={!isHost}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-auto w-full max-w-md pt-6">
        {isHost ? (
          <button
            className="w-full rounded-2xl bg-gradient-to-b from-gold-bright to-gold py-4 font-display text-xl font-black text-ink shadow-xl active:scale-[0.98] disabled:opacity-40"
            disabled={room.players.length < 2}
            onClick={startGame}
          >
            {room.players.length < 2 ? "Venter på spillere…" : "START SPILLET 🃏"}
          </button>
        ) : (
          <p className="animate-pulse text-center text-sm font-semibold text-cream/60">
            Venter på at værten starter…
          </p>
        )}
      </div>

      <ChatPanel corner="right" />
    </div>
  );
}
