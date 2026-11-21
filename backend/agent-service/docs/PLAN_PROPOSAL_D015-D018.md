# Propuesta de decisiones D-015 … D-018 (sin aplicar a PLAN.md)

Pendiente de aprobación del equipo. No modifica `docs/PLAN.md` hasta acuerdo.

| Id | Decisión |
| --- | --- |
| **D-015** | TKT-003 = Node.js 24 + TypeScript strict + Fastify 5 + Zod + Vitest + pnpm en `backend/agent-service/`. Motor permanece Python/FastAPI. |
| **D-016** | Front sigue en `NEXT_PUBLIC_API_URL` (:8000). FastAPI proxy de `/api/agent/*` → agente (:8001). Contratos `/api/agent/*` sin cambio. |
| **D-017** | `agent_traces` en Supabase PostgreSQL. **SQLite del motor no se sustituye en el proyecto completo hasta confirmación de TKT-001.** |
| **D-018** | Grok vía SDK `openai` + `XAI_*`. Idempotencia de chat: hash de mensaje+ajustes; no reintentar create/simulate del motor. |

Variables adicionales: `ENGINE_BASE_URL`, `ENGINE_MODE`, `TRACE_BACKEND`, `POLISH_WITH_GROK`, `SUPABASE_*`, `AGENT_PORT`.
