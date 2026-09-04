import { authenticateOptionalRequest, authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import {
  canReadHubCollection,
  collectionManager,
  deleteHubCollection,
  findHubCollection,
  listHubCollectionItems,
  publicHubCollection,
  updateHubCollection,
} from "@/lib/hub/collection-store";
import { invalidCollectionInput, updateCollectionSchema } from "@/lib/hub/collections";

type Context = { params: Promise<{ namespace: string; slug: string }> };

export async function GET(req: Request, { params }: Context) {
  try {
    const auth = await authenticateOptionalRequest(req);
    const { namespace, slug } = await params;
    const collection = await findHubCollection(namespace, slug);
    if (!collection || !canReadHubCollection(collection, auth)) {
      throw Object.assign(new Error("collection not found"), { status: 404, code: "not_found" });
    }
    const items = await listHubCollectionItems(collection, auth);
    return Response.json({
      data: publicHubCollection(collection, items, await collectionManager(auth, collection)),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = updateCollectionSchema.safeParse(await req.json());
    if (!parsed.success) throw invalidCollectionInput(parsed.error);
    const { namespace, slug } = await params;
    const collection = await updateHubCollection(auth, namespace, slug, parsed.data);
    if (!collection) {
      throw Object.assign(new Error("collection not found"), { status: 404, code: "not_found" });
    }
    const items = await listHubCollectionItems(collection, auth);
    await writeAudit(auth, "collection.update", {
      resource: "collection",
      resourceId: collection.id,
      headers: req.headers,
      meta: { fields: Object.keys(parsed.data) },
    });
    return Response.json({ data: publicHubCollection(collection, items, true) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request, { params }: Context) {
  try {
    const auth = await authenticateRequest(req);
    const { namespace, slug } = await params;
    const collection = await deleteHubCollection(auth, namespace, slug);
    await writeAudit(auth, "collection.delete", {
      resource: "collection",
      resourceId: collection.id,
      headers: req.headers,
      meta: { path: `${collection.namespace}/${collection.slug}` },
    });
    return Response.json({ data: { id: collection.id, deleted: true } });
  } catch (error) {
    return jsonError(error);
  }
}
