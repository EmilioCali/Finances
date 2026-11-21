import { describe, expect, it } from "vitest";

import { AgentError } from "../src/domain/errors.js";
import { interpretMessage } from "../src/domain/interpreter.js";
import { XAIClient } from "../src/xai/client.js";
import { makeClient, r1IntentJson, testSettings } from "./helpers.js";

describe("xai client (parity with Python test_client)", () => {
  it("test_chat_completion_valid_json", async () => {
    const client = makeClient({ content: r1IntentJson() });
    const text = await client.chatCompletion(
      [{ role: "user", content: "hola" }],
      { responseJson: true },
    );
    expect(JSON.parse(text).intent).toBe("SIMULATE");
  });

  it("test_complete_json_invalid_content", async () => {
    const client = makeClient({ content: "not-json{" });
    await expect(
      client.completeJson([{ role: "user", content: "x" }]),
    ).rejects.toMatchObject({ code: "AGENT_INVALID_RESPONSE" } satisfies Partial<AgentError>);
  });

  it("test_timeout_maps_to_agent_timeout", async () => {
    const client = makeClient({ raiseTimeout: true });
    try {
      await client.chatCompletion([{ role: "user", content: "x" }]);
      expect.fail("expected timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).code).toBe("AGENT_TIMEOUT");
      expect((error as AgentError).httpStatus).toBe(504);
    }
  });

  it("test_retries_once_on_503_then_succeeds", async () => {
    const client = makeClient({
      content: r1IntentJson(),
      failThenSucceed: true,
    });
    const data = await client.completeJson([{ role: "user", content: "x" }]);
    expect(data.intent).toBe("SIMULATE");
  });

  it("test_missing_api_key", async () => {
    const settings = testSettings({ xaiApiKey: undefined });
    const client = new XAIClient(settings);
    try {
      await client.chatCompletion([{ role: "user", content: "x" }]);
      expect.fail("expected not configured");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).code).toBe("AGENT_NOT_CONFIGURED");
    }
  });

  it("test_interpret_message_ready", async () => {
    const client = makeClient({ content: r1IntentJson() });
    const result = await interpretMessage(
      client,
      "Simula una depreciación del quetzal del 10 % y un aumento de costos del 8 % en Guatemala",
    );
    expect(result.status).toBe("READY");
    expect(result.proposal.adjustments[0]?.type).toBe("EXCHANGE_RATE");
    expect(result.proposal.adjustments[1]?.companyId).toBe("company-gt");
  });

  it("test_malformed_completion_envelope", async () => {
    const client = makeClient({ rawBody: { choices: [] } });
    try {
      await client.chatCompletion([{ role: "user", content: "x" }]);
      expect.fail("expected invalid response");
    } catch (error) {
      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).code).toBe("AGENT_INVALID_RESPONSE");
    }
  });
});
