/** SVG sparkline — datos reales, sin fake smoothing marketing. */
export function Sparkline({
  values,
  className = "h-10 w-full",
  stroke = "oklch(0.488 0.22 277)",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  const w = 120;
  const h = 32;
  const max = Math.max(1, ...values);
  if (!values.length) {
    return <div className={`${className} rounded bg-white/5`} aria-hidden />;
  }
  const pts = values
    .map((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
      const y = h - (v / max) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none" aria-hidden>
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" points={pts} />
    </svg>
  );
}
