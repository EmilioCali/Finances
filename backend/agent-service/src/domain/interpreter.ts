import { ZodError } from "zod";

import { agentInvalidResponse, validationError } from "./errors.js";
import {
  findOverlappingPairs,
  type AgentAdjustment,
} from "../schemas/adjustments.js";
import {
  grokIntentPayloadSchema,
  type AgentProposal,
  type InterpretResponse,
} from "../schemas/agent.js";
import type { XAIClient } from "../xai/client.js";
import { buildInterpretMessages } from "../xai/prompts.js";

function normalizePayload(data: Record<string, unknown>): {
  intent: AgentProposal["intent"];
  adjustments: AgentAdjustment[];
  clarification: string | null;
  ambiguous: boolean;
  scenarioId: string | null;
} {
  try {
    const parsed = grokIntentPayloadSchema.parse(data);
    return {
      intent: parsed.intent,
      adjustments: parsed.adjustments,
      clarification: parsed.clarification ?? null,
      ambiguous: parsed.ambiguous,
      scenarioId: parsed.scenarioId ?? null,
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      }));
      throw agentInvalidResponse(
        "La intención de Grok no cumple el esquema esperado.",
        details,
      );
    }
    throw error;
  }
}

export function validateProposalFromPayload(
  data: Record<string, unknown>,
): InterpretResponse {
  const payload = normalizePayload(data);
  const overlaps = findOverlappingPairs(payload.adjustments);
  if (overlaps.length > 0) {
    throw validationError("Hay ajustes del mismo tipo con alcances que se solapan.", [
      ...overlaps.map(([i, j]) => ({
        field: "adjustments",
        message: `Ajustes solapados en índices ${i} y ${j}.`,
      })),
    ]);
  }

  const proposal: AgentProposal = {
    intent: payload.intent,
    adjustments: payload.adjustments,
    clarification: payload.clarification,
    scenarioId: payload.scenarioId,
  };

  const needsConfirmation =
    payload.ambiguous ||
    (payload.clarification !== null && payload.clarification.trim() !== "") ||
    (payload.intent === "SIMULATE" && payload.adjustments.length === 0) ||
    (payload.intent === "COMPARE" && !payload.scenarioId);

  if (needsConfirmation) {
    const defaultClarification =
      payload.intent === "COMPARE" && !payload.scenarioId
        ? "Indica el scenarioId guardado que quieres comparar contra el presupuesto base."
        : "Faltan datos para armar el escenario. Indica tipo de ajuste, porcentaje y alcance (empresa o moneda).";
    return {
      status: "NEEDS_CONFIRMATION",
      proposal,
      clarification: payload.clarification ?? defaultClarification,
    };
  }

  return {
    status: "READY",
    proposal,
    clarification: null,
  };
}

export async function interpretMessage(
  client: XAIClient,
  message: string,
): Promise<InterpretResponse> {
  const cleaned = message.trim();
  if (!cleaned) {
    throw validationError("El mensaje no puede estar vacío.");
  }
  const data = await client.completeJson(buildInterpretMessages(cleaned));
  return validateProposalFromPayload(data);
}
