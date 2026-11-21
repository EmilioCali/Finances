import type { ScenarioResults } from "../engine/types.js";
import type { AgentProposal } from "../schemas/agent.js";
import type { XAIClient } from "../xai/client.js";

const AMOUNT_RE = /-?\d+\.\d{2}/g;
const RATE_RE = /-?\d+\.\d{4}/g;
const PCT_RE = /-?\d+\.\d{2}/g;

function collectAllowedFigures(results: ScenarioResults): Set<string> {
  const raw = JSON.stringify(results);
  const allowed = new Set<string>();
  for (const match of raw.match(AMOUNT_RE) ?? []) allowed.add(match);
  for (const match of raw.match(RATE_RE) ?? []) allowed.add(match);
  for (const match of raw.match(PCT_RE) ?? []) allowed.add(match);
  return allowed;
}

function textUsesOnlyAllowedFigures(text: string, allowed: Set<string>): boolean {
  const found = new Set<string>([
    ...(text.match(AMOUNT_RE) ?? []),
    ...(text.match(RATE_RE) ?? []),
  ]);
  for (const figure of found) {
    if (!allowed.has(figure)) return false;
  }
  return true;
}

type Totals = {
  revenue: string;
  expense: string;
  operatingResult: string;
};

type VarianceBlock = {
  absolute: string;
  percentage: string | null;
};

function asTotals(value: unknown): Totals | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.revenue !== "string" ||
    typeof obj.expense !== "string" ||
    typeof obj.operatingResult !== "string"
  ) {
    return null;
  }
  return {
    revenue: obj.revenue,
    expense: obj.expense,
    operatingResult: obj.operatingResult,
  };
}

function asVariance(value: unknown): VarianceBlock | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.absolute !== "string") return null;
  return {
    absolute: obj.absolute,
    percentage: typeof obj.percentage === "string" ? obj.percentage : null,
  };
}

/**
 * Builds the explanation from engine figures only (D-011).
 * Grok never supplies the numeric source of truth.
 */
export function buildExplanationFromResults(
  results: ScenarioResults,
  proposal: AgentProposal,
): string {
  const base = asTotals(results.base);
  const simulated = asTotals(results.simulated);
  const operatingVariance = asVariance(
    (results.variance as Record<string, unknown> | undefined)?.operatingResult,
  );
  const name =
    typeof results.name === "string" && results.name.trim()
      ? results.name
      : "el escenario";

  if (!base || !simulated || !operatingVariance) {
    return "La simulación terminó, pero el resultado no trae totales legibles del motor.";
  }

  const intentLabel =
    proposal.intent === "COMPARE" ? "La comparación" : "La simulación";
  const pct =
    operatingVariance.percentage === null
      ? "sin porcentaje (base cero)"
      : `${operatingVariance.percentage} %`;

  const companyLine = mostAffectedCompanyLine(results);

  return (
    `${intentLabel} «${name}» parte de un resultado operativo base de ${base.operatingResult} USD ` +
    `(ingresos ${base.revenue}, gastos ${base.expense}). ` +
    `Tras aplicar los ajustes del motor, el resultado simulado es ${simulated.operatingResult} USD ` +
    `(ingresos ${simulated.revenue}, gastos ${simulated.expense}). ` +
    `La variación del resultado es ${operatingVariance.absolute} USD (${pct}).` +
    (companyLine ? ` ${companyLine}` : "")
  );
}

function mostAffectedCompanyLine(results: ScenarioResults): string | null {
  const byCompany = results.byCompany;
  if (!Array.isArray(byCompany) || byCompany.length === 0) return null;

  let best:
    | {
        companyId: string;
        absolute: string;
        percentage: string | null;
      }
    | undefined;

  for (const row of byCompany) {
    if (typeof row !== "object" || row === null) continue;
    const companyId = (row as { companyId?: unknown }).companyId;
    const variance = asVariance(
      (row as { variance?: { operatingResult?: unknown } }).variance
        ?.operatingResult,
    );
    if (typeof companyId !== "string" || !variance) continue;
    const abs = Math.abs(Number(variance.absolute));
    const bestAbs = best ? Math.abs(Number(best.absolute)) : -1;
    if (!best || abs > bestAbs) {
      best = {
        companyId,
        absolute: variance.absolute,
        percentage: variance.percentage,
      };
    }
  }

  if (!best) return null;
  const label =
    best.companyId === "company-gt"
      ? "Empresa A"
      : best.companyId === "company-us"
        ? "Empresa B"
        : best.companyId === "company-mx"
          ? "Empresa C"
          : best.companyId;
  const pct =
    best.percentage === null ? "n/d" : `${best.percentage} %`;
  return `La empresa más afectada es ${label} (variación ${best.absolute} USD, ${pct}).`;
}

export async function polishExplanationWithGrok(
  client: XAIClient,
  draft: string,
  results: ScenarioResults,
): Promise<string> {
  const allowed = collectAllowedFigures(results);
  try {
    const raw = await client.chatCompletion(
      [
        {
          role: "system",
          content:
            "Reescribe la explicación financiera en español claro. " +
            "Usa ÚNICAMENTE las cifras que ya aparecen en el borrador. " +
            "No inventes importes, tasas ni porcentajes. No calcules.",
        },
        { role: "user", content: draft },
      ],
      { responseJson: false, temperature: 0.2 },
    );
    const polished = raw.trim();
    if (!polished || !textUsesOnlyAllowedFigures(polished, allowed)) {
      return draft;
    }
    return polished;
  } catch {
    return draft;
  }
}
