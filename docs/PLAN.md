# ScenarioLab — Plan de trabajo

**Producto:** Financial Consolidation & Scenario Intelligence Platform  
**Eslogan:** Understand today. Simulate tomorrow.  
**Repositorio:** https://github.com/EmilioCali/Finances  
**Estado de este documento:** fuente de verdad del equipo. Si el código y este archivo discrepan, se corrige el código o se actualiza el registro de decisiones en el mismo pull request. No se improvisan contratos en una rama.

Los tickets de backlog siguen siendo TKT-001, TKT-002 y TKT-003. Este plan cierra las decisiones que esos tickets dejaban abiertas para que tres personas puedan trabajar a la vez.

## Equipo

| Rol | Ticket | Prioridad | Escribe en | No escribe en |
| --- | --- | --- | --- | --- |
| Frontend | TKT-002 | P1 | `frontend/` | `backend/` |
| Backend — motor financiero | TKT-001 | P0 | `backend/app/engine/`, `backend/app/api/finance.py`, `backend/app/db/`, `backend/tests/engine/`, `backend/data/demo/` | `backend/app/agent/` |
| Backend — agente | TKT-003 | P1 | `backend/app/agent/`, `backend/app/api/agent.py`, `backend/tests/agent/` | `backend/app/engine/` |

Archivos compartidos, que se tocan con acuerdo y en un PR pequeño: `backend/app/main.py`, `backend/app/schemas/common.py`, `backend/requirements.txt`, `backend/.env.example`, este archivo.

El motor se considera terminado cuando importa, consolida y simula sin frontend y sin Grok. El simulador se considera usable cuando el panel de IA falla y el resto de la aplicación sigue funcionando.

## Decisiones cerradas

### D-001. Monorepo y procesos

```
Finances/
  docs/PLAN.md
  backend/
  frontend/
```

- API: `http://localhost:8000`
- Web: `http://localhost:3000`
- Variable del front: `NEXT_PUBLIC_API_URL=http://localhost:8000`
- CORS del API permitido solo para `http://localhost:3000`
- Un proceso de FastAPI. El agente es un módulo de esa API, no un servicio aparte.

### D-002. Stack

Backend: Python, FastAPI, pandas, SQLite, Pydantic v2. Dinero con `decimal.Decimal`. Nada de `float` en importes ni en tasas.

Frontend: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, Recharts a través de los charts de shadcn. Cliente HTTP único en `frontend/src/lib/api.ts`. Tipos de respuesta en `frontend/src/lib/types.ts`, copiados de los contratos de este documento.

Agente: xAI, llamado solo desde FastAPI. Variables `XAI_API_KEY`, `XAI_MODEL`, `XAI_BASE_URL` (default `https://api.x.ai/v1`). El modelo se elige por entorno según la cuenta disponible. La clave no entra al navegador ni al repositorio.

### D-003. Moneda y tipo de cambio

- Moneda de reporte: USD.
- La tasa es unidades de moneda local por 1 USD.
- Conversión: `importe_usd = importe_local / tasa`.
- USD usa tasa `1`.
- Una depreciación de la moneda local es un aumento de la tasa. `EXCHANGE_RATE` de `+10` sobre GTQ significa `tasa_simulada = tasa_base * 1.10`. El importe local pasa a valer menos dólares.
- Tasas menores o iguales a cero se rechazan.
- Tasas de demostración, fijas, no son cotización de mercado:

| Moneda | Unidades por USD |
| --- | --- |
| USD | 1 |
| GTQ | 7.75 |
| MXN | 18.00 |

Esas tasas viajan en la respuesta de consolidación y de escenario. El front las muestra. No las calcula.

### D-004. Empresas de demostración

| id | Nombre | País | Moneda |
| --- | --- | --- | --- |
| `company-gt` | Empresa A | Guatemala | GTQ |
| `company-us` | Empresa B | Estados Unidos | USD |
| `company-mx` | Empresa C | México | MXN |

Las crea el seed del backend. El front no las hardcodea como fuente de verdad: las lee de `GET /api/companies`. Los mocks del front usan estos mismos ids mientras la API no responda.

### D-005. Plantilla de importación

Una carga corresponde a una empresa. La empresa se elige en la interfaz y viaja como campo `companyId`. El archivo no asigna la empresa.

Columnas obligatorias, en este orden, con este encabezado:

```text
period,category,record_type,currency,amount
```

- `period`: `YYYY-MM`.
- `category`: texto del catálogo o un alias de D-006.
- `record_type`: `REVENUE` o `EXPENSE`.
- `currency`: debe ser la moneda funcional de la empresa elegida.
- `amount`: decimal mayor que cero. Cero y negativos se rechazan en el MVP.

`POST /api/imports?dry_run=true` valida y devuelve la vista previa sin escribir.  
`POST /api/imports` persiste las filas aceptadas.

No hay jobs en segundo plano. La petición es síncrona. El progreso que ve el usuario es el progreso de subida del archivo.

Clave de duplicado: `companyId + period + category_normalizada + record_type`. Si la clave ya existe, la fila se omite, el original se conserva y la respuesta la cuenta como duplicado. Una clave repetida dentro del mismo archivo también es duplicado.

### D-006. Catálogo de categorías

Catálogo cerrado. Una categoría fuera de esta lista se rechaza con el número de fila.

| Código | Tipo | Alias aceptados |
| --- | --- | --- |
| `SALES` | `REVENUE` | ventas, sales, ingresos, revenue |
| `OTHER_INCOME` | `REVENUE` | otros ingresos, other income |
| `OPERATING_COST` | `EXPENSE` | costos operativos, opex, gastos, gastos operativos, nomina, nómina, salarios, renta, alquiler, operating cost |

El ajuste `REVENUE` aplica a toda fila `REVENUE`. El ajuste `OPERATING_COST` aplica a toda fila `EXPENSE`. En el MVP todo gasto del catálogo es costo operativo.

### D-007. Dinero en JSON y redondeo

Todos los importes y tasas viajan como string, nunca como number JSON.

- Cálculo interno con `Decimal` y sin redondeo intermedio.
- Cada línea se convierte a USD y ahí se cuantiza a 2 decimales con `ROUND_HALF_UP`.
- Los totales son la suma de líneas ya cuantizadas.
- Las tasas se serializan a 4 decimales.
- Una variación porcentual se serializa a 2 decimales. Si la base es cero, `percentage` es `null`.

El front puede hacer `Number(importe)` únicamente para alimentar un eje de Recharts. Totales, variaciones, tipos de cambio y resultados salen del backend. El front no los recalcula.

### D-008. Cómo se aplica un escenario

Un escenario no modifica filas importadas. Cada simulación parte de los originales.

Sobre cada línea:

```text
local = importe_original
si la línea es REVENUE y hay ajuste REVENUE en alcance:
    local = importe_original * (1 + porcentaje / 100)
si la línea es EXPENSE y hay ajuste OPERATING_COST en alcance:
    local = importe_original * (1 + porcentaje / 100)
tasa = tasa_base
si hay ajuste EXCHANGE_RATE para esa moneda en alcance:
    tasa = tasa_base * (1 + porcentaje / 100)
usd = cuantizar_2(local / tasa)
```

`companyId` ausente o `null` significa todo el grupo. `EXCHANGE_RATE` se filtra por `currency` y, si viene `companyId`, además por empresa.

Reglas de validación:

- Porcentaje de `REVENUE` y `OPERATING_COST` en el rango `-90` a `200`. Así el importe se mantiene positivo.
- Porcentaje de `EXCHANGE_RATE` mayor que `-99` y menor o igual a `200`. La tasa resultante debe ser mayor que cero.
- Dos ajustes del mismo `type` con alcances que se solapan se rechazan. No se acumulan.
- Tipos distintos sí se combinan. Cada uno sale del original. Ingreso y tipo de cambio se componen (`local nuevo / tasa nueva`) y ninguno se aplica dos veces.
- El escenario guardado es independiente de corridas anteriores.

### D-009. Caso de referencia R1

Este caso es la prueba de aceptación del motor. Los números tienen que coincidir.

Datos de un solo mes, `2026-01`:

| Empresa | Categoría | Tipo | Importe local | USD base |
| --- | --- | --- | --- | --- |
| company-gt | SALES | REVENUE | 77500 GTQ | 10000.00 |
| company-gt | OPERATING_COST | EXPENSE | 38750 GTQ | 5000.00 |
| company-us | SALES | REVENUE | 8000 USD | 8000.00 |
| company-us | OPERATING_COST | EXPENSE | 3000 USD | 3000.00 |
| company-mx | SALES | REVENUE | 180000 MXN | 10000.00 |
| company-mx | OPERATING_COST | EXPENSE | 90000 MXN | 5000.00 |

Consolidado base: ingresos `28000.00`, gastos `13000.00`, resultado `15000.00`.

Escenario «Crisis Guatemala»:

- `EXCHANGE_RATE`, moneda `GTQ`, porcentaje `10`, sin empresa.
- `OPERATING_COST`, empresa `company-gt`, porcentaje `8`.

Tasa GTQ simulada: `8.5250`.

| Concepto | USD simulado |
| --- | --- |
| Ingreso GT | 9090.91 |
| Gasto GT | 4909.09 |
| Resultado GT | 4181.82 |
| Ingresos consolidados | 27090.91 |
| Gastos consolidados | 12909.09 |
| Resultado consolidado | 14181.82 |
| Variación del resultado | -818.18 USD, -5.45 % |

US y MX no cambian en este escenario. Después de simular, una nueva lectura del consolidado base sigue devolviendo `15000.00`.

El dataset de demo puede traer más meses (`2026-01`, `2026-02`, `2026-03`) para la gráfica. R1 se conserva como subconjunto comprobable de `2026-01`. El seed incluye un CSV por empresa en `backend/data/demo/`.

### D-010. Errores

Toda respuesta de error usa esta forma y un código HTTP coherente (`400` validación, `404` no encontrado, `409` duplicado de escenario o ajuste solapado, `502` o `503` si xAI no responde):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "La fila 4 tiene un importe menor o igual a cero.",
    "details": [
      { "row": 4, "field": "amount", "message": "El importe debe ser mayor a cero." }
    ]
  }
}
```

`details` puede ser una lista vacía. `message` es lo que la interfaz muestra.

### D-011. Agente

Flujo único de producto: el usuario escribe en el front, el front llama `POST /api/agent/chat`, FastAPI decide.

1. Grok devuelve solo JSON de intención. Pydantic lo valida.
2. Si faltan datos o la instrucción es ambigua, la API responde `NEEDS_CONFIRMATION` y no simula.
3. Si la propuesta es válida, el orquestador llama al motor existente y guarda el escenario.
4. Grok recibe el resultado ya calculado y redacta la explicación. No recibe permiso de calcular.
5. Si el texto de Grok menciona una cifra que no está en el resultado, esa verificación queda como prueba del agente: el generador de explicación debe usar las cifras del motor en la respuesta estructurada y el texto se arma a partir de ellas. Grok no es la fuente del número.

Confirmación: el front reenvía el mismo mensaje con `approvedAdjustments` igual a la propuesta mostrada. El backend no vuelve a interpretar; valida y ejecuta esa lista.

Límites de la llamada a xAI: timeout 20 segundos, un reintento, tope de tokens definido en el cliente. Si xAI falla, `/api/agent/chat` responde error de agente y `/api/health`, importación, consolidado y escenarios siguen activos.

El agente no modifica presupuestos originales, no ejecuta código y no lee instrucciones escondidas en los CSV importados. A la demo solo entran los datos ficticios del seed.

Trazabilidad en tabla propia `agent_traces`: solicitud original, parámetros interpretados, parámetros aprobados, id de escenario, id del resultado usado, error si lo hubo.

### D-012. Interfaz

Tema oscuro por defecto. Fondo negro o gris muy oscuro, acento verde lima, tarjetas, números tabulares. Responsive de escritorio y móvil.

Rutas:

| Ruta | Pantalla |
| --- | --- |
| `/` | Dashboard del consolidado. Si la URL lleva `?scenarioId=`, compara contra ese escenario. |
| `/import` | Elegir empresa, subir archivo, vista previa con `dry_run`, confirmar importación. |
| `/scenarios` | Constructor. Al simular, navega al comparador. |
| `/scenarios/[id]` | Base, simulado, diferencia absoluta, diferencia porcentual, impacto por empresa y por categoría. |

El analista es un panel lateral presente en todas las rutas, no una quinta página. Así la demo puede lanzar la simulación en lenguaje natural y enseñar el comparador sin cambiar de producto.

Estados obligatorios en cada vista de datos: loading, empty, error, success. Empty significa que todavía no hay importación o que no hay escenario.

### D-013. Git

Ramas:

- `backend/engine`
- `backend/agent`
- `frontend/app`

Se integran a `main` con pull request corto. `main` debe arrancar.

No se commitea `.env`, `*.db`, `node_modules`, `.next`, `__pycache__`, `.venv`. Sí se commitea `.env.example` y los CSV de demo.

Un cambio de contrato se hace en este archivo, en el mismo PR que el código que lo provoca. El otro lado no se entera por chat.

### D-014. Qué queda fuera

Autenticación, ERP, tipos de cambio en vivo, contabilidad fiscal, eliminaciones intragrupo, predicción, edición libre de categorías, varios escenarios acumulados uno sobre otro, y cualquier cálculo financiero duplicado en el navegador.

## Contratos

Base URL: `/api`. Swagger: `/docs`.

### `GET /api/health`

```json
{ "status": "ok", "service": "scenariolab-api" }
```

### `GET /api/companies`

```json
{
  "companies": [
    { "id": "company-gt", "name": "Empresa A", "country": "Guatemala", "currency": "GTQ" }
  ]
}
```

### `POST /api/companies`

Request:

```json
{ "name": "Empresa A", "country": "Guatemala", "currency": "GTQ" }
```

Response `201`: el objeto empresa. `currency` solo acepta `GTQ`, `USD`, `MXN`.

### `POST /api/imports`

`multipart/form-data` con campos `companyId` y `file` (`.csv` o `.xlsx`). Query `dry_run=true` opcional.

```json
{
  "importId": "imp_01",
  "companyId": "company-gt",
  "fileName": "empresa-a.csv",
  "dryRun": false,
  "accepted": 2,
  "rejected": 1,
  "duplicates": 0,
  "rows": [
    {
      "row": 2,
      "period": "2026-01",
      "categoryRaw": "Ventas",
      "category": "SALES",
      "recordType": "REVENUE",
      "currency": "GTQ",
      "amountOriginal": "77500.00",
      "status": "ACCEPTED"
    }
  ],
  "errors": [
    { "row": 4, "field": "amount", "message": "El importe debe ser mayor a cero." }
  ]
}
```

`status` de cada fila: `ACCEPTED`, `REJECTED`, `DUPLICATE`. En `dry_run` no hay escritura aunque `accepted` sea mayor que cero.

### `GET /api/consolidation`

Query opcional `period=YYYY-MM`. Sin query, suma todos los periodos importados y devuelve la serie mensual.

```json
{
  "reportingCurrency": "USD",
  "period": null,
  "fxRates": [
    { "currency": "GTQ", "unitsPerUsd": "7.7500" },
    { "currency": "USD", "unitsPerUsd": "1.0000" },
    { "currency": "MXN", "unitsPerUsd": "18.0000" }
  ],
  "totals": {
    "revenue": "28000.00",
    "expense": "13000.00",
    "operatingResult": "15000.00"
  },
  "byCompany": [
    {
      "companyId": "company-gt",
      "revenue": "10000.00",
      "expense": "5000.00",
      "operatingResult": "5000.00"
    }
  ],
  "byCategory": [
    {
      "category": "SALES",
      "recordType": "REVENUE",
      "amount": "28000.00"
    }
  ],
  "series": [
    {
      "period": "2026-01",
      "revenue": "28000.00",
      "expense": "13000.00",
      "operatingResult": "15000.00"
    }
  ],
  "lines": [
    {
      "id": "line_01",
      "companyId": "company-gt",
      "period": "2026-01",
      "categoryRaw": "Ventas",
      "category": "SALES",
      "recordType": "REVENUE",
      "currency": "GTQ",
      "amountOriginal": "77500.00",
      "fxRate": "7.7500",
      "amountReporting": "10000.00",
      "sourceFile": "empresa-a.csv",
      "sourceRow": 2
    }
  ]
}
```

`lines` es la trazabilidad. El dashboard puede paginarla en cliente si el demo se mantiene en tres empresas y tres meses.

### `POST /api/scenarios`

```json
{
  "name": "Crisis Guatemala",
  "adjustments": [
    { "type": "EXCHANGE_RATE", "currency": "GTQ", "percentage": 10 },
    { "type": "OPERATING_COST", "companyId": "company-gt", "percentage": 8 }
  ]
}
```

`type`: `EXCHANGE_RATE`, `REVENUE`, `OPERATING_COST`.  
`EXCHANGE_RATE` exige `currency`. Los otros dos usan `companyId` opcional.  
`percentage` es number JSON con signo. `10` es aumento del 10 %. `-15` es reducción del 15 %.

Response `201`:

```json
{
  "id": "scn_01",
  "name": "Crisis Guatemala",
  "adjustments": [
    { "type": "EXCHANGE_RATE", "currency": "GTQ", "percentage": 10, "companyId": null },
    { "type": "OPERATING_COST", "currency": null, "percentage": 8, "companyId": "company-gt" }
  ],
  "createdAt": "2026-11-21T18:00:00Z"
}
```

Crear el escenario no simula todavía.

### `POST /api/scenarios/{id}/simulate`

Sin body. Ejecuta el motor, guarda el resultado y devuelve el mismo JSON que el GET de resultados.

### `GET /api/scenarios/{id}/results`

`404` si no se ha simulado.

```json
{
  "scenarioId": "scn_01",
  "name": "Crisis Guatemala",
  "reportingCurrency": "USD",
  "adjustments": [],
  "fxRates": {
    "base": [{ "currency": "GTQ", "unitsPerUsd": "7.7500" }],
    "simulated": [{ "currency": "GTQ", "unitsPerUsd": "8.5250" }]
  },
  "base": {
    "revenue": "28000.00",
    "expense": "13000.00",
    "operatingResult": "15000.00"
  },
  "simulated": {
    "revenue": "27090.91",
    "expense": "12909.09",
    "operatingResult": "14181.82"
  },
  "variance": {
    "revenue": { "absolute": "-909.09", "percentage": "-3.25" },
    "expense": { "absolute": "-90.91", "percentage": "-0.70" },
    "operatingResult": { "absolute": "-818.18", "percentage": "-5.45" }
  },
  "byCompany": [
    {
      "companyId": "company-gt",
      "base": { "revenue": "10000.00", "expense": "5000.00", "operatingResult": "5000.00" },
      "simulated": { "revenue": "9090.91", "expense": "4909.09", "operatingResult": "4181.82" },
      "variance": {
        "revenue": { "absolute": "-909.09", "percentage": "-9.09" },
        "expense": { "absolute": "-90.91", "percentage": "-1.82" },
        "operatingResult": { "absolute": "-818.18", "percentage": "-16.36" }
      }
    }
  ],
  "byCategory": [
    {
      "category": "SALES",
      "recordType": "REVENUE",
      "base": "28000.00",
      "simulated": "27090.91",
      "variance": { "absolute": "-909.09", "percentage": "-3.25" }
    }
  ],
  "series": [
    {
      "period": "2026-01",
      "base": { "revenue": "28000.00", "expense": "13000.00", "operatingResult": "15000.00" },
      "simulated": { "revenue": "27090.91", "expense": "12909.09", "operatingResult": "14181.82" }
    }
  ]
}
```

Los porcentajes de R1 en ingresos y gastos deben salir del mismo redondeo D-007. El resultado operativo de R1 (`14181.82`, `-818.18`, `-5.45`) es el número que la demo no puede fallar. Si una cifra intermedia de porcentaje no cierra por el cuantizado, manda el resultado operativo de R1 y se anota la diferencia en el registro de decisiones.

### `POST /api/agent/interpret`

```json
{ "message": "Simula una depreciación del quetzal del 10 % y un aumento de costos del 8 % en Guatemala." }
```

```json
{
  "status": "READY",
  "proposal": {
    "intent": "SIMULATE",
    "adjustments": [
      { "type": "EXCHANGE_RATE", "currency": "GTQ", "percentage": 10, "companyId": null },
      { "type": "OPERATING_COST", "currency": null, "percentage": 8, "companyId": "company-gt" }
    ]
  },
  "clarification": null
}
```

`status`: `READY` o `NEEDS_CONFIRMATION`. Este endpoint no ejecuta el motor.

### `POST /api/agent/chat`

```json
{
  "message": "Simula una depreciación del quetzal del 10 % y un aumento de costos del 8 % en Guatemala.",
  "approvedAdjustments": null
}
```

Respuesta cuando ejecuta:

```json
{
  "status": "EXPLAINED",
  "traceId": "trc_01",
  "proposal": {
    "intent": "SIMULATE",
    "adjustments": []
  },
  "scenarioId": "scn_01",
  "results": {},
  "explanation": "Texto que cita únicamente cifras presentes en results.",
  "clarification": null
}
```

`results` usa la misma forma que `GET /api/scenarios/{id}/results`.

Respuesta cuando falta información:

```json
{
  "status": "NEEDS_CONFIRMATION",
  "traceId": "trc_02",
  "proposal": { "intent": "SIMULATE", "adjustments": [] },
  "scenarioId": null,
  "results": null,
  "explanation": null,
  "clarification": "¿El aumento de costos aplica solo a Empresa A o a todo el grupo?"
}
```

`intent` también puede ser `COMPARE`. En ese caso la propuesta identifica el escenario guardado y el presupuesto base, y `results` incluye ambos usando el mismo objeto de resultados.

### `POST /api/agent/explain`

```json
{ "scenarioId": "scn_01" }
```

Respuesta: `explanation`, `scenarioId` y `results`. Sirve para volver a explicar un escenario ya simulado desde el comparador, sin una segunda interpretación.

## Orden de construcción

El motor no espera al agente. El front no espera al motor para maquetar. El agente sí espera la función de simulación.

### Bloque A — Motor, empieza ya

1. Proyecto FastAPI, health, SQLite, empresas y seed.
2. Importación CSV con `dry_run`, catálogo y duplicados. XLSX enseguida, con el mismo validador.
3. Consolidación y trazabilidad.
4. Escenarios y simulación.
5. Prueba automatizada de R1: conversión, combinación de ajustes, originales intactos, tasa inválida, porcentajes que dejarían el importe en negativo.
6. Dataset demo de tres empresas y Swagger.

Definición de terminado de TKT-001: los criterios del ticket, más R1 en verde, sin Grok.

### Bloque B — Front, en paralelo con mocks de R1

1. App Next.js, layout oscuro, navegación, cliente HTTP y tipos.
2. Dashboard con el JSON de consolidación de este documento.
3. Importación contra el contrato, primero mock y después API.
4. Constructor y comparador. La gráfica de barras es base contra simulado por empresa. La línea usa `series`.
5. Panel de chat contra `POST /api/agent/chat`.
6. Sustituir mocks cuando `/api/health` y `/api/consolidation` respondan. Los mocks se quedan detrás de un flag `NEXT_PUBLIC_USE_MOCKS=true` para poder demostrar la UI si la API se cae en el ensayo.

Definición de terminado de TKT-002: un recorrido importar → simular → comparar, con estados de error visibles y sin matemática financiera propia. Escritorio y un ancho móvil.

### Bloque C — Agente, en paralelo con Grok simulado

1. Modelos Pydantic de la propuesta y cliente xAI aislado.
2. Pruebas con respuestas fijas de Grok, sin red: JSON válido, JSON inválido, empresa inexistente, porcentaje fuera de rango, timeout.
3. Orquestador que llama una función `simulate` del motor. Hasta que exista, un fake que devuelve el JSON de R1.
4. `interpret`, `chat` y `explain`.
5. Tabla de trazas.
6. Tres frases de demo guardadas en `docs/PLAN.md` (ya están abajo) y probadas contra el motor real.

Definición de terminado de TKT-003: una frase de la demo crea el escenario R1 o uno equivalente, el motor calcula y la explicación usa esas cifras. Con la API key ausente, el simulador manual sigue vivo.

## Puntos de integración

| Momento | Quién avisa | Qué tienen que poder hacer los demás |
| --- | --- | --- |
| I1. Health y empresas reales | Motor | El front lista empresas desde la API. |
| I2. Import y consolidado de R1 | Motor | El front apaga el mock del dashboard para el mes base. |
| I3. `simulate` devuelve el JSON de resultados | Motor | El comparador y el agente dejan sus fakes. |
| I4. `/api/agent/chat` en local | Agente | El panel deja de usar respuestas escritas a mano. |

Hasta I3, el agente y el front no bloquean al motor ni se bloquean entre sí.

## Frases de la demo

1. Importar los tres CSV y mostrar el consolidado base: resultado `15000.00` USD en enero, o el total si se cargan tres meses.
2. En el constructor, armar «Crisis Guatemala» y abrir el comparador. El resultado simulado de enero tiene que leer `14181.82`.
3. En el panel, escribir: «Simula una depreciación del quetzal del 10 % y un aumento de costos del 8 % en Guatemala». El escenario resultante debe ser el mismo tipo de ajuste que R1.
4. Preguntar: «¿Qué empresa resulta más afectada?». La respuesta nombra a Empresa A y usa la variación por empresa que devolvió el motor.
5. Apagar la API key o forzar un timeout y mostrar que importar y simular desde el constructor siguen funcionando.

## Arranque esperado

Backend, cuando exista el proyecto:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Esos comandos son el acuerdo. Quien cree el proyecto los deja funcionando así, en Windows.

## Registro de decisiones

Las decisiones D-001 a D-014 están cerradas el 21 de noviembre de 2026. Una decisión nueva se agrega aquí. No se reescribe la historia.

| Id | Fecha | Decisión | Motivo |
| --- | --- | --- | --- |
| D-001 … D-014 | 2026-11-21 | Plan inicial | Poder repartir front, motor y agente sin acordar contratos a mitad de la hackathon. |
