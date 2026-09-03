import { cn } from "@/lib/utils";

type MarkProps = {
  className?: string;
  title?: string;
};

/** N con nodo central: el gateway donde convergen los modelos. */
export function NexusMark({ className, title = "Nexus" }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <path d="M13 10v44" stroke="currentColor" strokeWidth="8" strokeLinecap="square" />
      <path d="M51 10v44" stroke="currentColor" strokeWidth="8" strokeLinecap="square" />
      <path d="M13 10l13.2 15.3" stroke="currentColor" strokeWidth="8" strokeLinecap="butt" />
      <path d="M37.8 38.7L51 54" stroke="currentColor" strokeWidth="8" strokeLinecap="butt" />
      <circle
        className="nexus-hub"
        cx="32"
        cy="32"
        r="7.1"
        stroke="currentColor"
        strokeWidth="3.4"
      />
    </svg>
  );
}

export function NexusWordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <NexusMark className={cn("size-6 shrink-0 text-amber-400", markClassName)} />
      <span className="font-semibold tracking-tight">Nexus</span>
    </span>
  );
}
