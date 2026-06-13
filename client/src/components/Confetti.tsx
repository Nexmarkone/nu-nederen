// Tiny canvas confetti — no library needed.

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

const COLORS = ["#E8C57A", "#D2A24C", "#F5EFDC", "#3E8E5A", "#B43A2E", "#FFFFFF", "#F2C94C"];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  w: number;
  h: number;
  color: string;
}

export function Confetti() {
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

    // Burst from the top corners like a party popper, plus a falling rain.
    const particles: Particle[] = Array.from({ length: 240 }, (_, i) => {
      const popper = i < 90;
      const fromLeft = i % 2 === 0;
      return {
        x: popper ? (fromLeft ? 0 : canvas.width) : Math.random() * canvas.width,
        y: popper ? canvas.height * 0.12 : -Math.random() * canvas.height * 0.6,
        vx: popper
          ? (fromLeft ? 1 : -1) * (3 + Math.random() * 5) * dpr
          : (Math.random() - 0.5) * 1.8 * dpr,
        vy: popper ? -(2 + Math.random() * 4) * dpr : (1.2 + Math.random() * 2.4) * dpr,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.22,
        w: (5 + Math.random() * 7) * dpr,
        h: (8 + Math.random() * 9) * dpr,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      };
    });

    let raf = 0;
    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx + Math.sin(p.y * 0.01) * 0.6 * dpr;
        p.y += p.vy;
        p.vy += 0.06 * dpr; // gravity so popper bursts arc back down
        p.vx *= 0.992; // air drag
        p.rot += p.vrot;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
          p.vy = (1.2 + Math.random() * 2.4) * dpr;
          p.vx = (Math.random() - 0.5) * 1.8 * dpr;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
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
