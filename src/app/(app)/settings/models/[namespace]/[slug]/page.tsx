import { ModelRepositoryWorkspace } from "@/components/models/model-repository-workspace";

export default async function ModelRepositoryWorkspacePage({
  params,
}: {
  params: Promise<{ namespace: string; slug: string }>;
}) {
  const { namespace, slug } = await params;
  return <ModelRepositoryWorkspace namespace={namespace} slug={slug} />;
}
