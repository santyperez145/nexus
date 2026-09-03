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
| `STRIPE_SECRET_KEY` + webhook + Price IDs | Créditos, planes Pro/Team y portal de suscripción |
| `STRIPE_AUTOMATIC_TAX_ENABLED=true` | Opt-in después de configurar Tax Settings y registros fiscales en el entorno activo |
| `CREDENTIALS_SECRET` | Cifrado BYOK (obligatorio en prod) |
| `BETTER_AUTH_SECRET` | Secreto de sesión de al menos 32 caracteres (obligatorio en prod) |
| `RESEND_API_KEY` + `EMAIL_FROM` | Verificación y recuperación de cuenta; remitente verificado, obligatorios en prod |
| `ADMIN_EMAILS` | Allowlist, separada por comas, para tareas globales de conexiones/catálogo |
| `DATABASE_URL` | Postgres/Neon pooled (obligatorio en prod; local: PGlite) |
| `DATABASE_URL_UNPOOLED` | Conexión directa para `npm run db:migrate` |
| `REDIS_URL` o Upstash | Rate limit y circuit breaker; obligatorio y fail-closed en prod |
| `GATEWAY_URL` | Data plane Hono aparte (`npm run dev:gateway`) |
| BYOK en Settings | Keys del cliente, cifradas |

El eco guest existe únicamente como ayuda de desarrollo y nunca forma parte de la API de producción.
En producción, inferencia requiere sesión o Bearer y al menos un proveedor de plataforma o BYOK.
Sin Stripe no hay carga de wallet ni suscripción; `ENABLE_MANUAL_CREDITS=true` funciona solo fuera de
producción.

Cuando `GATEWAY_URL` está configurado, Chat Completions, Completions, Embeddings, Responses y
Anthropic Messages se enrutan al data plane independiente. Ambos mounts (`/api/v1` y `/v1`) comparten
la misma ACL, scopes, rate limiting y ledger; no existe una ruta rápida que evite el control plane.
Los webhooks de observabilidad se persisten antes del primer intento, incluyen `x-nexus-delivery` y
se reintentan desde el worker o `GET /api/internal/cron/webhooks` con backoff progresivo (máximo 6 intentos); el Delivery log permite
auditar respuestas, próximos intentos y dead letters sin exponer el payload.
Los crons fallan cerrados si `CRON_SECRET` no está configurado. Vercel ejecuta el retry cada cinco
minutos; en Railway se debe programar el mismo endpoint con `Authorization: Bearer $CRON_SECRET`,
además del intento inmediato que realiza el gateway.

Antes del primer despliegue sobre una base nueva, ejecutá `npm run db:migrate` usando la URL directa.
En producción `DATABASE_URL_UNPOOLED` es obligatoria y el migrador rechaza endpoints Neon `-pooler`.
Las instancias existentes siguen recibiendo las adiciones idempotentes de `ensureDb`; adoptá las
migraciones en una ventana controlada antes de quitar ese bootstrap. Para Stripe, configurá
el webhook `{APP_URL}/api/webhooks/stripe` con `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `customer.subscription.created|updated|deleted`,
`invoice.paid`, `invoice.payment_failed` y `payment_intent.succeeded`.
CI aplica todas las migraciones contra PostgreSQL 17 antes de typecheck, lint, tests y build; una
migración inválida bloquea el merge.

Producción: [https://web-production-ef6b3.up.railway.app](https://web-production-ef6b3.up.railway.app) (Railway + Neon + Stripe Checkout/Link).

## SDK

Paquete propio en `packages/sdk` (`nexus-sdk`). Client tipado; regenerá IDs con `npm run sdk:sync-models`.

```bash
# Desde este monorepo (el nombre `nexus-sdk` en npm.org es de otro autor):
npm add ./packages/sdk
```

```ts
import { Nexus } from "nexus-sdk";

const nexus = new Nexus({ apiKey: process.env.NEXUS_API_KEY });
const res = await nexus.chat.send({
  model: "openai/gpt-5",
  messages: [{ role: "user", content: "Hola" }],
});
```

También sirve el SDK de OpenAI con `baseURL: .../api/v1`.

Las cuentas nuevas verifican su correo antes de crear una sesión en producción; el restablecimiento
de contraseña revoca sesiones anteriores. Los intentos de acceso, registro y recuperación usan el
mismo Redis distribuido y fail-closed que el gateway.

Las API keys pueden limitarse a `inference`, `management:read` y `management:write`. Los presupuestos,
límites por key, créditos y membresías de workspace se validan en el servidor; no dependen del cliente.
El workspace predeterminado de una organización incluye a todos sus miembros. Los demás requieren
asignación explícita; owner/admin conservan acceso administrativo global y un workspace compartido
siempre factura al owner de la organización, aunque lo cree un admin.

## Verificación antes de desplegar

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

En producción usá HTTPS en `NEXT_PUBLIC_APP_URL`, Postgres/Neon, Redis distribuido, secretos reales y
el webhook firmado de Stripe. Stripe Tax queda fail-closed por defecto: habilitá
`STRIPE_AUTOMATIC_TAX_ENABLED=true` únicamente después de configurar Tax Settings y los registros
fiscales aplicables en el entorno activo; el sandbox y live mode mantienen registros separados.

## API

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3000/api/v1",
  apiKey: process.env.NEXUS_API_KEY,
});
```

Routers: `nexus/auto`, `nexus/free`. Variantes: `:fast`, `:cheap`, `:quality`, `:free`.
Alias: `~openai/latest`. Chat compara dos modelos con `?compare=`.
