# ScenarioLab — Agent Service (TKT-003)

Servicio Fastify del analista financiero con Grok (xAI). Interpreta lenguaje natural, orquesta el Financial Engine y explica resultados **sin recalcular dinero**.

## Stack

- Node.js 24
- TypeScript strict
- Fastify 5
- Zod
- pnpm
- OpenAI SDK → API xAI
- Supabase PostgreSQL (`agent_traces`)
- Vitest

## Instalación

```bash
cd backend/agent-service
pnpm install
copy .env.example .env
```

Configura al menos `XAI_MODEL`. Para llamadas reales a Grok también `XAI_API_KEY`.

## Arranque

```bash
pnpm dev
# escucha en AGENT_PORT (default 8001)
```

Producción:

```bash
pnpm build
pnpm start
```

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/health` | Health del agente (`engineMode`, `traceBackend`) |
| POST | `/api/agent/interpret` | Solo interpretación (sin simular) |
| POST | `/api/agent/chat` | Flujo completo READY / NEEDS_CONFIRMATION / EXPLAINED |
| POST | `/api/agent/explain` | Reexplica un `scenarioId` ya simulado |

Contratos JSON: `docs/PLAN.md`.

## Modo motor

| `ENGINE_MODE` | Comportamiento |
| --- | --- |
| `fake` (default) | `FakeFinanceTools` con resultados R1 deterministas |
| `http` | `HttpFinanceTools` → `ENGINE_BASE_URL` (`http://localhost:8000`) |

Si `http` falla, se devuelve error controlado. **No** hay fallback silencioso a fake.

## Supabase

1. Aplicar `migrations/001_agent_traces.sql` en el proyecto Supabase.
2. Configurar `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
3. `TRACE_BACKEND=auto` (o `supabase`).

Sin credenciales, el servicio usa **memoria** y lo registra en logs (`[TRACE_BACKEND] memory`).

Si Supabase falla en runtime, el wrapper resiliente registra `[TRACE_PERSISTENCE_FAILED]` y continúa con traza efímera (no afirma persistencia durable).

## Pruebas

```bash
pnpm typecheck
pnpm build
pnpm test
```

Las pruebas mockean xAI; no hacen red real.

## Dependencias del equipo

- Proxy FastAPI `/api/agent/*` → este servicio (pendiente de acuerdo).
- Motor en `:8000` para `ENGINE_MODE=http` (ya en `origin/main`).
- Actualizar `origin/dev` antes del merge del PR.
- Aprobar D-015…D-018 en `docs/PLAN.md`.

## Seguridad

- Grok no calcula importes ni modifica presupuestos.
- Cifras de la explicación salen del motor; el polish de Grok se valida contra esas cifras.
- Create/simulate del motor **no** se reintentan automáticamente.
- xAI: timeout 20s, máximo 1 reintento.
