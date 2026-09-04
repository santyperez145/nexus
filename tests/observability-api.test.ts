import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const dataDir = mkdtempSync(join(tmpdir(), "nexus-observability-api-test-"));
process.env.ENABLE_PGLITE = "true";
process.env.PGLITE_DATA_DIR = dataDir;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;
delete process.env.POSTGRES_PRISMA_URL;

const token = "sk-nx-mgmt-observability-test";
let database: typeof import("../src/lib/db");
let route: typeof import("../src/app/api/v1/observability/route");

function request(path = "", init?: RequestInit) {
  return new Request(`https://nexus.test/api/v1/observability${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

before(async () => {
  database = await import("../src/lib/db");
  const { sha256 } = await import("../src/lib/crypto");
  route = await import("../src/app/api/v1/observability/route");
  await database.ensureDb();
  await database.db.insert(database.schema.users).values({
    id: "usr_observability_api",
    name: "Operator",
    email: "operator@observability.test",
    plan: "pro",
  });
  await database.db.insert(database.schema.apiKeys).values({
    id: "key_observability_api",
    userId: "usr_observability_api",
    name: "Observability management",
    keyHash: sha256(token),
    keyPrefix: "sk-nx-mgmt-observability",
    isManagement: true,
  });
});

after(() => rmSync(dataDir, { recursive: true, force: true }));

describe("observability destination API", () => {
  it("requires HTTPS before persisting a destination", async () => {
    const response = await route.POST(
      request("", {
        method: "POST",
        body: JSON.stringify({ url: "http://example.com/hook", name: "Unsafe" }),
      }),
    );
    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, "https_required");
  });

  it("reveals a mandatory signature secret once and scrubs it on deletion", async () => {
    const createdResponse = await route.POST(
      request("", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com/hook",
          name: "Production",
          secret: false,
          type: "unsigned",
        }),
      }),
    );
    assert.equal(createdResponse.status, 200);
    const created = (await createdResponse.json()) as {
      data: {
        id: string;
        type: string;
        config: Record<string, unknown>;
        revealed_secret: string;
      };
    };
    assert.equal(created.data.type, "webhook");
    assert.equal(created.data.config.has_secret, true);
    assert.equal("secret" in created.data.config, false);
    assert.match(created.data.revealed_secret, /^nxs_/);

    const listedResponse = await route.GET(request());
    assert.equal(listedResponse.status, 200);
    const listed = (await listedResponse.json()) as {
      data: Array<{ id: string; config: Record<string, unknown> }>;
    };
    const destination = listed.data.find((row) => row.id === created.data.id);
    assert.equal(destination?.config.has_secret, true);
    assert.equal("secret" in (destination?.config ?? {}), false);

    const deletedResponse = await route.DELETE(
      request(`?id=${encodeURIComponent(created.data.id)}`, { method: "DELETE" }),
    );
    assert.equal(deletedResponse.status, 200);
    const [deleted] = await database.db
      .select()
      .from(database.schema.observabilityDestinations)
      .where(eq(database.schema.observabilityDestinations.id, created.data.id))
      .limit(1);
    assert.equal(deleted?.deleted, true);
    assert.equal("secret" in ((deleted?.config ?? {}) as Record<string, unknown>), false);
  });
});
