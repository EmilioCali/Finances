import { describe, expect, it } from "vitest";

import { buildApp, testSettings } from "../src/app.js";
import { ResilientTraceStore } from "../src/db/resilient.js";
import type { TraceStore } from "../src/db/traces.js";
import { FakeFinanceTools } from "../src/engine/fake.js";
import { createMockTransport } from "../src/xai/client.js";
import { r1IntentJson } from "./helpers.js";

describe("trace persistence resilience", () => {
  it("continues chat when Supabase-like store fails insert", async () => {
    const failingPrimary: TraceStore = {
      async insert() {
        throw new Error("supabase down");
      },
      async update() {
        throw new Error("supabase down");
      },
      async get() {
        return null;
      },
      async findByIdempotencyKey() {
        return null;
      },
    };
    const logs: string[] = [];
    const store = new ResilientTraceStore(failingPrimary, (op, error) => {
      logs.push(`${op}:${error instanceof Error ? error.message : String(error)}`);
    });
    const finance = new FakeFinanceTools();
    const app = await buildApp({
      settings: testSettings(),
      xaiTransport: createMockTransport({ content: r1IntentJson() }),
      financeTools: finance,
      traceStore: store,
      polishWithGrok: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: {
        message:
          "Simula una depreciación del quetzal del 10 % y un aumento de costos del 8 % en Guatemala",
        approvedAdjustments: null,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("EXPLAINED");
    expect(store.primaryFailed.insert).toBeGreaterThan(0);
    expect(logs.some((line) => line.includes("supabase down"))).toBe(true);
    expect(store.wasEphemeral(response.json().traceId)).toBe(true);
    await app.close();
  });

  it("rejects overlapping approved adjustments", async () => {
    const app = await buildApp({
      settings: testSettings(),
      xaiTransport: createMockTransport({ content: "{}" }),
      financeTools: new FakeFinanceTools(),
      polishWithGrok: false,
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: {
        message: "confirma",
        approvedAdjustments: [
          { type: "OPERATING_COST", percentage: 8, companyId: "company-gt" },
          { type: "OPERATING_COST", percentage: 5, companyId: null },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });
});
