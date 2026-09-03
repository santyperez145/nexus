function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const PALETTES = [
  ["#111827", "#7c3aed", "#f59e0b"],
  ["#172554", "#2563eb", "#22d3ee"],
  ["#3f0d12", "#a21caf", "#fb7185"],
  ["#052e16", "#059669", "#a3e635"],
  ["#292524", "#ea580c", "#facc15"],
  ["#18181b", "#475569", "#c4b5fd"],
] as const;

export function ModelArtwork({
  id,
  name,
  className = "h-16 w-16",
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const hash = stableHash(id);
  const colors = PALETTES[hash % PALETTES.length];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const angle = 105 + (hash % 80);
  const x = 18 + (hash % 58);
  const y = 16 + ((hash >>> 5) % 62);

  return (
    <div
      role="img"
      aria-label={`Identidad visual original de ${name}`}
      className={`relative shrink-0 overflow-hidden rounded-2xl border border-white/25 shadow-sm ${className}`}
      style={{ background: `linear-gradient(${angle}deg, ${colors[0]}, ${colors[1]} 58%, ${colors[2]})` }}
    >
      <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx={x} cy={y} r="33" fill="none" stroke="rgba(255,255,255,.24)" strokeWidth="1.5" />
        <circle cx={100 - x / 2} cy={100 - y / 2} r="24" fill="rgba(255,255,255,.08)" />
        <path
          d={`M-8 ${72 - (hash % 20)} C 22 ${15 + (hash % 24)}, 68 ${104 - (hash % 28)}, 108 ${25 + (hash % 38)}`}
          fill="none"
          stroke="rgba(255,255,255,.48)"
          strokeWidth="2"
        />
      </svg>
      <span className="absolute bottom-2 left-2 font-mono text-sm font-semibold tracking-tight text-white/95">
        {initials || "AI"}
      </span>
    </div>
  );
}
