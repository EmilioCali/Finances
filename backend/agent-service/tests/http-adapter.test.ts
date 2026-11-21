import { describe, expect, it, vi } from "vitest";

import { AgentError } from "../src/domain/errors.js";
import { createFinanceTools } from "../src/engine/factory.js";
import { HttpFinanceTools } from "../src/engine/http.js";
import { R1_SCENARIO_RESULTS } from "../src/engine/r1.js";
import { testSettings } from "../src/app.js";
import { parseAgentAdjustment } from "../src/schemas/adjustments.js";

describe("HttpFinanceTools adapter", () => {
  const adjustments = [
    parseAgentAdjustment({
      type: "EXCHANGE_RATE",
      currency: "GTQ",
      percentage: 10,
    }),
    parseAgentAdjustment({
      type: "OPERATING_COST",
      companyId: "company-gt",
      percentage: 8,
    }),
  ];

  it("creates, simulates and reads results via engine contracts", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (input: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${input}`);
      if (input.endsWith("/api/scenarios") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "scn_01",
            name: "Crisis",
            adjustments: [],
            createdAt: "2026-11-21T18:00:00Z",
          }),
          { status: 201 },
        );
      }
      if (input.includes("/simulate")) {
        return new Response(
          JSON.stringify({ ...R1_SCENARIO_RESULTS, scenarioId: "scn_01" }),
          { status: 200 },
        );
      }
      if (input.includes("/results")) {
        return new Response(
          JSON.stringify({ ...R1_SCENARIO_RESULTS, scenarioId: "scn_01" }),
          { status: 200 },
        );
      }
      return new Response("nope", { status: 500 });
    });

    const tools = new HttpFinanceTools("http://localhost:8000", fetchFn);
    const created = await tools.createScenario("Crisis", adjustments);
    const simulated = await tools.simulate(created.id);
    const results = await tools.getResults(created.id);

    expect(created.id).toBe("scn_01");
    expect(simulated.simulated).toMatchObject({ operatingResult: "14181.82" });
    expect(results.scenarioId).toBe("scn_01");
    expect(calls).toEqual([
      "POST http://localhost:8000/api/scenarios",
      "POST http://localhost:8000/api/scenarios/scn_01/simulate",
      "GET http://localhost:8000/api/scenarios/scn_01/results",
    ]);
    // No retries on financial writes/reads.
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("maps 404 results to NOT_FOUND without falling back to fake", async () => {
    const fetchFn = vi.fn(async () => new Response("missing", { status: 404 }));
    const tools = new HttpFinanceTools("http://localhost:8000", fetchFn);
    await expect(tools.getResults("scn_missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
      httpStatus: 404,
    } satisfies Partial<AgentError>);
  });

  it("maps engine 502 to AGENT_UNAVAILABLE (no silent fake)", async () => {
    const fetchFn = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "INTERNAL_ERROR", message: "boom", details: [] },
          }),
          { status: 502 },
        ),
    );
    const tools = new HttpFinanceTools("http://localhost:8000", fetchFn);
    await expect(tools.createScenario("x", adjustments)).rejects.toMatchObject({
      code: "AGENT_UNAVAILABLE",
    });
  });

  it("factory selects fake vs http from ENGINE_MODE", () => {
    const fake = createFinanceTools(testSettings({ engineMode: "fake" }));
    const http = createFinanceTools(testSettings({ engineMode: "http" }));
    expect(fake.constructor.name).toBe("FakeFinanceTools");
    expect(http.constructor.name).toBe("HttpFinanceTools");
  });
});
