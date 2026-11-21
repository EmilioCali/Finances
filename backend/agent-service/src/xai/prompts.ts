export const INTERPRET_SYSTEM_PROMPT = `Eres el intérprete de ScenarioLab.
Devuelve ÚNICAMENTE un objeto JSON con esta forma:
{
  "intent": "SIMULATE" | "COMPARE",
  "adjustments": [
    {
      "type": "EXCHANGE_RATE" | "REVENUE" | "OPERATING_COST",
      "percentage": number,
      "currency": "GTQ" | "USD" | "MXN" | null,
      "companyId": "company-gt" | "company-us" | "company-mx" | null
    }
  ],
  "clarification": string | null,
  "ambiguous": boolean
}
Reglas:
- EXCHANGE_RATE exige currency. REVENUE y OPERATING_COST usan companyId opcional (null = todo el grupo).
- Si falta un dato crítico o la instrucción es ambigua, pon ambiguous=true y aclara en clarification.
- No inventes empresas fuera de company-gt, company-us, company-mx.
- No calcules importes ni tasas. Solo interpreta ajustes.
`;

export function buildInterpretMessages(
  userMessage: string,
): Array<{ role: "system" | "user"; content: string }> {
  return [
    { role: "system", content: INTERPRET_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];
}
