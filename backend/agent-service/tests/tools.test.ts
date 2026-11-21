import { describe, expect, it } from "vitest";

import { FakeFinanceTools } from "../src/engine/fake.js";
import { R1_SCENARIO_RESULTS } from "../src/engine/r1.js";
import type { FinanceTools } from "../src/engine/types.js";
import { parseAgentAdjustment } from "../src/schemas/adjustments.js";

describe("finance tools (parity with Python test_tools)", () => {
  it("test_fake_implements_protocol", () => {
    const tools: FinanceTools = new FakeFinanceTools();
    expect(typeof tools.createScenario).toBe("function");
    expect(typeof tools.simulate).toBe("function");
    expect(typeof tools.getResults).toBe("function");
  });

  it("test_fake_create_and_simulate_returns_r1_numbers", () => {
    const tools = new FakeFinanceTools();
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
    const created = tools.createScenario("Crisis Guatemala", adjustments);
    const results = tools.simulate(created.id) as {
      simulated: { operatingResult: string };
      variance: { operatingResult: { absolute: string; percentage: string } };
      fxRates: { simulated: Array<{ unitsPerUsd: string }> };
      base: { revenue: string };
      scenarioId: string;
    };

    expect(results.simulated.operatingResult).toBe("14181.82");
    expect(results.variance.operatingResult.absolute).toBe("-818.18");
    expect(results.variance.operatingResult.percentage).toBe("-5.45");
    expect(results.fxRates.simulated[0]?.unitsPerUsd).toBe("8.5250");
    expect(typeof results.base.revenue).toBe("string");
    expect(results.scenarioId).toBe(created.id);
  });

  it("test_r1_constant_matches_plan_totals", () => {
    const base = R1_SCENARIO_RESULTS.base as { operatingResult: string };
    const simulated = R1_SCENARIO_RESULTS.simulated as {
      operatingResult: string;
    };
    expect(base.operatingResult).toBe("15000.00");
    expect(simulated.operatingResult).toBe("14181.82");
  });
});
