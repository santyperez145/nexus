/** Diagrama de routing: un slug → varios labs. Wired = keys reales de esta instancia. */
export function RoutingViz({
  className,
  wired = [],
}: {
  className?: string;
  /** Adapter ids cableados ahora (sin inventar uptime). */
  wired?: string[];
}) {
  const live = new Set(wired);
  const rows = [
    { y: 40, label: "groq" },
    { y: 70, label: "openai" },
    { y: 130, label: "together" },
    { y: 210, label: "fireworks" },
    { y: 170, label: "anthropic" },
  ].map((r) => ({ ...r, on: live.has(r.label) }));

  // Si no hay wired, iluminá openai como ejemplo de path (no “live”).
  const anyLive = rows.some((r) => r.on);
  const display = anyLive
    ? rows
    : rows.map((r) => ({ ...r, on: r.label === "openai" }));

  return (
    <svg
      className={className}
      viewBox="0 0 640 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Un modelo, varios laboratorios con fallback"
    >
      <text x="48" y="36" fill="#71717a" fontSize="12" fontFamily="ui-monospace, monospace">
        slug
      </text>
      <rect x="32" y="48" width="168" height="44" rx="4" stroke="#d4d4d8" fill="#fff" />
      <text x="48" y="76" fill="#18181b" fontSize="13" fontFamily="ui-monospace, monospace">
        openai/gpt-5
      </text>
      <path d="M200 70H280" stroke="#d97706" strokeWidth="1.5" strokeDasharray="4 4" className="nexus-mesh-line" />
      <circle cx="300" cy="70" r="18" stroke="#d97706" strokeWidth="2" fill="#fffbeb" />
      <text x="292" y="75" fill="#b45309" fontSize="14" fontWeight="600">
        N
      </text>
      <path d="M318 58C380 30 420 28 500 40" stroke="#a1a1aa" strokeWidth="1.2" />
      <path d="M318 70H500" stroke="#d97706" strokeWidth="1.5" />
      <path d="M318 82C380 110 420 120 500 130" stroke="#a1a1aa" strokeWidth="1.2" />
      <path d="M318 94C360 160 400 200 500 210" stroke="#a1a1aa" strokeWidth="1.2" />
      <path d="M318 88C360 140 420 165 500 170" stroke="#a1a1aa" strokeWidth="1.2" />
      {display.map((row) => (
        <g key={row.label}>
          <rect
            x="500"
            y={row.y - 16}
            width="108"
            height="32"
            rx="4"
            stroke={row.on ? "#d97706" : "#e4e4e7"}
            fill={row.on ? "#fffbeb" : "#fff"}
          />
          <text
            x="516"
            y={row.y + 5}
            fill={row.on ? "#92400e" : "#71717a"}
            fontSize="12"
            fontFamily="ui-monospace, monospace"
          >
            {row.label}
            {anyLive && row.on ? " ●" : ""}
          </text>
        </g>
      ))}
      <text x="32" y="260" fill="#a1a1aa" fontSize="12">
        {anyLive
          ? `${live.size} lab(s) cableados en esta instancia · fallback al siguiente.`
          : "Sin providers cableados no se ejecuta inferencia. Agregá una key de plataforma o BYOK."}
      </text>
    </svg>
  );
}
