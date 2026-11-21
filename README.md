# ScenarioLab

Understand today. Simulate tomorrow.

Plataforma de consolidación presupuestaria y simulación financiera para un grupo con tres empresas (GTQ, USD y MXN). La moneda de reporte es USD.

El plan de trabajo, los dueños de cada carpeta y los contratos JSON están en [docs/PLAN.md](docs/PLAN.md). Ese archivo es la fuente de verdad del equipo.

| Rol | Ticket | Carpeta |
| --- | --- | --- |
| Frontend | TKT-002 | `frontend/` |
| Backend — motor financiero | TKT-001 | `backend/app/engine/` |
| Backend — agente | TKT-003 | `backend/app/agent/` |

El motor tiene que funcionar sin interfaz y sin Grok. El simulador manual tiene que seguir funcionando si el agente no responde.
