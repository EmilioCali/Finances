import { notFound } from "../domain/errors.js";
import type { AgentAdjustment } from "../schemas/adjustments.js";
import { R1_SCENARIO_RESULTS } from "./r1.js";
import type { FinanceTools, ScenarioCreated, ScenarioResults } from "./types.js";

/**
 * Temporary fake until the engine ships I3.
 * Always returns the R1 JSON from PLAN D-009. Does not perform money math.
 */
export class FakeFinanceTools implements FinanceTools {
  private readonly defaultScenarioId: string;
  private readonly created = new Map<string, ScenarioCreated>();
  private nextId = 1;
  createCalls = 0;
  simulateCalls = 0;
  failNextCreate = false;

  constructor(defaultScenarioId = "scn_r1_fake") {
    this.defaultScenarioId = defaultScenarioId;
  }

  createScenario(name: string, adjustments: AgentAdjustment[]): ScenarioCreated {
    this.createCalls += 1;
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new Error("engine create failed");
    }
    const id =
      this.created.size === 0
        ? this.defaultScenarioId
        : `scn_fake_${String(this.nextId).padStart(2, "0")}`;
    this.nextId += 1;
    const payload: ScenarioCreated = {
      id,
      name,
      adjustments: adjustments.map((adj) => ({
        type: adj.type,
        currency: adj.currency,
        percentage: adj.percentage,
        companyId: adj.companyId,
      })),
      createdAt: "2026-11-21T18:00:00Z",
    };
    this.created.set(id, payload);
    return payload;
  }

  simulate(scenarioId: string): ScenarioResults {
    this.simulateCalls += 1;
    if (!this.created.has(scenarioId)) {
      throw notFound(`Escenario no encontrado: ${scenarioId}`);
    }
    const results: ScenarioResults = { ...R1_SCENARIO_RESULTS, scenarioId };
    const created = this.created.get(scenarioId);
    if (created) {
      results.name = created.name;
      results.adjustments = created.adjustments;
    }
    return results;
  }

  getResults(scenarioId: string): ScenarioResults {
    if (!this.created.has(scenarioId)) {
      throw notFound(`Escenario no encontrado: ${scenarioId}`);
    }
    return this.simulate(scenarioId);
  }

  /** Seed a stored scenario for explain/compare tests without going through chat. */
  seed(scenarioId = this.defaultScenarioId, name = "Crisis Guatemala"): ScenarioCreated {
    const payload: ScenarioCreated = {
      id: scenarioId,
      name,
      adjustments: (R1_SCENARIO_RESULTS.adjustments as ScenarioCreated["adjustments"]) ?? [],
      createdAt: "2026-11-21T18:00:00Z",
    };
    this.created.set(scenarioId, payload);
    return payload;
  }
}
