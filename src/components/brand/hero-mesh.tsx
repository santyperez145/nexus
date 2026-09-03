export function HeroMesh({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1440 900"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id="nx-wash" cx="50%" cy="42%" r="68%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.22" />
          <stop offset="40%" stopColor="#fbbf24" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#fafaf9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nx-horizon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fafaf9" stopOpacity="0" />
          <stop offset="100%" stopColor="#fafaf9" stopOpacity="1" />
        </linearGradient>
        <filter id="nx-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <rect width="1440" height="900" fill="#fafaf9" />
      <ellipse cx="720" cy="380" rx="520" ry="280" fill="url(#nx-wash)" filter="url(#nx-soft)" />
      <g stroke="#b45309" strokeOpacity="0.28" strokeWidth="1.15">
        <path className="nexus-mesh-line" d="M90 160C310 210 460 300 720 380" />
        <path className="nexus-mesh-line" d="M40 400C260 360 480 370 720 380" />
        <path className="nexus-mesh-line" d="M110 680C340 540 520 440 720 380" />
        <path className="nexus-mesh-line" d="M1350 130C1100 220 900 310 720 380" />
        <path className="nexus-mesh-line" d="M1400 410C1140 390 920 380 720 380" />
        <path className="nexus-mesh-line" d="M1320 740C1080 560 900 430 720 380" />
        <path className="nexus-mesh-line" d="M720 40V380" />
        <path className="nexus-mesh-line" d="M720 380V860" />
        <path className="nexus-mesh-line" d="M220 240C420 300 560 340 720 380" />
        <path className="nexus-mesh-line" d="M1220 250C1020 310 860 350 720 380" />
      </g>
      <g fill="#d97706">
        <circle className="nexus-mesh-node" cx="90" cy="160" r="4.5" fillOpacity="0.7" />
        <circle className="nexus-mesh-node" cx="40" cy="400" r="4.5" fillOpacity="0.7" />
        <circle className="nexus-mesh-node" cx="110" cy="680" r="4.5" fillOpacity="0.7" />
        <circle className="nexus-mesh-node" cx="1350" cy="130" r="4.5" fillOpacity="0.7" />
        <circle className="nexus-mesh-node" cx="1400" cy="410" r="4.5" fillOpacity="0.7" />
        <circle className="nexus-mesh-node" cx="1320" cy="740" r="4.5" fillOpacity="0.7" />
        <circle className="nexus-hub-dot" cx="720" cy="380" r="7" fillOpacity="0.85" />
      </g>
      <rect width="1440" height="900" fill="url(#nx-horizon)" />
    </svg>
  );
}
