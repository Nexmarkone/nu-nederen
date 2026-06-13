// Vibrant-UNO 3D table (three.js / react-three-fiber).
//
// The WHOLE table lives in 3D: the viewer sits at the front-bottom, every other
// player is fanned in an arc around a round felt table, and the draw + discard
// piles sit in the centre. Cards are real 3D boxes with thickness; faces/backs
// are drawn as canvas textures in code (no image assets). The look is "App
// Store-feature" UNO: saturated poppy colours, glossy clearcoat cards, warm
// arcade lighting and an FPS-gated bloom glow.
//
// Performance: frameloop="demand" with explicit invalidate() while anything
// animates, capped dpr, one shadow-casting light + cheap ContactShadows, shared
// card geometry + cached textures, a tiny procedural Environment (no CDN), and a
// bloom pass that disables itself if the device can't hold framerate (iPhone).
//
// Contract: lazy-loaded, only mounted while 3D mode is on. See Table3DProps.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Card, Rank, Suit } from "@nu/shared";

/* ----------------------------------------------------------- vibrant palette */
// Saturated arcade energy anchored in the app's card-night theme (theme.css).

const RED = "#E23B2E"; // poppy UNO red
const BLUE = "#2E6BE2";
const GREEN = "#2BB36B";
const YELLOW = "#F2B62E";
const INK = "#1E1B16";
const GOLD = "#D2A24C";
const GOLD_BRIGHT = "#E8C57A";
const CREAM = "#FBF6E6";
const FELT_HI = "#1E7A4D"; // brighter felt centre
const FELT_LO = "#0B2417"; // deep felt rim

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  spades: "♠",
  clubs: "♣",
};

/** Poppy accent per suit so faces read like UNO colour cards. */
function suitAccent(suit: Suit | null): string {
  switch (suit) {
    case "hearts":
      return RED;
    case "diamonds":
      return YELLOW;
    case "spades":
      return INK;
    case "clubs":
      return BLUE;
    default:
      return GREEN; // joker
  }
}

/* -------------------------------------------------------------- dimensions  */

const CARD_W = 1;
const CARD_H = 1.4;
const CARD_T = 0.055;

// One shared box geometry for every card in the scene.
const CARD_GEOM = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);

type Vec3 = [number, number, number];

/* --------------------------------------------------------- reduced motion ---*/

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ----------------------------------------------------------- canvas textures */

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

type FaceData = { rank: Rank; suit: Suit | null };

function faceKey(face: FaceData): string {
  return `f-${face.rank}-${face.suit ?? "x"}`;
}

/** Draw a vibrant UNO-style card face onto a cached canvas. */
function faceTexture(face: FaceData): THREE.CanvasTexture {
  const key = faceKey(face);
  const cached = texCache.get(key);
  if (cached) return cached;

  const W = 420;
  const H = 588;
  const [c, ctx] = makeCanvas(W, H);

  // Cream body with a soft glossy gradient.
  const g = ctx.createLinearGradient(0, 0, W * 0.35, H);
  g.addColorStop(0, "#FFFEF8");
  g.addColorStop(0.55, CREAM);
  g.addColorStop(1, "#EADFC2");
  roundRect(ctx, 8, 8, W - 16, H - 16, 46);
  ctx.fillStyle = g;
  ctx.fill();

  const accent = suitAccent(face.suit);
  const isRed = face.suit === "hearts" || face.suit === "diamonds";

  // Poppy accent inner frame so the card pops like UNO.
  ctx.lineWidth = 14;
  ctx.strokeStyle = accent;
  roundRect(ctx, 24, 24, W - 48, H - 48, 38);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  roundRect(ctx, 33, 33, W - 66, H - 66, 32);
  ctx.stroke();

  if (face.rank === "JOKER") {
    // Multi-colour jester splash — full arcade.
    const cx = W / 2;
    const cy = H / 2 - 26;
    const wedges = [RED, YELLOW, GREEN, BLUE];
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, 124, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
      ctx.closePath();
      ctx.fillStyle = wedges[i] ?? GOLD;
      ctx.fill();
    }
    ctx.fillStyle = "#FFFEF8";
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 70px Outfit, Arial, sans-serif";
    ctx.fillText("★", cx, cy + 4);
    ctx.font = "800 60px Outfit, Arial, sans-serif";
    ctx.fillText("JOKER", cx, H / 2 + 156);
    texCache.set(key, finalize(c));
    return texCache.get(key)!;
  }

  const glyph = face.suit ? SUIT_GLYPH[face.suit] : "";
  const color = isRed ? RED : INK;

  // Corner index (top-left), mirrored bottom-right.
  const drawCorner = () => {
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color;
    ctx.font = "900 80px Outfit, Arial, sans-serif";
    ctx.fillText(face.rank, 58, 100);
    ctx.font = "56px Arial, sans-serif";
    ctx.fillText(glyph, 58, 160);
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
  ctx.fillStyle = color;
  if (face.rank === "A") {
    ctx.font = "250px Arial, sans-serif";
    ctx.fillText(glyph, W / 2, H / 2);
  } else if (face.rank === "K" || face.rank === "Q" || face.rank === "J") {
    // crown flourish above the big letter
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    ctx.beginPath();
    const cy = H * 0.34;
    ctx.moveTo(W / 2 - 74, cy + 26);
    ctx.lineTo(W / 2 - 48, cy - 32);
    ctx.lineTo(W / 2 - 19, cy + 8);
    ctx.lineTo(W / 2, cy - 44);
    ctx.lineTo(W / 2 + 19, cy + 8);
    ctx.lineTo(W / 2 + 48, cy - 32);
    ctx.lineTo(W / 2 + 74, cy + 26);
    ctx.stroke();
    ctx.fillStyle = "rgba(210,162,76,0.2)";
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.font = "900 210px Outfit, Arial, sans-serif";
    ctx.fillText(face.rank, W / 2, H / 2 + 30);
    ctx.font = "88px Arial, sans-serif";
    ctx.fillText(glyph, W / 2, H * 0.83);
  } else {
    ctx.font = "900 210px Outfit, Arial, sans-serif";
    ctx.fillText(face.rank, W / 2, H / 2 - 8);
    ctx.font = "88px Arial, sans-serif";
    ctx.fillText(glyph, W / 2, H * 0.81);
  }

  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function backTexture(): THREE.CanvasTexture {
  const key = "back";
  const cached = texCache.get(key);
  if (cached) return cached;
  const W = 420;
  const H = 588;
  const [c, ctx] = makeCanvas(W, H);

  // Vibrant red body — classic UNO-back energy.
  const g = ctx.createRadialGradient(W / 2, H * 0.4, 30, W / 2, H / 2, H * 0.82);
  g.addColorStop(0, "#EE4636");
  g.addColorStop(1, "#9E2A20");
  roundRect(ctx, 8, 8, W - 16, H - 16, 46);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = GOLD_BRIGHT;
  roundRect(ctx, 24, 24, W - 48, H - 48, 38);
  ctx.stroke();

  // gold lattice
  ctx.save();
  roundRect(ctx, 33, 33, W - 66, H - 66, 32);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,221,150,0.28)";
  ctx.lineWidth = 5;
  for (let i = -H; i < W; i += 42) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // centre oval medallion
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.34);
  ctx.fillStyle = GOLD_BRIGHT;
  ctx.beginPath();
  ctx.ellipse(0, 0, 138, 92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#9E2A20";
  ctx.beginPath();
  ctx.ellipse(0, 0, 120, 76, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = GOLD_BRIGHT;
  ctx.font = "124px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🥖", W / 2, H / 2 + 6);

  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function feltTexture(): THREE.CanvasTexture {
  const key = "felt";
  const cached = texCache.get(key);
  if (cached) return cached;
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.66);
  g.addColorStop(0, FELT_HI);
  g.addColorStop(1, FELT_LO);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // deterministic felt speckle
  const img = ctx.getImageData(0, 0, S, S);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = Math.sin(i * 12.9898) * 43758.5453;
    const d = (n - Math.floor(n) - 0.5) * 12;
    const r = data[i] ?? 0;
    const gg = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    data[i] = Math.max(0, Math.min(255, r + d));
    data[i + 1] = Math.max(0, Math.min(255, gg + d));
    data[i + 2] = Math.max(0, Math.min(255, b + d));
  }
  ctx.putImageData(img, 0, 0);
  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

/* ----------------------------------------------------------------- materials */

const EDGE_COLOR = new THREE.Color("#F3ECD8");

// Shared edge/back materials (identical on every card).
const EDGE_MAT = new THREE.MeshStandardMaterial({
  color: EDGE_COLOR,
  roughness: 0.55,
  metalness: 0.04,
});
const BOTTOM_MAT = new THREE.MeshStandardMaterial({
  color: EDGE_COLOR,
  roughness: 0.62,
});

// Per-texture glossy top material, cached so we don't fork a PBR material per
// card. Cards that need to glow get a private clone (see Card3D).
const topMatCache = new Map<THREE.Texture, THREE.MeshPhysicalMaterial>();

function makeTopMaterial(tex: THREE.Texture): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: 0.36,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.22,
    sheen: 0.5,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color("#ffffff"),
    envMapIntensity: 0.9,
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

// Box face order: [+X,-X,+Y,-Y,+Z,-Z]; flat card lying down -> +Z (index 4) up.
function cardMaterials(top: THREE.Material): THREE.Material[] {
  return [EDGE_MAT, EDGE_MAT, EDGE_MAT, EDGE_MAT, top, BOTTOM_MAT];
}

/* ------------------------------------------------------------ low-level card */

const GLOW_GOLD = new THREE.Color(GOLD_BRIGHT);
const GLOW_TAP = new THREE.Color("#7FE3FF"); // cool cyan for tap targets

function Card3D({
  position,
  rotation,
  scale = 1,
  texture,
  onClick,
  glow = null,
  glowPulse = false,
  reduced = false,
  dealIn = false,
}: {
  position: Vec3;
  rotation?: Vec3;
  scale?: number;
  texture: THREE.Texture;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  /** "gold" = own highlight, "tap" = generic tap target, null = none. */
  glow?: "gold" | "tap" | null;
  glowPulse?: boolean;
  reduced?: boolean;
  /** Fly-in from the centre the first time mounted. */
  dealIn?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  const hovered = useRef(false);
  const liftRef = useRef(0);
  const dealT = useRef(dealIn && !reduced ? 0 : 1);

  // Glow cards get their own top material clone so the shared one stays dark.
  const topMat = useMemo(() => {
    return glow ? makeTopMaterial(texture) : sharedTopMaterial(texture);
  }, [texture, glow]);

  const materials = useMemo(() => cardMaterials(topMat), [topMat]);

  // Keep the top map in sync when the face texture changes (flip reveal).
  useEffect(() => {
    topMat.map = texture;
    topMat.needsUpdate = true;
    invalidate();
  }, [texture, topMat, invalidate]);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;
    let dirty = false;
    const rotZ = rotation ? rotation[2] : 0;

    // deal-in fly + spin from the centre
    if (dealT.current < 1) {
      dealT.current = Math.min(1, dealT.current + delta * 2.6);
      const e = 1 - Math.pow(1 - dealT.current, 3);
      g.position.set(position[0] * e, position[1] + (1 - e) * 1.4, position[2] * e);
      g.rotation.z = rotZ + (1 - e) * 1.3;
      dirty = true;
    }

    // Tasteful, restrained tap highlight: a gentle, slow gold sheen — never a
    // garish flashing glow.
    if (glow) {
      const base = glow === "gold" ? GLOW_GOLD : GLOW_TAP;
      if (topMat.emissive.getHex() !== base.getHex()) topMat.emissive.copy(base);
      if (glowPulse && !reduced) {
        topMat.emissiveIntensity = 0.24 + (Math.sin(state.clock.elapsedTime * 1.8) * 0.5 + 0.5) * 0.12;
        dirty = true;
      } else {
        topMat.emissiveIntensity = 0.28;
      }
    } else if (topMat.emissiveIntensity !== 0) {
      topMat.emissiveIntensity = 0;
    }

    // hover lift (desktop nicety)
    const targetLift = hovered.current && onClick ? 0.12 : 0;
    if (Math.abs(liftRef.current - targetLift) > 0.001) {
      liftRef.current = THREE.MathUtils.lerp(liftRef.current, targetLift, 0.2);
      dirty = true;
    }
    if (dealT.current >= 1) {
      g.position.set(position[0], position[1] + liftRef.current, position[2]);
      g.rotation.z = rotZ;
    }

    if (dirty) invalidate();
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={rotation ?? [-Math.PI / 2, 0, 0]}
      scale={scale}
    >
      <mesh
        geometry={CARD_GEOM}
        material={materials}
        castShadow
        receiveShadow
        onClick={
          onClick
            ? (e) => {
                e.stopPropagation();
                onClick(e);
              }
            : undefined
        }
        onPointerOver={
          onClick
            ? (e) => {
                e.stopPropagation();
                hovered.current = true;
                document.body.style.cursor = "pointer";
                invalidate();
              }
            : undefined
        }
        onPointerOut={
          onClick
            ? () => {
                hovered.current = false;
                document.body.style.cursor = "auto";
                invalidate();
              }
            : undefined
        }
      />
    </group>
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/* --------------------------------------------------------- exported types ---*/

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
  score: number;
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

/* ----------------------------------------------------------------- draw pile */

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
      invalidate();
    }
  });

  const tap = onDraw
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onDraw();
      }
    : undefined;

  return (
    <group ref={ref} position={[-1.0, 0, 0]}>
      {Array.from({ length: shown }, (_, i) => {
        const isTop = i === shown - 1;
        return (
          <Card3D
            key={i}
            position={[0, 0.02 + i * CARD_T * 0.92, 0]}
            texture={back}
            glow={isTop && onDraw ? "tap" : null}
            glowPulse={isTop && !!onDraw}
            onClick={isTop ? tap : undefined}
            reduced={reduced}
          />
        );
      })}
      {shown === 0 && (
        <mesh geometry={CARD_GEOM} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color="#0d2a1d" roughness={0.95} />
        </mesh>
      )}
    </group>
  );
}

/* -------------------------------------------------------------- discard pile */

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
  const tex = card ? faceTexture({ rank: card.rank, suit: card.suit }) : null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (card && card.id !== prevId.current) {
      anim.current = reduced ? 1 : 0;
      // deterministic slight tilt per card so the pile looks shuffled
      let h = 0;
      for (let i = 0; i < card.id.length; i++)
        h = (h * 31 + card.id.charCodeAt(i)) | 0;
      settleRot.current = ((h % 100) / 100 - 0.5) * 0.5;
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
      g.position.set(1.0 - (1 - e) * 0.6, 0.1 + (1 - e) * 1.9, (1 - e) * 0.35);
      g.rotation.set(-Math.PI / 2, 0, settleRot.current - (1 - e) * 1.4);
      invalidate();
    } else {
      g.rotation.z = settleRot.current;
    }
  });

  if (!tex) {
    return (
      <mesh
        geometry={CARD_GEOM}
        position={[1.0, 0.02, 0]}
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
    <group ref={ref} position={[1.0, 0.1, 0]} rotation={[-Math.PI / 2, 0, settleRot.current]}>
      <mesh
        geometry={CARD_GEOM}
        castShadow
        receiveShadow
        material={cardMaterials(sharedTopMaterial(tex))}
        onClick={
          onTake
            ? (e) => {
                e.stopPropagation();
                onTake();
              }
            : undefined
        }
        onPointerOver={
          onTake
            ? (e) => {
                e.stopPropagation();
                document.body.style.cursor = "pointer";
              }
            : undefined
        }
        onPointerOut={
          onTake
            ? () => {
                document.body.style.cursor = "auto";
              }
            : undefined
        }
      />
      {onTake && <TakeGlow />}
    </group>
  );
}

/** Pulsing cyan ring under the discard when it can be taken. */
function TakeGlow() {
  const ref = useRef<THREE.Mesh>(null);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.28 + Math.sin(state.clock.elapsedTime * 5) * 0.2;
    invalidate();
  });
  return (
    <mesh ref={ref} position={[0, 0, -CARD_T]}>
      <ringGeometry args={[0.78, 0.98, 40]} />
      <meshBasicMaterial
        color={GLOW_TAP}
        transparent
        opacity={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------ seat card rows */

interface SeatLayout {
  pos: Vec3;
  yaw: number;
  scale: number;
  gap: number;
}

/**
 * Lay out a seat's slots: own hand as a tidy 2/3-column grid, opponents as a
 * single fanned row. Glow + tap wiring is per-card.
 */
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
  layout: SeatLayout;
  fan: boolean;
  glow: "gold" | "tap" | null;
  tappable: boolean;
  onTap: (gridIndex: number) => void;
  reduced: boolean;
}) {
  const back = backTexture();
  const n = slots.length;
  const cols = fan ? Math.max(n, 1) : n <= 4 ? 2 : 3;

  return (
    <group position={layout.pos} rotation={[0, layout.yaw, 0]}>
      {slots.map((s, i) => {
        if (!s) return null;
        let lx: number;
        let lz: number;
        if (fan) {
          lx = (i - (n - 1) / 2) * layout.gap;
          lz = 0;
        } else {
          const col = i % cols;
          const row = Math.floor(i / cols);
          lx = (col - (cols - 1) / 2) * layout.gap;
          lz = row * (CARD_H * layout.scale + 0.16);
        }
        const tex = s.face ? faceTexture(s.face) : back;
        return (
          <Card3D
            key={s.id}
            position={[lx, 0.045, lz]}
            scale={layout.scale}
            texture={tex}
            glow={glow}
            glowPulse={glow !== null}
            reduced={reduced}
            onClick={tappable ? () => onTap(i) : undefined}
          />
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------- opponent name plate */

/** A premium round player portrait (avatar in a gold ring) + name + score. */
function nameTexture(seat: Seat3D): THREE.CanvasTexture {
  const key = `np2-${seat.id}-${seat.name}-${seat.avatar}-${seat.isCurrent ? 1 : 0}-${
    seat.isCaller ? 1 : 0
  }-${seat.isDealer ? 1 : 0}-${seat.score}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const W = 256;
  const H = 256;
  const [c, ctx] = makeCanvas(W, H);
  const cx = W / 2;
  const cy = 96;
  const r = 64;

  // active-turn halo
  if (seat.isCurrent) {
    const halo = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 26);
    halo.addColorStop(0, "rgba(232,197,122,0.55)");
    halo.addColorStop(1, "rgba(232,197,122,0)");
    ctx.beginPath();
    ctx.arc(cx, cy, r + 26, 0, Math.PI * 2);
    ctx.fillStyle = halo;
    ctx.fill();
  }

  // portrait disc
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const disc = ctx.createRadialGradient(cx, cy - 22, 10, cx, cy, r);
  disc.addColorStop(0, "#23613f");
  disc.addColorStop(1, "#0b1f16");
  ctx.fillStyle = disc;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = seat.isCurrent ? GOLD_BRIGHT : GOLD;
  ctx.stroke();

  // avatar emoji
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "80px Arial, sans-serif";
  ctx.fillText(seat.avatar, cx, cy + 6);

  // dealer / caller chips on the ring
  const chip = (text: string, ax: number, bg: string, fg: string) => {
    ctx.beginPath();
    ctx.arc(ax, cy + 44, 20, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(11,31,22,0.7)";
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = "700 22px Outfit, Arial, sans-serif";
    ctx.fillText(text, ax, cy + 45);
  };
  if (seat.isDealer) chip("D", cx + 46, "#F5EFDC", INK);
  if (seat.isCaller) {
    ctx.font = "30px Arial, sans-serif";
    ctx.fillText("🥖", cx - 50, cy + 46);
  }

  // name + score plate
  roundRect(ctx, 24, 178, W - 48, 64, 32);
  ctx.fillStyle = "rgba(8,26,18,0.88)";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(232,197,122,0.45)";
  ctx.stroke();
  ctx.fillStyle = CREAM;
  ctx.font = "700 30px Outfit, Arial, sans-serif";
  const name = seat.name.length > 10 ? seat.name.slice(0, 9) + "…" : seat.name;
  ctx.fillText(name, cx, 200);
  ctx.fillStyle = GOLD_BRIGHT;
  ctx.font = "800 26px Outfit, Arial, sans-serif";
  ctx.fillText(`${seat.score} pt`, cx, 226);

  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function NamePlate({ seat, position }: { seat: Seat3D; position: Vec3 }) {
  const tex = nameTexture(seat);
  // Square portrait badge, raised so it sits above the seat's cards.
  return (
    <sprite position={[position[0], position[1] + 0.28, position[2] + 0.35]} scale={[1.35, 1.35, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  );
}

/* ------------------------------------------------------------------- the felt */

function Felt() {
  const tex = feltTexture();
  return (
    <group>
      {/* table top */}
      <mesh position={[0, -0.03, 0.4]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[5.6, 80]} />
        <meshStandardMaterial map={tex} roughness={0.97} metalness={0} />
      </mesh>
      {/* gold inlay ring around the central play area */}
      <mesh position={[0, -0.024, 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.0, 2.14, 72]} />
        <meshStandardMaterial
          color={GOLD_BRIGHT}
          roughness={0.3}
          metalness={0.7}
          emissive={new THREE.Color(GOLD)}
          emissiveIntensity={0.12}
        />
      </mesh>
      {/* padded rail */}
      <mesh position={[0, 0.0, 0.4]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[4.7, 0.26, 16, 96]} />
        <meshStandardMaterial color="#5a3d22" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

/* --------------------------------------------------------- seat placement ---*/

/**
 * World positions for opponents fanned across the far half of the table, in the
 * given clockwise order (index 0 = just left of the player). The local player
 * is implicitly at the front (bottom).
 */
function opponentLayouts(count: number): { card: SeatLayout; plate: Vec3 }[] {
  if (count <= 0) return [];
  const radius = 3.5;
  const centerZ = -0.6;
  const startAngle = Math.PI * 0.16; // near the player's left
  const endAngle = Math.PI * 0.84; // near the player's right
  const out: { card: SeatLayout; plate: Vec3 }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = startAngle + (endAngle - startAngle) * t;
    const x = -Math.cos(a) * radius;
    const z = centerZ - Math.sin(a) * radius * 0.78;
    const yaw = Math.atan2(0.4 - z, -x) + Math.PI / 2;
    const depth = (Math.sin(a) + 1) * 0.5; // ~1 at top, lower at the sides
    const scale = 0.62 - depth * 0.1;
    out.push({
      card: { pos: [x, 0, z], yaw, scale, gap: 0.62 * scale + 0.12 },
      plate: [x, 0.95, z - 0.1],
    });
  }
  return out;
}

/* ------------------------------------------------ procedural environment IBL */
// No CDN: a tiny lightformer rig baked once into a PMREM gives the glossy cards
// real reflections without any network fetch.

function StudioEnv() {
  return (
    <Environment resolution={64} frames={1} background={false}>
      <Lightformer
        intensity={2.2}
        color="#fff2d6"
        position={[0, 5, 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[10, 10, 1]}
      />
      <Lightformer
        intensity={1.1}
        color="#ffd9a0"
        position={[-4, 2, -3]}
        rotation={[0, Math.PI / 4, 0]}
        scale={[4, 6, 1]}
      />
      <Lightformer
        intensity={1.0}
        color="#cfe7ff"
        position={[4, 2, -2]}
        rotation={[0, -Math.PI / 4, 0]}
        scale={[4, 6, 1]}
      />
    </Environment>
  );
}

/* ----------------------------------------------------- resize + demand glue */

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

/** Kick a render whenever the visible state changes (demand frameloop). */
function InvalidateOnChange({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const id = window.setTimeout(invalidate, 100);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

/**
 * Samples frame timing over the first ~60 frames and disables bloom if the
 * device can't comfortably hold ~48fps.
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

/* ------------------------------------------------------------------- the scene */

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

  // own hand: two/three columns in the thumb zone in front of the camera
  const ownCols = ownSlots.length <= 4 ? 2 : 3;
  const ownLayout: SeatLayout = {
    pos: [0, 0, 1.65],
    yaw: 0,
    scale: 0.82,
    gap: ownCols === 2 ? 0.98 : 0.92,
  };

  const ownKey = ownSlots
    .map((s) => (s ? `${s.id}:${s.face ? `${s.face.rank}${s.face.suit ?? ""}` : "b"}` : "_"))
    .join(",");
  const oppKey = opponents
    .map(
      (o) =>
        `${o.id}:${o.isCurrent ? 1 : 0}:${o.slots
          .map((s) => (s ? (s.face ? `${s.face.rank}${s.face.suit ?? ""}` : "b") : "_"))
          .join("")}`,
    )
    .join("|");

  return (
    <>
      {/* warm arcade light rig — one shadow caster */}
      <hemisphereLight args={["#e0f1e4", "#0a1c13", 0.85]} />
      <directionalLight
        position={[3.2, 7, 3.4]}
        intensity={2.0}
        color="#fff2d8"
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
      />
      <pointLight position={[-3.8, 2.8, -2]} intensity={0.7} color={GOLD_BRIGHT} />
      <pointLight position={[2.6, 2.2, 2.6]} intensity={0.4} color="#fff2d6" />

      <StudioEnv />
      <Resizer />
      <Felt />

      {/* cheap contact shadows give the cards weight without per-card shadow cost */}
      <ContactShadows
        position={[0, 0.004, 0.5]}
        scale={9}
        blur={2.4}
        opacity={0.45}
        far={3}
        frames={reduced ? 1 : undefined}
        color="#04140c"
      />

      <DrawStack count={drawCount} onDraw={canDraw ? onDraw : undefined} reduced={reduced} />
      <DiscardCard card={discardTop} onTake={canTake ? onTake : undefined} reduced={reduced} />

      {/* own hand */}
      <SeatCards
        slots={ownSlots}
        layout={ownLayout}
        fan={false}
        glow={ownHighlight ? "gold" : null}
        tappable={ownTappable}
        onTap={onOwnTap}
        reduced={reduced}
      />

      {/* opponents */}
      {opponents.map((seat, idx) => {
        const layout = layouts[idx];
        if (!layout) return null;
        return (
          <group key={seat.id}>
            <SeatCards
              slots={seat.slots}
              layout={layout.card}
              fan
              glow={opponentsTappable ? "tap" : null}
              tappable={opponentsTappable}
              onTap={(gi) => onOpponentTap(seat.id, gi)}
              reduced={reduced}
            />
            <NamePlate seat={seat} position={layout.plate} />
            {seat.isCurrent && (
              <mesh
                position={[layout.card.pos[0], 0.006, layout.card.pos[2]]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry args={[0.85, 1.0, 40]} />
                <meshBasicMaterial color={GOLD_BRIGHT} transparent opacity={0.5} />
              </mesh>
            )}
          </group>
        );
      })}

      {allowBloom && bloomOk && !reduced && (
        <>
          <FpsGate onVerdict={setBloomOk} />
          <EffectComposer enableNormalPass={false} multisampling={0}>
            <Bloom
              intensity={0.9}
              luminanceThreshold={0.6}
              luminanceSmoothing={0.22}
              mipmapBlur
              radius={0.72}
            />
            <Vignette eskil={false} offset={0.3} darkness={0.68} />
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

/* --------------------------------------------------------------- public API */

export function Table3D(props: Table3DProps) {
  const reduced = useMemo(prefersReducedMotion, []);
  // Bloom only on reasonably capable viewports; FPS-gate refines this further.
  const allowBloom = useMemo(() => {
    if (typeof window === "undefined") return false;
    const dpr = window.devicePixelRatio || 1;
    return window.innerWidth >= 360 && dpr <= 3;
  }, []);

  // Close, immersive framing so the cards are BIG and fill the screen — but
  // pulled back/raised just enough that the back avatars and front cards both fit.
  const seatCount = props.opponents.length;
  const camZ = seatCount >= 4 ? 4.9 : 4.6;
  const camY = seatCount >= 4 ? 3.35 : 3.15;

  return (
    // Absolutely fills its (relative, flex-1) container — full available height.
    <div className="table3d-host absolute inset-0">
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, camY, camZ], fov: 50 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ background: "transparent" }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, -0.1, 0.35);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.2;
        }}
      >
        <Scene {...props} reduced={reduced} allowBloom={allowBloom} />
      </Canvas>

      {/* tiny HTML readouts that cost no GL */}
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between px-6 text-[11px] font-semibold text-cream/60">
        <span>{Math.max(0, props.drawCount)} kort</span>
        <span>{props.canTake ? "Tag toppen?" : "Afkast"}</span>
      </div>
    </div>
  );
}
