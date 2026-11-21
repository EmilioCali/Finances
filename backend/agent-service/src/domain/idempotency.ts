import { createHash } from "node:crypto";

import type { AgentAdjustment } from "../schemas/adjustments.js";
import type { ChatResponse } from "../schemas/agent.js";

const DEFAULT_TTL_MS = 2 * 60 * 1000;

export type IdempotencyEntry = {
  key: string;
  response: ChatResponse;
  scenarioId: string | null;
  expiresAt: number;
};

function canonicalizeAdjustments(adjustments: AgentAdjustment[]): unknown[] {
  return [...adjustments]
    .map((adj) => ({
      type: adj.type,
      percentage: adj.percentage,
      currency: adj.currency,
      companyId: adj.companyId,
    }))
    .sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b), "en"),
    );
}

export function buildIdempotencyKey(input: {
  message: string;
  intent: string;
  adjustments: AgentAdjustment[];
}): string {
  const payload = {
    message: input.message.trim().toLowerCase(),
    intent: input.intent,
    adjustments: canonicalizeAdjustments(input.adjustments),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export class IdempotencyCache {
  private readonly entries = new Map<string, IdempotencyEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  get(key: string): IdempotencyEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  set(key: string, response: ChatResponse, scenarioId: string | null): void {
    this.entries.set(key, {
      key,
      response,
      scenarioId,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.entries.clear();
  }
}
