import { z } from "zod";

import {
  agentAdjustmentSchema,
  agentIntentSchema,
  type AgentAdjustment,
  type AgentIntent,
} from "./adjustments.js";

export const interpretStatusSchema = z.enum(["READY", "NEEDS_CONFIRMATION"]);
export const chatStatusSchema = z.enum(["EXPLAINED", "NEEDS_CONFIRMATION"]);

export type InterpretStatus = z.infer<typeof interpretStatusSchema>;
export type ChatStatus = z.infer<typeof chatStatusSchema>;

export const agentProposalSchema = z
  .object({
    intent: agentIntentSchema,
    adjustments: z.array(agentAdjustmentSchema).default([]),
    clarification: z.string().nullable().optional(),
  })
  .strict();

export type AgentProposal = {
  intent: AgentIntent;
  adjustments: AgentAdjustment[];
  clarification: string | null;
};

export const grokIntentPayloadSchema = z
  .object({
    intent: agentIntentSchema,
    adjustments: z.array(agentAdjustmentSchema).default([]),
    clarification: z.string().nullable().optional(),
    ambiguous: z.boolean().default(false),
  })
  .passthrough();

export type GrokIntentPayload = {
  intent: AgentIntent;
  adjustments: AgentAdjustment[];
  clarification: string | null;
  ambiguous: boolean;
};

export const interpretRequestSchema = z
  .object({
    message: z.string().min(1),
  })
  .strict();

export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

export const interpretResponseSchema = z
  .object({
    status: interpretStatusSchema,
    proposal: z.object({
      intent: agentIntentSchema,
      adjustments: z.array(agentAdjustmentSchema),
      clarification: z.string().nullable().optional(),
    }),
    clarification: z.string().nullable(),
  })
  .strict();

export type InterpretResponse = {
  status: InterpretStatus;
  proposal: AgentProposal;
  clarification: string | null;
};

export const chatRequestSchema = z
  .object({
    message: z.string().min(1),
    approvedAdjustments: z.array(agentAdjustmentSchema).nullable().optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const explainRequestSchema = z
  .object({
    scenarioId: z.string().min(1),
  })
  .strict();

export type ExplainRequest = z.infer<typeof explainRequestSchema>;
