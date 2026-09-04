# nexus-sdk

Cliente TypeScript oficial de Nexus. Un key (`sk-nx-`), múltiples proveedores, API compatible OpenAI y Hub versionado.

```bash
npm add nexus-sdk
```

Desde este repo: `"nexus-sdk": "file:packages/sdk"`.

## Quickstart

```ts
import { Nexus } from "nexus-sdk";

const nexus = new Nexus({
  apiKey: process.env.NEXUS_API_KEY,
  baseURL: "https://web-production-ef6b3.up.railway.app/api/v1",
  httpReferer: "https://tu-app.example",
  title: "Tu App",
});

const completion = await nexus.chat.send({
  model: "openai/gpt-5",
  messages: [{ role: "user", content: "Hola" }],
  provider: { sort: "price", allow_fallbacks: true },
});

console.log(completion.choices[0].message.content);
console.log(completion.usage?.cost, completion.provider);
```

Stream (igual que `@openrouter/sdk`, pero `Nexus`):

```ts
const stream = await nexus.chat.send({
  model: "nexus/auto",
  messages: [{ role: "user", content: "Hola" }],
  stream: true,
  stream_options: { include_usage: true },
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

Drop-in OpenAI:

```ts
await nexus.chat.completions.create({
  model: "anthropic/claude-sonnet-4.6",
  messages: [{ role: "user", content: "Hola" }],
});
```

Artefactos grandes (reserva de cuota → PUT firmado → verificación):

```ts
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const bytes = await readFile("model.safetensors");
await nexus.files.uploadArtifact(new Blob([bytes]), {
  filename: "model.safetensors",
  sha256: createHash("sha256").update(bytes).digest("hex"),
});
```

La suma SHA-256 es obligatoria: forma parte de la firma del upload y Nexus no habilita el archivo
hasta que object storage confirma checksum y longitud exactos.

## Recursos

| Método | API |
|---|---|
| `nexus.chat.send` / `nexus.chat.completions.create` | `POST /chat/completions` |
| `nexus.completions.create` | `POST /completions` (legacy prompt) |
| `nexus.responses.create` | `POST /responses` |
| `nexus.messages.create` | `POST /messages` |
| `nexus.models.list` / `.get` / `.endpoints` / `.count` | `/models` |
| `nexus.models.repositories.*` / `.revisions.*` / `.download` | `/models/{namespace}/{slug}/*` (Hub reference-only) |
| `nexus.credits.get` | `/credits` |
| `nexus.generations.get` / `.list` | `/generation` |
| `nexus.embeddings.create` | `/embeddings` |
| `nexus.images.generate` | `/images/generations` |
| `nexus.audio.speech` / `.transcriptions` | `/audio/*` |
| `nexus.videos.create` / `.get` | `/videos` |
| `nexus.keys.list` / `.create` / `.rotate` / `.update` / `.delete` | `/keys` |
| `nexus.providers.list` / `.health` | `/providers` |
| `nexus.files.list` / `.upload` / `.createUpload` / `.completeUpload` / `.uploadArtifact` / `.delete` | `/files` |
| `nexus.analytics.get(days?)` | `/analytics` |
| `nexus.presets.*` | `/presets` |
| `nexus.guardrails.*` | `/guardrails` |
| `nexus.byok.*` | `/byok` |
| `nexus.workspaces.*` | `/workspaces` |
| `nexus.organization.*` | `/organization` |
| `nexus.observability.*` | `/observability` |
| `nexus.routing.preview` | `POST /routing/preview` |
| `nexus.status.get` | `GET /status` |
| `nexus.shares.create` / `.get` / `.list` / `.delete` | `/shares` |
| `nexus.datasets.list` / `.get` / `.create` / `.update` / `.delete` | `/datasets` |
| `nexus.datasets.revisions.*` / `.access.*` / `.download` | `/datasets/{namespace}/{slug}/*` |
| `nexus.datasets.models` | `/datasets/models` (ranking de modelos) |
| `nexus.spaces.list` / `.get` / `.create` / `.update` / `.delete` | `/spaces` |
| `nexus.spaces.run` | `POST /spaces/{namespace}/{slug}/run` |
| `nexus.auth.key` | `/auth/key` |
| `nexus.oauth.describe` / `.challenge` / `.exchange` | `/oauth` PKCE |

> El nombre npm público `nexus-sdk` puede estar ocupado por un paquete ajeno. En este monorepo usá
> `"nexus-sdk": "file:packages/sdk"`. En prod, preferí un scope propio (`@tu-org/nexus`).

`NEXUS_MODEL_IDS` es el union de slugs del catálogo (autocompletado). Routers: `nexus/auto`, `nexus/free`. Variantes: `:fast`, `:cheap`, `:quality`, `:online`.

`generations.list` acepta filtros: `model`, `provider`, `byok`, `errors`, `days`, `api_key`, `workspace`, `app`.
