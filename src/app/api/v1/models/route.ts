import { allModels } from "@/lib/catalog";
import { isModelExecutionReady } from "@/lib/catalog/presentation";
import { usdPerMillion } from "@/lib/catalog";
import { authenticateRequest, jsonError } from "@/lib/gateway/api-auth";
import { writeAudit } from "@/lib/gateway/audit";
import {
  createModelRepositorySchema,
  invalidModelRepositoryInput,
  modelRepositoryModalities,
} from "@/lib/hub/model-repositories";
import {
  createModelRepository,
  listModelRepositories,
  publicModelRepository,
} from "@/lib/hub/model-repository-store";

async function getModels(req: Request) {
  const url = new URL(req.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 50;
  const mine = url.searchParams.get("mine") === "1";
  if (mine) {
    const auth = await authenticateRequest(req);
    const repositories = await listModelRepositories({
      auth,
      mine: true,
      query: url.searchParams.get("q") ?? undefined,
      pipelineTag: url.searchParams.get("pipeline_tag") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      limit,
    });
    return Response.json({
      data: repositories.map(publicModelRepository),
      meta: { count: repositories.length, scope: "tenant" },
    });
  }
  const output = url.searchParams.get("output_modalities");
  const category = url.searchParams.get("category");
  const supported = url.searchParams.get("supported_parameters");
  const includeReference = url.searchParams.get("include_reference") === "true";
  let models = allModels();
  if (!includeReference) {
    models = models.filter(isModelExecutionReady);
  }
  if (output) {
    const wanted = output.split(",").map((s) => s.trim());
    models = models.filter((m) => wanted.every((w) => m.architecture.outputModalities.includes(w)));
  }
  if (category === "free") models = models.filter((m) => m.free);
  if (supported) {
    models = models.filter((m) => m.supportedParameters.includes(supported));
  }
  const data: unknown[] = models.map((m) => ({
    id: m.id,
    canonical_slug: m.canonicalSlug,
    hugging_face_id: m.huggingFaceId,
    name: m.name,
    created: m.created,
    description: m.description,
    context_length: m.contextLength,
    architecture: {
      modality: m.architecture.modality,
      input_modalities: m.architecture.inputModalities,
      output_modalities: m.architecture.outputModalities,
      tokenizer: m.architecture.tokenizer,
    },
    pricing: {
      prompt: String(m.pricing.prompt),
      completion: String(m.pricing.completion),
      request: String(m.pricing.request),
      image: String(m.pricing.image),
    },
    top_provider: {
      context_length: m.topProvider.contextLength,
      max_completion_tokens: m.topProvider.maxCompletionTokens,
      is_moderated: m.topProvider.isModerated,
    },
    supported_parameters: m.supportedParameters,
    per_request_limits: null,
    nexus: {
      prompt_per_million: usdPerMillion(m.pricing.prompt),
      completion_per_million: usdPerMillion(m.pricing.completion),
      free: m.free,
      verified: Boolean(m.verified),
      executable: isModelExecutionReady(m),
      reference_only: !isModelExecutionReady(m),
      providers: m.endpoints.map((e) => e.adapter),
      pricing_verified: m.endpoints.some((e) => e.pricingVerified === true),
      metrics_estimated: m.endpoints.some((e) => e.metricsEstimated !== false),
      source: "gateway",
    },
  }));
  if (includeReference) {
    try {
      const repositories = await listModelRepositories({
        query: url.searchParams.get("q") ?? undefined,
        pipelineTag: url.searchParams.get("pipeline_tag") ?? undefined,
        tag: url.searchParams.get("tag") ?? undefined,
        limit,
      });
      data.push(
        ...repositories.map((repository) => {
          const modalities = modelRepositoryModalities(repository.task);
          return {
            id: `${repository.namespace}/${repository.slug}`,
            canonical_slug: `${repository.namespace}/${repository.slug}`,
            hugging_face_id: null,
            name: repository.title,
            created: Math.floor(repository.createdAt.getTime() / 1000),
            description: repository.description,
            context_length: 0,
            architecture: {
              modality: repository.task ?? "model-repository",
              input_modalities: modalities.input,
              output_modalities: modalities.output,
              tokenizer: null,
            },
            pricing: { prompt: "0", completion: "0", request: "0", image: "0" },
            top_provider: { context_length: 0, max_completion_tokens: 0, is_moderated: false },
            supported_parameters: [],
            per_request_limits: null,
            nexus: {
              source: "hub",
              free: false,
              verified: repository.verificationStatus === "verified",
              executable: false,
              reference_only: true,
              providers: [],
              pricing_verified: false,
              metrics_estimated: false,
              latest_revision: repository.latestRevision,
              verified_revision: repository.verifiedRevision,
              verification_status: repository.verificationStatus,
              runtime_model_id: repository.runtimeModelId,
              promoted:
                repository.verificationStatus === "verified" &&
                Boolean(repository.runtimeModelId),
              downloads: repository.downloads,
            },
          };
        }),
      );
    } catch {
      // The immutable bundled catalog remains publicly available during control-plane DB outages.
    }
  }
  return Response.json({ data });
}

export async function GET(req: Request) {
  try {
    return await getModels(req);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const parsed = createModelRepositorySchema.safeParse(await req.json());
    if (!parsed.success) throw invalidModelRepositoryInput(parsed.error);
    const repository = await createModelRepository(auth, parsed.data);
    await writeAudit(auth, "model_repository.create", {
      resource: "model_repository",
      resourceId: repository.id,
      headers: req.headers,
      meta: {
        path: `${repository.namespace}/${repository.slug}`,
        visibility: repository.visibility,
        referenceOnly: true,
      },
    });
    return Response.json({ data: publicModelRepository(repository) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
