import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, testSettings } from "../src/app.js";
import { InMemoryTraceStore, resetTraceSeqForTests } from "../src/db/traces.js";
import { IdempotencyCache } from "../src/domain/idempotency.js";
import { FakeFinanceTools } from "../src/engine/fake.js";
import { createMockTransport } from "../src/xai/client.js";
import { r1IntentJson } from "./helpers.js";

const DEMO_MESSAGE =
  "Simula una depreciación del quetzal del 10 % y un aumento de costos del 8 % en Guatemala";

const R1_ADJUSTMENTS = [
  {
    type: "EXCHANGE_RATE",
    currency: "GTQ",
    percentage: 10,
    companyId: null,
  },
  {
    type: "OPERATING_COST",
    currency: null,
    percentage: 8,
    companyId: "company-gt",
  },
] as const;

describe("orchestration stage-2", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];
  let finance: FakeFinanceTools;
  let traces: InMemoryTraceStore;
  let idempotency: IdempotencyCache;

  beforeEach(() => {
    resetTraceSeqForTests();
    finance = new FakeFinanceTools();
    traces = new InMemoryTraceStore();
    idempotency = new IdempotencyCache();
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function makeApp(transportOptions: Parameters<typeof createMockTransport>[0]) {
    const app = await buildApp({
      settings: testSettings(),
      xaiTransport: createMockTransport(transportOptions),
      financeTools: finance,
      traceStore: traces,
      idempotency,
      polishWithGrok: false,
    });
    apps.push(app);
    return app;
  }

  it("1. chat with valid simulation", async () => {
    const app = await makeApp({ content: r1IntentJson() });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: { message: DEMO_MESSAGE, approvedAdjustments: null },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("EXPLAINED");
    expect(body.scenarioId).toBe("scn_r1_fake");
    expect(body.results.simulated.operatingResult).toBe("14181.82");
    expect(body.explanation).toContain("14181.82");
    expect(body.clarification).toBeNull();
  });

  it("2. chat ambiguous needs confirmation", async () => {
    const app = await makeApp({
      content: JSON.stringify({
        intent: "SIMULATE",
        adjustments: [
          { type: "OPERATING_COST", percentage: 8, companyId: null },
        ],
        ambiguous: true,
        clarification: "¿El aumento de costos aplica solo a Empresa A o a todo el grupo?",
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: { message: "sube costos un 8%", approvedAdjustments: null },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("NEEDS_CONFIRMATION");
    expect(body.scenarioId).toBeNull();
    expect(body.results).toBeNull();
    expect(body.explanation).toBeNull();
    expect(body.clarification).toContain("Empresa A");
    expect(finance.createCalls).toBe(0);
  });

  it("3. confirmation via approvedAdjustments skips reinterpretation", async () => {
    const app = await makeApp({
      raiseTimeout: true, // would fail if Grok were called
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: {
        message: DEMO_MESSAGE,
        approvedAdjustments: R1_ADJUSTMENTS,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("EXPLAINED");
    expect(body.proposal.adjustments).toHaveLength(2);
    expect(body.results.variance.operatingResult.percentage).toBe("-5.45");
  });

  it("4. invalid parameters", async () => {
    const app = await makeApp({ content: r1IntentJson() });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: {
        message: DEMO_MESSAGE,
        approvedAdjustments: [
          { type: "OPERATING_COST", percentage: 8, companyId: "company-zz" },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("5. R1 execution numbers", async () => {
    const app = await makeApp({ content: r1IntentJson() });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: { message: DEMO_MESSAGE, approvedAdjustments: null },
    });
    const body = response.json();
    expect(body.results.base.operatingResult).toBe("15000.00");
    expect(body.results.simulated.operatingResult).toBe("14181.82");
    expect(body.results.variance.operatingResult.absolute).toBe("-818.18");
    expect(body.results.fxRates.simulated[0].unitsPerUsd).toBe("8.5250");
    expect(body.explanation).toContain("15000.00");
    expect(body.explanation).toContain("-818.18");
  });

  it("6. explanation based on existing results", async () => {
    finance.seed("scn_01", "Crisis Guatemala");
    const app = await makeApp({ content: "{}" });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/explain",
      payload: { scenarioId: "scn_01" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.scenarioId).toBe("scn_01");
    expect(body.results.simulated.operatingResult).toBe("14181.82");
    expect(body.explanation).toContain("14181.82");
    expect(body.explanation).toContain("Empresa A");
  });

  it("7. nonexistent scenario", async () => {
    const app = await makeApp({ content: "{}" });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/explain",
      payload: { scenarioId: "scn_missing" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });

  it("8. Grok timeout", async () => {
    const app = await makeApp({ raiseTimeout: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: { message: DEMO_MESSAGE, approvedAdjustments: null },
    });
    expect(response.statusCode).toBe(504);
    expect(response.json().error.code).toBe("AGENT_TIMEOUT");
    expect(finance.createCalls).toBe(0);
  });

  it("9. financial engine failure", async () => {
    finance.failNextCreate = true;
    const app = await makeApp({ content: r1IntentJson() });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: { message: DEMO_MESSAGE, approvedAdjustments: null },
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("AGENT_UNAVAILABLE");
  });

  it("10. prevents duplicate scenarios on retry", async () => {
    const app = await makeApp({ content: r1IntentJson() });
    const first = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: { message: DEMO_MESSAGE, approvedAdjustments: null },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: { message: DEMO_MESSAGE, approvedAdjustments: null },
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().scenarioId).toBe(second.json().scenarioId);
    expect(finance.createCalls).toBe(1);
    expect(finance.simulateCalls).toBe(1);
  });
});
