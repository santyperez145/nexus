"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className={compact ? "shrink-0 text-zinc-400 hover:text-white" : "mt-4 w-full justify-start text-zinc-400 hover:bg-white/[0.06] hover:text-white"}
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      Salir
    </Button>
  );
}
