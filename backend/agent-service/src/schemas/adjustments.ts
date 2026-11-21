import { z } from "zod";

/** Demo companies from D-004 — temporary until engine exposes GET /api/companies. */
export const KNOWN_COMPANY_IDS = ["company-gt", "company-us", "company-mx"] as const;
export const KNOWN_CURRENCIES = ["GTQ", "USD", "MXN"] as const;

export const adjustmentTypeSchema = z.enum([
  "EXCHANGE_RATE",
  "REVENUE",
  "OPERATING_COST",
]);

export const agentIntentSchema = z.enum(["SIMULATE", "COMPARE"]);

export type AdjustmentType = z.infer<typeof adjustmentTypeSchema>;
export type AgentIntent = z.infer<typeof agentIntentSchema>;

const baseAdjustmentSchema = z
  .object({
    type: adjustmentTypeSchema,
    percentage: z.number(),
    currency: z.string().nullable().optional(),
    companyId: z.string().nullable().optional(),
  })
  .strict();

export const agentAdjustmentSchema = baseAdjustmentSchema
  .transform((value) => ({
    type: value.type,
    percentage: value.percentage,
    currency:
      value.currency === undefined || value.currency === null
        ? null
        : value.currency.trim().toUpperCase(),
    companyId:
      value.companyId === undefined || value.companyId === null
        ? null
        : value.companyId,
  }))
  .superRefine((value, ctx) => {
    if (value.type === "EXCHANGE_RATE") {
      if (!value.currency) {
        ctx.addIssue({
          code: "custom",
          message: "EXCHANGE_RATE exige currency.",
          path: ["currency"],
        });
        return;
      }
      if (!KNOWN_CURRENCIES.includes(value.currency as (typeof KNOWN_CURRENCIES)[number])) {
        ctx.addIssue({
          code: "custom",
          message: `Moneda no soportada: ${value.currency}.`,
          path: ["currency"],
        });
      }
      if (!(value.percentage > -99 && value.percentage <= 200)) {
        ctx.addIssue({
          code: "custom",
          message:
            "Porcentaje de EXCHANGE_RATE debe ser mayor que -99 y menor o igual a 200.",
          path: ["percentage"],
        });
      }
      return;
    }

    if (!(value.percentage >= -90 && value.percentage <= 200)) {
      ctx.addIssue({
        code: "custom",
        message: `Porcentaje de ${value.type} debe estar entre -90 y 200.`,
        path: ["percentage"],
      });
    }
    if (
      value.companyId !== null &&
      !KNOWN_COMPANY_IDS.includes(value.companyId as (typeof KNOWN_COMPANY_IDS)[number])
    ) {
      ctx.addIssue({
        code: "custom",
        message: `Empresa inexistente: ${value.companyId}.`,
        path: ["companyId"],
      });
    }
  });

export type AgentAdjustment = z.infer<typeof agentAdjustmentSchema>;

export function parseAgentAdjustment(input: unknown): AgentAdjustment {
  return agentAdjustmentSchema.parse(input);
}

export function adjustmentsOverlap(
  left: AgentAdjustment,
  right: AgentAdjustment,
): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "EXCHANGE_RATE") {
    if (left.currency !== right.currency) return false;
    if (left.companyId === null || right.companyId === null) return true;
    return left.companyId === right.companyId;
  }
  if (left.companyId === null || right.companyId === null) return true;
  return left.companyId === right.companyId;
}

export function findOverlappingPairs(
  adjustments: AgentAdjustment[],
): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < adjustments.length; i += 1) {
    const left = adjustments[i];
    if (!left) continue;
    for (let j = i + 1; j < adjustments.length; j += 1) {
      const right = adjustments[j];
      if (!right) continue;
      if (adjustmentsOverlap(left, right)) {
        pairs.push([i, j]);
      }
    }
  }
  return pairs;
}
