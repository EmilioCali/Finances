import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import type { AgentSettings } from "./config/env.js";
import { isApiKeyConfigured, settingsFromValues } from "./config/env.js";
import { createTraceStore } from "./db/supabase.js";
import type { TraceStore } from "./db/traces.js";
import { AgentError } from "./domain/errors.js";
import { IdempotencyCache } from "./domain/idempotency.js";
import { interpretMessage } from "./domain/interpreter.js";
import { AgentOrchestrator } from "./domain/orchestrator.js";
import { createFinanceTools } from "./engine/factory.js";
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
  idempotency?: IdempotencyCache;
  polishWithGrok?: boolean;
  logger?: boolean;
};

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });
  const settings = deps.settings;
  const xaiClient = new XAIClient(settings, deps.xaiTransport);
  const financeTools = deps.financeTools ?? createFinanceTools(settings);
  const traceSetup = deps.traceStore
    ? { store: deps.traceStore, backend: "memory" as const }
    : createTraceStore(settings);
  const polishWithGrok =
    deps.polishWithGrok ??
    (settings.polishWithGrok && isApiKeyConfigured(settings));

  if (settings.engineMode === "http") {
    console.info(`[ENGINE_MODE] http → ${settings.engineBaseUrl}`);
  } else {
    console.info("[ENGINE_MODE] fake → R1 deterministic FakeFinanceTools");
  }
  console.info(`[TRACE_BACKEND] ${traceSetup.backend}`);

  const orchestrator = new AgentOrchestrator({
    xai: xaiClient,
    finance: financeTools,
    traces: traceSetup.store,
    idempotency: deps.idempotency ?? new IdempotencyCache(),
    polishWithGrok,
  });

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
    engineMode: settings.engineMode,
    traceBackend: traceSetup.backend,
  }));

  app.get("/api/health", async () => ({
    status: "ok",
    service: "scenariolab-agent",
    engineMode: settings.engineMode,
    traceBackend: traceSetup.backend,
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

  app.post("/api/agent/chat", async (request: FastifyRequest, reply: FastifyReply) => {
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
    const result = await orchestrator.chat(parsed.data);
    return reply.send(result);
  });

  app.post(
    "/api/agent/explain",
    async (request: FastifyRequest, reply: FastifyReply) => {
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
      const result = await orchestrator.explain(parsed.data.scenarioId);
      return reply.send(result);
    },
  );

  return app;
}

export function testSettings(
  overrides?: Partial<Parameters<typeof settingsFromValues>[0]>,
): AgentSettings {
  return settingsFromValues({
    xaiApiKey: "test-key-not-real",
    xaiModel: "test-model",
    xaiBaseUrl: "https://api.x.ai/v1",
    polishWithGrok: false,
    traceBackend: "memory",
    engineMode: "fake",
    ...overrides,
  });
}
