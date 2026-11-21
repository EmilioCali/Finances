import type { AgentAdjustment } from "../schemas/adjustments.js";
import { agentUnavailable } from "../domain/errors.js";
import type { FinanceTools, ScenarioCreated, ScenarioResults } from "./types.js";

/**
 * HTTP adapter toward the FastAPI financial engine.
 * Not used by stage-1 tests; ready for I3 cutover.
 */
export class HttpFinanceTools implements FinanceTools {
  constructor(private readonly baseUrl: string) {}

  async createScenario(
    name: string,
    adjustments: AgentAdjustment[],
  ): Promise<ScenarioCreated> {
    const response = await fetch(`${this.baseUrl}/api/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        adjustments: adjustments.map((adj) => ({
          type: adj.type,
          percentage: adj.percentage,
          ...(adj.type === "EXCHANGE_RATE"
            ? { currency: adj.currency }
            : { companyId: adj.companyId }),
        })),
      }),
    });
    if (!response.ok) {
      throw agentUnavailable(
        `El motor rechazó create_scenario (${response.status}).`,
      );
    }
    return (await response.json()) as ScenarioCreated;
  }

  async simulate(scenarioId: string): Promise<ScenarioResults> {
    const response = await fetch(
      `${this.baseUrl}/api/scenarios/${encodeURIComponent(scenarioId)}/simulate`,
      { method: "POST" },
    );
    if (!response.ok) {
      throw agentUnavailable(`El motor rechazó simulate (${response.status}).`);
    }
    return (await response.json()) as ScenarioResults;
  }

  async getResults(scenarioId: string): Promise<ScenarioResults> {
    const response = await fetch(
      `${this.baseUrl}/api/scenarios/${encodeURIComponent(scenarioId)}/results`,
    );
    if (!response.ok) {
      throw agentUnavailable(`El motor rechazó get_results (${response.status}).`);
    }
    return (await response.json()) as ScenarioResults;
  }
}
