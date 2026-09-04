"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Offering = {
  id: string;
  providerModelId: string;
  canonicalModelId: string;
  displayName: string;
  providerReady: boolean;
  free: boolean;
  reportedPromptPrice: string | null;
  reportedCompletionPrice: string | null;
  costPromptPrice: string | null;
  costCompletionPrice: string | null;
  commissionBps: number;
  capacityTpm: number | null;
  status: string;
  pricingVerified: boolean;
  sourceHash: string;
  updatedAt: string;
};

export type ProviderConnectionAdminView = {
  id: string;
  slug: string;
  label: string;
  protocol: string;
  authScheme: string;
  baseUrl: string;
  modelsPath: string;
  secretHint: string;
  status: string;
  zdrCapable: boolean;
  zdrVerified: boolean;
  noTrainingVerified: boolean;
  privacyPolicyUrl: string | null;
  termsUrl: string | null;
  statusPageUrl: string | null;
  lastProbeOk: boolean;
  lastProbeStatus: number | null;
  lastProbeLatencyMs: number | null;
  lastProbeError: string | null;
  lastProbedAt: string | null;
  offeringCount: number;
  activeOfferingCount: number;
  offerings: Offering[];
};

function errorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }
  return `La operación falló (HTTP ${status}).`;
}

async function mutate(path: string, method: "POST" | "PATCH", body: unknown) {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload;
}

function perMillion(value: string | null) {
  if (value == null) return "";
  const parsed = Number(value) * 1_000_000;
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function retailPerMillion(value: string, free: boolean) {
  if (free) return "$0";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return `$${parsed.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
}

function statusTone(status: string, healthy = false) {
  if (status === "active" && healthy) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "staged" || status === "draft") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-zinc-300 bg-zinc-100 text-zinc-600";
}

function OfferingRow({ offering }: { offering: Offering }) {
  const router = useRouter();
  const [canonical, setCanonical] = useState(offering.canonicalModelId);
  const [prompt, setPrompt] = useState(
    perMillion(offering.costPromptPrice ?? offering.reportedPromptPrice),
  );
  const [completion, setCompletion] = useState(
    perMillion(offering.costCompletionPrice ?? offering.reportedCompletionPrice),
  );
  const [free, setFree] = useState(offering.free);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function action(name: "activate" | "suspend") {
    setRunning(true);
    setMessage(null);
    try {
      await mutate(`/api/internal/admin/provider-offerings/${offering.id}`, "PATCH", {
        action: name,
        ...(name === "activate"
          ? {
              canonical_model_id: canonical,
              free,
              cost_prompt: free ? 0 : Number(prompt) / 1_000_000,
              cost_completion: free ? 0 : Number(completion) / 1_000_000,
            }
          : {}),
      });
      setMessage(name === "activate" ? "Oferta activada a precio de lista verificado." : "Oferta suspendida.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La operación falló.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <article className="grid gap-3 border-t border-zinc-100 px-4 py-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.25fr)_minmax(0,.8fr)_minmax(0,.8fr)_auto] xl:items-end">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-950">{offering.displayName}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(offering.status, offering.providerReady)}`}>
            {offering.status}
          </span>
          {!offering.providerReady ? (
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700">upstream no listo</span>
          ) : null}
        </div>
        <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">{offering.providerModelId}</div>
        <div className="mt-1 text-[10px] text-zinc-400">
          {offering.capacityTpm ? `${offering.capacityTpm.toLocaleString()} TPM reportados · ` : ""}
          contrato {offering.sourceHash.slice(0, 10)}
        </div>
      </div>
      <div>
        <Label htmlFor={`canonical-${offering.id}`} className="text-xs">Modelo canónico</Label>
        <Input
          id={`canonical-${offering.id}`}
          value={canonical}
          onChange={(event) => setCanonical(event.target.value)}
          className="mt-1 font-mono text-xs"
        />
      </div>
      <div>
        <Label htmlFor={`prompt-${offering.id}`} className="text-xs">Costo entrada / 1M</Label>
        <Input
          id={`prompt-${offering.id}`}
          type="number"
          min="0"
          step="any"
          value={free ? "0" : prompt}
          disabled={free}
          onChange={(event) => setPrompt(event.target.value)}
          className="mt-1 font-mono text-xs"
        />
        <div className="mt-1 text-[10px] text-zinc-500">Precio público {retailPerMillion(prompt, free)}</div>
      </div>
      <div>
        <Label htmlFor={`completion-${offering.id}`} className="text-xs">Costo salida / 1M</Label>
        <Input
          id={`completion-${offering.id}`}
          type="number"
          min="0"
          step="any"
          value={free ? "0" : completion}
          disabled={free}
          onChange={(event) => setCompletion(event.target.value)}
          className="mt-1 font-mono text-xs"
        />
        <div className="mt-1 text-[10px] text-zinc-500">Precio público {retailPerMillion(completion, free)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 xl:justify-end">
        <label className="flex items-center gap-2 text-xs text-zinc-600">
          <Switch checked={free} onCheckedChange={setFree} aria-label="Oferta gratuita" /> Gratis
        </label>
        {offering.status === "active" ? (
          <Button variant="outline" size="sm" disabled={running} onClick={() => action("suspend")}>Suspender</Button>
        ) : (
          <Button size="sm" disabled={running || !offering.providerReady} onClick={() => action("activate")}>Revisar y activar</Button>
        )}
      </div>
      {message ? <p aria-live="polite" className="text-xs text-zinc-600 xl:col-span-5">{message}</p> : null}
    </article>
  );
}

function ConnectionCard({ connection }: { connection: ProviderConnectionAdminView }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [zdr, setZdr] = useState(connection.zdrVerified);
  const [noTraining, setNoTraining] = useState(connection.noTrainingVerified);
  const [secret, setSecret] = useState("");

  async function action(name: "probe" | "activate" | "suspend" | "rotate_secret") {
    setRunning(name);
    setMessage(null);
    try {
      const payload = await mutate(
        `/api/internal/admin/provider-connections/${connection.id}`,
        "PATCH",
        {
          action: name,
          ...(name === "activate" ? { zdr_verified: zdr, no_training_verified: noTraining } : {}),
          ...(name === "rotate_secret" ? { api_key: secret } : {}),
        },
      ) as { data?: { count?: number } };
      const count = payload.data?.count;
      setMessage(
        name === "probe"
          ? `${count ?? 0} ofertas descubiertas; los cambios quedaron en staging.`
          : name === "activate"
            ? "Proveedor activado. Sólo entrarán ofertas aprobadas."
            : name === "rotate_secret"
              ? "Credencial rotada. Se requiere una nueva sonda."
              : "Proveedor suspendido.",
      );
      if (name === "rotate_secret") setSecret("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La operación falló.");
    } finally {
      setRunning(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="bg-[linear-gradient(110deg,#101426,#171b33)] px-4 py-4 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{connection.label}</h3>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${connection.status === "active" && connection.lastProbeOk ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : "border-white/15 bg-white/5 text-zinc-300"}`}>
                {connection.status}
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-zinc-400">
              {connection.slug} · {connection.protocol}/{connection.authScheme} · {connection.secretHint}
            </div>
            <div className="mt-2 text-xs text-zinc-300">
              {connection.lastProbedAt
                ? `${connection.lastProbeOk ? "Sonda OK" : "Sonda fallida"} · ${connection.lastProbeStatus ?? "sin HTTP"} · ${connection.lastProbeLatencyMs ?? 0} ms · ${new Date(connection.lastProbedAt).toLocaleString("es-AR")}`
                : "Nunca verificado"}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={running !== null} onClick={() => action("probe")} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              {running === "probe" ? "Sondeando…" : "Descubrir y verificar"}
            </Button>
            {connection.status === "active" ? (
              <Button variant="outline" size="sm" disabled={running !== null} onClick={() => action("suspend")} className="border-rose-300/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20 hover:text-white">Suspender</Button>
            ) : (
              <Button size="sm" disabled={running !== null || !connection.lastProbeOk} onClick={() => action("activate")} className="bg-cyan-300 text-slate-950 hover:bg-cyan-200">Activar proveedor</Button>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-white/10 pt-3 text-xs text-zinc-300">
          <label className="flex items-center gap-2">
            <Switch checked={zdr} disabled={!connection.zdrCapable || connection.status === "active"} onCheckedChange={setZdr} aria-label="Contrato ZDR verificado" /> ZDR verificado
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={noTraining} disabled={connection.status === "active"} onCheckedChange={setNoTraining} aria-label="No training verificado" /> No training verificado
          </label>
          <span>{connection.activeOfferingCount}/{connection.offeringCount} ofertas activas</span>
          <span className="truncate font-mono text-[10px] text-zinc-500">{connection.baseUrl}{connection.modelsPath}</span>
        </div>
        {connection.lastProbeError ? <p className="mt-2 text-xs text-rose-200">{connection.lastProbeError}</p> : null}
        {message ? <p aria-live="polite" className="mt-2 text-xs text-cyan-100">{message}</p> : null}
      </div>

      <details className="border-b border-zinc-100 px-4 py-3">
        <summary className="cursor-pointer text-xs font-medium text-zinc-700">Rotar credencial</summary>
        <div className="mt-3 flex max-w-xl gap-2">
          <Input type="password" autoComplete="new-password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Nueva API key" aria-label="Nueva API key" />
          <Button variant="outline" size="sm" disabled={running !== null || secret.length < 8} onClick={() => action("rotate_secret")}>Rotar</Button>
        </div>
      </details>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <h4 className="text-sm font-semibold text-zinc-950">Ofertas de modelo</h4>
          <p className="mt-0.5 text-[11px] text-zinc-500">Costo upstream por millón y precio público sin markup. Nexus monetiza la recarga/BYOK al 5%; los cambios del feed revocan la aprobación.</p>
        </div>
        <span className="font-mono text-[11px] text-zinc-500">{connection.offeringCount} detectadas</span>
      </div>
      <div className="max-h-[42rem] overflow-y-auto">
        {connection.offerings.map((offering) => <OfferingRow key={offering.id} offering={offering} />)}
        {!connection.offerings.length ? <p className="border-t border-zinc-100 px-4 py-8 text-center text-sm text-zinc-500">Ejecutá la sonda para descubrir el catálogo del proveedor.</p> : null}
        {connection.offeringCount > 200 ? <p className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-500">Mostrando las primeras 200 ofertas. Usá la API de administración para revisar el resto.</p> : null}
      </div>
    </section>
  );
}

export function ProviderOnboardingConsole({ connections }: { connections: ProviderConnectionAdminView[] }) {
  const router = useRouter();
  const [protocol, setProtocol] = useState("openai");
  const [authScheme, setAuthScheme] = useState("bearer");
  const [zdrCapable, setZdrCapable] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      await mutate("/api/internal/admin/provider-connections", "POST", {
        slug: form.get("slug"),
        label: form.get("label"),
        protocol,
        auth_scheme: authScheme,
        base_url: form.get("base_url"),
        models_path: form.get("models_path"),
        api_key: form.get("api_key"),
        zdr_capable: zdrCapable,
        privacy_policy_url: form.get("privacy_policy_url") || null,
        terms_url: form.get("terms_url") || null,
        status_page_url: form.get("status_page_url") || null,
      });
      event.currentTarget.reset();
      setZdrCapable(false);
      setMessage("Proveedor guardado en draft. Ejecutá la sonda antes de activarlo.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear el proveedor.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-indigo-950/15 bg-[#f7f8fc] p-4 shadow-[0_18px_60px_rgba(30,35,70,0.07)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-indigo-600">Multi-provider control plane</div>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">Onboarding nativo de proveedores</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">Conectá cualquier API compatible con OpenAI o los protocolos nativos de Anthropic, Google y Mistral. El flujo es draft → sonda SSRF-safe → revisión de privacidad/precios → activación.</p>
        </div>
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-zinc-200 bg-white text-center text-xs">
          <div className="px-3 py-2"><div className="font-semibold text-zinc-950">{connections.length}</div><div className="text-[10px] text-zinc-500">conexiones</div></div>
          <div className="border-x border-zinc-100 px-3 py-2"><div className="font-semibold text-emerald-700">{connections.filter((item) => item.status === "active" && item.lastProbeOk).length}</div><div className="text-[10px] text-zinc-500">activas</div></div>
          <div className="px-3 py-2"><div className="font-semibold text-zinc-950">5%</div><div className="text-[10px] text-zinc-500">fee wallet/BYOK</div></div>
        </div>
      </div>

      <details className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-900">Agregar proveedor</summary>
        <form onSubmit={create} className="mt-4 grid gap-4 lg:grid-cols-4">
          <div><Label htmlFor="provider-label">Nombre</Label><Input id="provider-label" name="label" required minLength={2} placeholder="Acme Inference" className="mt-1" /></div>
          <div><Label htmlFor="provider-slug">Slug</Label><Input id="provider-slug" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,62}" placeholder="acme" className="mt-1 font-mono" /></div>
          <div>
            <Label>Protocolo</Label>
            <Select value={protocol} onValueChange={setProtocol}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="openai">OpenAI-compatible</SelectItem><SelectItem value="anthropic">Anthropic Messages</SelectItem><SelectItem value="google">Google Gemini</SelectItem><SelectItem value="mistral">Mistral native</SelectItem></SelectContent></Select>
          </div>
          <div>
            <Label>Autenticación</Label>
            <Select value={authScheme} onValueChange={setAuthScheme}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bearer">Bearer token</SelectItem><SelectItem value="anthropic">x-api-key</SelectItem><SelectItem value="google-query">Google query key</SelectItem></SelectContent></Select>
          </div>
          <div className="lg:col-span-2"><Label htmlFor="provider-base-url">Base URL HTTPS</Label><Input id="provider-base-url" name="base_url" type="url" required placeholder="https://api.acme.ai/v1" className="mt-1 font-mono" /></div>
          <div><Label htmlFor="provider-models-path">Models path</Label><Input id="provider-models-path" name="models_path" required defaultValue="/models" className="mt-1 font-mono" /></div>
          <div><Label htmlFor="provider-api-key">Credencial</Label><Input id="provider-api-key" name="api_key" type="password" autoComplete="new-password" required minLength={8} placeholder="API key" className="mt-1" /></div>
          <div className="lg:col-span-2"><Label htmlFor="provider-privacy-url">Política de privacidad</Label><Input id="provider-privacy-url" name="privacy_policy_url" type="url" placeholder="https://…" className="mt-1" /></div>
          <div><Label htmlFor="provider-terms-url">Términos</Label><Input id="provider-terms-url" name="terms_url" type="url" placeholder="https://…" className="mt-1" /></div>
          <div><Label htmlFor="provider-status-url">Status page</Label><Input id="provider-status-url" name="status_page_url" type="url" placeholder="https://…" className="mt-1" /></div>
          <label className="flex items-center gap-2 text-sm text-zinc-700 lg:col-span-3"><Switch checked={zdrCapable} onCheckedChange={setZdrCapable} aria-label="Proveedor declara capacidad ZDR" /> Declara capacidad ZDR (todavía no verificada)</label>
          <div className="flex justify-end"><Button type="submit" disabled={running}>{running ? "Guardando…" : "Crear draft"}</Button></div>
        </form>
        {message ? <p aria-live="polite" className="mt-3 text-sm text-zinc-600">{message}</p> : null}
      </details>

      <div className="mt-5 grid gap-4">
        {connections.map((connection) => <ConnectionCard key={connection.id} connection={connection} />)}
        {!connections.length ? <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">Todavía no hay proveedores administrados. Las integraciones por variables de entorno siguen funcionando como fallback.</div> : null}
      </div>
    </section>
  );
}
