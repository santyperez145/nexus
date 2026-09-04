import { cn } from "@/lib/utils";

export function MarketingPageHeader({
  title,
  children,
  className,
}: {
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("relative mb-8 border-l-2 border-indigo-500 pl-5", className)}>
      <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-indigo-600">Nexus network</div>
      <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-[-0.035em] text-[#111326] md:text-4xl">{title}</h1>
      {children ? <div className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600 md:text-base">{children}</div> : null}
    </header>
  );
}
