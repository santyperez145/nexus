import { DatasetWorkspace } from "@/components/datasets/dataset-workspace";

export default async function DatasetWorkspacePage({
  params,
}: {
  params: Promise<{ namespace: string; slug: string }>;
}) {
  const { namespace, slug } = await params;
  return <DatasetWorkspace namespace={namespace} slug={slug} />;
}
