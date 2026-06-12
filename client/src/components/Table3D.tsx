// Real 3D table centrepiece (three.js / react-three-fiber): the draw and
// discard piles rendered as 3D cards with thickness, lighting and shadows on a
// felt podium. This replaces the flat central piles when 3D mode is on; the
// rest of the game stays as the (glossy) HTML layer on top.

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Card, Suit } from "@nu/shared";

const CARD_W = 1;
const CARD_H = 1.4;
const CARD_T = 0.03;

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  spades: "♠",
  clubs: "♣",
};
const RED = "#B43A2E";
const INK = "#1E1B16";
const GOLD = "#D2A24C";

// --- Canvas textures for card faces/backs (cached by key) -------------------

const texCache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function faceTexture(card: Pick<Card, "rank" | "suit">): THREE.CanvasTexture {
  const key = `f-${card.rank}-${card.suit ?? "x"}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const W = 256;
  const H = 358;
  const [c, ctx] = makeCanvas(W, H);
  // cream gradient
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#FBF6E6");
  g.addColorStop(1, "#E4DAC0");
  roundRect(ctx, 4, 4, W - 8, H - 8, 26);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(210,162,76,0.45)";
  ctx.stroke();

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const color = card.rank === "JOKER" ? GOLD : isRed ? RED : INK;
  ctx.fillStyle = color;
  ctx.textAlign = "left";

  if (card.rank === "JOKER") {
    ctx.textAlign = "center";
    ctx.font = "900 64px Outfit, Arial, sans-serif";
    ctx.fillText("★", W / 2, H / 2 - 24);
    ctx.font = "800 40px Outfit, Arial, sans-serif";
    ctx.fillText("JOKER", W / 2, H / 2 + 60);
  } else {
    const glyph = card.suit ? SUIT_GLYPH[card.suit] : "";
    ctx.font = "800 54px Outfit, Arial, sans-serif";
    ctx.fillText(card.rank, 20, 64);
    ctx.font = "40px Arial, sans-serif";
    ctx.fillText(glyph, 22, 108);
    // center
    ctx.textAlign = "center";
    ctx.font = "800 132px Outfit, Arial, sans-serif";
    ctx.fillText(card.rank, W / 2, H / 2 + 56);
    // bottom-right mirrored
    ctx.save();
    ctx.translate(W - 20, H - 30);
    ctx.rotate(Math.PI);
    ctx.textAlign = "left";
    ctx.font = "800 54px Outfit, Arial, sans-serif";
    ctx.fillText(card.rank, 0, 0);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

function backTexture(): THREE.CanvasTexture {
  const key = "back";
  const cached = texCache.get(key);
  if (cached) return cached;
  const W = 256;
  const H = 358;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H / 2, H * 0.7);
  g.addColorStop(0, "#1B4A33");
  g.addColorStop(1, "#0B1F16");
  roundRect(ctx, 4, 4, W - 8, H - 8, 26);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.fillStyle = "rgba(232,197,122,0.9)";
  ctx.font = "70px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🥖", W / 2, H / 2 + 26);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}

// --- Card mesh --------------------------------------------------------------

const EDGE_COLOR = new THREE.Color("#F0E8D0");

function CardMesh({
  position,
  rotation,
  topTexture,
  onClick,
}: {
  position: [number, number, number];
  rotation?: [number, number, number];
  topTexture: THREE.Texture;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}) {
  // Box faces: [+X,-X,+Y,-Y,+Z,-Z]. The card lies flat (rotated -90° about X),
  // so the local +Z face points up — that's index 4, where the texture goes.
  const materials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.7 });
    const top = new THREE.MeshStandardMaterial({ map: topTexture, roughness: 0.5 });
    const bottom = new THREE.MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.7 });
    return [edge, edge, edge, edge, top, bottom];
  }, [topTexture]);

  return (
    <mesh
      position={position}
      rotation={rotation ?? [-Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
      material={materials}
      onClick={onClick}
    >
      <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
    </mesh>
  );
}

function DrawStack({ count, onDraw }: { count: number; onDraw?: () => void }) {
  const back = backTexture();
  const shown = Math.min(Math.max(count, 0), 7);
  return (
    <group position={[-0.95, 0, 0]}>
      {Array.from({ length: shown }, (_, i) => (
        <CardMesh
          key={i}
          position={[0, i * CARD_T * 1.05, 0]}
          topTexture={back}
          onClick={i === shown - 1 && onDraw ? () => onDraw() : undefined}
        />
      ))}
      {shown === 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
          <meshStandardMaterial color="#0d2a1d" roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}

function DiscardCard({ card, onTake }: { card: Card | null; onTake?: () => void }) {
  const tex = card ? faceTexture(card) : null;
  if (!tex) {
    return (
      <mesh position={[0.95, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
        <meshStandardMaterial color="#0d2a1d" roughness={0.9} transparent opacity={0.6} />
      </mesh>
    );
  }
  return (
    <CardMesh
      position={[0.95, 0.06, 0]}
      rotation={[-Math.PI / 2, 0, 0.12]}
      topTexture={tex}
      onClick={onTake ? () => onTake() : undefined}
    />
  );
}

function Felt() {
  return (
    <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[2.6, 48]} />
      <meshStandardMaterial color="#123524" roughness={0.95} />
    </mesh>
  );
}

/** Re-render on demand whenever the visible state changes. */
function Invalidate({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    // a couple of frames so textures/shadows settle
    const id = setTimeout(invalidate, 60);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

/**
 * Explicitly size the renderer to its parent. r3f's auto-resize can fail to
 * fire in some embedded/iframe contexts, so we drive it ourselves to guarantee
 * the canvas always fills the table area with the correct aspect ratio.
 */
function Resizer() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const parent = gl.domElement.parentElement;
    if (!parent) return;
    const apply = () => {
      const w = parent.clientWidth || 320;
      const h = parent.clientHeight || 220;
      gl.setSize(w, h, true);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        (camera as THREE.PerspectiveCamera).aspect = w / h;
        camera.updateProjectionMatrix();
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

export interface Table3DProps {
  drawCount: number;
  discardTop: Card | null;
  canDraw: boolean;
  canTake: boolean;
  onDraw: () => void;
  onTake: () => void;
}

export function Table3D({ drawCount, discardTop, canDraw, canTake, onDraw, onTake }: Table3DProps) {
  const topKey = discardTop ? discardTop.id : "none";
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="table3d-host relative h-[230px] w-full">
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 3.4, 3.6], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[2.5, 6, 3]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={1}
          shadow-camera-far={20}
          shadow-camera-left={-4}
          shadow-camera-right={4}
          shadow-camera-top={4}
          shadow-camera-bottom={-4}
        />
        <pointLight position={[-3, 2, -2]} intensity={0.4} color="#E8C57A" />
        <Resizer />
        <Felt />
        <DrawStack count={drawCount} onDraw={canDraw ? onDraw : undefined} />
        <DiscardCard card={discardTop} onTake={canTake ? onTake : undefined} />
        <Invalidate deps={[drawCount, topKey, canDraw, canTake]} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between px-10 text-[11px] font-semibold text-cream/55">
        <span>{drawCount} kort</span>
        <span>{canTake ? "Tag toppen?" : "Afkast"}</span>
      </div>
    </div>
  );
}
