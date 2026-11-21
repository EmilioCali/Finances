import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import type { AgentSettings } from "./config/env.js";
import { settingsFromValues } from "./config/env.js";
import { InMemoryTraceStore, type TraceStore } from "./db/traces.js";
import { AgentError, notImplemented } from "./domain/errors.js";
import { interpretMessage } from "./domain/interpreter.js";
import { FakeFinanceTools } from "./engine/fake.js";
import type { FinanceTools } from "./engine/types.js";
import {
  chatRequestSchema,
  explainRequestSchema,
  interpretRequestSchema,
} from "./schemas/agent.js";
import { XAIClient, type CompletionTransport } from "./xai/client.js";

export type AppDeps = {
  settings: AgentSettings;
  xaiTransport?: CompletionTransport;
  financeTools?: FinanceTools;
  traceStore?: TraceStore;
  logger?: boolean;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });
  const settings = deps.settings;
  const xaiClient = new XAIClient(settings, deps.xaiTransport);
  const financeTools = deps.financeTools ?? new FakeFinanceTools();
  const traceStore = deps.traceStore ?? new InMemoryTraceStore();

  // Reserved for later stages (/chat). Keep reference so wiring stays explicit.
  void financeTools;
  void traceStore;

  app.setErrorHandler((error: Error, _request, reply) => {
    if (error instanceof AgentError) {
      return reply.status(error.httpStatus).send(error.toErrorBody());
    }
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: error.message || "Error interno del agente.",
        details: [],
      },
    });
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "scenariolab-agent",
  }));

  app.get("/api/health", async () => ({
    status: "ok",
    service: "scenariolab-agent",
  }));

  app.post(
    "/api/agent/interpret",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = interpretRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AgentError("VALIDATION_ERROR", "Cuerpo de interpret inválido.", {
          httpStatus: 400,
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        });
      }
      const result = await interpretMessage(xaiClient, parsed.data.message);
      return reply.send(result);
    },
  );

  app.post("/api/agent/chat", async (request: FastifyRequest) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AgentError("VALIDATION_ERROR", "Cuerpo de chat inválido.", {
        httpStatus: 400,
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    void parsed.data;
    throw notImplemented(
      "POST /api/agent/chat se implementa en la siguiente etapa (orquestación + motor).",
    );
  });

  app.post("/api/agent/explain", async (request: FastifyRequest) => {
    const parsed = explainRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AgentError("VALIDATION_ERROR", "Cuerpo de explain inválido.", {
        httpStatus: 400,
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    void parsed.data;
    throw notImplemented(
      "POST /api/agent/explain se implementa en la siguiente etapa.",
    );
  });

  return app;
}

export function testSettings(
  overrides?: Partial<Parameters<typeof settingsFromValues>[0]>,
): AgentSettings {
  return settingsFromValues({
    xaiApiKey: "test-key-not-real",
    xaiModel: "test-model",
    xaiBaseUrl: "https://api.x.ai/v1",
    ...overrides,
  });
}
