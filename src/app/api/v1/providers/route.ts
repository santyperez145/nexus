import { NEXUS_PROVIDERS } from "@/lib/providers/registry";

export async function GET() {
  return Response.json({
    data: NEXUS_PROVIDERS.map((p) => ({
      name: p.id,
      slug: p.id,
      label: p.label,
      privacy_policy_url: null,
      terms_of_service_url: null,
      status_page_url: null,
      zdr: Boolean(p.zdr),
    })),
  });
}
