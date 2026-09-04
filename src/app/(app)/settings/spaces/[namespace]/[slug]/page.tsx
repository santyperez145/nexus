import { SpaceWorkspace } from "@/components/spaces/space-workspace";

export default async function SpaceWorkspacePage({ params }: { params: Promise<{ namespace: string; slug: string }> }) {
  const { namespace, slug } = await params;
  return <SpaceWorkspace namespace={namespace} slug={slug} />;
}

