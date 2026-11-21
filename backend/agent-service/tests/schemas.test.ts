import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { AgentError } from "../src/domain/errors.js";
import { validateProposalFromPayload } from "../src/domain/interpreter.js";
import { parseAgentAdjustment } from "../src/schemas/adjustments.js";

describe("schemas (parity with Python test_schemas)", () => {
  it("test_valid_r1_adjustments", () => {
    const fx = parseAgentAdjustment({
      type: "EXCHANGE_RATE",
      currency: "GTQ",
      percentage: 10,
    });
    const cost = parseAgentAdjustment({
      type: "OPERATING_COST",
      companyId: "company-gt",
      percentage: 8,
    });
    expect(fx.currency).toBe("GTQ");
    expect(cost.companyId).toBe("company-gt");
  });

  it("test_exchange_rate_requires_currency", () => {
    expect(() =>
      parseAgentAdjustment({ type: "EXCHANGE_RATE", percentage: 10 }),
    ).toThrow(ZodError);
  });

  it("test_percentage_out_of_range_revenue", () => {
    expect(() =>
      parseAgentAdjustment({ type: "REVENUE", percentage: -91 }),
    ).toThrow(ZodError);
  });

  it("test_percentage_out_of_range_fx", () => {
    expect(() =>
      parseAgentAdjustment({
        type: "EXCHANGE_RATE",
        currency: "GTQ",
        percentage: -99,
      }),
    ).toThrow(ZodError);
  });

  it("test_unknown_company_rejected", () => {
    expect(() =>
      parseAgentAdjustment({
        type: "OPERATING_COST",
        companyId: "company-zz",
        percentage: 8,
      }),
    ).toThrow(ZodError);
  });

  it("test_validate_ready_from_grok_json", () => {
    const result = validateProposalFromPayload({
      intent: "SIMULATE",
      adjustments: [
        {
          type: "EXCHANGE_RATE",
          currency: "GTQ",
          percentage: 10,
          companyId: null,
        },
        {
          type: "OPERATING_COST",
          currency: null,
          percentage: 8,
          companyId: "company-gt",
        },
      ],
      ambiguous: false,
    });
    expect(result.status).toBe("READY");
    expect(result.clarification).toBeNull();
    expect(result.proposal.adjustments).toHaveLength(2);
  });

  it("test_validate_needs_confirmation_when_ambiguous", () => {
    const result = validateProposalFromPayload({
      intent: "SIMULATE",
      adjustments: [
        { type: "OPERATING_COST", percentage: 8, companyId: null },
      ],
      ambiguous: true,
      clarification: "¿Solo Empresa A o todo el grupo?",
    });
    expect(result.status).toBe("NEEDS_CONFIRMATION");
    expect(result.clarification ?? "").toContain("Empresa A");
  });

  it("test_overlapping_adjustments_raise_validation", () => {
    expect(() =>
      validateProposalFromPayload({
        intent: "SIMULATE",
        adjustments: [
          {
            type: "OPERATING_COST",
            percentage: 8,
            companyId: "company-gt",
          },
          {
            type: "OPERATING_COST",
            percentage: 5,
            companyId: null,
          },
        ],
        ambiguous: false,
      }),
    ).toThrow(AgentError);

    try {
      validateProposalFromPayload({
        intent: "SIMULATE",
        adjustments: [
          {
            type: "OPERATING_COST",
            percentage: 8,
            companyId: "company-gt",
          },
          {
            type: "OPERATING_COST",
            percentage: 5,
            companyId: null,
          },
        ],
        ambiguous: false,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).code).toBe("VALIDATION_ERROR");
    }
  });

  it("test_invalid_grok_json_shape", () => {
    try {
      validateProposalFromPayload({ intent: "UNKNOWN" });
      expect.fail("expected AgentError");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).code).toBe("AGENT_INVALID_RESPONSE");
    }
  });
});
