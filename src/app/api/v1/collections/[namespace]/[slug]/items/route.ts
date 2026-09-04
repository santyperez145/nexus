import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import {
  addHubCollectionItem,
  assertHubCollectionMutation,
  listHubCollectionItems,
  publicHubCollection,
  removeHubCollectionItem,
  reorderHubCollectionItems,
  updateHubCollectionItem,
} from "@/lib/hub/collection-store";
import {
  addCollectionItemSchema,
  invalidCollectionInput,
  reorderCollectionItemsSchema,
  updateCollectionItemSchema,
} from "@/lib/hub/collections";

type Context = { params: Promise<{ namespace: string; slug: string }> };

async function collectionResponse(auth: Awaited<ReturnType<typeof authenticateRequest>>, namespace: string, slug: string) {
  const collection = await assertHubCollectionMutation(auth, namespace, slug);
  const items = await listHubCollectionItems(collection, auth);
  return Response.json({ data: publicHubCollection(collection, items, true) });
}

export async function POST(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = addCollectionItemSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidCollectionInput(parsed.error);
    const { namespace, slug } = await params;
    const item = await addHubCollectionItem(auth, namespace, slug, parsed.data);
    await writeAudit(auth, "collection.item.add", {
      resource: "collection_item",
      resourceId: item.id,
      headers: req.headers,
      meta: { collection: `${namespace}/${slug}`, type: item.itemType, path: item.itemPath },
    });
    return await collectionResponse(auth, namespace, slug);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = updateCollectionItemSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidCollectionInput(parsed.error);
    const { namespace, slug } = await params;
    const item = await updateHubCollectionItem(auth, namespace, slug, parsed.data.id, parsed.data.note);
    await writeAudit(auth, "collection.item.update", {
      resource: "collection_item",
      resourceId: item.id,
      headers: req.headers,
      meta: { collection: `${namespace}/${slug}` },
    });
    return await collectionResponse(auth, namespace, slug);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = reorderCollectionItemsSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidCollectionInput(parsed.error);
    const { namespace, slug } = await params;
    await reorderHubCollectionItems(auth, namespace, slug, parsed.data.item_ids);
    await writeAudit(auth, "collection.items.reorder", {
      resource: "collection",
      resourceId: `${namespace}/${slug}`,
      headers: req.headers,
      meta: { items: parsed.data.item_ids.length },
    });
    return await collectionResponse(auth, namespace, slug);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const itemId = new URL(req.url).searchParams.get("id")?.trim();
    if (!itemId || itemId.length > 180) {
      throw Object.assign(new Error("item id is required"), { status: 400, code: "invalid_request" });
    }
    const { namespace, slug } = await params;
    await removeHubCollectionItem(auth, namespace, slug, itemId);
    await writeAudit(auth, "collection.item.remove", {
      resource: "collection_item",
      resourceId: itemId,
      headers: req.headers,
      meta: { collection: `${namespace}/${slug}` },
    });
    return await collectionResponse(auth, namespace, slug);
  } catch (error) {
    return jsonError(error);
  }
}
