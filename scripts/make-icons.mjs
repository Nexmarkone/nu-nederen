// Generates PWA icons (192/512 + maskable + apple-touch-icon) from the
// logo SVG using sharp. Run once: npm run icons — output is committed so the
// Docker build doesn't need sharp.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("client/public/icons");

// Pure-vector icon (no emoji — sharp has no emoji font): card fan + crown.
function iconSvg(padding = 0) {
  const s = 512 - padding * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="felt" cx="0.5" cy="0.35" r="0.9">
      <stop offset="0" stop-color="#1B4A33"/>
      <stop offset="0.6" stop-color="#123524"/>
      <stop offset="1" stop-color="#0B1F16"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E8C57A"/>
      <stop offset="1" stop-color="#D2A24C"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${padding > 0 ? 0 : 110}" fill="url(#felt)"/>
  <g transform="translate(256 256) scale(${s / 512}) translate(-256 -256)">
    <g transform="translate(256 300)">
      <g transform="rotate(-20) translate(-150 -100)">
        <rect width="160" height="224" rx="22" fill="#F5EFDC" stroke="#D2A24C" stroke-width="8"/>
        <text x="28" y="78" font-size="64" font-weight="800" fill="#B43A2E" font-family="Arial, sans-serif">5</text>
        <text x="80" y="160" font-size="72" fill="#B43A2E" text-anchor="middle" font-family="Arial, sans-serif">&#9829;</text>
      </g>
      <g transform="rotate(20) translate(-10 -100)">
        <rect width="160" height="224" rx="22" fill="#F5EFDC" stroke="#D2A24C" stroke-width="8"/>
        <text x="28" y="78" font-size="64" font-weight="800" fill="#1E1B16" font-family="Arial, sans-serif">K</text>
        <text x="80" y="160" font-size="72" fill="#1E1B16" text-anchor="middle" font-family="Arial, sans-serif">&#9824;</text>
      </g>
      <g transform="translate(-80 -120)">
        <rect width="160" height="224" rx="22" fill="#123524" stroke="#E8C57A" stroke-width="8"/>
        <!-- baguette: a golden loaf with scores -->
        <g transform="translate(80 112) rotate(-38)">
          <ellipse cx="0" cy="0" rx="26" ry="74" fill="url(#gold)" stroke="#0B1F16" stroke-width="5"/>
          <line x1="-13" y1="-40" x2="13" y2="-32" stroke="#0B1F16" stroke-width="5" stroke-linecap="round"/>
          <line x1="-15" y1="-12" x2="15" y2="-4" stroke="#0B1F16" stroke-width="5" stroke-linecap="round"/>
          <line x1="-15" y1="16" x2="15" y2="24" stroke="#0B1F16" stroke-width="5" stroke-linecap="round"/>
        </g>
      </g>
    </g>
    <g transform="translate(256 92)">
      <path d="M -78 42 L -57 -24 L -24 18 L 0 -42 L 24 18 L 57 -24 L 78 42 Z"
        fill="url(#gold)" stroke="#0B1F16" stroke-width="8" stroke-linejoin="round"/>
      <circle cx="-57" cy="-32" r="11" fill="#E8C57A"/>
      <circle cx="0" cy="-50" r="11" fill="#E8C57A"/>
      <circle cx="57" cy="-32" r="11" fill="#E8C57A"/>
    </g>
  </g>
</svg>`;
}

await mkdir(OUT, { recursive: true });

const normal = Buffer.from(iconSvg(0));
const maskable = Buffer.from(iconSvg(64)); // safe-zone padding

const jobs = [
  ["icon-192.png", normal, 192],
  ["icon-512.png", normal, 512],
  ["maskable-192.png", maskable, 192],
  ["maskable-512.png", maskable, 512],
  ["apple-touch-icon.png", maskable, 180],
];

for (const [name, svg, size] of jobs) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  await writeFile(path.join(OUT, name), png);
  console.log(`✓ ${name} (${size}x${size}, ${png.length} bytes)`);
}
console.log("Ikoner genereret i", OUT);
