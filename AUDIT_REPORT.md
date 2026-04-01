# AUDIT REPORT — ClinGest Beta QA

**Generado:** 2026-04-01T11:28:31.907Z  
**Tiempo de ejecución:** 10:32:49  
**URL:** https://odontologo-228.pages.dev  

## Resumen General

| Métrica | Valor |
|---------|-------|
| Total auditorías | 1.064.800 |
| Pasadas | 1.064.738 |
| Fallidas | 62 |
| Tasa de éxito | **99.99%** |
| Velocidad | 5 req/s |
| Tiempo respuesta promedio | 1340ms |
| Tiempo respuesta p95 | 3369ms |
| Tiempo respuesta p99 | 4184ms |
| Tests lentos (>2000ms) | 117511 |

## Por Categoría

| Categoría | Pass | Fail | Tasa | Avg ms |
|-----------|------|------|------|--------|
| seguridad | 153406 | 0 | 100.0% | 509ms |
| carga | 330305 | 43 | 100.0% | 2016ms |
| workflow | 464864 | 18 | 100.0% | 1165ms |
| edge-cases | 116163 | 1 | 100.0% | 739ms |

## Últimas 50 Fallas

- `2026-04-01T11:14:18.901Z` **[workflow]** crear-paciente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T10:44:27.386Z` **[workflow]** crear-paciente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T09:57:39.422Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T09:53:06.926Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T09:38:09.253Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T09:35:57.413Z` **[workflow]** crear-paciente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T09:18:59.767Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T09:02:48.143Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T09:02:11.837Z` **[workflow]** turno-estado-completado: `0 fetch failed`
- `2026-04-01T09:02:11.810Z` **[carga]** paciente-concurrente: `0 fetch failed`
- `2026-04-01T08:41:02.172Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T07:36:35.068Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T07:31:00.942Z` **[workflow]** obtener-plan-pago: `0 fetch failed`
- `2026-04-01T06:40:36.684Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T06:38:02.599Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T05:54:07.590Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T05:36:55.824Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T05:21:46.984Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T05:08:48.914Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T04:52:22.496Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T04:30:39.431Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T04:20:17.799Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T04:02:27.116Z` **[workflow]** crear-paciente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T03:49:18.387Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T03:46:53.663Z` **[carga]** paciente-concurrente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T02:42:49.646Z` **[workflow]** crear-paciente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T02:18:18.409Z` **[workflow]** crear-paciente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T02:17:52.779Z` **[workflow]** crear-plan-pago: `500 null`
- `2026-04-01T02:12:00.191Z` **[workflow]** crear-paciente: `400 "Ya existe un paciente activo con ese DNI"`
- `2026-04-01T02:11:07.540Z` **[carga]** rafaga-lectura: `0 fetch failed`
- `2026-04-01T02:09:14.111Z` **[carga]** paciente-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:09:02.997Z` **[carga]** escritura-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:57.878Z` **[carga]** escritura-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:47.980Z` **[carga]** rafaga-lectura: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:46.384Z` **[carga]** agenda-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:44.827Z` **[workflow]** crear-paciente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:35.138Z` **[carga]** escritura-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:29.717Z` **[workflow]** aprobar-presupuesto: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:29.690Z` **[carga]** agenda-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:29.689Z` **[carga]** agenda-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:29.367Z` **[carga]** escritura-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:20.131Z` **[carga]** rafaga-lectura: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:14.365Z` **[carga]** rafaga-lectura: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:10.193Z` **[carga]** agenda-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:08:05.797Z` **[carga]** escritura-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:07:33.326Z` **[carga]** paciente-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:05:25.911Z` **[carga]** paciente-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:03:37.260Z` **[carga]** agenda-concurrente: `0 The operation was aborted due to timeout`
- `2026-04-01T02:02:22.543Z` **[edge-cases]** get-id-inexistente-404: ``
- `2026-04-01T02:01:26.841Z` **[workflow]** obtener-plan-pago: `0 The operation was aborted due to timeout`
