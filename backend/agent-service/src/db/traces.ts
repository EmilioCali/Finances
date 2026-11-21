/**
 * Trace persistence for D-011.
 * Tests use InMemoryTraceStore; Supabase wiring stays optional until credentials exist.
 */

export type AgentTraceStatus =
  | "INTERPRETED"
  | "NEEDS_CONFIRMATION"
  | "EXPLAINED"
  | "ERROR";

export type AgentTrace = {
  id: string;
  createdAt: string;
  requestMessage: string;
  interpretedParams: Record<string, unknown> | null;
  approvedParams: Record<string, unknown> | null;
  scenarioId: string | null;
  resultRef: string | null;
  status: AgentTraceStatus;
  error: Record<string, unknown> | null;
  explanation: string | null;
  idempotencyKey: string | null;
};

export type NewAgentTrace = {
  requestMessage: string;
  interpretedParams?: Record<string, unknown> | null;
  approvedParams?: Record<string, unknown> | null;
  scenarioId?: string | null;
  resultRef?: string | null;
  status: AgentTraceStatus;
  error?: Record<string, unknown> | null;
  explanation?: string | null;
  idempotencyKey?: string | null;
};

export type TracePatch = Partial<
  Omit<AgentTrace, "id" | "createdAt" | "requestMessage">
>;

export interface TraceStore {
  insert(trace: NewAgentTrace): Promise<AgentTrace>;
  update(id: string, patch: TracePatch): Promise<AgentTrace>;
  get(id: string): Promise<AgentTrace | null>;
  findByIdempotencyKey(key: string): Promise<AgentTrace | null>;
}

let traceSeq = 0;

export function resetTraceSeqForTests(): void {
  traceSeq = 0;
}

function nextTraceId(): string {
  traceSeq += 1;
  return `trc_${String(traceSeq).padStart(2, "0")}`;
}

export class InMemoryTraceStore implements TraceStore {
  private readonly traces = new Map<string, AgentTrace>();

  async insert(input: NewAgentTrace): Promise<AgentTrace> {
    const trace: AgentTrace = {
      id: nextTraceId(),
      createdAt: new Date().toISOString(),
      requestMessage: input.requestMessage,
      interpretedParams: input.interpretedParams ?? null,
      approvedParams: input.approvedParams ?? null,
      scenarioId: input.scenarioId ?? null,
      resultRef: input.resultRef ?? null,
      status: input.status,
      error: input.error ?? null,
      explanation: input.explanation ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
    };
    this.traces.set(trace.id, trace);
    return trace;
  }

  async update(id: string, patch: TracePatch): Promise<AgentTrace> {
    const existing = this.traces.get(id);
    if (!existing) {
      throw new Error(`Trace not found: ${id}`);
    }
    const updated: AgentTrace = { ...existing, ...patch };
    this.traces.set(id, updated);
    return updated;
  }

  async get(id: string): Promise<AgentTrace | null> {
    return this.traces.get(id) ?? null;
  }

  async findByIdempotencyKey(key: string): Promise<AgentTrace | null> {
    for (const trace of this.traces.values()) {
      if (trace.idempotencyKey === key && trace.status === "EXPLAINED") {
        return trace;
      }
    }
    return null;
  }
}
