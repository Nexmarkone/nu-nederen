// Photoreal stylised-premium 3D card table (three.js / react-three-fiber).
// Scratch copy used solely for a typecheck pass; safe to delete.

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

export interface Slot3D {
  id: string;
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

const FELT_LIGHT = "#1A4A33";
const FELT_DARK = "#0B2418";
const CREAM_HI = "#FFFDF6";
const CREAM_LO = "#E4DAC0";
const GOLD = "#D2A24C";
const GOLD_HI = "#E8C57A";
const RED = "#B43A2E";
const INK = "#1E1B16";

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  spades: "♠",
  clubs: "♣",
};

const CARD_W = 1;
const CARD_H = 1.4;
const CARD_T = 0.055;

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

function roundRectPath(
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

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

const FACE_W = 420;
const FACE_H = 588;

function drawCrown(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.55);
  ctx.lineTo(-s, -s * 0.2);
  ctx.lineTo(-s * 0.5, s * 0.18);
  ctx.lineTo(0, -s * 0.55);
  ctx.lineTo(s * 0.5, s * 0.18);
  ctx.lineTo(s, -s * 0.2);
  ctx.lineTo(s, s * 0.55);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = s * 0.12;
  ctx.strokeStyle = INK;
  ctx.lineJoin = "round";
  ctx.stroke();
  const studs: Array<[number, number]> = [
    [-s, -s * 0.2],
    [0, -s * 0.55],
    [s, -s * 0.2],
  ];
  for (const [dx, dy] of studs) {
    ctx.beginPath();
    ctx.arc(dx, dy, s * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = RED;
    ctx.fill();
    ctx.lineWidth = s * 0.06;
    ctx.stroke();
  }
  ctx.restore();
}

function faceTexture(face: { rank: Rank; suit: Suit | null }): THREE.CanvasTexture {
  const key = `f-${face.rank}-${face.suit ?? "x"}`;
  const cached = texCache.get(key);
  if (cached) return cached;

  const W = FACE_W;
  const H = FACE_H;
  const [c, ctx] = makeCanvas(W, H);

  const g = ctx.createLinearGradient(0, 0, W * 0.35, H);
  g.addColorStop(0, CREAM_HI);
  g.addColorStop(0.55, "#F7F1DF");
  g.addColorStop(1, CREAM_LO);
  roundRectPath(ctx, 8, 8, W - 16, H - 16, 42);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(210,162,76,0.85)";
  ctx.stroke();
  roundRectPath(ctx, 22, 22, W - 44, H - 44, 30);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(210,162,76,0.45)";
  ctx.stroke();

  const isRed = face.suit === "hearts" || face.suit === "diamonds";
  const color = face.rank === "JOKER" ? GOLD : isRed ? RED : INK;

  if (face.rank === "JOKER") {
    ctx.fillStyle = GOLD;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.save();
    ctx.translate(W / 2, H / 2 - 24);
    ctx.beginPath();
    const spikes = 5;
    const outer = 96;
    const inner = 40;
    for (let i = 0; i < spikes * 2; i++) {
      const rad = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / spikes) * i - Math.PI / 2;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = INK;
    ctx.textAlign = "center";
    ctx.font = "800 64px Outfit, Arial, sans-serif";
    ctx.fillText("JOKER", W / 2, H / 2 + 132);
    ctx.fillStyle = GOLD;
    ctx.font = "800 56px Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("★", 40, 96);
    ctx.save();
    ctx.translate(W - 40, H - 56);
    ctx.rotate(Math.PI);
    ctx.fillText("★", 0, 0);
    ctx.restore();
    texCache.set(key, finalize(c));
    return texCache.get(key)!;
  }

  const glyph = face.suit ? SUIT_GLYPH[face.suit] : "";

  const drawCorner = () => {
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.font = "800 80px Outfit, Arial, sans-serif";
    ctx.fillText(face.rank, 56, 96);
    ctx.font = "58px Arial, sans-serif";
    ctx.fillText(glyph, 56, 158);
  };
  drawCorner();
  ctx.save();
  ctx.translate(W, H);
  ctx.rotate(Math.PI);
  drawCorner();
  ctx.restore();

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  if (face.rank === "K" || face.rank === "Q" || face.rank === "J") {
    drawCrown(ctx, W / 2, H / 2 - 70, 56);
    ctx.fillStyle = color;
    ctx.font = "800 168px Outfit, Arial, sans-serif";
    ctx.fillText(face.rank, W / 2, H / 2 + 70);
    ctx.font = "84px Arial, sans-serif";
    ctx.fillText(glyph, W / 2, H / 2 + 168);
  } else if (face.rank === "A") {
    ctx.font = "220px Arial, sans-serif";
    ctx.fillText(glyph, W / 2, H / 2 + 86);
  } else {
    ctx.font = "800 210px Outfit, Arial, sans-serif";
    ctx.fillText(face.rank, W / 2, H / 2 + 46);
    ctx.font = "92px Arial, sans-serif";
    ctx.fillText(glyph, W / 2, H / 2 + 168);
  }

  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function backTexture(): THREE.CanvasTexture {
  const key = "back";
  const cached = texCache.get(key);
  if (cached) return cached;
  const W = FACE_W;
  const H = FACE_H;
  const [c, ctx] = makeCanvas(W, H);

  const g = ctx.createRadialGradient(W / 2, H * 0.42, 30, W / 2, H / 2, H * 0.78);
  g.addColorStop(0, "#1F5439");
  g.addColorStop(1, "#0A1C13");
  roundRectPath(ctx, 8, 8, W - 16, H - 16, 42);
  ctx.fillStyle = g;
  ctx.fill();

  ctx.lineWidth = 12;
  ctx.strokeStyle = GOLD;
  ctx.stroke();

  ctx.save();
  roundRectPath(ctx, 22, 22, W - 44, H - 44, 30);
  ctx.clip();
  ctx.strokeStyle = "rgba(232,197,122,0.22)";
  ctx.lineWidth = 3;
  for (let i = -H; i < W; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(i + H, 0);
    ctx.lineTo(i, H);
    ctx.stroke();
  }
  ctx.restore();

  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 96, 0, Math.PI * 2);
  ctx.fillStyle = "#123524";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.font = "120px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🥖", W / 2, H / 2 + 44);

  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function feltTexture(): THREE.CanvasTexture {
  const key = "felt";
  const cached = texCache.get(key);
  if (cached) return cached;
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.62);
  g.addColorStop(0, FELT_LIGHT);
  g.addColorStop(1, FELT_DARK);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const img = ctx.getImageData(0, 0, S, S);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const raw = Math.sin(i * 12.9898) * 43758.5453;
    const n = raw - Math.floor(raw);
    const d = (n - 0.5) * 12;
    data[i] = clampByte((data[i] ?? 0) + d);
    data[i + 1] = clampByte((data[i + 1] ?? 0) + d);
    data[i + 2] = clampByte((data[i + 2] ?? 0) + d);
  }
  ctx.putImageData(img, 0, 0);
  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function avatarTexture(avatar: string): THREE.CanvasTexture {
  const key = `av-${avatar}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = "#123524";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.font = "72px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(avatar || "🙂", S / 2, S / 2 + 6);
  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function nameplateTexture(seat: Seat3D): THREE.CanvasTexture {
  const key = `np-${seat.name}-${seat.isCurrent ? 1 : 0}-${seat.isDealer ? 1 : 0}-${seat.isCaller ? 1 : 0}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const w = 384;
  const h = 112;
  const [c, ctx] = makeCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  roundRectPath(ctx, 6, 18, w - 12, h - 36, 36);
  ctx.fillStyle = seat.isCurrent ? "rgba(232,197,122,0.92)" : "rgba(11,31,22,0.78)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = seat.isCurrent ? "#fff7e6" : "rgba(232,197,122,0.5)";
  ctx.stroke();

  ctx.fillStyle = seat.isCurrent ? "#1E1B16" : CREAM_HI;
  ctx.font = "700 40px Outfit, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let label = seat.name;
  if (seat.isDealer) label = "🎯 " + label;
  if (seat.isCaller) label = "🥖 " + label;
  if (label.length > 14) label = label.slice(0, 13) + "…";
  ctx.fillText(label, w / 2, h / 2 + 2);

  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function makeCardGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const w = CARD_W;
  const h = CARD_H;
  const r = 0.12;
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: CARD_T,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.012,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 8,
  });
  geo.translate(0, 0, -CARD_T / 2);
  geo.computeVertexNormals();

  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (bb) {
    const sizeX = bb.max.x - bb.min.x || 1;
    const sizeY = bb.max.y - bb.min.y || 1;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      uv[i * 2] = (px - bb.min.x) / sizeX;
      uv[i * 2 + 1] = (py - bb.min.y) / sizeY;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }
  return geo;
}

let CARD_GEO: THREE.BufferGeometry | null = null;
function cardGeometry(): THREE.BufferGeometry {
  if (!CARD_GEO) CARD_GEO = makeCardGeometry();
  return CARD_GEO;
}

const EDGE_COLOR = new THREE.Color("#EFE7CF");

function Card3D({
  position,
  rotation,
  front,
  back,
  faceUp,
  onClick,
  glowRef,
  castShadow = true,
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
  front: THREE.Texture;
  back: THREE.Texture;
  faceUp: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  glowRef?: (m: THREE.MeshPhysicalMaterial | null) => void;
  castShadow?: boolean;
}) {
  const geo = cardGeometry();

  const frontMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: front,
        roughness: 0.42,
        metalness: 0.0,
        clearcoat: 0.85,
        clearcoatRoughness: 0.28,
        emissive: new THREE.Color(GOLD_HI),
        emissiveIntensity: 0,
      }),
    [front],
  );
  const backMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        map: back,
        roughness: 0.4,
        metalness: 0.05,
        clearcoat: 0.85,
        clearcoatRoughness: 0.26,
        emissive: new THREE.Color(GOLD_HI),
        emissiveIntensity: 0,
      }),
    [back],
  );
  const edgeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: EDGE_COLOR,
        roughness: 0.55,
        metalness: 0.04,
      }),
    [],
  );

  useEffect(() => {
    const m = faceUp ? frontMat : backMat;
    glowRef?.(m);
    return () => glowRef?.(null);
  }, [glowRef, faceUp, frontMat, backMat]);

  useEffect(() => {
    return () => {
      frontMat.dispose();
      backMat.dispose();
      edgeMat.dispose();
    };
  }, [frontMat, backMat, edgeMat]);

  return (
    <group position={position} rotation={rotation}>
      <mesh geometry={geo} castShadow={castShadow} receiveShadow onClick={onClick}>
        <primitive object={frontMat} attach="material-0" />
        <primitive object={edgeMat} attach="material-1" />
      </mesh>
      <mesh position={[0, 0, -CARD_T / 2 - 0.0014]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_W - 0.02, CARD_H - 0.02]} />
        <primitive object={backMat} attach="material" />
      </mesh>
    </group>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function DrawStack({
  count,
  active,
  onDraw,
  reduced,
}: {
  count: number;
  active: boolean;
  onDraw: () => void;
  reduced: boolean;
}) {
  const back = backTexture();
  const shown = Math.min(Math.max(count, 0), 10);
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);

  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    if (active && !reduced) {
      g.position.y = Math.sin(state.clock.elapsedTime * 2.4) * 0.05 + 0.05;
      invalidate();
    } else if (g.position.y !== 0) {
      g.position.y = 0;
    }
  });

  const handle = active ? () => onDraw() : undefined;

  return (
    <group ref={ref} position={[-1.05, 0, 0.15]}>
      {shown === 0 ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
          <ringGeometry args={[0.05, CARD_W * 0.6, 32]} />
          <meshStandardMaterial color="#0d2a1d" roughness={0.95} transparent opacity={0.4} />
        </mesh>
      ) : (
        Array.from({ length: shown }, (_, i) => (
          <Card3D
            key={i}
            position={[0, i * CARD_T * 0.92 + CARD_T / 2, 0]}
            rotation={[-Math.PI / 2, 0, 0.02 * (i % 2 ? 1 : -1)]}
            front={back}
            back={back}
            faceUp={false}
            castShadow={i >= shown - 2}
            onClick={i === shown - 1 ? handle : undefined}
          />
        ))
      )}
    </group>
  );
}

function DiscardCard({
  card,
  active,
  onTake,
  reduced,
}: {
  card: Card | null;
  active: boolean;
  onTake: () => void;
  reduced: boolean;
}) {
  const back = backTexture();
  const ref = useRef<THREE.Group>(null);
  const prevId = useRef<string | null>(null);
  const anim = useRef(1);
  const invalidate = useThree((s) => s.invalidate);
  const front = card ? faceTexture({ rank: card.rank, suit: card.suit }) : back;

  useEffect(() => {
    if (card && card.id !== prevId.current) {
      anim.current = reduced ? 1 : 0;
      prevId.current = card.id;
      invalidate();
    }
    if (!card) prevId.current = null;
  }, [card, reduced, invalidate]);

  useFrame((_state, delta) => {
    const g = ref.current;
    if (!g) return;
    if (anim.current < 1) {
      anim.current = Math.min(1, anim.current + delta * 2.6);
      const e = easeOutCubic(anim.current);
      g.position.set(
        1.0 - (1 - e) * 0.6,
        CARD_T / 2 + (1 - e) * 1.9,
        0.15 + (1 - e) * 0.35,
      );
      g.rotation.set(-Math.PI / 2, 0, 0.16 - (1 - e) * 1.5);
      invalidate();
    }
  });

  if (!card) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.0, 0.002, 0.15]} receiveShadow>
        <ringGeometry args={[0.05, CARD_W * 0.6, 32]} />
        <meshStandardMaterial color="#0d2a1d" roughness={0.95} transparent opacity={0.4} />
      </mesh>
    );
  }

  return (
    <group ref={ref} position={[1.0, CARD_T / 2, 0.15]} rotation={[-Math.PI / 2, 0, 0.16]}>
      <Card3D front={front} back={back} faceUp onClick={active ? () => onTake() : undefined} />
    </group>
  );
}

interface SeatLayout {
  pos: [number, number, number];
  angle: number;
  scale: number;
}

function CardOnFelt({
  x,
  z,
  front,
  back,
  faceUp,
  reduced,
  onClick,
  registerGlow,
}: {
  x: number;
  z: number;
  front: THREE.Texture;
  back: THREE.Texture;
  faceUp: boolean;
  reduced: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  registerGlow: (m: THREE.MeshPhysicalMaterial | null) => void;
}) {
  const ref = useRef<THREE.Group>(null);
  const flip = useRef(faceUp ? 0 : Math.PI);
  const target = useRef(faceUp ? 0 : Math.PI);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    target.current = faceUp ? 0 : Math.PI;
    if (reduced) flip.current = target.current;
    invalidate();
  }, [faceUp, reduced, invalidate]);

  useFrame((_state, delta) => {
    const g = ref.current;
    if (!g) return;
    if (Math.abs(flip.current - target.current) > 0.001) {
      const dir = Math.sign(target.current - flip.current);
      flip.current += dir * Math.min(Math.abs(target.current - flip.current), delta * 8);
      const mid = Math.sin((flip.current / Math.PI) * Math.PI);
      g.position.y = mid * 0.18;
      g.rotation.z = flip.current;
      invalidate();
    } else if (g.position.y !== 0) {
      g.position.y = 0;
      g.rotation.z = target.current;
    }
  });

  return (
    <group position={[x, 0.002, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <group ref={ref} rotation={[0, 0, faceUp ? 0 : Math.PI]}>
        <Card3D
          position={[0, 0, CARD_T / 2]}
          front={front}
          back={back}
          faceUp={faceUp}
          onClick={onClick}
          glowRef={registerGlow}
        />
      </group>
    </group>
  );
}

function SeatCards({
  slots,
  layout,
  tappable,
  highlight,
  onTap,
  reduced,
  dealKey,
}: {
  slots: (Slot3D | null)[];
  layout: SeatLayout;
  tappable: boolean;
  highlight: boolean;
  onTap: (gridIndex: number) => void;
  reduced: boolean;
  dealKey: string;
}) {
  const back = backTexture();
  const invalidate = useThree((s) => s.invalidate);
  const groupRef = useRef<THREE.Group>(null);
  const glowMats = useRef<Map<number, THREE.MeshPhysicalMaterial>>(new Map());
  const dealStart = useRef<number | null>(null);
  const dealtKey = useRef<string>("");

  useEffect(() => {
    if (reduced) {
      dealStart.current = null;
      dealtKey.current = dealKey;
      invalidate();
      return;
    }
    if (dealtKey.current !== dealKey) {
      dealStart.current = -1;
      dealtKey.current = dealKey;
      invalidate();
    }
  }, [dealKey, reduced, invalidate]);

  const count = slots.length;
  const cols = count <= 3 ? Math.max(count, 1) : Math.ceil(count / 2);
  const rows = Math.max(1, Math.ceil(count / cols));
  const gapX = CARD_W * 0.92;
  const gapZ = CARD_H * 0.78;

  useFrame((state) => {
    const g = groupRef.current;
    if (!g) return;
    let needs = false;

    if (dealStart.current === -1) {
      dealStart.current = state.clock.elapsedTime;
    }
    if (dealStart.current !== null && dealStart.current >= 0) {
      const t = state.clock.elapsedTime - dealStart.current;
      let anyRunning = false;
      g.children.forEach((child, i) => {
        const delay = i * 0.06;
        const local = Math.min(1, Math.max(0, (t - delay) / 0.42));
        const e = easeOutCubic(local);
        child.position.y = (1 - e) * 1.6;
        child.scale.setScalar(0.6 + e * 0.4);
        if (local < 1) anyRunning = true;
      });
      if (anyRunning) needs = true;
      else dealStart.current = null;
    }

    if (highlight) {
      const pulse = 0.35 + Math.sin(state.clock.elapsedTime * 4) * 0.35 + 0.35;
      glowMats.current.forEach((m) => {
        m.emissiveIntensity = pulse * 0.7;
      });
      needs = true;
    } else {
      glowMats.current.forEach((m) => {
        if (m.emissiveIntensity !== 0) m.emissiveIntensity = 0;
      });
    }

    if (needs) invalidate();
  });

  return (
    <group position={layout.pos} rotation={[0, layout.angle, 0]} scale={layout.scale}>
      <group ref={groupRef}>
        {slots.map((s, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = (col - (cols - 1) / 2) * gapX;
          const z = (row - (rows - 1) / 2) * gapZ;
          if (!s) {
            return (
              <mesh key={`empty-${i}`} position={[x, 0.002, z]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[CARD_W * 0.9, CARD_H * 0.9]} />
                <meshStandardMaterial color="#0d2a1d" roughness={0.95} transparent opacity={0.22} />
              </mesh>
            );
          }
          const face = s.face;
          const front = face ? faceTexture(face) : back;
          return (
            <CardOnFelt
              key={s.id}
              x={x}
              z={z}
              front={front}
              back={back}
              faceUp={!!face}
              reduced={reduced}
              onClick={tappable ? () => onTap(i) : undefined}
              registerGlow={(m) => {
                if (m) glowMats.current.set(i, m);
                else glowMats.current.delete(i);
              }}
            />
          );
        })}
      </group>
    </group>
  );
}

function Nameplate({
  seat,
  position,
  angle,
}: {
  seat: Seat3D;
  position: [number, number, number];
  angle: number;
}) {
  const avTex = useMemo(() => avatarTexture(seat.avatar), [seat.avatar]);
  const labelTex = useMemo(
    () => nameplateTexture(seat),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seat.name, seat.isCurrent, seat.isDealer, seat.isCaller],
  );

  return (
    <group position={position} rotation={[0, angle, 0]}>
      <mesh position={[-0.78, 0.34, -0.55]} rotation={[-Math.PI / 2.6, 0, 0]}>
        <circleGeometry args={[0.3, 32]} />
        <meshBasicMaterial map={avTex} transparent toneMapped={false} />
      </mesh>
      <mesh position={[0.2, 0.3, -0.55]} rotation={[-Math.PI / 2.6, 0, 0]}>
        <planeGeometry args={[1.5, 0.42]} />
        <meshBasicMaterial map={labelTex} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

function FeltTable() {
  const tex = feltTexture();
  return (
    <group>
      <mesh position={[0, -0.02, 0.15]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[5.4, 96]} />
        <meshStandardMaterial map={tex} roughness={0.96} metalness={0} />
      </mesh>
      <mesh position={[0, -0.012, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.0, 4.2, 96]} />
        <meshStandardMaterial color={GOLD} roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, -0.011, 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.0, 2.06, 96]} />
        <meshStandardMaterial color={GOLD_HI} roughness={0.5} metalness={0.4} transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, 0.04, 0.15]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[4.45, 0.26, 20, 110]} />
        <meshStandardMaterial color="#4a3320" roughness={0.5} metalness={0.3} />
      </mesh>
    </group>
  );
}

function ProceduralEnv() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();

    const envScene = new THREE.Scene();
    const sphereGeo = new THREE.SphereGeometry(50, 24, 16);
    const sphereMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color("#3a2a14") },
        mid: { value: new THREE.Color("#1a120a") },
        bottom: { value: new THREE.Color("#06120c") },
      },
      vertexShader:
        "varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "varying vec3 vPos; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; void main(){ float h = vPos.y*0.5+0.5; vec3 col = mix(bottom, mid, smoothstep(0.0,0.55,h)); col = mix(col, top, smoothstep(0.55,1.0,h)); gl_FragColor = vec4(col,1.0); }",
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    envScene.add(sphere);

    const warmGeo = new THREE.PlaneGeometry(40, 40);
    const warmMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd9a0") });
    const warm = new THREE.Mesh(warmGeo, warmMat);
    warm.position.set(0, 30, 0);
    warm.lookAt(0, 0, 0);
    envScene.add(warm);

    const rt = pmrem.fromScene(envScene, 0.04);
    scene.environment = rt.texture;

    sphereGeo.dispose();
    sphereMat.dispose();
    warmGeo.dispose();
    warmMat.dispose();
    pmrem.dispose();

    return () => {
      scene.environment = null;
      rt.texture.dispose();
    };
  }, [gl, scene]);
  return null;
}

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

function Invalidate({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const id = window.setTimeout(invalidate, 80);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

function useFpsBudget(): boolean {
  const [ok, setOk] = useState(false);
  const samples = useRef<number[]>([]);
  const decided = useRef(false);
  useFrame((_s, delta) => {
    if (decided.current) return;
    samples.current.push(delta);
    if (samples.current.length >= 45) {
      const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
      decided.current = true;
      setOk(avg < 0.02);
    }
  });
  return ok;
}

function PostFx() {
  const enabled = useFpsBudget();
  if (!enabled) return null;
  return (
    <EffectComposer enableNormalPass={false}>
      <Bloom intensity={0.5} luminanceThreshold={0.72} luminanceSmoothing={0.25} mipmapBlur />
    </EffectComposer>
  );
}

function seatLayouts(n: number): SeatLayout[] {
  if (n <= 0) return [];
  const radius = 3.05;
  const centerZ = 0.15;
  const startA = (Math.PI * 5) / 6;
  const endA = Math.PI / 6;
  const layouts: SeatLayout[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = startA + (endA - startA) * t;
    const x = Math.cos(a) * radius;
    const z = centerZ - Math.sin(a) * radius;
    const angle = a - Math.PI / 2;
    const scale = n >= 4 ? 0.6 : 0.72;
    layouts.push({ pos: [x, 0, z], angle, scale });
  }
  return layouts;
}

function Scene(props: Table3DProps) {
  const reduced = usePrefersReducedMotion();
  const layouts = useMemo(() => seatLayouts(props.opponents.length), [props.opponents.length]);

  const ownDealKey = props.ownSlots.map((s) => (s ? s.id : "_")).join(",");

  return (
    <>
      <ProceduralEnv />
      <Resizer />

      <hemisphereLight args={["#cfe3d6", "#08140d", 0.55]} />
      <directionalLight
        position={[3, 7, 3.5]}
        intensity={1.6}
        color="#fff2d6"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={26}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={6}
        shadow-camera-bottom={-6}
        shadow-bias={-0.0004}
      />
      <pointLight position={[-3.5, 2.6, -2]} intensity={0.5} color={GOLD_HI} />
      <spotLight position={[0, 6.5, 1.5]} angle={0.7} penumbra={0.8} intensity={0.6} color="#ffe9c2" distance={20} />

      <FeltTable />

      <DrawStack count={props.drawCount} active={props.canDraw} onDraw={props.onDraw} reduced={reduced} />
      <DiscardCard card={props.discardTop} active={props.canTake} onTake={props.onTake} reduced={reduced} />

      <SeatCards
        slots={props.ownSlots}
        layout={{ pos: [0, 0, 2.35], angle: 0, scale: 0.92 }}
        tappable={props.ownTappable}
        highlight={props.ownHighlight}
        onTap={props.onOwnTap}
        reduced={reduced}
        dealKey={ownDealKey}
      />

      {props.opponents.map((seat, i) => {
        const layout = layouts[i];
        if (!layout) return null;
        const dealKey = seat.slots.map((s) => (s ? s.id : "_")).join(",");
        return (
          <group key={seat.id}>
            <SeatCards
              slots={seat.slots}
              layout={layout}
              tappable={props.opponentsTappable}
              highlight={props.opponentsTappable}
              onTap={(gridIndex) => props.onOpponentTap(seat.id, gridIndex)}
              reduced={reduced}
              dealKey={dealKey}
            />
            <Nameplate seat={seat} position={[layout.pos[0], 0, layout.pos[2]]} angle={layout.angle} />
          </group>
        );
      })}

      {!reduced && <PostFx />}

      <Invalidate
        deps={[
          props.drawCount,
          props.discardTop?.id ?? "none",
          props.canDraw,
          props.canTake,
          props.ownTappable,
          props.ownHighlight,
          props.opponentsTappable,
          ownDealKey,
          props.opponents
            .map(
              (s) =>
                `${s.id}:${s.isCurrent ? 1 : 0}:${s.slots
                  .map((x) => (x ? (x.face ? x.face.rank : "b") : "_"))
                  .join("")}`,
            )
            .join("|"),
          props.ownSlots.map((s) => (s ? (s.face ? s.face.rank : "b") : "_")).join(""),
        ]}
      />
    </>
  );
}

export function Table3D(props: Table3DProps) {
  return (
    <div className="table3d-host relative h-full min-h-[320px] w-full">
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 4.0, 5.6], fov: 42 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
        }}
        style={{ background: "transparent" }}
        onCreated={({ camera, gl }) => {
          camera.lookAt(0, -0.2, 0.4);
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Scene {...props} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between px-8 text-[11px] font-semibold text-cream/60">
        <span>{props.drawCount} kort</span>
        <span>{props.canTake ? "Tag toppen?" : "Afkast"}</span>
      </div>
    </div>
  );
}
