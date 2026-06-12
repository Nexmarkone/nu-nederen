// Text chat: floating button with unread badge + a glass sheet with the
// conversation. Works in both the lobby and mid-game.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";

export function ChatPanel({ corner = "left" }: { corner?: "left" | "right" }) {
  const chatMessages = useStore((s) => s.chatMessages);
  const chatSeen = useStore((s) => s.chatSeen);
  const markChatSeen = useStore((s) => s.markChatSeen);
  const sendChat = useStore((s) => s.sendChat);
  const playerId = useStore((s) => s.playerId);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const unread = Math.max(0, chatMessages.length - chatSeen);

  useEffect(() => {
    if (open) {
      markChatSeen();
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    }
  }, [open, chatMessages.length, markChatSeen]);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    sendChat(t.slice(0, 200));
    setText("");
  };

  const pos = corner === "left" ? "left-4" : "right-4";

  return (
    <>
      <motion.button
        className={`glass fixed bottom-[calc(env(safe-area-inset-bottom)+140px)] ${pos} z-30 flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-lg`}
        whileTap={{ scale: 0.9 }}
        onClick={() => setOpen((o) => !o)}
        aria-label="Chat"
      >
        💬
        {unread > 0 && !open && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-signal-red px-1 text-[10px] font-black text-cream">
            {unread}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="chatsheet"
            className="glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+196px)] z-30 mx-auto flex max-h-[45dvh] w-auto max-w-md flex-col rounded-3xl p-3 shadow-2xl"
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <div ref={listRef} className="flex-1 space-y-1.5 overflow-y-auto pb-2">
              {chatMessages.length === 0 && (
                <p className="py-4 text-center text-xs text-cream/45">
                  Ingen beskeder endnu — sig hej! 👋
                </p>
              )}
              {chatMessages.map((m) => (
                <div
                  key={m.ts + m.playerId}
                  className={`flex ${m.playerId === playerId ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${
                      m.playerId === playerId
                        ? "bg-gold/85 text-ink"
                        : "bg-felt-700 text-cream"
                    }`}
                  >
                    {m.playerId !== playerId && (
                      <span className="mr-1 text-[11px] font-bold opacity-75">
                        {m.avatar} {m.name}:
                      </span>
                    )}
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 pt-1">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="Skriv en besked…"
                enterKeyHint="send"
                maxLength={200}
                className="min-w-0 flex-1 rounded-2xl border border-cream/20 bg-felt-900/70 px-3 py-2.5 text-sm text-cream outline-none placeholder:text-cream/30 focus:border-gold"
              />
              <button
                className="rounded-2xl bg-gold px-4 text-sm font-extrabold text-ink disabled:opacity-40"
                disabled={text.trim() === ""}
                onClick={submit}
              >
                ➤
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
