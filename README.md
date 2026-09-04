# Nexus

Gateway propio y neutral de modelos de IA. Una API compatible con OpenAI y Anthropic, catálogo
multi‑proveedor, créditos por token, routing y BYOK. OpenAI es un adapter más: Anthropic, Google,
Mistral, Meta, DeepSeek y el resto del catálogo ejecutable compiten bajo las mismas políticas.

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

| Variable                                                                     | Para qué                                                                                                                                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / …                                   | Pool de inferencia de la plataforma                                                                                                                                     |
| `STRIPE_SECRET_KEY` + webhook + Price IDs + `STRIPE_PORTAL_CONFIGURATION_ID` | Créditos, planes Pro/Team y portal. Preferir una restricted key (`rk_…`) limitada a Customers, Checkout, PaymentIntents, PaymentMethods, Subscriptions y Billing Portal |
| `STRIPE_AUTOMATIC_TAX_ENABLED=true`                                          | Opt-in después de configurar Tax Settings y registros fiscales en el entorno activo                                                                                     |
| `CREDENTIALS_SECRET`                                                         | Cifrado BYOK (obligatorio en prod)                                                                                                                                      |
| `BETTER_AUTH_SECRET`                                                         | Secreto de sesión de al menos 32 caracteres (obligatorio en prod)                                                                                                       |
| `RESEND_API_KEY` + `EMAIL_FROM`                                              | Verificación y recuperación de cuenta; remitente verificado, obligatorios en prod                                                                                       |
| `ADMIN_EMAILS`                                                               | Allowlist explícita, separada por comas, para Superadmin, tareas globales y ajustes auditados de saldo; también se aplica en desarrollo                                 |
| `CRON_SECRET`                                                                | Secreto aleatorio de al menos 32 caracteres para tareas internas                                                                                                        |
| `DATABASE_URL`                                                               | Postgres/Neon pooled (obligatorio en prod; local: PGlite)                                                                                                               |
| `DATABASE_URL_UNPOOLED`                                                      | Conexión directa para `npm run db:migrate`                                                                                                                              |
| `REDIS_URL` o Upstash                                                        | Rate limit y circuit breaker; obligatorio y fail-closed en prod                                                                                                         |
| `NEXUS_OBJECT_STORAGE_BUCKET` + credenciales `AWS_*`                         | Artefactos grandes en cualquier backend S3-compatible (Neon Object Storage, S3, R2 o MinIO)                                                                             |
| `CORS_ORIGINS`                                                               | Orígenes adicionales exactos para auth con cookie, separados por comas; producción no confía en comodines de hosting compartido                                         |
| `ZDR_PROVIDER_IDS`                                                           | Proveedores con capacidad y acuerdo ZDR activo confirmado                                                                                                               |
| `NO_TRAINING_PROVIDER_IDS`                                                   | Proveedores cuyo acuerdo activo prohíbe entrenamiento con solicitudes                                                                                                   |
| `GATEWAY_URL`                                                                | Data plane Hono aparte (`npm run dev:gateway`)                                                                                                                          |
| BYOK en Settings                                                             | Keys del cliente, cifradas                                                                                                                                              |

PGlite es exclusivamente un fallback efímero de un solo proceso y no soporta flujos HTTP concurrentes de la app.
No ejecutes `dev`, tests o workers sobre el mismo `PGLITE_DATA_DIR`; para validación integral, staging y producción
usá PostgreSQL/Neon.

Las cargas de wallet cobran 5% con un mínimo de USD 0,80; la inferencia del pool mantiene 0% de
markup. El mínimo evita que el costo fijo del procesador vuelva deficitarios los packs pequeños.

El eco guest existe únicamente como ayuda de desarrollo y nunca forma parte de la API de producción.
En producción, inferencia requiere sesión o Bearer y al menos un proveedor de plataforma o BYOK.
Sin Stripe no hay carga de wallet ni suscripción; `ENABLE_MANUAL_CREDITS=true` funciona solo fuera de
producción.

Cuando `GATEWAY_URL` está configurado, Chat Completions, Completions, Embeddings, Responses y
Anthropic Messages se enrutan al data plane independiente. Responses y Messages conservan sus
ciclos SSE nativos, incluidos tool calls, uso acumulado, estados incompletos y errores de stream.
Ambos mounts (`/api/v1` y el alias raíz `/v1`) comparten
la misma ACL, scopes, rate limiting y ledger; no existe una ruta rápida que evite el control plane.
La identidad de red para sesiones, guest throttling y auditoría acepta únicamente el header protegido
de la plataforma activa (`X-Real-IP` en Railway, `X-Vercel-Forwarded-For` en Vercel o
`Fly-Client-IP` en Fly); un runtime productivo desconocido cae en un bucket global en vez de confiar
en `X-Forwarded-For` enviado por el cliente.
Los webhooks de observabilidad se persisten antes del primer intento, incluyen `x-nexus-delivery` y
se reintentan desde el worker o `GET /api/internal/cron/webhooks` con backoff progresivo (máximo 6 intentos); el Delivery log permite
auditar respuestas, próximos intentos y dead letters sin exponer el payload.
Webhooks, `web_fetch`, feeds de catálogo y probes configurables usan resolución DNS pública fijada al
socket, rechazan redirects y limitan el cuerpo leído; URLs privadas, metadata, NAT64 y 6to4 hacia
rangos reservados fallan antes de acceder a la red interna.
Los crons fallan cerrados si `CRON_SECRET` no está configurado. En Railway, el workflow
`Production operations` llama con un secreto de repositorio a `/api/internal/cron/webhooks` cada
cinco minutos, `/api/internal/cron/artifacts` cada treinta para limpiar uploads vencidos,
`/api/internal/cron/health` cada quince y `/api/internal/cron/catalog` diariamente.
Los horarios evitan el comienzo de la hora, cuando GitHub advierte mayor probabilidad de demora. El
gateway conserva además el primer intento inmediato de cada entrega.
Un proveedor sólo figura operativo tras responder 2xx durante los últimos 30 minutos; 401/403,
timeouts y pruebas vencidas mantienen `/status` en atención.

Cada despliegue ejecuta `node scripts/migrate.mjs migrate` como predeploy y no inicia la nueva versión
si el esquema no coincide con el snapshot de Drizzle. En producción `DATABASE_URL_UNPOOLED` es
obligatoria y el migrador rechaza endpoints Neon `-pooler`. Una base heredada sin historial debe pasar
primero `npm run db:baseline:check`; el baseline sólo se aplica con el flag explícito `--apply`, después
de verificar tablas, columnas, índices, claves foráneas y backfills dentro de una transacción reversible.
Las requests productivas sólo verifican el último registro de migración y nunca ejecutan DDL; el
bootstrap idempotente queda limitado al entorno local y a las pruebas.
Para Stripe, configurá
el webhook `{APP_URL}/api/webhooks/stripe` con `checkout.session.completed`,
`checkout.session.async_payment_succeeded|failed`, `customer.subscription.created|updated|deleted`,
`invoice.paid`, `invoice.payment_failed`, `payment_intent.succeeded|payment_failed`,
`refund.created|updated` y el ciclo `charge.dispute.*` configurado por el script.
`npm run stripe:configure` reconcilia idempotentemente Products, Prices, eventos del webhook ya
firmado y una configuración de Billing Portal; devuelve los tres IDs no secretos que deben guardarse
en el despliegue. También mantiene en español las descripciones de planes y el encabezado del portal.
Requiere `-- --allow-live` para modificar live mode. El nombre público de la cuenta se configura como
`Nexus` desde Stripe Dashboard; Stripe no permite que este script edite la identidad de su propia
cuenta y el probe comercial falla cerrado mientras falte esa marca o conserve un nombre técnico.
Cada compra de wallet conserva su PaymentIntent, importe cobrado y moneda en el ledger. Refunds
parciales y disputas se convierten en débitos o retenciones transaccionales e idempotentes; la
exposición combinada nunca revierte más crédito que la compra y una disputa ganada libera sólo lo
que ya no sigue reembolsado. Si el saldo fue consumido antes del refund, queda deuda auditable y la
inferencia paga permanece bloqueada hasta regularizarla.
Checkout, la reconciliación del retorno y Billing Portal tienen límites Redis independientes por usuario
antes de invocar Stripe. La creación admite 10 operaciones cada 10 minutos, el Portal 20 cada 10 minutos
y el polling post-pago 30 por minuto; los bloqueos responden `429` con `Retry-After` y una falla del
almacén distribuido cierra estas operaciones con `503`.
El mismo control persistente protege operaciones con costo o impacto elevado: 3 emails de prueba por
hora, 2 sincronizaciones de catálogo y 6 probes cada 10 minutos, 10 replays Stripe, 30 ajustes de saldo
y 10 verificaciones de auto-recarga cada 10 minutos. Cada cuota está aislada por operador y operación.
El inbox de Stripe es idempotente y conserva estado, intentos y error sin duplicar el payload. Un
superadmin puede reprocesar un evento fallido desde `/admin/operations`; Nexus recupera el evento
canónico con la API de Stripe, valida su tipo, reutiliza el mismo procesador del webhook y registra la
acción del operador en el audit log.
CI aplica todas las migraciones contra PostgreSQL 17 antes de typecheck, lint, tests y build; una
migración inválida bloquea el merge.
GitHub mantiene alertas de vulnerabilidades y correcciones automáticas activas; Dependabot revisa
semanalmente las dependencias npm y las acciones, agrupando actualizaciones minor y patch para evitar
ruido sin mezclar upgrades mayores de riesgo.

Railway usa `GET /api/internal/health/live` para confirmar que una nueva revisión inició sin convertir
credenciales externas pendientes en un bucle de rollback. El monitor operativo y la apertura de tráfico
comercial deben usar `GET /api/internal/health/ready`. Readiness prueba una consulta real a Postgres, una
escritura/lectura efímera en Redis, la configuración crítica, una sonda reciente de un proveedor con
tarifa ejecutable y Stripe configurado y verificado; responde `503` cuando alguna falla. El data plane
expone `/healthz` para liveness y `/readyz` para infraestructura más inferencia operativa, sin depender
de Stripe. Las capacidades se informan por separado y Railway nunca usa estos gates para reiniciar una
instancia cuyo proceso sigue sano.

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

El alta provisiona en una sola transacción el workspace predeterminado, el ledger de bienvenida
cuando el sandbox lo habilita y una clave inicial desactivada pendiente de revelar. La revelación,
creación con límite de plan y rotación de claves son atómicas; un reintento no duplica recursos ni
deja dos credenciales activas.

ZDR y no-entrenamiento son filtros estrictos. Las marcas del catálogo sólo describen capacidad;
Nexus no enruta en esos modos hasta que el operador confirme el acuerdo real mediante las allowlists
de entorno. Si no queda un host elegible, la solicitud falla y nunca relaja privacidad. BYOK se
excluye de esos modos hasta poder registrar garantías por credencial.

El catálogo también separa descubrimiento de ejecución: un modelo descubierto puede aparecer como
referencia, pero sólo entra al router cuando la tarifa de ese proveedor/modelo está verificada. Un
precio `0` sin marca explícita de gratuidad se interpreta como desconocido y falla cerrado; los feeds
externos no pueden auto-certificar precios ni reemplazar las entradas curadas de Nexus.

El Hub comparte un namespace tenant-safe entre repositorios de modelos, datasets versionados y Nexus Spaces. Los modelos publicados incluyen model card, licencia, pipeline, librería, base model, artefactos, revisiones inmutables y gating. Permanecen `reference_only`: nunca entran al router ni fijan precios por sí solos. El propietario puede adjuntar resultados estructurados de benchmark a una revisión exacta, con dataset/evaluador y evidencia anclada por SHA-256; sólo los resultados revisados por plataforma se muestran a terceros como verificados. La promoción también es fail-closed: un operador sólo puede enlazar la última revisión pública y sin gate con un modelo runtime que ya tenga endpoint y precio verificados. El checklist exige documentación, licencia explícita, task/librería, integridad de todos los artefactos, pesos `safetensors` o GGUF sin formatos pickle peligrosos y al menos una evaluación verificada. Una nueva revisión o cambio de ficha deja la verificación `stale`; los pesos del Hub nunca se ejecutan automáticamente. Un Space publica
una experiencia de chat configurable sobre cualquier modelo de texto ejecutable, sin crear un segundo
backend: cada run pasa por el router multi‑proveedor, ZDR, guardrails, rate limits, observabilidad y el
ledger `reserve→settle`. La identidad que ejecuta paga el uso; el propietario del Space nunca se cobra
implícitamente. Los Spaces privados de workspace exigen una API key scoped a ese workspace para
ejecución programática.

Los artefactos no viven dentro del historial SQL: con object storage configurado, Nexus reserva cuota
por usuario o workspace dentro de una transacción, firma un `PUT` de corta duración y sólo marca el
archivo como `ready` después de verificar longitud y SHA-256. Las revisiones rechazan archivos
`pending` o fallidos. El API es S3-compatible y portable entre Neon Object Storage, AWS S3, R2 y
MinIO; Postgres base64 queda como fallback local para archivos de hasta 8 MB. Free incluye 1 GiB,
Pro 25 GiB y Team 250 GiB; el upload directo admite hasta 50 GiB por objeto. Desde 100 MiB,
Nexus usa partes reintentables de 64 MiB, firma el SHA-256 de cada parte y valida el checksum
compuesto antes de publicar el artefacto. La reserva multipart vive 24 horas; cada URL de parte
vence a los 15 minutos y puede regenerarse sin reiniciar la carga.
Para uploads desde la consola, el CORS del bucket debe aceptar `PUT` desde `NEXT_PUBLIC_APP_URL` y
los headers `content-type` y `x-amz-checksum-sha256`. `NEXUS_OBJECT_STORAGE_REQUIRED=true` incorpora
el bucket al gate de configuración; si está cableado, readiness ejecuta además un `HeadBucket` real.

Los guardrails son jerárquicos: las reglas personales y las del workspace activo se intersectan.
Pueden limitar modelos y proveedores, imponer un costo máximo, bloquear patrones sensibles y forzar
ZDR. Las preferencias enviadas por el cliente sólo pueden acotar esa política; una intersección vacía
falla con `403 guardrail_blocked`. El preview autenticado ejecuta los mismos presets, guardrails y
filtros de privacidad que la inferencia, sin consumir saldo.

Las API keys aplican scopes de mínimo privilegio por recurso (`inference:write`, `spaces:read/write`,
`models:read/write`, `datasets:read/write`, `keys:read/write`, entre otros). Los presupuestos,
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
