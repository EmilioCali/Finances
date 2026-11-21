import type { TraceStore } from "../db/traces.js";
import type { FinanceTools } from "../engine/types.js";
import {
  agentAdjustmentSchema,
  findOverlappingPairs,
  type AgentAdjustment,
} from "../schemas/adjustments.js";
import type {
  AgentProposal,
  ChatRequest,
  ChatResponse,
  ExplainResponse,
} from "../schemas/agent.js";
import type { XAIClient } from "../xai/client.js";
import {
  AgentError,
  agentUnavailable,
  validationError,
} from "./errors.js";
import {
  buildExplanationFromResults,
  polishExplanationWithGrok,
} from "./explanation.js";
import { buildIdempotencyKey, IdempotencyCache } from "./idempotency.js";
import {
  interpretMessage,
  validateProposalFromPayload,
} from "./interpreter.js";

export type OrchestratorDeps = {
  xai: XAIClient;
  finance: FinanceTools;
  traces: TraceStore;
  idempotency?: IdempotencyCache;
  polishWithGrok?: boolean;
};

function proposalToRecord(proposal: AgentProposal): Record<string, unknown> {
  return {
    intent: proposal.intent,
    adjustments: proposal.adjustments,
    clarification: proposal.clarification,
    ...(proposal.scenarioId ? { scenarioId: proposal.scenarioId } : {}),
  };
}

function parseApprovedAdjustments(
  raw: unknown[] | null | undefined,
): AgentAdjustment[] {
  if (raw === null || raw === undefined) {
    throw validationError("approvedAdjustments es obligatorio en este contexto.");
  }
  const adjustments: AgentAdjustment[] = [];
  for (const [index, item] of raw.entries()) {
    const parsed = agentAdjustmentSchema.safeParse(item);
    if (!parsed.success) {
      throw validationError("approvedAdjustments contiene un ajuste inválido.", [
        {
          field: `approvedAdjustments.${index}`,
          message: parsed.error.issues[0]?.message ?? "inválido",
        },
      ]);
    }
    adjustments.push(parsed.data);
  }
  const overlaps = findOverlappingPairs(adjustments);
  if (overlaps.length > 0) {
    throw validationError("Hay ajustes del mismo tipo con alcances que se solapan.", [
      ...overlaps.map(([i, j]) => ({
        field: "approvedAdjustments",
        message: `Ajustes solapados en índices ${i} y ${j}.`,
      })),
    ]);
  }
  if (adjustments.length === 0) {
    throw validationError("approvedAdjustments no puede estar vacío.");
  }
  return adjustments;
}

function scenarioNameFromMessage(message: string): string {
  const cleaned = message.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 80) return cleaned || "Escenario agente";
  return `${cleaned.slice(0, 77)}...`;
}

async function resolveFinance<T>(work: () => Promise<T> | T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw agentUnavailable(
      error instanceof Error
        ? `El motor financiero falló: ${error.message}`
        : "El motor financiero falló.",
    );
  }
}

export class AgentOrchestrator {
  private readonly xai: XAIClient;
  private readonly finance: FinanceTools;
  private readonly traces: TraceStore;
  private readonly idempotency: IdempotencyCache;
  private readonly polishWithGrok: boolean;

  constructor(deps: OrchestratorDeps) {
    this.xai = deps.xai;
    this.finance = deps.finance;
    this.traces = deps.traces;
    this.idempotency = deps.idempotency ?? new IdempotencyCache();
    this.polishWithGrok = deps.polishWithGrok ?? false;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const message = request.message.trim();
    if (!message) {
      throw validationError("El mensaje no puede estar vacío.");
    }

    const hasApproved =
      request.approvedAdjustments !== null &&
      request.approvedAdjustments !== undefined;

    let proposal: AgentProposal;

    if (hasApproved) {
      const adjustments = parseApprovedAdjustments(request.approvedAdjustments);
      proposal = {
        intent: "SIMULATE",
        adjustments,
        clarification: null,
      };
    } else {
      const interpreted = await interpretMessage(this.xai, message);
      proposal = interpreted.proposal;
      if (interpreted.status === "NEEDS_CONFIRMATION") {
        const trace = await this.traces.insert({
          requestMessage: message,
          interpretedParams: proposalToRecord(proposal),
          status: "NEEDS_CONFIRMATION",
          explanation: null,
        });
        return {
          status: "NEEDS_CONFIRMATION",
          traceId: trace.id,
          proposal,
          scenarioId: null,
          results: null,
          explanation: null,
          clarification: interpreted.clarification,
        };
      }
    }

    const idemKey = buildIdempotencyKey({
      message,
      intent: proposal.intent,
      adjustments: proposal.adjustments,
    });
    const cached = this.idempotency.get(idemKey);
    if (cached) {
      return {
        ...cached.response,
        // Keep a stable contract; reuse prior explanation/results/scenario.
      };
    }

    const trace = await this.traces.insert({
      requestMessage: message,
      interpretedParams: proposalToRecord(proposal),
      approvedParams: hasApproved ? proposalToRecord(proposal) : null,
      status: "INTERPRETED",
      idempotencyKey: idemKey,
    });

    try {
      if (proposal.intent === "COMPARE") {
        return await this.runCompare(trace.id, proposal, idemKey);
      }
      return await this.runSimulate(trace.id, message, proposal, idemKey, hasApproved);
    } catch (error) {
      const body =
        error instanceof AgentError
          ? error.toErrorBody().error
          : { code: "INTERNAL_ERROR", message: String(error), details: [] };
      await this.traces.update(trace.id, {
        status: "ERROR",
        error: body,
      });
      throw error;
    }
  }

  async explain(scenarioId: string): Promise<ExplainResponse> {
    const results = await resolveFinance(() => this.finance.getResults(scenarioId));
    const proposal: AgentProposal = {
      intent: "COMPARE",
      adjustments: [],
      clarification: null,
      scenarioId,
    };
    let explanation = buildExplanationFromResults(results, proposal);
    if (this.polishWithGrok) {
      explanation = await polishExplanationWithGrok(this.xai, explanation, results);
    }
    await this.traces.insert({
      requestMessage: `explain:${scenarioId}`,
      interpretedParams: { scenarioId },
      scenarioId,
      resultRef: scenarioId,
      status: "EXPLAINED",
      explanation,
    });
    return { scenarioId, results, explanation };
  }

  private async runCompare(
    traceId: string,
    proposal: AgentProposal,
    idemKey: string,
  ): Promise<ChatResponse> {
    const scenarioId = proposal.scenarioId;
    if (!scenarioId) {
      await this.traces.update(traceId, {
        status: "NEEDS_CONFIRMATION",
      });
      return {
        status: "NEEDS_CONFIRMATION",
        traceId,
        proposal,
        scenarioId: null,
        results: null,
        explanation: null,
        clarification:
          "Indica el scenarioId guardado que quieres comparar contra el presupuesto base.",
      };
    }

    const results = await resolveFinance(() => this.finance.getResults(scenarioId));
    let explanation = buildExplanationFromResults(results, proposal);
    if (this.polishWithGrok) {
      explanation = await polishExplanationWithGrok(this.xai, explanation, results);
    }

    const response: ChatResponse = {
      status: "EXPLAINED",
      traceId,
      proposal,
      scenarioId,
      results,
      explanation,
      clarification: null,
    };
    await this.traces.update(traceId, {
      status: "EXPLAINED",
      scenarioId,
      resultRef: scenarioId,
      explanation,
    });
    this.idempotency.set(idemKey, response, scenarioId);
    return response;
  }

  private async runSimulate(
    traceId: string,
    message: string,
    proposal: AgentProposal,
    idemKey: string,
    approved: boolean,
  ): Promise<ChatResponse> {
    const created = await resolveFinance(() =>
      this.finance.createScenario(scenarioNameFromMessage(message), proposal.adjustments),
    );
    const results = await resolveFinance(() => this.finance.simulate(created.id));
    let explanation = buildExplanationFromResults(results, proposal);
    if (this.polishWithGrok) {
      explanation = await polishExplanationWithGrok(this.xai, explanation, results);
    }

    const response: ChatResponse = {
      status: "EXPLAINED",
      traceId,
      proposal,
      scenarioId: created.id,
      results,
      explanation,
      clarification: null,
    };
    await this.traces.update(traceId, {
      status: "EXPLAINED",
      approvedParams: approved ? proposalToRecord(proposal) : null,
      scenarioId: created.id,
      resultRef: created.id,
      explanation,
    });
    this.idempotency.set(idemKey, response, created.id);
    return response;
  }
}
