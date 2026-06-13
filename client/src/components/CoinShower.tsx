// Gold coin shower for the BIG WIN moment — coins burst up from the bottom and
// rain down, spinning (drawn as shaded ellipses to fake a spinning disc).
// Pure canvas, no assets. Respects reduced-motion.

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

interface Coin {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  spin: number;
  r: number;
}

export function CoinShower() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);

    const make = (burst: boolean): Coin => ({
      x: canvas.width * (0.5 + (Math.random() - 0.5) * (burst ? 0.5 : 1)),
      y: burst ? canvas.height * 0.62 : -Math.random() * canvas.height * 0.4,
      vx: (Math.random() - 0.5) * (burst ? 7 : 2) * dpr,
      vy: burst ? -(7 + Math.random() * 7) * dpr : (2 + Math.random() * 3) * dpr,
      phase: Math.random() * Math.PI * 2,
      spin: (0.12 + Math.random() * 0.18) * (Math.random() < 0.5 ? 1 : -1),
      r: (9 + Math.random() * 8) * dpr,
    });

    const coins: Coin[] = Array.from({ length: 110 }, (_, i) => make(i < 70));

    const drawCoin = (c: Coin) => {
      const wobble = Math.abs(Math.cos(c.phase)); // 0..1 = edge-on .. face-on
      ctx.save();
      ctx.translate(c.x, c.y);
      const w = c.r * (0.25 + wobble * 0.75);
      const grad = ctx.createLinearGradient(-w, -c.r, w, c.r);
      grad.addColorStop(0, "#FFE9A8");
      grad.addColorStop(0.5, "#E8C57A");
      grad.addColorStop(1, "#B8862E");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, w, c.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(120,80,20,0.5)";
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
      if (wobble > 0.4) {
        ctx.fillStyle = "rgba(120,80,20,0.55)";
        ctx.font = `bold ${c.r}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.scale((0.25 + wobble * 0.75), 1);
        ctx.fillText("★", 0, 1);
      }
      ctx.restore();
    };

    let raf = 0;
    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const c of coins) {
        c.x += c.vx;
        c.y += c.vy;
        c.vy += 0.22 * dpr;
        c.vx *= 0.995;
        c.phase += c.spin;
        if (c.y > canvas.height + 30) {
          Object.assign(c, make(false));
        }
        drawCoin(c);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduce]);

  if (reduce) return null;
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-40 h-full w-full" />;
}
