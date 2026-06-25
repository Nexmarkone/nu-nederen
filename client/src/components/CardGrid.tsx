// A player's card grid (2 columns). Used big for your own hand and small for
// opponents. Face-up data comes from either the redacted state (reveal) or an
// active private peek (memorize / ability) — otherwise cards render face-down.

import type { Card, GridRef, RedactedPlayer } from "@nu/shared";
import { GRID_SIZE } from "@nu/shared";
import { useStore } from "../store";
import { EmptySlot, PlayingCard } from "./PlayingCard";

function peekFor(
  peeks: ReturnType<typeof useStore.getState>["peeks"],
  playerId: string,
  gridIndex: number,
): Card | null {
  for (const p of peeks) {
    for (const c of p.cards) {
      if (c.gridRef && c.gridRef.playerId === playerId && c.gridRef.gridIndex === gridIndex) {
        return c.card;
      }
    }
  }
  return null;
}

export interface CardGridProps {
  player: RedactedPlayer;
  cardClass?: string;
  onCardTap?: (ref: GridRef) => void;
  /** Cards pulse subtly as tap targets (ability select / jump window). */
  targetable?: boolean;
  jumpable?: boolean;
  selectedRef?: GridRef | null;
  glowGoldIds?: Set<string>;
  /** Drop shadows for table depth (big grids). */
  shadow?: boolean;
}

export function CardGrid({
  player,
  cardClass = "w-16",
  onCardTap,
  targetable,
  jumpable,
  selectedRef,
  glowGoldIds,
  shadow,
}: CardGridProps) {
  const peeks = useStore((s) => s.peeks);
  const highlights = useStore((s) => s.highlights);
  const failFlash = useStore((s) => s.failFlash);

  // Render one cell at its REAL grid index, so taps / peeks / highlight keys /
  // deal stagger stay correct regardless of base-vs-extras placement.
  const renderCell = (c: (typeof player.grid)[number], i: number) => {
    if (c === null) {
      return <EmptySlot key={`empty-${i}`} className={cardClass} />;
    }
    const peeked = peekFor(peeks, player.id, i);
    const face = c.faceUp && c.rank ? { rank: c.rank, suit: c.suit ?? null } : peeked;
    const key = `${player.id}:${i}`;
    const isSelected = selectedRef?.playerId === player.id && selectedRef.gridIndex === i;
    return (
      <PlayingCard
        key={c.id}
        layoutCardId={c.id}
        card={face}
        className={cardClass}
        selected={isSelected}
        highlighted={!!highlights[key]}
        failFlash={!!failFlash[key]}
        jumpable={jumpable || (targetable && !isSelected)}
        glowGold={glowGoldIds?.has(c.id)}
        dealDelay={i * 0.07}
        shadow={shadow}
        onClick={onCardTap ? () => onCardTap({ playerId: player.id, gridIndex: i }) : undefined}
      />
    );
  };

  // The base hand is always indices 0..GRID_SIZE-1 (the 2x2 you memorise). Any
  // index >= GRID_SIZE is a penalty card — render those stacked ABOVE the base
  // grid so they sit "on top" while the base 2x2 keeps its exact layout.
  const base = player.grid.slice(0, GRID_SIZE);
  const extras = player.grid.slice(GRID_SIZE);

  if (extras.length === 0) {
    return <div className="grid grid-cols-2 gap-1.5">{base.map((c, i) => renderCell(c, i))}</div>;
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-wrap justify-center gap-1.5">
        {extras.map((c, j) => renderCell(c, GRID_SIZE + j))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">{base.map((c, i) => renderCell(c, i))}</div>
    </div>
  );
}
