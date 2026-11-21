import { z } from "zod";

const optionalNonEmpty = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

const envSchema = z.object({
  XAI_API_KEY: optionalNonEmpty,
  XAI_MODEL: z
    .string({
      required_error: "XAI_MODEL must be a non-empty model id from the environment.",
    })
    .trim()
    .min(1, "XAI_MODEL must be a non-empty model id from the environment."),
  XAI_BASE_URL: z
    .string()
    .default("https://api.x.ai/v1")
    .transform((value) => value.replace(/\/$/, "")),
  AGENT_PORT: z.coerce.number().int().positive().default(8001),
  ENGINE_BASE_URL: z
    .string()
    .default("http://localhost:8000")
    .transform((value) => value.replace(/\/$/, "")),
  ENGINE_MODE: z.enum(["fake", "http"]).default("fake"),
  TRACE_BACKEND: z.enum(["auto", "memory", "supabase"]).default("auto"),
  POLISH_WITH_GROK: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  SUPABASE_URL: optionalNonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: optionalNonEmpty,
  XAI_TIMEOUT_SECONDS: z.coerce.number().positive().default(20),
  XAI_MAX_RETRIES: z.coerce.number().int().min(0).default(1),
  XAI_MAX_TOKENS: z.coerce.number().int().positive().default(1024),
});

export type AgentSettings = {
  xaiApiKey: string | undefined;
  xaiModel: string;
  xaiBaseUrl: string;
  agentPort: number;
  engineBaseUrl: string;
  engineMode: "fake" | "http";
  traceBackend: "auto" | "memory" | "supabase";
  polishWithGrok: boolean;
  supabaseUrl: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  timeoutSeconds: number;
  maxRetries: number;
  maxTokens: number;
};

export function settingsFromValues(input: {
  xaiApiKey?: string | undefined;
  xaiModel: string;
  xaiBaseUrl?: string;
  agentPort?: number;
  engineBaseUrl?: string;
  engineMode?: "fake" | "http";
  traceBackend?: "auto" | "memory" | "supabase";
  polishWithGrok?: boolean;
  supabaseUrl?: string | undefined;
  supabaseServiceRoleKey?: string | undefined;
  timeoutSeconds?: number;
  maxRetries?: number;
  maxTokens?: number;
}): AgentSettings {
  const model = input.xaiModel.trim();
  if (!model) {
    throw new Error("XAI_MODEL must be a non-empty model id from the environment.");
  }
  return {
    xaiApiKey: input.xaiApiKey?.trim() || undefined,
    xaiModel: model,
    xaiBaseUrl: (input.xaiBaseUrl ?? "https://api.x.ai/v1").replace(/\/$/, ""),
    agentPort: input.agentPort ?? 8001,
    engineBaseUrl: (input.engineBaseUrl ?? "http://localhost:8000").replace(/\/$/, ""),
    engineMode: input.engineMode ?? "fake",
    traceBackend: input.traceBackend ?? "auto",
    polishWithGrok: input.polishWithGrok ?? true,
    supabaseUrl: input.supabaseUrl,
    supabaseServiceRoleKey: input.supabaseServiceRoleKey,
    timeoutSeconds: input.timeoutSeconds ?? 20,
    maxRetries: input.maxRetries ?? 1,
    maxTokens: input.maxTokens ?? 1024,
  };
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AgentSettings {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid agent environment: ${message}`);
  }
  const data = parsed.data;
  return settingsFromValues({
    xaiApiKey: data.XAI_API_KEY,
    xaiModel: data.XAI_MODEL,
    xaiBaseUrl: data.XAI_BASE_URL,
    agentPort: data.AGENT_PORT,
    engineBaseUrl: data.ENGINE_BASE_URL,
    engineMode: data.ENGINE_MODE,
    traceBackend: data.TRACE_BACKEND,
    polishWithGrok: data.POLISH_WITH_GROK,
    supabaseUrl: data.SUPABASE_URL,
    supabaseServiceRoleKey: data.SUPABASE_SERVICE_ROLE_KEY,
    timeoutSeconds: data.XAI_TIMEOUT_SECONDS,
    maxRetries: data.XAI_MAX_RETRIES,
    maxTokens: data.XAI_MAX_TOKENS,
  });
}

export function isApiKeyConfigured(settings: AgentSettings): boolean {
  return Boolean(settings.xaiApiKey && settings.xaiApiKey.trim());
}
