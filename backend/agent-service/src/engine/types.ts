import type { AgentAdjustment } from "../schemas/adjustments.js";

/** Opaque engine payloads; monetary fields remain strings per D-007. */
export type ScenarioCreated = {
  id: string;
  name: string;
  adjustments: Array<{
    type: string;
    currency: string | null;
    percentage: number;
    companyId: string | null;
  }>;
  createdAt: string;
};

export type ScenarioResults = Record<string, unknown>;

/**
 * Contract the orchestrator will call once TKT-001 exposes simulate (I3).
 * Implementations must not recompute FX or P&L inside the agent service.
 */
export interface FinanceTools {
  createScenario(name: string, adjustments: AgentAdjustment[]): Promise<ScenarioCreated> | ScenarioCreated;
  simulate(scenarioId: string): Promise<ScenarioResults> | ScenarioResults;
  getResults(scenarioId: string): Promise<ScenarioResults> | ScenarioResults;
}
