import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import { allRuntimeModels } from "@/lib/catalog/runtime";
import {
  collectionManager,
  createHubCollection,
  listHubCollectionItems,
  listHubCollections,
  publicHubCollection,
} from "@/lib/hub/collection-store";
import {
  createCollectionSchema,
  invalidCollectionInput,
  normalizeCollectionItemPath,
} from "@/lib/hub/collections";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mine = url.searchParams.get("mine") === "1";
    const auth = await authenticateOptionalRequest(req);
    if (mine && !auth) {
      throw Object.assign(new Error("authentication required for private collections"), {
        status: 401,
        code: "invalid_api_key",
      });
    }
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;
    const itemFilterRaw = url.searchParams.get("item");
    const itemFilter = itemFilterRaw ? normalizeCollectionItemPath(itemFilterRaw) : null;
    const collections = await listHubCollections({
      auth,
      mine,
      query: url.searchParams.get("q") ?? undefined,
      owner: url.searchParams.get("owner") ?? undefined,
      limit: itemFilter ? 100 : limit,
    });
    const catalog = await allRuntimeModels();
    const hydrated = await Promise.all(
      collections.map(async (collection) => {
        const items = await listHubCollectionItems(collection, auth, catalog);
        const manager = await collectionManager(auth, collection);
        return publicHubCollection(collection, items, manager);
      }),
    );
    const data = hydrated
      .filter((collection) => !itemFilter || collection.items.some((item) => item.path === itemFilter))
      .slice(0, limit)
      .map((collection) => ({ ...collection, items: collection.items.slice(0, 4) }));
    return Response.json({ data, meta: { count: data.length, scope: mine ? "tenant" : "public" } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = createCollectionSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidCollectionInput(parsed.error);
    const collection = await createHubCollection(auth, parsed.data);
    await writeAudit(auth, "collection.create", {
      resource: "collection",
      resourceId: collection.id,
      headers: req.headers,
      meta: {
        path: `${collection.namespace}/${collection.slug}`,
        visibility: collection.visibility,
      },
    });
    return Response.json({ data: publicHubCollection(collection, [], true) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
