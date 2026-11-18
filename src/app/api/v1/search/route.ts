import { searchHubResponse } from "@/lib/hub/search-request";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return searchHubResponse(req);
}
