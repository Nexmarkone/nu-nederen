// App logo: a fan of three cards, a crown and the baguette. Pure SVG.

export function Logo({ className = "w-40" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} aria-label="Nu Nederen">
      <defs>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E8C57A" />
          <stop offset="1" stopColor="#D2A24C" />
        </linearGradient>
      </defs>
      {/* Card fan */}
      <g transform="translate(100 92)">
        <g transform="rotate(-18) translate(-58 -38)">
          <rect width="62" height="88" rx="9" fill="#F5EFDC" stroke="#D2A24C" strokeWidth="2.5" />
          <text x="10" y="30" fontSize="24" fontWeight="800" fill="#B43A2E" fontFamily="Outfit, system-ui">
            5
          </text>
          <text x="31" y="62" fontSize="26" fill="#B43A2E" textAnchor="middle">
            ♥
          </text>
        </g>
        <g transform="rotate(18) translate(-4 -38)">
          <rect width="62" height="88" rx="9" fill="#F5EFDC" stroke="#D2A24C" strokeWidth="2.5" />
          <text x="10" y="30" fontSize="24" fontWeight="800" fill="#1E1B16" fontFamily="Outfit, system-ui">
            K
          </text>
          <text x="31" y="62" fontSize="26" fill="#1E1B16" textAnchor="middle">
            ♠
          </text>
        </g>
        <g transform="translate(-31 -46)">
          <rect width="62" height="88" rx="9" fill="#123524" stroke="#E8C57A" strokeWidth="2.5" />
          <text x="31" y="56" fontSize="30" textAnchor="middle">
            🥖
          </text>
        </g>
      </g>
      {/* Crown */}
      <g transform="translate(100 26)">
        <path
          d="M -26 14 L -19 -8 L -8 6 L 0 -14 L 8 6 L 19 -8 L 26 14 Z"
          fill="url(#logo-gold)"
          stroke="#0B1F16"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="-19" cy="-10" r="3.4" fill="#E8C57A" />
        <circle cx="0" cy="-16" r="3.4" fill="#E8C57A" />
        <circle cx="19" cy="-10" r="3.4" fill="#E8C57A" />
      </g>
    </svg>
  );
}
