// SVG playing cards — no image assets, razor sharp on Retina.

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Card, Suit } from "@nu/shared";

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  spades: "♠",
  clubs: "♣",
};

const RED = "#B43A2E";
const INK = "#1E1B16";
const CREAM = "#F5EFDC";
const CREAM_DIM = "#E4DAC0";
const GOLD = "#D2A24C";
const FELT = "#123524";

type FaceCard = Pick<Card, "rank" | "suit">;

function suitColor(card: FaceCard): string {
  return card.suit === "hearts" || card.suit === "diamonds" ? RED : INK;
}

export function CardFace({ card }: { card: FaceCard }) {
  const color = card.rank === "JOKER" ? GOLD : suitColor(card);
  const glyph = card.suit ? SUIT_GLYPH[card.suit] : "";

  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <rect x="1" y="1" width="98" height="138" rx="11" fill={CREAM} stroke={CREAM_DIM} />
      {card.rank === "JOKER" ? (
        <g>
          {/* Jester hat */}
          <g transform="translate(50 56)">
            <path
              d="M -26 18 Q -30 -16 -12 -2 Q -4 -26 6 -4 Q 22 -22 22 14 Z"
              fill={GOLD}
              stroke={INK}
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            <circle cx="-28" cy="16" r="4" fill={RED} />
            <circle cx="-11" cy="-8" r="4" fill={FELT} />
            <circle cx="22" cy="10" r="4" fill={RED} />
          </g>
          <text
            x="50"
            y="106"
            textAnchor="middle"
            fontSize="17"
            fontWeight="800"
            letterSpacing="2"
            fill={INK}
            fontFamily="Outfit, system-ui"
          >
            JOKER
          </text>
          <text x="10" y="22" fontSize="15" fontWeight="800" fill={GOLD}>
            ★
          </text>
          <text x="90" y="132" fontSize="15" fontWeight="800" fill={GOLD} textAnchor="end">
            ★
          </text>
        </g>
      ) : (
        <g fill={color} fontFamily="Outfit, system-ui">
          {/* Corners */}
          <text x="9" y="24" fontSize="20" fontWeight="800">
            {card.rank}
          </text>
          <text x="10" y="40" fontSize="15">
            {glyph}
          </text>
          <g transform="rotate(180 50 70)">
            <text x="9" y="24" fontSize="20" fontWeight="800">
              {card.rank}
            </text>
            <text x="10" y="40" fontSize="15">
              {glyph}
            </text>
          </g>
          {/* Center */}
          {card.rank === "A" ? (
            <text x="50" y="86" textAnchor="middle" fontSize="52">
              {glyph}
            </text>
          ) : card.rank === "K" || card.rank === "Q" || card.rank === "J" ? (
            <g>
              {card.rank === "K" && (
                <path
                  d="M 36 47 L 41 38 L 47 45 L 50 35 L 53 45 L 59 38 L 64 47 Z"
                  fill={GOLD}
                  stroke={INK}
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              )}
              <text x="50" y="92" textAnchor="middle" fontSize="46" fontWeight="800">
                {card.rank}
              </text>
              <text x="50" y="116" textAnchor="middle" fontSize="18">
                {glyph}
              </text>
            </g>
          ) : (
            <g>
              <text x="50" y="86" textAnchor="middle" fontSize="44" fontWeight="800">
                {card.rank}
              </text>
              <text x="50" y="114" textAnchor="middle" fontSize="20">
                {glyph}
              </text>
            </g>
          )}
        </g>
      )}
    </svg>
  );
}

export function CardBack() {
  const id = useId();
  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden>
      <defs>
        <pattern id={id} width="26" height="26" patternUnits="userSpaceOnUse">
          <text x="3" y="18" fontSize="12" opacity="0.3">
            🥖
          </text>
        </pattern>
      </defs>
      <rect x="1" y="1" width="98" height="138" rx="11" fill={FELT} stroke={GOLD} strokeWidth="2" />
      <rect x="7" y="7" width="86" height="126" rx="7" fill={`url(#${id})`} stroke={GOLD} strokeWidth="0.8" opacity="0.9" />
      <circle cx="50" cy="70" r="17" fill={FELT} stroke={GOLD} strokeWidth="1.5" />
      <text x="50" y="77" textAnchor="middle" fontSize="18">
        🥖
      </text>
    </svg>
  );
}

export interface PlayingCardProps {
  /** Face data if the card may be shown; undefined/null renders the back. */
  card?: FaceCard | null;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
  highlighted?: boolean;
  failFlash?: boolean;
  jumpable?: boolean;
  glowGold?: boolean;
  layoutCardId?: string;
  dimmed?: boolean;
  /** Fly-in deal animation (seconds of stagger). Cards spin in from the deck. */
  dealDelay?: number;
  /** Soft drop shadow for table depth (used on big cards). */
  shadow?: boolean;
}

export function PlayingCard({
  card,
  className = "w-16",
  onClick,
  selected,
  highlighted,
  failFlash,
  jumpable,
  glowGold,
  layoutCardId,
  dimmed,
  dealDelay,
  shadow,
}: PlayingCardProps) {
  const reduce = useReducedMotion();
  const faceUp = !!card;
  const dealt = dealDelay !== undefined && !reduce;

  const ring = failFlash
    ? "ring-4 ring-signal-red"
    : selected
      ? "ring-4 ring-gold-bright"
      : highlighted
        ? "ring-4 ring-gold"
        : jumpable
          ? "ring-2 ring-gold/60"
          : "";

  return (
    <motion.div
      layoutId={layoutCardId}
      layout={layoutCardId ? true : undefined}
      className={`relative aspect-[5/7] ${className} ${dimmed ? "opacity-50" : ""}`}
      style={{
        perspective: 600,
        filter: shadow ? "drop-shadow(0 6px 8px rgba(0,0,0,0.4))" : undefined,
      }}
      onClick={onClick}
      whileTap={onClick && !reduce ? { scale: 0.94 } : undefined}
      initial={
        dealt
          ? { y: -180, x: 40, rotate: -24 + ((dealDelay! * 100) % 36), scale: 0.55, opacity: 0 }
          : false
      }
      animate={dealt ? { y: 0, x: 0, rotate: 0, scale: 1, opacity: 1 } : undefined}
      transition={{ type: "spring", stiffness: 420, damping: 32, delay: dealDelay ?? 0 }}
    >
      <motion.div
        className={`absolute inset-0 rounded-[14%/10%] ${ring} ${glowGold ? "glow-gold" : ""}`}
        animate={{ rotateY: faceUp ? 0 : 180 }}
        initial={false}
        transition={
          reduce ? { duration: 0 } : { type: "spring", stiffness: 280, damping: 24, mass: 0.9 }
        }
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
          {card ? <CardFace card={card} /> : null}
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <CardBack />
        </div>
      </motion.div>
    </motion.div>
  );
}

export function EmptySlot({ className = "w-16" }: { className?: string }) {
  return (
    <div
      className={`aspect-[5/7] ${className} rounded-xl border-2 border-dashed border-cream/15`}
    />
  );
}
