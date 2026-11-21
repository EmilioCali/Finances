import { agentUnavailable, notFound } from "../domain/errors.js";
import type { AgentAdjustment } from "../schemas/adjustments.js";
import type { FinanceTools, ScenarioCreated, ScenarioResults } from "./types.js";

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * HTTP adapter for the FastAPI financial engine (contracts from TKT-001 / PLAN).
 * No retries: create/simulate are not idempotent without server-side keys.
 * No silent fallback to FakeFinanceTools.
 */
export class HttpFinanceTools implements FinanceTools {
  private readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(baseUrl: string, fetchFn: FetchLike = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn;
  }

  async createScenario(
    name: string,
    adjustments: AgentAdjustment[],
  ): Promise<ScenarioCreated> {
    const response = await this.request("/api/scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        adjustments: adjustments.map((adj) => ({
          type: adj.type,
          percentage: adj.percentage,
          currency: adj.type === "EXCHANGE_RATE" ? adj.currency : null,
          companyId: adj.type === "EXCHANGE_RATE" ? null : adj.companyId,
        })),
      }),
    });
    if (response.status === 404) {
      throw notFound("Endpoint de escenarios no encontrado en el motor.");
    }
    if (!response.ok) {
      throw await this.toEngineError(response, "create_scenario");
    }
    return (await response.json()) as ScenarioCreated;
  }

  async simulate(scenarioId: string): Promise<ScenarioResults> {
    const response = await this.request(
      `/api/scenarios/${encodeURIComponent(scenarioId)}/simulate`,
      { method: "POST" },
    );
    if (response.status === 404) {
      throw notFound(`Escenario no encontrado: ${scenarioId}`);
    }
    if (!response.ok) {
      throw await this.toEngineError(response, "simulate");
    }
    return (await response.json()) as ScenarioResults;
  }

  async getResults(scenarioId: string): Promise<ScenarioResults> {
    const response = await this.request(
      `/api/scenarios/${encodeURIComponent(scenarioId)}/results`,
      { method: "GET" },
    );
    if (response.status === 404) {
      throw notFound(`Escenario no encontrado: ${scenarioId}`);
    }
    if (!response.ok) {
      throw await this.toEngineError(response, "get_results");
    }
    return (await response.json()) as ScenarioResults;
  }

  private request(path: string, init?: RequestInit): Promise<Response> {
    return this.fetchFn(`${this.baseUrl}${path}`, init);
  }

  private async toEngineError(response: Response, op: string) {
    let detail = "";
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (body.error?.message) {
        detail = ` ${body.error.code ?? ""}: ${body.error.message}`.trim();
      }
    } catch {
      detail = "";
    }
    return agentUnavailable(
      `El motor rechazó ${op} (${response.status}).${detail ? ` ${detail}` : ""}`,
    );
  }
}
