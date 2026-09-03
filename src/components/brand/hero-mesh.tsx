export function HeroMesh({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 820"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="nx-hero-wash" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.16" />
          <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1440" height="820" fill="url(#nx-hero-wash)" />
      <g stroke="#b45309" strokeOpacity="0.22" strokeWidth="1.2">
        <path className="nexus-mesh-line" d="M120 140C320 180 420 300 720 360" />
        <path className="nexus-mesh-line" d="M80 420C280 380 480 400 720 360" />
        <path className="nexus-mesh-line" d="M160 700C340 560 520 430 720 360" />
        <path className="nexus-mesh-line" d="M1320 120C1080 200 900 300 720 360" />
        <path className="nexus-mesh-line" d="M1360 390C1120 370 920 350 720 360" />
        <path className="nexus-mesh-line" d="M1280 720C1060 560 880 420 720 360" />
        <path className="nexus-mesh-line" d="M720 40V360" />
        <path className="nexus-mesh-line" d="M720 360V780" />
      </g>
      <g fill="#d97706" fillOpacity="0.55">
        <circle className="nexus-mesh-node" cx="120" cy="140" r="4" />
        <circle className="nexus-mesh-node" cx="80" cy="420" r="4" />
        <circle className="nexus-mesh-node" cx="160" cy="700" r="4" />
        <circle className="nexus-mesh-node" cx="1320" cy="120" r="4" />
        <circle className="nexus-mesh-node" cx="1360" cy="390" r="4" />
        <circle className="nexus-mesh-node" cx="1280" cy="720" r="4" />
      </g>
    </svg>
  );
}
