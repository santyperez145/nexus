import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 py-8 text-sm text-zinc-500">
        <Link href="/models" className="hover:text-white">
          Modelos
        </Link>
        <Link href="/providers" className="hover:text-white">
          Providers
        </Link>
        <Link href="/rankings" className="hover:text-white">
          Rankings
        </Link>
        <Link href="/docs" className="hover:text-white">
          API
        </Link>
        <Link href="/privacy" className="hover:text-white">
          Privacidad
        </Link>
        <Link href="/terms" className="hover:text-white">
          Términos
        </Link>
      </div>
    </footer>
  );
}
