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
    <header className={cn("mb-8", className)}>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 md:text-4xl">{title}</h1>
      {children ? <div className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500 md:text-base">{children}</div> : null}
    </header>
  );
}
