import { AdminNav } from "@/components/admin/admin-nav";
import { requirePlatformAdmin } from "@/lib/admin/access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-violet-700">
        <span className="size-1.5 rounded-full bg-violet-600" /> Control de plataforma
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
