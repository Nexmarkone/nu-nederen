// The game table (portrait): opponents in an arc up top, piles in the middle,
// your big 2x2 grid in the thumb zone, action sheet, jump ring, baguette
// button and all phase overlays.

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import type { GridRef } from "@nu/shared";
import { useStore } from "../store";
import { ActionSheet } from "../components/ActionSheet";
import { AmbientGlow } from "../components/AmbientGlow";
import { BaguetteButton } from "../components/BaguetteButton";
import { CardGrid } from "../components/CardGrid";
import { ChatPanel } from "../components/ChatPanel";
import { GameOverOverlay } from "../components/GameOverOverlay";
import { OpponentSeat } from "../components/OpponentSeat";
import { DiscardPile, DrawPile } from "../components/Piles";
import { ReactionBar, ReactionOverlay } from "../components/Reactions";
import { RevealOverlay } from "../components/RevealOverlay";

function Countdown({ deadline, totalMs }: { deadline: number; totalMs: number }) {
  const [, force] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(iv);
  }, []);
  const remaining = Math.max(0, deadline - Date.now());
  const frac = totalMs > 0 ? remaining / totalMs : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-felt-900/70">
      <div
        className="h-full rounded-full bg-gold-bright transition-[width] duration-200 ease-linear"
        style={{ width: `${frac * 100}%` }}
      />
    </div>
  );
}

export function Game() {
  const game = useStore((s) => s.game);
  const playerId = useStore((s) => s.playerId);
  const roomCode = useStore((s) => s.roomCode);
  const conn = useStore((s) => s.conn);
  const muted = useStore((s) => s.muted);
  const toggleMute = useStore((s) => s.toggleMute);
  const music = useStore((s) => s.music);
  const toggleMusic = useStore((s) => s.toggleMusic);
  const leaveRoom = useStore((s) => s.leaveRoom);
  const act = useStore((s) => s.act);
  const toast = useStore((s) => s.toast);
  const swapSelecting = useStore((s) => s.swapSelecting);
  const setSwapSelecting = useStore((s) => s.setSwapSelecting);
  const abilityFirstPick = useStore((s) => s.abilityFirstPick);
  const setAbilityFirstPick = useStore((s) => s.setAbilityFirstPick);
  const memorizeDeadline = useStore((s) => s.memorizeDeadline);
  const windowDeadline = useStore((s) => s.windowDeadline);
  const turnDeadline = useStore((s) => s.turnDeadline);
  const turnDuration = useStore((s) => s.turnDuration);
  const banner = useStore((s) => s.banner);
  const shake = useStore((s) => s.shake);
  const reduce = useReducedMotion();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const shakeControls = useAnimationControls();

  // Screen shake on jump-in slams (6 px, spec 8.1).
  useEffect(() => {
    if (shake > 0 && !reduce) {
      void shakeControls.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.4 } });
    }
  }, [shake, reduce, shakeControls]);

  if (!game || !playerId) return null;

  const meIndex = game.players.findIndex((p) => p.id === playerId);
  const me = meIndex >= 0 ? game.players[meIndex]! : null;
  const current = game.players[game.currentPlayerIndex]!;
  const myTurn = current.id === playerId && game.phase === "playing";
  const lastLap = game.baguette.callerId !== null;
  const windowOpen = game.jumpWindow.open && windowDeadline !== null;

  // Opponents clockwise starting after me.
  const opponents = me
    ? Array.from(
        { length: game.players.length - 1 },
        (_, i) => game.players[(meIndex + 1 + i) % game.players.length]!,
      )
    : game.players;

  const abilityTargeting = myTurn && game.turnStage === "ability" && game.pendingAbility !== null;

  const onCardTap = (ref: GridRef) => {
    const mine = ref.playerId === playerId;

    if (abilityTargeting) {
      if (game.pendingAbility === "peek") {
        act({ type: "abilityPeek", target: ref });
      } else if (game.pendingAbility === "swap") {
        if (!abilityFirstPick) {
          setAbilityFirstPick(ref);
        } else if (
          abilityFirstPick.playerId === ref.playerId &&
          abilityFirstPick.gridIndex === ref.gridIndex
        ) {
          setAbilityFirstPick(null);
        } else {
          act({ type: "abilitySwap", a: abilityFirstPick, b: ref });
          setAbilityFirstPick(null);
        }
      }
      return;
    }

    if (mine && swapSelecting && myTurn && game.turnStage === "decide") {
      act({ type: "swapInto", gridIndex: ref.gridIndex });
      setSwapSelecting(false);
      return;
    }

    if (mine && windowOpen) {
      act({ type: "jumpIn", gridIndex: ref.gridIndex, windowId: game.jumpWindow.id });
      return;
    }

    if (mine && game.phase === "playing" && !myTurn) {
      toast("Du kan kun tappe dine kort i et jump-vindue ⚡");
    }
  };

  const statusText = (() => {
    if (game.phase === "memorize") return "Husk dine 2 nederste kort!";
    if (game.phase !== "playing") return "";
    if (myTurn) {
      switch (game.turnStage) {
        case "draw":
          return "Din tur — træk et kort fra bunken";
        case "decide":
          return swapSelecting ? "Vælg en plads i dit grid" : "Byt ind eller smid";
        case "ability":
          return game.pendingAbility === "peek"
            ? "Kig 👁 — vælg ét kort på bordet"
            : abilityFirstPick
              ? "Byt rundt 🔀 — vælg det andet kort"
              : "Byt rundt 🔀 — vælg to kort på bordet";
        case "window":
          return "Jump-vindue åbent — alle kan jumpe!";
      }
    }
    return `${current.avatar} ${current.name} ${game.turnStage === "window" ? "— jump-vindue!" : "tænker…"}`;
  })();

  return (
    <motion.div
      animate={shakeControls}
      className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-3 pb-2 pt-[calc(env(safe-area-inset-top)+6px)]"
    >
      <AmbientGlow active={game.phase === "playing" && (windowOpen || myTurn)} />

      {/* Header */}
      <header className="z-10 flex items-center justify-between gap-2 py-1">
        <div className="flex items-center gap-2">
          <span className="glass rounded-xl px-2.5 py-1 font-display text-sm font-extrabold tracking-[0.2em] text-gold-bright">
            {roomCode}
          </span>
          <span className="text-xs font-semibold text-cream/60">Runde {game.roundNumber}</span>
          {lastLap && (
            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold-bright">
              🥖 Sidste omgang
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {conn !== "open" && (
            <span className="animate-pulse rounded-full bg-signal-red/30 px-2 py-0.5 text-[10px] font-bold text-red-200">
              forbinder…
            </span>
          )}
          <button
            className={`glass flex h-9 w-9 items-center justify-center rounded-xl text-base ${
              music ? "ring-1 ring-gold-bright" : ""
            }`}
            onClick={toggleMusic}
            aria-label={music ? "Slå musik fra" : "Slå musik til"}
          >
            {music ? "🎵" : "🎶"}
          </button>
          <button
            className="glass flex h-9 w-9 items-center justify-center rounded-xl text-base"
            onClick={toggleMute}
            aria-label={muted ? "Slå lyd til" : "Slå lyd fra"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <button
            className="glass flex h-9 w-9 items-center justify-center rounded-xl text-base"
            onClick={() => setConfirmLeave(true)}
            aria-label="Forlad spillet"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Opponents */}
      <div className="z-10 mt-1 flex items-start justify-center gap-1">
        {opponents.map((p) => (
          <OpponentSeat
            key={p.id}
            player={p}
            isCurrent={game.phase === "playing" && current.id === p.id}
            isDealer={game.players[game.dealerIndex]?.id === p.id}
            isCaller={game.baguette.callerId === p.id}
            onCardTap={abilityTargeting ? onCardTap : undefined}
            targetable={abilityTargeting}
            selectedRef={abilityFirstPick}
          />
        ))}
      </div>

      {/* Piles — on a softly tilted 3D table plane */}
      <div className="z-10 my-auto py-3" style={{ perspective: 900 }}>
        <div
          className="relative flex items-center justify-center gap-10"
          style={{ transform: reduce ? undefined : "rotateX(16deg)", transformStyle: "preserve-3d" }}
        >
          <div className="absolute inset-x-8 -bottom-4 h-7 rounded-[50%] bg-black/35 blur-lg" />
          <DrawPile
            count={game.drawCount}
            active={myTurn && game.turnStage === "draw"}
            onTap={myTurn && game.turnStage === "draw" ? () => act({ type: "draw" }) : undefined}
          />
          <DiscardPile
            cards={game.discardPile}
            takeable={
              myTurn &&
              game.turnStage === "draw" &&
              game.rules.allowDrawFromDiscard &&
              game.discardPile.length > 0
            }
            onTake={() => act({ type: "draw", from: "discard" })}
          />
        </div>
      </div>

      {/* Status line */}
      <div className="z-10 flex min-h-9 flex-col items-center justify-center gap-1 pb-1.5">
        <p className="text-center text-[13px] font-semibold text-cream/85">{statusText}</p>
        {abilityTargeting && (
          <button
            className="rounded-full border border-cream/25 px-3 py-1 text-xs font-bold text-cream/70"
            onClick={() => act({ type: "skipAbility" })}
          >
            Spring evnen over
          </button>
        )}
        {myTurn && turnDeadline && game.turnStage !== "window" && (
          <div className="w-40">
            <Countdown deadline={turnDeadline} totalMs={turnDuration * 1000} />
          </div>
        )}
      </div>

      {/* Own area */}
      {me && (
        <div className="z-10 flex flex-col items-center gap-2 pb-[env(safe-area-inset-bottom)]">
          <CardGrid
            player={me}
            cardClass="w-[74px]"
            onCardTap={onCardTap}
            targetable={abilityTargeting || (swapSelecting && myTurn)}
            jumpable={!!windowOpen}
            selectedRef={abilityFirstPick}
            shadow
          />
          <div className="flex items-center gap-2.5">
            <div className="relative">
              {game.phase === "playing" && current.id === playerId && (
                <motion.div
                  layoutId="turn-ring"
                  className="absolute -inset-1 rounded-full border-[2.5px] border-gold-bright"
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                />
              )}
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-felt-700 text-lg">
                {me.avatar}
              </div>
              {game.baguette.callerId === me.id && (
                <span className="absolute -left-2 -top-1 text-xs">🥖</span>
              )}
            </div>
            <span className="text-sm font-bold">{me.name}</span>
            <span className="rounded-full bg-felt-900/70 px-2.5 py-1 text-xs font-extrabold text-gold-bright tabular-nums">
              {me.totalScore} pt
            </span>
            {game.players[game.dealerIndex]?.id === me.id && (
              <span className="rounded-full bg-cream px-1.5 text-[10px] font-black text-ink">
                DEALER
              </span>
            )}
          </div>
        </div>
      )}

      <ActionSheet />
      <BaguetteButton />
      <ReactionBar />
      <ChatPanel />
      <ReactionOverlay />

      {/* Memorize overlay (non-blocking banner + countdown) */}
      <AnimatePresence>
        {game.phase === "memorize" && memorizeDeadline && (
          <motion.div
            key="memorize"
            className="glass fixed inset-x-6 top-[calc(env(safe-area-inset-top)+52px)] z-30 rounded-3xl p-4 text-center shadow-xl"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
          >
            <p className="font-display text-lg font-extrabold text-gold-bright">
              🧠 Husk dine 2 nederste kort!
            </p>
            <p className="mb-2 text-xs text-cream/65">Kun du kan se dem — og kun nu.</p>
            <Countdown deadline={memorizeDeadline} totalMs={game.rules.memorizeSeconds * 1000} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Baguette banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            key="banner"
            className="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-felt-900/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.3, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 14 }}
              className="font-display text-5xl font-black tracking-wide text-gold-bright drop-shadow-[0_0_24px_rgba(232,197,122,0.55)]"
            >
              {banner.text}
            </motion.div>
            {banner.sub && (
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.18 }}
                className="mt-2 text-sm font-semibold text-cream/85"
              >
                {banner.sub}
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase overlays */}
      {game.phase === "reveal" && <RevealOverlay game={game} />}
      {game.phase === "gameOver" && <GameOverOverlay game={game} />}

      {/* Leave confirm */}
      <AnimatePresence>
        {confirmLeave && (
          <motion.div
            key="confirmleave"
            className="fixed inset-0 z-50 flex items-center justify-center bg-felt-900/80 p-8 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmLeave(false)}
          >
            <div className="glass w-full max-w-xs rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
              <p className="mb-4 text-center text-sm font-semibold">
                Forlade spillet? En bot overtager dine kort — du kan komme tilbage så længe rummet
                lever.
              </p>
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-2xl border border-cream/25 py-3 text-sm font-bold"
                  onClick={() => setConfirmLeave(false)}
                >
                  Bliv
                </button>
                <button
                  className="flex-1 rounded-2xl bg-signal-red py-3 text-sm font-bold text-cream"
                  onClick={() => {
                    setConfirmLeave(false);
                    leaveRoom();
                  }}
                >
                  Forlad
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
