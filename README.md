# Nexus

Gateway propio de modelos de IA. Una API compatible con el SDK de OpenAI, créditos por token, routing y BYOK.

No es un reskin de nadie: catálogo, slugs, keys (`sk-nx-`) y billing son de Nexus. Los modelos se descubren desde las APIs oficiales de cada laboratorio cuando cableás sus keys.

## Cableado

1. Copiá env y llená lo que tengas:

```bash
cp .env.example .env.local
```

2. Arrancá:

```bash
npm install
npm run dev
```

3. Creá cuenta → **Conexiones**. Ahí ves qué está verde y qué falta.

| Variable | Para qué |
|---|---|
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / … | Pool de inferencia de la plataforma |
| `STRIPE_SECRET_KEY` + webhook | Compra de créditos |
| `DATABASE_URL` | Postgres/Neon (si no: PGlite local) |
| `REDIS_URL` o Upstash | Rate limit y circuit breaker |
| `GATEWAY_URL` | Data plane Hono aparte (`npm run dev:gateway`) |
| BYOK en Settings | Keys del cliente, cifradas |

Sin keys de lab el chat funciona en modo local (echo) para probar el producto. Con keys, rutea de verdad. Sin Stripe, en Conexiones podés cargar wallet (`ENABLE_MANUAL_CREDITS`, default on).

Webhook Stripe: `{APP_URL}/api/webhooks/stripe` evento `checkout.session.completed`.

Producción: [https://web-production-ef6b3.up.railway.app](https://web-production-ef6b3.up.railway.app) (Railway + Neon + Stripe Checkout/Link).

## API

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3000/api/v1",
  apiKey: process.env.NEXUS_API_KEY,
});
```

Routers: `nexus/auto`, `nexus/free`. Variantes: `:fast`, `:cheap`, `:quality`, `:free`.
