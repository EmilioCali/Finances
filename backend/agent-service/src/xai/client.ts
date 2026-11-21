import OpenAI, { APIConnectionTimeoutError, APIError } from "openai";

import {
  isApiKeyConfigured,
  type AgentSettings,
} from "../config/env.js";
import {
  agentInvalidResponse,
  agentNotConfigured,
  agentTimeout,
  agentUnavailable,
} from "../domain/errors.js";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type CompletionTransport = {
  create(params: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    max_tokens: number;
    response_format?: { type: "json_object" };
  }): Promise<{
    choices: Array<{ message?: { content?: string | null } | null } | undefined>;
  }>;
};

export class XAIClient {
  private readonly settings: AgentSettings;
  private readonly transport: CompletionTransport;

  constructor(settings: AgentSettings, transport?: CompletionTransport) {
    this.settings = settings;
    this.transport =
      transport ??
      createOpenAITransport(settings);
  }

  private ensureConfigured(): void {
    if (!isApiKeyConfigured(this.settings) || !this.settings.xaiModel.trim()) {
      throw agentNotConfigured();
    }
  }

  async chatCompletion(
    messages: ChatMessage[],
    options?: { temperature?: number; responseJson?: boolean },
  ): Promise<string> {
    this.ensureConfigured();
    const temperature = options?.temperature ?? 0;
    const responseJson = options?.responseJson ?? true;
    const attempts = 1 + Math.max(0, this.settings.maxRetries);
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const completion = await this.transport.create({
          model: this.settings.xaiModel,
          messages,
          temperature,
          max_tokens: this.settings.maxTokens,
          ...(responseJson ? { response_format: { type: "json_object" as const } } : {}),
        });
        return extractContent(completion);
      } catch (error) {
        if (error instanceof APIConnectionTimeoutError) {
          lastError = error;
          if (attempt + 1 >= attempts) {
            throw agentTimeout();
          }
          continue;
        }
        if (error instanceof APIError && error.status !== undefined && error.status >= 500) {
          lastError = agentUnavailable(`xAI respondió ${error.status}.`);
          if (attempt + 1 >= attempts) {
            throw lastError;
          }
          continue;
        }
        if (error instanceof APIError && error.status !== undefined && error.status >= 400) {
          throw agentUnavailable(
            `xAI rechazó la solicitud (${error.status}): ${error.message.slice(0, 300)}`,
          );
        }
        // Transport mocks may throw AgentError or plain timeout markers.
        if (
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          (error as { name: string }).name === "TimeoutError"
        ) {
          lastError = error;
          if (attempt + 1 >= attempts) {
            throw agentTimeout();
          }
          continue;
        }
        if (
          typeof error === "object" &&
          error !== null &&
          "retryableStatus" in error &&
          typeof (error as { retryableStatus: unknown }).retryableStatus === "number"
        ) {
          const status = (error as { retryableStatus: number }).retryableStatus;
          lastError = agentUnavailable(`xAI respondió ${status}.`);
          if (attempt + 1 >= attempts) {
            throw lastError;
          }
          continue;
        }
        throw error;
      }
    }

    if (
      lastError instanceof APIConnectionTimeoutError ||
      (typeof lastError === "object" &&
        lastError !== null &&
        "name" in lastError &&
        (lastError as { name: string }).name === "TimeoutError")
    ) {
      throw agentTimeout();
    }
    throw agentUnavailable(
      lastError instanceof Error ? lastError.message : "xAI no disponible.",
    );
  }

  async completeJson(messages: ChatMessage[]): Promise<Record<string, unknown>> {
    const raw = await this.chatCompletion(messages, { responseJson: true });
    let data: unknown;
    try {
      data = JSON.parse(raw) as unknown;
    } catch {
      throw agentInvalidResponse("Grok no devolvió JSON parseable.", [
        { field: "content", message: raw.slice(0, 200) },
      ]);
    }
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw agentInvalidResponse("Grok devolvió JSON que no es un objeto.");
    }
    return data as Record<string, unknown>;
  }
}

function createOpenAITransport(settings: AgentSettings): CompletionTransport {
  const client = new OpenAI({
    apiKey: settings.xaiApiKey ?? "missing-key",
    baseURL: settings.xaiBaseUrl,
    timeout: settings.timeoutSeconds * 1000,
    maxRetries: 0,
  });
  return {
    async create(params) {
      return client.chat.completions.create(params);
    },
  };
}

function extractContent(completion: {
  choices: Array<{ message?: { content?: string | null } | null } | undefined>;
}): string {
  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    if (completion.choices.length === 0 || completion.choices[0] === undefined) {
      throw agentInvalidResponse(
        "La respuesta de xAI no tiene el formato de chat completion esperado.",
        [{ field: "choices", message: "Estructura incompleta." }],
      );
    }
    throw agentInvalidResponse("xAI devolvió contenido vacío.");
  }
  return content;
}

/** Test helper: mock transport without touching the network. */
export function createMockTransport(options: {
  content?: string;
  statusCode?: number;
  raiseTimeout?: boolean;
  failThenSucceed?: boolean;
  rawBody?: { choices: Array<{ message?: { content?: string | null } } | undefined> };
}): CompletionTransport {
  let calls = 0;
  return {
    async create() {
      calls += 1;
      if (options.raiseTimeout) {
        const err = new Error("simulated timeout");
        err.name = "TimeoutError";
        throw err;
      }
      if (options.failThenSucceed && calls === 1) {
        const err = new Error("temporary") as Error & { retryableStatus: number };
        err.retryableStatus = 503;
        throw err;
      }
      const status = options.statusCode ?? 200;
      if (status >= 400 && !options.failThenSucceed) {
        throw new APIError(
          status,
          { error: { message: "upstream error" } },
          "upstream error",
          undefined,
        );
      }
      if (options.rawBody) {
        return options.rawBody;
      }
      return {
        choices: [
          {
            message: {
              content: options.content ?? "{}",
            },
          },
        ],
      };
    },
  };
}
