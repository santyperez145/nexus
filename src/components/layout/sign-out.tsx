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
      className={compact ? "shrink-0 text-zinc-500" : "mt-4 w-full justify-start text-zinc-500"}
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
