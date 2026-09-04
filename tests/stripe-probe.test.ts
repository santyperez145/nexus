import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripeAccountProbeResult } from "../src/lib/billing/stripe-probe";

describe("Stripe commercial readiness probe", () => {
  it("requires completed account details", () => {
    const result = stripeAccountProbeResult(
      { details_submitted: false, charges_enabled: false },
      12,
    );
    assert.equal(result.ok, false);
    assert.equal(result.detail, "Cuenta Stripe incompleta");
  });

  it("requires charges to be enabled", () => {
    const result = stripeAccountProbeResult(
      {
        details_submitted: true,
        charges_enabled: false,
        business_profile: { name: "Nexus" },
      },
      12,
    );
    assert.equal(result.ok, false);
    assert.equal(result.detail, "Cobros Stripe deshabilitados");
  });

  it("requires a customer-facing Nexus brand", () => {
    const result = stripeAccountProbeResult(
      {
        details_submitted: true,
        charges_enabled: true,
        business_profile: { name: "nexus-stripe" },
      },
      12,
    );
    assert.equal(result.ok, false);
    assert.equal(result.detail, "Marca pública Stripe pendiente");
  });

  it("reports operational only when the account can charge under the production brand", () => {
    const result = stripeAccountProbeResult(
      {
        details_submitted: true,
        charges_enabled: true,
        business_profile: { name: "Nexus AI" },
      },
      12,
    );
    assert.equal(result.ok, true);
    assert.equal(result.detail, "Verificado · cobros habilitados");
  });
});
