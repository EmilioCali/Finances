import type { AgentAdjustment } from "../schemas/adjustments.js";
import { R1_SCENARIO_RESULTS } from "./r1.js";
import type { FinanceTools, ScenarioCreated, ScenarioResults } from "./types.js";

/**
 * Temporary fake until the engine ships I3.
 * Always returns the R1 JSON from PLAN D-009. Does not perform money math.
 */
export class FakeFinanceTools implements FinanceTools {
  private readonly scenarioId: string;
  private readonly created = new Map<string, ScenarioCreated>();

  constructor(scenarioId = "scn_r1_fake") {
    this.scenarioId = scenarioId;
  }

  createScenario(name: string, adjustments: AgentAdjustment[]): ScenarioCreated {
    const payload: ScenarioCreated = {
      id: this.scenarioId,
      name,
      adjustments: adjustments.map((adj) => ({
        type: adj.type,
        currency: adj.currency,
        percentage: adj.percentage,
        companyId: adj.companyId,
      })),
      createdAt: "2026-11-21T18:00:00Z",
    };
    this.created.set(this.scenarioId, payload);
    return payload;
  }

  simulate(scenarioId: string): ScenarioResults {
    const results: ScenarioResults = { ...R1_SCENARIO_RESULTS, scenarioId };
    const created = this.created.get(scenarioId);
    if (created) {
      results.name = created.name;
      results.adjustments = created.adjustments;
    }
    return results;
  }

  getResults(scenarioId: string): ScenarioResults {
    return this.simulate(scenarioId);
  }
}
