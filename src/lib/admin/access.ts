import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/config";

export async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!isPlatformAdmin(session.user.email)) redirect("/overview");
  return session.user;
}
