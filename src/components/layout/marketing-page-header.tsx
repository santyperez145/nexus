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
    <header className={cn("mb-10 border-b border-zinc-200 pb-8", className)}>
      <h1 className="font-[family-name:var(--font-syne)] text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
        {title}
      </h1>
      {children ? <div className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-500 md:text-lg">{children}</div> : null}
    </header>
  );
}
