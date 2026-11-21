import type { ScenarioResults } from "./types.js";

/** R1 result snapshot from PLAN D-009 — temporary stand-in until I3. */
export const R1_SCENARIO_RESULTS: ScenarioResults = {
  scenarioId: "scn_r1_fake",
  name: "Crisis Guatemala",
  reportingCurrency: "USD",
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
  fxRates: {
    base: [
      { currency: "GTQ", unitsPerUsd: "7.7500" },
      { currency: "USD", unitsPerUsd: "1.0000" },
      { currency: "MXN", unitsPerUsd: "18.0000" },
    ],
    simulated: [
      { currency: "GTQ", unitsPerUsd: "8.5250" },
      { currency: "USD", unitsPerUsd: "1.0000" },
      { currency: "MXN", unitsPerUsd: "18.0000" },
    ],
  },
  base: {
    revenue: "28000.00",
    expense: "13000.00",
    operatingResult: "15000.00",
  },
  simulated: {
    revenue: "27090.91",
    expense: "12909.09",
    operatingResult: "14181.82",
  },
  variance: {
    revenue: { absolute: "-909.09", percentage: "-3.25" },
    expense: { absolute: "-90.91", percentage: "-0.70" },
    operatingResult: { absolute: "-818.18", percentage: "-5.45" },
  },
  byCompany: [
    {
      companyId: "company-gt",
      base: {
        revenue: "10000.00",
        expense: "5000.00",
        operatingResult: "5000.00",
      },
      simulated: {
        revenue: "9090.91",
        expense: "4909.09",
        operatingResult: "4181.82",
      },
      variance: {
        revenue: { absolute: "-909.09", percentage: "-9.09" },
        expense: { absolute: "-90.91", percentage: "-1.82" },
        operatingResult: { absolute: "-818.18", percentage: "-16.36" },
      },
    },
  ],
  byCategory: [
    {
      category: "SALES",
      recordType: "REVENUE",
      base: "28000.00",
      simulated: "27090.91",
      variance: { absolute: "-909.09", percentage: "-3.25" },
    },
  ],
  series: [
    {
      period: "2026-01",
      base: {
        revenue: "28000.00",
        expense: "13000.00",
        operatingResult: "15000.00",
      },
      simulated: {
        revenue: "27090.91",
        expense: "12909.09",
        operatingResult: "14181.82",
      },
    },
  ],
};
