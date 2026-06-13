// Real 3D table centrepiece (three.js / react-three-fiber): an immersive felt
// table with the draw and discard piles as 3D cards — chunky deck, glossy
// faces, warm lighting, soft shadows and a deal-in animation. Replaces the flat
// central piles when 3D mode is on; the rest of the game stays as HTML on top.

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Card, Suit } from "@nu/shared";

const CARD_W = 1;
const CARD_H = 1.4;
const CARD_T = 0.05;

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  spades: "♠",
  clubs: "♣",
};
const RED = "#C0392B";
const INK = "#1E1B16";
const GOLD = "#D2A24C";

// --- Canvas textures (cached) ----------------------------------------------

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

function finalize(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function faceTexture(card: Pick<Card, "rank" | "suit">): THREE.CanvasTexture {
  const key = `f-${card.rank}-${card.suit ?? "x"}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const W = 410;
  const H = 574;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, "#FFFDF6");
  g.addColorStop(0.5, "#F7F1DF");
  g.addColorStop(1, "#E4DAC0");
  roundRect(ctx, 6, 6, W - 12, H - 12, 40);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "rgba(210,162,76,0.55)";
  ctx.stroke();

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const color = card.rank === "JOKER" ? GOLD : isRed ? RED : INK;
  ctx.fillStyle = color;
  ctx.textAlign = "left";

  if (card.rank === "JOKER") {
    ctx.textAlign = "center";
    ctx.font = "900 110px Outfit, Arial, sans-serif";
    ctx.fillText("★", W / 2, H / 2 - 30);
    ctx.font = "800 60px Outfit, Arial, sans-serif";
    ctx.fillText("JOKER", W / 2, H / 2 + 90);
  } else {
    const glyph = card.suit ? SUIT_GLYPH[card.suit] : "";
    ctx.font = "800 88px Outfit, Arial, sans-serif";
    ctx.fillText(card.rank, 34, 104);
    ctx.font = "62px Arial, sans-serif";
    ctx.fillText(glyph, 38, 176);
    ctx.textAlign = "center";
    ctx.font = "800 210px Outfit, Arial, sans-serif";
    ctx.fillText(card.rank, W / 2, H / 2 + 86);
    ctx.font = "76px Arial, sans-serif";
    ctx.fillText(glyph, W / 2, H - 70);
    ctx.save();
    ctx.translate(W - 34, H - 48);
    ctx.rotate(Math.PI);
    ctx.textAlign = "left";
    ctx.font = "800 88px Outfit, Arial, sans-serif";
    ctx.fillText(card.rank, 0, 0);
    ctx.restore();
  }
  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function backTexture(): THREE.CanvasTexture {
  const key = "back";
  if (texCache.has(key)) return texCache.get(key)!;
  const W = 410;
  const H = 574;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createRadialGradient(W / 2, H * 0.42, 30, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, "#1F5439");
  g.addColorStop(1, "#0B1F16");
  roundRect(ctx, 6, 6, W - 12, H - 12, 40);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  // gold lattice
  ctx.strokeStyle = "rgba(232,197,122,0.25)";
  ctx.lineWidth = 3;
  for (let i = -H; i < W; i += 46) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(232,197,122,0.95)";
  ctx.font = "120px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🥖", W / 2, H / 2 + 42);
  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

function feltTexture(): THREE.CanvasTexture {
  const key = "felt";
  if (texCache.has(key)) return texCache.get(key)!;
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.62);
  g.addColorStop(0, "#1A4A33");
  g.addColorStop(1, "#0C2418");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // subtle felt speckle
  const img = ctx.getImageData(0, 0, S, S);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const d = (n - Math.floor(n) - 0.5) * 14;
    data[i] = Math.max(0, Math.min(255, (data[i] ?? 0) + d));
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] ?? 0) + d));
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] ?? 0) + d));
  }
  ctx.putImageData(img, 0, 0);
  texCache.set(key, finalize(c));
  return texCache.get(key)!;
}

// --- Card mesh --------------------------------------------------------------

const EDGE_COLOR = new THREE.Color("#EFE7CF");

function cardMaterials(topTexture: THREE.Texture): THREE.Material[] {
  const edge = new THREE.MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.5, metalness: 0.05 });
  // Physical material with clearcoat = a laminated, glossy playing-card sheen.
  const top = new THREE.MeshPhysicalMaterial({
    map: topTexture,
    roughness: 0.42,
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.26,
  });
  const bottom = new THREE.MeshStandardMaterial({ color: EDGE_COLOR, roughness: 0.6 });
  // Box faces: [+X,-X,+Y,-Y,+Z,-Z]; flat card -> +Z(index4) faces up.
  return [edge, edge, edge, edge, top, bottom];
}

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
  const materials = useMemo(() => cardMaterials(topTexture), [topTexture]);
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
  const shown = Math.min(Math.max(count, 0), 9);
  const ref = useRef<THREE.Group>(null);
  const invalidate = useThree((s) => s.invalidate);
  // gentle invite bob when it's your turn to draw (self-sustains under demand)
  useFrame((state) => {
    if (!ref.current) return;
    if (onDraw) {
      ref.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.04 + 0.04;
      invalidate();
    } else if (ref.current.position.y !== 0) {
      ref.current.position.y = 0;
    }
  });
  return (
    <group ref={ref} position={[-0.95, 0, 0]}>
      {Array.from({ length: shown }, (_, i) => (
        <CardMesh
          key={i}
          position={[0, i * CARD_T * 0.9, 0]}
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

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function DiscardCard({ card, onTake }: { card: Card | null; onTake?: () => void }) {
  const ref = useRef<THREE.Group>(null);
  const prevId = useRef<string | null>(null);
  const anim = useRef(1);
  const tex = card ? faceTexture(card) : null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    if (card && card.id !== prevId.current) {
      anim.current = 0; // (re)start the deal-in animation
      prevId.current = card.id;
    }
  }, [card?.id]);

  useFrame((_state, delta) => {
    const g = ref.current;
    if (!g) return;
    if (anim.current < 1) {
      anim.current = Math.min(1, anim.current + delta * 2.4);
      const e = easeOut(anim.current);
      g.position.set(0.95 - (1 - e) * 0.5, 0.09 + (1 - e) * 1.7, (1 - e) * 0.3);
      g.rotation.set(-Math.PI / 2, 0, 0.14 - (1 - e) * 1.3);
      invalidate(); // sustain the deal-in animation under demand
    }
  });

  if (!tex) {
    return (
      <mesh position={[0.95, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
        <meshStandardMaterial color="#0d2a1d" roughness={0.9} transparent opacity={0.55} />
      </mesh>
    );
  }
  return (
    <group ref={ref} position={[0.95, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0.14]}>
      <mesh castShadow receiveShadow material={cardMaterials(tex)} onClick={onTake ? () => onTake() : undefined}>
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
      </mesh>
    </group>
  );
}

function Felt() {
  const tex = feltTexture();
  return (
    <group>
      {/* table top */}
      <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[3.7, 72]} />
        <meshStandardMaterial map={tex} roughness={0.95} metalness={0} />
      </mesh>
      {/* gold inlay ring */}
      <mesh position={[0, -0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.5, 3.66, 72]} />
        <meshStandardMaterial color={GOLD} roughness={0.4} metalness={0.55} />
      </mesh>
      {/* padded leather/brass rail around the table */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <torusGeometry args={[3.78, 0.2, 18, 80]} />
        <meshStandardMaterial color="#4a3320" roughness={0.45} metalness={0.35} />
      </mesh>
    </group>
  );
}

/** Kick a render when the visible state changes (demand mode). */
function Invalidate({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    const id = setTimeout(invalidate, 90);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
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
      const h = parent.clientHeight || 300;
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

export interface Table3DProps {
  drawCount: number;
  discardTop: Card | null;
  canDraw: boolean;
  canTake: boolean;
  onDraw: () => void;
  onTake: () => void;
}

export function Table3D({ drawCount, discardTop, canDraw, canTake, onDraw, onTake }: Table3DProps) {
  return (
    <div className="table3d-host relative h-full min-h-[300px] w-full">
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [0, 2.55, 4.35], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
        onCreated={({ camera }) => camera.lookAt(0, -0.25, 0)}
      >
        <hemisphereLight args={["#cfe3d6", "#0a1c13", 0.7]} />
        <directionalLight
          position={[3, 6.5, 3.5]}
          intensity={1.7}
          color="#fff4dd"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-near={1}
          shadow-camera-far={24}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
          shadow-bias={-0.0005}
        />
        <pointLight position={[-3.5, 2.5, -2]} intensity={0.6} color="#E8C57A" />
        <Resizer />
        <Felt />
        <DrawStack count={drawCount} onDraw={canDraw ? onDraw : undefined} />
        <DiscardCard card={discardTop} onTake={canTake ? onTake : undefined} />
        <Invalidate deps={[drawCount, discardTop?.id ?? "none", canDraw, canTake]} />
      </Canvas>
      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-between px-8 text-[11px] font-semibold text-cream/60">
        <span>{drawCount} kort</span>
        <span>{canTake ? "Tag toppen?" : "Afkast"}</span>
      </div>
    </div>
  );
}
