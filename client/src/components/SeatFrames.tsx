// Big, premium player frames seated around the 3D table — like the framed
// portraits in UNO / poker apps. Crisp HTML overlaid on the 3D canvas:
// opponents fanned across the top, the local player at the bottom. Each frame
// has a gold-ringed avatar, name, score, a card-count pip and an animated
// turn-glow when it's that player's turn.

import { motion } from "motion/react";
import type { GridRef, RedactedPlayer } from "@nu/shared";
import { CardGrid } from "./CardGrid";

function cardCount(p: RedactedPlayer): number {
  return p.grid.filter((c) => c !== null).length;
}

function Frame({
  player,
  isCurrent,
  isDealer,
  isCaller,
  big,
}: {
  player: RedactedPlayer;
  isCurrent: boolean;
  isDealer: boolean;
  isCaller: boolean;
  big?: boolean;
}) {
  const ring = big ? "h-[72px] w-[72px] text-4xl" : "h-[58px] w-[58px] text-3xl";
  return (
    <div
      className={`flex flex-col items-center gap-0.5 ${
        player.connected || player.isBot ? "" : "opacity-50"
      }`}
    >
      <div className="relative">
        {isCurrent && (
          <>
            <motion.div
              className="absolute -inset-1.5 rounded-full"
              style={{ background: "radial-gradient(circle, rgba(232,197,122,0.55), rgba(232,197,122,0) 70%)" }}
              animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.08, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -inset-1 rounded-full border-2 border-gold-bright"
              animate={{ rotate: 360 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              style={{ borderStyle: "dashed" }}
            />
          </>
        )}
        <div
          className={`relative flex items-center justify-center rounded-full bg-gradient-to-b from-felt-700 to-felt-900 ${ring}`}
          style={{
            boxShadow:
              "0 4px 14px rgba(0,0,0,0.55), inset 0 2px 2px rgba(255,255,255,0.14), 0 0 0 3px " +
              (isCurrent ? "#E8C57A" : "#D2A24C"),
          }}
        >
          {player.avatar}
        </div>
        {isDealer && (
          <span className="absolute -right-1 -top-1 rounded-full bg-cream px-1.5 text-[9px] font-black text-ink shadow ring-1 ring-gold">
            D
          </span>
        )}
        {isCaller && <span className="absolute -left-2 -top-1 text-base drop-shadow">🥖</span>}
        {player.isBot && <span className="absolute -bottom-1 -right-1.5 text-xs">🤖</span>}
        <span className="absolute -bottom-1 -left-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-felt-900/95 px-1 text-[10px] font-bold text-cream ring-1 ring-gold/40">
          {cardCount(player)}
        </span>
      </div>
      <span className="glass max-w-[88px] truncate rounded-full px-2 py-0.5 text-[11px] font-bold text-cream">
        {player.name}
      </span>
      <span className="gold-bloom rounded-full bg-felt-900/70 px-2 py-0.5 text-[11px] font-extrabold text-gold-bright tabular-nums">
        {player.totalScore} pt
      </span>
    </div>
  );
}

export function SeatFrames({
  opponents,
  me,
  currentId,
  dealerId,
  callerId,
  targeting,
  selectedRef,
  onOpponentTap,
}: {
  opponents: RedactedPlayer[];
  me: RedactedPlayer | null;
  currentId: string | null;
  dealerId: string | null;
  callerId: string | null;
  /** When true, opponents' grids appear under their frame as tap targets. */
  targeting?: boolean;
  selectedRef?: GridRef | null;
  onOpponentTap?: (ref: GridRef) => void;
}) {
  return (
    <>
      {/* opponents fanned across the top */}
      <div
        className={`absolute inset-x-0 top-[calc(env(safe-area-inset-top)+46px)] z-20 flex items-start justify-center gap-5 px-3 sm:gap-8 ${
          targeting ? "" : "pointer-events-none"
        }`}
      >
        {opponents.map((p, i) => {
          // gentle arc: lift the middle seats a touch
          const mid = (opponents.length - 1) / 2;
          const lift = opponents.length >= 3 ? Math.round((mid - Math.abs(i - mid)) * 10) : 0;
          return (
            <div
              key={p.id}
              className="flex flex-col items-center gap-1"
              style={{ transform: `translateY(${-lift}px)` }}
            >
              <Frame
                player={p}
                isCurrent={p.id === currentId}
                isDealer={p.id === dealerId}
                isCaller={p.id === callerId}
              />
              {targeting && (
                <CardGrid
                  player={p}
                  cardClass="w-9"
                  onCardTap={onOpponentTap}
                  targetable
                  selectedRef={selectedRef}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* you, at the bottom */}
      {me && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6px)] z-20 flex justify-center">
          <Frame
            player={me}
            isCurrent={me.id === currentId}
            isDealer={me.id === dealerId}
            isCaller={me.id === callerId}
            big
          />
        </div>
      )}
    </>
  );
}
