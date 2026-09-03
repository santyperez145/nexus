export function AppPageHeader({
  title,
  children,
  actions,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-[family-name:var(--font-syne)] text-3xl font-semibold tracking-tight text-zinc-50 md:text-[2rem]">
          {title}
        </h1>
        {children ? <div className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">{children}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
