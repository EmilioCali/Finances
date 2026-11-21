import { settingsFromValues, type AgentSettings } from "../src/config/env.js";
import {
  createMockTransport,
  XAIClient,
  type CompletionTransport,
} from "../src/xai/client.js";

export const R1_INTENT = {
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
  clarification: null,
  ambiguous: false,
} as const;

export function r1IntentJson(): string {
  return JSON.stringify(R1_INTENT);
}

export function testSettings(
  overrides?: Partial<{
    xaiApiKey: string | undefined;
    xaiModel: string;
  }>,
): AgentSettings {
  return settingsFromValues({
    xaiApiKey: "test-key-not-real",
    xaiModel: "test-model",
    xaiBaseUrl: "https://api.x.ai/v1",
    timeoutSeconds: 20,
    maxRetries: 1,
    maxTokens: 256,
    ...overrides,
  });
}

export function makeClient(
  transportOptions: Parameters<typeof createMockTransport>[0],
  settings: AgentSettings = testSettings(),
): XAIClient {
  const transport: CompletionTransport = createMockTransport(transportOptions);
  return new XAIClient(settings, transport);
}
