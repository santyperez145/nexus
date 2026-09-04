import { CollectionWorkspace } from "@/components/collections/collection-workspace";

export default async function CollectionWorkspacePage({ params }: { params: Promise<{ namespace: string; slug: string }> }) {
  const { namespace, slug } = await params;
  return <CollectionWorkspace namespace={namespace} slug={slug} />;
}
