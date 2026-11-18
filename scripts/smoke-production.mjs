import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";

const origin = "http://127.0.0.1:3910";
const databaseUrl = new URL(process.env.NEXUS_SMOKE_DATABASE_URL ?? "about:blank");
assert.equal(databaseUrl.hostname, "127.0.0.1", "Smoke requires a loopback fixture database");
assert.equal(databaseUrl.pathname, "/nexus_ci", "Smoke requires the dedicated nexus_ci database");

const sql = postgres(databaseUrl.toString(), { max: 1, connect_timeout: 5 });
const runId = randomBytes(8).toString("hex");
const owner = `smoke-owner-${runId}`;
const other = `smoke-other-${runId}`;
const ownedWorkspace = `smoke-workspace-${runId}`;
const managementKey = randomBytes(32).toString("hex");
const inferenceKey = randomBytes(32).toString("hex");
const hash = (value) => createHash("sha256").update(value).digest("hex");
let child;
let childExit;

async function http(path, expected, { key, input, guest = false } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: input === undefined ? "GET" : "POST",
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(input === undefined ? {} : { "Content-Type": "application/json" }),
      ...(guest ? { "X-Nexus-Guest": "1" } : {}),
    },
    body: input === undefined ? undefined : JSON.stringify(input),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.status, expected, `${path} HTTP status`);
  return response;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) break;
    try {
      const response = await fetch(`${origin}/api/internal/health/live`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok && (await response.json()).ok === true) return;
    } catch {
      // The HTTP listener can be unavailable while Next initializes.
    }
    await delay(250);
  }
  throw new Error("The production build failed to start");
}

const chatInput = {
  model: "nexus/auto",
  messages: [{ role: "user", content: "Local CI smoke check" }],
  max_tokens: 16,
};

try {
  await sql.begin(async (tx) => {
    await tx`insert into "user" (id, email, name, zdr) values
      (${owner}, ${`${owner}@example.invalid`}, 'CI owner', true),
      (${other}, ${`${other}@example.invalid`}, 'CI other tenant', false)`;
    await tx`insert into workspace (id, user_id, name, slug) values
      (${ownedWorkspace}, ${owner}, 'Owned workspace', 'own'),
      (${`smoke-other-workspace-${runId}`}, ${other}, 'Other workspace', 'other')`;
    await tx`insert into api_key (id, user_id, workspace_id, name, key_hash, key_prefix, is_management, scopes) values
      (${`smoke-management-${runId}`}, ${owner}, ${ownedWorkspace}, 'CI management',
       ${hash(managementKey)}, 'smoke', true, ${tx.json(["workspaces:read"])}),
      (${`smoke-inference-${runId}`}, ${owner}, ${ownedWorkspace}, 'CI inference',
       ${hash(inferenceKey)}, 'smoke', false, ${tx.json(["inference:write"])})`;
  });

  child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3910"], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      NODE_ENV: "production",
      DATABASE_URL: databaseUrl.toString(),
      DATABASE_URL_UNPOOLED: databaseUrl.toString(),
      REDIS_URL: "redis://127.0.0.1:6379",
      NEXT_PUBLIC_APP_URL: "https://nexus-smoke.example.invalid",
      NEXT_TELEMETRY_DISABLED: "1",
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      CREDENTIALS_SECRET: randomBytes(32).toString("hex"),
      CRON_SECRET: randomBytes(32).toString("hex"),
      ENABLE_GUEST_PLAYGROUND: "true",
      ENABLE_MANUAL_CREDITS: "true",
    },
    stdio: "inherit",
  });
  childExit = once(child, "exit");
  await waitForServer();

  await (await http("/", 200)).text();
  assert.equal((await http("/activity", 307)).headers.get("location"), "/login");
  const ready = await (await http("/api/internal/health/ready", 503)).json();
  assert.equal(ready.ok, false);
  assert.equal(ready.checks.database.ok, true);
  assert.equal(ready.checks.redis.ok, true);
  assert.equal(ready.capabilities.inferenceOperational, false);
  assert.equal(ready.capabilities.commerceOperational, false);

  for (const [path, input] of [
    ["/v1/chat/completions", chatInput],
    ["/v1/responses", { model: "nexus/auto", input: "Local CI smoke check" }],
    ["/v1/messages", chatInput],
  ]) {
    const response = await http(path, 401, { input, guest: true });
    assert.equal((await response.json()).error.type, "authentication_error");
    assert.ok(response.headers.get("x-request-id"));
  }
  await http("/api/internal/credits/grant", 403, { input: { usd: 1 } });

  const { data: workspaces } = await (await http("/v1/workspaces", 200, { key: managementKey })).json();
  assert.deepEqual(workspaces.map((workspace) => workspace.id), [ownedWorkspace]);
  await http("/v1/workspaces", 403, { key: inferenceKey });
  await http("/v1/chat/completions", 403, { key: managementKey, input: chatInput });
  const zdr = await (await http("/v1/chat/completions", 400, {
    key: inferenceKey,
    input: { ...chatInput, store: true },
  })).json();
  assert.equal(zdr.error.code, "zdr_incompatible");
  const [ledger] = await sql`select count(*) as count from credit_ledger where user_id in (${owner}, ${other})`;
  assert.equal(Number(ledger.count), 0, "Rejected requests must not change the credit ledger");
  console.log("Production HTTP smoke passed with PostgreSQL and Redis");
} finally {
  if (child) {
    child.kill();
    await childExit;
  }
  try {
    await sql`delete from "user" where id in (${owner}, ${other})`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
