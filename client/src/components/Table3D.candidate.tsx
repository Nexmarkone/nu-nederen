// Full 3D card table (three.js / react-three-fiber). The whole table is in 3D:
// you sit in front at the bottom, opponents fan out in a believable arc around a
// round felt table with their cards angled toward the centre, and the draw +
// discard piles sit in the middle. Cards are real 3D boxes with thickness;
// faces / backs / felt are drawn as canvas textures in code (no image assets,
// no CDN / IBL fetch). Tuned for iPhone Safari 60fps: cached textures + a single
// shared box geometry, one shadow-casting light, capped dpr, a demand frameloop
// that only self-sustains while something is actually animating, and an
// FPS-gated bloom pass that disables itself if the device can't hold framerate.
//
// Contract: lazy-loaded, only mounted while 3D mode is on. See Table3DProps.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Card, Rank, Suit } from "@nu/shared";

// --- Palette (mirrors theme.css) -------------------------------------------

const RED = "#B43A2E";
const INK = "#1E1B16";
const GOLD = "#D2A24C";
const GOLD_BRIGHT = "#E8C57A";
const CREAM = "#F5EFDC";
const FELT_700 = "#1B4A33";
const FELT_900 = "#0B1F16";

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  spades: "♠",
  clubs: "♣",
};

// --- Card geometry constants -----------------------------------------------

const CARD_W = 1;
const CARD_H = 1.4;
const CARD_T = 0.055;

// One shared box geometry for every card in the scene (big draw-call / memory win).
const CARD_GEOM = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);

type Vec3 = [number, number, number];

// --- Reduced motion --------------------------------------------------------

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// --- Canvas textures (module-level cache) ----------------------------------

const texCache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(
  w: number,
  h: number,
): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return [c, ctx];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function finalize(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Look up (and finalize) a cached texture, building it via `build` on miss. */
function cachedTexture(
  key: string,
  build: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w: number,
  h: number,
): THREE.CanvasTexture {
  const cached = texCache.get(key);
  if (cached) return cached;
  const [c, ctx] = makeCanvas(w, h);
  build(ctx, w, h);
  const tex = finalize(c);
  texCache.set(key, tex);
  return tex;
}

type FaceData = { rank: Rank; suit: Suit | null };

function faceTexture(face: FaceData): THREE.CanvasTexture {
  return cachedTexture(
    `f-${face.rank}-${face.suit ?? "x"}`,
    (ctx, W, H) => {
      // Cream paper with a soft gradient + gold inner border.
      const g = ctx.createLinearGradient(0, 0, W * 0.35, H);
      g.addColorStop(0, "#FBF6E6");
      g.addColorStop(0.55, CREAM);
      g.addColorStop(1, "#E4DAC0");
      roundRect(ctx, 8, 8, W - 16, H - 16, 44);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(210,162,76,0.45)";
      ctx.stroke();
      roundRect(ctx, 22, 22, W - 44, H - 44, 34);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(210,162,76,0.28)";
      ctx.stroke();

      const isRed = face.suit === "hearts" || face.suit === "diamonds";
      const color = face.rank === "JOKER" ? GOLD : isRed ? RED : INK;
      ctx.fillStyle = color;

      if (face.rank === "JOKER") {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "900 150px Outfit, Arial, sans-serif";
        ctx.fillText("★", W / 2, H / 2 - 30);
        ctx.font = "800 64px Outfit, Arial, sans-serif";
        ctx.fillStyle = INK;
        ctx.fillText("JOKER", W / 2, H / 2 + 96);
        ctx.fillStyle = GOLD;
        ctx.font = "800 44px Outfit, Arial, sans-serif";
        ctx.fillText("★", 54, 64);
        ctx.save();
        ctx.translate(W - 54, H - 64);
        ctx.rotate(Math.PI);
        ctx.fillText("★", 0, 0);
        ctx.restore();
        return;
      }

      const glyph = face.suit ? SUIT_GLYPH[face.suit] : "";

      // Corner index (top-left), then mirrored bottom-right.
      const drawCorner = () => {
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.font = "800 76px Outfit, Arial, sans-serif";
        ctx.fillText(face.rank, 52, 92);
        ctx.font = "52px Arial, sans-serif";
        ctx.fillText(glyph, 52, 148);
      };
      drawCorner();
      ctx.save();
      ctx.translate(W, H);
      ctx.rotate(Math.PI);
      drawCorner();
      ctx.restore();

      // Centre treatment.
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (face.rank === "A") {
        ctx.font = "240px Arial, sans-serif";
        ctx.fillText(glyph, W / 2, H / 2);
      } else if (face.rank === "K" || face.rank === "Q" || face.rank === "J") {
        // Crown / court flourish.
        ctx.save();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 6;
        ctx.beginPath();
        const cy = H * 0.36;
        ctx.moveTo(W / 2 - 70, cy + 24);
        ctx.lineTo(W / 2 - 46, cy - 30);
        ctx.lineTo(W / 2 - 18, cy + 8);
        ctx.lineTo(W / 2, cy - 40);
        ctx.lineTo(W / 2 + 18, cy + 8);
        ctx.lineTo(W / 2 + 46, cy - 30);
        ctx.lineTo(W / 2 + 70, cy + 24);
        ctx.stroke();
        ctx.fillStyle = "rgba(210,162,76,0.18)";
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = color;
        ctx.font = "800 200px Outfit, Arial, sans-serif";
        ctx.fillText(face.rank, W / 2, H / 2 + 28);
        ctx.font = "84px Arial, sans-serif";
        ctx.fillText(glyph, W / 2, H * 0.82);
      } else {
        ctx.font = "800 200px Outfit, Arial, sans-serif";
        ctx.fillText(face.rank, W / 2, H / 2 - 6);
        ctx.font = "84px Arial, sans-serif";
        ctx.fillText(glyph, W / 2, H * 0.8);
      }
    },
    420,
    588,
  );
}

function backTexture(): THREE.CanvasTexture {
  return cachedTexture(
    "back",
    (ctx, W, H) => {
      const g = ctx.createRadialGradient(W / 2, H * 0.42, 30, W / 2, H / 2, H * 0.78);
      g.addColorStop(0, "#1F5439");
      g.addColorStop(1, FELT_900);
      roundRect(ctx, 8, 8, W - 16, H - 16, 44);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 10;
      ctx.strokeStyle = GOLD;
      ctx.stroke();

      // Diagonal gold lattice.
      ctx.save();
      roundRect(ctx, 20, 20, W - 40, H - 40, 34);
      ctx.clip();
      ctx.strokeStyle = "rgba(232,197,122,0.22)";
      ctx.lineWidth = 3;
      for (let i = -H; i < W; i += 44) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + H, H);
        ctx.stroke();
      }
      for (let i = 0; i < W + H; i += 44) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i - H, H);
        ctx.stroke();
      }
      ctx.restore();

      // Centre medallion.
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 84, 0, Math.PI * 2);
      ctx.fillStyle = FELT_700;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
      ctx.fillStyle = GOLD_BRIGHT;
      ctx.font = "120px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🥖", W / 2, H / 2 + 8);
    },
    420,
    588,
  );
}

function feltTexture(): THREE.CanvasTexture {
  return cachedTexture(
    "felt",
    (ctx, S) => {
      const g = ctx.createRadialGradient(S / 2, S * 0.46, 40, S / 2, S / 2, S * 0.7);
      g.addColorStop(0, "#1B4A33");
      g.addColorStop(0.7, "#123524");
      g.addColorStop(1, "#0C2418");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
      // Deterministic felt speckle.
      let seed = 1337;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const img = ctx.getImageData(0, 0, S, S);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const d = (rnd() - 0.5) * 14;
        data[i] = Math.max(0, Math.min(255, (data[i] ?? 0) + d));
        data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] ?? 0) + d));
        data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] ?? 0) + d));
      }
      ctx.putImageData(img, 0, 0);
      // Vignette ring to ground the centre.
      const ring = ctx.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.5);
      ring.addColorStop(0, "rgba(0,0,0,0)");
      ring.addColorStop(1, "rgba(0,0,0,0.26)");
      ctx.fillStyle = ring;
      ctx.fillRect(0, 0, S, S);
    },
    512,
    512,
  );
}

/** Soft round contact-shadow blob used under the central piles. */
function blobTexture(): THREE.CanvasTexture {
  return cachedTexture(
    "blob",
    (ctx, S) => {
      const g = ctx.createRadialGradient(S / 2, S / 2, 8, S / 2, S / 2, S / 2);
      g.addColorStop(0, "rgba(0,0,0,0.5)");
      g.addColorStop(0.6, "rgba(0,0,0,0.22)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    },
    256,
    256,
  );
}

// --- Shared card materials -------------------------------------------------

const EDGE_COLOR = new THREE.Color("#EFE7CF");
const EDGE_MAT = new THREE.MeshStandardMaterial({
  color: EDGE_COLOR,
  roughness: 0.55,
  metalness: 0.04,
});
const BOTTOM_MAT = new THREE.MeshStandardMaterial({
  color: EDGE_COLOR,
  roughness: 0.62,
});

// One reusable (non-glowing) top material per face texture.
const topMatCache = new Map<THREE.Texture, THREE.MeshPhysicalMaterial>();

function makeTopMaterial(tex: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: 0.4,
    metalness: 0.0,
    clearcoat: 0.85,
    clearcoatRoughness: 0.28,
    sheen: 0.3,
    sheenColor: new THREE.Color("#fff7e8"),
    emissive: new THREE.Color(GOLD_BRIGHT),
    emissiveIntensity: 0,
  });
}

function sharedTopMaterial(tex: THREE.Texture): THREE.MeshPhysicalMaterial {
  const cached = topMatCache.get(tex);
  if (cached) return cached;
  const m = makeTopMaterial(tex);
  topMatCache.set(tex, m);
  return m;
}

// Box face order: [+X,-X,+Y,-Y,+Z,-Z]; a flat card lying down has +Z (index 4) up.
function materialArray(top: THREE.Material): THREE.Material[] {
  return [EDGE_MAT, EDGE_MAT, EDGE_MAT, EDGE_MAT, top, BOTTOM_MAT];
}

// --- Low-level card mesh ---------------------------------------------------

/**
 * A single chunky card. When `glow` is true it owns a private (cloned) top
 * material whose emissive is pulsed every frame; otherwise it reuses the shared
 * material for that texture so most cards cost zero extra material allocations.
 */
function Card3D({
  position,
  rotation,
  scale,
  texture,
  onTap,
  glow = false,
}: {
  position: Vec3;
  rotation?: Vec3;
  scale?: number;
  texture: THREE.Texture;
  onTap?: () => void;
  glow?: boolean;
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  // Private glowing material only while this card is a tap target.
  const glowMat = useMemo(
    () => (glow ? makeTopMaterial(texture) : null),
    [glow, texture],
  );
  useEffect(() => () => glowMat?.dispose(), [glowMat]);

  const materials = useMemo(
    () => materialArray(glowMat ?? sharedTopMaterial(texture)),
    [glowMat, texture],
  );

  useFrame((state) => {
    if (!glowMat) return;
    const pulse = 0.35 + (0.5 + Math.sin(state.clock.elapsedTime * 4) * 0.5) * 0.55;
    glowMat.emissiveIntensity = pulse;
    invalidate();
  });

  return (
    <mesh
      geometry={CARD_GEOM}
      position={position}
      rotation={rotation ?? [-Math.PI / 2, 0, 0]}
      scale={scale ?? 1}
      castShadow
      receiveShadow
      material={materials}
      onClick={
        onTap
          ? (e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onTap();
            }
          : undefined
      }
      onPointerOver={
        onTap
          ? () => {
              gl.domElement.style.cursor = "pointer";
            }
          : undefined
      }
      onPointerOut={
        onTap
          ? () => {
              gl.domElement.style.cursor = "";
            }
          : undefined
      }
    />
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// --- Local exported types --------------------------------------------------

export interface Slot3D {
  id: string;
  /** Face data if it should be shown; null => render the card BACK. */
  face: { rank: Rank; suit: Suit | null } | null;
}

export interface Seat3D {
  id: string;
  name: string;
  avatar: string;
  slots: (Slot3D | null)[];
  isCurrent: boolean;
  isDealer: boolean;
  isCaller: boolean;
}

export interface Table3DProps {
  drawCount: number;
  discardTop: Card | null;
  canDraw: boolean;
  canTake: boolean;
  onDraw: () => void;
  onTake: () => void;
  ownSlots: (Slot3D | null)[];
  onOwnTap: (gridIndex: number) => void;
  ownTappable: boolean;
  ownHighlight: boolean;
  opponents: Seat3D[];
  onOpponentTap: (playerId: string, gridIndex: number) => void;
  opponentsTappable: boolean;
}

// --- Draw stack ------------------------------------------------------------

function DrawStack({
  count,
  onDraw,
  reduced,
}: {
  count: number;
  onDraw?: () => void;
  reduced: boolean;
}) {
  const back = backTexture();
  const shown = Math.min(Math.max(count, 0), 10);
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    if (onDraw && !reduced) {
      g.position.y = Math.sin(state.clock.elapsedTime * 2.2) * 0.05 + 0.05;
      invalidate();
    } else if (g.position.y !== 0) {
      g.position.y = 0;
    }
  });

  return (
    <group ref={ref} position={[-0.98, 0, 0]}>
      {Array.from({ length: shown }, (_, i) => (
        <Card3D
          key={i}
          position={[0, i * CARD_T * 0.92, 0]}
          texture={back}
          glow={i === shown - 1 && !!onDraw}
          onTap={i === shown - 1 && onDraw ? onDraw : undefined}
        />
      ))}
      {shown === 0 && (
        <mesh geometry={CARD_GEOM} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial
            color="#0d2a1d"
            roughness={0.95}
            transparent
            opacity={0.55}
          />
        </mesh>
      )}
    </group>
  );
}

// --- Discard pile w/ deal-in landing ---------------------------------------

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function DiscardCard({
  card,
  onTake,
  reduced,
}: {
  card: Card | null;
  onTake?: () => void;
  reduced: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const prevId = useRef<string | null>(null);
  const anim = useRef(1);
  const settleRot = useRef(0.14);
  const invalidate = useThree((s) => s.invalidate);
  const tex = card ? faceTexture({ rank: card.rank, suit: card.suit }) : null;

  useEffect(() => {
    if (card && card.id !== prevId.current) {
      anim.current = reduced ? 1 : 0;
      // Deterministic slight rotation per card so the pile looks shuffled.
      settleRot.current = ((Math.abs(hashStr(card.id)) % 100) / 100 - 0.5) * 0.5;
      prevId.current = card.id;
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id, reduced]);

  useFrame((_state, delta) => {
    const g = ref.current;
    if (!g) return;
    if (anim.current < 1) {
      anim.current = Math.min(1, anim.current + delta * 2.6);
      const e = easeOutCubic(anim.current);
      g.position.set(0.98 - (1 - e) * 0.6, 0.1 + (1 - e) * 1.9, (1 - e) * 0.35);
      g.rotation.set(-Math.PI / 2, 0, settleRot.current - (1 - e) * 1.4);
      invalidate();
    } else {
      g.position.set(0.98, 0.1, 0);
      g.rotation.set(-Math.PI / 2, 0, settleRot.current);
    }
  });

  if (!tex) {
    return (
      <mesh
        geometry={CARD_GEOM}
        position={[0.98, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial
          color="#0d2a1d"
          roughness={0.95}
          transparent
          opacity={0.5}
        />
      </mesh>
    );
  }

  return (
    <group ref={ref} position={[0.98, 0.1, 0]} rotation={[-Math.PI / 2, 0, settleRot.current]}>
      <Card3D position={[0, 0, 0]} rotation={[0, 0, 0]} texture={tex} onTap={onTake} glow={!!onTake} />
    </group>
  );
}

// --- A seat's cards (own 2x2 grid or an opponent fan) ----------------------

interface SeatLayout {
  /** Centre position of the seat on the felt. */
  pos: Vec3;
  /** Y-rotation so the cards face roughly toward the table centre. */
  yaw: number;
  /** Scale of the cards for distant seats. */
  scale: number;
  /** Spacing between cards along local X. */
  gap: number;
  /** Extra tilt (radians) lifting the top edge toward the centre/camera. */
  tilt: number;
}

function SeatCards({
  slots,
  layout,
  fan,
  glow,
  tappable,
  onTap,
  reduced,
}: {
  slots: (Slot3D | null)[];
  /** true = single fanned row (opponents); false = 2x2 grid (own hand). */
  fan: boolean;
  layout: SeatLayout;
  glow: boolean;
  tappable: boolean;
  onTap: (gridIndex: number) => void;
  reduced: boolean;
}) {
  const back = backTexture();
  const n = slots.length;

  return (
    <group position={layout.pos} rotation={[0, layout.yaw, 0]}>
      {slots.map((s, i) => {
        if (!s) return null;
        let lx: number;
        let lz: number;
        let spin = 0;
        if (fan) {
          // Single fanned row centred on local origin.
          lx = (i - (n - 1) / 2) * layout.gap;
          lz = 0;
          spin = -(i - (n - 1) / 2) * 0.06; // gentle fan splay
        } else {
          const col = i % 2;
          const row = Math.floor(i / 2);
          lx = (col === 0 ? -1 : 1) * layout.gap * 0.55;
          lz = row * (CARD_H * layout.scale + 0.16);
        }
        const tex = s.face ? faceTexture(s.face) : back;
        return (
          <Card3D
            key={s.id}
            position={[lx, 0.045, lz]}
            rotation={[-Math.PI / 2 + layout.tilt, spin, 0]}
            scale={layout.scale}
            texture={tex}
            glow={glow}
            onTap={tappable ? () => onTap(i) : undefined}
          />
        );
      })}
      {/* Reduced-motion fallback: a static glow ring under tappable hands. */}
      {glow && reduced && (
        <mesh
          position={[0, 0.006, fan ? 0 : CARD_H * layout.scale * 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[1.0 * layout.scale, 1.16 * layout.scale, 32]} />
          <meshBasicMaterial color={GOLD_BRIGHT} transparent opacity={0.4} />
        </mesh>
      )}
    </group>
  );
}

// --- Opponent name plate (billboarded sprite) ------------------------------

function nameTexture(seat: Seat3D): THREE.CanvasTexture {
  const key = `np-${seat.id}-${seat.name}-${seat.avatar}-${seat.isCurrent ? 1 : 0}-${
    seat.isCaller ? 1 : 0
  }-${seat.isDealer ? 1 : 0}`;
  return cachedTexture(
    key,
    (ctx, W) => {
      roundRect(ctx, 6, 18, W - 12, 60, 30);
      ctx.fillStyle = seat.isCurrent ? "rgba(232,197,122,0.92)" : "rgba(11,31,22,0.82)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = seat.isCurrent ? "#fff" : "rgba(232,197,122,0.5)";
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = "44px Arial, sans-serif";
      ctx.fillText(seat.avatar, 22, 50);
      ctx.fillStyle = seat.isCurrent ? INK : CREAM;
      ctx.font = "700 30px Outfit, Arial, sans-serif";
      const name = seat.name.length > 9 ? seat.name.slice(0, 8) + "…" : seat.name;
      ctx.fillText(name, 76, 50);
      if (seat.isCaller) {
        ctx.font = "30px Arial, sans-serif";
        ctx.fillText("🥖", W - 44, 50);
      } else if (seat.isDealer) {
        ctx.fillStyle = seat.isCurrent ? INK : GOLD_BRIGHT;
        ctx.font = "700 22px Outfit, Arial, sans-serif";
        ctx.fillText("D", W - 32, 50);
      }
    },
    256,
    96,
  );
}

function NamePlate({ seat, position }: { seat: Seat3D; position: Vec3 }) {
  const tex = nameTexture(seat);
  const mat = useMemo(
    () => new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
    [tex],
  );
  return <sprite position={position} scale={[1.05, 0.39, 1]} material={mat} />;
}

// --- Felt table ------------------------------------------------------------

function Felt() {
  const tex = feltTexture();
  const blob = blobTexture();
  return (
    <group>
      {/* Table top — large enough to bleed past the screen edges. */}
      <mesh position={[0, -0.03, 0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6.0, 96]} />
        <meshStandardMaterial map={tex} roughness={0.97} metalness={0} />
      </mesh>
      {/* Soft contact shadow under the central piles (cheap, mobile-friendly). */}
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[3.4, 2.6]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      {/* Gold inlay ring around the central play area. */}
      <mesh position={[0, -0.022, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.1, 2.24, 80]} />
        <meshStandardMaterial
          color={GOLD}
          roughness={0.38}
          metalness={0.6}
          emissive={new THREE.Color(GOLD)}
          emissiveIntensity={0.04}
        />
      </mesh>
      {/* Padded leather rail. */}
      <mesh position={[0, 0.0, 0.4]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[4.7, 0.26, 16, 90]} />
        <meshStandardMaterial color="#4a3320" roughness={0.48} metalness={0.32} />
      </mesh>
      {/* Brass piping on the inner edge of the rail. */}
      <mesh position={[0, 0.05, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[4.46, 0.045, 10, 90]} />
        <meshStandardMaterial color={GOLD} roughness={0.3} metalness={0.7} />
      </mesh>
    </group>
  );
}

// --- Seat placement around the arc -----------------------------------------

/**
 * World positions for opponents fanned in an arc across the far half of the
 * round table. The local player implicitly sits at the front (bottom). Returns
 * one layout per opponent, in the given clockwise display order. Cards are
 * angled up toward the table centre for a believable "across the table" read.
 */
function opponentLayouts(count: number): { card: SeatLayout; plate: Vec3 }[] {
  if (count <= 0) return [];
  const radius = 3.5;
  const centerZ = -0.55;
  const startAngle = Math.PI * 0.16; // near the player's left
  const endAngle = Math.PI * 0.84; // near the player's right
  const out: { card: SeatLayout; plate: Vec3 }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = startAngle + (endAngle - startAngle) * t;
    const x = -Math.cos(a) * radius;
    const z = centerZ - Math.sin(a) * radius * 0.78;
    // Yaw so the local +Z (toward viewer) of the seat points at the centre.
    const yaw = Math.atan2(0.4 - z, -x) + Math.PI / 2;
    // Top (far) seats slightly smaller for depth; tilt their cards up to face us.
    const depth = (Math.sin(a) + 1) * 0.5; // ~1 at the top, lower at the sides
    const scale = 0.6 - depth * 0.12;
    out.push({
      card: {
        pos: [x, 0, z],
        yaw,
        scale,
        gap: 0.62 * scale + 0.12,
        tilt: 0.6, // lift the cards toward the centre/camera
      },
      plate: [x, 1.05, z - 0.1],
    });
  }
  return out;
}

// --- Lighting rig ----------------------------------------------------------

function LightRig() {
  return (
    <group>
      {/* Warm hemisphere fill (no IBL / CDN fetch). */}
      <hemisphereLight args={["#d6e6da", "#0a1c13", 0.6]} />
      {/* Key light — the single shadow caster, warm overhead lamp. */}
      <directionalLight
        position={[3, 6.5, 3.2]}
        intensity={1.75}
        color="#fff4dd"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={26}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      {/* Cool rim from behind the opponents for depth separation. */}
      <directionalLight position={[-3, 4, -5]} intensity={0.45} color="#9fc8d6" />
      {/* Warm gold bounce toward the camera + a side accent. */}
      <pointLight position={[0, 2.4, 4.4]} intensity={0.5} color={GOLD_BRIGHT} distance={14} />
      <pointLight position={[-3.5, 2.4, -1.5]} intensity={0.4} color={GOLD} distance={12} />
    </group>
  );
}

// --- Resize + render-on-demand glue ----------------------------------------

function Resizer() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const apply = () => {
      const w = parent.clientWidth || 320;
      const h = parent.clientHeight || 320;
      gl.setSize(w, h, true);
      const cam = camera as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) {
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      invalidate();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(parent);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, [gl, camera, invalidate]);
  return null;
}

function InvalidateOnChange({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const id = window.setTimeout(invalidate, 100);
    const id2 = window.setTimeout(invalidate, 240);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(id2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

/**
 * Samples frame timing over the first ~60 frames and disables bloom if the
 * device can't comfortably hold ~48fps. Reports the verdict via onVerdict.
 */
function FpsGate({ onVerdict }: { onVerdict: (ok: boolean) => void }) {
  const samples = useRef<number[]>([]);
  const decided = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_s, delta) => {
    if (decided.current) return;
    samples.current.push(delta);
    invalidate();
    if (samples.current.length >= 60) {
      const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
      decided.current = true;
      onVerdict(avg < 1 / 48);
    }
  });
  return null;
}

// --- Scene -----------------------------------------------------------------

function Scene(props: Table3DProps & { reduced: boolean; allowBloom: boolean }) {
  const {
    drawCount,
    discardTop,
    canDraw,
    canTake,
    onDraw,
    onTake,
    ownSlots,
    onOwnTap,
    ownTappable,
    ownHighlight,
    opponents,
    onOpponentTap,
    opponentsTappable,
    reduced,
    allowBloom,
  } = props;

  const [bloomOk, setBloomOk] = useState(true);

  const layouts = useMemo(
    () => opponentLayouts(opponents.length),
    [opponents.length],
  );

  // Own hand sits in front of the camera, two rows of two, tilted up toward us.
  const ownLayout: SeatLayout = useMemo(
    () => ({ pos: [0, 0, 1.95], yaw: 0, scale: 0.82, gap: 1.5, tilt: 0.12 }),
    [],
  );

  const ownKey = ownSlots
    .map((s) => (s ? `${s.id}:${s.face ? s.face.rank + (s.face.suit ?? "") : "x"}` : "_"))
    .join(",");
  const oppKey = opponents
    .map(
      (o) =>
        `${o.id}:${o.isCurrent ? 1 : 0}:${o.slots
          .map((s) => (s ? (s.face ? s.face.rank : "b") : "_"))
          .join("")}`,
    )
    .join("|");

  return (
    <>
      <LightRig />
      <Resizer />
      <Felt />

      <DrawStack count={drawCount} onDraw={canDraw ? onDraw : undefined} reduced={reduced} />
      <DiscardCard card={discardTop} onTake={canTake ? onTake : undefined} reduced={reduced} />

      {/* Own hand */}
      <SeatCards
        slots={ownSlots}
        layout={ownLayout}
        fan={false}
        glow={ownHighlight}
        tappable={ownTappable}
        onTap={onOwnTap}
        reduced={reduced}
      />

      {/* Opponents */}
      {opponents.map((seat, idx) => {
        const layout = layouts[idx];
        if (!layout) return null;
        return (
          <group key={seat.id}>
            <SeatCards
              slots={seat.slots}
              layout={layout.card}
              fan
              glow={opponentsTappable}
              tappable={opponentsTappable}
              onTap={(gi) => onOpponentTap(seat.id, gi)}
              reduced={reduced}
            />
            <NamePlate seat={seat} position={layout.plate} />
            {seat.isCurrent && (
              <mesh
                position={[layout.card.pos[0], 0.008, layout.card.pos[2]]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[0.92, 1.08, 40]} />
                <meshBasicMaterial color={GOLD_BRIGHT} transparent opacity={0.5} />
              </mesh>
            )}
          </group>
        );
      })}

      {allowBloom && bloomOk && !reduced && (
        <>
          <FpsGate onVerdict={setBloomOk} />
          <EffectComposer enableNormalPass={false}>
            <Bloom
              intensity={0.5}
              luminanceThreshold={0.78}
              luminanceSmoothing={0.18}
              mipmapBlur
            />
          </EffectComposer>
        </>
      )}

      <InvalidateOnChange
        deps={[
          drawCount,
          discardTop?.id ?? "none",
          canDraw,
          canTake,
          ownKey,
          ownTappable,
          ownHighlight,
          oppKey,
          opponentsTappable,
          opponents.length,
        ]}
      />
    </>
  );
}

// --- Public component ------------------------------------------------------

export function Table3D(props: Table3DProps) {
  const reduced = useMemo(prefersReducedMotion, []);
  // Bloom only on reasonably wide / capable viewports; FPS-gate refines this.
  const allowBloom = useMemo(() => {
    if (typeof window === "undefined") return false;
    const dpr = window.devicePixelRatio || 1;
    const wide = window.innerWidth >= 380;
    return wide && dpr <= 3;
  }, []);

  return (
    <div className="table3d-host relative h-full min-h-[300px] w-full">
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 4.0, 5.4], fov: 46, near: 0.1, far: 60 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          stencil: false,
        }}
        style={{ background: "transparent" }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, -0.1, 0.9);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <Scene {...props} reduced={reduced} allowBloom={allowBloom} />
      </Canvas>

      {/* Small HTML readouts that don't cost any GL. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between px-6 text-[11px] font-semibold text-cream/60">
        <span>{Math.max(0, props.drawCount)} kort</span>
        <span>{props.canTake ? "Tag toppen?" : "Afkast"}</span>
      </div>
    </div>
  );
}
