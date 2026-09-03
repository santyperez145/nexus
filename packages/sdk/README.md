# nexus-sdk

Cliente TypeScript oficial de Nexus. Un key (`sk-nx-`), 425 modelos, API compatible OpenAI.

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

## Recursos

| Método | API |
|---|---|
| `nexus.chat.send` / `nexus.chat.completions.create` | `POST /chat/completions` |
| `nexus.models.list` / `.get` / `.endpoints` / `.count` | `/models` |
| `nexus.credits.get` | `/credits` |
| `nexus.generations.get` / `.list` | `/generation` |
| `nexus.embeddings.create` | `/embeddings` |
| `nexus.images.generate` | `/images/generations` |
| `nexus.audio.speech` | `/audio/speech` |
| `nexus.keys.list` / `.create` / `.update` / `.delete` | `/keys` |
| `nexus.providers.list` | `/providers` |

`NEXUS_MODEL_IDS` es el union de slugs del catálogo (autocompletado). Routers: `nexus/auto`, `nexus/free`. Variantes: `:fast`, `:cheap`, `:quality`, `:online`.
