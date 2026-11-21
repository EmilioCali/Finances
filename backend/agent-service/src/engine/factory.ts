import type { AgentSettings } from "../config/env.js";
import { FakeFinanceTools } from "./fake.js";
import { HttpFinanceTools } from "./http.js";
import type { FinanceTools } from "./types.js";

/**
 * Select finance backend explicitly from ENGINE_MODE.
 * Never falls back from http → fake on engine errors.
 */
export function createFinanceTools(settings: AgentSettings): FinanceTools {
  if (settings.engineMode === "http") {
    return new HttpFinanceTools(settings.engineBaseUrl);
  }
  return new FakeFinanceTools();
}
