import type {
  AgentTrace,
  NewAgentTrace,
  TracePatch,
  TraceStore,
} from "./traces.js";
import { InMemoryTraceStore } from "./traces.js";

/**
 * Wraps a primary TraceStore (usually Supabase).
 * On persistence failure: logs clearly and continues with an ephemeral in-memory trace
 * so the request can still return a traceId — without claiming durable persistence.
 */
export class ResilientTraceStore implements TraceStore {
  readonly primaryFailed = { insert: 0, update: 0, get: 0, find: 0 };
  private readonly fallback = new InMemoryTraceStore();
  private readonly ephemeralIds = new Set<string>();

  constructor(
    private readonly primary: TraceStore,
    private readonly onFailure: (op: string, error: unknown) => void = defaultLog,
  ) {}

  wasEphemeral(id: string): boolean {
    return this.ephemeralIds.has(id);
  }

  async insert(trace: NewAgentTrace): Promise<AgentTrace> {
    try {
      return await this.primary.insert(trace);
    } catch (error) {
      this.primaryFailed.insert += 1;
      this.onFailure("insert", error);
      const ephemeral = await this.fallback.insert({
        ...trace,
        explanation:
          trace.explanation ??
          null,
      });
      this.ephemeralIds.add(ephemeral.id);
      return ephemeral;
    }
  }

  async update(id: string, patch: TracePatch): Promise<AgentTrace> {
    if (this.ephemeralIds.has(id)) {
      return this.fallback.update(id, patch);
    }
    try {
      return await this.primary.update(id, patch);
    } catch (error) {
      this.primaryFailed.update += 1;
      this.onFailure("update", error);
      // Best-effort local mirror for the remainder of the request.
      try {
        return await this.fallback.update(id, patch);
      } catch {
        const created = await this.fallback.insert({
          requestMessage: `orphan-update:${id}`,
          status: patch.status ?? "ERROR",
          interpretedParams: patch.interpretedParams ?? null,
          approvedParams: patch.approvedParams ?? null,
          scenarioId: patch.scenarioId ?? null,
          resultRef: patch.resultRef ?? null,
          error: patch.error ?? {
            code: "TRACE_PERSISTENCE_FAILED",
            message: "Falló la persistencia de la traza en Supabase.",
          },
          explanation: patch.explanation ?? null,
          idempotencyKey: patch.idempotencyKey ?? null,
        });
        this.ephemeralIds.add(created.id);
        return created;
      }
    }
  }

  async get(id: string): Promise<AgentTrace | null> {
    if (this.ephemeralIds.has(id)) {
      return this.fallback.get(id);
    }
    try {
      return await this.primary.get(id);
    } catch (error) {
      this.primaryFailed.get += 1;
      this.onFailure("get", error);
      return this.fallback.get(id);
    }
  }

  async findByIdempotencyKey(key: string): Promise<AgentTrace | null> {
    try {
      const primary = await this.primary.findByIdempotencyKey(key);
      if (primary) return primary;
    } catch (error) {
      this.primaryFailed.find += 1;
      this.onFailure("findByIdempotencyKey", error);
    }
    return this.fallback.findByIdempotencyKey(key);
  }
}

function defaultLog(op: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `[TRACE_PERSISTENCE_FAILED] op=${op} durable=false message=${message}`,
  );
}
