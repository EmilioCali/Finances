import { afterEach, describe, expect, it } from "vitest";

import { buildApp, testSettings } from "../src/app.js";
import { createMockTransport } from "../src/xai/client.js";
import { r1IntentJson } from "./helpers.js";

describe("routes (stage-1 acceptance)", () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("health check responds ok", async () => {
    const app = await buildApp({
      settings: testSettings(),
      xaiTransport: createMockTransport({ content: "{}" }),
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "scenariolab-agent",
      engineMode: "fake",
      traceBackend: "memory",
    });
  });

  it("POST /api/agent/interpret works with mocked Grok", async () => {
    const app = await buildApp({
      settings: testSettings(),
      xaiTransport: createMockTransport({ content: r1IntentJson() }),
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/interpret",
      payload: {
        message:
          "Simula una depreciación del quetzal del 10 % y un aumento de costos del 8 % en Guatemala",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      status: string;
      proposal: { adjustments: unknown[] };
      clarification: string | null;
    };
    expect(body.status).toBe("READY");
    expect(body.proposal.adjustments).toHaveLength(2);
    expect(body.clarification).toBeNull();
  });

  it("POST /api/agent/chat is wired for orchestration", async () => {
    const app = await buildApp({
      settings: testSettings(),
      xaiTransport: createMockTransport({ content: r1IntentJson() }),
    });
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/agent/chat",
      payload: {
        message:
          "Simula una depreciación del quetzal del 10 % y un aumento de costos del 8 % en Guatemala",
        approvedAdjustments: null,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("EXPLAINED");
  });
});
