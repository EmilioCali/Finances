import type { AgentSettings } from "../config/env.js";
import {
  InMemoryTraceStore,
  type NewAgentTrace,
  type TracePatch,
  type TraceStore,
  type AgentTrace,
} from "./traces.js";

type SupabaseRestConfig = {
  url: string;
  serviceRoleKey: string;
  table?: string;
};

/**
 * Thin REST adapter for Supabase PostgreSQL `agent_traces`.
 * Does not require live credentials for unit tests — only constructed when configured.
 */
export class SupabaseTraceStore implements TraceStore {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly table: string;

  constructor(config: SupabaseRestConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
    this.serviceRoleKey = config.serviceRoleKey;
    this.table = config.table ?? "agent_traces";
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    };
  }

  private rowToTrace(row: Record<string, unknown>): AgentTrace {
    return {
      id: String(row.id),
      createdAt: String(row.created_at),
      requestMessage: String(row.request_message),
      interpretedParams: (row.interpreted_params as Record<string, unknown> | null) ?? null,
      approvedParams: (row.approved_params as Record<string, unknown> | null) ?? null,
      scenarioId: (row.scenario_id as string | null) ?? null,
      resultRef: (row.result_ref as string | null) ?? null,
      status: row.status as AgentTrace["status"],
      error: (row.error as Record<string, unknown> | null) ?? null,
      explanation: (row.explanation as string | null) ?? null,
      idempotencyKey: (row.idempotency_key as string | null) ?? null,
    };
  }

  async insert(input: NewAgentTrace): Promise<AgentTrace> {
    const response = await fetch(`${this.baseUrl}/rest/v1/${this.table}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        request_message: input.requestMessage,
        interpreted_params: input.interpretedParams ?? null,
        approved_params: input.approvedParams ?? null,
        scenario_id: input.scenarioId ?? null,
        result_ref: input.resultRef ?? null,
        status: input.status,
        error: input.error ?? null,
        explanation: input.explanation ?? null,
        idempotency_key: input.idempotencyKey ?? null,
      }),
    });
    if (!response.ok) {
      throw new Error(`Supabase insert failed (${response.status})`);
    }
    const rows = (await response.json()) as Record<string, unknown>[];
    const row = rows[0];
    if (!row) throw new Error("Supabase insert returned no row");
    return this.rowToTrace(row);
  }

  async update(id: string, patch: TracePatch): Promise<AgentTrace> {
    const body: Record<string, unknown> = {};
    if (patch.interpretedParams !== undefined) body.interpreted_params = patch.interpretedParams;
    if (patch.approvedParams !== undefined) body.approved_params = patch.approvedParams;
    if (patch.scenarioId !== undefined) body.scenario_id = patch.scenarioId;
    if (patch.resultRef !== undefined) body.result_ref = patch.resultRef;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.error !== undefined) body.error = patch.error;
    if (patch.explanation !== undefined) body.explanation = patch.explanation;
    if (patch.idempotencyKey !== undefined) body.idempotency_key = patch.idempotencyKey;

    const response = await fetch(
      `${this.baseUrl}/rest/v1/${this.table}?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: this.headers(),
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      throw new Error(`Supabase update failed (${response.status})`);
    }
    const rows = (await response.json()) as Record<string, unknown>[];
    const row = rows[0];
    if (!row) throw new Error(`Supabase update missing row for ${id}`);
    return this.rowToTrace(row);
  }

  async get(id: string): Promise<AgentTrace | null> {
    const response = await fetch(
      `${this.baseUrl}/rest/v1/${this.table}?id=eq.${encodeURIComponent(id)}&select=*`,
      { headers: this.headers() },
    );
    if (!response.ok) {
      throw new Error(`Supabase get failed (${response.status})`);
    }
    const rows = (await response.json()) as Record<string, unknown>[];
    const row = rows[0];
    return row ? this.rowToTrace(row) : null;
  }

  async findByIdempotencyKey(key: string): Promise<AgentTrace | null> {
    const response = await fetch(
      `${this.baseUrl}/rest/v1/${this.table}?idempotency_key=eq.${encodeURIComponent(key)}&status=eq.EXPLAINED&select=*&limit=1`,
      { headers: this.headers() },
    );
    if (!response.ok) {
      throw new Error(`Supabase findByIdempotencyKey failed (${response.status})`);
    }
    const rows = (await response.json()) as Record<string, unknown>[];
    const row = rows[0];
    return row ? this.rowToTrace(row) : null;
  }
}

export function createTraceStore(settings: AgentSettings): TraceStore {
  if (settings.supabaseUrl && settings.supabaseServiceRoleKey) {
    return new SupabaseTraceStore({
      url: settings.supabaseUrl,
      serviceRoleKey: settings.supabaseServiceRoleKey,
    });
  }
  return new InMemoryTraceStore();
}
